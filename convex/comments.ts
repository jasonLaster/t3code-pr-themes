import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { currentUser, publicUser, requireUser } from "./users";

const MAX_LENGTH = 10_000;
const BURST = 5;
const BURST_WINDOW_MS = 60_000;

const cleanBody = (body: string) => {
  const trimmed = body.trim();
  if (!trimmed) throw new ConvexError("Comment is empty.");
  if (trimmed.length > MAX_LENGTH) throw new ConvexError(`Comments are limited to ${MAX_LENGTH.toLocaleString()} characters.`);
  return trimmed;
};

/** Comments on one PR, oldest first, with each author's GitHub login and avatar. */
export const list = query({
  args: { pr: v.number() },
  handler: async (ctx, { pr }) => {
    const me = await currentUser(ctx);
    const rows = await ctx.db.query("comments").withIndex("by_pr", (q) => q.eq("pr", pr)).collect();
    const authors = new Map<Id<"users">, ReturnType<typeof publicUser>>();
    for (const r of rows) if (!authors.has(r.userId)) authors.set(r.userId, publicUser(await ctx.db.get(r.userId)));
    return rows.map((r) => ({
      _id: r._id,
      createdAt: r._creationTime,
      editedAt: r.editedAt ?? null,
      body: r.body,
      author: authors.get(r.userId) ?? null,
      canEdit: me?._id === r.userId,
      canDelete: me?._id === r.userId || me?.role === "maintainer",
    }));
  },
});

/** PR number → comment count, for the badges in the list. */
export const counts = query({
  args: {},
  handler: async (ctx) => {
    const out: Record<number, number> = {};
    for (const c of await ctx.db.query("comments").collect()) out[c.pr] = (out[c.pr] ?? 0) + 1;
    return out;
  },
});

export const add = mutation({
  args: { pr: v.number(), body: v.string() },
  handler: async (ctx, { pr, body }) => {
    const user = await requireUser(ctx);
    if (user.role === "denounced") throw new ConvexError("Denounced accounts can't comment.");
    const recent = await ctx.db
      .query("comments")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(BURST);
    if (recent.length === BURST && Date.now() - recent[BURST - 1]._creationTime < BURST_WINDOW_MS) {
      throw new ConvexError("You're commenting too fast. Try again in a minute.");
    }
    return await ctx.db.insert("comments", { pr, userId: user._id, body: cleanBody(body) });
  },
});

export const edit = mutation({
  args: { id: v.id("comments"), body: v.string() },
  handler: async (ctx, { id, body }) => {
    const user = await requireUser(ctx);
    const comment = await ctx.db.get(id);
    if (!comment) throw new ConvexError("That comment was deleted.");
    if (comment.userId !== user._id) throw new ConvexError("You can only edit your own comments.");
    await ctx.db.patch(id, { body: cleanBody(body), editedAt: Date.now() });
  },
});

/** Authors can delete their own comments; maintainers can delete any. */
export const remove = mutation({
  args: { id: v.id("comments") },
  handler: async (ctx, { id }) => {
    const user = await requireUser(ctx);
    const comment = await ctx.db.get(id);
    if (!comment) return;
    if (comment.userId !== user._id && user.role !== "maintainer") throw new ConvexError("You can only delete your own comments.");
    await ctx.db.delete(id);
  },
});
