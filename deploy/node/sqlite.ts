// Durable Object `ctx.storage.sql` equivalent on node:sqlite (synchronous, like the real API), backed
// by a file. Same contract the shared store/memory code is written and tested against.
import { DatabaseSync } from "node:sqlite";
import type { SqlLike } from "../cloudflare-ts/src/store.ts";

export interface FileSql extends SqlLike {
	readonly databaseSize: number;
	/** Like ctx.storage.transactionSync: every write of fn is rolled back when it throws. */
	transaction<T>(fn: () => T): T;
	close(): void;
}

export function openSql(path: string): FileSql {
	const db = new DatabaseSync(path);
	// WAL: readers do not block the writer; synchronous=NORMAL is durable at checkpoints under WAL.
	db.exec("PRAGMA journal_mode = WAL");
	db.exec("PRAGMA synchronous = NORMAL");
	db.exec("PRAGMA busy_timeout = 5000");
	db.exec("PRAGMA foreign_keys = ON");
	let depth = 0;
	return {
		transaction<T>(fn: () => T): T {
			const name = `sp${depth++}`;
			db.exec(`SAVEPOINT ${name}`);
			try {
				const out = fn();
				db.exec(`RELEASE ${name}`);
				return out;
			} catch (e) {
				db.exec(`ROLLBACK TO ${name}`);
				db.exec(`RELEASE ${name}`);
				throw e;
			} finally {
				depth--;
			}
		},
		exec(query: string, ...bindings: (string | number)[]) {
			const rows = db.prepare(query).all(...bindings) as Record<string, unknown>[];
			return { toArray: () => rows.map((r) => ({ ...r })) };
		},
		get databaseSize() {
			const pages = db.prepare("PRAGMA page_count").get() as { page_count: number };
			const size = db.prepare("PRAGMA page_size").get() as { page_size: number };
			return pages.page_count * size.page_size;
		},
		close() {
			try {
				db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
			} finally {
				db.close();
			}
		},
	};
}
