// Humor policy (directive §13): expected decisions written by hand from the policy table.
import { test } from "node:test";
import assert from "node:assert/strict";
import { humorPolicy, type Context } from "../src/humor.ts";
import { handleMessage } from "../src/mcp.ts";
import { localBackend } from "./backend.ts";

const decide = (contexts: Context[], extra = {}) => humorPolicy({ contexts, ...extra });

test("the ten contexts of directive §13", () => {
	for (const c of ["emergency", "bereavement", "medical", "legal", "security_incident", "sensitive_personal"] as Context[]) {
		const d = decide([c], { user_preference: "playful" });
		assert.equal(d.decision, "suppress", c);
		assert.equal(d.max_intensity, 0, c);
		assert.deepEqual(d.allowed_styles, [], c);
	}
	assert.equal(decide(["negotiation"], { user_preference: "playful" }).max_intensity, 1);
	assert.equal(decide(["debugging"], { user_preference: "playful" }).max_intensity, 1);
	assert.equal(decide(["casual"], { user_preference: "playful" }).max_intensity, 2);
	assert.equal(decide(["creative"], { user_preference: "playful" }).max_intensity, 3);
	assert.equal(decide(["creative"]).max_intensity, 2); // playful only when the user says so
});

test("unknown context, distress and an explicit no suppress humor; the most restrictive context wins", () => {
	assert.equal(decide([]).decision, "suppress");
	assert.match(decide([]).reasons[0]!, /unknown context is not treated as safe/);
	assert.equal(decide(["casual"], { user_distress: true }).decision, "suppress");
	assert.equal(decide(["creative"], { user_preference: "none" }).decision, "suppress");
	assert.equal(decide(["creative", "medical"], { user_preference: "playful" }).decision, "suppress");
	assert.equal(decide(["creative", "negotiation"], { user_preference: "playful" }).max_intensity, 1);
});

test("styles: never humiliating or at the user's expense; audience and feedback lower the cap", () => {
	const d = decide(["creative"], { user_preference: "playful" });
	assert.ok(d.allowed_styles.includes("satire"));
	assert.ok(!d.allowed_styles.includes("sarcasm"));
	for (const s of ["humiliating", "identity_targeting", "misleading_as_fact", "sarcasm_at_user", "dark"]) assert.ok(d.blocked_styles.includes(s), s);
	assert.equal(decide(["creative"], { user_preference: "playful", audience: "public" }).max_intensity, 1);
	assert.ok(!decide(["casual"], { user_preference: "playful", multilingual_audience: true }).allowed_styles.includes("wordplay"));
	assert.equal(decide(["casual"], { user_preference: "playful", last_reaction: "negative" }).max_intensity, 1);
	assert.equal(decide(["debugging"], { user_preference: "light", last_reaction: "negative" }).decision, "suppress");
});

test("the humor helper is internal: it is not an MCP tool", async () => {
	const r = await handleMessage({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "rigorx_humor_policy", arguments: { contexts: ["casual"] } } }, localBackend(), null);
	assert.equal((r as any).error?.code ?? (r as any).result?.isError, (r as any).error ? (r as any).error.code : true);
	const list = await handleMessage({ jsonrpc: "2.0", id: 2, method: "tools/list" }, localBackend(), null);
	assert.ok(!((list!.result as any).tools as any[]).some((t) => t.name === "rigorx_humor_policy"));
});
