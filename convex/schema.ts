import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const ciStatus = v.union(
  v.literal("pass"),
  v.literal("fail"),
  v.literal("pending"),
  v.literal("none"),
);

export const codeRabbitStatus = v.union(
  v.literal("clean"),
  v.literal("comments"),
  v.literal("pending"),
  v.literal("skipped"),
  v.literal("error"),
  v.literal("none"),
);

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
  ci: v.optional(ciStatus),
  ciFailed: v.optional(v.number()),
  ciPending: v.optional(v.number()),
  ciPassed: v.optional(v.number()),
  cr: v.optional(codeRabbitStatus),
  crUnresolved: v.optional(v.number()),
  crTotal: v.optional(v.number()),
  crTitle: v.optional(v.string()),
};

export const checkDetail = v.object({
  name: v.string(),
  state: v.union(v.literal("pass"), v.literal("fail"), v.literal("pending"), v.literal("skipped")),
  title: v.optional(v.string()),
  url: v.optional(v.string()),
});

export const crThreadDetail = v.object({
  path: v.string(),
  line: v.optional(v.number()),
  outdated: v.boolean(),
  severity: v.optional(v.string()),
  summary: v.string(),
  url: v.optional(v.string()),
});

export default defineSchema({
  // One row per PR. `syncId` comes from a global counter bumped on every change,
  // so clients can ask for "everything after N" and get only the delta.
  // Closed PRs stay as `open: false` tombstones so caches learn to drop them.
  prs: defineTable({
    ...prFields,
    open: v.boolean(),
    syncId: v.number(),
    bodyHash: v.string(),
    headSha: v.optional(v.string()),
    rollupState: v.optional(v.string()),
    crCheckState: v.optional(
      v.union(v.literal("pass"), v.literal("fail"), v.literal("pending"), v.literal("skipped"), v.literal("none")),
    ),
    threadCount: v.optional(v.number()),
    threadsChecked: v.optional(v.boolean()),
  })
    .index("by_number", ["number"])
    .index("by_open", ["open"])
    .index("by_syncId", ["syncId"]),
  // PR bodies, loaded one at a time when a PR is opened.
  bodies: defineTable({ number: v.number(), body: v.string() }).index("by_number", ["number"]),
  // Per-PR check runs and unresolved CodeRabbit threads, loaded on demand when a PR is opened.
  prDetails: defineTable({
    number: v.number(),
    updatedAt: v.string(),
    fetchedAt: v.number(),
    checks: v.array(checkDetail),
    crThreads: v.array(crThreadDetail),
  }).index("by_number", ["number"]),
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
