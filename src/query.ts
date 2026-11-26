import { PR_STATES, type PrState } from "../shared/history";
import { filterField, testField, type Ctx, type Field } from "@/fields";
import type { SliceBy, Who } from "@/model";
import type { Pr } from "@/sync";

/**
 * The search box query language: `key:value` filters (keys and aliases come
 * from FIELDS), `-key:value` to exclude, quotes for spaces, and free words.
 */

/** A filter field's canonical key. */
export type FilterKey = string;
export type Token = { neg: boolean; key: FilterKey; value: string };

export function parseQuery(q: string) {
  const tokens: Token[] = [];
  const words: string[] = [];
  for (const part of q.match(/-?\w+:"[^"]*"|\S+/g) ?? []) {
    const m = part.match(/^(-?)(\w+):"?([^"]*)"?$/);
    const field = m && filterField(m[2]);
    if (m && field && m[3]) tokens.push({ neg: m[1] === "-", key: field.key, value: m[3].toLowerCase() });
    else words.push(part.toLowerCase());
  }
  return { tokens, words };
}

const tokenText = (t: Token) => `${t.neg ? "-" : ""}${t.key}:${/\s/.test(t.value) ? `"${t.value}"` : t.value}`;

export function serialize(tokens: Token[], words: string[]) {
  return [...tokens.map(tokenText), ...words].join(" ");
}

export const isActive = (q: string, key: FilterKey, value: string, neg = false) =>
  parseQuery(q).tokens.some((t) => t.neg === neg && t.key === key && t.value === value.toLowerCase());

/** Adds a filter, or removes it if it is already on. Single-value fields replace their previous value. */
export function toggleToken(q: string, key: FilterKey, value: string, neg = false) {
  const { tokens, words } = parseQuery(q);
  const v = value.toLowerCase();
  const single = filterField(key)?.single;
  const exists = tokens.some((t) => t.key === key && t.value === v && t.neg === neg);
  const kept = tokens.filter((t) => !(t.key === key && (single || t.value === v)));
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

/** Flips "is" ↔ "is not" for every value of one filter. */
export function flipGroup(q: string, key: FilterKey, neg: boolean) {
  const { tokens, words } = parseQuery(q);
  return serialize(tokens.map((t) => (t.key === key && t.neg === neg ? { ...t, neg: !neg } : t)), words);
}

export function removeGroup(q: string, key: FilterKey, neg: boolean) {
  const { tokens, words } = parseQuery(q);
  return serialize(tokens.filter((t) => !(t.key === key && t.neg === neg)), words);
}

/** Same key ORs together, different keys AND, `-key:value` excludes; free words match title, number or author. */
export function makeMatcher(q: string, ctx: Ctx) {
  const { tokens, words } = parseQuery(q);
  const positive = new Map<Field, string[]>();
  const negative: [Field, string][] = [];
  for (const t of tokens) {
    const f = filterField(t.key)!;
    if (t.neg) negative.push([f, t.value]);
    else positive.set(f, [...(positive.get(f) ?? []), t.value]);
  }
  return (pr: Pr) => {
    for (const [f, values] of positive) if (!values.some((v) => testField(f, pr, v, ctx))) return false;
    for (const [f, v] of negative) if (testField(f, pr, v, ctx)) return false;
    if (words.length === 0) return true;
    const hay = `${pr.title} #${pr.number} ${pr.author}`.toLowerCase();
    return words.every((w) => hay.includes(w) || String(pr.number) === w.replace(/^#/, ""));
  };
}

/** Which PR sets a query needs: open by default, history when `state:` or `label:` asks for it. */
export function requestedStates(q: string): PrState[] {
  const { tokens } = parseQuery(q);
  const stateTokens = tokens.filter((t) => t.key === "state");
  if (!stateTokens.length) {
    return tokens.some((t) => t.key === "label" && !t.neg) ? ["merged", "closed"] : ["open"];
  }
  const included = stateTokens.filter((t) => !t.neg);
  return PR_STATES.filter((state) =>
    (!included.length || included.some((t) => t.value === state)) &&
    !stateTokens.some((t) => t.neg && t.value === state),
  );
}

export function applyWhoFilter(q: string, who: Who) {
  const { tokens, words } = parseQuery(q);
  const kept = tokens.filter((t) => t.key !== "author" && t.key !== "tier");
  const added: Token[] =
    who === "julius"
      ? [{ neg: false, key: "author", value: "julius" }]
      : who === "theo"
        ? [{ neg: false, key: "author", value: "theo" }]
        : who === "maintainer"
          ? [
              { neg: false, key: "tier", value: "maintainer" },
              { neg: true, key: "author", value: "julius" },
              { neg: true, key: "author", value: "theo" },
            ]
          : who === "vouched"
            ? [{ neg: false, key: "tier", value: "vouched" }]
            : [
                { neg: true, key: "tier", value: "maintainer" },
                { neg: true, key: "tier", value: "vouched" },
              ];
  return serialize([...kept, ...added], words);
}

export function applyInsightDrillDown(q: string, slice: SliceBy, filterValue: string, who?: Who) {
  let next = setOnly(q, [slice], { neg: false, key: slice, value: filterValue });
  if (who && slice !== "author") {
    if (slice === "tier") {
      if (who === "julius" || who === "theo") {
        next = setOnly(next, ["author"], { neg: false, key: "author", value: who });
      } else if (who === "maintainer") {
        const { tokens, words } = parseQuery(next);
        next = serialize(
          [
            ...tokens.filter((t) => t.key !== "author"),
            { neg: true, key: "author", value: "julius" },
            { neg: true, key: "author", value: "theo" },
          ],
          words,
        );
      }
    } else {
      next = applyWhoFilter(next, who);
    }
  }
  return next;
}
