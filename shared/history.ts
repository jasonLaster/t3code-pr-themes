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

export const PR_KINDS = [
  "feat", "fix", "perf", "refactor", "docs", "test", "build",
  "ci", "chore", "style", "revert", "other",
] as const;
export type PrKind = (typeof PR_KINDS)[number];

export function kindOf(title: string): PrKind {
  const prefix = title.match(/^([a-z]+)(?:\([^)]+\))?!?:/i)?.[1].toLowerCase();
  return PR_KINDS.find((kind) => kind === prefix) ?? "other";
}
