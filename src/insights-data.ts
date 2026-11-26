import {
  ALIASES,
  THEMES,
  TIERS,
  WHO,
  formatOpenedRange,
  themeSlug,
  tierOf,
  whoOf,
  type Contributors,
  type Measure,
  type SliceBy,
  type Tier,
  type Who,
} from "@/model";
import type { Pr } from "@/sync";

export const TIER_LABEL: Record<Tier, string> = {
  maintainer: "Maintainer",
  vouched: "Vouched",
  community: "Unvouched",
  denounced: "Denounced",
};

export const WHO_SHORT: Record<Who, string> = {
  julius: "Julius",
  theo: "Theo",
  maintainer: "Maintainers",
  vouched: "Vouched",
  community: "Others",
};

const SHORT_THEME: Record<string, string> = {
  Performance: "Perf",
  Mobile: "Mobile",
  "Providers & agent runtimes": "Providers",
  "Usage, limits & accounts": "Usage",
  "Remote, Connect & pairing": "Remote",
  "Source control, PRs & CI": "Git & CI",
  "Delegation, workflows & MCP": "Delegation",
  "Browser, previews & devices": "Browser",
  "Projects, worktrees & checkpoints": "Projects",
  "Desktop shell & packaging": "Desktop",
  "Chat & thread UI": "Chat UI",
  "Server core & reliability": "Server",
  Other: "Other",
};

const KIND_ORDER = ["feat", "fix", "perf", "refactor", "docs", "test", "chore", "ci", "build", "style", "revert", "other"];
const WEEK_MS = 7 * 864e5;

export const MAX_AUTHOR_BARS = 20;

export type InsightBucket = {
  key: string;
  filterValue: string;
  label: string;
  shortLabel: string;
  count: number;
  lines: number;
  additions: number;
  deletions: number;
  value: number;
  byWho: Record<Who, number>;
  countByWho: Record<Who, number>;
  linesByWho: Record<Who, number>;
  avatar?: string;
  tier?: Tier;
};

export type InsightsDataset = {
  buckets: InsightBucket[];
  chartBuckets: InsightBucket[];
  totalCount: number;
  totalLines: number;
  totalAdditions: number;
  totalDeletions: number;
  totalValue: number;
  whoTotals: Record<Who, number>;
  activeWho: Who[];
  maxBucketValue: number;
  truncatedAuthors: number;
};

const aliasOf = (login: string) => Object.entries(ALIASES).find(([, l]) => l === login.toLowerCase())?.[0];
const zeroWho = (): Record<Who, number> => ({ julius: 0, theo: 0, maintainer: 0, vouched: 0, community: 0 });
const isoDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

function mondayStartUtc(ts: number) {
  const d = new Date(ts);
  const day = (d.getUTCDay() + 6) % 7;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day);
}

