import { assess } from "./assessment";
import type { PrState } from "../shared/history";
import { THEME_LIST } from "../shared/themes";
import type { Pr } from "./sync";

export type Tier = "maintainer" | "vouched" | "denounced" | "community";
export type Contributors = ReadonlyMap<string, { tier: Exclude<Tier, "community">; reason?: string }>;

/** Color classes: Julius and Theo get their own, everyone else by contributor tier. */
export type Who = "julius" | "theo" | "maintainer" | "vouched" | "community";
export const WHO: Who[] = ["julius", "theo", "maintainer", "vouched", "community"];
export const WHO_LABEL: Record<Who, string> = {
  julius: "Julius",
  theo: "Theo",
  maintainer: "Other maintainers",
  vouched: "Vouched",
  community: "Everyone else",
};
export const TIERS: Tier[] = ["maintainer", "vouched", "community", "denounced"];

export type CiStatus = "pass" | "fail" | "pending" | "none";
export const CI_STATUSES: CiStatus[] = ["pass", "fail", "pending", "none"];
export const CI_LABEL: Record<CiStatus, string> = {
  pass: "Passing",
  fail: "Failing",
  pending: "Running",
  none: "No checks",
};

export type CrStatus = "clean" | "comments" | "pending" | "skipped" | "error" | "none";
export const CR_STATUSES: CrStatus[] = ["clean", "comments", "pending", "skipped", "error", "none"];
export const CR_LABEL: Record<CrStatus, string> = {
  clean: "Clean",
  comments: "Has comments",
  pending: "Reviewing",
  skipped: "Skipped",
  error: "Failed",
  none: "No review",
};

export type MergeStatus = "ready" | "blocked" | "behind" | "conflicts" | "unstable" | "unknown";
export const MERGE_STATUSES: MergeStatus[] = ["ready", "blocked", "behind", "unstable", "conflicts", "unknown"];
export const MERGE_LABEL: Record<MergeStatus, string> = {
  ready: "Ready to merge",
  blocked: "Blocked",
  behind: "Behind base",
  unstable: "Checks failing",
  conflicts: "Conflicts",
  unknown: "Checking",
};
export const MERGE_SHORT: Record<MergeStatus, string> = {
  ready: "Ready",
  blocked: "Blocked",
  behind: "Behind",
  unstable: "Unstable",
  conflicts: "Conflicts",
  unknown: "…",
};
export const mergeOf = (pr: Pr): MergeStatus => pr.merge ?? "unknown";
export const REVIEW_LABEL = { approved: "Approved", changes: "Changes requested", required: "Review required" } as const;

export type Health = "green" | "needs-work" | "running" | "none";
export const HEALTH_ORDER: Health[] = ["green", "needs-work", "running", "none"];
export const HEALTH_LABEL: Record<Health, string> = {
  green: "Green",
  "needs-work": "Needs work",
  running: "Running",
  none: "Pending / no checks",
};

export const ciOf = (pr: Pr): CiStatus => pr.ci ?? "none";
export const crOf = (pr: Pr): CrStatus => pr.cr ?? "none";

/**
 * Overall PR check health combining CI and CodeRabbit:
 * - needs-work: CI failing, CodeRabbit has unresolved comments, or CodeRabbit failed
 * - running: CI or CodeRabbit currently running
 * - green: CI passing and CodeRabbit has no unresolved comments/errors (clean, skipped, or none)
 * - none: CI hasn't passed or CodeRabbit threads are still syncing
 */
export function healthOf(pr: Pr): Health {
  const ci = ciOf(pr);
  const cr = pr.cr;
  if (ci === "fail" || cr === "comments" || cr === "error") return "needs-work";
  if (ci === "pending" || cr === "pending") return "running";
  if (ci === "pass" && cr !== undefined) return "green";
  return "none";
}

export const ALIASES: Record<string, string> = { julius: "juliusmarminge", theo: "t3dotgg" };

export const tierOf = (login: string, contributors: Contributors): Tier =>
  contributors.get(login.toLowerCase())?.tier ?? "community";

