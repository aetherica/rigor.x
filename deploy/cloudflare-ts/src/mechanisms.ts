// Analytical mechanism selection (WS19). Ported from src/rigorx/reasoning_controller.py, which was
// written and tested but never reached the live engine: SELECT_METHODS only validated whatever the
// host declared, and rigorx_route returned a fixed list of three or four method names per intent.
// The engine can do better deterministically: the router already knows the intent, the analysis
// modes and the risk, and those imply which analytical mechanisms a task needs.
//
// This selects CANDIDATES and says why. It executes nothing, and it does not claim the host has the
// capability: a mechanism the caller declares unavailable is reported as a gap instead of being
// silently dropped (the same rule as IDENTIFY_CAPABILITIES).

import { levelRank, type Level } from "./protocol.ts";
import type { AdaptiveProfile, TaskIntent } from "./router.ts";

/**
 * The mechanisms the engine can suggest. The first nine come from WS19; the rest were added in the
 * 2026-11-28 reasoning pass, each one chosen because the VALIDATE gate already checks the thing it
 * produces. That is the design rule here: a suggested mechanism should be work the run will later
 * be held to, not advice that disappears.
 */
export const MECHANISMS = [
	"STRUCTURED_DECOMPOSITION", "EVIDENCE_SEARCH", "CAUSAL_COUNTERFACTUAL", "PROBABILISTIC",
	"CONSTRAINT_OPTIMIZATION", "TEMPORAL_SEQUENTIAL", "TOOL_AUGMENTED", "STRATEGIC_SYSTEMS",
	"CREATIVE_DIVERGENCE",
	// Gate-backed additions:
	"SOURCE_TRIANGULATION",   // L03 claim statuses, L06 two independent origin groups
	"DIMENSIONAL_CHECK",      // L06 numeric claims need a rigorx_compute receipt for their own value
	"ASSUMPTION_SURFACING",   // L04 requires the assumptions register
	"ADVERSARIAL_REVIEW",     // L06 methods; STRESS_TEST scenarios per must-requirement
	"SENSITIVITY_ANALYSIS",   // which input changes the conclusion
	"BASE_RATE_ANCHORING",    // a forecast compared against its reference class
	"STAKEHOLDER_MAPPING",    // who is affected, and their incentives
] as const;
export type Mechanism = (typeof MECHANISMS)[number];

export const TASK_KINDS = ["GENERAL", "RESEARCH", "CAUSAL", "DECISION", "QUANTITATIVE", "CREATIVE", "TECHNICAL", "DIAGNOSTIC"] as const;
export type TaskKind = (typeof TASK_KINDS)[number];

export interface TaskProfile {
	kind: TaskKind;
	/** 1-6, the level's own rank (levelRank is already 1-based: L01 is 1, L06 is 6). */
	intensity: number;
	risk: number;
	uncertainty: number;
	evidenceRequired: boolean;
	timeSensitive: boolean;
	/** The task asks what will happen, not what is. */
	forecast: boolean;
	/** Declared by the caller; RIGOR-X cannot see the host's tools. */
	toolCapable: boolean;
	/** When given, mechanisms outside it are reported as gaps instead of selected. */
	available?: readonly Mechanism[];
}

export interface MechanismPlan {
	primary: Mechanism | null;
	supporting: Mechanism[];
	rationale: string[];
	intensity: number;
	capability_gaps: string[];
}

/** The analysis mode is a stronger signal than the intent: "why did X happen" is causal work. */
const KIND_BY_MODE: Partial<Record<string, TaskKind>> = {
	CAUSAL: "CAUSAL", DIAGNOSTIC: "DIAGNOSTIC", QUANTITATIVE: "QUANTITATIVE",
	FORENSIC: "DIAGNOSTIC", STRATEGIC: "DECISION", COMPARATIVE: "DECISION",
};
const KIND_BY_INTENT: Record<TaskIntent, TaskKind> = {
	RESEARCH: "RESEARCH", ANALYSIS: "DIAGNOSTIC", DECISION: "DECISION", TECHNICAL: "TECHNICAL",
	CREATIVE: "CREATIVE", EXECUTION: "GENERAL", INFORMATION: "GENERAL", COMMUNICATION: "GENERAL", UNKNOWN: "GENERAL",
};

/** A task that asks what will happen, where a reference class is the honest starting point. */
const FORECAST = /\b(forecast|predict|projection|will (it|this|that|we|they|the)\b|likelihood|probability of|how likely|by 20\d\d|next (year|quarter|decade))\b|পূর্বাভাস|সম্ভাবনা|কত দিনে|अनुमान|संभावना/iu;

/** Words that make a task time-sensitive, in the languages the router already covers. */
const TIME_SENSITIVE = /\b(urgent|urgently|today|tonight|tomorrow|deadline|asap|immediately|right now|by (monday|tuesday|wednesday|thursday|friday|saturday|sunday)|this (week|morning|afternoon|evening))\b|জরুরি|আজকে?ই|আগামীকাল|এখনই|সময়সীমা|तुरंत|आज ही|समयसीमा/iu;

