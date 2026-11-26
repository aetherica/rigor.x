// Engine protocol v2 (WS32 P1): the twelve distinct stages, the six intensity levels and the
// level-dependent stage policy. Pure data and pure functions; the state machine is in run.ts.
// Decisions: ADR-002 (twelve stages, never merged), ADR-003 (mandatory stages by level),
// ADR-004 (OPTIMIZE -> VALIDATE loop guard), owner confirmation 2026-11-26.

export const PROTOCOL_VERSION = "2.0.0";

export const STAGES = [
	"QUERY", "CLASSIFY", "SELECT_METHODS", "ASSESS_COMPLEXITY", "IDENTIFY_CAPABILITIES", "PLAN",
	"EXECUTE", "EVALUATE_EVIDENCE", "VALIDATE", "STRESS_TEST", "OPTIMIZE", "DELIVER",
] as const;
export type Stage = (typeof STAGES)[number];

export const LEVELS = ["L01_BASIC", "L02_STANDARD", "L03_DEEP", "L04_COMPLEX", "L05_CRITICAL", "L06_HYPER_RIGOROUS"] as const;
export type Level = (typeof LEVELS)[number];

export const isStage = (v: unknown): v is Stage => typeof v === "string" && (STAGES as readonly string[]).includes(v);
export const isLevel = (v: unknown): v is Level => typeof v === "string" && (LEVELS as readonly string[]).includes(v);
export const stageIndex = (s: Stage) => STAGES.indexOf(s);
export const levelRank = (l: Level) => LEVELS.indexOf(l) + 1; // 1..6
export const maxLevel = (...levels: Level[]): Level => levels.reduce((a, b) => (levelRank(b) > levelRank(a) ? b : a));

/** ADR-003: stages that may not be skipped, cumulative by level. Others are auto-skipped with a recorded reason. */
const ADDED_AT: Record<Level, Stage[]> = {
	L01_BASIC: ["QUERY", "CLASSIFY", "EXECUTE", "DELIVER"],
	L02_STANDARD: ["PLAN", "VALIDATE"],
	L03_DEEP: ["SELECT_METHODS", "IDENTIFY_CAPABILITIES", "EVALUATE_EVIDENCE"],
	L04_COMPLEX: ["ASSESS_COMPLEXITY", "OPTIMIZE"],
	L05_CRITICAL: ["STRESS_TEST"],
	L06_HYPER_RIGOROUS: [],
};
export function mandatoryStages(level: Level): Stage[] {
	const set = new Set<Stage>();
	for (const l of LEVELS) {
		for (const s of ADDED_AT[l]) set.add(s);
		if (l === level) break;
	}
	return STAGES.filter((s) => set.has(s));
}
export const isMandatory = (stage: Stage, level: Level) => mandatoryStages(level).includes(stage);

/** Stakes declared at CLASSIFY set a level floor. */
export const STAKES = ["low", "medium", "high", "critical"] as const;
export type Stakes = (typeof STAKES)[number];
export const STAKES_FLOOR: Record<Stakes, Level> = { low: "L01_BASIC", medium: "L03_DEEP", high: "L04_COMPLEX", critical: "L05_CRITICAL" };

/** Epistemic statuses for claims (directive §2.2). */
export const CLAIM_STATUSES = [
	"ESTABLISHED", "VERIFIED", "SUPPORTED", "PROBABLE", "PLAUSIBLE", "HYPOTHESIS",
	"UNVERIFIED", "UNKNOWN", "CONTRADICTED", "FAILED", "BLOCKED",
] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];
/** Statuses strong enough to support a requirement marked as met at L03 and above. */
export const SUPPORTING_STATUSES: ReadonlySet<ClaimStatus> = new Set(["ESTABLISHED", "VERIFIED", "SUPPORTED"]);
/** Statuses that must never support a requirement marked as met. */
export const DISQUALIFYING_STATUSES: ReadonlySet<ClaimStatus> = new Set(["CONTRADICTED", "FAILED", "BLOCKED"]);

