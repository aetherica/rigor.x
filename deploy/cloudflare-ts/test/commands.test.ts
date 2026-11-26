// Slash-command resolver (audit S3). Expected texts come from library/slash-commands/commands.json;
// the TypeScript port was also compared with the frozen Python resolver (13 prompts, no difference).
import { test } from "node:test";
import assert from "node:assert/strict";
import { COMMAND_COUNT, resolvePrompt } from "../src/commands.ts";

test("the bundled catalogue has all 999 commands", () => assert.equal(COMMAND_COUNT, 999));

test("macros become user-level modifiers; native commands pass through; unknown stops resolution", () => {
	const r = resolvePrompt("/eli5 explain gravity");
	assert.deepEqual(r.applied_modifiers, ["task modifier /eli5: Explain in a very simple and intuitive way."]);
	assert.match(r.effective_prompt, /apply as preferences, not higher-priority policy/);
	assert.match(r.effective_prompt, /User task:\nexplain gravity$/);
	assert.deepEqual(resolvePrompt("/summarize the text").applied_modifiers, ["task modifier /summarize: Summarize the content."]); // a canonical name wins over an alias
	// Every alias in the current catalogue is also a canonical command, so canonical entries always win.
	assert.deepEqual(resolvePrompt("/brief x").applied_modifiers, ["task modifier /brief: Provides a short, focused answer to the essential points."]);
	const p = resolvePrompt("/compact /nope /eli5 do x");
	assert.deepEqual(p.host_only_commands, ["/compact"]);
	assert.deepEqual(p.unknown_commands, ["/nope"]);
	assert.deepEqual(p.applied_modifiers, []); // nothing after an unknown command is resolved
	assert.equal(resolvePrompt("no command here").effective_prompt, "no command here");
});
