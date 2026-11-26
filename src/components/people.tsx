import { Badge } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";
import { ALIASES, type Tier, type Who } from "@/model";

export const STATE_LABEL = { open: "Open", merged: "Merged", closed: "Closed" } as const;
export const TIER_LABEL: Record<Tier, string> = { maintainer: "Maintainer", vouched: "Vouched", community: "Unvouched", denounced: "Denounced" };
export const aliasOf = (login: string) => Object.entries(ALIASES).find(([, l]) => l === login.toLowerCase())?.[0];

export function Dot({ who, className }: { who: Who; className?: string }) {
  return <span aria-hidden="true" className={cn("inline-block size-2 shrink-0 rounded-full", className)} style={{ background: `var(--${who})` }} />;
}

export function Avatar({ login, className }: { login: string; className?: string }) {
  return (
    <img
      alt=""
      loading="lazy"
      src={`https://avatars.githubusercontent.com/${encodeURIComponent(login)}?s=40`}
      className={cn("size-4 shrink-0 rounded-full bg-muted", className)}
    />
  );
}

export function TierBadge({ tier }: { tier: Tier }) {
  if (tier === "community") return null;
  return (
    <Badge
      className={cn(
        tier === "maintainer" && "text-(--maintainer)",
        tier === "vouched" && "text-(--vouched)",
        tier === "denounced" && "border-destructive/50 text-destructive",
      )}
    >
      {TIER_LABEL[tier]}
    </Badge>
  );
}
