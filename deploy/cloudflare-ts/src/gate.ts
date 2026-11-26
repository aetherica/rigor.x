// Verification gate of engine protocol v2 (WS32 P1; ADR-003, ADR-005, ADR-007).
// The host answers every pre-registered requirement; the gate checks the answers against the
// ledger. Every check is deterministic and structural: a pass says the record is complete and
// consistent, never that its claims are true. Engine-verified receipts (rigorx_compute,
// rigorx_check_source) raise the reported verification level.
import { DISQUALIFYING_STATUSES, SUPPORTING_STATUSES, levelRank, type VerificationLevel } from "./protocol.ts";
import type { EvidenceRecord, RunState } from "./run.ts";
import { UNKNOWN_VALUES, approvalProblems, dependencyProblems, type Claim, type Requirement } from "./ledger.ts";
import { evidenceIds, ident, invalid, list, object, type Json, type JsonObject } from "./text.ts";
import { ComputeError, dimString, parseUnit } from "./compute.ts";
import { checkSummary, independenceGroups, latestChecks, sourceIdentity } from "./sources.ts";

/** 2.1.0 (2026-11-26 audit): claims linked by evidence, value-bound compute receipts, single-use approvals,
 * dependency integrity, canonical source independence, retraction and fringe-corroboration checks. */
export const GATE_VERSION = "2.1.0";
export const ACTION = "HOST_REPORTED_ACTION";
export const COMPUTE = "COMPUTE_RECEIPT";
export const SOURCE_CHECK = "SOURCE_CHECK";
/** Host-recorded evidence of the user's approval for an A4/A5 operation (directive §15). */
export const USER_APPROVAL = "USER_APPROVAL";
/** Evidence types only the engine creates. */
export const ENGINE_TYPES: ReadonlySet<string> = new Set([ACTION, COMPUTE, SOURCE_CHECK]);

/** Relative tolerance for "the receipt computed the number the claim states" (both in SI). */
export const CLAIM_MATCH_TOL = 1e-9;

/**
 * Does a compute receipt support this numeric claim (audit finding B2)? The receipt must have
 * succeeded AND carry a passed `expect` check (an unchecked computation is not bound to any claimed
 * number), and the checked value must be the claim's own value: same dimension, same SI value within
 * CLAIM_MATCH_TOL. A unit rigorx_compute does not know (for example USD or users) is a label: the
 * receipt must then be dimensionless and check the same number.
 */
export function receiptSupportsClaim(claim: Claim, receipt: EvidenceRecord | undefined): boolean {
	if (!receipt || receipt.type !== COMPUTE || receipt.details.ok !== true) return false;
	const check = receipt.details.check as { passed?: unknown; expected_si?: unknown; expected_value?: unknown } | null | undefined;
	if (!check || check.passed !== true || typeof check.expected_si !== "number") return false;
	const v = claim.value;
	if (!v || v.number === null) return false;
	const close = (a: number, b: number) => Math.abs(a - b) <= CLAIM_MATCH_TOL * Math.max(Math.abs(a), Math.abs(b), Number.MIN_VALUE);
	let unit: { v: number; dim: ReturnType<typeof parseUnit>["dim"] } | null = null;
	try {
		unit = parseUnit(v.unit ?? "1");
	} catch (e) {
		if (!(e instanceof ComputeError)) throw e;
	}
	if (!unit) return receipt.details.unit_si === "1" && typeof check.expected_value === "number" && close(check.expected_value, v.number);
	return dimString(unit.dim) === receipt.details.unit_si && close(check.expected_si, v.number * unit.v);
}

export interface Answer {
	id: string;
	met: true | false | "partial";
	evidence_ids: string[];
	items: { id: string; evidence_ids: string[] }[];
}

