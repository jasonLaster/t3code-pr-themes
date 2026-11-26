export type Group = "julius" | "theo";

export type FocusPr = {
  n: number;
  t: string;
  g: Group;
  d: boolean;
  c: string;
  add: number;
  dele: number;
  th: string;
  k: string;
};

export type Payload = {
  themes: string[];
  focus: FocusPr[];
  /** Everyone else's PRs, compact: [theme index, createdAt to the minute]. */
  others: [number, string][];
};

// First match wins, so order matters.
const THEMES: [string, RegExp][] = [
  ["Performance", /^perf|\bperf\b|faster|freez|cpu|battery|budget|off the main thread|no longer read the whole|wedge|lag/i],
  ["Mobile", /^\w+\((mobile|ios|android)\)|\biOS\b|android|iphone|live activit/i],
  ["Providers & agent runtimes", /claude|codex|cursor|antigravity|\bagy\b|opencode|grok|\bpi\b|\bacp|copilot|kiro|muse|devin|kimi|gemini|provider|\bfx\b|droid|amp\b/i],
  ["Usage, limits & accounts", /usage|limit|credit|\baccount|sign[- ]?in|login|passkey|clerk/i],
  ["Remote, Connect & pairing", /connect|t3 connect|relay|tunnel|tailscale|pairing|linked env|another machine|\bssh\b|\blan\b|reconnect|remote|gateway|cloudflare|credential|session|auth|oauth|peer|environment/i],
  ["Source control, PRs & CI", /github|gitlab|bitbucket|azure|forgejo|gitea|\bpr\b|\bprs\b|pull request|\bci\b|merge request|issue|linear|source-control|forge|branch|commit/i],
  ["Delegation, workflows & MCP", /delegat|subagent|workflow|\bmcp\b|scheduled|schedule|queue|steer|follow-up|wake|t3_|\bchild|parent|goal|side chat|fork|swarm|task|request_secret|secret card|agents? (can|know)/i],
  ["Browser, previews & devices", /browser|preview|html|\bcua\b|snapshot|screenshot|device|agentcast|cookie|simulator|emulator|remote desktop|voice/i],
  ["Projects, worktrees & checkpoints", /worktree|checkpoint|diff|\bgit\b|submodule|file|folder|project|docker|sandbox/i],
  ["Desktop shell & packaging", /^\w+\((?:[^)]*,)?desktop[,)]|appimage|electron|\bmacos\b|linux|windows|packag|installer|update|launchd|service/i],
  ["Chat & thread UI", /^\w+\((?:[^)]*,)?(web|client|clients|client-runtime|chat|settings|i18n)[,)]|thread|composer|sidebar|terminal|message|cmd\+k|palette|keybind|model picker|plan/i],
  ["Server core & reliability", /^\w+\((?:[^)]*,)?(server|shared|contracts|cli)[,)]|migration|database|restart|startup|crash/i],
];

export const THEME_NAMES = [...THEMES.map(([name]) => name), "Other"];

export const themeOf = (title: string) => THEMES.find(([, rx]) => rx.test(title))?.[0] ?? "Other";
