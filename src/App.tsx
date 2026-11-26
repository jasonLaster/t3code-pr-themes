import { useQuery } from "convex/react";
import { lazy, memo, Suspense, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../convex/_generated/api";
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
  hasToken,
  makeMatcher,
  parseQuery,
  removeToken,
  setOnly,
  themeSlug,
  tierOf,
  toggleToken,
  whoOf,
  type Contributors,
  type GroupBy,
  type SortBy,
  type Tier,
  type Who,
} from "./model";
import { Palette, type Command } from "./Palette";
import { useRevalidateOnView, useSyncedPrs, type Pr } from "./sync";

// The markdown stack is most of the bundle; load it when a PR is first opened.
const Description = lazy(() => import("./Description").then((m) => ({ default: m.Description })));

const REPO_URL = "https://github.com/pingdotgg/t3code";
const prUrl = (n: number) => `${REPO_URL}/pull/${n}`;
const fmt = (n: number) => n.toLocaleString();

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
    group: group && group in GROUP_LABEL ? group : "theme",
    sort: sort && sort in SORT_LABEL ? sort : "created",
    pr: Number.isFinite(pr) && pr > 0 ? pr : null,
  };
}

const VIEWS: { label: string; who?: Who; tier?: Tier; author?: string }[] = [
  { label: "All" },
  { label: "Julius", who: "julius", author: "julius" },
  { label: "Theo", who: "theo", author: "theo" },
  { label: "Maintainers", who: "maintainer", tier: "maintainer" },
  { label: "Vouched", who: "vouched", tier: "vouched" },
  { label: "Everyone else", who: "community", tier: "community" },
  { label: "Denounced", tier: "denounced" },
];

function Dot({ who }: { who: Who }) {
  return <i className="dot" style={{ background: `var(--${who})` }} title={WHO_LABEL[who]} />;
}

function TierBadge({ tier }: { tier: Tier }) {
  if (tier === "community") return null;
  return <span className={`badge ${tier}`}>{tier}</span>;
}

type RowProps = { pr: Pr; who: Who; tier: Tier; selected: boolean; showTheme: boolean; now: number; onSelect: (n: number, open: boolean) => void };

const Row = memo(function Row({ pr, who, tier, selected, showTheme, now, onSelect }: RowProps) {
  return (
    <div
      className={`pr${selected ? " sel" : ""}`}
      data-n={pr.number}
      onClick={() => onSelect(pr.number, true)}
      role="row"
      aria-selected={selected}
    >
      <Dot who={who} />
      <span className="no">#{pr.number}</span>
      <span className="title">
        {pr.draft && <span className="badge">draft</span>}
        {pr.title}
      </span>
      {showTheme && <span className="theme">{pr.theme}</span>}
      <span className="author">
        {pr.author}
        <TierBadge tier={tier} />
      </span>
      <span className="size" title={`+${pr.additions} −${pr.deletions}`}>
        +{fmt(pr.additions)} −{fmt(pr.deletions)}
      </span>
      <span className="age" title={new Date(pr.createdAt).toLocaleString()}>
        {ago(Date.parse(pr.createdAt), now)}
      </span>
    </div>
  );
});

