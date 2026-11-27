// Contributors scored against a rubric distilled from Julius's PR reviews.
// Each person was scored on 20 PRs (about 13 merged, the rest closed or open) authored 2026-08-26..2026-11-26.
// Scores come from several scoring agents using shared anchors, so differences under about a point are noise.

export const CRITERIA = [
  ["Scope", "One problem, current against main. Julius's most common change request: \"main already covers that, cut this down\"."],
  ["Fit", "A bug fix on the supported path. No unrequested features, new npm dependencies, settings or private endpoints."],
  ["Architecture", "Extends existing registries, drivers and catalogs. Shared contracts stay provider-neutral, with one source of truth across clients."],
  ["Failure paths", "Holds up on errors, retries, races and restarts. Persists only stable data and fails toward the safe side."],
  ["Resources", "No background reads or rate-limit spend the user didn't ask for. Performance claims are measured."],
  ["Evidence", "Reproduced on main with a SHA and verified in the real app or against the real provider, with screenshots for UI."],
  ["Tests", "A few behavioral tests through the real entry point, shown failing on main. No bulk, no sleeps."],
  ["Description", "A \"X now / no longer Y\" title, then symptom, cause and fix, the linked issue, and stated limits, kept current for the head commit."],
] as const;

export const CRITERION_COUNT = CRITERIA.length;
export const MAX_TOTAL = CRITERION_COUNT * 4;

export type Scores = [number, number, number, number, number, number, number, number];
export type ScoredContributor = {
  login: string;
  batch: number;
  merged: number;
  maintainer?: boolean;
  scores: Scores;
  note: string;
  representative: number;
  worst: { pr: number; score: number; why: string };
};

