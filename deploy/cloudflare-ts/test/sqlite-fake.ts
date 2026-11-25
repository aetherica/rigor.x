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
	};
}
