import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

// Convex CLI uses the development deployment for both codegen and mutations.
const dev = "intent-marlin-697";
const config = process.env.CONVEX_DEPLOYMENT ??
  readFileSync(".env.local", "utf8").match(/^CONVEX_DEPLOYMENT=(\S+)/m)?.[1];
if (config !== `dev:${dev}` || process.env.CONVEX_DEPLOY_KEY || process.env.CONVEX_SELF_HOSTED_URL) {
  throw new Error(`Set CONVEX_DEPLOYMENT to dev:${dev} and use your Convex CLI login`);
}
const inventory = ".pr-backfill/inventory.json";
if (existsSync(inventory)) {
  execFileSync("npx", ["convex", "run", "prHistory:recordSnapshot", readFileSync(inventory, "utf8")], { stdio: "inherit" });
}

const exportText = execFileSync(process.execPath, ["scripts/history-labels.mjs", "export"], {
  encoding: "utf8", maxBuffer: 32 * 1024 ** 2,
});
const rows = exportText.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
for (let start = 0; start < rows.length; start += 200) {
  const batch = rows.slice(start, start + 200);
  execFileSync("npx", ["convex", "run", "prHistory:save", JSON.stringify({ rows: batch })], { stdio: "inherit" });
}
console.log(`Verified checkpoints submitted to ${dev}: ${rows.length} PRs`);
