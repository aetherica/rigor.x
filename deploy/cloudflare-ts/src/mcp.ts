// Dependency-free MCP server over Streamable HTTP (handshake era, protocol 2025-11-25
// and earlier). Same 12 tools, titles, descriptions and annotations as
// src/rigorx/mcp_server.py. The server keeps no session: every POST is answered
// with a single JSON response, which the Streamable HTTP transport allows.
// `server/discover` (2026-07-28) is answered with "method not found", which makes
// modern clients fall back to `initialize`.

import { createHash } from "node:crypto";
import { EngineError } from "./engine.ts";
import type { Json, JsonObject } from "./pipeline.ts";

export const SERVER_VERSION = "0.4.0.dev0";
export const SUPPORTED_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26"];
const LATEST = SUPPORTED_VERSIONS[0]!;

export const SERVER_INSTRUCTIONS =
	"RIGOR-X is a control-plane engine for rigorous multi-step work. For a non-trivial task, call " +
	"rigorx_start_run, then work through the stages in order with rigorx_submit_stage, following the " +
	"guidance each response returns. Record sources with rigorx_record_evidence and actions you take with " +
	"other tools with rigorx_report_action. Pass the gate with rigorx_verify before deciding. RIGOR-X checks " +
	"structure and completeness, not truth: report results honestly, including failures. " +
	"rigorx_route and rigorx_resolve_commands work without a run.";

/** Engine operations the MCP layer needs; implemented locally or over RPC to a Durable Object. */
export interface EngineBackend {
	route(task: unknown): JsonObject;
	resolveCommands(text: unknown): JsonObject;
	run(ownerId: string, operation: string, args: JsonObject): Promise<JsonObject>;
}

type Hint = "read" | "additive" | "destructive";
interface ToolSpec {
	name: string;
	title: string;
	description: string;
	hint: Hint;
	properties: Record<string, JsonObject>;
	required: string[];
	/** Engine operation for run tools; omitted for stateless tools. */
	operation?: string;
	meta?: JsonObject;
	outputSchema?: JsonObject;
}

const str = (description?: string): JsonObject => (description ? { type: "string", description } : { type: "string" });
const optStr = (description?: string): JsonObject => ({ anyOf: [{ type: "string" }, { type: "null" }], default: null, ...(description ? { description } : {}) });

