// Tests the REAL Worker authentication path (src/index.ts + auth.ts + the OAuth provider) under
// `wrangler dev` (WS32 P0.6). A static bearer token is configured as a Worker var to prove that a
// configured shared token is still not accepted (regression test for P0.1).
// Usage (from deploy/cloudflare-ts): node test/integration/auth-probe.mjs [--node]
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";

// With --node the same checks run against the portable Node runtime (deploy/node) instead.
const NODE = process.argv.includes("--node");
const port = NODE ? 8796 : 8795;
const base = `http://127.0.0.1:${port}`;
const STATIC = "static-token-that-must-not-work-0001";
const dev = NODE
	? spawn(process.execPath, ["--import", "../node/register.mjs", "--experimental-strip-types", "--disable-warning=ExperimentalWarning", "../node/server.ts"], {
		env: { PATH: process.env.PATH, PUBLIC_ORIGIN: base, PORT: String(port), HOST: "127.0.0.1", DATA_DIR: mkdtempSync(join(tmpdir(), "rigorx-auth-node-")),
			RIGORX_SPIKE_TOKEN: STATIC, GOOGLE_CLIENT_ID: "probe-client", GOOGLE_CLIENT_SECRET: "probe-secret", RIGORX_RETRY_MAX_ATTEMPTS: "99" },
		stdio: ["ignore", "pipe", "pipe"] })
	: spawn("./node_modules/.bin/wrangler", ["dev", "--port", String(port), "--ip", "127.0.0.1",
		"--var", `RIGORX_SPIKE_TOKEN:${STATIC}`, "--var", "GOOGLE_CLIENT_ID:probe-client", "--var", "GOOGLE_CLIENT_SECRET:probe-secret", "--var", "RIGORX_RETRY_MAX_ATTEMPTS:99", "--persist-to", mkdtempSync(join(tmpdir(), "rigorx-auth-"))],
		{ env: { ...process.env, WRANGLER_SEND_METRICS: "false", CI: "1" }, stdio: ["ignore", "pipe", "pipe"] });
console.log(`auth probe target: ${NODE ? "Node runtime (deploy/node)" : "wrangler dev (workerd)"}`);
let log = "";
dev.stdout.on("data", (d) => { log += d; });
dev.stderr.on("data", (d) => { log += d; });

async function ready() {
	for (let i = 0; i < 60; i++) {
		try { await fetch(`${base}/`); return; } catch { await new Promise((r) => setTimeout(r, 1000)); }
	}
	throw new Error("wrangler dev did not start:\n" + log);
}
const mcp = (headers = {}) => fetch(`${base}/mcp`, {
	method: "POST",
	headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers },
	body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "rigorx_profile", arguments: {} } }),
});

let failures = 0;
async function check(name, fn) {
	try { await fn(); console.log(`ok - ${name}`); } catch (e) { failures++; console.log(`not ok - ${name}\n  ${e.message}`); }
}

