import {
  Select,
  SelectContent as SelectContentPrimitive,
  SelectItem as SelectItemPrimitive,
  SelectItemIndicator,
  SelectLabel,
  SelectTrigger as SelectTriggerPrimitive,
  SelectValue,
} from "@ui-sdk/react/select";
import { CheckIcon, ChevronDownIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

function SelectTrigger({ className, children, ...props }: Omit<ComponentProps<typeof SelectTriggerPrimitive>, "children"> & { children?: ReactNode }) {
  return (
    <SelectTriggerPrimitive
      className={cn(
        "inline-flex h-7 cursor-default items-center justify-between gap-1.5 rounded-md border border-border bg-card px-2 text-[13px] text-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/60 data-open:bg-accent",
        className,
      )}
      {...props}
    >
      {children}
      <ChevronDownIcon className="size-3.5 text-muted-foreground" aria-hidden="true" />
    </SelectTriggerPrimitive>
  );
}

function SelectContent({ className, ...props }: ComponentProps<typeof SelectContentPrimitive>) {
  return (
    <SelectContentPrimitive
      className={cn(
        "z-[60] min-w-(--anchor-width) rounded-lg border border-border bg-popover p-1 text-[13px] text-popover-foreground shadow-lg outline-none",
        "transition-opacity duration-100 data-starting-style:opacity-0 data-ending-style:opacity-0",
        className,
      )}
      {...props}
    />
  );
}

function SelectItem({ className, children, ...props }: Omit<ComponentProps<typeof SelectItemPrimitive>, "children"> & { children?: ReactNode }) {
  return (
    <SelectItemPrimitive
      className={cn("flex h-7 cursor-default items-center gap-2 rounded-md px-2 outline-none select-none data-highlighted:bg-accent", className)}
      {...props}
    >
      {children}
      <SelectItemIndicator className="ml-auto">
        <CheckIcon className="size-3.5" aria-hidden="true" />
      </SelectItemIndicator>
    </SelectItemPrimitive>
  );
}

export { Select, SelectContent, SelectItem, SelectLabel, SelectTrigger, SelectValue };
