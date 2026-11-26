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

/** The public brand. Internal identifiers (tool names rigorx_*, the engine) keep their names. */
export const BRAND = "Aetherica";

/** Google's "G" mark, for the sign-in step (Google sign-in branding guidelines). */
const GOOGLE_G = `<svg class="g" viewBox="0 0 48 48" width="18" height="18" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>`;

/** One design system for every page: a centred card in light and dark, Google/OpenAI-style sign-in layout. */
const PAGE_STYLE = `:root{--bg:#f6f7f9;--card:#fff;--text:#1f1f1f;--muted:#5f6368;--line:#dadce0;--accent:#0b57d0;--accent-text:#fff;--chip:#f1f3f4;--warn:#b3261e;--warn-bg:#fce8e6;color-scheme:light dark}
@media (prefers-color-scheme:dark){:root{--bg:#111214;--card:#1e1f22;--text:#e8eaed;--muted:#9aa0a6;--line:#3c4043;--accent:#a8c7fa;--accent-text:#062e6f;--chip:#2a2b2f;--warn:#f2b8b5;--warn-bg:#3b1a19}}
*{box-sizing:border-box}html,body{margin:0}
body{position:relative;min-height:100vh;min-height:100svh;display:flex;flex-direction:column;align-items:center;padding:52px 16px;background:var(--bg);color:var(--text);font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;-webkit-font-smoothing:antialiased}
.card{width:100%;max-width:448px;margin:auto 0;background:var(--card);border:1px solid var(--line);border-radius:28px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.06),0 8px 24px rgba(0,0,0,.06)}
.bar{display:flex;align-items:center;gap:10px;padding:14px 24px;border-bottom:1px solid var(--line);font-size:14px;color:var(--muted)}
.bar img{width:22px;height:22px;border-radius:50%}.bar b{color:var(--text);font-weight:600;letter-spacing:.01em}
.body{padding:28px 28px 26px}
.mark{width:64px;height:64px;border-radius:50%;display:block;margin:0 0 20px;box-shadow:0 0 0 1px var(--line)}
h1{font-size:28px;line-height:1.25;font-weight:500;margin:0 0 16px;letter-spacing:-.01em}
h2{font-size:17px;font-weight:600;margin:24px 0 6px}
p{margin:0 0 14px}.muted{color:var(--muted)}
.chip{display:inline-flex;align-items:center;gap:8px;padding:6px 14px 6px 10px;margin:0 0 18px;border:1px solid var(--line);border-radius:999px;background:var(--chip);font-size:14px}
.legal{font-size:13px;color:var(--muted);margin:22px 0 0}
a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
.warn{padding:12px 14px;border-radius:12px;background:var(--warn-bg);color:var(--warn);font-size:14px}
.actions{display:flex;gap:12px;margin-top:26px}
button{flex:1;font:inherit;font-weight:500;padding:11px 18px;border-radius:999px;border:1px solid var(--line);background:transparent;color:var(--accent);cursor:pointer}
button:hover{background:var(--chip)}button.primary{background:var(--accent);border-color:var(--accent);color:var(--accent-text)}
button.primary:hover{filter:brightness(1.08)}button:focus-visible,a:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
dl{margin:0 0 14px;padding:14px 16px;border:1px solid var(--line);border-radius:16px;font-size:14px}dt{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.04em}dd{margin:0 0 10px;word-break:break-word}dd:last-child{margin:0}
ul{padding-left:20px}li{margin:0 0 8px}code{font-size:13px;padding:1px 5px;border-radius:6px;background:var(--chip)}
footer{position:absolute;left:0;right:0;bottom:16px;display:flex;gap:20px;justify-content:center;font-size:12px;color:var(--muted)}footer a{color:var(--muted)}
.doc{max-width:680px}`;

