// The platform-neutral application: MCP over Streamable HTTP, OAuth (auth.ts), version and health,
// and the owner-scoped engine calls. A platform supplies only what differs between hosts:
//
//   callOwner   runs one engine operation in that owner's isolated storage. On Cloudflare this is
//               the owner's Durable Object (index.ts); on Node it is the owner's own SQLite file
//               (deploy/node). Owners never share a database on either platform.
//   version     release identity (Cloudflare version metadata, or the commit a Node host deployed).
//   fetcher     the fetch used for source checks. Cloudflare's global fetch is restricted to public
//               addresses by the platform (global_fetch_strictly_public); Node supplies a fetch that
//               checks every resolved address at connection time.
//
// No business logic lives in the platform adapters: MCP, OAuth, quotas, approvals and the engine are
// the same code on every host.

import { EngineError, HostEngine } from "./engine.ts";
import { SERVER_VERSION, handleHttp, type EngineBackend } from "./mcp.ts";
import { buildProvider, type AuthEnv } from "./auth.ts";
import { runSourceCheck, sharedRegistry } from "./source.ts";
import { policyDigest, policyFromEnv } from "./resilience.ts";
import { PROTOCOL_VERSION } from "./protocol.ts";
import { GATE_VERSION } from "./gate.ts";
import type { JsonObject } from "./text.ts";
import { isSuspended } from "./index-helpers.ts";
import { MARKETPLACE_WEBHOOK_PATH, handleMarketplaceWebhook } from "./marketplace.ts";

/** Release identity of the running code. */
export interface VersionInfo {
	id: string;
	tag: string;
	timestamp: string;
}

export interface AppEnv extends AuthEnv {
	/** Comma-separated SHA-256 hex prefixes (≥ 16 characters) of suspended owners: every owner-scoped call is refused. */
	RIGORX_SUSPENDED_OWNERS?: string;
	[key: string]: unknown;
}

export interface Platform<Env extends AppEnv> {
	/** Runs one engine operation for ownerId in the storage of the owner whose SHA-256 hex key is `key`; returns dispatch()'s JSON. */
	callOwner(env: Env, key: string, ownerId: string, operation: string, payloadJson: string): Promise<string>;
	version(env: Env): VersionInfo | undefined;
	fetcher: typeof fetch;
	/** DL04: fetch through a Tor SOCKS5h egress, where the deployment has one (Node runtime). */
	overlayFetcher?: typeof fetch;
}

/** Context passed to the OAuth provider (props are set by it for authenticated API calls). */
export interface RequestContext {
	waitUntil(promise: Promise<unknown>): void;
	passThroughOnException(): void;
	props?: unknown;
}

// The local engine serves only stateless tools and never touches storage.
const localEngine = new HostEngine({
	create: refuse, load: refuse, save: refuse, delete: refuse, list: refuse, countRuns: refuse,
	usage: refuse, addUsage: refuse, profileId: refuse, databaseBytes: refuse,
});
function refuse(): never {
	throw new Error("Run storage is only available inside the owner's own storage");
}

