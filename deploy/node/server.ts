// Portable Node runtime for the Aetherica (RIGOR-X) MCP server.
//
// The same application as the Cloudflare Worker (deploy/cloudflare-ts/src/app.ts: MCP, OAuth with
// Google sign-in, approvals, quotas, account deletion) bound to node:http instead of workerd:
//
//   Cloudflare                         Node (this directory)
//   Durable Object per owner      ->   SQLite file per owner          (owners.ts), or
//                                      PostgreSQL snapshot per owner  (pg-owners.ts, STORAGE=postgres)
//   KV namespace OAUTH_KV         ->   SQLite KV with TTL             (kv.ts), or
//                                      PostgreSQL KV with TTL         (pg-kv.ts, STORAGE=postgres)
//   static assets (public/)       ->   icon and favicon files served here
//   global_fetch_strictly_public  ->   connection-time address check  (guarded-fetch.ts)
//   version metadata              ->   commit from the host's environment (config.ts)
//
// Start: node --import ./deploy/node/register.mjs --experimental-strip-types deploy/node/server.ts
// (see README.md and .env.example). Stops gracefully on SIGTERM/SIGINT.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createApp, type AppEnv, type Platform, type RequestContext } from "../cloudflare-ts/src/app.ts";
import { ConfigError, loadConfig, type NodeConfig } from "./config.ts";
import pg from "pg";
import { SqliteKv } from "./kv.ts";
import { OwnerStorage } from "./owners.ts";
import { PgKv } from "./pg-kv.ts";
import { PgOwnerStore, type PgOwnerOptions } from "./pg-owners.ts";
import { SchemaError, assertSchema } from "./pg-migrations.ts";
import { createGuardedFetch } from "./guarded-fetch.ts";
import { createTorFetch } from "./tor-fetch.ts";
import { pgAccountsDb, sqliteAccountsDb } from "./accounts-db.ts";
import { storageErrorHint } from "./pg-config.ts";
import type { SqlDatabase } from "../cloudflare-ts/src/accounts.ts";

const PUBLIC_DIR = fileURLToPath(new URL("../cloudflare-ts/public/", import.meta.url));
/** The paths the Worker's asset layer serves before the application (wrangler.jsonc run_worker_first). */
const STATIC_PATH = /^\/(icon-\d+\.png|favicon\.ico)$/;
const STATIC_TYPES: Record<string, string> = { png: "image/png", ico: "image/vnd.microsoft.icon" };

type NodeEnv = AppEnv & Record<string, unknown>;

export type KvStore = SqliteKv | PgKv;
export type OwnerStore = OwnerStorage | PgOwnerStore;

export interface RunningServer {
	server: Server;
	kv: KvStore;
	owners: OwnerStore;
	/** The PostgreSQL pool when STORAGE=postgres. */
	pool: pg.Pool | null;
	url: string;
	/** Stops accepting requests, waits for in-flight ones (up to the grace period), closes storage. */
	shutdown(reason: string): Promise<void>;
}

function log(evt: string, fields: Record<string, unknown> = {}): void {
	console.log(JSON.stringify({ evt, ...fields }));
}

function staticFile(pathname: string): { body: Buffer; type: string } | null {
	const m = STATIC_PATH.exec(pathname);
	if (!m) return null;
	const file = join(PUBLIC_DIR, m[1]!);
	if (!existsSync(file)) return null; // unknown icons fall through to the application's 404, as on Cloudflare
	return { body: readFileSync(file), type: STATIC_TYPES[m[1]!.split(".").pop()!]! };
}

async function readBody(req: IncomingMessage, limit: number): Promise<Buffer | "too_large"> {
	const chunks: Buffer[] = [];
	let size = 0;
	for await (const chunk of req) {
		size += (chunk as Buffer).length;
		if (size > limit) return "too_large";
		chunks.push(chunk as Buffer);
	}
	return Buffer.concat(chunks);
}

async function writeResponse(res: ServerResponse, response: Response): Promise<void> {
	const headers: Record<string, string | string[]> = {};
	response.headers.forEach((value, key) => {
		if (key !== "set-cookie") headers[key] = value;
	});
	const cookies = response.headers.getSetCookie();
	if (cookies.length) headers["set-cookie"] = cookies;
	res.writeHead(response.status, response.statusText || undefined, headers);
	if (!response.body) {
		res.end();
		return;
	}
	const body = Readable.fromWeb(response.body as import("node:stream/web").ReadableStream);
	res.on("close", () => body.destroy()); // client went away: stop producing (SSE)
	await new Promise<void>((done) => {
		body.on("error", () => { res.destroy(); done(); });
		res.on("close", () => done());
		body.pipe(res);
	});
}

