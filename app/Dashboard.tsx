"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import type { FocusPr, Payload } from "../lib/themes";

type Group = "julius" | "theo" | "others";
type Row = { g: Group; th: string; ms: number; pr?: FocusPr };
type Counts = Record<Group, number>;

const GROUPS: Group[] = ["julius", "theo", "others"];
const NAME: Record<Group, string> = { julius: "Julius", theo: "Theo", others: "Everyone else" };
const DAY = 864e5;
const RANGES: [string, number][] = [
  ["Last day", 1],
  ["Last week", 7],
  ["Last 2 weeks", 14],
  ["Last month", 30],
  ["Last 3 months", 90],
  ["All time", 0],
];
const KINDS: [string, string][] = [
  ["all", "All types"],
  ["feat", "Features"],
  ["fix", "Fixes"],
  ["perf", "Perf"],
];

const fmt = (n: number) => n.toLocaleString();
const fmtDate = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const prUrl = (n: number) => `https://github.com/pingdotgg/t3code/pull/${n}`;
const featTitle = (t: string) => t.replace(/^\[[^\]]*\]\s*/, "").replace(/^\w+(\([^)]*\))?!?:\s*/, "");
const emptyCounts = (): Counts => ({ julius: 0, theo: 0, others: 0 });
const sum = (c: Counts) => c.julius + c.theo + c.others;
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

function Swatch({ g }: { g: Group }) {
  return <i className="sw" style={{ background: `var(--${g})` }} />;
}

function useMinuteTick() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60e3);
    return () => clearInterval(id);
  }, []);
  return now;
}

