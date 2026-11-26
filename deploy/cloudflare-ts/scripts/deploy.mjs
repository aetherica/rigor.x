// Production deploy guard: deploy only a clean main checkout and tag the exact source commit.
// Workers Builds exports WORKERS_CI_COMMIT_SHA/WORKERS_CI_BRANCH. Local production deploys
// must satisfy the same provenance checks and may not silently fall back to a "local" tag.
import { spawnSync } from "node:child_process";

function git(args) {
  const r = spawnSync("git", args, { encoding: "utf8" });
  if (r.status !== 0) {
    const detail = (r.stderr || r.stdout || "").trim();
    throw new Error(`git ${args.join(" ")} failed: ${detail || r.status}`);
  }
  return r.stdout.trim();
}

const head = git(["rev-parse", "HEAD"]);
const branch = process.env.WORKERS_CI_BRANCH || git(["branch", "--show-current"]);
const sha = process.env.WORKERS_CI_COMMIT_SHA || head;

if (!/^[0-9a-f]{40}$/.test(sha)) {
  throw new Error("Production deploy requires a full 40-character commit SHA.");
}
if (sha !== head) {
  throw new Error(`Build SHA mismatch: CI reports ${sha}, checkout HEAD is ${head}.`);
}
if (branch !== "main") {
  throw new Error(`Production deploy blocked: expected branch main, got ${branch || "(detached/unknown)"}.`);
}
const dirty = git(["status", "--porcelain"]);
if (dirty) {
  throw new Error("Production deploy blocked: checkout is dirty. Commit all source/config changes first.");
}

const tag = sha.slice(0, 12);
const message = `commit ${sha} (main; provenance-guarded)`;
console.log(`deploying rigorx-mcp version tag ${tag}: ${message}`);
const r = spawnSync("npx", ["wrangler", "deploy", "--tag", tag, "--message", message, ...process.argv.slice(2)], { stdio: "inherit" });
process.exit(r.status ?? 1);
