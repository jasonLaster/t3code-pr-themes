/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";

// The OAuth handshake is Convex Auth's job; these tests cover our rules, so the
// caller's identity subject stands in for their user id.
vi.mock("@convex-dev/auth/server", () => ({
  getAuthUserId: async (ctx: { auth: { getUserIdentity: () => Promise<{ subject: string } | null> } }) =>
    (await ctx.auth.getUserIdentity())?.subject ?? null,
}));

const modules = import.meta.glob(["../**/*.ts", "!../auth.ts", "!../tests/**"]);

async function setup() {
  const t = convexTest(schema, modules);
  const user = async (login: string, tier?: "maintainer" | "vouched" | "denounced") => {
    const id = await t.run(async (ctx) => {
      if (tier) await ctx.db.insert("contributors", { login, tier });
      return ctx.db.insert("users", { githubId: login, login });
    });
    return { id, as: t.withIdentity({ subject: id }) };
  };
  return { t, user };
}

describe("comments", () => {
  test("signed-out callers can read but not write", async () => {
    const { t } = await setup();
    expect(await t.query(api.comments.list, { pr: 1 })).toEqual([]);
    await expect(t.mutation(api.comments.add, { pr: 1, body: "hi" })).rejects.toThrow(/Sign in/);
  });

  test("anyone signed in can comment; only the author edits", async () => {
    const { user } = await setup();
    const alice = await user("alice");
    const bob = await user("bob");
    const id = await alice.as.mutation(api.comments.add, { pr: 1, body: "  first  " });
    const [c] = await bob.as.query(api.comments.list, { pr: 1 });
    expect(c).toMatchObject({ body: "first", author: { login: "alice" }, canEdit: false, canDelete: false });
    await expect(bob.as.mutation(api.comments.edit, { id, body: "x" })).rejects.toThrow(/your own/);
    await expect(bob.as.mutation(api.comments.remove, { id })).rejects.toThrow(/your own/);
    await alice.as.mutation(api.comments.edit, { id, body: "edited" });
    expect((await alice.as.query(api.comments.list, { pr: 1 }))[0]).toMatchObject({ body: "edited", canEdit: true });
  });

  test("maintainers can delete anyone's comment", async () => {
    const { user, t } = await setup();
    const alice = await user("alice");
    const mod = await user("Julius", "maintainer");
    const id = await alice.as.mutation(api.comments.add, { pr: 1, body: "spam" });
    expect((await mod.as.query(api.comments.list, { pr: 1 }))[0].canDelete).toBe(true);
    await mod.as.mutation(api.comments.remove, { id });
    expect(await t.query(api.comments.counts, {})).toEqual({});
  });

  test("denounced users can't comment; empty and burst comments are rejected", async () => {
    const { user } = await setup();
    const troll = await user("troll", "denounced");
    await expect(troll.as.mutation(api.comments.add, { pr: 1, body: "hi" })).rejects.toThrow(/Denounced/);
    const alice = await user("alice");
    await expect(alice.as.mutation(api.comments.add, { pr: 1, body: "   " })).rejects.toThrow(/empty/);
    for (let i = 0; i < 5; i++) await alice.as.mutation(api.comments.add, { pr: 1, body: `c${i}` });
    await expect(alice.as.mutation(api.comments.add, { pr: 1, body: "c5" })).rejects.toThrow(/too fast/);
  });
});

describe("views", () => {
  const state = { q: "is:green", group: "theme", sort: "created" };

  test("private views are only listed for their owner; public ones for everyone", async () => {
    const { user, t } = await setup();
    const alice = await user("alice");
    const bob = await user("bob");
    await alice.as.mutation(api.views.create, { ...state, name: "Mine", public: false });
    await alice.as.mutation(api.views.create, { ...state, name: "Team", public: true });
    expect((await alice.as.query(api.views.list, {})).mine.map((v) => v.name).sort()).toEqual(["Mine", "Team"]);
    const forBob = await bob.as.query(api.views.list, {});
    expect(forBob.mine).toEqual([]);
    expect(forBob.shared).toMatchObject([{ name: "Team", owner: { login: "alice" } }]);
    expect((await t.query(api.views.list, {})).shared.map((v) => v.name)).toEqual(["Team"]);
  });

  test("only the owner can change or delete a view", async () => {
    const { user } = await setup();
    const alice = await user("alice");
    const bob = await user("bob");
    const id: Id<"views"> = await alice.as.mutation(api.views.create, { ...state, name: "Team", public: true });
    await expect(bob.as.mutation(api.views.update, { id, name: "Hijacked" })).rejects.toThrow(/your own/);
    await expect(bob.as.mutation(api.views.remove, { id })).rejects.toThrow(/your own/);
    await alice.as.mutation(api.views.update, { id, public: false, q: "ci:fail" });
    expect((await bob.as.query(api.views.list, {})).shared).toEqual([]);
    await alice.as.mutation(api.views.remove, { id });
    expect((await alice.as.query(api.views.list, {})).mine).toEqual([]);
  });
});
