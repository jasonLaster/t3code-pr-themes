import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { PR_KINDS, PR_LABELS } from "../shared/history";
import { THEME_LIST } from "../shared/themes";

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

export const historyState = v.union(v.literal("merged"), v.literal("closed"));
export const historySnapshotFields = {
  cutoff: v.string(),
  merged: v.number(),
  closed: v.number(),
};
export const historyFields = {
  ...prFields,
  state: historyState,
  closedAt: v.string(),
  mergedAt: v.union(v.string(), v.null()),
  theme: v.union(...THEME_LIST.map(({ slug }) => v.literal(slug))),
  labels: v.array(v.union(...PR_LABELS.map((label) => v.literal(label)))),
  kind: v.union(...PR_KINDS.map((kind) => v.literal(kind))),
};

export default defineSchema({
  // One row per PR. `syncId` comes from a global counter bumped on every change,
  // so clients can ask for "everything after N" and get only the delta.
  // Closed PRs stay as `open: false` tombstones so caches learn to drop them.
  prs: defineTable({ ...prFields, open: v.boolean(), syncId: v.number(), bodyHash: v.string() })
    .index("by_number", ["number"])
    .index("by_open", ["open"])
    .index("by_syncId", ["syncId"]),
  historySnapshot: defineTable(historySnapshotFields),
  prHistory: defineTable(historyFields)
    .index("by_number", ["number"])
    .index("by_state_number", ["state", "number"]),
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
