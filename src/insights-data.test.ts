import { describe, expect, test } from "vitest";
import { buildTrendData, defaultTrendKeys } from "@/insights-data";
import type { Pr } from "@/sync";

const pr = (createdAt: string, kind: string, theme: string, lines = 10) =>
  ({ createdAt, kind, theme, additions: lines, deletions: 0, author: "someone" }) as unknown as Pr;

const prs = [
  pr("2026-11-02T10:00:00Z", "fix", "Performance"), // Mon Nov 2
  pr("2026-11-03T10:00:00Z", "perf", "Performance"),
  pr("2026-11-04T10:00:00Z", "fix", "Mobile"),
  pr("2026-11-17T10:00:00Z", "fix", "Mobile", 30), // two weeks later, empty week between
  pr("2026-11-18T10:00:00Z", "feat", "Mobile"),
];
const now = Date.parse("2026-11-18T12:00:00Z");

describe("buildTrendData", () => {
  test("buckets by week, fills empty weeks, and marks the current week", () => {
    const d = buildTrendData(prs, "count", "type", "week", now);
    expect(d.periods.map((p) => p.filterValue)).toEqual([
      "2026-11-02..2026-11-08",
      "2026-11-09..2026-11-15",
      "2026-11-16..2026-11-22",
    ]);
    expect(d.periods.map((p) => p.total)).toEqual([3, 0, 2]);
    expect(d.periods.map((p) => p.inProgress)).toEqual([false, false, true]);
    expect(d.series.map((s) => s.key)).toEqual(["fix", "feat", "perf"]);
    expect(d.series[0].values).toEqual([2, 0, 1]);
  });

  test("groups by theme by month and sums lines", () => {
    const d = buildTrendData(prs, "lines", "theme", "month", now);
    expect(d.periods).toHaveLength(1);
    expect(Object.fromEntries(d.series.map((s) => [s.key, s.values]))).toEqual({
      Mobile: [50],
      Performance: [20],
    });
  });

  test("defaults favor fix/perf and Performance", () => {
    const byType = buildTrendData(prs, "count", "type", "week", now);
    expect(defaultTrendKeys("type", byType.series)).toEqual(["fix", "perf", "feat"]);
    const byTheme = buildTrendData(prs, "count", "theme", "week", now);
    expect(defaultTrendKeys("theme", byTheme.series)).toEqual(["Performance", "Mobile"]);
  });
});
