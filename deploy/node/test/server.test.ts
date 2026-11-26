// The Node HTTP runtime end to end: OAuth (real tokens from the server's own provider), MCP over
// HTTP, per-owner isolation through the HTTP path, request-target and body guards, and shutdown.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { connect } from "node:net";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { issueToken, mcp, startTestServer, tool } from "./helpers.ts";

const srv = await startTestServer();
const base = srv.url;
after(() => srv.shutdown("test end"));

test("unauthenticated MCP: 401 with resource_metadata on the configured origin", async () => {
	const r = await mcp(base, null, "tools/list");
	assert.equal(r.status, 401);
	assert.equal(r.headers.get("www-authenticate"), `Bearer realm="OAuth", resource_metadata="${base}/.well-known/oauth-protected-resource/mcp"`);
	const forged = await mcp(base, "not-a-real-token", "tools/list");
	assert.equal(forged.status, 401);
	const meta = await (await fetch(`${base}/.well-known/oauth-authorization-server`)).json() as Record<string, unknown>;
	assert.equal(meta.issuer, base);
	assert.deepEqual(meta.code_challenge_methods_supported, ["S256"]);
});

test("public pages, icons, version and health", async () => {
	const home = await fetch(`${base}/`);
	assert.equal(home.status, 200);
	assert.match(await home.text(), /<h1>Aetherica<\/h1>/);
	assert.match(home.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
	const icon = await fetch(`${base}/icon-192.png`);
	assert.equal(icon.status, 200);
	assert.equal(icon.headers.get("content-type"), "image/png");
	assert.equal((await fetch(`${base}/icon-999.png`)).status, 404);
	const health = await (await fetch(`${base}/health`)).json() as Record<string, unknown>;
	assert.equal(health.ok, true);
	assert.equal(JSON.stringify(health).includes("test-secret-not-real"), false);
	const version = await (await fetch(`${base}/version`)).json() as Record<string, unknown>;
	assert.equal(version.engine_protocol, "2.0.0");
});

test("consent page from the real authorize endpoint", async () => {
	const reg = await fetch(`${base}/register`, { method: "POST", headers: { "content-type": "application/json" },
		body: JSON.stringify({ client_name: "Consent Probe", redirect_uris: ["https://client.example/cb"], token_endpoint_auth_method: "none", grant_types: ["authorization_code"], response_types: ["code"] }) });
	const { client_id } = await reg.json() as { client_id: string };
	const q = new URLSearchParams({ response_type: "code", client_id, redirect_uri: "https://client.example/cb", state: "s", code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM", code_challenge_method: "S256", resource: `${base}/mcp` });
	const page = await fetch(`${base}/authorize?${q}`);
	assert.equal(page.status, 200);
	const html = await page.text();
	assert.match(html, /<h1>Allow Consent Probe to use Aetherica\?<\/h1>/);
	assert.match(html, /Access goes to <strong>client\.example<\/strong>/);
	// A client cannot redirect to a URI it did not register.
	const bad = new URLSearchParams(q);
	bad.set("redirect_uri", "https://attacker.example/cb");
	assert.notEqual((await fetch(`${base}/authorize?${bad}`)).status, 200);
});

test("PKCE: a wrong code_verifier gets no token, and a code cannot be used twice", async () => {
	await assert.rejects(issueToken(srv, "pkce-user", { verifier: "x".repeat(43) }), /token exchange failed: 400/);
	let replay = 0;
	await issueToken(srv, "replay-user", { replayStatus: (st) => { replay = st; } });
	assert.ok(replay === 400 || replay === 401, `replayed code answered ${replay}`);
});

test("MCP with a real access token: initialize, tools/list, a tool call stored in the owner's own file", async () => {
	const token = await issueToken(srv, "alice-sub");
	const init = await mcp(base, token, "initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "node-test", version: "1" } });
	assert.equal(init.status, 200);
	assert.equal(init.body.result.protocolVersion, "2025-11-25");
	assert.equal(init.body.result.serverInfo.title, "Aetherica");
	assert.equal((await mcp(base, token, "notifications/initialized", {}, null)).status, 202);
	const list = await mcp(base, token, "tools/list");
	assert.equal(list.status, 200);
	const names = list.body.result.tools.map((t: { name: string }) => t.name);
	assert.equal(names.length, 19);
	assert.ok(names.includes("rigorx_start_run") && !names.includes("rigorx_delete_account_data")); // deletion is on /account
	const routed = await tool(base, token, "rigorx_route", { task: "/l01 delete production database and all backups" });
	assert.equal(routed.profile.level, "L05_CRITICAL");
	const run = await tool(base, token, "rigorx_start_run", { task: "Evaluate three caching strategies for an API" });
	assert.match(run.run_id, /^rx_/);
	const owners = readdirSync(join(srv.config.dataDir, "owners")).filter((f) => f.endsWith(".sqlite"));
	assert.equal(owners.length, 1);

	// A second account sees none of alice's runs and cannot read her run by ID.
	const bobToken = await issueToken(srv, "bob-sub");
	assert.equal((await tool(base, bobToken, "rigorx_list_runs")).runs.length, 0);
	const stolen = await mcp(base, bobToken, "tools/call", { name: "rigorx_get_run", arguments: { run_id: run.run_id } });
	assert.equal(stolen.body.result.isError, true);
	assert.equal(readdirSync(join(srv.config.dataDir, "owners")).filter((f) => f.endsWith(".sqlite")).length, 2);

	// Account deletion is not an assistant tool: the user deletes data on /account.
	const refused = await mcp(base, token, "tools/call", { name: "rigorx_delete_account_data", arguments: { confirm: "DELETE ALL MY AETHERICA DATA", decided_by: "user" } });
	assert.ok(refused.body.error !== undefined || refused.body.result?.isError === true);
	assert.equal((await tool(base, token, "rigorx_list_runs")).runs.length, 1);
});

test("absolute-form request targets are refused (the origin is fixed by configuration)", async () => {
	const port = new URL(base).port;
	const reply = await new Promise<string>((done, fail) => {
		const s = connect(Number(port), "127.0.0.1", () => s.write("GET http://attacker.example/.well-known/oauth-authorization-server HTTP/1.1\r\nHost: attacker.example\r\nConnection: close\r\n\r\n"));
		let data = "";
		s.on("data", (d) => { data += d; });
		s.on("end", () => done(data));
		s.on("error", fail);
	});
	assert.match(reply, /^HTTP\/1\.1 400/);
	assert.doesNotMatch(reply, /attacker\.example/);
});

test("a Host header cannot change the origin in OAuth metadata", async () => {
	const port = Number(new URL(base).port);
	const reply = await new Promise<string>((done, fail) => {
		const s = connect(port, "127.0.0.1", () => s.write("GET /.well-known/oauth-authorization-server HTTP/1.1\r\nHost: attacker.example\r\nConnection: close\r\n\r\n"));
		let data = "";
		s.on("data", (d) => { data += d; });
		s.on("end", () => done(data));
		s.on("error", fail);
	});
	assert.match(reply, /^HTTP\/1\.1 200/);
	assert.doesNotMatch(reply, /attacker\.example/);
});

test("request bodies above the limit are refused with 413", async () => {
	const r = await fetch(`${base}/mcp`, { method: "POST", headers: { "content-type": "application/json" }, body: "x".repeat(srv.config.maxBodyBytes + 1) });
	assert.equal(r.status, 413);
});

test("shutdown: health reports draining, storage is closed and checkpointed", async () => {
	const s2 = await startTestServer();
	const t = await issueToken(s2, "shutdown-sub");
	await tool(s2.url, t, "rigorx_start_run", { task: "Draft a release checklist for the mobile app" });
	await s2.shutdown("test");
	await assert.rejects(fetch(`${s2.url}/health`)); // no longer listening
	assert.throws(() => s2.owners.call("0".repeat(64), "x", "list_runs", "{}"), /closed/);
	const dir = join(s2.config.dataDir, "owners");
	assert.equal(readdirSync(dir).some((f) => f.endsWith("-wal") && existsSync(join(dir, f))), false);
});
