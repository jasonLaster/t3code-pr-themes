import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { themeOf } from "../shared/themes";

const REPO = { owner: "pingdotgg", name: "t3code" };
const BODY_BATCH = 200;
const PAGE_SIZE = 50;
const CR_BATCH_SIZE = 20;
const CR_REFRESH_CAP = 100;
const CR_BACKFILL_CAP = 100;
const CR_BACKFILL_DELAY_MS = 25_000;
const CODERABBIT_LOGIN = "coderabbitai";

type CiStatus = "pass" | "fail" | "pending" | "none";
type CrStatus = "clean" | "comments" | "pending" | "skipped" | "error" | "none";
type CrCheckState = "pass" | "fail" | "pending" | "skipped" | "none";
type CheckDetailState = "pass" | "fail" | "pending" | "skipped";

type StateCount = { state: string; count: number };
type CrRun = { status: string; conclusion: string | null; title: string | null };
type CrSuite = { status: string; conclusion: string | null; checkRuns: { nodes: CrRun[] } };
type Rollup = {
  state: string;
  contexts: {
    checkRunCountsByState: StateCount[];
    statusContextCountsByState: StateCount[];
  };
};

type GithubPr = {
  number: number;
  title: string;
  body: string;
  isDraft: boolean;
  createdAt: string;
  updatedAt: string;
  additions: number;
  deletions: number;
  headRefOid: string;
  mergeable: string;
  mergeStateStatus: string;
  reviewDecision: string | null;
  author: { login: string } | null;
  reviewThreads: { totalCount: number };
  commits: {
    nodes: {
      commit: {
        statusCheckRollup: { state: string } | null;
      };
    }[];
  };
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

// Lightweight main scan: fetches PR metadata + scalar statusCheckRollup.state.
// Detailed CI counts, CodeRabbit check runs, and review threads are enriched incrementally below.
const QUERY = `query($owner:String!,$name:String!,$after:String,$first:Boolean!,$pageSize:Int!){
  repository(owner:$owner,name:$name){
    vouched: object(expression:"main:.github/VOUCHED.td") @include(if:$first) { ... on Blob { text } }
    maintainers: object(expression:"main:.github/TRIAGE_EXEMPTIONS.td") @include(if:$first) { ... on Blob { text } }
    pullRequests(states:OPEN,first:$pageSize,after:$after,orderBy:{field:CREATED_AT,direction:DESC}){
      pageInfo{hasNextPage endCursor}
      nodes{
        number title body isDraft createdAt updatedAt additions deletions headRefOid
        mergeable mergeStateStatus reviewDecision
        author{login}
        reviewThreads{totalCount}
        commits(last:1){
          nodes{
            commit{
              statusCheckRollup{state}
            }
          }
        }
      }
    }
  }
}`;

const DETAILS_QUERY = `query($owner:String!,$name:String!,$number:Int!){
  repository(owner:$owner,name:$name){
    pullRequest(number:$number){
      updatedAt
      reviewThreads(last:50){
        totalCount
        nodes{
          isResolved
          isOutdated
          path
          line
          comments(first:1){
            nodes{
              author{login}
              body
              url
            }
          }
        }
      }
      commits(last:1){
        nodes{
          commit{
            statusCheckRollup{
              state
              contexts(first:100){
                nodes{
                  __typename
                  ... on CheckRun{name status conclusion title detailsUrl}
                  ... on StatusContext{context state description targetUrl}
                }
              }
            }
          }
        }
      }
    }
  }
}`;

type MergeStatus = "ready" | "blocked" | "behind" | "conflicts" | "unstable" | "unknown";

/** GitHub's mergeability, folded into one status. Conflicts win; drafts report BLOCKED. */
function mergeOf(mergeable: string, state: string): MergeStatus {
  if (mergeable === "CONFLICTING" || state === "DIRTY") return "conflicts";
  if (state === "CLEAN" || state === "HAS_HOOKS") return "ready";
  if (state === "BEHIND") return "behind";
  if (state === "BLOCKED" || state === "DRAFT") return "blocked";
  if (state === "UNSTABLE") return "unstable";
  return "unknown";
}

const REVIEW: Record<string, "approved" | "changes" | "required"> = {
  APPROVED: "approved",
  CHANGES_REQUESTED: "changes",
  REVIEW_REQUIRED: "required",
};

const CHECK_RUN_FAIL = new Set(["FAILURE", "TIMED_OUT", "ACTION_REQUIRED", "STARTUP_FAILURE"]);
const CHECK_RUN_PENDING = new Set(["IN_PROGRESS", "QUEUED", "PENDING", "WAITING", "REQUESTED"]);
const STATUS_CTX_FAIL = new Set(["FAILURE", "ERROR"]);
const STATUS_CTX_PENDING = new Set(["PENDING", "EXPECTED"]);

// GitHub's GraphQL API intermittently returns 502s or empty 200 bodies on pages
// that include PR bodies, so each request gets a few attempts with a hard timeout.
async function graphql<T>(token: string, query: string, variables: Record<string, unknown>, attempts = 4): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    try {
      const res = await fetch("https://api.github.com/graphql", {
        method: "POST",
        headers: {
          authorization: `bearer ${token}`,
          "content-type": "application/json",
          "user-agent": "t3code-pr-themes",
        },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(20_000),
      });
      const text = await res.text();
      const body = text ? (JSON.parse(text) as { errors?: unknown; data?: T }) : null;
      if (res.ok && body?.data && !body.errors) return body.data;
      lastError = new Error(`GitHub ${res.status}: ${(body?.errors ? JSON.stringify(body.errors) : text).slice(0, 300)}`);
      if (res.status === 403 && text.toLowerCase().includes("rate limit")) break;
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
    let data: Page["data"];
    try {
      data = await graphql<Page["data"]>(
        token,
        QUERY,
        { ...REPO, after, first: after === null, pageSize: PAGE_SIZE },
        3,
      );
    } catch {
      // Fall back to a smaller page if GitHub timed out on a page with huge PR bodies.
      data = await graphql<Page["data"]>(
        token,
        QUERY,
        { ...REPO, after, first: after === null, pageSize: 25 },
        3,
      );
    }
    const repo = data.repository;
    if (after === null) files = { vouched: repo.vouched?.text ?? "", maintainers: repo.maintainers?.text ?? "" };
    prs.push(...repo.pullRequests.nodes);
    after = repo.pullRequests.pageInfo.hasNextPage ? repo.pullRequests.pageInfo.endCursor : null;
  } while (after);
  return { prs, files };
}

