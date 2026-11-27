// Startup configuration for the Node runtime: read once from the environment, validated before the
// server listens. Invalid configuration stops the process with a message naming the variable; no
// secret value is ever printed.
import { accessSync, constants, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { policyFromEnv } from "../cloudflare-ts/src/resilience.ts";
import { DatabaseConfigError, parseDatabaseSettings, type DatabaseSettings } from "./pg-config.ts";

export interface NodeConfig {
	/** The public origin clients use (scheme://host[:port]); every request URL and OAuth URL is built on it. */
	origin: string;
	host: string;
	port: number;
	dataDir: string;
	shutdownGraceMs: number;
	/** Largest request body accepted (bytes); MCP itself caps messages at 1 MiB. */
	maxBodyBytes: number;
	production: boolean;
	version: { id: string; tag: string; timestamp: string };
	/** The variables the application reads (Google client, RIGORX_* limits and policy); nothing else from the process environment. */
	appVars: Record<string, string>;
	/** Where accounts' data and OAuth records live: SQLite files in DATA_DIR, or PostgreSQL (STORAGE=postgres). */
	storage: StorageSettings;
	warnings: string[];
}

export type StorageSettings =
	| { kind: "sqlite" }
	| {
		kind: "postgres";
		db: DatabaseSettings;
		/** HMAC key for owner storage keys (never logged); see README for rotation. */
		ownerKeySecret: string;
		previousOwnerKeySecret?: string;
		maxSnapshotBytes: number;
		maxAttempts: number;
	};

export class ConfigError extends Error {}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function int(env: NodeJS.ProcessEnv, name: string, fallback: number, min: number, max: number): number {
	const raw = env[name];
	if (raw === undefined || raw === "") return fallback;
	const n = Number(raw);
	if (!Number.isInteger(n) || n < min || n > max) throw new ConfigError(`${name} must be an integer from ${min} to ${max}`);
	return n;
}

export function parseOrigin(raw: string | undefined): string {
	if (!raw) throw new ConfigError("PUBLIC_ORIGIN is required (for example https://aetherica.example.com): OAuth metadata and callback URLs are built on it");
	let u: URL;
	try {
		u = new URL(raw);
	} catch {
		throw new ConfigError("PUBLIC_ORIGIN is not a valid URL");
	}
	if (u.username || u.password || u.search || u.hash || (u.pathname !== "/" && u.pathname !== "")) throw new ConfigError("PUBLIC_ORIGIN must be an origin only (scheme, host and optional port; no path, query or credentials)");
	if (u.protocol === "https:") return u.origin;
	if (u.protocol === "http:" && LOCAL_HOSTS.has(u.hostname)) return u.origin;
	throw new ConfigError("PUBLIC_ORIGIN must use https (plain http is accepted only for localhost)");
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): NodeConfig {
	const warnings: string[] = [];
	const production = env.NODE_ENV === "production";
	const origin = parseOrigin(env.PUBLIC_ORIGIN);
	const port = int(env, "PORT", 8787, 0, 65535); // 0: any free port (tests)
	const host = env.HOST || "0.0.0.0";
	const shutdownGraceMs = int(env, "SHUTDOWN_GRACE_MS", 10_000, 1_000, 60_000);
	const maxBodyBytes = int(env, "MAX_BODY_BYTES", 2 * 1_048_576, 65_536, 8 * 1_048_576);

	const dataDir = resolve(env.DATA_DIR || "./data");
	try {
		mkdirSync(dataDir, { recursive: true, mode: 0o700 });
		accessSync(dataDir, constants.W_OK);
		const probe = join(dataDir, `.write-probe-${process.pid}`);
		writeFileSync(probe, "");
		rmSync(probe);
	} catch {
		throw new ConfigError(`DATA_DIR (${dataDir}) is not a writable directory`);
	}

	const appVars: Record<string, string> = {};
	for (const [k, v] of Object.entries(env)) {
		if (v !== undefined && (/^(GOOGLE|GITHUB|OPENAI)_CLIENT_(ID|SECRET)$/.test(k) || k.startsWith("RIGORX_"))) appVars[k] = v;
	}
	if (!appVars.GOOGLE_CLIENT_ID || !appVars.GOOGLE_CLIENT_SECRET) {
		if (production) throw new ConfigError("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required in production (sign-in would be impossible)");
		warnings.push("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set: sign-in pages answer 503 until they are");
	}
	const { rejected } = policyFromEnv(appVars);
	if (rejected.length) warnings.push(`resilience variables outside their bounds were ignored: ${rejected.map((r) => (typeof r === "string" ? r : JSON.stringify(r))).join(", ")}`);

	const commit = env.RIGORX_VERSION_TAG || env.RENDER_GIT_COMMIT || env.RAILWAY_GIT_COMMIT_SHA || "";
	const version = { id: commit || "node-local", tag: commit ? commit.slice(0, 12) : "local", timestamp: new Date().toISOString() };
	const storage = storageSettings(env, production, warnings);
	return { origin, host, port, dataDir, shutdownGraceMs, maxBodyBytes, production, version, appVars, storage, warnings };
}

function storageSettings(env: NodeJS.ProcessEnv, production: boolean, warnings: string[]): StorageSettings {
	const kind = (env.STORAGE || "sqlite").toLowerCase();
	if (kind === "sqlite") {
		if (production) warnings.push("STORAGE=sqlite: data lives only in DATA_DIR; on hosting without a persistent disk every restart deletes it");
		return { kind: "sqlite" };
	}
	if (kind !== "postgres") throw new ConfigError("STORAGE must be sqlite or postgres");
	let db: DatabaseSettings;
	try {
		db = parseDatabaseSettings(env, production);
	} catch (e) {
		if (e instanceof DatabaseConfigError) throw new ConfigError(e.message);
		throw e;
	}
	warnings.push(...db.warnings);
	const secret = env.OWNER_KEY_SECRET ?? "";
	if (secret.length < 32) throw new ConfigError("OWNER_KEY_SECRET is required with STORAGE=postgres and must be at least 32 characters (for example: openssl rand -base64 48)");
	const previous = env.OWNER_KEY_SECRET_PREVIOUS || undefined;
	if (previous !== undefined && previous.length < 32) throw new ConfigError("OWNER_KEY_SECRET_PREVIOUS must be at least 32 characters");
	if (previous === secret) throw new ConfigError("OWNER_KEY_SECRET_PREVIOUS must differ from OWNER_KEY_SECRET");
	return {
		kind: "postgres",
		db,
		ownerKeySecret: secret,
		...(previous ? { previousOwnerKeySecret: previous } : {}),
		maxSnapshotBytes: int(env, "OWNER_SNAPSHOT_MAX_BYTES", 8 * 1_048_576, 65_536, 64 * 1_048_576),
		maxAttempts: int(env, "STORAGE_MAX_ATTEMPTS", 4, 1, 5),
	};
}
