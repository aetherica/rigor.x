// Test helpers for the Node runtime: an in-process server on a temporary data directory, and real
// OAuth access tokens. Tokens are issued by the server's own OAuth provider through the normal
// flow (client registration, authorization request, code, PKCE token exchange); only the Google
// sign-in step is replaced by completing the authorization directly with the provider's helper API,
// which is what auth.ts does after Google answers. Production code has no test path.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash, randomBytes } from "node:crypto";
// The library lives in the Worker package (deploy/cloudflare-ts); the same file auth.ts loads.
import { getOAuthApi } from "../../cloudflare-ts/node_modules/@cloudflare/workers-oauth-provider/dist/oauth-provider.js";
import { ownerFromGoogle, userIdFromGoogle } from "../../cloudflare-ts/src/google.ts";
import { loadConfig, type NodeConfig } from "../config.ts";
import { startServer, type RunningServer } from "../server.ts";

export function testConfig(extra: Record<string, string> = {}): NodeConfig {
	return loadConfig({
		PUBLIC_ORIGIN: "http://127.0.0.1:1", // replaced below once the port is known
		PORT: "0",
		HOST: "127.0.0.1",
		DATA_DIR: mkdtempSync(join(tmpdir(), "rigorx-node-")),
		GOOGLE_CLIENT_ID: "test-client.apps.googleusercontent.com",
		GOOGLE_CLIENT_SECRET: "test-secret-not-real",
		SHUTDOWN_GRACE_MS: "2000",
		...extra,
	});
}

/** Starts a server whose PUBLIC_ORIGIN is its own listening address. */
export async function startTestServer(extra: Record<string, string> = {}, deps: Parameters<typeof startServer>[1] = {}): Promise<RunningServer & { config: NodeConfig }> {
	const config = testConfig(extra);
	const running = await startServer(config, deps);
	// The origin must match where clients connect: rebuild it from the bound port (startServer reads it per request).
	config.origin = running.url;
	return Object.assign(running, { config });
}

const b64url = (b: Buffer) => b.toString("base64url");

/** Issues a real access token for owner `google:<sub>` and returns it. */
export async function issueToken(running: RunningServer & { config: NodeConfig }, sub: string, opts: { verifier?: string; replayStatus?: (status: number) => void } = {}): Promise<string> {
	const base = running.url;
	const redirect = "http://127.0.0.1:9/callback";
	const reg = await fetch(`${base}/register`, {
		method: "POST", headers: { "content-type": "application/json" },
		body: JSON.stringify({ client_name: "node-test", redirect_uris: [redirect], token_endpoint_auth_method: "none", grant_types: ["authorization_code"], response_types: ["code"] }),
	});
	if (reg.status !== 201) throw new Error(`registration failed: ${reg.status} ${await reg.text()}`);
	const { client_id } = (await reg.json()) as { client_id: string };
	const verifier = b64url(randomBytes(32));
	const challenge = b64url(createHash("sha256").update(verifier).digest());
	const q = new URLSearchParams({ response_type: "code", client_id, redirect_uri: redirect, state: "st", code_challenge: challenge, code_challenge_method: "S256", resource: `${base}/mcp` });
	const helpers = getOAuthApi({
		apiRoute: "/mcp", apiHandler: { fetch: () => new Response() }, defaultHandler: { fetch: () => new Response() },
		authorizeEndpoint: "/authorize", tokenEndpoint: "/token", clientRegistrationEndpoint: "/register",
		resourceMetadata: { resource: `${base}/mcp` },
	} as never, { OAUTH_KV: running.kv } as never);
	const authRequest = await helpers.parseAuthRequest(new Request(`${base}/authorize?${q}`));
	// Exactly what auth.ts does once Google has verified the user (same functions, same props).
	const owner = ownerFromGoogle(sub);
	const { redirectTo } = await helpers.completeAuthorization({ request: authRequest, userId: userIdFromGoogle(sub), metadata: {}, scope: authRequest.scope, props: { owner } });
	const code = new URL(redirectTo).searchParams.get("code");
	if (!code) throw new Error("no authorization code");
	const tok = await fetch(`${base}/token`, {
		method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirect, client_id, code_verifier: opts.verifier ?? verifier, resource: `${base}/mcp` }),
	});
	const body = (await tok.json()) as { access_token?: string; error?: string };
	if (!body.access_token) throw Object.assign(new Error(`token exchange failed: ${tok.status} ${JSON.stringify(body)}`), { status: tok.status, code });
	if (opts.replayStatus) {
		// The same authorization code a second time (code replay).
		const again = await fetch(`${base}/token`, {
			method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirect, client_id, code_verifier: verifier, resource: `${base}/mcp` }),
		});
		opts.replayStatus(again.status);
	}
	return body.access_token;
}

/** One MCP JSON-RPC call over HTTP (handshake era, 2025-11-25). */
export async function mcp(base: string, token: string | null, method: string, params: Record<string, unknown> = {}, id: number | null = 1) {
	const headers: Record<string, string> = { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-11-25" };
	if (token) headers.authorization = `Bearer ${token}`;
	const message = id === null ? { jsonrpc: "2.0", method, params } : { jsonrpc: "2.0", id, method, params };
	const r = await fetch(`${base}/mcp`, { method: "POST", headers, body: JSON.stringify(message) });
	const text = await r.text();
	return { status: r.status, headers: r.headers, body: text ? JSON.parse(text) : null };
}

/** Calls a tool and returns its structured result (throws on a tool error). */
export async function tool(base: string, token: string, name: string, args: Record<string, unknown> = {}) {
	const r = await mcp(base, token, "tools/call", { name, arguments: args });
	if (r.status !== 200 || r.body.error) throw new Error(`tools/call ${name}: ${r.status} ${JSON.stringify(r.body)}`);
	const result = r.body.result;
	if (result.isError) throw new Error(`${name}: ${JSON.stringify(result.content)}`);
	return result.structuredContent ?? JSON.parse(result.content[0].text);
}
