// OAuth for the MCP endpoint (WS31 phase P4).
//
// This Worker is both the OAuth authorization server and the protected resource (/mcp), using
// Cloudflare's workers-oauth-provider. The provider serves the metadata documents, /token,
// /register (dynamic client registration) and Client ID Metadata Documents; this file owns the
// interactive part: /authorize shows a consent page, then hands the user to Google, and
// /oauth/google/callback finishes the grant.
//
// OAuth access tokens issued by this provider are the only credential /mcp accepts. There is no
// static or shared token (the WS31 spike token was removed in WS32 P0.1): every owner is a
// Google account that signed in through /authorize.
//
// Worker configuration:
//   OAUTH_KV                  KV namespace for clients, grants and tokens (stored hashed/encrypted)
//   GOOGLE_CLIENT_ID          secret: Google OAuth client ID (Web application)
//   GOOGLE_CLIENT_SECRET      secret: Google OAuth client secret

import {
	AuthorizationError,
	OAuthProvider,
	authorizationErrorRedirect,
	type OAuthHelpers,
} from "@cloudflare/workers-oauth-provider";
import {
	GOOGLE_CALLBACK_PATH,
	GOOGLE_TOKEN_URL,
	PRIVACY_PAGE,
	TERMS_PAGE,
	consentPage,
	googleAuthorizeUrl,
	googleTokenRequestBody,
	approvalPage,
	messagePage,
	ownerFromGoogle,
	parseGoogleIdToken,
	randomVerifier,
	s256,
	userIdFromGoogle,
} from "./google.ts";

export interface AuthEnv {
	OAUTH_KV: KVNamespace;
	OAUTH_PROVIDER: OAuthHelpers;
	GOOGLE_CLIENT_ID?: string;
	GOOGLE_CLIENT_SECRET?: string;
}

/**
 * Engine access for the approval pages: runs an internal operation in the signed-in owner's Durable
 * Object. Supplied by index.ts (auth.ts stays free of engine code).
 */
