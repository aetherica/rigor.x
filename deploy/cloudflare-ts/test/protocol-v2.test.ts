// Engine protocol v2 (WS32 P1): twelve stages, level policy, pre-registered requirements, coverage
// gate, plan graph, assumptions, stress test, OPTIMIZE loop guard, disclosure at DELIVER.
// Expected outcomes are written by hand from ADR-002 … ADR-006 and the 2026-11-26 directive.
import { test } from "node:test";
import assert from "node:assert/strict";
import { dispatch, HostEngine } from "../src/engine.ts";
import { LEVELS, STAGES, mandatoryStages, stageIndex, type Level } from "../src/protocol.ts";
import { findCycle } from "../src/ledger.ts";
import { PipelineRun } from "../src/pipeline.ts";
import { DurableObjectRunStore } from "../src/store.ts";
import { memorySql } from "./sqlite-fake.ts";

type Env = { ok: true; result: any } | { ok: false; code: string; message: string };
const OWNER = "google:v2";

function harness(now?: () => Date) {
	const sql = memorySql();
	const engine = new HostEngine(new DurableObjectRunStore(sql), { limits: { burstPerMinute: 100_000 }, ...(now ? { now } : {}) });
	const call = (op: string, args: Record<string, unknown> = {}): Env => JSON.parse(dispatch(engine, OWNER, op, JSON.stringify(args)));
	const ok = (op: string, args: Record<string, unknown> = {}) => {
		const r = call(op, args);
		if (!r.ok) throw new Error(`${op} failed: ${r.code} ${r.message}`);
		return r.result;
	};
	return { sql, engine, call, ok };
}

let n = 0;
const summary = (stage: string) => `${stage}: the work for this stage was done and checked, step ${++n}.`;

/** Drive a run forward stage by stage. */
function runner(h: ReturnType<typeof harness>, task: string) {
	const start = h.ok("start_run", { task });
	const id = start.run_id as string;
	const submit = (stage: string, data: Record<string, unknown> = {}) => h.call("submit_stage", { run_id: id, stage, outcome: "completed", summary: summary(stage), data });
	const must = (stage: string, data: Record<string, unknown> = {}) => {
		const r = submit(stage, data);
		if (!r.ok) throw new Error(`${stage}: ${r.code} ${r.message}`);
		return r.result;
	};
	const evidence = (ref: string, extra: Record<string, unknown> = {}) => h.ok("record_evidence", { run_id: id, source_ref: ref, claim: `The source ${ref} supports a specific point`, ...extra }).evidence_id as string;
	const verify = (requirements: unknown[]) => h.call("verify", { run_id: id, requirements });
	const get = () => h.ok("get_run", { run_id: id });
	return { id, start, submit, must, evidence, verify, get };
}

const req = (id: string, extra: Record<string, unknown> = {}) => ({ id, text: `Requirement ${id} must hold for the delivered result`, ...extra });
const classify = (level: Level, requirements: unknown[], extra: Record<string, unknown> = {}) => ({
	objective: "Answer the question the user actually asked here", deliverable: "A short written answer with sources", level, stakes: "low", requirements, ...extra,
});

test("ADR-003 table: mandatory stages per level, written out by hand", () => {
	const expected: Record<Level, string[]> = {
		L01_BASIC: ["QUERY", "CLASSIFY", "EXECUTE", "DELIVER"],
		L02_STANDARD: ["QUERY", "CLASSIFY", "PLAN", "EXECUTE", "VALIDATE", "DELIVER"],
		L03_DEEP: ["QUERY", "CLASSIFY", "SELECT_METHODS", "IDENTIFY_CAPABILITIES", "PLAN", "EXECUTE", "EVALUATE_EVIDENCE", "VALIDATE", "DELIVER"],
		L04_COMPLEX: ["QUERY", "CLASSIFY", "SELECT_METHODS", "ASSESS_COMPLEXITY", "IDENTIFY_CAPABILITIES", "PLAN", "EXECUTE", "EVALUATE_EVIDENCE", "VALIDATE", "OPTIMIZE", "DELIVER"],
		L05_CRITICAL: [...STAGES],
		L06_HYPER_RIGOROUS: [...STAGES],
	};
	for (const l of LEVELS) assert.deepEqual(mandatoryStages(l), expected[l], l);
	assert.equal(STAGES.length, 12);
	assert.equal(new Set(STAGES).size, 12); // twelve distinct stages, none merged
});

