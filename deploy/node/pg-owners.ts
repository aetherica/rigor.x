// Per-owner storage on PostgreSQL by snapshot: each owner's whole SQLite database is one row in
// rigorx_private.owners. The engine stays synchronous and unchanged (the same code as the Durable
// Object); this class makes its results durable and consistent across processes.
//
// One operation (call):
//   1. Read the owner's row metadata (version, generation). Load the snapshot into the local cache
//      file only when the cache is not exactly that version (integrity-checked, snapshot.ts).
//   2. Run dispatch() on the local copy: one SQLite transaction, exactly as in a Durable Object.
//   3. If it changed the database, write the new snapshot in one PostgreSQL transaction under a
//      per-owner advisory lock, compare-and-swap on (version, generation). Only after COMMIT is the
//      result returned. Nothing outside the database happens inside dispatch(), so a retry has no
//      external side effect; an uncommitted attempt is never returned, so its IDs and timestamps
//      are never observed (replays across requests use the engine's idempotency keys, which are
//      stored inside the same snapshot and committed atomically with it).
//   4. Version conflict (another process wrote first): reload and re-run, at most `maxAttempts`
//      times, then STORAGE_CONFLICT. Generation conflict (the account was deleted meanwhile): no
//      retry, OWNER_DELETED_DURING_OPERATION, so a stale operation can never recreate the owner.
//
// Account deletion (operation delete_account_data, successful) deletes the owner row, records a
// tombstone with the next generation and deletes the owner's OAuth grants and tokens, all in one
// PostgreSQL transaction (the only operation that couples owner data and KV rows).
//
// Owner keys are HMAC-SHA256(OWNER_KEY_SECRET, owner ID): rows cannot be linked to an account ID
// without the secret. With OWNER_KEY_SECRET_PREVIOUS set, a row stored under the previous secret is
// found and moved to the current key on its next write (secret rotation without data loss).
import { createHmac } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { Pool, PoolClient } from "pg";
import { DurableObjectRunStore } from "../cloudflare-ts/src/store.ts";
import { HostEngine, dispatch } from "../cloudflare-ts/src/engine.ts";
import { limitsFromEnv, type LimitVars } from "../cloudflare-ts/src/limits.ts";
import { MemoryStore } from "../cloudflare-ts/src/memory.ts";
import { openSql, type FileSql } from "./sqlite.ts";
import { SCHEMA } from "./pg-migrations.ts";
import { SnapshotError, installSnapshot, sha256Hex, snapshotOf } from "./snapshot.ts";

const OWNERS = `${SCHEMA}.owners`;
const TOMBSTONES = `${SCHEMA}.owner_tombstones`;
const KV = `${SCHEMA}.kv`;

export interface PgOwnerOptions {
	dataDir: string;
	limits: LimitVars;
	secret: string;
	previousSecret?: string;
	/** Largest snapshot accepted (bytes); a write that would exceed it is refused (STORAGE_LIMIT). */
	maxSnapshotBytes: number;
	/** Total attempts per operation on version conflicts (1 = no retry). */
	maxAttempts: number;
	maxOpen?: number;
	/** Test seams only (storage race and failure tests); production passes none. */
	hooks?: {
		beforePersist?(attempt: number): Promise<void> | void;
	};
}

interface RowMeta {
	exists: boolean;
	/** Key of the row as stored (the previous-secret key while a rotation is pending). */
	rowKey: string;
	/** Key under the current secret: where the row is written and where tombstones live. */
	currentKey: string;
	/** 1: row stored under the current secret; 0: under the previous one. */
	keyVersion: 1 | 0;
	version: number;
	generation: number;
}

interface CacheEntry {
	sql: FileSql;
	engine: HostEngine;
	version: number;
	generation: number;
}

class Conflict extends Error {
	readonly kind: "version" | "generation";
	constructor(kind: "version" | "generation") {
		super(`storage ${kind} conflict`);
		this.kind = kind;
	}
}

