// Durable Object `ctx.storage.sql` stand-in backed by node:sqlite (synchronous, like the real API).
import { DatabaseSync } from "node:sqlite";
import type { SqlLike } from "../src/store.ts";

export function memorySql(): SqlLike & { db: DatabaseSync; transaction: <T>(fn: () => T) => T } {
	const db = new DatabaseSync(":memory:");
	let depth = 0;
	return {
		db,
		/** Like ctx.storage.transactionSync: roll back every write of fn when it throws. */
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
	};
}
