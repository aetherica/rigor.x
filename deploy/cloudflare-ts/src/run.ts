// Engine protocol v2 run state and its transitions (WS32 P1). A run is a plain JSON document
// (stored as the snapshot) with an append-only event log; every transition appends an event.
import {
	MAX_OPTIMIZE_CYCLES, PROTOCOL_VERSION, STAGES, isMandatory, levelRank, maxLevel, stageIndex,
	type Level, type Stage,
} from "./protocol.ts";
import { conflict, type Json, type JsonObject } from "./text.ts";
import type { Ledger } from "./ledger.ts";
import type { LoopHistory } from "./loop.ts";

export type StageStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "AUTO_SKIPPED" | "PARTIAL" | "BLOCKED" | "FAILED";
export type RunStatus =
	| "IN_PROGRESS" | "PARTIAL" | "BLOCKED" | "VALIDATION_FAILED"
	| "COMPLETED" | "DELIVERED_WITH_LIMITATIONS" | "DELIVERED_UNVERIFIED" | "CANCELLED";
export const TERMINAL: ReadonlySet<RunStatus> = new Set(["COMPLETED", "DELIVERED_WITH_LIMITATIONS", "DELIVERED_UNVERIFIED", "CANCELLED"]);

export interface RunEvent {
	sequence: number;
	type: string;
	stage: Stage;
	timestamp: string;
	details: JsonObject;
}

export interface EvidenceRecord {
	id: string; // ev-N (the event sequence)
	type: string; // SOURCE, ..., HOST_REPORTED_ACTION, COMPUTE_RECEIPT, SOURCE_CHECK
	stage: Stage;
	source_ref: string;
	claim_sha256: string | null;
	as_of: string | null;
	verification: "HOST_REPORTED" | "ENGINE_VERIFIED";
	/** Actions: tool_name, status, resolves. Engine receipts: their result fields. */
	details: JsonObject;
}

export interface Verification {
	gate_version: string;
	passed: boolean;
	at: string;
	checks: JsonObject[];
	answers: JsonObject[];
	levels: Record<string, string>;
}

export interface RunState {
	run_id: string;
	protocol: string;
	status: RunStatus;
	current_stage: Stage;
	stage_status: Record<Stage, StageStatus>;
	level: Level;
	router_level: Level;
	intent: string;
	classification_unknown: boolean;
	reentries: { used: number; max: number };
	optimize: { cycles: number; max: number; fingerprints: string[]; stopped: null | "no_progress" | "budget"; unvalidated_change: boolean };
	requirement_revisions: number;
	/** Repeat/stall history per loop kind (loop.ts). Absent on runs started before it existed. */
	loops?: Record<string, LoopHistory>;
	ledger: Ledger;
	evidence: EvidenceRecord[];
	verifications: Verification[];
	events: RunEvent[];
}

const now = () => new Date().toISOString();

export function newRun(runId: string, level: Level, intent: string, unknown: boolean, maxReentries: number): RunState {
	const run: RunState = {
		run_id: runId,
		protocol: PROTOCOL_VERSION,
		status: "IN_PROGRESS",
		current_stage: "QUERY",
		stage_status: Object.fromEntries(STAGES.map((s) => [s, "NOT_STARTED"])) as Record<Stage, StageStatus>,
		level,
		router_level: level,
		intent,
		classification_unknown: unknown,
		reentries: { used: 0, max: maxReentries },
		optimize: { cycles: 0, max: MAX_OPTIMIZE_CYCLES, fingerprints: [], stopped: null, unvalidated_change: false },
		requirement_revisions: 0,
		loops: {},
		ledger: {},
		evidence: [],
		verifications: [],
		events: [],
	};
	event(run, "RUN_STARTED", { level, intent, classification_unknown: unknown });
	run.stage_status.QUERY = "IN_PROGRESS";
	event(run, "STAGE_STARTED", {});
	return run;
}

export function event(run: RunState, type: string, details: JsonObject, stage: Stage = run.current_stage): RunEvent {
	const e: RunEvent = { sequence: run.events.length + 1, type, stage, timestamp: now(), details };
	run.events.push(e);
	return e;
}

export function assertActive(run: RunState): void {
	if (TERMINAL.has(run.status)) throw conflict(`Run is ${run.status}`);
	if (run.status === "VALIDATION_FAILED") throw conflict("Validation failed: call rigorx_reenter to return to an earlier stage and fix the gaps");
}

/** Resume a PARTIAL or BLOCKED run on its current stage. */
export function resume(run: RunState): void {
	if (run.status === "PARTIAL" || run.status === "BLOCKED") {
		run.status = "IN_PROGRESS";
		run.stage_status[run.current_stage] = "IN_PROGRESS";
		event(run, "STAGE_RESUMED", {});
	}
}

