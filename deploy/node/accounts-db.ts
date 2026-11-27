// The account registry's database on the Node runtime. The shared AccountRegistry (accounts.ts)
// speaks a small D1-shaped interface (SqlDatabase); on Cloudflare that is the D1 binding ACCOUNTS_DB.
// Here it is either:
//   - sqliteAccountsDb: a SQLite file in DATA_DIR running the D1 migration files themselves
//     (STORAGE=sqlite), or
//   - pgAccountsDb: the rigorx_private.accounts / identities tables (STORAGE=postgres, migration 2).
// Statements are the registry's own SQLite-dialect SQL; the PostgreSQL adapter translates the three
// constructs it uses (placeholders, INSERT OR IGNORE, table names) and nothing else, and the shared
// registry tests run against both adapters.
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import type { Pool, PoolClient, QueryResult } from "pg";
import pg from "pg";
import type { SqlDatabase, SqlStatement } from "../cloudflare-ts/src/accounts.ts";
import { SCHEMA } from "./pg-migrations.ts";

const D1_MIGRATIONS = fileURLToPath(new URL("../cloudflare-ts/migrations/accounts/", import.meta.url));

interface Bound extends SqlStatement {
	readonly sql: string;
	readonly values: unknown[];
}

/** SQLite file with the D1 schema; migrations tracked with PRAGMA user_version (one per file). */
export function sqliteAccountsDb(path: string): SqlDatabase & { close(): void } {
	const db = new DatabaseSync(path);
	db.exec("PRAGMA journal_mode = WAL");
	db.exec("PRAGMA foreign_keys = ON");
	db.exec("PRAGMA busy_timeout = 5000");
	const files = readdirSync(D1_MIGRATIONS).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort();
	const applied = Number((db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version);
	files.forEach((file, i) => {
		if (i < applied) return;
		db.exec("BEGIN");
		try {
			db.exec(readFileSync(D1_MIGRATIONS + file, "utf8"));
			db.exec(`PRAGMA user_version = ${i + 1}`);
			db.exec("COMMIT");
		} catch (e) {
			db.exec("ROLLBACK");
			throw e;
		}
	});
	const stmt = (sql: string, values: unknown[] = []): Bound => ({
		sql,
		values,
		bind: (...v: unknown[]) => stmt(sql, v),
		first: async <T>() => (db.prepare(sql).get(...(values as never[])) as T) ?? null,
		all: async <T>() => ({ results: db.prepare(sql).all(...(values as never[])) as T[] }),
		run: async () => db.prepare(sql).run(...(values as never[])),
	});
	return {
		prepare: (sql) => stmt(sql),
		batch: async (statements) => {
			db.exec("BEGIN");
			try {
				const out = (statements as Bound[]).map((s) => db.prepare(s.sql).run(...(s.values as never[])));
				db.exec("COMMIT");
				return out;
			} catch (e) {
				db.exec("ROLLBACK");
				throw e;
			}
		},
		close: () => db.close(),
	};
}

/**
 * Translates the registry's SQLite statements to PostgreSQL: `?` placeholders (outside quotes) to
 * `$n`, `INSERT OR IGNORE INTO t (...) VALUES (...)` to `INSERT ... ON CONFLICT DO NOTHING`, and the
 * registry's two tables to the private schema. Anything else is passed through unchanged.
 */
export function translateSql(sql: string): string {
	let n = 0;
	let out = "";
	let quote: string | null = null;
	for (const ch of sql) {
		if (quote) {
			if (ch === quote) quote = null;
			out += ch;
		} else if (ch === "'" || ch === '"') {
			quote = ch;
			out += ch;
		} else if (ch === "?") {
			out += `$${++n}`;
		} else out += ch;
	}
	let ignore = false;
	out = out.replace(/^\s*INSERT\s+OR\s+IGNORE\s+INTO\b/i, () => { ignore = true; return "INSERT INTO"; });
	out = out.replace(/\b(FROM|JOIN|INTO|UPDATE)\s+(accounts|identities)\b/gi, (_m, kw: string, table: string) => `${kw} ${SCHEMA}.${table.toLowerCase()}`);
	return ignore ? `${out.trimEnd()} ON CONFLICT DO NOTHING` : out;
}

// COUNT(*) and other bigint results come back as JS numbers (the registry compares them with numbers).
const types = { getTypeParser: (oid: number, format?: string) => (oid === 20 ? Number : pg.types.getTypeParser(oid, format as "text")) };

/** The registry tables in PostgreSQL (rigorx_private, migration 2). */
export function pgAccountsDb(pool: Pool): SqlDatabase {
	const query = (c: Pool | PoolClient, s: Bound): Promise<QueryResult> => c.query({ text: translateSql(s.sql), values: s.values, types } as never);
	const stmt = (sql: string, values: unknown[] = []): Bound => {
		const self: Bound = {
			sql,
			values,
			bind: (...v: unknown[]) => stmt(sql, v),
			first: async <T>() => ((await query(pool, self)).rows[0] as T) ?? null,
			all: async <T>() => ({ results: (await query(pool, self)).rows as T[] }),
			run: async () => ({ changes: (await query(pool, self)).rowCount ?? 0 }),
		};
		return self;
	};
	return {
		prepare: (sql) => stmt(sql),
		batch: async (statements) => {
			const client = await pool.connect();
			try {
				await client.query("BEGIN");
				const out: unknown[] = [];
				for (const s of statements as Bound[]) out.push({ changes: (await query(client, s)).rowCount ?? 0 });
				await client.query("COMMIT");
				return out;
			} catch (e) {
				await client.query("ROLLBACK").catch(() => {});
				throw e;
			} finally {
				client.release();
			}
		},
	};
}
