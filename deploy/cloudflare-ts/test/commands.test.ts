// Slash-command resolver (audit S3). Expected texts come from library/slash-commands/commands.json;
// the TypeScript port was also compared with the frozen Python resolver (13 prompts, no difference).
import { test } from "node:test";
import assert from "node:assert/strict";
import { COMMAND_COUNT, COMMAND_SOURCES, resolvePrompt } from "../src/commands.ts";

test("the bundle holds the 999-entry corpus and the 48 owner-authored commands, kept apart", () => {
	assert.deepEqual(COMMAND_SOURCES, [
		{ path: "library/slash-commands/commands.json", total: 999 },
		{ path: "library/rigorx-commands/commands.json", total: 48 },
	]);
	assert.equal(COMMAND_COUNT, 1047);
});

test("owner-authored commands resolve: macros as modifiers, UI/MENU entries preserved for the host", () => {
	const r = resolvePrompt("/deepthink /redflags /help assess the offer");
	assert.deepEqual(r.applied_modifiers.map((m) => m.split(":")[0]), ["task modifier /deepthink", "task modifier /redflags"]);
	assert.deepEqual(r.host_only_commands, ["/help"]);
	assert.deepEqual(r.unknown_commands, []);
	assert.match(r.effective_prompt, /User task:\nassess the offer$/);
	assert.deepEqual(resolvePrompt("/BOOSTREASONING x").host_only_commands, ["/boostreasoning"]); // case-insensitive
	assert.deepEqual(resolvePrompt("/stresstest x").applied_modifiers.map((m) => m.split(":")[0]), ["task modifier /stress"]); // alias
});

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
