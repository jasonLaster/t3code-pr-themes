import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  MAX_TREND_SERIES,
  buildTrendData,
  defaultTrendKeys,
  formatCompact,
  niceTicks,
  type TrendSeries,
} from "@/insights-data";
import { cn } from "@/lib/utils";
import {
  TREND_GROUP_LABEL,
  type Contributors,
  type Measure,
  type SliceBy,
  type TrendGroup,
  type TrendInterval,
  type TrendScale,
  type TrendStyle,
  type Who,
} from "@/model";
import type { Pr } from "@/sync";

type SeriesPick = { key: string; slot: number };

type Props = {
  prs: readonly Pr[];
  contributors: Contributors;
  measure: Measure;
  group: TrendGroup;
  interval: TrendInterval;
  chartStyle: TrendStyle;
  scale: TrendScale;
  onDrillDown: (slice: SliceBy, filterValue: string, who?: Who) => void;
};

const GROUP_SLICE: Record<TrendGroup, SliceBy> = { type: "type", theme: "theme", who: "tier" };

const PLOT_HEIGHT = 200;
const TOP_PAD = 10;
const AXIS_W = 40;
const END_LABEL_W = 84;
const LABEL_GAP = 13;
const MIN_SHARE_PRS = 5;

const slotColor = (slot: number) => `var(--series-${slot + 1})`;
const seriesColor = (s: TrendSeries, slot: number | undefined) => s.color ?? slotColor(slot ?? 0);
const fmt = (n: number) => n.toLocaleString();

type Pt = [x: number, y: number] | null;

type Seg = { p0: [number, number]; c1: [number, number]; c2: [number, number]; p1: [number, number] };

