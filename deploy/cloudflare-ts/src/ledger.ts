// Stage contracts of engine protocol v2 (WS32 P1, ADR-005/006): what the host must submit in
// `data` for each stage, validated into typed ledger entries. Host texts are stored only as
// SHA-256 digests and lengths (privacy model of the run store); IDs, statuses, capability and
// method names are stored as given because the gate and the disclosures compare them.
import {
	CLAIM_STATUSES, LEVELS, STAKES, isLevel, levelRank, type ClaimStatus, type Level, type Stage, type Stakes,
} from "./protocol.ts";
import {
	chars, digest, evidenceIds, fingerprint, ident, invalid, list, object, oneOf, storedNote, substantial, text,
	type StoredText, type TextPolicy,
} from "./text.ts";

export interface RequirementItem { id: string; name: StoredText }
export interface Requirement {
	id: string;
	text: StoredText;
	importance: "must" | "should";
	items: RequirementItem[];
	max_age_days: number | null;
}
export interface Operation {
	id: string;
	capability: string;
	depends_on: string[];
	parallel_group: string | null;
	completion_condition: StoredText;
	requirement_ids: string[];
	/** Autonomy tier (directive §15): A0 observe … A5 restricted; A4/A5 need a USER_APPROVAL receipt when done. */
	tier: AutonomyTier | null;
}
export const AUTONOMY_TIERS = ["A0", "A1", "A2", "A3", "A4", "A5"] as const;
export type AutonomyTier = (typeof AUTONOMY_TIERS)[number];
/** Value status of a claimed quantity (WS32 P3): an unknown value is never a zero. */
export const VALUE_STATUSES = ["KNOWN", "ZERO", "UNKNOWN", "NOT_COLLECTED", "UNAVAILABLE", "NOT_APPLICABLE"] as const;
export type ValueStatus = (typeof VALUE_STATUSES)[number];
export const UNKNOWN_VALUES: ReadonlySet<ValueStatus> = new Set(["UNKNOWN", "NOT_COLLECTED", "UNAVAILABLE"]);
export interface OperationReport { id: string; status: "done" | "failed" | "not_done"; evidence_ids: string[] }
export interface Claim {
	id: string; text: StoredText; status: ClaimStatus; evidence_ids: string[]; requirement_ids: string[]; numeric: boolean;
	value: { status: ValueStatus; number: number | null; unit: string | null } | null;
}
export interface Contradiction { claim_ids: string[]; resolved: boolean; note: StoredText }
export interface Assumption { id: string; text: StoredText; consequence_if_false: StoredText; status: "unverified" | "verified" | "refuted"; evidence_ids: string[] }
export interface Scenario { id: string; requirement_ids: string[]; failure_mode: StoredText; outcome: "survives" | "breaks" | "unknown"; mitigation: StoredText | null }

export interface Ledger {
	query?: { constraints: StoredText[]; ambiguities: StoredText[] };
	classify?: {
		objective: StoredText; deliverable: StoredText; stakes: Stakes | null; declared_level: Level | null;
		language: string | null; requirements: Requirement[];
	};
	methods?: { name: string; reason: StoredText }[];
	complexity?: { declared_level: Level | null };
	capabilities?: { available: string[]; missing: string[] };
	plan?: { operations: Operation[] };
	execution?: { operations: OperationReport[] };
	evaluation?: { claims: Claim[]; contradictions: Contradiction[]; assumptions: Assumption[] | null };
	stress?: { scenarios: Scenario[] };
	optimize?: { changed: boolean; result: StoredText; fingerprint: string };
	delivery?: {
		unmet_requirements: string[]; missing_capabilities: string[]; unverified_assumptions: string[];
		broken_scenarios: string[]; unknown_values: string[]; limitations: StoredText[];
	};
}

/** Ledger key written by each stage; cleared when the stage is reset by a re-entry. */
export const STAGE_LEDGER_KEY: Partial<Record<Stage, keyof Ledger>> = {
	QUERY: "query", CLASSIFY: "classify", SELECT_METHODS: "methods", ASSESS_COMPLEXITY: "complexity",
	IDENTIFY_CAPABILITIES: "capabilities", PLAN: "plan", EXECUTE: "execution", EVALUATE_EVIDENCE: "evaluation",
	STRESS_TEST: "stress", OPTIMIZE: "optimize", DELIVER: "delivery",
};

