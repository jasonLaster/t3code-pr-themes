import { CheckIcon, ClockIcon, MessageSquareWarningIcon, MinusIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ciOf, crOf, type CiStatus, type CrStatus, type Health } from "@/model";
import type { Pr } from "@/sync";

/** Minimalist rabbit-ear icon for CodeRabbit status indicators. */
export function RabbitIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn("size-3 shrink-0", className)}
    >
      <path d="M5.5 7.5C4.5 5 4.3 2.5 5.3 2c1-.4 2 1.8 2.3 4.3" />
      <path d="M10.5 7.5c1-2.5 1.2-5 .2-5.5-1-.4-2 1.8-2.3 4.3" />
      <circle cx="8" cy="10.2" r="3.6" />
      <circle cx="6.8" cy="9.8" r="0.4" fill="currentColor" stroke="none" />
      <circle cx="9.2" cy="9.8" r="0.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function HealthDot({ health, className }: { health: Health; className?: string }) {
  const color =
    health === "green"
      ? "bg-(--status-pass)"
      : health === "needs-work"
        ? "bg-(--status-fail)"
        : health === "running"
          ? "bg-(--status-pending)"
          : "bg-muted-foreground/45";
  return <span aria-hidden="true" className={cn("inline-block size-2 shrink-0 rounded-full", color, className)} />;
}

export function CiStatusIcon({ status, className }: { status: CiStatus; className?: string }) {
  if (status === "pass") return <CheckIcon className={cn("size-3 shrink-0 text-(--status-pass)", className)} strokeWidth={2.5} aria-hidden="true" />;
  if (status === "fail") return <XIcon className={cn("size-3 shrink-0 text-(--status-fail)", className)} strokeWidth={2.5} aria-hidden="true" />;
  if (status === "pending") return <ClockIcon className={cn("size-3 shrink-0 text-(--status-pending)", className)} strokeWidth={2.2} aria-hidden="true" />;
  return <MinusIcon className={cn("size-3 shrink-0 text-muted-foreground/50", className)} aria-hidden="true" />;
}

export function CrStatusIcon({ status, className }: { status: CrStatus; className?: string }) {
  if (status === "clean") return <CheckIcon className={cn("size-3 shrink-0 text-(--status-pass)", className)} strokeWidth={2.5} aria-hidden="true" />;
  if (status === "comments") return <MessageSquareWarningIcon className={cn("size-3 shrink-0 text-(--status-warn)", className)} strokeWidth={2.2} aria-hidden="true" />;
  if (status === "error") return <XIcon className={cn("size-3 shrink-0 text-(--status-fail)", className)} strokeWidth={2.5} aria-hidden="true" />;
  if (status === "pending") return <ClockIcon className={cn("size-3 shrink-0 text-(--status-pending)", className)} strokeWidth={2.2} aria-hidden="true" />;
  return <MinusIcon className={cn("size-3 shrink-0 text-muted-foreground/50", className)} aria-hidden="true" />;
}

export function ciTooltip(pr: Pr) {
  const ci = ciOf(pr);
  const parts: string[] = [];
  if (pr.ciFailed) parts.push(`${pr.ciFailed} failed`);
  if (pr.ciPending) parts.push(`${pr.ciPending} running`);
  if (pr.ciPassed) parts.push(`${pr.ciPassed} passed`);
  const detail = parts.length ? ` (${parts.join(", ")})` : "";
  if (ci === "pass") return `CI passing${detail}`;
  if (ci === "fail") return `CI failing${detail}`;
  if (ci === "pending") return `CI running${detail}`;
  return "No CI checks";
}

export function crTooltip(pr: Pr) {
  if (pr.cr === undefined) return "CodeRabbit status syncing…";
  const cr = pr.cr;
  const unresolved = pr.crUnresolved ?? 0;
  const total = pr.crTotal ?? 0;
  if (cr === "comments") {
    return `CodeRabbit: ${unresolved} unresolved ${unresolved === 1 ? "comment" : "comments"}${total > unresolved ? ` (${total - unresolved} resolved)` : ""}`;
  }
  if (cr === "clean") {
    return total > 0 ? `CodeRabbit: Clean (${total} resolved)` : "CodeRabbit: Clean (no issues)";
  }
  if (cr === "pending") {
    return unresolved > 0 ? `CodeRabbit: Reviewing… (${unresolved} unresolved)` : "CodeRabbit: Review in progress";
  }
  if (cr === "skipped") {
    return pr.crTitle ? `CodeRabbit: ${pr.crTitle}` : "CodeRabbit: Skipped";
  }
  if (cr === "error") {
    return pr.crTitle ? `CodeRabbit failed: ${pr.crTitle}` : "CodeRabbit check failed";
  }
  return "No CodeRabbit review";
}