const fail = (code: string, message: string) => JSON.stringify({ ok: false, code, message });
/** The OAuth library's user ID for an owner (auth.ts: owner.replace(/:/g, "-")); grants and tokens are keyed by it. */
export const oauthUserIdOf = (owner: string) => owner.replace(/:/g, "-");
/** LIKE pattern for a literal prefix. */
const likePrefix = (p: string) => p.replace(/[\\%_]/g, (c) => `\\${c}`) + "%";

export class PgOwnerStore {
	private readonly pool: Pool;
	private readonly o: Required<Omit<PgOwnerOptions, "previousSecret" | "hooks">> & Pick<PgOwnerOptions, "previousSecret" | "hooks">;
	private readonly dir: string;
	private readonly cache = new Map<string, CacheEntry>();
	private readonly queues = new Map<string, Promise<unknown>>();
	private closed = false;

	constructor(pool: Pool, options: PgOwnerOptions) {
		if (options.secret.length < 32) throw new Error("OWNER_KEY_SECRET must be at least 32 characters");
		this.pool = pool;
		this.o = { maxOpen: 64, ...options };
		this.dir = join(options.dataDir, "pg-cache");
		mkdirSync(this.dir, { recursive: true, mode: 0o700 });
	}

	/** HMAC-SHA256 owner key (hex) under the current secret, or the previous one. */
	keyOf(ownerId: string, which: "current" | "previous" = "current"): string {
		const secret = which === "current" ? this.o.secret : this.o.previousSecret;
		if (!secret) throw new Error("no previous owner key secret configured");
		return createHmac("sha256", secret).update(ownerId, "utf8").digest("hex");
	}

	/** Same signature as the SQLite OwnerStorage; the SHA-256 storage key is ignored (HMAC is used). */
	call(_sha256Key: string, ownerId: string, operation: string, payloadJson: string): Promise<string> {
		if (this.closed) return Promise.reject(new Error("owner storage is closed (server shutting down)"));
		const key = this.keyOf(ownerId);
		// Serialize operations per owner within this process (awaits would otherwise interleave).
		const prev = this.queues.get(key) ?? Promise.resolve();
		const run = prev.catch(() => {}).then(() => this.execute(key, ownerId, operation, payloadJson));
		const tail = run.catch(() => {});
		this.queues.set(key, tail);
		tail.then(() => { if (this.queues.get(key) === tail) this.queues.delete(key); });
		return run;
	}

	private async execute(key: string, ownerId: string, operation: string, payloadJson: string): Promise<string> {
		for (let attempt = 1; attempt <= this.o.maxAttempts; attempt++) {
			let meta: RowMeta;
			let entry: CacheEntry;
			try {
				meta = await this.readMeta(ownerId, key);
				entry = await this.ensureLocal(key, meta);
			} catch (e) {
				this.drop(key);
				if (e instanceof SnapshotError) return fail(e.code, `${e.message}; nothing was changed`);
				return fail("STORAGE_UNAVAILABLE", "owner storage is unavailable; nothing was changed");
			}
			const before = this.changes(entry);
			const result = dispatch(entry.engine, ownerId, operation, payloadJson);
			if (this.changes(entry) === before) return result; // nothing to persist (read-only)
			const ok = (JSON.parse(result) as { ok: boolean }).ok;
			try {
				await this.o.hooks?.beforePersist?.(attempt);
				if (ok && operation === "delete_account_data") {
					await this.persistDeletion(meta, ownerId);
					this.drop(key);
				} else {
					const { bytes, engineSchema } = snapshotOf(entry.sql.db, this.dir);
					if (bytes.length > this.o.maxSnapshotBytes) {
						this.drop(key);
						return fail("STORAGE_LIMIT", `this account's stored data would exceed ${this.o.maxSnapshotBytes} bytes; nothing was saved (delete older runs or topic memory)`);
					}
					const next = await this.persistSnapshot(meta, bytes, engineSchema);
					entry.version = next.version;
					entry.generation = next.generation;
				}
				return result;
			} catch (e) {
				this.drop(key); // the local copy holds an uncommitted change: never reuse it
				if (e instanceof Conflict) {
					if (e.kind === "generation") return fail("OWNER_DELETED_DURING_OPERATION", "this account's data was deleted while the operation ran; nothing was saved");
					continue; // version conflict: reload the latest snapshot and re-run
				}
				return fail("STORAGE_UNAVAILABLE", "owner storage is unavailable; nothing was saved");
			}
		}
		return fail("STORAGE_CONFLICT", `the operation conflicted with concurrent writes ${this.o.maxAttempts} times; nothing was saved, try again`);
	}