export async function sha256Hex(text: string): Promise<string> {
	const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
	return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function createApp<Env extends AppEnv>(platform: Platform<Env>) {
	const tag = (env: Env) => platform.version(env)?.tag ?? null;

	function version(env: Env) {
		const v = platform.version(env);
		return { server: SERVER_VERSION, engine_protocol: PROTOCOL_VERSION, gate: GATE_VERSION, worker_version_id: v?.id ?? null, worker_version_tag: v?.tag ?? null, worker_version_timestamp: v?.timestamp ?? null };
	}

	function backend(env: Env, rid: string): EngineBackend {
		const { policy } = policyFromEnv(env);
		const registry = sharedRegistry(policy);
		async function run(ownerId: string, operation: string, args: JsonObject): Promise<JsonObject> {
			const key = await sha256Hex(ownerId);
			const t0 = Date.now();
			if (isSuspended(env, key)) {
				console.log(JSON.stringify({ evt: "rigorx_security", kind: "suspended_account", rid, owner: key.slice(0, 12), operation }));
				throw new EngineError("This account is suspended; contact the operator of this server", "ACCOUNT_SUSPENDED");
			}
			let response: { ok: true; result: JsonObject } | { ok: false; code: string; message: string };
			try {
				response = JSON.parse(await platform.callOwner(env, key, ownerId, operation, JSON.stringify(args)));
			} catch (e) {
				console.log(JSON.stringify({ evt: "rigorx_op", rid, owner: key.slice(0, 12), operation, outcome: "internal_error", ms: Date.now() - t0, version: tag(env) }));
				throw e;
			}
			console.log(JSON.stringify({ evt: "rigorx_op", rid, owner: key.slice(0, 12), operation, outcome: response.ok ? "ok" : response.code, ms: Date.now() - t0, version: tag(env) }));
			if (!response.ok) throw new EngineError(response.message, response.code);
			return response.result;
		}
		return {
			route: (task) => localEngine.route(task),
			resolveCommands: (text) => localEngine.resolveCommands(text),
			compute: (args) => localEngine.computeOp(null, args),
			run,
			checkSource: (ownerId, args) => runSourceCheck((operation, a) => run(ownerId, operation, a), args, platform.fetcher, { registry, ...(platform.overlayFetcher ? { overlay: platform.overlayFetcher } : {}) }),
		};
	}

	async function serveMcp(request: Request, env: Env, owner: string): Promise<Response> {
		const rid = crypto.randomUUID();
		const t0 = Date.now();
		let response: Response;
		try {
			response = await handleHttp(request, backend(env, rid), owner);
		} catch (e) {
			console.error(JSON.stringify({ evt: "rigorx_error", rid, error: e instanceof Error ? e.stack ?? e.message : String(e), version: tag(env) }));
			response = Response.json({ jsonrpc: "2.0", id: null, error: { code: -32603, message: "Internal error", data: { request_id: rid } } }, { status: 500 });
		}
		const out = new Response(response.body, response);
		out.headers.set("x-rigorx-request-id", rid);
		const t = tag(env);
		if (t) out.headers.set("x-rigorx-version", t);
		console.log(JSON.stringify({ evt: "rigorx_request", rid, status: out.status, ms: Date.now() - t0, version: t }));
		return out;
	}

	/** Public routes: version (release traceability), health and the GitHub Marketplace webhook. */
	async function extraRoutes(request: Request, env: AuthEnv): Promise<Response | null> {
		const e = env as Env;
		const { pathname } = new URL(request.url);
		if (pathname === MARKETPLACE_WEBHOOK_PATH) return handleMarketplaceWebhook(request, typeof e.GITHUB_MARKETPLACE_WEBHOOK_SECRET === "string" ? e.GITHUB_MARKETPLACE_WEBHOOK_SECRET : undefined);
		if (request.method !== "GET") return null;
		if (pathname === "/version") {
			const { policy, rejected } = policyFromEnv(e);
			return Response.json({ ...version(e), resilience_policy: policyDigest(policy), config_rejected: rejected.length }, { headers: { "Cache-Control": "no-store" } });
		}
		if (pathname === "/health") {
			const registry = sharedRegistry(policyFromEnv(e).policy);
			return Response.json({ ok: true, circuits: registry.states(), acquisitions_in_flight: registry.limiter.inFlight, ...version(e) }, { headers: { "Cache-Control": "no-store" } });
		}
		return null;
	}

	/** Approval pages: run an internal operation in the signed-in owner's storage (env passed per request). */
	const ownerCall = (env: AuthEnv, owner: string, operation: string, args: Record<string, unknown>) => backend(env as Env, crypto.randomUUID()).run(owner, operation, args as JsonObject);

	return {
		fetch(request: Request, env: Env, ctx: RequestContext): Promise<Response> {
			return buildProvider<Env>(new URL(request.url).origin, serveMcp, { call: ownerCall, extra: extraRoutes }).fetch(request, env, ctx as ExecutionContext);
		},
	};
}