export const TOOLS: ToolSpec[] = [
	{ name: "rigorx_route", title: "Suggest analysis route", hint: "read",
		description: "Suggest intent, intensity level (L01-L06), analysis modes and methods for a task. Heuristic; stores nothing.",
		properties: { task: str() }, required: ["task"] },
	{ name: "rigorx_resolve_commands", title: "Resolve slash commands", hint: "read",
		description: "Resolve leading slash commands in text against the RIGOR-X catalogue. Stores nothing.",
		properties: { text: str() }, required: ["text"] },
	{ name: "rigorx_start_run", title: "Start a RIGOR-X run", hint: "additive", operation: "start_run",
		description: "Start a run for a task. Returns run_id, the first stage and what it requires. The task text is stored only as a digest.",
		properties: { task: str() }, required: ["task"] },
	{ name: "rigorx_get_run", title: "Get run state", hint: "read", operation: "get_run",
		description: "Current stage, stage statuses, guidance, evidence count, reported actions and re-entry budget.",
		properties: { run_id: str() }, required: ["run_id"] },
	{ name: "rigorx_submit_stage", title: "Submit stage result", hint: "additive", operation: "submit_stage",
		description: "Submit the result of the current stage. outcome: completed, partial, blocked or skipped (partial, blocked and skipped need a reason of at least 15 characters and 3 words). A completed stage needs a summary of what was done in it: at least 40 characters and 6 words, not a repeat of another stage's summary. VERIFICATION is passed only with rigorx_verify.",
		properties: { run_id: str(), stage: str(), outcome: str(), summary: str(), reason: optStr() }, required: ["run_id", "stage", "outcome", "summary"] },
	{ name: "rigorx_record_evidence", title: "Record evidence", hint: "additive", operation: "record_evidence",
		description: "Record a source (URL, document ID, receipt) and the claim it supports (at least 15 characters and 3 words). Returns an evidence_id (ev-N) to cite in rigorx_verify. IDs are ledger sequence numbers, so they are not consecutive.",
		properties: { run_id: str(), source_ref: str(), claim: str(), evidence_type: { type: "string", default: "SOURCE" } }, required: ["run_id", "source_ref", "claim"] },
	{ name: "rigorx_report_action", title: "Report a host action", hint: "additive", operation: "report_action",
		description: "Report an action you performed with another tool. status: EXECUTED, FAILED or BLOCKED. Use resolves=<ev-N> when a later action fixes an earlier failure. Recorded as host-reported, not verified.",
		properties: { run_id: str(), tool_name: str(), status: str(), receipt_ref: optStr(), resolves: optStr() }, required: ["run_id", "tool_name", "status"] },
	{ name: "rigorx_verify", title: "Run verification gate", hint: "additive", operation: "verify",
		description: "Run the deterministic gate. criteria: list of {criterion, passed, evidence_ids}; each criterion at least 15 characters and 3 words. Every passed criterion must cite evidence IDs, including at least one that no other criterion cites. Result is 'structurally verified' at most, never a truth guarantee.",
		properties: { run_id: str(), criteria: { type: "array", items: { type: "object", additionalProperties: true } } }, required: ["run_id", "criteria"] },
	{ name: "rigorx_reenter", title: "Return to an earlier stage", hint: "additive", operation: "reenter",
		description: "Return to the current or an earlier stage within the re-entry budget, for example after a failed verification.",
		properties: { run_id: str(), target_stage: str(), trigger: str(), reason: str() }, required: ["run_id", "target_stage", "trigger", "reason"] },
	{ name: "rigorx_cancel_run", title: "Cancel run", hint: "destructive", operation: "cancel_run",
		description: "Cancel one of your runs. A cancelled run cannot be resumed.",
		properties: { run_id: str(), reason: str() }, required: ["run_id", "reason"] },
	{ name: "rigorx_delete_run", title: "Delete run data", hint: "destructive", operation: "delete_run",
		description: "Permanently delete one of your runs and its ledger.",
		properties: { run_id: str() }, required: ["run_id"] },
	{ name: "rigorx_profile", title: "Account profile", hint: "read",
		description: "Stable, opaque identifier of the signed-in account.",
		properties: {}, required: [], meta: { "openai/profile": true },
		outputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } },
];

function annotations(hint: Hint): JsonObject {
	if (hint === "read") return { readOnlyHint: true, openWorldHint: false };
	return { readOnlyHint: false, destructiveHint: hint === "destructive", openWorldHint: false };
}

export function toolList(): Json[] {
	return TOOLS.map((t) => {
		const tool: JsonObject = {
			name: t.name,
			title: t.title,
			description: t.description,
			inputSchema: { type: "object", properties: t.properties, required: t.required },
			annotations: annotations(t.hint),
		};
		if (t.outputSchema) tool.outputSchema = t.outputSchema;
		if (t.meta) tool._meta = t.meta;
		return tool;
	});
}

// ---------------------------------------------------------------- JSON-RPC

interface RpcRequest { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: unknown }
const rpcError = (id: unknown, code: number, message: string): JsonObject =>
	({ jsonrpc: "2.0", id: (id ?? null) as Json, error: { code, message } });
const rpcResult = (id: unknown, result: JsonObject): JsonObject => ({ jsonrpc: "2.0", id: id as Json, result });

function toolResult(data: JsonObject): JsonObject {
	return { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: data, isError: false };
}
function toolError(message: string): JsonObject {
	return { content: [{ type: "text", text: message }], isError: true };
}

const opaqueId = (owner: string) => createHash("sha256").update(owner, "utf8").digest("hex").slice(0, 32);