test("invariant: wherever ASSESS_COMPLEXITY is mandatory, every earlier stage is too (no stage needs reopening)", () => {
	for (const l of LEVELS) {
		const m = mandatoryStages(l);
		if (!m.includes("ASSESS_COMPLEXITY")) continue;
		for (const s of STAGES.slice(0, stageIndex("ASSESS_COMPLEXITY"))) assert.ok(m.includes(s), `${s} at ${l}`);
	}
});

test("L01: four stages, the rest auto-skipped with a reason, delivered as unverified", () => {
	const h = harness();
	const r = runner(h, "What is gravity?");
	assert.equal(r.start.level, "L01_BASIC");
	assert.equal(r.start.current_stage, "QUERY");
	r.must("QUERY");
	const c = r.must("CLASSIFY", { objective: "Explain what gravity is in plain words", deliverable: "Two sentences in plain English", level: "L01_BASIC" });
	assert.equal(c.current_stage, "EXECUTE");
	for (const s of ["SELECT_METHODS", "ASSESS_COMPLEXITY", "IDENTIFY_CAPABILITIES", "PLAN"]) assert.equal(c.stage_status[s], "AUTO_SKIPPED", s);
	const e = r.must("EXECUTE");
	assert.equal(e.current_stage, "DELIVER");
	const d = r.must("DELIVER");
	assert.equal(d.status, "DELIVERED_UNVERIFIED");
	assert.equal(d.verified, false);
	const skipped = (h.sql.exec("SELECT snapshot_json FROM host_runs").toArray()[0]!.snapshot_json as string);
	assert.match(skipped, /"not mandatory at L01_BASIC"/);
});

test("unknown is not low risk: no router signal requires a declared level and stakes (N2)", () => {
	const h = harness();
	const r = runner(h, "আমার ব্যাংক অ্যাকাউন্টের পাসওয়ার্ড ফাঁস হয়েছে, প্রোডাকশন সার্ভার থেকে সব ডেটা স্থায়ীভাবে মুছে ফেলতে হবে");
	assert.equal(r.start.intent, "UNKNOWN");
	assert.equal(r.start.level, "L02_STANDARD");
	assert.equal(r.start.classification_unknown, true);
	r.must("QUERY");
	const refused = r.submit("CLASSIFY", { objective: "Contain a leaked bank password and plan the deletion", deliverable: "An incident response plan", requirements: [req("R1")] });
	assert.equal((refused as any).code, "INVALID_REQUEST");
	assert.match((refused as any).message, /classification_unknown/);
	const c = r.must("CLASSIFY", { objective: "Contain a leaked bank password and plan the deletion", deliverable: "An incident response plan", level: "L02_STANDARD", stakes: "critical", requirements: [req("R1")] });
	assert.equal(c.level, "L05_CRITICAL"); // critical stakes floor
	assert.deepEqual(c.mandatory_stages, [...STAGES]);
	assert.equal(c.current_stage, "SELECT_METHODS");
});

test("mandatory stages cannot be skipped; the level never decreases", () => {
	const h = harness();
	const r = runner(h, "Analyze the root cause of the outage and recommend a fix");
	const skip = h.call("submit_stage", { run_id: r.id, stage: "QUERY", outcome: "skipped", summary: "skip", reason: "not needed for this task at all" });
	assert.equal((skip as any).code, "STAGE_CONFLICT");
	r.must("QUERY");
	r.must("CLASSIFY", classify("L04_COMPLEX", [req("R1")]));
	r.must("SELECT_METHODS", { methods: [{ name: "root cause analysis", reason: "the outage needs a causal chain" }] });
	const lower = r.submit("ASSESS_COMPLEXITY", { level: "L03_DEEP" });
	assert.equal((lower as any).code, "INVALID_REQUEST");
	assert.match((lower as any).message, /only rise/);
	const raised = r.must("ASSESS_COMPLEXITY", { level: "L05_CRITICAL" });
	assert.equal(raised.level, "L05_CRITICAL");
	assert.ok(raised.mandatory_stages.includes("STRESS_TEST"));
});

test("the declared level cannot go below the router's seed", () => {
	const h = harness();
	const r = runner(h, "Research and compare the options for the decision");
	assert.equal(r.start.level, "L03_DEEP");
	r.must("QUERY");
	assert.equal(r.must("CLASSIFY", classify("L02_STANDARD", [req("R1")])).level, "L03_DEEP");
});

