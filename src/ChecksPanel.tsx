import { useMutation, useQuery } from "convex/react";
import { ArrowUpRightIcon, CheckIcon, ChevronDownIcon, ClockIcon, MinusIcon, RefreshCwIcon, XIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../convex/_generated/api";
import { RabbitIcon } from "@/components/status";
import { cn } from "@/lib/utils";
import type { Pr } from "@/sync";

export function ChecksPanel({ pr }: { pr: Pr }) {
  const details = useQuery(api.prs.details, { number: pr.number });
  const ensureDetails = useMutation(api.prs.ensureDetails);
  const [showAllChecks, setShowAllChecks] = useState(false);

  useEffect(() => setShowAllChecks(false), [pr.number]);

  // The panel only mounts in the CI tab, so opening the tab is the request to load details.
  useEffect(() => {
    void ensureDetails({ number: pr.number });
  }, [ensureDetails, pr.number, pr.updatedAt]);

  const activeChecks = details?.checks.filter((c) => c.state === "fail" || c.state === "pending") ?? [];
  const otherChecks = details?.checks.filter((c) => c.state === "pass" || c.state === "skipped") ?? [];
  const crThreads = details?.crThreads ?? [];

  const loading = details == null;

  return (
    <section id="pane-ci" className="scroll-mt-4 space-y-4 text-[13px]" aria-label="Checks and CodeRabbit">
      {loading ? (
        <p className="text-xs text-muted-foreground">Loading CI checks and CodeRabbit comments…</p>
      ) : (
        <>
          {activeChecks.length === 0 && crThreads.length === 0 && otherChecks.length === 0 && (
            <p className="text-xs text-muted-foreground">No CI checks or CodeRabbit comments.</p>
          )}
          {activeChecks.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                <span>
                  CI attention needed ({activeChecks.length})
                </span>
                <button
                  onClick={() => void ensureDetails({ number: pr.number, force: true })}
                  className="inline-flex cursor-default items-center gap-1 hover:text-foreground"
                  title="Refresh checks from GitHub"
                >
                  <RefreshCwIcon className="size-3" aria-hidden="true" />
                  Refresh
                </button>
              </div>
              <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
                {activeChecks.map((check) => {
                  const row = (
                    <>
                      {check.state === "fail" ? (
                        <XIcon className="size-3.5 shrink-0 text-(--status-fail)" strokeWidth={2.4} aria-hidden="true" />
                      ) : (
                        <ClockIcon className="size-3.5 shrink-0 text-(--status-pending)" strokeWidth={2.2} aria-hidden="true" />
                      )}
                      <span className="min-w-0 flex-1 truncate font-[450]">{check.name}</span>
                      {check.title && <span className="hidden max-w-44 truncate text-xs text-muted-foreground sm:inline">{check.title}</span>}
                      {check.url && <ArrowUpRightIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />}
                    </>
                  );
                  return check.url ? (
                    <a
                      key={check.name}
                      href={check.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-3 py-2 hover:bg-hover"
                    >
                      {row}
                    </a>
                  ) : (
                    <div key={check.name} className="flex items-center gap-2 px-3 py-2">
                      {row}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {crThreads.length > 0 && (
            <div id="pane-coderabbit" className="scroll-mt-4 space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <RabbitIcon className="size-3.5 text-(--status-warn)" />
                <span>Unresolved CodeRabbit comments ({crThreads.length})</span>
              </div>
              <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
                {crThreads.map((t, i) => {
                  const inner = (
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5 text-xs">
                        <span className="truncate font-mono text-[11px] text-foreground">
                          {t.path}
                          {t.line ? `:${t.line}` : ""}
                        </span>
                        {t.severity && (
                          <span
                            className={cn(
                              "rounded px-1.5 py-px text-[10px] font-medium",
                              t.severity === "Critical" || t.severity === "Major"
                                ? "bg-(--status-fail-bg) text-(--status-fail)"
                                : "bg-(--status-warn-bg) text-(--status-warn)",
                            )}
                          >
                            {t.severity}
                          </span>
                        )}
                        {t.outdated && (
                          <span className="rounded bg-muted px-1.5 py-px text-[10px] text-muted-foreground">Outdated</span>
                        )}
                      </div>
                      <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{t.summary}</p>
                    </div>
                  );
                  return t.url ? (
                    <a
                      key={`${t.path}:${t.line ?? i}:${i}`}
                      href={t.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-start gap-2 px-3 py-2.5 hover:bg-hover"
                    >
                      {inner}
                      <ArrowUpRightIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    </a>
                  ) : (
                    <div key={`${t.path}:${t.line ?? i}:${i}`} className="flex items-start gap-2 px-3 py-2.5">
                      {inner}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {otherChecks.length > 0 && (
            <div>
              <button
                onClick={() => setShowAllChecks((v) => !v)}
                className="inline-flex cursor-default items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                <ChevronDownIcon className={cn("size-3.5 transition-transform", showAllChecks && "rotate-180")} aria-hidden="true" />
                {showAllChecks ? "Hide" : "Show"} {otherChecks.length} passing / skipped checks
              </button>
              {showAllChecks && (
                <div className="mt-2 max-h-56 divide-y divide-border overflow-y-auto rounded-lg border border-border bg-card text-xs">
                  {otherChecks.map((check) => {
                    const icon =
                      check.state === "pass" ? (
                        <CheckIcon className="size-3 shrink-0 text-(--status-pass)" strokeWidth={2.5} aria-hidden="true" />
                      ) : (
                        <MinusIcon className="size-3 shrink-0 text-muted-foreground/50" aria-hidden="true" />
                      );
                    return check.url ? (
                      <a
                        key={check.name}
                        href={check.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-3 py-1.5 hover:bg-hover"
                      >
                        {icon}
                        <span className="min-w-0 flex-1 truncate">{check.name}</span>
                        <ArrowUpRightIcon className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                      </a>
                    ) : (
                      <div key={check.name} className="flex items-center gap-2 px-3 py-1.5">
                        {icon}
                        <span className="min-w-0 flex-1 truncate">{check.name}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
