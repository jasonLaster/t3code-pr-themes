import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { get, set } from "idb-keyval";
import { useEffect, useState } from "react";
import { api } from "../convex/_generated/api";

type OpenPr = FunctionReturnType<typeof api.prs.since>["rows"][number];
type HistoricalPr = FunctionReturnType<typeof api.prHistory.list>["page"][number];
export type Pr = OpenPr | HistoricalPr;
export const isHistorical = (pr: Pr): pr is HistoricalPr => "state" in pr;

export function useHistory(state: HistoricalPr["state"], enabled: boolean) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.prHistory.list, enabled ? { state } : "skip", { initialNumItems: 1000 },
  );
  useEffect(() => {
    if (status === "CanLoadMore") loadMore(1000);
  }, [status, loadMore]);
  return { rows: results, loading: enabled && status !== "Exhausted" };
}
type Store = { syncId: number; rows: ReadonlyMap<number, OpenPr> };

const CACHE_KEY = "prs-cache-v2";

/**
 * Linear-style sync: boot from the IndexedDB cache, then subscribe to rows
 * changed after the cached cursor. Each applied delta advances the cursor, so
 * the live subscription only ever carries new changes.
 */
export function useSyncedPrs() {
  const [store, setStore] = useState<Store | null>(null);

  useEffect(() => {
    let alive = true;
    get<{ syncId: number; rows: OpenPr[] }>(CACHE_KEY)
      .catch(() => undefined)
      .then((cache) => {
        if (alive) setStore({ syncId: cache?.syncId ?? 0, rows: new Map((cache?.rows ?? []).map((r) => [r.number, r])) });
      });
    return () => {
      alive = false;
    };
  }, []);

  const delta = useQuery(api.prs.since, store ? { after: store.syncId } : "skip");

  // Applies server deltas to the local replica and its IndexedDB cache.
  useEffect(() => {
    if (!delta) return;
    setStore((cur) => {
      if (!cur || (!delta.reset && delta.syncId === cur.syncId)) return cur;
      const rows = new Map(delta.reset ? [] : cur.rows);
      for (const row of delta.rows) {
        if (row.open) rows.set(row.number, row);
        else rows.delete(row.number);
      }
      void set(CACHE_KEY, { syncId: delta.syncId, rows: [...rows.values()] }).catch(() => {});
      return { syncId: delta.syncId, rows };
    });
  }, [delta]);

  return { rows: store?.rows ?? null, live: delta !== undefined };
}

/** Stale-while-revalidate: ask the backend to refresh when the page is viewed and the data is stale. */
export function useRevalidateOnView() {
  const revalidate = useMutation(api.prs.revalidate);
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void revalidate();
    };
    onVisible();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [revalidate]);
}
