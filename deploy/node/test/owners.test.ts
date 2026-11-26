// OwnerStorage: one SQLite file and engine per owner (the Durable Object boundary on Node).
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { OwnerStorage } from "../owners.ts";

const keyOf = (owner: string) => createHash("sha256").update(owner).digest("hex");
const call = (s: OwnerStorage, owner: string, op: string, args: object = {}) => JSON.parse(s.call(keyOf(owner), owner, op, JSON.stringify(args)));

test("each owner gets its own database file; one owner cannot see another's runs", () => {
	const dir = mkdtempSync(join(tmpdir(), "rigorx-owners-"));
	const s = new OwnerStorage(dir, {});
	const a = call(s, "google:alice", "start_run", { task: "Compare two storage engines for a small service" });
	assert.equal(a.ok, true, JSON.stringify(a));
	const runId = a.result.run_id as string;
	assert.equal(call(s, "google:alice", "list_runs").result.runs.length, 1);
	const bob = call(s, "google:bob", "list_runs");
	assert.equal(bob.ok, true);
	assert.equal(bob.result.runs.length, 0);
	const stolen = call(s, "google:bob", "get_run", { run_id: runId });
	assert.equal(stolen.ok, false); // not found in bob's own database
	const files = readdirSync(join(dir, "owners")).filter((f) => f.endsWith(".sqlite")).sort();
	assert.deepEqual(files, [`${keyOf("google:alice")}.sqlite`, `${keyOf("google:bob")}.sqlite`].sort());
	s.close();
});

test("storage keys are SHA-256 hex only: no path can be derived from user input", () => {
	const s = new OwnerStorage(mkdtempSync(join(tmpdir(), "rigorx-owners-")), {});
	for (const bad of ["../../etc/passwd", "a".repeat(63), "A".repeat(64), "", keyOf("x") + "/.."]) {
		assert.throws(() => s.call(bad, "google:x", "list_runs", "{}"), /invalid owner storage key/);
	}
	s.close();
});

test("evicted owners are reopened from disk with their data; closed storage refuses calls", () => {
	const dir = mkdtempSync(join(tmpdir(), "rigorx-owners-"));
	const s = new OwnerStorage(dir, {}, 2);
	call(s, "google:o1", "start_run", { task: "Plan a database migration with a rollback path" });
	call(s, "google:o2", "list_runs");
	call(s, "google:o3", "list_runs"); // evicts o1 (least recently used)
	assert.equal(s.openCount, 2);
	assert.equal(call(s, "google:o1", "list_runs").result.runs.length, 1);
	s.close();
	assert.throws(() => s.call(keyOf("google:o1"), "google:o1", "list_runs", "{}"), /closed/);
	assert.equal(existsSync(join(dir, "owners", `${keyOf("google:o1")}.sqlite-wal`)), false); // checkpointed on close
});

test("per-owner quotas come from the RIGORX_* variables, as on Cloudflare", () => {
	const s = new OwnerStorage(mkdtempSync(join(tmpdir(), "rigorx-owners-")), { RIGORX_RUNS_PER_DAY: "1" });
	assert.equal(call(s, "google:q", "start_run", { task: "Write a test plan for the importer module" }).ok, true);
	const second = call(s, "google:q", "start_run", { task: "Write a test plan for the exporter module" });
	assert.equal(second.ok, false);
	assert.match(second.code, /QUOTA|LIMIT|RATE/);
	assert.equal(call(s, "google:other", "start_run", { task: "Write a test plan for the parser module" }).ok, true); // quotas are per owner
	s.close();
});
