// Database configuration and TLS rules (no database needed). TLS behaviour is checked against the
// real pg client and a minimal PostgreSQL-speaking TLS endpoint with throwaway certificates.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type Server, type Socket } from "node:net";
import { TLSSocket } from "node:tls";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { DatabaseConfigError, parseDatabaseSettings } from "../pg-config.ts";
import { ConfigError, loadConfig } from "../config.ts";

const PASSWORD = "s3cret-passw0rd-never-printed";
const parse = (env: Record<string, string>, production = false) => parseDatabaseSettings(env as NodeJS.ProcessEnv, production);

test("session pooler only: port 6543 (transaction pooler) is refused", () => {
	assert.throws(() => parse({ DATABASE_URL: `postgres://u:${PASSWORD}@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres` }), /port 6543/);
	const ok = parse({ DATABASE_URL: `postgres://postgres.ref:${PASSWORD}@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres` });
	assert.equal(ok.summary.port, 5432);
	assert.equal(ok.summary.tls, "verify-full");
	assert.equal((ok.pool.ssl as { rejectUnauthorized: boolean }).rejectUnauthorized, true);
	assert.equal((ok.pool.ssl as { servername: string }).servername, "aws-0-ap-southeast-1.pooler.supabase.com");
	assert.equal(JSON.stringify(ok.summary).includes(PASSWORD), false);
});

test("TLS can be disabled only for localhost outside production; sslmode values are checked", () => {
	assert.throws(() => parse({ DATABASE_URL: `postgres://u:${PASSWORD}@db.example.com:5432/x?sslmode=disable` }), /only for a localhost/);
	assert.throws(() => parse({ DATABASE_URL: `postgres://u:${PASSWORD}@db.example.com:5432/x`, DATABASE_SSL: "disable" }), /only for a localhost/);
	assert.throws(() => parse({ DATABASE_URL: `postgres://u:${PASSWORD}@127.0.0.1:5432/x`, DATABASE_SSL: "disable" }, true), /only for a localhost/);
	assert.equal(parse({ DATABASE_URL: `postgres://u:${PASSWORD}@127.0.0.1:5432/x`, DATABASE_SSL: "disable" }).pool.ssl, false);
	assert.throws(() => parse({ DATABASE_URL: `postgres://u:${PASSWORD}@db.example.com/x?sslmode=prefer` }), /sslmode/);
	assert.throws(() => parse({ DATABASE_URL: `postgres://u:${PASSWORD}@db.example.com/x`, DATABASE_SSL: "allow" }), /DATABASE_SSL/);
});

test("errors never contain the connection string or password", () => {
	for (const bad of [`postgres://u:${PASSWORD}@`, `not a url ${PASSWORD}`, `mysql://u:${PASSWORD}@h/x`]) {
		try {
			parse({ DATABASE_URL: bad });
			assert.fail("should throw");
		} catch (e) {
			assert.ok(e instanceof DatabaseConfigError);
			assert.equal((e as Error).message.includes(PASSWORD), false);
		}
	}
	assert.throws(() => parse({}), /DATABASE_URL is required/);
});

test("direct Supabase host warns about IPv6; CA must be PEM; pool size bounded", () => {
	const direct = parse({ DATABASE_URL: `postgres://postgres:${PASSWORD}@db.jlobzwneufhzgpdszsau.supabase.co:5432/postgres` });
	assert.match(direct.warnings.join(" "), /IPv6/);
	assert.throws(() => parse({ DATABASE_URL: `postgres://u:${PASSWORD}@h.example.com/x`, DATABASE_CA_CERT: "not a certificate" }), /DATABASE_CA_CERT/);
	assert.throws(() => parse({ DATABASE_URL: `postgres://u:${PASSWORD}@h.example.com/x`, DATABASE_POOL_MAX: "50" }), /DATABASE_POOL_MAX/);
	assert.equal(parse({ DATABASE_URL: `postgres://u:${PASSWORD}@h.example.com/x` }).summary.pool_max, 5);
});

