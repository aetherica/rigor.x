// OAuth for the MCP endpoint (WS31 phase P4), and the Aetherica account.
//
// This Worker is both the OAuth authorization server and the protected resource (/mcp), using
// Cloudflare's workers-oauth-provider. The provider serves the metadata documents, /token,
// /register (dynamic client registration) and Client ID Metadata Documents; this file owns the
// interactive part: /authorize shows a consent page with the enabled sign-in methods (Google,
// GitHub, ChatGPT), hands the user to that provider, and /oauth/<provider>/callback finishes the grant.
//
// An Aetherica account (accounts.ts) can have one sign-in of each kind; all lead to the same owner
// storage. OAuth access tokens issued by this provider are the only credential /mcp accepts.
//
// Worker configuration:
//   OAUTH_KV                          KV namespace for clients, grants and tokens (stored hashed/encrypted)
//   ACCOUNTS_DB                       D1 database: the account registry (optional; without it no linking)
//   GOOGLE_CLIENT_ID / _SECRET        secrets: Google OAuth client (Web application)
//   GITHUB_CLIENT_ID / _SECRET        secrets: GitHub OAuth app
//   OPENAI_CLIENT_ID / _SECRET        secrets: OpenAI "Sign in with ChatGPT" client

import {
	AuthorizationError,
	OAuthProvider,
	authorizationErrorRedirect,
	type OAuthHelpers,
} from "@cloudflare/workers-oauth-provider";
import {
	HOME_PAGE,
	PRIVACY_PAGE,
	TERMS_PAGE,
	consentPage,
	approvalPage,
	accountPage,
	signInChoicePage,
	termsPage,
	TERMS_VERSION,
	ACCOUNT_DELETE_CONFIRMATION,
	messagePage,
	type AccountView,
	type SignInOption,
	randomVerifier,
	s256,
} from "./google.ts";
import {
	PROVIDERS,
	authorizeUrl,
	enabledProviders,
	exchangeCode,
	isProviderId,
	providerForCallbackPath,
	type ProviderEnv,
	type ProviderId,
} from "./providers.ts";
import { AccountError, AccountRegistry, type SqlDatabase } from "./accounts.ts";

export interface AuthEnv extends ProviderEnv {
	OAUTH_KV: KVNamespace;
	OAUTH_PROVIDER: OAuthHelpers;
	ACCOUNTS_DB?: SqlDatabase;
}

/**
 * Engine access for the approval pages: runs an internal operation in the signed-in owner's Durable
 * Object. Supplied by index.ts (auth.ts stays free of engine code).
 */
