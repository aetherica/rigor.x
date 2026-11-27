// PostgreSQL storage: owner snapshots (CAS, retries, deletion tombstones, integrity, rotation),
// the KV conformance suite, schema privileges and migrations. Needs PG_TEST_URL (see pg-helpers.ts).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createHmac, createHash } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { ACCOUNT_DELETE_CONFIRMATION } from "../../cloudflare-ts/src/engine.ts";
import { PgKv } from "../pg-kv.ts";
import { SCHEMA, assertSchema, migrate, MIGRATIONS } from "../pg-migrations.ts";
import { oauthUserIdOf } from "../pg-owners.ts";
import { kvConformance } from "./kv-conformance.ts";
import { SECRET, freshDatabase, op, ownerStore, pgSkip, type TestDb } from "./pg-helpers.ts";

const dbs: TestDb[] = [];
async function db(opts?: { migrated?: boolean }) {
	const d = await freshDatabase(opts);
	dbs.push(d);
	return d;
}
after(async () => { for (const d of dbs) await d.drop(); });
const t = (name: string, fn: () => Promise<void>) => test(name, { skip: pgSkip }, fn);
const DELETE_ARGS = { confirm: ACCOUNT_DELETE_CONFIRMATION, decided_by: "user" };
const task = (n: number | string) => ({ task: `Compare storage engines for service number ${n} in detail` });
const hmac = (owner: string, secret = SECRET) => createHmac("sha256", secret).update(owner).digest("hex");

let kvDb: TestDb | null = null;
kvConformance("PostgreSQL KV", async (clock) => {
	kvDb ??= await db();
	await kvDb.pool.query(`DELETE FROM ${SCHEMA}.kv`);
	return new PgKv(kvDb.pool, () => clock.t);
}, { skip: pgSkip });

t("owners: HMAC-keyed rows, isolation between accounts, persistence across instances", async () => {
	const d = await db();
	const a = ownerStore(d.pool);
	const started = await op(a, "google:alice", "start_run", task(1));
	assert.equal(started.ok, true, JSON.stringify(started));
	const rows = (await d.pool.query(`SELECT owner_key, key_version, generation, version, size_bytes FROM ${SCHEMA}.owners`)).rows;
	assert.equal(rows.length, 1);
	assert.equal(rows[0].owner_key, hmac("google:alice")); // keyed HMAC, not a plain hash of the ID
	assert.notEqual(rows[0].owner_key, createHash("sha256").update("google:alice").digest("hex"));
	assert.equal(Number(rows[0].generation), 0);
	// Another instance with an empty cache (another process or a restart) sees the same data.
	const b = ownerStore(d.pool);
	assert.equal((await op(b, "google:alice", "list_runs")).result.runs.length, 1);
	assert.equal((await op(b, "google:bob", "list_runs")).result.runs.length, 0);
	assert.equal((await op(b, "google:bob", "get_run", { run_id: started.result.run_id })).ok, false);
	a.close(); b.close();
});

t("two instances writing the same account concurrently lose no update", async () => {
	const d = await db();
	const a = ownerStore(d.pool, { maxAttempts: 5 });
	const b = ownerStore(d.pool, { maxAttempts: 5 });
	await op(a, "google:carol", "list_runs"); // create the row first
	const results = await Promise.all(Array.from({ length: 8 }, (_, i) => op(i % 2 ? a : b, "google:carol", "start_run", task(`c${i}`))));
	const ok = results.filter((r) => r.ok).length;
	assert.equal(ok, 8, JSON.stringify(results.filter((r) => !r.ok)));
	assert.equal((await op(ownerStore(d.pool), "google:carol", "list_runs")).result.runs.length, ok);
	a.close(); b.close();
});

t("version conflicts are retried a bounded number of times, then STORAGE_CONFLICT with nothing saved", async () => {
	const d = await db();
	const other = ownerStore(d.pool);
	let attempts = 0;
	const a = ownerStore(d.pool, {
		maxAttempts: 3,
		hooks: { beforePersist: async () => { attempts++; await op(other, "google:dan", "start_run", task(`other${attempts}`)); } }, // another process writes first, every time
	});
	await op(other, "google:dan", "list_runs");
	const r = await op(a, "google:dan", "start_run", task("mine"));
	assert.equal(r.ok, false);
	assert.equal(r.code, "STORAGE_CONFLICT");
	assert.equal(attempts, 3);
	const runs = (await op(ownerStore(d.pool), "google:dan", "list_runs")).result.runs;
	assert.equal(runs.length, 3); // only the interfering writes; "mine" was never committed
	a.close(); other.close();
});

