import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { kindOf } from "../shared/history";
import { THEME_LIST } from "../shared/themes";
import { internalMutation, query } from "./_generated/server";
import { historyFields, historySnapshotFields, historyState } from "./schema";

const themeNames = new Map(THEME_LIST.map(({ slug, name }) => [slug, name]));

export const list = query({
  args: { state: historyState, paginationOpts: paginationOptsValidator },
  handler: async (ctx, { state, paginationOpts }) => {
    const result = await ctx.db.query("prHistory")
      .withIndex("by_state_number", (q) => q.eq("state", state))
      .order("desc")
      .paginate({ ...paginationOpts, numItems: Math.min(1000, paginationOpts.numItems) });
    return {
      ...result,
      page: result.page.map(({ _id, _creationTime, theme, ...pr }) => ({
        ...pr,
        open: false as const,
        theme: themeNames.get(theme)!,
      })),
    };
  },
});

export const snapshot = query({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db.query("historySnapshot").unique();
    return row ? { cutoff: row.cutoff, merged: row.merged, closed: row.closed } : null;
  },
});

export const recordSnapshot = internalMutation({
  args: historySnapshotFields,
  handler: async (ctx, snapshot) => {
    const existing = await ctx.db.query("historySnapshot").unique();
    if (existing) {
      if (existing.cutoff <= snapshot.cutoff) await ctx.db.replace(existing._id, snapshot);
    } else {
      await ctx.db.insert("historySnapshot", snapshot);
    }
  },
});

export const save = internalMutation({
  args: { rows: v.array(v.object(historyFields)) },
  handler: async (ctx, { rows }) => {
    if (rows.length > 500) throw new Error("History batches may contain up to 500 PRs");
    for (const row of rows) {
      if (row.labels.length > 3 || new Set(row.labels).size !== row.labels.length ||
        kindOf(row.title) !== row.kind || (row.state === "merged") !== (row.mergedAt !== null)) {
        throw new Error(`Invalid history row #${row.number}`);
      }
      const existing = await ctx.db.query("prHistory")
        .withIndex("by_number", (q) => q.eq("number", row.number)).unique();
      if (existing) {
        if (existing.updatedAt > row.updatedAt) continue;
        const { _id, _creationTime, ...previous } = existing;
        const next = row.labelSource && !previous.labelSource && row.title === previous.title
          ? { ...row, labels: previous.labels, theme: previous.theme, labelSource: undefined }
          : row;
        const keys = [...new Set([...Object.keys(previous), ...Object.keys(next)])].sort();
        if (JSON.stringify(previous, keys) !== JSON.stringify(next, keys)) {
          await ctx.db.replace(_id, next);
        }
      } else {
        await ctx.db.insert("prHistory", row);
      }
    }
    return rows.length;
  },
});
