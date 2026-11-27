// PostgreSQL connection settings for the Node runtime (STORAGE=postgres), validated before anything
// connects. Rules (see README "PostgreSQL storage"):
//   - Session-mode pooling only: port 6543 (Supabase's transaction pooler) is refused, because this
//     design relies on session state within a transaction (advisory transaction locks, a multi-
//     statement transaction per write) and on prepared statements.
//   - TLS is mandatory with certificate and hostname verification. DATABASE_CA_CERT supplies the
//     provider's CA (PEM text) when it is not a public CA (Supabase uses its own CA). Plain
//     connections are allowed only to localhost outside production (local development and CI).
//   - The connection string is parsed into fields here and never logged; errors name variables only.
import type { PoolConfig } from "pg";
import { readFileSync } from "node:fs";

export class DatabaseConfigError extends Error {}

export interface DatabaseSettings {
	pool: PoolConfig;
	/** Safe to log: no user, password or database name. */
	summary: { host: string; port: number; tls: "verify-full" | "disabled"; pool_max: number };
	warnings: string[];
}

const LOCAL = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function readCa(raw: string | undefined): string | undefined {
	if (!raw) return undefined;
	const text = raw.includes("-----BEGIN CERTIFICATE-----") ? raw : (() => {
		try {
			return readFileSync(raw, "utf8");
		} catch {
			throw new DatabaseConfigError("DATABASE_CA_CERT must be PEM text or a readable file path");
		}
	})();
	if (!text.includes("-----BEGIN CERTIFICATE-----")) throw new DatabaseConfigError("DATABASE_CA_CERT does not contain a PEM certificate");
	return text.replace(/\\n/g, "\n"); // dashboards sometimes store newlines escaped
}

export function parseDatabaseSettings(env: NodeJS.ProcessEnv, production: boolean): DatabaseSettings {
	const warnings: string[] = [];
	const raw = env.DATABASE_URL;
	if (!raw) throw new DatabaseConfigError("DATABASE_URL is required when STORAGE=postgres");
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		throw new DatabaseConfigError("DATABASE_URL is not a valid URL"); // never echo it: it holds the password
	}
	if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") throw new DatabaseConfigError("DATABASE_URL must start with postgres:// or postgresql://");
	const host = url.hostname;
	const port = url.port ? Number(url.port) : 5432;
	if (!host) throw new DatabaseConfigError("DATABASE_URL has no host");
	if (port === 6543) throw new DatabaseConfigError("DATABASE_URL uses port 6543 (transaction pooler), which this storage does not support: use the session pooler on port 5432");
	if (/^db\.[a-z0-9]+\.supabase\.co$/.test(host)) warnings.push("DATABASE_URL points at the direct Supabase host, which is IPv6-only on the free plan; use the session pooler (aws-…pooler.supabase.com:5432) if this host has no IPv6");
	const sslmode = url.searchParams.get("sslmode");
	const tlsSetting = (env.DATABASE_SSL ?? "verify-full").toLowerCase();
	if (tlsSetting !== "verify-full" && tlsSetting !== "disable") throw new DatabaseConfigError("DATABASE_SSL must be verify-full (default) or disable");
	const disable = tlsSetting === "disable" || sslmode === "disable";
	if (disable && (production || !LOCAL.has(host))) throw new DatabaseConfigError("TLS can be disabled only for a localhost database outside production (DATABASE_SSL=disable / sslmode=disable)");
	if (sslmode && !["disable", "require", "verify-ca", "verify-full"].includes(sslmode)) throw new DatabaseConfigError("DATABASE_URL sslmode must be require, verify-ca or verify-full (verification is always full)");

	const max = (() => {
		const v = env.DATABASE_POOL_MAX;
		if (v === undefined || v === "") return 5;
		const n = Number(v);
		if (!Number.isInteger(n) || n < 1 || n > 20) throw new DatabaseConfigError("DATABASE_POOL_MAX must be an integer from 1 to 20");
		return n;
	})();
	const ca = readCa(env.DATABASE_CA_CERT);
	const pool: PoolConfig = {
		host,
		port,
		user: decodeURIComponent(url.username || "postgres"),
		password: decodeURIComponent(url.password),
		database: decodeURIComponent(url.pathname.replace(/^\//, "") || "postgres"),
		max,
		idleTimeoutMillis: 30_000,
		connectionTimeoutMillis: 10_000,
		query_timeout: 20_000,
		application_name: "aetherica-node",
		// Full verification: certificate chain (against DATABASE_CA_CERT or the system store) and hostname.
		ssl: disable ? false : { rejectUnauthorized: true, servername: host, ...(ca ? { ca } : {}) },
	};
	return { pool, summary: { host, port, tls: disable ? "disabled" : "verify-full", pool_max: max }, warnings };
}
