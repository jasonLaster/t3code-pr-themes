import { getAuthUserId } from "@convex-dev/auth/server";
import { vGithubProfile, type GithubProfile } from "@convex-dev/auth/methods/github/server";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";

const vMethod = v.object({ name: v.literal("github"), profile: vGithubProfile });
const fromProfile = (p: GithubProfile) => ({ githubId: p.id, login: p.login, name: p.name, avatarUrl: p.avatarUrl });

/** Called by Convex Auth the first time a GitHub account signs in. */
export const createUser = internalMutation({
  args: { method: vMethod },
  returns: v.id("users"),
  handler: async (ctx, { method }) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_githubId", (q) => q.eq("githubId", method.profile.id))
      .unique();
    return existing?._id ?? (await ctx.db.insert("users", fromProfile(method.profile)));
  },
});

/** Called on every sign-in: keeps the login and avatar current if they changed on GitHub. */
export const onSignIn = internalMutation({
  args: { method: vMethod, userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, { method, userId }) => {
    await ctx.db.patch(userId, fromProfile(method.profile));
    return null;
  },
});

export type Role = "maintainer" | "vouched" | "denounced" | null;

async function roleOf(ctx: QueryCtx, login: string): Promise<Role> {
  const lower = login.toLowerCase();
  const rows = await ctx.db.query("contributors").collect();
  return rows.find((c) => c.login.toLowerCase() === lower)?.tier ?? null;
}

/** The signed-in user, or null. */
export async function currentUser(ctx: QueryCtx): Promise<(Doc<"users"> & { role: Role }) | null> {
  const id = await getAuthUserId(ctx);
  const user = id && (await ctx.db.get(id));
  return user ? { ...user, role: await roleOf(ctx, user.login) } : null;
}

export async function requireUser(ctx: MutationCtx) {
  const user = await currentUser(ctx);
  if (!user) throw new ConvexError("Sign in with GitHub first.");
  return user;
}

export const publicUser = (u: Doc<"users"> | null) => (u ? { login: u.login, avatarUrl: u.avatarUrl ?? null } : null);

export const me = query({
  args: {},
  handler: async (ctx) => {
    const user = await currentUser(ctx);
    return user && { _id: user._id as Id<"users">, login: user.login, name: user.name ?? null, avatarUrl: user.avatarUrl ?? null, role: user.role };
  },
});
