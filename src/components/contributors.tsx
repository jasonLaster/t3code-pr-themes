import { ArrowDownIcon, ArrowLeftIcon, ArrowUpIcon, ArrowUpRightIcon, ChevronRightIcon } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import { Badge } from "@/components/ui/kbd";
import { Avatar } from "@/components/people";
import { CRITERIA, MAX_TOTAL, SCORED_CONTRIBUTORS, totalOf, type ScoredContributor } from "@/contributors-data";
import { cn } from "@/lib/utils";

type SortKey = "total" | "merged" | "login" | number;
const prUrl = (n: number) => `https://github.com/pingdotgg/t3code/pull/${n}`;
const fmt1 = (n: number) => n.toFixed(1);
const fmt2 = (n: number) => n.toFixed(2);

function valueOf(c: ScoredContributor, key: SortKey) {
  if (key === "total") return totalOf(c);
  if (key === "merged") return c.merged;
  if (key === "login") return c.login.toLowerCase();
  return c.scores[key];
}

/** Tints strong scores green and weak ones red; the middle stays neutral so outliers stand out. */
function ScoreCell({ value }: { value: number }) {
  const tone = value >= 3.5 ? "pass" : value < 2.5 ? "fail" : null;
  return (
    <td className="px-1 py-1.5 text-center">
      <span
        className={cn(
          "inline-block min-w-10 rounded px-1.5 py-0.5 text-[12px] tabular-nums",
          tone === "pass" && "bg-(--status-pass-bg) text-(--status-pass)",
          tone === "fail" && "bg-(--status-fail-bg) text-(--status-fail)",
          !tone && "text-foreground/80",
        )}
      >
        {fmt2(value)}
      </span>
    </td>
  );
}

function SortHeader({ label, k, sort, desc, onSort, className, title }: { label: string; k: SortKey; sort: SortKey; desc: boolean; onSort: (k: SortKey) => void; className?: string; title?: string }) {
  const active = sort === k;
  const Icon = desc ? ArrowDownIcon : ArrowUpIcon;
  return (
    <th scope="col" aria-sort={active ? (desc ? "descending" : "ascending") : undefined} className={cn("px-1 py-2 font-[510]", className)}>
      <button title={title} onClick={() => onSort(k)} className={cn("inline-flex cursor-default items-center gap-0.5 rounded px-1 hover:text-foreground", active && "text-foreground")}>
        {label}
        <Icon className={cn("size-3", !active && "invisible")} aria-hidden="true" />
      </button>
    </th>
  );
}