export type OwnerCall = (env: AuthEnv, owner: string, operation: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>;
/** Extra non-MCP routes (version, health) served before the 404. */
export type ExtraRoutes = (request: Request, env: AuthEnv) => Promise<Response | null>;

const APPROVAL_STATE_PREFIX = "apv.";
const APPROVAL_TTL_S = 600;
const COOKIE = "rx_apv";

function randomToken(bytes = 24): string {
	const b = crypto.getRandomValues(new Uint8Array(bytes));
	return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function cookieValue(request: Request, name: string): string | null {
	for (const part of (request.headers.get("cookie") ?? "").split(";")) {
		const [k, ...v] = part.trim().split("=");
		if (k === name) return v.join("=");
	}
	return null;
}

/** GET /approve/<id>: show the decision page to the signed-in owner, or start a Google sign-in first. */
async function approveGet(request: Request, env: AuthEnv, origin: string, id: string, call: OwnerCall): Promise<Response> {
	const sid = cookieValue(request, COOKIE);
	const session = sid ? await env.OAUTH_KV.get<{ owner: string; approval_id: string; csrf: string }>(`apv:sess:${sid}`, "json") : null;
	if (session && session.approval_id === id) {
		try {
			const view = await call(env, session.owner, "approval_view", { approval_id: id });
			return html(approvalPage(view, session.csrf));
		} catch (e) {
			return html(messagePage("Approval request not found", "This request does not exist for the account you signed in with, or it was removed."), 404);
		}
	}
	if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return html(messagePage("Sign-in is not configured", "The server has no Google client yet."), 503);
	const state = APPROVAL_STATE_PREFIX + randomToken();
	const verifier = randomVerifier();
	const nonce = randomToken(16);
	await env.OAUTH_KV.put(`apv:state:${state}`, JSON.stringify({ approval_id: id, verifier, nonce }), { expirationTtl: APPROVAL_TTL_S });
	return redirect(googleAuthorizeUrl({ clientId: env.GOOGLE_CLIENT_ID, redirectUri: origin + GOOGLE_CALLBACK_PATH, state, codeChallenge: await s256(verifier), nonce }));
}

/** Google callback for an approval sign-in (state "apv.…"): verify the account, open a short session. */
async function approveCallback(request: Request, env: AuthEnv, origin: string): Promise<Response> {
	const params = new URL(request.url).searchParams;
	const state = params.get("state") ?? "";
	const saved = await env.OAUTH_KV.get<{ approval_id: string; verifier: string; nonce: string }>(`apv:state:${state}`, "json");
	if (!saved) return html(messagePage("Sign-in expired", "Open the approval link again."), 400);
	await env.OAUTH_KV.delete(`apv:state:${state}`); // single use
	const code = params.get("code");
	if (params.get("error") || !code || !env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return html(messagePage("Sign-in did not complete", "Nothing was approved."), 400);
	const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
		method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
		body: googleTokenRequestBody({ code, clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, redirectUri: origin + GOOGLE_CALLBACK_PATH, verifier: saved.verifier }),
	});
	const tokens = (await tokenResponse.json().catch(() => ({}))) as { id_token?: string };
	if (!tokenResponse.ok || !tokens.id_token) return html(messagePage("Sign-in failed", "Nothing was approved."), 502);
	let sub: string;
	try {
		sub = parseGoogleIdToken(tokens.id_token, env.GOOGLE_CLIENT_ID, Math.floor(Date.now() / 1000), saved.nonce).sub;
	} catch (e) {
		console.log(JSON.stringify({ evt: "rigorx_security", kind: "approval_signin_rejected", reason: e instanceof Error ? e.message : "error" }));
		return html(messagePage("Sign-in rejected", "Nothing was approved."), 400);
	}
	const sid = randomToken();
	await env.OAUTH_KV.put(`apv:sess:${sid}`, JSON.stringify({ owner: ownerFromGoogle(sub), approval_id: saved.approval_id, csrf: randomToken() }), { expirationTtl: APPROVAL_TTL_S });
	const h = new Headers();
	h.append("Set-Cookie", `${COOKIE}=${sid}; Path=/approve; Max-Age=${APPROVAL_TTL_S}; HttpOnly; Secure; SameSite=Lax`);
	return redirect(`/approve/${encodeURIComponent(saved.approval_id)}`, h);
}

/** POST /approve/<id>: record the signed-in owner's decision (session cookie + CSRF token). */
async function approvePost(request: Request, env: AuthEnv, id: string, call: OwnerCall): Promise<Response> {
	const sid = cookieValue(request, COOKIE);
	const session = sid ? await env.OAUTH_KV.get<{ owner: string; approval_id: string; csrf: string }>(`apv:sess:${sid}`, "json") : null;
	const form = await request.formData();
	if (!session || session.approval_id !== id || form.get("csrf") !== session.csrf) {
		console.log(JSON.stringify({ evt: "rigorx_security", kind: "approval_session_rejected" }));
		return html(messagePage("Session expired", "Open the approval link again. Nothing was recorded."), 403);
	}
	await env.OAUTH_KV.delete(`apv:sess:${sid}`); // one decision per session
	const decision = form.get("decision") === "approve" ? "approve" : "deny";
	try {
		const r = await call(env, session.owner, "approval_decide", { approval_id: id, decision });
		return html(messagePage(r.status === "approved" ? "Approved" : "Denied", r.status === "approved"
			? "Your approval is recorded for this one operation. You can return to your assistant."
			: "The operation is not approved. You can return to your assistant."));
	} catch (e) {
		return html(messagePage("Not recorded", e instanceof Error ? e.message : "The decision could not be recorded."), 409);
	}
}

/** What every authenticated /mcp request carries in ctx.props. */
export interface AuthProps {
	owner: string;
}

const BANNER = "RIGOR-X MCP server. MCP endpoint: POST /mcp (OAuth sign-in required)";

const html = (body: string, status = 200, headers?: Headers) => {
	const h = new Headers(headers);
	h.set("Content-Type", "text/html; charset=utf-8");
	h.set("Cache-Control", "no-store");
	return new Response(body, { status, headers: h });
};

const redirect = (location: string, headers?: Headers) => {
	const h = new Headers(headers);
	h.set("Location", location);
	return new Response(null, { status: 302, headers: h });
};

async function authorizeGet(request: Request, env: AuthEnv): Promise<Response> {
	const oauth = env.OAUTH_PROVIDER;
	const authRequest = await oauth.parseAuthRequest(request);
	const facts = await oauth.describeConsent(authRequest);
	const consent = await oauth.beginConsent(authRequest);
	return html(consentPage(facts, consent.handle), 200, consent.headers);
}

async function authorizePost(request: Request, env: AuthEnv, origin: string): Promise<Response> {
	const oauth = env.OAUTH_PROVIDER;
	const form = await request.formData();
	const handle = String(form.get("handle") ?? "");
	if (form.get("decision") !== "approve") {
		const denied = await oauth.denyConsent(request, handle);
		return new Response(null, { status: 302, headers: denied.headers });
	}
	if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
		return html(messagePage("Sign-in is not configured", "The server has no Google client yet. Try again later."), 503);
	}
	const approved = await oauth.approveConsent(request, handle);
	const verifier = randomVerifier();
	const { state, headers } = await oauth.beginUpstream(approved.request, { data: { verifier }, headers: approved.headers });
	return redirect(googleAuthorizeUrl({
		clientId: env.GOOGLE_CLIENT_ID,
		redirectUri: origin + GOOGLE_CALLBACK_PATH,
		state,
		codeChallenge: await s256(verifier),
	}), headers);
}

