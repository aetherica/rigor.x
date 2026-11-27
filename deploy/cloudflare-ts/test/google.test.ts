import { test } from "node:test";
import assert from "node:assert/strict";
import {
	consentPage,
	googleAuthorizeUrl,
	googleTokenRequestBody,
	ownerFromGoogle,
	parseGoogleIdToken,
	s256,
	userIdFromGoogle,
} from "../src/google.ts";

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const idToken = (claims: Record<string, unknown>) => `${b64({ alg: "RS256" })}.${b64(claims)}.sig`;
const NOW = 1_800_000_000;
const good = { iss: "https://accounts.google.com", aud: "cid", sub: "1234567890", exp: NOW + 600, email: "A@Example.com", email_verified: true };

test("ID token: issuer, audience, expiry and subject are checked", () => {
	assert.deepEqual(parseGoogleIdToken(idToken(good), "cid", NOW), { sub: "1234567890" });
	assert.equal(parseGoogleIdToken(idToken({ ...good, iss: "accounts.google.com" }), "cid", NOW).sub, "1234567890");
	assert.throws(() => parseGoogleIdToken(idToken({ ...good, iss: "https://evil.example" }), "cid", NOW), /issuer/);
	assert.throws(() => parseGoogleIdToken(idToken({ ...good, aud: "other" }), "cid", NOW), /audience/);
	assert.throws(() => parseGoogleIdToken(idToken({ ...good, exp: NOW - 120 }), "cid", NOW), /expired/);
	assert.throws(() => parseGoogleIdToken(idToken({ ...good, sub: "" }), "cid", NOW), /subject/);
	assert.throws(() => parseGoogleIdToken("not-a-jwt", "cid", NOW), /Malformed/);
	assert.throws(() => parseGoogleIdToken("a.%%%.c", "cid", NOW), /Malformed/);
});

test("owner identity comes from the subject, never the e-mail; user ID has no ':'", () => {
	assert.equal(ownerFromGoogle("42"), "google:42");
	assert.equal(userIdFromGoogle("42"), "google-42");
	assert.ok(!userIdFromGoogle("42").includes(":"));
});