	private changes(entry: CacheEntry): number {
		return Number((entry.sql.db.prepare("SELECT total_changes() AS n").get() as { n: number }).n);
	}

	private async readMeta(ownerId: string, key: string): Promise<RowMeta> {
		const current = await this.pool.query(`SELECT version, generation FROM ${OWNERS} WHERE owner_key = $1`, [key]);
		if (current.rows.length) return { exists: true, rowKey: key, currentKey: key, keyVersion: 1, version: Number(current.rows[0].version), generation: Number(current.rows[0].generation) };
		if (this.o.previousSecret) {
			const oldKey = this.keyOf(ownerId, "previous");
			const old = await this.pool.query(`SELECT version, generation FROM ${OWNERS} WHERE owner_key = $1`, [oldKey]);
			if (old.rows.length) return { exists: true, rowKey: oldKey, currentKey: key, keyVersion: 0, version: Number(old.rows[0].version), generation: Number(old.rows[0].generation) };
		}
		const tomb = await this.pool.query(`SELECT generation FROM ${TOMBSTONES} WHERE owner_key = $1`, [key]);
		return { exists: false, rowKey: key, currentKey: key, keyVersion: 1, version: 0, generation: tomb.rows.length ? Number(tomb.rows[0].generation) : 0 };
	}

	private async ensureLocal(key: string, meta: RowMeta): Promise<CacheEntry> {
		const cached = this.cache.get(key);
		if (cached && cached.version === meta.version && cached.generation === meta.generation && meta.keyVersion === 1) {
			this.cache.delete(key);
			this.cache.set(key, cached); // most recently used
			return cached;
		}
		this.drop(key);
		const file = join(this.dir, `${key}.sqlite`);
		if (meta.exists) {
			const r = await this.pool.query(`SELECT snapshot, snapshot_sha256, version, generation FROM ${OWNERS} WHERE owner_key = $1`, [meta.rowKey]);
			if (!r.rows.length || Number(r.rows[0].version) !== meta.version || Number(r.rows[0].generation) !== meta.generation) throw new Conflict("version");
			installSnapshot(r.rows[0].snapshot as Buffer, String(r.rows[0].snapshot_sha256), file);
		} else {
			for (const suffix of ["", "-wal", "-shm"]) rmSync(file + suffix, { force: true });
		}
		const sql = openSql(file);
		const engine = new HostEngine(new DurableObjectRunStore(sql), {
			limits: limitsFromEnv(this.o.limits),
			memory: new MemoryStore(sql),
			transaction: (fn) => sql.transaction(fn),
		});
		const entry: CacheEntry = { sql, engine, version: meta.version, generation: meta.generation };
		this.evict();
		this.cache.set(key, entry);
		return entry;
	}

	private drop(key: string): void {
		const entry = this.cache.get(key);
		this.cache.delete(key);
		if (entry) {
			try { entry.sql.close(); } catch { /* already closed */ }
		}
		const file = join(this.dir, `${key}.sqlite`);
		for (const suffix of ["", "-wal", "-shm"]) rmSync(file + suffix, { force: true });
	}

	private evict(): void {
		while (this.cache.size >= this.o.maxOpen) {
			const oldest = this.cache.keys().next().value as string;
			this.drop(oldest);
		}
	}