type CrEnrichNode = {
  commits: {
    nodes: {
      commit: {
        statusCheckRollup: Rollup | null;
        checkSuites: { nodes: CrSuite[] };
      };
    }[];
  };
  reviewThreads?: {
    nodes: { isResolved: boolean; comments: { nodes: { author: { login: string } | null }[] } }[];
  };
};

type CrEnriched = {
  crCheckState: CrCheckState;
  crTitle?: string;
  crUnresolved: number;
  crTotal: number;
  rollup: Rollup | null;
};

function classifyCrRun(run: { status: string | null; conclusion: string | null; title?: string | null } | null): {
  state: CrCheckState;
  title?: string;
} {
  if (!run || !run.status) return { state: "none" };
  if (run.status !== "COMPLETED") return { state: "pending", title: run.title ?? undefined };
  if (run.conclusion && CHECK_RUN_FAIL.has(run.conclusion)) return { state: "fail", title: run.title ?? undefined };
  if (run.conclusion === "SUCCESS") return { state: "pass", title: run.title ?? undefined };
  return { state: "skipped", title: run.title ?? undefined };
}

async function fetchCrEnrichment(
  token: string,
  targets: { number: number; threadCount: number }[],
): Promise<Map<number, CrEnriched>> {
  const results = new Map<number, CrEnriched>();
  for (let i = 0; i < targets.length; i += CR_BATCH_SIZE) {
    const slice = targets.slice(i, i + CR_BATCH_SIZE);
    const fields = slice
      .map(({ number, threadCount }) => {
        const threadsField =
          threadCount > 0
            ? `reviewThreads(last:50){nodes{isResolved comments(first:1){nodes{author{login}}}}}`
            : "";
        return `p${number}: pullRequest(number:${number}){commits(last:1){nodes{commit{statusCheckRollup{state contexts(first:1){checkRunCountsByState{state count} statusContextCountsByState{state count}}} checkSuites(first:1,filterBy:{checkName:"CodeRabbit"}){nodes{status conclusion checkRuns(last:1,filterBy:{checkName:"CodeRabbit"}){nodes{status conclusion title}}}}}}} ${threadsField}}`;
      })
      .join("\n");
    const query = `query($owner:String!,$name:String!){repository(owner:$owner,name:$name){\n${fields}\n}}`;
    try {
      const data = await graphql<{ repository: Record<string, CrEnrichNode | null> }>(token, query, REPO, 2);
      for (const { number, threadCount } of slice) {
        const pr = data.repository[`p${number}`];
        if (!pr) continue;
        const commit = pr.commits.nodes[0]?.commit;
        const suite = commit?.checkSuites.nodes[0];
        const run = suite?.checkRuns.nodes[0];
        const crMeta = classifyCrRun(
          run ? run : suite ? { status: suite.status, conclusion: suite.conclusion, title: null } : null,
        );
        let crUnresolved = 0;
        let crTotal = 0;
        if (threadCount > 0 && pr.reviewThreads) {
          for (const t of pr.reviewThreads.nodes) {
            if (t.comments.nodes[0]?.author?.login.toLowerCase() === CODERABBIT_LOGIN) {
              crTotal++;
              if (!t.isResolved) crUnresolved++;
            }
          }
        }
        results.set(number, {
          crCheckState: crMeta.state,
          crTitle: crMeta.title,
          crUnresolved,
          crTotal,
          rollup: commit?.statusCheckRollup ?? null,
        });
      }
    } catch {
      // Best-effort enrichment: stop batching on transient error / rate limit; next run continues.
      break;
    }
  }
  return results;
}