export interface ContractContext {
	policy: TextPolicy;
	maxText: number;
	level: Level;
	classificationUnknown: boolean;
	ledger: Ledger;
	evidence: ReadonlySet<string>;
}

const MAX_NOTE = 2_048;
const capabilityName = (name: string, v: unknown): string => {
	const t = text(name, v, 64).trim().toLowerCase();
	if (!/^[\p{L}\p{N}][\p{L}\p{N} _.:/-]{0,63}$/u.test(t)) throw invalid(`${name} must be a short capability name such as web_search`);
	return t;
};
const optionalNotes = (name: string, v: unknown, ctx: ContractContext, max: number) =>
	list(name, v, max, false).map((x, i) => storedNote(`${name}[${i}]`, x, ctx.policy, MAX_NOTE, "state it in a short sentence"));

function uniqueIds<T extends { id: string }>(name: string, items: T[]): T[] {
	const seen = new Set<string>();
	for (const it of items) {
		if (seen.has(it.id)) throw invalid(`${name}: duplicate ID ${it.id}`);
		seen.add(it.id);
	}
	return items;
}

function requirementRefs(name: string, v: unknown, ctx: ContractContext, required: boolean): string[] {
	const known = new Set((ctx.ledger.classify?.requirements ?? []).map((r) => r.id));
	const ids = list(name, v, 50, required).map((x, i) => ident(`${name}[${i}]`, x));
	for (const id of ids) if (!known.has(id)) throw invalid(`${name}: ${id} is not a registered requirement`);
	if (required && ids.length === 0) throw invalid(`${name} must name at least one requirement`);
	return [...new Set(ids)];
}

// ---------------------------------------------------------------- stage contracts

export function queryContract(data: Record<string, unknown>, ctx: ContractContext): Ledger["query"] {
	return { constraints: optionalNotes("data.constraints", data.constraints, ctx, 30), ambiguities: optionalNotes("data.ambiguities", data.ambiguities, ctx, 30) };
}

/** Returns the slice and the level the run must have at least after CLASSIFY. */
export function classifyContract(data: Record<string, unknown>, ctx: ContractContext, stakesFloor: Record<Stakes, Level>): { slice: NonNullable<Ledger["classify"]>; level: Level } {
	const objective = storedNote("data.objective", data.objective, ctx.policy, ctx.maxText, "state the objective in one sentence");
	const deliverable = storedNote("data.deliverable", data.deliverable, ctx.policy, ctx.maxText, "state what will be delivered");
	const declared = data.level === undefined || data.level === null ? null : oneOf("data.level", data.level, LEVELS);
	const stakes = data.stakes === undefined || data.stakes === null ? null : oneOf("data.stakes", data.stakes, STAKES);
	if (ctx.classificationUnknown && (declared === null || stakes === null)) {
		throw invalid("The router found no signal in this task (classification_unknown), so data.level and data.stakes are required: unknown is not treated as low risk");
	}
	const language = data.language === undefined || data.language === null ? null : text("data.language", data.language, 35);
	if (language !== null && !/^[A-Za-z]{2,3}(-[A-Za-z0-9]{1,8})*$/.test(language)) throw invalid("data.language must be a BCP 47 tag such as bn, en or zh-Hans");
	let level = ctx.level;
	for (const l of [declared, stakes ? stakesFloor[stakes] : null]) if (l && levelRank(l) > levelRank(level)) level = l;
	const raw = list("data.requirements", data.requirements, 50, false);
	const requirements = uniqueIds("data.requirements", raw.map((r, i) => {
		const o = object(`data.requirements[${i}]`, r);
		const id = ident(`data.requirements[${i}].id`, o.id);
		const items = list(`data.requirements[${i}].items`, o.items, 50, false).map((name, j) => {
			const t = text(`data.requirements[${i}].items[${j}]`, name, 200);
			return { id: `${id}.${j + 1}`, name: { sha256: digest(t), chars: chars(t) } };
		});
		let maxAge: number | null = null;
		if (o.max_age_days !== undefined && o.max_age_days !== null) {
			if (typeof o.max_age_days !== "number" || !Number.isInteger(o.max_age_days) || o.max_age_days < 1 || o.max_age_days > 36_500) {
				throw invalid(`data.requirements[${i}].max_age_days must be a whole number of days from 1 to 36500`);
			}
			maxAge = o.max_age_days;
		}
		return {
			id,
			text: storedNote(`data.requirements[${i}].text`, o.text, ctx.policy, ctx.maxText, "state what must be true"),
			importance: o.importance === undefined || o.importance === null ? "must" as const : oneOf(`data.requirements[${i}].importance`, o.importance, ["must", "should"] as const),
			items,
			max_age_days: maxAge,
		};
	}));
	if (levelRank(level) >= levelRank("L02_STANDARD") && requirements.length === 0) {
		throw invalid(`At ${level} the requirements must be pre-registered here: data.requirements needs at least one {id, text}`);
	}
	return { slice: { objective, deliverable, stakes, declared_level: declared, language, requirements }, level };
}