export function whoOf(login: string, contributors: Contributors): Who {
  const l = login.toLowerCase();
  if (l === ALIASES.julius) return "julius";
  if (l === ALIASES.theo) return "theo";
  const tier = tierOf(l, contributors);
  return tier === "maintainer" || tier === "vouched" ? tier : "community";
}

export const THEMES = THEME_LIST;
export const themeSlug = (name: string) => THEMES.find((t) => t.name === name)?.slug ?? "other";

export const stateOf = (pr: Pr): PrState => "state" in pr ? pr.state : "open";

export const OPENED_RANGE_RE = /^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/;

export function formatOpenedRange(value: string) {
  const m = value.match(OPENED_RANGE_RE);
  if (!m) return null;
  const start = new Date(`${m[1]}T00:00:00Z`);
  const end = new Date(`${m[2]}T00:00:00Z`);
  const fmtDay = (d: Date, year = false) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(year ? { year: "numeric" } : {}), timeZone: "UTC" });
  const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
  const thisYear = new Date().getUTCFullYear();
  if (sameYear && start.getUTCFullYear() === thisYear) return `${fmtDay(start)} – ${fmtDay(end)}`;
  if (sameYear) return `${fmtDay(start)} – ${fmtDay(end, true)}`;
  return `${fmtDay(start, true)} – ${fmtDay(end, true)}`;
}

export type SortBy = "score" | "created" | "oldest" | "updated" | "stale" | "health" | "needs-work" | "size" | "smallest";
export const SORT_LABEL: Record<SortBy, string> = {
  score: "Highest review score",
  created: "Newest",
  oldest: "Oldest",
  updated: "Recently updated",
  stale: "Least recently updated",
  health: "Green first",
  "needs-work": "Needs work first",
  size: "Largest",
  smallest: "Smallest",
};

const HEALTH_RANK_GREEN_FIRST: Record<Health, number> = { green: 0, running: 1, none: 2, "needs-work": 3 };
const HEALTH_RANK_WORK_FIRST: Record<Health, number> = { "needs-work": 0, running: 1, none: 2, green: 3 };
const workSeverity = (pr: Pr) => (ciOf(pr) === "fail" ? 1000 + (pr.ciFailed ?? 1) * 10 : 0) + (pr.crUnresolved ?? 0);

export type ViewMode = "list" | "insights";
export type Measure = "count" | "lines";
export type SliceBy = "theme" | "author" | "tier" | "type" | "opened";
export type SegmentBy = "who" | "none";

export const MEASURE_LABEL: Record<Measure, string> = { count: "PR count", lines: "Lines changed" };
export const SLICE_LABEL: Record<SliceBy, string> = {
  theme: "Theme",
  author: "Author",
  tier: "Contributor tier",
  type: "Type",
  opened: "Opened (by week)",
};
export const SEGMENT_LABEL: Record<SegmentBy, string> = { who: "Contributor", none: "None" };

export function groupToSlice(group: string): SliceBy {
  if (group === "theme" || group === "type" || group === "tier" || group === "opened") return group;
  if (group === "who") return "tier";
  if (group === "author") return "author";
  return "theme";
}

export const SORTERS: Record<SortBy, (a: Pr, b: Pr) => number> = {
  score: (a, b) => (assess(b)?.total ?? 0) - (assess(a)?.total ?? 0) || b.number - a.number,
  created: (a, b) => b.number - a.number,
  updated: (a, b) => b.updatedAt.localeCompare(a.updatedAt),
  health: (a, b) => HEALTH_RANK_GREEN_FIRST[healthOf(a)] - HEALTH_RANK_GREEN_FIRST[healthOf(b)] || b.number - a.number,
  "needs-work": (a, b) =>
    HEALTH_RANK_WORK_FIRST[healthOf(a)] - HEALTH_RANK_WORK_FIRST[healthOf(b)] ||
    workSeverity(b) - workSeverity(a) ||
    b.number - a.number,
  size: (a, b) => b.additions + b.deletions - (a.additions + a.deletions),
  smallest: (a, b) => a.additions + a.deletions - (b.additions + b.deletions),
  oldest: (a, b) => a.number - b.number,
  stale: (a, b) => a.updatedAt.localeCompare(b.updatedAt),
};