/** Opens the configured storage. PostgreSQL: checks the schema first and refuses to start on a mismatch. */
async function openStorage(config: NodeConfig, hooks?: PgOwnerOptions["hooks"]): Promise<{ kv: KvStore; owners: OwnerStore; pool: pg.Pool | null; accounts: SqlDatabase & { close?(): void } }> {
	const s = config.storage;
	if (s.kind === "sqlite") {
		return {
			kv: new SqliteKv(join(config.dataDir, "oauth-kv.sqlite")),
			owners: new OwnerStorage(config.dataDir, config.appVars),
			pool: null,
			accounts: sqliteAccountsDb(join(config.dataDir, "accounts.sqlite")),
		};
	}
	const pool = new pg.Pool(s.db.pool);
	pool.on("error", (e) => log("rigorx_error", { where: "pg_pool", error: e.message })); // idle-client errors must not crash the process
	pool.on("connect", (client) => { client.query("SET statement_timeout = 15000").catch(() => {}); });
	try {
		await assertSchema(pool);
	} catch (e) {
		await pool.end().catch(() => {});
		throw e;
	}
	const owners = new PgOwnerStore(pool, {
		dataDir: config.dataDir, limits: config.appVars, secret: s.ownerKeySecret, previousSecret: s.previousOwnerKeySecret,
		maxSnapshotBytes: s.maxSnapshotBytes, maxAttempts: s.maxAttempts, ...(hooks ? { hooks } : {}),
	});
	return { kv: new PgKv(pool), owners, pool, accounts: pgAccountsDb(pool) };
}

