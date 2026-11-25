// Google sign-in (OpenID Connect) for the OAuth authorization server, and the consent page.
// Pure functions only (no Workers APIs), so they run under the Node test runner.

export const GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_CALLBACK_PATH = "/oauth/google/callback";
const GOOGLE_ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);

export interface GoogleIdentity {
	sub: string;
	email?: string;
	emailVerified: boolean;
}

/** Owner identity for the engine: issuer + subject, never the e-mail address (WS31 section 7). */
export const ownerFromGoogle = (sub: string) => `google:${sub}`;
/** The OAuth library's user ID must not contain ':'. */
export const userIdFromGoogle = (sub: string) => `google-${sub}`;

const base64url = (bytes: Uint8Array) =>
	btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export function randomVerifier(): string {
	return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function s256(verifier: string): Promise<string> {
	return base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
}

export function googleAuthorizeUrl(o: { clientId: string; redirectUri: string; state: string; codeChallenge: string }): string {
	const url = new URL(GOOGLE_AUTHORIZE_URL);
	url.search = new URLSearchParams({
		client_id: o.clientId,
		redirect_uri: o.redirectUri,
		response_type: "code",
		scope: "openid email",
		state: o.state,
		code_challenge: o.codeChallenge,
		code_challenge_method: "S256",
		prompt: "select_account",
	}).toString();
	return url.toString();
}

export function googleTokenRequestBody(o: { code: string; clientId: string; clientSecret: string; redirectUri: string; verifier: string }): URLSearchParams {
	return new URLSearchParams({
		grant_type: "authorization_code",
		code: o.code,
		client_id: o.clientId,
		client_secret: o.clientSecret,
		redirect_uri: o.redirectUri,
		code_verifier: o.verifier,
	});
}

/**
 * Reads the ID token returned by Google's token endpoint. The token came straight from Google over
 * TLS in exchange for our client secret, so OpenID Connect Core 3.1.3.7 allows skipping the
 * signature check; issuer, audience and expiry are still checked.
 */
export function parseGoogleIdToken(idToken: string, clientId: string, nowSeconds: number): GoogleIdentity {
	const parts = idToken.split(".");
	if (parts.length !== 3) throw new Error("Malformed ID token");
	let claims: Record<string, unknown>;
	try {
		const json = atob(parts[1]!.replace(/-/g, "+").replace(/_/g, "/"));
		claims = JSON.parse(new TextDecoder().decode(Uint8Array.from(json, (c) => c.charCodeAt(0))));
	} catch {
		throw new Error("Malformed ID token");
	}
	if (typeof claims.iss !== "string" || !GOOGLE_ISSUERS.has(claims.iss)) throw new Error("ID token issuer is not Google");
	const aud = claims.aud;
	if (!(aud === clientId || (Array.isArray(aud) && aud.includes(clientId)))) throw new Error("ID token audience mismatch");
	if (typeof claims.exp !== "number" || claims.exp + 60 < nowSeconds) throw new Error("ID token expired");
	if (typeof claims.sub !== "string" || claims.sub === "") throw new Error("ID token has no subject");
	return {
		sub: claims.sub,
		email: typeof claims.email === "string" ? claims.email : undefined,
		emailVerified: claims.email_verified === true || claims.email_verified === "true",
	};
}

/**
 * Optional allowlist (Worker variable ALLOWED_EMAILS, comma-separated). Unset or empty: every
 * Google account may sign in. Only verified addresses can match.
 */
export function emailAllowed(identity: GoogleIdentity, allowed: string | undefined): boolean {
	const list = (allowed ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
	if (list.length === 0) return true;
	return identity.emailVerified && !!identity.email && list.includes(identity.email.toLowerCase());
}

export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export interface ConsentFacts {
	clientName: string;
	clientDomain?: string;
	redirectHost: string;
	redirectIsLoopback: boolean;
}

const PAGE_STYLE = `body{font:16px/1.5 system-ui,sans-serif;max-width:32rem;margin:3rem auto;padding:0 1rem;color:#1a1a1a;background:#fff}
@media (prefers-color-scheme:dark){body{color:#eee;background:#151515}}
button{font:inherit;padding:.5rem 1.25rem;margin-right:.5rem;border-radius:.4rem;border:1px solid #888;cursor:pointer}
button[value=approve]{background:#1a73e8;color:#fff;border-color:#1a73e8}.warn{padding:.75rem;border-left:4px solid #d93025}`;

export function consentPage(facts: ConsentFacts, handle: string): string {
	const name = escapeHtml(facts.clientName);
	const origin = facts.clientDomain
		? `Published by <strong>${escapeHtml(facts.clientDomain)}</strong>.`
		: "This app registered itself; its name is not verified.";
	return `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sign in to RIGOR-X</title><style>${PAGE_STYLE}</style>
<h1>Allow ${name} to use RIGOR-X?</h1>
<p>${origin} Access will be sent to <strong>${escapeHtml(facts.redirectHost)}</strong>.</p>
${facts.redirectIsLoopback ? '<p class="warn"><strong>This sends access to an app on your computer.</strong> Continue only if you just started signing in from it.</p>' : ""}
<p>You will sign in with your Google account. RIGOR-X receives only your Google account ID and e-mail address, and keeps your runs separate from everyone else's.</p>
<form method="post">
<input type="hidden" name="handle" value="${escapeHtml(handle)}">
<p><button name="decision" value="approve">Continue with Google</button><button name="decision" value="deny">Deny</button></p>
</form></html>`;
}

export function messagePage(title: string, message: string): string {
	return `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title><style>${PAGE_STYLE}</style>
<h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p></html>`;
}
