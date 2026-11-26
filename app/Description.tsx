"use client";

import { useQuery } from "convex/react";
import Markdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { api } from "../convex/_generated/api";

const REPO_URL = "https://github.com/pingdotgg/t3code";

// PR bodies link to repo paths and #123 issues the way GitHub does; make those absolute.
const resolveUrl = (url: string) =>
  url.startsWith("#") || /^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `${REPO_URL}/blob/main/${url.replace(/^\.?\//, "")}`;
const linkIssues = (md: string) =>
  md.replace(/(^|[\s(])#(\d{2,6})\b/g, (_, pre: string, n: string) => `${pre}[#${n}](${REPO_URL}/pull/${n})`);

export function Description({ n }: { n: number }) {
  const body = useQuery(api.prs.description, { n });
  if (body === undefined) return <div className="md muted">Loading description…</div>;
  if (!body?.trim()) return <div className="md muted">No description.</div>;
  return (
    <div className="md">
      <Markdown
        remarkPlugins={[remarkGfm]}
        // Raw HTML is common in PR bodies (<details>, <img>); sanitize after parsing it.
        rehypePlugins={[rehypeRaw, rehypeSanitize]}
        urlTransform={resolveUrl}
        components={{ a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" /> }}
      >
        {linkIssues(body)}
      </Markdown>
    </div>
  );
}
