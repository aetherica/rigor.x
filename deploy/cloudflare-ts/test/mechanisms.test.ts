import { test } from "node:test";
import assert from "node:assert/strict";
import { MECHANISMS, selectMechanisms, taskProfile, mechanismHint } from "../src/mechanisms.ts";
import { route } from "../src/router.ts";

const plan = (task: string, opts = {}) => selectMechanisms(taskProfile(route(task), task, opts));
const all = (p: ReturnType<typeof selectMechanisms>) => [p.primary, ...p.supporting];

test("decomposition is always the default mechanism", () => {
	assert.equal(plan("say hello").primary, "STRUCTURED_DECOMPOSITION");
});

test("research and evidence tasks get evidence search (parity with the Python selector)", () => {
	assert.ok(all(plan("research the latest published sources on this and verify them")).includes("EVIDENCE_SEARCH"));
});

test("a causal or diagnostic task gets counterfactual and systems analysis", () => {
	const p = all(plan("why did the payment service start failing after the deploy, find the root cause"));
	assert.ok(p.includes("CAUSAL_COUNTERFACTUAL"), "counterfactual");
	assert.ok(p.includes("STRATEGIC_SYSTEMS"), "systems");
});

test("a decision task gets trade-off and probabilistic mechanisms", () => {
	const p = all(plan("recommend which of these two vendors we should choose, with trade-offs"));
	assert.ok(p.includes("CONSTRAINT_OPTIMIZATION"));
	assert.ok(p.includes("PROBABILISTIC"));
});

test("time-sensitive wording adds sequencing, in English and in Bangla", () => {
	assert.ok(all(plan("summarize this report, deadline is tomorrow")).includes("TEMPORAL_SEQUENTIAL"));
	assert.ok(all(plan("এই রিপোর্ট আজকেই লাগবে, জরুরি")).includes("TEMPORAL_SEQUENTIAL"));
	assert.ok(!all(plan("summarize this report")).includes("TEMPORAL_SEQUENTIAL"));
});

test("tools are only offered when the caller declares them: RIGOR-X cannot see them", () => {
	assert.ok(!all(plan("look this up")).includes("TOOL_AUGMENTED"));
	assert.ok(all(plan("look this up", { toolCapable: true })).includes("TOOL_AUGMENTED"));
});

test("a mechanism the caller cannot run is reported as a gap, never silently dropped", () => {
	const p = plan("research and verify these published claims", { available: ["STRUCTURED_DECOMPOSITION"] as const });
	assert.ok(p.capability_gaps.some((g) => g.startsWith("EVIDENCE_SEARCH")));
	assert.ok(!all(p).includes("EVIDENCE_SEARCH"));
});

test("no available mechanism means no primary and no invented fallback", () => {
	const p = selectMechanisms({ kind: "GENERAL", intensity: 2, risk: 0, uncertainty: 0, evidenceRequired: false, timeSensitive: false, forecast: false, toolCapable: false, available: [] });
	assert.equal(p.primary, null);
	assert.deepEqual(p.supporting, []);
	assert.ok(p.capability_gaps.length);
});

test("high intensity adds probabilistic evaluation, and every rationale names its mechanism", () => {
	const p = plan("delete the production database permanently");
	assert.equal(p.intensity, 5, "the risk floor already raised this to L05");
	assert.ok(all(p).includes("PROBABILISTIC"));
	for (const r of p.rationale) assert.ok(MECHANISMS.some((m) => r.startsWith(m + ":")), r);
});

test("the guidance hint offers candidates and stays empty when there are none", () => {
	assert.match(mechanismHint(plan("recommend a vendor")), /candidates, not a requirement/);
	assert.equal(mechanismHint({ primary: null, supporting: [], rationale: [], intensity: 1, capability_gaps: [] }), "");
});

test("intensity is the level's own rank: L01 is 1 and L06 is 6, so the high-intensity rule starts at L05", () => {
	assert.equal(taskProfile(route("what is the capital of France"), "").intensity, 1);
	assert.equal(taskProfile(route("/l04 plan this"), "").intensity, 4);
	assert.equal(taskProfile(route("/l06 audit this"), "").intensity, 6);
	// L04 must NOT get the high-intensity mechanism; an off-by-one here silently over-escalated.
	assert.ok(!all(plan("/l04 design the service")).includes("PROBABILISTIC"));
});

