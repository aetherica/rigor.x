// Dependency-free MCP server over Streamable HTTP. Both protocol eras are served (WS32 P0.2):
// - Handshake era (2025-11-25, 2025-06-18, 2025-03-26): initialize, then requests; an
//   MCP-Protocol-Version header, when present, must name one of these versions.
// - Stateless era (2026-07-28): no initialize; every request carries its protocol version and
//   client capabilities in params._meta, mirrored by the MCP-Protocol-Version, Mcp-Method and
//   (for tools/call) Mcp-Name headers; server/discover advertises the server. A request whose
//   MCP-Protocol-Version header is not a handshake version takes this path, which validates it
//   in the order of the reference SDK (mcp 2.3.0, mcp/shared/inbound.py): envelope (-32602),
//   headers (-32020), supported version (-32022 with data.supported).
// The first 12 tools match src/rigorx/mcp_server.py (frozen Python reference); rigorx_list_runs
// and rigorx_usage are Worker-only. The server keeps no session: every POST is answered with a
// single JSON response, which the Streamable HTTP transport allows.

import { EngineError } from "./engine.ts";
import type { Json, JsonObject } from "./pipeline.ts";

export const SERVER_VERSION = "0.4.0.dev0";
/** Handshake-era versions (initialize). */
export const SUPPORTED_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26"];
/** Stateless-era versions (per-request _meta envelope). */
export const MODERN_VERSIONS = ["2026-07-28"];
const LATEST = SUPPORTED_VERSIONS[0]!;
const SERVER_INFO = { name: "rigor-x", title: "RIGOR-X", version: SERVER_VERSION };

// Reserved _meta keys and error codes of the 2026-07-28 revision (reference: mcp-types 2.3.0).
export const META_PROTOCOL_VERSION = "io.modelcontextprotocol/protocolVersion";
export const META_CLIENT_CAPABILITIES = "io.modelcontextprotocol/clientCapabilities";
export const META_CLIENT_INFO = "io.modelcontextprotocol/clientInfo";
export const META_SERVER_INFO = "io.modelcontextprotocol/serverInfo";
export const INVALID_PARAMS = -32602;
export const HEADER_MISMATCH = -32020;
export const UNSUPPORTED_PROTOCOL_VERSION = -32022;
/** Tool descriptions change only with a deploy; clients may reuse tools/list and server/discover for an hour. */
export const LIST_TTL_MS = 3_600_000;

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
		description: "Current stage, stage statuses, guidance, evidence count, the 10 most recent reported actions (with the total and the IDs of unresolved failures) and re-entry budget.",
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
	{ name: "rigorx_list_runs", title: "List your runs", hint: "read", operation: "list_runs",
		description: "Your runs, newest first: run_id, status, current stage, intent, level, created and updated times. limit 1-50 (default 20); pass next_cursor as cursor for the next page.",
		properties: { limit: { anyOf: [{ type: "integer", minimum: 1, maximum: 50 }, { type: "null" }], default: null }, cursor: optStr() }, required: [] },
	{ name: "rigorx_usage", title: "Usage and limits", hint: "read", operation: "usage",
		description: "Today's tool calls, new runs and stored runs against your limits (UTC day), when they reset, and the storage your account uses. Limits are provisional.",
		properties: {}, required: [] },
	{ name: "rigorx_profile", title: "Account profile", hint: "read", operation: "profile",
		description: "Stable, opaque identifier of the signed-in account (random, not derived from your Google account).",
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
const rpcError = (id: unknown, code: number, message: string, data?: JsonObject): JsonObject =>
	({ jsonrpc: "2.0", id: (id ?? null) as Json, error: data ? { code, message, data } : { code, message } });
const rpcResult = (id: unknown, result: JsonObject): JsonObject => ({ jsonrpc: "2.0", id: id as Json, result });

function toolResult(data: JsonObject): JsonObject {
	return { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: data, isError: false };
}
function toolError(message: string): JsonObject {
	return { content: [{ type: "text", text: message }], isError: true };
}

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

// ---------------------------------------------------------------- stateless era (2026-07-28)

/** HTTP status for a JSON-RPC error code on the stateless path (reference SDK table). */
function modernStatus(response: JsonObject): number {
	const error = response.error as { code?: number } | undefined;
	if (!error) return 200;
	if (error.code === -32601) return 404;
	if ([-32700, -32600, INVALID_PARAMS, HEADER_MISMATCH, -32021, UNSUPPORTED_PROTOCOL_VERSION].includes(error.code ?? 0)) return 400;
	return 200;
}

/** Inverse of the header codec: `=?base64?<payload>?=` carries UTF-8; anything else is verbatim. */
export function decodeHeaderValue(value: string | null): string | null {
	if (value === null) return null;
	const m = /^=\?base64\?(.*)\?=$/.exec(value);
	if (!m) return value;
	try {
		const bytes = Uint8Array.from(atob(m[1]!), (c) => c.charCodeAt(0));
		return new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
	} catch {
		return null; // a corrupt header never matches a body value by accident
	}
}

/** Validate one stateless-era request; returns an error response or null when it may be served. */
export function classifyModern(body: Record<string, unknown>, headers: Headers): JsonObject | null {
	const id = body.id;
	const params = body.params;
	const meta = params && typeof params === "object" && !Array.isArray(params) ? (params as Record<string, unknown>)._meta : undefined;
	if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
		return rpcError(id, INVALID_PARAMS, `params._meta must be an object carrying the required '${META_PROTOCOL_VERSION}' and '${META_CLIENT_CAPABILITIES}' envelope keys`);
	}
	const m = meta as Record<string, unknown>;
	const missing = [META_PROTOCOL_VERSION, META_CLIENT_CAPABILITIES].filter((k) => !(k in m));
	if (missing.length) return rpcError(id, INVALID_PARAMS, `params._meta is missing the required envelope key(s): ${missing.join(", ")}`);
	const version = m[META_PROTOCOL_VERSION];
	if (headers.get("MCP-Protocol-Version") !== version) {
		return rpcError(id, HEADER_MISMATCH, "MCP-Protocol-Version header does not match the request envelope's protocol version");
	}
	if (headers.get("Mcp-Method") !== body.method) return rpcError(id, HEADER_MISMATCH, "Mcp-Method header does not match the request body's method");
	if (body.method === "tools/call") {
		const name = (params as Record<string, unknown>).name;
		if (name !== undefined && name !== null && decodeHeaderValue(headers.get("Mcp-Name")) !== name) {
			return rpcError(id, HEADER_MISMATCH, "Mcp-Name header does not match the request body's 'name' parameter");
		}
	}
	if (typeof version !== "string") return rpcError(id, INVALID_PARAMS, "the protocol-version envelope value must be a string");
	if (!MODERN_VERSIONS.includes(version)) {
		return rpcError(id, UNSUPPORTED_PROTOCOL_VERSION, "Unsupported protocol version", { supported: [...MODERN_VERSIONS], requested: version });
	}
	return null;
}

