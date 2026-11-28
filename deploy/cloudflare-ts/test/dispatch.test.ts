import { test } from "node:test";
import assert from "node:assert/strict";
import { dispatch, HostEngine, RUN_OPERATIONS } from "../src/engine.ts";
import { DurableObjectRunStore } from "../src/store.ts";
import { MemoryStore } from "../src/memory.ts";
import { memorySql } from "./sqlite-fake.ts";

test("every allow-listed operation has its own handler; none falls through to delete (2026-11-28 audit)", () => {
	const sql = memorySql();
	const engine = new HostEngine(new DurableObjectRunStore(sql), { transaction: sql.transaction, memory: new MemoryStore(sql) });
	const started = JSON.parse(dispatch(engine, "owner-a", "start_run", JSON.stringify({ task: "Compare two published estimates of a quantity and verify them." })));
	assert.equal(started.ok, true);
	const runId = started.result.run_id;
	for (const op of RUN_OPERATIONS) {
		if (op === "delete_run" || op === "delete_account_data") continue;
		const out = JSON.parse(dispatch(engine, "owner-a", op, JSON.stringify({ run_id: runId })));
		assert.ok(!(out.ok === false && /not implemented/.test(out.message)), `${op} has no handler`);
	}
	// The run must still exist: no operation above deleted it.
	assert.equal(JSON.parse(dispatch(engine, "owner-a", "get_run", JSON.stringify({ run_id: runId }))).ok, true);
});
