// Port of src/rigorx/pipeline.py: the 11-stage control-plane state machine.
// Snapshots are JSON-compatible with the Python implementation.

export const STAGE_ORDER = [
	"CONTEXT", "INTENT", "KNOWLEDGE", "RESEARCH", "ROUTING", "REASONING",
	"EXECUTION", "EVIDENCE", "VERIFICATION", "DECISION", "FEEDBACK",
] as const;
export type Stage = (typeof STAGE_ORDER)[number];

export type StageStatus =
	| "NOT_STARTED" | "READY" | "IN_PROGRESS" | "COMPLETED" | "PARTIAL"
	| "BLOCKED" | "FAILED" | "SKIPPED_WITH_REASON";
export type RunStatus =
	| "CREATED" | "IN_PROGRESS" | "WAITING_FOR_USER" | "PARTIAL" | "BLOCKED" | "FAILED"
	| "VERIFICATION_FAILED" | "DECISION_PENDING" | "COMPLETED" | "CANCELLED";

const STAGE_STATUSES: ReadonlySet<string> = new Set([
	"NOT_STARTED", "READY", "IN_PROGRESS", "COMPLETED", "PARTIAL", "BLOCKED", "FAILED", "SKIPPED_WITH_REASON",
]);
const RUN_STATUSES: ReadonlySet<string> = new Set([
	"CREATED", "IN_PROGRESS", "WAITING_FOR_USER", "PARTIAL", "BLOCKED", "FAILED",
	"VERIFICATION_FAILED", "DECISION_PENDING", "COMPLETED", "CANCELLED",
]);

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type JsonObject = { [key: string]: Json };

export interface PipelineEvent {
	sequence: number;
	event_type: string;
	stage: Stage;
	timestamp: string;
	details: JsonObject;
}

export class InvalidTransition extends Error {
	override name = "InvalidTransition";
}

export function isStage(value: unknown): value is Stage {
	return typeof value === "string" && (STAGE_ORDER as readonly string[]).includes(value);
}

/** ISO timestamp in Python's `datetime.now(UTC).isoformat()` shape. */
export function nowIso(): string {
	return new Date().toISOString().replace("Z", "+00:00");
}

function assertFiniteJson(value: unknown): void {
	// Mirrors json.dumps(..., allow_nan=False): reject non-finite numbers and non-JSON values.
	JSON.stringify(value, (_key, v: unknown) => {
		if (typeof v === "number" && !Number.isFinite(v)) throw new RangeError("Out of range float values are not JSON compliant");
		if (typeof v === "bigint" || typeof v === "function" || typeof v === "symbol" || v === undefined) {
			throw new TypeError("Value is not JSON serializable");
		}
		return v;
	});
}

export class PipelineRun {
	run_id: string;
	pipeline_version = "1.0.0";
	max_reentries: number;
	current_stage: Stage = "CONTEXT";
	status: RunStatus = "CREATED";
	verification_accepted = false;
	reentry_count = 0;
	stage_status: Record<Stage, StageStatus>;
	events: PipelineEvent[] = [];

	constructor(runId: string, maxReentries = 8) {
		if (!runId.trim()) throw new Error("run_id must be a non-empty string");
		if (maxReentries < 0) throw new Error("max_reentries cannot be negative");
		this.run_id = runId;
		this.max_reentries = maxReentries;
		this.stage_status = Object.fromEntries(
			STAGE_ORDER.map((s) => [s, s === "CONTEXT" ? "READY" : "NOT_STARTED"]),
		) as Record<Stage, StageStatus>;
	}

	beginStage(): Stage {
		if (["COMPLETED", "CANCELLED", "VERIFICATION_FAILED", "BLOCKED"].includes(this.status)) {
			throw new InvalidTransition(`Cannot start a stage for a ${this.status} run; re-enter an earlier stage first`);
		}
		const state = this.stage_status[this.current_stage];
		if (!["READY", "PARTIAL", "BLOCKED", "FAILED"].includes(state)) {
			throw new InvalidTransition(`${this.current_stage} is ${state}; expected READY or a recoverable state`);
		}
		this.stage_status[this.current_stage] = "IN_PROGRESS";
		this.status = "IN_PROGRESS";
		this.emit("STAGE_STARTED", this.current_stage);
		return this.current_stage;
	}