const sign = (v: number) => (v < 0 ? -1 : 1);
const xy = (p: [number, number]) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`;

/**
 * Monotone cubic segments (the same curve as d3's curveMonotoneX): smooth, but never
 * overshooting a data point, so a curve never dips below zero or invents a peak.
 * segments[i] joins point i to i + 1, or is null across a gap.
 */
function smoothSegments(points: readonly Pt[]): (Seg | null)[] {
  const segs: (Seg | null)[] = points.slice(0, -1).map(() => null);
  let i = 0;
  while (i < points.length) {
    if (!points[i]) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < points.length && points[j + 1]) j++;
    const run = points.slice(i, j + 1) as [number, number][];
    const slopes = run.slice(0, -1).map((p, k) => (run[k + 1][1] - p[1]) / (run[k + 1][0] - p[0] || 1));
    const tangents = run.map((p, k) => {
      if (run.length < 3) return slopes[0] ?? 0;
      if (k > 0 && k < run.length - 1) {
        const h0 = p[0] - run[k - 1][0];
        const h1 = run[k + 1][0] - p[0];
        const [s0, s1] = [slopes[k - 1], slopes[k]];
        const mid = (s0 * h1 + s1 * h0) / (h0 + h1);
        return (sign(s0) + sign(s1)) * Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(mid)) || 0;
      }
      return NaN;
    });
    if (run.length >= 3) {
      tangents[0] = (3 * slopes[0] - tangents[1]) / 2;
      const last = run.length - 1;
      tangents[last] = (3 * slopes[last - 1] - tangents[last - 1]) / 2;
    }
    for (let k = 0; k < run.length - 1; k++) {
      const [p0, p1] = [run[k], run[k + 1]];
      const dx = (p1[0] - p0[0]) / 3;
      segs[i + k] = {
        p0,
        c1: [p0[0] + dx, p0[1] + tangents[k] * dx],
        c2: [p1[0] - dx, p1[1] - tangents[k + 1] * dx],
        p1,
      };
    }
    i = j + 1;
  }
  return segs;
}

/** Path through segments [from, to), lifting the pen across gaps. */
function linePath(segs: readonly (Seg | null)[], from = 0, to = segs.length) {
  let d = "";
  let pen = false;
  for (let i = from; i < to; i++) {
    const g = segs[i];
    if (!g) {
      pen = false;
      continue;
    }
    if (!pen) d += `M${xy(g.p0)}`;
    d += `C${xy(g.c1)} ${xy(g.c2)} ${xy(g.p1)}`;
    pen = true;
  }
  return d;
}

/** Filled band between two smoothed curves, one closed shape per unbroken run. */
function areaPath(tops: readonly (Seg | null)[], bases: readonly (Seg | null)[]) {
  let d = "";
  let i = 0;
  while (i < tops.length) {
    if (!tops[i] || !bases[i]) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < tops.length && tops[j + 1] && bases[j + 1]) j++;
    d += linePath(tops, i, j + 1);
    d += `L${xy(bases[j]!.p1)}`;
    for (let k = j; k >= i; k--) {
      const b = bases[k]!;
      d += `C${xy(b.c2)} ${xy(b.c1)} ${xy(b.p0)}`;
    }
    d += "Z";
    i = j + 1;
  }
  return d;
}

/** Spread end-of-line labels apart so they never overlap, keeping their order. */
function spreadLabels(ys: number[], min: number, max: number) {
  const order = ys.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y);
  for (let k = 1; k < order.length; k++) order[k].y = Math.max(order[k].y, order[k - 1].y + LABEL_GAP);
  const overflow = order.length ? order[order.length - 1].y - max : 0;
  if (overflow > 0) for (const o of order) o.y -= overflow;
  for (let k = 0; k < order.length; k++) order[k].y = Math.max(order[k].y, k === 0 ? min : order[k - 1].y + LABEL_GAP);
  const out = [...ys];
  for (const o of order) out[o.i] = o.y;
  return out;
}

export function TrendsChart({ prs, contributors, measure, group, interval, chartStyle, scale, onDrillDown }: Props) {
  const data = useMemo(
    () => buildTrendData(prs, measure, group, interval, Date.now(), contributors),
    [prs, measure, group, interval, contributors],
  );
  const [picks, setPicks] = useState<SeriesPick[] | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [showAllPeriods, setShowAllPeriods] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(760);

  useEffect(() => setPicks(null), [group]);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const update = () => {
      const next = Math.floor(el.clientWidth);
      if (next > 0) setWidth(next);
    };
    update();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Colors stick to the series they were given, so adding or removing one never repaints the others.
  const activePicks = useMemo(() => {
    const present = new Set(data.series.map((s) => s.key));
    const base = picks ?? defaultTrendKeys(group, data.series).map((key, slot) => ({ key, slot }));
    return base.filter((p) => present.has(p.key));
  }, [picks, data.series, group]);
  const slotOf = new Map(activePicks.map((p) => [p.key, p.slot]));

  const toggle = (key: string) => {
    const current = activePicks;
    if (slotOf.has(key)) {
      setPicks(current.filter((p) => p.key !== key));
      return;
    }
    if (current.length >= MAX_TREND_SERIES) return;
    const used = new Set(current.map((p) => p.slot));
    let slot = 0;
    while (used.has(slot)) slot++;
    setPicks([...current, { key, slot }]);
  };

  const stacked = chartStyle === "stacked";
  // Stacks put the largest series at the bottom so the bands stay steady.
  const shown = stacked
    ? data.series.filter((s) => slotOf.has(s.key))
    : activePicks.map((p) => data.series.find((s) => s.key === p.key)).filter((s): s is NonNullable<typeof s> => !!s);
  // Shares of near-empty periods are noise (1 PR = 100%), so those points are left as gaps.
  const valueAt = (seriesIdx: number, i: number): number | null => {
    const v = shown[seriesIdx].values[i];
    if (scale === "value") return v;
    const { total, count } = data.periods[i];
    return count >= MIN_SHARE_PRS && total > 0 ? (v / total) * 100 : null;
  };

  /** Bottom and top of a series' mark at period i: its band when stacked, zero to its value otherwise. */
  const bandAt = (si: number, i: number): [number, number] | null => {
    const v = valueAt(si, i);
    if (v === null) return null;
    if (!stacked) return [0, v];
    let base = 0;
    for (let k = 0; k < si; k++) base += valueAt(k, i) ?? 0;
    return [base, base + v];
  };

  const n = data.periods.length;
  const maxVal = Math.max(0, ...shown.flatMap((_, si) => data.periods.map((__, i) => bandAt(si, i)?.[1] ?? 0)));
  const { top, ticks } = useMemo(() => {
    if (scale === "share") {
      const t = niceTicks(Math.min(100, Math.max(5, maxVal)), 4);
      return { top: Math.min(100, t.top), ticks: t.ticks.filter((v) => v <= 100) };
    }
    return niceTicks(maxVal, 4);
  }, [maxVal, scale]);

  const plotW = Math.max(160, width - AXIS_W - END_LABEL_W);
  const xOf = (i: number) => AXIS_W + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const yOf = (v: number) => TOP_PAD + PLOT_HEIGHT - (top > 0 ? (v / top) * PLOT_HEIGHT : 0);
  const fmtVal = (v: number) => (scale === "share" ? `${v < 1 && v > 0 ? "<1" : Math.round(v)}%` : fmt(Math.round(v)));
  const fmtTick = (v: number) => (scale === "share" ? `${v}%` : formatCompact(v));

  const maxLabels = Math.max(2, Math.floor(plotW / 64));
  const labelStep = Math.max(1, Math.ceil(n / maxLabels));

  // End labels sit at the line's last value, or the middle of the band when stacked.
  const labelValue = (si: number) => {
    for (let i = n - 1; i >= 0; i--) {
      const b = bandAt(si, i);
      if (b) return stacked ? (b[0] + b[1]) / 2 : b[1];
    }
    return 0;
  };
  const endYs = spreadLabels(
    shown.map((_, si) => yOf(labelValue(si))),
    TOP_PAD + 4,
    TOP_PAD + PLOT_HEIGHT,
  );

  const onMove = (e: React.MouseEvent<SVGRectElement>) => {
    if (n === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const i = n <= 1 ? 0 : Math.round((x / rect.width) * (n - 1));
    setHoverIdx(Math.max(0, Math.min(n - 1, i)));
  };

  const hovered = hoverIdx !== null ? data.periods[hoverIdx] : null;
  const tooltipW = 200;
  const tooltipLeft =
    hoverIdx === null
      ? 0
      : xOf(hoverIdx) + 12 + tooltipW <= width - 4
        ? xOf(hoverIdx) + 12
        : Math.max(4, xOf(hoverIdx) - 12 - tooltipW);
  const measureNoun = measure === "count" ? "PRs" : "lines";

  // Drill into a period, narrowed to one series when a cell is clicked.
  const drill = (periodIdx: number, s?: TrendSeries) => {
    const p = data.periods[periodIdx];
    if (!p || p.total === 0) return;
    if (s && group === "who") return onDrillDown("opened", p.filterValue, s.key as Who);
    onDrillDown("opened", p.filterValue);
    if (s) onDrillDown(GROUP_SLICE[group], s.filterValue);
  };

  if (n === 0) return null;

  const tableOrder = data.periods.map((_, i) => n - 1 - i);
  const TABLE_ROWS = 12;
  const tableRows = showAllPeriods ? tableOrder : tableOrder.slice(0, TABLE_ROWS);

  return (
    <>
    <section className="border-b border-border px-6 pt-5 pb-4" aria-label="Trends over time">
      <div className="mb-3">
        <h2 className="text-[13px] font-[590]">
          {scale === "share" ? `Share of ${measureNoun}` : measure === "count" ? "PRs opened" : "Lines changed"} by{" "}
          {TREND_GROUP_LABEL[group].toLowerCase()}, per {interval}
        </h2>
        <p className="text-xs text-muted-foreground">
          {data.periods[0].label} – {data.periods[n - 1].label}
          {data.periods[n - 1].inProgress && ` · current ${interval} so far`}
        </p>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Series">
        {data.series.map((s) => {
          const slot = slotOf.get(s.key);
          const on = slot !== undefined;
          const full = !on && activePicks.length >= MAX_TREND_SERIES;
          return (
            <button
              key={s.key}
              type="button"
              aria-pressed={on}
              disabled={full}
              title={full ? `Up to ${MAX_TREND_SERIES} series at once` : on ? `Hide ${s.label}` : `Show ${s.label}`}
              onClick={() => toggle(s.key)}
              onMouseEnter={() => on && setFocusKey(s.key)}
              onMouseLeave={() => setFocusKey(null)}
              className={cn(
                "flex cursor-default items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs transition-colors disabled:opacity-40",
                on ? "border-border bg-card text-foreground" : "border-dashed border-border text-muted-foreground hover:text-foreground",
              )}
            >
              <span
                aria-hidden="true"
                className="inline-block size-2 shrink-0 rounded-full"
                style={on ? { background: seriesColor(s, slot) } : { boxShadow: "inset 0 0 0 1px var(--muted-foreground)" }}
              />
              <span>{s.label}</span>
              <span className="text-muted-foreground tabular-nums">{formatCompact(s.total)}</span>
            </button>
          );
        })}
      </div>

      <div ref={boxRef} className="relative select-none">
        <svg
          width={width}
          height={TOP_PAD + PLOT_HEIGHT + 26}
          className="block overflow-visible"
          role="img"
          aria-label={`${stacked ? "Stacked area" : "Line"} chart of ${shown.map((s) => s.label).join(", ")} per ${interval}`}
        >
          {ticks.map((tick) => {
            const y = Math.round(yOf(tick)) + 0.5;
            return (
              <g key={tick}>
                <line
                  x1={AXIS_W}
                  x2={AXIS_W + plotW}
                  y1={y}
                  y2={y}
                  stroke="var(--border)"
                  strokeDasharray={tick === 0 ? undefined : "2 3"}
                />
                <text
                  x={AXIS_W - 8}
                  y={y + 3.5}
                  textAnchor="end"
                  fill="var(--muted-foreground)"
                  fontSize={11}
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {fmtTick(tick)}
                </text>
              </g>
            );
          })}

          {data.periods.map((p, i) =>
            i % labelStep === 0 ? (
              <text
                key={p.start}
                x={xOf(i)}
                y={TOP_PAD + PLOT_HEIGHT + 18}
                textAnchor="middle"
                fill={hoverIdx === i ? "var(--foreground)" : "var(--muted-foreground)"}
                fontSize={11}
              >
                {p.shortLabel}
              </text>
            ) : null,
          )}

          {hoverIdx !== null && (
            <line
              x1={xOf(hoverIdx)}
              x2={xOf(hoverIdx)}
              y1={TOP_PAD}
              y2={TOP_PAD + PLOT_HEIGHT}
              stroke="var(--muted-foreground)"
              strokeOpacity={0.45}
            />
          )}

          {shown.map((s, si) => {
            const color = seriesColor(s, slotOf.get(s.key));
            const bands = data.periods.map((_, i) => bandAt(si, i));
            const pts: Pt[] = bands.map((b, i) => (b ? [xOf(i), yOf(b[1])] : null));
            const bases: Pt[] = bands.map((b, i) => (b ? [xOf(i), yOf(b[0])] : null));
            const lastInProgress = n > 1 && data.periods[n - 1].inProgress;
            const topSegs = smoothSegments(pts);
            const solidEnd = lastInProgress ? topSegs.length - 1 : topSegs.length;
            const dimmed = focusKey !== null && focusKey !== s.key;
            return (
              <g key={s.key} opacity={dimmed ? 0.2 : 1}>
                <path d={areaPath(topSegs, smoothSegments(bases))} fill={color} fillOpacity={stacked ? 0.22 : 0.07} stroke="none" />
                <path d={linePath(topSegs, 0, solidEnd)} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                {lastInProgress && (
                  <path d={linePath(topSegs, solidEnd)} fill="none" stroke={color} strokeWidth={2} strokeDasharray="3 3" strokeLinecap="round" />
                )}
                {pts.map((p, i) =>
                  p && !pts[i - 1] && !pts[i + 1] ? <circle key={i} cx={p[0]} cy={p[1]} r={3} fill={color} /> : null,
                )}
                {hoverIdx !== null && pts[hoverIdx] && (
                  <circle cx={pts[hoverIdx][0]} cy={pts[hoverIdx][1]} r={4} fill={color} stroke="var(--background)" strokeWidth={2} />
                )}
                <text
                  x={AXIS_W + plotW + 8}
                  y={endYs[si] + 3.5}
                  fontSize={11}
                  fill="var(--foreground)"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  <tspan fill={color}>●</tspan> {s.label.length > 9 ? `${s.label.slice(0, 8)}…` : s.label}
                </text>
              </g>
            );
          })}

          <rect
            x={AXIS_W}
            y={TOP_PAD}
            width={plotW}
            height={PLOT_HEIGHT}
            fill="transparent"
            className="cursor-default"
            onMouseMove={onMove}
            onMouseLeave={() => setHoverIdx(null)}
            onClick={() => hovered && hovered.total > 0 && onDrillDown("opened", hovered.filterValue)}
          />
        </svg>

        {hovered && (
          <div
            role="status"
            style={{ left: tooltipLeft, top: 4, width: tooltipW }}
            className="pointer-events-none absolute z-20 rounded-lg border border-border bg-popover p-2.5 text-xs text-popover-foreground shadow-lg"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-[590]">{hovered.label}</span>
              {hovered.inProgress && <span className="shrink-0 text-[11px] text-muted-foreground">so far</span>}
            </div>
            <div className="mt-2 space-y-1 border-t border-border pt-2">
              {shown
                .map((s, si) => ({ s, si, v: valueAt(si, hoverIdx!) }))
                .sort((a, b) => (stacked ? b.si - a.si : (b.v ?? 0) - (a.v ?? 0)))
                .map(({ s, v }) => (
                  <div key={s.key} className="flex items-center justify-between gap-2 tabular-nums">
                    <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                      <span aria-hidden="true" className="inline-block size-2 shrink-0 rounded-full" style={{ background: seriesColor(s, slotOf.get(s.key)) }} />
                      <span className="truncate">{s.label}</span>
                    </span>
                    <span className="font-[510]">{v === null ? "—" : fmtVal(v)}</span>
                  </div>
                ))}
            </div>
            {scale === "share" && hovered.count < MIN_SHARE_PRS && (
              <div className="mt-1.5 text-[11px] text-muted-foreground">Too few PRs to show shares</div>
            )}
            <div className="mt-2 flex justify-between border-t border-border pt-1.5 text-[11px] text-muted-foreground tabular-nums">
              <span>All {measureNoun}</span>
              <span>{fmt(hovered.total)}</span>
            </div>
            {hovered.total > 0 && (
              <div className="mt-1 text-[11px] text-muted-foreground">Click to view this {interval}'s pull requests</div>
            )}
          </div>
        )}
      </div>
    </section>

    <section className="min-w-0 flex-1" aria-label="Trends table">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead className="sticky top-0 z-10 bg-group text-xs text-muted-foreground">
            <tr className="h-9 border-b border-border">
              <th className="px-6 text-left font-medium">{interval === "week" ? "Week" : "Month"}</th>
              {shown.map((s) => (
                <th key={s.key} className="px-3 text-right font-medium">
                  <span
                    className="inline-flex items-center gap-1.5"
                    onMouseEnter={() => setFocusKey(s.key)}
                    onMouseLeave={() => setFocusKey(null)}
                  >
                    <span aria-hidden="true" className="inline-block size-2 shrink-0 rounded-full" style={{ background: seriesColor(s, slotOf.get(s.key)) }} />
                    <span className="max-w-24 truncate">{s.label}</span>
                  </span>
                </th>
              ))}
              <th className="px-3 text-right font-medium tabular-nums">All {measureNoun}</th>
            </tr>
          </thead>
          <tbody>
            {tableRows.map((i) => {
              const p = data.periods[i];
              const clickable = p.total > 0;
              return (
                <tr
                  key={p.start}
                  onMouseEnter={() => setHoverIdx(i)}
                  onMouseLeave={() => setHoverIdx(null)}
                  className={cn("h-9 border-b border-border/60 transition-colors", hoverIdx === i && "bg-hover", !clickable && "text-muted-foreground/60")}
                >
                  <td className="px-6">
                    <button
                      type="button"
                      disabled={!clickable}
                      onClick={() => drill(i)}
                      className="flex cursor-default items-center gap-2 text-left font-[450] hover:text-foreground disabled:pointer-events-none"
                    >
                      <span className="truncate">{p.label}</span>
                      {p.inProgress && <span className="text-[11px] text-muted-foreground">so far</span>}
                    </button>
                  </td>
                  {shown.map((s, si) => {
                    const raw = s.values[i];
                    const v = valueAt(si, i);
                    return (
                      <td key={s.key} className="px-3 text-right tabular-nums">
                        {raw > 0 && v !== null ? (
                          <button
                            type="button"
                            onClick={() => drill(i, s)}
                            title={`View ${s.label} pull requests from ${p.label}`}
                            className="cursor-default rounded px-1.5 py-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                          >
                            {scale === "share" ? fmtVal(v) : fmt(v)}
                          </button>
                        ) : (
                          <span className="px-1.5 text-muted-foreground/35">{v === null ? "—" : "0"}</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-3 text-right font-[510] tabular-nums">{fmt(p.total)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {n > TABLE_ROWS && (
        <div className="flex justify-center border-b border-border/60 py-2.5">
          <Button variant="ghost" size="sm" onClick={() => setShowAllPeriods((v) => !v)}>
            {showAllPeriods ? `Show last ${TABLE_ROWS} ${interval}s` : `Show all ${n} ${interval}s`}
          </Button>
        </div>
      )}
    </section>
    </>
  );
}