test("requirements are pre-registered at CLASSIFY from L02 on", () => {
	const h = harness();
	const r = runner(h, "Compare two database designs for a service");
	r.must("QUERY");
	const none = r.submit("CLASSIFY", classify("L02_STANDARD", []));
	assert.equal((none as any).code, "INVALID_REQUEST");
	assert.match((none as any).message, /pre-registered/);
	const dup = r.submit("CLASSIFY", classify("L02_STANDARD", [req("R1"), req("R1")]));
	assert.match((dup as any).message, /duplicate ID R1/);
});

test("plan graph: unknown dependency, self-dependency, cycle and undeclared capability are refused", () => {
	assert.deepEqual(findCycle([{ id: "a", depends_on: ["c"] }, { id: "b", depends_on: ["a"] }, { id: "c", depends_on: ["b"] }]), ["a", "c", "b", "a"]);
	assert.equal(findCycle([{ id: "a", depends_on: [] }, { id: "b", depends_on: ["a"] }]), null);
	const h = harness();
	const r = runner(h, "Analyze the market of three products");
	r.must("QUERY");
	r.must("CLASSIFY", classify("L03_DEEP", [req("R1")]));
	r.must("SELECT_METHODS", { methods: [{ name: "comparison", reason: "three products are compared" }] });
	r.must("IDENTIFY_CAPABILITIES", { available: ["web_search"], missing: ["paid_database"] });
	const op = (id: string, deps: string[], capability = "web_search") => ({ id, capability, depends_on: deps, completion_condition: `Operation ${id} has produced its recorded result` });
	assert.match((r.submit("PLAN", { operations: [op("a", ["zz"])] }) as any).message, /unknown operation zz/);
	assert.match((r.submit("PLAN", { operations: [op("a", ["a"])] }) as any).message, /depends on itself/);
	assert.match((r.submit("PLAN", { operations: [op("a", ["b"]), op("b", ["a"])] }) as any).message, /cycle: a -> b -> a/);
	assert.match((r.submit("PLAN", { operations: [op("a", [], "code_execution")] }) as any).message, /not declared/);
	const ok = r.must("PLAN", { operations: [op("a", []), op("b", ["a"], "paid_database")] });
	assert.deepEqual(ok.ledger.operations, ["a", "b"]);
	assert.equal(ok.current_stage, "EXECUTE");
	// EXECUTE must report every planned operation; a done operation cites its receipts.
	assert.match((r.submit("EXECUTE", { operations: [{ id: "a", status: "done", evidence_ids: [] }] }) as any).message, /must cite/);
	const ev = r.evidence("https://example.org/a");
	assert.match((r.submit("EXECUTE", { operations: [{ id: "a", status: "done", evidence_ids: [ev] }] }) as any).message, /missing: b/);
});

/** A run at `level` up to VALIDATE with the given requirements; returns the runner. */
function toValidate(h: ReturnType<typeof harness>, level: Level, requirements: unknown[], opts: { claims?: (ev: string[]) => unknown[]; assumptions?: unknown[]; evidence?: number } = {}) {
	// No router signal (seed L02), so the declared level decides; a task with research or decision
	// keywords would seed L03 and the level could not be declared lower.
	const r = runner(h, "Prepare the list of options for the team");
	r.must("QUERY");
	const c = r.must("CLASSIFY", classify(level, requirements));
	assert.equal(c.level, level);
	const stages = mandatoryStages(level);
	if (stages.includes("SELECT_METHODS")) r.must("SELECT_METHODS", { methods: [{ name: "source review", reason: "the comparison rests on sources" }] });
	if (stages.includes("ASSESS_COMPLEXITY")) r.must("ASSESS_COMPLEXITY");
	if (stages.includes("IDENTIFY_CAPABILITIES")) r.must("IDENTIFY_CAPABILITIES", { available: ["web_search"], missing: [] });
	const ev = Array.from({ length: opts.evidence ?? 2 }, (_, i) => r.evidence(`https://source${i}.example.org/doc`));
	r.must("PLAN", { operations: [{ id: "op1", capability: "web_search", depends_on: [], completion_condition: "All sources for the comparison are recorded", requirement_ids: [] }] });
	r.must("EXECUTE", { operations: [{ id: "op1", status: "done", evidence_ids: [ev[0]] }] });
	if (stages.includes("EVALUATE_EVIDENCE")) {
		r.must("EVALUATE_EVIDENCE", { claims: opts.claims ? opts.claims(ev) : ev.map((e, i) => ({ id: `C${i + 1}`, text: `Claim ${i + 1} is supported by its recorded source`, status: "SUPPORTED", evidence_ids: [e] })), contradictions: [], ...(opts.assumptions ? { assumptions: opts.assumptions } : {}) });
	}
	assert.equal(r.get().current_stage, "VALIDATE");
	return { ...r, ev };
}
const check = (v: any, name: string) => v.checks.find((c: any) => c.check === name);

