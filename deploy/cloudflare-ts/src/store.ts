// Owner-scoped run storage on Durable Object SQLite. Schema version 1 is the layout shared with
// the Python stores (src/rigorx/run_store.py); later versions are Worker-only. The store keeps run
// snapshots (JSON documents with an append-only `events` list) for any engine protocol version.
// Durable Object SQL is synchronous, so load → mutate → save in one call is atomic.

import type { Json, JsonObject } from "./text.ts";
import { MEMORY_STATEMENTS } from "./memory.ts";

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
	snapshot: JsonObject;
	meta: JsonObject;
	revision: number;
}

/** One row of rigorx_list_runs, read without parsing whole snapshots in JavaScript. */
export interface RunSummary {
	run_id: string;
	status: string;
	current_stage: string | null;
	intent: string | null;
	level: string | null;
	engine_protocol_version: string | null;
	created_at: string;
	updated_at: string;
}

export interface DailyUsage {
	calls: number;
	runs_started: number;
}

export interface RunStore {
	create(ownerId: string, runId: string, snapshot: JsonObject, meta: JsonObject): number;
	load(ownerId: string, runId: string): StoredHostRun;
	save(ownerId: string, runId: string, snapshot: JsonObject, meta: JsonObject, expectedRevision: number): number;
	delete(ownerId: string, runId: string): void;
	/** Newest first by (updated_at, run_id); `after` is the last row of the previous page. */
	list(ownerId: string, limit: number, after?: { updated_at: string; run_id: string }): RunSummary[];
	countRuns(ownerId: string): number;
	usage(ownerId: string, day: string): DailyUsage;
	/** Adds to the owner's counters for `day` (UTC, YYYY-MM-DD); drops the owner's rows older than `keepFrom`. */
	addUsage(ownerId: string, day: string, calls: number, runsStarted: number, keepFrom: string): void;
	/** The owner's stored profile ID, created once with `generate` (WS32 P0.8). */
	profileId(ownerId: string, generate: () => string): string;
	/** Size of this store's database in bytes, when the runtime reports it. */
	databaseBytes(): number | null;
	/** Auxiliary tables (idempotency, extra usage, approvals); absent on the Worker's stateless engine. */
	readonly aux?: AuxStore;
	deleteOwner?(ownerId: string): { runs: number; usage_rows: number; profile: number };
}

/** The subset of Durable Object `ctx.storage.sql` this store uses. */
export interface SqlLike {
	exec(query: string, ...bindings: (string | number)[]): { toArray(): Record<string, unknown>[] };
	/** Durable Object SQL reports the database size in bytes. */
	readonly databaseSize?: number;
}

/**
 * Versioned schema migrations (WS32 P0.4). Each statement is idempotent, so a migration that was
 * interrupted is simply applied again; `schema_version` records the highest version applied.
 * Version 1 is the layout shared with the Python stores; later versions are Worker-only.
 */
export const MIGRATIONS: readonly { version: number; statements: readonly string[] }[] = [
	{
		version: 1,
		statements: [
			"CREATE TABLE IF NOT EXISTS host_runs (" +
				"run_id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision >= 1), " +
				"snapshot_json TEXT NOT NULL, meta_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
		],
	},
	{
		version: 2,
		statements: [
			"CREATE INDEX IF NOT EXISTS host_runs_by_owner_updated ON host_runs(owner_id, updated_at, run_id)",
			"CREATE TABLE IF NOT EXISTS usage_daily (owner_id TEXT NOT NULL, day TEXT NOT NULL, " +
				"calls INTEGER NOT NULL DEFAULT 0 CHECK(calls >= 0), runs_started INTEGER NOT NULL DEFAULT 0 CHECK(runs_started >= 0), " +
				"PRIMARY KEY(owner_id, day))",
			"CREATE TABLE IF NOT EXISTS owner_profile (owner_id TEXT PRIMARY KEY, profile_id TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL)",
		],
	},
	{ version: 3, statements: MEMORY_STATEMENTS }, // topic memory (WS32 P2, src/memory.ts)
];
export const SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1]!.version;

/**
 * Auxiliary tables (2026-11-27 release). Additive and outside the versioned schema ON PURPOSE: the
 * schema version stays 3, so the previous release (which refuses a newer schema_version) can still
 * open every database after a rollback; it simply ignores these tables.
 * - idempotency_keys: results of state-changing calls sent with an idempotency_key (24 h).
 * - usage_extra: per-owner daily counters beyond calls and runs (external fetches).
 * - approval_requests: user approvals requested by the host and decided by the signed-in user.
 */
