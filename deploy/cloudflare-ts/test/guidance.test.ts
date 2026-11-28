import { test } from "node:test";
import assert from "node:assert/strict";
import { STAGES, STAGE_GUIDANCE } from "../src/protocol.ts";

test("every stage's guidance leads with method and still names its own fields", () => {
	const fields: Record<string, RegExp> = {
		QUERY: /data\.constraints/, CLASSIFY: /data\.requirements/, SELECT_METHODS: /data\.methods/,
		ASSESS_COMPLEXITY: /data\.level/, IDENTIFY_CAPABILITIES: /data\.available/, PLAN: /data\.operations/,
		EXECUTE: /rigorx_record_evidence/, EVALUATE_EVIDENCE: /data\.claims/, VALIDATE: /rigorx_verify/,
		STRESS_TEST: /data\.scenarios/, OPTIMIZE: /data\.changed/, DELIVER: /data\.unmet_requirements/,
	};
	for (const stage of STAGES) {
		const text = STAGE_GUIDANCE[stage];
		assert.ok(text, `${stage} has guidance`);
		assert.match(text, fields[stage]!, `${stage} still states its required fields`);
		// The method sentence comes first, before any field name, so it is read first.
		const firstField = text.search(/data\.|rigorx_/);
		assert.ok(firstField > 40, `${stage} leads with method, not with fields`);
		assert.ok(text.length < 1400, `${stage} guidance stays short enough to be read`);
	}
});

test("the guidance tells the host to look for what would falsify a claim, not just to assert one", () => {
	assert.match(STAGE_GUIDANCE.CLASSIFY, /could fail|shown false/);
	assert.match(STAGE_GUIDANCE.EVALUATE_EVIDENCE, /weakest status|make it false/);
	assert.match(STAGE_GUIDANCE.STRESS_TEST, /Attack your own result/);
	assert.match(STAGE_GUIDANCE.DELIVER, /disclosed gap is a finding/);
});
