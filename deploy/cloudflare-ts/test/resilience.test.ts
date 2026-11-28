import { test } from "node:test";
import assert from "node:assert/strict";
import { sharedRegistry } from "../src/source.ts";
import { policyFromEnv } from "../src/resilience.ts";

test("the shared registry survives requests: equal policy values give the same registry (2026-11-28 audit)", () => {
	const a = sharedRegistry(policyFromEnv({}).policy);
	assert.equal(sharedRegistry(policyFromEnv({}).policy), a, "a fresh but equal policy object must not reset breakers and the limiter");
	assert.equal(sharedRegistry(), a, "no policy keeps the current registry");
	const b = sharedRegistry(policyFromEnv({ RIGORX_ACQUISITION_CONCURRENCY: "3" }).policy);
	assert.notEqual(b, a, "changed values build a new registry");
	assert.equal(b.policy.acquisitionConcurrency, 3);
});
