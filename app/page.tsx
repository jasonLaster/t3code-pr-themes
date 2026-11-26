"use client";

import { useMutation, useQuery } from "convex/react";
import { useEffect, useMemo } from "react";
import { api } from "../convex/_generated/api";
import type { Payload } from "../lib/themes";
import { Dashboard } from "./Dashboard";

export default function Page() {
  const json = useQuery(api.prs.snapshot);
  const status = useQuery(api.prs.status);
  const revalidate = useMutation(api.prs.revalidate);
  const payload = useMemo(() => (json ? (JSON.parse(json) as Payload) : null), [json]);

  // Stale-while-revalidate: show the stored snapshot immediately, and ask the
  // backend to refresh it if it is stale. The query pushes the new data when ready.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void revalidate();
    };
    onVisible();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [revalidate]);

  if (!payload || !status?.fetchedAt) {
    return (
      <main>
        <h1>Open pull requests by theme</h1>
        <p className="sub">{status?.lastError ? `Could not load pull requests: ${status.lastError}` : "Loading pull requests…"}</p>
      </main>
    );
  }
  return <Dashboard payload={payload} fetchedAt={status.fetchedAt} />;
}
