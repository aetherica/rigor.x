// Port of src/rigorx/host_engine.py: owner-scoped control-plane operations behind
// the plugin tools. Behaviour, error codes and stored layout match the Python
// engine; tests/parity fixtures keep the two in step.

import { createHash } from "node:crypto";
import { STAGE_ORDER, InvalidTransition, PipelineRun, isStage, type Json, type JsonObject, type PipelineEvent, type Stage } from "./pipeline.ts";
import { route } from "./router.ts";
import { RunNotFound, type RunStore } from "./store.ts";

export const ENGINE_PROTOCOL_VERSION = "1.0.0";
export const GATE_VERSION = "1.1.0";
const ACTION_EVIDENCE_TYPE = "HOST_REPORTED_ACTION";

export const STAGE_GUIDANCE: Record<Stage, string> = {
	CONTEXT: "Collect the context the task depends on: prior decisions, constraints, available tools, and what is missing. Submit a short summary.",
	INTENT: "State what the user actually wants, the expected output and the success criteria. Submit them as the summary.",
	KNOWLEDGE: "Identify the knowledge domains and known facts that apply, and what must still be looked up.",
	RESEARCH: "Acquire sources for anything that must be looked up. Record each source with rigorx_record_evidence. Skip with a reason if no research is needed.",
	ROUTING: "Choose which tools or methods will carry out the work and why. Note any capability that is unavailable.",
	REASONING: "Work out the answer or plan. Keep reasoning separate from actions: nothing is executed in this stage.",
	EXECUTION: "Perform the actions with your tools. Report each one with rigorx_report_action, including failures. Skip with a reason if nothing must be executed.",
	EVIDENCE: "Make sure every claim the answer depends on has recorded evidence. Record anything still missing.",
	VERIFICATION: "Call rigorx_verify with your success criteria. Each passed criterion must cite evidence IDs. Submitting this stage directly is not allowed.",
	DECISION: "Decide the final result using only verified material. State remaining limitations.",
	FEEDBACK: "Note what should change next time (gaps, failures, follow-ups). Completing this stage completes the run.",
};
const FAILED_GUIDANCE = "Verification failed: call rigorx_reenter to return to an earlier stage and fix the gaps.";
const NO_SKIP: ReadonlySet<Stage> = new Set(["VERIFICATION", "DECISION", "FEEDBACK"]);
const OUTCOMES = ["blocked", "completed", "partial", "skipped"];
const ACTION_STATUSES = ["BLOCKED", "EXECUTED", "FAILED"];
const EVIDENCE_ID = /^ev-[1-9][0-9]{0,6}$/;

export class EngineError extends Error {
	code = "ENGINE_ERROR";
	override name = "EngineError";
	constructor(message: string, code?: string) {
		super(message);
		if (code) this.code = code;
	}
}
const invalid = (m: string) => new EngineError(m, "INVALID_REQUEST");
const conflict = (m: string) => new EngineError(m, "STAGE_CONFLICT");
const limit = (m: string) => new EngineError(m, "LIMIT_EXCEEDED");
const notFound = () => new EngineError("Run not found", "RUN_NOT_FOUND");

const digest = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
/** Python `len(str)` counts code points; JS `.length` counts UTF-16 units. */
const chars = (text: string) => [...text].length;

/** Minimum substance for host-submitted text; mirrors TextPolicy in the Python engine. */
export interface TextPolicy {
	minSummaryChars: number;
	minSummaryWords: number;
	minNoteChars: number;
	minNoteWords: number;
	distinctSummaries: boolean;
}
export const DEFAULT_TEXT_POLICY: TextPolicy = { minSummaryChars: 40, minSummaryWords: 6, minNoteChars: 15, minNoteWords: 3, distinctSummaries: true };
export const RELAXED_TEXT_POLICY: TextPolicy = { minSummaryChars: 0, minSummaryWords: 0, minNoteChars: 0, minNoteWords: 0, distinctSummaries: false };

const words = (value: string) => value.split(/\s+/).filter((t) => /[\p{L}\p{N}]/u.test(t)).length;
const normalized = (value: string) => value.toLowerCase().split(/\s+/).filter(Boolean).join(" ");

