// The TypeScript engine must reproduce the Python engine's behaviour (fixtures from scripts/parity_fixtures.py).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dispatch, HostEngine, RELAXED_TEXT_POLICY } from "../src/engine.ts";
import { route } from "../src/router.ts";
import { DurableObjectRunStore, canonicalJson } from "../src/store.ts";
import { memorySql } from "./sqlite-fake.ts";

interface Fixture {
	owner: string;
	router: { prompt: string; profile: unknown }[];
	scenarios: Record<string, { steps: [string, Record<string, unknown>, string?][]; expected: unknown[]; text_policy: "default" | "relaxed" }>;
}
const fixture = JSON.parse(readFileSync(new URL("./fixtures/parity.json", import.meta.url), "utf8")) as Fixture;

const sorted = (value: unknown) => JSON.parse(canonicalJson(value)) as unknown;

test("router profiles match Python for every fixture prompt", () => {
	for (const { prompt, profile } of fixture.router) {
		assert.deepEqual(sorted(route(prompt)), sorted(profile), prompt);
	}
});

for (const [name, scenario] of Object.entries(fixture.scenarios)) {
	test(`engine scenario matches Python: ${name}`, () => {
		const engine = new HostEngine(new DurableObjectRunStore(memorySql()), scenario.text_policy === "relaxed" ? { textPolicy: RELAXED_TEXT_POLICY } : {});
		let runId: string | null = null;
		scenario.steps.forEach(([operation, args, owner], index) => {
			const payload = JSON.stringify(args).split("$RUN").join(runId ?? "$RUN");
			const envelope = JSON.parse(dispatch(engine, owner ?? fixture.owner, operation, payload)) as
				{ ok: boolean; code?: string; result?: Record<string, unknown> };
			if (operation === "start_run" && envelope.ok) runId = String(envelope.result!.run_id);
			const actual = envelope.ok
				? { ok: true, result: JSON.parse(canonicalJson(envelope.result).split(runId ?? "\u0000").join("$RUN")) }
				: { ok: false, code: envelope.code };
			assert.deepEqual(sorted(actual), sorted(scenario.expected[index]), `${name} step ${index}: ${operation}`);
		});
	});
}
