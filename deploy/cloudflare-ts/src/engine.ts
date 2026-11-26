// RIGOR-X engine (canonical implementation, WS32 ADR-001/ADR-012): owner-scoped control-plane
// operations behind the plugin tools. New runs use engine protocol v2 (twelve stages, level policy,
// pre-registered requirements, coverage gate, plan graph, assumptions, OPTIMIZE loop guard).
// Runs of protocol v1 (eleven stages) are read-only: they can be read, listed and deleted.

import { PipelineRun, STAGE_ORDER as V1_STAGES } from "./pipeline.ts";
import {
	PROTOCOL_VERSION, STAGES, STAGE_GUIDANCE, STAKES_FLOOR, isMandatory, isStage, mandatoryStages, type Level, type Stage,
} from "./protocol.ts";
import { route } from "./router.ts";
import { resolvePrompt } from "./commands.ts";
import { RunNotFound, type RunStore } from "./store.ts";
import {
	DEFAULT_TEXT_POLICY, EngineError, chars, conflict, digest, invalid, jsonish, limit, normalized, notFound, object, quota,
	storedNote, substantial, text, type Json, type JsonObject, type TextPolicy,
} from "./text.ts";
import {
	STAGE_LEDGER_KEY, UNKNOWN_VALUES, capabilitiesContract, classifyContract, complexityContract, deliveryContract, evaluationContract,
	executeContract, methodsContract, optimizeContract, planContract, queryContract, stressContract, type ContractContext,
} from "./ledger.ts";
import { ACTION, COMPUTE, ENGINE_TYPES, GATE_VERSION, SOURCE_CHECK, parseAnswers, runGate, unresolvedActions } from "./gate.ts";
import { ComputeError, compute, type ComputeInput } from "./compute.ts";
import type { SourceCheck } from "./source.ts";
import { KINDS, TRUST, type DecidedBy, type MemoryStore } from "./memory.ts";
import {
	TERMINAL, advance, assertActive, cancel, completeStage, event, isRunState, newRun, optimizeOutcome,
	pauseStage, raiseLevel, reenter, resume, type EvidenceRecord, type RunState,
} from "./run.ts";

export { EngineError, DEFAULT_TEXT_POLICY, RELAXED_TEXT_POLICY, words, type TextPolicy } from "./text.ts";
export { GATE_VERSION } from "./gate.ts";
export const ENGINE_PROTOCOL_VERSION = PROTOCOL_VERSION;

const OUTCOMES = ["blocked", "completed", "partial", "skipped"];
const ACTION_STATUSES = ["BLOCKED", "EXECUTED", "FAILED"];
const FAILED_GUIDANCE = "Validation failed: call rigorx_reenter to return to an earlier stage, fix the gaps the checks name, and validate again.";
const V1_READ_ONLY = "This run uses engine protocol 1.0.0 (eleven stages), which is read-only since protocol 2.0.0: read it, list it or delete it, and start a new run to continue the work";

function newRunId(): string {
	const bytes = new Uint8Array(24);
	crypto.getRandomValues(bytes);
	let binary = "";
	for (const b of bytes) binary += String.fromCharCode(b);
	return "rx_" + btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Per-owner limits (WS32 P0.3). The values are PROVISIONAL: the owner sets the final numbers with
 * the move to Workers Paid; the Worker reads them from its `vars` (wrangler.jsonc).
 * - callsPerDay: every metered (mutating) tool call in one UTC day, including failed attempts.
 * - runsPerDay: rigorx_start_run calls in one UTC day.
 * - storedRuns: runs kept at once; the user frees space with rigorx_delete_run.
 * - burstPerMinute: metered calls per 60-second window, held in memory only (best effort: the
 *   count restarts when the Durable Object is evicted); the daily counters are exact.
 */
export interface QuotaLimits {
	callsPerDay: number;
	runsPerDay: number;
	storedRuns: number;
	burstPerMinute: number;
}
export const DEFAULT_LIMITS: QuotaLimits = { callsPerDay: 2_000, runsPerDay: 100, storedRuns: 500, burstPerMinute: 120 };

/** Operations that change stored state and therefore count against the quotas. */
export const METERED_OPERATIONS: ReadonlySet<string> = new Set([
	"start_run", "submit_stage", "record_evidence", "report_action", "verify", "reenter", "cancel_run",
	"compute", "record_source_check", "memory_topic", "memory_write",
]);
/** Recent actions returned in a run view; the full count and unresolved IDs are always returned. */
export const RECENT_ACTIONS = 10;
const USAGE_RETENTION_DAYS = 35;
const LIST_MAX = 50;

const utcDay = (d: Date) => d.toISOString().slice(0, 10);
const nextUtcMidnight = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1)).toISOString();

