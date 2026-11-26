import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const prFields = {
  number: v.number(),
  title: v.string(),
  author: v.string(),
  draft: v.boolean(),
  createdAt: v.string(),
  updatedAt: v.string(),
  additions: v.number(),
  deletions: v.number(),
  theme: v.string(),
  kind: v.string(),
};

export default defineSchema({
  // One row per PR. `syncId` comes from a global counter bumped on every change,
  // so clients can ask for "everything after N" and get only the delta.
  // Closed PRs stay as `open: false` tombstones so caches learn to drop them.
  prs: defineTable({ ...prFields, open: v.boolean(), syncId: v.number(), bodyHash: v.string() })
    .index("by_number", ["number"])
    .index("by_open", ["open"])
    .index("by_syncId", ["syncId"]),
  // PR bodies, loaded one at a time when a PR is opened.
  bodies: defineTable({ number: v.number(), body: v.string() }).index("by_number", ["number"]),
  // From .github/TRIAGE_EXEMPTIONS.td (maintainers) and .github/VOUCHED.td.
  contributors: defineTable({
    login: v.string(),
    tier: v.union(v.literal("maintainer"), v.literal("vouched"), v.literal("denounced")),
    reason: v.optional(v.string()),
  }),
  status: defineTable({
    syncId: v.optional(v.number()),
    fetchedAt: v.optional(v.number()),
    refreshStartedAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
  }),
});
