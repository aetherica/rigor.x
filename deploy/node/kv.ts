// The subset of the Cloudflare KV API the OAuth provider and auth.ts use (get, put, delete, list),
// on one SQLite file. Semantics follow Workers KV where the OAuth code depends on them:
//   - expirationTtl (seconds from now) and expiration (Unix seconds) make a key expire; an expired
//     key reads as missing and is not listed (purged lazily and by purgeExpired()).
//   - Like Workers KV, an expiration less than 60 seconds away is rejected, so OAuth TTLs behave
//     the same on both platforms.
//   - list() returns keys in lexicographic order with prefix, limit (max 1000) and an opaque cursor.
//   - get(key, "json" | { type: "json" }) parses JSON; get(key) or "text" returns the string.
// Unlike Workers KV, writes are immediately consistent everywhere (one process, one file).
import { DatabaseSync } from "node:sqlite";

const MIN_TTL_SECONDS = 60;
const MAX_LIST = 1000;

type GetType = "text" | "json";
interface PutOptions { expirationTtl?: number; expiration?: number; metadata?: unknown }
interface ListOptions { prefix?: string | null; limit?: number; cursor?: string | null }
interface ListKey { name: string; expiration?: number; metadata?: unknown }

export class SqliteKv {
	private readonly db: DatabaseSync;
	private readonly now: () => number;

	/** now: milliseconds clock (injectable for expiry tests). */
	constructor(path: string, now: () => number = Date.now) {
		this.db = new DatabaseSync(path);
		this.now = now;
		this.db.exec("PRAGMA journal_mode = WAL");
		this.db.exec("PRAGMA busy_timeout = 5000");
		this.db.exec("CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, expiration INTEGER, metadata TEXT) WITHOUT ROWID");
		this.db.exec("CREATE INDEX IF NOT EXISTS kv_expiration ON kv(expiration) WHERE expiration IS NOT NULL");
	}

	private seconds(): number {
		return Math.floor(this.now() / 1000);
	}

	async get(key: string, options?: GetType | { type?: GetType; cacheTtl?: number }): Promise<unknown> {
		const type = typeof options === "string" ? options : options?.type ?? "text";
		const row = this.db.prepare("SELECT value, expiration FROM kv WHERE key = ?").get(key) as { value: string; expiration: number | null } | undefined;
		if (!row) return null;
		if (row.expiration !== null && row.expiration <= this.seconds()) {
			this.db.prepare("DELETE FROM kv WHERE key = ? AND expiration <= ?").run(key, this.seconds());
			return null;
		}
		if (type === "json") return JSON.parse(row.value);
		if (type !== "text") throw new TypeError(`KV get type "${type}" is not supported on the Node runtime`);
		return row.value;
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
		this.db.prepare("INSERT INTO kv(key, value, expiration, metadata) VALUES(?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, expiration = excluded.expiration, metadata = excluded.metadata")
			.run(key, value, expiration, metadata);
	}

	async delete(key: string): Promise<void> {
		this.db.prepare("DELETE FROM kv WHERE key = ?").run(key);
	}

	async list(options: ListOptions = {}): Promise<{ keys: ListKey[]; list_complete: boolean; cursor?: string }> {
		const limit = Math.min(Math.max(1, options.limit ?? MAX_LIST), MAX_LIST);
		const prefix = options.prefix ?? "";
		const after = options.cursor ? Buffer.from(options.cursor, "base64url").toString("utf8") : "";
		// Exact prefix comparison (no LIKE, so "%" or "_" in a prefix cannot widen the match).
		const rows = this.db.prepare(
			"SELECT key, expiration, metadata FROM kv WHERE substr(key, 1, length(?)) = ? AND key > ? AND (expiration IS NULL OR expiration > ?) ORDER BY key LIMIT ?",
		).all(prefix, prefix, after, this.seconds(), limit + 1) as { key: string; expiration: number | null; metadata: string | null }[];
		const page = rows.slice(0, limit);
		const keys = page.map((r) => {
			const k: ListKey = { name: r.key };
			if (r.expiration !== null) k.expiration = r.expiration;
			if (r.metadata !== null) k.metadata = JSON.parse(r.metadata);
			return k;
		});
		const complete = rows.length <= limit;
		return complete ? { keys, list_complete: true } : { keys, list_complete: false, cursor: Buffer.from(page[page.length - 1]!.key, "utf8").toString("base64url") };
	}

	/** Deletes expired keys; returns how many. Run periodically by the server. */
	purgeExpired(): number {
		return Number(this.db.prepare("DELETE FROM kv WHERE expiration IS NOT NULL AND expiration <= ?").run(this.seconds()).changes);
	}

	close(): void {
		try {
			this.db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
		} finally {
			this.db.close();
		}
	}
}
