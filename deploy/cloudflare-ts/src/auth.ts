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

function defaultHandler(origin: string): ExportedHandler<AuthEnv> {
	return {
		async fetch(request, env) {
			const { pathname } = new URL(request.url);
			try {
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
const providers = new Map<string, OAuthProvider<any>>();

/**
 * The provider for one origin. The resource URL must be absolute, and the Worker answers on its
 * workers.dev host and on 127.0.0.1 under `wrangler dev`, so one provider is built per origin.
 */
export function buildProvider<Env extends AuthEnv>(origin: string, serveMcp: McpServe<Env>): OAuthProvider<Env> {
	const cached = providers.get(origin);
	if (cached) return cached;
	const provider = new OAuthProvider<Env>({
		apiRoute: "/mcp",
		apiHandler: {
			fetch(request: Request, env: Env, ctx: ExecutionContext) {
				return serveMcp(request, env, (ctx.props as AuthProps).owner);
			},
		},
		defaultHandler: defaultHandler(origin) as ExportedHandler<Env>,
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