export type OwnerCall = (env: AuthEnv, owner: string, operation: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>;
/** Extra non-MCP routes (version, health) served before the 404. */
export type ExtraRoutes = (request: Request, env: AuthEnv) => Promise<Response | null>;

/** Sign-ins that are not an MCP grant (account page, approval page, linking) keep their state in KV under this prefix. */
const PAGE_STATE_PREFIX = "acc.";
const PAGE_STATE_TTL_S = 600;
const ACCOUNT_TTL_S = 900;
const ACCOUNT_COOKIE = "rx_acc";

const APPROVAL_TTL_S = 600;
const COOKIE = "rx_apv";

const registry = (env: AuthEnv) => new AccountRegistry(env.ACCOUNTS_DB ?? null);
const options = (ids: ProviderId[]): SignInOption[] => ids.map((id) => ({ id, label: PROVIDERS[id].label }));
const NOT_CONFIGURED = () => html(messagePage("Sign-in is not configured", "The server has no sign-in method yet. Try again later."), 503);

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

// ---------------------------------------------------------------- page sign-ins (account, approval, linking)

type PagePurpose = { kind: "account" } | { kind: "approval"; approval_id: string } | { kind: "link"; owner: string };
interface PageState { purpose: PagePurpose; provider: ProviderId; verifier: string; nonce: string }

/**
 * Starts a page sign-in: with ?with=<provider> (or a single enabled provider) it redirects to that
 * provider; otherwise it shows the choice of sign-in methods.
 */
async function startPageSignIn(request: Request, env: AuthEnv, origin: string, purpose: PagePurpose, choice: { title: string; intro: string; path: string }): Promise<Response> {
	const enabled = enabledProviders(env);
	if (enabled.length === 0) return NOT_CONFIGURED();
	const asked = new URL(request.url).searchParams.get("with");
	const provider = isProviderId(asked) && enabled.includes(asked) ? asked : enabled.length === 1 ? enabled[0]! : null;
	if (!provider) return html(signInChoicePage(choice.title, choice.intro, choice.path, options(enabled)));
	return redirectToProvider(env, origin, purpose, provider);
}

async function redirectToProvider(env: AuthEnv, origin: string, purpose: PagePurpose, provider: ProviderId): Promise<Response> {
	const state = PAGE_STATE_PREFIX + randomToken();
	const verifier = randomVerifier();
	const nonce = randomToken(16);
	await env.OAUTH_KV.put(`acc:state:${state}`, JSON.stringify({ purpose, provider, verifier, nonce } satisfies PageState), { expirationTtl: PAGE_STATE_TTL_S });
	return redirect(authorizeUrl(env, provider, { origin, state, codeChallenge: await s256(verifier), nonce }));
}

/** Callback of a page sign-in (state "acc.…"): verify the identity, then open the session for its purpose. */
async function pageCallback(request: Request, env: AuthEnv, origin: string, provider: ProviderId, fetcher: typeof fetch): Promise<Response> {
	const params = new URL(request.url).searchParams;
	const state = params.get("state") ?? "";
	const saved = await env.OAUTH_KV.get<PageState>(`acc:state:${state}`, "json");
	if (!saved) return html(messagePage("Sign-in expired", "Open the page again and sign in."), 400);
	await env.OAUTH_KV.delete(`acc:state:${state}`); // single use
	const code = params.get("code");
	if (saved.provider !== provider || params.get("error") || !code) return html(messagePage("Sign-in did not complete", "You are not signed in. Nothing was changed."), 400);
	let identity;
	try {
		identity = await exchangeCode(env, provider, { origin, code, verifier: saved.verifier, nonce: saved.nonce }, fetcher);
	} catch (e) {
		console.log(JSON.stringify({ evt: "rigorx_security", kind: "page_signin_rejected", provider, reason: e instanceof Error ? e.message : "error" }));
		// The reason names the failed step (no tokens or secrets), so the owner can fix the configuration.
		const reason = e instanceof Error ? e.message.slice(0, 160) : "unknown error";
		return html(messagePage("Sign-in rejected", `You are not signed in. Nothing was changed. Reason: ${reason}.`), 400);
	}
	const purpose = saved.purpose;
	if (purpose.kind === "link") {
		try {
			const r = await registry(env).link(purpose.owner, identity.provider, identity.subject);
			return redirect(`/account?done=${r === "linked" ? "linked" : "already"}`);
		} catch (e) {
			return html(messagePage("Not added", e instanceof AccountError ? e.message : "The sign-in method could not be added."), 409);
		}
	}
	if (!(await registry(env).termsAccepted(identity.provider, identity.subject, TERMS_VERSION))) {
		return askTerms(env, { kind: "page", purpose, provider: identity.provider, subject: identity.subject });
	}
	return finishPageSignIn(env, purpose, await registry(env).signIn(identity.provider, identity.subject));
}

/** Opens the session a page sign-in was for (account or approval page). */
async function finishPageSignIn(env: AuthEnv, purpose: PagePurpose, owner: string, headers?: Headers): Promise<Response> {
	const sid = randomToken();
	const h = new Headers(headers);
	if (purpose.kind === "link") return redirect("/account", h);
	if (purpose.kind === "approval") {
		await env.OAUTH_KV.put(`apv:sess:${sid}`, JSON.stringify({ owner, approval_id: purpose.approval_id, csrf: randomToken() }), { expirationTtl: APPROVAL_TTL_S });
		h.append("Set-Cookie", `${COOKIE}=${sid}; Path=/approve; Max-Age=${APPROVAL_TTL_S}; HttpOnly; Secure; SameSite=Lax`);
		return redirect(`/approve/${encodeURIComponent(purpose.approval_id)}`, h);
	}
	await env.OAUTH_KV.put(`acc:sess:${sid}`, JSON.stringify({ owner, csrf: randomToken() } satisfies AccountSession), { expirationTtl: ACCOUNT_TTL_S });
	h.append("Set-Cookie", `${ACCOUNT_COOKIE}=${sid}; Path=/account; Max-Age=${ACCOUNT_TTL_S}; HttpOnly; Secure; SameSite=Lax`);
	return redirect("/account", h);
}

// ---------------------------------------------------------------- approval page (/approve/<id>)

/** GET /approve/<id>: show the decision page to the signed-in owner, or sign in first. */
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
	return startPageSignIn(request, env, origin, { kind: "approval", approval_id: id },
		{ title: "Sign in to decide", intro: "Sign in with the account your assistant uses, then approve or deny the request.", path: `/approve/${id}` });
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

// ---------------------------------------------------------------- account page (/account)
// The user manages their own account here: sign-in methods, usage, deleting a task or a topic,
// deleting everything. The assistant has no tool for these (2026-11-27). Short KV session (15 min),
// HttpOnly cookie scoped to /account, CSRF token on every POST, owner taken only from the session.

interface AccountSession { owner: string; csrf: string }

async function accountSession(request: Request, env: AuthEnv): Promise<{ sid: string; session: AccountSession } | null> {
	const sid = cookieValue(request, ACCOUNT_COOKIE);
	const session = sid ? await env.OAUTH_KV.get<AccountSession>(`acc:sess:${sid}`, "json") : null;
	return sid && session ? { sid, session } : null;
}

async function accountView(env: AuthEnv, owner: string, call: OwnerCall, notice?: string): Promise<AccountView> {
	const reg = registry(env);
	const [usage, runs, topics, linked] = await Promise.all([
		call(env, owner, "usage", {}),
		call(env, owner, "list_runs", { limit: 50 }),
		call(env, owner, "memory_topic", { action: "list" }),
		reg.identities(owner),
	]);
	const have = new Set(linked.map((i) => i.provider));
	return {
		usage, runs: (runs.runs as Record<string, unknown>[]) ?? [], more_runs: runs.next_cursor !== null && runs.next_cursor !== undefined,
		topics: (topics.topics as Record<string, unknown>[]) ?? [], confirmation: ACCOUNT_DELETE_CONFIRMATION, notice,
		identities: linked.filter((i) => isProviderId(i.provider)).map((i) => ({ provider: i.provider, label: PROVIDERS[i.provider].label, since: i.created_at, last: i.last_login_at })),
		linkable: options(enabledProviders(env).filter((p) => !have.has(p))),
		linking: reg.linkingAvailable,
	};
}

/** GET /account: the page for a signed-in owner, otherwise a sign-in first. */
async function accountGet(request: Request, env: AuthEnv, origin: string, call: OwnerCall): Promise<Response> {
	const found = await accountSession(request, env);
	if (found) {
		const notice = new URL(request.url).searchParams.get("done") ?? undefined;
		return html(accountPage(await accountView(env, found.session.owner, call, notice ? ACCOUNT_NOTICES[notice] : undefined), found.session.csrf));
	}
	return startPageSignIn(request, env, origin, { kind: "account" },
		{ title: "Sign in to your account", intro: "Use any sign-in method of your Aetherica account. A new account is created if this sign-in has none yet.", path: "/account" });
}

const ACCOUNT_NOTICES: Record<string, string> = {
	run: "Task deleted.", topic: "Topic and its notes deleted.", linked: "Sign-in method added.",
	already: "That sign-in method was already part of this account.", unlinked: "Sign-in method removed.",
};

/** POST /account: one action by the signed-in owner (session cookie + CSRF token). */
async function accountPost(request: Request, env: AuthEnv, origin: string, call: OwnerCall): Promise<Response> {
	const found = await accountSession(request, env);
	const form = await request.formData();
	if (!found || form.get("csrf") !== found.session.csrf) {
		console.log(JSON.stringify({ evt: "rigorx_security", kind: "account_session_rejected" }));
		return html(messagePage("Session expired", "Open your account page again. Nothing was changed."), 403);
	}
	const { sid, session } = found;
	const action = String(form.get("action") ?? "");
	try {
		if (action === "sign_out") {
			await env.OAUTH_KV.delete(`acc:sess:${sid}`);
			const h = new Headers();
			h.append("Set-Cookie", `${ACCOUNT_COOKIE}=; Path=/account; Max-Age=0; HttpOnly; Secure; SameSite=Lax`);
			return html(messagePage("Signed out", "You are signed out of your account page."), 200, h);
		}
		if (action === "link" || action === "unlink") {
			const provider = form.get("provider");
			if (!isProviderId(provider)) return html(messagePage("Unknown sign-in method", "Nothing was changed."), 400);
			if (action === "unlink") {
				await registry(env).unlink(session.owner, provider);
				return redirect("/account?done=unlinked");
			}
			if (!enabledProviders(env).includes(provider)) return html(messagePage("Not available", `${PROVIDERS[provider].label} sign-in is not available yet. Nothing was changed.`), 400);
			if (!registry(env).linkingAvailable) return html(messagePage("Not available", "Adding sign-in methods is not available on this server yet."), 503);
			return redirectToProvider(env, origin, { kind: "link", owner: session.owner }, provider);
		}
		if (action === "delete_run") {
			await call(env, session.owner, "delete_run", { run_id: String(form.get("run_id") ?? "") });
			return redirect("/account?done=run");
		}
		if (action === "delete_topic") {
			await call(env, session.owner, "memory_topic", { action: "delete", topic_id: String(form.get("topic_id") ?? ""), decided_by: "user" });
			return redirect("/account?done=topic");
		}
		if (action === "delete_all") {
			if (String(form.get("confirm") ?? "").trim() !== ACCOUNT_DELETE_CONFIRMATION) {
				return html(messagePage("Not deleted", `Type ${ACCOUNT_DELETE_CONFIRMATION} exactly to delete all of your data. Nothing was changed.`), 400);
			}
			const r = await call(env, session.owner, "delete_account_data", { confirm: ACCOUNT_DELETE_CONFIRMATION, decided_by: "user" });
			await registry(env).deleteAccount(session.owner);
			await env.OAUTH_KV.delete(`acc:sess:${sid}`);
			return html(messagePage("All data deleted", `Deleted ${r.runs ?? 0} tasks and ${r.memory_items ?? 0} notes, and your account with its sign-in methods. To stop your assistant from connecting again, remove the connector in that app.`));
		}
		return html(messagePage("Unknown action", "Nothing was changed."), 400);
	} catch (e) {
		return html(messagePage("Not done", e instanceof Error ? e.message : "The action could not be completed."), 409);
	}
}

/** What every authenticated /mcp request carries in ctx.props. */
export interface AuthProps {
	owner: string;
}


const html = (body: string, status = 200, headers?: Headers): Response => {
	const h = new Headers(headers);
	h.set("Content-Type", "text/html; charset=utf-8");
	h.set("Cache-Control", "no-store");
	// Pages carry no scripts; the sign-in and approval pages must not be framed (clickjacking).
	h.set("Content-Security-Policy", "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'");
	h.set("X-Frame-Options", "DENY");
	h.set("Referrer-Policy", "no-referrer");
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
	const enabled = enabledProviders(env);
	if (enabled.length === 0) return NOT_CONFIGURED();
	return html(consentPage(facts, consent.handle, options(enabled)), 200, consent.headers);
}

async function authorizePost(request: Request, env: AuthEnv, origin: string): Promise<Response> {
	const oauth = env.OAUTH_PROVIDER;
	const form = await request.formData();
	const handle = String(form.get("handle") ?? "");
	if (form.get("decision") !== "approve") {
		const denied = await oauth.denyConsent(request, handle);
		return new Response(null, { status: 302, headers: denied.headers });
	}
	const enabled = enabledProviders(env);
	const asked = form.get("provider") ?? "google";
	if (!isProviderId(asked) || !enabled.includes(asked)) return NOT_CONFIGURED();
	const approved = await oauth.approveConsent(request, handle);
	const verifier = randomVerifier();
	const nonce = randomToken(16);
	const { state, headers } = await oauth.beginUpstream(approved.request, { data: { verifier, nonce, provider: asked }, headers: approved.headers });
	return redirect(authorizeUrl(env, asked, { origin, state, codeChallenge: await s256(verifier), nonce }), headers);
}

/** /oauth/<provider>/callback: page sign-ins (state "acc.…") or the MCP grant. */
async function providerCallback(request: Request, env: AuthEnv, origin: string, provider: ProviderId, fetcher: typeof fetch): Promise<Response> {
	const upstreamState = new URL(request.url).searchParams.get("state") ?? "";
	if (upstreamState.startsWith(PAGE_STATE_PREFIX)) return pageCallback(request, env, origin, provider, fetcher);
	const oauth = env.OAUTH_PROVIDER;
	const { request: original, data, headers } = await oauth.finishUpstream<{ verifier: string; nonce?: string; provider?: ProviderId }>(request);
	const params = new URL(request.url).searchParams;
	const code = params.get("code");
	if (params.get("error") || !code) return redirect(authorizationErrorRedirect(original, "access_denied"), headers);
	// Grants begun before multi-provider sign-in carry no provider: they were Google.
	if ((data.provider ?? "google") !== provider || !enabledProviders(env).includes(provider)) {
		return redirect(authorizationErrorRedirect(original, "temporarily_unavailable"), headers);
	}
	let identity;
	try {
		identity = await exchangeCode(env, provider, { origin, code, verifier: data.verifier, nonce: data.nonce }, fetcher);
	} catch (e) {
		console.error("RIGORX_AUTH sign-in rejected", provider, e instanceof Error ? e.message : String(e));
		return redirect(authorizationErrorRedirect(original, "server_error"), headers);
	}
	if (!(await registry(env).termsAccepted(identity.provider, identity.subject, TERMS_VERSION))) {
		return askTerms(env, { kind: "grant", original, provider: identity.provider, subject: identity.subject }, headers);
	}
	return finishGrant(env, original, await registry(env).signIn(identity.provider, identity.subject), headers);
}

type AuthRequestOf = Awaited<ReturnType<OAuthHelpers["parseAuthRequest"]>>;

/** Issues the MCP grant to the signed-in owner and returns to the client. */
async function finishGrant(env: AuthEnv, original: AuthRequestOf, owner: string, headers?: Headers): Promise<Response> {
	const props: AuthProps = { owner };
	const { redirectTo } = await env.OAUTH_PROVIDER.completeAuthorization({
		request: original,
		// The OAuth library's user ID must not contain ':'.
		userId: owner.replace(/:/g, "-"),
		metadata: {},
		scope: original.scope,
		props,
	});
	return redirect(redirectTo, headers);
}

// ---------------------------------------------------------------- terms acceptance (/signup)
// A new account, or one that has not accepted the current terms version, is created or continued
// only after the user explicitly accepts the Terms of Service and Privacy Policy (checkbox + button).
// The verified identity waits in KV (15 min) under a random token that is both in an HttpOnly cookie
// scoped to /signup and in the form, so the page cannot be completed from another browser or site.

type PendingSignup =
	| { kind: "page"; purpose: PagePurpose; provider: ProviderId; subject: string }
	| { kind: "grant"; original: AuthRequestOf; provider: ProviderId; subject: string };
const SIGNUP_COOKIE = "rx_signup";
const SIGNUP_TTL_S = 900;

async function askTerms(env: AuthEnv, pending: PendingSignup, headers?: Headers): Promise<Response> {
	const token = randomToken();
	await env.OAUTH_KV.put(`acc:signup:${token}`, JSON.stringify(pending), { expirationTtl: SIGNUP_TTL_S });
	const isNew = !(await registry(env).exists(pending.provider, pending.subject));
	const h = new Headers(headers);
	h.append("Set-Cookie", `${SIGNUP_COOKIE}=${token}; Path=/signup; Max-Age=${SIGNUP_TTL_S}; HttpOnly; Secure; SameSite=Lax`);
	return html(termsPage({ token, providerLabel: PROVIDERS[pending.provider].label, isNew }), 200, h);
}

/** POST /signup: accept (checkbox required) or decline. */
async function signupPost(request: Request, env: AuthEnv): Promise<Response> {
	const form = await request.formData();
	const token = String(form.get("token") ?? "");
	const cookie = cookieValue(request, SIGNUP_COOKIE);
	const pending = token && cookie === token ? await env.OAUTH_KV.get<PendingSignup>(`acc:signup:${token}`, "json") : null;
	if (!pending) {
		console.log(JSON.stringify({ evt: "rigorx_security", kind: "signup_session_rejected" }));
		return html(messagePage("Sign-up expired", "Start signing in again. No account was created or changed."), 403);
	}
	await env.OAUTH_KV.delete(`acc:signup:${token}`); // single use
	const h = new Headers();
	h.append("Set-Cookie", `${SIGNUP_COOKIE}=; Path=/signup; Max-Age=0; HttpOnly; Secure; SameSite=Lax`);
	const accepted = form.get("decision") === "accept" && form.get("agree") === "yes";
	if (!accepted) {
		if (pending.kind === "grant") return redirect(authorizationErrorRedirect(pending.original, "access_denied"), h);
		return html(messagePage("Not signed in", form.get("decision") === "accept"
			? "Tick the box to accept the Terms of Service and Privacy Policy. No account was created or changed. Start signing in again."
			: "You declined the Terms of Service and Privacy Policy. No account was created or changed."), 200, h);
	}
	const reg = registry(env);
	const owner = await reg.signIn(pending.provider, pending.subject);
	await reg.acceptTerms(owner, TERMS_VERSION);
	console.log(JSON.stringify({ evt: "rigorx_account", kind: "terms_accepted", provider: pending.provider, version: TERMS_VERSION }));
	return pending.kind === "grant" ? finishGrant(env, pending.original, owner, h) : finishPageSignIn(env, pending.purpose, owner, h);
}

function defaultHandler(origin: string, call: OwnerCall | null, extra: ExtraRoutes | null, fetcher: typeof fetch): ExportedHandler<AuthEnv> {
	return {
		async fetch(request, env) {
			const { pathname } = new URL(request.url);
			try {
				const approve = /^\/approve\/(apv_[0-9a-f]{32})$/.exec(pathname);
				if (approve && call && request.method === "GET") return await approveGet(request, env, origin, approve[1]!, call);
				if (approve && call && request.method === "POST") return await approvePost(request, env, approve[1]!, call);
				if (pathname === "/account" && call && request.method === "GET") return await accountGet(request, env, origin, call);
				if (pathname === "/account" && call && request.method === "POST") return await accountPost(request, env, origin, call);
				const handled = extra ? await extra(request, env) : null;
				if (handled) return handled;
				if (pathname === "/" && request.method === "GET") return html(HOME_PAGE);
				if (pathname === "/privacy" && request.method === "GET") return html(PRIVACY_PAGE);
				if (pathname === "/terms" && request.method === "GET") return html(TERMS_PAGE);
				if (pathname === "/signup" && request.method === "POST") return await signupPost(request, env);
				if (pathname === "/authorize" && request.method === "GET") return await authorizeGet(request, env);
				if (pathname === "/authorize" && request.method === "POST") return await authorizePost(request, env, origin);
				const callback = providerForCallbackPath(pathname);
				if (callback && request.method === "GET") return await providerCallback(request, env, origin, callback, fetcher);
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
/** fetcher: used for the token and user-info requests to the sign-in providers (tests substitute it). */
export interface ProviderDeps { call?: OwnerCall; extra?: ExtraRoutes; fetcher?: typeof fetch }
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
		defaultHandler: defaultHandler(origin, deps.call ?? null, deps.extra ?? null, deps.fetcher ?? ((input, init) => fetch(input, init))) as ExportedHandler<Env>,
		authorizeEndpoint: "/authorize",
		tokenEndpoint: "/token",
		clientRegistrationEndpoint: "/register",
		clientIdMetadataDocumentEnabled: true,
		resourceMetadata: { resource: `${origin}/mcp`, resource_name: "Aetherica" },
		// No resolveExternalToken: only tokens issued by this provider are accepted.
	});
	providers.set(origin, provider);
	return provider;
}
