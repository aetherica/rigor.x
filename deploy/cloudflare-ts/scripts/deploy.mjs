// Deploy command for Workers Builds (`npm run deploy`): tags the Worker version with the commit it was
// built from, so /version and every log line can be tied to the exact source commit (release §12).
// Workers Builds sets WORKERS_CI_COMMIT_SHA; a local deploy without it is tagged "local".
import { spawnSync } from "node:child_process";

const sha = process.env.WORKERS_CI_COMMIT_SHA ?? "";
const valid = /^[0-9a-f]{40}$/.test(sha);
const tag = valid ? sha.slice(0, 12) : "local";
const message = valid ? `commit ${sha} (${process.env.WORKERS_CI_BRANCH ?? "?"})` : "local deploy (no commit SHA)";
console.log(`deploying rigorx-mcp version tag ${tag}: ${message}`);
const r = spawnSync("npx", ["wrangler", "deploy", "--tag", tag, "--message", message, ...process.argv.slice(2)], { stdio: "inherit" });
process.exit(r.status ?? 1);
