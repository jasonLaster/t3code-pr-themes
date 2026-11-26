import { execFile, execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { promisify } from "node:util";

const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== "--prod")) throw new Error("Use import-history.mjs [--prod]");
const production = args[0] === "--prod";
const deployment = production ? "glad-dinosaur-732" : "intent-marlin-697";
if (process.env.CONVEX_DEPLOY_KEY || process.env.CONVEX_SELF_HOSTED_URL) throw new Error("Use your Convex CLI login for this project");

const inventory = ".pr-backfill/inventory.json";
const reviewed = ".pr-backfill/reviewed.json";
const exportArgs = production ? ["export-complete", ...(existsSync(reviewed) ? [reviewed] : [])] : ["export"];
const snapshot = existsSync(inventory) ? readFileSync(inventory, "utf8") : null;
if (production && !snapshot) throw new Error("Production import requires a complete source snapshot");

const exportText = execFileSync(process.execPath, ["scripts/history-labels.mjs", ...exportArgs], {
  encoding: "utf8", maxBuffer: 32 * 1024 ** 2,
});
const rows = exportText.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
const run = promisify(execFile);
async function submit(fn, payload) {
  try {
    await run("node_modules/.bin/convex", ["run", "--deployment", deployment, fn, payload]);
  } catch (error) {
    throw new Error(error.stderr?.trim() || error.message);
  }
}

const batchSize = 400;
const concurrency = 3;
for (let start = 0; start < rows.length; start += batchSize * concurrency) {
  const batches = [];
  for (let offset = start; offset < Math.min(start + batchSize * concurrency, rows.length); offset += batchSize) {
    batches.push(rows.slice(offset, offset + batchSize));
  }
  await Promise.all(batches.map((batch) => submit("prHistory:save", JSON.stringify({ rows: batch }))));
  console.log(`Submitted ${Math.min(start + batchSize * concurrency, rows.length)}/${rows.length} PRs to ${deployment}`);
}
if (snapshot) await submit("prHistory:recordSnapshot", snapshot);
console.log(`Verified checkpoints submitted to ${deployment}: ${rows.length} PRs (${rows.filter((row) => row.labelSource).length} inferred)`);
