import { THEME_LIST } from "../shared/themes";
import type { Pr } from "./sync";

export type Tier = "maintainer" | "vouched" | "denounced" | "community";
export type Contributors = ReadonlyMap<string, { tier: Exclude<Tier, "community">; reason?: string }>;

/** Color classes: Julius and Theo get their own, everyone else by contributor tier. */
export type Who = "julius" | "theo" | "maintainer" | "vouched" | "community";
export const WHO: Who[] = ["julius", "theo", "maintainer", "vouched", "community"];
export const WHO_LABEL: Record<Who, string> = {
  julius: "Julius",
  theo: "Theo",
  maintainer: "Other maintainers",
  vouched: "Vouched",
  community: "Everyone else",
};
export const TIERS: Tier[] = ["maintainer", "vouched", "community", "denounced"];

export const ALIASES: Record<string, string> = { julius: "juliusmarminge", theo: "t3dotgg" };
const resolveAuthor = (v: string) => (ALIASES[v.toLowerCase()] ?? v).toLowerCase();

export const tierOf = (login: string, contributors: Contributors): Tier =>
  contributors.get(login.toLowerCase())?.tier ?? "community";

export function whoOf(login: string, contributors: Contributors): Who {
  const l = login.toLowerCase();
  if (l === ALIASES.julius) return "julius";
  if (l === ALIASES.theo) return "theo";
  const tier = tierOf(l, contributors);
  return tier === "maintainer" || tier === "vouched" ? tier : "community";
}

export const THEMES = THEME_LIST;
export const themeSlug = (name: string) => THEMES.find((t) => t.name === name)?.slug ?? "other";

export const RANGES = [
  { value: "1d", label: "Last day" },
  { value: "7d", label: "Last week" },
  { value: "14d", label: "Last 2 weeks" },
  { value: "30d", label: "Last month" },
  { value: "90d", label: "Last 3 months" },
];

export const FILTER_KEYS = ["author", "theme", "tier", "type", "opened", "is"] as const;
export type FilterKey = (typeof FILTER_KEYS)[number];
const KEY_ALIASES: Record<string, FilterKey> = { by: "author", th: "theme", kind: "type", age: "opened" };
/** Keys that hold a single value; setting one replaces the previous value. */
const SINGLE: FilterKey[] = ["opened"];

export type Token = { neg: boolean; key: FilterKey; value: string };

export function parseQuery(q: string) {
  const tokens: Token[] = [];
  const words: string[] = [];
  for (const part of q.match(/-?\w+:"[^"]*"|\S+/g) ?? []) {
    const m = part.match(/^(-?)(\w+):"?([^"]*)"?$/);
    const key = m && ((FILTER_KEYS as readonly string[]).includes(m[2].toLowerCase()) ? m[2].toLowerCase() : KEY_ALIASES[m[2].toLowerCase()]);
    if (m && key && m[3]) tokens.push({ neg: m[1] === "-", key: key as FilterKey, value: m[3].toLowerCase() });
    else words.push(part.toLowerCase());
  }
  return { tokens, words };
}

const tokenText = (t: Token) => `${t.neg ? "-" : ""}${t.key}:${/\s/.test(t.value) ? `"${t.value}"` : t.value}`;

export function serialize(tokens: Token[], words: string[]) {
  return [...tokens.map(tokenText), ...words].join(" ");
}

export const hasToken = (q: string, key: FilterKey, value: string) =>
  parseQuery(q).tokens.some((t) => !t.neg && t.key === key && t.value === value.toLowerCase());

/** Adds a filter, or removes it if it is already on. */
export function toggleToken(q: string, key: FilterKey, value: string, neg = false) {
  const { tokens, words } = parseQuery(q);
  const v = value.toLowerCase();
  const exists = tokens.some((t) => t.key === key && t.value === v && t.neg === neg);
  const kept = tokens.filter((t) => !(t.key === key && (SINGLE.includes(key) || t.value === v)));
  return serialize(exists ? kept : [...kept, { neg, key, value: v }], words);
}

/** Replaces every filter on `keys` with one value (or none). */
export function setOnly(q: string, keys: FilterKey[], next?: Token) {
  const { tokens, words } = parseQuery(q);
  return serialize([...tokens.filter((t) => !keys.includes(t.key)), ...(next ? [next] : [])], words);
}

export const removeToken = (q: string, token: Token) => {
  const { tokens, words } = parseQuery(q);
  return serialize(tokens.filter((t) => tokenText(t) !== tokenText(token)), words);
};

function test(pr: Pr, key: FilterKey, value: string, contributors: Contributors, now: number) {
  switch (key) {
    case "author":
      return pr.author.toLowerCase() === resolveAuthor(value);
    case "theme":
      return themeSlug(pr.theme) === value || pr.theme.toLowerCase().startsWith(value);
    case "tier": {
      const tier = tierOf(pr.author, contributors);
      return tier === value || (value === "unvouched" && tier === "community");
    }
    case "type":
      return pr.kind === value;
    case "opened": {
      const m = value.match(/^(\d+)([dwmh])$/);
      if (!m) return true;
      const unit = { h: 36e5, d: 864e5, w: 7 * 864e5, m: 30 * 864e5 }[m[2] as "h" | "d" | "w" | "m"];
      return Date.parse(pr.createdAt) >= now - Number(m[1]) * unit;
    }
    case "is":
      return value === "draft" ? pr.draft : value === "ready" ? !pr.draft : true;
  }
}

/** Same key ORs together, different keys AND, `-key:value` excludes; free words match title, number or author. */
export function makeMatcher(q: string, contributors: Contributors, now: number) {
  const { tokens, words } = parseQuery(q);
  const positive = new Map<FilterKey, string[]>();
  for (const t of tokens) if (!t.neg) positive.set(t.key, [...(positive.get(t.key) ?? []), t.value]);
  const negative = tokens.filter((t) => t.neg);
  return (pr: Pr) => {
    for (const [key, values] of positive) if (!values.some((v) => test(pr, key, v, contributors, now))) return false;
    for (const t of negative) if (test(pr, t.key, t.value, contributors, now)) return false;
    if (words.length === 0) return true;
    const hay = `${pr.title} #${pr.number} ${pr.author}`.toLowerCase();
    return words.every((w) => hay.includes(w.replace(/^#/, "#")) || String(pr.number) === w.replace(/^#/, ""));
  };
}

export type GroupBy = "theme" | "who" | "author" | "none";
export type SortBy = "created" | "updated" | "size";
export const GROUP_LABEL: Record<GroupBy, string> = { theme: "Theme", who: "Contributor tier", author: "Author", none: "No grouping" };
export const SORT_LABEL: Record<SortBy, string> = { created: "Newest", updated: "Recently updated", size: "Largest" };

export const SORTERS: Record<SortBy, (a: Pr, b: Pr) => number> = {
  created: (a, b) => b.number - a.number,
  updated: (a, b) => b.updatedAt.localeCompare(a.updatedAt),
  size: (a, b) => b.additions + b.deletions - (a.additions + a.deletions),
};