test("Test A (brief §11): nine named competitors, one without its own evidence, fails the coverage gate", () => {
	const h = harness();
	const names = ["Acme", "Globex", "Initech", "Umbrella", "Hooli", "Stark", "Wayne", "Wonka", "Tyrell"];
	const r = toValidate(h, "L02_STANDARD", [req("R1", { text: "The brief covers every one of the nine named competitors", items: names })], { evidence: 9 });
	const answer = (count: number) => [{ id: "R1", met: true, evidence_ids: [], items: names.slice(0, count).map((_, i) => ({ id: `R1.${i + 1}`, evidence_ids: [r.ev[i]] })) }];
	const failed = r.verify(answer(8)) as any;
	assert.equal(failed.result.passed, false);
	assert.deepEqual(check(failed.result, "items_have_own_evidence").detail, ["R1.9 has no evidence"]);
	assert.equal(failed.result.status, "VALIDATION_FAILED");
	// Citing one source for two competitors is not coverage either.
	h.ok("reenter", { run_id: r.id, target_stage: "VALIDATE", trigger: "gate_failed", reason: "the ninth competitor has no source" });
	const shared = answer(9);
	shared[0]!.items[8]!.evidence_ids = [r.ev[7]!];
	const sharedResult = (r.verify(shared) as any).result;
	assert.deepEqual(check(sharedResult, "items_have_own_evidence").detail, ["R1.8 cites no evidence of its own", "R1.9 cites no evidence of its own"]);
	h.ok("reenter", { run_id: r.id, target_stage: "VALIDATE", trigger: "gate_failed", reason: "the ninth competitor now has its own source" });
	const passed = (r.verify(answer(9)) as any).result;
	assert.equal(passed.passed, true);
	assert.deepEqual(passed.levels, { R1: "structural" });
	assert.equal(passed.current_stage, "DELIVER");
});

test("coverage: every requirement answered once, must-requirements met, should-requirements disclosed", () => {
	const h = harness();
	const r = toValidate(h, "L02_STANDARD", [req("R1"), req("R2", { importance: "should" })]);
	const v1 = (r.verify([{ id: "R1", met: true, evidence_ids: [r.ev[0]] }, { id: "R9", met: true, evidence_ids: [r.ev[1]] }]) as any).result;
	assert.deepEqual(check(v1, "requirements_covered").detail, ["R9 is not a registered requirement", "R2 is not answered"]);
	h.ok("reenter", { run_id: r.id, target_stage: "VALIDATE", trigger: "gate_failed", reason: "answer the registered requirements only" });
	const v2 = (r.verify([{ id: "R1", met: false, evidence_ids: [] }, { id: "R2", met: true, evidence_ids: [r.ev[1]] }]) as any).result;
	assert.equal(check(v2, "must_requirements_met").passed, false);
	h.ok("reenter", { run_id: r.id, target_stage: "VALIDATE", trigger: "gate_failed", reason: "R1 is now met with its source" });
	const v3 = (r.verify([{ id: "R1", met: true, evidence_ids: [r.ev[0]] }, { id: "R2", met: "partial", evidence_ids: [r.ev[1]] }]) as any).result;
	assert.equal(v3.passed, true);
	assert.deepEqual(v3.requires.unmet_requirements, ["R2"]);
	const undisclosed = r.submit("DELIVER", {}) as any;
	assert.equal(undisclosed.code, "INVALID_REQUEST");
	assert.match(undisclosed.message, /data\.unmet_requirements: R2/);
	const d = r.must("DELIVER", { unmet_requirements: ["R2"] });
	assert.equal(d.status, "DELIVERED_WITH_LIMITATIONS");
});

