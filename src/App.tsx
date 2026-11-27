import { useQuery } from "convex/react";
import {
  ArrowUpRightIcon,
  ActivityIcon,
  BarChart3Icon,
  ChevronDownIcon,
  FileTextIcon,
  GaugeIcon,
  GitMergeIcon,
  GitPullRequestClosedIcon,
  GitPullRequestDraftIcon,
  GitPullRequestIcon,
  LayersIcon,
  ListFilterIcon,
  ListIcon,
  MegaphoneIcon,
  MessageSquareIcon,
  SearchIcon,
  ShapesIcon,
  TagIcon,
  UsersIcon,
  XIcon,
} from "lucide-react";
import { lazy, memo, Suspense, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { Account } from "@/auth";
import { SavedViewsNav, SaveViewMenu, sameState, useSavedViews, type SavedView } from "@/views";
import { assess, scoreTone } from "./assessment";
import { ChecksPanel } from "@/ChecksPanel";
import { CommandPalette } from "@/components/command-palette";
import { DisplayMenu } from "@/components/display";
import { FilterChips, FilterMenu, type Facet } from "@/components/filters";
import {
  CiBadge,
  CrBadge,
  MergeBadge,
  PrStateIcon,
  RabbitIcon,
  mergeTooltip,
  ciSummaryText,
  crSummaryText,
} from "@/components/status";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogBackdrop, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Badge, Kbd } from "@/components/ui/kbd";
import { SegmentedControl, SegmentedControlIndicator, SegmentedControlItem } from "@/components/ui/segmented-control";
import { cn } from "@/lib/utils";
import { useColumns, useResizable, type Column } from "@/lib/layout";
import { Avatar, Dot, STATE_LABEL, TierBadge, aliasOf } from "@/components/people";
import { FIELDS, filterOptions, groupOptions, groupPrs, isGroupKey, type Ctx, type Group } from "@/fields";
import {
  INSIGHTS_CHART_LABEL,
  MEASURE_LABEL,
  SEGMENT_LABEL,
  SLICE_LABEL,
  SORTERS,
  SORT_LABEL,
  THEMES,
  TREND_GROUP_LABEL,
  TREND_INTERVAL_LABEL,
  TREND_SCALE_LABEL,
  TREND_STYLE_LABEL,
  groupToSlice,
  mergeOf,
  stateOf,
  themeSlug,
  tierOf,
  whoOf,
  type Contributors,
  type InsightsChart,
  type Measure,
  type SegmentBy,
  type SliceBy,
  type SortBy,
  type Tier,
  type TrendGroup,
  type TrendInterval,
  type TrendScale,
  type TrendStyle,
  type ViewMode,
  type Who,
} from "@/model";
import type { TrendOptions } from "@/components/insights";
import {
  applyInsightDrillDown,
  applyWhoFilter,
  isActive,
  makeMatcher,
  parseQuery,
  readSearchInput,
  requestedStates,
  serialize,
  setOnly,
  toggleToken,
  type FilterKey,
  type Token,
} from "@/query";
import { PR_STATES } from "../shared/history";
import { isHistorical, useHistory, useRevalidateOnView, useSyncedPrs, type Pr } from "@/sync";

// The markdown stack and insights charts are loaded on demand to keep the initial bundle lean.
const ReviewPanel = lazy(() => import("./ReviewPanel"));
const Description = lazy(() => import("@/Description").then((m) => ({ default: m.Description })));
const Comments = lazy(() => import("@/Comments").then((m) => ({ default: m.Comments })));
const Discussion = lazy(() => import("@/Discussion").then((m) => ({ default: m.Discussion })));
type PaneTab = "description" | "review" | "comments" | "ci";
const PANE_TABS: PaneTab[] = ["description", "review", "comments", "ci"];
const PANE_TAB_KEY = "pane:tab";
const AUTH_CALLBACK_PARAMS = ["convexAuthCode", "convexAuthError"];
const InsightsView = lazy(() => import("@/components/insights").then((m) => ({ default: m.InsightsView })));

const prUrl = (n: number) => `https://github.com/pingdotgg/t3code/pull/${n}`;
const fmt = (n: number) => n.toLocaleString();
const HISTORY_ROW_PAGE = 200;

function ago(ms: number, now: number) {
  const s = Math.max(0, (now - ms) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 86400 * 60) return `${Math.floor(s / 86400)}d`;
  return `${Math.floor(s / (86400 * 30))}mo`;
}

function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30e3);
    return () => clearInterval(id);
  }, []);
  return now;
}

const DEFAULT_TREND: TrendOptions = { group: "type", interval: "week", style: "stacked", scale: "value" };
const pick = <T extends string>(value: string | null, labels: Record<T, string>, fallback: T): T =>
  value !== null && Object.hasOwn(labels, value) ? (value as T) : fallback;

function readUrl() {
  const p = new URLSearchParams(location.search);
  const group = p.get("group");
  const sort = p.get("sort") as SortBy | null;
  const view = p.get("view");
  const measure = p.get("measure") as Measure | null;
  const slice = p.get("slice") as SliceBy | null;
  const segment = p.get("segment") as SegmentBy | null;
  const chart = p.get("chart") as InsightsChart | null;
  const pr = Number(p.get("pr"));
  return {
    q: p.get("q") ?? "",
    group: group && isGroupKey(group) ? group : "theme",
    sort: sort && Object.hasOwn(SORT_LABEL, sort) ? sort : ("created" as SortBy),
    view: (view === "insights" ? "insights" : "list") as ViewMode,
    measure: measure && Object.hasOwn(MEASURE_LABEL, measure) ? measure : ("count" as Measure),
    slice: slice && Object.hasOwn(SLICE_LABEL, slice) ? slice : null,
    segment: segment && Object.hasOwn(SEGMENT_LABEL, segment) ? segment : ("who" as SegmentBy),
    chart: chart && Object.hasOwn(INSIGHTS_CHART_LABEL, chart) ? chart : ("breakdown" as InsightsChart),
    pr: Number.isFinite(pr) && pr > 0 ? pr : null,
    trend: {
      group: pick<TrendGroup>(p.get("tsegment"), TREND_GROUP_LABEL, DEFAULT_TREND.group),
      interval: pick<TrendInterval>(p.get("interval"), TREND_INTERVAL_LABEL, DEFAULT_TREND.interval),
      style: pick<TrendStyle>(p.get("style"), TREND_STYLE_LABEL, DEFAULT_TREND.style),
      scale: pick<TrendScale>(p.get("scale"), TREND_SCALE_LABEL, DEFAULT_TREND.scale),
    } satisfies TrendOptions,
  };
}

type RowProps = { pr: Pr; who: Who; tier: Tier; selected: boolean; showTheme: boolean; now: number; hidden: ReadonlySet<Column>; comments: number; onOpen: (n: number) => void };

