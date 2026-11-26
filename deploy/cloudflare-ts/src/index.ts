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
import { handleHttp, type EngineBackend } from "./mcp.ts";
import { buildProvider, type AuthEnv } from "./auth.ts";
import { checkSource } from "./source.ts";
import { MemoryStore } from "./memory.ts";
import type { JsonObject } from "./text.ts";

export interface Env extends AuthEnv, LimitVars {
	OWNER_RUNS: DurableObjectNamespace<OwnerRuns>;
}

export class OwnerRuns extends DurableObject<Env> {
	private readonly engine: HostEngine;

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		const store = new DurableObjectRunStore(ctx.storage.sql); // runs the schema migrations, memory tables included
		this.engine = new HostEngine(store, { limits: limitsFromEnv(env), memory: new MemoryStore(ctx.storage.sql) });
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

async function ownerKey(owner: string): Promise<string> {
	const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(owner));
	return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function backend(env: Env): EngineBackend {
	return {
		route: (task) => localEngine.route(task),
		resolveCommands: (text) => localEngine.resolveCommands(text),
		compute: (args) => localEngine.computeOp(null, args),
		run,
		async checkSource(ownerId, args) {
			const evidence = await run(ownerId, "evidence_for_check", args);
			const check = await checkSource(String(evidence.source_ref));
			return run(ownerId, "record_source_check", { run_id: args.run_id ?? null, evidence_id: args.evidence_id ?? null, check: check as unknown as JsonObject });
		},
	};
	async function run(ownerId: string, operation: string, args: JsonObject): Promise<JsonObject> {
		const stub = env.OWNER_RUNS.get(env.OWNER_RUNS.idFromName(await ownerKey(ownerId)));
		const response = JSON.parse(await stub.call(ownerId, operation, JSON.stringify(args))) as
			{ ok: true; result: JsonObject } | { ok: false; code: string; message: string };
		if (!response.ok) throw new EngineError(response.message, response.code);
		return response.result;
	}
}

async function serveMcp(request: Request, env: Env, owner: string): Promise<Response> {
	try {
		return await handleHttp(request, backend(env), owner);
	} catch (e) {
		console.error("RIGORX_ERROR", e instanceof Error ? e.stack ?? e.message : String(e));
		return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32603, message: "Internal error" } }, { status: 500 });
	}
}

export default {
	fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		return buildProvider<Env>(new URL(request.url).origin, serveMcp).fetch(request, env, ctx);
	},
} satisfies ExportedHandler<Env>;