export function methodsContract(data: Record<string, unknown>, ctx: ContractContext): NonNullable<Ledger["methods"]> {
	const raw = list("data.methods", data.methods, 30);
	if (!raw.length) throw invalid("data.methods must name at least one method");
	return raw.map((m, i) => {
		const o = object(`data.methods[${i}]`, m);
		return { name: text(`data.methods[${i}].name`, o.name, 80).trim(), reason: storedNote(`data.methods[${i}].reason`, o.reason, ctx.policy, MAX_NOTE, "say why this method fits") };
	});
}

export function complexityContract(data: Record<string, unknown>, ctx: ContractContext): { slice: NonNullable<Ledger["complexity"]>; level: Level } {
	const declared = data.level === undefined || data.level === null ? null : oneOf("data.level", data.level, LEVELS);
	if (declared && levelRank(declared) < levelRank(ctx.level)) {
		throw invalid(`The level can only rise during a run: it is ${ctx.level}, ${declared} would lower it`);
	}
	return { slice: { declared_level: declared }, level: declared ?? ctx.level };
}

export function capabilitiesContract(data: Record<string, unknown>): NonNullable<Ledger["capabilities"]> {
	const available = [...new Set(list("data.available", data.available, 50).map((v, i) => capabilityName(`data.available[${i}]`, v)))];
	const missing = [...new Set(list("data.missing", data.missing, 50).map((v, i) => capabilityName(`data.missing[${i}]`, v)))];
	const both = available.filter((c) => missing.includes(c));
	if (both.length) throw invalid(`A capability cannot be both available and missing: ${both.join(", ")}`);
	return { available, missing };
}

export function planContract(data: Record<string, unknown>, ctx: ContractContext): NonNullable<Ledger["plan"]> {
	const raw = list("data.operations", data.operations, 100);
	if (!raw.length) throw invalid("data.operations must contain at least one operation");
	const declared = ctx.ledger.capabilities ? new Set([...ctx.ledger.capabilities.available, ...ctx.ledger.capabilities.missing]) : null;
	const tierRequired = levelRank(ctx.level) >= levelRank("L05_CRITICAL");
	const ops = uniqueIds("data.operations", raw.map((r, i) => {
		const o = object(`data.operations[${i}]`, r);
		const tier = o.tier === undefined || o.tier === null ? null : oneOf(`data.operations[${i}].tier`, o.tier, AUTONOMY_TIERS);
		if (tierRequired && tier === null) throw invalid(`At ${ctx.level} every operation needs an autonomy tier: data.operations[${i}].tier (A0 observe, A1 analyze, A2 recommend, A3 reversible action, A4 consequential approved action, A5 restricted)`);
		const capability = capabilityName(`data.operations[${i}].capability`, o.capability);
		if (declared && !declared.has(capability)) throw invalid(`data.operations[${i}].capability ${capability} was not declared at IDENTIFY_CAPABILITIES (available or missing)`);
		return {
			id: ident(`data.operations[${i}].id`, o.id),
			capability,
			depends_on: list(`data.operations[${i}].depends_on`, o.depends_on, 100, false).map((d, j) => ident(`data.operations[${i}].depends_on[${j}]`, d)),
			parallel_group: o.parallel_group === undefined || o.parallel_group === null ? null : ident(`data.operations[${i}].parallel_group`, o.parallel_group),
			completion_condition: storedNote(`data.operations[${i}].completion_condition`, o.completion_condition, ctx.policy, MAX_NOTE, "say how you will know it is done"),
			requirement_ids: requirementRefs(`data.operations[${i}].requirement_ids`, o.requirement_ids, ctx, false),
			tier,
		};
	}));
	const ids = new Set(ops.map((o) => o.id));
	for (const o of ops) for (const d of o.depends_on) {
		if (d === o.id) throw invalid(`Operation ${o.id} depends on itself`);
		if (!ids.has(d)) throw invalid(`Operation ${o.id} depends on unknown operation ${d}`);
	}
	const cycle = findCycle(ops);
	if (cycle) throw invalid(`The plan has a dependency cycle: ${cycle.join(" -> ")}`);
	return { operations: ops };
}

