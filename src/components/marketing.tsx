import { ArrowLeftIcon, ArrowUpRightIcon, ChevronRightIcon, MegaphoneIcon } from "lucide-react";
import pages from "virtual:marketing-pages";

const fmtDate = (ms: number) => new Date(ms).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

export function MarketingPage() {
  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
        <a href="/" className="flex cursor-default items-center gap-2 rounded-md px-1 py-0.5 hover:bg-hover">
          <span className="grid size-5 place-items-center rounded-md bg-primary text-[10px] font-semibold text-primary-foreground">T3</span>
          <span className="text-[13px] font-[590]">t3code</span>
        </a>
        <ChevronRightIcon className="size-3.5 text-muted-foreground" aria-hidden="true" />
        <h1 className="text-[13px] font-[510]">Marketing</h1>
        <a href="/" className="ml-auto flex cursor-default items-center gap-1.5 rounded-md px-2 py-1 text-[13px] text-muted-foreground hover:bg-hover hover:text-foreground">
          <ArrowLeftIcon className="size-3.5" aria-hidden="true" />
          Pull requests
        </a>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
          <h2 className="text-xl font-[590]">Marketing pages</h2>
          <p className="mt-2 text-[13px] text-muted-foreground">
            {pages.length === 1 ? "1 page" : `${pages.length} pages`}, newest first. Each lives at <code className="font-mono">/marketing/&lt;slug&gt;</code>.
          </p>

          {pages.length === 0 ? (
            <p className="mt-6 rounded-md border border-dashed border-border p-6 text-center text-[13px] text-muted-foreground">
              No marketing pages yet. Add one at <code className="font-mono">public/marketing/&lt;slug&gt;/index.html</code>.
            </p>
          ) : (
            <ul className="mt-5 divide-y divide-border overflow-hidden rounded-lg border border-border">
              {pages.map((p) => (
                <li key={p.slug}>
                  <a href={`/marketing/${p.slug}`} className="group flex cursor-default items-start gap-3 px-4 py-3 hover:bg-hover">
                    <MegaphoneIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-[14px] font-[510]">
                        <span className="truncate">{p.title}</span>
                        <ArrowUpRightIcon className="size-3.5 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" aria-hidden="true" />
                      </div>
                      {p.description && <p className="mt-0.5 line-clamp-2 text-[13px] text-muted-foreground">{p.description}</p>}
                      <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                        <span className="font-mono">/marketing/{p.slug}</span> · Updated {fmtDate(p.updated)}
                        {p.media > 0 && ` · ${p.media} media files`}
                      </p>
                    </div>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}