export const AUX_STATEMENTS: readonly string[] = [
	"CREATE TABLE IF NOT EXISTS idempotency_keys (owner_id TEXT NOT NULL, key TEXT NOT NULL, operation TEXT NOT NULL, digest TEXT NOT NULL, " +
		"result_json TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(owner_id, key))",
	"CREATE TABLE IF NOT EXISTS usage_extra (owner_id TEXT NOT NULL, day TEXT NOT NULL, kind TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(owner_id, day, kind))",
	"CREATE TABLE IF NOT EXISTS approval_requests (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, run_id TEXT NOT NULL, operation_id TEXT NOT NULL, " +
		"operation_digest TEXT NOT NULL, description TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, " +
		"decided_at TEXT, evidence_id TEXT)",
	"CREATE INDEX IF NOT EXISTS approval_requests_by_run ON approval_requests(owner_id, run_id)",
];

export interface IdempotentResult { operation: string; digest: string; result: JsonObject }
export interface ApprovalRequest {
	id: string; owner_id: string; run_id: string; operation_id: string; operation_digest: string; description: string;
	status: "pending" | "approved" | "denied"; created_at: string; expires_at: string; decided_at: string | null; evidence_id: string | null;
}

/** Owner-scoped access to the auxiliary tables. Every query is filtered by owner_id. */
export class AuxStore {
	private readonly sql: SqlLike;
	constructor(sql: SqlLike) {
		this.sql = sql;
		for (const st of AUX_STATEMENTS) sql.exec(st);
	}
	idempotencyGet(owner: string, key: string): IdempotentResult | null {
		const r = this.sql.exec("SELECT operation, digest, result_json FROM idempotency_keys WHERE owner_id = ? AND key = ?", owner, key).toArray()[0];
		return r ? { operation: String(r.operation), digest: String(r.digest), result: JSON.parse(String(r.result_json)) as JsonObject } : null;
	}
	idempotencyPut(owner: string, key: string, operation: string, digest: string, result: JsonObject, now: Date, ttlMs: number): void {
		this.sql.exec("DELETE FROM idempotency_keys WHERE owner_id = ? AND created_at < ?", owner, new Date(now.getTime() - ttlMs).toISOString());
		this.sql.exec("INSERT INTO idempotency_keys(owner_id, key, operation, digest, result_json, created_at) VALUES(?, ?, ?, ?, ?, ?)",
			owner, key, operation, digest, JSON.stringify(result), now.toISOString());
	}
	extra(owner: string, day: string, kind: string): number {
		const r = this.sql.exec("SELECT n FROM usage_extra WHERE owner_id = ? AND day = ? AND kind = ?", owner, day, kind).toArray()[0];
		return r ? Number(r.n) : 0;
	}
	addExtra(owner: string, day: string, kind: string, keepFrom: string): void {
		this.sql.exec("DELETE FROM usage_extra WHERE owner_id = ? AND day < ?", owner, keepFrom);
		this.sql.exec("INSERT INTO usage_extra(owner_id, day, kind, n) VALUES(?, ?, ?, 1) ON CONFLICT(owner_id, day, kind) DO UPDATE SET n = n + 1", owner, day, kind);
	}
	approvalCreate(a: ApprovalRequest): void {
		this.sql.exec("INSERT INTO approval_requests(id, owner_id, run_id, operation_id, operation_digest, description, status, created_at, expires_at, decided_at, evidence_id) " +
			"VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)", a.id, a.owner_id, a.run_id, a.operation_id, a.operation_digest, a.description, a.status, a.created_at, a.expires_at);
	}
	approvalGet(owner: string, id: string): ApprovalRequest | null {
		const r = this.sql.exec("SELECT * FROM approval_requests WHERE owner_id = ? AND id = ?", owner, id).toArray()[0];
		return r ? (r as unknown as ApprovalRequest) : null;
	}
	approvalDecide(owner: string, id: string, status: "approved" | "denied", at: string, evidenceId: string | null): void {
		this.sql.exec("UPDATE approval_requests SET status = ?, decided_at = ?, evidence_id = ? WHERE owner_id = ? AND id = ? AND status = 'pending'", status, at, evidenceId ?? "", owner, id);
	}
	/** Remove everything this owner has in the auxiliary tables (account data deletion). */
	deleteOwner(owner: string): number {
		let n = 0;
		for (const t of ["idempotency_keys", "usage_extra", "approval_requests"]) {
			n += Number(this.sql.exec(`SELECT COUNT(*) AS n FROM ${t} WHERE owner_id = ?`, owner).toArray()[0]!.n);
			this.sql.exec(`DELETE FROM ${t} WHERE owner_id = ?`, owner);
		}
		return n;
	}
}

