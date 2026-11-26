import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { THEME_NAMES, themeOf, type Payload } from "../lib/themes";

const REPO = { owner: "pingdotgg", name: "t3code" };
const FOCUS: Record<string, "julius" | "theo"> = { juliusmarminge: "julius", t3dotgg: "theo" };

type GithubPr = {
  number: number;
  title: string;
  body: string;
  isDraft: boolean;
  createdAt: string;
  additions: number;
  deletions: number;
  author: { login: string } | null;
};

const QUERY = `query($owner:String!,$name:String!,$after:String){
  repository(owner:$owner,name:$name){
    pullRequests(states:OPEN,first:100,after:$after,orderBy:{field:CREATED_AT,direction:DESC}){
      pageInfo{hasNextPage endCursor}
      nodes{number title body isDraft createdAt additions deletions author{login}}
    }
  }
}`;

async function fetchOpenPrs(token: string) {
  const prs: GithubPr[] = [];
  let after: string | null = null;
  do {
    const res = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: {
        authorization: `bearer ${token}`,
        "content-type": "application/json",
        "user-agent": "t3code-pr-themes",
      },
      body: JSON.stringify({ query: QUERY, variables: { ...REPO, after } }),
    });
    const body = (await res.json()) as {
      errors?: unknown;
      data: {
        repository: {
          pullRequests: { nodes: GithubPr[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } };
        };
      };
    };
    if (!res.ok || body.errors) {
      throw new Error(`GitHub ${res.status}: ${JSON.stringify(body.errors ?? body).slice(0, 500)}`);
    }
    const page = body.data.repository.pullRequests;
    prs.push(...page.nodes);
    after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (after);
  return prs;
}

function buildPayload(prs: GithubPr[]) {
  const payload: Payload = { themes: THEME_NAMES, focus: [], others: [] };
  const bodies: { n: number; body: string }[] = [];
  for (const pr of prs.sort((a, b) => b.number - a.number)) {
    const th = themeOf(pr.title);
    const g = pr.author ? FOCUS[pr.author.login] : undefined;
    if (g) {
      payload.focus.push({
        n: pr.number,
        t: pr.title,
        g,
        d: pr.isDraft,
        c: pr.createdAt,
        add: pr.additions,
        dele: pr.deletions,
        th,
        k: pr.title.match(/^(\w+)/)?.[1].toLowerCase() ?? "",
      });
      bodies.push({ n: pr.number, body: pr.body });
    } else {
      payload.others.push([THEME_NAMES.indexOf(th), pr.createdAt.slice(0, 16)]);
    }
  }
  return { payload, bodies };
}

export const refresh = internalAction({
  args: {},
  handler: async (ctx) => {
    try {
      const token = process.env.GITHUB_TOKEN;
      if (!token) throw new Error("GITHUB_TOKEN is not set on this Convex deployment");
      const { payload, bodies } = buildPayload(await fetchOpenPrs(token));
      await ctx.runMutation(internal.prs.save, { json: JSON.stringify(payload), bodies });
    } catch (error) {
      await ctx.runMutation(internal.prs.fail, { error: String(error) });
      throw error;
    }
  },
});