export function parseAnswers(value: unknown, run: RunState): Answer[] {
	const known = new Set(run.evidence.map((e) => e.id));
	return list("requirements", value, 50).map((r, i) => {
		const o = object(`requirements[${i}]`, r);
		if (o.met !== true && o.met !== false && o.met !== "partial") throw invalid(`requirements[${i}].met must be true, false or "partial"`);
		return {
			id: ident(`requirements[${i}].id`, o.id),
			met: o.met,
			evidence_ids: evidenceIds(`requirements[${i}].evidence_ids`, o.evidence_ids, known, false),
			items: list(`requirements[${i}].items`, o.items, 50, false).map((it, j) => {
				const x = object(`requirements[${i}].items[${j}]`, it);
				return { id: ident(`requirements[${i}].items[${j}].id`, x.id), evidence_ids: evidenceIds(`requirements[${i}].items[${j}].evidence_ids`, x.evidence_ids, known, false) };
			}),
		};
	});
}

/** Unresolved FAILED or BLOCKED host actions. */
export function unresolvedActions(evidence: EvidenceRecord[]): string[] {
	const actions = evidence.filter((e) => e.type === ACTION);
	const resolved = new Set(actions.filter((a) => a.details.status === "EXECUTED" && a.details.resolves).map((a) => String(a.details.resolves)));
	return actions.filter((a) => a.details.status !== "EXECUTED" && !resolved.has(a.id)).map((a) => a.id);
}

export interface GateResult {
	passed: boolean;
	checks: JsonObject[];
	levels: Record<string, VerificationLevel>;
	/** Requirements that are not met, including partial ones (to be disclosed at DELIVER). */
	unmet: string[];
}