const Row = memo(function Row({ pr, who, tier, selected, showTheme, now, hidden, comments, onOpen }: RowProps) {
  const rating = hidden.has("score") ? undefined : assess(pr);
  const show = (c: Column) => !hidden.has(c);
  return (
    <div
      data-n={pr.number}
      data-selected={selected || undefined}
      onClick={() => onOpen(pr.number)}
      className="flex h-9 cursor-default items-center gap-3 px-6 text-[13px] [contain-intrinsic-size:auto_36px] [content-visibility:auto] hover:bg-hover data-selected:bg-selected"
    >
      <Dot who={who} />
      <span className="w-[52px] shrink-0 text-xs text-muted-foreground tabular-nums">#{pr.number}</span>
      <span className="min-w-0 flex-1 truncate font-[450]">
        <PrStateIcon pr={pr} className="mr-1.5 inline align-[-2px]" />
        {pr.title}
      </span>
      {comments > 0 && (
        <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground tabular-nums" title={`${comments} comment${comments === 1 ? "" : "s"} in this app`}>
          <MessageSquareIcon className="size-3.5" aria-hidden="true" />
          {comments}
        </span>
      )}
      {rating && (
        <span
          className={cn("inline-flex h-[18px] min-w-7 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums", scoreTone(rating.total))}
          title={`Review score ${rating.total}/60 · revision ${rating.head.slice(0, 7)}`}
        >
          <span className="sr-only">PR review score </span>{rating.total}
        </span>
      )}
      {showTheme && show("theme") && (
        <Badge className="hidden h-[22px] max-w-44 shrink-0 gap-1.5 truncate px-2 @5xl:inline-flex">
          <TagIcon className="size-3" aria-hidden="true" />
          {pr.theme}
        </Badge>
      )}
      {show("tier") && (
        <span className="hidden shrink-0 @4xl:inline-flex">
          <TierBadge tier={tier} />
        </span>
      )}
      <span className="hidden shrink-0 items-center justify-end gap-1 empty:hidden @md:inline-flex">
        {show("merge") && <MergeBadge pr={pr} className="w-[78px] justify-start" />}
        {!show("checks") ? null : isHistorical(pr) ? (
          <span className="w-[106px] text-right text-xs text-muted-foreground tabular-nums" title={new Date(pr.mergedAt ?? pr.closedAt).toLocaleString()}>
            {ago(Date.parse(pr.mergedAt ?? pr.closedAt), now)} ago
          </span>
        ) : (
          <>
            <CiBadge pr={pr} className="w-[52px]" />
            <CrBadge pr={pr} className="w-[50px]" />
          </>
        )}
      </span>
      {show("changes") && (
        <span className="hidden w-24 shrink-0 text-right text-xs whitespace-nowrap tabular-nums @2xl:block" title={`+${pr.additions} −${pr.deletions}`}>
          <span className="text-(--maintainer)">+{fmt(pr.additions)}</span> <span className="text-destructive/80">−{fmt(pr.deletions)}</span>
        </span>
      )}
      {show("age") && (
        <span className="w-8 shrink-0 text-right text-xs text-muted-foreground tabular-nums" title={new Date(pr.createdAt).toLocaleString()}>
          {ago(Date.parse(pr.createdAt), now)}
        </span>
      )}
      {show("author") && (
        <span className="hidden w-32 shrink-0 items-center gap-1.5 text-xs text-muted-foreground @xl:flex" title={pr.author}>
          <Avatar login={pr.author} className="size-[18px]" />
          <span className="truncate">{pr.author}</span>
        </span>
      )}
    </div>
  );
});

const VIEWS: { label: string; who?: Who; tier?: Tier; author?: string }[] = [
  { label: "All pull requests" },
  { label: "Julius", who: "julius", author: "julius" },
  { label: "Theo", who: "theo", author: "theo" },
  { label: "Maintainers", who: "maintainer", tier: "maintainer" },
  { label: "Vouched", who: "vouched", tier: "vouched" },
  { label: "Unvouched", who: "community", tier: "community" },
  { label: "Denounced", tier: "denounced" },
];

/** The query after selecting a theme: replaces theme filters, keeps everything else. */
const withTheme = (q: string, slug: string) => setOnly(q, ["theme"], { neg: false, key: "theme", value: slug });

/** The query after selecting a single-valued sidebar item: replaces that key's filters, keeps everything else. */
const withOnly = (q: string, key: FilterKey, value: string) => setOnly(q, [key], { neg: false, key, value });

const STATUS_VIEWS = [
  { value: "ready", label: "Ready for review" },
  { value: "draft", label: "Draft" },
];

type StateTab = "open" | "draft" | "merged" | "closed" | "all";
const STATE_TABS: { id: StateTab; label: string; icon: ReactNode; history?: boolean }[] = [
  { id: "open", label: "Open", icon: <GitPullRequestIcon className="size-3.5 text-(--status-pass)" aria-hidden="true" /> },
  { id: "draft", label: "Drafts", icon: <GitPullRequestDraftIcon className="size-3.5 text-muted-foreground" aria-hidden="true" /> },
  { id: "merged", label: "Merged", icon: <GitMergeIcon className="size-3.5 text-(--status-merged)" aria-hidden="true" />, history: true },
  { id: "closed", label: "Closed", icon: <GitPullRequestClosedIcon className="size-3.5 text-(--status-fail)" aria-hidden="true" />, history: true },
  { id: "all", label: "All", icon: <LayersIcon className="size-3.5 text-muted-foreground" aria-hidden="true" />, history: true },
];

/** The query after picking a state tab: swaps state and draft/ready filters, keeps everything else. */
function withStateTab(q: string, tab: StateTab) {
  const { tokens, words } = parseQuery(q);
  const kept = tokens.filter((t) => t.key !== "state" && t.key !== "draft");
  // A positive label filter implies history, so open tabs need an explicit state.
  const needsOpen = kept.some((t) => t.key === "label" && !t.neg);
  const add = (key: FilterKey, value: string): Token => ({ neg: false, key, value });
  const extra: Token[] =
    tab === "open" ? (needsOpen ? [add("state", "open")] : [])
    : tab === "draft" ? [...(needsOpen ? [add("state", "open")] : []), add("draft", "draft")]
    : tab === "all" ? PR_STATES.map((st) => add("state", st))
    : [add("state", tab)];
  return serialize([...kept, ...extra], words);
}

function activeStateTab(q: string): StateTab | null {
  const states = requestedStates(q);
  if (states.length === PR_STATES.length) return "all";
  if (states.length !== 1) return null;
  if (states[0] === "open") return isActive(q, "draft", "draft") ? "draft" : "open";
  return states[0];
}

