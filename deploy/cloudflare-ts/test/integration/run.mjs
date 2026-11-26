// Starts the integration harness under `wrangler dev` and checks Durable Object storage behaviour on
// workerd's SQLite. Usage (from deploy/cloudflare-ts): node test/integration/run.mjs
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";

const port = 8796;
const base = `http://127.0.0.1:${port}`;
const dev = spawn("./node_modules/.bin/wrangler", ["dev", "-c", "test/integration/wrangler.jsonc", "--port", String(port), "--ip", "127.0.0.1",
	"--persist-to", mkdtempSync(join(tmpdir(), "rigorx-it-"))], { env: { ...process.env, WRANGLER_SEND_METRICS: "false", CI: "1" }, stdio: ["ignore", "pipe", "pipe"] });
let log = "";
dev.stdout.on("data", (d) => { log += d; });
dev.stderr.on("data", (d) => { log += d; });

async function ready() {
	for (let i = 0; i < 60; i++) {
		try { await fetch(`${base}/migration`, { method: "GET" }); return; } catch { await new Promise((r) => setTimeout(r, 1000)); }
	}
	throw new Error("wrangler dev did not start:\n" + log);
}
const call = async (owner, operation, args = {}) =>
	JSON.parse(await (await fetch(base, { method: "POST", body: JSON.stringify({ owner, operation, args }) })).text());

let failures = 0;
async function check(name, fn) {
	try { await fn(); console.log(`ok - ${name}`); } catch (e) { failures++; console.log(`not ok - ${name}\n  ${e.message}`); }
}

try {
	await ready();
	await check("migration from a hand-written version-1 database on workerd SQLite", async () => {
		const r = JSON.parse(await (await fetch(`${base}/migration`)).text());
		assert.equal(r.version, "2");
		assert.equal(r.listed.length, 1);
		assert.equal(r.listed[0].run_id, "rx_legacyrun0000000000");
		assert.equal(r.listed[0].current_stage, "INTENT"); // json_extract works in Durable Object SQLite
		assert.equal(r.listed[0].level, "L03_DEEP");
		assert.ok(typeof r.bytes === "number" && r.bytes > 0, `databaseSize ${r.bytes}`);
	});
	await check("quota counts metered calls exactly and keeps reads available", async () => {
		const owner = "google:it-quota";
		const run = await call(owner, "start_run", { task: "integration quota task" });
		assert.equal(run.ok, true, JSON.stringify(run));
		const id = run.result.run_id;
		for (let i = 0; i < 5; i++) assert.equal((await call(owner, "reenter", { run_id: id, target_stage: "QUERY", trigger: "t", reason: "r" })).ok, true);
		const refused = await call(owner, "reenter", { run_id: id, target_stage: "QUERY", trigger: "t", reason: "r" });
		assert.equal(refused.code, "QUOTA_EXCEEDED");
		const usage = await call(owner, "usage");
		assert.deepEqual(usage.result.calls, { used: 6, limit: 6 });
		assert.equal((await call(owner, "get_run", { run_id: id })).ok, true);
		assert.equal((await call(owner, "delete_run", { run_id: id })).ok, true);
	});
	await check("list_runs and profile on workerd", async () => {
		const owner = "google:it-list";
		for (let i = 0; i < 3; i++) await call(owner, "start_run", { task: `integration list task ${i}` });
		const page = await call(owner, "list_runs", { limit: 2 });
		assert.equal(page.result.runs.length, 2);
		const next = await call(owner, "list_runs", { limit: 2, cursor: page.result.next_cursor });
		assert.equal(next.result.runs.length, 1);
		const p1 = await call(owner, "profile");
		const p2 = await call(owner, "profile");
		assert.match(p1.result.id, /^[0-9a-f]{32}$/);
		assert.equal(p1.result.id, p2.result.id);
	});
	await check("rows written per call (recorded for the quota decision)", async () => {
		const rows = JSON.parse(await (await fetch(`${base}/rows-written`)).text());
		console.log("  rows written per call:", JSON.stringify(rows));
		assert.equal(rows.get_run, 0); // reads are not metered and write nothing
		for (const op of ["start_run", "submit_stage", "record_evidence", "report_action"]) assert.ok(rows[op] >= 1 && rows[op] <= 10, `${op}: ${rows[op]}`);
	});
} finally {
	dev.kill("SIGTERM");
}
if (failures) { console.log(`${failures} failed`); process.exit(1); }
console.log("all integration checks passed");