export function runGate(run: RunState, answers: Answer[], at: Date): GateResult {
	const checks: JsonObject[] = [];
	const add = (check: string, problems: string[], detail?: Json) => checks.push({ check, passed: problems.length === 0, detail: detail ?? problems });
	const requirements = run.ledger.classify?.requirements ?? [];
	const byId = new Map(requirements.map((r) => [r.id, r]));
	const evidence = new Map(run.evidence.map((e) => [e.id, e]));
	const rank = levelRank(run.level);

	// 1. Stages before VALIDATE are done (completed or auto-skipped by level).
	const open = ["QUERY", "CLASSIFY", "SELECT_METHODS", "ASSESS_COMPLEXITY", "IDENTIFY_CAPABILITIES", "PLAN", "EXECUTE", "EVALUATE_EVIDENCE"]
		.filter((s) => !["COMPLETED", "AUTO_SKIPPED"].includes(run.stage_status[s as keyof typeof run.stage_status]));
	add("prior_stages_closed", open.map((s) => `${s} is ${run.stage_status[s as keyof typeof run.stage_status]}`));

	// 2. Requirements were pre-registered at CLASSIFY (no goalposts authored at verification time).
	add("requirements_preregistered", requirements.length ? [] : ["no requirements were registered at CLASSIFY: re-enter CLASSIFY"]);

	// 3. Every registered requirement is answered exactly once; nothing unregistered is answered.
	const answered = new Map<string, Answer>();
	const coverage: string[] = [];
	for (const a of answers) {
		if (!byId.has(a.id)) coverage.push(`${a.id} is not a registered requirement`);
		else if (answered.has(a.id)) coverage.push(`${a.id} is answered twice`);
		else answered.set(a.id, a);
	}
	for (const r of requirements) if (!answered.has(r.id)) coverage.push(`${r.id} is not answered`);
	add("requirements_covered", coverage);

	// 4. Must-requirements are met; should-requirements may be unmet (then disclosed at DELIVER).
	const unmet = requirements.filter((r) => answered.get(r.id)?.met !== true).map((r) => r.id);
	add("must_requirements_met", requirements.filter((r) => r.importance === "must" && answered.get(r.id)?.met !== true).map((r) => `${r.id} (must) is reported as ${JSON.stringify(answered.get(r.id)?.met ?? "unanswered")}`));

	const supported = [...answered.values()].filter((a) => a.met === true || a.met === "partial");
	// 5. Met requirements cite evidence.
	add("met_requirements_cite_evidence", supported.filter((a) => a.evidence_ids.length === 0 && a.items.every((i) => i.evidence_ids.length === 0)).map((a) => `${a.id} cites no evidence`));

	// 6. Each met requirement has at least one evidence ID that no other met requirement cites.
	const allOf = (a: Answer) => new Set([...a.evidence_ids, ...a.items.flatMap((i) => i.evidence_ids)]);
	const shared: string[] = [];
	for (const a of supported) {
		const others = new Set(supported.filter((b) => b.id !== a.id).flatMap((b) => [...allOf(b)]));
		if (allOf(a).size && ![...allOf(a)].some((id) => !others.has(id))) shared.push(`${a.id} cites no evidence of its own`);
	}
	add("requirements_have_own_evidence", shared);

	// 7. Enumerated items (for example nine named competitors): each needs evidence of its own.
	const itemProblems: string[] = [];
	for (const a of supported) {
		const r = byId.get(a.id)!;
		if (!r.items.length) continue;
		const given = new Map(a.items.map((i) => [i.id, i]));
		for (const i of a.items) if (!r.items.some((x) => x.id === i.id)) itemProblems.push(`${i.id} is not an item of ${r.id}`);
		for (const item of r.items) {
			const g = given.get(item.id);
			if (!g || g.evidence_ids.length === 0) {
				itemProblems.push(`${item.id} has no evidence`);
				continue;
			}
			const others = new Set(a.items.filter((x) => x.id !== item.id).flatMap((x) => x.evidence_ids));
			if (!g.evidence_ids.some((id) => !others.has(id))) itemProblems.push(`${item.id} cites no evidence of its own`);
		}
	}
	add("items_have_own_evidence", itemProblems);

	// 8. No unresolved failed or blocked actions (for every intent).
	add("no_unresolved_failed_actions", unresolvedActions(run.evidence));

	// 9. Planned operations: every operation linked to a met requirement is done.
	const plan = run.ledger.plan?.operations ?? [];
	const reports = new Map((run.ledger.execution?.operations ?? []).map((o) => [o.id, o]));
	const opProblems: string[] = [];
	for (const op of plan) {
		const status = reports.get(op.id)?.status ?? "unreported";
		if (status !== "done" && op.requirement_ids.some((id) => answered.get(id)?.met === true)) {
			opProblems.push(`${op.id} is ${status} but supports a requirement reported as met (${op.requirement_ids.join(", ")})`);
		}
	}
	add("planned_operations_done", opProblems);

	// 10. Freshness: cited sources carry an as_of date within the requirement's max_age_days.
	const fresh: string[] = [];
	for (const a of supported) {
		const r = byId.get(a.id)!;
		if (r.max_age_days === null) continue;
		for (const id of allOf(a)) {
			const e = evidence.get(id)!;
			if (e.type === ACTION || e.type === COMPUTE) continue;
			if (!e.as_of) fresh.push(`${a.id}: ${id} has no as_of date (unknown age is not fresh)`);
			else if ((at.getTime() - Date.parse(e.as_of)) / 86_400_000 > r.max_age_days) fresh.push(`${a.id}: ${id} (as of ${e.as_of}) is older than ${r.max_age_days} days`);
		}
	}
	add("evidence_fresh", fresh);

	// 10b. A met requirement does not rest on a retracted work (Crossref / Retraction Watch, recorded by rigorx_check_source).
	const sourceChecks = latestChecks(run.evidence);
	const retracted = supported.flatMap((a) => [...allOf(a)].filter((id) => checkSummary(sourceChecks.get(id))?.retracted).map((id) => `${a.id} cites ${id}, a retracted work`));
	if (retracted.length || [...sourceChecks.values()].some((c) => c.crossref)) add("cited_sources_not_retracted", retracted);

	// 11. Engine receipts cited as support must not have failed (unit or check errors).
	add("cited_receipts_ok", supported.flatMap((a) => [...allOf(a)].filter((id) => {
		const e = evidence.get(id)!;
		return (e.type === COMPUTE || e.type === SOURCE_CHECK) && e.details.ok !== true;
	}).map((id) => `${a.id} cites ${id}, a ${evidence.get(id)!.type} that failed`)));

	const claims = run.ledger.evaluation?.claims ?? [];
	// One resolver for "which claims bear on a met requirement" (audit finding B3): a claim is linked
	// to a requirement it names in requirement_ids OR whose cited evidence it rests on. Omitting
	// requirement_ids therefore never takes a claim out of the checks below.
	const metAnswers = [...answered.values()].filter((a) => a.met === true);
	const linked = (a: Answer) => {
		const cited = allOf(a);
		return claims.filter((c) => c.requirement_ids.includes(a.id) || c.evidence_ids.some((id) => cited.has(id)));
	};
	const linkedToMet = new Map<string, string[]>(); // claim id -> met requirements it bears on
	for (const a of metAnswers) for (const c of linked(a)) linkedToMet.set(c.id, [...(linkedToMet.get(c.id) ?? []), a.id]);
	// 11b. An unknown value never supports a met requirement (directive §2.2: unknown is not zero).
	if (claims.some((c) => c.value)) {
		add("unknown_values_not_supporting", claims.filter((c) => c.value && UNKNOWN_VALUES.has(c.value.status) && linkedToMet.has(c.id))
			.map((c) => `claim ${c.id} has a ${c.value!.status} value, so ${linkedToMet.get(c.id)!.join(", ")} cannot be met on it`));
	}
	// 11c. Approved consequential operations (A4/A5) cite a valid, single-use approval bound to them.
	const gated = plan.filter((op) => op.tier === "A4" || op.tier === "A5");
	if (gated.length) {
		const usedBy = new Map<string, string>();
		add("approvals_recorded", gated.filter((op) => reports.get(op.id)?.status === "done")
			.map((op) => approvalProblems(op, reports.get(op.id)?.evidence_ids ?? [], evidence, at, usedBy)).filter((p): p is string => p !== null));
	}
	// 11d. Dependency integrity: a done operation's prerequisites are done (audit finding D).
	if (plan.some((op) => op.depends_on.length)) add("dependencies_done", dependencyProblems(plan, (id) => reports.get(id)?.status ?? "unreported"));
	// 12. L03+ (ADR-003 "claim status required for cited evidence"): every evidence ID a met requirement
	// cites (actions and engine receipts excepted) is given a status by some claim; at least one cited
	// source rests on an ESTABLISHED, VERIFIED or SUPPORTED claim; disqualified claims block it.
	if (rank >= 3) {
		const problems: string[] = [];
		const statused = new Set(claims.flatMap((c) => c.evidence_ids));
		for (const a of answered.values()) {
			if (a.met !== true) continue;
			const cited = allOf(a);
			for (const id of cited) {
				if (!ENGINE_TYPES.has(evidence.get(id)!.type) && !statused.has(id)) problems.push(`${a.id}: ${id} is cited but no claim gives it a status`);
			}
			const bearing = linked(a);
			if (!bearing.some((c) => SUPPORTING_STATUSES.has(c.status) && c.evidence_ids.some((id) => cited.has(id)))) {
				problems.push(`${a.id}: no ESTABLISHED, VERIFIED or SUPPORTED claim rests on its cited evidence`);
			}
			for (const c of bearing.filter((c) => DISQUALIFYING_STATUSES.has(c.status))) problems.push(`${a.id}: claim ${c.id} is ${c.status}`);
		}
		add("claims_support_requirements", problems);
		const contradictions = run.ledger.evaluation?.contradictions ?? [];
		// Fringe or unverified sources (declared D09) never carry a requirement alone (directive §05, D09).
		const fringe = metAnswers.filter((a) => {
			const ids = [...allOf(a)].map((id) => evidence.get(id)!).filter((e) => !ENGINE_TYPES.has(e.type) && e.type !== USER_APPROVAL).map((e) => sourceIdentity(e, sourceChecks.get(e.id)));
			return ids.length > 0 && ids.some((i) => i.domain === "D09") && ids.every((i) => i.domain === "D09");
		});
		if (fringe.length || run.evidence.some((e) => e.details.source_domain === "D09")) add("fringe_corroborated", fringe.map((a) => `${a.id} rests only on fringe or unverified (D09) sources: corroborate it from another domain`));
		add("contradictions_resolved", contradictions.filter((x) => !x.resolved && x.claim_ids.some((id) => linkedToMet.has(id)))
			.map((x) => `unresolved contradiction between ${x.claim_ids.join(" and ")}`));
	}
	// 13. L04+: the assumptions register was submitted.
	if (rank >= 4) add("assumptions_registered", run.ledger.evaluation?.assumptions ? [] : ["EVALUATE_EVIDENCE submitted no assumptions register"]);
	// 14. L06: two independent source groups per met requirement (canonical source identity: the
	// same DOI, the same canonical article, mirrors, syndicated copies and one wire story count once;
	// sources.ts), and every numeric claim bearing on a met requirement cites a computation receipt
	// that checked the claim's own value (B2).
	if (rank >= 6) {
		add("independent_sources", metAnswers.map((a) => {
			const records = [...allOf(a)].map((id) => evidence.get(id)!).filter((e) => !ENGINE_TYPES.has(e.type) && e.type !== USER_APPROVAL);
			const groups = independenceGroups(records.map((e) => sourceIdentity(e, sourceChecks.get(e.id))));
			return groups.length < 2 ? `${a.id} cites fewer than two independent sources (${groups.length} independent group${groups.length === 1 ? "" : "s"}: ${groups.map((g) => g.key).join("; ") || "none"})` : null;
		}).filter((p): p is string => p !== null));
		add("numeric_claims_computed", claims.filter((c) => c.numeric && linkedToMet.has(c.id)).map((c) => {
			if (!c.value || c.value.number === null) return `numeric claim ${c.id} states no value {status, number, unit}, so no receipt can be checked against it`;
			if (c.evidence_ids.some((id) => receiptSupportsClaim(c, evidence.get(id)))) return null;
			const any = c.evidence_ids.some((id) => evidence.get(id)?.type === COMPUTE && evidence.get(id)?.details.ok === true);
			return any
				? `numeric claim ${c.id} cites no rigorx_compute receipt whose checked value (expect) is the claimed ${c.value.number} ${c.value.unit ?? ""}`.trim()
				: `numeric claim ${c.id} cites no successful rigorx_compute receipt`;
		}).filter((p): p is string => p !== null));
	}

	const passed = checks.every((c) => c.passed === true);
	return { passed, checks, levels: verificationLevels(requirements, answered, run, passed), unmet };
}