export function ciSummaryText(pr: Pr) {
  const ci = ciOf(pr);
  if (ci === "fail") {
    const fail = pr.ciFailed ?? 1;
    return `${fail} failing${pr.ciPassed ? ` · ${pr.ciPassed} passed` : ""}`;
  }
  if (ci === "pending") {
    const pending = pr.ciPending ?? 1;
    return `${pending} running${pr.ciPassed ? ` · ${pr.ciPassed} passed` : ""}`;
  }
  if (ci === "pass") {
    return pr.ciPassed ? `Passing · ${pr.ciPassed} ${pr.ciPassed === 1 ? "check" : "checks"}` : "Passing";
  }
  return "No checks";
}

export function crSummaryText(pr: Pr) {
  if (pr.cr === undefined) return "Syncing…";
  const unresolved = pr.crUnresolved ?? 0;
  const total = pr.crTotal ?? 0;
  switch (pr.cr) {
    case "comments":
      return `${unresolved} unresolved ${unresolved === 1 ? "comment" : "comments"}${total > unresolved ? ` · ${total - unresolved} resolved` : ""}`;
    case "clean":
      return total > 0 ? `Clean · ${total} resolved` : "Clean";
    case "pending":
      return unresolved > 0 ? `Reviewing · ${unresolved} unresolved` : "Review in progress";
    case "skipped":
      return pr.crTitle ? `Skipped · ${pr.crTitle}` : "Skipped";
    case "error":
      return pr.crTitle ? `Failed · ${pr.crTitle}` : "Check failed";
    case "none":
      return "No review";
  }
}

const pillBase = "inline-flex h-5 shrink-0 items-center justify-center gap-1 rounded px-1.5 text-[11px] font-medium tabular-nums";

export function CiBadge({ pr, className }: { pr: Pr; className?: string }) {
  const ci = ciOf(pr);
  const title = ciTooltip(pr);
  if (ci === "pass") {
    return (
      <span className={cn(pillBase, "bg-(--status-pass-bg) text-(--status-pass)", className)} title={title}>
        <CheckIcon className="size-3 shrink-0" strokeWidth={2.5} aria-hidden="true" />
        <span>CI</span>
      </span>
    );
  }
  if (ci === "fail") {
    return (
      <span className={cn(pillBase, "bg-(--status-fail-bg) text-(--status-fail)", className)} title={title}>
        <XIcon className="size-3 shrink-0" strokeWidth={2.5} aria-hidden="true" />
        <span>CI{pr.ciFailed ? ` ${pr.ciFailed}` : ""}</span>
      </span>
    );
  }
  if (ci === "pending") {
    return (
      <span className={cn(pillBase, "bg-(--status-pending-bg) text-(--status-pending)", className)} title={title}>
        <ClockIcon className="size-3 shrink-0" strokeWidth={2.2} aria-hidden="true" />
        <span>CI{pr.ciPending ? ` ${pr.ciPending}` : ""}</span>
      </span>
    );
  }
  return (
    <span className={cn(pillBase, "text-muted-foreground/45", className)} title={title}>
      <MinusIcon className="size-3 shrink-0" aria-hidden="true" />
      <span>CI</span>
    </span>
  );
}

export function CrBadge({ pr, className }: { pr: Pr; className?: string }) {
  const cr = pr.cr;
  const title = crTooltip(pr);
  if (cr === "clean") {
    return (
      <span className={cn(pillBase, "bg-(--status-pass-bg) text-(--status-pass)", className)} title={title}>
        <RabbitIcon />
        <CheckIcon className="size-2.5 shrink-0" strokeWidth={2.8} aria-hidden="true" />
      </span>
    );
  }
  if (cr === "comments") {
    return (
      <span className={cn(pillBase, "bg-(--status-warn-bg) text-(--status-warn)", className)} title={title}>
        <RabbitIcon />
        <span>{pr.crUnresolved ?? "!"}</span>
      </span>
    );
  }
  if (cr === "error") {
    return (
      <span className={cn(pillBase, "bg-(--status-fail-bg) text-(--status-fail)", className)} title={title}>
        <RabbitIcon />
        <XIcon className="size-2.5 shrink-0" strokeWidth={2.8} aria-hidden="true" />
      </span>
    );
  }
  if (cr === "pending") {
    return (
      <span className={cn(pillBase, "bg-(--status-pending-bg) text-(--status-pending)", className)} title={title}>
        <RabbitIcon />
        <ClockIcon className="size-2.5 shrink-0" strokeWidth={2.2} aria-hidden="true" />
      </span>
    );
  }
  if (cr === "skipped") {
    return (
      <span className={cn(pillBase, "bg-muted/70 text-muted-foreground/75", className)} title={title}>
        <RabbitIcon className="opacity-70" />
        <span>skip</span>
      </span>
    );
  }
  return (
    <span className={cn(pillBase, "text-muted-foreground/40", className)} title={title}>
      <RabbitIcon className="opacity-60" />
      <span>–</span>
    </span>
  );
}