/** ADR-004 */
export const MAX_OPTIMIZE_CYCLES = 2;

/** Verification levels reported per requirement, weakest first. */
export const VERIFICATION_LEVELS = ["structural", "sources_resolved", "computations_checked"] as const;
export type VerificationLevel = (typeof VERIFICATION_LEVELS)[number];

export const STAGE_GUIDANCE: Record<Stage, string> = {
	QUERY: "Restate the request and the context it depends on (prior decisions, constraints, what is missing). Submit a summary; optionally data.constraints and data.ambiguities (lists of short texts).",
	CLASSIFY: "Submit data.objective, data.deliverable and data.requirements: pre-registered acceptance criteria [{id, text, importance: must|should, items?: [names that each need their own evidence], max_age_days?}]. Declare data.level (L01-L06) and data.stakes (low|medium|high|critical); both are required when the router found no signal. The level can only rise.",
	SELECT_METHODS: "Submit data.methods: [{name, reason}] — the analytical, computational or research methods this task needs and why.",
	ASSESS_COMPLEXITY: "Confirm the level or raise it with data.level (never lower). Raising it can make earlier stages mandatory; the run then returns to them.",
	IDENTIFY_CAPABILITIES: "Submit data.available and data.missing: capability names (for example web_search, code_execution, files). RIGOR-X cannot see your tools; missing capabilities the plan relies on must be disclosed at DELIVER.",
	PLAN: "Submit data.operations: [{id, capability, depends_on: [ids], parallel_group?, completion_condition, requirement_ids?, tier?}]. The graph must be acyclic and reference existing operations. tier is the autonomy tier A0 observe, A1 analyze, A2 recommend, A3 reversible action, A4 consequential action, A5 restricted (required from L05); a done A4/A5 operation must cite a USER_APPROVAL recorded for it (rigorx_record_evidence with evidence_type USER_APPROVAL and approves=<operation id>; single use, valid 24 h, invalid if the operation changes).",
	EXECUTE: "Do the work with your tools. Record sources with rigorx_record_evidence (declare source_domain, derived_from or origin_ref when a source copies another) and actions with rigorx_report_action (failures too). If a plan exists, submit data.operations: [{id, status: done|failed|not_done, evidence_ids}] for every planned operation; an operation can only be done when every operation it depends on is done.",
	EVALUATE_EVIDENCE: "Submit data.claims: [{id, text, status, evidence_ids, requirement_ids?, numeric?, value?: {status: KNOWN|ZERO|UNKNOWN|NOT_COLLECTED|UNAVAILABLE|NOT_APPLICABLE, number?, unit?}}] with an epistemic status each (an unknown value is never a zero; a numeric claim states its value so a rigorx_compute receipt with expect can be checked against it, required at L06), data.contradictions: [{claim_ids, resolved, note}] and data.assumptions: [{id, text, consequence_if_false, status: unverified|verified|refuted}].",
	VALIDATE: "Call rigorx_verify with requirements: [{id, met: true|false|partial, evidence_ids, items?: [{id, evidence_ids}]}] answering every pre-registered requirement. Submitting this stage directly is not allowed.",
	STRESS_TEST: "Submit data.scenarios: [{id, requirement_ids, failure_mode, outcome: survives|breaks|unknown, mitigation?}] — at least one failure scenario per must-requirement.",
	OPTIMIZE: "Submit data.changed (true if you revised the result) and data.result_summary (the result as it now stands). A changed result returns to VALIDATE (at most 2 cycles; an unchanged fingerprint stops the loop).",
	DELIVER: "Submit the final summary and the disclosures the engine lists in requires: data.unmet_requirements, data.missing_capabilities, data.unverified_assumptions, data.broken_scenarios, data.unknown_values, data.limitations.",
};