/** Highest verification level reached per answered requirement. */
function verificationLevels(requirements: Requirement[], answered: Map<string, Answer>, run: RunState, passed: boolean): Record<string, VerificationLevel> {
	const evidence = new Map(run.evidence.map((e) => [e.id, e]));
	const checkedRefs = new Set(run.evidence.filter((e) => e.type === SOURCE_CHECK && e.details.ok === true).map((e) => String(e.details.checks_evidence ?? "")));
	const claims = run.ledger.evaluation?.claims ?? [];
	const out: Record<string, VerificationLevel> = {};
	for (const r of requirements) {
		const a = answered.get(r.id);
		if (!a || !passed || a.met !== true) continue;
		const cited = [...new Set([...a.evidence_ids, ...a.items.flatMap((i) => i.evidence_ids)])].map((id) => evidence.get(id)!);
		const sources = cited.filter((e) => !ENGINE_TYPES.has(e.type));
		const resolved = sources.length > 0 && sources.every((e) => checkedRefs.has(e.id));
		const citedIds = new Set(cited.map((e) => e.id));
		const numeric = claims.filter((c) => c.numeric && (c.requirement_ids.includes(r.id) || c.evidence_ids.some((id) => citedIds.has(id))));
		const computed = numeric.length > 0 && numeric.every((c) => c.evidence_ids.some((id) => receiptSupportsClaim(c, evidence.get(id))));
		out[r.id] = resolved && computed ? "computations_checked" : resolved ? "sources_resolved" : "structural";
	}
	return out;
}
