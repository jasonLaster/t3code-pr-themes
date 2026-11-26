import { useAuthActions } from "@convex-dev/auth/react";
import { useOauth, useSignInWithGithub } from "@convex-dev/auth/methods/github/react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { LogOutIcon } from "lucide-react";
import { useState } from "react";
import { api } from "../convex/_generated/api";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type Me = NonNullable<FunctionReturnType<typeof api.users.me>>;

/** The signed-in user (null when signed out, undefined while loading). */
export const useMe = () => useQuery(api.users.me);

const FLOW_ERRORS: Record<string, string> = {
  ACCESS_DENIED: "GitHub sign-in was cancelled.",
  EXPIRED: "That sign-in link expired. Try again.",
  INVALID_FLOW: "Sign-in didn't complete. Try again.",
  OTHER_ERROR: "Sign-in failed. Try again.",
};

export function GithubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={cn("size-3.5 fill-current", className)}>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

/** Starts GitHub OAuth; the browser comes back to the current URL, so filters and the open PR survive. */
export function useSignIn() {
  const { signIn } = useSignInWithGithub(api.auth);
  const [error, setError] = useState<string | null>(null);
  return {
    error,
    signIn: async () => {
      setError(null);
      const result = await signIn();
      if (result.status === "error") setError(FLOW_ERRORS[result.userError.error]);
    },
  };
}

export function SignInButton({ className, label = "Sign in with GitHub" }: { className?: string; label?: string }) {
  const { signIn, error } = useSignIn();
  return (
    <>
      <button onClick={() => void signIn()} className={className}>
        <GithubMark />
        {label}
      </button>
      {error && <p className="px-2 pt-1 text-xs text-destructive">{error}</p>}
    </>
  );
}

/** Sidebar footer: sign-in button, or the signed-in account with sign-out. */
export function Account() {
  const me = useMe();
  const { signOut } = useAuthActions();
  const { flowError } = useOauth();
  const item =
    "flex h-7 w-full cursor-default items-center gap-2 rounded-md px-2 text-left text-[13px] font-[450] text-sidebar-foreground/85 hover:bg-sidebar-accent";
  if (me === undefined) return <div className="h-7" />;
  if (!me)
    return (
      <div>
        <SignInButton className={item} />
        {flowError && <p className="px-2 pt-1 text-xs text-destructive">{FLOW_ERRORS[flowError.error]}</p>}
      </div>
    );
  return (
    <Popover>
      <PopoverTrigger className={item}>
        <UserAvatar src={me.avatarUrl} login={me.login} className="size-[18px]" />
        <span className="truncate">{me.login}</span>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-56 p-1 text-[13px]">
        <PopoverTitle className="px-2 py-1.5 text-xs font-normal text-muted-foreground">
          Signed in as <span className="text-foreground">{me.name ?? me.login}</span>
        </PopoverTitle>
        <button onClick={() => void signOut()} className="flex h-7 w-full cursor-default items-center gap-2 rounded-md px-2 hover:bg-accent">
          <LogOutIcon className="size-3.5" aria-hidden="true" />
          Sign out
        </button>
      </PopoverContent>
    </Popover>
  );
}

export function UserAvatar({ src, login, className }: { src: string | null; login: string; className?: string }) {
  return (
    <img
      src={src ?? `https://github.com/${login}.png?size=48`}
      alt=""
      loading="lazy"
      className={cn("size-4 shrink-0 rounded-full bg-muted", className)}
    />
  );
}