/** Move to the next not-yet-done stage; stages that are not mandatory at the current level are auto-skipped. */
export function advance(run: RunState): void {
	for (let i = stageIndex(run.current_stage) + 1; i < STAGES.length; i++) {
		const s = STAGES[i]!;
		if (run.stage_status[s] !== "NOT_STARTED") continue;
		if (!isMandatory(s, run.level)) {
			run.stage_status[s] = "AUTO_SKIPPED";
			event(run, "STAGE_AUTO_SKIPPED", { reason: `not mandatory at ${run.level}` }, s);
			continue;
		}
		run.current_stage = s;
		run.stage_status[s] = "IN_PROGRESS";
		event(run, "STAGE_STARTED", {});
		return;
	}
}

export function completeStage(run: RunState, resultRef: string, details: JsonObject = {}): void {
	run.stage_status[run.current_stage] = "COMPLETED";
	event(run, "STAGE_COMPLETED", { result_ref: resultRef, ...details });
}

export function pauseStage(run: RunState, outcome: "partial" | "blocked", reason: string): void {
	const status = outcome === "partial" ? "PARTIAL" : "BLOCKED";
	run.stage_status[run.current_stage] = status;
	run.status = status;
	event(run, outcome === "partial" ? "STAGE_PARTIAL" : "STAGE_BLOCKED", { reason });
}

/**
 * Raise the level (never lower). Stages after the current one that become mandatory are picked up
 * by advance(). No earlier stage can become mandatory: the level is set at CLASSIFY and raised at
 * ASSESS_COMPLEXITY, and every stage before ASSESS_COMPLEXITY is mandatory at every level where
 * ASSESS_COMPLEXITY is (tested in protocol-v2.test.ts). Returns true when the level changed.
 */
export function raiseLevel(run: RunState, to: Level, source: string): boolean {
	const next = maxLevel(run.level, to);
	if (levelRank(next) === levelRank(run.level)) return false;
	event(run, "LEVEL_RAISED", { from: run.level, to: next, source });
	run.level = next;
	return true;
}

/** Host-requested return to the current or an earlier stage (costs re-entry budget). */
export function reenter(run: RunState, target: Stage, trigger: string, reason: string): Stage[] {
	if (TERMINAL.has(run.status)) throw conflict(`Run is ${run.status}`);
	if (stageIndex(target) > stageIndex(run.current_stage)) throw conflict(`Cannot re-enter ${target}: it is after the current stage ${run.current_stage}`);
	if (run.reentries.used >= run.reentries.max) throw conflict(`Re-entry budget exhausted (${run.reentries.max})`);
	run.reentries.used += 1;
	const reset = STAGES.filter((s) => stageIndex(s) >= stageIndex(target));
	for (const s of reset) run.stage_status[s] = "NOT_STARTED";
	run.status = "IN_PROGRESS";
	run.current_stage = target;
	event(run, "REENTERED", { target, trigger, reason, budget_used: run.reentries.used });
	if (!isMandatory(target, run.level)) {
		// Re-entering a stage that is not mandatory: start from the previous one so advance() skips it consistently.
		run.stage_status[target] = "AUTO_SKIPPED";
		event(run, "STAGE_AUTO_SKIPPED", { reason: `not mandatory at ${run.level}` }, target);
		advance(run);
	} else {
		run.stage_status[target] = "IN_PROGRESS";
		event(run, "STAGE_STARTED", {});
	}
	return reset;
}

/** ADR-004: decide what follows OPTIMIZE. Returns "validate" when the run must go back to VALIDATE. */
export function optimizeOutcome(run: RunState, changed: boolean, fp: string): "validate" | "deliver" {
	const o = run.optimize;
	if (!changed) {
		o.unvalidated_change = false;
		return "deliver";
	}
	if (o.fingerprints.includes(fp)) {
		o.stopped = "no_progress";
		o.unvalidated_change = true;
		event(run, "OPTIMIZE_STOPPED", { reason: "no_progress", cycles: o.cycles });
		return "deliver";
	}
	o.fingerprints.push(fp);
	if (o.cycles >= o.max) {
		o.stopped = "budget";
		o.unvalidated_change = true;
		event(run, "OPTIMIZE_STOPPED", { reason: "budget", cycles: o.cycles });
		return "deliver";
	}
	o.cycles += 1;
	o.unvalidated_change = true;
	for (const s of ["VALIDATE", "STRESS_TEST", "OPTIMIZE"] as Stage[]) run.stage_status[s] = "NOT_STARTED";
	run.current_stage = "VALIDATE";
	run.stage_status.VALIDATE = "IN_PROGRESS";
	event(run, "OPTIMIZE_CYCLE", { cycle: o.cycles, max: o.max });
	return "validate";
}

export function cancel(run: RunState, reason: string): void {
	if (TERMINAL.has(run.status)) throw conflict(`Run is ${run.status}`);
	run.status = "CANCELLED";
	event(run, "RUN_CANCELLED", { reason });
}

/** Minimal structural check of a stored v2 snapshot. */
export function isRunState(value: unknown): value is RunState {
	const v = value as Partial<RunState> | null;
	return !!v && typeof v === "object" && v.protocol === PROTOCOL_VERSION && typeof v.run_id === "string" && Array.isArray(v.events) && typeof v.stage_status === "object";
}