try {
	await ready();
	await check("home page names the brand and no spike", async () => {
		const r = await fetch(`${base}/`);
		const text = await r.text();
		assert.match(text, /<h1>Aetherica<\/h1>/);
		assert.match(r.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
		assert.doesNotMatch(text, /spike/i);
	});
	await check("no token: 401 with resource_metadata", async () => {
		const r = await mcp();
		assert.equal(r.status, 401);
		assert.match(r.headers.get("www-authenticate") ?? "", /resource_metadata="http:\/\/127\.0\.0\.1:\d+\/\.well-known\/oauth-protected-resource\/mcp"/);
	});
	await check("unknown bearer: 401 invalid_token", async () => {
		const r = await mcp({ authorization: "Bearer not-a-token" });
		assert.equal(r.status, 401);
		assert.equal((await r.json()).error, "invalid_token");
	});
	await check("a configured static token is rejected (P0.1 regression)", async () => {
		const r = await mcp({ authorization: `Bearer ${STATIC}` });
		assert.equal(r.status, 401);
		assert.equal((await r.json()).error, "invalid_token");
	});
	await check("OAuth metadata, dynamic registration and consent page", async () => {
		assert.equal((await fetch(`${base}/.well-known/oauth-authorization-server`)).status, 200);
		const pr = await (await fetch(`${base}/.well-known/oauth-protected-resource/mcp`)).json();
		assert.equal(pr.resource, `${base}/mcp`);
		const reg = await fetch(`${base}/register`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
			client_name: "ci-probe", redirect_uris: ["http://127.0.0.1:9999/cb"], token_endpoint_auth_method: "none",
			grant_types: ["authorization_code"], response_types: ["code"] }) });
		assert.equal(reg.status, 201);
		const { client_id } = await reg.json();
		const q = new URLSearchParams({ response_type: "code", client_id, redirect_uri: "http://127.0.0.1:9999/cb", state: "s",
			code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM", code_challenge_method: "S256", resource: `${base}/mcp` });
		// A browser navigation (Sec-Fetch-Mode: navigate) must still reach the Worker with static assets configured.
		const consent = await fetch(`${base}/authorize?${q}`, { headers: { "sec-fetch-mode": "navigate", "sec-fetch-dest": "document" } });
		assert.equal(consent.status, 200);
		const html = await consent.text();
		assert.match(html, /<h1>Allow ci-probe to use Aetherica\?<\/h1>/);
		assert.match(html, /Continue with Google/);
		assert.match(html, /<img class="mark" src="\/icon-192\.png"/);
		assert.match(html, /<link rel="icon" href="\/favicon\.ico"/);
		const csp = consent.headers.get("content-security-policy") ?? "";
		assert.ok(!/img-src[^;]*'none'/.test(csp) && !/default-src[^;]*'none'/.test(csp) || /img-src[^;]*'self'/.test(csp), `CSP blocks the emblem: ${csp}`);
		console.log(`  consent CSP: ${csp || "(none)"}`);
	});
	await check("icons are served by the static asset layer (PNG bytes as built, transparent corners)", async () => {
		for (const n of [32, 48, 64, 96, 128, 192, 256, 448]) {
			const r = await fetch(`${base}/icon-${n}.png`);
			assert.equal(r.status, 200, `icon-${n}`);
			assert.equal(r.headers.get("content-type"), "image/png", `icon-${n}`);
			const bytes = new Uint8Array(await r.arrayBuffer());
			assert.deepEqual(bytes, new Uint8Array(readFileSync(`public/icon-${n}.png`)), `icon-${n} bytes`);
		}
		const ico = await fetch(`${base}/favicon.ico`);
		assert.equal(ico.status, 200);
		assert.match(ico.headers.get("content-type") ?? "", /icon/);
		const privacy = await fetch(`${base}/privacy`, { headers: { "sec-fetch-mode": "navigate" } });
		assert.match(await privacy.text(), /Aetherica privacy policy/); // still the Worker's page, not an asset 404
		assert.equal((await fetch(`${base}/icon-999.png`)).status, 404); // unknown icons fall through to the Worker's 404
	});
	await check("/version and /health are public, non-sensitive, uncached; an out-of-range policy var is rejected", async () => {
		const v = await fetch(`${base}/version`);
		assert.equal(v.status, 200);
		assert.equal(v.headers.get("cache-control"), "no-store");
		const j = await v.json();
		assert.equal(j.engine_protocol, "2.0.0");
		assert.equal(j.gate, "2.1.0");
		assert.equal(j.config_rejected, 1); // RIGORX_RETRY_MAX_ATTEMPTS=99 is outside 1..5
		assert.match(j.resilience_policy, /^[0-9a-f]{8}$/);
		const h = await (await fetch(`${base}/health`)).json();
		assert.equal(h.ok, true);
		assert.equal(JSON.stringify(h).includes("secret"), false);
	});
	await check("approval link: Google sign-in with state, nonce and PKCE; no session, no decision", async () => {
		const id = "apv_" + "0".repeat(32);
		const r = await fetch(`${base}/approve/${id}`, { redirect: "manual" });
		assert.equal(r.status, 302);
		const loc = new URL(r.headers.get("location"));
		assert.equal(loc.origin + loc.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
		assert.match(loc.searchParams.get("state"), /^acc\./); // page sign-ins share one KV-state prefix
		assert.ok(loc.searchParams.get("nonce"));
		assert.equal(loc.searchParams.get("code_challenge_method"), "S256");
		assert.equal(loc.searchParams.get("redirect_uri"), `${base}/oauth/google/callback`); // the already registered callback
		assert.equal(loc.searchParams.get("scope"), "openid");
		const post = await fetch(`${base}/approve/${id}`, { method: "POST", body: new URLSearchParams({ decision: "approve", csrf: "x" }), redirect: "manual" });
		assert.equal(post.status, 403); // no session cookie: nothing is recorded
		const forged = await fetch(`${base}/approve/${id}`, { method: "POST", headers: { cookie: "rx_apv=forged-session" }, body: new URLSearchParams({ decision: "approve", csrf: "x" }), redirect: "manual" });
		assert.equal(forged.status, 403);
		const cb = await fetch(`${base}/oauth/google/callback?state=apv.unknown&code=x`, { redirect: "manual" });
		assert.equal(cb.status, 400); // unknown or replayed approval state
		assert.equal((await fetch(`${base}/approve/not-an-id`, { redirect: "manual" })).status, 404);
	});
	await check("token endpoint rejects a forged authorization code", async () => {
		const r = await fetch(`${base}/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({ grant_type: "authorization_code", code: "forged", redirect_uri: "http://127.0.0.1:9999/cb", client_id: "x", code_verifier: "v" }) });
		assert.ok(r.status === 400 || r.status === 401, `status ${r.status}`);
	});
} finally {
	dev.kill("SIGTERM");
}
if (failures) { console.log(`${failures} failed`); process.exit(1); }
console.log("all auth checks passed");
