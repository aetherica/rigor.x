// Local stand-in for the MCP layer only: serves the same MCP handler over node:http with an
// in-memory engine (node:sqlite). Used for conformance tests with the official MCP SDK client
// (examples/mcp_smoke.py --url). It is a test harness, never deployed (wrangler bundles only
// src/index.ts), and it does NOT exercise the Worker's OAuth path: a local bearer token chosen
// on the command line maps to one local test owner. The real auth path is tested under
// `wrangler dev` (WS32 P0.6).
// Usage: node --experimental-strip-types scripts/dev-server.ts <port> <local-test-token>
import { createServer } from "node:http";
import { dispatch, EngineError, HostEngine } from "../src/engine.ts";
import { handleHttp, type EngineBackend } from "../src/mcp.ts";
import { DurableObjectRunStore } from "../src/store.ts";
import { memorySql } from "../test/sqlite-fake.ts";

const port = Number(process.argv[2] ?? 8787);
const token = process.argv[3] ?? "dev-token";
const engine = new HostEngine(new DurableObjectRunStore(memorySql()));
const backend: EngineBackend = {
	route: (t) => engine.route(t),
	resolveCommands: (t) => engine.resolveCommands(t),
	async run(owner, operation, args) {
		const r = JSON.parse(dispatch(engine, owner, operation, JSON.stringify(args)));
		if (!r.ok) throw new EngineError(r.message, r.code);
		return r.result;
	},
};

createServer(async (req, res) => {
	const chunks: Buffer[] = [];
	for await (const c of req) chunks.push(c as Buffer);
	const headers = new Headers();
	for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
	const auth = headers.get("authorization");
	let owner: string | null = null;
	if (auth) {
		if (auth !== `Bearer ${token}`) { res.writeHead(401, { "WWW-Authenticate": "Bearer" }).end("Invalid token"); return; }
		owner = "local:test";
	}
	const url = `http://localhost:${port}${req.url}`;
	const body = req.method === "GET" || req.method === "HEAD" ? undefined : Buffer.concat(chunks);
	const response = new URL(url).pathname === "/mcp"
		? await handleHttp(new Request(url, { method: req.method, headers, body }), backend, owner)
		: new Response("Not found", { status: 404 });
	res.writeHead(response.status, Object.fromEntries(response.headers));
	res.end(Buffer.from(await response.arrayBuffer()));
}).listen(port, "127.0.0.1", () => console.log(`dev server on http://127.0.0.1:${port}/mcp`));