/** Wraps page content in the shared layout: head, top bar with the emblem, card and footer links. */
function page(title: string, body: string, wide = false): string {
	return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark"><title>${escapeHtml(title)}</title>${HEAD_ICONS}<style>${PAGE_STYLE}</style></head>
<body><main class="card${wide ? " doc" : ""}"><div class="bar"><img src="/icon-192.png" alt=""><span>Sign in with <b>${BRAND}</b></span></div>
<div class="body">${body}</div></main>
<footer><a href="/privacy">Privacy</a><a href="/terms">Terms</a></footer></body></html>`;
}

const MARK = `<img class="mark" src="/icon-192.png" width="64" height="64" alt="${BRAND}">`;
const LEGAL = `<p class="legal">By continuing, you agree to ${BRAND}'s <a href="/terms">Terms of Service</a> and <a href="/privacy">Privacy Policy</a>.</p>`;

export function consentPage(facts: ConsentFacts, handle: string): string {
	const name = escapeHtml(facts.clientName);
	// Who receives the access stays visible: an app can register itself under any name.
	const origin = facts.clientDomain
		? `Access goes to <strong>${escapeHtml(facts.redirectHost)}</strong>.`
		: `This app named itself; ${BRAND} has not verified it. Access goes to <strong>${escapeHtml(facts.redirectHost)}</strong>.`;
	return page(`Allow ${facts.clientName} to use ${BRAND}?`, `${MARK}
<h1>Allow ${name} to use ${BRAND}?</h1>
<div class="chip">${GOOGLE_G}<span>Continue with your Google account</span></div>
<p class="muted">${name} will be able to use your ${BRAND} work and memory. ${origin}</p>
${facts.redirectIsLoopback ? '<p class="warn"><strong>This sends access to an app on your computer.</strong> Continue only if you just started signing in from it.</p>' : ""}
${LEGAL}
<form method="post"><input type="hidden" name="handle" value="${escapeHtml(handle)}">
<div class="actions"><button name="decision" value="deny">Cancel</button><button class="primary" name="decision" value="approve">Continue</button></div>
</form>`);
}

const REPO_URL = "https://github.com/aetherica/rigor.x";

/** Public pages linked from the sign-in page and the Google OAuth consent screen (Branding). Factual text. */
export const PRIVACY_PAGE = page(`${BRAND} privacy policy`, `${MARK}
<h1>Privacy policy</h1>
<p class="muted">${BRAND} is a service that AI assistants (such as ChatGPT and Claude) call to structure, track and verify multi-step work. This page describes what it stores. Status: early development.</p>
<h2>Sign-in</h2>
<p>You sign in with Google. ${BRAND} asks Google only for your account ID (the <code>openid</code> scope), not your name or e-mail address. Your work is stored under that account ID.</p>
<h2>What is stored</h2>
<ul>
<li>Task text, stage summaries, objectives, requirement and claim texts, assumptions, scenarios and evidence claims: stored only as SHA-256 digests and lengths, not as text.</li>
<li>Stored as text, because they are the record of the run: source references (for example URLs), reasons given for pausing, re-entering or cancelling a stage, requirement, operation, claim and capability IDs and names, the names and receipt references of actions your assistant reports, the inputs and results of calculations made in a run, and, for sources your assistant asks ${BRAND} to check, the addresses fetched (with redirects), status, size, SHA-256 hash and a few bibliographic fields (title, author, publisher, date, DOI, Crossref retraction status) — not the page content.</li>
<li>Topic memory (only what your assistant saves about the topics ${BRAND} works on): stored as text with its keywords, so it can be searched; kept until you delete it. Deletion removes the text and its search index; a record of the deletion (when, how many items) is kept without the content. Up to 120 MB per account.</li>
<li>Sign-in records (registered apps, grants, tokens): stored hashed or encrypted.</li>
</ul>
<p>Each account's data lives in separate storage on Cloudflare. ${BRAND} does not sell data, show ads or use your data to train models, and does not call any AI model itself. It fetches a web page only when your assistant asks it to check that source.</p>
<h2>Deleting your data</h2>
<p>Ask your assistant to delete a run (tool <code>rigorx_delete_run</code>) or all of your data (tool <code>rigorx_delete_account_data</code>). For anything else, open an issue at <a href="${REPO_URL}">${REPO_URL}</a>.</p>`, true);

export const TERMS_PAGE = page(`${BRAND} terms of service`, `${MARK}
<h1>Terms of service</h1>
<p>${BRAND} is an early-stage development service, provided as is, without warranty and without guaranteed availability. It may change or stop at any time, and stored work may be deleted.</p>
<p>Verification results are structural checks of what your assistant submitted ("structurally verified"); they do not guarantee that any claim is correct or true.</p>
<p>Do not use ${BRAND} for unlawful purposes or to attack the service. Source code and license: <a href="${REPO_URL}">${REPO_URL}</a>. See also the <a href="/privacy">privacy policy</a>.</p>`, true);

/** The approval decision page (values come from the engine; host-written description is escaped). */
export function approvalPage(v: Record<string, unknown>, csrf: string): string {
	const e = (x: unknown) => escapeHtml(x === null || x === undefined ? "—" : String(x));
	const open = v.status === "pending" && v.plan_changed !== true;
	const reason = v.status !== "pending" ? `This request is ${e(v.status)}.` : v.plan_changed === true ? "The operation changed after this request; ask your assistant for a new one." : "";
	return page(`Approve an action — ${BRAND}`, `${MARK}
<h1>Approve this action?</h1>
<p class="muted">Your assistant asks for your approval of <strong>one</strong> planned operation. Approve only if you want it done.</p>
<dl><dt>What</dt><dd>${e(v.description || "(no description given)")}</dd>
<dt>Operation</dt><dd>${e(v.operation_id)} · tier ${e(v.tier)} · capability ${e(v.capability)}</dd>
<dt>Run</dt><dd>${e(v.run_id)}</dd><dt>Valid until</dt><dd>${e(v.expires_at)}</dd></dl>
<p class="warn">The description was written by your assistant, not by ${BRAND}.</p>
${open ? `<form method="post"><input type="hidden" name="csrf" value="${escapeHtml(csrf)}">
<div class="actions"><button name="decision" value="deny">Deny</button><button class="primary" name="decision" value="approve">Approve</button></div></form>` : `<p>${reason}</p>`}`);
}

export function messagePage(title: string, message: string): string {
	return page(`${title} — ${BRAND}`, `${MARK}<h1>${escapeHtml(title)}</h1><p class="muted">${escapeHtml(message)}</p>`);
}

/** The landing page at "/": the brand, what the service is, and the legal links. */
export const HOME_PAGE = page(BRAND, `${MARK}
<h1>${BRAND}</h1>
<p class="muted">Rigorous, verifiable multi-step work for AI assistants. Connect ${BRAND} in Claude or ChatGPT as a connector; you sign in with your Google account.</p>
<p class="legal">Connector address: <code>/mcp</code> on this host.</p>`);
