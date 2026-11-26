import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { themeOf } from "../shared/themes";

const REPO = { owner: "pingdotgg", name: "t3code" };
const BODY_BATCH = 200;

type GithubPr = {
  number: number;
  title: string;
  body: string;
  isDraft: boolean;
  createdAt: string;
  updatedAt: string;
  additions: number;
  deletions: number;
  author: { login: string } | null;
};
type Blob = { text: string } | null;
type Page = {
  errors?: unknown;
  data: {
    repository: {
      vouched?: Blob;
      maintainers?: Blob;
      pullRequests: { nodes: GithubPr[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } };
    };
  };
};

const QUERY = `query($owner:String!,$name:String!,$after:String,$first:Boolean!){
  repository(owner:$owner,name:$name){
    vouched: object(expression:"main:.github/VOUCHED.td") @include(if:$first) { ... on Blob { text } }
    maintainers: object(expression:"main:.github/TRIAGE_EXEMPTIONS.td") @include(if:$first) { ... on Blob { text } }
    pullRequests(states:OPEN,first:100,after:$after,orderBy:{field:CREATED_AT,direction:DESC}){
      pageInfo{hasNextPage endCursor}
      nodes{number title body isDraft createdAt updatedAt additions deletions author{login}}
    }
  }
}`;

// GitHub's GraphQL API intermittently returns 502s or empty bodies on pages
// that include PR bodies, so each page gets a few attempts.
async function fetchPage(token: string, after: string | null): Promise<Page> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    try {
      const res = await fetch("https://api.github.com/graphql", {
        method: "POST",
        headers: {
          authorization: `bearer ${token}`,
          "content-type": "application/json",
          "user-agent": "t3code-pr-themes",
        },
        body: JSON.stringify({ query: QUERY, variables: { ...REPO, after, first: after === null } }),
      });
      const text = await res.text();
      const body = text ? (JSON.parse(text) as Page) : null;
      if (res.ok && body && !body.errors) return body;
      lastError = new Error(`GitHub ${res.status}: ${(body?.errors ? JSON.stringify(body.errors) : text).slice(0, 300)}`);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

async function fetchRepo(token: string) {
  const prs: GithubPr[] = [];
  let files = { vouched: "", maintainers: "" };
  let after: string | null = null;
  do {
    const repo: Page["data"]["repository"] = (await fetchPage(token, after)).data.repository;
    if (after === null) files = { vouched: repo.vouched?.text ?? "", maintainers: repo.maintainers?.text ?? "" };
    prs.push(...repo.pullRequests.nodes);
    after = repo.pullRequests.pageInfo.hasNextPage ? repo.pullRequests.pageInfo.endCursor : null;
  } while (after);
  return { prs, files };
}

type Tier = "maintainer" | "vouched" | "denounced";

/** Parses `github:user` and `-github:user reason` lines from the repo's .td trust files. */
function parseContributors(files: { vouched: string; maintainers: string }) {
  const byLogin = new Map<string, { login: string; tier: Tier; reason?: string }>();
  const lines = (text: string) => text.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  for (const line of lines(files.vouched)) {
    const m = line.match(/^(-?)github:(\S+)\s*(.*)$/);
    if (!m) continue;
    const login = m[2].toLowerCase();
    byLogin.set(login, m[1] ? { login, tier: "denounced", reason: m[3] || undefined } : { login, tier: "vouched" });
  }
  for (const line of lines(files.maintainers)) {
    const m = line.match(/^github:(\S+)/);
    if (m && byLogin.get(m[1].toLowerCase())?.tier !== "denounced") {
      byLogin.set(m[1].toLowerCase(), { login: m[1].toLowerCase(), tier: "maintainer" });
    }
  }
  return [...byLogin.values()];
}

// cyrb53: a fast 53-bit string hash, enough to notice that a body changed.
function hash(str: string) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

export const refresh = internalAction({
  args: {},
  handler: async (ctx) => {
    try {
      const token = process.env.GITHUB_TOKEN;
      if (!token) throw new Error("GITHUB_TOKEN is not set on this Convex deployment");
      const { prs, files } = await fetchRepo(token);
      const rows = prs.map((pr) => ({
        number: pr.number,
        title: pr.title,
        author: pr.author?.login ?? "ghost",
        draft: pr.isDraft,
        createdAt: pr.createdAt,
        updatedAt: pr.updatedAt,
        additions: pr.additions,
        deletions: pr.deletions,
        theme: themeOf(pr.title),
        kind: pr.title.match(/^(\w+)/)?.[1].toLowerCase() ?? "",
        bodyHash: hash(pr.body),
      }));
      const changed = new Set(
        await ctx.runMutation(internal.prs.save, { rows, contributors: parseContributors(files) }),
      );
      const bodies = prs.filter((pr) => changed.has(pr.number)).map((pr) => ({ number: pr.number, body: pr.body }));
      for (let i = 0; i < bodies.length; i += BODY_BATCH) {
        await ctx.runMutation(internal.prs.saveBodies, { bodies: bodies.slice(i, i + BODY_BATCH) });
      }
    } catch (error) {
      await ctx.runMutation(internal.prs.fail, { error: String(error) });
      throw error;
    }
  },
});
