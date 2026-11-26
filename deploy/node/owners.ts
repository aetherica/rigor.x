// Per-owner storage on Node: the equivalent of one Durable Object per owner. Each owner (named by
// the SHA-256 hex of the owner ID, exactly like the Durable Object name) gets its own SQLite file
// and its own engine instance; owners never share a database, so one owner's queries cannot reach
// another owner's rows even through a bug in a WHERE clause.
//
// Concurrency: dispatch() is synchronous and Node runs it on one thread, so operations on one owner
// are serialized exactly like a Durable Object's single-threaded execution, and each operation is
// one SQLite transaction (rolled back when it throws).
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DurableObjectRunStore } from "../cloudflare-ts/src/store.ts";
import { HostEngine, dispatch } from "../cloudflare-ts/src/engine.ts";
import { limitsFromEnv, type LimitVars } from "../cloudflare-ts/src/limits.ts";
import { MemoryStore } from "../cloudflare-ts/src/memory.ts";
import { openSql, type FileSql } from "./sqlite.ts";

const OWNER_KEY = /^[0-9a-f]{64}$/;

interface Open {
	sql: FileSql;
	engine: HostEngine;
}

export class OwnerStorage {
	private readonly dir: string;
	private readonly limits: LimitVars;
	private readonly maxOpen: number;
	/** Insertion order doubles as least-recently-used order (entries are re-inserted on use). */
	private readonly open = new Map<string, Open>();
	private closed = false;

	constructor(dataDir: string, limits: LimitVars, maxOpen = 128) {
		this.dir = join(dataDir, "owners");
		mkdirSync(this.dir, { recursive: true, mode: 0o700 });
		this.limits = limits;
		this.maxOpen = maxOpen;
	}

	/** Runs one engine operation for ownerId in the storage of `key` (SHA-256 hex of ownerId). */
	call(key: string, ownerId: string, operation: string, payloadJson: string): string {
		if (this.closed) throw new Error("owner storage is closed (server shutting down)");
		if (!OWNER_KEY.test(key)) throw new Error("invalid owner storage key"); // never a path from user input
		let entry = this.open.get(key);
		if (entry) {
			this.open.delete(key);
		} else {
			const sql = openSql(join(this.dir, `${key}.sqlite`));
			const engine = new HostEngine(new DurableObjectRunStore(sql), {
				limits: limitsFromEnv(this.limits),
				memory: new MemoryStore(sql),
				transaction: (fn) => sql.transaction(fn),
			});
			entry = { sql, engine };
			this.evict();
		}
		this.open.set(key, entry);
		return dispatch(entry.engine, ownerId, operation, payloadJson);
	}

	get openCount(): number {
		return this.open.size;
	}

	private evict(): void {
		while (this.open.size >= this.maxOpen) {
			const [oldest, entry] = this.open.entries().next().value as [string, Open];
			this.open.delete(oldest);
			entry.sql.close();
		}
	}

	/** Closes every database (checkpointing the WAL). Further calls are refused. */
	close(): void {
		this.closed = true;
		for (const { sql } of this.open.values()) sql.close();
		this.open.clear();
	}
}
