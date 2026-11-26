import { assess } from "./assessment";
import {
  CalendarIcon,
  CheckCheckIcon,
  CheckCircle2Icon,
  CircleCheckBigIcon,
  CircleDashedIcon,
  CircleDotIcon,
  ClockIcon,
  GitMergeIcon,
  GitPullRequestClosedIcon,
  GitPullRequestIcon,
  HeartPulseIcon,
  ListChecksIcon,
  LoaderIcon,
  MessageSquareWarningIcon,
  MinusIcon,
  PlusIcon,
  MessagesSquareIcon,
  RulerIcon,
  ShapesIcon,
  StarIcon,
  ShieldCheckIcon,
  TagIcon,
  TagsIcon,
  UserCheckIcon,
  UserIcon,
  UsersIcon,
  XCircleIcon,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { changePurpose, PR_LABELS, PR_STATES } from "../shared/history";
import { Avatar, Dot, STATE_LABEL, TIER_LABEL, TierBadge, aliasOf } from "@/components/people";
import { CiStatusIcon, CrStatusIcon, HealthDot, MergeStatusIcon, ReviewStatusIcon } from "@/components/status";
import {
  ALIASES,
  CI_LABEL,
  CI_STATUSES,
  CR_LABEL,
  CR_STATUSES,
  HEALTH_LABEL,
  HEALTH_ORDER,
  MERGE_LABEL,
  MERGE_STATUSES,
  OPENED_RANGE_RE,
  REVIEW_LABEL,
  REVIEW_STATUSES,
  THEMES,
  TIERS,
  WHO,
  WHO_LABEL,
  ciOf,
  crOf,
  formatOpenedRange,
  healthOf,
  mergeOf,
  reviewOf,
  stateOf,
  tierOf,
  whoOf,
  type Contributors,
  type Tier,
  type Who,
} from "@/model";
import type { Pr } from "@/sync";

/**
 * Every property you can filter or group pull requests by lives in FIELDS below.
 * The filter menu, filter chips, typed `key:value` search, Display → Grouping,
 * group headers and the command menu all read from this one list, so adding a
 * property is one entry here.
 */

export type Ctx = { contributors: Contributors; now: number };

export type Option = {
  value: string;
  label: string;
  leading?: ReactNode;
  /** Shown after the label in group headers, e.g. an author's tier badge. */
  trailing?: ReactNode;
  /** Filled in by `filterOptions`. */
  count?: number;
  /** Leave out of the filter menu when no pull request has it. */
  hideEmpty?: boolean;
};

export type Field = {
  /** Used in typed filters (`key:value`), the URL and `?group=`. */
  key: string;
  label: string;
  plural: string;
  icon: LucideIcon;
  /** Other names accepted when typing a filter. */
  aliases?: string[];
  /** One value at a time, like a date range: picking one replaces the other. */
  single?: boolean;
  /** Only meaningful once merged/closed history is available from the backend. */
  history?: boolean;
  /** The PR's bucket for this property. Fields with one can be grouped by, and filter on it by default. */
  bucket?: (pr: Pr, ctx: Ctx) => string;
  /** Known buckets in display order. Omit to derive buckets from the data, largest first. */
  values?: (ctx: Ctx) => Option[];
  /** Label and icons for a bucket derived from the data. */
  describe?: (value: string, ctx: Ctx) => Omit<Option, "value">;
  /** How group headers are ordered: in `values` order (default when given) or largest first. */
  groupOrder?: "values" | "count";
  /** Group-header label, when it differs from `label`. */
  groupLabel?: string;
  /** Filter-menu choices, given every PR. Defaults to the buckets; `false` makes the field group-only. */
  filterValues?: false | ((prs: Pr[], ctx: Ctx) => Option[]);
  /** The one filter value a PR has, for fast counting when `filterValues` don't line up with buckets. */
  optionOf?: (pr: Pr, ctx: Ctx) => string;
  /** Custom filter test. Defaults to `bucket(pr) === value`. */
  matches?: (pr: Pr, value: string, ctx: Ctx) => boolean;
  /** Chip text for typed values that aren't menu choices, e.g. `2026-01-01..2026-01-31`. */
  formatValue?: (value: string) => string | null;
  validValue?: (value: string) => boolean;
  /** Typed shorthands, e.g. `ci:green` means `ci:pass`. */
  valueAliases?: Record<string, string>;
  /** Not offered in Display → Grouping even though it has buckets. */
  groupable?: boolean;
};

// ---------------------------------------------------------------------------
// Builders for common kinds of fields

const DAY = 864e5;
const UNIT: Record<string, number> = { h: 36e5, d: DAY, w: 7 * DAY, m: 30 * DAY, y: 365 * DAY };

const DATE_BUCKETS: Option[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "week", label: "Past week" },
  { value: "month", label: "Past month" },
  { value: "quarter", label: "Past 3 months" },
  { value: "year", label: "Past year" },
  { value: "older", label: "Over a year ago" },
  { value: "never", label: "Never" },
];
const RELATIVE_DATE = /^([<>])?(\d+)([hdwmy])$/;

