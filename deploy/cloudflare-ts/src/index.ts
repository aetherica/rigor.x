// RIGOR-X MCP server on Cloudflare Workers (TypeScript, no runtime dependencies).
//
// - The Worker serves MCP over Streamable HTTP at /mcp (see mcp.ts).
// - Each owner's runs live in that owner's Durable Object (OwnerRuns), which runs
//   the engine on Durable Object SQLite. Stateless tools run in the Worker.
// - Spike authentication: one shared bearer token (Worker secret RIGORX_SPIKE_TOKEN)
//   maps to one development owner. No token: stateless tools only. Wrong token: 401.
//   Phase P4 replaces this with OAuth sign-in (Google) in this same Worker.

import { DurableObject } from "cloudflare:workers";
import { timingSafeEqual } from "node:crypto";
import { DurableObjectRunStore } from "./store.ts";
import { EngineError, HostEngine, dispatch } from "./engine.ts";
import { handleHttp, type EngineBackend } from "./mcp.ts";
import type { JsonObject } from "./pipeline.ts";

export interface Env {
	OWNER_RUNS: DurableObjectNamespace<OwnerRuns>;
	RIGORX_SPIKE_TOKEN?: string;
}

const SPIKE_OWNER = "spike:dev";

export class OwnerRuns extends DurableObject<Env> {
	private readonly engine: HostEngine;

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		this.engine = new HostEngine(new DurableObjectRunStore(ctx.storage.sql));
	}

	call(ownerId: string, operation: string, payloadJson: string): string {
		return dispatch(this.engine, ownerId, operation, payloadJson);
	}
}

// The Worker's local engine serves only stateless tools and never touches storage.
const localEngine = new HostEngine({
	create: refuse, load: refuse, save: refuse, delete: refuse,
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
		async run(ownerId, operation, args) {
			const stub = env.OWNER_RUNS.get(env.OWNER_RUNS.idFromName(await ownerKey(ownerId)));
			const response = JSON.parse(await stub.call(ownerId, operation, JSON.stringify(args))) as
				{ ok: true; result: JsonObject } | { ok: false; code: string; message: string };
			if (!response.ok) throw new EngineError(response.message, response.code);
			return response.result;
		},
	};
}

function tokenMatches(given: string, expected: string): boolean {
	const a = new TextEncoder().encode(given);
	const b = new TextEncoder().encode(expected);
	return a.length === b.length && timingSafeEqual(a, b);
}

/** Returns the owner (or null for anonymous), or a Response to send instead. */
function authenticate(request: Request, env: Env): string | null | Response {
	const header = request.headers.get("Authorization");
	if (!header) return null;
	if (!env.RIGORX_SPIKE_TOKEN) return new Response("Server token is not configured", { status: 503 });
	const [scheme, token = ""] = header.split(" ", 2);
	if (scheme?.toLowerCase() !== "bearer" || !tokenMatches(token, env.RIGORX_SPIKE_TOKEN)) {
		return new Response("Invalid token", { status: 401, headers: { "WWW-Authenticate": "Bearer" } });
	}
	return SPIKE_OWNER;
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const { pathname } = new URL(request.url);
		if (pathname === "/" && request.method === "GET") {
			return new Response("RIGOR-X MCP server (spike). MCP endpoint: POST /mcp");
		}
		if (pathname !== "/mcp") return new Response("Not found", { status: 404 });
		const owner = authenticate(request, env);
		if (owner instanceof Response) return owner;
		try {
			return await handleHttp(request, backend(env), owner);
		} catch (e) {
			console.error("RIGORX_ERROR", e instanceof Error ? e.stack ?? e.message : String(e));
			return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32603, message: "Internal error" } }, { status: 500 });
		}
	},
} satisfies ExportedHandler<Env>;