async function googleCallback(request: Request, env: AuthEnv, origin: string): Promise<Response> {
	if ((new URL(request.url).searchParams.get("state") ?? "").startsWith(APPROVAL_STATE_PREFIX)) return approveCallback(request, env, origin);
	const oauth = env.OAUTH_PROVIDER;
	const { request: original, data, headers } = await oauth.finishUpstream<{ verifier: string }>(request);
	const params = new URL(request.url).searchParams;
	const code = params.get("code");
	if (params.get("error") || !code) return redirect(authorizationErrorRedirect(original, "access_denied"), headers);
	if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
		return redirect(authorizationErrorRedirect(original, "temporarily_unavailable"), headers);
	}

	const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
		body: googleTokenRequestBody({
			code,
			clientId: env.GOOGLE_CLIENT_ID,
			clientSecret: env.GOOGLE_CLIENT_SECRET,
			redirectUri: origin + GOOGLE_CALLBACK_PATH,
			verifier: data.verifier,
		}),
	});
	const tokens = (await tokenResponse.json().catch(() => ({}))) as { id_token?: string; error?: string };
	if (!tokenResponse.ok || !tokens.id_token) {
		console.error("RIGORX_AUTH google token exchange failed", tokenResponse.status, tokens.error ?? "");
		return redirect(authorizationErrorRedirect(original, "server_error"), headers);
	}

	let identity;
	try {
		identity = parseGoogleIdToken(tokens.id_token, env.GOOGLE_CLIENT_ID, Math.floor(Date.now() / 1000));
	} catch (e) {
		console.error("RIGORX_AUTH id token rejected", e instanceof Error ? e.message : String(e));
		return redirect(authorizationErrorRedirect(original, "server_error"), headers);
	}

	const props: AuthProps = { owner: ownerFromGoogle(identity.sub) };
	const { redirectTo } = await oauth.completeAuthorization({
		request: original,
		userId: userIdFromGoogle(identity.sub),
		metadata: {},
		scope: original.scope,
		props,
	});
	return redirect(redirectTo, headers);
}

function defaultHandler(origin: string, call: OwnerCall | null, extra: ExtraRoutes | null): ExportedHandler<AuthEnv> {
	return {
		async fetch(request, env) {
			const { pathname } = new URL(request.url);
			try {
				const approve = /^\/approve\/(apv_[0-9a-f]{32})$/.exec(pathname);
				if (approve && call && request.method === "GET") return await approveGet(request, env, origin, approve[1]!, call);
				if (approve && call && request.method === "POST") return await approvePost(request, env, approve[1]!, call);
				const handled = extra ? await extra(request, env) : null;
				if (handled) return handled;
				if (pathname === "/" && request.method === "GET") return new Response(BANNER);
				if (pathname === "/privacy" && request.method === "GET") return html(PRIVACY_PAGE);
				if (pathname === "/terms" && request.method === "GET") return html(TERMS_PAGE);
				if (pathname === "/authorize" && request.method === "GET") return await authorizeGet(request, env);
				if (pathname === "/authorize" && request.method === "POST") return await authorizePost(request, env, origin);
				if (pathname === GOOGLE_CALLBACK_PATH && request.method === "GET") return await googleCallback(request, env, origin);
				return new Response("Not found", { status: 404 });
			} catch (e) {
				if (e instanceof AuthorizationError) {
					return html(messagePage("Sign-in could not continue", e.message), 400);
				}
				console.error("RIGORX_AUTH", e instanceof Error ? e.stack ?? e.message : String(e));
				return html(messagePage("Sign-in failed", "Something went wrong. Start signing in again from your app."), 500);
			}
		},
	};
}

type McpServe<Env> = (request: Request, env: Env, owner: string) => Promise<Response>;
export interface ProviderDeps { call?: OwnerCall; extra?: ExtraRoutes }
const providers = new Map<string, OAuthProvider<any>>();

/**
 * The provider for one origin. The resource URL must be absolute, and the Worker answers on its
 * workers.dev host and on 127.0.0.1 under `wrangler dev`, so one provider is built per origin.
 */
export function buildProvider<Env extends AuthEnv>(origin: string, serveMcp: McpServe<Env>, deps: ProviderDeps = {}): OAuthProvider<Env> {
	const cached = providers.get(origin);
	if (cached) return cached;
	const provider = new OAuthProvider<Env>({
		apiRoute: "/mcp",
		apiHandler: {
			fetch(request: Request, env: Env, ctx: ExecutionContext) {
				return serveMcp(request, env, (ctx.props as AuthProps).owner);
			},
		},
		defaultHandler: defaultHandler(origin, deps.call ?? null, deps.extra ?? null) as ExportedHandler<Env>,
		authorizeEndpoint: "/authorize",
		tokenEndpoint: "/token",
		clientRegistrationEndpoint: "/register",
		clientIdMetadataDocumentEnabled: true,
		resourceMetadata: { resource: `${origin}/mcp`, resource_name: "RIGOR-X" },
		// No resolveExternalToken: only tokens issued by this provider are accepted.
	});
	providers.set(origin, provider);
	return provider;
}
