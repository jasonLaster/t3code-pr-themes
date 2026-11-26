import { CalendarIcon, RotateCcwIcon, ShapesIcon, TagIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  MAX_AUTHOR_BARS,
  WHO_SHORT,
  buildInsightsData,
  formatCompact,
  formatPct,
  niceTicks,
  type InsightBucket,
} from "@/insights-data";
import { cn } from "@/lib/utils";
import {
  MEASURE_LABEL,
  SEGMENT_LABEL,
  SLICE_LABEL,
  WHO,
  WHO_LABEL,
  type Contributors,
  type Measure,
  type SegmentBy,
  type SliceBy,
  type Tier,
  type Who,
} from "@/model";
import type { Pr } from "@/sync";

type Props = {
  prs: readonly Pr[];
  contributors: Contributors;
  measure: Measure;
  setMeasure: (m: Measure) => void;
  slice: SliceBy;
  setSlice: (s: SliceBy) => void;
  segment: SegmentBy;
  setSegment: (s: SegmentBy) => void;
  hasCustomParams: boolean;
  onResetParams: () => void;
  onDrillDown: (slice: SliceBy, filterValue: string, who?: Who) => void;
  onFilterWho: (who: Who) => void;
  onClearFilters: () => void;
  hasFilters: boolean;
};

const fmt = (n: number) => n.toLocaleString();
const measureItems = (Object.keys(MEASURE_LABEL) as Measure[]).map((value) => ({ value, label: MEASURE_LABEL[value] }));
const sliceItems = (Object.keys(SLICE_LABEL) as SliceBy[]).map((value) => ({ value, label: SLICE_LABEL[value] }));
const segmentItems = (Object.keys(SEGMENT_LABEL) as SegmentBy[]).map((value) => ({ value, label: SEGMENT_LABEL[value] }));
const TIER_WHO: Record<Tier, Who> = { maintainer: "maintainer", vouched: "vouched", community: "community", denounced: "community" };

function Dot({ who, className }: { who: Who; className?: string }) {
  return <span aria-hidden="true" className={cn("inline-block size-2 shrink-0 rounded-full", className)} style={{ background: `var(--${who})` }} />;
}

function Avatar({ login, className }: { login: string; className?: string }) {
  return (
    <img
      alt=""
      loading="lazy"
      src={`https://avatars.githubusercontent.com/${encodeURIComponent(login)}?s=40`}
      className={cn("size-4 shrink-0 rounded-full bg-muted", className)}
    />
  );
}

function topRoundedRectPath(x: number, y: number, w: number, h: number, r: number) {
  const rad = Math.min(r, w / 2, h);
  if (rad <= 0) return `M${x},${y}h${w}v${h}h${-w}Z`;
  return `M${x},${y + rad}a${rad},${rad} 0 0 1 ${rad},${-rad}h${w - 2 * rad}a${rad},${rad} 0 0 1 ${rad},${rad}v${h - rad}h${-w}Z`;
}

function formatMetric(value: number, measure: Measure) {
  return measure === "count" ? `${fmt(value)} ${value === 1 ? "PR" : "PRs"}` : `${fmt(value)} lines`;
}

const PLOT_HEIGHT = 248;
const TOP_PAD = 12;
const LEFT_PAD = 8;

