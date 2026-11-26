import { useMutation, useQuery } from "convex/react";
import { ArrowUpRightIcon, ChevronRightIcon, FileCodeIcon, RefreshCwIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../convex/_generated/api";
import { MarkdownBody } from "@/Description";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

type Item = NonNullable<ReturnType<typeof useComments>>["items"][number];

const BOTS = new Set(["coderabbitai", "vercel", "github-actions", "changeset-bot", "codecov", "dependabot", "renovate", "cursor", "greptile-apps", "copilot-pull-request-reviewer"]);
export const isBot = (login: string) => BOTS.has(login.toLowerCase()) || /\[bot\]$|-bot$/i.test(login);

const HIDE_BOTS_KEY = "comments:hideBots";
const HIDE_RESOLVED_KEY = "comments:hideResolved";

function readFlag(key: string, fallback: boolean) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : raw === "1";
  } catch {
    return fallback;
  }
}
function useStoredFlag(key: string, fallback: boolean) {
  const [value, setValue] = useState(() => readFlag(key, fallback));
  const set = (next: boolean) => {
    setValue(next);
    try {
      localStorage.setItem(key, next ? "1" : "0");
    } catch {}
  };
  return [value, set] as const;
}

function ago(iso: string) {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 60) return `${Math.floor(s / 86400)}d ago`;
  return `${Math.floor(s / (86400 * 30))}mo ago`;
}

const REVIEW_VERB: Record<string, string> = {
  APPROVED: "approved",
  CHANGES_REQUESTED: "requested changes",
  COMMENTED: "reviewed",
  DISMISSED: "reviewed (dismissed)",
};

function useComments(number: number) {
  return useQuery(api.prs.comments, { number });
}

/** Loads the GitHub conversation for a PR (fetching it on first open) and reports its size. */
export function useConversation(number: number, updatedAt: string) {
  const data = useComments(number);
  const ensure = useMutation(api.prs.ensureComments);
  useEffect(() => {
    void ensure({ number });
  }, [ensure, number, updatedAt]);
  return { data, refresh: () => void ensure({ number, force: true }) };
}

export function commentCount(items: Item[] | undefined) {
  if (!items) return undefined;
  return items.reduce((n, it) => n + 1 + (it.replies?.length ?? 0), 0);
}

function Avatar({ login }: { login: string }) {
  return (
    <img
      alt=""
      loading="lazy"
      src={`https://avatars.githubusercontent.com/${encodeURIComponent(login)}?s=40`}
      className="size-5 shrink-0 rounded-full bg-muted"
    />
  );
}