const withServerInfo = (result: JsonObject): JsonObject => {
	const meta = result._meta && typeof result._meta === "object" && !Array.isArray(result._meta) ? (result._meta as JsonObject) : {};
	return { ...result, _meta: { ...meta, [META_SERVER_INFO]: { ...SERVER_INFO } } };
};

/** Serve one validated stateless-era request. */
export async function handleModernMessage(body: Record<string, unknown>, backend: EngineBackend, owner: string | null): Promise<JsonObject> {
	const id = body.id;
	switch (body.method) {
		case "server/discover":
			return rpcResult(id, withServerInfo({
				supportedVersions: [...MODERN_VERSIONS, ...SUPPORTED_VERSIONS],
				capabilities: { tools: {} },
				instructions: SERVER_INSTRUCTIONS,
				resultType: "complete", ttlMs: LIST_TTL_MS, cacheScope: "public",
			}));
		case "tools/list":
			return rpcResult(id, withServerInfo({ tools: toolList(), resultType: "complete", ttlMs: LIST_TTL_MS, cacheScope: "public" }));
		case "tools/call": {
			// Same dispatch as the handshake era; the result gains resultType and the server stamp.
			const legacy = await handleMessage({ jsonrpc: "2.0", id: id as Json, method: "tools/call", params: body.params as Json }, backend, owner);
			if (legacy && legacy.result) return rpcResult(id, withServerInfo({ ...(legacy.result as JsonObject), resultType: "complete" }));
			return legacy ?? rpcError(id, -32603, "Internal error");
		}
		default:
			// initialize, ping and the logging/subscription methods do not exist in this revision.
			return rpcError(id, -32601, `Method not found: ${String(body.method)}`);
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
	const version = request.headers.get("MCP-Protocol-Version");
	if (version !== null && !SUPPORTED_VERSIONS.includes(version)) {
		// Stateless era: anything that is not a handshake version is validated here (unknown values
		// get a structured -32022, which tells an auto-negotiating client what this server speaks).
		if (typeof body !== "object" || body === null) return Response.json(rpcError(null, -32600, "Invalid Request"), { status: 400 });
		const b = body as Record<string, unknown>;
		if (b.jsonrpc !== "2.0" || typeof b.method !== "string") return Response.json(rpcError(b.id, -32600, "Invalid Request"), { status: 400 });
		if (!("id" in b) || b.id === undefined) return new Response(null, { status: 202 }); // notifications: acknowledged, no reply
		const rejected = classifyModern(b, request.headers);
		const response = rejected ?? await handleModernMessage(b, backend, owner);
		return Response.json(response, { status: modernStatus(response) });
	}
	// Handshake era (no header before initialize, or a negotiated handshake version).
	const response = await handleMessage(body, backend, owner);
	if (response === null) return new Response(null, { status: 202 });
	return Response.json(response);
}
