import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyHistory, fingerprintState, normalizeState, observeLoop } from "../src/loop.ts";

test("normalization ignores case, spacing and punctuation, but not different words", () => {
	// Punctuation becomes a space, as in the Python original: "re-check" matches "re check", not
	// "recheck". Hyphenation is a real difference in wording, so it is kept.
	assert.equal(normalizeState("Re-check  the DOI!"), normalizeState("re check the doi"));
	assert.notEqual(normalizeState("re-check"), normalizeState("recheck"));
	assert.equal(fingerprintState("Fix requirement R1."), fingerprintState("fix   requirement r1"));
	assert.notEqual(fingerprintState("fix requirement R1"), fingerprintState("fix requirement R2"));
	assert.throws(() => fingerprintState("   ...   "), /must not be empty/);
});

test("the same state warns on the third attempt and is called a loop on the fourth", () => {
	const h = emptyHistory();
	const fp = fingerprintState("same approach");
	assert.equal(observeLoop(h, fp).action, "continue");
	assert.equal(observeLoop(h, fp).action, "continue");
	assert.equal(observeLoop(h, fp).action, "diversify");
	const fourth = observeLoop(h, fp);
	assert.equal(fourth.action, "repeated");
	assert.equal(fourth.repeats, 4);
});

test("different states never trip the repeat rule, and steps count them all", () => {
	const h = emptyHistory();
	for (const s of ["a one", "b two", "c three", "d four", "e five"]) assert.equal(observeLoop(h, fingerprintState(s)).action, "continue");
	assert.equal(observeLoop(h, fingerprintState("f six")).steps, 6);
});

test("progress that does not move across the window is a stall; progress that moves is not", () => {
	const stuck = emptyHistory();
	assert.equal(observeLoop(stuck, fingerprintState("try 1"), 2).action, "continue");
	assert.equal(observeLoop(stuck, fingerprintState("try 2"), 2).action, "continue");
	const third = observeLoop(stuck, fingerprintState("try 3"), 2);
	assert.equal(third.action, "stalled");
	assert.equal(third.best_progress, 2);

	const moving = emptyHistory();
	for (const [i, p] of [1, 2, 3].entries()) assert.equal(observeLoop(moving, fingerprintState(`step ${i}`), p).action, "continue");
});

test("history stays bounded without losing the fingerprint being judged", () => {
	const h = emptyHistory();
	for (let i = 0; i < 200; i++) observeLoop(h, fingerprintState(`state number ${i}`));
	assert.ok(Object.keys(h.counts).length <= 64, "the map is capped");
	const fp = fingerprintState("state number 199");
	assert.equal(observeLoop(h, fp).repeats, h.counts[fp], "the current fingerprint survived the trim");
	assert.ok(h.progress.length <= 3);
});

test("the engine refuses an identical re-entry and warns one attempt earlier", async () => {
	const { HostEngine } = await import("../src/engine.ts");
	const { DurableObjectRunStore } = await import("../src/store.ts");
	const { memorySql } = await import("./sqlite-fake.ts");
	const sql = memorySql();
	const engine = new HostEngine(new DurableObjectRunStore(sql), { transaction: sql.transaction, maxReentries: 10 });
	const run = String(engine.startRun("o", "Research and verify the published estimates for this quantity").run_id);
	const same = { target_stage: "QUERY" as const, trigger: "the objective was unclear", reason: "the objective was unclear, so restate it from the request" };
	assert.equal(engine.reenter("o", run, same).loop, undefined, "the first re-entry is ordinary");
	engine.submitStage("o", run, { stage: "QUERY", outcome: "completed", summary: "Restated the request and the constraints it depends on for this run." });
	assert.equal(engine.reenter("o", run, same).loop, undefined);
	engine.submitStage("o", run, { stage: "QUERY", outcome: "completed", summary: "Restated the request and the constraints it depends on, second pass." });
	const warned = engine.reenter("o", run, same);
	assert.equal((warned.loop as { action: string }).action, "diversify", "the third identical attempt is warned");
	engine.submitStage("o", run, { stage: "QUERY", outcome: "completed", summary: "Restated the request and the constraints it depends on, third pass." });
	assert.throws(() => engine.reenter("o", run, same), /already re-entered QUERY/, "the fourth is refused");
	// A different reason is still allowed: the budget, not the repeat rule, bounds that.
	assert.ok(engine.reenter("o", run, { ...same, reason: "a different gap: the deliverable was never stated" }));
});
