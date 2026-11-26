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
const resolveAuthor = (v: string) => (ALIASES[v.toLowerCase()] ?? v).toLowerCase();

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

export const RANGES = [
  { value: "1d", label: "Last day" },
  { value: "7d", label: "Last week" },
  { value: "14d", label: "Last 2 weeks" },
  { value: "30d", label: "Last month" },
  { value: "90d", label: "Last 3 months" },
];

export const FILTER_KEYS = ["author", "theme", "tier", "type", "opened", "ci", "cr", "is"] as const;
export type FilterKey = (typeof FILTER_KEYS)[number];
const KEY_ALIASES: Record<string, FilterKey> = {
  by: "author",
  th: "theme",
  kind: "type",
  age: "opened",
  checks: "ci",
  coderabbit: "cr",
  rabbit: "cr",
};
/** Keys that hold a single value; setting one replaces the previous value. */
const SINGLE: FilterKey[] = ["opened"];

export type Token = { neg: boolean; key: FilterKey; value: string };

export function parseQuery(q: string) {
  const tokens: Token[] = [];
  const words: string[] = [];
  for (const part of q.match(/-?\w+:"[^"]*"|\S+/g) ?? []) {
    const m = part.match(/^(-?)(\w+):"?([^"]*)"?$/);
    const key = m && ((FILTER_KEYS as readonly string[]).includes(m[2].toLowerCase()) ? m[2].toLowerCase() : KEY_ALIASES[m[2].toLowerCase()]);
    if (m && key && m[3]) tokens.push({ neg: m[1] === "-", key: key as FilterKey, value: m[3].toLowerCase() });
    else words.push(part.toLowerCase());
  }
  return { tokens, words };
}

const tokenText = (t: Token) => `${t.neg ? "-" : ""}${t.key}:${/\s/.test(t.value) ? `"${t.value}"` : t.value}`;

export function serialize(tokens: Token[], words: string[]) {
  return [...tokens.map(tokenText), ...words].join(" ");
}

export const hasToken = (q: string, key: FilterKey, value: string) =>
  parseQuery(q).tokens.some((t) => !t.neg && t.key === key && t.value === value.toLowerCase());

/** Adds a filter, or removes it if it is already on. */
export function toggleToken(q: string, key: FilterKey, value: string, neg = false) {
  const { tokens, words } = parseQuery(q);
  const v = value.toLowerCase();
  const exists = tokens.some((t) => t.key === key && t.value === v && t.neg === neg);
  const kept = tokens.filter((t) => !(t.key === key && (SINGLE.includes(key) || t.value === v)));
  return serialize(exists ? kept : [...kept, { neg, key, value: v }], words);
}

/** Replaces every filter on `keys` with one value (or none). */
export function setOnly(q: string, keys: FilterKey[], next?: Token) {
  const { tokens, words } = parseQuery(q);
  return serialize([...tokens.filter((t) => !keys.includes(t.key)), ...(next ? [next] : [])], words);
}

export const removeToken = (q: string, token: Token) => {
  const { tokens, words } = parseQuery(q);
  return serialize(tokens.filter((t) => tokenText(t) !== tokenText(token)), words);
};

const CI_VALUE_ALIASES: Record<string, CiStatus> = {
  passing: "pass",
  green: "pass",
  success: "pass",
  failing: "fail",
  red: "fail",
  running: "pending",
};

const CR_VALUE_ALIASES: Record<string, CrStatus> = {
  pass: "clean",
  green: "clean",
  ok: "clean",
  unresolved: "comments",
  issues: "comments",
  fail: "error",
  running: "pending",
  reviewing: "pending",
};

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

function test(pr: Pr, key: FilterKey, value: string, contributors: Contributors, now: number) {
  switch (key) {
    case "author":
      return pr.author.toLowerCase() === resolveAuthor(value);
    case "theme":
      return themeSlug(pr.theme) === value || pr.theme.toLowerCase().startsWith(value);
    case "tier": {
      const tier = tierOf(pr.author, contributors);
      return tier === value || (value === "unvouched" && tier === "community");
    }
    case "type":
      return pr.kind === value;
    case "opened": {
      const range = value.match(OPENED_RANGE_RE);
      if (range) {
        const ts = Date.parse(pr.createdAt);
        return ts >= Date.parse(`${range[1]}T00:00:00Z`) && ts <= Date.parse(`${range[2]}T23:59:59.999Z`);
      }
      const m = value.match(/^(\d+)([dwmh])$/);
      if (!m) return true;
      const unit = { h: 36e5, d: 864e5, w: 7 * 864e5, m: 30 * 864e5 }[m[2] as "h" | "d" | "w" | "m"];
      return Date.parse(pr.createdAt) >= now - Number(m[1]) * unit;
    }
    case "ci": {
      const target = CI_VALUE_ALIASES[value] ?? value;
      return ciOf(pr) === target;
    }
    case "cr": {
      const target = CR_VALUE_ALIASES[value] ?? value;
      return crOf(pr) === target;
    }
    case "is":
      if (value === "draft") return pr.draft;
      if (value === "ready") return !pr.draft;
      if (value === "green") return healthOf(pr) === "green";
      if (value === "needs-work" || value === "red") return healthOf(pr) === "needs-work";
      if (value === "running") return healthOf(pr) === "running";
      return true;
  }
}

