// MCP 2026-07-28 (stateless era) on the HTTP layer (WS32 P0.2). Expected codes and statuses are
// taken from the reference SDK (mcp 2.3.0: mcp/shared/inbound.py ladder, ERROR_CODE_HTTP_STATUS),
// written here by hand; conformance with the SDK client itself runs in CI (examples/mcp_smoke.py --mode).
import { test } from "node:test";
import assert from "node:assert/strict";
import { dispatch, EngineError, HostEngine } from "../src/engine.ts";
import { handleHttp, type EngineBackend } from "../src/mcp.ts";
import { DurableObjectRunStore } from "../src/store.ts";
import { memorySql } from "./sqlite-fake.ts";
import { localBackend } from "./backend.ts";


const V = "2026-07-28";
const META = { "io.modelcontextprotocol/protocolVersion": V, "io.modelcontextprotocol/clientCapabilities": {} };

function request(method: string, params: Record<string, unknown> = {}, headers: Record<string, string> = {}, id: unknown = 1) {
	return new Request("https://x/mcp", {
		method: "POST",
		headers: { "Content-Type": "application/json", "MCP-Protocol-Version": V, "Mcp-Method": method, ...headers },
		body: JSON.stringify({ jsonrpc: "2.0", id, method, params: { _meta: META, ...params } }),
	});
}
async function send(req: Request, owner: string | null = null) {
	const r = await handleHttp(req, localBackend(), owner);
	return { status: r.status, body: r.status === 202 ? null : ((await r.json()) as any) };
}

test("server/discover advertises versions, tools capability, instructions, cache hints and server info", async () => {
	const { status, body } = await send(request("server/discover"));
	assert.equal(status, 200);
	const r = body.result;
	assert.deepEqual(r.supportedVersions, ["2026-07-28", "2025-11-25", "2025-06-18", "2025-03-26"]);
	assert.deepEqual(r.capabilities, { tools: {} });
	assert.match(r.instructions, /control-plane engine/);
	assert.equal(r.resultType, "complete");
	assert.equal(r.ttlMs, 3_600_000);
	assert.equal(r.cacheScope, "public");
	const info = r._meta["io.modelcontextprotocol/serverInfo"];
	assert.equal(info.name, "rigor-x");
	assert.equal(info.title, "Aetherica");
	assert.equal(info.version, "0.4.0.dev0");
	// Icons (MCP 2025-11-25 Implementation.icons): absolute URLs on the request's origin, PNG, square sizes.
	assert.deepEqual(info.icons.map((i: any) => i.sizes[0]), ["48x48", "96x96", "192x192", "448x448"]);
	for (const icon of info.icons) {
		assert.match(icon.src, /^https:\/\/x\/icon-\d+\.png$/);
		assert.equal(icon.mimeType, "image/png");
	}
});

test("tools/list and tools/call in the stateless era", async () => {
	const list = await send(request("tools/list"));
	assert.equal(list.status, 200);
	assert.equal(list.body.result.tools.length, 19);
	assert.equal(list.body.result.resultType, "complete");
	const routed = await send(request("tools/call", { name: "rigorx_route", arguments: { task: "Debug this code" } }, { "Mcp-Name": "rigorx_route" }));
	assert.equal(routed.status, 200);
	assert.equal(routed.body.result.structuredContent.profile.intent, "TECHNICAL");
	assert.equal(routed.body.result.resultType, "complete");
	assert.ok(routed.body.result._meta["io.modelcontextprotocol/serverInfo"]);
	const anonymous = await send(request("tools/call", { name: "rigorx_start_run", arguments: { task: "x" } }, { "Mcp-Name": "rigorx_start_run" }));
	assert.equal(anonymous.body.result.isError, true);
	const owned = await send(request("tools/call", { name: "rigorx_start_run", arguments: { task: "a stateless run" } }, { "Mcp-Name": "rigorx_start_run" }), "google:a");
	assert.equal(owned.body.result.structuredContent.status, "IN_PROGRESS");
});