t("deletion during an in-flight operation: no resurrection, no retry, OAuth grants removed atomically", async () => {
	const d = await db();
	const kv = new PgKv(d.pool);
	const uid = oauthUserIdOf("google:erin");
	await kv.put(`grant:${uid}:g1`, "{}");
	await kv.put(`token:${uid}:g1:t1`, "{}");
	await kv.put(`grant:${oauthUserIdOf("google:frank")}:g9`, "{}");
	await kv.put(`client:shared`, "{}");
	const deleter = ownerStore(d.pool);
	await op(deleter, "google:erin", "start_run", task("erin-old"));
	let deleted = false;
	const stale = ownerStore(d.pool, {
		hooks: { beforePersist: async () => { if (!deleted) { deleted = true; assert.equal((await op(deleter, "google:erin", "delete_account_data", DELETE_ARGS)).ok, true); } } },
	});
	const r = await op(stale, "google:erin", "start_run", task("erin-stale"));
	assert.equal(r.ok, false);
	assert.equal(r.code, "OWNER_DELETED_DURING_OPERATION");
	assert.equal((await d.pool.query(`SELECT 1 FROM ${SCHEMA}.owners WHERE owner_key = $1`, [hmac("google:erin")])).rows.length, 0);
	assert.equal(Number((await d.pool.query(`SELECT generation FROM ${SCHEMA}.owner_tombstones WHERE owner_key = $1`, [hmac("google:erin")])).rows[0].generation), 1);
	assert.equal(await kv.get(`grant:${uid}:g1`), null);
	assert.equal(await kv.get(`token:${uid}:g1:t1`), null);
	assert.ok(await kv.get(`grant:${oauthUserIdOf("google:frank")}:g9`)); // other accounts untouched
	assert.ok(await kv.get("client:shared"));
	// Reading after deletion finds nothing (an empty account writes no row); a new write starts a
	// fresh account at generation 1 without any of the old data.
	const fresh = ownerStore(d.pool);
	assert.equal((await op(fresh, "google:erin", "list_runs")).result.runs.length, 0);
	assert.equal((await op(fresh, "google:erin", "start_run", task("erin-new"))).ok, true);
	const runs = (await op(ownerStore(d.pool), "google:erin", "list_runs")).result.runs;
	assert.equal(runs.length, 1);
	assert.equal(Number((await d.pool.query(`SELECT generation FROM ${SCHEMA}.owners WHERE owner_key = $1`, [hmac("google:erin")])).rows[0].generation), 1);
	deleter.close(); stale.close(); fresh.close();
});

t("deletion is one transaction: a failure deleting OAuth rows leaves the account intact", async () => {
	const d = await db();
	const kv = new PgKv(d.pool);
	const uid = oauthUserIdOf("google:gwen");
	await kv.put(`grant:${uid}:g1`, "{}");
	const s = ownerStore(d.pool);
	await op(s, "google:gwen", "start_run", task("gwen"));
	// Inject a database-level failure into the KV part of the deletion transaction.
	await d.pool.query(`CREATE FUNCTION ${SCHEMA}.fail_kv_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected failure'; END $$`);
	await d.pool.query(`CREATE TRIGGER fail_kv_delete BEFORE DELETE ON ${SCHEMA}.kv FOR EACH ROW EXECUTE FUNCTION ${SCHEMA}.fail_kv_delete()`);
	const r = await op(s, "google:gwen", "delete_account_data", DELETE_ARGS);
	assert.equal(r.ok, false);
	assert.equal(r.code, "STORAGE_UNAVAILABLE");
	await d.pool.query(`DROP TRIGGER fail_kv_delete ON ${SCHEMA}.kv`);
	assert.equal((await d.pool.query(`SELECT 1 FROM ${SCHEMA}.owners WHERE owner_key = $1`, [hmac("google:gwen")])).rows.length, 1); // rolled back
	assert.equal((await d.pool.query(`SELECT 1 FROM ${SCHEMA}.owner_tombstones WHERE owner_key = $1`, [hmac("google:gwen")])).rows.length, 0);
	assert.ok(await kv.get(`grant:${uid}:g1`));
	assert.equal((await op(ownerStore(d.pool), "google:gwen", "list_runs")).result.runs.length, 1); // the local copy was discarded, the data is intact
	s.close();
});

