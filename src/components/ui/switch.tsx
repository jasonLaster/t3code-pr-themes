import { Switch as SwitchPrimitive, SwitchThumb } from "@ui-sdk/react/switch";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

function Switch({ className, ...props }: ComponentProps<typeof SwitchPrimitive>) {
  return (
    <SwitchPrimitive
      className={cn(
        "inline-flex h-4 w-7 shrink-0 cursor-default items-center rounded-full bg-input p-0.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60 data-checked:bg-primary",
        className,
      )}
      {...props}
    >
      <SwitchThumb className="size-3 rounded-full bg-white shadow-sm transition-transform data-checked:translate-x-3" />
    </SwitchPrimitive>
  );
}

export { Switch };