export function taskProfile(profile: AdaptiveProfile, task: string, opts: { available?: readonly Mechanism[]; toolCapable?: boolean } = {}): TaskProfile {
	const fromMode = profile.modes.map((m) => KIND_BY_MODE[m]).find((k): k is TaskKind => !!k);
	const kind = fromMode ?? KIND_BY_INTENT[profile.intent];
	return {
		kind,
		intensity: levelRank(profile.level as Level),
		risk: Math.min(1, profile.risk_score / 5),
		// The router found no intent signal, so the task's shape is genuinely unknown: that is
		// uncertainty about the task itself, which CLASSIFY must resolve (directive §2.2).
		uncertainty: profile.intent === "UNKNOWN" ? 0.7 : 0,
		evidenceRequired: profile.intent === "RESEARCH" || kind === "RESEARCH" || profile.risk_score > 0,
		timeSensitive: TIME_SENSITIVE.test(task),
		forecast: FORECAST.test(task),
		toolCapable: opts.toolCapable ?? false,
		...(opts.available ? { available: opts.available } : {}),
	};
}

export function selectMechanisms(profile: TaskProfile): MechanismPlan {
	const selected: Mechanism[] = [];
	const rationale: string[] = [];
	const gaps: string[] = [];
	const add = (mechanism: Mechanism, reason: string) => {
		if (profile.available && !profile.available.includes(mechanism)) {
			gaps.push(`${mechanism} unavailable: ${reason}`);
		} else if (!selected.includes(mechanism)) {
			selected.push(mechanism);
			rationale.push(`${mechanism}: ${reason}`);
		}
	};
	add("STRUCTURED_DECOMPOSITION", "default task decomposition");
	if (profile.kind === "RESEARCH" || profile.evidenceRequired) add("EVIDENCE_SEARCH", "research or evidence requirement");
	if (profile.kind === "CAUSAL" || profile.kind === "DIAGNOSTIC") {
		add("CAUSAL_COUNTERFACTUAL", "causal or root-mechanism analysis");
		add("STRATEGIC_SYSTEMS", "system interdependencies and feedback");
	}
	if (profile.kind === "DECISION" || profile.risk >= 0.6) {
		add("CONSTRAINT_OPTIMIZATION", "decision trade-offs or high risk");
		add("PROBABILISTIC", "uncertainty-aware evaluation");
	}
	if (profile.kind === "QUANTITATIVE") {
		add("CONSTRAINT_OPTIMIZATION", "quantitative constraints");
		add("PROBABILISTIC", "statistical interpretation");
	}
	if (profile.timeSensitive) add("TEMPORAL_SEQUENTIAL", "time-sensitive analysis");
	if (profile.toolCapable) add("TOOL_AUGMENTED", "tools declared available by the caller");
	if (profile.kind === "CREATIVE") add("CREATIVE_DIVERGENCE", "divergent ideation");
	if (profile.uncertainty >= 0.6 || profile.intensity >= 5) add("PROBABILISTIC", "high uncertainty or intensity");
	// Each rule below mirrors a check the gate applies at that level, so the suggestion is work the
	// run will be held to rather than advice.
	if (profile.evidenceRequired && profile.intensity >= 3) {
		add("SOURCE_TRIANGULATION", "from L03 every cited source needs a claim status, and L06 needs two independent origins");
	}
	if (profile.kind === "QUANTITATIVE" || profile.intensity >= 6) {
		add("DIMENSIONAL_CHECK", "a numeric claim needs its own checked computation at L06 (rigorx_compute with expect)");
	}
	if (profile.intensity >= 4) add("ASSUMPTION_SURFACING", "from L04 the assumptions register is required, with each consequence if false");
	if (profile.intensity >= 5 || profile.risk >= 0.6) {
		add("ADVERSARIAL_REVIEW", "high stakes: STRESS_TEST needs a failure scenario for every must-requirement");
	}
	if ((profile.kind === "DECISION" || profile.kind === "QUANTITATIVE") && profile.intensity >= 4) {
		add("SENSITIVITY_ANALYSIS", "which input would change the conclusion");
	}
	if (profile.forecast) {
		add("BASE_RATE_ANCHORING", "a forecast starts from its reference class, not from the current case alone");
		add("PROBABILISTIC", "a forecast states a probability, not a certainty");
	}
	if (profile.kind === "DECISION" && profile.intensity >= 4) add("STAKEHOLDER_MAPPING", "who is affected by this decision, and their incentives");
	return { primary: selected[0] ?? null, supporting: selected.slice(1), rationale, intensity: profile.intensity, capability_gaps: gaps };
}

/** One line for the SELECT_METHODS guidance: what the engine suggests, and that it is a suggestion. */
export function mechanismHint(plan: MechanismPlan): string {
	if (!plan.primary) return "";
	const all = [plan.primary, ...plan.supporting];
	return ` Suggested by the task profile (candidates, not a requirement; name the ones you use and why, or your own): ${all.join(", ")}.`;
}
