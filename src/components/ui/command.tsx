import {
  Command as CommandPrimitive,
  CommandEmpty as CommandEmptyPrimitive,
  CommandGroup,
  CommandGroupLabel as CommandGroupLabelPrimitive,
  CommandInput as CommandInputPrimitive,
  CommandItem as CommandItemPrimitive,
  CommandList as CommandListPrimitive,
  CommandPage,
  CommandSeparator as CommandSeparatorPrimitive,
  createCommandController,
} from "@ui-sdk/react/command";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

function Command({ className, ...props }: ComponentProps<typeof CommandPrimitive>) {
  return <CommandPrimitive className={cn("flex min-h-0 flex-col text-[13px]", className)} {...props} />;
}

function CommandInput({ className, ...props }: ComponentProps<typeof CommandInputPrimitive>) {
  return (
    <CommandInputPrimitive
      className={cn(
        "h-9 w-full border-0 border-b border-border bg-transparent px-3 text-[13px] text-foreground outline-none placeholder:text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

function CommandList({ className, ...props }: ComponentProps<typeof CommandListPrimitive>) {
  return <CommandListPrimitive className={cn("max-h-80 overflow-y-auto overscroll-contain p-1", className)} {...props} />;
}

function CommandEmpty({ className, ...props }: ComponentProps<typeof CommandEmptyPrimitive>) {
  return (
    <CommandEmptyPrimitive
      className={cn("hidden px-3 py-6 text-center text-muted-foreground data-empty:block", className)}
      {...props}
    />
  );
}

function CommandGroupLabel({ className, ...props }: ComponentProps<typeof CommandGroupLabelPrimitive>) {
  return (
    <CommandGroupLabelPrimitive className={cn("px-2 pt-2 pb-1 text-[11px] font-medium text-muted-foreground", className)} {...props} />
  );
}

function CommandItem({ className, ...props }: ComponentProps<typeof CommandItemPrimitive>) {
  return (
    <CommandItemPrimitive
      className={cn(
        "flex h-8 cursor-default items-center gap-2 rounded-md px-2 text-foreground outline-none select-none data-disabled:opacity-50 data-highlighted:bg-accent [&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

function CommandSeparator({ className, ...props }: ComponentProps<typeof CommandSeparatorPrimitive>) {
  return <CommandSeparatorPrimitive className={cn("-mx-1 my-1 h-px bg-border", className)} {...props} />;
}

export {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandGroupLabel,
  CommandInput,
  CommandItem,
  CommandList,
  CommandPage,
  CommandSeparator,
  createCommandController,
};