const SIDEBAR_COLLAPSED_KEY = "sidebar:collapsed";
function readCollapsedGroups(): Set<string> {
  try {
    const raw = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function SidebarGroup({ label, collapsed, onToggle, children }: { label: string; collapsed: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <div className="space-y-px">
      <button
        onClick={onToggle}
        aria-expanded={!collapsed}
        className="group/header flex h-6 w-full cursor-default items-center gap-1 rounded-md px-2 text-left text-xs text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
      >
        {label}
        <ChevronDownIcon
          className={cn("size-3 opacity-0 transition-transform group-hover/header:opacity-100 group-focus-visible/header:opacity-100", collapsed && "-rotate-90 opacity-100")}
          aria-hidden="true"
        />
      </button>
      {!collapsed && children}
    </div>
  );
}

function SidebarItem({ active, onClick, children, count }: { active: boolean; onClick: () => void; children: ReactNode; count: number }) {
  return (
    <button
      onClick={onClick}
      aria-current={active || undefined}
      className="flex h-7 w-full cursor-default items-center gap-2 rounded-md px-2 text-left text-[13px] font-[450] text-sidebar-foreground/85 hover:bg-sidebar-accent aria-current:bg-sidebar-accent aria-current:text-sidebar-foreground"
    >
      {children}
      <span className="ml-auto text-xs text-muted-foreground tabular-nums">{fmt(count)}</span>
    </button>
  );
}

export function App() {
  useRevalidateOnView();
  const { rows } = useSyncedPrs();
  const status = useQuery(api.prs.status);
  const contributorList = useQuery(api.prs.contributors);
  const commentCounts = useQuery(api.comments.counts);
  const savedViews = useSavedViews();
  // The saved view last opened from the sidebar, so edits to it can be saved back.
  const [viewId, setViewId] = useState<Id<"views"> | null>(null);
  const now = useNow();

  const initial = useMemo(readUrl, []);
  const [q, setQ] = useState(initial.q);
  const [draft, setDraft] = useState(() => parseQuery(initial.q).words.join(" "));
  const [group, setGroup] = useState<string>(initial.group);
  const [sort, setSort] = useState<SortBy>(initial.sort);
  const [view, setView] = useState<ViewMode>(initial.view);
  const [measure, setMeasure] = useState<Measure>(initial.measure);
  const [explicitSlice, setExplicitSlice] = useState<SliceBy | null>(initial.slice);
  const [segment, setSegment] = useState<SegmentBy>(initial.segment);
  const [chart, setChart] = useState<InsightsChart>(initial.chart);
  const [trend, setTrendState] = useState<TrendOptions>(initial.trend);
  const setTrend = useCallback((patch: Partial<TrendOptions>) => setTrendState((cur) => ({ ...cur, ...patch })), []);
  const [pane, setPane] = useState<number | null>(initial.pr);
  const [desktopPane, setDesktopPane] = useState(() => matchMedia("(min-width: 48rem)").matches);
  useEffect(() => {
    const media = matchMedia("(min-width: 48rem)");
    const change = () => setDesktopPane(media.matches);
    media.addEventListener("change", change);
    change();
    return () => media.removeEventListener("change", change);
  }, []);
  const [selected, setSelected] = useState<number | null>(initial.pr);
  const [paneTab, setPaneTab] = useState<PaneTab>(() => {
    try {
      const stored = localStorage.getItem(PANE_TAB_KEY) as PaneTab | null;
      return stored && PANE_TABS.includes(stored) ? stored : "description";
    } catch {
      return "description";
    }
  });
  const choosePaneTab = useCallback((tab: PaneTab) => {
    setPaneTab(tab);
    try {
      localStorage.setItem(PANE_TAB_KEY, tab);
    } catch {}
  }, []);
  const paneTabsRef = useRef<HTMLDivElement>(null);
  /** Switch the pane to a tab and scroll to it, or to a section inside it once rendered. */
  const jumpTo = useCallback(
    (tab: PaneTab, sectionId?: string) => {
      choosePaneTab(tab);
      let tries = 0;
      const scroll = () => {
        const el = (sectionId && document.getElementById(sectionId)) || (tries >= 20 || !sectionId ? paneTabsRef.current : null);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
        else if (tries++ < 20) setTimeout(scroll, 100);
      };
      requestAnimationFrame(scroll);
    },
    [choosePaneTab],
  );
  const { hidden: hiddenColumns, toggle: setColumn } = useColumns();
  const sidebar = useResizable("layout:sidebar", 240, 180, 400, "right");
  const paneSize = useResizable("layout:pane", 560, 360, 1100, "left");
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [palette, setPalette] = useState(false);
  const [help, setHelp] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<string>>(readCollapsedGroups);
  const toggleGroup = (label: string) =>
    setCollapsedGroups((cur) => {
      const next = new Set(cur);
      if (!next.delete(label)) next.add(label);
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, JSON.stringify([...next]));
      } catch {
        // Collapsed groups are a per-viewer convenience; ignore storage failures.
      }
      return next;
    });
  const searchRef = useRef<HTMLInputElement>(null);
  const mobileSearchRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLDivElement>(null);
  const displayRef = useRef<HTMLDivElement>(null);
  const deferredQ = useDeferredValue(q);
  const effectiveSlice = explicitSlice ?? groupToSlice(group);
  const states = useMemo(() => requestedStates(deferredQ), [deferredQ]);
  // The frontend and Convex can roll out independently.
  const historyRequested = states.includes("merged") || states.includes("closed");
  const historyAvailable = status?.historyAvailable === true;
  const historyUnavailable = historyRequested && status !== undefined && !historyAvailable;
  const showMerged = historyAvailable && states.includes("merged");
  const showClosed = historyAvailable && states.includes("closed");
  const showHistory = showMerged || showClosed;
  const showOpen = states.includes("open");
  const merged = useHistory("merged", showMerged);
  const closed = useHistory("closed", showClosed);
  const historyLoading = merged.loading || closed.loading;
  const snapshot = useQuery(api.prHistory.snapshot, historyAvailable ? {} : "skip");
  const historyIncomplete = !snapshot ||
    (showMerged && merged.rows.length < snapshot.merged) ||
    (showClosed && closed.rows.length < snapshot.closed);
  const [historyLimit, setHistoryLimit] = useState(HISTORY_ROW_PAGE);
  useEffect(() => setHistoryLimit(HISTORY_ROW_PAGE), [deferredQ, group, sort]);

  // Navigation pushes a history entry so Back/Forward work; typing in search and
  // stepping through rows with j/k only replace the current one.
  const historyMode = useRef<"push" | "replace">("replace");
  useEffect(() => {
    const onPop = () => {
      const u = readUrl();
      historyMode.current = "replace";
      setQ(u.q);
      setDraft(parseQuery(u.q).words.join(" "));
      setGroup(u.group);
      setSort(u.sort);
      setView(u.view);
      setMeasure(u.measure);
      setExplicitSlice(u.slice);
      setSegment(u.segment);
      setChart(u.chart);
      setTrendState(u.trend);
      setPane(u.pr);
      if (u.pr) setSelected(u.pr);
    };
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (group !== "theme") p.set("group", group);
    if (sort !== "created") p.set("sort", sort);
    if (view === "insights") {
      p.set("view", "insights");
      if (measure !== "count") p.set("measure", measure);
      if (explicitSlice) p.set("slice", explicitSlice);
      if (segment !== "who") p.set("segment", segment);
      if (chart !== "breakdown") p.set("chart", chart);
      if (chart === "trends") {
        if (trend.group !== DEFAULT_TREND.group) p.set("tsegment", trend.group);
        if (trend.interval !== DEFAULT_TREND.interval) p.set("interval", trend.interval);
        if (trend.style !== DEFAULT_TREND.style) p.set("style", trend.style);
        if (trend.scale !== DEFAULT_TREND.scale) p.set("scale", trend.scale);
      }
    }
    if (pane) p.set("pr", String(pane));
    // This effect runs before ConvexAuthProvider's, so keep the OAuth callback params for it to
    // redeem; it strips them itself once read.
    const current = new URLSearchParams(location.search);
    for (const key of AUTH_CALLBACK_PARAMS) {
      const value = current.get(key);
      if (value !== null) p.set(key, value);
    }
    const next = `${location.pathname}${p.size ? `?${p}` : ""}`;
    const mode = historyMode.current;
    historyMode.current = "push";
    if (next === `${location.pathname}${location.search}`) return;
    if (mode === "push") history.pushState(null, "", next);
    else history.replaceState(null, "", next);
  }, [q, group, sort, view, measure, explicitSlice, segment, chart, trend, pane]);

  const contributors: Contributors = useMemo(
    () => new Map((contributorList ?? []).map((c) => [c.login, { tier: c.tier, reason: c.reason }])),
    [contributorList],
  );
  const all = useMemo<Pr[]>(() => {
    const open = showOpen && rows ? [...rows.values()] : [];
    if (!showHistory || historyLoading || !rows) return open;
    return [...open, ...(showMerged ? merged.rows : []), ...(showClosed ? closed.rows : [])]
      .filter((pr) => pr.open || !rows.has(pr.number));
  }, [rows, showOpen, showHistory, historyLoading, showMerged, merged.rows, showClosed, closed.rows]);
  const asOf = status?.fetchedAt ?? now;

  // Typing `author:theo ` in the search box turns the finished token into a filter chip.
  const onSearch = (text: string, commitAll = false) => {
    const input = readSearchInput(text, commitAll);
    historyMode.current = "replace";
    setQ((cur) => serialize([...parseQuery(cur).tokens, ...input.tokens], input.words));
    setDraft(input.draft);
  };
  const clearAll = () => {
    setQ("");
    setDraft("");
  };

  const ctx: Ctx = useMemo(() => ({ contributors, now: asOf }), [contributors, asOf]);
  const filtered = useMemo(() => all.filter(makeMatcher(deferredQ, ctx)).sort(SORTERS[sort]), [all, deferredQ, ctx, sort]);
  const groups = useMemo(() => groupPrs(group, filtered, ctx), [filtered, group, ctx]);
  const groupId = (g: Group) => `${group}:${g.value}`;

  const visibleGroups = useMemo(() => {
    if (!showHistory) return groups;
    let remaining = historyLimit;
    const pageByState = group === "state";
    let expanded = groups.filter((g) => !collapsed.has(`${group}:${g.value}`)).length;
    return groups.flatMap((g): Group[] => {
      if (!pageByState && remaining <= 0) return [];
      if (collapsed.has(`${group}:${g.value}`)) return [g];
      // Keep every state reachable while retaining a single list page budget.
      const limit = pageByState ? Math.floor(remaining / expanded) : remaining;
      expanded--;
      const prs = g.prs.slice(0, limit);
      remaining -= prs.length;
      return [{ ...g, prs }];
    });
  }, [groups, group, showHistory, historyLimit, collapsed]);
  const visible = useMemo(
    () => visibleGroups.flatMap((g) => (collapsed.has(`${group}:${g.value}`) ? [] : g.prs)),
    [visibleGroups, group, collapsed],
  );
  const paneInLists = pane ? rows?.get(pane) ?? all.find((pr) => pr.number === pane) : undefined;
  const lookupNumber = !paneInLists && status?.historyLookupAvailable === true ? pane : null;
  const bookmarked = useQuery(api.prHistory.byNumber, lookupNumber ? { number: lookupNumber } : "skip");
  const paneRow = paneInLists ?? bookmarked ?? undefined;
  const paneLoading = pane !== null && !paneInLists &&
    (status === undefined || (lookupNumber !== null && bookmarked === undefined));
  const paneChecksAvailable = paneRow?.open && (historyAvailable || paneRow.ci !== undefined || paneRow.cr !== undefined);
  // The CI tab only exists for open PRs with checks; fall back without forgetting the stored choice.
  const activePaneTab: PaneTab = paneTab === "ci" && !paneChecksAvailable ? "description" : paneTab;
  const paneRating = paneRow ? assess(paneRow) : undefined;
  const selectedRow = selected === pane ? paneRow ?? null : all.find((pr) => pr.number === selected) ?? null;

  const openPr = (n: number) => {
    setSelected(n);
    setPane(n);
  };
  const move = (delta: number) => {
    if (visible.length === 0) return;
    const i = visible.findIndex((pr) => pr.number === selected);
    const next = visible[i === -1 ? (delta > 0 ? 0 : visible.length - 1) : Math.min(Math.max(i + delta, 0), visible.length - 1)];
    setSelected(next.number);
    if (pane) {
      historyMode.current = "replace";
      setPane(next.number);
    }
    listRef.current?.querySelector(`[data-n="${next.number}"]`)?.scrollIntoView({ block: "nearest" });
  };

  // Global shortcuts read the latest render's handlers through a ref.
  const keys = useRef({ move, openPr, selected, pane, q, palette, view, paneTab, choosePaneTab });
  keys.current = { move, openPr, selected, pane, q, palette, view, paneTab, choosePaneTab };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = keys.current;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => !p);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "i") {
        e.preventDefault();
        setView((v) => (v === "insights" ? "list" : "insights"));
        return;
      }
      // Menus and popovers handle their own Escape and arrows; don't act on keys they consumed.
      if (e.defaultPrevented || k.palette || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (target?.closest("[role=dialog],[role=listbox],[role=menu]")) return;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) {
        if (target === searchRef.current && (e.key === "Escape" || e.key === "ArrowDown")) {
          target.blur();
          if (e.key === "ArrowDown" && k.view === "list") k.move(1);
        }
        return;
      }
      const actions: Record<string, () => void> = {
        "/": () => searchRef.current?.focus(),
        f: () => filterRef.current?.querySelector("button")?.click(),
        V: () => displayRef.current?.querySelector("button")?.click(),
        i: () => setView((v) => (v === "insights" ? "list" : "insights")),
        "?": () => setHelp((v) => !v),
        Escape: () => {
          if (k.pane) setPane(null);
          else if (k.q) clearAll();
        },
        ...(k.view === "list"
          ? {
              j: () => k.move(1),
              ArrowDown: () => k.move(1),
              k: () => k.move(-1),
              ArrowUp: () => k.move(-1),
              Enter: () => k.selected && k.openPr(k.selected),
              " ": () => (k.pane ? setPane(null) : k.selected && k.openPr(k.selected)),
              o: () => k.selected && window.open(prUrl(k.selected), "_blank", "noopener"),
              c: () => {
                if (!k.selected) return;
                if (!k.pane) k.openPr(k.selected);
                k.choosePaneTab(k.pane && k.paneTab === "comments" ? "description" : "comments");
              },
            }
          : {}),
      };
      const action = actions[e.key];
      if (action) {
        e.preventDefault();
        action();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const facets = useMemo<Facet[]>(() => {
    // Like Linear, a property's counts respect every other active filter (and search words) but not
    // its own, so each number is what picking that value would show. Options come from all PRs so
    // a value never disappears from the menu just because the current filters hide it.
    const scopedMatch = (key: FilterKey) => makeMatcher(setOnly(deferredQ, [key]), ctx);
    // Open PRs are always synced, so their count is exact even while viewing merged/closed history.
    const openCount = rows ? [...rows.values()].filter(scopedMatch("state")).length : undefined;
    return FIELDS.filter((f) => f.filterValues !== false && (historyAvailable || !f.history)).map((f) => {
      let values = filterOptions(f, all, ctx, all.filter(scopedMatch(f.key))).map((o) => ({
        value: o.value,
        label: o.label,
        count: o.count,
        leading: o.leading,
      }));
      // History is only fetched once asked for, so its counts are unknown until then.
      if (f.key === "state") {
        values = values.map((v) => ({
          ...v,
          count: v.value === "open" ? openCount : states.includes(v.value as "merged" | "closed") && !historyLoading ? v.count : undefined,
        }));
      }
      return { key: f.key, label: f.label, plural: f.plural, icon: f.icon, single: f.single, formatValue: f.formatValue, validValue: f.validValue, values };
    });
  }, [all, deferredQ, ctx, states, rows, historyLoading, historyAvailable]);
  const groupChoices = useMemo(() => groupOptions(historyAvailable), [historyAvailable]);

  const { tokens } = parseQuery(q);
  const people = tokens.filter((t) => t.key === "author" || t.key === "tier");
  const activeView = VIEWS.find((v) =>
    !v.author && !v.tier ? people.length === 0 : people.length === 1 && !people[0].neg && people[0].value === (v.author ?? v.tier),
  );
  // Like Linear, each sidebar count is what you'd see after selecting that item: the other active
  // filters (and search words) still apply, only the item's own facet is swapped out.
  // PR types come from title prefixes (feat, fix, …); list the most common ones, busiest first.
  const sidebarTypes = useMemo(() => {
    const m = new Map<string, number>();
    for (const pr of all) if (pr.kind) m.set(pr.kind, (m.get(pr.kind) ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k]) => k);
  }, [all]);
  const sidebarCounts = useMemo(() => {
    const count = (query: string) => {
      const match = makeMatcher(query, ctx);
      let n = 0;
      for (const pr of all) if (match(pr)) n++;
      return n;
    };
    return {
      themes: Object.fromEntries(THEMES.map((t) => [t.slug, count(withTheme(deferredQ, t.slug))])) as Record<string, number>,
      statuses: Object.fromEntries(STATUS_VIEWS.map((st) => [st.value, count(withOnly(deferredQ, "draft", st.value))])) as Record<string, number>,
      types: Object.fromEntries(sidebarTypes.map((k) => [k, count(withOnly(deferredQ, "type", k))])) as Record<string, number>,
    };
  }, [all, deferredQ, ctx, sidebarTypes]);

  // Like the sidebar, each tab counts what picking it would show. History that isn't loaded yet
  // shows the snapshot total instead, since filtering it would mean downloading all of it.
  const stateTabCounts = useMemo(() => {
    const count = (tab: StateTab, prs: Iterable<Pr>) => {
      const match = makeMatcher(withStateTab(deferredQ, tab), ctx);
      let n = 0;
      for (const pr of prs) if (match(pr)) n++;
      return n;
    };
    const openRows = rows ? [...rows.values()] : [];
    const history = (state: "merged" | "closed", loaded: boolean, list: Pr[]) =>
      loaded && !historyLoading ? { n: count(state, list), exact: true } : snapshot ? { n: snapshot[state], exact: false } : undefined;
    const m = history("merged", showMerged, merged.rows);
    const c = history("closed", showClosed, closed.rows);
    const open = rows ? count("open", openRows) : undefined;
    return {
      open: open === undefined ? undefined : { n: open, exact: true },
      draft: rows ? { n: count("draft", openRows), exact: true } : undefined,
      merged: m,
      closed: c,
      all: open !== undefined && m && c ? { n: open + m.n + c.n, exact: m.exact && c.exact } : undefined,
    } satisfies Record<StateTab, { n: number; exact: boolean } | undefined>;
  }, [rows, deferredQ, ctx, snapshot, showMerged, showClosed, merged.rows, closed.rows, historyLoading]);
  const stateTab = activeStateTab(q);

  const drillDown = (slice: SliceBy, filterValue: string, who?: Who) => {
    setQ((cur) => applyInsightDrillDown(cur, slice, filterValue, who));
    setPane(null);
    setView("list");
    listRef.current?.scrollTo(0, 0);
  };
  const filterByWho = (who: Who) => {
    setQ((cur) => applyWhoFilter(cur, who));
    setPane(null);
    setView("list");
    listRef.current?.scrollTo(0, 0);
  };

  const loading = historyLoading || (historyRequested && status === undefined) ||
    rows === null || (showOpen && rows.size === 0 && !status?.fetchedAt);
  const allSaved: SavedView[] = useMemo(() => (savedViews ? [...savedViews.mine, ...savedViews.shared] : []), [savedViews]);
  const viewState = { q, group, sort };
  const openedView = allSaved.find((v) => v._id === viewId) ?? null;
  const activeSaved = openedView && sameState(openedView, viewState) ? openedView : (allSaved.find((v) => sameState(v, viewState)) ?? null);
  const myOpenView = openedView && !openedView.owner ? openedView : null;
  const openSaved = (v: SavedView) => {
    setViewId(v._id);
    setQ(v.q);
    setDraft(parseQuery(v.q).words.join(" "));
    setGroup(isGroupKey(v.group) ? v.group : "theme");
    setSort(Object.hasOwn(SORT_LABEL, v.sort) ? (v.sort as SortBy) : "created");
  };
  const savedCounts = useMemo(() => {
    const out = new Map<string, number>();
    for (const v of allSaved) {
      const match = makeMatcher(v.q, ctx);
      let n = 0;
      for (const pr of all) if (match(pr)) n++;
      out.set(v._id, n);
    }
    return out;
  }, [allSaved, all, ctx]);

  const title = historyRequested ? "Pull request history" : activeSaved?.name ?? activeView?.label ?? "Filtered";
  const loadingMessage = historyRequested ? "Loading pull request history…" : "Loading pull requests…";
  const historyNotice = historyUnavailable ? (
    <p className="border-b border-border px-6 py-2 text-xs text-muted-foreground" role="status">
      Pull request history is unavailable on this deployment.
    </p>
  ) : showHistory && !loading && historyIncomplete ? (
    <p className="border-b border-border px-6 py-2 text-xs text-muted-foreground">
      History backfill in progress
      {snapshot ? ` · ${fmt(merged.rows.length + closed.rows.length)} of ${fmt(
        (showMerged ? snapshot.merged : 0) + (showClosed ? snapshot.closed : 0),
      )} PRs loaded` : ""}
    </p>
  ) : null;

  const closePane = () => setPane(null);
  const renderPane = (content: ReactNode) => desktopPane ? content : (
    <Dialog open onOpenChange={(open) => { if (!open) closePane(); }}>
      <DialogContent
        className="inset-0 flex w-full translate-x-0 rounded-none border-0 bg-background"
        finalFocus={() => mobileSearchRef.current?.getClientRects().length ? mobileSearchRef.current : searchRef.current}
      >
        <DialogTitle className="sr-only">Pull request details</DialogTitle>
        {content}
      </DialogContent>
    </Dialog>
  );

  return (
    <div className="flex h-dvh overflow-hidden bg-sidebar text-foreground">
      <aside className="relative hidden shrink-0 flex-col md:flex" style={{ width: sidebar.width }}>
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          title="Drag to resize · double-click to reset"
          onPointerDown={sidebar.onPointerDown}
          onDoubleClick={sidebar.reset}
          className="absolute inset-y-0 -right-1.5 z-20 w-3 cursor-col-resize after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 after:bg-transparent hover:after:bg-ring/60"
        />
        <div className="flex h-12 items-center gap-2 px-4">
          <span className="grid size-5 place-items-center rounded-md bg-primary text-[10px] font-semibold text-primary-foreground">T3</span>
          <h1 className="min-w-0 truncate text-[13px] font-[590]">{title}</h1>
          <span className="ml-auto text-xs text-muted-foreground tabular-nums">{loading ? "" : fmt(filtered.length)}</span>
        </div>
        <div className="px-3 pb-3">
          <button
            onClick={() => setPalette(true)}
            className="flex h-7 w-full cursor-default items-center gap-2 rounded-md px-2 text-[13px] text-muted-foreground hover:bg-sidebar-accent"
          >
            <SearchIcon className="size-3.5" aria-hidden="true" />
            Search and commands
            <Kbd className="ml-auto">⌘K</Kbd>
          </button>
          <a
            href="/contributors"
            className="flex h-7 w-full cursor-default items-center gap-2 rounded-md px-2 text-[13px] text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
          >
            <UsersIcon className="size-3.5" aria-hidden="true" />
            Contributors
          </a>
          <a
            href="/marketing"
            className="flex h-7 w-full cursor-default items-center gap-2 rounded-md px-2 text-[13px] text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
          >
            <MegaphoneIcon className="size-3.5" aria-hidden="true" />
            Marketing
          </a>
        </div>
        <nav className="flex-1 space-y-4 overflow-y-auto px-3 pb-4" aria-label="Views">
          <SavedViewsNav lists={savedViews} activeId={activeSaved?._id ?? null} open={openSaved} count={(v) => savedCounts.get(v._id) ?? 0} />
          <SidebarGroup label="Status" collapsed={collapsedGroups.has("Status")} onToggle={() => toggleGroup("Status")}>
            {STATUS_VIEWS.map((st) => (
              <SidebarItem
                key={st.value}
                active={isActive(q, "draft", st.value)}
                count={sidebarCounts.statuses[st.value] ?? 0}
                onClick={() => setQ((cur) => (isActive(cur, "draft", st.value) ? toggleToken(cur, "draft", st.value) : withOnly(cur, "draft", st.value)))}
              >
                {st.value === "draft" ? (
                  <GitPullRequestDraftIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                ) : (
                  <GitPullRequestIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                )}
                <span className="truncate">{st.label}</span>
              </SidebarItem>
            ))}
          </SidebarGroup>
          <SidebarGroup label="Themes" collapsed={collapsedGroups.has("Themes")} onToggle={() => toggleGroup("Themes")}>
            {THEMES.map((t) => (
              <SidebarItem
                key={t.slug}
                active={isActive(q, "theme", t.slug) && tokens.filter((x) => x.key === "theme").length === 1}
                count={sidebarCounts.themes[t.slug] ?? 0}
                onClick={() => setQ((cur) => (isActive(cur, "theme", t.slug) ? setOnly(cur, ["theme"]) : withTheme(cur, t.slug)))}
              >
                <TagIcon className="size-3 text-muted-foreground" aria-hidden="true" />
                <span className="truncate">{t.name}</span>
              </SidebarItem>
            ))}
          </SidebarGroup>
          {sidebarTypes.length > 0 && (
            <SidebarGroup label="Types" collapsed={collapsedGroups.has("Types")} onToggle={() => toggleGroup("Types")}>
              {sidebarTypes.map((k) => (
                <SidebarItem
                  key={k}
                  active={isActive(q, "type", k) && tokens.filter((x) => x.key === "type").length === 1}
                  count={sidebarCounts.types[k] ?? 0}
                  onClick={() => setQ((cur) => (isActive(cur, "type", k) ? setOnly(cur, ["type"]) : withOnly(cur, "type", k)))}
                >
                  <ShapesIcon className="size-3 text-muted-foreground" aria-hidden="true" />
                  <span className="truncate">{k}</span>
                </SidebarItem>
              ))}
            </SidebarGroup>
          )}
        </nav>
        <div className="px-3">
          <Account />
        </div>
        <div className="flex items-center gap-2 px-5 py-3 text-xs text-muted-foreground" title={status?.lastError ?? undefined}>
          <span className={cn("size-1.5 rounded-full", status?.lastError ? "bg-destructive" : "bg-(--maintainer)")} />
          {status?.lastError
            ? "Refresh failed"
            : status?.fetchedAt
              ? ago(status.fetchedAt, now) === "now"
                ? "Synced just now"
                : `Synced ${ago(status.fetchedAt, now)} ago`
              : "Syncing…"}
          <button className="ml-auto cursor-default hover:text-foreground" onClick={() => setHelp(true)} aria-label="Keyboard shortcuts">
            <Kbd>?</Kbd>
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background md:my-2 md:mr-2 md:rounded-xl md:border md:border-border">
        <header className="flex h-11 shrink-0 items-center gap-2.5 border-b border-border px-4">
          <h1 className="min-w-0 truncate text-[13px] font-[510] md:hidden">{title}</h1>
          <div className="relative hidden w-full max-w-sm sm:block">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input
              ref={searchRef}
              value={draft}
              onChange={(e) => onSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSearch(draft, true);
              }}
              placeholder="Search, or type is:green ci:fail…"
              spellCheck={false}
              aria-label="Search pull requests"
              className="h-7 w-full rounded-md border border-border bg-secondary/60 pr-7 pl-7 text-[13px] outline-none placeholder:text-muted-foreground focus:border-ring focus:bg-background"
            />
            <Kbd className="absolute top-1/2 right-1.5 -translate-y-1/2">/</Kbd>
          </div>
          <Button ref={mobileSearchRef} variant="ghost" size="icon" className="sm:hidden" aria-label="Search" onClick={() => setPalette(true)}>
            <SearchIcon />
          </Button>
          <SegmentedControl
            aria-label="View mode"
            value={view}
            onValueChange={(v) => v && setView(v as ViewMode)}
            className="ml-auto shrink-0"
          >
            <SegmentedControlIndicator />
            <SegmentedControlItem value="list">
              <ListIcon aria-hidden="true" />
              List
            </SegmentedControlItem>
            <SegmentedControlItem value="insights">
              <BarChart3Icon aria-hidden="true" />
              Insights
            </SegmentedControlItem>
          </SegmentedControl>
        </header>

        <nav className="flex h-10 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-border px-3" aria-label="Pull request state">
          {STATE_TABS.filter((t) => !t.history || historyAvailable).map((t) => {
            const c = stateTabCounts[t.id];
            return (
              <button
                key={t.id}
                onClick={() => {
                  setQ((cur) => withStateTab(cur, t.id));
                  listRef.current?.scrollTo(0, 0);
                }}
                aria-current={stateTab === t.id || undefined}
                className="flex h-7 shrink-0 cursor-default items-center gap-1.5 rounded-md px-2.5 text-[13px] font-[450] text-muted-foreground hover:bg-hover hover:text-foreground aria-current:bg-accent aria-current:text-foreground"
              >
                {t.icon}
                {t.label}
                {c && (
                  <span className="text-xs text-muted-foreground tabular-nums" title={c.exact ? undefined : "Total in history; filters apply once this tab loads"}>
                    {fmt(c.n)}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="flex min-h-10 shrink-0 flex-wrap items-center gap-1.5 border-b border-border px-4 py-1.5">
          <FilterChips facets={facets} q={q} setQ={setQ} />
          <div ref={filterRef} className="contents">
            <FilterMenu
              facets={facets}
              q={q}
              setQ={setQ}
              label="Add filter"
              triggerClassName={cn(buttonVariants({ variant: "ghost", size: tokens.length ? "icon-sm" : "sm" }))}
              trigger={
                <>
                  <ListFilterIcon aria-hidden="true" />
                  {tokens.length ? null : "Filter"}
                </>
              }
            />
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            {tokens.length > 0 && (
              <Button variant="ghost" size="sm" onClick={clearAll}>
                Clear
              </Button>
            )}
            <SaveViewMenu state={viewState} view={myOpenView} onSaved={setViewId} />
            <div ref={displayRef} className="contents">
              <DisplayMenu view={view} setView={setView} groups={groupChoices} group={group} setGroup={setGroup} sort={sort} setSort={setSort} hiddenColumns={hiddenColumns} setColumn={setColumn} />
            </div>
          </div>
        </div>

        <div className="flex min-h-0 flex-1">
          {view === "insights" ? (
            <main className="flex min-h-0 min-w-0 flex-1 flex-col" aria-label="Insights">
              {historyNotice}
              {loading ? (
                <p className="p-6 text-[13px] text-muted-foreground">{loadingMessage}</p>
              ) : (
                <Suspense fallback={<p className="p-6 text-[13px] text-muted-foreground">Loading insights…</p>}>
                  <InsightsView
                    prs={filtered}
                    contributors={contributors}
                    measure={measure}
                    setMeasure={setMeasure}
                    slice={effectiveSlice}
                    setSlice={setExplicitSlice}
                    segment={segment}
                    setSegment={setSegment}
                    chart={chart}
                    setChart={setChart}
                    trend={trend}
                    setTrend={setTrend}
                    hasCustomParams={
                      measure !== "count" ||
                      (chart === "breakdown"
                        ? explicitSlice !== null || segment !== "who"
                        : (Object.keys(DEFAULT_TREND) as (keyof TrendOptions)[]).some((k) => trend[k] !== DEFAULT_TREND[k]))
                    }
                    onResetParams={() => {
                      setMeasure("count");
                      if (chart === "breakdown") {
                        setExplicitSlice(null);
                        setSegment("who");
                      } else {
                        setTrendState(DEFAULT_TREND);
                      }
                    }}
                    onDrillDown={drillDown}
                    onFilterWho={filterByWho}
                    onClearFilters={clearAll}
                    hasFilters={Boolean(q)}
                  />
                </Suspense>
              )}
            </main>
          ) : (
            <main ref={listRef} className="@container min-w-0 flex-1 overflow-y-auto" aria-label="Pull requests">
              {historyNotice}
              {loading ? (
                <p className="p-6 text-[13px] text-muted-foreground">{loadingMessage}</p>
              ) : filtered.length === 0 ? (
                <div className="grid place-items-center gap-3 p-16 text-center text-[13px] text-muted-foreground">
                  {!historyUnavailable && "No pull requests match these filters."}
                  <Button size="sm" onClick={clearAll}>Clear filters</Button>
                </div>
              ) : (
                visibleGroups.map((g) => {
                  const id = groupId(g);
                  const total = groups.find((x) => x.value === g.value)?.prs.length ?? g.prs.length;
                  return (
                    <section key={id}>
                      <button
                        aria-expanded={!collapsed.has(id)}
                        onClick={() =>
                          setCollapsed((cur) => {
                            const next = new Set(cur);
                            if (!next.delete(id)) next.add(id);
                            return next;
                          })
                        }
                        className="group sticky top-0 z-10 flex h-9 w-full cursor-default items-center gap-2 bg-group px-6 text-left text-[13px]"
                      >
                        <span className="-ml-3 w-2 text-muted-foreground transition-transform group-aria-expanded:rotate-90">›</span>
                        {g.leading}
                        <span className="font-[510]">{g.label}</span>
                        {g.trailing}
                        <span className="text-muted-foreground tabular-nums">{fmt(total)}</span>
                      </button>
                      {!collapsed.has(id) &&
                        g.prs.map((pr) => (
                          <Row
                            key={pr.number}
                            pr={pr}
                            who={whoOf(pr.author, contributors)}
                            tier={tierOf(pr.author, contributors)}
                            selected={pr.number === selected}
                            showTheme={group !== "theme"}
                            now={now}
                            hidden={hiddenColumns}
                            comments={commentCounts?.[pr.number] ?? 0}
                            onOpen={openPr}
                          />
                        ))}
                    </section>
                  );
                })
              )}
              {showHistory && !loading && visible.length < groups.reduce((sum, g) =>
                sum + (collapsed.has(groupId(g)) ? 0 : g.prs.length), 0) && (
                <Button variant="ghost" size="sm" className="m-4" onClick={() => setHistoryLimit((limit) => limit + HISTORY_ROW_PAGE)}>
                  Show more pull requests
                </Button>
              )}
            </main>
          )}

          {pane && renderPane(
            <div className="relative flex min-w-0 flex-1 md:w-(--pane-w) md:max-w-[calc(100%-320px)] md:flex-none" style={{ "--pane-w": `${paneSize.width}px` } as React.CSSProperties}>
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize pull request pane"
              title="Drag to resize · double-click to reset"
              onPointerDown={paneSize.onPointerDown}
              onDoubleClick={paneSize.reset}
              className="absolute inset-y-0 -left-1.5 z-20 hidden w-3 cursor-col-resize after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 hover:after:bg-ring/60 md:block"
            />
            <aside
              aria-label="Pull request"
              className="min-w-0 flex-1 overflow-y-auto bg-background px-6 pt-3 pb-10 md:border-l md:border-border"
            >
              {paneRow ? (
                <>
                  <div className="flex items-center gap-2">
                    <span className="mr-auto text-xs text-muted-foreground tabular-nums">pingdotgg/t3code#{paneRow.number}</span>
                    <a className={buttonVariants({ variant: "outline", size: "sm" })} href={prUrl(paneRow.number)} target="_blank" rel="noopener">
                      GitHub <ArrowUpRightIcon aria-hidden="true" />
                    </a>
                    <Button variant="ghost" size="icon-sm" onClick={closePane} aria-label="Close">
                      <XIcon />
                    </Button>
                  </div>
                  <h2 className="mt-5 mb-5 text-xl leading-snug font-[590]">{paneRow.title}</h2>
                  <dl className="mb-6 grid grid-cols-[96px_1fr] gap-x-3 gap-y-2.5 border-b border-border pb-6 text-[13px]">
                    <dt className="text-muted-foreground">Author</dt>
                    <dd className="flex flex-wrap items-center gap-1.5">
                      <button
                        className="flex cursor-default items-center gap-1.5 hover:underline"
                        onClick={() => setQ((cur) => setOnly(cur, ["author", "tier"], { neg: false, key: "author", value: aliasOf(paneRow.author) ?? paneRow.author.toLowerCase() }))}
                      >
                        <Avatar login={paneRow.author} className="size-[18px]" />
                        {paneRow.author}
                      </button>
                      <TierBadge tier={tierOf(paneRow.author, contributors)} />
                      {contributors.get(paneRow.author.toLowerCase())?.reason && (
                        <span className="w-full text-xs text-muted-foreground">{contributors.get(paneRow.author.toLowerCase())!.reason}</span>
                      )}
                    </dd>
                    {paneChecksAvailable && (
                      <>
                        <dt className="text-muted-foreground">CI</dt>
                        <dd className="flex items-center gap-2">
                          <button className="cursor-pointer text-left text-xs text-muted-foreground hover:text-foreground hover:underline" onClick={() => jumpTo("ci", "pane-ci")}>
                            {ciSummaryText(paneRow)}
                          </button>
                        </dd>
                        <dt className="text-muted-foreground">CodeRabbit</dt>
                        <dd className="flex items-center gap-2">
                          <button className="cursor-pointer text-left text-xs text-muted-foreground hover:text-foreground hover:underline" onClick={() => jumpTo("ci", "pane-coderabbit")}>
                            {crSummaryText(paneRow)}
                          </button>
                        </dd>
                      </>
                    )}
                    <dt className="text-muted-foreground">Theme</dt>
                    <dd>
                      <button className="flex cursor-default items-center gap-1.5 hover:underline" onClick={() => setQ((cur) => toggleToken(cur, "theme", themeSlug(paneRow.theme)))}>
                        <TagIcon className="size-3.5 text-muted-foreground" aria-hidden="true" />
                        {paneRow.theme}
                      </button>
                    </dd>
                    <dt className="text-muted-foreground">Status</dt>
                    <dd className="flex items-center gap-1.5">
                      <PrStateIcon pr={paneRow} />
                      {paneRow.open ? (paneRow.draft ? "Draft" : "Ready for review") : STATE_LABEL[stateOf(paneRow)]}
                    </dd>
                    {paneRow.open && (
                      <>
                        <dt className="text-muted-foreground">Merge</dt>
                        <dd>
                          <button
                            className="inline-flex cursor-default items-center gap-2 hover:underline"
                            onClick={() => setQ((cur) => toggleToken(cur, "merge", mergeOf(paneRow)))}
                          >
                            <MergeBadge pr={paneRow} />
                            <span className="text-xs text-muted-foreground">{mergeTooltip(paneRow)}</span>
                          </button>
                        </dd>
                      </>
                    )}
                    {isHistorical(paneRow) && (
                      <>
                        <dt className="text-muted-foreground">{STATE_LABEL[paneRow.state]} on</dt>
                        <dd>{new Date(paneRow.mergedAt ?? paneRow.closedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</dd>
                        {paneRow.labels.length > 0 && (
                          <>
                            <dt className="text-muted-foreground">{paneRow.labelSource ? "Inferred labels" : "Labels"}</dt>
                            <dd className="flex flex-wrap gap-1">
                              {paneRow.labels.map((label) => (
                                <Button key={label} variant="outline" size="sm" onClick={() => setQ((cur) => toggleToken(cur, "label", label))}>
                                  {label}
                                </Button>
                              ))}
                            </dd>
                          </>
                        )}
                      </>
                    )}
                    <dt className="text-muted-foreground">Opened</dt>
                    <dd>{new Date(paneRow.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</dd>
                    <dt className="text-muted-foreground">Updated</dt>
                    <dd>{ago(Date.parse(paneRow.updatedAt), now)} ago</dd>
                    <dt className="text-muted-foreground">Changes</dt>
                    <dd className="tabular-nums">
                      <span className="text-(--maintainer)">+{fmt(paneRow.additions)}</span> <span className="text-destructive/80">−{fmt(paneRow.deletions)}</span>
                    </dd>
                  </dl>
                  <div ref={paneTabsRef} className="scroll-mt-3">
                    <SegmentedControl
                      aria-label="Pull request content"
                      value={activePaneTab}
                      onValueChange={(v) => v && choosePaneTab(v as PaneTab)}
                      className={cn("mb-5 grid w-full", paneChecksAvailable ? "grid-cols-4" : "grid-cols-3")}
                    >
                      <SegmentedControlIndicator />
                      <SegmentedControlItem value="description">
                        <FileTextIcon aria-hidden="true" />
                        Description
                      </SegmentedControlItem>
                      <SegmentedControlItem value="review">
                        <GaugeIcon aria-hidden="true" />
                        Review
                        {paneRating && (
                          <span className={cn("rounded-full px-1.5 text-[10px] font-semibold tabular-nums", scoreTone(paneRating.total))}>{paneRating.total}</span>
                        )}
                      </SegmentedControlItem>
                      <SegmentedControlItem value="comments">
                        <MessageSquareIcon aria-hidden="true" />
                        Comments
                        <Kbd className="ml-1 hidden h-4 min-w-4 px-1 text-[10px] lg:inline-flex">C</Kbd>
                      </SegmentedControlItem>
                      {paneChecksAvailable && (
                        <SegmentedControlItem value="ci">
                          <ActivityIcon aria-hidden="true" />
                          CI
                        </SegmentedControlItem>
                      )}
                    </SegmentedControl>
                  </div>
                  <Suspense fallback={<p className="text-[13px] text-muted-foreground">Loading…</p>}>
                    {activePaneTab === "description" ? (
                      <Description number={paneRow.number} />
                    ) : activePaneTab === "review" ? (
                      <ReviewPanel pr={paneRow} />
                    ) : activePaneTab === "ci" ? (
                      <ChecksPanel pr={paneRow} />
                    ) : (
                      <>
                        <Comments key={paneRow.number} number={paneRow.number} updatedAt={paneRow.updatedAt} />
                        <Discussion pr={paneRow.number} />
                      </>
                    )}
                  </Suspense>
                </>
              ) : (
                <p className="text-[13px] text-muted-foreground">
                  {loading || paneLoading ? "Loading pull request…" : `PR #${pane} is unavailable.`}{" "}
                  <button className="underline" onClick={closePane}>Close</button>
                </p>
              )}
            </aside>
            </div>,
          )}
        </div>
      </div>

      <CommandPalette
        open={palette}
        onOpenChange={setPalette}
        prs={all}
        facets={facets}
        q={q}
        setQ={setQ}
        view={view}
        setView={setView}
        groups={groupChoices}
        setGroup={setGroup}
        setSort={setSort}
        setMeasure={setMeasure}
        setSlice={setExplicitSlice}
        selected={selectedRow}
        openPr={openPr}
      />

      <Dialog open={help} onOpenChange={setHelp}>
        <DialogBackdrop />
        <DialogContent className="max-h-[80vh] overflow-y-auto p-5 text-[13px]">
          <DialogTitle className="mb-3 text-sm font-[590]">Keyboard shortcuts and filters</DialogTitle>
          <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
            {[
              ["⌘K", "Command menu and PR search"],
              ["F", "Add a filter"],
              ["⇧V", "Display options"],
              ["/", "Search"],
              ["J / K", "Move down / up"],
              ["↵ or Space", "Open the selected PR"],
              ["O", "Open on GitHub"],
              ["C", "Show the PR's GitHub comments"],
              ["I / ⇧⌘I", "Switch between List and Insights"],
              ["Esc", "Close the PR, then clear filters"],
            ].map(([k, label]) => (
              <div key={k} className="contents">
                <Kbd className="justify-self-start">{k}</Kbd>
                <span className="text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>
          <p className="mt-4 mb-1 font-[510]">Typing filters</p>
          <p className="text-muted-foreground">
            In search, type <code>is:green</code>, <code>is:needs-work</code>, <code>ci:pass</code>, <code>ci:fail</code>,{" "}
            <code>cr:clean</code>, <code>cr:comments</code>, <code>author:theo</code>, <code>tier:vouched</code>, <code>theme:mobile</code>,{" "}
            <code>type:feat</code>, <code>size:xl</code>, <code>failing:&gt;0</code>, <code>unresolved:3-9</code>, <code>is:draft</code>,{" "}
            <code>created:7d</code> or <code>updated:&gt;30d</code>, then a space. Dates take <code>h</code>, <code>d</code>, <code>w</code>,{" "}
            <code>m</code> or <code>y</code>; a leading <code>&gt;</code> means longer ago than that. Counts take <code>5</code>,{" "}
            <code>&gt;5</code>, <code>&lt;=5</code> or <code>2-10</code>.
            {historyAvailable && <>Use <code>state:merged</code> and <code>label:codex</code> for history. </>}
            Prefix with <code>-</code> to exclude.
            Tiers come from <code>.github/VOUCHED.td</code> and <code>.github/TRIAGE_EXEMPTIONS.td</code>.
          </p>
          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <RabbitIcon className="size-3.5" />
            <span>CodeRabbit status tracks both the review check and unresolved CodeRabbit comments.</span>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
