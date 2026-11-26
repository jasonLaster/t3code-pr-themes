import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ConvexError } from "convex/values";
import { BookmarkIcon, GlobeIcon, LockIcon } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { UserAvatar, useMe, useSignIn } from "@/auth";
import { Button, buttonVariants } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

type Lists = FunctionReturnType<typeof api.views.list>;
export type SavedView = Lists["mine"][number] & { owner?: Lists["shared"][number]["owner"] };
export type ViewState = { q: string; group: string; sort: string };

export const useSavedViews = () => useQuery(api.views.list);

export const sameState = (v: ViewState, s: ViewState) => v.q === s.q && v.group === s.group && v.sort === s.sort;

const errorText = (e: unknown) => (e instanceof ConvexError ? String(e.data) : "Something went wrong. Try again.");

function NavItem({ active, onClick, count, children }: { active: boolean; onClick: () => void; count: number; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-current={active || undefined}
      className="flex h-7 w-full cursor-default items-center gap-2 rounded-md px-2 text-left text-[13px] font-[450] text-sidebar-foreground/85 hover:bg-sidebar-accent aria-current:bg-sidebar-accent aria-current:text-sidebar-foreground"
    >
      {children}
      <span className="ml-auto text-xs text-muted-foreground tabular-nums">{count.toLocaleString()}</span>
    </button>
  );
}

/** "My views" and "Shared views" sidebar sections. */
export function SavedViewsNav({
  lists,
  activeId,
  open,
  count,
}: {
  lists: Lists | undefined;
  activeId: Id<"views"> | null;
  open: (v: SavedView) => void;
  count: (v: SavedView) => number;
}) {
  if (!lists) return null;
  const section = (label: string, views: SavedView[]) =>
    views.length > 0 && (
      <div className="space-y-px">
        <div className="px-2 pb-1 text-xs text-muted-foreground">{label}</div>
        {views.map((v) => (
          <NavItem key={v._id} active={v._id === activeId} count={count(v)} onClick={() => open(v)}>
            {v.owner ? (
              <UserAvatar src={v.owner.avatarUrl} login={v.owner.login} className="size-3.5" />
            ) : v.public ? (
              <GlobeIcon className="size-3.5 shrink-0 text-muted-foreground" aria-label="Public" />
            ) : (
              <BookmarkIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            )}
            <span className="truncate" title={v.owner ? `${v.name} · by ${v.owner.login}` : v.name}>
              {v.name}
            </span>
          </NavItem>
        ))}
      </div>
    );
  return (
    <>
      {section("My views", lists.mine)}
      {section("Shared views", lists.shared)}
    </>
  );
}

/**
 * Header control for saving the current filters, grouping and ordering. With a
 * view of yours open it offers to update, rename, share or delete it.
 */
export function SaveViewMenu({
  state,
  view,
  onSaved,
}: {
  state: ViewState;
  /** The open view if it's yours. */
  view: SavedView | null;
  onSaved: (id: Id<"views"> | null) => void;
}) {
  const me = useMe();
  const { signIn } = useSignIn();
  const create = useMutation(api.views.create);
  const update = useMutation(api.views.update);
  const remove = useMutation(api.views.remove);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [isPublic, setPublic] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = view !== null && !sameState(view, state);

  const reset = (next: boolean) => {
    setOpen(next);
    setError(null);
    if (next) {
      setName(view?.name ?? "");
      setPublic(view?.public ?? false);
    }
  };
  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      setOpen(false);
    } catch (e) {
      setError(errorText(e));
    }
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () =>
      view
        ? update({ id: view._id, name, public: isPublic, ...(dirty && state) })
        : onSaved(await create({ name, public: isPublic, ...state })),
    );
  };

  if (me === undefined) return null;
  if (!me)
    return (
      <Button variant="ghost" size="sm" onClick={() => void signIn()} title="Sign in with GitHub to save views">
        <BookmarkIcon aria-hidden="true" />
        Save view
      </Button>
    );

  return (
    <div className="flex items-center gap-1">
      {dirty && (
        <Button variant="ghost" size="sm" onClick={() => void run(() => update({ id: view._id, ...state }))}>
          Update view
        </Button>
      )}
      <Popover open={open} onOpenChange={reset}>
        <PopoverTrigger className={cn(buttonVariants({ variant: "ghost", size: view ? "icon-sm" : "sm" }))} aria-label={view ? "View settings" : "Save view"}>
          {view?.public ? <GlobeIcon aria-hidden="true" /> : <BookmarkIcon aria-hidden="true" />}
          {!view && "Save view"}
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 p-3 text-[13px]">
          <PopoverTitle className="mb-3 text-[13px] font-[590]">{view ? "Edit view" : "Save view"}</PopoverTitle>
          <form onSubmit={submit} className="space-y-3">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="View name"
              maxLength={80}
              className="h-7 w-full rounded-md border border-border bg-secondary/60 px-2 text-[13px] outline-none placeholder:text-muted-foreground focus:border-ring focus:bg-background"
            />
            <label className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2">
                {isPublic ? <GlobeIcon className="size-3.5" aria-hidden="true" /> : <LockIcon className="size-3.5" aria-hidden="true" />}
                {isPublic ? "Public: everyone sees it" : "Private: only you"}
              </span>
              <Switch checked={isPublic} onCheckedChange={setPublic} />
            </label>
            {dirty && <p className="text-xs text-muted-foreground">Saving also updates the view to the current filters.</p>}
            {error && <p className="text-xs text-destructive">{error}</p>}
            <div className="flex gap-2">
              {view && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="hover:text-destructive"
                  onClick={() =>
                    confirm(`Delete "${view.name}"?`) &&
                    void run(async () => {
                      await remove({ id: view._id });
                      onSaved(null);
                    })
                  }
                >
                  Delete
                </Button>
              )}
              <Button type="submit" size="sm" variant="default" className="ml-auto" disabled={!name.trim()}>
                {view ? "Save" : "Save view"}
              </Button>
            </div>
          </form>
        </PopoverContent>
      </Popover>
    </div>
  );
}