test("ladder rung 1: the per-request envelope is required (-32602, HTTP 400)", async () => {
	const noMeta = new Request("https://x/mcp", { method: "POST", headers: { "MCP-Protocol-Version": V, "Mcp-Method": "tools/list" },
		body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }) });
	const a = await send(noMeta);
	assert.equal(a.status, 400);
	assert.equal(a.body.error.code, -32602);
	const partial = new Request("https://x/mcp", { method: "POST", headers: { "MCP-Protocol-Version": V, "Mcp-Method": "tools/list" },
		body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: { _meta: { "io.modelcontextprotocol/protocolVersion": V } } }) });
	const b = await send(partial);
	assert.equal(b.body.error.code, -32602);
	assert.match(b.body.error.message, /clientCapabilities/);
});

test("ladder rung 2: headers must agree with the body (-32020, HTTP 400)", async () => {
	const method = await send(request("tools/list", {}, { "Mcp-Method": "tools/call" }));
	assert.equal(method.status, 400);
	assert.equal(method.body.error.code, -32020);
	const name = await send(request("tools/call", { name: "rigorx_route", arguments: { task: "t" } }, { "Mcp-Name": "rigorx_profile" }));
	assert.equal(name.body.error.code, -32020);
	const missingName = await send(request("tools/call", { name: "rigorx_route", arguments: { task: "t" } }));
	assert.equal(missingName.body.error.code, -32020);
	// The envelope says one version, the header another: a mismatch, reported before the version check.
	const versionReq = new Request("https://x/mcp", { method: "POST", headers: { "MCP-Protocol-Version": "2099-01-01", "Mcp-Method": "tools/list" },
		body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: { _meta: META } }) });
	assert.equal((await send(versionReq)).body.error.code, -32020);
	// Base64-encoded Mcp-Name values are decoded before comparison.
	const encoded = "=?base64?" + btoa("rigorx_route") + "?=";
	assert.equal((await send(request("tools/call", { name: "rigorx_route", arguments: { task: "t" } }, { "Mcp-Name": encoded }))).status, 200);
	assert.equal((await send(request("tools/call", { name: "rigorx_route", arguments: { task: "t" } }, { "Mcp-Name": "=?base64?%%%?=" }))).body.error.code, -32020);
});

test("ladder rung 3: an unsupported version gets -32022 naming the supported ones (HTTP 400)", async () => {
	const meta = { ...META, "io.modelcontextprotocol/protocolVersion": "2099-01-01" };
	const req = new Request("https://x/mcp", { method: "POST", headers: { "MCP-Protocol-Version": "2099-01-01", "Mcp-Method": "tools/list" },
		body: JSON.stringify({ jsonrpc: "2.0", id: 7, method: "tools/list", params: { _meta: meta } }) });
	const { status, body } = await send(req);
	assert.equal(status, 400);
	assert.equal(body.id, 7);
	assert.equal(body.error.code, -32022);
	assert.deepEqual(body.error.data, { supported: ["2026-07-28"], requested: "2099-01-01" });
});

test("removed methods are 404 -32601; notifications get 202; the handshake era is unchanged", async () => {
	for (const m of ["initialize", "ping", "logging/setLevel"]) {
		const r = await send(request(m));
		assert.equal(r.status, 404, m);
		assert.equal(r.body.error.code, -32601, m);
	}
	const note = new Request("https://x/mcp", { method: "POST", headers: { "MCP-Protocol-Version": V, "Mcp-Method": "notifications/cancelled" },
		body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/cancelled", params: { _meta: META } }) });
	assert.equal((await send(note)).status, 202);
	const legacy = await send(new Request("https://x/mcp", { method: "POST",
		body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25" } }) }));
	assert.equal(legacy.status, 200);
	assert.equal(legacy.body.result.protocolVersion, "2025-11-25");
	const legacyCall = await send(new Request("https://x/mcp", { method: "POST", headers: { "MCP-Protocol-Version": "2025-11-25" },
		body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }) }));
	assert.equal(legacyCall.body.result.tools.length, 19);
	assert.equal(legacyCall.body.result.resultType, undefined);
});
