import { Button as ButtonPrimitive } from "@ui-sdk/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 cursor-default items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-transparent text-[13px] font-medium outline-none select-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        outline: "border-border bg-card text-foreground shadow-xs hover:bg-accent data-open:bg-accent",
        ghost: "text-muted-foreground hover:bg-accent hover:text-foreground data-open:bg-accent data-open:text-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-accent",
      },
      size: {
        default: "h-7 px-2.5",
        sm: "h-6 px-2 text-xs",
        icon: "size-7",
        "icon-sm": "size-6",
      },
    },
    defaultVariants: { variant: "outline", size: "default" },
  },
);

function Button({
  className,
  variant,
  size,
  ...props
}: ComponentProps<typeof ButtonPrimitive> & VariantProps<typeof buttonVariants>) {
  return <ButtonPrimitive className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export { Button, buttonVariants };
