type Evidence = { title: string; review?: string; ci?: string; crUnresolved?: number };

export const rubric = [
  "Reach estimates the share of active users who encounter the affected workflow. Explicit product-wide scope suggests over 50%. Platform or provider scope identifies a subset whose size needs usage data.",
  "Benefit rates the outcome for an affected user. Recovering lost work or restoring a blocked workflow is high, correcting behavior, enabling a workflow or saving repeated effort is moderate, and visual polish is modest.",
  "Code quality considers correctness, maintainability and open findings. Approval and requested changes are reviewer signals. A full rating requires reading the implementation.",
  "QA considers reproduction, regression coverage and passing checks. CI supplies a check result. Verifying coverage requires inspecting the tests or manual results.",
];

export function assess(pr: Evidence) {
  const title = pr.title.toLowerCase();
  const severe = title.match(/\b(data loss|lost messages|losing changes|crash(?:es|ing)?|hangs?|cannot start|fails to (?:start|launch|connect)|corrupt(?:ion|ed))\b/);
  const efficiency = title.match(/\b(shortcut|autocomplete|faster|speed up|latency|batch|one.click)\b/);
  const polish = title.match(/\b(typo|alignment|padding|spacing|capitalization)\b/);
  const subset = title.match(/\b(windows|macos|linux|ios|android|claude|codex|gemini|ssh|mobile)\b/);
  const broad = /\b(all users|every user|app.wide|application.wide)\b/.test(title);
  const declared = /^(fix|feat|perf)(?:\([^)]*\))?!?:/.exec(title)?.[1];
  const signal = severe ?? efficiency ?? polish;
  return {
    benefit: severe ? "High" : efficiency ? "Moderate" : polish ? "Modest" : declared ? "Moderate" : "Unrated",
    benefitReason: signal ? `Title mentions “${signal[0]}”.` : declared ? ({ fix: "Provisional rating for a declared behavior fix.", feat: "Provisional rating for a declared capability.", perf: "Provisional rating for a declared performance improvement." }[declared] ?? "") : "Impact needs review of the use case.",
    reach: subset ? `${subset[0]} users · share unknown` : broad ? "Potentially over 50% · low confidence" : "Unknown share",
    code: pr.review === "changes" ? "Reviewer requested changes" : pr.crUnresolved ? `${pr.crUnresolved} open review findings` : pr.review === "approved" ? "Reviewer approved" : "Awaiting implementation assessment",
    qa: ({pass:"CI passed", fail:"CI failed", pending:"CI pending"} as Record<string,string>)[pr.ci ?? ""] ?? "No CI result",
  };
}
