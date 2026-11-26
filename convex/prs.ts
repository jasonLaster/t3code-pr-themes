import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, query, type MutationCtx } from "./_generated/server";
import { checkDetail, ciStatus, codeRabbitStatus, conversationItem, crThreadDetail, mergeStatus, prFields, reviewDecision } from "./schema";

const STALE_MS = 5 * 60 * 1000;
// A refresh that hasn't finished in this long is assumed dead and may be retried.
const REFRESH_TIMEOUT_MS = 4 * 60 * 1000;
const MERGE_STALE_MS = 10 * 60 * 1000;
const MERGE_TIMEOUT_MS = 20 * 60 * 1000;
const DETAILS_PENDING_STALE_MS = 60 * 1000;
// Historical PRs rarely change; open ones are refetched whenever their updatedAt moves.
const COMMENTS_HISTORY_STALE_MS = 24 * 60 * 60 * 1000;

const toClient = ({
  _id,
  _creationTime,
  syncId,
  bodyHash,
  headSha,
  rollupState,
  crCheckState,
  threadCount,
  threadsChecked,
  ...pr
}: Doc<"prs">) => pr;

/**
 * Delta sync. `after: 0` bootstraps with every open PR; otherwise returns rows
 * changed since `after`, including closed tombstones.
 */
export const since = query({
  args: { after: v.number() },
  handler: async (ctx, { after }) => {
    const syncId = (await ctx.db.query("status").first())?.syncId ?? 0;
    // A cursor ahead of the server means the server was reset: start over.
    const reset = after === 0 || after > syncId;
    const rows = reset
      ? await ctx.db.query("prs").withIndex("by_open", (q) => q.eq("open", true)).collect()
      : await ctx.db.query("prs").withIndex("by_syncId", (q) => q.gt("syncId", after)).collect();
    return { syncId, reset, rows: rows.map(toClient) };
  },
});

export const status = query({
  args: {},
  handler: async (ctx) => {
    const s = await ctx.db.query("status").first();
    return { fetchedAt: s?.fetchedAt ?? null, lastError: s?.lastError ?? null, historyAvailable: true };
  },
});

export const contributors = query({
  args: {},
  handler: async (ctx) =>
    (await ctx.db.query("contributors").collect()).map(({ login, tier, reason }) => ({ login, tier, reason })),
});

export const description = query({
  args: { number: v.number() },
  handler: async (ctx, { number }) => {
    const doc = await ctx.db.query("bodies").withIndex("by_number", (q) => q.eq("number", number)).first();
    return doc?.body ?? null;
  },
});

export const details = query({
  args: { number: v.number() },
  handler: async (ctx, { number }) => {
    const doc = await ctx.db.query("prDetails").withIndex("by_number", (q) => q.eq("number", number)).first();
    if (!doc) return null;
    return {
      updatedAt: doc.updatedAt,
      fetchedAt: doc.fetchedAt,
      checks: doc.checks,
      crThreads: doc.crThreads,
    };
  },
});

/** Loads per-PR check runs and CodeRabbit threads on demand if missing or stale. */
export const ensureDetails = mutation({
  args: { number: v.number(), force: v.optional(v.boolean()) },
  handler: async (ctx, { number, force }) => {
    const pr = await ctx.db.query("prs").withIndex("by_number", (q) => q.eq("number", number)).first();
    if (!pr || !pr.open) return false;
    const existing = await ctx.db.query("prDetails").withIndex("by_number", (q) => q.eq("number", number)).first();
    const now = Date.now();
    if (!force && existing && existing.updatedAt === pr.updatedAt) {
      const pending = pr.ci === "pending" || pr.cr === "pending";
      if (!pending || now - existing.fetchedAt < DETAILS_PENDING_STALE_MS) return false;
    }
    if (existing && now - existing.fetchedAt < 10_000) return false;
    await ctx.scheduler.runAfter(0, internal.github.fetchPrDetails, { number });
    return true;
  },
});