test("all requirements met with own evidence: COMPLETED; unresolved failed actions block the gate for every intent", () => {
	const h = harness();
	const r = toValidate(h, "L02_STANDARD", [req("R1"), req("R2")]);
	const failed = h.ok("report_action", { run_id: r.id, tool_name: "bash", status: "FAILED" }).action_id;
	const v = (r.verify([{ id: "R1", met: true, evidence_ids: [r.ev[0]] }, { id: "R2", met: true, evidence_ids: [r.ev[1]] }]) as any).result;
	assert.deepEqual(check(v, "no_unresolved_failed_actions").detail, [failed]);
	h.ok("report_action", { run_id: r.id, tool_name: "bash", status: "EXECUTED", resolves: failed });
	h.ok("reenter", { run_id: r.id, target_stage: "VALIDATE", trigger: "gate_failed", reason: "the failed action was fixed and re-run" });
	const ok = (r.verify([{ id: "R1", met: true, evidence_ids: [r.ev[0]] }, { id: "R2", met: true, evidence_ids: [r.ev[1]] }]) as any).result;
	assert.equal(ok.passed, true);
	assert.equal(r.must("DELIVER").status, "COMPLETED");
	// Each met requirement needs evidence of its own.
	const h2 = harness();
	const s = toValidate(h2, "L02_STANDARD", [req("R1"), req("R2")]);
	const sh = (s.verify([{ id: "R1", met: true, evidence_ids: [s.ev[0]] }, { id: "R2", met: true, evidence_ids: [s.ev[0]] }]) as any).result;
	assert.deepEqual(check(sh, "requirements_have_own_evidence").detail, ["R1 cites no evidence of its own", "R2 cites no evidence of its own"]);
});

test("L03: a met requirement rests on a supporting claim; contradicted claims block it", () => {
	const h = harness();
	const weak = toValidate(h, "L03_DEEP", [req("R1")], { claims: (ev) => [{ id: "C1", text: "Claim one is plausible but not checked yet", status: "PLAUSIBLE", evidence_ids: [ev[0]], requirement_ids: ["R1"] }] });
	const v = (weak.verify([{ id: "R1", met: true, evidence_ids: [weak.ev[0]] }]) as any).result;
	assert.equal(check(v, "claims_support_requirements").passed, false);
	const h2 = harness();
	const bad = toValidate(h2, "L03_DEEP", [req("R1")], { claims: (ev) => [
		{ id: "C1", text: "Claim one is supported by the first source", status: "SUPPORTED", evidence_ids: [ev[0]], requirement_ids: ["R1"] },
		{ id: "C2", text: "Claim two contradicts the first source", status: "CONTRADICTED", evidence_ids: [ev[1]], requirement_ids: ["R1"] },
	] });
	const v2 = (bad.verify([{ id: "R1", met: true, evidence_ids: [bad.ev[0]] }]) as any).result;
	assert.deepEqual(check(v2, "claims_support_requirements").detail, ["R1: claim C2 is CONTRADICTED"]);
	// SUPPORTED claims need evidence at EVALUATE_EVIDENCE already.
	const h3 = harness();
	const r3 = runner(h3, "Research the options");
	r3.must("QUERY");
	r3.must("CLASSIFY", classify("L03_DEEP", [req("R1")]));
	r3.must("SELECT_METHODS", { methods: [{ name: "review", reason: "sources are reviewed one by one" }] });
	r3.must("IDENTIFY_CAPABILITIES", { available: ["web_search"], missing: [] });
	r3.must("PLAN", { operations: [{ id: "op1", capability: "web_search", depends_on: [], completion_condition: "The sources are recorded in the ledger" }] });
	const e = r3.evidence("https://example.org/x");
	r3.must("EXECUTE", { operations: [{ id: "op1", status: "done", evidence_ids: [e] }] });
	const noEv = r3.submit("EVALUATE_EVIDENCE", { claims: [{ id: "C1", text: "A supported claim without any evidence", status: "SUPPORTED", evidence_ids: [] }] }) as any;
	assert.match(noEv.message, /needs evidence_ids/);
});

