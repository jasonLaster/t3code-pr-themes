import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, mutation, query, type MutationCtx } from "./_generated/server";

const STALE_MS = 5 * 60 * 1000;
// A refresh that hasn't finished in this long is assumed dead and may be retried.
const REFRESH_TIMEOUT_MS = 2 * 60 * 1000;

export const snapshot = query({
  args: {},
  handler: async (ctx) => (await ctx.db.query("snapshots").first())?.json ?? null,
});

export const status = query({
  args: {},
  handler: async (ctx) => {
    const s = await ctx.db.query("status").first();
    return s ? { fetchedAt: s.fetchedAt ?? null, lastError: s.lastError ?? null } : null;
  },
});

async function startRefresh(ctx: MutationCtx, force: boolean) {
  const now = Date.now();
  const s = await ctx.db.query("status").first();
  if (s?.refreshStartedAt && now - s.refreshStartedAt < REFRESH_TIMEOUT_MS) return false;
  if (!force && s?.fetchedAt && now - s.fetchedAt < STALE_MS) return false;
  if (s) await ctx.db.patch(s._id, { refreshStartedAt: now });
  else await ctx.db.insert("status", { refreshStartedAt: now });
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

export const save = internalMutation({
  args: { json: v.string() },
  handler: async (ctx, { json }) => {
    const snap = await ctx.db.query("snapshots").first();
    if (!snap) await ctx.db.insert("snapshots", { json });
    else if (snap.json !== json) await ctx.db.patch(snap._id, { json });
    const s = await ctx.db.query("status").first();
    const done = { fetchedAt: Date.now(), refreshStartedAt: undefined, lastError: undefined };
    if (s) await ctx.db.patch(s._id, done);
    else await ctx.db.insert("status", done);
  },
});

export const fail = internalMutation({
  args: { error: v.string() },
  handler: async (ctx, { error }) => {
    const s = await ctx.db.query("status").first();
    if (s) await ctx.db.patch(s._id, { refreshStartedAt: undefined, lastError: error });
  },
});