function ciFromRollupState(state: string | undefined): CiStatus {
  if (!state) return "none";
  if (state === "FAILURE" || state === "ERROR") return "fail";
  if (state === "PENDING" || state === "EXPECTED") return "pending";
  if (state === "SUCCESS") return "pass";
  return "none";
}

function computeCi(rollup: Rollup | null, crCheckState: CrCheckState | undefined) {
  let totalFail = 0;
  let totalPending = 0;
  let totalPassed = 0;
  if (rollup) {
    for (const c of rollup.contexts.checkRunCountsByState) {
      if (CHECK_RUN_FAIL.has(c.state)) totalFail += c.count;
      else if (CHECK_RUN_PENDING.has(c.state)) totalPending += c.count;
      else if (c.state === "SUCCESS") totalPassed += c.count;
    }
    for (const c of rollup.contexts.statusContextCountsByState) {
      if (STATUS_CTX_FAIL.has(c.state)) totalFail += c.count;
      else if (STATUS_CTX_PENDING.has(c.state)) totalPending += c.count;
      else if (c.state === "SUCCESS") totalPassed += c.count;
    }
  }

  // Subtract CodeRabbit's own check run when known so CI reflects CI independently of CodeRabbit.
  const ciFailed = Math.max(0, totalFail - (crCheckState === "fail" ? 1 : 0));
  const ciPending = Math.max(0, totalPending - (crCheckState === "pending" ? 1 : 0));
  const ciPassed = Math.max(0, totalPassed - (crCheckState === "pass" ? 1 : 0));

  let ci: CiStatus = "none";
  if (rollup) {
    if (ciFailed > 0) ci = "fail";
    else if (ciPending > 0) ci = "pending";
    else if (ciPassed > 0) ci = "pass";
    else if (rollup.state === "FAILURE" || rollup.state === "ERROR") ci = crCheckState === "fail" ? "none" : "fail";
    else if (rollup.state === "PENDING" || rollup.state === "EXPECTED") ci = crCheckState === "pending" ? "none" : "pending";
    else if (rollup.state === "SUCCESS") ci = "pass";
  }

  return { ci, ciFailed, ciPending, ciPassed };
}

