import {
  Dialog,
  DialogBackdrop as DialogBackdropPrimitive,
  DialogContent as DialogContentPrimitive,
  DialogTitle,
} from "@ui-sdk/react/dialog";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

function DialogBackdrop({ className, ...props }: ComponentProps<typeof DialogBackdropPrimitive>) {
  return (
    <DialogBackdropPrimitive
      className={cn("fixed inset-0 z-50 bg-black/30 transition-opacity duration-100 data-starting-style:opacity-0 data-ending-style:opacity-0", className)}
      {...props}
    />
  );
}

function DialogContent({ className, ...props }: ComponentProps<typeof DialogContentPrimitive>) {
  return (
    <DialogContentPrimitive
      className={cn(
        "fixed top-[14vh] left-1/2 z-50 w-[min(640px,calc(100vw-32px))] -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl outline-none",
        "transition-[opacity,scale] duration-100 data-starting-style:scale-[0.98] data-starting-style:opacity-0 data-ending-style:opacity-0",
        className,
      )}
      {...props}
    />
  );
}

export { Dialog, DialogBackdrop, DialogContent, DialogTitle };
