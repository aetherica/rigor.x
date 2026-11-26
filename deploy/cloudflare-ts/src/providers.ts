// Sign-in providers: Google, GitHub and OpenAI ("Sign in with ChatGPT"). One shape for all three, so
// the MCP authorization flow, the account page and the approval page share one implementation.
//
// A provider is enabled only when its client ID and secret are configured as Worker secrets:
//   GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET    (OpenID Connect, scope openid)
//   GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET    (OAuth app, no scope: the public numeric user ID only)
//   OPENAI_CLIENT_ID / OPENAI_CLIENT_SECRET    (OpenID Connect, scope openid; hosted clients are issued by OpenAI)
//
// Only the provider's stable subject is used (Google/OpenAI `sub`, GitHub numeric `id`), never an e-mail
// address or a user name, so nothing personal is stored in the account registry.
// Pure functions plus fetch; no Workers APIs, so the module runs under the Node test runner.

import { parseIdToken } from "./google.ts";

export type ProviderId = "google" | "github" | "openai";
export const PROVIDER_IDS: readonly ProviderId[] = ["google", "github", "openai"];

export interface ProviderEnv {
	GOOGLE_CLIENT_ID?: string;
	GOOGLE_CLIENT_SECRET?: string;
	GITHUB_CLIENT_ID?: string;
	GITHUB_CLIENT_SECRET?: string;
	OPENAI_CLIENT_ID?: string;
	OPENAI_CLIENT_SECRET?: string;
}

interface ProviderSpec {
	id: ProviderId;
	label: string;
	callbackPath: string;
	authorizeUrl: string;
	tokenUrl: string;
	scope: string;
	/** OpenID Connect providers return an ID token; GitHub returns an access token for /user. */
	oidc: boolean;
	issuers?: readonly string[];
	/** How the client secret is sent to the token endpoint. */
	clientAuth: "post" | "basic";
	extraAuthorizeParams?: Record<string, string>;
}

export const PROVIDERS: Record<ProviderId, ProviderSpec> = {
	google: {
		id: "google", label: "Google", callbackPath: "/oauth/google/callback",
		authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth", tokenUrl: "https://oauth2.googleapis.com/token",
		scope: "openid", oidc: true, issuers: ["https://accounts.google.com", "accounts.google.com"], clientAuth: "post",
		extraAuthorizeParams: { prompt: "select_account" },
	},
	github: {
		id: "github", label: "GitHub", callbackPath: "/oauth/github/callback",
		authorizeUrl: "https://github.com/login/oauth/authorize", tokenUrl: "https://github.com/login/oauth/access_token",
		scope: "", oidc: false, clientAuth: "post", extraAuthorizeParams: { allow_signup: "true" },
	},
	openai: {
		id: "openai", label: "ChatGPT", callbackPath: "/oauth/openai/callback",
		authorizeUrl: "https://auth.openai.com/api/accounts/authorize", tokenUrl: "https://auth.openai.com/api/accounts/oauth/token",
		scope: "openid", oidc: true, issuers: ["https://auth.openai.com"], clientAuth: "basic",
	},
};

export const isProviderId = (v: unknown): v is ProviderId => typeof v === "string" && (PROVIDER_IDS as readonly string[]).includes(v);

function credentials(env: ProviderEnv, id: ProviderId): { clientId: string; clientSecret: string } | null {
	const key = id.toUpperCase() as "GOOGLE" | "GITHUB" | "OPENAI";
	const clientId = env[`${key}_CLIENT_ID`];
	const clientSecret = env[`${key}_CLIENT_SECRET`];
	return clientId && clientSecret ? { clientId, clientSecret } : null;
}

/** Providers with credentials, in display order. */
export function enabledProviders(env: ProviderEnv): ProviderId[] {
	return PROVIDER_IDS.filter((id) => credentials(env, id) !== null);
}