/** Kahn's algorithm; returns one cycle (as a path) if the graph is not acyclic. */
export function findCycle(ops: { id: string; depends_on: string[] }[]): string[] | null {
	const indegree = new Map(ops.map((o) => [o.id, o.depends_on.length]));
	const dependents = new Map<string, string[]>(ops.map((o) => [o.id, []]));
	for (const o of ops) for (const d of o.depends_on) dependents.get(d)!.push(o.id);
	const queue = ops.filter((o) => o.depends_on.length === 0).map((o) => o.id);
	let seen = 0;
	while (queue.length) {
		const id = queue.shift()!;
		seen++;
		for (const n of dependents.get(id)!) {
			indegree.set(n, indegree.get(n)! - 1);
			if (indegree.get(n) === 0) queue.push(n);
		}
	}
	if (seen === ops.length) return null;
	// Walk dependencies from a node still in a cycle until a node repeats.
	const byId = new Map(ops.map((o) => [o.id, o]));
	let cur = ops.find((o) => indegree.get(o.id)! > 0)!.id;
	const path: string[] = [];
	while (!path.includes(cur)) {
		path.push(cur);
		cur = byId.get(cur)!.depends_on.find((d) => indegree.get(d)! > 0)!;
	}
	return [...path.slice(path.indexOf(cur)), cur];
}

export function executeContract(data: Record<string, unknown>, ctx: ContractContext, approvals: ReadonlySet<string> = new Set()): NonNullable<Ledger["execution"]> {
	const planned = ctx.ledger.plan?.operations ?? [];
	const raw = list("data.operations", data.operations, 100, planned.length > 0);
	const reports = uniqueIds("data.operations", raw.map((r, i) => {
		const o = object(`data.operations[${i}]`, r);
		const status = oneOf(`data.operations[${i}].status`, o.status, ["done", "failed", "not_done"] as const);
		const ids = evidenceIds(`data.operations[${i}].evidence_ids`, o.evidence_ids, ctx.evidence, false);
		if (status === "done" && ids.length === 0) throw invalid(`data.operations[${i}]: a done operation must cite the evidence or action receipts that show it`);
		return { id: ident(`data.operations[${i}].id`, o.id), status, evidence_ids: ids };
	}));
	const reported = new Set(reports.map((r) => r.id));
	const unknown = reports.filter((r) => !planned.some((p) => p.id === r.id)).map((r) => r.id);
	if (unknown.length) throw invalid(`Not in the plan: ${unknown.join(", ")}`);
	const missing = planned.filter((p) => !reported.has(p.id)).map((p) => p.id);
	if (missing.length) throw invalid(`Report every planned operation; missing: ${missing.join(", ")}`);
	for (const p of planned) {
		const rep = reports.find((r) => r.id === p.id)!;
		if ((p.tier === "A4" || p.tier === "A5") && rep.status === "done" && !rep.evidence_ids.some((e) => approvals.has(e))) {
			throw invalid(`Operation ${p.id} is tier ${p.tier}: a done ${p.tier} operation must cite the user's approval, recorded with rigorx_record_evidence (evidence_type USER_APPROVAL)`);
		}
	}
	return { operations: reports };
}