export const comments = query({
  args: { number: v.number() },
  handler: async (ctx, { number }) => {
    const doc = await ctx.db.query("prComments").withIndex("by_number", (q) => q.eq("number", number)).first();
    if (!doc) return null;
    return { updatedAt: doc.updatedAt, fetchedAt: doc.fetchedAt, items: doc.items, truncated: doc.truncated };
  },
});

/** Loads a PR's GitHub conversation on demand if missing or stale. Works for open and historical PRs. */
export const ensureComments = mutation({
  args: { number: v.number(), force: v.optional(v.boolean()) },
  handler: async (ctx, { number, force }) => {
    const pr =
      (await ctx.db.query("prs").withIndex("by_number", (q) => q.eq("number", number)).first()) ??
      (await ctx.db.query("prHistory").withIndex("by_number", (q) => q.eq("number", number)).first());
    if (!pr) return false;
    const existing = await ctx.db.query("prComments").withIndex("by_number", (q) => q.eq("number", number)).first();
    const now = Date.now();
    if (existing && now - existing.fetchedAt < 10_000) return false;
    if (!force && existing) {
      const isOpen = "open" in pr && pr.open;
      if (isOpen ? existing.updatedAt === pr.updatedAt : now - existing.fetchedAt < COMMENTS_HISTORY_STALE_MS) return false;
    }
    await ctx.scheduler.runAfter(0, internal.github.fetchPrComments, { number });
    return true;
  },
});

export const saveComments = internalMutation({
  args: { number: v.number(), updatedAt: v.string(), items: v.array(conversationItem), truncated: v.boolean() },
  handler: async (ctx, { number, updatedAt, items, truncated }) => {
    const fetchedAt = Date.now();
    const existing = await ctx.db.query("prComments").withIndex("by_number", (q) => q.eq("number", number)).first();
    if (existing) await ctx.db.patch(existing._id, { updatedAt, fetchedAt, items, truncated });
    else await ctx.db.insert("prComments", { number, updatedAt, fetchedAt, items, truncated });
  },
});

/** Returns cached CodeRabbit & CI check state for open PRs so refresh only fetches changed ones. */
export const crCache = internalQuery({
  args: {},
  handler: async (ctx) => {
    const open = await ctx.db.query("prs").withIndex("by_open", (q) => q.eq("open", true)).collect();
    return open.map((doc) => ({
      number: doc.number,
      updatedAt: doc.updatedAt,
      headSha: doc.headSha,
      rollupState: doc.rollupState,
      ci: doc.ci,
      ciFailed: doc.ciFailed,
      ciPending: doc.ciPending,
      ciPassed: doc.ciPassed,
      cr: doc.cr,
      crCheckState: doc.crCheckState,
      crTitle: doc.crTitle,
      threadCount: doc.threadCount,
      threadsChecked: doc.threadsChecked ?? false,
      crUnresolved: doc.crUnresolved,
      crTotal: doc.crTotal,
    }));
  },
});

/** Lists open PRs still missing CodeRabbit enrichment, newest updated first. */
export const unenrichedCr = internalQuery({
  args: { limit: v.number() },
  handler: async (ctx, { limit }) => {
    const open = await ctx.db.query("prs").withIndex("by_open", (q) => q.eq("open", true)).collect();
    return open
      .filter((doc) => doc.cr === undefined || (doc.threadCount ?? 0) > 0 && !doc.threadsChecked)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit)
      .map((doc) => ({
        number: doc.number,
        threadCount: doc.threadCount ?? 0,
      }));
  },
});

async function getStatus(ctx: MutationCtx) {
  const s = await ctx.db.query("status").first();
  return s ?? (await ctx.db.get(await ctx.db.insert("status", {})))!;
}

