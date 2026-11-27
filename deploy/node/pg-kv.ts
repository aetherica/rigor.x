// The Workers KV subset the OAuth provider and auth.ts use, on PostgreSQL (rigorx_private.kv).
// Same semantics as kv.ts (SQLite), checked by the same conformance tests:
//   expirationTtl / expiration with the Workers KV minimum of 60 seconds; expired keys read as
//   missing and are not listed; byte-order listing (COLLATE "C") with exact prefix, limit and an
//   opaque cursor; JSON reads. Writes are immediately consistent (stronger than Workers KV).
import type { Pool } from "pg";
import { SCHEMA } from "./pg-migrations.ts";

const MIN_TTL_SECONDS = 60;
const MAX_LIST = 1000;
const T = `${SCHEMA}.kv`;

type GetType = "text" | "json";
interface PutOptions { expirationTtl?: number; expiration?: number; metadata?: unknown }
interface ListOptions { prefix?: string | null; limit?: number; cursor?: string | null }
interface ListKey { name: string; expiration?: number; metadata?: unknown }

export class PgKv {
	private readonly pool: Pool;
	private readonly now: () => number;

	constructor(pool: Pool, now: () => number = Date.now) {
		this.pool = pool;
		this.now = now;
	}

	private seconds(): number {
		return Math.floor(this.now() / 1000);
	}

	async get(key: string, options?: GetType | { type?: GetType; cacheTtl?: number }): Promise<unknown> {
		const type = typeof options === "string" ? options : options?.type ?? "text";
		if (type !== "text" && type !== "json") throw new TypeError(`KV get type "${type}" is not supported on the Node runtime`);
		const r = await this.pool.query(`SELECT value FROM ${T} WHERE key = $1 AND (expiration IS NULL OR expiration > $2)`, [key, this.seconds()]);
		if (!r.rows.length) return null;
		const value = String(r.rows[0].value);
		return type === "json" ? JSON.parse(value) : value;
	}

	async put(key: string, value: string, options: PutOptions = {}): Promise<void> {
		if (typeof key !== "string" || key === "") throw new TypeError("KV key must be a non-empty string");
		if (typeof value !== "string") throw new TypeError("KV value must be a string on the Node runtime");
		let expiration: number | null = null;
		if (options.expirationTtl !== undefined) {
			if (!(options.expirationTtl >= MIN_TTL_SECONDS)) throw new Error(`Invalid expiration_ttl of ${options.expirationTtl}. Expiration TTL must be at least ${MIN_TTL_SECONDS}.`);
			expiration = this.seconds() + Math.floor(options.expirationTtl);
		} else if (options.expiration !== undefined) {
			if (!(options.expiration >= this.seconds() + MIN_TTL_SECONDS)) throw new Error(`Invalid expiration of ${options.expiration}. Expiration times must be at least ${MIN_TTL_SECONDS} seconds in the future.`);
			expiration = Math.floor(options.expiration);
		}
		const metadata = options.metadata === undefined ? null : JSON.stringify(options.metadata);
		await this.pool.query(
			`INSERT INTO ${T}(key, value, expiration, metadata) VALUES($1, $2, $3, $4) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, expiration = EXCLUDED.expiration, metadata = EXCLUDED.metadata`,
			[key, value, expiration, metadata],
		);
	}

	async delete(key: string): Promise<void> {
		await this.pool.query(`DELETE FROM ${T} WHERE key = $1`, [key]);
	}

	async list(options: ListOptions = {}): Promise<{ keys: ListKey[]; list_complete: boolean; cursor?: string }> {
		const limit = Math.min(Math.max(1, options.limit ?? MAX_LIST), MAX_LIST);
		const prefix = options.prefix ?? "";
		const after = options.cursor ? Buffer.from(options.cursor, "base64url").toString("utf8") : "";
		// starts_with: exact prefix ("%" and "_" are literal); COLLATE "C": byte order, as Workers KV lists.
		const r = await this.pool.query(
			`SELECT key, expiration, metadata FROM ${T} WHERE starts_with(key, $1) AND key > $2 AND (expiration IS NULL OR expiration > $3) ORDER BY key LIMIT $4`,
			[prefix, after, this.seconds(), limit + 1],
		);
		const rows = r.rows as { key: string; expiration: string | null; metadata: string | null }[];
		const page = rows.slice(0, limit);
		const keys = page.map((row) => {
			const k: ListKey = { name: row.key };
			if (row.expiration !== null) k.expiration = Number(row.expiration);
			if (row.metadata !== null) k.metadata = JSON.parse(row.metadata);
			return k;
		});
		return rows.length <= limit ? { keys, list_complete: true } : { keys, list_complete: false, cursor: Buffer.from(page[page.length - 1]!.key, "utf8").toString("base64url") };
	}

	/** Deletes expired keys; returns how many. Run periodically by the server. */
	async purgeExpired(): Promise<number> {
		const r = await this.pool.query(`DELETE FROM ${T} WHERE expiration IS NOT NULL AND expiration <= $1`, [this.seconds()]);
		return r.rowCount ?? 0;
	}

	/** The pool is owned by the server; nothing to close here. */
	close(): void {}
}