export function evaluationContract(data: Record<string, unknown>, ctx: ContractContext): NonNullable<Ledger["evaluation"]> {
	const claims = uniqueIds("data.claims", list("data.claims", data.claims, 200).map((r, i) => {
		const o = object(`data.claims[${i}]`, r);
		const status = oneOf(`data.claims[${i}].status`, o.status, CLAIM_STATUSES);
		const needsEvidence = ["ESTABLISHED", "VERIFIED", "SUPPORTED", "PROBABLE"].includes(status);
		const ids = evidenceIds(`data.claims[${i}].evidence_ids`, o.evidence_ids, ctx.evidence, false);
		if (needsEvidence && ids.length === 0) throw invalid(`data.claims[${i}]: status ${status} needs evidence_ids`);
		if (o.numeric !== undefined && o.numeric !== null && typeof o.numeric !== "boolean") throw invalid(`data.claims[${i}].numeric must be true or false`);
		let value: Claim["value"] = null;
		if (o.value !== undefined && o.value !== null) {
			const v = object(`data.claims[${i}].value`, o.value);
			const vs = oneOf(`data.claims[${i}].value.status`, v.status, VALUE_STATUSES);
			const num = v.number === undefined || v.number === null ? null : v.number;
			if (num !== null && (typeof num !== "number" || !Number.isFinite(num))) throw invalid(`data.claims[${i}].value.number must be a finite number`);
			if (vs === "KNOWN" && num === null) throw invalid(`data.claims[${i}].value: a KNOWN value needs its number`);
			if (vs === "ZERO" && num !== null && num !== 0) throw invalid(`data.claims[${i}].value: a ZERO value is 0`);
			if (vs === "ZERO" && ids.length === 0) throw invalid(`data.claims[${i}].value: a measured ZERO needs evidence_ids; if the value is not known use UNKNOWN or NOT_COLLECTED, never ZERO`);
			if (UNKNOWN_VALUES.has(vs) || vs === "NOT_APPLICABLE") {
				if (num !== null) throw invalid(`data.claims[${i}].value: a ${vs} value has no number (do not fill an unknown with a guess or a zero)`);
			}
			value = { status: vs, number: vs === "ZERO" ? 0 : (num as number | null), unit: v.unit === undefined || v.unit === null ? null : text(`data.claims[${i}].value.unit`, v.unit, 40) };
		}
		return {
			id: ident(`data.claims[${i}].id`, o.id),
			text: storedNote(`data.claims[${i}].text`, o.text, ctx.policy, ctx.maxText, "state the claim"),
			status,
			evidence_ids: ids,
			requirement_ids: requirementRefs(`data.claims[${i}].requirement_ids`, o.requirement_ids, ctx, false),
			numeric: o.numeric === true || value !== null,
			value,
		};
	}));
	const claimIds = new Set(claims.map((c) => c.id));
	const contradictions = list("data.contradictions", data.contradictions, 100, false).map((r, i) => {
		const o = object(`data.contradictions[${i}]`, r);
		const ids = list(`data.contradictions[${i}].claim_ids`, o.claim_ids, 10).map((x, j) => ident(`data.contradictions[${i}].claim_ids[${j}]`, x));
		if (new Set(ids).size < 2) throw invalid(`data.contradictions[${i}].claim_ids must name at least two different claims`);
		for (const id of ids) if (!claimIds.has(id)) throw invalid(`data.contradictions[${i}]: unknown claim ${id}`);
		if (typeof o.resolved !== "boolean") throw invalid(`data.contradictions[${i}].resolved must be true or false`);
		return { claim_ids: [...new Set(ids)], resolved: o.resolved, note: storedNote(`data.contradictions[${i}].note`, o.note, ctx.policy, MAX_NOTE, "say what conflicts and how it was or was not resolved") };
	});
	const assumptionsRequired = levelRank(ctx.level) >= levelRank("L04_COMPLEX");
	if (assumptionsRequired && (data.assumptions === undefined || data.assumptions === null)) {
		throw invalid(`At ${ctx.level} the assumptions register is required: submit data.assumptions (an empty list states that there are none)`);
	}
	const assumptions = data.assumptions === undefined || data.assumptions === null ? null : uniqueIds("data.assumptions", list("data.assumptions", data.assumptions, 100).map((r, i) => {
		const o = object(`data.assumptions[${i}]`, r);
		const status = oneOf(`data.assumptions[${i}].status`, o.status, ["unverified", "verified", "refuted"] as const);
		const ids = evidenceIds(`data.assumptions[${i}].evidence_ids`, o.evidence_ids, ctx.evidence, false);
		if (status !== "unverified" && ids.length === 0) throw invalid(`data.assumptions[${i}]: a ${status} assumption needs evidence_ids`);
		return {
			id: ident(`data.assumptions[${i}].id`, o.id),
			text: storedNote(`data.assumptions[${i}].text`, o.text, ctx.policy, MAX_NOTE, "state the assumption"),
			consequence_if_false: storedNote(`data.assumptions[${i}].consequence_if_false`, o.consequence_if_false, ctx.policy, MAX_NOTE, "say what breaks if it is false"),
			status,
			evidence_ids: ids,
		};
	}));
	return { claims, contradictions, assumptions };
}

