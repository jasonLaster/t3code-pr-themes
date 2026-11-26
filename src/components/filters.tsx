import { CheckIcon, ChevronRightIcon, XIcon, type LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Command, CommandEmpty, CommandGroup, CommandGroupLabel, CommandInput, CommandItem, CommandList, CommandPage } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { flipGroup, formatOpenedRange, isActive, parseQuery, removeGroup, toggleToken, type FilterKey } from "@/model";

export type FacetValue = { value: string; label: string; count: number; leading?: ReactNode };
export type Facet = {
  key: FilterKey;
  label: string;
  plural: string;
  icon: LucideIcon;
  /** One value at a time, like a date range: picking one replaces the other and closes the menu. */
  single?: boolean;
  values: FacetValue[];
};

type MenuProps = {
  facets: Facet[];
  q: string;
  setQ: (update: (q: string) => string) => void;
  /** Open straight onto one property's values, as a chip's value button does. */
  startPage?: FilterKey;
  neg?: boolean;
  triggerClassName?: string;
  trigger: ReactNode;
  shortcut?: string;
  label: string;
};

function Check({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-3.5 shrink-0 place-items-center rounded-[4px] border",
        on ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40",
      )}
    >
      {on && <CheckIcon className="size-2.5! text-primary-foreground!" strokeWidth={3} />}
    </span>
  );
}

export function FilterMenu({ facets, q, setQ, startPage, neg = false, triggerClassName, trigger, shortcut, label }: MenuProps) {
  const [open, setOpen] = useState(false);
  const [pages, setPages] = useState<string[]>([]);
  const [query, setQuery] = useState("");

  const valueItem = (facet: Facet, v: FacetValue, inSearch: boolean) => {
    const on = isActive(q, facet.key, v.value, neg);
    return (
      <CommandItem
        key={`${facet.key}:${v.value}`}
        value={`${facet.key}:${v.value}`}
        label={inSearch ? `${facet.label} ${v.label}` : v.label}
        keywords={[v.value]}
        onSelect={(event) => {
          event.preventDefault();
          setQ((cur) => toggleToken(cur, facet.key, v.value, neg));
          setQuery("");
          if (facet.single) setOpen(false);
        }}
      >
        {!facet.single && <Check on={on} />}
        {v.leading}
        <span className="min-w-0 flex-1 truncate">
          {inSearch && <span className="text-muted-foreground">{facet.label} · </span>}
          {v.label}
        </span>
        {facet.single && on && <CheckIcon />}
        <span className="text-xs text-muted-foreground tabular-nums">{v.count}</span>
      </CommandItem>
    );
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setPages(startPage ? [startPage] : []);
          setQuery("");
        }
      }}
    >
      <PopoverTrigger className={triggerClassName} shortcut={shortcut} aria-label={label}>
        {trigger}
      </PopoverTrigger>
      <PopoverContent
        className="w-72 overflow-hidden p-0"
        onKeyDownCapture={(event) => {
          // Linear closes the whole filter menu on Escape instead of stepping back a page.
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
          }
        }}
      >
        <Command
          filter="contains"
          query={query}
          onQueryChange={setQuery}
          pages={pages}
          onPagesChange={setPages}
        >
          <CommandInput
            aria-label="Filter"
            placeholder={pages.length ? `Filter by ${facets.find((f) => f.key === pages.at(-1))?.label.toLowerCase()}…` : "Filter…"}
          />
          <CommandEmpty>No results</CommandEmpty>
          <CommandList>
            <CommandPage>
              {facets.map((f) => (
                <CommandItem key={f.key} value={`page:${f.key}`} page={f.key} label={f.label}>
                  <f.icon />
                  <span className="flex-1">{f.label}</span>
                  <ChevronRightIcon />
                </CommandItem>
              ))}
              {query &&
                facets.map((f) => (
                  <CommandGroup key={f.key}>
                    <CommandGroupLabel>{f.label}</CommandGroupLabel>
                    {f.values.map((v) => valueItem(f, v, true))}
                  </CommandGroup>
                ))}
            </CommandPage>
            {facets.map((f) => (
              <CommandPage key={f.key} value={f.key}>
                {f.values.map((v) => valueItem(f, v, false))}
              </CommandPage>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

const seg = "flex h-full items-center gap-1 px-1.5 hover:bg-accent";

export function FilterChips({ facets, q, setQ }: { facets: Facet[]; q: string; setQ: (update: (q: string) => string) => void }) {
  const groups: { key: FilterKey; neg: boolean; values: string[] }[] = [];
  for (const t of parseQuery(q).tokens) {
    const g = groups.find((x) => x.key === t.key && x.neg === t.neg);
    if (g) g.values.push(t.value);
    else groups.push({ key: t.key, neg: t.neg, values: [t.value] });
  }
  if (groups.length === 0) return null;

  return (
    <>
      {groups.map(({ key, neg, values }) => {
        const facet = facets.find((f) => f.key === key)!;
        const labelOf = (v: string) =>
          (key === "opened" ? formatOpenedRange(v) : null) ?? facet.values.find((x) => x.value === v)?.label ?? v;
        const isDateRange = key === "opened" && values.length === 1 && formatOpenedRange(values[0]) !== null;
        const op = isDateRange ? "during" : facet.single ? "within" : values.length > 1 ? (neg ? "is none of" : "is any of") : neg ? "is not" : "is";
        return (
          <div
            key={`${key}${neg}`}
            className="flex h-6 items-stretch divide-x divide-border overflow-hidden rounded-md border border-border bg-card text-xs text-foreground"
          >
            <span className="flex items-center gap-1 px-1.5 text-muted-foreground">
              <facet.icon className="size-3" aria-hidden="true" />
              {facet.label}
            </span>
            {facet.single ? (
              <span className="flex items-center px-1.5 text-muted-foreground">{op}</span>
            ) : (
              <button className={cn(seg, "text-muted-foreground")} onClick={() => setQ((cur) => flipGroup(cur, key, neg))} title="Switch between is and is not">
                {op}
              </button>
            )}
            <FilterMenu
              facets={facets}
              q={q}
              setQ={setQ}
              startPage={key}
              neg={neg}
              label={`Change ${facet.label.toLowerCase()} filter`}
              triggerClassName={cn(seg, "max-w-56 data-open:bg-accent")}
              trigger={
                <>
                  {values.length <= 2 && facet.values.find((x) => x.value === values[0])?.leading}
                  <span className="truncate">{values.length <= 2 ? values.map(labelOf).join(", ") : `${values.length} ${facet.plural}`}</span>
                </>
              }
            />
            <button className={cn(seg, "text-muted-foreground")} onClick={() => setQ((cur) => removeGroup(cur, key, neg))} aria-label={`Remove ${facet.label} filter`}>
              <XIcon className="size-3" />
            </button>
          </div>
        );
      })}
    </>
  );
}
