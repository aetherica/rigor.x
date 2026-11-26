// WS32 WP2: quotas, usage, run listing, private profile IDs, compact run views, schema migrations.
// Expected values are set by hand from the limits passed in, not read back from the engine.
import { test } from "node:test";
import assert from "node:assert/strict";
import { dispatch, HostEngine, RECENT_ACTIONS, type EngineOptions } from "../src/engine.ts";
import { DurableObjectRunStore, SCHEMA_VERSION, migrate } from "../src/store.ts";
import { limitsFromEnv } from "../src/limits.ts";
import { memorySql } from "./sqlite-fake.ts";

type Envelope = { ok: true; result: any } | { ok: false; code: string; message: string };

function engineWith(options: EngineOptions = {}) {
	const sql = memorySql();
	const engine = new HostEngine(new DurableObjectRunStore(sql), options);
	const call = (owner: string, operation: string, args: Record<string, unknown> = {}): Envelope =>
		JSON.parse(dispatch(engine, owner, operation, JSON.stringify(args)));
	return { sql, engine, call };
}

function clock(iso: string) {
	let t = new Date(iso).getTime();
	return { now: () => new Date(t), advance: (ms: number) => { t += ms; } };
}

test("daily call quota refuses the call after the limit, keeps reads and deletes, resets at 00:00 UTC", () => {
	const c = clock("2026-11-26T23:59:00Z");
	const { call } = engineWith({ limits: { callsPerDay: 3, burstPerMinute: 1000 }, now: c.now });
	const run = call("google:a", "start_run", { task: "quota test task" });
	assert.equal(run.ok, true);
	const id = (run as any).result.run_id;
	for (let i = 0; i < 2; i++) assert.equal(call("google:a", "reenter", { run_id: id, target_stage: "QUERY", trigger: "t", reason: "r" }).ok, true);
	const refused = call("google:a", "reenter", { run_id: id, target_stage: "QUERY", trigger: "t", reason: "r" });
	assert.equal(refused.ok, false);
	assert.equal((refused as any).code, "QUOTA_EXCEEDED");
	assert.match((refused as any).message, /3 tool calls.*2026-11-27T00:00:00\.000Z/);
	// Reads and deletes are not metered.
	assert.equal(call("google:a", "get_run", { run_id: id }).ok, true);
	assert.equal(call("google:a", "list_runs").ok, true);
	const usage = call("google:a", "usage") as any;
	assert.deepEqual(usage.result.calls, { used: 3, limit: 3 });
	assert.equal(usage.result.limits_provisional, true);
	// Another owner has its own counter.
	assert.equal(call("google:b", "start_run", { task: "other owner task" }).ok, true);
	// A new UTC day starts a new counter.
	c.advance(60_000);
	assert.equal(call("google:a", "reenter", { run_id: id, target_stage: "QUERY", trigger: "t", reason: "r" }).ok, true);
	assert.equal((call("google:a", "usage") as any).result.day, "2026-11-27");
	assert.equal(call("google:a", "delete_run", { run_id: id }).ok, true);
});

test("new-run and stored-run limits", () => {
	const { call } = engineWith({ limits: { runsPerDay: 2, storedRuns: 10, burstPerMinute: 1000 } });
	assert.equal(call("google:a", "start_run", { task: "first run" }).ok, true);
	assert.equal(call("google:a", "start_run", { task: "second run" }).ok, true);
	const third = call("google:a", "start_run", { task: "third run" }) as any;
	assert.equal(third.code, "QUOTA_EXCEEDED");
	assert.match(third.message, /2 new runs/);

	const s = engineWith({ limits: { storedRuns: 2, burstPerMinute: 1000 } });
	const first = s.call("google:a", "start_run", { task: "first run" }) as any;
	s.call("google:a", "start_run", { task: "second run" });
	const full = s.call("google:a", "start_run", { task: "third run" }) as any;
	assert.equal(full.code, "QUOTA_EXCEEDED");
	assert.match(full.message, /rigorx_delete_run/);
	s.call("google:a", "delete_run", { run_id: first.result.run_id });
	assert.equal(s.call("google:a", "start_run", { task: "third run" }).ok, true);
	assert.deepEqual((s.call("google:a", "usage") as any).result.stored_runs, { used: 2, limit: 2 });
});

test("burst limit per minute", () => {
	const c = clock("2026-11-26T10:00:00Z");
	const { call } = engineWith({ limits: { burstPerMinute: 2 }, now: c.now });
	assert.equal(call("google:a", "start_run", { task: "burst one" }).ok, true);
	assert.equal(call("google:a", "start_run", { task: "burst two" }).ok, true);
	assert.equal((call("google:a", "start_run", { task: "burst three" }) as any).code, "QUOTA_EXCEEDED");
	c.advance(60_000);
	assert.equal(call("google:a", "start_run", { task: "burst three" }).ok, true);
});

