import weeklyScores from "./weekly-review-scores.json";

export const rubric = [
  ["Reach", "Estimate the share of active users who encounter the affected path. 1 means an exceptional configuration, 5 a recurring workflow for a subset, 10 virtually every user. Identify the denominator and disclose missing telemetry."],
  ["Benefit", "Judge severity, frequency, and cost of the workaround for an affected user. 1 is cosmetic, 5 removes repeated friction, 10 restores essential work or prevents irreversible loss."],
  ["Correctness", "Trace inputs through changed callers and state transitions. 1 contradicts the requirement, 5 handles the primary path with material gaps, 10 preserves relevant invariants across normal and failure paths."],
  ["Maintainability", "Inspect scope, existing abstractions, duplication and complexity. 1 introduces substantial unrelated risk, 5 is understandable with avoidable coupling, 10 is focused and straightforward to change."],
  ["QA strategy", "Compare the reproduction and expected outcome with actual test assertions. 1 has no behavioral check, 5 verifies the happy path, 10 demonstrates a failing baseline and repeatable success through the affected entry point."],
  ["Adversarial coverage", "Derive failure cases from the implementation, then compare each with the description and tests. 1 misses the principal risks, 5 exercises some boundaries, 10 exercises the consequential failure modes with explicit assertions."],
] as const;

type Grade = [score: number, evidence: string];
export type Review = { head: string; base?: string; excerpted?: boolean; grades: [Grade, Grade, Grade, Grade, Grade, Grade] };
export const reviews: Record<number, Review> = {
  43554: {
    head: "ea5019e933ffd82c90e14fa6c98103a09657787a",
    grades: [
      [3, "Mobile users saving a generated ZIP entry or MCP download encounter this path. The share of active users is unknown."],
      [8, "The share sheet could receive a partial file and report success after a failed write. Repeating the save might reproduce the same failure."],
      [9, "shareGeneratedAttachment awaits cached.file.write before preview.share. Rejection now propagates through the existing finally block."],
      [10, "One await expresses the required ordering and follows the sibling write helper. The production change needs no new state."],
      [8, "attachmentDownload.test.ts injects a rejected write and asserts the error, zero share calls and exactly one cleanup. The author reports three failing base runs and three passing head runs."],
      [7, "A full disk is covered explicitly. Hold a successful write pending, confirm sharing has yet to start, then complete it and verify one share. Also abort while the write is pending and inspect the returned success flag. The description acknowledges the missing ordering test and cites the downstream abort guard."],
    ],
  },
  43733: {
    head: "679326462b8c8cd8feaf474fd785e6d44e900084",
    grades: [
      [3, "Applies when someone selects multiple file breadcrumbs and copies them. The PR supplies no usage telemetry."],
      [5, "Produces a pasteable path in one copy operation. Previously the user had to repair the line breaks."],
      [7, "FileBreadcrumbs.onCopy preserves single-crumb selection and breadcrumbRangePath removes the project prefix. The handler can intercept a selection extending outside the navigation and discard selected surrounding text."],
      [8, "Path construction is a small pure function in filePath.ts. The mapping from DOM nodes to crumb indices assumes the rendered order matches the data."],
      [8, "FileBreadcrumbs.browser.test.tsx asserts clipboard text for five path ranges and one partial filename. The author reports five failures on main and six passes on the fix. The test dispatches a synthetic copy event."],
      [6, "A partial filename should retain native copying, which the test asserts. Select from outside the nav through two crumbs and check that surrounding text survives. No corresponding assertion or manual check appears in the PR."],
    ],
  },
  43701: {
    head: "3aea4fb003805889735afb3e2adc703f6a3fb9f9",
    grades: [
      [3, "Web and desktop archive previews with numbered entries. The affected share is unmeasured."],
      [4, "Natural ordering makes numbered chapters and pages easier to find. Files were accessible in both orders."],
      [9, "BinaryViewer sorts a copied array. compareArchiveRows orders directories first and applies numeric collation within each group."],
      [9, "The typed comparator isolates ordering from rendering and reuses one lazily constructed collator."],
      [9, "The worker test asserts the complete order of interleaved files and directories. The description documents a real ZIP preview and reports that reverting either sorting rule breaks the test."],
      [7, "Mix vol2, vol10 and numbered files to challenge both sorting rules. The added test covers that case. Try page2 and page02 in opposite insertion orders to expose how equivalent names tie. The PR supplies no tie-case assertion."],
    ],
  },
  43708: {
    head: "4bd272327128fba08ffdb0d1a78d9991b78e6fcb",
    grades: [
      [3, "Requires Workflows, skipped runs, and the workflow picker. Usage share is unknown."],
      [4, "Removes an inflated count and a no-op disclosure button. The underlying runs remain accessible."],
      [8, "WorkflowRunsView filters snapshot.runs by the selected section before computing skipped, and uses that count for both label and visibility."],
      [7, "Reuses listedWorkflowRuns, though the render now traverses runs again even when the picker shows every workflow."],
      [8, "The Chromium test drives the real picker and checks the count disappears. The author reports a red baseline and 22 passing tests after the change."],
      [6, "Pick a workflow with zero skips while another has two. The new test covers this. Give both workflows different positive counts, switch between them and toggle visibility. The added assertion would miss a fix that always hides the button after selection."],
    ],
  },
};

const scoredReviews = new Map(
  Object.entries(reviews).map(([number, review]) => [
    Number(number),
    { ...review, total: review.grades.reduce((sum, [score]) => sum + score, 0) },
  ]),
);

const scores: Record<number, { head: string; total: number }> = weeklyScores;

export function assess(pr: { number: number }) {
  return scores[pr.number] ?? scoredReviews.get(pr.number);
}

/** Text and background classes for a review total out of 60. */
export function scoreTone(total: number) {
  if (total >= 40) return "bg-(--status-pass-bg) text-(--status-pass)";
  if (total >= 32) return "bg-(--status-warn-bg) text-(--status-warn)";
  return "bg-(--status-fail-bg) text-(--status-fail)";
}