async function startRefresh(ctx: MutationCtx, force: boolean) {
  const now = Date.now();
  const s = await getStatus(ctx);
  if ((s.githubRetryAt ?? 0) > now) return false;
  if (s.mergeRefreshStartedAt && now - s.mergeRefreshStartedAt < MERGE_TIMEOUT_MS) return false;
  if (s.refreshStartedAt && now - s.refreshStartedAt < REFRESH_TIMEOUT_MS) return false;
  if (!force && s.fetchedAt && now - s.fetchedAt < STALE_MS) return false;
  await ctx.db.patch(s._id, { refreshStartedAt: now });
  await ctx.scheduler.runAfter(0, internal.github.refresh, {});
  return true;
}

/** Called when someone views the page: refresh in the background if the data is stale. */
export const revalidate = mutation({
  args: {},
  handler: (ctx) => startRefresh(ctx, false),
});

export const scheduledRefresh = internalMutation({
  args: {},
  handler: (ctx) => startRefresh(ctx, true),
});

export const startMergeRefresh = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const status = await getStatus(ctx);
    if ((status.githubRetryAt ?? 0) > now || now - (status.mergeFetchedAt ?? 0) < MERGE_STALE_MS) return false;
    if (status.refreshStartedAt && now - status.refreshStartedAt < REFRESH_TIMEOUT_MS) return false;
    if (status.mergeRefreshStartedAt && now - status.mergeRefreshStartedAt < MERGE_TIMEOUT_MS) return false;
    await ctx.db.patch(status._id, { mergeRefreshStartedAt: now });
    await ctx.scheduler.runAfter(0, internal.github.refreshMerge, { startedAt: now });
    return true;
  },
});

export const patchMergePage = internalMutation({
  args: {
    startedAt: v.number(),
    after: v.optional(v.string()),
    items: v.array(v.object({ number: v.number(), headSha: v.string(), merge: mergeStatus, review: v.optional(reviewDecision) })),
  },
  handler: async (ctx, { startedAt, after, items }) => {
    const status = await getStatus(ctx);
    if (status.mergeRefreshStartedAt !== startedAt) return;
    let syncId = status.syncId ?? 0;
    for (const { number, headSha, merge, review } of items) {
      const doc = await ctx.db.query("prs").withIndex("by_number", (q) => q.eq("number", number)).unique();
      if (!doc?.open || doc.headSha !== headSha || (doc.merge === merge && doc.review === review)) continue;
      await ctx.db.patch(doc._id, { merge, review, syncId: ++syncId });
    }
    await ctx.db.patch(status._id, { syncId });
    if (after) {
      await ctx.scheduler.runAfter(2_000, internal.github.refreshMerge, { startedAt, after });
    } else {
      await ctx.db.patch(status._id, { mergeRefreshStartedAt: undefined, mergeFetchedAt: Date.now() });
      await ctx.scheduler.runAfter(0, internal.github.backfillCr, {});
    }
  },
});

export const failMergeRefresh = internalMutation({
  args: { startedAt: v.number(), retryAt: v.optional(v.number()) },
  handler: async (ctx, { startedAt, retryAt }) => {
    const status = await getStatus(ctx);
    if (status.mergeRefreshStartedAt !== startedAt) return;
    await ctx.db.patch(status._id, { mergeRefreshStartedAt: undefined, githubRetryAt: retryAt });
  },
});

type SaveRow = Omit<Doc<"prs">, "_id" | "_creationTime" | "syncId" | "open">;

const sameRow = (doc: Doc<"prs">, row: SaveRow) =>
  doc.open && (Object.keys(row) as (keyof SaveRow)[]).every((k) => doc[k] === row[k]);