function shortDateUtc(ms: number) {
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function buildInsightsData(
  prs: readonly Pr[],
  contributors: Contributors,
  measure: Measure,
  slice: SliceBy,
): InsightsDataset {
  const map = new Map<string, InsightBucket>();
  const ensure = (key: string, meta: Pick<InsightBucket, "filterValue" | "label" | "shortLabel" | "avatar" | "tier">) => {
    let b = map.get(key);
    if (!b) {
      b = {
        key,
        ...meta,
        count: 0,
        lines: 0,
        additions: 0,
        deletions: 0,
        value: 0,
        byWho: zeroWho(),
        countByWho: zeroWho(),
        linesByWho: zeroWho(),
      };
      map.set(key, b);
    }
    return b;
  };

  if (slice === "theme") {
    for (const t of THEMES) {
      ensure(t.name, { filterValue: t.slug, label: t.name, shortLabel: SHORT_THEME[t.name] ?? t.name });
    }
  } else if (slice === "tier") {
    for (const t of TIERS) {
      ensure(t, { filterValue: t, label: TIER_LABEL[t], shortLabel: TIER_LABEL[t], tier: t });
    }
  }

  let totalLines = 0;
  let totalAdditions = 0;
  let totalDeletions = 0;
  const whoTotals = zeroWho();
  let minWeek = Infinity;
  let maxWeek = -Infinity;

  for (const pr of prs) {
    const who = whoOf(pr.author, contributors);
    const lines = pr.additions + pr.deletions;
    const metric = measure === "count" ? 1 : lines;
    totalLines += lines;
    totalAdditions += pr.additions;
    totalDeletions += pr.deletions;
    whoTotals[who] += metric;

    let bucket: InsightBucket;
    if (slice === "theme") {
      bucket = ensure(pr.theme, {
        filterValue: themeSlug(pr.theme),
        label: pr.theme,
        shortLabel: SHORT_THEME[pr.theme] ?? pr.theme,
      });
    } else if (slice === "tier") {
      const t = tierOf(pr.author, contributors);
      bucket = ensure(t, { filterValue: t, label: TIER_LABEL[t], shortLabel: TIER_LABEL[t], tier: t });
    } else if (slice === "author") {
      const k = pr.author.toLowerCase();
      bucket = ensure(k, {
        filterValue: aliasOf(pr.author) ?? k,
        label: pr.author,
        shortLabel: pr.author,
        avatar: pr.author,
        tier: tierOf(pr.author, contributors),
      });
    } else if (slice === "type") {
      const k = (pr.kind || "other").toLowerCase();
      bucket = ensure(k, { filterValue: k, label: k, shortLabel: k });
    } else {
      const wk = mondayStartUtc(Date.parse(pr.createdAt));
      if (wk < minWeek) minWeek = wk;
      if (wk > maxWeek) maxWeek = wk;
      const start = isoDate(wk);
      const end = isoDate(wk + 6 * 864e5);
      const range = `${start}..${end}`;
      bucket = ensure(String(wk), {
        filterValue: range,
        label: formatOpenedRange(range) ?? range,
        shortLabel: shortDateUtc(wk),
      });
    }

    bucket.count += 1;
    bucket.lines += lines;
    bucket.additions += pr.additions;
    bucket.deletions += pr.deletions;
    bucket.value += metric;
    bucket.byWho[who] += metric;
    bucket.countByWho[who] += 1;
    bucket.linesByWho[who] += lines;
  }

  let buckets: InsightBucket[];
  if (slice === "theme") {
    buckets = [...map.values()].filter((b) => b.count > 0);
  } else if (slice === "tier") {
    buckets = [...map.values()].filter((b) => b.count > 0);
  } else if (slice === "type") {
    buckets = [...map.values()].sort((a, b) => {
      const ai = KIND_ORDER.indexOf(a.key);
      const bi = KIND_ORDER.indexOf(b.key);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.key.localeCompare(b.key);
    });
  } else if (slice === "author") {
    buckets = [...map.values()].sort((a, b) => b.value - a.value || b.count - a.count || a.label.localeCompare(b.label));
  } else {
    buckets = [];
    if (Number.isFinite(minWeek) && Number.isFinite(maxWeek)) {
      const span = Math.round((maxWeek - minWeek) / WEEK_MS) + 1;
      const startWeek = span > 52 ? maxWeek - 51 * WEEK_MS : minWeek;
      for (let wk = startWeek; wk <= maxWeek; wk += WEEK_MS) {
        const existing = map.get(String(wk));
        if (existing) {
          buckets.push(existing);
        } else {
          const start = isoDate(wk);
          const end = isoDate(wk + 6 * 864e5);
          const range = `${start}..${end}`;
          buckets.push({
            key: String(wk),
            filterValue: range,
            label: formatOpenedRange(range) ?? range,
            shortLabel: shortDateUtc(wk),
            count: 0,
            lines: 0,
            additions: 0,
            deletions: 0,
            value: 0,
            byWho: zeroWho(),
            countByWho: zeroWho(),
            linesByWho: zeroWho(),
          });
        }
      }
    }
  }

  const chartBuckets = slice === "author" ? buckets.slice(0, MAX_AUTHOR_BARS) : buckets;
  const truncatedAuthors = slice === "author" ? Math.max(0, buckets.length - chartBuckets.length) : 0;
  const maxBucketValue = Math.max(1, ...chartBuckets.map((b) => b.value));
  const activeWho = WHO.filter((w) => whoTotals[w] > 0);

  return {
    buckets,
    chartBuckets,
    totalCount: prs.length,
    totalLines,
    totalAdditions,
    totalDeletions,
    totalValue: measure === "count" ? prs.length : totalLines,
    whoTotals,
    activeWho,
    maxBucketValue,
    truncatedAuthors,
  };
}

export function niceTicks(max: number, targetTicks = 4) {
  if (max <= 0) return { top: 1, ticks: [0, 1] };
  const raw = max / targetTicks;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const frac = raw / pow;
  const nice = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 2.5 ? 2.5 : frac <= 5 ? 5 : 10;
  const step = Math.max(1, nice * pow);
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + step * 0.001; v += step) ticks.push(Math.round(v));
  return { top, ticks };
}

export function formatCompact(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(n);
}

export function formatPct(part: number, total: number) {
  if (total <= 0 || part <= 0) return "0%";
  const pct = (part / total) * 100;
  return pct < 1 ? "<1%" : `${Math.round(pct)}%`;
}
