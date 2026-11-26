import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx } from "./_generated/server";
import { prFields } from "./schema";

const STALE_MS = 5 * 60 * 1000;
// A refresh that hasn't finished in this long is assumed dead and may be retried.
const REFRESH_TIMEOUT_MS = 4 * 60 * 1000;

const toClient = ({ _id, _creationTime, syncId, bodyHash, ...pr }: Doc<"prs">) => pr;

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

async function getStatus(ctx: MutationCtx) {
  const s = await ctx.db.query("status").first();
  return s ?? (await ctx.db.get(await ctx.db.insert("status", {})))!;
}

async function startRefresh(ctx: MutationCtx, force: boolean) {
  const now = Date.now();
  const s = await getStatus(ctx);
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

const sameRow = (doc: Doc<"prs">, row: Omit<Doc<"prs">, "_id" | "_creationTime" | "syncId" | "open">) =>
  doc.open && (Object.keys(row) as (keyof typeof row)[]).every((k) => doc[k] === row[k]);

/** Upserts PR rows, tombstones closed ones, and returns PR numbers whose body changed. */
export const save = internalMutation({
  args: {
    rows: v.array(v.object({ ...prFields, bodyHash: v.string() })),
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

export const fail = internalMutation({
  args: { error: v.string() },
  handler: async (ctx, { error }) => {
    const s = await getStatus(ctx);
    await ctx.db.patch(s._id, { refreshStartedAt: undefined, lastError: error });
  },
});