/** Upserts PR rows, tombstones closed ones, and returns PR numbers whose body changed. */
export const save = internalMutation({
  args: {
    rows: v.array(
      v.object({
        ...prFields,
        bodyHash: v.string(),
        headSha: v.optional(v.string()),
        rollupState: v.optional(v.string()),
        crCheckState: v.optional(
          v.union(v.literal("pass"), v.literal("fail"), v.literal("pending"), v.literal("skipped"), v.literal("none")),
        ),
        threadCount: v.optional(v.number()),
        threadsChecked: v.optional(v.boolean()),
      }),
    ),
    contributors: v.array(
      v.object({
        login: v.string(),
        tier: v.union(v.literal("maintainer"), v.literal("vouched"), v.literal("denounced")),
        reason: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, { rows, contributors }) => {
    const status = await getStatus(ctx);
    let syncId = status.syncId ?? 0;
    const open = new Map(
      (await ctx.db.query("prs").withIndex("by_open", (q) => q.eq("open", true)).collect()).map((d) => [d.number, d]),
    );
    const bodiesChanged: number[] = [];
    for (const row of rows) {
      const doc =
        open.get(row.number) ??
        (await ctx.db.query("prs").withIndex("by_number", (q) => q.eq("number", row.number)).first());
      open.delete(row.number);
      if (!doc) {
        await ctx.db.insert("prs", { ...row, open: true, syncId: ++syncId });
        bodiesChanged.push(row.number);
      } else if (!sameRow(doc, row)) {
        await ctx.db.patch(doc._id, { ...row, open: true, syncId: ++syncId });
        if (doc.bodyHash !== row.bodyHash) bodiesChanged.push(row.number);
      }
    }
    for (const closed of open.values()) {
      await ctx.db.patch(closed._id, { open: false, syncId: ++syncId });
      const body = await ctx.db
        .query("bodies")
        .withIndex("by_number", (q) => q.eq("number", closed.number))
        .first();
      if (body) await ctx.db.delete(body._id);
      const det = await ctx.db
        .query("prDetails")
        .withIndex("by_number", (q) => q.eq("number", closed.number))
        .first();
      if (det) await ctx.db.delete(det._id);
    }

    const existing = await ctx.db.query("contributors").collect();
    const key = (c: { login: string; tier: string; reason?: string }) => `${c.login}|${c.tier}|${c.reason ?? ""}`;
    if (existing.map(key).sort().join("\n") !== contributors.map(key).sort().join("\n")) {
      for (const c of existing) await ctx.db.delete(c._id);
      for (const c of contributors) await ctx.db.insert("contributors", c);
    }

    await ctx.db.patch(status._id, { syncId, fetchedAt: Date.now(), refreshStartedAt: undefined, lastError: undefined });
    return bodiesChanged;
  },
});

export const saveBodies = internalMutation({
  args: { bodies: v.array(v.object({ number: v.number(), body: v.string() })) },
  handler: async (ctx, { bodies }) => {
    for (const { number, body } of bodies) {
      const doc = await ctx.db.query("bodies").withIndex("by_number", (q) => q.eq("number", number)).first();
      if (!doc) await ctx.db.insert("bodies", { number, body });
      else if (doc.body !== body) await ctx.db.patch(doc._id, { body });
    }
  },
});

export const saveDetails = internalMutation({
  args: {
    number: v.number(),
    updatedAt: v.string(),
    checks: v.array(checkDetail),
    crThreads: v.array(crThreadDetail),
    summary: v.optional(
      v.object({
        ci: ciStatus,
        ciFailed: v.number(),
        ciPending: v.number(),
        ciPassed: v.number(),
        cr: codeRabbitStatus,
        crCheckState: v.union(v.literal("pass"), v.literal("fail"), v.literal("pending"), v.literal("skipped"), v.literal("none")),
        crUnresolved: v.number(),
        crTotal: v.number(),
        crTitle: v.optional(v.string()),
        threadCount: v.number(),
      }),
    ),
  },
  handler: async (ctx, { number, updatedAt, checks, crThreads, summary }) => {
    const fetchedAt = Date.now();
    const existing = await ctx.db.query("prDetails").withIndex("by_number", (q) => q.eq("number", number)).first();
    if (!existing) {
      await ctx.db.insert("prDetails", { number, updatedAt, fetchedAt, checks, crThreads });
    } else {
      await ctx.db.patch(existing._id, { updatedAt, fetchedAt, checks, crThreads });
    }

    if (summary) {
      const pr = await ctx.db.query("prs").withIndex("by_number", (q) => q.eq("number", number)).first();
      if (pr && pr.open) {
        const changed =
          pr.ci !== summary.ci ||
          pr.ciFailed !== summary.ciFailed ||
          pr.ciPending !== summary.ciPending ||
          pr.ciPassed !== summary.ciPassed ||
          pr.cr !== summary.cr ||
          pr.crCheckState !== summary.crCheckState ||
          pr.crUnresolved !== summary.crUnresolved ||
          pr.crTotal !== summary.crTotal ||
          pr.crTitle !== summary.crTitle ||
          pr.threadCount !== summary.threadCount ||
          !pr.threadsChecked;
        if (changed) {
          const status = await getStatus(ctx);
          const syncId = (status.syncId ?? 0) + 1;
          await ctx.db.patch(pr._id, {
            ci: summary.ci,
            ciFailed: summary.ciFailed,
            ciPending: summary.ciPending,
            ciPassed: summary.ciPassed,
            cr: summary.cr,
            crCheckState: summary.crCheckState,
            crUnresolved: summary.crUnresolved,
            crTotal: summary.crTotal,
            crTitle: summary.crTitle,
            threadCount: summary.threadCount,
            threadsChecked: true,
            syncId,
          });
          await ctx.db.patch(status._id, { syncId });
        }
      }
    }
  },
});

export const patchCrBatch = internalMutation({
  args: {
    items: v.array(
      v.object({
        number: v.number(),
        ci: ciStatus,
        ciFailed: v.number(),
        ciPending: v.number(),
        ciPassed: v.number(),
        cr: codeRabbitStatus,
        crCheckState: v.union(v.literal("pass"), v.literal("fail"), v.literal("pending"), v.literal("skipped"), v.literal("none")),
        crUnresolved: v.number(),
        crTotal: v.number(),
        crTitle: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, { items }) => {
    const status = await getStatus(ctx);
    let syncId = status.syncId ?? 0;
    for (const item of items) {
      const pr = await ctx.db.query("prs").withIndex("by_number", (q) => q.eq("number", item.number)).first();
      if (!pr || !pr.open) continue;
      const changed =
        pr.ci !== item.ci ||
        pr.ciFailed !== item.ciFailed ||
        pr.ciPending !== item.ciPending ||
        pr.ciPassed !== item.ciPassed ||
        pr.cr !== item.cr ||
        pr.crCheckState !== item.crCheckState ||
        pr.crUnresolved !== item.crUnresolved ||
        pr.crTotal !== item.crTotal ||
        pr.crTitle !== item.crTitle ||
        !pr.threadsChecked;
      if (changed) {
        await ctx.db.patch(pr._id, {
          ci: item.ci,
          ciFailed: item.ciFailed,
          ciPending: item.ciPending,
          ciPassed: item.ciPassed,
          cr: item.cr,
          crCheckState: item.crCheckState,
          crUnresolved: item.crUnresolved,
          crTotal: item.crTotal,
          crTitle: item.crTitle,
          threadsChecked: true,
          syncId: ++syncId,
        });
      }
    }
    if (syncId !== (status.syncId ?? 0)) {
      await ctx.db.patch(status._id, { syncId });
    }
  },
});

export const fail = internalMutation({
  args: { error: v.string(), retryAt: v.optional(v.number()) },
  handler: async (ctx, { error, retryAt }) => {
    const s = await getStatus(ctx);
    await ctx.db.patch(s._id, { refreshStartedAt: undefined, lastError: error, githubRetryAt: retryAt });
  },
});