test("L04: the assumptions register is required; unverified assumptions are disclosed", () => {
	const h = harness();
	const r = runner(h, "Plan the migration of the database");
	r.must("QUERY");
	r.must("CLASSIFY", classify("L04_COMPLEX", [req("R1")]));
	r.must("SELECT_METHODS", { methods: [{ name: "migration planning", reason: "the order of steps matters here" }] });
	r.must("ASSESS_COMPLEXITY");
	r.must("IDENTIFY_CAPABILITIES", { available: ["code_execution"], missing: [] });
	r.must("PLAN", { operations: [{ id: "op1", capability: "code_execution", depends_on: [], completion_condition: "The migration dry run has finished cleanly" }] });
	const ev = [r.evidence("https://a.example.org/x"), r.evidence("https://b.example.org/y")];
	r.must("EXECUTE", { operations: [{ id: "op1", status: "done", evidence_ids: [ev[0]] }] });
	const claims = [{ id: "C1", text: "The dry run finished without errors", status: "VERIFIED", evidence_ids: [ev[0]], requirement_ids: ["R1"] }];
	assert.match((r.submit("EVALUATE_EVIDENCE", { claims }) as any).message, /assumptions register is required/);
	r.must("EVALUATE_EVIDENCE", { claims, assumptions: [{ id: "A1", text: "Production data matches the staging schema", consequence_if_false: "The migration fails on production rows", status: "unverified" }] });
	const v = (r.verify([{ id: "R1", met: true, evidence_ids: [ev[0]] }]) as any).result;
	assert.equal(v.passed, true);
	assert.equal(v.current_stage, "OPTIMIZE"); // STRESS_TEST is not mandatory at L04
	assert.equal(v.stage_status.STRESS_TEST, "AUTO_SKIPPED");
	const o = r.must("OPTIMIZE", { changed: false, result_summary: "The migration plan as validated: dry run first, then production." });
	assert.deepEqual(o.requires.unverified_assumptions, ["A1"]);
	assert.match((r.submit("DELIVER", {}) as any).message, /unverified_assumptions: A1/);
	assert.equal(r.must("DELIVER", { unverified_assumptions: ["A1"] }).status, "DELIVERED_WITH_LIMITATIONS");
});

function toStress(h: ReturnType<typeof harness>, level: Level = "L05_CRITICAL") {
	const claims = (ev: string[]) => [{ id: "C1", text: "The main claim rests on two recorded sources", status: "SUPPORTED", evidence_ids: [ev[0]!, ev[1]!], requirement_ids: ["R1"] }];
	const r = toValidate(h, level, [req("R1")], { claims, assumptions: [] });
	const v = (r.verify([{ id: "R1", met: true, evidence_ids: [r.ev[0], r.ev[1]] }]) as any).result;
	assert.equal(v.passed, true, JSON.stringify(v.checks.filter((c: any) => !c.passed)));
	assert.equal(v.current_stage, "STRESS_TEST");
	return r;
}

test("L05: every must-requirement gets a failure scenario; broken or unknown outcomes are disclosed", () => {
	const h = harness();
	const r = toStress(h);
	assert.match((r.submit("STRESS_TEST", { scenarios: [] }) as any).message, /none for: R1/);
	r.must("STRESS_TEST", { scenarios: [{ id: "S1", requirement_ids: ["R1"], failure_mode: "The second source is retracted next month", outcome: "unknown" }] });
	const o = r.must("OPTIMIZE", { changed: false, result_summary: "Final result unchanged after the stress test of the claims." });
	assert.deepEqual(o.requires.broken_scenarios, ["S1"]);
	assert.equal(r.must("DELIVER", { broken_scenarios: ["S1"] }).status, "DELIVERED_WITH_LIMITATIONS");
});

