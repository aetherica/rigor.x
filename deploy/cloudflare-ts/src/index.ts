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
// - The application itself is platform-neutral (app.ts); this file binds it to Cloudflare. The
//   portable Node runtime (deploy/node) binds the same application to node:http and SQLite files.

import { DurableObject } from "cloudflare:workers";
import { DurableObjectRunStore } from "./store.ts";
import { HostEngine, dispatch } from "./engine.ts";
import { limitsFromEnv, type LimitVars } from "./limits.ts";
import { MemoryStore } from "./memory.ts";
import { createApp, type AppEnv } from "./app.ts";
import { isSuspended } from "./index-helpers.ts";
export { isSuspended };

export interface Env extends AppEnv, LimitVars {
	OWNER_RUNS: DurableObjectNamespace<OwnerRuns>;
	/** Worker version metadata (id, tag = commit SHA prefix set at deploy, timestamp). */
	CF_VERSION_METADATA?: { id: string; tag: string; timestamp: string };
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

const app = createApp<Env>({
	// One Durable Object per owner, named by the SHA-256 of the owner ID.
	callOwner: (env, key, ownerId, operation, payloadJson) => env.OWNER_RUNS.get(env.OWNER_RUNS.idFromName(key)).call(ownerId, operation, payloadJson),
	version: (env) => env.CF_VERSION_METADATA,
	fetcher: (input, init) => fetch(input, init),
});

export default {
	fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		return app.fetch(request, env, ctx);
	},
} satisfies ExportedHandler<Env>;