export function stressContract(data: Record<string, unknown>, ctx: ContractContext): NonNullable<Ledger["stress"]> {
	const scenarios = uniqueIds("data.scenarios", list("data.scenarios", data.scenarios, 100).map((r, i) => {
		const o = object(`data.scenarios[${i}]`, r);
		return {
			id: ident(`data.scenarios[${i}].id`, o.id),
			requirement_ids: requirementRefs(`data.scenarios[${i}].requirement_ids`, o.requirement_ids, ctx, true),
			failure_mode: storedNote(`data.scenarios[${i}].failure_mode`, o.failure_mode, ctx.policy, MAX_NOTE, "describe how the result could fail"),
			outcome: oneOf(`data.scenarios[${i}].outcome`, o.outcome, ["survives", "breaks", "unknown"] as const),
			mitigation: o.mitigation === undefined || o.mitigation === null ? null : storedNote(`data.scenarios[${i}].mitigation`, o.mitigation, ctx.policy, MAX_NOTE, "describe the mitigation"),
		};
	}));
	const must = (ctx.ledger.classify?.requirements ?? []).filter((r) => r.importance === "must").map((r) => r.id);
	const covered = new Set(scenarios.flatMap((s) => s.requirement_ids));
	const uncovered = must.filter((id) => !covered.has(id));
	if (uncovered.length) throw invalid(`Each must-requirement needs at least one failure scenario; none for: ${uncovered.join(", ")}`);
	return { scenarios };
}

export function optimizeContract(data: Record<string, unknown>, ctx: ContractContext): NonNullable<Ledger["optimize"]> {
	if (typeof data.changed !== "boolean") throw invalid("data.changed must be true (the result was revised) or false");
	const result = text("data.result_summary", data.result_summary, ctx.maxText);
	substantial("data.result_summary", result, ctx.policy.minSummaryChars, ctx.policy.minSummaryWords, "state the result as it now stands");
	return { changed: data.changed, result: { sha256: digest(result), chars: chars(result) }, fingerprint: fingerprint(result) };
}

export function deliveryContract(data: Record<string, unknown>, ctx: ContractContext): NonNullable<Ledger["delivery"]> {
	const ids = (name: string) => [...new Set(list(name, data[name.slice(5)], 100, false).map((x, i) => ident(`${name}[${i}]`, x)))];
	return {
		unmet_requirements: ids("data.unmet_requirements"),
		missing_capabilities: [...new Set(list("data.missing_capabilities", data.missing_capabilities, 50, false).map((v, i) => capabilityName(`data.missing_capabilities[${i}]`, v)))],
		unverified_assumptions: ids("data.unverified_assumptions"),
		broken_scenarios: ids("data.broken_scenarios"),
		unknown_values: ids("data.unknown_values"),
		limitations: optionalNotes("data.limitations", data.limitations, ctx, 50),
	};
}

export const isLevelValue = isLevel;
