import { useEffect, useMemo, useRef, useState } from "react";

export type Command = { id: string; section: string; label: string; hint?: string; active?: boolean; run: () => void };

export function Palette({ commands, onClose }: { commands: Command[]; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return commands
      .filter((c) => {
        const hay = `${c.section} ${c.label} ${c.hint ?? ""}`.toLowerCase();
        return words.every((w) => hay.includes(w));
      })
      .slice(0, 80);
  }, [commands, query]);

  const selected = Math.min(index, Math.max(0, results.length - 1));
  useEffect(() => {
    listRef.current?.querySelector(`[data-i="${selected}"]`)?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const run = (c: Command | undefined) => {
    if (!c) return;
    onClose();
    c.run();
  };

  let lastSection = "";
  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="palette" role="dialog" aria-label="Command menu" onMouseDown={(e) => e.stopPropagation()}>
        <input
          autoFocus
          placeholder="Filter by author, theme, tier, type… or type a PR number"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIndex(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || (e.ctrlKey && e.key === "n")) {
              e.preventDefault();
              setIndex((i) => Math.min(i + 1, results.length - 1));
            } else if (e.key === "ArrowUp" || (e.ctrlKey && e.key === "p")) {
              e.preventDefault();
              setIndex((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              run(results[selected]);
            } else if (e.key === "Escape") {
              e.preventDefault();
              onClose();
            }
          }}
        />
        <div className="palette-list" ref={listRef}>
          {results.length === 0 && <p className="muted pad">No matches.</p>}
          {results.map((c, i) => {
            const header = c.section !== lastSection ? (lastSection = c.section) : null;
            return (
              <div key={c.id}>
                {header && <div className="palette-section">{header}</div>}
                <button
                  data-i={i}
                  className={`palette-item${i === selected ? " sel" : ""}`}
                  onMouseMove={() => setIndex(i)}
                  onClick={() => run(c)}
                >
                  <span className="check">{c.active ? "✓" : ""}</span>
                  <span className="label">{c.label}</span>
                  {c.hint && <span className="hint">{c.hint}</span>}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
