import {
  SegmentedControl as SegmentedControlPrimitive,
  SegmentedControlIndicator as SegmentedControlIndicatorPrimitive,
  SegmentedControlItem as SegmentedControlItemPrimitive,
} from "@ui-sdk/react/segmented-control";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

function SegmentedControl({ className, ...props }: ComponentProps<typeof SegmentedControlPrimitive>) {
  return (
    <SegmentedControlPrimitive
      className={cn(
        "relative isolate inline-flex h-7 items-center rounded-md border border-border bg-muted/70 p-0.5 text-xs select-none",
        className,
      )}
      {...props}
    />
  );
}

function SegmentedControlIndicator({ className, ...props }: ComponentProps<typeof SegmentedControlIndicatorPrimitive>) {
  return (
    <SegmentedControlIndicatorPrimitive
      className={cn(
        "pointer-events-none absolute -z-1 rounded-[5px] border border-border/80 bg-card shadow-xs",
        "top-(--segmented-control-indicator-top) left-(--segmented-control-indicator-left) h-(--segmented-control-indicator-height) w-(--segmented-control-indicator-width)",
        "transition-[top,left,width,height] duration-150 ease-out data-[activation-direction=none]:transition-none motion-reduce:transition-none",
        className,
      )}
      {...props}
    />
  );
}

function SegmentedControlItem({ className, ...props }: ComponentProps<typeof SegmentedControlItemPrimitive>) {
  return (
    <SegmentedControlItemPrimitive
      className={cn(
        "inline-flex h-full cursor-default items-center justify-center gap-1.5 rounded-[5px] px-2 font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 data-checked:text-foreground [&_svg]:size-3.5 [&_svg]:shrink-0",
        className,
      )}
      {...props}
    />
  );
}

export { SegmentedControl, SegmentedControlIndicator, SegmentedControlItem };
