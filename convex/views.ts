import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { currentUser, publicUser, requireUser } from "./users";

const MAX_VIEWS = 50;
const fields = { name: v.string(), q: v.string(), group: v.string(), sort: v.string(), public: v.boolean() };

const cleanName = (name: string) => {
  const trimmed = name.trim();
  if (!trimmed) throw new ConvexError("Give the view a name.");
  if (trimmed.length > 80) throw new ConvexError("View names are limited to 80 characters.");
  return trimmed;
};

const toClient = (d: Doc<"views">) => ({ _id: d._id, name: d.name, q: d.q, group: d.group, sort: d.sort, public: d.public });

/** The caller's own views, and public views from everyone else. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const me = await currentUser(ctx);
    const mine = me ? await ctx.db.query("views").withIndex("by_user", (q) => q.eq("userId", me._id)).collect() : [];
    const shared = (await ctx.db.query("views").withIndex("by_public", (q) => q.eq("public", true)).collect()).filter(
      (d) => d.userId !== me?._id,
    );
    const owners = new Map<Id<"users">, ReturnType<typeof publicUser>>();
    for (const d of shared) if (!owners.has(d.userId)) owners.set(d.userId, publicUser(await ctx.db.get(d.userId)));
    return {
      mine: mine.map(toClient),
      shared: shared.map((d) => ({ ...toClient(d), owner: owners.get(d.userId) ?? null })),
    };
  },
});

export const create = mutation({
  args: fields,
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const existing = await ctx.db.query("views").withIndex("by_user", (q) => q.eq("userId", user._id)).take(MAX_VIEWS);
    if (existing.length >= MAX_VIEWS) throw new ConvexError(`You can save up to ${MAX_VIEWS} views.`);
    return await ctx.db.insert("views", { ...args, name: cleanName(args.name), userId: user._id });
  },
});

export const update = mutation({
  args: {
    id: v.id("views"),
    name: v.optional(v.string()),
    q: v.optional(v.string()),
    group: v.optional(v.string()),
    sort: v.optional(v.string()),
    public: v.optional(v.boolean()),
  },
  handler: async (ctx, { id, ...patch }) => {
    const user = await requireUser(ctx);
    const view = await ctx.db.get(id);
    if (!view || view.userId !== user._id) throw new ConvexError("You can only change your own views.");
    await ctx.db.patch(id, { ...patch, ...(patch.name !== undefined && { name: cleanName(patch.name) }) });
  },
});

export const remove = mutation({
  args: { id: v.id("views") },
  handler: async (ctx, { id }) => {
    const user = await requireUser(ctx);
    const view = await ctx.db.get(id);
    if (view && view.userId !== user._id) throw new ConvexError("You can only delete your own views.");
    if (view) await ctx.db.delete(id);
  },
});