test("ADR-004: OPTIMIZE returns to VALIDATE at most twice, and an unchanged fingerprint stops the loop", () => {
	const h = harness();
	const r = toStress(h);
	const scenario = { scenarios: [{ id: "S1", requirement_ids: ["R1"], failure_mode: "A new source contradicts the main claim", outcome: "survives" }] };
	r.must("STRESS_TEST", scenario);
	const answer = [{ id: "R1", met: true, evidence_ids: [r.ev[0], r.ev[1]] }];
	const o1 = r.must("OPTIMIZE", { changed: true, result_summary: "Revision one: the recommendation now names the cheaper option." });
	assert.equal(o1.current_stage, "VALIDATE");
	assert.equal(o1.optimize.cycles, 1);
	assert.equal((r.verify(answer) as any).result.current_stage, "STRESS_TEST");
	r.must("STRESS_TEST", scenario);
	// The same result with superficial edits (case, punctuation) is no progress.
	const o2 = r.must("OPTIMIZE", { changed: true, result_summary: "REVISION ONE — the recommendation now names the cheaper option!" });
	assert.equal(o2.optimize.stopped, "no_progress");
	assert.equal(o2.current_stage, "DELIVER");
	const d = r.must("DELIVER", {});
	assert.equal(d.status, "DELIVERED_WITH_LIMITATIONS");
	assert.deepEqual(d.limitations, ["OPTIMIZE loop stopped (no_progress) after 1 cycle(s)", "the last OPTIMIZE revision was not validated again"]);

	const h2 = harness();
	const b = toStress(h2);
	for (let i = 1; i <= 2; i++) {
		b.must("STRESS_TEST", scenario);
		assert.equal(b.must("OPTIMIZE", { changed: true, result_summary: `Revision ${i}: a different and better recommendation text ${"x".repeat(i)}.` }).current_stage, "VALIDATE");
		b.verify(answer);
	}
	b.must("STRESS_TEST", scenario);
	const o3 = b.must("OPTIMIZE", { changed: true, result_summary: "Revision three: yet another recommendation text that differs again." });
	assert.equal(o3.optimize.stopped, "budget");
	assert.equal(o3.optimize.cycles, 2);
	assert.equal(o3.current_stage, "DELIVER");
});

test("freshness: max_age_days needs as_of dates within the window (unknown age is not fresh)", () => {
	const at = new Date("2026-11-26T12:00:00Z");
	const h = harness(() => at);
	const r = runner(h, "Find current prices for the product");
	r.must("QUERY");
	r.must("CLASSIFY", classify("L02_STANDARD", [req("R1", { max_age_days: 90 })]));
	const undated = r.evidence("https://shop.example.org/a");
	const old = r.evidence("https://shop.example.org/b", { as_of: "2026-01-02" });
	const recent = r.evidence("https://shop.example.org/c", { as_of: "2026-11-20" });
	assert.equal((h.call("record_evidence", { run_id: r.id, source_ref: "x", claim: "A claim dated in the future here", as_of: "2027-01-01" }) as any).code, "INVALID_REQUEST");
	r.must("PLAN", { operations: [{ id: "op1", capability: "web_search", depends_on: [], completion_condition: "Prices are recorded with their dates" }] });
	r.must("EXECUTE", { operations: [{ id: "op1", status: "done", evidence_ids: [recent] }] });
	const v = (r.verify([{ id: "R1", met: true, evidence_ids: [undated, old, recent] }]) as any).result;
	assert.deepEqual(check(v, "evidence_fresh").detail, [`R1: ${undated} has no as_of date (unknown age is not fresh)`, `R1: ${old} (as of 2026-01-02T00:00:00.000Z) is older than 90 days`]);
});

test("L06: two independent sources per met requirement", () => {
	const h = harness();
	const claims = (ev: string[]) => [{ id: "C1", text: "The main claim rests on recorded sources", status: "VERIFIED", evidence_ids: [ev[0]!, ev[1]!], requirement_ids: ["R1"] }];
	const r = toValidate(h, "L06_HYPER_RIGOROUS", [req("R1")], { claims, assumptions: [] });
	const sameHost = r.evidence("https://source0.example.org/other-page");
	const v = (r.verify([{ id: "R1", met: true, evidence_ids: [r.ev[0], sameHost] }]) as any).result;
	assert.deepEqual(check(v, "independent_sources").detail, ["R1 cites fewer than two independent sources"]);
	h.ok("reenter", { run_id: r.id, target_stage: "VALIDATE", trigger: "gate_failed", reason: "cite a second independent source" });
	assert.equal((r.verify([{ id: "R1", met: true, evidence_ids: [r.ev[0], r.ev[1]] }]) as any).result.passed, true);
});

test("changing requirements means re-entering CLASSIFY, and it is recorded as a revision", () => {
	const h = harness();
	const r = toValidate(h, "L02_STANDARD", [req("R1")]);
	h.ok("reenter", { run_id: r.id, target_stage: "CLASSIFY", trigger: "scope_change", reason: "the user narrowed the question" });
	r.must("CLASSIFY", classify("L02_STANDARD", [req("R1", { text: "A narrower requirement that the user asked for" })]));
	r.must("PLAN", { operations: [{ id: "op1", capability: "web_search", depends_on: [], completion_condition: "The narrower answer is sourced" }] });
	r.must("EXECUTE", { operations: [{ id: "op1", status: "done", evidence_ids: [r.ev[0]] }] });
	const v = (r.verify([{ id: "R1", met: true, evidence_ids: [r.ev[0]] }]) as any).result;
	assert.equal(v.ledger.requirement_revisions, 1);
	const d = r.must("DELIVER");
	assert.equal(d.status, "DELIVERED_WITH_LIMITATIONS");
	assert.deepEqual(d.limitations, ["requirements were revised 1 time(s) after first registration"]);
});

