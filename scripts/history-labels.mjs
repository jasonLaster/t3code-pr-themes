import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { inferHistoryLabels, PR_KINDS, PR_LABELS, kindOf } from "../shared/history.ts";
import { THEME_LIST, themeOf } from "../shared/themes.ts";

const pagesDir = ".pr-backfill/pages";
const labelsDir = ".pr-backfill/labels";
mkdirSync(labelsDir, { recursive: true });

const read = (path) => JSON.parse(readFileSync(path, "utf8"));
const isKnown = (values, item) => values.includes(item);
const themes = THEME_LIST.map(({ slug }) => slug);
const pathFor = (batch) => `${labelsDir}/${batch}.json`;
const saved = (batch) => existsSync(pathFor(batch)) ? read(pathFor(batch)) : [];

function getRows(batch) {
  assert.match(batch, /^\d{4}-[12]$/);
  const [page, part] = batch.split("-");
  const start = part === "1" ? 0 : 50;
  return read(`${pagesDir}/${page}.json`).nodes.slice(start, start + 50);
}

function validate(rows, values, complete = true) {
  assert(Array.isArray(values) && values.length > 0, "Expected a nonempty JSON array");
  const expected = new Map(rows.map(({ number, title }) => [number, kindOf(title)]));
  for (const value of values) {
    assert.deepEqual(Object.keys(value).sort(), ["kind", "labels", "number", "theme"]);
    const { number, theme, labels, kind } = value;
    assert(expected.has(number), `Duplicate or unexpected PR #${number}`);
    assert(isKnown(themes, theme), `Invalid theme for #${number}: ${theme}`);
    assert(Array.isArray(labels) && labels.length <= 3 && new Set(labels).size === labels.length,
      `Expected up to three distinct labels for #${number}`);
    assert(labels.every((label) => isKnown(PR_LABELS, label)), `Invalid labels for #${number}`);
    assert.equal(kind, expected.get(number), `Wrong conventional-commit kind for #${number}`);
    expected.delete(number);
  }
  if (complete) assert.equal(expected.size, 0, `Missing PR numbers: ${[...expected.keys()].join(", ")}`);
}

const themeSlugs = new Map(THEME_LIST.map(({ name, slug }) => [name, slug]));
function inferClassification({ title }) {
  return { theme: themeSlugs.get(themeOf(title)), kind: kindOf(title), labels: inferHistoryLabels(title), labelSource: "inferred" };
}

const [command, batch, input] = process.argv.slice(2);
if (command === "schema") {
  console.log(JSON.stringify({ themes: THEME_LIST, labels: PR_LABELS, kinds: PR_KINDS }));
} else if (command === "brief") {
  const completed = new Set(saved(batch).map(({ number }) => number));
  for (const { number, title, excerpt } of getRows(batch)) {
    if (completed.has(number)) continue;
    const lead = excerpt.replace(/\s+/g, " ").trim().slice(0, 240).toWellFormed();
    console.log(JSON.stringify([number, title, kindOf(title), lead]));
  }
} else if (command === "read") {
  const offset = Number(input ?? 0);
  assert(Number.isInteger(offset) && offset >= 0 && offset < 50, "Invalid batch offset");
  for (const { number, title, excerpt } of getRows(batch).slice(offset, offset + 10)) {
    console.log(JSON.stringify({ number, title, excerpt, kind: kindOf(title) }));
  }
} else if (command === "save" || command === "append") {
  const rows = getRows(batch);
  const supplied = read(input);
  // Kind is deterministic. Agents can focus on the fields that need judgment.
  const kinds = new Map(rows.map(({ number, title }) => [number, kindOf(title)]));
  assert(Array.isArray(supplied), "Expected a JSON array");
  const values = supplied.map((value) => ({
    ...value,
    kind: kinds.get(value.number),
  }));
  const complete = command === "save";
  validate(rows, values, complete);
  const next = new Map((complete ? [] : saved(batch)).map((value) => [value.number, value]));
  for (const value of values) next.set(value.number, value);
  const checkpoint = [...next.values()];
  validate(rows, checkpoint, complete);
  const path = pathFor(batch);
  writeFileSync(`${path}.${process.pid}.tmp`, JSON.stringify(checkpoint) + "\n");
  renameSync(`${path}.${process.pid}.tmp`, path);
  console.log(JSON.stringify({ batch, validated: checkpoint.length, remaining: rows.length - checkpoint.length }));
} else if (["pending", "export", "export-complete", "status"].includes(command)) {
  const pages = readdirSync(pagesDir).filter((name) => /^\d{4}\.json$/.test(name)).sort();
  const fill = command === "export-complete";
  const prior = new Map(fill && batch ? read(batch).map((row) => [row.number, row]) : []);
  const all = new Map();
  const pending = [];
  let expected = 0;
  let complete = false;
  for (const file of pages) {
    const { nodes, pageInfo, totalCount } = read(`${pagesDir}/${file}`);
    expected = totalCount;
    complete = !pageInfo.hasNextPage;
    for (let part = 1; part <= Math.ceil(nodes.length / 50); part++) {
      const id = `${file.slice(0, -5)}-${part}`;
      const rows = nodes.slice((part - 1) * 50, part * 50);
      const values = saved(id);
      if (existsSync(pathFor(id))) validate(rows, values, false);
      if (values.length < rows.length) pending.push(id);
      const labels = new Map(values.map((row) => [row.number, row]));
      for (const { author, isDraft, excerpt, ...row } of rows) {
        const reviewed = prior.get(row.number);
        const matchingReview = reviewed && reviewed.title === row.title && !reviewed.labelSource
          ? { theme: reviewed.theme, kind: reviewed.kind, labels: reviewed.labels }
          : undefined;
        const classification = labels.get(row.number) ?? matchingReview ?? (fill ? inferClassification(row) : undefined);
        assert(!all.has(row.number), `Duplicate source PR #${row.number}`);
        all.set(row.number, classification && {
          ...row,
          ...classification,
          author: author?.login ?? "ghost",
          draft: isDraft,
          state: row.state.toLowerCase(),
        });
      }
    }
  }
  const labeled = [...all.values()].filter(Boolean);
  if (command === "export" || fill) {
    if (fill) {
      const snapshot = read(".pr-backfill/inventory.json");
      assert(complete && labeled.length === expected, "Full source snapshot required");
      assert.equal(labeled.filter((row) => row.state === "merged").length, snapshot.merged);
      assert.equal(labeled.filter((row) => row.state === "closed").length, snapshot.closed);
    }
    for (const row of labeled) console.log(JSON.stringify(row));
  } else if (command === "pending") {
    const shard = batch === undefined ? null : Number(batch);
    console.log(pending.filter((id) => shard === null || (Number(id.slice(0, 4)) - 1) % 20 === shard).join(" "));
  } else {
    console.log(JSON.stringify({ pages: pages.length, fetched: all.size, expected, complete,
      labeled: labeled.length, pending: pending.length,
      merged: labeled.filter((row) => row.state === "merged").length,
      closed: labeled.filter((row) => row.state === "closed").length }));
  }
} else {
  throw new Error("Use schema, brief BATCH, read BATCH [OFFSET], save BATCH FILE, append BATCH FILE, pending [SHARD], status, export, or export-complete [REVIEWED_JSON]");
}