	recordEvidence(evidenceType: string, sourceRef: string, metadata?: JsonObject, claimRef?: string): PipelineEvent {
		if (this.status !== "IN_PROGRESS") throw new InvalidTransition("Evidence can only be captured while a stage is in progress");
		if (this.stage_status[this.current_stage] !== "IN_PROGRESS") throw new InvalidTransition("The current stage has not been started");
		if (!evidenceType.trim() || !sourceRef.trim()) throw new Error("evidence_type and source_ref are required");
		const details: JsonObject = { evidence_type: evidenceType, source_ref: sourceRef };
		if (claimRef !== undefined) details.claim_ref = claimRef;
		if (metadata && Object.keys(metadata).length > 0) details.metadata = metadata;
		return this.emit("EVIDENCE_CAPTURED", this.current_stage, details);
	}

	skipStage(reason: string): Stage | null {
		if (this.status !== "IN_PROGRESS" || this.stage_status[this.current_stage] !== "IN_PROGRESS") {
			throw new InvalidTransition("Only an active stage can be skipped");
		}
		if (!reason.trim()) throw new Error("reason is required");
		const stage = this.current_stage;
		this.stage_status[stage] = "SKIPPED_WITH_REASON";
		this.emit("STAGE_SKIPPED", stage, { reason });
		return this.advanceFrom(stage);
	}

	markFailed(reason: string): void {
		if (this.status !== "IN_PROGRESS" || this.stage_status[this.current_stage] !== "IN_PROGRESS") {
			throw new InvalidTransition("Only an active stage can fail");
		}
		if (!reason.trim()) throw new Error("reason is required");
		this.stage_status[this.current_stage] = "FAILED";
		this.status = "FAILED";
		this.emit("STAGE_FAILED", this.current_stage, { reason });
	}

	completeStage(resultRef?: string, verificationPassed?: boolean): Stage | null {
		const stage = this.current_stage;
		if (this.status !== "IN_PROGRESS") throw new InvalidTransition("No stage is currently in progress");
		if (this.stage_status[stage] !== "IN_PROGRESS") throw new InvalidTransition(`${stage} has not been started`);
		if (stage === "DECISION" && !this.verification_accepted) throw new InvalidTransition("DECISION is blocked until VERIFICATION passes");
		if (stage === "VERIFICATION" && verificationPassed === undefined) throw new Error("verification_passed must be explicitly True or False");

		if (stage === "VERIFICATION" && verificationPassed === false) {
			this.stage_status[stage] = "FAILED";
			this.status = "VERIFICATION_FAILED";
			this.verification_accepted = false;
			this.emit("VERIFICATION_FAILED", stage, { result_ref: resultRef ?? null });
			return null;
		}
		this.stage_status[stage] = "COMPLETED";
		const details: JsonObject = {};
		if (resultRef !== undefined) details.result_ref = resultRef;
		if (stage === "VERIFICATION") {
			this.verification_accepted = true;
			details.verification_passed = true;
		}
		this.emit("STAGE_COMPLETED", stage, details);
		return this.advanceFrom(stage);
	}

	private advanceFrom(stage: Stage): Stage | null {
		const index = STAGE_ORDER.indexOf(stage);
		if (index === STAGE_ORDER.length - 1) {
			this.status = "COMPLETED";
			this.emit("RUN_COMPLETED", stage);
			return null;
		}
		const next = STAGE_ORDER[index + 1] as Stage;
		this.current_stage = next;
		this.stage_status[next] = "READY";
		this.status = "IN_PROGRESS";
		return next;
	}