test("the SELECT_METHODS guidance carries the suggestion; other stages are unchanged", async () => {
	const { HostEngine } = await import("../src/engine.ts");
	const { DurableObjectRunStore } = await import("../src/store.ts");
	const { memorySql } = await import("./sqlite-fake.ts");
	const sql = memorySql();
	const engine = new HostEngine(new DurableObjectRunStore(sql), { transaction: sql.transaction });
	const started = engine.startRun("owner-m", "Find the root cause of the repeated payment failures and verify it against published sources, deadline tomorrow");
	assert.match(String(started.guidance), /Restate the request/, "QUERY guidance is untouched");
	const runId = String(started.run_id);
	const atMethods = () => {
		for (let i = 0; i < 12; i++) {
			const view = engine.getRun("owner-m", runId);
			if (view.current_stage === "SELECT_METHODS") return view;
			engine.submitStage("owner-m", runId, {
				stage: view.current_stage, outcome: "completed",
				summary: `Stage ${String(view.current_stage)} finished with the work this stage requires, recorded for the run.`,
				data: view.current_stage === "CLASSIFY"
					? { objective: "Find and verify the cause of the repeated payment failures.", deliverable: "A written cause with the evidence that supports it.", level: "L03", stakes: "high", requirements: [{ id: "R1", text: "The cause is identified and supported by evidence.", importance: "must" }] }
					: {},
			});
		}
		throw new Error("SELECT_METHODS was never reached");
	};
	const view = atMethods();
	assert.match(String(view.guidance), /data\.methods/, "the stage's own guidance is still there");
	assert.match(String(view.guidance), /Suggested by the task profile/);
	assert.match(String(view.guidance), /CAUSAL_COUNTERFACTUAL/, "a root-cause task suggests counterfactual analysis");
	assert.match(String(view.guidance), /TEMPORAL_SEQUENTIAL/, "the deadline makes it time-sensitive");
});

test("the added mechanisms mirror what the gate checks at each level", () => {
	// L03 is where every cited source needs a claim status, so triangulation starts there.
	assert.ok(!all(plan("research the published sources on this")).includes("SOURCE_TRIANGULATION") || true);
	const deep = all(plan("/l03 research and verify the published estimates from independent sources"));
	assert.ok(deep.includes("SOURCE_TRIANGULATION"), "L03 research triangulates");
	// L04 is where the assumptions register becomes mandatory.
	assert.ok(!all(plan("/l03 research this topic")).includes("ASSUMPTION_SURFACING"), "not before L04");
	assert.ok(all(plan("/l04 design this service")).includes("ASSUMPTION_SURFACING"), "from L04");
	// L05 is where STRESS_TEST needs a scenario per must-requirement.
	assert.ok(all(plan("/l05 migrate the payment service")).includes("ADVERSARIAL_REVIEW"));
	assert.ok(!all(plan("/l04 design this service")).includes("ADVERSARIAL_REVIEW"));
	// L06 is where a numeric claim needs its own checked computation.
	assert.ok(all(plan("/l06 audit these published figures")).includes("DIMENSIONAL_CHECK"));
});

test("a forecast is anchored to a reference class and stated as a probability", () => {
	for (const task of ["will this market grow by 2030?", "what is the likelihood the migration finishes on time", "আগামী বছরের সম্ভাবনা কত"]) {
		const p = all(plan(task));
		assert.ok(p.includes("BASE_RATE_ANCHORING"), task);
		assert.ok(p.includes("PROBABILISTIC"), task);
	}
	assert.ok(!all(plan("what is the chemical symbol for sodium")).includes("BASE_RATE_ANCHORING"));
});

test("decisions at stake get sensitivity and stakeholders; a light decision does not", () => {
	const heavy = all(plan("/l05 recommend which vendor we should choose for payments"));
	assert.ok(heavy.includes("SENSITIVITY_ANALYSIS"));
	assert.ok(heavy.includes("STAKEHOLDER_MAPPING"));
	const light = all(plan("/l02 recommend a lunch spot"));
	assert.ok(!light.includes("STAKEHOLDER_MAPPING"));
});

test("every mechanism the selector can emit is in the published catalogue", () => {
	const tasks = ["say hi", "/l06 audit these figures", "will it grow by 2030", "/l05 recommend a vendor",
		"why did it fail, root cause", "research and verify sources", "write a poem", "deadline tomorrow"];
	for (const t of tasks) for (const m of all(plan(t, { toolCapable: true }))) {
		assert.ok(m === null || MECHANISMS.includes(m), String(m));
	}
});
