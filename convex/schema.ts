import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // One row: the themed PR payload as JSON. Only rewritten when it changes,
  // so subscribed clients don't re-download it on every refresh.
  snapshots: defineTable({ json: v.string() }),
  // One row: refresh bookkeeping, small and cheap to push to every client.
  status: defineTable({
    fetchedAt: v.optional(v.number()),
    refreshStartedAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
  }),
});