function updatedLabel(fetchedAt: number, now: number) {
  const m = Math.round((now - fetchedAt) / 60e3);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  return new Date(fetchedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function Dashboard({ payload, fetchedAt }: { payload: Payload; fetchedAt: number }) {
  const now = useMinuteTick();
  const [range, setRange] = useState(0);
  const [selTheme, setSelTheme] = useState<string | null>(null);
  const [who, setWho] = useState<"all" | "julius" | "theo">("all");
  const [kind, setKind] = useState("all");
  const [q, setQ] = useState("");
  const [showTable, setShowTable] = useState(false);
  const [tip, setTip] = useState<{ x: number; y: number; theme: string } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Ranges are measured from when the data was fetched, not from the viewer's clock.
  const asOf = fetchedAt;
  const all = useMemo<Row[]>(
    () => [
      ...payload.focus.map((pr) => ({ g: pr.g, th: pr.th, ms: Date.parse(pr.c), pr })),
      ...payload.others.map(([i, c]) => ({ g: "others" as const, th: payload.themes[i], ms: Date.parse(`${c}Z`) })),
    ],
    [payload],
  );
  const inRange = (ms: number, days = range) => !days || ms >= asOf - days * DAY;
  const rows = all.filter((r) => inRange(r.ms));

  const agg: Record<string, Counts> = Object.fromEntries(payload.themes.map((t) => [t, emptyCounts()]));
  const tot = emptyCounts();
  for (const r of rows) {
    agg[r.th][r.g]++;
    tot[r.g]++;
  }
  const focusCount = (t: string) => agg[t].julius + agg[t].theo;
  const themes = payload.themes
    .filter((t) => t !== "Other")
    .sort((a, b) => focusCount(b) - focusCount(a) || sum(agg[b]) - sum(agg[a]))
    .concat("Other");
  const max = Math.max(1, ...themes.map((t) => sum(agg[t])));
  const earliest = Math.min(...all.map((r) => r.ms));

  const query = q.toLowerCase().trim();
  const listed = rows.filter(
    (r): r is Row & { pr: FocusPr } =>
      !!r.pr &&
      (who === "all" || r.g === who) &&
      (kind === "all" || r.pr.k === kind) &&
      (!selTheme || r.th === selTheme) &&
      (!query || r.pr.t.toLowerCase().includes(query)),
  );
  const byTheme = new Map<string, (Row & { pr: FocusPr })[]>();
  for (const r of listed) byTheme.set(r.th, [...(byTheme.get(r.th) ?? []), r]);

  const pickTheme = (t: string) => {
    setSelTheme((cur) => (cur === t ? null : t));
    listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const moveTip = (e: MouseEvent, theme: string) =>
    setTip({ x: Math.min(e.clientX + 14, window.innerWidth - 220), y: e.clientY + 14, theme });

  return (
    <main>
      <h1>Open pull requests by theme</h1>
      <p className="sub">
        pingdotgg/t3code · open PRs grouped by theme from their titles. Julius and Theo are broken out. Updated{" "}
        {updatedLabel(fetchedAt, now)}, refreshed every 5 minutes.
      </p>

      <div className="filters range" role="group" aria-label="Opened within">
        <span className="muted" style={{ marginRight: 2 }}>Opened</span>
        {RANGES.map(([label, days]) => (
          <button key={days} className="chip" aria-pressed={range === days} onClick={() => setRange(days)}>
            {label}
            <span className="n">{fmt(all.filter((r) => inRange(r.ms, days)).length)}</span>
          </button>
        ))}
      </div>

      <div className="kpis">
        <div className="kpi">
          <div className="l">Open PRs</div>
          <div className="v">{fmt(rows.length)}</div>
          <div className="muted">{range ? `opened since ${fmtDate(asOf - range * DAY)}` : `since ${fmtDate(earliest)}`}</div>
        </div>
        {GROUPS.map((g) => (
          <div className="kpi" key={g}>
            <div className="l"><Swatch g={g} />{NAME[g]}</div>
            <div className="v">{fmt(tot[g])}</div>
            <div className="muted">{pct(tot[g], rows.length)}% of open</div>
          </div>
        ))}
      </div>

      <section className="card">
        <h2>Where the open work sits</h2>
        <p className="muted">Sorted by Julius + Theo count. Click a theme to filter the list below.</p>
        <div className="legend">
          {GROUPS.map((g) => (
            <span key={g}><Swatch g={g} />{NAME[g]}</span>
          ))}
        </div>
        <div className="chart">
          {rows.length === 0 ? (
            <p className="muted">No PRs opened in this range.</p>
          ) : (
            themes.map((t) => (
              <div
                key={t}
                className={`row${t === selTheme ? " sel" : ""}`}
                onClick={() => pickTheme(t)}
                onMouseMove={(e) => moveTip(e, t)}
                onMouseLeave={() => setTip(null)}
              >
                <div className="name">{t}</div>
                <div className="bar">
                  {GROUPS.filter((g) => agg[t][g]).map((g) => (
                    <div key={g} className="seg" style={{ flex: `0 0 calc(${(agg[t][g] / max) * 100}% - 2px)`, background: `var(--${g})` }} />
                  ))}
                </div>
                <div className="num">{focusCount(t)} / {fmt(sum(agg[t]))}</div>
              </div>
            ))
          )}
        </div>
        <p style={{ margin: "10px 0 0" }}>
          <button className="linkbtn" onClick={() => setShowTable((s) => !s)}>{showTable ? "Hide table" : "Show as table"}</button>
        </p>
        {showTable && (
          <table className="tbl">
            <thead>
              <tr><th>Theme</th><th>Julius</th><th>Theo</th><th>Others</th><th>Total</th></tr>
            </thead>
            <tbody>
              {themes.map((t) => (
                <tr key={t}><td>{t}</td><td>{agg[t].julius}</td><td>{agg[t].theo}</td><td>{agg[t].others}</td><td>{sum(agg[t])}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <div className="two">
        {(["julius", "theo"] as const).map((g) => (
          <section className="card" key={g}>
            <h2><Swatch g={g} /> {NAME[g]}</h2>
            <p className="muted">All open PRs, any date</p>
            <Insights prs={payload.focus.filter((pr) => pr.g === g)} />
          </section>
        ))}
      </div>

      <section className="card" ref={listRef}>
        <h2>Julius and Theo&apos;s open PRs</h2>
        <div className="filters">
          {(["all", "julius", "theo"] as const).map((w) => (
            <button key={w} className="chip" aria-pressed={who === w} onClick={() => setWho(w)}>
              {w === "all" ? "Both" : NAME[w]}
            </button>
          ))}
          <span style={{ width: 8 }} />
          {KINDS.map(([k, label]) => (
            <button key={k} className="chip" aria-pressed={kind === k} onClick={() => setKind(k)}>{label}</button>
          ))}
          <input type="search" placeholder="Search titles" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <p className="muted">
          {selTheme && (
            <>Showing only <b>{selTheme}</b> · <button className="linkbtn" onClick={() => setSelTheme(null)}>clear</button> · </>
          )}
          {fmt(listed.length)} PRs
        </p>
        {byTheme.size === 0 ? (
          <p className="muted">No PRs match.</p>
        ) : (
          themes
            .filter((t) => byTheme.has(t))
            .map((t) => {
              const rs = byTheme.get(t)!.sort(
                (a, b) =>
                  (a.g === "theo" ? 0 : 1) - (b.g === "theo" ? 0 : 1) ||
                  (a.pr.k === "feat" ? 0 : 1) - (b.pr.k === "feat" ? 0 : 1) ||
                  b.ms - a.ms,
              );
              const nj = rs.filter((r) => r.g === "julius").length;
              const nt = rs.length - nj;
              return (
                <details key={`${t}:${selTheme ?? ""}:${query ? "q" : ""}`} open={!!selTheme || !!query || byTheme.size === 1}>
                  <summary>
                    <span className="chev">›</span>
                    <b>{t}</b>
                    <span className="c">
                      {nj > 0 && <span><i className="dot" style={{ background: "var(--julius)" }} /> {nj}</span>}
                      {nt > 0 && <span><i className="dot" style={{ background: "var(--theo)" }} /> {nt}</span>}
                    </span>
                  </summary>
                  <ul className="prs">
                    {rs.map(({ pr, g, ms }) => (
                      <li key={pr.n}>
                        <i className="dot" style={{ background: `var(--${g})` }} title={NAME[g]} />
                        <span className="no">#{pr.n}</span>
                        <a href={prUrl(pr.n)} target="_blank" rel="noopener">
                          {pr.d && <span className="tag">draft</span>}
                          {pr.t}
                        </a>
                        <span className="meta">+{fmt(pr.add)} −{fmt(pr.dele)} · {fmtDate(ms)}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              );
            })
        )}
      </section>
      <p className="muted" style={{ marginTop: 16 }}>
        Themes come from keyword rules on PR titles (first match wins), so a few PRs that span areas land in just one theme.
      </p>

      {tip && (
        <div className="tip" style={{ display: "block", left: tip.x, top: tip.y }}>
          <b>{tip.theme}</b>
          {GROUPS.map((g) => (
            <div key={g}><span><Swatch g={g} />{NAME[g]}</span><span>{fmt(agg[tip.theme][g])}</span></div>
          ))}
          <div style={{ borderTop: "1px solid var(--line)", marginTop: 4, paddingTop: 4 }}>
            <span>Total</span><span>{fmt(sum(agg[tip.theme]))}</span>
          </div>
        </div>
      )}
    </main>
  );
}

function Insights({ prs }: { prs: FocusPr[] }) {
  if (prs.length === 0) return <ul className="insight"><li>No open PRs.</li></ul>;
  const count = (k: string) => prs.filter((p) => p.k === k).length;
  const byTheme = new Map<string, number>();
  for (const p of prs) byTheme.set(p.th, (byTheme.get(p.th) ?? 0) + 1);
  const top = [...byTheme].sort((a, b) => b[1] - a[1]).slice(0, 3);
  const drafts = prs.filter((p) => p.d).length;
  const feats = prs
    .filter((p) => p.k === "feat")
    .sort((a, b) => Date.parse(b.c) - Date.parse(a.c))
    .slice(0, 3);
  return (
    <ul className="insight">
      <li>
        <b>{fmt(prs.length)} open PRs:</b> {pct(count("fix"), prs.length)}% fixes, {pct(count("feat"), prs.length)}% features,{" "}
        {count("perf")} perf{drafts > 0 && `, ${drafts} draft${drafts > 1 ? "s" : ""}`}.
      </li>
      <li>
        <b>Biggest themes:</b> {top.map(([t, n]) => `${t} (${n})`).join(", ")}.
      </li>
      {feats.length > 0 && (
        <li>
          <b>Newest features:</b>{" "}
          {feats.map((p, i) => (
            <span key={p.n}>
              {i > 0 && "; "}
              <a href={prUrl(p.n)} target="_blank" rel="noopener">{featTitle(p.t)}</a>
            </span>
          ))}
          .
        </li>
      )}
    </ul>
  );
}