t("failure before persistence: nothing saved, the local copy is discarded, the next call sees the old state", async () => {
	const d = await db();
	let fail = true;
	const s = ownerStore(d.pool, { hooks: { beforePersist: () => { if (fail) { fail = false; throw new Error("network down"); } } } });
	await op(ownerStore(d.pool), "google:hana", "start_run", task("before"));
	const r = await op(s, "google:hana", "start_run", task("lost"));
	assert.equal(r.ok, false);
	assert.equal(r.code, "STORAGE_UNAVAILABLE");
	assert.equal((await op(s, "google:hana", "list_runs")).result.runs.length, 1);
	s.close();
});

t("replay across instances with an idempotency key returns the committed result once", async () => {
	const d = await db();
	const a = ownerStore(d.pool);
	const b = ownerStore(d.pool);
	const args = { ...task("idem"), idempotency_key: "4f6c1d2e-0000-4000-8000-000000000001" };
	const first = await op(a, "google:ivan", "start_run", args);
	const replay = await op(b, "google:ivan", "start_run", args); // e.g. the response was lost and the client retried elsewhere
	assert.equal(first.ok, true);
	assert.equal(replay.result.idempotent_replay, true);
	assert.equal(replay.result.run_id, first.result.run_id);
	assert.equal((await op(a, "google:ivan", "list_runs")).result.runs.length, 1);
	a.close(); b.close();
});

t("corrupt or unsupported snapshots are refused and never overwritten", async () => {
	const d = await db();
	const s = ownerStore(d.pool);
	await op(s, "google:jade", "start_run", task("jade"));
	const key = hmac("google:jade");
	const before = (await d.pool.query(`SELECT version, snapshot FROM ${SCHEMA}.owners WHERE owner_key = $1`, [key])).rows[0];
	// 1. Bytes changed behind the checksum.
	const flipped = Buffer.from(before.snapshot);
	flipped[flipped.length - 10] ^= 0xff;
	await d.pool.query(`UPDATE ${SCHEMA}.owners SET snapshot = $1, size_bytes = $2, version = version + 1 WHERE owner_key = $3`, [flipped, flipped.length, key]);
	const fresh = () => ownerStore(d.pool);
	let r = await op(fresh(), "google:jade", "start_run", task("jade2"));
	assert.equal(r.code, "STORAGE_CORRUPT");
	let row = (await d.pool.query(`SELECT version, snapshot FROM ${SCHEMA}.owners WHERE owner_key = $1`, [key])).rows[0];
	assert.ok(Buffer.from(row.snapshot).equals(flipped)); // untouched
	// 2. Valid checksum over something that is not a SQLite database.
	const junk = Buffer.from("x".repeat(4096));
	await d.pool.query(`UPDATE ${SCHEMA}.owners SET snapshot = $1, size_bytes = $2, snapshot_sha256 = $3 WHERE owner_key = $4`, [junk, junk.length, createHash("sha256").update(junk).digest("hex"), key]);
	r = await op(fresh(), "google:jade", "list_runs");
	assert.equal(r.code, "STORAGE_CORRUPT");
	// 3. A real database with a newer engine schema than this release supports.
	const dir = mkdtempSync(join(tmpdir(), "rigorx-future-"));
	const future = new DatabaseSync(join(dir, "f.sqlite"));
	future.exec("CREATE TABLE host_store_meta(key TEXT PRIMARY KEY, value TEXT NOT NULL); INSERT INTO host_store_meta VALUES('schema_version', '999')");
	future.close();
	const fbytes = readFileSync(join(dir, "f.sqlite"));
	await d.pool.query(`UPDATE ${SCHEMA}.owners SET snapshot = $1, size_bytes = $2, snapshot_sha256 = $3 WHERE owner_key = $4`, [fbytes, fbytes.length, createHash("sha256").update(fbytes).digest("hex"), key]);
	r = await op(fresh(), "google:jade", "list_runs");
	assert.equal(r.code, "STORAGE_UNSUPPORTED");
	row = (await d.pool.query(`SELECT snapshot FROM ${SCHEMA}.owners WHERE owner_key = $1`, [key])).rows[0];
	assert.ok(Buffer.from(row.snapshot).equals(fbytes));
	s.close();
});

t("snapshot size limit: a write that would exceed it is refused and nothing is stored", async () => {
	const d = await db();
	const s = ownerStore(d.pool, { maxSnapshotBytes: 4096 });
	const r = await op(s, "google:kim", "start_run", task("kim"));
	assert.equal(r.ok, false);
	assert.equal(r.code, "STORAGE_LIMIT");
	assert.equal((await d.pool.query(`SELECT count(*)::int AS n FROM ${SCHEMA}.owners`)).rows[0].n, 0);
	s.close();
});

