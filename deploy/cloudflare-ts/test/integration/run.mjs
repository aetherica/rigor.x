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
	await check("an operation is atomic on workerd: transactionSync rolls back every write when it throws (audit C1)", async () => {
		const r = JSON.parse(await (await fetch(`${base}/tx`)).text());
		assert.deepEqual(r, { threw: true, afterRollback: 0, afterCommit: 1 });
	});
	await check("a colliding topic merge through the real OwnerRuns object changes nothing (audit C1)", async () => {
		const owner = "google:merge";
		const mk = async (args) => { const r = await call(owner, "memory_topic", { decided_by: "user", ...args }); assert.ok(r.ok, JSON.stringify(r)); return r.result.topic_id; };
		const a = await mk({ action: "create", name: "Alpha" });
		const b = await mk({ action: "create", name: "Beta" });
		await mk({ action: "create", name: "Same", parent_id: a });
		await mk({ action: "create", name: "Same", parent_id: b });
		const before = (await call(owner, "memory_topic", { action: "list" })).result.topics;
		const merged = await call(owner, "memory_topic", { action: "merge", topic_id: a, into_id: b, decided_by: "user" });
		assert.equal(merged.ok, false);
		assert.deepEqual((await call(owner, "memory_topic", { action: "list" })).result.topics, before);
	});
	await check("tenant isolation across two real Durable Objects; idempotent replay on DO SQLite (release G08, G11)", async () => {
		const A = "google:iso-a", B = "google:iso-b";
		const run = (await call(A, "start_run", { task: "Prepare the list of options for the team" })).result.run_id;
		const key = "workerd-idem-0001";
		const e1 = await call(A, "record_evidence", { run_id: run, source_ref: "https://example.com/a", claim: "A private source of tenant A only", idempotency_key: key });
		const e2 = await call(A, "record_evidence", { run_id: run, source_ref: "https://example.com/a", claim: "A private source of tenant A only", idempotency_key: key });
		assert.equal(e2.result.idempotent_replay, true);
		assert.equal(e2.result.evidence_id, e1.result.evidence_id);
		assert.equal((await call(A, "get_run", { run_id: run })).result.evidence_count, 1);
		for (const op of ["get_run", "delete_run", "assess_sources"]) {
			const r = await call(B, op, { run_id: run });
			assert.equal(r.ok, false, op);
			assert.equal(r.code, "RUN_NOT_FOUND", op);
		}
		assert.equal((await call(A, "get_run", { run_id: run })).result.status, "IN_PROGRESS");
	});
	await check("migration from a hand-written version-1 database on workerd SQLite", async () => {
		const r = JSON.parse(await (await fetch(`${base}/migration`)).text());
		assert.equal(r.version, "3");
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
		for (let i = 0; i < 5; i++) assert.equal((await call(owner, "reenter", { run_id: id, target_stage: "QUERY", trigger: `quota-${i}`, reason: `quota accounting attempt ${i}` })).ok, true);
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
	await check("topic memory on workerd: FTS5 trigram recall in two scripts, deletion", async () => {
		const owner = "google:it-memory";
		const topic = (await call(owner, "memory_topic", { action: "create", name: "storage", decided_by: "host" })).result.topic_id;
		const zh = await call(owner, "memory_write", { topic_id: topic, text: "我们决定使用全文检索和三元组分词器", keywords: ["分词器", "全文检索"], kind: "decision" });
		assert.equal(zh.ok, true, JSON.stringify(zh));
		const bn = await call(owner, "memory_write", { topic_id: topic, text: "প্রতিটি ব্যবহারকারীর ডেটা আলাদা ভাবে রাখা হবে", keywords: ["ব্যবহারকারী", "ডেটা"], kind: "decision" });
		assert.equal(bn.ok, true, JSON.stringify(bn));
		const r1 = await call(owner, "memory_recall", { queries: ["用什么分词器"] });
		assert.equal(r1.result.items[0]?.id, zh.result.item_id, JSON.stringify(r1));
		const r2 = await call(owner, "memory_recall", { queries: ["ব্যবহারকারীর ডেটা কোথায়"] });
		assert.equal(r2.result.items[0]?.id, bn.result.item_id, JSON.stringify(r2));
		assert.equal((await call(owner, "memory_recall", { queries: ["chocolate cake recipe"] })).result.items.length, 0);
		assert.equal((await call(owner, "memory_delete", { item_ids: [zh.result.item_id], decided_by: "user" })).result.deleted_items, 1);
		assert.equal((await call(owner, "memory_recall", { queries: ["用什么分词器"] })).result.items.length, 0);
		const usage = await call(owner, "usage");
		assert.ok(usage.result.memory_bytes.used > 0 && usage.result.memory_bytes.limit === 125829120, JSON.stringify(usage.result.memory_bytes));
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
