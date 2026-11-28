import { test } from "node:test";
import assert from "node:assert/strict";
import { route } from "../src/router.ts";

const methods = (task: string) => route(task).methods;

test("level-gated methods accumulate upward and never appear below their level", () => {
	assert.ok(!methods("what is the chemical symbol for sodium").includes("claim-status-assignment"), "not at L01");
	assert.ok(methods("/l03 research this topic").includes("claim-status-assignment"), "from L03");
	assert.ok(!methods("/l03 research this topic").includes("assumption-register"), "not yet at L03");
	const l06 = methods("/l06 audit these published figures");
	for (const m of ["claim-status-assignment", "assumption-register", "uncertainty-disclosure", "adversarial-review", "computation-receipts", "stop-condition-check"]) {
		assert.ok(l06.includes(m), `L06 includes ${m}`);
	}
});

test("the added methods name work the gate actually checks", () => {
	// max_age_days is gate-checked, so a research run is told to check recency.
	assert.ok(methods("research the latest published sources").includes("recency-check"));
	// the gate refuses a done operation whose prerequisites are not done.
	assert.ok(methods("execute this plan and update the records").includes("dependency-order"));
	// L06 requires two independent origin groups per met requirement.
	assert.ok(methods("research and verify these claims").includes("independent-corroboration"));
	// CLASSIFY requires level and stakes when the router found no signal.
	assert.ok(methods("এটা একটু দেখে দাও").includes("stakes-declaration"));
});

test("methods stay unique and non-empty for every intent the router can return", () => {
	for (const task of ["what is sodium", "research this", "why did it fail", "recommend a vendor", "delete the old records",
		"debug this api", "write a story", "translate this email", "এটা দেখো"]) {
		const m = methods(task);
		assert.ok(m.length > 0, task);
		assert.equal(new Set(m).size, m.length, `no duplicates for: ${task}`);
	}
});