function absoluteDateRange(value: string) {
  const range = value.match(OPENED_RANGE_RE);
  if (!range) return null;
  const [first, last] = range.slice(1);
  const start = Date.parse(`${first}T00:00:00Z`);
  const end = Date.parse(`${last}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) return null;
  if (new Date(start).toISOString().slice(0, 10) !== first || new Date(end).toISOString().slice(0, 10) !== last) return null;
  return { start, end: end + DAY };
}

const isDateFilter = (value: string) =>
  RELATIVE_DATE.test(value) || DATE_BUCKETS.some((bucket) => bucket.value === value) || absoluteDateRange(value) !== null;

export function dateBucket(ms: number, now: number) {
  if (Number.isNaN(ms)) return "never";
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  if (ms >= midnight.getTime()) return "today";
  if (ms >= midnight.getTime() - DAY) return "yesterday";
  const age = now - ms;
  if (age < 7 * DAY) return "week";
  if (age < 30 * DAY) return "month";
  if (age < 90 * DAY) return "quarter";
  if (age < 365 * DAY) return "year";
  return "older";
}

/**
 * `7d` = within the last 7 days, `>30d` = more than 30 days ago (units h, d, w, m, y),
 * `2026-01-01..2026-01-31` = between two UTC days, plus `today` and `yesterday`.
 */
export function matchDate(ms: number, value: string, now: number) {
  if (value === "never") return Number.isNaN(ms);
  if (Number.isNaN(ms)) return false;
  const m = value.match(RELATIVE_DATE);
  if (m) {
    const span = Number(m[2]) * UNIT[m[3]];
    return m[1] === ">" ? now - ms > span : now - ms <= span;
  }
  const range = absoluteDateRange(value);
  if (range) return ms >= range.start && ms < range.end;
  return dateBucket(ms, now) === value;
}

export const DATE_RANGES: [string, string][] = [
  ["1d", "Last day"],
  ["7d", "Last week"],
  ["14d", "Last 2 weeks"],
  ["30d", "Last month"],
  ["90d", "Last 3 months"],
  [">7d", "More than a week ago"],
  [">30d", "More than a month ago"],
  [">90d", "More than 3 months ago"],
];

/** A timestamp field: relative-range filters and Today / Yesterday / Past week… groups. */
function dateField(f: Pick<Field, "key" | "label" | "icon" | "aliases" | "history"> & { get: (pr: Pr) => string | null | undefined }): Field {
  const ms = (pr: Pr) => Date.parse(f.get(pr) ?? "");
  return {
    ...f,
    plural: "ranges",
    single: true,
    bucket: (pr, ctx) => dateBucket(ms(pr), ctx.now),
    values: () => DATE_BUCKETS,
    filterValues: () => DATE_RANGES.map(([value, label]) => ({ value, label })),
    matches: (pr, value, ctx) => matchDate(ms(pr), value, ctx.now),
    formatValue: formatOpenedRange,
    validValue: isDateFilter,
  };
}

type Range = { value: string; label: string; max: number; leading?: ReactNode };

/**
 * A numeric field bucketed into labelled ranges (each `max` is exclusive). Filters take a
 * bucket (`size:xl`) or a number: `5`, `>5`, `>=5`, `<5`, `<=5` or `2-10`.
 * PRs where `get` returns undefined land in a "missing" bucket and match no number.
 */
function rangeField(
  f: Pick<Field, "key" | "label" | "plural" | "icon" | "aliases">,
  get: (pr: Pr) => number | undefined,
  ranges: Range[],
  missing?: Option,
): Field {
  const all = missing ? [...ranges, missing] : ranges;
  return {
    ...f,
    bucket: (pr) => rangeBucket(get(pr), ranges, missing),
    values: () => all.map(({ value, label, leading }) => ({ value, label, leading, hideEmpty: value === missing?.value })),
    matches: (pr, value) => {
      const n = get(pr);
      if (all.some((r) => r.value === value)) return rangeBucket(n, ranges, missing) === value;
      if (n === undefined) return false;
      const cmp = value.match(/^(>=|<=|>|<)?(\d+)$/);
      if (cmp) {
        const x = Number(cmp[2]);
        return cmp[1] === ">" ? n > x : cmp[1] === ">=" ? n >= x : cmp[1] === "<" ? n < x : cmp[1] === "<=" ? n <= x : n === x;
      }
      const span = value.match(/^(\d+)-(\d+)$/);
      if (span) return n >= Number(span[1]) && n <= Number(span[2]);
      return true;
    },
  };
}

function rangeBucket(n: number | undefined, ranges: Range[], missing?: Option) {
  if (n === undefined) return missing?.value ?? ranges[0].value;
  return (ranges.find((r) => n < r.max) ?? ranges.at(-1)!).value;
}

// ---------------------------------------------------------------------------
// The fields

const tierWho: Record<Tier, Who> = { maintainer: "maintainer", vouched: "vouched", community: "community", denounced: "community" };
const resolveAuthor = (v: string) => (ALIASES[v.toLowerCase()] ?? v).toLowerCase();
/** Open PRs store the theme name, history rows store its slug. */
const themeOf = (pr: Pr) => THEMES.find((t) => t.name === pr.theme || t.slug === pr.theme)?.slug ?? "other";
const STATE_ICON = {
  open: <GitPullRequestIcon className="size-3.5 text-(--status-pass)" aria-hidden="true" />,
  merged: <GitMergeIcon className="size-3.5 text-(--status-merged)" aria-hidden="true" />,
  closed: <GitPullRequestClosedIcon className="size-3.5 text-(--status-fail)" aria-hidden="true" />,
};
const tagIcon = <TagIcon className="size-3.5 text-muted-foreground" aria-hidden="true" />;
/** Check data only describes open PRs; history rows carry stale or no check data. */
const openOnly = <T,>(pr: Pr, value: T) => (pr.open ? value : undefined);

const LINE_RANGES: Range[] = [
  { value: "0", label: "None", max: 1 },
  { value: "1-49", label: "1–49 lines", max: 50 },
  { value: "50-249", label: "50–249 lines", max: 250 },
  { value: "250-999", label: "250–999 lines", max: 1000 },
  { value: "1000+", label: "1,000+ lines", max: Infinity },
];

const SCORE_DOT = { pass: "bg-(--status-pass)", warn: "bg-(--status-warn)", fail: "bg-(--status-fail)" };
function ScoreDot({ tone }: { tone: keyof typeof SCORE_DOT }) {
  return <span aria-hidden="true" className={`inline-block size-2 shrink-0 rounded-full ${SCORE_DOT[tone]}`} />;
}

/** How far a PR has worked through CodeRabbit's threads. History rows report none. */
function crProgress(pr: Pr) {
  if (!pr.open || pr.cr === undefined) return "nothreads";
  const total = pr.crTotal ?? 0;
  const open = pr.crUnresolved ?? 0;
  if (total === 0) return open > 0 ? "none" : "nothreads";
  if (open === 0) return "all";
  return open >= total ? "none" : "some";
}

export const FIELDS: Field[] = [
  {
    key: "benefit",
    label: "Review score",
    plural: "review scores",
    icon: HeartPulseIcon,
    bucket: (pr) => String(assess(pr)?.total ?? "pending"),
    describe: (value) => ({ label: value === "pending" ? "Awaiting review" : `${value}/60` }),
  },
  rangeField(
    { key: "score", label: "Score band", plural: "score bands", icon: StarIcon, aliases: ["rating", "grade"] },
    (pr) => assess(pr)?.total,
    // Same cut-offs as the score pill's colors.
    [
      { value: "low", label: "Low · under 32", max: 32, leading: <ScoreDot tone="fail" /> },
      { value: "mid", label: "Mid · 32–39", max: 40, leading: <ScoreDot tone="warn" /> },
      { value: "high", label: "High · 40+", max: Infinity, leading: <ScoreDot tone="pass" /> },
    ],
    { value: "pending", label: "Awaiting review" },
  ),
  {
    key: "state",
    label: "State",
    plural: "states",
    icon: CircleDotIcon,
    history: true,
    bucket: (pr) => stateOf(pr),
    values: () => PR_STATES.map((s) => ({ value: s, label: STATE_LABEL[s], leading: STATE_ICON[s] })),
  },
  {
    key: "label",
    label: "Label",
    plural: "labels",
    icon: TagsIcon,
    history: true,
    // A PR can carry several labels, so this filters but doesn't group.
    filterValues: () => PR_LABELS.map((l) => ({ value: l, label: l })),
    matches: (pr, value) => "labels" in pr && pr.labels.some((l) => l === value),
  },
  {
    key: "ci",
    label: "CI",
    groupLabel: "CI status",
    plural: "CI states",
    icon: CheckCircle2Icon,
    aliases: ["checks"],
    bucket: (pr) => (pr.open ? ciOf(pr) : "none"),
    values: () => CI_STATUSES.map((s) => ({ value: s, label: CI_LABEL[s], leading: <CiStatusIcon status={s} /> })),
    matches: (pr, value) => !!pr.open && ciOf(pr) === value,
    valueAliases: { passing: "pass", green: "pass", success: "pass", failing: "fail", red: "fail", running: "pending" },
  },
  rangeField(
    { key: "failing", label: "Failing checks", plural: "counts", icon: XCircleIcon, aliases: ["failed"] },
    (pr) => openOnly(pr, pr.ci === undefined ? undefined : (pr.ciFailed ?? 0)),
    [
      { value: "0", label: "None failing", max: 1, leading: <CiStatusIcon status="pass" /> },
      { value: "1", label: "1 failing", max: 2, leading: <CiStatusIcon status="fail" /> },
      { value: "2-4", label: "2–4 failing", max: 5, leading: <CiStatusIcon status="fail" /> },
      { value: "5+", label: "5+ failing", max: Infinity, leading: <CiStatusIcon status="fail" /> },
    ],
    { value: "unknown", label: "No checks", leading: <CiStatusIcon status="none" /> },
  ),
  rangeField(
    { key: "pending", label: "Running checks", plural: "counts", icon: LoaderIcon, aliases: ["queued"] },
    (pr) => openOnly(pr, pr.ci === undefined ? undefined : (pr.ciPending ?? 0)),
    [
      { value: "0", label: "None running", max: 1 },
      { value: "1-4", label: "1–4 running", max: 5, leading: <CiStatusIcon status="pending" /> },
      { value: "5+", label: "5+ running", max: Infinity, leading: <CiStatusIcon status="pending" /> },
    ],
    { value: "unknown", label: "No checks", leading: <CiStatusIcon status="none" /> },
  ),
  rangeField(
    { key: "passed", label: "Passing checks", plural: "counts", icon: CircleCheckBigIcon, aliases: ["passing"] },
    (pr) => openOnly(pr, pr.ci === undefined ? undefined : (pr.ciPassed ?? 0)),
    [
      { value: "0", label: "None passing", max: 1 },
      { value: "1-9", label: "1–9 passing", max: 10, leading: <CiStatusIcon status="pass" /> },
      { value: "10-19", label: "10–19 passing", max: 20, leading: <CiStatusIcon status="pass" /> },
      { value: "20+", label: "20+ passing", max: Infinity, leading: <CiStatusIcon status="pass" /> },
    ],
    { value: "unknown", label: "No checks", leading: <CiStatusIcon status="none" /> },
  ),
  rangeField(
    { key: "checkcount", label: "Total checks", plural: "counts", icon: ListChecksIcon, aliases: ["nchecks", "totalchecks"] },
    (pr) => openOnly(pr, pr.ci === undefined ? undefined : (pr.ciPassed ?? 0) + (pr.ciFailed ?? 0) + (pr.ciPending ?? 0)),
    [
      { value: "0", label: "No checks ran", max: 1 },
      { value: "1-9", label: "1–9 checks", max: 10 },
      { value: "10-19", label: "10–19 checks", max: 20 },
      { value: "20+", label: "20+ checks", max: Infinity },
    ],
    { value: "unknown", label: "Not synced", leading: <CiStatusIcon status="none" /> },
  ),
  {
    key: "cr",
    label: "CodeRabbit",
    plural: "CodeRabbit states",
    icon: MessageSquareWarningIcon,
    aliases: ["coderabbit", "rabbit"],
    bucket: (pr) => (pr.open ? crOf(pr) : "none"),
    values: () =>
      CR_STATUSES.map((s) => ({ value: s, label: CR_LABEL[s], leading: <CrStatusIcon status={s} />, hideEmpty: s === "error" })),
    matches: (pr, value) => !!pr.open && crOf(pr) === value,
    valueAliases: { pass: "clean", green: "clean", ok: "clean", unresolved: "comments", issues: "comments", fail: "error", running: "pending", reviewing: "pending" },
  },
  {
    key: "merge",
    label: "Merge status",
    plural: "merge states",
    icon: GitMergeIcon,
    aliases: ["mergeable"],
    // History rows group under their final state, so "Merge status" reads well on any tab.
    bucket: (pr) => (pr.open ? mergeOf(pr) : stateOf(pr)),
    values: () => [
      ...MERGE_STATUSES.map((s) => ({ value: s, label: MERGE_LABEL[s], leading: <MergeStatusIcon status={s} /> })),
      { value: "merged", label: STATE_LABEL.merged, leading: STATE_ICON.merged, hideEmpty: true },
      { value: "closed", label: STATE_LABEL.closed, leading: STATE_ICON.closed, hideEmpty: true },
    ],
    filterValues: () => MERGE_STATUSES.map((s) => ({ value: s, label: MERGE_LABEL[s], leading: <MergeStatusIcon status={s} /> })),
    optionOf: (pr) => (pr.open ? mergeOf(pr) : stateOf(pr)),
    matches: (pr, value) => !!pr.open && mergeOf(pr) === value,
    valueAliases: { clean: "ready", mergeable: "ready", conflict: "conflicts", conflicting: "conflicts", dirty: "conflicts" },
  },
  rangeField(
    { key: "unresolved", label: "CodeRabbit comments", plural: "counts", icon: MessagesSquareIcon, aliases: ["threads", "comments"] },
    (pr) => openOnly(pr, pr.cr === undefined ? undefined : (pr.crUnresolved ?? 0)),
    [
      { value: "0", label: "No open comments", max: 1, leading: <CrStatusIcon status="clean" /> },
      { value: "1-2", label: "1–2 comments", max: 3, leading: <CrStatusIcon status="comments" /> },
      { value: "3-9", label: "3–9 comments", max: 10, leading: <CrStatusIcon status="comments" /> },
      { value: "10+", label: "10+ comments", max: Infinity, leading: <CrStatusIcon status="comments" /> },
    ],
    { value: "unknown", label: "Not reviewed", leading: <CrStatusIcon status="none" /> },
  ),
  {
    key: "addressed",
    label: "CodeRabbit progress",
    plural: "progress states",
    icon: CheckCheckIcon,
    aliases: ["crprogress", "resolution"],
    bucket: (pr) => crProgress(pr),
    values: () => [
      { value: "all", label: "All comments resolved", leading: <CrStatusIcon status="clean" /> },
      { value: "some", label: "Some resolved", leading: <CrStatusIcon status="comments" /> },
      { value: "none", label: "None resolved", leading: <CrStatusIcon status="error" /> },
      { value: "nothreads", label: "No comments", leading: <CrStatusIcon status="none" /> },
    ],
    valueAliases: { done: "all", resolved: "all", partial: "some", untouched: "none", empty: "nothreads" },
  },
  rangeField(
    { key: "resolved", label: "Resolved CodeRabbit comments", plural: "counts", icon: CheckCheckIcon, aliases: ["crresolved"] },
    (pr) => openOnly(pr, pr.cr === undefined ? undefined : Math.max(0, (pr.crTotal ?? 0) - (pr.crUnresolved ?? 0))),
    [
      { value: "0", label: "None resolved", max: 1 },
      { value: "1-2", label: "1–2 resolved", max: 3, leading: <CrStatusIcon status="clean" /> },
      { value: "3-9", label: "3–9 resolved", max: 10, leading: <CrStatusIcon status="clean" /> },
      { value: "10+", label: "10+ resolved", max: Infinity, leading: <CrStatusIcon status="clean" /> },
    ],
    { value: "unknown", label: "Not reviewed", leading: <CrStatusIcon status="none" /> },
  ),
  rangeField(
    { key: "crtotal", label: "All CodeRabbit comments", plural: "counts", icon: MessagesSquareIcon, aliases: ["crthreads", "crcomments"] },
    (pr) => openOnly(pr, pr.cr === undefined ? undefined : (pr.crTotal ?? 0)),
    [
      { value: "0", label: "No comments", max: 1 },
      { value: "1-2", label: "1–2 comments", max: 3 },
      { value: "3-9", label: "3–9 comments", max: 10 },
      { value: "10+", label: "10+ comments", max: Infinity },
    ],
    { value: "unknown", label: "Not reviewed", leading: <CrStatusIcon status="none" /> },
  ),
  {
    key: "review",
    label: "Review decision",
    plural: "review decisions",
    icon: UserCheckIcon,
    aliases: ["approval", "reviews"],
    bucket: (pr) => reviewOf(pr),
    values: () => REVIEW_STATUSES.map((s) => ({ value: s, label: REVIEW_LABEL[s], leading: <ReviewStatusIcon status={s} /> })),
    valueAliases: {
      approve: "approved",
      lgtm: "approved",
      "changes-requested": "changes",
      requested: "changes",
      needed: "required",
      "needs-review": "required",
      pending: "required",
      unknown: "syncing",
    },
  },
  {
    key: "health",
    label: "Check health",
    plural: "health states",
    icon: HeartPulseIcon,
    bucket: (pr) => (pr.open ? healthOf(pr) : "none"),
    values: () => HEALTH_ORDER.map((h) => ({ value: h, label: HEALTH_LABEL[h], leading: <HealthDot health={h} /> })),
    valueAliases: { red: "needs-work" },
  },
  {
    key: "draft",
    label: "Draft state",
    plural: "states",
    icon: CircleDashedIcon,
    bucket: (pr) => (pr.draft ? "draft" : "ready"),
    values: () => [
      { value: "ready", label: "Ready for review" },
      { value: "draft", label: "Draft", leading: <CircleDashedIcon className="size-3.5 text-muted-foreground" aria-hidden="true" /> },
    ],
  },
  {
    key: "author",
    label: "Author",
    plural: "authors",
    icon: UserIcon,
    aliases: ["by"],
    bucket: (pr) => pr.author,
    describe: (login, ctx) => ({ label: login, leading: <Avatar login={login} />, trailing: <TierBadge tier={tierOf(login, ctx.contributors)} /> }),
    groupOrder: "count",
    filterValues: (prs) => {
      const counts = new Map<string, number>();
      for (const pr of prs) counts.set(pr.author, (counts.get(pr.author) ?? 0) + 1);
      return [...counts]
        .sort((a, b) => b[1] - a[1])
        .map(([login]) => ({ value: aliasOf(login) ?? login.toLowerCase(), label: login, leading: <Avatar login={login} /> }));
    },
    optionOf: (pr) => aliasOf(pr.author) ?? pr.author.toLowerCase(),
    matches: (pr, value) => pr.author.toLowerCase() === resolveAuthor(value),
  },
  {
    key: "who",
    label: "Contributor",
    plural: "contributors",
    icon: UsersIcon,
    bucket: (pr, ctx) => whoOf(pr.author, ctx.contributors),
    values: () => WHO.map((w) => ({ value: w, label: WHO_LABEL[w], leading: <Dot who={w} /> })),
    // Filtered through `author:` and `tier:` instead.
    filterValues: false,
  },
  {
    key: "tier",
    label: "Contributor tier",
    plural: "tiers",
    icon: ShieldCheckIcon,
    bucket: (pr, ctx) => tierOf(pr.author, ctx.contributors),
    values: () => TIERS.map((t) => ({ value: t, label: TIER_LABEL[t], leading: <Dot who={tierWho[t]} /> })),
    valueAliases: { unvouched: "community" },
  },
  {
    key: "theme",
    label: "Theme",
    plural: "themes",
    icon: TagIcon,
    aliases: ["th"],
    bucket: themeOf,
    values: () => THEMES.map((t) => ({ value: t.slug, label: t.name, leading: tagIcon })),
    groupOrder: "count",
    matches: (pr, value) => themeOf(pr) === value || pr.theme.toLowerCase().startsWith(value),
  },
  {
    key: "purpose",
    label: "Fix or feature",
    plural: "change purposes",
    icon: ShapesIcon,
    bucket: (pr) => changePurpose(pr.title),
    values: () => [
      { value: "fix", label: "Fix" },
      { value: "feature", label: "Feature" },
      { value: "other", label: "Other" },
    ],
  },
  {
    key: "type",
    label: "Type",
    plural: "types",
    icon: ShapesIcon,
    aliases: ["kind"],
    bucket: (pr) => pr.kind || "other",
    describe: (kind) => ({ label: kind }),
  },
  rangeField({ key: "size", label: "Size", plural: "sizes", icon: RulerIcon, aliases: ["lines"] }, (pr) => pr.additions + pr.deletions, [
    { value: "xs", label: "XS · under 10 lines", max: 10 },
    { value: "s", label: "S · 10–49 lines", max: 50 },
    { value: "m", label: "M · 50–249 lines", max: 250 },
    { value: "l", label: "L · 250–999 lines", max: 1000 },
    { value: "xl", label: "XL · 1,000+ lines", max: Infinity },
  ]),
  rangeField({ key: "additions", label: "Lines added", plural: "ranges", icon: PlusIcon, aliases: ["added", "adds"] }, (pr) => pr.additions, LINE_RANGES),
  rangeField({ key: "deletions", label: "Lines removed", plural: "ranges", icon: MinusIcon, aliases: ["removed", "dels"] }, (pr) => pr.deletions, LINE_RANGES),
  {
    key: "balance",
    label: "Net change",
    plural: "net changes",
    icon: RulerIcon,
    aliases: ["net"],
    bucket: (pr) => (pr.deletions > pr.additions ? "shrinks" : pr.additions > pr.deletions ? "grows" : "even"),
    values: () => [
      { value: "grows", label: "Adds more than it removes", leading: <PlusIcon className="size-3.5 text-(--status-pass)" aria-hidden="true" /> },
      { value: "shrinks", label: "Removes more than it adds", leading: <MinusIcon className="size-3.5 text-(--status-fail)" aria-hidden="true" /> },
      { value: "even", label: "Even", hideEmpty: true },
    ],
    valueAliases: { positive: "grows", negative: "shrinks", cleanup: "shrinks" },
  },
  dateField({ key: "opened", label: "Created", icon: CalendarIcon, aliases: ["created", "age"], get: (pr) => pr.createdAt }),
  dateField({ key: "updated", label: "Updated", icon: ClockIcon, aliases: ["active", "activity"], get: (pr) => pr.updatedAt }),
  dateField({ key: "merged", label: "Merged", icon: GitMergeIcon, history: true, get: (pr) => ("mergedAt" in pr ? pr.mergedAt : undefined) }),
  dateField({ key: "closed", label: "Closed", icon: XCircleIcon, history: true, get: (pr) => ("closedAt" in pr ? pr.closedAt : undefined) }),
];

// ---------------------------------------------------------------------------
// Lookups and helpers

const BY_KEY = new Map<string, Field>();
for (const f of FIELDS) {
  BY_KEY.set(f.key, f);
  for (const a of f.aliases ?? []) BY_KEY.set(a, f);
}

/** Resolves a typed key or alias to a filterable field. */
export const filterField = (key: string) => {
  const f = BY_KEY.get(key.toLowerCase());
  return f && f.filterValues !== false ? f : undefined;
};
export const fieldOf = (key: string) => BY_KEY.get(key);

export const isGroupable = (f: Field) => !!f.bucket && f.groupable !== false;

export type GroupOption = { value: string; label: string; icon?: LucideIcon };
/** Display → Grouping choices. History-only fields are left out until the backend has history. */
export const groupOptions = (history: boolean): GroupOption[] => [
  ...FIELDS.filter((f) => isGroupable(f) && (history || !f.history)).map((f) => ({ value: f.key, label: f.groupLabel ?? f.label, icon: f.icon })),
  { value: "none", label: "No grouping" },
];
export const isGroupKey = (key: string) => key === "none" || !!(fieldOf(key) && fieldOf(key)!.key === key && isGroupable(fieldOf(key)!));

export function testField(f: Field, pr: Pr, raw: string, ctx: Ctx) {
  const value = f.valueAliases?.[raw] ?? raw;
  if (f.matches) return f.matches(pr, value, ctx);
  return f.bucket ? f.bucket(pr, ctx) === value : true;
}

/** Label and icons for one bucket value. */
export function describeValue(f: Field, value: string, ctx: Ctx): Option {
  const known = f.values?.(ctx).find((o) => o.value === value);
  return known ?? { value, label: value, ...f.describe?.(value, ctx) };
}

/**
 * Filter-menu choices for a field. Choices come from `universe` (every PR) so a value never vanishes
 * from the menu; counts come from `scoped`, usually the PRs matching every other active filter.
 */
export function filterOptions(f: Field, universe: Pr[], ctx: Ctx, scoped: Pr[] = universe): Option[] {
  if (f.filterValues === false) return [];
  const keyOf = f.optionOf ?? (f.filterValues ? undefined : f.bucket);
  const tally = (prs: Pr[]) => {
    const m = new Map<string, number>();
    if (keyOf) for (const pr of prs) m.set(keyOf(pr, ctx), (m.get(keyOf(pr, ctx)) ?? 0) + 1);
    return m;
  };
  const counts = tally(scoped);
  const countOf = (value: string) => (keyOf ? (counts.get(value) ?? 0) : scoped.filter((pr) => testField(f, pr, value, ctx)).length);
  let options: Option[];
  if (f.filterValues) options = f.filterValues(universe, ctx);
  else if (f.values) options = f.values(ctx);
  else options = [...tally(universe)].sort((a, b) => b[1] - a[1]).map(([value]) => describeValue(f, value, ctx));
  // Hide empty values only when no PR at all has them, so filtering doesn't make choices disappear.
  const present = f.values && !f.filterValues ? tally(universe) : undefined;
  return options
    .filter((o) => !(o.hideEmpty && present && !present.get(o.value)))
    .map((o) => ({ ...o, count: countOf(o.value) }));
}

export type Group = Option & { prs: Pr[] };

/** Splits `prs` into ordered groups by a field's buckets, keeping each group's PR order. */
export function groupPrs(key: string, prs: Pr[], ctx: Ctx): Group[] {
  const f = fieldOf(key);
  if (!f?.bucket) return prs.length ? [{ value: "all", label: "All", prs }] : [];
  const map = new Map<string, Pr[]>();
  for (const pr of prs) {
    const v = f.bucket(pr, ctx);
    const list = map.get(v);
    if (list) list.push(pr);
    else map.set(v, [pr]);
  }
  const groups = [...map].map(([value, list]) => ({ ...describeValue(f, value, ctx), prs: list }));
  const order = f.values?.(ctx).map((o) => o.value);
  if (order && (f.groupOrder ?? "values") === "values") {
    groups.sort((a, b) => order.indexOf(a.value) - order.indexOf(b.value));
  } else {
    groups.sort((a, b) => Number(a.value === "other") - Number(b.value === "other") || b.prs.length - a.prs.length);
  }
  return groups;
}
