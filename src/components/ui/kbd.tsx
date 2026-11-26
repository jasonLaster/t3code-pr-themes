import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

function Kbd({ className, ...props }: ComponentProps<"kbd">) {
  return (
    <kbd
      className={cn(
        "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded border border-border bg-muted px-1 font-sans text-[11px] font-medium text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

function Badge({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "inline-flex h-[18px] items-center rounded-full border border-border px-1.5 text-[11px] font-medium text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

export { Badge, Kbd };
