// Rollback compatibility check (release directive §12.4): a database written by THIS release must stay
// readable and writable by the PREVIOUS release, so rolling the Worker back does not strand data.
// Usage: node --experimental-strip-types scripts/rollback_compat.ts <path to the previous release's deploy/cloudflare-ts>
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const prev = resolve(process.argv[2] ?? ".");
const file = join(mkdtempSync(join(tmpdir(), "rigorx-rollback-")), "do.sqlite");
const sqlOn = (db: DatabaseSync) => ({ exec: (q: string, ...b: (string | number)[]) => { const rows = db.prepare(q).all(...b) as Record<string, unknown>[]; return { toArray: () => rows.map((r) => ({ ...r })) }; }, get databaseSize() { return 0; } });
const owner = "google:rollback";

// 1. The new release writes: a run with evidence (idempotent), memory, an approval request.
{
	const { dispatch, HostEngine } = await import("../src/engine.ts");
	const { DurableObjectRunStore } = await import("../src/store.ts");
	const { MemoryStore } = await import("../src/memory.ts");
	const db = new DatabaseSync(file);
	const sql = sqlOn(db);
	const e = new HostEngine(new DurableObjectRunStore(sql), { memory: new MemoryStore(sql) });
	const ok = (op: string, a: object) => { const r = JSON.parse(dispatch(e, owner, op, JSON.stringify(a))); if (!r.ok) throw new Error(`${op}: ${r.message}`); return r.result; };
	const run = ok("start_run", { task: "Prepare the list of options for the team" }).run_id;
	ok("submit_stage", { run_id: run, stage: "QUERY", outcome: "completed", summary: "QUERY: the request and its context were restated for the rollback test." });
	ok("record_evidence", { run_id: run, source_ref: "https://example.com/a", claim: "A source recorded by the new release", source_domain: "D01", idempotency_key: "rollback-key-0001" });
	const t = ok("memory_topic", { action: "create", name: "Rollback", decided_by: "user" }).topic_id;
	ok("memory_write", { topic_id: t, text: "An item written by the new release before a rollback" });
	db.close();
	console.log(JSON.stringify({ step: "new release wrote", run }));
}
// 2. The previous release opens the same database and keeps working.
{
	const m = async (p: string) => import(pathToFileURL(resolve(prev, p)).href);
	const { dispatch, HostEngine } = await m("src/engine.ts");
	const { DurableObjectRunStore } = await m("src/store.ts");
	const { MemoryStore } = await m("src/memory.ts");
	const db = new DatabaseSync(file);
	const sql = sqlOn(db);
	const e = new HostEngine(new DurableObjectRunStore(sql), { memory: new MemoryStore(sql) });
	const call = (op: string, a: object) => JSON.parse(dispatch(e, owner, op, JSON.stringify(a)));
	const runs = call("list_runs", {}).result.runs;
	const run = runs[0].run_id;
	const view = call("get_run", { run_id: run }).result;
	const next = call("submit_stage", { run_id: run, stage: "CLASSIFY", outcome: "completed", summary: "CLASSIFY: objective and requirements registered by the previous release.",
		data: { objective: "Answer the question the user actually asked here", deliverable: "A short written answer with sources", level: "L02_STANDARD", stakes: "low", requirements: [{ id: "R1", text: "Requirement R1 must hold for the delivered result" }] } });
	const recall = call("memory_recall", { queries: ["written by the new release"] }).result.items.length;
	const version = String(sql.exec("SELECT value FROM host_store_meta WHERE key = 'schema_version'").toArray()[0]!.value);
	console.log(JSON.stringify({ step: "previous release read and wrote", schema_version: version, evidence_count: view.evidence_count, classify_ok: next.ok, memory_items_found: recall }));
	if (!(view.evidence_count === 1 && next.ok && recall === 1 && version === "3")) { console.log("ROLLBACK COMPATIBILITY: FAIL"); process.exit(1); }
	console.log("ROLLBACK COMPATIBILITY: PASS");
}
