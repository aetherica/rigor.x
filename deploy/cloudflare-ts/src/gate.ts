// Verification gate of engine protocol v2 (WS32 P1; ADR-003, ADR-005, ADR-007).
// The host answers every pre-registered requirement; the gate checks the answers against the
// ledger. Every check is deterministic and structural: a pass says the record is complete and
// consistent, never that its claims are true. Engine-verified receipts (rigorx_compute,
// rigorx_check_source) raise the reported verification level.
import { DISQUALIFYING_STATUSES, SUPPORTING_STATUSES, levelRank, type VerificationLevel } from "./protocol.ts";
import type { EvidenceRecord, RunState } from "./run.ts";
import type { Requirement } from "./ledger.ts";
import { evidenceIds, ident, invalid, list, object, type Json, type JsonObject } from "./text.ts";

export const GATE_VERSION = "2.0.0";
export const ACTION = "HOST_REPORTED_ACTION";
export const COMPUTE = "COMPUTE_RECEIPT";
export const SOURCE_CHECK = "SOURCE_CHECK";
/** Evidence types only the engine creates. */
export const ENGINE_TYPES: ReadonlySet<string> = new Set([ACTION, COMPUTE, SOURCE_CHECK]);

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

const origin = (ref: string): string => {
	try {
		const u = new URL(ref);
		return u.host ? `${u.protocol}//${u.host.toLowerCase().replace(/^www\./, "")}` : ref;
	} catch {
		const doi = /^(?:doi:)?(10\.\d{4,9})\//i.exec(ref);
		return doi ? `doi:${doi[1]}` : ref.trim().toLowerCase();
	}
};

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

	// 11. Engine receipts cited as support must not have failed (unit or check errors).
	add("cited_receipts_ok", supported.flatMap((a) => [...allOf(a)].filter((id) => {
		const e = evidence.get(id)!;
		return (e.type === COMPUTE || e.type === SOURCE_CHECK) && e.details.ok !== true;
	}).map((id) => `${a.id} cites ${id}, a ${evidence.get(id)!.type} that failed`)));

	const claims = run.ledger.evaluation?.claims ?? [];
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
			const linked = claims.filter((c) => c.requirement_ids.includes(a.id) || c.evidence_ids.some((id) => cited.has(id)));
			if (!linked.some((c) => SUPPORTING_STATUSES.has(c.status) && c.evidence_ids.some((id) => cited.has(id)))) {
				problems.push(`${a.id}: no ESTABLISHED, VERIFIED or SUPPORTED claim rests on its cited evidence`);
			}
			for (const c of linked.filter((c) => DISQUALIFYING_STATUSES.has(c.status))) problems.push(`${a.id}: claim ${c.id} is ${c.status}`);
		}
		add("claims_support_requirements", problems);
		const contradictions = run.ledger.evaluation?.contradictions ?? [];
		add("contradictions_resolved", contradictions.filter((x) => !x.resolved && x.claim_ids.some((id) => claims.find((c) => c.id === id)?.requirement_ids.some((r) => answered.get(r)?.met === true)))
			.map((x) => `unresolved contradiction between ${x.claim_ids.join(" and ")}`));
	}
	// 13. L04+: the assumptions register was submitted.
	if (rank >= 4) add("assumptions_registered", run.ledger.evaluation?.assumptions ? [] : ["EVALUATE_EVIDENCE submitted no assumptions register"]);
	// 14. L06: two independent sources per met requirement; numeric claims cite computation receipts.
	if (rank >= 6) {
		add("independent_sources", [...answered.values()].filter((a) => a.met === true).filter((a) => {
			const origins = new Set([...allOf(a)].map((id) => evidence.get(id)!).filter((e) => !ENGINE_TYPES.has(e.type)).map((e) => origin(e.source_ref)));
			return origins.size < 2;
		}).map((a) => `${a.id} cites fewer than two independent sources`));
		add("numeric_claims_computed", claims.filter((c) => c.numeric && c.requirement_ids.some((r) => answered.get(r)?.met === true))
			.filter((c) => !c.evidence_ids.some((id) => evidence.get(id)?.type === COMPUTE && evidence.get(id)?.details.ok === true))
			.map((c) => `numeric claim ${c.id} cites no successful rigorx_compute receipt`));
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
		const numeric = claims.filter((c) => c.numeric && c.requirement_ids.includes(r.id));
		const computed = numeric.length > 0 && numeric.every((c) => c.evidence_ids.some((id) => evidence.get(id)?.type === COMPUTE && evidence.get(id)?.details.ok === true));
		out[r.id] = resolved && computed ? "computations_checked" : resolved ? "sources_resolved" : "structural";
	}
	return out;
}