	private async tx<T>(ownerKey: string, fn: (c: PoolClient) => Promise<T>): Promise<T> {
		const client = await this.pool.connect();
		try {
			await client.query("BEGIN");
			try {
				// Serializes every write to this owner across processes for the rest of the transaction.
				await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`rigorx-owner:${ownerKey}`]);
				const out = await fn(client);
				await client.query("COMMIT");
				return out;
			} catch (e) {
				await client.query("ROLLBACK").catch(() => {});
				throw e;
			}
		} finally {
			client.release();
		}
	}

	/** Re-reads the row inside the locked transaction and throws Conflict unless it is still `meta`. */
	private async verify(c: PoolClient, meta: RowMeta): Promise<void> {
		const tomb = await c.query(`SELECT generation FROM ${TOMBSTONES} WHERE owner_key = $1`, [meta.currentKey]);
		const tombGeneration = tomb.rows.length ? Number(tomb.rows[0].generation) : 0;
		const row = await c.query(`SELECT version, generation FROM ${OWNERS} WHERE owner_key = $1`, [meta.rowKey]);
		if (meta.exists) {
			if (!row.rows.length) throw new Conflict(tombGeneration > meta.generation ? "generation" : "version");
			if (Number(row.rows[0].generation) !== meta.generation) throw new Conflict("generation");
			if (Number(row.rows[0].version) !== meta.version) throw new Conflict("version");
		} else {
			if (tombGeneration !== meta.generation) throw new Conflict("generation");
			if (row.rows.length) throw new Conflict("version");
		}
	}

	private async persistSnapshot(meta: RowMeta, bytes: Buffer, engineSchema: number): Promise<{ version: number; generation: number }> {
		const currentKey = meta.currentKey;
		return this.tx(currentKey, async (c) => {
			await this.verify(c, meta);
			const sum = sha256Hex(bytes);
			if (meta.exists && meta.keyVersion === 1) {
				const r = await c.query(
					`UPDATE ${OWNERS} SET snapshot = $1, snapshot_sha256 = $2, engine_schema = $3, size_bytes = $4, version = version + 1, updated_at = now() WHERE owner_key = $5 AND version = $6 AND generation = $7`,
					[bytes, sum, engineSchema, bytes.length, meta.rowKey, meta.version, meta.generation],
				);
				if (r.rowCount !== 1) throw new Conflict("version");
				return { version: meta.version + 1, generation: meta.generation };
			}
			// New owner, or a row found under the previous secret: insert under the current key.
			await c.query(
				`INSERT INTO ${OWNERS}(owner_key, key_version, generation, version, snapshot, snapshot_sha256, engine_schema, size_bytes) VALUES($1, 1, $2, $3, $4, $5, $6, $7)`,
				[currentKey, meta.generation, meta.version + 1, bytes, sum, engineSchema, bytes.length],
			);
			if (meta.exists) await c.query(`DELETE FROM ${OWNERS} WHERE owner_key = $1`, [meta.rowKey]); // rotated away from the previous secret
			return { version: meta.version + 1, generation: meta.generation };
		}).catch((e) => {
			if (e && typeof e === "object" && (e as { code?: string }).code === "23505") throw new Conflict("version"); // concurrent insert
			throw e;
		});
	}

	private async persistDeletion(meta: RowMeta, ownerId: string): Promise<void> {
		await this.tx(meta.currentKey, async (c) => {
			await this.verify(c, meta);
			if (meta.exists) await c.query(`DELETE FROM ${OWNERS} WHERE owner_key = $1 AND version = $2 AND generation = $3`, [meta.rowKey, meta.version, meta.generation]);
			await c.query(
				`INSERT INTO ${TOMBSTONES}(owner_key, generation) VALUES($1, $2) ON CONFLICT (owner_key) DO UPDATE SET generation = EXCLUDED.generation, deleted_at = now()`,
				[meta.currentKey, meta.generation + 1],
			);
			const uid = oauthUserIdOf(ownerId);
			await c.query(`DELETE FROM ${KV} WHERE key LIKE $1 OR key LIKE $2`, [likePrefix(`grant:${uid}:`), likePrefix(`token:${uid}:`)]);
		});
	}

	get openCount(): number {
		return this.cache.size;
	}

	/** Closes local cache databases; the pool is owned by the server. */
	close(): void {
		this.closed = true;
		for (const key of [...this.cache.keys()]) this.drop(key);
	}
}