export const SCORED_CONTRIBUTORS: ScoredContributor[] = [
  // Batch 1
  { login: "only21mil", batch: 1, merged: 503, scores: [3.25, 3.65, 3.7, 3.25, 3.7, 3.55, 2.3, 3.2], note: "Large server fixes come with real-provider proof. Maintainers trim or rewrite the tests on nearly every large PR.", representative: 23741, worst: { pr: 8674, score: 10, why: "A \"do not merge\" CI mirror for another project" } },
  { login: "saphid", batch: 1, merged: 423, scores: [3.05, 2.9, 3.1, 2.9, 3.8, 2.35, 2.35, 2.7], note: "Markdown edge cases built from synthetic fixtures. Julius took over three real server bugs and rewrote them.", representative: 14424, worst: { pr: 11514, score: 10, why: "A +329k branch against a superseded architecture" } },
  { login: "StiensWout", batch: 1, merged: 322, scores: [2.45, 2.85, 2.9, 2.7, 3.55, 2.3, 2.65, 2.95], note: "Julius pushed commits to two-thirds of the merged PRs. Early work includes large unrequested features and proofs of concept.", representative: 39213, worst: { pr: 8267, score: 14, why: "A +182k bundle built on the orchestration v2 branch" } },
  { login: "Yash-Singh1", batch: 1, merged: 316, maintainer: true, scores: [2.55, 3.0, 3.3, 2.6, 3.4, 2.15, 2.55, 2.55], note: "Team maintainer who merges 99% of his own PRs. Two PRs lost out to other contributors' PRs that had runtime proof.", representative: 25611, worst: { pr: 9093, score: 12, why: "A +2.2k bundle he merged himself" } },
  { login: "shivamhwp", batch: 1, merged: 241, scores: [2.5, 2.95, 3.2, 3.15, 3.7, 2.95, 2.5, 3.35], note: "Small fixes score 26–31 with real-device proof, while large features score 16–21. Merges 76% of his own PRs.", representative: 21163, worst: { pr: 29890, score: 16, why: "A +3.4k feature filed as a bug fix" } },
  { login: "Lucenx9", batch: 1, merged: 85, scores: [3.3, 3.25, 3.25, 3.2, 3.9, 2.05, 2.65, 2.6], note: "Tiny, focused fixes that never show the bug in the running app. Descriptions open with a list of testing tools.", representative: 33840, worst: { pr: 9660, score: 16, why: "An unrequested +5k find-in-conversation feature" } },
  { login: "tiliakoos", batch: 1, merged: 51, scores: [3.4, 3.9, 3.05, 2.75, 3.9, 2.9, 2.55, 3.25], note: "October PRs were taken over with correctness fixes. Later PRs re-land closed work, and descriptions drift from the head commit.", representative: 37495, worst: { pr: 17673, score: 20, why: "Taken over, then closed as stale" } },
  { login: "Marve10s", batch: 1, merged: 36, scores: [3.6, 3.4, 3.25, 2.85, 3.95, 2.1, 2.8, 3.6], note: "Clear descriptions. Server fixes keep needing maintainer code, and the evidence rarely comes from the app.", representative: 38605, worst: { pr: 38668, score: 16, why: "An unrequested +17.5k Ukrainian translation" } },
  { login: "AymanKhan9", batch: 1, merged: 19, scores: [3.5, 3.65, 3.35, 2.95, 3.9, 1.95, 2.25, 3.0], note: "Tight single fixes. Julius's pipeline produced every proof, and he trimmed the tests on 9 of 20.", representative: 42875, worst: { pr: 42346, score: 20, why: "Reported a command-injection bug that didn't exist" } },
  { login: "iamshadmantaqi", batch: 1, merged: 17, scores: [3.5, 3.9, 3.5, 2.95, 3.85, 1.95, 3.6, 3.9], note: "The best descriptions and tests. Julius pushed fixes for unusual inputs, and 4 of 20 duplicated existing work.", representative: 42873, worst: { pr: 41444, score: 22, why: "Raised a buffer cap instead of fixing the parse" } },
  // Batch 2
  { login: "maria-rcks", batch: 2, merged: 537, maintainer: true, scores: [2.65, 2.75, 3.05, 2.85, 3.55, 3.05, 2.1, 3.0], note: "Team maintainer who merges 93% of her own PRs, including a +220k i18n change. She verifies others' PRs in the real app.", representative: 27904, worst: { pr: 19662, score: 10, why: "Idle compaction built on guessed cache lifetimes" } },
  { login: "flamboh", batch: 2, merged: 281, scores: [2.9, 3.1, 3.3, 2.95, 3.85, 2.9, 2.1, 3.4], note: "Small web fixes with videos but often no test. Maria merged 222 of them.", representative: 33540, worst: { pr: 18058, score: 20, why: "An ~800-line probe subsystem, later replaced by ~30 lines" } },
  { login: "Bil0000", batch: 2, merged: 133, scores: [2.5, 2.95, 2.75, 2.4, 3.2, 2.25, 2.2, 2.7], note: "Measured performance wins, alongside oversized test suites, bundles and premises that were never observed.", representative: 25761, worst: { pr: 19406, score: 11, why: "An unrequested +27k Jira tracker" } },
  { login: "voltcrash", batch: 2, merged: 82, scores: [3.2, 3.1, 2.95, 2.4, 3.55, 2.4, 2.5, 2.9], note: "Only 39% of finished PRs merged. Reopens the same fix instead of cutting it down.", representative: 27399, worst: { pr: 18912, score: 16, why: "The pipeline judged it worse than main" } },
  { login: "PixPMusic", batch: 2, merged: 82, scores: [2.6, 2.6, 2.95, 2.75, 3.45, 2.85, 2.4, 2.95], note: "Bug fixes average about 28. Unapproved Jira and Linear features pull the average down.", representative: 19988, worst: { pr: 18456, score: 10, why: "A stacked three-feature Jira PR with no evidence" } },
  { login: "SunkenInTime", batch: 2, merged: 81, scores: [2.85, 3.4, 2.9, 2.8, 3.7, 3.15, 2.45, 3.05], note: "Real proof on Windows and with Claude. Long-running server fixes went stale or conflicted.", representative: 19229, worst: { pr: 12163, score: 14, why: "+302k lines cut from a maintainer branch" } },
  { login: "MarcoDotIO", batch: 2, merged: 70, scores: [3.2, 3.45, 3.6, 3.1, 3.8, 2.2, 3.15, 3.0], note: "Tight fixes with tests that fail on main. Maintainers do the in-app proof.", representative: 29463, worst: { pr: 27834, score: 16, why: "An unrequested MCP tool that drew a privacy objection" } },
  { login: "UtkarshUsername", batch: 2, merged: 63, scores: [2.55, 3.0, 3.3, 2.95, 3.7, 2.9, 2.4, 2.65], note: "Measured performance claims and real Windows checks, but large bundles and duplicates.", representative: 21720, worst: { pr: 14882, score: 14, why: "A +19k voice feature that Julius rebuilt as 3 PRs" } },
  { login: "tris203", batch: 2, merged: 54, scores: [2.8, 3.0, 2.8, 2.9, 3.4, 2.75, 2.7, 2.75], note: "Focused fixes average about 28 and unrequested features about 16.", representative: 22399, worst: { pr: 10183, score: 11, why: "An unrequested +2.2k orchestration feature" } },
  { login: "yordis", batch: 2, merged: 52, scores: [3.1, 3.2, 2.65, 2.7, 3.55, 1.8, 2.25, 2.2], note: "Julius took over 26% of their PRs. Evidence never scores above 2.", representative: 25526, worst: { pr: 31721, score: 14, why: "Puts 1Password into the shared contracts" } },
  // Batch 3
  { login: "ScottN-PV", batch: 3, merged: 50, scores: [3.1, 3.6, 2.8, 2.7, 3.35, 2.9, 2.4, 2.95], note: "Sound, bounded fixes that end in takeovers with trimmed tests.", representative: 19564, worst: { pr: 21869, score: 15, why: "Merged +24k of main into the branch; main already covered it" } },
  { login: "Mnigos", batch: 3, merged: 46, scores: [3.45, 3.4, 2.95, 2.75, 3.9, 2.4, 2.5, 2.75], note: "Small fixes merge as written. Larger ones get taken over.", representative: 26160, worst: { pr: 18378, score: 19, why: "A new undici dependency and six maintainer proxy fixes" } },
  { login: "Yuruzuu", batch: 3, merged: 44, scores: [3.25, 3.65, 3.3, 2.8, 3.8, 2.85, 2.8, 2.9], note: "About 50 benchmarked performance PRs in 10 days.", representative: 33942, worst: { pr: 26011, score: 16, why: "A +1.3k bundle across server, web and mobile" } },
  { login: "TonybynMp4", batch: 3, merged: 38, scores: [2.6, 2.8, 2.85, 2.4, 3.65, 2.5, 2.6, 2.6], note: "Maintainers pushed failure-path fixes on six PRs. Several unapproved features over 1k lines.", representative: 28728, worst: { pr: 11482, score: 15, why: "Bundled three gaps into a layer being rewritten for V2" } },
  { login: "fixfon", batch: 3, merged: 37, scores: [2.8, 3.55, 2.8, 2.45, 3.9, 2.0, 2.25, 2.75], note: "The diagnoses are right, but nearly every October PR was taken over.", representative: 21114, worst: { pr: 22888, score: 17, why: "Overrode the user's permission policy and was never reproduced" } },
  { login: "Adamulek123", batch: 3, merged: 37, scores: [2.75, 3.2, 3.0, 2.7, 3.4, 2.25, 2.3, 3.0], note: "59 of 104 PRs closed. The late-November work stays small.", representative: 39809, worst: { pr: 13128, score: 12, why: "A +3.4k presentation bundle without approval" } },
  { login: "jakeleventhal", batch: 3, merged: 36, scores: [2.5, 2.3, 3.15, 2.4, 3.25, 2.5, 2.3, 2.95], note: "Small fixes score 28–30. Several PRs were closed for lacking prior approval.", representative: 29388, worst: { pr: 13168, score: 12, why: "A +335k unapproved voice feature on a stale branch" } },
  { login: "Gigioxx", batch: 3, merged: 30, scores: [3.25, 3.75, 3.45, 2.7, 3.95, 2.75, 2.35, 3.15], note: "Focused fixes and measured performance work, but frequent duplicates of maintainer work.", representative: 14510, worst: { pr: 9440, score: 21, why: "A stale bundle in layers frozen for V2" } },
  { login: "spoukyii", batch: 3, merged: 28, scores: [3.5, 3.65, 3.45, 3.05, 3.9, 1.9, 2.9, 3.8], note: "Clean, templated descriptions. Maintainers produce nearly all the real-app proof.", representative: 30370, worst: { pr: 15991, score: 19, why: "An unrequested feature that Theo had to finish" } },
  { login: "extoci", batch: 3, merged: 25, scores: [3.25, 3.3, 3.15, 2.9, 3.85, 1.9, 1.8, 2.7], note: "The lowest tests score of anyone: 5 of 20 PRs add no test.", representative: 12846, worst: { pr: 8406, score: 16, why: "An unrequested feature with no screenshots" } },
  // Batch 4
  { login: "yashranaway", batch: 4, merged: 24, scores: [3.45, 3.55, 3.3, 2.8, 3.75, 2.0, 2.75, 2.85], note: "Small fixes with tests that fail first. The proof always comes from the pipeline.", representative: 23441, worst: { pr: 10325, score: 18, why: "+2.8k with a migration and no prior approval" } },
  { login: "macodev00", batch: 4, merged: 22, scores: [3.15, 3.65, 2.9, 2.35, 3.85, 1.8, 2.45, 2.8], note: "142 of 167 PRs closed, with fixes re-filed until the review bots approved.", representative: 18152, worst: { pr: 13238, score: 15, why: "Echoed secret prompts on screen" } },
  { login: "navidnadali", batch: 4, merged: 19, scores: [3.2, 3.5, 2.85, 2.9, 3.55, 1.9, 2.6, 3.05], note: "Every description says the live app was not checked.", representative: 38890, worst: { pr: 30864, score: 16, why: "A +1.7k perf rewrite whose gain didn't show on main" } },
  { login: "mwolson", batch: 4, merged: 19, scores: [2.9, 3.3, 2.8, 2.7, 3.55, 2.55, 2.1, 2.85], note: "Evidence comes from his own devices. Several UI fixes have no tests.", representative: 38334, worst: { pr: 9103, score: 7, why: "A 955-file rebuild that dragged in unrelated changes" } },
  { login: "MatthewFeroz", batch: 4, merged: 19, scores: [2.8, 3.1, 3.25, 2.8, 3.55, 3.1, 2.05, 3.05], note: "A third of PRs were closed as duplicate, stale or out of scope.", representative: 15556, worst: { pr: 41149, score: 12, why: "An unrequested +22k printer integration" } },
  { login: "gabrielelpidio", batch: 4, merged: 18, scores: [3.05, 3.4, 3.25, 2.85, 3.85, 2.7, 2.55, 3.15], note: "Often merges his own PRs, including ones the pipeline stopped.", representative: 30257, worst: { pr: 19093, score: 18, why: "New npm dependencies and a +2.4k crash pipeline" } },
  { login: "NikitaMGrimm", batch: 4, merged: 18, scores: [2.95, 3.6, 3.0, 2.8, 3.85, 2.65, 2.6, 3.25], note: "Focused, real fixes that still needed takeovers to cut the tests.", representative: 18308, worst: { pr: 19168, score: 21, why: "Four composer fixes bundled together; asked to split" } },
  { login: "Jo2234", batch: 4, merged: 17, scores: [3.85, 3.95, 3.55, 3.0, 3.95, 2.4, 3.05, 3.45], note: "The best scope and fit of anyone: one problem per PR, 10–60 lines.", representative: 30721, worst: { pr: 30645, score: 23, why: "The claimed bug didn't appear on base" } },
  { login: "Michel-Liao", batch: 4, merged: 17, scores: [3.45, 3.65, 3.4, 2.9, 3.9, 2.35, 2.9, 3.2], note: "A November batch of near-identical small fixes found in real fixtures.", representative: 40509, worst: { pr: 11503, score: 21, why: "Close to a feature, with the evidence box unchecked" } },
  { login: "luke2x", batch: 4, merged: 16, scores: [3.2, 3.4, 3.3, 2.95, 3.6, 2.1, 2.6, 3.25], note: "Bounded fixes score about 27. Unapproved features and bundles pull the average down.", representative: 17922, worst: { pr: 24168, score: 14, why: "A +3.3k rewrite whose bug didn't reproduce on base" } },
];

export const totalOf = (c: ScoredContributor) => c.scores.reduce((sum, s) => sum + s, 0);
