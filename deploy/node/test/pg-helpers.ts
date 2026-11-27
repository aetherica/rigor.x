// PostgreSQL test helpers: each test file gets its own throwaway database on the server named by
// PG_TEST_URL (a local or CI PostgreSQL 17, never a shared or production database). In CI the
// variable is required, so these tests cannot silently skip there.
import pg from "pg";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { PgOwnerStore, type PgOwnerOptions } from "../pg-owners.ts";
import { migrate } from "../pg-migrations.ts";

export const PG_URL = process.env.PG_TEST_URL ?? "";
if (process.env.CI && !PG_URL) throw new Error("PG_TEST_URL must be set in CI: the PostgreSQL storage tests may not be skipped there");
/** test() skip option: skipped only outside CI when no test database is configured. */
export const pgSkip: string | false = PG_URL ? false : "PG_TEST_URL not set (local run without a test database)";

export const SECRET = "test-owner-key-secret-0123456789-abcdef";

export interface TestDb {
	url: string;
	pool: pg.Pool;
	/** Drops the database. */
	drop(): Promise<void>;
}

/** Creates an empty database (optionally migrated) and a pool for it. */
export async function freshDatabase(opts: { migrated?: boolean } = {}): Promise<TestDb> {
	const name = `rx_test_${randomBytes(6).toString("hex")}`;
	const admin = new pg.Client({ connectionString: PG_URL });
	await admin.connect();
	await admin.query(`CREATE DATABASE ${name}`);
	await admin.end();
	const u = new URL(PG_URL);
	u.pathname = `/${name}`;
	const url = u.toString();
	const pool = new pg.Pool({ connectionString: url, max: 6 });
	pool.on("error", () => {});
	if (opts.migrated !== false) await migrate(pool);
	return {
		url,
		pool,
		async drop() {
			await pool.end().catch(() => {});
			const a = new pg.Client({ connectionString: PG_URL });
			await a.connect();
			await a.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
			await a.end();
		},
	};
}

export function ownerStore(pool: pg.Pool, overrides: Partial<PgOwnerOptions> = {}): PgOwnerStore {
	return new PgOwnerStore(pool, {
		dataDir: mkdtempSync(join(tmpdir(), "rigorx-pgcache-")),
		limits: {},
		secret: SECRET,
		maxSnapshotBytes: 8 * 1_048_576,
		maxAttempts: 4,
		...overrides,
	});
}

/** One engine operation through a store; returns dispatch()'s parsed JSON. */
export async function op(store: PgOwnerStore, owner: string, operation: string, args: Record<string, unknown> = {}) {
	return JSON.parse(await store.call("", owner, operation, JSON.stringify(args))) as { ok: boolean; code?: string; message?: string; result?: any };
}