export function providerForCallbackPath(pathname: string): ProviderId | null {
	return PROVIDER_IDS.find((id) => PROVIDERS[id].callbackPath === pathname) ?? null;
}

export function authorizeUrl(env: ProviderEnv, id: ProviderId, o: { origin: string; state: string; codeChallenge: string; nonce?: string }): string {
	const spec = PROVIDERS[id];
	const creds = credentials(env, id);
	if (!creds) throw new Error(`${spec.label} sign-in is not configured`);
	const params: Record<string, string> = {
		client_id: creds.clientId,
		redirect_uri: o.origin + spec.callbackPath,
		response_type: "code",
		state: o.state,
		code_challenge: o.codeChallenge,
		code_challenge_method: "S256",
		...(spec.scope ? { scope: spec.scope } : {}),
		...(spec.oidc && o.nonce ? { nonce: o.nonce } : {}),
		...(spec.extraAuthorizeParams ?? {}),
	};
	const url = new URL(spec.authorizeUrl);
	url.search = new URLSearchParams(params).toString();
	return url.toString();
}

/** The stable subject at the provider after a successful code exchange. */
export interface ProviderIdentity { provider: ProviderId; subject: string }

/**
 * Exchanges the authorization code and returns the provider's stable subject. OIDC ID tokens come
 * straight from the token endpoint over TLS in exchange for the client secret (OIDC Core 3.1.3.7), so
 * issuer, audience, expiry and nonce are checked and the signature is not; GitHub's numeric user ID
 * comes from its API with the access token just issued.
 */
export async function exchangeCode(
	env: ProviderEnv, id: ProviderId, o: { origin: string; code: string; verifier: string; nonce?: string },
	fetcher: typeof fetch = fetch, nowSeconds = Math.floor(Date.now() / 1000),
): Promise<ProviderIdentity> {
	const spec = PROVIDERS[id];
	const creds = credentials(env, id);
	if (!creds) throw new Error(`${spec.label} sign-in is not configured`);
	const body = new URLSearchParams({
		grant_type: "authorization_code", code: o.code, redirect_uri: o.origin + spec.callbackPath, code_verifier: o.verifier,
		...(spec.clientAuth === "post" ? { client_id: creds.clientId, client_secret: creds.clientSecret } : {}),
	});
	const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" };
	if (spec.clientAuth === "basic") headers.Authorization = `Basic ${btoa(`${encodeURIComponent(creds.clientId)}:${encodeURIComponent(creds.clientSecret)}`)}`;
	const response = await fetcher(spec.tokenUrl, { method: "POST", headers, body });
	const tokens = (await response.json().catch(() => ({}))) as { id_token?: string; access_token?: string; error?: string; error_description?: string };
	if (!response.ok || tokens.error) throw new Error(`${spec.label} token exchange failed (${response.status}${tokens.error ? ` ${tokens.error}` : ""}${typeof tokens.error_description === "string" ? `: ${tokens.error_description.slice(0, 120)}` : ""})`);
	if (spec.oidc) {
		if (!tokens.id_token) throw new Error(`${spec.label} returned no ID token`);
		const { sub } = parseIdToken(tokens.id_token, { issuers: spec.issuers!, clientId: creds.clientId, nowSeconds, expectedNonce: o.nonce });
		return { provider: id, subject: sub };
	}
	if (!tokens.access_token) throw new Error(`${spec.label} returned no access token`);
	const user = await fetcher("https://api.github.com/user", {
		headers: { Authorization: `Bearer ${tokens.access_token}`, Accept: "application/vnd.github+json", "User-Agent": "Aetherica", "X-GitHub-Api-Version": "2022-11-28" },
	});
	const profile = (await user.json().catch(() => ({}))) as { id?: unknown };
	if (!user.ok || typeof profile.id !== "number" || !Number.isSafeInteger(profile.id) || profile.id <= 0) throw new Error(`GitHub user lookup failed (${user.status})`);
	return { provider: id, subject: String(profile.id) };
}
