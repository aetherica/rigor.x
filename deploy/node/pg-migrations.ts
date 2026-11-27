// Versioned schema for PostgreSQL storage, applied by an explicit command (migrate.ts), never
// implicitly by the server. The server only checks that the database has exactly these
// migrations (same versions and checksums) and refuses to start otherwise (fail closed).
//
// Everything lives in the private schema rigorx_private: not exposed by Supabase's Data API (only
// schemas listed in the API settings are), every privilege revoked from PUBLIC and from Supabase's
// API roles (anon, authenticated, service_role) where they exist, and row-level security enabled
// with no policies, so an API role that were ever granted access would still read nothing. Only the
// role the server connects as (the schema owner) can read or write.
import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";

export const SCHEMA = "rigorx_private";
/** Constant advisory lock key for migrations ("rigorx-migrate" as a 63-bit number). */
const MIGRATION_LOCK = 0x5249_474f_524d_4947n;

export interface Migration {
	version: number;
	name: string;
	sql: string;
}

const API_ROLES = ["anon", "authenticated", "service_role"];
const revokeApiRoles = `DO $$
DECLARE r text;
BEGIN
	FOREACH r IN ARRAY ARRAY[${API_ROLES.map((r) => `'${r}'`).join(", ")}] LOOP
		IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
			EXECUTE format('REVOKE ALL ON SCHEMA ${SCHEMA} FROM %I', r);
			EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA ${SCHEMA} FROM %I', r);
			EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA ${SCHEMA} FROM %I', r);
			EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA ${SCHEMA} REVOKE ALL ON TABLES FROM %I', r);
		END IF;
	END LOOP;
END $$;`;

export const MIGRATIONS: readonly Migration[] = [
	{
		version: 1,
		name: "owner snapshots, tombstones and OAuth key-value store",
		sql: `
CREATE TABLE ${SCHEMA}.owners (
	owner_key text PRIMARY KEY CHECK (owner_key ~ '^[0-9a-f]{64}$'),
	key_version smallint NOT NULL,
	generation bigint NOT NULL CHECK (generation >= 0),
	version bigint NOT NULL CHECK (version >= 1),
	snapshot bytea NOT NULL,
	snapshot_sha256 text NOT NULL CHECK (snapshot_sha256 ~ '^[0-9a-f]{64}$'),
	engine_schema integer NOT NULL,
	size_bytes integer NOT NULL,
	updated_at timestamptz NOT NULL DEFAULT now(),
	CHECK (size_bytes = octet_length(snapshot))
);
CREATE TABLE ${SCHEMA}.owner_tombstones (
	owner_key text PRIMARY KEY CHECK (owner_key ~ '^[0-9a-f]{64}$'),
	generation bigint NOT NULL CHECK (generation >= 1),
	deleted_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE ${SCHEMA}.kv (
	key text COLLATE "C" PRIMARY KEY,
	value text NOT NULL,
	expiration bigint,
	metadata text
);
CREATE INDEX kv_expiration_idx ON ${SCHEMA}.kv (expiration) WHERE expiration IS NOT NULL;
ALTER TABLE ${SCHEMA}.owners ENABLE ROW LEVEL SECURITY;
ALTER TABLE ${SCHEMA}.owner_tombstones ENABLE ROW LEVEL SECURITY;
ALTER TABLE ${SCHEMA}.kv ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA ${SCHEMA} FROM PUBLIC;
${revokeApiRoles}
`,
	},
];

export const checksum = (m: Migration) => createHash("sha256").update(`${m.version}\n${m.name}\n${m.sql}`).digest("hex");
export const LATEST_VERSION = MIGRATIONS[MIGRATIONS.length - 1]!.version;

export class SchemaError extends Error {}

async function inTransaction<T>(client: PoolClient, fn: () => Promise<T>): Promise<T> {
	await client.query("BEGIN");
	try {
		const out = await fn();
		await client.query("COMMIT");
		return out;
	} catch (e) {
		await client.query("ROLLBACK");
		throw e;
	}
}

/**
 * Applies pending migrations under a session advisory lock (concurrent runs wait, then find nothing
 * to do). Refuses a database that has an unknown (newer) migration or a changed checksum.
 * Returns the versions applied by this call.
 */
export async function migrate(pool: Pool): Promise<number[]> {
	const client = await pool.connect();
	try {
		await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK.toString()]);
		try {
			return await inTransaction(client, async () => {
				await client.query(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA}`);
				await client.query(`REVOKE ALL ON SCHEMA ${SCHEMA} FROM PUBLIC`);
				await client.query(`CREATE TABLE IF NOT EXISTS ${SCHEMA}.schema_migrations (version integer PRIMARY KEY, name text NOT NULL, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`);
				await client.query(`ALTER TABLE ${SCHEMA}.schema_migrations ENABLE ROW LEVEL SECURITY`);
				await client.query(`REVOKE ALL ON ${SCHEMA}.schema_migrations FROM PUBLIC`);
				const applied = new Map<number, string>((await client.query(`SELECT version, checksum FROM ${SCHEMA}.schema_migrations`)).rows.map((r) => [Number(r.version), String(r.checksum)]));
				verifyApplied(applied);
				const done: number[] = [];
				for (const m of MIGRATIONS) {
					if (applied.has(m.version)) continue;
					await client.query(m.sql);
					await client.query(`INSERT INTO ${SCHEMA}.schema_migrations(version, name, checksum) VALUES($1, $2, $3)`, [m.version, m.name, checksum(m)]);
					done.push(m.version);
				}
				await client.query(revokeApiRoles); // also covers schema_migrations
				return done;
			});
		} finally {
			await client.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK.toString()]);
		}
	} finally {
		client.release();
	}
}

function verifyApplied(applied: Map<number, string>): void {
	for (const [version, sum] of applied) {
		const m = MIGRATIONS.find((x) => x.version === version);
		if (!m) throw new SchemaError(`database has migration ${version}, which this code does not know (the database is newer than this release)`);
		if (checksum(m) !== sum) throw new SchemaError(`migration ${version} in the database differs from this release (checksum mismatch)`);
	}
}

/** Fail-closed startup check: the database must have exactly this release's migrations. */
export async function assertSchema(pool: Pool): Promise<void> {
	const exists = await pool.query("SELECT to_regclass($1) AS t", [`${SCHEMA}.schema_migrations`]);
	if (!exists.rows[0]?.t) throw new SchemaError("database schema is not initialized: run the migration command first (see deploy/node/README.md)");
	const rows = (await pool.query(`SELECT version, checksum FROM ${SCHEMA}.schema_migrations`)).rows;
	const applied = new Map<number, string>(rows.map((r) => [Number(r.version), String(r.checksum)]));
	verifyApplied(applied);
	const missing = MIGRATIONS.filter((m) => !applied.has(m.version)).map((m) => m.version);
	if (missing.length) throw new SchemaError(`database is missing migrations ${missing.join(", ")}: run the migration command first`);
}