test("server config: STORAGE=postgres needs a strong OWNER_KEY_SECRET; secrets stay out of appVars", () => {
	const base = { PUBLIC_ORIGIN: "http://127.0.0.1:8787", DATA_DIR: mkdtempSync(join(tmpdir(), "rigorx-cfg-")), STORAGE: "postgres", DATABASE_URL: `postgres://u:${PASSWORD}@127.0.0.1:5432/x`, DATABASE_SSL: "disable" };
	assert.throws(() => loadConfig(base), (e: unknown) => e instanceof ConfigError && /OWNER_KEY_SECRET is required/.test((e as Error).message));
	assert.throws(() => loadConfig({ ...base, OWNER_KEY_SECRET: "short" }), /at least 32/);
	const secret = "x".repeat(40);
	assert.throws(() => loadConfig({ ...base, OWNER_KEY_SECRET: secret, OWNER_KEY_SECRET_PREVIOUS: secret }), /must differ/);
	assert.throws(() => loadConfig({ ...base, OWNER_KEY_SECRET: secret, DATABASE_URL: `postgres://u:${PASSWORD}@h.example.com:6543/x`, DATABASE_SSL: "verify-full" }), (e: unknown) => e instanceof ConfigError && /6543/.test((e as Error).message));
	const c = loadConfig({ ...base, OWNER_KEY_SECRET: secret });
	assert.equal(c.storage.kind, "postgres");
	assert.deepEqual(Object.keys(c.appVars).filter((k) => /DATABASE|OWNER_KEY/.test(k)), []); // never handed to the application
	assert.throws(() => loadConfig({ ...base, STORAGE: "mongo" }), /STORAGE must be/);
});

// ---- TLS against a minimal PostgreSQL TLS endpoint ----

const dir = mkdtempSync(join(tmpdir(), "rigorx-tls-"));
const sh = (...args: string[]) => execFileSync("openssl", args, { cwd: dir, stdio: "pipe" });
sh("req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", "ca.key", "-out", "ca.pem", "-days", "1", "-subj", "/CN=Aetherica Test CA");
sh("req", "-newkey", "rsa:2048", "-nodes", "-keyout", "srv.key", "-out", "srv.csr", "-subj", "/CN=localhost");
writeFileSync(join(dir, "ext.cnf"), "subjectAltName=DNS:localhost\n");
sh("x509", "-req", "-in", "srv.csr", "-CA", "ca.pem", "-CAkey", "ca.key", "-CAcreateserial", "-out", "srv.pem", "-days", "1", "-extfile", "ext.cnf");
const CA = readFileSync(join(dir, "ca.pem"), "utf8");

/** Answers PostgreSQL's SSLRequest with `answer`; with "S", completes a TLS handshake, then hangs up. */
function endpoint(answer: "S" | "N"): Promise<{ server: Server; port: number }> {
	const server = createServer((socket: Socket) => {
		socket.once("data", () => {
			socket.write(answer);
			if (answer === "N") return;
			const tls = new TLSSocket(socket, { isServer: true, key: readFileSync(join(dir, "srv.key")), cert: readFileSync(join(dir, "srv.pem")) });
			tls.on("secure", () => setTimeout(() => tls.destroy(), 50));
			tls.on("error", () => {});
		});
		socket.on("error", () => {});
	});
	return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok({ server, port: (server.address() as { port: number }).port })));
}
const servers: Server[] = [];
after(() => { for (const s of servers) s.close(); });

async function tryConnect(host: string, port: number, extra: Record<string, string> = {}): Promise<string> {
	const settings = parseDatabaseSettings({ DATABASE_URL: `postgres://u:${PASSWORD}@${host}:${port}/x`, ...extra } as NodeJS.ProcessEnv, true);
	const client = new pg.Client({ ...settings.pool, connectionTimeoutMillis: 5000 });
	client.on("error", () => {});
	try {
		await client.connect();
		return "connected";
	} catch (e) {
		return (e as Error).message;
	} finally {
		await client.end().catch(() => {});
	}
}
const CERT_ERROR = /self[- ]signed|unable to verify|certificate|altnames|Hostname\/IP/i;

test("TLS: an unknown CA is rejected (no DATABASE_CA_CERT), the configured CA is accepted", async () => {
	const { server, port } = await endpoint("S");
	servers.push(server);
	const noCa = await tryConnect("localhost", port);
	assert.match(noCa, CERT_ERROR);
	const withCa = await tryConnect("localhost", port, { DATABASE_CA_CERT: CA });
	assert.doesNotMatch(withCa, CERT_ERROR); // handshake verified; the stub then hangs up
});

test("TLS: the certificate must match the host name", async () => {
	const { server, port } = await endpoint("S");
	servers.push(server);
	const mismatch = await tryConnect("127.0.0.1", port, { DATABASE_CA_CERT: CA }); // certificate is for "localhost" only
	assert.match(mismatch, /altnames|Hostname\/IP|IP: 127\.0\.0\.1/i);
});

test("TLS: a server without TLS is refused (no plaintext fallback)", async () => {
	const { server, port } = await endpoint("N");
	servers.push(server);
	assert.match(await tryConnect("localhost", port, { DATABASE_CA_CERT: CA }), /does not support SSL/i);
});
