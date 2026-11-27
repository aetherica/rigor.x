// The Node server with STORAGE=postgres end to end, as real processes: real OAuth tokens and MCP
// calls, a process restart on an empty local disk (what ephemeral hosting does) keeping sign-ins and
// data, and the fail-closed start on an uninitialized database. Needs PG_TEST_URL (pg-helpers.ts).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, readdirSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { issueToken, mcp, tool } from "./helpers.ts";
import { SECRET, freshDatabase, pgSkip, type TestDb } from "./pg-helpers.ts";
import { PgKv } from "../pg-kv.ts";
import { SCHEMA } from "../pg-migrations.ts";
import type { NodeConfig } from "../config.ts";
import type { RunningServer } from "../server.ts";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const dbs: TestDb[] = [];
const children: ChildProcess[] = [];
after(async () => {
	for (const c of children) c.kill("SIGKILL");
	for (const d of dbs) await d.drop();
});
const t = (name: string, fn: () => Promise<void>) => test(name, { skip: pgSkip }, fn);

const freePort = () => new Promise<number>((ok) => {
	const s = createServer();
	s.listen(0, "127.0.0.1", () => { const p = (s.address() as { port: number }).port; s.close(() => ok(p)); });
});

/** Starts server.ts as a separate process; resolves once it listens (or rejects with its output if it exits). */
function spawnServer(env: Record<string, string>): Promise<{ child: ChildProcess; output: () => string; stop: () => Promise<number | null> }> {
	const child = spawn(process.execPath, ["--import", "./deploy/node/register.mjs", "--experimental-strip-types", "--disable-warning=ExperimentalWarning", "deploy/node/server.ts"], {
		cwd: ROOT, env: { PATH: process.env.PATH ?? "", HOST: "127.0.0.1", GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "test-secret-not-real", ...env }, stdio: ["ignore", "pipe", "pipe"],
	});
	children.push(child);
	let out = "";
	child.stdout!.on("data", (x) => { out += x; });
	child.stderr!.on("data", (x) => { out += x; });
	const exited = new Promise<number | null>((ok) => child.on("exit", ok));
	return new Promise((ok, fail) => {
		const timer = setInterval(() => {
			if (out.includes('"evt":"rigorx_start"')) {
				clearInterval(timer);
				ok({ child, output: () => out, stop: () => { child.kill("SIGTERM"); return exited; } });
			}
		}, 50);
		exited.then((code) => { clearInterval(timer); fail(new Error(`server exited ${code}: ${out}`)); });
	});
}

t("STORAGE=postgres: sign-in and runs survive a process restart on an empty disk; accounts stay isolated", async () => {
	const d = await freshDatabase();
	dbs.push(d);
	const port = await freePort(); // tokens are bound to the origin, so both processes use the same one
	const base = `http://127.0.0.1:${port}`;
	const env = { STORAGE: "postgres", DATABASE_URL: d.url, DATABASE_SSL: "disable", OWNER_KEY_SECRET: SECRET, PORT: String(port), PUBLIC_ORIGIN: base };
	// Token issuance needs the provider's KV, which lives in PostgreSQL: the test reaches it directly.
	const handle = { url: base, kv: new PgKv(d.pool), config: { origin: base } } as unknown as RunningServer & { config: NodeConfig };

	const firstDir = mkdtempSync(join(tmpdir(), "rigorx-pgsrv-"));
	const first = await spawnServer({ ...env, DATA_DIR: firstDir });
	assert.match(first.output(), /"storage":\{"kind":"postgres","host":"127\.0\.0\.1"/);
	assert.equal(first.output().includes(SECRET), false);
	assert.equal((await mcp(base, null, "tools/list")).status, 401);
	const token = await issueToken(handle, "pg-alice");
	const run = await tool(base, token, "rigorx_start_run", { task: "Evaluate three caching strategies for an API" });
	const bob = await issueToken(handle, "pg-bob");
	assert.equal((await tool(base, bob, "rigorx_list_runs")).runs.length, 0);
	assert.equal((await d.pool.query(`SELECT count(*)::int AS n FROM ${SCHEMA}.owners`)).rows[0].n, 1); // bob only read: nothing to store
	assert.equal(await first.stop(), 0);
	assert.match(first.output(), /"phase":"complete"/);

	const secondDir = mkdtempSync(join(tmpdir(), "rigorx-pgsrv-")); // nothing local survives the restart
	const second = await spawnServer({ ...env, DATA_DIR: secondDir });
	const listed = await tool(base, token, "rigorx_list_runs"); // the token issued before the restart still works
	assert.deepEqual(listed.runs.map((r: { run_id: string }) => r.run_id), [run.run_id]);
	const stolen = await mcp(base, bob, "tools/call", { name: "rigorx_get_run", arguments: { run_id: run.run_id } });
	assert.equal(stolen.body.result.isError, true);
	assert.equal(readdirSync(secondDir).includes("oauth-kv.sqlite"), false); // OAuth state is in PostgreSQL
	const health = await (await fetch(`${base}/health`)).json() as Record<string, unknown>;
	assert.equal(health.ok, true);
	assert.equal(await second.stop(), 0);
	assert.equal(second.output().includes(new URL(d.url).password || "\u0000"), false);
});

t("STORAGE=postgres on an uninitialized database: the server refuses to start (exit 78), printing no credentials", async () => {
	const d = await freshDatabase({ migrated: false });
	dbs.push(d);
	const port = await freePort();
	await assert.rejects(
		spawnServer({ STORAGE: "postgres", DATABASE_URL: d.url, DATABASE_SSL: "disable", OWNER_KEY_SECRET: SECRET, PORT: String(port), PUBLIC_ORIGIN: `http://127.0.0.1:${port}`, DATA_DIR: mkdtempSync(join(tmpdir(), "rigorx-pgsrv-")) }),
		(e: Error) => {
			assert.match(e.message, /server exited 78/);
			assert.match(e.message, /not initialized: run the migration command/);
			assert.equal(e.message.includes(SECRET), false);
			return true;
		},
	);
});
