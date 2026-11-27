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
	// Copied examples: never echo the value (it holds the password); name what to fix instead.
	if (/\[?YOUR[-_ ]?PASSWORD\]?|<password>/i.test(raw)) throw new DatabaseConfigError("DATABASE_URL still contains the password placeholder ([YOUR-PASSWORD]): replace it, brackets included, with the database password");
	if (/[… ​‘’“”]/.test(raw)) throw new DatabaseConfigError("DATABASE_URL contains a placeholder or typographic character (such as … or curly quotes) copied from an example: copy the exact Session pooler string from Supabase (Connect -> Session pooler)");
	if (/^\s*(DATABASE_URL\s*=|["'])/.test(raw)) throw new DatabaseConfigError("DATABASE_URL must be the bare connection string starting with postgresql:// (no DATABASE_URL= prefix, no quotes)");
	let url: URL;
	try {
		url = new URL(raw.trim());
	} catch {
		throw new DatabaseConfigError("DATABASE_URL is not a valid URL: a password containing / ? # @ % : must be percent-encoded; simplest is to reset the database password to letters and digits only");
	}
	if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") throw new DatabaseConfigError("DATABASE_URL must start with postgres:// or postgresql://");
	const host = url.hostname;
	const port = url.port ? Number(url.port) : 5432;
	if (!host) throw new DatabaseConfigError("DATABASE_URL has no host");
	if (!/^[a-z0-9.-]+$/i.test(host) && !/^\[[0-9a-f:]+\]$/i.test(host)) throw new DatabaseConfigError("DATABASE_URL host contains characters a host name cannot have (often a placeholder copied from an example): copy the exact Session pooler host from Supabase");
	if (port === 6543) throw new DatabaseConfigError("DATABASE_URL uses port 6543 (Supabase's Transaction pooler), which this storage does not support: use the Session pooler string, port 5432 (same host, change only the port)");
	if (/^db\.[a-z0-9]+\.supabase\.co$/.test(host)) warnings.push("DATABASE_URL points at the direct Supabase host, which is IPv6-only on the free plan; use the Session pooler string from Supabase (host ending in pooler.supabase.com, port 5432) if this host has no IPv6");
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

/**
 * A plain instruction for a database connection failure at startup (the error itself is logged too).
 * Covers the mistakes seen when configuring Supabase from a host without IPv6.
 */
export function storageErrorHint(e: unknown): string | null {
	const err = e as { code?: string; message?: string };
	const code = err?.code ?? "";
	const message = String(err?.message ?? "");
	if ((code === "ENETUNREACH" || code === "EHOSTUNREACH" || code === "EADDRNOTAVAIL") && /[0-9a-f]*:[0-9a-f:]+/i.test(message)) {
		return "The database address is IPv6 and this host has no IPv6 (Supabase's direct host db.<ref>.supabase.co is IPv6-only on the free plan). Use the Session pooler string from Supabase (host ending in pooler.supabase.com, port 5432).";
	}
	if (code === "ENOTFOUND" || code === "EAI_AGAIN") return "The database host name does not exist. Copy the exact host from Supabase (Connect -> Session pooler); do not type it from an example.";
	if (/tenant or user not found/i.test(message)) return "The pooler does not know this project/user. Copy the Session pooler string exactly: user postgres.<project-ref>, and the exact host Supabase shows (for example aws-0-ap-southeast-1 or aws-1-ap-southeast-1: they are different clusters).";
	if (/password authentication failed/i.test(message)) return "Wrong database password. Put the current password in DATABASE_URL (reset it in Supabase -> Database Settings if unknown; letters and digits avoid encoding problems).";
	if (/certificate|self[- ]signed|unable to verify|UNABLE_TO_GET_ISSUER|CERT_/i.test(message + code)) return "TLS verification failed. Set DATABASE_CA_CERT to the provider's CA certificate (Supabase: Database Settings -> SSL Configuration -> Download certificate), the whole PEM text.";
	if (/does not support SSL/i.test(message)) return "The database refused TLS. Use the provider's TLS endpoint (Supabase pooler or direct host); plain connections are allowed only to localhost outside production.";
	if (code === "ECONNREFUSED") return "Connection refused. Check the host and that the port is 5432 (Session pooler).";
	if (code === "ETIMEDOUT" || /timeout/i.test(message)) return "The database did not answer in time. Check the host and port 5432, and that the Supabase project is not paused (free projects pause after 7 days without activity).";
	return null;
}
