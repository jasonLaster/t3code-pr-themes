import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useState, type FormEvent, type KeyboardEvent } from "react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { MarkdownBody } from "@/Description";
import { SignInButton, UserAvatar, useMe } from "@/auth";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const errorText = (e: unknown) => (e instanceof ConvexError ? String(e.data) : "Something went wrong. Try again.");

function when(ms: number) {
  const s = (Date.now() - ms) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return new Date(ms).toLocaleDateString(undefined, { dateStyle: "medium" });
}

function Editor({
  initial = "",
  placeholder,
  submitLabel,
  onSubmit,
  onCancel,
  autoFocus,
}: {
  initial?: string;
  placeholder?: string;
  submitLabel: string;
  onSubmit: (body: string) => Promise<unknown>;
  onCancel?: () => void;
  autoFocus?: boolean;
}) {
  const [body, setBody] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!body.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(body);
      setBody("");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit();
    if (e.key === "Escape" && onCancel) {
      e.stopPropagation();
      onCancel();
    }
  };
  return (
    <form onSubmit={submit} className="space-y-2">
      <textarea
        data-comment-box
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        autoFocus={autoFocus}
        rows={3}
        className="field-sizing-content block max-h-80 min-h-18 w-full resize-none rounded-md border border-border bg-secondary/40 px-3 py-2 text-[13px] outline-none placeholder:text-muted-foreground focus:border-ring focus:bg-background"
      />
      <div className="flex items-center gap-2">
        {error && <span className="text-xs text-destructive">{error}</span>}
        <span className="ml-auto hidden text-xs text-muted-foreground sm:inline">Markdown supported · ⌘↵ to send</span>
        {onCancel && (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" size="sm" disabled={!body.trim() || busy}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

export function Discussion({ pr }: { pr: number }) {
  const comments = useQuery(api.comments.list, { pr });
  const me = useMe();
  const add = useMutation(api.comments.add);
  const edit = useMutation(api.comments.edit);
  const remove = useMutation(api.comments.remove);
  const [editing, setEditing] = useState<Id<"comments"> | null>(null);

  return (
    <section aria-label="Comments in this app" className="mt-8 border-t border-border pt-6">
      <h3 className="text-[13px] font-[590]">
        Comments in this app{comments?.length ? <span className="ml-1.5 font-normal text-muted-foreground tabular-nums">{comments.length}</span> : null}
      </h3>
      <p className="mb-4 text-xs text-muted-foreground">Visible to everyone here; not posted to GitHub.</p>
      {comments === undefined ? (
        <p className="text-[13px] text-muted-foreground">Loading comments…</p>
      ) : (
        <ol className="mb-5 space-y-5">
          {comments.map((c) => (
            <li key={c._id} className="group flex gap-3">
              <UserAvatar src={c.author?.avatarUrl ?? null} login={c.author?.login ?? "ghost"} className="mt-0.5 size-6" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2 text-[13px]">
                  <a href={`https://github.com/${c.author?.login}`} target="_blank" rel="noopener noreferrer" className="font-[510] hover:underline">
                    {c.author?.login ?? "deleted user"}
                  </a>
                  <span className="text-xs text-muted-foreground" title={new Date(c.createdAt).toLocaleString()}>
                    {when(c.createdAt)}
                    {c.editedAt && " · edited"}
                  </span>
                  {editing !== c._id && (c.canEdit || c.canDelete) && (
                    <span className="ml-auto flex gap-2 text-xs text-muted-foreground opacity-0 group-focus-within:opacity-100 group-hover:opacity-100">
                      {c.canEdit && (
                        <button className="cursor-default hover:text-foreground" onClick={() => setEditing(c._id)}>
                          Edit
                        </button>
                      )}
                      {c.canDelete && (
                        <button
                          className="cursor-default hover:text-destructive"
                          onClick={() => confirm("Delete this comment?") && void remove({ id: c._id })}
                        >
                          Delete
                        </button>
                      )}
                    </span>
                  )}
                </div>
                {editing === c._id ? (
                  <div className="mt-2">
                    <Editor
                      initial={c.body}
                      submitLabel="Save"
                      autoFocus
                      onCancel={() => setEditing(null)}
                      onSubmit={async (body) => {
                        await edit({ id: c._id, body });
                        setEditing(null);
                      }}
                    />
                  </div>
                ) : (
                  <div className="mt-1 text-[13px]">
                    <MarkdownBody body={c.body} />
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
      {me === undefined ? null : me ? (
        <div className="flex gap-3">
          <UserAvatar src={me.avatarUrl} login={me.login} className="mt-1 size-6" />
          <div className="min-w-0 flex-1">
            <Editor placeholder="Leave a comment…" submitLabel="Comment" onSubmit={(body) => add({ pr, body })} />
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-md border border-dashed border-border px-3 py-3 text-[13px] text-muted-foreground">
          Sign in to join the discussion.
          <SignInButton className={cn(buttonVariants({ variant: "outline", size: "sm" }), "ml-auto")} />
        </div>
      )}
    </section>
  );
}
