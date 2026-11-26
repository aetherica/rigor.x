import { test } from "node:test";
import assert from "node:assert/strict";
import { dispatch, EngineError, HostEngine } from "../src/engine.ts";
import { handleHttp, handleMessage, TOOLS, type EngineBackend } from "../src/mcp.ts";
import { DurableObjectRunStore } from "../src/store.ts";
import { memorySql } from "./sqlite-fake.ts";
import { localBackend } from "./backend.ts";

const call = (id: number, name: string, args: Record<string, unknown> = {}) =>
	({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } });

test("initialize negotiates a supported version and advertises tools", async () => {
	const b = localBackend();
	const r = await handleMessage({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } } }, b, null);
	assert.equal((r!.result as any).protocolVersion, "2025-06-18");
	assert.deepEqual((r!.result as any).capabilities, { tools: { listChanged: false } });
	const latest = await handleMessage({ jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: "2099-01-01" } }, b, null);
	assert.equal((latest!.result as any).protocolVersion, "2025-11-25");
});

test("notifications get no response; discover and unknown methods are method-not-found", async () => {
	const b = localBackend();
	assert.equal(await handleMessage({ jsonrpc: "2.0", method: "notifications/initialized" }, b, null), null);
	assert.equal(((await handleMessage({ jsonrpc: "2.0", id: 3, method: "server/discover" }, b, null))!.error as any).code, -32601);
	assert.equal(((await handleMessage({ jsonrpc: "2.0", id: 4, method: "nope" }, b, null))!.error as any).code, -32601);
	assert.equal(((await handleMessage({ id: 5, method: "ping" }, b, null))!.error as any).code, -32600);
});

test("tools/list is complete, ordered and annotated (Python's 12 plus the Worker-only run tools)", async () => {
	const r = await handleMessage({ jsonrpc: "2.0", id: 1, method: "tools/list" }, localBackend(), null);
	const tools = (r!.result as any).tools as any[];
	assert.deepEqual(tools.map((t) => t.name), [
		"rigorx_route", "rigorx_resolve_commands", "rigorx_start_run", "rigorx_get_run", "rigorx_submit_stage",
		"rigorx_record_evidence", "rigorx_report_action", "rigorx_verify", "rigorx_reenter", "rigorx_cancel_run",
		"rigorx_delete_run", "rigorx_list_runs", "rigorx_usage", "rigorx_compute", "rigorx_check_source",
		"rigorx_memory_topic", "rigorx_memory_write", "rigorx_memory_recall", "rigorx_memory_delete", "rigorx_humor_policy", "rigorx_profile",
	]);
	assert.deepEqual(tools.map((t) => t.name), TOOLS.map((t) => t.name));
	const readOnly = new Set(["rigorx_route", "rigorx_resolve_commands", "rigorx_get_run", "rigorx_list_runs", "rigorx_usage", "rigorx_memory_recall", "rigorx_humor_policy", "rigorx_profile"]);
	const destructive = new Set(["rigorx_cancel_run", "rigorx_delete_run", "rigorx_memory_topic", "rigorx_memory_delete"]);
	for (const t of tools) {
		assert.ok(t.title && t.description, t.name);
		assert.equal(t.annotations.openWorldHint, t.name === "rigorx_check_source", t.name); // only the source check fetches from the internet
		assert.equal(t.annotations.readOnlyHint, readOnly.has(t.name));
		if (!readOnly.has(t.name)) assert.equal(t.annotations.destructiveHint, destructive.has(t.name));
		assert.equal(t.inputSchema.type, "object");
	}
	assert.deepEqual(tools.find((t) => t.name === "rigorx_profile")._meta, { "openai/profile": true });
});

test("anonymous callers get stateless tools only; owners run the engine", async () => {
	const b = localBackend();
	const routed = await handleMessage(call(1, "rigorx_route", { task: "Debug this code" }), b, null);
	assert.equal((routed!.result as any).structuredContent.profile.intent, "TECHNICAL");
	const denied = await handleMessage(call(2, "rigorx_start_run", { task: "x" }), b, null);
	assert.equal((denied!.result as any).isError, true);
	assert.match((denied!.result as any).content[0].text, /^AUTH_REQUIRED/);
	const started = await handleMessage(call(3, "rigorx_start_run", { task: "Explain gravity" }), b, "owner-a");
	const runId = (started!.result as any).structuredContent.run_id;
	assert.match(runId, /^rx_[A-Za-z0-9_-]{32}$/);
	const other = await handleMessage(call(4, "rigorx_get_run", { run_id: runId }), b, "owner-b");
	assert.match((other!.result as any).content[0].text, /^RUN_NOT_FOUND/);
	const wrong = await handleMessage(call(5, "rigorx_submit_stage", { run_id: runId, stage: "CLASSIFY", outcome: "completed", summary: "x" }), b, "owner-a");
	assert.match((wrong!.result as any).content[0].text, /^STAGE_CONFLICT/);
	const missing = await handleMessage(call(6, "rigorx_get_run", {}), b, "owner-a");
	assert.match((missing!.result as any).content[0].text, /^INVALID_REQUEST/);
	const profile = await handleMessage(call(7, "rigorx_profile"), b, "owner-a");
	assert.equal((profile!.result as any).structuredContent.id.length, 32);
	const unknown = await handleMessage(call(8, "nope"), b, "owner-a");
	assert.equal((unknown!.error as any).code, -32602);
});

test("HTTP layer: POST only, 202 for notifications, version and batch checks", async () => {
	const b = localBackend();
	const post = (body: unknown, headers: Record<string, string> = {}) =>
		new Request("https://x/mcp", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
	assert.equal((await handleHttp(new Request("https://x/mcp"), b, null)).status, 405);
	assert.equal((await handleHttp(post({ jsonrpc: "2.0", method: "notifications/initialized" }), b, null)).status, 202);
	assert.equal((await handleHttp(post({ jsonrpc: "2.0", id: 1, method: "ping" }, { "MCP-Protocol-Version": "1999-01-01" }), b, null)).status, 400);
	// A stateless-era request without the per-request envelope is rejected (details: modern.test.ts).
	const probe = await handleHttp(post({ jsonrpc: "2.0", id: 2, method: "server/discover" }, { "MCP-Protocol-Version": "2026-07-28" }), b, null);
	assert.equal(probe.status, 400);
	assert.equal(((await probe.json()) as any).error.code, -32602);
	assert.equal((await handleHttp(post([{ jsonrpc: "2.0", id: 1, method: "ping" }]), b, null)).status, 400);
	const bad = new Request("https://x/mcp", { method: "POST", body: "{not json" });
	assert.equal((await handleHttp(bad, b, null)).status, 400);
});
