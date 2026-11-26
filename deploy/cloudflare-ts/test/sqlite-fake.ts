// Durable Object `ctx.storage.sql` stand-in backed by node:sqlite (synchronous, like the real API).
import { DatabaseSync } from "node:sqlite";
import type { SqlLike } from "../src/store.ts";

export function memorySql(): SqlLike & { db: DatabaseSync } {
	const db = new DatabaseSync(":memory:");
	return {
		db,
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
