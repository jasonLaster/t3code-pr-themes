import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Plugin } from "vite";

export type MarketingPageMeta = { slug: string; title: string; description: string; updated: number; media: number };

const ID = "virtual:marketing-pages";
const RESOLVED = `\0${ID}`;

const decode = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");
const text = (html: string) => decode(html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());

function updatedAt(file: string) {
  try {
    const out = execFileSync("git", ["log", "-1", "--format=%ct", "--", file], { encoding: "utf8" }).trim();
    if (out) return Number(out) * 1000;
  } catch {}
  return statSync(file).mtimeMs;
}

/** Reads every public/marketing/<slug>/index.html so the list page never needs a hand-kept manifest. */
export function readMarketingPages(root: string): MarketingPageMeta[] {
  const dir = join(root, "public/marketing");
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(dir, d.name, "index.html")))
    .map((d) => {
      const file = join(dir, d.name, "index.html");
      const html = readFileSync(file, "utf8");
      const title = text(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? "") || d.name;
      const meta = html.match(/<meta\s+name=["']?description["']?\s+content=["']([^"']*)["']/i)?.[1];
      const description = meta ? decode(meta) : text(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "");
      const mediaDir = join(dir, d.name, "media");
      const media = existsSync(mediaDir) ? readdirSync(mediaDir).length : 0;
      return { slug: d.name, title, description, updated: updatedAt(file), media };
    })
    .sort((a, b) => b.updated - a.updated);
}

export function marketingPages(): Plugin {
  let root = process.cwd();
  return {
    name: "marketing-pages",
    configResolved(c) {
      root = c.root;
    },
    resolveId: (id) => (id === ID ? RESOLVED : undefined),
    load(id) {
      if (id === RESOLVED) return `export default ${JSON.stringify(readMarketingPages(root))};`;
    },
    configureServer(server) {
      // Adding or editing a page under public/marketing refreshes the list in dev.
      server.watcher.add(join(root, "public/marketing"));
      const refresh = (file: string) => {
        if (!file.includes("/public/marketing/")) return;
        const mod = server.moduleGraph.getModuleById(RESOLVED);
        if (mod) server.moduleGraph.invalidateModule(mod);
        server.ws.send({ type: "full-reload" });
      };
      server.watcher.on("add", refresh).on("unlink", refresh).on("change", refresh);
      // Mirror vercel.json's /marketing/:slug rewrite so page links work in dev too.
      server.middlewares.use((req, _res, next) => {
        const slug = req.url?.match(/^\/marketing\/([^/?#]+)\/?(?:[?#].*)?$/)?.[1];
        if (slug && existsSync(join(root, "public/marketing", slug, "index.html"))) req.url = `/marketing/${slug}/index.html`;
        next();
      });
    },
  };
}