/** Same key ORs together, different keys AND, `-key:value` excludes; free words match title, number or author. */
export function makeMatcher(q: string, contributors: Contributors, now: number) {
  const { tokens, words } = parseQuery(q);
  const positive = new Map<FilterKey, string[]>();
  for (const t of tokens) if (!t.neg) positive.set(t.key, [...(positive.get(t.key) ?? []), t.value]);
  const negative = tokens.filter((t) => t.neg);
  return (pr: Pr) => {
    for (const [key, values] of positive) if (!values.some((v) => test(pr, key, v, contributors, now))) return false;
    for (const t of negative) if (test(pr, t.key, t.value, contributors, now)) return false;
    if (words.length === 0) return true;
    const hay = `${pr.title} #${pr.number} ${pr.author}`.toLowerCase();
    return words.every((w) => hay.includes(w.replace(/^#/, "#")) || String(pr.number) === w.replace(/^#/, ""));
  };
}

export type GroupBy = "theme" | "health" | "ci" | "cr" | "who" | "author" | "none";
export type SortBy = "created" | "updated" | "health" | "needs-work" | "size";
export const GROUP_LABEL: Record<GroupBy, string> = {
  theme: "Theme",
  health: "Check health",
  ci: "CI status",
  cr: "CodeRabbit",
  who: "Contributor tier",
  author: "Author",
  none: "No grouping",
};
export const SORT_LABEL: Record<SortBy, string> = {
  created: "Newest",
  updated: "Recently updated",
  health: "Green first",
  "needs-work": "Needs work first",
  size: "Largest",
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

export function groupToSlice(group: GroupBy): SliceBy {
  if (group === "who") return "tier";
  if (group === "author") return "author";
  return "theme";
}

export function applyWhoFilter(q: string, who: Who) {
  const { tokens, words } = parseQuery(q);
  const kept = tokens.filter((t) => t.key !== "author" && t.key !== "tier");
  const added: Token[] =
    who === "julius"
      ? [{ neg: false, key: "author", value: "julius" }]
      : who === "theo"
        ? [{ neg: false, key: "author", value: "theo" }]
        : who === "maintainer"
          ? [
              { neg: false, key: "tier", value: "maintainer" },
              { neg: true, key: "author", value: "julius" },
              { neg: true, key: "author", value: "theo" },
            ]
          : who === "vouched"
            ? [{ neg: false, key: "tier", value: "vouched" }]
            : [
                { neg: true, key: "tier", value: "maintainer" },
                { neg: true, key: "tier", value: "vouched" },
              ];
  return serialize([...kept, ...added], words);
}

export function applyInsightDrillDown(q: string, slice: SliceBy, filterValue: string, who?: Who) {
  let next = setOnly(q, [slice], { neg: false, key: slice, value: filterValue });
  if (who && slice !== "author") {
    if (slice === "tier") {
      if (who === "julius" || who === "theo") {
        next = setOnly(next, ["author"], { neg: false, key: "author", value: who });
      } else if (who === "maintainer") {
        const { tokens, words } = parseQuery(next);
        next = serialize(
          [
            ...tokens.filter((t) => t.key !== "author"),
            { neg: true, key: "author", value: "julius" },
            { neg: true, key: "author", value: "theo" },
          ],
          words,
        );
      }
    } else {
      next = applyWhoFilter(next, who);
    }
  }
  return next;
}

export const SORTERS: Record<SortBy, (a: Pr, b: Pr) => number> = {
  created: (a, b) => b.number - a.number,
  updated: (a, b) => b.updatedAt.localeCompare(a.updatedAt),
  health: (a, b) => HEALTH_RANK_GREEN_FIRST[healthOf(a)] - HEALTH_RANK_GREEN_FIRST[healthOf(b)] || b.number - a.number,
  "needs-work": (a, b) =>
    HEALTH_RANK_WORK_FIRST[healthOf(a)] - HEALTH_RANK_WORK_FIRST[healthOf(b)] ||
    workSeverity(b) - workSeverity(a) ||
    b.number - a.number,
  size: (a, b) => b.additions + b.deletions - (a.additions + a.deletions),
};

export const isActive = (q: string, key: FilterKey, value: string, neg = false) =>
  parseQuery(q).tokens.some((t) => t.neg === neg && t.key === key && t.value === value.toLowerCase());

/** Flips "is" ↔ "is not" for every value of one filter. */
export function flipGroup(q: string, key: FilterKey, neg: boolean) {
  const { tokens, words } = parseQuery(q);
  return serialize(tokens.map((t) => (t.key === key && t.neg === neg ? { ...t, neg: !neg } : t)), words);
}

export function removeGroup(q: string, key: FilterKey, neg: boolean) {
  const { tokens, words } = parseQuery(q);
  return serialize(tokens.filter((t) => !(t.key === key && t.neg === neg)), words);
}
