import {
  Popover,
  PopoverContent as PopoverContentPrimitive,
  PopoverTitle,
  PopoverTrigger,
} from "@ui-sdk/react/popover";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

function PopoverContent({ className, sideOffset = 6, align = "start", ...props }: ComponentProps<typeof PopoverContentPrimitive>) {
  return (
    <PopoverContentPrimitive
      sideOffset={sideOffset}
      align={align}
      className={cn(
        "z-50 rounded-lg border border-border bg-popover text-popover-foreground shadow-lg outline-none",
        "origin-(--transform-origin) transition-[opacity,scale] duration-100 data-starting-style:scale-[0.97] data-starting-style:opacity-0 data-ending-style:opacity-0",
        className,
      )}
      {...props}
    />
  );
}

export { Popover, PopoverContent, PopoverTitle, PopoverTrigger };
