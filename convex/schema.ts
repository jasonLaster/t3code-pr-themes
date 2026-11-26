import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // One row: the themed PR payload as JSON. Only rewritten when it changes,
  // so subscribed clients don't re-download it on every refresh.
  snapshots: defineTable({ json: v.string() }),
  // Markdown bodies of Julius and Theo's PRs, kept out of the snapshot and
  // loaded one at a time when a PR is expanded.
  descriptions: defineTable({ n: v.number(), body: v.string() }).index("by_n", ["n"]),
  // One row: refresh bookkeeping, small and cheap to push to every client.
  status: defineTable({
    fetchedAt: v.optional(v.number()),
    refreshStartedAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
  }),
});
