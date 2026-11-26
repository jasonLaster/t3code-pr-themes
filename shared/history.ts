export const PR_STATES = ["open", "merged", "closed"] as const;
export type PrState = (typeof PR_STATES)[number];

export const PR_LABELS = [
  "web", "desktop", "mobile", "ios", "android", "server", "cli",
  "codex", "claude", "cursor", "antigravity", "gemini", "opencode", "copilot", "grok",
  "github", "linear", "git", "worktrees", "ci", "terminal", "editor",
  "chat", "settings", "connect", "mcp", "subagents", "browser", "devices",
  "a11y", "i18n", "testing", "docs", "dependencies", "packaging",
] as const;
export type PrLabel = (typeof PR_LABELS)[number];

const historyLabelPattern = new RegExp(`\\b(${PR_LABELS.join("|")})\\b`, "gi");

export function inferHistoryLabels(title: string): PrLabel[] {
  const matches = [...title.matchAll(historyLabelPattern)].map(([label]) => label.toLowerCase() as PrLabel);
  return [...new Set(matches)].slice(0, 3);
}

export const PR_KINDS = [
  "feat", "fix", "perf", "refactor", "docs", "test", "build",
  "ci", "chore", "style", "revert", "other",
] as const;
export type PrKind = (typeof PR_KINDS)[number];

export function kindOf(title: string): PrKind {
  const prefix = title.match(/^([a-z]+)(?:\([^)]+\))?!?:/i)?.[1].toLowerCase();
  return PR_KINDS.find((kind) => kind === prefix) ?? "other";
}

/** Use declared types first, then common imperative titles for untyped PRs. */
export function changePurpose(title: string): "fix" | "feature" | "other" {
  const kind = kindOf(title);
  if (kind === "fix") return "fix";
  if (kind === "feat") return "feature";
  if (kind !== "other") return "other";
  if (/^(?:bugfix|fix(?:es)?|repair|resolve)\b/i.test(title)) return "fix";
  if (/^(?:feature|feat|add|introduce|implement|enable|support)\b/i.test(title)) return "feature";
  return "other";
}