test("list_runs pages newest first, only the caller's runs, with a stable cursor", () => {
	const c = clock("2026-11-26T10:00:00Z");
	const { call } = engineWith({ limits: { burstPerMinute: 1000 } });
	const ids: string[] = [];
	for (let i = 0; i < 5; i++) {
		ids.push((call("google:a", "start_run", { task: `listed run ${i}` }) as any).result.run_id);
		c.advance(1);
	}
	call("google:b", "start_run", { task: "someone else's run" });
	const page1 = (call("google:a", "list_runs", { limit: 2 }) as any).result;
	assert.equal(page1.runs.length, 2);
	assert.ok(page1.next_cursor);
	const page2 = (call("google:a", "list_runs", { limit: 2, cursor: page1.next_cursor }) as any).result;
	const page3 = (call("google:a", "list_runs", { limit: 2, cursor: page2.next_cursor }) as any).result;
	assert.equal(page3.runs.length, 1);
	assert.equal(page3.next_cursor, null);
	const listed = [...page1.runs, ...page2.runs, ...page3.runs].map((r: any) => r.run_id);
	assert.deepEqual([...listed].sort(), [...ids].sort()); // all five, none of owner b
	const first = page1.runs[0];
	assert.equal(first.status, "IN_PROGRESS");
	assert.equal(first.current_stage, "QUERY");
	assert.equal(first.engine_protocol_version, "2.0.0");
	assert.equal((call("google:a", "list_runs", { limit: 0 }) as any).code, "INVALID_REQUEST");
	assert.equal((call("google:a", "list_runs", { limit: 51 }) as any).code, "INVALID_REQUEST");
	assert.equal((call("google:a", "list_runs", { cursor: "not-a-cursor" }) as any).code, "INVALID_REQUEST");
});

test("profile IDs are random per owner, stable, and not a hash of the owner", () => {
	const { call } = engineWith();
	const a1 = (call("google:a", "profile") as any).result.id;
	const a2 = (call("google:a", "profile") as any).result.id;
	const b = (call("google:b", "profile") as any).result.id;
	assert.match(a1, /^[0-9a-f]{32}$/);
	assert.equal(a1, a2);
	assert.notEqual(a1, b);
	const other = engineWith(); // same owner, separate storage: a different random ID
	assert.notEqual((other.call("google:a", "profile") as any).result.id, a1);
});

test("run views return recent actions, the total and unresolved failures", () => {
	const { call } = engineWith({ limits: { burstPerMinute: 1000 } });
	const id = (call("google:a", "start_run", { task: "many actions" }) as any).result.run_id;
	const failed = (call("google:a", "report_action", { run_id: id, tool_name: "bash", status: "FAILED" }) as any).result.action_id;
	for (let i = 0; i < 14; i++) call("google:a", "report_action", { run_id: id, tool_name: "bash", status: "EXECUTED" });
	const view = (call("google:a", "get_run", { run_id: id }) as any).result;
	assert.equal(view.actions.length, RECENT_ACTIONS);
	assert.equal(view.actions_total, 15);
	assert.deepEqual(view.actions_unresolved, [failed]);
	call("google:a", "report_action", { run_id: id, tool_name: "bash", status: "EXECUTED", resolves: failed });
	assert.deepEqual((call("google:a", "get_run", { run_id: id }) as any).result.actions_unresolved, []);
});

test("schema migrations upgrade a version-1 database in place and refuse newer ones", () => {
	const sql = memorySql();
	// A database exactly as the version-1 store left it, with one run.
	sql.exec("CREATE TABLE host_store_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
	sql.exec("INSERT INTO host_store_meta(key, value) VALUES('schema_version', '1')");
	sql.exec("CREATE TABLE host_runs (run_id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision >= 1), snapshot_json TEXT NOT NULL, meta_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)");
	const old = engineWith();
	const run = (old.call("google:a", "start_run", { task: "made before the migration" }) as any).result.run_id;
	const row = old.sql.exec("SELECT * FROM host_runs").toArray()[0]!;
	sql.exec("INSERT INTO host_runs VALUES(?, ?, ?, ?, ?, ?, ?)", String(row.run_id), String(row.owner_id), Number(row.revision),
		String(row.snapshot_json), String(row.meta_json), String(row.created_at), String(row.updated_at));

	const engine = new HostEngine(new DurableObjectRunStore(sql));
	assert.equal(SCHEMA_VERSION, 3);
	assert.equal(String(sql.exec("SELECT value FROM host_store_meta WHERE key = 'schema_version'").toArray()[0]!.value), "3");
	const get = JSON.parse(dispatch(engine, "google:a", "get_run", JSON.stringify({ run_id: run })));
	assert.equal(get.ok, true);
	assert.equal(migrate(sql), 3); // idempotent
	sql.exec("UPDATE host_store_meta SET value = '4' WHERE key = 'schema_version'");
	assert.throws(() => new DurableObjectRunStore(sql), /Unsupported host store schema version 4/);
});

test("usage reports storage bytes when the runtime provides them", () => {
	const { call } = engineWith();
	const bytes = (call("google:a", "usage") as any).result.storage_bytes;
	assert.equal(typeof bytes, "number");
	assert.ok(bytes > 0);
});

test("limits come from Worker vars and fall back on missing or invalid values", () => {
	assert.deepEqual(limitsFromEnv({ RIGORX_CALLS_PER_DAY: "7", RIGORX_RUNS_PER_DAY: "x", RIGORX_STORED_RUNS: "-1", RIGORX_FETCHES_PER_DAY: "30" }),
		{ callsPerDay: 7, runsPerDay: 100, storedRuns: 500, burstPerMinute: 120, fetchesPerDay: 30 });
});