export async function startServer(config: NodeConfig, deps: { fetcher?: typeof fetch; overlayFetcher?: typeof fetch; kv?: SqliteKv; hooks?: PgOwnerOptions["hooks"] } = {}): Promise<RunningServer> {
	const opened = await openStorage(config, deps.hooks);
	const kv: KvStore = deps.kv ?? opened.kv;
	const { owners, pool, accounts } = opened;
	const platform: Platform<NodeEnv> = {
		callOwner: async (_env, key, ownerId, operation, payloadJson) => owners.call(key, ownerId, operation, payloadJson),
		version: () => config.version,
		fetcher: deps.fetcher ?? createGuardedFetch(),
		...(deps.overlayFetcher ?? config.torSocksUrl ? { overlayFetcher: deps.overlayFetcher ?? createTorFetch(config.torSocksUrl!) } : {}),
	};
	const app = createApp<NodeEnv>(platform);
	// ACCOUNTS_DB: the account registry (identities, linking, terms acceptance), as the D1 binding on Cloudflare.
	const env = { ...config.appVars, OAUTH_KV: kv, ACCOUNTS_DB: accounts } as unknown as NodeEnv;

	let inFlight = 0;
	let draining = false;
	const pending = new Set<Promise<unknown>>();
	const purge = setInterval(() => {
		Promise.resolve().then(() => kv.purgeExpired()).catch((e) => log("rigorx_error", { where: "kv_purge", error: String(e) }));
	}, 10 * 60_000);
	purge.unref();

	async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
		// Only origin-form request targets: an absolute-form target ("GET http://other/...") must not
		// change the origin that OAuth URLs are built on.
		if (!req.url || !req.url.startsWith("/")) {
			res.writeHead(400, { "content-type": "text/plain; charset=utf-8" }).end("Bad request target");
			return;
		}
		const url = new URL(req.url, config.origin);
		if (draining && url.pathname === "/health") {
			res.writeHead(503, { "content-type": "application/json", "cache-control": "no-store", connection: "close" }).end(JSON.stringify({ ok: false, draining: true }));
			return;
		}
		if (req.method === "GET" || req.method === "HEAD") {
			const file = staticFile(url.pathname);
			if (file) {
				res.writeHead(200, { "content-type": file.type, "content-length": file.body.length, "cache-control": "public, max-age=86400" });
				res.end(req.method === "HEAD" ? undefined : file.body);
				return;
			}
		}
		const body = req.method === "GET" || req.method === "HEAD" ? null : await readBody(req, config.maxBodyBytes);
		if (body === "too_large") {
			res.writeHead(413, { "content-type": "application/json", connection: "close" }).end(JSON.stringify({ error: "request body too large" }));
			return;
		}
		const headers = new Headers();
		for (const [k, v] of Object.entries(req.headers)) {
			if (v === undefined) continue;
			if (Array.isArray(v)) for (const item of v) headers.append(k, item);
			else headers.set(k, v);
		}
		const request = new Request(url, { method: req.method, headers, body: body && body.length ? body : null });
		const ctx: RequestContext = {
			waitUntil(p) {
				pending.add(p);
				p.finally(() => pending.delete(p)).catch(() => {});
			},
			passThroughOnException() {},
		};
		const response = await app.fetch(request, env, ctx);
		await writeResponse(res, response);
	}

	const server = createServer((req, res) => {
		inFlight++;
		res.on("close", () => { inFlight--; });
		handle(req, res).catch((e) => {
			log("rigorx_error", { where: "http", error: e instanceof Error ? e.stack ?? e.message : String(e) });
			if (!res.headersSent) res.writeHead(500, { "content-type": "application/json" }).end(JSON.stringify({ error: "internal error" }));
			else res.destroy();
		});
	});
	server.headersTimeout = 20_000;
	server.requestTimeout = 60_000;
	server.keepAliveTimeout = 5_000;

	async function shutdown(reason: string): Promise<void> {
		if (draining) return;
		draining = true;
		log("rigorx_shutdown", { phase: "draining", reason, in_flight: inFlight });
		const closed = new Promise<void>((done) => server.close(() => done()));
		server.closeIdleConnections();
		const deadline = Date.now() + config.shutdownGraceMs;
		while ((inFlight > 0 || pending.size > 0) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
		const forced = inFlight;
		server.closeAllConnections();
		await closed;
		clearInterval(purge);
		owners.close();
		accounts.close?.();
		kv.close();
		if (pool) await pool.end(); // after in-flight work: no query is cut off
		log("rigorx_shutdown", { phase: "complete", forced_connections: forced });
	}

	return new Promise((ready, fail) => {
		server.once("error", fail);
		server.listen(config.port, config.host, () => {
			const address = server.address();
			const port = typeof address === "object" && address ? address.port : config.port;
			const storage = config.storage.kind === "postgres" ? { kind: "postgres", ...config.storage.db.summary } : { kind: "sqlite" }; // no credentials
			log("rigorx_start", { origin: config.origin, listen: `${config.host}:${port}`, data_dir: config.dataDir, storage, version: config.version.tag, warnings: config.warnings });
			ready({ server, kv, owners, pool, url: `http://127.0.0.1:${port}`, shutdown });
		});
	});
}

async function main(): Promise<void> {
	let config: NodeConfig;
	try {
		config = loadConfig();
		// Before anything connects: a warning about the configuration must be visible even if startup then fails.
		for (const warning of config.warnings) console.error(JSON.stringify({ evt: "rigorx_config_warning", warning }));
	} catch (e) {
		if (e instanceof ConfigError) {
			console.error(JSON.stringify({ evt: "rigorx_config_error", error: e.message }));
			process.exit(78); // EX_CONFIG
		}
		throw e;
	}
	let running: RunningServer;
	try {
		running = await startServer(config);
	} catch (e) {
		if (e instanceof SchemaError) {
			console.error(JSON.stringify({ evt: "rigorx_config_error", error: e.message }));
			process.exit(78); // fail closed on an uninitialized or incompatible database schema
		}
		const code = (e as { code?: string }).code;
		const hint = storageErrorHint(e);
		console.error(JSON.stringify({ evt: "rigorx_error", where: "storage", error: e instanceof Error ? e.message : String(e), ...(code ? { code } : {}), ...(hint ? { hint } : {}) }));
		process.exit(1);
	}
	let signals = 0;
	for (const sig of ["SIGTERM", "SIGINT"] as const) {
		process.on(sig, () => {
			if (++signals > 1) process.exit(1); // a second signal: stop now
			running.shutdown(sig).then(() => process.exit(0), (e) => {
				console.error(JSON.stringify({ evt: "rigorx_error", where: "shutdown", error: String(e) }));
				process.exit(1);
			});
		});
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	main().catch((e) => {
		console.error(JSON.stringify({ evt: "rigorx_error", where: "startup", error: e instanceof Error ? e.stack ?? e.message : String(e) }));
		process.exit(1);
	});
}