function computeCr(crCheckState: CrCheckState, crUnresolved: number, crTotal: number): CrStatus {
  if (crCheckState === "pending") return "pending";
  if (crUnresolved > 0) return "comments";
  if (crCheckState === "fail") return "error";
  if (crCheckState === "pass") return "clean";
  if (crCheckState === "skipped") return "skipped";
  return crTotal > 0 ? "clean" : "none";
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

/** Extracts severity and a clean single-line summary from a CodeRabbit review comment body. */
function summarizeCrComment(body: string): { severity?: string; summary: string } {
  const withoutDetails = body.replace(/<details[\s\S]*?<\/details>/gi, "");
  const cleaned = withoutDetails
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<picture[\s\S]*?<\/picture>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`~]/g, "");

  const sevMatch = cleaned.match(/\b(Critical|Major|Minor|Trivial|Nitpick)\b/i);
  const severity = sevMatch ? sevMatch[1][0].toUpperCase() + sevMatch[1].slice(1).toLowerCase() : undefined;

  const lines = cleaned
    .split("\n")
    .map((l) => l.replace(/^[#>\-•|·\s⚠️🟠🔴🟡🔵💡🛠️🧹]+/, "").trim())
    .filter((l) => l.length > 0 && !/^(potential issue|refactor suggestion|nitpick|minor|major|critical|trivial)(\s*[|·]\s*[a-z\s]+)*$/i.test(l));

  // Skip metadata header line like "Minor · Maintainability & Code Quality · Quick win" if a descriptive line follows.
  let line = lines[0] ?? "Review comment";
  if (lines.length > 1 && line.length < 85 && /·|\|/.test(line)) {
    line = lines[1];
  }
  const summary = line.replace(/\s+/g, " ").slice(0, 180);
  return { severity, summary: summary.length === 180 ? `${summary.slice(0, 177)}…` : summary };
}

export const refresh = internalAction({
  args: {},
  handler: async (ctx) => {
    try {
      const token = process.env.GITHUB_TOKEN;
      if (!token) throw new Error("GITHUB_TOKEN is not set on this Convex deployment");
      const [cachedList, { prs, files }] = await Promise.all([
        ctx.runQuery(internal.prs.crCache, {}),
        fetchRepo(token),
      ]);
      const cache = new Map(cachedList.map((c) => [c.number, c]));

      // Only enrich PRs that are new, changed commit/rollup/threads, pending, or unhydrated.
      const needCr = prs
        .filter((pr) => {
          const prev = cache.get(pr.number);
          const rollupState = pr.commits.nodes[0]?.commit.statusCheckRollup?.state;
          if (!prev || prev.cr === undefined || prev.crCheckState === undefined) return true;
          if (prev.headSha !== pr.headRefOid) return true;
          if (prev.rollupState !== rollupState) return true;
          if (prev.cr === "pending" || prev.ci === "pending") return true;
          if (pr.reviewThreads.totalCount > 0 && (!prev.threadsChecked || prev.updatedAt !== pr.updatedAt || prev.threadCount !== pr.reviewThreads.totalCount)) {
            return true;
          }
          return false;
        })
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

      const freshCr =
        needCr.length > 0
          ? await fetchCrEnrichment(
              token,
              needCr.slice(0, CR_REFRESH_CAP).map((pr) => ({ number: pr.number, threadCount: pr.reviewThreads.totalCount })),
            )
          : new Map<number, CrEnriched>();

      let remainingUnenriched = 0;

      const rows = prs.map((pr) => {
        const threadTotalCount = pr.reviewThreads.totalCount;
        const rollupState = pr.commits.nodes[0]?.commit.statusCheckRollup?.state;
        const prev = cache.get(pr.number);
        const fresh = freshCr.get(pr.number);

        let ci: CiStatus;
        let ciFailed: number | undefined;
        let ciPending: number | undefined;
        let ciPassed: number | undefined;
        let crCheckState: CrCheckState | undefined;
        let crTitle: string | undefined;
        let crUnresolved: number | undefined;
        let crTotal: number | undefined;
        let cr: CrStatus | undefined;
        let threadsChecked = false;

        if (fresh) {
          const ciFields = computeCi(fresh.rollup, fresh.crCheckState);
          ci = ciFields.ci;
          ciFailed = ciFields.ciFailed;
          ciPending = ciFields.ciPending;
          ciPassed = ciFields.ciPassed;
          crCheckState = fresh.crCheckState;
          crTitle = fresh.crTitle;
          crUnresolved = fresh.crUnresolved;
          crTotal = fresh.crTotal;
          threadsChecked = true;
          cr = computeCr(crCheckState, crUnresolved, crTotal);
        } else if (
          prev &&
          prev.cr !== undefined &&
          prev.crCheckState !== undefined &&
          prev.headSha === pr.headRefOid &&
          prev.rollupState === rollupState &&
          (threadTotalCount === 0 || (prev.threadsChecked && prev.updatedAt === pr.updatedAt && prev.threadCount === threadTotalCount))
        ) {
          ci = prev.ci ?? ciFromRollupState(rollupState);
          ciFailed = prev.ciFailed;
          ciPending = prev.ciPending;
          ciPassed = prev.ciPassed;
          crCheckState = prev.crCheckState;
          crTitle = prev.crTitle;
          crUnresolved = threadTotalCount === 0 ? 0 : prev.crUnresolved;
          crTotal = threadTotalCount === 0 ? 0 : prev.crTotal;
          threadsChecked = true;
          cr = prev.cr;
        } else {
          remainingUnenriched++;
          ci = ciFromRollupState(rollupState);
          if (prev && prev.headSha === pr.headRefOid && prev.rollupState === rollupState) {
            ciFailed = prev.ciFailed;
            ciPending = prev.ciPending;
            ciPassed = prev.ciPassed;
            crCheckState = prev.crCheckState;
            crTitle = prev.crTitle;
            crUnresolved = prev.crUnresolved;
            crTotal = prev.crTotal;
            cr = prev.cr;
          }
        }

        return {
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
          headSha: pr.headRefOid,
          rollupState,
          threadCount: threadTotalCount,
          threadsChecked,
          crCheckState,
          cr,
          crUnresolved,
          crTotal,
          crTitle,
          ci,
          ciFailed,
          ciPending,
          ciPassed,
          merge: mergeOf(pr.mergeable, pr.mergeStateStatus),
          review: pr.reviewDecision ? REVIEW[pr.reviewDecision] : undefined,
        };
      });

      const changed = new Set(
        await ctx.runMutation(internal.prs.save, { rows, contributors: parseContributors(files) }),
      );
      const bodies = prs.filter((pr) => changed.has(pr.number)).map((pr) => ({ number: pr.number, body: pr.body }));
      for (let i = 0; i < bodies.length; i += BODY_BATCH) {
        await ctx.runMutation(internal.prs.saveBodies, { bodies: bodies.slice(i, i + BODY_BATCH) });
      }

      // Gently backfill remaining PRs' CodeRabbit status without re-scanning the entire repo.
      if (remainingUnenriched > 0) {
        await ctx.scheduler.runAfter(CR_BACKFILL_DELAY_MS, internal.github.backfillCr, {});
      }
    } catch (error) {
      await ctx.runMutation(internal.prs.fail, { error: String(error) });
      throw error;
    }
  },
});

export const backfillCr = internalAction({
  args: {},
  handler: async (ctx) => {
    const token = process.env.GITHUB_TOKEN;
    if (!token) return;
    const targets = await ctx.runQuery(internal.prs.unenrichedCr, { limit: CR_BACKFILL_CAP });
    if (targets.length === 0) return;

    const enriched = await fetchCrEnrichment(token, targets);
    if (enriched.size === 0) return;

    const items = [...enriched.entries()].map(([number, data]) => ({
      number,
      ...computeCi(data.rollup, data.crCheckState),
      cr: computeCr(data.crCheckState, data.crUnresolved, data.crTotal),
      crCheckState: data.crCheckState,
      crUnresolved: data.crUnresolved,
      crTotal: data.crTotal,
      crTitle: data.crTitle,
    }));

    await ctx.runMutation(internal.prs.patchCrBatch, { items });

    if (targets.length === CR_BACKFILL_CAP && enriched.size === targets.length) {
      await ctx.scheduler.runAfter(CR_BACKFILL_DELAY_MS, internal.github.backfillCr, {});
    }
  },
});

type DetailsResponse = {
  repository: {
    pullRequest: {
      updatedAt: string;
      reviewThreads: {
        totalCount: number;
        nodes: {
          isResolved: boolean;
          isOutdated: boolean;
          path: string;
          line: number | null;
          comments: { nodes: { author: { login: string } | null; body: string; url: string }[] };
        }[];
      };
      commits: {
        nodes: {
          commit: {
            statusCheckRollup: {
              state: string;
              contexts: {
                nodes: (
                  | {
                      __typename: "CheckRun";
                      name: string;
                      status: string;
                      conclusion: string | null;
                      title: string | null;
                      detailsUrl: string | null;
                    }
                  | {
                      __typename: "StatusContext";
                      context: string;
                      state: string;
                      description: string | null;
                      targetUrl: string | null;
                    }
                )[];
              };
            } | null;
          };
        }[];
      };
    } | null;
  };
};

const STATE_ORDER: Record<CheckDetailState, number> = { fail: 0, pending: 1, pass: 2, skipped: 3 };

export const fetchPrDetails = internalAction({
  args: { number: v.number() },
  handler: async (ctx, { number }) => {
    const token = process.env.GITHUB_TOKEN;
    if (!token) return;
    const data = await graphql<DetailsResponse>(token, DETAILS_QUERY, { ...REPO, number }, 2);
    const pr = data.repository.pullRequest;
    if (!pr) return;

    const rollup = pr.commits.nodes[0]?.commit.statusCheckRollup ?? null;
    const checksByName = new Map<string, { name: string; state: CheckDetailState; title?: string; url?: string }>();
    let crRun: { status: string; conclusion: string | null; title: string | null } | null = null;

    for (const node of rollup?.contexts.nodes ?? []) {
      if (node.__typename === "CheckRun") {
        if (node.name.toLowerCase() === "coderabbit") {
          crRun = { status: node.status, conclusion: node.conclusion, title: node.title };
          continue;
        }
        const state: CheckDetailState =
          node.status !== "COMPLETED"
            ? "pending"
            : node.conclusion && CHECK_RUN_FAIL.has(node.conclusion)
              ? "fail"
              : node.conclusion === "SUCCESS"
                ? "pass"
                : "skipped";
        const prev = checksByName.get(node.name);
        if (!prev || STATE_ORDER[state] < STATE_ORDER[prev.state]) {
          checksByName.set(node.name, {
            name: node.name,
            state,
            title: node.title ?? undefined,
            url: node.detailsUrl ?? undefined,
          });
        }
      } else {
        const state: CheckDetailState = STATUS_CTX_FAIL.has(node.state)
          ? "fail"
          : STATUS_CTX_PENDING.has(node.state)
            ? "pending"
            : node.state === "SUCCESS"
              ? "pass"
              : "skipped";
        const prev = checksByName.get(node.context);
        if (!prev || STATE_ORDER[state] < STATE_ORDER[prev.state]) {
          checksByName.set(node.context, {
            name: node.context,
            state,
            title: node.description ?? undefined,
            url: node.targetUrl ?? undefined,
          });
        }
      }
    }

    const checks = [...checksByName.values()].sort(
      (a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state] || a.name.localeCompare(b.name),
    );

    let crTotal = 0;
    const crThreads: {
      path: string;
      line?: number;
      outdated: boolean;
      severity?: string;
      summary: string;
      url?: string;
    }[] = [];

    for (const thread of pr.reviewThreads.nodes) {
      const first = thread.comments.nodes[0];
      if (first?.author?.login.toLowerCase() !== CODERABBIT_LOGIN) continue;
      crTotal++;
      if (thread.isResolved) continue;
      const { severity, summary } = summarizeCrComment(first.body);
      crThreads.push({
        path: thread.path,
        line: thread.line ?? undefined,
        outdated: thread.isOutdated,
        severity,
        summary,
        url: first.url || undefined,
      });
    }

    const ciFailed = checks.filter((c) => c.state === "fail").length;
    const ciPending = checks.filter((c) => c.state === "pending").length;
    const ciPassed = checks.filter((c) => c.state === "pass").length;
    const ci: CiStatus =
      ciFailed > 0 ? "fail" : ciPending > 0 ? "pending" : ciPassed > 0 ? "pass" : "none";

    const crMeta = classifyCrRun(crRun);
    const crUnresolved = crThreads.length;
    const cr = computeCr(crMeta.state, crUnresolved, crTotal);

    await ctx.runMutation(internal.prs.saveDetails, {
      number,
      updatedAt: pr.updatedAt,
      checks,
      crThreads,
      summary: {
        ci,
        ciFailed,
        ciPending,
        ciPassed,
        cr,
        crCheckState: crMeta.state,
        crUnresolved,
        crTotal,
        crTitle: crMeta.title,
        threadCount: pr.reviewThreads.totalCount,
      },
    });
  },
});
