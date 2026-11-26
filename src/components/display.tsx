import { SlidersHorizontalIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { GROUP_LABEL, SORT_LABEL, type GroupBy, type SortBy } from "@/model";

type Props = {
  group: GroupBy;
  setGroup: (g: GroupBy) => void;
  sort: SortBy;
  setSort: (s: SortBy) => void;
  insights: boolean;
  setInsights: (v: boolean) => void;
};

const groupItems = (Object.keys(GROUP_LABEL) as GroupBy[]).map((value) => ({ value, label: GROUP_LABEL[value] }));
const sortItems = (Object.keys(SORT_LABEL) as SortBy[]).map((value) => ({ value, label: SORT_LABEL[value] }));

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      {children}
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function DisplayMenu({ group, setGroup, sort, setSort, insights, setInsights }: Props) {
  return (
    <Popover>
      <PopoverTrigger className={cn(buttonVariants({ variant: "outline" }))}>
        <SlidersHorizontalIcon aria-hidden="true" />
        Display
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-3 p-3 text-[13px]">
        <PopoverTitle className="sr-only">Display options</PopoverTitle>
        <Row label="Grouping">
          <Select items={groupItems} value={group} onValueChange={(v) => v && setGroup(v as GroupBy)}>
            <SelectLabel className="text-muted-foreground">Grouping</SelectLabel>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {groupItems.map((i) => (
                <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>
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
                <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
        <label className="flex items-center justify-between gap-3 border-t border-border pt-3">
          <span>Show insights chart</span>
          <Switch checked={insights} onCheckedChange={setInsights} />
        </label>
      </PopoverContent>
    </Popover>
  );
}
