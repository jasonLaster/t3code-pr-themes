import { useEffect, useMemo, useRef, useState } from "react";
import { SegmentedControl, SegmentedControlIndicator, SegmentedControlItem } from "@/components/ui/segmented-control";
import {
  MAX_TREND_SERIES,
  buildTrendData,
  defaultTrendKeys,
  formatCompact,
  niceTicks,
  type TrendGroup,
  type TrendInterval,
} from "@/insights-data";
import { cn } from "@/lib/utils";
import type { Measure, SliceBy } from "@/model";
import type { Pr } from "@/sync";

type Scale = "value" | "share";
type SeriesPick = { key: string; slot: number };

type Props = {
  prs: readonly Pr[];
  measure: Measure;
  onDrillDown: (slice: SliceBy, filterValue: string) => void;
};

const PLOT_HEIGHT = 200;
const TOP_PAD = 10;
const AXIS_W = 40;
const END_LABEL_W = 84;
const LABEL_GAP = 13;
const MIN_SHARE_PRS = 5;

const slotColor = (slot: number) => `var(--series-${slot + 1})`;
const fmt = (n: number) => n.toLocaleString();

type Pt = [x: number, y: number] | null;

function linePath(points: readonly Pt[]) {
  let d = "";
  let pen = false;
  for (const p of points) {
    if (!p) {
      pen = false;
      continue;
    }
    d += `${pen ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`;
    pen = true;
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

export function TrendsChart({ prs, measure, onDrillDown }: Props) {
  const [group, setGroup] = useState<TrendGroup>("type");
  const [interval, setIntervalUnit] = useState<TrendInterval>("week");
  const [scale, setScale] = useState<Scale>("value");
  const data = useMemo(() => buildTrendData(prs, measure, group, interval), [prs, measure, group, interval]);
  const [picks, setPicks] = useState<SeriesPick[] | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [focusKey, setFocusKey] = useState<string | null>(null);
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

  const shown = activePicks
    .map((p) => data.series.find((s) => s.key === p.key))
    .filter((s): s is NonNullable<typeof s> => !!s);
  // Shares of near-empty periods are noise (1 PR = 100%), so those points are left as gaps.
  const valueAt = (seriesIdx: number, i: number): number | null => {
    const v = shown[seriesIdx].values[i];
    if (scale === "value") return v;
    const { total, count } = data.periods[i];
    return count >= MIN_SHARE_PRS && total > 0 ? (v / total) * 100 : null;
  };

  const n = data.periods.length;
  const maxVal = Math.max(0, ...shown.flatMap((_, si) => data.periods.map((__, i) => valueAt(si, i) ?? 0)));
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

  const lastValue = (si: number) => {
    for (let i = n - 1; i >= 0; i--) {
      const v = valueAt(si, i);
      if (v !== null) return v;
    }
    return 0;
  };
  const endYs = spreadLabels(
    shown.map((_, si) => yOf(lastValue(si))),
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

  if (n === 0) return null;

  return (
    <section className="border-b border-border px-6 pt-5 pb-4" aria-label="Trends over time">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-[13px] font-[590]">Trends over time</h2>
          <p className="text-xs text-muted-foreground">
            {scale === "share" ? `Share of each ${interval}'s ${measureNoun}` : `${measure === "count" ? "PRs opened" : "Lines changed"} per ${interval}`}
            {" by "}
            {group}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl value={group} onValueChange={(v) => v && setGroup(v as TrendGroup)} aria-label="Group trends by">
            <SegmentedControlIndicator />
            <SegmentedControlItem value="type">Type</SegmentedControlItem>
            <SegmentedControlItem value="theme">Theme</SegmentedControlItem>
          </SegmentedControl>
          <SegmentedControl value={interval} onValueChange={(v) => v && setIntervalUnit(v as TrendInterval)} aria-label="Trend interval">
            <SegmentedControlIndicator />
            <SegmentedControlItem value="week">Weekly</SegmentedControlItem>
            <SegmentedControlItem value="month">Monthly</SegmentedControlItem>
          </SegmentedControl>
          <SegmentedControl value={scale} onValueChange={(v) => v && setScale(v as Scale)} aria-label="Trend scale">
            <SegmentedControlIndicator />
            <SegmentedControlItem value="value">{measure === "count" ? "Count" : "Lines"}</SegmentedControlItem>
            <SegmentedControlItem value="share">Share</SegmentedControlItem>
          </SegmentedControl>
        </div>
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
                style={on ? { background: slotColor(slot) } : { boxShadow: "inset 0 0 0 1px var(--muted-foreground)" }}
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
          aria-label={`Line chart of ${shown.map((s) => s.label).join(", ")} per ${interval}`}
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
            const color = slotColor(slotOf.get(s.key) ?? 0);
            const pts: Pt[] = data.periods.map((_, i) => {
              const v = valueAt(si, i);
              return v === null ? null : [xOf(i), yOf(v)];
            });
            const lastInProgress = n > 1 && data.periods[n - 1].inProgress;
            const solid = lastInProgress ? pts.slice(0, -1) : pts;
            const dimmed = focusKey !== null && focusKey !== s.key;
            return (
              <g key={s.key} opacity={dimmed ? 0.2 : 1}>
                <path d={linePath(solid)} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                {lastInProgress && (
                  <path d={linePath(pts.slice(-2))} fill="none" stroke={color} strokeWidth={2} strokeDasharray="3 3" strokeLinecap="round" />
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
                .sort((a, b) => (b.v ?? 0) - (a.v ?? 0))
                .map(({ s, v }) => (
                  <div key={s.key} className="flex items-center justify-between gap-2 tabular-nums">
                    <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                      <span aria-hidden="true" className="inline-block size-2 shrink-0 rounded-full" style={{ background: slotColor(slotOf.get(s.key) ?? 0) }} />
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
  );
}
