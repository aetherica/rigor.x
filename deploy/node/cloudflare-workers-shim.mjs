// Minimal stand-ins for the classes "cloudflare:workers" exports. The shared code never runs a
// Durable Object or an RPC entrypoint on Node: the OAuth library imports WorkerEntrypoint only to
// tell entrypoint classes from plain { fetch } handlers, and our handlers are plain objects.
// Durable Objects are replaced by per-owner SQLite files (owners.ts), not by this class.
export class WorkerEntrypoint {
	constructor(ctx, env) {
		this.ctx = ctx;
		this.env = env;
	}
}

export class DurableObject {
	constructor() {
		throw new Error("Durable Objects are not available on the Node runtime; owner storage is deploy/node/owners.ts");
	}
}
