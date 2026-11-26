// Google sign-in (OpenID Connect) for the OAuth authorization server, and the consent page.
// Pure functions only (no Workers APIs), so they run under the Node test runner.

export const GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_CALLBACK_PATH = "/oauth/google/callback";
const GOOGLE_ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);

export interface GoogleIdentity {
	sub: string;
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

export function googleAuthorizeUrl(o: { clientId: string; redirectUri: string; state: string; codeChallenge: string; nonce?: string }): string {
	const url = new URL(GOOGLE_AUTHORIZE_URL);
	url.search = new URLSearchParams({
		client_id: o.clientId,
		redirect_uri: o.redirectUri,
		response_type: "code",
		scope: "openid",
		state: o.state,
		code_challenge: o.codeChallenge,
		code_challenge_method: "S256",
		prompt: "select_account",
		...(o.nonce ? { nonce: o.nonce } : {}),
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
export function parseGoogleIdToken(idToken: string, clientId: string, nowSeconds: number, expectedNonce?: string): GoogleIdentity {
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
	// OIDC Core 3.1.3.7: with several audiences, azp must be present and be this client.
	if (Array.isArray(aud) && aud.length > 1 && claims.azp !== clientId) throw new Error("ID token authorized party mismatch");
	if (claims.azp !== undefined && claims.azp !== clientId) throw new Error("ID token authorized party mismatch");
	if (typeof claims.exp !== "number" || claims.exp + 60 < nowSeconds) throw new Error("ID token expired");
	if (typeof claims.iat === "number" && claims.iat > nowSeconds + 300) throw new Error("ID token issued in the future");
	if (expectedNonce !== undefined && claims.nonce !== expectedNonce) throw new Error("ID token nonce mismatch");
	if (typeof claims.sub !== "string" || claims.sub === "") throw new Error("ID token has no subject");
	return { sub: claims.sub };
}

export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export interface ConsentFacts {
	clientName: string;
	clientDomain?: string;
	redirectHost: string;
	redirectIsLoopback: boolean;
}

/** Favicon and app icons: the circular Aetherica emblem, served as static assets (public/). */
const HEAD_ICONS = `<link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48"><link rel="icon" type="image/png" href="/icon-192.png" sizes="192x192"><link rel="apple-touch-icon" href="/icon-192.png">`;
/** The emblem above each page's title (decorative; the page text names RIGOR-X). */
const EMBLEM = `<img class="emblem" src="/icon-192.png" width="72" height="72" alt="">`;

const PAGE_STYLE = `body{font:16px/1.5 system-ui,sans-serif;max-width:32rem;margin:3rem auto;padding:0 1rem;color:#1a1a1a;background:#fff}
.emblem{display:block;width:72px;height:72px;margin:0 0 1rem;border-radius:50%}
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
<title>Sign in to RIGOR-X</title>${HEAD_ICONS}<style>${PAGE_STYLE}</style>
${EMBLEM}
<h1>Allow ${name} to use RIGOR-X?</h1>
<p>${origin} Access will be sent to <strong>${escapeHtml(facts.redirectHost)}</strong>.</p>
${facts.redirectIsLoopback ? '<p class="warn"><strong>This sends access to an app on your computer.</strong> Continue only if you just started signing in from it.</p>' : ""}
<p>You will sign in with your Google account. RIGOR-X receives only your Google account ID (not your name or e-mail address), and keeps your runs separate from everyone else's.</p>
<form method="post">
<input type="hidden" name="handle" value="${escapeHtml(handle)}">
<p><button name="decision" value="approve">Continue with Google</button><button name="decision" value="deny">Deny</button></p>
</form></html>`;
}

const REPO_URL = "https://github.com/aetherica/rigor.x";

/** Public pages linked from the Google OAuth consent screen (Branding). Factual, early-development text. */
export const PRIVACY_PAGE = `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>RIGOR-X privacy</title>${HEAD_ICONS}<style>${PAGE_STYLE}</style>
${EMBLEM}
<h1>RIGOR-X privacy policy</h1>
<p>RIGOR-X is an MCP server that AI assistants (such as ChatGPT and Claude) call to structure multi-step work. This page describes what it stores. Status: early development.</p>
<h2>Sign-in</h2>
<p>You sign in with Google. RIGOR-X asks Google only for your account ID (the <code>openid</code> scope), not your name or e-mail address. Your runs are stored under that account ID.</p>
<h2>What is stored</h2>
<ul>
<li>Task text, stage summaries, objectives, requirement and claim texts, assumptions, scenarios and evidence claims: stored only as SHA-256 digests and lengths, not as text.</li>
<li>Stored as text, because they are the record of the run: source references (for example URLs), reasons given for pausing, re-entering or cancelling a stage, requirement, operation, claim and capability IDs and names, the names and receipt references of actions your assistant reports, the inputs and results of calculations made with <code>rigorx_compute</code> in a run, and, for sources checked with <code>rigorx_check_source</code>, the addresses fetched (with redirects), status, size, SHA-256 hash and a few bibliographic fields (title, author, publisher, date, DOI, Crossref retraction status) — not the page content.</li>
<li>Topic memory (only what your assistant saves with <code>rigorx_memory_write</code> about the topics RIGOR-X works on): stored as text with its keywords, so it can be searched; kept until you delete it (<code>rigorx_memory_delete</code>, or a whole topic with <code>rigorx_memory_topic</code>). Deletion removes the text and its search index; a record of the deletion (when, how many items) is kept without the content. Up to 120 MB per account.</li>
<li>Sign-in records (registered apps, grants, tokens): stored hashed or encrypted.</li>
</ul>
<p>Each account's runs live in separate storage on Cloudflare. RIGOR-X does not sell data, show ads or use your data to train models, and does not call any AI model itself. It fetches a web page only when your assistant asks it to check that source.</p>
<h2>Deleting your data</h2>
<p>Ask your assistant to use the <code>rigorx_delete_run</code> tool on a run to delete it permanently. For anything else, open an issue at <a href="${REPO_URL}">${REPO_URL}</a>.</p>
</html>`;

export const TERMS_PAGE = `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>RIGOR-X terms</title>${HEAD_ICONS}<style>${PAGE_STYLE}</style>
${EMBLEM}
<h1>RIGOR-X terms of service</h1>
<p>RIGOR-X is an early-stage development service, provided as is, without warranty and without guaranteed availability. It may change or stop at any time, and stored runs may be deleted.</p>
<p>Verification results are structural checks of what your assistant submitted ("structurally verified"); they do not guarantee that any claim is correct or true.</p>
<p>Do not use RIGOR-X for unlawful purposes or to attack the service. Source code and license: <a href="${REPO_URL}">${REPO_URL}</a>.</p>
</html>`;

/** The approval decision page (values come from the engine; host-written description is escaped). */
export function approvalPage(v: Record<string, unknown>, csrf: string): string {
	const e = (x: unknown) => escapeHtml(x === null || x === undefined ? "—" : String(x));
	const open = v.status === "pending" && v.plan_changed !== true;
	const reason = v.status !== "pending" ? `This request is ${e(v.status)}.` : v.plan_changed === true ? "The operation changed after this request; ask your assistant for a new one." : "";
	return `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Approve an action — RIGOR-X</title>${HEAD_ICONS}<style>${PAGE_STYLE}</style>
${EMBLEM}
<h1>Approve this action?</h1>
<p>Your assistant asks for your approval of <strong>one</strong> planned operation. Approve only if you want it done.</p>
<p><strong>What:</strong> ${e(v.description || "(no description given)")}</p>
<p><strong>Operation:</strong> ${e(v.operation_id)} · tier ${e(v.tier)} · capability ${e(v.capability)}<br><strong>Run:</strong> ${e(v.run_id)}<br><strong>Valid until:</strong> ${e(v.expires_at)}</p>
<p class="warn">The description was written by your assistant, not by RIGOR-X.</p>
${open ? `<form method="post"><input type="hidden" name="csrf" value="${escapeHtml(csrf)}">
<p><button name="decision" value="approve">Approve this operation</button><button name="decision" value="deny">Deny</button></p></form>` : `<p>${reason}</p>`}
</html>`;
}

export function messagePage(title: string, message: string): string {
	return `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>${HEAD_ICONS}<style>${PAGE_STYLE}</style>
${EMBLEM}
<h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p></html>`;
}
