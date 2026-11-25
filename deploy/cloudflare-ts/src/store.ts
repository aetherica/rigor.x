// Port of src/rigorx/run_store.py + do_store.py: owner-scoped run storage on
// Durable Object SQLite. Same schema and JSON layout as the Python stores.
// Durable Object SQL is synchronous, so load → mutate → save in one call is atomic.

import { PipelineRun, type Json, type JsonObject } from "./pipeline.ts";

export class RunStoreError extends Error {
	override name = "RunStoreError";
}
export class RunNotFound extends RunStoreError {
	override name = "RunNotFound";
}
export class RevisionConflict extends RunStoreError {
	override name = "RevisionConflict";
}
export class EventIntegrityError extends RunStoreError {
	override name = "EventIntegrityError";
}

export interface StoredHostRun {
	run: PipelineRun;
	meta: JsonObject;
	revision: number;
}

export interface RunStore {
	create(ownerId: string, run: PipelineRun, meta: JsonObject): number;
	load(ownerId: string, runId: string): StoredHostRun;
	save(ownerId: string, run: PipelineRun, meta: JsonObject, expectedRevision: number): number;
	delete(ownerId: string, runId: string): void;
}

/** The subset of Durable Object `ctx.storage.sql` this store uses. */
export interface SqlLike {
	exec(query: string, ...bindings: (string | number)[]): { toArray(): Record<string, unknown>[] };
}

const SCHEMA_VERSION = 1;

/** Key-sorted JSON, matching Python's json.dumps(sort_keys=True). */
export function canonicalJson(value: unknown): string {
	return JSON.stringify(sortKeys(value));
}
function sortKeys(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(sortKeys);
	if (value && typeof value === "object") {
		return Object.fromEntries(Object.keys(value as object).sort().map((k) => [k, sortKeys((value as Record<string, unknown>)[k])]));
	}
	return value;
}

const now = () => new Date().toISOString().replace("Z", "+00:00");

export class DurableObjectRunStore implements RunStore {
	private readonly sql: SqlLike;

	constructor(sql: SqlLike) {
		this.sql = sql;
		sql.exec("CREATE TABLE IF NOT EXISTS host_store_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
		const found = sql.exec("SELECT value FROM host_store_meta WHERE key = 'schema_version'").toArray();
		if (found.length === 0) {
			sql.exec("INSERT INTO host_store_meta(key, value) VALUES('schema_version', ?)", String(SCHEMA_VERSION));
		} else if (Number(found[0]!.value) !== SCHEMA_VERSION) {
			throw new RunStoreError(`Unsupported host store schema version ${String(found[0]!.value)}`);
		}
		sql.exec(
			"CREATE TABLE IF NOT EXISTS host_runs (" +
				"run_id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision >= 1), " +
				"snapshot_json TEXT NOT NULL, meta_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
		);
	}

	create(ownerId: string, run: PipelineRun, meta: JsonObject): number {
		const snapshot = run.snapshot();
		PipelineRun.fromSnapshot(snapshot);
		if (this.sql.exec("SELECT run_id FROM host_runs WHERE run_id = ?", run.run_id).toArray().length) {
			throw new RevisionConflict("Run ID already exists");
		}
		const stamp = now();
		this.sql.exec(
			"INSERT INTO host_runs(run_id, owner_id, revision, snapshot_json, meta_json, created_at, updated_at) VALUES(?, ?, 1, ?, ?, ?, ?)",
			run.run_id, ownerId, canonicalJson(snapshot), canonicalJson(meta), stamp, stamp,
		);
		return 1;
	}

	load(ownerId: string, runId: string): StoredHostRun {
		const rows = this.sql.exec(
			"SELECT revision, snapshot_json, meta_json FROM host_runs WHERE run_id = ? AND owner_id = ?", runId, ownerId,
		).toArray();
		if (rows.length === 0) throw new RunNotFound(runId);
		const row = rows[0]!;
		return {
			run: PipelineRun.fromSnapshot(JSON.parse(String(row.snapshot_json))),
			meta: JSON.parse(String(row.meta_json)) as JsonObject,
			revision: Number(row.revision),
		};
	}

	save(ownerId: string, run: PipelineRun, meta: JsonObject, expectedRevision: number): number {
		const snapshot = run.snapshot();
		PipelineRun.fromSnapshot(snapshot);
		const rows = this.sql.exec(
			"SELECT revision, snapshot_json FROM host_runs WHERE run_id = ? AND owner_id = ?", run.run_id, ownerId,
		).toArray();
		if (rows.length === 0) throw new RunNotFound(run.run_id);
		const row = rows[0]!;
		if (Number(row.revision) !== expectedRevision) {
			throw new RevisionConflict(`Expected revision ${expectedRevision}, found ${String(row.revision)}`);
		}
		const previous = (JSON.parse(String(row.snapshot_json)) as { events: Json[] }).events;
		const events = snapshot.events as Json[];
		if (events.length < previous.length || previous.some((e, i) => canonicalJson(e) !== canonicalJson(events[i]))) {
			throw new EventIntegrityError("Event history must remain append-only");
		}
		const revision = expectedRevision + 1;
		this.sql.exec(
			"UPDATE host_runs SET revision = ?, snapshot_json = ?, meta_json = ?, updated_at = ? WHERE run_id = ? AND owner_id = ? AND revision = ?",
			revision, canonicalJson(snapshot), canonicalJson(meta), now(), run.run_id, ownerId, expectedRevision,
		);
		return revision;
	}

	delete(ownerId: string, runId: string): void {
		if (!this.sql.exec("SELECT run_id FROM host_runs WHERE run_id = ? AND owner_id = ?", runId, ownerId).toArray().length) {
			throw new RunNotFound(runId);
		}
		this.sql.exec("DELETE FROM host_runs WHERE run_id = ? AND owner_id = ?", runId, ownerId);
	}
}
