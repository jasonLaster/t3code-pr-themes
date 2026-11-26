import { assess, reviews, rubric, scoreTone, type Review } from "./assessment";
import { cn } from "@/lib/utils";
import type { Pr } from "./sync";
import weekly from "./weekly-reviews.json";

const weeklyReviews = weekly as unknown as Record<number, Review>;

export default function ReviewPanel({ pr }: { pr: Pr }) {
  const scores = weeklyReviews[pr.number] ?? reviews[pr.number];
  const summary = assess(pr);
  return <section className="text-sm">
    <h3 className="mb-2 flex items-center gap-2 font-semibold">PR review {summary && <span className={cn("rounded-full px-2 py-px text-xs tabular-nums", scoreTone(summary.total))} title="Out of 60">{summary.total}</span>}</h3>
    {scores ? <>
      <a className="underline" href={scores.base ? `https://github.com/pingdotgg/t3code/compare/${scores.base}...${scores.head}` : `https://github.com/pingdotgg/t3code/pull/${pr.number}/files/${scores.head}`}>Reviewed revision {scores.head.slice(0, 7)}</a>
      {scores.base && <p className="mt-1 text-xs text-muted-foreground">AI review of the description and {scores.excerpted ? "selected diff excerpts" : "changed code"}. Test outcomes are author-reported.</p>}
      <dl>{scores.grades.map(([score, evidence], index) => <div className="mt-2" key={index}>
        <dt className="font-medium">{rubric[index][0]} · {score}/10</dt><dd>{evidence}</dd>
      </div>)}</dl>
    </> : <p>Awaiting code and QA review.</p>}
    <details className="mt-2 text-xs text-muted-foreground"><summary className="cursor-pointer">Scoring rubric · six equally weighted dimensions</summary>
      {rubric.map(([name, guide]) => <p className="mt-2" key={name}><strong>{name}. </strong>{guide}</p>)}
    </details>
  </section>;
}