export function App() {
  useRevalidateOnView();
  const { rows } = useSyncedPrs();
  const status = useQuery(api.prs.status);
  const contributorList = useQuery(api.prs.contributors);
  const now = useNow();

  const initial = useMemo(readUrl, []);
  const [q, setQ] = useState(initial.q);
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
  const deferredQ = useDeferredValue(q);

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
  const all = useMemo(() => (rows ? [...rows.values()] : []), [rows]);
  const asOf = status?.fetchedAt ?? now;

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
    if (group === "who") entries.sort((a, b) => WHO.map((w) => WHO_LABEL[w]).indexOf(a[0]) - WHO.map((w) => WHO_LABEL[w]).indexOf(b[0]));
    else entries.sort((a, b) => Number(a[0] === "Other") - Number(b[0] === "Other") || b[1].length - a[1].length);
    return entries;
  }, [filtered, group, contributors]);

  const visible = useMemo(() => groups.flatMap(([k, list]) => (collapsed.has(k) ? [] : list)), [groups, collapsed]);
  const paneRow = pane ? (rows?.get(pane) ?? null) : null;

  const select = (n: number | null, open = false) => {
    setSelected(n);
    if (open) setPane(n);
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
  const keys = useRef({ move, select, selected, pane, q, palette });
  keys.current = { move, select, selected, pane, q, palette };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = keys.current;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => !p);
        return;
      }
      if (k.palette || e.metaKey || e.ctrlKey || e.altKey) return;
      const typing = e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
      if (typing) {
        if (e.key === "Escape" || e.key === "ArrowDown" || e.key === "Enter") {
          (e.target as HTMLElement).blur();
          if (e.key !== "Escape") k.move(1);
        }
        return;
      }
      const actions: Record<string, () => void> = {
        "/": () => searchRef.current?.focus(),
        f: () => setPalette(true),
        j: () => k.move(1),
        ArrowDown: () => k.move(1),
        k: () => k.move(-1),
        ArrowUp: () => k.move(-1),
        Enter: () => k.selected && k.select(k.selected, true),
        o: () => k.selected && window.open(prUrl(k.selected), "_blank", "noopener"),
        i: () => setInsights((v) => !v),
        "?": () => setHelp((v) => !v),
        Escape: () => {
          if (k.pane) setPane(null);
          else if (k.q) setQ("");
          setHelp(false);
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

  const authorCounts = useMemo(() => {
    const c = new Map<string, number>();
    for (const pr of all) c.set(pr.author, (c.get(pr.author) ?? 0) + 1);
    return [...c].sort((a, b) => b[1] - a[1]);
  }, [all]);

  const commands = useMemo<Command[]>(() => {
    const filter = (section: string, key: Parameters<typeof toggleToken>[1], value: string, label: string, hint?: string): Command => ({
      id: `${key}:${value}`,
      section,
      label,
      hint,
      active: hasToken(q, key, value),
      run: () => setQ((cur) => toggleToken(cur, key, value)),
    });
    const list: Command[] = [];
    const num = Number(q.trim().replace(/^#/, ""));
    if (Number.isInteger(num) && num > 0 && rows?.has(num)) {
      list.push({ id: "go", section: "Go to", label: `#${num} ${rows.get(num)!.title}`, run: () => select(num, true) });
    }
    list.push(
      { id: "clear", section: "Commands", label: "Clear filters", run: () => setQ("") },
      { id: "insights", section: "Commands", label: insights ? "Hide insights" : "Show insights", hint: "I", run: () => setInsights((v) => !v) },
      ...(Object.keys(GROUP_LABEL) as GroupBy[]).map((g) => ({ id: `group:${g}`, section: "Group by", label: GROUP_LABEL[g], active: group === g, run: () => setGroup(g) })),
      ...(Object.keys(SORT_LABEL) as SortBy[]).map((s) => ({ id: `sort:${s}`, section: "Sort by", label: SORT_LABEL[s], active: sort === s, run: () => setSort(s) })),
      ...RANGES.map((r) => filter("Opened", "opened", r.value, r.label, `opened:${r.value}`)),
      filter("Status", "is", "draft", "Drafts only", "is:draft"),
      { id: "nodraft", section: "Status", label: "Hide drafts", hint: "-is:draft", active: parseQuery(q).tokens.some((t) => t.neg && t.key === "is" && t.value === "draft"), run: () => setQ((cur) => toggleToken(cur, "is", "draft", true)) },
      ...TIERS.map((t) => filter("Tier", "tier", t, t[0].toUpperCase() + t.slice(1), `tier:${t}`)),
      ...THEMES.map((t) => filter("Theme", "theme", t.slug, t.name, `theme:${t.slug}`)),
      ...["feat", "fix", "perf", "refactor", "docs", "test", "chore"].map((k) => filter("Type", "type", k, k, `type:${k}`)),
      ...authorCounts.map(([a, n]) =>
        filter("Author", "author", Object.entries(ALIASES).find(([, l]) => l === a.toLowerCase())?.[0] ?? a, a, `${n} open · ${tierOf(a, contributors)}`),
      ),
    );
    return list;
  }, [q, rows, insights, group, sort, authorCounts, contributors]);

  const { tokens } = parseQuery(q);
  const activeView = VIEWS.find((v) => {
    const people = tokens.filter((t) => t.key === "author" || t.key === "tier");
    if (!v.author && !v.tier) return people.length === 0;
    return people.length === 1 && !people[0].neg && people[0].value === (v.author ?? v.tier);
  });
  const viewCount = (v: (typeof VIEWS)[number]) =>
    !v.author && !v.tier
      ? all.length
      : all.filter((pr) => (v.author ? pr.author.toLowerCase() === ALIASES[v.author] : tierOf(pr.author, contributors) === v.tier)).length;

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
    return [...m].sort((a, b) => Number(a[0] === "Other") - Number(b[0] === "Other") || total(b[1]) - total(a[1])).map(([theme, r]) => ({ theme, r, total: total(r) }));
  }, [filtered, contributors]);
  const maxBar = Math.max(1, ...themeBars.map((b) => b.total));

  const loading = rows === null || (rows.size === 0 && !status?.fetchedAt);

  return (
    <div className={`app${pane ? " with-pane" : ""}`}>
      <header className="top">
        <div className="brand">
          <b>Open PRs</b> <span className="muted">pingdotgg/t3code</span>
        </div>
        <span className="sync" title={status?.lastError ?? undefined}>
          <i className={`live${status?.lastError ? " err" : ""}`} />
          {status?.lastError ? "Refresh failed" : status?.fetchedAt ? (ago(status.fetchedAt, now) === "now" ? "Synced just now" : `Synced ${ago(status.fetchedAt, now)} ago`) : "Syncing…"}
        </span>
        <button className="cmdk" onClick={() => setPalette(true)}>
          Commands <kbd>⌘K</kbd>
        </button>
      </header>

      <nav className="views" aria-label="Views">
        {VIEWS.map((v) => (
          <button
            key={v.label}
            aria-pressed={activeView === v}
            onClick={() =>
              setQ((cur) =>
                setOnly(cur, ["author", "tier"], v.author ? { neg: false, key: "author", value: v.author } : v.tier ? { neg: false, key: "tier", value: v.tier } : undefined),
              )
            }
          >
            {v.who && <Dot who={v.who} />}
            {v.label}
            <span className="n">{fmt(viewCount(v))}</span>
          </button>
        ))}
      </nav>

      <div className="filterbar">
        <div className="search">
          <input
            ref={searchRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search titles, #numbers, or filter: author:theo theme:mobile tier:vouched -is:draft"
            spellCheck={false}
          />
          <kbd>/</kbd>
        </div>
        <div className="ranges" role="group" aria-label="Opened within">
          {RANGES.map((r) => (
            <button key={r.value} aria-pressed={hasToken(q, "opened", r.value)} onClick={() => setQ((cur) => toggleToken(cur, "opened", r.value))}>
              {r.value}
            </button>
          ))}
        </div>
        <label className="display">
          Group
          <select value={group} onChange={(e) => setGroup(e.target.value as GroupBy)}>
            {(Object.keys(GROUP_LABEL) as GroupBy[]).map((g) => (
              <option key={g} value={g}>{GROUP_LABEL[g]}</option>
            ))}
          </select>
        </label>
        <label className="display">
          Sort
          <select value={sort} onChange={(e) => setSort(e.target.value as SortBy)}>
            {(Object.keys(SORT_LABEL) as SortBy[]).map((s) => (
              <option key={s} value={s}>{SORT_LABEL[s]}</option>
            ))}
          </select>
        </label>
      </div>
      {tokens.length > 0 && (
        <div className="chips">
          {tokens.map((t) => (
            <button key={`${t.neg}${t.key}${t.value}`} className="chip" onClick={() => setQ((cur) => removeToken(cur, t))} title="Remove filter">
              <span className="k">{t.neg ? "not " : ""}{t.key}</span> {t.key === "theme" ? (THEMES.find((x) => x.slug === t.value)?.name ?? t.value) : t.value} ×
            </button>
          ))}
          <button className="linkbtn" onClick={() => setQ("")}>Clear</button>
        </div>
      )}

      <div className="body">
        <main className="main" ref={listRef}>
          {insights && filtered.length > 0 && (
            <section className="insights">
              <div className="kpis">
                <div className="kpi">
                  <span className="v">{fmt(filtered.length)}</span>
                  <span className="l">open PRs</span>
                </div>
                {WHO.map((w) => (
                  <div className="kpi" key={w}>
                    <span className="v">{fmt(whoCounts[w])}</span>
                    <span className="l"><Dot who={w} />{WHO_LABEL[w]}</span>
                  </div>
                ))}
              </div>
              <div className="bars" role="table" aria-label="Open PRs by theme">
                {themeBars.map(({ theme, r, total }) => (
                  <button
                    key={theme}
                    className={`bar-row${hasToken(q, "theme", themeSlug(theme)) ? " on" : ""}`}
                    onClick={() => setQ((cur) => toggleToken(cur, "theme", themeSlug(theme)))}
                    title={`${theme}: ${WHO.filter((w) => r[w]).map((w) => `${WHO_LABEL[w]} ${r[w]}`).join(", ")}`}
                  >
                    <span className="name">{theme}</span>
                    <span className="bar">
                      {WHO.filter((w) => r[w]).map((w) => (
                        <span key={w} className="seg" style={{ flexBasis: `calc(${(r[w] / maxBar) * 100}% - 2px)`, background: `var(--${w})` }} />
                      ))}
                    </span>
                    <span className="num">{fmt(total)}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {loading ? (
            <p className="muted pad">Loading pull requests…</p>
          ) : filtered.length === 0 ? (
            <p className="muted pad">No PRs match. <button className="linkbtn" onClick={() => setQ("")}>Clear filters</button></p>
          ) : (
            groups.map(([key, list]) => (
              <section key={key} className="group">
                <button
                  className="group-head"
                  aria-expanded={!collapsed.has(key)}
                  onClick={() =>
                    setCollapsed((cur) => {
                      const next = new Set(cur);
                      if (!next.delete(key)) next.add(key);
                      return next;
                    })
                  }
                >
                  <span className="chev">›</span>
                  {group === "author" && <Dot who={whoOf(key, contributors)} />}
                  <b>{key}</b>
                  {group === "author" && <TierBadge tier={tierOf(key, contributors)} />}
                  <span className="muted">{fmt(list.length)}</span>
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
                      onSelect={select}
                    />
                  ))}
              </section>
            ))
          )}
        </main>

        {pane && (
          <aside className="pane" aria-label="Pull request">
            {paneRow ? (
              <>
                <div className="pane-head">
                  <span className="muted">#{paneRow.number}</span>
                  <a className="btn" href={prUrl(paneRow.number)} target="_blank" rel="noopener">Open on GitHub <kbd>O</kbd></a>
                  <button className="btn" onClick={() => setPane(null)} aria-label="Close">Esc</button>
                </div>
                <h2>{paneRow.title}</h2>
                <dl className="meta">
                  <dt>Author</dt>
                  <dd>
                    <button className="linkbtn" onClick={() => setQ((cur) => setOnly(cur, ["author", "tier"], { neg: false, key: "author", value: paneRow.author }))}>
                      {paneRow.author}
                    </button>{" "}
                    <TierBadge tier={tierOf(paneRow.author, contributors)} />
                    {contributors.get(paneRow.author.toLowerCase())?.reason && (
                      <div className="muted">{contributors.get(paneRow.author.toLowerCase())!.reason}</div>
                    )}
                  </dd>
                  <dt>Theme</dt>
                  <dd>
                    <button className="linkbtn" onClick={() => setQ((cur) => toggleToken(cur, "theme", themeSlug(paneRow.theme)))}>{paneRow.theme}</button>
                  </dd>
                  <dt>Opened</dt>
                  <dd>{new Date(paneRow.createdAt).toLocaleString()}</dd>
                  <dt>Updated</dt>
                  <dd>{ago(Date.parse(paneRow.updatedAt), now)} ago</dd>
                  <dt>Size</dt>
                  <dd>+{fmt(paneRow.additions)} −{fmt(paneRow.deletions)}{paneRow.draft ? " · draft" : ""}</dd>
                </dl>
                <Suspense fallback={<p className="muted">Loading description…</p>}>
                  <Description number={paneRow.number} />
                </Suspense>
              </>
            ) : (
              <p className="muted pad">PR #{pane} is not open. <button className="linkbtn" onClick={() => setPane(null)}>Close</button></p>
            )}
          </aside>
        )}
      </div>

      <footer className="hints">
        <span><kbd>J</kbd><kbd>K</kbd> move</span>
        <span><kbd>↵</kbd> open</span>
        <span><kbd>O</kbd> GitHub</span>
        <span><kbd>/</kbd> search</span>
        <span><kbd>⌘K</kbd> commands</span>
        <span><kbd>I</kbd> insights</span>
        <span><kbd>?</kbd> help</span>
      </footer>

      {help && (
        <div className="overlay" onMouseDown={() => setHelp(false)}>
          <div className="palette help" onMouseDown={(e) => e.stopPropagation()}>
            <h2>Filters</h2>
            <p>Type these in the search box. Repeat a key to match any of the values; prefix with <code>-</code> to exclude.</p>
            <ul>
              <li><code>author:theo</code>, <code>author:julius</code>, <code>author:&lt;login&gt;</code></li>
              <li><code>tier:maintainer</code> · <code>vouched</code> · <code>community</code> · <code>denounced</code> (from .github/VOUCHED.td)</li>
              <li><code>theme:{THEMES.map((t) => t.slug).join(" · ")}</code></li>
              <li><code>type:feat</code> · <code>fix</code> · <code>perf</code> …</li>
              <li><code>opened:7d</code> (h, d, w, m) · <code>is:draft</code> · <code>-is:draft</code></li>
              <li>Anything else matches the title, <code>#number</code> or author.</li>
            </ul>
            <h2>Keys</h2>
            <p><kbd>J</kbd>/<kbd>K</kbd> move · <kbd>↵</kbd> open · <kbd>O</kbd> GitHub · <kbd>/</kbd> search · <kbd>F</kbd> or <kbd>⌘K</kbd> commands · <kbd>I</kbd> insights · <kbd>Esc</kbd> close</p>
          </div>
        </div>
      )}

      {palette && <Palette commands={commands} onClose={() => setPalette(false)} />}
    </div>
  );
}