function randomHex(bytes: number): string {
	const b = new Uint8Array(bytes);
	crypto.getRandomValues(b);
	return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

export interface EngineOptions {
	maxReentries?: number;
	maxEvidencePerRun?: number;
	maxTextChars?: number;
	maxRefChars?: number;
	textPolicy?: TextPolicy;
	limits?: Partial<QuotaLimits>;
	/** Clock for quota windows and freshness checks; tests inject one. */
	now?: () => Date;
	/** Topic memory on the same storage (WS32 P2). */
	memory?: MemoryStore;
}

interface Loaded { run: RunState; meta: JsonObject; revision: number; owner: string }

export class HostEngine {
	readonly maxReentries: number;
	readonly maxEvidencePerRun: number;
	readonly maxTextChars: number;
	readonly maxRefChars: number;
	readonly textPolicy: TextPolicy;
	readonly limits: QuotaLimits;

	private readonly store: RunStore;
	private readonly memory: MemoryStore | null;
	private readonly now: () => Date;
	private readonly burst = new Map<string, { windowStart: number; count: number }>();

	constructor(store: RunStore, options: EngineOptions = {}) {
		this.store = store;
		this.memory = options.memory ?? null;
		this.limits = { ...DEFAULT_LIMITS, ...options.limits };
		this.now = options.now ?? (() => new Date());
		this.maxReentries = options.maxReentries ?? 6;
		this.maxEvidencePerRun = options.maxEvidencePerRun ?? 500;
		this.maxTextChars = options.maxTextChars ?? 20_000;
		this.maxRefChars = options.maxRefChars ?? 2_048;
		this.textPolicy = options.textPolicy ?? DEFAULT_TEXT_POLICY;
	}

	// ---------------------------------------------------------------- stateless

	route(task: unknown): JsonObject {
		const t = text("task", task, this.maxTextChars);
		return { profile: route(t) as unknown as JsonObject, heuristic: true };
	}

	resolveCommands(value: unknown): JsonObject {
		return resolvePrompt(text("text", value, this.maxTextChars)) as unknown as JsonObject;
	}

	// ---------------------------------------------------------------- run lifecycle

	startRun(ownerId: string, task: unknown): JsonObject {
		const owner = this.owner(ownerId);
		const t = text("task", task, this.maxTextChars);
		const profile = route(t);
		const run = newRun(newRunId(), profile.level as Level, profile.intent, profile.intent === "UNKNOWN", this.maxReentries);
		const meta: JsonObject = {
			engine_protocol_version: PROTOCOL_VERSION,
			task_sha256: digest(t),
			task_chars: chars(t),
			intent: profile.intent,
			level: run.level,
			modes: profile.modes,
		};
		this.store.create(owner, run.run_id, run as unknown as JsonObject, meta);
		return this.view(run);
	}

	getRun(ownerId: string, runId: unknown): JsonObject {
		const owner = this.owner(ownerId);
		const stored = this.loadAny(owner, runId);
		if (!isRunState(stored.snapshot)) return v1View(stored.snapshot, stored.meta);
		return this.view(stored.snapshot);
	}

	submitStage(ownerId: string, runId: unknown, args: { stage?: unknown; outcome?: unknown; summary?: unknown; reason?: unknown; data?: unknown }): JsonObject {
		const l = this.load(ownerId, runId);
		const { run } = l;
		if (!isStage(args.stage)) throw invalid(`Unknown stage: ${JSON.stringify(args.stage)}; stages are ${STAGES.join(", ")}`);
		const target = args.stage;
		if (typeof args.outcome !== "string" || !OUTCOMES.includes(args.outcome)) throw invalid(`outcome must be one of ${JSON.stringify(OUTCOMES)}`);
		const summary = text("summary", args.summary, this.maxTextChars);
		assertActive(run);
		resume(run);
		if (target !== run.current_stage) throw conflict(`Current stage is ${run.current_stage}, not ${target}`);
		if (target === "VALIDATE") throw conflict("VALIDATE is completed only through rigorx_verify");
		if (args.outcome === "skipped") {
			throw conflict(`${target} is mandatory at ${run.level} and cannot be skipped; stages that are not mandatory at this level are skipped automatically. Use partial or blocked with a reason to pause.`);
		}
		if (args.outcome === "partial" || args.outcome === "blocked") {
			pauseStage(run, args.outcome, this.note("reason", args.reason));
			return this.save(l);
		}
		const norm = digest(normalized(summary));
		this.checkSummary(run, target, summary, norm);
		const data = args.data === undefined || args.data === null ? {} : object("data", jsonish(args.data));
		const ref = `summary:sha256:${digest(summary)}:norm:${norm}:chars:${chars(summary)}`;
		this.applyStage(run, target, data, ref);
		return this.save(l);
	}

	recordEvidence(ownerId: string, runId: unknown, args: { source_ref?: unknown; claim?: unknown; evidence_type?: unknown; as_of?: unknown }): JsonObject {
		const l = this.load(ownerId, runId);
		const sourceRef = text("source_ref", args.source_ref, this.maxRefChars);
		const claim = text("claim", args.claim, this.maxTextChars);
		substantial("claim", claim, this.textPolicy.minNoteChars, this.textPolicy.minNoteWords, "state what this source supports");
		const type = text("evidence_type", args.evidence_type ?? "SOURCE", 64);
		if (!/^[A-Z][A-Z0-9_]{0,63}$/.test(type) || ENGINE_TYPES.has(type)) {
			throw invalid(`evidence_type must be an upper-case identifier and not one the engine creates (${[...ENGINE_TYPES].join(", ")})`);
		}
		const asOf = this.asOf(args.as_of);
		const e = this.capture(l.run, type, sourceRef, digest(claim), asOf, "HOST_REPORTED", { claim_chars: chars(claim) });
		return { evidence_id: e.id, stage: e.stage, ...this.save(l) };
	}

	reportAction(ownerId: string, runId: unknown, args: { tool_name?: unknown; status?: unknown; receipt_ref?: unknown; resolves?: unknown }): JsonObject {
		const l = this.load(ownerId, runId);
		const toolName = text("tool_name", args.tool_name, 128);
		if (typeof args.status !== "string" || !ACTION_STATUSES.includes(args.status)) throw invalid(`status must be one of ${JSON.stringify(ACTION_STATUSES)}`);
		const receiptRef = text("receipt_ref", args.receipt_ref, this.maxRefChars, false);
		const details: JsonObject = { tool_name: toolName, status: args.status };
		if (args.resolves !== undefined && args.resolves !== null) {
			const earlier = l.run.evidence.find((e) => e.id === args.resolves && e.type === ACTION);
			if (!earlier || earlier.details.status === "EXECUTED") throw invalid("resolves must reference an earlier FAILED or BLOCKED action");
			details.resolves = earlier.id;
		}
		const e = this.capture(l.run, ACTION, receiptRef || `host-action:${toolName}`, null, null, "HOST_REPORTED", details);
		return { action_id: e.id, ...this.save(l) };
	}

	verify(ownerId: string, runId: unknown, requirements: unknown): JsonObject {
		const l = this.load(ownerId, runId);
		const { run } = l;
		assertActive(run);
		resume(run);
		if (run.current_stage !== "VALIDATE") throw conflict(`Current stage is ${run.current_stage}, not VALIDATE`);
		const answers = parseAnswers(jsonish(requirements), run);
		const at = this.now();
		const result = runGate(run, answers, at);
		run.verifications.push({
			gate_version: GATE_VERSION, passed: result.passed, at: at.toISOString(), checks: result.checks,
			answers: answers.map((a) => ({ id: a.id, met: a.met, evidence_ids: a.evidence_ids, items: a.items })) as unknown as JsonObject[],
			levels: result.levels,
		});
		if (result.passed) {
			completeStage(run, `gate:${GATE_VERSION}:pass`, { unmet: result.unmet as unknown as Json });
			run.optimize.unvalidated_change = false;
			advance(run);
		} else {
			run.stage_status.VALIDATE = "FAILED";
			run.status = "VALIDATION_FAILED";
			event(run, "VALIDATION_FAILED", { failed_checks: result.checks.filter((c) => c.passed !== true).map((c) => c.check) as Json[] });
		}
		const view = this.save(l);
		return { passed: result.passed, wording: result.passed ? "structurally verified" : "not verified", checks: result.checks, levels: result.levels, ...view };
	}

	reenter(ownerId: string, runId: unknown, args: { target_stage?: unknown; trigger?: unknown; reason?: unknown }): JsonObject {
		const l = this.load(ownerId, runId);
		if (!isStage(args.target_stage)) throw invalid(`Unknown stage: ${JSON.stringify(args.target_stage)}`);
		const reset = reenter(l.run, args.target_stage, text("trigger", args.trigger, this.maxRefChars), text("reason", args.reason, this.maxRefChars));
		for (const s of reset) {
			const key = STAGE_LEDGER_KEY[s];
			if (key && s !== "CLASSIFY") delete l.run.ledger[key];
		}
		return this.save(l);
	}

	cancelRun(ownerId: string, runId: unknown, reason: unknown): JsonObject {
		const l = this.load(ownerId, runId);
		cancel(l.run, text("reason", reason, this.maxRefChars));
		return this.save(l);
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

	// ---------------------------------------------------------------- stage effects

	private ctx(run: RunState): ContractContext {
		return {
			policy: this.textPolicy, maxText: this.maxTextChars, level: run.level, classificationUnknown: run.classification_unknown,
			ledger: run.ledger, evidence: new Set(run.evidence.map((e) => e.id)),
		};
	}

	private applyStage(run: RunState, stage: Stage, data: Record<string, unknown>, ref: string): void {
		const ctx = this.ctx(run);
		switch (stage) {
			case "QUERY":
				run.ledger.query = queryContract(data, ctx);
				break;
			case "CLASSIFY": {
				const { slice, level } = classifyContract(data, ctx, STAKES_FLOOR);
				const fingerprint = digest(JSON.stringify(slice.requirements.map((r) => [r.id, r.text.sha256, r.importance, r.items.map((i) => i.name.sha256), r.max_age_days])));
				const previous = run.ledger.classify;
				if (previous) {
					const before = digest(JSON.stringify(previous.requirements.map((r) => [r.id, r.text.sha256, r.importance, r.items.map((i) => i.name.sha256), r.max_age_days])));
					if (before !== fingerprint) {
						run.requirement_revisions += 1;
						event(run, "REQUIREMENTS_REVISED", { revision: run.requirement_revisions, before: previous.requirements.length, after: slice.requirements.length });
					}
				}
				run.ledger.classify = slice;
				if (typeof data.intent === "string" && /^[A-Z_]{2,32}$/.test(data.intent)) run.intent = data.intent;
				if (run.classification_unknown) event(run, "CLASSIFICATION_DECLARED", { level: slice.declared_level, stakes: slice.stakes });
				raiseLevel(run, level, "CLASSIFY");
				break;
			}
			case "SELECT_METHODS":
				run.ledger.methods = methodsContract(data, ctx);
				break;
			case "ASSESS_COMPLEXITY": {
				const { slice, level } = complexityContract(data, ctx);
				run.ledger.complexity = slice;
				raiseLevel(run, level, "ASSESS_COMPLEXITY");
				break;
			}
			case "IDENTIFY_CAPABILITIES":
				run.ledger.capabilities = capabilitiesContract(data);
				break;
			case "PLAN":
				run.ledger.plan = planContract(data, ctx);
				break;
			case "EXECUTE":
				run.ledger.execution = executeContract(data, ctx, new Set(run.evidence.filter((x) => x.type === "USER_APPROVAL").map((x) => x.id)));
				break;
			case "EVALUATE_EVIDENCE":
				run.ledger.evaluation = evaluationContract(data, ctx);
				break;
			case "STRESS_TEST":
				run.ledger.stress = stressContract(data, ctx);
				break;
			case "OPTIMIZE": {
				const slice = optimizeContract(data, ctx);
				run.ledger.optimize = slice;
				completeStage(run, ref, { changed: slice.changed });
				if (optimizeOutcome(run, slice.changed, slice.fingerprint) === "deliver") advance(run);
				return;
			}
			case "DELIVER": {
				const delivery = deliveryContract(data, ctx);
				const required = this.requiredDisclosures(run);
				const missing: string[] = [];
				const need = (field: keyof typeof required, given: string[]) => {
					const absent = required[field].filter((x) => !given.includes(x));
					if (absent.length) missing.push(`data.${field}: ${absent.join(", ")}`);
				};
				need("unmet_requirements", delivery.unmet_requirements);
				need("missing_capabilities", delivery.missing_capabilities);
				need("unverified_assumptions", delivery.unverified_assumptions);
				need("broken_scenarios", delivery.broken_scenarios);
				need("unknown_values", delivery.unknown_values);
				if (missing.length) throw invalid(`DELIVER must disclose what is not achieved or not verified. Missing: ${missing.join("; ")}`);
				run.ledger.delivery = delivery;
				const limitations = this.engineLimitations(run);
				const validated = run.stage_status.VALIDATE === "COMPLETED";
				const disclosed = Object.values(required).some((v) => v.length > 0) || delivery.limitations.length > 0;
				completeStage(run, ref);
				run.status = !validated ? "DELIVERED_UNVERIFIED" : limitations.length || disclosed ? "DELIVERED_WITH_LIMITATIONS" : "COMPLETED";
				event(run, "RUN_DELIVERED", { status: run.status, engine_limitations: limitations as unknown as Json });
				return;
			}
			default:
				break;
		}
		completeStage(run, ref);
		advance(run);
	}

	/** What DELIVER must disclose, computed from the ledger and the last validation. */
	private requiredDisclosures(run: RunState): { unmet_requirements: string[]; missing_capabilities: string[]; unverified_assumptions: string[]; broken_scenarios: string[]; unknown_values: string[] } {
		const last = run.verifications[run.verifications.length - 1];
		const validated = run.stage_status.VALIDATE === "COMPLETED";
		const requirements = run.ledger.classify?.requirements ?? [];
		let unmet: string[] = [];
		if (validated && last) {
			const met = new Set((last.answers as unknown as { id: string; met: unknown }[]).filter((a) => a.met === true).map((a) => a.id));
			unmet = requirements.filter((r) => !met.has(r.id)).map((r) => r.id);
		}
		const caps = run.ledger.capabilities;
		const plan = run.ledger.plan?.operations ?? [];
		const missingCaps = caps ? (plan.length ? [...new Set(plan.map((o) => o.capability).filter((c) => caps.missing.includes(c)))] : caps.missing) : [];
		const assumptions = (run.ledger.evaluation?.assumptions ?? []).filter((a) => a.status !== "verified").map((a) => a.id);
		const scenarios = (run.ledger.stress?.scenarios ?? []).filter((s) => s.outcome !== "survives").map((s) => s.id);
		const unknownValues = (run.ledger.evaluation?.claims ?? []).filter((c) => c.value && UNKNOWN_VALUES.has(c.value.status)).map((c) => c.id);
		return { unmet_requirements: unmet, missing_capabilities: missingCaps, unverified_assumptions: assumptions, broken_scenarios: scenarios, unknown_values: unknownValues };
	}

	/** Limitations the engine itself records (not left to the host). */
	private engineLimitations(run: RunState): string[] {
		const out: string[] = [];
		if (run.optimize.stopped) out.push(`OPTIMIZE loop stopped (${run.optimize.stopped}) after ${run.optimize.cycles} cycle(s)`);
		if (run.optimize.unvalidated_change) out.push("the last OPTIMIZE revision was not validated again");
		const reports = new Map((run.ledger.execution?.operations ?? []).map((o) => [o.id, o.status]));
		const notDone = (run.ledger.plan?.operations ?? []).filter((o) => reports.get(o.id) !== "done").map((o) => o.id);
		if (notDone.length) out.push(`planned operations not done: ${notDone.join(", ")}`);
		if (run.requirement_revisions) out.push(`requirements were revised ${run.requirement_revisions} time(s) after first registration`);
		return out;
	}

	// ---------------------------------------------------------------- deterministic tools (ADR-007)

	/**
	 * rigorx_compute. Without run_id it is stateless. With run_id the result is recorded as an
	 * engine-verified COMPUTE_RECEIPT (also when the evaluation fails, so a failed check stays visible).
	 */
	computeOp(ownerId: string | null, args: Record<string, unknown>): JsonObject {
		const input: ComputeInput = { expression: text("expression", args.expression, 2_000) };
		if (args.variables !== undefined && args.variables !== null) {
			const vars = object("variables", jsonish(args.variables));
			if (Object.keys(vars).length > 50) throw limit("At most 50 variables");
			input.variables = {};
			for (const [name, v] of Object.entries(vars)) {
				const o = object(`variables.${name}`, v);
				if (typeof o.value !== "number" || !Number.isFinite(o.value)) throw invalid(`variables.${name}.value must be a finite number`);
				input.variables[name] = { value: o.value, unit: o.unit === undefined || o.unit === null ? "1" : text(`variables.${name}.unit`, o.unit, 100) };
			}
		}
		if (args.as !== undefined && args.as !== null) input.as = text("as", args.as, 100);
		if (args.expect !== undefined && args.expect !== null) {
			const e = object("expect", jsonish(args.expect));
			input.expect = { value: e.value as number, unit: e.unit === undefined || e.unit === null ? "1" : text("expect.unit", e.unit, 100) };
			if (e.rel_tol !== undefined && e.rel_tol !== null) input.expect.rel_tol = e.rel_tol as number;
		}
		let result: JsonObject;
		try {
			result = compute(input) as unknown as JsonObject;
		} catch (e) {
			if (!(e instanceof ComputeError)) throw e;
			result = { ok: false, error: e.message };
		}
		if (args.run_id === undefined || args.run_id === null) return result;
		if (ownerId === null) throw invalid("run_id needs a signed-in owner");
		const ref = `rigorx_compute:sha256:${digest(JSON.stringify([input.expression, input.variables ?? {}, input.as ?? null, input.expect ?? null]))}`;
		const details: JsonObject = { ...result, input: input as unknown as JsonObject };
		const receipt = this.captureEngineReceipt(ownerId, args.run_id, COMPUTE, ref, details);
		return { ...result, evidence_id: receipt.evidence_id as string };
	}

	/** Internal (no tool): the source reference of a host evidence record, for rigorx_check_source. */
	evidenceForCheck(ownerId: string, args: Record<string, unknown>): JsonObject {
		const id = text("evidence_id", args.evidence_id, 16);
		const e = this.evidenceRecord(ownerId, args.run_id, id);
		if (ENGINE_TYPES.has(e.type)) throw invalid(`${id} is a ${e.type}; check the source evidence it refers to instead`);
		return { evidence_id: e.id, source_ref: e.source_ref };
	}

	/** Internal (no tool): record the result of a source check made by the Worker. */
	recordSourceCheck(ownerId: string, args: Record<string, unknown>): JsonObject {
		const id = text("evidence_id", args.evidence_id, 16);
		const check = object("check", args.check) as unknown as SourceCheck;
		const details: JsonObject = { ...(check as unknown as JsonObject), checks_evidence: id };
		return this.captureEngineReceipt(ownerId, args.run_id, SOURCE_CHECK, check.final_url ?? check.requested, details);
	}

	// ---------------------------------------------------------------- topic memory (WS32 P2, ADR-008)

	private mem(): MemoryStore {
		if (!this.memory) throw new EngineError("Topic memory is not available on this server");
		return this.memory;
	}

	private decidedBy(value: unknown): DecidedBy {
		if (value !== "user" && value !== "host") throw invalid('decided_by must be "user" (the user asked for this) or "host" (your own proposal)');
		return value;
	}

	memoryTopic(ownerId: unknown, args: Record<string, unknown>): JsonObject {
		const owner = this.owner(ownerId);
		const m = this.mem();
		const action = args.action;
		if (action === "list") return { topics: m.topics(owner) as unknown as Json[] };
		const by = this.decidedBy(args.decided_by);
		const id = () => text("topic_id", args.topic_id, 64);
		const parent = () => (args.parent_id === undefined || args.parent_id === null ? null : text("parent_id", args.parent_id, 64));
		switch (action) {
			case "create": return m.createTopic(owner, text("name", args.name, 120), parent(), by);
			case "rename": return m.renameTopic(owner, id(), text("name", args.name, 120), by);
			case "move": return m.moveTopic(owner, id(), parent(), by);
			case "merge": return m.mergeTopic(owner, id(), text("into_id", args.into_id, 64), by);
			case "delete": return m.deleteTopic(owner, id(), by);
			default: throw invalid('action must be one of "list", "create", "rename", "move", "merge", "delete"');
		}
	}

	memoryWrite(ownerId: unknown, args: Record<string, unknown>): JsonObject {
		const owner = this.owner(ownerId);
		const m = this.mem();
		const body = text("text", args.text, 8_000);
		substantial("text", body, this.textPolicy.minNoteChars, this.textPolicy.minNoteWords, "write the fact, decision or note in a sentence");
		const kind = args.kind === undefined || args.kind === null ? "note" : (KINDS as readonly string[]).includes(String(args.kind)) ? String(args.kind) : (() => { throw invalid(`kind must be one of ${JSON.stringify(KINDS)}`); })();
		const keywords = (Array.isArray(jsonish(args.keywords)) ? (jsonish(args.keywords) as unknown[]) : args.keywords === undefined || args.keywords === null ? [] : (() => { throw invalid("keywords must be a list"); })());
		if (keywords.length > 32) throw limit("At most 32 keywords");
		const kws = keywords.map((k, i) => text(`keywords[${i}]`, k, 64));
		const trust = (TRUST as readonly string[]).includes(String(args.trust ?? "host_inferred")) ? (String(args.trust ?? "host_inferred") as (typeof TRUST)[number]) : (() => { throw invalid(`trust must be one of ${JSON.stringify(TRUST)}`); })();
		const by = this.decidedBy(args.decided_by ?? "host");
		if (trust === "user_confirmed" && by !== "user") throw invalid('trust "user_confirmed" needs decided_by "user"');
		const prov = args.provenance === undefined || args.provenance === null ? {} : object("provenance", jsonish(args.provenance));
		const provenance: JsonObject = {};
		if (prov.run_id !== undefined && prov.run_id !== null) provenance.run_id = text("provenance.run_id", prov.run_id, 80);
		if (prov.evidence_id !== undefined && prov.evidence_id !== null) provenance.evidence_id = text("provenance.evidence_id", prov.evidence_id, 16);
		if (prov.stage !== undefined && prov.stage !== null) provenance.stage = text("provenance.stage", prov.stage, 32);
		if (trust === "run_validated") {
			if (!provenance.run_id) throw invalid('trust "run_validated" needs provenance.run_id of a validated run');
			const l = this.load(owner, provenance.run_id);
			const last = l.run.verifications[l.run.verifications.length - 1];
			if (!(l.run.stage_status.VALIDATE === "COMPLETED" && last?.passed)) throw invalid(`Run ${String(provenance.run_id)} has not passed validation, so its results are not run_validated`);
		}
		const lang = args.lang === undefined || args.lang === null ? null : text("lang", args.lang, 35);
		if (lang !== null && !/^[A-Za-z]{2,3}(-[A-Za-z0-9]{1,8})*$/.test(lang)) throw invalid("lang must be a BCP 47 tag such as bn, en or zh-Hans");
		const conflicts = Array.isArray(jsonish(args.conflicts_with)) ? (jsonish(args.conflicts_with) as unknown[]).map((c, i) => text(`conflicts_with[${i}]`, c, 64)) : [];
		if (conflicts.length > 20) throw limit("At most 20 conflicting items");
		return m.write(owner, {
			topic_id: text("topic_id", args.topic_id, 64), text: body, kind: kind as (typeof KINDS)[number], keywords: kws, lang, trust, decided_by: by, provenance,
			as_of: this.asOf(args.as_of), supersedes: args.supersedes === undefined || args.supersedes === null ? null : text("supersedes", args.supersedes, 64),
			conflicts_with: conflicts, host_memory_conflict: args.host_memory_conflict === undefined || args.host_memory_conflict === null ? null : text("host_memory_conflict", args.host_memory_conflict, 2_000),
		});
	}

	memoryRecall(ownerId: unknown, args: Record<string, unknown>): JsonObject {
		const owner = this.owner(ownerId);
		const raw = jsonish(args.queries);
		const queries = (Array.isArray(raw) ? raw : typeof raw === "string" ? [raw] : []).map((q, i) => text(`queries[${i}]`, q, 500));
		if (!queries.length || queries.length > 10) throw invalid("queries must be 1 to 10 texts (several phrasings or keywords, any language)");
		let n = 8;
		if (args.limit !== undefined && args.limit !== null) {
			if (typeof args.limit !== "number" || !Number.isInteger(args.limit) || args.limit < 1 || args.limit > 20) throw invalid("limit must be an integer from 1 to 20");
			n = args.limit;
		}
		const kinds = Array.isArray(jsonish(args.kinds)) ? (jsonish(args.kinds) as unknown[]).map(String) : undefined;
		return this.mem().recall(owner, queries, {
			topic_id: args.topic_id === undefined || args.topic_id === null ? null : text("topic_id", args.topic_id, 64),
			...(kinds ? { kinds } : {}), limit: n, include_superseded: args.include_superseded === true,
		});
	}

	memoryDelete(ownerId: unknown, args: Record<string, unknown>): JsonObject {
		const owner = this.owner(ownerId);
		const raw = jsonish(args.item_ids);
		if (!Array.isArray(raw) || !raw.length || raw.length > 100) throw invalid("item_ids must be a list of 1 to 100 memory item IDs");
		return this.mem().deleteItems(owner, raw.map((x, i) => text(`item_ids[${i}]`, x, 64)), this.decidedBy(args.decided_by));
	}

	// ---------------------------------------------------------------- quotas, listing, profile (WS32 P0.3, P0.5, P0.8)

	/** Count one metered call, or refuse it. Called by dispatch() before the operation runs. */
	meter(ownerId: unknown, operation: string): void {
		if (!METERED_OPERATIONS.has(operation)) return;
		const owner = this.owner(ownerId);
		const at = this.now();
		const day = utcDay(at);
		const reset = nextUtcMidnight(at);
		const used = this.store.usage(owner, day);
		const l = this.limits;
		if (used.calls >= l.callsPerDay) throw quota(`Daily limit of ${l.callsPerDay} tool calls reached; it resets at ${reset}`);
		if (operation === "start_run") {
			if (used.runs_started >= l.runsPerDay) throw quota(`Daily limit of ${l.runsPerDay} new runs reached; it resets at ${reset}`);
			if (this.store.countRuns(owner) >= l.storedRuns) {
				throw quota(`At most ${l.storedRuns} stored runs: delete finished runs with rigorx_delete_run (see rigorx_list_runs)`);
			}
		}
		const ms = at.getTime();
		const window = this.burst.get(owner);
		if (window && ms - window.windowStart < 60_000) {
			if (window.count >= l.burstPerMinute) throw quota(`More than ${l.burstPerMinute} tool calls in one minute; wait a minute and retry`);
			window.count += 1;
		} else {
			this.burst.set(owner, { windowStart: ms, count: 1 });
		}
		const keepFrom = utcDay(new Date(ms - USAGE_RETENTION_DAYS * 86_400_000));
		this.store.addUsage(owner, day, 1, operation === "start_run" ? 1 : 0, keepFrom);
	}

	usage(ownerId: unknown): JsonObject {
		const owner = this.owner(ownerId);
		const at = this.now();
		const used = this.store.usage(owner, utcDay(at));
		const l = this.limits;
		return {
			day: utcDay(at),
			resets_at: nextUtcMidnight(at),
			calls: { used: used.calls, limit: l.callsPerDay },
			runs_started: { used: used.runs_started, limit: l.runsPerDay },
			stored_runs: { used: this.store.countRuns(owner), limit: l.storedRuns },
			burst_per_minute: l.burstPerMinute,
			storage_bytes: this.store.databaseBytes(),
			memory_bytes: this.memory ? { used: this.memory.bytesUsed(owner), limit: this.memory.limitBytes } : null,
			limits_provisional: true,
		};
	}

	listRuns(ownerId: unknown, args: { limit?: unknown; cursor?: unknown }): JsonObject {
		const owner = this.owner(ownerId);
		let n = 20;
		if (args.limit !== undefined && args.limit !== null) {
			if (typeof args.limit !== "number" || !Number.isInteger(args.limit) || args.limit < 1 || args.limit > LIST_MAX) {
				throw invalid(`limit must be an integer from 1 to ${LIST_MAX}`);
			}
			n = args.limit;
		}
		let after: { updated_at: string; run_id: string } | undefined;
		if (args.cursor !== undefined && args.cursor !== null) after = decodeCursor(text("cursor", args.cursor, 512));
		const runs = this.store.list(owner, n + 1, after);
		const page = runs.slice(0, n);
		const last = page[page.length - 1];
		return { runs: page as unknown as Json[], next_cursor: runs.length > n && last ? encodeCursor(last.updated_at, last.run_id) : null };
	}

	profile(ownerId: unknown): JsonObject {
		// A random ID stored per owner: stable for the account, not derivable from the Google subject.
		return { id: this.store.profileId(this.owner(ownerId), () => randomHex(16)) };
	}

	// ---------------------------------------------------------------- helpers

	private note(name: string, value: unknown): string {
		const t = text(name, value, this.maxRefChars);
		substantial(name, t, this.textPolicy.minNoteChars, this.textPolicy.minNoteWords, "explain why");
		return t;
	}

	private checkSummary(run: RunState, target: Stage, summary: string, norm: string): void {
		const p = this.textPolicy;
		substantial("summary", summary, p.minSummaryChars, p.minSummaryWords, "describe what was done in this stage");
		if (!p.distinctSummaries) return;
		const marker = `:norm:${norm}:`;
		for (const e of run.events) {
			if (e.type === "STAGE_COMPLETED" && e.stage !== target && String(e.details.result_ref ?? "").includes(marker)) {
				throw invalid(`summary repeats the ${e.stage} summary: describe this stage's own work`);
			}
		}
	}

	private asOf(value: unknown): string | null {
		if (value === undefined || value === null) return null;
		const t = text("as_of", value, 40);
		const ms = Date.parse(t);
		if (!/^\d{4}-\d{2}-\d{2}([T ][0-9:.]+(Z|[+-]\d{2}:?\d{2})?)?$/.test(t) || Number.isNaN(ms)) throw invalid("as_of must be an ISO 8601 date such as 2026-11-26");
		if (ms > this.now().getTime() + 86_400_000) throw invalid("as_of cannot be in the future");
		return new Date(ms).toISOString();
	}

	private capture(run: RunState, type: string, sourceRef: string, claimSha: string | null, asOf: string | null, verification: EvidenceRecord["verification"], details: JsonObject): EvidenceRecord {
		if (run.evidence.length >= this.maxEvidencePerRun) throw limit(`At most ${this.maxEvidencePerRun} evidence records per run`);
		// Evidence and action receipts may be recorded at any time before the run ends, including
		// after a failed validation (for example the action that fixes a failure, before re-entering).
		if (TERMINAL.has(run.status)) throw conflict(`Run is ${run.status}`);
		resume(run);
		const e = event(run, "EVIDENCE_CAPTURED", { evidence_type: type, source_ref: sourceRef });
		const record: EvidenceRecord = { id: `ev-${e.sequence}`, type, stage: run.current_stage, source_ref: sourceRef, claim_sha256: claimSha, as_of: asOf, verification, details };
		run.evidence.push(record);
		return record;
	}

	/** Engine-created receipts (rigorx_compute, rigorx_check_source) use this entry point. */
	captureEngineReceipt(ownerId: string, runId: unknown, type: string, sourceRef: string, details: JsonObject): JsonObject {
		if (!ENGINE_TYPES.has(type) || type === ACTION) throw invalid(`Not an engine receipt type: ${type}`);
		const l = this.load(ownerId, runId);
		const e = this.capture(l.run, type, sourceRef, null, null, "ENGINE_VERIFIED", details);
		return { evidence_id: e.id, ...this.save(l) };
	}

	/** Read access for engine tools (for example the source of an evidence record to check). */
	evidenceRecord(ownerId: string, runId: unknown, evidenceId: string): EvidenceRecord {
		const l = this.load(ownerId, runId);
		const e = l.run.evidence.find((x) => x.id === evidenceId);
		if (!e) throw invalid(`${evidenceId} does not exist in this run`);
		return e;
	}

	private owner(ownerId: unknown): string {
		if (typeof ownerId !== "string" || !ownerId.trim() || chars(ownerId) > 256) throw invalid("A verified owner identity is required");
		return ownerId;
	}

	private runId(runId: unknown): string {
		if (typeof runId !== "string" || !/^rx_[A-Za-z0-9_-]{16,64}$/.test(runId)) throw notFound();
		return runId;
	}

	private loadAny(owner: string, runId: unknown) {
		try {
			return this.store.load(owner, this.runId(runId));
		} catch (e) {
			if (e instanceof RunNotFound) throw notFound();
			throw e;
		}
	}

	private load(ownerId: unknown, runId: unknown): Loaded {
		const owner = this.owner(ownerId);
		const stored = this.loadAny(owner, runId);
		if (!isRunState(stored.snapshot)) throw conflict(V1_READ_ONLY);
		return { run: stored.snapshot, meta: stored.meta, revision: stored.revision, owner };
	}

	private save(l: Loaded): JsonObject {
		l.meta.level = l.run.level;
		l.meta.intent = l.run.intent;
		l.revision = this.store.save(l.owner, l.run.run_id, l.run as unknown as JsonObject, l.meta, l.revision);
		return this.view(l.run);
	}

	private view(run: RunState): JsonObject {
		const active = !TERMINAL.has(run.status);
		const actions = run.evidence.filter((e) => e.type === ACTION).map((a) => {
			const x: JsonObject = { id: a.id, tool_name: a.details.tool_name ?? null, status: a.details.status ?? null };
			if (a.details.resolves) x.resolves = a.details.resolves;
			return x;
		});
		const last = run.verifications[run.verifications.length - 1];
		let guidance: string | null = null;
		if (run.status === "VALIDATION_FAILED") guidance = FAILED_GUIDANCE;
		else if (active) guidance = STAGE_GUIDANCE[run.current_stage];
		const requirements = (run.ledger.classify?.requirements ?? []).map((r) => ({ id: r.id, importance: r.importance, items: r.items.map((i) => i.id), max_age_days: r.max_age_days }));
		const view: JsonObject = {
			run_id: run.run_id,
			engine_protocol_version: run.protocol,
			status: run.status,
			current_stage: active ? run.current_stage : null,
			stage_status: Object.fromEntries(STAGES.map((s) => [s, run.stage_status[s]])),
			level: run.level,
			intent: run.intent,
			classification_unknown: run.classification_unknown,
			mandatory_stages: mandatoryStages(run.level),
			guidance,
			requirements: requirements as unknown as Json[],
			ledger: {
				methods: run.ledger.methods?.length ?? 0,
				capabilities: run.ledger.capabilities ? { available: run.ledger.capabilities.available, missing: run.ledger.capabilities.missing } : null,
				operations: (run.ledger.plan?.operations ?? []).map((o) => o.id),
				claims: run.ledger.evaluation?.claims.length ?? 0,
				assumptions: run.ledger.evaluation?.assumptions?.length ?? null,
				scenarios: run.ledger.stress?.scenarios.length ?? 0,
				requirement_revisions: run.requirement_revisions,
			},
			reentries: { ...run.reentries },
			optimize: { cycles: run.optimize.cycles, max: run.optimize.max, stopped: run.optimize.stopped },
			evidence_count: run.evidence.filter((e) => e.type !== ACTION).length,
			actions: actions.slice(-RECENT_ACTIONS),
			actions_total: actions.length,
			actions_unresolved: unresolvedActions(run.evidence),
			verified: !!last && last.passed && run.stage_status.VALIDATE === "COMPLETED",
			last_verification: last ? { gate_version: last.gate_version, passed: last.passed, checks: last.checks as unknown as Json[], levels: last.levels } : null,
		};
		if (active && run.current_stage === "DELIVER") view.requires = this.requiredDisclosures(run) as unknown as JsonObject;
		if (!active && run.status !== "CANCELLED") view.limitations = this.engineLimitations(run);
		return view;
	}
}

/** Read-only view of a protocol v1 run (eleven stages). */
function v1View(snapshot: JsonObject, meta: JsonObject): JsonObject {
	const run = PipelineRun.fromSnapshot(snapshot);
	const active = run.status !== "COMPLETED" && run.status !== "CANCELLED";
	const verifications = (meta.verifications as Json[] | undefined) ?? [];
	const evidence = run.events.filter((e) => e.event_type === "EVIDENCE_CAPTURED");
	return {
		run_id: run.run_id,
		engine_protocol_version: "1.0.0",
		read_only: true,
		status: run.status,
		current_stage: active ? run.current_stage : null,
		stage_status: Object.fromEntries(V1_STAGES.map((s) => [s, run.stage_status[s]])),
		guidance: V1_READ_ONLY,
		route: { intent: meta.intent ?? null, level: meta.level ?? null },
		evidence_count: evidence.filter((e) => e.details.evidence_type !== ACTION).length,
		actions_total: evidence.filter((e) => e.details.evidence_type === ACTION).length,
		verified: run.verification_accepted,
		last_verification: verifications.length ? verifications[verifications.length - 1]! : null,
	};
}

// ---------------------------------------------------------------- RPC

export const RUN_OPERATIONS = new Set([
	"start_run", "get_run", "submit_stage", "record_evidence", "report_action", "verify", "reenter", "cancel_run", "delete_run",
	"list_runs", "usage", "profile", "compute", "evidence_for_check", "record_source_check",
	"memory_topic", "memory_write", "memory_recall", "memory_delete",
]);

function encodeCursor(updatedAt: string, runId: string): string {
	return btoa(JSON.stringify([updatedAt, runId])).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function decodeCursor(cursor: string): { updated_at: string; run_id: string } {
	try {
		const padded = cursor.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((cursor.length + 3) % 4);
		const value = JSON.parse(atob(padded)) as unknown;
		if (Array.isArray(value) && value.length === 2 && typeof value[0] === "string" && typeof value[1] === "string") {
			return { updated_at: value[0], run_id: value[1] };
		}
	} catch {
		// fall through
	}
	throw invalid("cursor is not valid: pass next_cursor from a previous rigorx_list_runs result");
}

/** Durable Object side: run one allow-listed operation; always returns a JSON envelope string. */
export function dispatch(engine: HostEngine, ownerId: string, operation: string, payloadJson: string): string {
	try {
		if (!RUN_OPERATIONS.has(operation)) throw new EngineError(`Unknown operation: ${JSON.stringify(operation)}`);
		const p = JSON.parse(payloadJson) as unknown;
		if (typeof p !== "object" || p === null || Array.isArray(p)) throw new EngineError("Payload must be a JSON object");
		const a = p as Record<string, unknown>;
		engine.meter(ownerId, operation);
		const result = (() => {
			switch (operation) {
				case "start_run": return engine.startRun(ownerId, a.task);
				case "get_run": return engine.getRun(ownerId, a.run_id);
				case "submit_stage": return engine.submitStage(ownerId, a.run_id, a);
				case "record_evidence": return engine.recordEvidence(ownerId, a.run_id, a);
				case "report_action": return engine.reportAction(ownerId, a.run_id, a);
				case "verify":
					if (a.requirements === undefined && a.criteria !== undefined) {
						throw invalid("rigorx_verify takes requirements (engine protocol 2), not criteria: answer each requirement registered at CLASSIFY with {id, met, evidence_ids}. If your tool list still shows criteria, refresh the RIGOR-X connector.");
					}
					return engine.verify(ownerId, a.run_id, a.requirements);
				case "reenter": return engine.reenter(ownerId, a.run_id, a);
				case "cancel_run": return engine.cancelRun(ownerId, a.run_id, a.reason);
				case "list_runs": return engine.listRuns(ownerId, a);
				case "usage": return engine.usage(ownerId);
				case "profile": return engine.profile(ownerId);
				case "compute": return engine.computeOp(ownerId, a);
				case "evidence_for_check": return engine.evidenceForCheck(ownerId, a);
				case "record_source_check": return engine.recordSourceCheck(ownerId, a);
				case "memory_topic": return engine.memoryTopic(ownerId, a);
				case "memory_write": return engine.memoryWrite(ownerId, a);
				case "memory_recall": return engine.memoryRecall(ownerId, a);
				case "memory_delete": return engine.memoryDelete(ownerId, a);
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

export { isMandatory, storedNote };
