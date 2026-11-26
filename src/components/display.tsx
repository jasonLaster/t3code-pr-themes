import { BarChart3Icon, ListIcon, SlidersHorizontalIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { SegmentedControl, SegmentedControlIndicator, SegmentedControlItem } from "@/components/ui/segmented-control";
import { Select, SelectContent, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { GroupOption } from "@/fields";
import { SORT_LABEL, type SortBy, type ViewMode } from "@/model";

type Props = {
  view: ViewMode;
  setView: (v: ViewMode) => void;
  groups: GroupOption[];
  group: string;
  setGroup: (g: string) => void;
  sort: SortBy;
  setSort: (s: SortBy) => void;
};

const sortItems = (Object.keys(SORT_LABEL) as SortBy[]).map((value) => ({ value, label: SORT_LABEL[value] }));

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      {children}
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function DisplayMenu({ view, setView, groups, group, setGroup, sort, setSort }: Props) {
  const groupItems = groups.map(({ value, label }) => ({ value, label }));
  return (
    <Popover>
      <PopoverTrigger className={cn(buttonVariants({ variant: "outline" }))}>
        <SlidersHorizontalIcon aria-hidden="true" />
        Display
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-3 p-3 text-[13px]">
        <PopoverTitle className="sr-only">Display options</PopoverTitle>
        <SegmentedControl
          aria-label="View layout"
          value={view}
          onValueChange={(v) => v && setView(v as ViewMode)}
          className="grid h-12 w-full grid-cols-2 p-1"
        >
          <SegmentedControlIndicator />
          <SegmentedControlItem value="list" className="flex-col gap-0.5 text-xs">
            <ListIcon aria-hidden="true" />
            List
          </SegmentedControlItem>
          <SegmentedControlItem value="insights" className="flex-col gap-0.5 text-xs">
            <BarChart3Icon aria-hidden="true" />
            Insights
          </SegmentedControlItem>
        </SegmentedControl>
        <Row label="Grouping">
          <Select items={groupItems} value={group} onValueChange={(v) => v && setGroup(v)}>
            <SelectLabel className="text-muted-foreground">Grouping</SelectLabel>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {groupItems.map((i) => (
                <SelectItem key={i.value} value={i.value}>
                  {i.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
        <Row label="Ordering">
          <Select items={sortItems} value={sort} onValueChange={(v) => v && setSort(v as SortBy)}>
            <SelectLabel className="text-muted-foreground">Ordering</SelectLabel>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sortItems.map((i) => (
                <SelectItem key={i.value} value={i.value}>
                  {i.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
      </PopoverContent>
    </Popover>
  );
}
