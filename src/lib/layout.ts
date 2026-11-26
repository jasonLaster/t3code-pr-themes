import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

function readNumber(key: string, fallback: number) {
  try {
    const n = Number(localStorage.getItem(key));
    return Number.isFinite(n) && n > 0 ? n : fallback;
  } catch {
    return fallback;
  }
}

/**
 * A panel width the viewer can drag, remembered per browser. `edge` is the side the handle sits on:
 * "right" grows as the pointer moves right (a left sidebar), "left" grows as it moves left (a right pane).
 */
export function useResizable(key: string, initial: number, min: number, max: number, edge: "left" | "right") {
  const [width, setWidth] = useState(() => Math.min(Math.max(readNumber(key, initial), min), max));
  const latest = useRef(width);
  latest.current = width;
  const onPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const startX = e.clientX;
      const startW = latest.current;
      const limit = Math.min(max, window.innerWidth - 320);
      const move = (ev: PointerEvent) => {
        const dx = ev.clientX - startX;
        setWidth(Math.round(Math.min(Math.max(startW + (edge === "right" ? dx : -dx), min), Math.max(min, limit))));
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        document.body.style.removeProperty("cursor");
        document.body.style.removeProperty("user-select");
        try {
          localStorage.setItem(key, String(latest.current));
        } catch {}
      };
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [key, min, max, edge],
  );
  const reset = useCallback(() => {
    setWidth(initial);
    try {
      localStorage.removeItem(key);
    } catch {}
  }, [key, initial]);
  return { width, onPointerDown, reset };
}

export type Column = "score" | "theme" | "tier" | "merge" | "checks" | "changes" | "age" | "author";
export const COLUMNS: { key: Column; label: string }[] = [
  { key: "score", label: "Review score" },
  { key: "theme", label: "Theme" },
  { key: "tier", label: "Contributor tier" },
  { key: "merge", label: "Merge status" },
  { key: "checks", label: "CI and CodeRabbit" },
  { key: "changes", label: "Lines changed" },
  { key: "age", label: "Age" },
  { key: "author", label: "Author" },
];
const COLUMNS_KEY = "list:hiddenColumns";

/** Hidden list columns, stored only in this browser. */
export function useColumns() {
  const [hidden, setHidden] = useState<ReadonlySet<Column>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(COLUMNS_KEY) ?? "[]") as Column[]);
    } catch {
      return new Set();
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(COLUMNS_KEY, JSON.stringify([...hidden]));
    } catch {}
  }, [hidden]);
  const toggle = useCallback(
    (c: Column, visible: boolean) =>
      setHidden((cur) => {
        const next = new Set(cur);
        if (visible) next.delete(c);
        else next.add(c);
        return next;
      }),
    [],
  );
  return { hidden, toggle };
}