test("missing capabilities the plan relies on are disclosed at DELIVER", () => {
	const h = harness();
	const r = runner(h, "Research the regulation and summarize it");
	r.must("QUERY");
	r.must("CLASSIFY", classify("L03_DEEP", [req("R1")]));
	r.must("SELECT_METHODS", { methods: [{ name: "legal text review", reason: "the regulation text is primary" }] });
	r.must("IDENTIFY_CAPABILITIES", { available: ["web_search"], missing: ["legal_database"] });
	r.must("PLAN", { operations: [
		{ id: "op1", capability: "web_search", depends_on: [], completion_condition: "Public sources on the regulation are recorded" },
		{ id: "op2", capability: "legal_database", depends_on: ["op1"], completion_condition: "The consolidated legal text is retrieved" },
	] });
	const e = [r.evidence("https://a.example.org/reg"), r.evidence("https://b.example.org/reg")];
	r.must("EXECUTE", { operations: [{ id: "op1", status: "done", evidence_ids: [e[0]] }, { id: "op2", status: "not_done", evidence_ids: [] }] });
	r.must("EVALUATE_EVIDENCE", { claims: [{ id: "C1", text: "The public summary of the regulation is sourced", status: "SUPPORTED", evidence_ids: [e[0]], requirement_ids: ["R1"] }] });
	const v = (r.verify([{ id: "R1", met: true, evidence_ids: [e[0]] }]) as any).result;
	assert.equal(v.passed, true);
	assert.deepEqual(v.requires.missing_capabilities, ["legal_database"]);
	const d = r.must("DELIVER", { missing_capabilities: ["legal_database"] });
	assert.equal(d.status, "DELIVERED_WITH_LIMITATIONS");
	assert.deepEqual(d.limitations, ["planned operations not done: op2"]);
});

test("protocol v1 runs are read-only: readable, listable and deletable, not advanced", () => {
	const h = harness();
	const v1 = new PipelineRun("rx_v1legacyrun0000000000", 6);
	v1.beginStage();
	const stamp = "2026-11-25T10:00:00+00:00";
	h.sql.exec("INSERT INTO host_runs VALUES(?, ?, 1, ?, ?, ?, ?)", v1.run_id, OWNER, JSON.stringify(v1.snapshot()),
		JSON.stringify({ engine_protocol_version: "1.0.0", intent: "ANALYSIS", level: "L03_DEEP", verifications: [] }), stamp, stamp);
	const got = h.ok("get_run", { run_id: v1.run_id });
	assert.equal(got.read_only, true);
	assert.equal(got.engine_protocol_version, "1.0.0");
	assert.equal(got.current_stage, "CONTEXT");
	const refused = h.call("submit_stage", { run_id: v1.run_id, stage: "CONTEXT", outcome: "completed", summary: "Collected the context for this old run today." }) as any;
	assert.equal(refused.code, "STAGE_CONFLICT");
	assert.match(refused.message, /read-only/);
	assert.equal(h.ok("list_runs").runs[0].engine_protocol_version, "1.0.0");
	assert.equal(h.ok("delete_run", { run_id: v1.run_id }).deleted, true);
});

test("stage summaries keep the text policy: substance and no repeats across stages", () => {
	const h = harness();
	const r = runner(h, "Explain the result of the experiment");
	const short = h.call("submit_stage", { run_id: r.id, stage: "QUERY", outcome: "completed", summary: "ok" }) as any;
	assert.match(short.message, /too short/);
	const text = "The context of the experiment was collected and summarized here.";
	h.ok("submit_stage", { run_id: r.id, stage: "QUERY", outcome: "completed", summary: text });
	const repeat = h.call("submit_stage", { run_id: r.id, stage: "CLASSIFY", outcome: "completed", summary: text.toUpperCase(), data: classify("L01_BASIC", []) }) as any;
	assert.match(repeat.message, /repeats the QUERY summary/);
});
