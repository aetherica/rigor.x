// RIGOR-X MCP server on Cloudflare Workers (TypeScript; one runtime dependency, Cloudflare's OAuth provider).
//
// - The Worker serves MCP over Streamable HTTP at /mcp (see mcp.ts).
// - Each owner's runs live in that owner's Durable Object (OwnerRuns), which runs
//   the engine on Durable Object SQLite. Stateless tools run in the Worker.
// - Authentication (WS31 phase P4): this Worker is also the OAuth authorization server
//   (@cloudflare/workers-oauth-provider: PKCE, Client ID Metadata Documents, dynamic client
//   registration, tokens bound to this /mcp resource). Users sign in with Google; the owner is
//   "google:<sub>". Every /mcp request needs a token: without one the answer is 401 with a
//   resource_metadata pointer, which is how MCP hosts discover sign-in. There is no static or
//   shared token: Claude Code, Claude, ChatGPT and scripts all sign in with OAuth. See auth.ts.

import { DurableObject } from "cloudflare:workers";
import { DurableObjectRunStore } from "./store.ts";
import { EngineError, HostEngine, dispatch } from "./engine.ts";
import { limitsFromEnv, type LimitVars } from "./limits.ts";
import { SERVER_VERSION, handleHttp, type EngineBackend } from "./mcp.ts";
import { buildProvider, type AuthEnv } from "./auth.ts";
import { runSourceCheck, sharedRegistry } from "./source.ts";
import { MemoryStore } from "./memory.ts";
import { policyDigest, policyFromEnv } from "./resilience.ts";
import { PROTOCOL_VERSION } from "./protocol.ts";
import { GATE_VERSION } from "./gate.ts";
import type { JsonObject } from "./text.ts";
import { isSuspended } from "./index-helpers.ts";
export { isSuspended };

export interface Env extends AuthEnv, LimitVars {
	OWNER_RUNS: DurableObjectNamespace<OwnerRuns>;
	/** Worker version metadata (id, tag = commit SHA prefix set at deploy, timestamp). */
	CF_VERSION_METADATA?: { id: string; tag: string; timestamp: string };
	/** Comma-separated SHA-256 hex prefixes (≥ 16 characters) of suspended owners: every owner-scoped call is refused. */
	RIGORX_SUSPENDED_OWNERS?: string;
	[key: string]: unknown;
}

export class OwnerRuns extends DurableObject<Env> {
	private readonly engine: HostEngine;

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		const store = new DurableObjectRunStore(ctx.storage.sql); // schema migrations and auxiliary tables
		this.engine = new HostEngine(store, {
			limits: limitsFromEnv(env),
			memory: new MemoryStore(ctx.storage.sql),
			// Each operation is one SQLite transaction: an operation that fails part-way changes nothing (audit finding C1).
			transaction: (fn) => ctx.storage.transactionSync(fn),
		});
	}

	call(ownerId: string, operation: string, payloadJson: string): string {
		return dispatch(this.engine, ownerId, operation, payloadJson);
	}
}

// The Worker's local engine serves only stateless tools and never touches storage.
const localEngine = new HostEngine({
	create: refuse, load: refuse, save: refuse, delete: refuse, list: refuse, countRuns: refuse,
	usage: refuse, addUsage: refuse, profileId: refuse, databaseBytes: refuse,
});
function refuse(): never {
	throw new Error("Run storage is only available inside the owner's Durable Object");
}

async function sha256Hex(text: string): Promise<string> {
	const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
	return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function version(env: Env) {
	const v = env.CF_VERSION_METADATA;
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
			throw new EngineError("This account is suspended; contact the operator of this RIGOR-X server", "ACCOUNT_SUSPENDED");
		}
		const stub = env.OWNER_RUNS.get(env.OWNER_RUNS.idFromName(key));
		let response: { ok: true; result: JsonObject } | { ok: false; code: string; message: string };
		try {
			response = JSON.parse(await stub.call(ownerId, operation, JSON.stringify(args)));
		} catch (e) {
			console.log(JSON.stringify({ evt: "rigorx_op", rid, owner: key.slice(0, 12), operation, outcome: "internal_error", ms: Date.now() - t0, version: env.CF_VERSION_METADATA?.tag ?? null }));
			throw e;
		}
		console.log(JSON.stringify({ evt: "rigorx_op", rid, owner: key.slice(0, 12), operation, outcome: response.ok ? "ok" : response.code, ms: Date.now() - t0, version: env.CF_VERSION_METADATA?.tag ?? null }));
		if (!response.ok) throw new EngineError(response.message, response.code);
		return response.result;
	}
	return {
		route: (task) => localEngine.route(task),
		resolveCommands: (text) => localEngine.resolveCommands(text),
		compute: (args) => localEngine.computeOp(null, args),
		run,
		checkSource: (ownerId, args) => runSourceCheck((operation, a) => run(ownerId, operation, a), args, fetch, { registry }),
	};
}

async function serveMcp(request: Request, env: Env, owner: string): Promise<Response> {
	const rid = crypto.randomUUID();
	const t0 = Date.now();
	let response: Response;
	try {
		response = await handleHttp(request, backend(env, rid), owner);
	} catch (e) {
		console.error(JSON.stringify({ evt: "rigorx_error", rid, error: e instanceof Error ? e.stack ?? e.message : String(e), version: env.CF_VERSION_METADATA?.tag ?? null }));
		response = Response.json({ jsonrpc: "2.0", id: null, error: { code: -32603, message: "Internal error", data: { request_id: rid } } }, { status: 500 });
	}
	const out = new Response(response.body, response);
	out.headers.set("x-rigorx-request-id", rid);
	if (env.CF_VERSION_METADATA?.tag) out.headers.set("x-rigorx-version", env.CF_VERSION_METADATA.tag);
	console.log(JSON.stringify({ evt: "rigorx_request", rid, status: out.status, ms: Date.now() - t0, version: env.CF_VERSION_METADATA?.tag ?? null }));
	return out;
}

/** Public, non-sensitive routes: version (release traceability) and health. */
async function extraRoutes(request: Request, env: AuthEnv): Promise<Response | null> {
	const e = env as Env;
	const { pathname } = new URL(request.url);
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

/** Approval pages: run an internal operation in the signed-in owner's Durable Object (env passed per request). */
const ownerCall = (env: AuthEnv, owner: string, operation: string, args: Record<string, unknown>) => backend(env as Env, crypto.randomUUID()).run(owner, operation, args as JsonObject);

export default {
	fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		return buildProvider<Env>(new URL(request.url).origin, serveMcp, { call: ownerCall, extra: extraRoutes }).fetch(request, env, ctx);
	},
} satisfies ExportedHandler<Env>;