	reenter(target: Stage, trigger: string, reason: string): Stage {
		if (this.status === "COMPLETED" || this.status === "CANCELLED") throw new InvalidTransition(`Cannot re-enter a ${this.status} run`);
		if (!trigger.trim() || !reason.trim()) throw new Error("trigger and reason are required");
		const targetIndex = STAGE_ORDER.indexOf(target);
		const currentIndex = STAGE_ORDER.indexOf(this.current_stage);
		if (targetIndex > currentIndex) throw new InvalidTransition("Re-entry may target the current or an earlier stage");
		if (this.status === "VERIFICATION_FAILED" && targetIndex >= STAGE_ORDER.indexOf("VERIFICATION")) {
			throw new InvalidTransition("Failed verification must re-enter an earlier corrective stage");
		}
		if (this.reentry_count >= this.max_reentries) throw new InvalidTransition("Maximum re-entry budget exhausted");
		for (const s of STAGE_ORDER.slice(targetIndex)) this.stage_status[s] = "NOT_STARTED";
		this.stage_status[target] = "READY";
		this.current_stage = target;
		this.status = "IN_PROGRESS";
		if (targetIndex <= STAGE_ORDER.indexOf("VERIFICATION")) this.verification_accepted = false;
		this.reentry_count += 1;
		this.emit("PIPELINE_REENTERED", target, {
			trigger, reason, reentry_count: this.reentry_count, max_reentries: this.max_reentries,
		});
		return target;
	}

	markPartial(reason: string): void {
		if (this.status !== "IN_PROGRESS") throw new InvalidTransition("Only an in-progress run can become partial");
		if (this.stage_status[this.current_stage] !== "IN_PROGRESS") throw new InvalidTransition("The current stage has not been started");
		if (!reason.trim()) throw new Error("reason is required");
		this.stage_status[this.current_stage] = "PARTIAL";
		this.status = "PARTIAL";
		this.emit("STAGE_PARTIAL", this.current_stage, { reason });
	}

	markBlocked(reason: string): void {
		if (this.status !== "IN_PROGRESS") throw new InvalidTransition("Only an in-progress run can become blocked");
		if (this.stage_status[this.current_stage] !== "IN_PROGRESS") throw new InvalidTransition("The current stage has not been started");
		if (!reason.trim()) throw new Error("reason is required");
		this.stage_status[this.current_stage] = "BLOCKED";
		this.status = "BLOCKED";
		this.emit("STAGE_BLOCKED", this.current_stage, { reason });
	}

	resumeBlocked(): Stage {
		if (this.status !== "BLOCKED") throw new InvalidTransition("Only a blocked run can be resumed");
		this.stage_status[this.current_stage] = "READY";
		this.status = "IN_PROGRESS";
		this.emit("BLOCK_RESOLVED", this.current_stage);
		return this.current_stage;
	}

	cancel(reason: string): void {
		if (this.status === "COMPLETED") throw new InvalidTransition("A completed run cannot be cancelled");
		if (!reason.trim()) throw new Error("reason is required");
		this.status = "CANCELLED";
		this.emit("RUN_CANCELLED", this.current_stage, { reason });
	}

	snapshot(): JsonObject {
		return {
			run_id: this.run_id,
			pipeline_version: this.pipeline_version,
			current_stage: this.current_stage,
			status: this.status,
			verification_accepted: this.verification_accepted,
			reentry_count: this.reentry_count,
			max_reentries: this.max_reentries,
			stage_status: Object.fromEntries(STAGE_ORDER.map((s) => [s, this.stage_status[s]])),
			events: this.events.map((e) => ({ ...e, details: { ...e.details } })) as unknown as Json[],
		};
	}

