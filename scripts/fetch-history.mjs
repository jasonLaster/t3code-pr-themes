import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { setTimeout } from "node:timers/promises";
import { promisify } from "node:util";

const run = promisify(execFile);
const root = ".pr-backfill";
const pagesDir = `${root}/pages`;
const indexedDir = `${root}/ranges`;
const remainingDir = `${root}/ranges-unindexed`;
mkdirSync(pagesDir, { recursive: true });
mkdirSync(indexedDir, { recursive: true });
mkdirSync(remainingDir, { recursive: true });
const read = (file) => JSON.parse(readFileSync(file, "utf8"));
function checkpoint(file, data) {
  writeFileSync(`${file}.tmp`, JSON.stringify(data));
  renameSync(`${file}.tmp`, file);
}

const query = `query($filter: String!, $after: String, $size: Int!) {
  search(type: ISSUE, query: $filter, first: $size, after: $after) {
    issueCount
    pageInfo { hasNextPage endCursor }
    nodes { ... on PullRequest {
      number title bodyText state closedAt mergedAt isDraft createdAt updatedAt additions deletions author { login }
    }}
  }
  rateLimit { cost }
}`;

const snapshotFile = `${root}/snapshot.json`;
if (!existsSync(snapshotFile)) checkpoint(snapshotFile, new Date().toISOString().slice(0, 19) + "Z");
const cutoff = read(snapshotFile);
const base = "repo:pingdotgg/t3code is:pr is:closed";
let requests = 0;
let points = 0;
let retryAfter = 0;

async function github(filter, after) {
  const args = ["api", "graphql", "-f", `query=${query}`, "-f", `filter=${filter}`];
  if (after) args.push("-f", `after=${after}`);
  for (let attempt = 0; ; attempt++) {
    while (Date.now() < retryAfter) await setTimeout(retryAfter - Date.now());
    const size = attempt < 2 ? 100 : attempt < 4 ? 50 : 25;
    try {
      const { stdout } = await run("gh", [...args, "-F", `size=${size}`], {
        maxBuffer: 32 * 1024 ** 2, timeout: 30000,
      });
      const { data, errors } = JSON.parse(stdout);
      if (errors?.length) throw new Error(JSON.stringify(errors));
      requests++;
      points += data.rateLimit.cost;
      return data.search;
    } catch (error) {
      const details = error.stderr?.trim() || error.message.split("\n")[0];
      if (attempt === 5) throw new Error(`${filter}: ${details}`);
      if (/secondary rate limit/i.test(details)) {
        if (Date.now() >= retryAfter) console.warn("GitHub secondary rate limit; pausing requests for two minutes");
        retryAfter = Math.max(retryAfter, Date.now() + 120000);
      } else {
        await setTimeout(1000 * 2 ** attempt);
      }
    }
  }
}

const day = 864e5;
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
async function fetchRange(start, end, dateFilter, directory) {
  const file = `${directory}/${iso(start)}_${iso(end)}.json`;
  if (existsSync(file)) return read(file);
  const qualifier = start === end ? iso(start) : `${iso(start)}..${iso(end)}`;
  const filter = `${base} ${dateFilter} created:${qualifier} sort:created-asc`;
  let page = await github(filter);
  if (page.issueCount > 1000) {
    if (start === end) throw new Error(`GitHub search exceeds 1,000 PRs on ${qualifier}`);
    const middle = start + Math.floor((end - start) / (2 * day)) * day;
    return [...await fetchRange(start, middle, dateFilter, directory), ...await fetchRange(middle + day, end, dateFilter, directory)];
  }
  const rows = new Map();
  const count = page.issueCount;
  for (;;) {
    for (const { bodyText, ...row } of page.nodes) {
      if (!row.number || !["CLOSED", "MERGED"].includes(row.state)) throw new Error(`Invalid PR in ${qualifier}`);
      rows.set(row.number, { ...row, excerpt: (bodyText ?? "").slice(0, 1500).toWellFormed() });
    }
    if (!page.pageInfo.hasNextPage) break;
    page = await github(filter, page.pageInfo.endCursor);
  }
  if (rows.size !== count) throw new Error(`${qualifier}: expected ${count}, found ${rows.size}`);
  const result = [...rows.values()];
  checkpoint(file, result);
  return result;
}

// GitHub's search index omits the closed date for some PRs. Walk both halves
// and use the timestamp and state on the PR record to build the snapshot.
const end = Date.parse(cutoff.slice(0, 10));
const ranges = [];
for (let start = Date.parse("2026-02-01"); start <= end; start += 7 * day) {
  const last = Math.min(start + 6 * day, end);
  ranges.push([start, last, `closed:<=${cutoff}`, indexedDir]);
  ranges.push([start, last, `-closed:<=${cutoff}`, remainingDir]);
}
const all = new Map();
const failures = [];
let completed = 0;
const rangeCount = ranges.length;
await Promise.all(Array.from({ length: 6 }, async () => {
  for (let range; (range = ranges.shift()); ) {
    try {
      for (const row of await fetchRange(...range)) {
        if (row.closedAt && row.closedAt <= cutoff) all.set(row.number, row);
      }
    } catch (error) {
      failures.push(error.message);
    }
    if (++completed % 20 === 0) console.log(`Fetched ${completed}/${rangeCount} date ranges, ${all.size} PRs at cutoff`);
  }
}));
if (failures.length) throw new Error(failures.join("\n"));

const merged = [...all.values()].filter((row) => row.state === "MERGED").length;
const closed = all.size - merged;
const expected = all.size;
const existing = readdirSync(pagesDir).filter((file) => /^\d{4}\.json$/.test(file)).sort();
for (const file of existing) {
  const page = read(`${pagesDir}/${file}`);
  for (const row of page.nodes) {
    if (!all.delete(row.number)) {
      throw new Error(`Existing checkpoint PR #${row.number} is absent from the snapshot; inspect before replacing source data`);
    }
  }
}
checkpoint(`${root}/inventory.json`, { cutoff, merged, closed });
const rows = [...all.values()].sort((a, b) => a.number - b.number);
for (let start = 0; start < rows.length; start += 100) {
  const name = String(existing.length + start / 100 + 1).padStart(4, "0");
  checkpoint(`${pagesDir}/${name}.json`, { nodes: rows.slice(start, start + 100), totalCount: expected,
    pageInfo: { hasNextPage: start + 100 < rows.length } });
}
if (!rows.length && existing.length) {
  const path = `${pagesDir}/${existing.at(-1)}`;
  checkpoint(path, { ...read(path), totalCount: expected, pageInfo: { hasNextPage: false } });
}
console.log(`Snapshot at ${cutoff}: ${merged} merged and ${closed} closed without merge, ${requests} GitHub GraphQL requests, ${points} points this run`);
