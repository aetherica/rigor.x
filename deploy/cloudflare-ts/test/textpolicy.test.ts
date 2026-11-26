import { test } from "node:test";
import assert from "node:assert/strict";
import { words } from "../src/engine.ts";

// Word units: whitespace tokens with a letter or digit, plus one unit per character of a script
// written without spaces (WS32 N3). Expected values are counted by hand.
test("word units for scripts with spaces", () => {
	assert.equal(words("We collected all the context."), 5);
	assert.equal(words("আমরা সব প্রেক্ষাপট সংগ্রহ করেছি"), 5);
	assert.equal(words("  --  ...  "), 0);
	assert.equal(words("v2.1 is 3x faster"), 4);
});

test("word units for scripts without spaces", () => {
	assert.equal(words("我们收集了资料"), 7); // 7 Han characters
	assert.equal(words("ユーザー"), 4); // ユ ー ザ ー: the long-vowel mark U+30FC is in the Katakana block
	assert.equal(words("ข้อมูล"), 6); // 6 Thai code points (consonants and marks)
	assert.equal(words("Mixed 混合 text"), 4); // Mixed, text + 2 Han
	assert.equal(words("𠀀𠀁"), 2); // CJK Extension B (supplementary plane)
});

test("minimum length: logographic and syllabic characters count as two units", async () => {
	const { charUnits } = await import("../src/text.ts");
	assert.equal(charUnits("每次发布前必须运行全部测试"), 26); // 13 Han characters
	assert.equal(charUnits("テスト"), 6);
	assert.equal(charUnits("배포"), 4);
	assert.equal(charUnits("আমরা"), 4); // Bengali: one per code point
	assert.equal(charUnits("ข้อมูล"), 6); // Thai: one per code point
	assert.equal(charUnits("abc"), 3);
});