t("owner key secret rotation: rows under the previous secret are found and moved on the next write", async () => {
	const d = await db();
	const NEW = "rotated-owner-key-secret-9876543210-zyxwv";
	await op(ownerStore(d.pool), "google:lee", "start_run", task("lee"));
	const rotated = ownerStore(d.pool, { secret: NEW, previousSecret: SECRET });
	assert.equal((await op(rotated, "google:lee", "list_runs")).result.runs.length, 1); // found under the previous key
	await op(rotated, "google:lee", "start_run", task("lee2")); // a write moves it
	const keys = (await d.pool.query(`SELECT owner_key FROM ${SCHEMA}.owners`)).rows.map((r) => r.owner_key);
	assert.deepEqual(keys, [hmac("google:lee", NEW)]);
	assert.equal((await op(ownerStore(d.pool, { secret: NEW }), "google:lee", "list_runs")).result.runs.length, 2);
	assert.equal((await op(ownerStore(d.pool), "google:lee", "list_runs")).result.runs.length, 0); // the old secret no longer finds it
	rotated.close();
});

t("least privilege: private schema, RLS on every table with no policies, API roles denied", async () => {
	const d = await db({ migrated: false });
	for (const role of ["anon", "authenticated", "service_role"]) {
		await d.pool.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${role}') THEN CREATE ROLE ${role} NOLOGIN; END IF; END $$`);
	}
	await migrate(d.pool);
	const tables = (await d.pool.query(`SELECT c.relname, c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = $1 AND c.relkind = 'r' ORDER BY 1`, [SCHEMA])).rows;
	assert.deepEqual(tables.map((r) => r.relname), ["kv", "owner_tombstones", "owners", "schema_migrations"]);
	assert.ok(tables.every((r) => r.relrowsecurity === true));
	assert.equal((await d.pool.query(`SELECT count(*)::int AS n FROM pg_policies WHERE schemaname = $1`, [SCHEMA])).rows[0].n, 0);
	assert.equal((await d.pool.query(`SELECT count(*)::int AS n FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('owners','kv','owner_tombstones')`)).rows[0].n, 0);
	for (const role of ["anon", "authenticated", "service_role", "public"]) {
		assert.equal((await d.pool.query("SELECT has_schema_privilege($1, $2, 'USAGE') AS u", [role, SCHEMA])).rows[0].u, false, `${role} schema usage`);
		for (const table of ["owners", "kv", "owner_tombstones", "schema_migrations"]) {
			assert.equal((await d.pool.query("SELECT has_table_privilege($1, $2, 'SELECT') AS s", [role, `${SCHEMA}.${table}`])).rows[0].s, false, `${role} ${table}`);
		}
	}
	const client = await d.pool.connect();
	try {
		await client.query("SET ROLE anon");
		await assert.rejects(client.query(`SELECT * FROM ${SCHEMA}.owners`), /permission denied/);
	} finally {
		await client.query("RESET ROLE");
		client.release();
	}
});

t("migrations: concurrent runs apply once; the server refuses missing, changed or newer schemas", async () => {
	const d = await db({ migrated: false });
	await assert.rejects(assertSchema(d.pool), /not initialized/);
	const other = new (await import("pg")).default.Pool({ connectionString: d.url, max: 2 });
	const [x, y] = await Promise.all([migrate(d.pool), migrate(other)]);
	await other.end();
	assert.deepEqual([...x, ...y].sort(), MIGRATIONS.map((m) => m.version)); // applied exactly once in total
	assert.equal((await d.pool.query(`SELECT count(*)::int AS n FROM ${SCHEMA}.schema_migrations`)).rows[0].n, MIGRATIONS.length);
	await assertSchema(d.pool);
	await d.pool.query(`UPDATE ${SCHEMA}.schema_migrations SET checksum = repeat('0', 64) WHERE version = 1`);
	await assert.rejects(assertSchema(d.pool), /checksum mismatch/);
	await assert.rejects(migrate(d.pool), /checksum mismatch/);
	await d.pool.query(`UPDATE ${SCHEMA}.schema_migrations SET checksum = $1 WHERE version = 1`, [(await import("../pg-migrations.ts")).checksum(MIGRATIONS[0]!)]);
	await d.pool.query(`INSERT INTO ${SCHEMA}.schema_migrations(version, name, checksum) VALUES(99, 'future', repeat('a', 64))`);
	await assert.rejects(assertSchema(d.pool), /newer than this release/);
});