export function InsightsView({
  prs,
  contributors,
  measure,
  setMeasure,
  slice,
  setSlice,
  segment,
  setSegment,
  hasCustomParams,
  onResetParams,
  onDrillDown,
  onFilterWho,
  onClearFilters,
  hasFilters,
}: Props) {
  const data = useMemo(() => buildInsightsData(prs, contributors, measure, slice), [prs, contributors, measure, slice]);
  const [hover, setHover] = useState<{ key: string; who?: Who } | null>(null);
  const [highlightWho, setHighlightWho] = useState<Who | null>(null);
  const [showAllAuthors, setShowAllAuthors] = useState(false);
  const chartBoxRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(760);

  useEffect(() => {
    setHover(null);
    setShowAllAuthors(false);
  }, [slice, measure, segment]);

  useEffect(() => {
    const el = chartBoxRef.current;
    if (!el) return;
    const update = () => {
      const next = Math.floor(el.clientWidth);
      if (next > 0) setChartWidth(next);
    };
    update();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const segmented = segment === "who";
  const axisWidth = measure === "lines" ? 56 : 44;
  const plotWidth = Math.max(200, chartWidth - LEFT_PAD - axisWidth);
  const { top, ticks } = useMemo(() => niceTicks(data.maxBucketValue, 4), [data.maxBucketValue]);
  const chartBuckets = data.chartBuckets;
  const slotWidth = chartBuckets.length > 0 ? plotWidth / chartBuckets.length : plotWidth;
  const barWidth = Math.max(4, Math.min(34, Math.floor(slotWidth * 0.56)));

  const yOf = (v: number) => TOP_PAD + PLOT_HEIGHT - (v / top) * PLOT_HEIGHT;
  const hoveredIndex = hover ? chartBuckets.findIndex((b) => b.key === hover.key) : -1;
  const hoveredBucket: InsightBucket | null = hoveredIndex >= 0 ? chartBuckets[hoveredIndex] : null;

  const labelStep = useMemo(() => {
    if (slice === "opened") {
      const maxLabels = Math.max(2, Math.floor(plotWidth / 72));
      return Math.max(1, Math.ceil(chartBuckets.length / maxLabels));
    }
    return 1;
  }, [slice, plotWidth, chartBuckets.length]);
  const lastSteppedIdx = chartBuckets.length > 0 ? Math.floor((chartBuckets.length - 1) / labelStep) * labelStep : 0;
  const showLastLabel =
    chartBuckets.length > 1 &&
    (chartBuckets.length - 1 - lastSteppedIdx) * slotWidth >= 54;

  const tableBuckets = slice === "author" && !showAllAuthors ? data.buckets.slice(0, MAX_AUTHOR_BARS) : data.buckets;
  const showLegend = segmented && data.activeWho.length >= 2;
  const tooltipLeft = useMemo(() => {
    if (hoveredIndex < 0) return 0;
    const barCenter = LEFT_PAD + (hoveredIndex + 0.5) * slotWidth;
    const tooltipW = 228;
    const preferRight = barCenter + barWidth / 2 + 12;
    const preferLeft = barCenter - barWidth / 2 - 12 - tooltipW;
    if (preferRight + tooltipW <= chartWidth - 4) return preferRight;
    if (preferLeft >= 4) return preferLeft;
    return Math.max(4, Math.min(chartWidth - tooltipW - 4, barCenter - tooltipW / 2));
  }, [hoveredIndex, slotWidth, barWidth, chartWidth]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
      <div className="order-2 flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto lg:order-1">
        {data.totalCount === 0 ? (
          <div className="grid flex-1 place-items-center gap-3 p-16 text-center text-[13px] text-muted-foreground">
            No pull requests match these filters.
            {hasFilters && (
              <Button size="sm" onClick={onClearFilters}>
                Clear filters
              </Button>
            )}
          </div>
        ) : (
          <>
            <section className="border-b border-border px-6 pt-5 pb-4" aria-label={`${MEASURE_LABEL[measure]} by ${SLICE_LABEL[slice]}`}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
                  {showLegend ? (
                    data.activeWho.map((w) => {
                      const dimmed = highlightWho !== null && highlightWho !== w;
                      return (
                        <button
                          key={w}
                          type="button"
                          onMouseEnter={() => setHighlightWho(w)}
                          onMouseLeave={() => setHighlightWho(null)}
                          onClick={() => onFilterWho(w)}
                          title={`Filter by ${WHO_LABEL[w]}`}
                          className={cn(
                            "flex cursor-default items-center gap-1.5 rounded px-1 py-0.5 text-muted-foreground transition-opacity hover:bg-hover hover:text-foreground",
                            dimmed && "opacity-35",
                          )}
                        >
                          <Dot who={w} />
                          <span>{WHO_LABEL[w]}</span>
                          <span className="text-foreground tabular-nums">{formatCompact(data.whoTotals[w])}</span>
                        </button>
                      );
                    })
                  ) : (
                    <span className="text-muted-foreground">
                      {MEASURE_LABEL[measure]} by {SLICE_LABEL[slice].toLowerCase()}
                    </span>
                  )}
                </div>
                {data.truncatedAuthors > 0 && (
                  <span className="text-xs text-muted-foreground tabular-nums">
                    Top {chartBuckets.length} of {fmt(data.buckets.length)} authors
                  </span>
                )}
              </div>

              <div ref={chartBoxRef} className="relative select-none" onMouseLeave={() => setHover(null)}>
                <svg
                  width={chartWidth}
                  height={TOP_PAD + PLOT_HEIGHT + (slice === "author" ? 6 : 28)}
                  className="block overflow-visible"
                  role="img"
                  aria-label={`Bar chart of ${MEASURE_LABEL[measure]} sliced by ${SLICE_LABEL[slice]}`}
                >
                  {ticks.map((tick) => {
                    const y = Math.round(yOf(tick)) + 0.5;
                    return (
                      <g key={tick}>
                        <line
                          x1={LEFT_PAD}
                          x2={LEFT_PAD + plotWidth}
                          y1={y}
                          y2={y}
                          stroke="var(--border)"
                          strokeWidth={1}
                          strokeDasharray={tick === 0 ? undefined : "2 3"}
                        />
                        <text
                          x={LEFT_PAD + plotWidth + 10}
                          y={y + 3.5}
                          fill="var(--muted-foreground)"
                          fontSize={11}
                          style={{ fontVariantNumeric: "tabular-nums" }}
                        >
                          {formatCompact(tick)}
                        </text>
                      </g>
                    );
                  })}

                  {chartBuckets.map((bucket, idx) => {
                    const slotX = LEFT_PAD + idx * slotWidth;
                    const barX = slotX + (slotWidth - barWidth) / 2;
                    const isHovered = hover?.key === bucket.key;
                    const nonZeroSegments = segmented ? WHO.filter((w) => bucket.byWho[w] > 0) : [];
                    const totalH = bucket.value > 0 ? Math.max(2, (bucket.value / top) * PLOT_HEIGHT) : 0;

                    let cursorY = TOP_PAD + PLOT_HEIGHT;
                    const segmentRects = segmented
                      ? nonZeroSegments.map((w, segIdx) => {
                          const rawH = (bucket.byWho[w] / top) * PLOT_HEIGHT;
                          const h = Math.max(1.5, rawH);
                          const y = cursorY - h;
                          const gap = segIdx > 0 && h >= 3 ? 1 : 0;
                          cursorY = y;
                          return {
                            who: w,
                            y: y + (segIdx === nonZeroSegments.length - 1 ? 0 : 0),
                            h: Math.max(1, h - gap),
                            isTop: segIdx === nonZeroSegments.length - 1,
                          };
                        })
                      : [];

                    return (
                      <g
                        key={bucket.key}
                        role="button"
                        tabIndex={0}
                        aria-label={`${bucket.label}: ${formatMetric(bucket.value, measure)} (${formatPct(bucket.value, data.totalValue)}). Press Enter to filter.`}
                        className="cursor-default outline-none focus-visible:opacity-100"
                        onMouseEnter={() => setHover({ key: bucket.key })}
                        onFocus={() => setHover({ key: bucket.key })}
                        onBlur={() => setHover(null)}
                        onClick={() => bucket.count > 0 && onDrillDown(slice, bucket.filterValue)}
                        onKeyDown={(e) => {
                          if ((e.key === "Enter" || e.key === " ") && bucket.count > 0) {
                            e.preventDefault();
                            onDrillDown(slice, bucket.filterValue);
                          }
                        }}
                      >
                        <rect
                          x={slotX + 1}
                          y={TOP_PAD}
                          width={Math.max(1, slotWidth - 2)}
                          height={PLOT_HEIGHT}
                          rx={4}
                          fill={isHovered ? "var(--hover)" : "transparent"}
                        />

                        {segmented ? (
                          segmentRects.map((seg) => {
                            const dimmed = highlightWho !== null && highlightWho !== seg.who;
                            const focusedSeg = isHovered && hover?.who === seg.who;
                            return (
                              <path
                                key={seg.who}
                                d={
                                  seg.isTop
                                    ? topRoundedRectPath(barX, seg.y, barWidth, seg.h, 2)
                                    : `M${barX},${seg.y}h${barWidth}v${seg.h}h${-barWidth}Z`
                                }
                                fill={`var(--${seg.who})`}
                                opacity={dimmed ? 0.18 : hover?.who && isHovered && !focusedSeg ? 0.65 : 1}
                                onMouseEnter={(e) => {
                                  e.stopPropagation();
                                  setHover({ key: bucket.key, who: seg.who });
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDrillDown(slice, bucket.filterValue, seg.who);
                                }}
                              />
                            );
                          })
                        ) : totalH > 0 ? (
                          <path
                            d={topRoundedRectPath(barX, TOP_PAD + PLOT_HEIGHT - totalH, barWidth, totalH, 2)}
                            fill="var(--primary)"
                            opacity={hover && !isHovered ? 0.55 : 1}
                          />
                        ) : null}

                        {slice !== "author" && (idx % labelStep === 0 || (showLastLabel && idx === chartBuckets.length - 1)) && (
                          <text
                            x={slotX + slotWidth / 2}
                            y={TOP_PAD + PLOT_HEIGHT + 18}
                            textAnchor="middle"
                            fill={isHovered ? "var(--foreground)" : "var(--muted-foreground)"}
                            fontSize={11}
                          >
                            {slotWidth < 52 && bucket.shortLabel.length > 7
                              ? `${bucket.shortLabel.slice(0, 6)}…`
                              : bucket.shortLabel}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </svg>

                {slice === "author" && (
                  <div className="relative h-7" style={{ marginLeft: LEFT_PAD, width: plotWidth }}>
                    {chartBuckets.map((bucket, idx) => {
                      const isHovered = hover?.key === bucket.key;
                      return (
                        <button
                          key={bucket.key}
                          type="button"
                          onMouseEnter={() => setHover({ key: bucket.key })}
                          onClick={() => onDrillDown(slice, bucket.filterValue)}
                          aria-label={`Filter by ${bucket.label}`}
                          title={bucket.label}
                          style={{ left: `${((idx + 0.5) / chartBuckets.length) * 100}%` }}
                          className={cn(
                            "absolute top-1 -translate-x-1/2 cursor-default rounded-full p-0.5 transition-transform",
                            isHovered && "ring-2 ring-ring/70",
                          )}
                        >
                          <Avatar login={bucket.avatar ?? bucket.label} className={slotWidth >= 26 ? "size-[18px]" : "size-3.5"} />
                        </button>
                      );
                    })}
                  </div>
                )}

                {hoveredBucket && (
                  <div
                    role="status"
                    style={{ left: tooltipLeft, top: 8 }}
                    className="pointer-events-none absolute z-20 w-[228px] rounded-lg border border-border bg-popover p-2.5 text-xs text-popover-foreground shadow-lg"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-1.5 font-[590]">
                        {hoveredBucket.avatar && <Avatar login={hoveredBucket.avatar} className="size-4" />}
                        <span className="truncate">{hoveredBucket.label}</span>
                      </span>
                      <span className="shrink-0 text-muted-foreground tabular-nums">
                        {formatPct(hoveredBucket.value, data.totalValue)}
                      </span>
                    </div>
                    <div className="mt-1 flex items-baseline justify-between gap-2 tabular-nums">
                      <span className="text-[13px] font-[590]">{formatMetric(hoveredBucket.value, measure)}</span>
                      <span className="text-[11px] text-muted-foreground">
                        {measure === "count"
                          ? `${formatCompact(hoveredBucket.lines)} lines`
                          : `${fmt(hoveredBucket.count)} ${hoveredBucket.count === 1 ? "PR" : "PRs"}`}
                      </span>
                    </div>
                    {segmented && hoveredBucket.value > 0 && (
                      <div className="mt-2 space-y-1 border-t border-border pt-2">
                        {WHO.filter((w) => hoveredBucket.byWho[w] > 0).map((w) => (
                          <div
                            key={w}
                            className={cn(
                              "flex items-center justify-between gap-2 rounded px-1 py-0.5 tabular-nums",
                              hover?.who === w && "bg-accent text-accent-foreground",
                            )}
                          >
                            <span className="flex items-center gap-1.5 text-muted-foreground">
                              <Dot who={w} />
                              <span className={hover?.who === w ? "text-foreground" : undefined}>{WHO_LABEL[w]}</span>
                            </span>
                            <span className="font-[510]">
                              {fmt(hoveredBucket.byWho[w])}{" "}
                              <span className="font-normal text-muted-foreground">
                                ({formatPct(hoveredBucket.byWho[w], hoveredBucket.value)})
                              </span>
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="mt-2 border-t border-border pt-1.5 text-[11px] text-muted-foreground">
                      {hoveredBucket.count === 0
                        ? "No pull requests in this week"
                        : hover?.who
                          ? `Click to filter ${hoveredBucket.shortLabel} · ${WHO_SHORT[hover.who]}`
                          : "Click to view matching pull requests"}
                    </div>
                  </div>
                )}
              </div>
            </section>

            <section className="min-w-0 flex-1" aria-label="Insights breakdown table">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-[13px]">
                  <thead className="sticky top-0 z-10 bg-group text-xs text-muted-foreground">
                    <tr className="h-9 border-b border-border">
                      <th className="px-6 text-left font-medium">{SLICE_LABEL[slice]}</th>
                      <th className="px-3 text-right font-medium tabular-nums">{MEASURE_LABEL[measure]}</th>
                      <th className="px-3 text-right font-medium tabular-nums">Share</th>
                      {segmented &&
                        data.activeWho.map((w) => (
                          <th key={w} className="px-3 text-right font-medium">
                            <button
                              type="button"
                              onMouseEnter={() => setHighlightWho(w)}
                              onMouseLeave={() => setHighlightWho(null)}
                              onClick={() => onFilterWho(w)}
                              className="inline-flex cursor-default items-center gap-1.5 rounded px-1 py-0.5 hover:bg-hover hover:text-foreground"
                            >
                              <Dot who={w} />
                              <span>{WHO_SHORT[w]}</span>
                            </button>
                          </th>
                        ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tableBuckets.map((bucket) => {
                      const isHovered = hover?.key === bucket.key;
                      const clickable = bucket.count > 0;
                      return (
                        <tr
                          key={bucket.key}
                          onMouseEnter={() => setHover({ key: bucket.key })}
                          onMouseLeave={() => setHover(null)}
                          className={cn(
                            "h-9 border-b border-border/60 transition-colors",
                            isHovered && "bg-hover",
                            !clickable && "text-muted-foreground/60",
                          )}
                        >
                          <td className="px-6">
                            <button
                              type="button"
                              disabled={!clickable}
                              onClick={() => onDrillDown(slice, bucket.filterValue)}
                              className="flex w-full cursor-default items-center gap-2 text-left font-[450] hover:text-foreground disabled:pointer-events-none"
                            >
                              {slice === "author" && <Avatar login={bucket.avatar ?? bucket.label} className="size-[18px]" />}
                              {slice === "theme" && <TagIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />}
                              {slice === "tier" && bucket.tier && <Dot who={TIER_WHO[bucket.tier]} />}
                              {slice === "type" && <ShapesIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />}
                              {slice === "opened" && <CalendarIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />}
                              <span className="truncate">{bucket.label}</span>
                            </button>
                          </td>
                          <td className="px-3 text-right tabular-nums">
                            <button
                              type="button"
                              disabled={!clickable}
                              onClick={() => onDrillDown(slice, bucket.filterValue)}
                              className="cursor-default font-[510] hover:underline disabled:pointer-events-none"
                            >
                              {fmt(bucket.value)}
                            </button>
                          </td>
                          <td className="px-3 text-right text-xs text-muted-foreground tabular-nums">
                            {formatPct(bucket.value, data.totalValue)}
                          </td>
                          {segmented &&
                            data.activeWho.map((w) => {
                              const cellVal = bucket.byWho[w];
                              return (
                                <td key={w} className="px-3 text-right tabular-nums">
                                  {cellVal > 0 ? (
                                    <button
                                      type="button"
                                      onMouseEnter={() => setHover({ key: bucket.key, who: w })}
                                      onClick={() => onDrillDown(slice, bucket.filterValue, w)}
                                      className="cursor-default rounded px-1.5 py-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                                    >
                                      {fmt(cellVal)}
                                    </button>
                                  ) : (
                                    <span className="text-muted-foreground/35">0</span>
                                  )}
                                </td>
                              );
                            })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {slice === "author" && data.buckets.length > MAX_AUTHOR_BARS && (
                <div className="flex justify-center border-b border-border/60 py-2.5">
                  <Button variant="ghost" size="sm" onClick={() => setShowAllAuthors((v) => !v)}>
                    {showAllAuthors ? `Show top ${MAX_AUTHOR_BARS} authors` : `Show all ${fmt(data.buckets.length)} authors`}
                  </Button>
                </div>
              )}
            </section>
          </>
        )}
      </div>

      <aside
        aria-label="Insights parameters"
        className="order-1 shrink-0 border-b border-border px-5 py-4 lg:order-2 lg:w-64 lg:overflow-y-auto lg:border-b-0 lg:border-l lg:py-5"
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-baseline gap-1.5 tabular-nums">
              <span className="text-xl font-[590] tracking-tight">
                {measure === "count" ? fmt(data.totalCount) : formatCompact(data.totalLines)}
              </span>
              <span className="text-xs text-muted-foreground">{measure === "count" ? "pull requests" : "lines changed"}</span>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground tabular-nums">
              {measure === "lines" && <span>{fmt(data.totalCount)} PRs ·</span>}
              <span className="whitespace-nowrap">
                <span className="text-(--maintainer)">+{formatCompact(data.totalAdditions)}</span>{" "}
                <span className="text-destructive/80">−{formatCompact(data.totalDeletions)}</span>
                {measure === "count" && " lines"}
              </span>
            </div>
          </div>
          {hasCustomParams && (
            <Button variant="ghost" size="sm" onClick={onResetParams} title="Reset chart options">
              <RotateCcwIcon aria-hidden="true" />
              Reset
            </Button>
          )}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-1">
          <Select items={measureItems} value={measure} onValueChange={(v) => v && setMeasure(v as Measure)}>
            <div className="space-y-1">
              <SelectLabel className="block text-xs text-muted-foreground">Measure</SelectLabel>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
            </div>
            <SelectContent>
              {measureItems.map((i) => (
                <SelectItem key={i.value} value={i.value}>
                  {i.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select items={sliceItems} value={slice} onValueChange={(v) => v && setSlice(v as SliceBy)}>
            <div className="space-y-1">
              <SelectLabel className="block text-xs text-muted-foreground">Slice</SelectLabel>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
            </div>
            <SelectContent>
              {sliceItems.map((i) => (
                <SelectItem key={i.value} value={i.value}>
                  {i.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select items={segmentItems} value={segment} onValueChange={(v) => v && setSegment(v as SegmentBy)}>
            <div className="space-y-1">
              <SelectLabel className="block text-xs text-muted-foreground">Segment</SelectLabel>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
            </div>
            <SelectContent>
              {segmentItems.map((i) => (
                <SelectItem key={i.value} value={i.value}>
                  {i.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {segmented && data.totalValue > 0 && (
          <div className="mt-5 hidden border-t border-border pt-4 lg:block">
            <div className="mb-2 text-xs text-muted-foreground">Contributor mix</div>
            <div className="mb-3 flex h-1.5 gap-0.5 overflow-hidden rounded-full bg-muted">
              {data.activeWho.map((w) => (
                <span
                  key={w}
                  style={{ width: `${(data.whoTotals[w] / data.totalValue) * 100}%`, background: `var(--${w})` }}
                  className={cn("h-full transition-opacity", highlightWho && highlightWho !== w && "opacity-25")}
                />
              ))}
            </div>
            <div className="space-y-1">
              {WHO.map((w) => {
                const val = data.whoTotals[w];
                return (
                  <button
                    key={w}
                    type="button"
                    disabled={val === 0}
                    onMouseEnter={() => val > 0 && setHighlightWho(w)}
                    onMouseLeave={() => setHighlightWho(null)}
                    onClick={() => onFilterWho(w)}
                    className={cn(
                      "flex w-full cursor-default items-center gap-2 rounded px-1.5 py-1 text-left text-xs hover:bg-hover disabled:pointer-events-none disabled:opacity-40",
                      highlightWho && highlightWho !== w && "opacity-40",
                    )}
                  >
                    <Dot who={w} />
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">{WHO_LABEL[w]}</span>
                    <span className="font-[510] tabular-nums">{formatCompact(val)}</span>
                    <span className="w-8 text-right text-muted-foreground tabular-nums">{formatPct(val, data.totalValue)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