/** Handle one JSON-RPC message; returns the response, or null for notifications. */
export async function handleMessage(message: unknown, backend: EngineBackend, owner: string | null): Promise<JsonObject | null> {
	if (typeof message !== "object" || message === null || Array.isArray(message)) return rpcError(null, -32600, "Invalid Request");
	const m = message as Partial<RpcRequest>;
	if (m.jsonrpc !== "2.0" || typeof m.method !== "string") return rpcError(m.id, -32600, "Invalid Request");
	const isNotification = !("id" in m) || m.id === undefined;
	if (isNotification) return null; // notifications/initialized, notifications/cancelled, ...
	const params = (m.params && typeof m.params === "object" && !Array.isArray(m.params) ? m.params : {}) as Record<string, unknown>;

	switch (m.method) {
		case "initialize": {
			const requested = typeof params.protocolVersion === "string" ? params.protocolVersion : LATEST;
			return rpcResult(m.id, {
				protocolVersion: SUPPORTED_VERSIONS.includes(requested) ? requested : LATEST,
				capabilities: { tools: { listChanged: false } },
				serverInfo: { name: "rigor-x", title: "RIGOR-X", version: SERVER_VERSION },
				instructions: SERVER_INSTRUCTIONS,
			});
		}
		case "ping":
			return rpcResult(m.id, {});
		case "tools/list":
			return rpcResult(m.id, { tools: toolList() });
		case "tools/call": {
			const name = params.name;
			const tool = TOOLS.find((t) => t.name === name);
			if (!tool) return rpcError(m.id, -32602, `Unknown tool: ${JSON.stringify(name)}`);
			const args = (params.arguments && typeof params.arguments === "object" && !Array.isArray(params.arguments) ? params.arguments : {}) as JsonObject;
			const missing = tool.required.filter((k) => args[k] === undefined || args[k] === null);
			if (missing.length) return rpcResult(m.id, toolError(`INVALID_REQUEST: missing required arguments: ${missing.join(", ")}`));
			try {
				if (tool.name === "rigorx_route") return rpcResult(m.id, toolResult(backend.route(args.task)));
				if (tool.name === "rigorx_resolve_commands") return rpcResult(m.id, toolResult(backend.resolveCommands(args.text)));
				if (!owner) return rpcResult(m.id, toolError("AUTH_REQUIRED: sign in to use this tool"));
				if (tool.name === "rigorx_profile") return rpcResult(m.id, toolResult({ id: opaqueId(owner) }));
				return rpcResult(m.id, toolResult(await backend.run(owner, tool.operation!, args)));
			} catch (e) {
				if (e instanceof EngineError) return rpcResult(m.id, toolError(`${e.code}: ${e.message}`));
				throw e;
			}
		}
		default:
			return rpcError(m.id, -32601, `Method not found: ${m.method}`);
	}
}

/** Streamable HTTP endpoint: POST only, JSON responses, no server-initiated stream. */
export async function handleHttp(request: Request, backend: EngineBackend, owner: string | null): Promise<Response> {
	if (request.method !== "POST") {
		return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
	}
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return Response.json(rpcError(null, -32700, "Parse error"), { status: 400 });
	}
	if (Array.isArray(body)) return Response.json(rpcError(null, -32600, "Batch requests are not supported"), { status: 400 });
	// A modern client probes with server/discover at its newest version; answer "method not found"
	// (see handleMessage) so it falls back to initialize. Other requests must use a supported version.
	const method = (body as { method?: unknown } | null)?.method;
	const version = request.headers.get("MCP-Protocol-Version");
	if (version && method !== "server/discover" && !SUPPORTED_VERSIONS.includes(version)) {
		return Response.json(rpcError((body as { id?: unknown }).id, -32600, `Unsupported protocol version: ${version}`), { status: 400 });
	}
	const response = await handleMessage(body, backend, owner);
	if (response === null) return new Response(null, { status: 202 });
	return Response.json(response);
}
