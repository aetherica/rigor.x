// Startup configuration for the Node runtime: read once from the environment, validated before the
// server listens. Invalid configuration stops the process with a message naming the variable; no
// secret value is ever printed.
import { accessSync, constants, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { policyFromEnv } from "../cloudflare-ts/src/resilience.ts";

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
	warnings: string[];
}

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
	return { origin, host, port, dataDir, shutdownGraceMs, maxBodyBytes, production, version, appVars, warnings };
}