export function ContributorsPage() {
  const [sort, setSort] = useState<SortKey>("total");
  const [desc, setDesc] = useState(true);
  const [open, setOpen] = useState<string | null>(null);

  const rows = useMemo(() => {
    const ranked = [...SCORED_CONTRIBUTORS].sort((a, b) => totalOf(b) - totalOf(a));
    const rank = new Map(ranked.map((c, i) => [c.login, i + 1]));
    const sorted = [...SCORED_CONTRIBUTORS].sort((a, b) => {
      const va = valueOf(a, sort);
      const vb = valueOf(b, sort);
      const cmp = typeof va === "string" ? va.localeCompare(vb as string) : (va as number) - (vb as number);
      return desc ? -cmp : cmp;
    });
    return sorted.map((c) => ({ c, rank: rank.get(c.login)! }));
  }, [sort, desc]);

  const averages = useMemo(
    () => CRITERIA.map((_, i) => SCORED_CONTRIBUTORS.reduce((s, c) => s + c.scores[i], 0) / SCORED_CONTRIBUTORS.length),
    [],
  );
  const avgTotal = averages.reduce((s, v) => s + v, 0);
  const weakest = averages.indexOf(Math.min(...averages));
  const strongest = averages.indexOf(Math.max(...averages));
  const totals = SCORED_CONTRIBUTORS.map(totalOf);

  const onSort = (k: SortKey) => {
    if (k === sort) setDesc((d) => !d);
    else {
      setSort(k);
      setDesc(k !== "login");
    }
  };

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
        <a href="/" className="flex cursor-default items-center gap-2 rounded-md px-1 py-0.5 hover:bg-hover">
          <span className="grid size-5 place-items-center rounded-md bg-primary text-[10px] font-semibold text-primary-foreground">T3</span>
          <span className="text-[13px] font-[590]">t3code</span>
        </a>
        <ChevronRightIcon className="size-3.5 text-muted-foreground" aria-hidden="true" />
        <h1 className="text-[13px] font-[510]">Contributors</h1>
        <a href="/" className="ml-auto flex cursor-default items-center gap-1.5 rounded-md px-2 py-1 text-[13px] text-muted-foreground hover:bg-hover hover:text-foreground">
          <ArrowLeftIcon className="size-3.5" aria-hidden="true" />
          Pull requests
        </a>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
          <h2 className="text-xl font-[590]">Contributors scored on Julius's review rubric</h2>
          <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-muted-foreground">
            The rubric comes from 240 PRs Julius reviewed and 60 of his own. Each contributor below was scored on 20 of their PRs from Aug 26 to Nov 26, 2026, mixing merged, closed and open ones. Each of the 8 criteria is scored 0–4, for a total out of {MAX_TOTAL}. AI agents did the scoring against shared anchors, so gaps under about a point aren't meaningful.
          </p>

          <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Contributors", String(SCORED_CONTRIBUTORS.length)],
              ["Average total", `${fmt1(avgTotal)} / ${MAX_TOTAL}`],
              ["Range", `${fmt1(Math.min(...totals))}–${fmt1(Math.max(...totals))}`],
              ["Weakest criterion", `${CRITERIA[weakest][0]} (${fmt2(averages[weakest])})`],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-border px-3 py-2.5">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="mt-0.5 text-[15px] font-[510] tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-6 overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[960px] border-collapse text-[13px]">
              <thead className="border-b border-border bg-group text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="w-10 px-2 py-2 text-right font-[510]">#</th>
                  <SortHeader label="Contributor" k="login" sort={sort} desc={desc} onSort={onSort} className="text-left" />
                  <SortHeader label="Merged" k="merged" sort={sort} desc={desc} onSort={onSort} className="text-right" title="Merged PRs, Aug 26–Nov 26" />
                  {CRITERIA.map(([name, help], i) => (
                    <SortHeader key={name} label={name} k={i} sort={sort} desc={desc} onSort={onSort} className="text-center" title={help} />
                  ))}
                  <SortHeader label="Total" k="total" sort={sort} desc={desc} onSort={onSort} className="pr-3 text-right" />
                </tr>
              </thead>
              <tbody>
                {rows.map(({ c, rank }) => {
                  const total = totalOf(c);
                  const expanded = open === c.login;
                  return (
                    <Fragment key={c.login}>
                      <tr
                        onClick={() => setOpen(expanded ? null : c.login)}
                        aria-expanded={expanded}
                        className={cn("cursor-default border-b border-border last:border-0 hover:bg-hover", expanded && "bg-selected hover:bg-selected")}
                      >
                        <td className="px-2 py-1.5 text-right text-xs text-muted-foreground tabular-nums">{rank}</td>
                        <td className="px-2 py-1.5">
                          <span className="flex items-center gap-2">
                            <ChevronRightIcon className={cn("size-3 text-muted-foreground transition-transform", expanded && "rotate-90")} aria-hidden="true" />
                            <Avatar login={c.login} className="size-[18px]" />
                            <span className="font-[510]">{c.login}</span>
                            {c.maintainer && <Badge className="text-(--maintainer)">Maintainer</Badge>}
                          </span>
                        </td>
                        <td className="px-2 py-1.5 text-right text-muted-foreground tabular-nums">{c.merged}</td>
                        {c.scores.map((s, i) => (
                          <ScoreCell key={i} value={s} />
                        ))}
                        <td className="py-1.5 pr-3 pl-2">
                          <span className="flex items-center justify-end gap-2">
                            <span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-muted sm:block" aria-hidden="true">
                              <span className="block h-full rounded-full bg-primary" style={{ width: `${(total / MAX_TOTAL) * 100}%` }} />
                            </span>
                            <span className="w-9 text-right font-[590] tabular-nums">{fmt1(total)}</span>
                          </span>
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="border-b border-border bg-selected/50">
                          <td colSpan={CRITERIA.length + 4} className="px-2 pt-1 pb-3">
                            {/* Sticky so the note stays readable while the wide table scrolls sideways on phones. */}
                            <div className="sticky left-2 max-w-[min(48rem,calc(100vw-4rem))] pl-10">
                            <p className="leading-relaxed">{c.note}</p>
                            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5 text-[12.5px] text-muted-foreground">
                              <a className="inline-flex items-center gap-1 hover:text-foreground hover:underline" href={prUrl(c.representative)} target="_blank" rel="noopener">
                                Most representative: #{c.representative}
                                <ArrowUpRightIcon className="size-3" aria-hidden="true" />
                              </a>
                              <a className="inline-flex items-center gap-1 hover:text-foreground hover:underline" href={prUrl(c.worst.pr)} target="_blank" rel="noopener">
                                Worst: #{c.worst.pr} ({c.worst.score}/{MAX_TOTAL}), {c.worst.why}
                                <ArrowUpRightIcon className="size-3" aria-hidden="true" />
                              </a>
                              <a className="inline-flex items-center gap-1 hover:text-foreground hover:underline" href={`/?q=${encodeURIComponent(`author:${c.login.toLowerCase()} state:open state:merged state:closed`)}`}>
                                Their PRs in this app
                              </a>
                            </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
              <tfoot className="border-t border-border bg-group text-xs text-muted-foreground">
                <tr>
                  <td />
                  <td className="px-2 py-2 font-[510]" colSpan={2}>Average</td>
                  {averages.map((v, i) => (
                    <td key={i} className={cn("px-1 py-2 text-center tabular-nums", i === weakest && "text-(--status-fail)", i === strongest && "text-(--status-pass)")}>
                      {fmt2(v)}
                    </td>
                  ))}
                  <td className="py-2 pr-3 text-right font-[590] text-foreground tabular-nums">{fmt1(avgTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <section className="mt-10" aria-labelledby="rubric">
            <h2 id="rubric" className="text-[15px] font-[590]">The rubric</h2>
            <p className="mt-1 text-[13px] text-muted-foreground">
              4 matches how Julius writes his own PRs. 2 means he'd ask for changes and merge after them. 0 means he'd block or close it.
            </p>
            <ol className="mt-4 grid gap-3 sm:grid-cols-2">
              {CRITERIA.map(([name, help], i) => (
                <li key={name} className="rounded-lg border border-border px-3.5 py-3">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs text-muted-foreground tabular-nums">{i + 1}</span>
                    <span className="text-[13px] font-[590]">{name}</span>
                    <span className="ml-auto text-xs text-muted-foreground tabular-nums">avg {fmt2(averages[i])}</span>
                  </div>
                  <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{help}</p>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </main>
    </div>
  );
}