	static fromSnapshot(payload: unknown): PipelineRun {
		if (typeof payload !== "object" || payload === null) throw new TypeError("snapshot must be an object");
		const p = payload as Record<string, unknown>;
		const required = ["run_id", "pipeline_version", "current_stage", "status", "verification_accepted", "reentry_count", "max_reentries", "stage_status", "events"];
		const missing = required.filter((k) => !(k in p)).sort();
		if (missing.length) throw new Error(`Snapshot is missing required fields: ${JSON.stringify(missing)}`);
		if (typeof p.run_id !== "string" || typeof p.pipeline_version !== "string") throw new TypeError("run_id and pipeline_version must be strings");
		if (typeof p.verification_accepted !== "boolean") throw new TypeError("verification_accepted must be a boolean");
		if (!Number.isInteger(p.reentry_count) || !Number.isInteger(p.max_reentries)) throw new Error("reentry_count and max_reentries must be integers");
		const rawStatuses = p.stage_status;
		if (typeof rawStatuses !== "object" || rawStatuses === null) throw new TypeError("stage_status must be an object");
		const keys = Object.keys(rawStatuses);
		if (keys.length !== STAGE_ORDER.length || !STAGE_ORDER.every((s) => keys.includes(s))) {
			throw new Error("stage_status must contain exactly the 11 pipeline stages");
		}
		if (!isStage(p.current_stage) || typeof p.status !== "string" || !RUN_STATUSES.has(p.status)) throw new Error("invalid current_stage or status");
		const run = new PipelineRun(p.run_id, p.max_reentries as number);
		run.pipeline_version = p.pipeline_version;
		run.current_stage = p.current_stage;
		run.status = p.status as RunStatus;
		run.verification_accepted = p.verification_accepted;
		run.reentry_count = p.reentry_count as number;
		for (const s of STAGE_ORDER) {
			const value = (rawStatuses as Record<string, unknown>)[s];
			if (typeof value !== "string" || !STAGE_STATUSES.has(value)) throw new Error(`invalid stage status for ${s}`);
			run.stage_status[s] = value as StageStatus;
		}
		if (run.reentry_count < 0 || run.reentry_count > run.max_reentries) throw new Error("reentry_count cannot exceed max_reentries");
		if (!Array.isArray(p.events)) throw new TypeError("events must be an array");
		run.events = p.events.map((item: unknown, index: number) => {
			if (typeof item !== "object" || item === null) throw new TypeError("each event must be an object");
			const e = item as Record<string, unknown>;
			if (e.sequence !== index + 1) throw new Error("event sequence must be contiguous and append-only");
			if (typeof e.timestamp !== "string" || !/(Z|[+-]\d{2}:\d{2})$/.test(e.timestamp) || Number.isNaN(Date.parse(e.timestamp))) {
				throw new Error("event timestamp must be an ISO time with a timezone");
			}
			if (typeof e.event_type !== "string" || !e.event_type.trim()) throw new Error("event_type must be a non-empty string");
			if (!isStage(e.stage)) throw new Error("invalid event stage");
			const details = e.details ?? {};
			if (typeof details !== "object" || details === null || Array.isArray(details)) throw new TypeError("event details must be an object");
			assertFiniteJson(details);
			return { sequence: index + 1, event_type: e.event_type, stage: e.stage, timestamp: e.timestamp, details: details as JsonObject };
		});
		if (run.verification_accepted && run.stage_status.VERIFICATION !== "COMPLETED") throw new Error("verification_accepted requires a completed VERIFICATION stage");
		if (run.status === "COMPLETED" && run.stage_status.FEEDBACK !== "COMPLETED") throw new Error("a completed run must have a completed FEEDBACK stage");
		if (run.status === "VERIFICATION_FAILED" && run.stage_status.VERIFICATION !== "FAILED") throw new Error("VERIFICATION_FAILED requires a failed VERIFICATION stage");
		return run;
	}

	private emit(eventType: string, stage: Stage, details: JsonObject = {}): PipelineEvent {
		assertFiniteJson(details);
		const event: PipelineEvent = { sequence: this.events.length + 1, event_type: eventType, stage, timestamp: nowIso(), details: { ...details } };
		this.events.push(event);
		return event;
	}
}