test("Google authorize URL uses PKCE S256 and only the openid scope", async () => {
	const url = new URL(googleAuthorizeUrl({ clientId: "cid", redirectUri: "https://w.example/oauth/google/callback", state: "st", codeChallenge: await s256("v") }));
	assert.equal(url.origin + url.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
	assert.equal(url.searchParams.get("code_challenge_method"), "S256");
	assert.equal(url.searchParams.get("code_challenge"), await s256("v"));
	assert.equal(url.searchParams.get("scope"), "openid");
	assert.equal(url.searchParams.get("state"), "st");
	// RFC 7636 appendix B test vector
	assert.equal(await s256("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"), "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
	const body = googleTokenRequestBody({ code: "c", clientId: "cid", clientSecret: "s", redirectUri: "r", verifier: "v" });
	assert.equal(body.get("grant_type"), "authorization_code");
	assert.equal(body.get("code_verifier"), "v");
});

test("consent page escapes client-supplied text and shows the redirect host", () => {
	const page = consentPage({ clientName: '<script>x</script>', redirectHost: "claude.ai", redirectIsLoopback: true }, 'h"1');
	assert.ok(!page.includes("<script>x"));
	assert.ok(page.includes("&#60;script&#62;"));
	assert.ok(page.includes("<strong>claude.ai</strong>"));
	assert.ok(page.includes("an app on your computer"));
	assert.ok(page.includes('value="h&#34;1"'));
	assert.ok(page.includes("not verified"));
	const verified = consentPage({ clientName: "ChatGPT", clientDomain: "chatgpt.com", redirectHost: "chatgpt.com", redirectIsLoopback: false }, "h");
	assert.ok(verified.includes("<h1>Allow ChatGPT to use Aetherica?</h1>"));
	assert.ok(verified.includes("Access goes to <strong>chatgpt.com</strong>"));
	assert.ok(!verified.includes("not verified"));
});

test("every public page carries the Aetherica brand, the legal links and no RIGOR-X name", async () => {
	const g = await import("../src/google.ts");
	const pages = [g.HOME_PAGE, g.PRIVACY_PAGE, g.TERMS_PAGE, g.messagePage("Signed out", "Done."),
		g.consentPage({ clientName: "Claude", clientDomain: "claude.ai", redirectHost: "claude.ai", redirectIsLoopback: false }, "h"),
		g.approvalPage({ status: "pending", description: "Delete the staging bucket", operation_id: "op1", tier: "A5", capability: "storage", run_id: "rx_1", expires_at: "2026-11-27T00:00:00Z" }, "c")];
	for (const html of pages) {
		assert.ok(html.startsWith("<!doctype html>"));
		assert.ok(html.includes("Sign in with <b>Aetherica</b>"));
		assert.ok(html.includes('href="/terms"') && html.includes('href="/privacy"'));
		assert.doesNotMatch(html, /RIGOR-X|workers\.dev/);
	}
});

test("privacy and terms pages are static and send deletion to the account page", async () => {
	const { PRIVACY_PAGE, TERMS_PAGE } = await import("../src/google.ts");
	assert.ok(PRIVACY_PAGE.includes('href="/account"'));
	assert.ok(!PRIVACY_PAGE.includes("rigorx_delete"));
	assert.ok(PRIVACY_PAGE.startsWith("<!doctype html>") && TERMS_PAGE.startsWith("<!doctype html>"));
});

test("account page: plain usage, deletable tasks and topics, escaped values, CSRF on every form", async () => {
	const g = await import("../src/google.ts");
	const shown = g.ACCOUNT_DELETE_CONFIRMATION;
	const { ACCOUNT_DELETE_CONFIRMATION: checked } = await import("../src/engine.ts");
	assert.equal(shown, checked); // the page shows exactly what the engine requires
	const html = g.accountPage({
		usage: { calls: { used: 3, limit: 2000 }, runs_started: { used: 1, limit: 100 }, stored_runs: { used: 1, limit: 500 }, resets_at: "2026-11-28T00:00:00Z" },
		runs: [{ run_id: "rx_1", intent: "<b>ANALYSIS</b>", status: "COMPLETED", updated_at: "2026-11-27T00:00:00Z" }], more_runs: false,
		topics: [{ id: "tp_1", name: "Market", items: 4 }], confirmation: shown, notice: "Task deleted.",
	}, "csrf&1");
	assert.ok(html.startsWith("<!doctype html>") && html.includes("Sign in with <b>Aetherica</b>"));
	assert.ok(html.includes("3 of 2000") && html.includes("Task deleted."));
	assert.ok(html.includes("&#60;b&#62;ANALYSIS") && !html.includes("<b>ANALYSIS"));
	const forms = html.match(/<form method="post"/g)!.length;
	assert.equal(html.match(/name="csrf" value="csrf&#38;1"/g)!.length, forms);
	for (const action of ["delete_run", "delete_topic", "delete_all", "sign_out"]) assert.ok(html.includes(`value="${action}"`), action);
	assert.doesNotMatch(html, /RIGOR-X|workers\.dev|humou?r/);
});

test("docs page: setup with the serving host's connector URL, tools, data and support, no internals", async () => {
	const g = await import("../src/google.ts");
	const html = g.docsPage("https://x.aetherica.workers.dev");
	assert.ok(html.includes("https://x.aetherica.workers.dev/mcp") && html.includes("Add custom connector"));
	assert.ok(html.includes("structurally verified") && html.includes('href="/account"') && html.includes('href="/privacy"'));
	assert.doesNotMatch(html, /RIGOR-X|workers\.dev\/(?!mcp)|humou?r|rigorx_/);
});