function substantial(name: string, value: string, minChars: number, minWords: number, hint: string): void {
	const trimmed = value.trim();
	if (chars(trimmed) < minChars || words(trimmed) < minWords) {
		throw invalid(`${name} is too short: use at least ${minChars} characters and ${minWords} words (${hint})`);
	}
}

function text(name: string, value: unknown, maxChars: number, required = true): string {
	if ((value === undefined || value === null) && !required) return "";
	if (typeof value !== "string") throw invalid(`${name} must be text`);
	if (required && !value.trim()) throw invalid(`${name} is required`);
	if (chars(value) > maxChars) throw limit(`${name} exceeds ${maxChars} characters`);
	return value;
}

function newRunId(): string {
	const bytes = new Uint8Array(24);
	crypto.getRandomValues(bytes);
	let binary = "";
	for (const b of bytes) binary += String.fromCharCode(b);
	return "rx_" + btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

interface Action { id: string; tool_name: string; status: string; resolves?: string }

export interface EngineOptions {
	maxReentries?: number;
	maxEvidencePerRun?: number;
	maxTextChars?: number;
	maxRefChars?: number;
	maxCriteria?: number;
	textPolicy?: TextPolicy;
}

export class HostEngine {
	readonly maxReentries: number;
	readonly maxEvidencePerRun: number;
	readonly maxTextChars: number;
	readonly maxRefChars: number;
	readonly maxCriteria: number;
	readonly textPolicy: TextPolicy;

	private readonly store: RunStore;

	constructor(store: RunStore, options: EngineOptions = {}) {
		this.store = store;
		this.maxReentries = options.maxReentries ?? 6;
		this.maxEvidencePerRun = options.maxEvidencePerRun ?? 500;
		this.maxTextChars = options.maxTextChars ?? 20_000;
		this.maxRefChars = options.maxRefChars ?? 2_048;
		this.maxCriteria = options.maxCriteria ?? 50;
		this.textPolicy = options.textPolicy ?? DEFAULT_TEXT_POLICY;
	}

	// ---------------------------------------------------------------- stateless

	route(task: unknown): JsonObject {
		const t = text("task", task, this.maxTextChars);
		return { profile: route(t) as unknown as JsonObject, heuristic: true };
	}

	resolveCommands(value: unknown): JsonObject {
		text("text", value, this.maxTextChars);
		throw new EngineError("Slash-command catalogue is not loaded on this server");
	}

	// ---------------------------------------------------------------- run lifecycle

	startRun(ownerId: string, task: unknown): JsonObject {
		const owner = this.owner(ownerId);
		const t = text("task", task, this.maxTextChars);
		const profile = route(t);
		const run = new PipelineRun(newRunId(), this.maxReentries);
		run.beginStage();
		const meta: JsonObject = {
			engine_protocol_version: ENGINE_PROTOCOL_VERSION,
			task_sha256: digest(t),
			task_chars: chars(t),
			intent: profile.intent,
			level: profile.level,
			modes: profile.modes,
			verifications: [],
		};
		this.store.create(owner, run, meta);
		return this.view(run, meta);
	}

	getRun(ownerId: string, runId: unknown): JsonObject {
		const { run, meta } = this.load(ownerId, runId);
		return this.view(run, meta);
	}

	submitStage(ownerId: string, runId: unknown, args: { stage?: unknown; outcome?: unknown; summary?: unknown; reason?: unknown }): JsonObject {
		const stored = this.load(ownerId, runId);
		const { run, meta } = stored;
		const target = this.stage(args.stage);
		if (typeof args.outcome !== "string" || !OUTCOMES.includes(args.outcome)) throw invalid(`outcome must be one of ${JSON.stringify(OUTCOMES)}`);
		const summary = text("summary", args.summary, this.maxTextChars);
		this.activate(run);
		if (target !== run.current_stage) throw conflict(`Current stage is ${run.current_stage}, not ${target}`);
		if (target === "VERIFICATION") throw conflict("VERIFICATION is completed only through rigorx_verify");
		const norm = digest(normalized(summary));
		const resultRef = `summary:sha256:${digest(summary)}:norm:${norm}:chars:${chars(summary)}`;
		try {
			if (args.outcome === "completed") {
				this.checkSummary(run, target, summary, norm);
				run.completeStage(resultRef);
			} else if (args.outcome === "skipped") {
				if (NO_SKIP.has(target)) throw conflict(`${target} cannot be skipped`);
				run.skipStage(this.note("reason", args.reason));
			} else if (args.outcome === "partial") {
				run.markPartial(this.note("reason", args.reason));
			} else {
				run.markBlocked(this.note("reason", args.reason));
			}
		} catch (e) {
			if (e instanceof InvalidTransition) throw conflict(e.message);
			throw e;
		}
		this.advance(run);
		this.store.save(this.owner(ownerId), run, meta, stored.revision);
		return this.view(run, meta);
	}

	recordEvidence(ownerId: string, runId: unknown, args: { source_ref?: unknown; claim?: unknown; evidence_type?: unknown }): JsonObject {
		const stored = this.load(ownerId, runId);
		const { run, meta } = stored;
		const sourceRef = text("source_ref", args.source_ref, this.maxRefChars);
		const claim = text("claim", args.claim, this.maxTextChars);
		substantial("claim", claim, this.textPolicy.minNoteChars, this.textPolicy.minNoteWords, "state what this source supports");
		const evidenceType = text("evidence_type", args.evidence_type ?? "SOURCE", 64);
		if (!/^[A-Z][A-Z0-9_]{0,63}$/.test(evidenceType) || evidenceType === ACTION_EVIDENCE_TYPE) {
			throw invalid("evidence_type must be an upper-case identifier and not HOST_REPORTED_ACTION");
		}
		const event = this.capture(run, evidenceType, sourceRef, { claim_sha256: digest(claim), claim_chars: chars(claim) });
		this.store.save(this.owner(ownerId), run, meta, stored.revision);
		return { evidence_id: `ev-${event.sequence}`, stage: event.stage, ...this.view(run, meta) };
	}

	reportAction(ownerId: string, runId: unknown, args: { tool_name?: unknown; status?: unknown; receipt_ref?: unknown; resolves?: unknown }): JsonObject {
		const stored = this.load(ownerId, runId);
		const { run, meta } = stored;
		const toolName = text("tool_name", args.tool_name, 128);
		if (typeof args.status !== "string" || !ACTION_STATUSES.includes(args.status)) throw invalid(`status must be one of ${JSON.stringify(ACTION_STATUSES)}`);
		const receiptRef = text("receipt_ref", args.receipt_ref, this.maxRefChars, false);
		const details: JsonObject = { tool_name: toolName, status: args.status, verification: "HOST_REPORTED" };
		if (args.resolves !== undefined && args.resolves !== null) {
			const earlier = this.actions(run).find((a) => a.id === args.resolves);
			if (!earlier || earlier.status === "EXECUTED") throw invalid("resolves must reference an earlier FAILED or BLOCKED action");
			details.resolves = earlier.id;
		}
		const event = this.capture(run, ACTION_EVIDENCE_TYPE, receiptRef || `host-action:${toolName}`, details);
		this.store.save(this.owner(ownerId), run, meta, stored.revision);
		return { action_id: `ev-${event.sequence}`, ...this.view(run, meta) };
	}

	verify(ownerId: string, runId: unknown, criteria: unknown): JsonObject {
		const stored = this.load(ownerId, runId);
		const { run, meta } = stored;
		this.activate(run);
		if (run.current_stage !== "VERIFICATION") throw conflict(`Current stage is ${run.current_stage}, not VERIFICATION`);
		const { checks, recorded } = this.gate(run, meta, criteria);
		const passed = checks.every((c) => c.passed === true);
		run.completeStage(`gate:${GATE_VERSION}:${passed ? "pass" : "fail"}`, passed);
		(meta.verifications as Json[]).push({ gate_version: GATE_VERSION, passed, checks, criteria: recorded });
		this.advance(run);
		this.store.save(this.owner(ownerId), run, meta, stored.revision);
		return { passed, wording: passed ? "structurally verified" : "not verified", checks, ...this.view(run, meta) };
	}

	reenter(ownerId: string, runId: unknown, args: { target_stage?: unknown; trigger?: unknown; reason?: unknown }): JsonObject {
		const stored = this.load(ownerId, runId);
		const { run, meta } = stored;
		const target = this.stage(args.target_stage);
		try {
			run.reenter(target, text("trigger", args.trigger, this.maxRefChars), text("reason", args.reason, this.maxRefChars));
		} catch (e) {
			if (e instanceof InvalidTransition) throw conflict(e.message);
			throw e;
		}
		run.beginStage();
		this.store.save(this.owner(ownerId), run, meta, stored.revision);
		return this.view(run, meta);
	}

	cancelRun(ownerId: string, runId: unknown, reason: unknown): JsonObject {
		const stored = this.load(ownerId, runId);
		const { run, meta } = stored;
		try {
			run.cancel(text("reason", reason, this.maxRefChars));
		} catch (e) {
			if (e instanceof InvalidTransition) throw conflict(e.message);
			throw e;
		}
		this.store.save(this.owner(ownerId), run, meta, stored.revision);
		return this.view(run, meta);
	}

	deleteRun(ownerId: string, runId: unknown): JsonObject {
		const owner = this.owner(ownerId);
		const id = this.runId(runId);
		try {
			this.store.delete(owner, id);
		} catch (e) {
			if (e instanceof RunNotFound) throw notFound();
			throw e;
		}
		return { run_id: id, deleted: true };
	}

	// ---------------------------------------------------------------- verification gate

	private gate(run: PipelineRun, meta: JsonObject, criteria: unknown): { checks: JsonObject[]; recorded: JsonObject[] } {
		if (!Array.isArray(criteria)) throw invalid("criteria must be a list");
		if (criteria.length > this.maxCriteria) throw limit(`At most ${this.maxCriteria} criteria are allowed`);
		const evidence = new Set(this.evidence(run).map((e) => e.id));
		const actions = this.actions(run);
		const allIds = new Set([...evidence, ...actions.map((a) => a.id)]);
		const checks: JsonObject[] = [];

		const before = STAGE_ORDER.slice(0, STAGE_ORDER.indexOf("VERIFICATION"));
		const open = before.filter((s) => !["COMPLETED", "SKIPPED_WITH_REASON"].includes(run.stage_status[s]));
		checks.push({ check: "prior_stages_closed", passed: open.length === 0, detail: open });

		if (meta.intent === "RESEARCH") checks.push({ check: "research_has_sources", passed: evidence.size > 0, detail: evidence.size });
		if (meta.intent === "EXECUTION") {
			const resolved = new Set(actions.filter((a) => a.resolves && a.status === "EXECUTED").map((a) => a.resolves as string));
			const unresolved = actions.filter((a) => a.status !== "EXECUTED" && !resolved.has(a.id)).map((a) => a.id);
			checks.push({ check: "execution_has_actions", passed: actions.length > 0, detail: actions.length });
			checks.push({ check: "no_unresolved_failed_actions", passed: unresolved.length === 0, detail: unresolved });
		}

		const recorded: JsonObject[] = [];
		const problems: string[] = [];
		const dangling: string[] = [];
		const cited: [number, Set<string>][] = [];
		criteria.forEach((item: unknown, index: number) => {
			if (typeof item !== "object" || item === null || Array.isArray(item)) throw invalid(`criteria[${index}] must be an object`);
			const c = item as Record<string, unknown>;
			const criterion = this.note(`criteria[${index}].criterion`, c.criterion, "state what must be true");
			const refs = c.evidence_ids ?? [];
			if (typeof c.passed !== "boolean") {
				problems.push(`criteria[${index}]: passed must be true or false`);
				return;
			}
			if (!Array.isArray(refs) || refs.some((r) => typeof r !== "string" || !EVIDENCE_ID.test(r))) {
				problems.push(`criteria[${index}]: evidence_ids must be a list of ev-N identifiers`);
				return;
			}
			if (c.passed && refs.length === 0) problems.push(`criteria[${index}]: a passed criterion must cite evidence`);
			if (c.passed && refs.length > 0) cited.push([index, new Set(refs as string[])]);
			if (!c.passed) problems.push(`criteria[${index}]: criterion reported as not met`);
			for (const r of refs as string[]) if (!allIds.has(r)) dangling.push(r);
			recorded.push({ criterion_sha256: digest(criterion), passed: c.passed, evidence_ids: [...(refs as string[])] });
		});
		checks.push({ check: "criteria_present", passed: criteria.length > 0, detail: criteria.length });
		checks.push({ check: "criteria_met_with_evidence", passed: problems.length === 0, detail: problems });
		checks.push({ check: "evidence_references_exist", passed: dangling.length === 0, detail: [...new Set(dangling)].sort() });
		// One source may support several criteria, but each passed criterion needs at least one
		// evidence ID of its own: citing the same record for everything does not pass the gate.
		const shared: string[] = [];
		for (const [index, refs] of cited) {
			const others = new Set(cited.filter(([i]) => i !== index).flatMap(([, r]) => [...r]));
			if (![...refs].some((r) => !others.has(r))) {
				shared.push(`criteria[${index}]: cites no evidence of its own (every cited ID is also cited by another criterion)`);
			}
		}
		checks.push({ check: "criteria_have_own_evidence", passed: shared.length === 0, detail: shared });
		return { checks, recorded };
	}

	// ---------------------------------------------------------------- helpers

	private note(name: string, value: unknown, hint = "explain why"): string {
		const t = text(name, value, this.maxRefChars);
		substantial(name, t, this.textPolicy.minNoteChars, this.textPolicy.minNoteWords, hint);
		return t;
	}

	private checkSummary(run: PipelineRun, target: Stage, summary: string, norm: string): void {
		const p = this.textPolicy;
		substantial("summary", summary, p.minSummaryChars, p.minSummaryWords, "describe what was done in this stage");
		if (!p.distinctSummaries) return;
		const marker = `:norm:${norm}:`;
		for (const e of run.events) {
			if (e.event_type === "STAGE_COMPLETED" && e.stage !== target && String(e.details.result_ref ?? "").includes(marker)) {
				throw invalid(`summary repeats the ${e.stage} summary: describe this stage's own work`);
			}
		}
	}

	private owner(ownerId: unknown): string {
		if (typeof ownerId !== "string" || !ownerId.trim() || chars(ownerId) > 256) throw invalid("A verified owner identity is required");
		return ownerId;
	}

	private runId(runId: unknown): string {
		if (typeof runId !== "string" || !/^rx_[A-Za-z0-9_-]{16,64}$/.test(runId)) throw notFound();
		return runId;
	}

	private stage(value: unknown): Stage {
		if (!isStage(value)) throw invalid(`Unknown stage: ${JSON.stringify(value)}`);
		return value;
	}

	private load(ownerId: unknown, runId: unknown) {
		const owner = this.owner(ownerId);
		try {
			return this.store.load(owner, this.runId(runId));
		} catch (e) {
			if (e instanceof RunNotFound) throw notFound();
			throw e;
		}
	}

	private activate(run: PipelineRun): void {
		if (run.status === "BLOCKED") {
			run.resumeBlocked();
			run.beginStage();
		} else if (run.status === "PARTIAL") {
			run.beginStage();
		}
		if (run.status !== "IN_PROGRESS") throw conflict(`Run is ${run.status}`);
	}

	private advance(run: PipelineRun): void {
		if (run.status === "IN_PROGRESS" && run.stage_status[run.current_stage] === "READY") run.beginStage();
	}

	private capture(run: PipelineRun, evidenceType: string, sourceRef: string, metadata: JsonObject): PipelineEvent {
		if (this.evidence(run).length + this.actions(run).length >= this.maxEvidencePerRun) {
			throw limit(`At most ${this.maxEvidencePerRun} evidence records per run`);
		}
		this.activate(run);
		return run.recordEvidence(evidenceType, sourceRef, metadata);
	}

	private evidenceEvents(run: PipelineRun): PipelineEvent[] {
		return run.events.filter((e) => e.event_type === "EVIDENCE_CAPTURED");
	}

	private evidence(run: PipelineRun): { id: string; type: string; stage: string }[] {
		return this.evidenceEvents(run)
			.filter((e) => e.details.evidence_type !== ACTION_EVIDENCE_TYPE)
			.map((e) => ({ id: `ev-${e.sequence}`, type: String(e.details.evidence_type), stage: e.stage }));
	}

	private actions(run: PipelineRun): Action[] {
		return this.evidenceEvents(run)
			.filter((e) => e.details.evidence_type === ACTION_EVIDENCE_TYPE)
			.map((e) => {
				const m = (e.details.metadata ?? {}) as JsonObject;
				const a: Action = { id: `ev-${e.sequence}`, tool_name: String(m.tool_name), status: String(m.status) };
				if (m.resolves) a.resolves = String(m.resolves);
				return a;
			});
	}

	private view(run: PipelineRun, meta: JsonObject): JsonObject {
		const active = run.status !== "COMPLETED" && run.status !== "CANCELLED";
		const verifications = (meta.verifications as Json[] | undefined) ?? [];
		let guidance: string | null = null;
		if (run.status === "VERIFICATION_FAILED") guidance = FAILED_GUIDANCE;
		else if (active) guidance = STAGE_GUIDANCE[run.current_stage];
		return {
			run_id: run.run_id,
			status: run.status,
			current_stage: active ? run.current_stage : null,
			stage_status: Object.fromEntries(STAGE_ORDER.map((s) => [s, run.stage_status[s]])),
			guidance,
			route: { intent: meta.intent ?? null, level: meta.level ?? null, modes: meta.modes ?? [] },
			reentries: { used: run.reentry_count, max: run.max_reentries },
			evidence_count: this.evidence(run).length,
			actions: this.actions(run) as unknown as Json[],
			verified: run.verification_accepted,
			last_verification: verifications.length ? verifications[verifications.length - 1]! : null,
		};
	}
}

// ---------------------------------------------------------------- RPC (port of engine_rpc.py)

export const RUN_OPERATIONS = new Set([
	"start_run", "get_run", "submit_stage", "record_evidence", "report_action", "verify", "reenter", "cancel_run", "delete_run",
]);

/** Durable Object side: run one allow-listed operation; always returns a JSON envelope string. */
export function dispatch(engine: HostEngine, ownerId: string, operation: string, payloadJson: string): string {
	try {
		if (!RUN_OPERATIONS.has(operation)) throw new EngineError(`Unknown operation: ${JSON.stringify(operation)}`);
		const p = JSON.parse(payloadJson) as unknown;
		if (typeof p !== "object" || p === null || Array.isArray(p)) throw new EngineError("Payload must be a JSON object");
		const a = p as Record<string, unknown>;
		const result = (() => {
			switch (operation) {
				case "start_run": return engine.startRun(ownerId, a.task);
				case "get_run": return engine.getRun(ownerId, a.run_id);
				case "submit_stage": return engine.submitStage(ownerId, a.run_id, a);
				case "record_evidence": return engine.recordEvidence(ownerId, a.run_id, a);
				case "report_action": return engine.reportAction(ownerId, a.run_id, a);
				case "verify": return engine.verify(ownerId, a.run_id, a.criteria);
				case "reenter": return engine.reenter(ownerId, a.run_id, a);
				case "cancel_run": return engine.cancelRun(ownerId, a.run_id, a.reason);
				default: return engine.deleteRun(ownerId, a.run_id);
			}
		})();
		return JSON.stringify({ ok: true, result });
	} catch (e) {
		if (e instanceof EngineError) return JSON.stringify({ ok: false, code: e.code, message: e.message });
		if (e instanceof SyntaxError) return JSON.stringify({ ok: false, code: "INVALID_REQUEST", message: "SyntaxError" });
		throw e;
	}
}