/** Long bodies (bot walkthroughs, big reviews) start clamped so the timeline stays scannable. */
function Body({ body }: { body: string }) {
  const long = body.length > 900 || body.split("\n").length > 18;
  const [open, setOpen] = useState(false);
  if (!body.trim()) return null;
  return (
    <div className="relative">
      <div className={cn(long && !open && "max-h-56 overflow-hidden [mask-image:linear-gradient(to_bottom,black_70%,transparent)]")}>
        <MarkdownBody body={body} className="md text-[13px]" />
      </div>
      {long && (
        <button onClick={() => setOpen((v) => !v)} className="mt-1 cursor-default text-xs text-muted-foreground hover:text-foreground">
          {open ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}

function Header({ author, verb, createdAt, url, children }: { author: string; verb: string; createdAt: string; url?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">
      <Avatar login={author} />
      <span className="font-[590] text-foreground">{author}</span>
      <span className="text-muted-foreground">{verb}</span>
      {children}
      <span className="ml-auto flex items-center gap-1 text-muted-foreground">
        <time dateTime={createdAt} title={new Date(createdAt).toLocaleString()}>
          {ago(createdAt)}
        </time>
        {url && (
          <a href={url} target="_blank" rel="noopener noreferrer" className="hover:text-foreground" aria-label="View on GitHub">
            <ArrowUpRightIcon className="size-3.5" aria-hidden="true" />
          </a>
        )}
      </span>
    </div>
  );
}

function Thread({ item }: { item: Item }) {
  const [open, setOpen] = useState(!item.resolved);
  const replies = item.replies ?? [];
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full cursor-default items-center gap-1.5 border-b border-border bg-muted/50 px-3 py-1.5 text-left text-xs hover:bg-hover"
        aria-expanded={open}
      >
        <ChevronRightIcon className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} aria-hidden="true" />
        <FileCodeIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0 truncate font-mono text-[11px]">
          {item.path}
          {item.line ? `:${item.line}` : ""}
        </span>
        {item.resolved && <span className="rounded bg-(--status-pass-bg) px-1.5 py-px text-[10px] text-(--status-pass)">Resolved</span>}
        {item.outdated && <span className="rounded bg-muted px-1.5 py-px text-[10px] text-muted-foreground">Outdated</span>}
        <span className="ml-auto shrink-0 text-muted-foreground">
          {!open && (
            <>
              {item.author}
              {replies.length > 0 && ` +${replies.length}`}
            </>
          )}
        </span>
      </button>
      {open && (
        <div className="divide-y divide-border">
          {[item, ...replies].map((c, i) => (
            <div key={i} className="space-y-2 px-3 py-2.5">
              <Header author={c.author} verb={i === 0 ? "commented" : "replied"} createdAt={c.createdAt} url={c.url} />
              <Body body={c.body} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Comments({ number, updatedAt }: { number: number; updatedAt: string }) {
  const { data, refresh } = useConversation(number, updatedAt);
  const [hideBots, setHideBots] = useStoredFlag(HIDE_BOTS_KEY, false);
  const [hideResolved, setHideResolved] = useStoredFlag(HIDE_RESOLVED_KEY, false);

  const { shown, bots, resolved } = useMemo(() => {
    const items = data?.items ?? [];
    return {
      bots: items.filter((it) => isBot(it.author)).length,
      resolved: items.filter((it) => it.kind === "thread" && it.resolved).length,
      shown: items.filter((it) => !(hideBots && isBot(it.author)) && !(hideResolved && it.kind === "thread" && it.resolved)),
    };
  }, [data, hideBots, hideResolved]);

  if (data === undefined || data === null) return <p className="text-[13px] text-muted-foreground">Loading comments from GitHub…</p>;

  return (
    <section aria-label="GitHub comments" className="space-y-3 text-[13px]">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <label className="inline-flex items-center gap-1.5">
          <Switch checked={hideBots} onCheckedChange={setHideBots} />
          Hide bots{bots > 0 && ` (${bots})`}
        </label>
        <label className="inline-flex items-center gap-1.5">
          <Switch checked={hideResolved} onCheckedChange={setHideResolved} />
          Hide resolved{resolved > 0 && ` (${resolved})`}
        </label>
        <button onClick={refresh} className="ml-auto inline-flex cursor-default items-center gap-1 hover:text-foreground" title={`Fetched ${ago(new Date(data.fetchedAt).toISOString())}`}>
          <RefreshCwIcon className="size-3" aria-hidden="true" />
          Refresh
        </button>
      </div>

      {shown.length === 0 ? (
        <p className="text-muted-foreground">{data.items.length === 0 ? "No comments yet." : "All comments are hidden by the filters above."}</p>
      ) : (
        <ol className="space-y-3">
          {shown.map((it, i) => (
            <li key={`${it.kind}:${it.url ?? i}`}>
              {it.kind === "thread" ? (
                <Thread item={it} />
              ) : (
                <div className={cn("space-y-2 rounded-lg border border-border bg-card px-3 py-2.5", it.reviewState === "CHANGES_REQUESTED" && "border-(--status-fail)/40", it.reviewState === "APPROVED" && "border-(--status-pass)/40")}>
                  <Header author={it.author} verb={it.kind === "review" ? REVIEW_VERB[it.reviewState ?? ""] ?? "reviewed" : "commented"} createdAt={it.createdAt} url={it.url} />
                  <Body body={it.body} />
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
      {data.truncated && (
        <p className="text-xs text-muted-foreground">
          Some long or older comments were trimmed.{" "}
          <a className="underline hover:text-foreground" href={`https://github.com/pingdotgg/t3code/pull/${number}`} target="_blank" rel="noopener noreferrer">
            See the full conversation on GitHub
          </a>
        </p>
      )}
    </section>
  );
}
