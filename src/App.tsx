import { useQuery } from "convex/react";
import {
  ArrowUpRightIcon,
  CalendarIcon,
  CircleDashedIcon,
  CircleDotIcon,
  ListFilterIcon,
  SearchIcon,
  ShapesIcon,
  ShieldCheckIcon,
  TagIcon,
  UserIcon,
  XIcon,
} from "lucide-react";
import { lazy, memo, Suspense, useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "../convex/_generated/api";
import { PR_LABELS, PR_STATES } from "../shared/history";
import { CommandPalette } from "@/components/command-palette";
import { DisplayMenu } from "@/components/display";
import { FilterChips, FilterMenu, type Facet } from "@/components/filters";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogBackdrop, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Badge, Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";
import {
  ALIASES,
  GROUP_LABEL,
  RANGES,
  SORTERS,
  SORT_LABEL,
  THEMES,
  TIERS,
  WHO,
  WHO_LABEL,
  isActive,
  makeMatcher,
  parseQuery,
  requestedStates,
  serialize,
  setOnly,
  stateOf,
  themeSlug,
  tierOf,
  toggleToken,
  whoOf,
  type Contributors,
  type GroupBy,
  type SortBy,
  type Tier,
  type Who,
} from "@/model";
import { isHistorical, useHistory, useRevalidateOnView, useSyncedPrs, type Pr } from "@/sync";

// The markdown stack is most of the bundle; load it when a PR is first opened.
const Description = lazy(() => import("@/Description").then((m) => ({ default: m.Description })));

const prUrl = (n: number) => `https://github.com/pingdotgg/t3code/pull/${n}`;
const fmt = (n: number) => n.toLocaleString();
const STATE_LABEL = { open: "Open", merged: "Merged", closed: "Closed" } as const;
const HISTORY_ROW_PAGE = 200;
const TIER_LABEL: Record<Tier, string> = { maintainer: "Maintainer", vouched: "Vouched", community: "Unvouched", denounced: "Denounced" };
const aliasOf = (login: string) => Object.entries(ALIASES).find(([, l]) => l === login.toLowerCase())?.[0];

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

function readUrl() {
  const p = new URLSearchParams(location.search);
  const group = p.get("group") as GroupBy | null;
  const sort = p.get("sort") as SortBy | null;
  const pr = Number(p.get("pr"));
  return {
    q: p.get("q") ?? "",
    group: group && group in GROUP_LABEL ? group : ("theme" as GroupBy),
    sort: sort && sort in SORT_LABEL ? sort : ("created" as SortBy),
    pr: Number.isFinite(pr) && pr > 0 ? pr : null,
  };
}

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

function TierBadge({ tier }: { tier: Tier }) {
  if (tier === "community") return null;
  return (
    <Badge
      className={cn(
        tier === "maintainer" && "text-(--maintainer)",
        tier === "vouched" && "text-(--vouched)",
        tier === "denounced" && "border-destructive/50 text-destructive",
      )}
    >
      {TIER_LABEL[tier]}
    </Badge>
  );
}

type RowProps = { pr: Pr; who: Who; tier: Tier; selected: boolean; showTheme: boolean; now: number; onOpen: (n: number) => void };

const Row = memo(function Row({ pr, who, tier, selected, showTheme, now, onOpen }: RowProps) {
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
        {pr.draft && <CircleDashedIcon className="mr-1.5 inline size-3.5 align-[-2px] text-muted-foreground" aria-label="Draft" />}
        {pr.title}
      </span>
      {showTheme && (
        <Badge className="hidden h-[22px] max-w-44 shrink-0 gap-1.5 truncate px-2 @5xl:inline-flex">
          <TagIcon className="size-3" aria-hidden="true" />
          {pr.theme}
        </Badge>
      )}
      <span className="hidden shrink-0 @3xl:inline-flex">
        <TierBadge tier={tier} />
      </span>
      <span className="hidden w-24 shrink-0 text-right text-xs whitespace-nowrap tabular-nums @2xl:block" title={`+${pr.additions} −${pr.deletions}`}>
        <span className="text-(--maintainer)">+{fmt(pr.additions)}</span> <span className="text-destructive/80">−{fmt(pr.deletions)}</span>
      </span>
      <span className="w-8 shrink-0 text-right text-xs text-muted-foreground tabular-nums" title={new Date(pr.createdAt).toLocaleString()}>
        {ago(Date.parse(pr.createdAt), now)}
      </span>
      <span className="hidden w-32 shrink-0 items-center gap-1.5 text-xs text-muted-foreground @xl:flex" title={pr.author}>
        <Avatar login={pr.author} className="size-[18px]" />
        <span className="truncate">{pr.author}</span>
      </span>
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
  const now = useNow();

  const initial = useMemo(readUrl, []);
  const [q, setQ] = useState(initial.q);
  const [draft, setDraft] = useState(() => parseQuery(initial.q).words.join(" "));
  const [group, setGroup] = useState<GroupBy>(initial.group);
  const [sort, setSort] = useState<SortBy>(initial.sort);
  const [pane, setPane] = useState<number | null>(initial.pr);
  const [selected, setSelected] = useState<number | null>(initial.pr);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [palette, setPalette] = useState(false);
  const [insights, setInsights] = useState(true);
  const [help, setHelp] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLDivElement>(null);
  const displayRef = useRef<HTMLDivElement>(null);
  const deferredQ = useDeferredValue(q);
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
  const snapshot = useQuery(api.prHistory.snapshot, showHistory ? {} : "skip");
  const historyIncomplete = !snapshot ||
    (showMerged && merged.rows.length < snapshot.merged) ||
    (showClosed && closed.rows.length < snapshot.closed);
  const [historyLimit, setHistoryLimit] = useState(HISTORY_ROW_PAGE);
  useEffect(() => setHistoryLimit(HISTORY_ROW_PAGE), [deferredQ, group, sort]);

  useEffect(() => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (group !== "theme") p.set("group", group);
    if (sort !== "created") p.set("sort", sort);
    if (pane) p.set("pr", String(pane));
    const next = `${location.pathname}${p.size ? `?${p}` : ""}`;
    if (next !== `${location.pathname}${location.search}`) history.replaceState(null, "", next);
  }, [q, group, sort, pane]);

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
    const trailing = commitAll || /\s$/.test(text);
    const pieces = text.trim().split(/\s+/).filter(Boolean);
    const last = trailing ? undefined : pieces.pop();
    const parsed = parseQuery(pieces.join(" "));
    const pendingToken = last && /^-?\w+:/.test(last);
    setQ((cur) =>
      serialize([...parseQuery(cur).tokens, ...parsed.tokens], [...parsed.words, ...(last && !pendingToken ? [last.toLowerCase()] : [])]),
    );
    setDraft([...parsed.words, ...(last ? [last] : [])].join(" ") + (trailing && !commitAll && parsed.words.length ? " " : ""));
  };
  const clearAll = () => {
    setQ("");
    setDraft("");
  };

  const filtered = useMemo(() => {
    const match = makeMatcher(deferredQ, contributors, asOf);
    return all.filter(match).sort(SORTERS[sort]);
  }, [all, deferredQ, contributors, asOf, sort]);

  const groups = useMemo(() => {
    const keyOf: Record<GroupBy, (pr: Pr) => string> = {
      theme: (pr) => pr.theme,
      who: (pr) => WHO_LABEL[whoOf(pr.author, contributors)],
      author: (pr) => pr.author,
      none: () => "All",
    };
    const map = new Map<string, Pr[]>();
    for (const pr of filtered) {
      const k = keyOf[group](pr);
      const list = map.get(k);
      if (list) list.push(pr);
      else map.set(k, [pr]);
    }
    const entries = [...map];
    const whoOrder = WHO.map((w) => WHO_LABEL[w]);
    if (group === "who") entries.sort((a, b) => whoOrder.indexOf(a[0]) - whoOrder.indexOf(b[0]));
    else entries.sort((a, b) => Number(a[0] === "Other") - Number(b[0] === "Other") || b[1].length - a[1].length);
    return entries;
  }, [filtered, group, contributors]);

  const visibleGroups = useMemo(() => {
    if (!showHistory) return groups;
    let remaining = historyLimit;
    return groups.flatMap(([key, list]): [string, Pr[]][] => {
      if (remaining <= 0) return [];
      if (collapsed.has(key)) return [[key, list]];
      const visibleRows = list.slice(0, remaining);
      remaining -= visibleRows.length;
      return [[key, visibleRows]];
    });
  }, [groups, showHistory, historyLimit, collapsed]);
  const visible = useMemo(() => visibleGroups.flatMap(([key, list]) => collapsed.has(key) ? [] : list), [visibleGroups, collapsed]);
  const paneRow = pane ? all.find((pr) => pr.number === pane) : undefined;
  const selectedRow = selected ? all.find((pr) => pr.number === selected) ?? null : null;

  const openPr = (n: number) => {
    setSelected(n);
    setPane(n);
  };
  const move = (delta: number) => {
    if (visible.length === 0) return;
    const i = visible.findIndex((pr) => pr.number === selected);
    const next = visible[i === -1 ? (delta > 0 ? 0 : visible.length - 1) : Math.min(Math.max(i + delta, 0), visible.length - 1)];
    setSelected(next.number);
    if (pane) setPane(next.number);
    listRef.current?.querySelector(`[data-n="${next.number}"]`)?.scrollIntoView({ block: "nearest" });
  };

  // Global shortcuts read the latest render's handlers through a ref.
  const keys = useRef({ move, openPr, selected, pane, q, palette });
  keys.current = { move, openPr, selected, pane, q, palette };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = keys.current;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => !p);
        return;
      }
      // Menus and popovers handle their own Escape and arrows; don't act on keys they consumed.
      if (e.defaultPrevented || k.palette || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (target?.closest("[role=dialog],[role=listbox],[role=menu]")) return;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) {
        if (target === searchRef.current && (e.key === "Escape" || e.key === "ArrowDown")) {
          target.blur();
          if (e.key === "ArrowDown") k.move(1);
        }
        return;
      }
      const actions: Record<string, () => void> = {
        "/": () => searchRef.current?.focus(),
        f: () => filterRef.current?.querySelector("button")?.click(),
        V: () => displayRef.current?.querySelector("button")?.click(),
        j: () => k.move(1),
        ArrowDown: () => k.move(1),
        k: () => k.move(-1),
        ArrowUp: () => k.move(-1),
        Enter: () => k.selected && k.openPr(k.selected),
        " ": () => (k.pane ? setPane(null) : k.selected && k.openPr(k.selected)),
        o: () => k.selected && window.open(prUrl(k.selected), "_blank", "noopener"),
        i: () => setInsights((v) => !v),
        "?": () => setHelp((v) => !v),
        Escape: () => {
          if (k.pane) setPane(null);
          else if (k.q) clearAll();
        },
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
    const countBy = (fn: (pr: Pr) => string) => {
      const m = new Map<string, number>();
      for (const pr of all) m.set(fn(pr), (m.get(fn(pr)) ?? 0) + 1);
      return m;
    };
    const authors = [...countBy((pr) => pr.author)].sort((a, b) => b[1] - a[1]);
    const tiers = countBy((pr) => tierOf(pr.author, contributors));
    const themes = countBy((pr) => pr.theme);
    const kinds = [...countBy((pr) => pr.kind || "other")].sort((a, b) => b[1] - a[1]);
    const stateCounts = countBy(stateOf);
    const labels = new Map<string, number>();
    for (const pr of all) {
      if ("labels" in pr) for (const label of pr.labels) labels.set(label, (labels.get(label) ?? 0) + 1);
    }
    const drafts = all.filter((pr) => pr.draft).length;
    const tierWho: Record<Tier, Who> = { maintainer: "maintainer", vouched: "vouched", community: "community", denounced: "community" };
    const options: Facet[] = [
      {
        key: "state",
        label: "State",
        plural: "states",
        icon: CircleDotIcon,
        values: PR_STATES.map((state) => ({
          value: state, label: STATE_LABEL[state],
          count: state === "open" ? rows?.size : states.includes(state) && !historyLoading ? stateCounts.get(state) ?? 0 : undefined,
        })),
      },
      {
        key: "label",
        label: "Label",
        plural: "labels",
        icon: TagIcon,
        values: PR_LABELS.map((label) => ({ value: label, label, count: labels.get(label) })),
      },
      {
        key: "author",
        label: "Author",
        plural: "authors",
        icon: UserIcon,
        values: authors.map(([login, count]) => ({ value: aliasOf(login) ?? login.toLowerCase(), label: login, count, leading: <Avatar login={login} /> })),
      },
      {
        key: "tier",
        label: "Contributor",
        plural: "tiers",
        icon: ShieldCheckIcon,
        values: TIERS.map((t) => ({ value: t, label: TIER_LABEL[t], count: tiers.get(t) ?? 0, leading: <Dot who={tierWho[t]} /> })),
      },
      {
        key: "theme",
        label: "Theme",
        plural: "themes",
        icon: TagIcon,
        values: THEMES.map((t) => ({ value: t.slug, label: t.name, count: themes.get(t.name) ?? 0 })),
      },
      {
        key: "type",
        label: "Type",
        plural: "types",
        icon: ShapesIcon,
        values: kinds.map(([k, count]) => ({ value: k, label: k, count })),
      },
      {
        key: "opened",
        label: "Opened",
        plural: "ranges",
        icon: CalendarIcon,
        single: true,
        values: RANGES.map((r) => ({
          value: r.value,
          label: r.label,
          count: all.filter((pr) => Date.parse(pr.createdAt) >= asOf - Number.parseInt(r.value) * 864e5).length,
        })),
      },
      {
        key: "is",
        label: "Status",
        plural: "statuses",
        icon: CircleDashedIcon,
        values: [
          { value: "draft", label: "Draft", count: drafts },
          { value: "ready", label: "Ready for review", count: all.length - drafts },
        ],
      },
    ];
    return historyAvailable ? options : options.filter(({ key }) => key !== "state" && key !== "label");
  }, [all, contributors, asOf, states, rows, historyLoading, historyAvailable]);

  const { tokens } = parseQuery(q);
  const people = tokens.filter((t) => t.key === "author" || t.key === "tier");
  const activeView = VIEWS.find((v) =>
    !v.author && !v.tier ? people.length === 0 : people.length === 1 && !people[0].neg && people[0].value === (v.author ?? v.tier),
  );
  const viewCount = (v: (typeof VIEWS)[number]) =>
    !v.author && !v.tier ? all.length : all.filter((pr) => (v.author ? pr.author.toLowerCase() === ALIASES[v.author] : tierOf(pr.author, contributors) === v.tier)).length;

  const whoCounts = useMemo(() => {
    const c = Object.fromEntries(WHO.map((w) => [w, 0])) as Record<Who, number>;
    for (const pr of filtered) c[whoOf(pr.author, contributors)]++;
    return c;
  }, [filtered, contributors]);

  const themeBars = useMemo(() => {
    const m = new Map<string, Record<Who, number>>();
    for (const pr of filtered) {
      const row = m.get(pr.theme) ?? (Object.fromEntries(WHO.map((w) => [w, 0])) as Record<Who, number>);
      row[whoOf(pr.author, contributors)]++;
      m.set(pr.theme, row);
    }
    const total = (r: Record<Who, number>) => WHO.reduce((s, w) => s + r[w], 0);
    return [...m]
      .sort((a, b) => Number(a[0] === "Other") - Number(b[0] === "Other") || total(b[1]) - total(a[1]))
      .map(([theme, r]) => ({ theme, r, total: total(r) }));
  }, [filtered, contributors]);
  const maxBar = Math.max(1, ...themeBars.map((b) => b.total));
  const themeCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const pr of all) m.set(pr.theme, (m.get(pr.theme) ?? 0) + 1);
    return m;
  }, [all]);

  const loading = historyLoading || (historyRequested && status === undefined) ||
    rows === null || (showOpen && rows.size === 0 && !status?.fetchedAt);
  const title = historyRequested ? "Pull request history" : activeView?.label ?? "Filtered";

  return (
    <div className="flex h-dvh overflow-hidden bg-sidebar text-foreground">
      <aside className="hidden w-60 shrink-0 flex-col md:flex">
        <div className="flex h-12 items-center gap-2 px-4">
          <span className="grid size-5 place-items-center rounded-md bg-primary text-[10px] font-semibold text-primary-foreground">T3</span>
          <span className="text-[13px] font-[590]">t3code</span>
          <span className="text-[13px] text-muted-foreground">Pull requests</span>
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
        </div>
        <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4" aria-label="Views">
          <div className="space-y-px">
            <div className="px-2 pb-1 text-xs text-muted-foreground">Views</div>
            {VIEWS.map((v) => (
              <SidebarItem
                key={v.label}
                active={activeView === v}
                count={viewCount(v)}
                onClick={() =>
                  setQ((cur) => setOnly(cur, ["author", "tier"], v.author ? { neg: false, key: "author", value: v.author } : v.tier ? { neg: false, key: "tier", value: v.tier } : undefined))
                }
              >
                {v.who ? <Dot who={v.who} /> : v.tier ? <span className="size-2 rounded-full border border-destructive" /> : <span className="size-2" />}
                {v.label}
              </SidebarItem>
            ))}
          </div>
          <div className="space-y-px">
            <div className="px-2 pb-1 text-xs text-muted-foreground">Themes</div>
            {THEMES.map((t) => (
              <SidebarItem
                key={t.slug}
                active={isActive(q, "theme", t.slug) && tokens.filter((x) => x.key === "theme").length === 1}
                count={themeCounts.get(t.name) ?? 0}
                onClick={() =>
                  setQ((cur) => (isActive(cur, "theme", t.slug) ? setOnly(cur, ["theme"]) : setOnly(cur, ["theme"], { neg: false, key: "theme", value: t.slug })))
                }
              >
                <TagIcon className="size-3 text-muted-foreground" aria-hidden="true" />
                <span className="truncate">{t.name}</span>
              </SidebarItem>
            ))}
          </div>
        </nav>
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
        <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-4">
          <h1 className="truncate text-[13px] font-[510]">{title}</h1>
          <span className="text-xs text-muted-foreground tabular-nums">{loading ? "" : fmt(filtered.length)}</span>
          <div className="relative ml-auto hidden w-64 sm:block">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input
              ref={searchRef}
              value={draft}
              onChange={(e) => onSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSearch(draft, true);
              }}
              placeholder="Search, or type author:theo…"
              spellCheck={false}
              aria-label="Search pull requests"
              className="h-7 w-full rounded-md border border-border bg-secondary/60 pr-7 pl-7 text-[13px] outline-none placeholder:text-muted-foreground focus:border-ring focus:bg-background"
            />
            <Kbd className="absolute top-1/2 right-1.5 -translate-y-1/2">/</Kbd>
          </div>
          <Button variant="ghost" size="icon" className="sm:hidden" aria-label="Search" onClick={() => setPalette(true)}>
            <SearchIcon />
          </Button>
        </header>

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
            <div ref={displayRef} className="contents">
              <DisplayMenu group={group} setGroup={setGroup} sort={sort} setSort={setSort} insights={insights} setInsights={setInsights} />
            </div>
          </div>
        </div>

        <div className="flex min-h-0 flex-1">
          <main ref={listRef} className="@container min-w-0 flex-1 overflow-y-auto" aria-label="Pull requests">
            {historyUnavailable && (
              <p className="border-b border-border px-6 py-2 text-xs text-muted-foreground" role="status">
                Pull request history is unavailable on this deployment.
              </p>
            )}
            {showHistory && !loading && historyIncomplete && (
              <p className="border-b border-border px-6 py-2 text-xs text-muted-foreground">
                History backfill in progress
                {snapshot ? ` · ${fmt(merged.rows.length + closed.rows.length)} of ${fmt(
                  (showMerged ? snapshot.merged : 0) + (showClosed ? snapshot.closed : 0),
                )} PRs loaded` : ""}
              </p>
            )}
            {insights && !loading && filtered.length > 0 && (
              <section className="space-y-4 border-b border-border px-6 py-4" aria-label="Insights">
                <div className="flex flex-wrap gap-x-7 gap-y-2">
                  {WHO.map((w) => (
                    <div key={w}>
                      <div className="text-[15px] font-[590] tabular-nums">{fmt(whoCounts[w])}</div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Dot who={w} />
                        {WHO_LABEL[w]}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="grid gap-px" role="table" aria-label="Pull requests by theme">
                  {themeBars.map(({ theme, r, total }) => (
                    <button
                      key={theme}
                      onClick={() => setQ((cur) => toggleToken(cur, "theme", themeSlug(theme)))}
                      title={`${theme}: ${WHO.filter((w) => r[w]).map((w) => `${WHO_LABEL[w]} ${r[w]}`).join(", ")}`}
                      aria-pressed={isActive(q, "theme", themeSlug(theme))}
                      className="grid cursor-default grid-cols-[minmax(0,11rem)_1fr_3rem] items-center gap-3 rounded px-1 py-[3px] text-left text-xs hover:bg-hover aria-pressed:bg-selected"
                    >
                      <span className="truncate text-muted-foreground">{theme}</span>
                      <span className="flex h-2 gap-0.5">
                        {WHO.filter((w) => r[w]).map((w) => (
                          <span
                            key={w}
                            className="h-full shrink-0 first:rounded-l-sm last:rounded-r-sm"
                            style={{ flexBasis: `calc(${(r[w] / maxBar) * 100}% - 2px)`, background: `var(--${w})` }}
                          />
                        ))}
                      </span>
                      <span className="text-right text-muted-foreground tabular-nums">{fmt(total)}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {loading ? (
              <p className="p-6 text-[13px] text-muted-foreground">{historyRequested ? "Loading pull request history…" : "Loading pull requests…"}</p>
            ) : filtered.length === 0 ? (
              <div className="grid place-items-center gap-3 p-16 text-center text-[13px] text-muted-foreground">
                {!historyUnavailable && "No pull requests match these filters."}
                <Button size="sm" onClick={clearAll}>Clear filters</Button>
              </div>
            ) : (
              visibleGroups.map(([key, list]) => (
                <section key={key}>
                  <button
                    aria-expanded={!collapsed.has(key)}
                    onClick={() =>
                      setCollapsed((cur) => {
                        const next = new Set(cur);
                        if (!next.delete(key)) next.add(key);
                        return next;
                      })
                    }
                    className="group sticky top-0 z-10 flex h-9 w-full cursor-default items-center gap-2 bg-group px-6 text-left text-[13px]"
                  >
                    <span className="-ml-3 w-2 text-muted-foreground transition-transform group-aria-expanded:rotate-90">›</span>
                    {group === "author" && <Avatar login={key} />}
                    {group === "who" && <Dot who={WHO.find((w) => WHO_LABEL[w] === key) ?? "community"} />}
                    {group === "theme" && <TagIcon className="size-3.5 text-muted-foreground" aria-hidden="true" />}
                    <span className="font-[510]">{key}</span>
                    {group === "author" && <TierBadge tier={tierOf(key, contributors)} />}
                    <span className="text-muted-foreground tabular-nums">{fmt(groups.find(([name]) => name === key)?.[1].length ?? list.length)}</span>
                  </button>
                  {!collapsed.has(key) &&
                    list.map((pr) => (
                      <Row
                        key={pr.number}
                        pr={pr}
                        who={whoOf(pr.author, contributors)}
                        tier={tierOf(pr.author, contributors)}
                        selected={pr.number === selected}
                        showTheme={group !== "theme"}
                        now={now}
                        onOpen={openPr}
                      />
                    ))}
                </section>
              ))
            )}
            {showHistory && !loading && visible.length < groups.reduce((sum, [key, list]) =>
              sum + (collapsed.has(key) ? 0 : list.length), 0) && (
              <Button variant="ghost" size="sm" className="m-4" onClick={() => setHistoryLimit((limit) => limit + HISTORY_ROW_PAGE)}>
                Show more pull requests
              </Button>
            )}
          </main>

          {pane && (
            <aside
              aria-label="Pull request"
              className="fixed inset-0 z-30 overflow-y-auto bg-background px-6 pt-3 pb-10 md:static md:z-auto md:w-[min(560px,45vw)] md:shrink-0 md:border-l md:border-border"
            >
              {paneRow ? (
                <>
                  <div className="flex items-center gap-2">
                    <span className="mr-auto text-xs text-muted-foreground tabular-nums">pingdotgg/t3code#{paneRow.number}</span>
                    <a className={buttonVariants({ variant: "outline", size: "sm" })} href={prUrl(paneRow.number)} target="_blank" rel="noopener">
                      GitHub <ArrowUpRightIcon aria-hidden="true" />
                    </a>
                    <Button variant="ghost" size="icon-sm" onClick={() => setPane(null)} aria-label="Close">
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
                    <dt className="text-muted-foreground">Theme</dt>
                    <dd>
                      <button className="flex cursor-default items-center gap-1.5 hover:underline" onClick={() => setQ((cur) => toggleToken(cur, "theme", themeSlug(paneRow.theme)))}>
                        <TagIcon className="size-3.5 text-muted-foreground" aria-hidden="true" />
                        {paneRow.theme}
                      </button>
                    </dd>
                    <dt className="text-muted-foreground">Status</dt>
                    <dd>{paneRow.open ? (paneRow.draft ? "Draft" : "Ready for review") : STATE_LABEL[stateOf(paneRow)]}</dd>
                    {isHistorical(paneRow) && (
                      <>
                        <dt className="text-muted-foreground">{STATE_LABEL[paneRow.state]} on</dt>
                        <dd>{new Date(paneRow.mergedAt ?? paneRow.closedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</dd>
                        {paneRow.labels.length > 0 && (
                          <>
                            <dt className="text-muted-foreground">Labels</dt>
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
                  {paneRow.open && (
                    <Suspense fallback={<p className="text-[13px] text-muted-foreground">Loading description…</p>}>
                      <Description number={paneRow.number} />
                    </Suspense>
                  )}
                </>
              ) : (
                <p className="text-[13px] text-muted-foreground">
                  {loading ? "Loading pull request…" : `PR #${pane} is unavailable in this view.`}{" "}
                  <button className="underline" onClick={() => setPane(null)}>Close</button>
                </p>
              )}
            </aside>
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
        setGroup={setGroup}
        setSort={setSort}
        toggleInsights={() => setInsights((v) => !v)}
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
              ["I", "Toggle insights"],
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
            In search, type a filter like <code>author:theo</code>, <code>tier:vouched</code>, <code>theme:mobile</code>, <code>type:feat</code>, <code>opened:7d</code> or{" "}
            <code>is:draft</code>, then a space. {historyAvailable && <>Use <code>state:merged</code> and <code>label:codex</code> for history. </>}
            Prefix with <code>-</code> to exclude. Tiers come from <code>.github/VOUCHED.td</code> and{" "}
            <code>.github/TRIAGE_EXEMPTIONS.td</code>.
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
