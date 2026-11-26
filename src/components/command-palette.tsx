import { ArrowUpRightIcon, ChevronRightIcon, GitPullRequestIcon, LayersIcon, ListOrderedIcon, BarChart3Icon, XIcon, CheckIcon, LinkIcon, UserIcon } from "lucide-react";
import { useMemo, useState } from "react";
import type { Facet } from "@/components/filters";
import { Command, CommandEmpty, CommandGroup, CommandGroupLabel, CommandInput, CommandItem, CommandList, CommandPage } from "@/components/ui/command";
import { Dialog, DialogBackdrop, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { GROUP_LABEL, SORT_LABEL, isActive, toggleToken, type GroupBy, type SortBy } from "@/model";
import type { Pr } from "@/sync";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prs: Pr[];
  facets: Facet[];
  q: string;
  setQ: (update: (q: string) => string) => void;
  setGroup: (g: GroupBy) => void;
  setSort: (s: SortBy) => void;
  toggleInsights: () => void;
  selected: Pr | null;
  openPr: (n: number) => void;
};

const prUrl = (n: number) => `https://github.com/pingdotgg/t3code/pull/${n}`;

export function CommandPalette({ open, onOpenChange, prs, facets, q, setQ, setGroup, setSort, toggleInsights, selected, openPr }: Props) {
  const [query, setQuery] = useState("");
  const [pages, setPages] = useState<string[]>([]);

  // Only the best few PR matches become commands; thousands of items would swamp the list.
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase().replace(/^#/, "");
    if (pages.length || needle.length < 2) return [];
    return prs.filter((pr) => String(pr.number).startsWith(needle) || pr.title.toLowerCase().includes(needle)).slice(0, 20);
  }, [prs, query, pages.length]);

  const run = (fn: () => void) => () => {
    fn();
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (next) {
          setQuery("");
          setPages([]);
        }
      }}
    >
      <DialogBackdrop />
      <DialogContent>
        <DialogTitle className="sr-only">Command menu</DialogTitle>
        <Command filter="contains" query={query} onQueryChange={setQuery} pages={pages} onPagesChange={setPages}>
          <CommandInput className="h-12 px-4 text-[15px]" aria-label="Search commands and pull requests" placeholder="Type a command or search pull requests…" />
          <CommandEmpty>No results</CommandEmpty>
          <CommandList className="max-h-[min(440px,60vh)]">
            <CommandPage>
              {matches.length > 0 && (
                <CommandGroup>
                  <CommandGroupLabel>Pull requests</CommandGroupLabel>
                  {matches.map((pr) => (
                    <CommandItem key={pr.number} value={`pr:${pr.number}`} label={`#${pr.number} ${pr.title}`} onSelect={run(() => openPr(pr.number))}>
                      <GitPullRequestIcon />
                      <span className="w-14 shrink-0 text-muted-foreground tabular-nums">#{pr.number}</span>
                      <span className="truncate">{pr.title}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {selected && (
                <CommandGroup>
                  <CommandGroupLabel>#{selected.number}</CommandGroupLabel>
                  <CommandItem value="open-github" onSelect={run(() => window.open(prUrl(selected.number), "_blank", "noopener"))}>
                    <ArrowUpRightIcon />
                    <span className="flex-1">Open on GitHub</span>
                    <Kbd>O</Kbd>
                  </CommandItem>
                  <CommandItem value="copy-link" onSelect={run(() => void navigator.clipboard.writeText(prUrl(selected.number)))}>
                    <LinkIcon />
                    Copy link
                  </CommandItem>
                  <CommandItem value="filter-author" label={`Filter by author ${selected.author}`} onSelect={run(() => setQ((cur) => toggleToken(cur, "author", selected.author)))}>
                    <UserIcon />
                    Filter by {selected.author}
                  </CommandItem>
                </CommandGroup>
              )}
              <CommandGroup>
                <CommandGroupLabel>Filter</CommandGroupLabel>
                {facets.map((f) => (
                  <CommandItem key={f.key} value={`page:${f.key}`} page={f.key} label={`Filter by ${f.label}`}>
                    <f.icon />
                    <span className="flex-1">Filter by {f.label.toLowerCase()}…</span>
                    <ChevronRightIcon />
                  </CommandItem>
                ))}
                {q && (
                  <CommandItem value="clear" label="Clear filters" onSelect={run(() => setQ(() => ""))}>
                    <XIcon />
                    Clear filters
                  </CommandItem>
                )}
              </CommandGroup>
              <CommandGroup>
                <CommandGroupLabel>View</CommandGroupLabel>
                <CommandItem value="group" page="group" label="Group by">
                  <LayersIcon />
                  <span className="flex-1">Group by…</span>
                  <ChevronRightIcon />
                </CommandItem>
                <CommandItem value="sort" page="sort" label="Order by">
                  <ListOrderedIcon />
                  <span className="flex-1">Order by…</span>
                  <ChevronRightIcon />
                </CommandItem>
                <CommandItem value="insights" label="Toggle insights chart" onSelect={run(toggleInsights)}>
                  <BarChart3Icon />
                  <span className="flex-1">Toggle insights chart</span>
                  <Kbd>I</Kbd>
                </CommandItem>
              </CommandGroup>
            </CommandPage>
            {facets.map((f) => (
              <CommandPage key={f.key} value={f.key}>
                {f.values.map((v) => (
                  <CommandItem
                    key={v.value}
                    value={`${f.key}:${v.value}`}
                    label={v.label}
                    keywords={[v.value]}
                    onSelect={(event) => {
                      event.preventDefault();
                      setQ((cur) => toggleToken(cur, f.key, v.value));
                    }}
                  >
                    {v.leading}
                    <span className="flex-1 truncate">{v.label}</span>
                    {isActive(q, f.key, v.value) && <CheckIcon />}
                    <span className="text-xs text-muted-foreground tabular-nums">{v.count}</span>
                  </CommandItem>
                ))}
              </CommandPage>
            ))}
            <CommandPage value="group">
              {(Object.keys(GROUP_LABEL) as GroupBy[]).map((g) => (
                <CommandItem key={g} value={`group:${g}`} label={GROUP_LABEL[g]} onSelect={run(() => setGroup(g))}>
                  {GROUP_LABEL[g]}
                </CommandItem>
              ))}
            </CommandPage>
            <CommandPage value="sort">
              {(Object.keys(SORT_LABEL) as SortBy[]).map((s) => (
                <CommandItem key={s} value={`sort:${s}`} label={SORT_LABEL[s]} onSelect={run(() => setSort(s))}>
                  {SORT_LABEL[s]}
                </CommandItem>
              ))}
            </CommandPage>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