/** Apply pending migrations; refuses a database written by a newer schema. Returns the version. */
export function migrate(sql: SqlLike): number {
	sql.exec("CREATE TABLE IF NOT EXISTS host_store_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
	const found = sql.exec("SELECT value FROM host_store_meta WHERE key = 'schema_version'").toArray();
	const current = found.length ? Number(found[0]!.value) : 0;
	if (!Number.isInteger(current) || current < 0) throw new RunStoreError(`Invalid host store schema version ${String(found[0]?.value)}`);
	if (current > SCHEMA_VERSION) throw new RunStoreError(`Unsupported host store schema version ${current}`);
	for (const m of MIGRATIONS) {
		if (m.version <= current) continue;
		for (const statement of m.statements) sql.exec(statement);
		sql.exec(
			"INSERT INTO host_store_meta(key, value) VALUES('schema_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
			String(m.version),
		);
	}
	return SCHEMA_VERSION;
}

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
	readonly aux: AuxStore;

	constructor(sql: SqlLike) {
		this.sql = sql;
		migrate(sql);
		this.aux = new AuxStore(sql);
	}

	/** Delete every run, usage row and profile of this owner (account data deletion). Returns counts. */
	deleteOwner(ownerId: string): { runs: number; usage_rows: number; profile: number } {
		const count = (t: string) => Number(this.sql.exec(`SELECT COUNT(*) AS n FROM ${t} WHERE owner_id = ?`, ownerId).toArray()[0]!.n);
		const out = { runs: count("host_runs"), usage_rows: count("usage_daily"), profile: count("owner_profile") };
		for (const t of ["host_runs", "usage_daily", "owner_profile"]) this.sql.exec(`DELETE FROM ${t} WHERE owner_id = ?`, ownerId);
		return out;
	}

	create(ownerId: string, runId: string, snapshot: JsonObject, meta: JsonObject): number {
		if (!Array.isArray(snapshot.events)) throw new RunStoreError("A run snapshot needs an events list");
		if (this.sql.exec("SELECT run_id FROM host_runs WHERE run_id = ?", runId).toArray().length) {
			throw new RevisionConflict("Run ID already exists");
		}
		const stamp = now();
		this.sql.exec(
			"INSERT INTO host_runs(run_id, owner_id, revision, snapshot_json, meta_json, created_at, updated_at) VALUES(?, ?, 1, ?, ?, ?, ?)",
			runId, ownerId, canonicalJson(snapshot), canonicalJson(meta), stamp, stamp,
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
			snapshot: JSON.parse(String(row.snapshot_json)) as JsonObject,
			meta: JSON.parse(String(row.meta_json)) as JsonObject,
			revision: Number(row.revision),
		};
	}

	save(ownerId: string, runId: string, snapshot: JsonObject, meta: JsonObject, expectedRevision: number): number {
		const rows = this.sql.exec(
			"SELECT revision, snapshot_json, json_array_length(snapshot_json, '$.events') AS stored_events FROM host_runs WHERE run_id = ? AND owner_id = ?", runId, ownerId,
		).toArray();
		if (rows.length === 0) throw new RunNotFound(runId);
		const row = rows[0]!;
		if (Number(row.revision) !== expectedRevision) {
			throw new RevisionConflict(`Expected revision ${expectedRevision}, found ${String(row.revision)}`);
		}
		// Append-only check without parsing the stored snapshot again (2026-11-26 audit, §09): the stored
		// row is canonical JSON, so its top-level events array is exactly canonicalJson(previous events).
		// The first `stored` events of the new snapshot must serialize to that same text. Same guarantee
		// as comparing event by event; one serialization instead of a parse plus two.
		const stored = Number(row.stored_events);
		const events = snapshot.events as Json[];
		if (!Array.isArray(events) || !Number.isInteger(stored) || events.length < stored ||
			!String(row.snapshot_json).includes(`"events":${canonicalJson(events.slice(0, stored))}`)) {
			throw new EventIntegrityError("Event history must remain append-only");
		}
		const revision = expectedRevision + 1;
		this.sql.exec(
			"UPDATE host_runs SET revision = ?, snapshot_json = ?, meta_json = ?, updated_at = ? WHERE run_id = ? AND owner_id = ? AND revision = ?",
			revision, canonicalJson(snapshot), canonicalJson(meta), now(), runId, ownerId, expectedRevision,
		);
		return revision;
	}

	delete(ownerId: string, runId: string): void {
		if (!this.sql.exec("SELECT run_id FROM host_runs WHERE run_id = ? AND owner_id = ?", runId, ownerId).toArray().length) {
			throw new RunNotFound(runId);
		}
		this.sql.exec("DELETE FROM host_runs WHERE run_id = ? AND owner_id = ?", runId, ownerId);
	}

	list(ownerId: string, limit: number, after?: { updated_at: string; run_id: string }): RunSummary[] {
		const columns =
			"SELECT run_id, created_at, updated_at, json_extract(snapshot_json, '$.status') AS status, " +
			"json_extract(snapshot_json, '$.current_stage') AS current_stage, json_extract(meta_json, '$.intent') AS intent, " +
			"json_extract(meta_json, '$.level') AS level, json_extract(meta_json, '$.engine_protocol_version') AS engine_protocol_version " +
			"FROM host_runs WHERE owner_id = ?";
		const order = " ORDER BY updated_at DESC, run_id DESC LIMIT ?";
		const rows = after
			? this.sql.exec(columns + " AND (updated_at < ? OR (updated_at = ? AND run_id < ?))" + order,
				ownerId, after.updated_at, after.updated_at, after.run_id, limit).toArray()
			: this.sql.exec(columns + order, ownerId, limit).toArray();
		return rows.map((r) => {
			const status = String(r.status);
			const open = status !== "COMPLETED" && status !== "CANCELLED";
			return {
				run_id: String(r.run_id),
				status,
				current_stage: open && r.current_stage != null ? String(r.current_stage) : null,
				intent: r.intent == null ? null : String(r.intent),
				level: r.level == null ? null : String(r.level),
				engine_protocol_version: r.engine_protocol_version == null ? null : String(r.engine_protocol_version),
				created_at: String(r.created_at),
				updated_at: String(r.updated_at),
			};
		});
	}

	countRuns(ownerId: string): number {
		return Number(this.sql.exec("SELECT COUNT(*) AS n FROM host_runs WHERE owner_id = ?", ownerId).toArray()[0]!.n);
	}

	usage(ownerId: string, day: string): DailyUsage {
		const rows = this.sql.exec("SELECT calls, runs_started FROM usage_daily WHERE owner_id = ? AND day = ?", ownerId, day).toArray();
		return rows.length ? { calls: Number(rows[0]!.calls), runs_started: Number(rows[0]!.runs_started) } : { calls: 0, runs_started: 0 };
	}

	addUsage(ownerId: string, day: string, calls: number, runsStarted: number, keepFrom: string): void {
		const existing = this.sql.exec("SELECT 1 AS x FROM usage_daily WHERE owner_id = ? AND day = ?", ownerId, day).toArray().length > 0;
		if (!existing) this.sql.exec("DELETE FROM usage_daily WHERE owner_id = ? AND day < ?", ownerId, keepFrom);
		this.sql.exec(
			"INSERT INTO usage_daily(owner_id, day, calls, runs_started) VALUES(?, ?, ?, ?) " +
				"ON CONFLICT(owner_id, day) DO UPDATE SET calls = calls + excluded.calls, runs_started = runs_started + excluded.runs_started",
			ownerId, day, calls, runsStarted,
		);
	}

	profileId(ownerId: string, generate: () => string): string {
		const rows = this.sql.exec("SELECT profile_id FROM owner_profile WHERE owner_id = ?", ownerId).toArray();
		if (rows.length) return String(rows[0]!.profile_id);
		const id = generate();
		this.sql.exec("INSERT INTO owner_profile(owner_id, profile_id, created_at) VALUES(?, ?, ?)", ownerId, id, now());
		return id;
	}

	databaseBytes(): number | null {
		const size = this.sql.databaseSize;
		return typeof size === "number" && Number.isFinite(size) ? size : null;
	}
}
