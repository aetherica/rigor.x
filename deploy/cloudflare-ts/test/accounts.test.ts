// Aetherica account registry (D1 schema run on node:sqlite) and the sign-in providers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { AccountError, AccountRegistry, type SqlDatabase, type SqlStatement } from "../src/accounts.ts";
import { PROVIDERS, authorizeUrl, enabledProviders, exchangeCode, providerForCallbackPath } from "../src/providers.ts";
import { consentPage, signInChoicePage, accountPage } from "../src/google.ts";

/** A D1-shaped wrapper over node:sqlite running the production migration. */
function d1(): SqlDatabase {
	const db = new DatabaseSync(":memory:");
	db.exec("PRAGMA foreign_keys = ON");
	for (const m of ["0001_accounts.sql", "0002_terms.sql"]) db.exec(readFileSync(new URL(`../migrations/accounts/${m}`, import.meta.url), "utf8"));
	const stmt = (sql: string, values: unknown[] = []): SqlStatement & { exec(): void } => ({
		bind: (...v: unknown[]) => stmt(sql, v),
		first: async <T>() => (db.prepare(sql).get(...(values as never[])) as T) ?? null,
		all: async <T>() => ({ results: db.prepare(sql).all(...(values as never[])) as T[] }),
		run: async () => db.prepare(sql).run(...(values as never[])),
		exec: () => void db.prepare(sql).run(...(values as never[])),
	});
	return {
		prepare: (sql) => stmt(sql),
		batch: async (statements) => {
			db.exec("BEGIN");
			try { for (const s of statements) (s as ReturnType<typeof stmt>).exec(); db.exec("COMMIT"); } catch (e) { db.exec("ROLLBACK"); throw e; }
			return [];
		},
	};
}

test("first sign-in creates an account whose owner key is the identity; Google owners keep their storage", async () => {
	const reg = new AccountRegistry(d1(), () => "2026-11-27T00:00:00.000Z");
	assert.equal(await reg.signIn("google", "1234"), "google:1234"); // same key as before the registry
	assert.equal(await reg.signIn("google", "1234"), "google:1234");
	assert.equal(await reg.signIn("github", "42"), "github:42");
	assert.deepEqual((await reg.identities("google:1234")).map((i) => i.provider), ["google"]);
});

test("linking: a second sign-in method reaches the same owner; one identity belongs to one account", async () => {
	const reg = new AccountRegistry(d1());
	const owner = await reg.signIn("github", "42");
	assert.equal(await reg.link(owner, "openai", "user-abc"), "linked");
	assert.equal(await reg.signIn("openai", "user-abc"), owner);
	assert.equal(await reg.link(owner, "openai", "user-abc"), "already_linked");
	await reg.signIn("google", "999"); // another person's account
	await assert.rejects(reg.link(owner, "google", "999"), (e) => e instanceof AccountError && /different Aetherica account/.test(e.message));
	await assert.rejects(reg.link(owner, "openai", "someone-else"), /already has a sign-in of that kind/);
	assert.deepEqual((await reg.identities(owner)).map((i) => i.provider).sort(), ["github", "openai"]);
});

test("unlinking keeps at least one sign-in; deleting the account frees its identities", async () => {
	const reg = new AccountRegistry(d1());
	const owner = await reg.signIn("google", "1");
	await assert.rejects(reg.unlink(owner, "google"), /only sign-in method/);
	await reg.link(owner, "github", "7");
	await reg.unlink(owner, "google");
	assert.equal(await reg.signIn("github", "7"), owner);
	assert.equal(await reg.signIn("google", "1"), "google:1"); // the removed identity starts a new account
	await reg.deleteAccount(owner);
	assert.equal(await reg.signIn("github", "7"), "github:7");
	assert.equal(await reg.unlimited("github:7"), false);
});

test("without the D1 binding every identity is its own account and linking is refused", async () => {
	const reg = new AccountRegistry(null);
	assert.equal(reg.linkingAvailable, false);
	assert.equal(await reg.signIn("openai", "u1"), "openai:u1");
	await assert.rejects(reg.link("openai:u1", "github", "1"), /not available/);
});

test("providers are enabled only with both secrets; callback paths map back to providers", () => {
	assert.deepEqual(enabledProviders({ GOOGLE_CLIENT_ID: "g", GOOGLE_CLIENT_SECRET: "s", GITHUB_CLIENT_ID: "x" }), ["google"]);
	assert.deepEqual(enabledProviders({ GOOGLE_CLIENT_ID: "g", GOOGLE_CLIENT_SECRET: "s", GITHUB_CLIENT_ID: "x", GITHUB_CLIENT_SECRET: "y", OPENAI_CLIENT_ID: "o", OPENAI_CLIENT_SECRET: "p" }), ["google", "github", "openai"]);
	for (const id of ["google", "github", "openai"] as const) assert.equal(providerForCallbackPath(PROVIDERS[id].callbackPath), id);
	assert.equal(providerForCallbackPath("/oauth/other/callback"), null);
});

test("authorize URLs: PKCE everywhere, openid + nonce for OIDC, no scope for GitHub", () => {
	const env = { GITHUB_CLIENT_ID: "gh", GITHUB_CLIENT_SECRET: "s", OPENAI_CLIENT_ID: "app_1", OPENAI_CLIENT_SECRET: "s" };
	const gh = new URL(authorizeUrl(env, "github", { origin: "https://x.example", state: "st", codeChallenge: "cc", nonce: "n" }));
	assert.equal(gh.origin + gh.pathname, "https://github.com/login/oauth/authorize");
	assert.equal(gh.searchParams.get("scope"), null);
	assert.equal(gh.searchParams.get("nonce"), null);
	assert.equal(gh.searchParams.get("code_challenge_method"), "S256");
	assert.equal(gh.searchParams.get("redirect_uri"), "https://x.example/oauth/github/callback");
	const oa = new URL(authorizeUrl(env, "openai", { origin: "https://x.example", state: "st", codeChallenge: "cc", nonce: "n" }));
	assert.equal(oa.origin + oa.pathname, "https://auth.openai.com/api/accounts/authorize");
	assert.equal(oa.searchParams.get("scope"), "openid");
	assert.equal(oa.searchParams.get("nonce"), "n");
	assert.throws(() => authorizeUrl({}, "github", { origin: "https://x", state: "s", codeChallenge: "c" }), /not configured/);
});

const jwt = (claims: Record<string, unknown>) => `e30.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.sig`;

test("ChatGPT sign-in: client_secret_basic, issuer/audience/nonce checked, subject returned", async () => {
	const env = { OPENAI_CLIENT_ID: "app_1", OPENAI_CLIENT_SECRET: "sec" };
	const now = 1_800_000_000;
	let seen: { url: string; init: RequestInit } | null = null;
	const ok = (claims: Record<string, unknown>) => (async (url: string | URL | Request, init?: RequestInit) => {
		seen = { url: String(url), init: init! };
		return Response.json({ id_token: jwt(claims) });
	}) as typeof fetch;
	const good = { iss: "https://auth.openai.com", aud: "app_1", sub: "user-abc", exp: now + 600, iat: now, nonce: "n1" };
	const id = await exchangeCode(env, "openai", { origin: "https://x.example", code: "c", verifier: "v", nonce: "n1" }, ok(good), now);
	assert.deepEqual(id, { provider: "openai", subject: "user-abc" });
	assert.equal(seen!.url, "https://auth.openai.com/api/accounts/oauth/token");
	assert.equal((seen!.init.headers as Record<string, string>).Authorization, `Basic ${btoa("app_1:sec")}`);
	assert.equal((seen!.init.body as URLSearchParams).get("client_secret"), null);
	await assert.rejects(exchangeCode(env, "openai", { origin: "https://x", code: "c", verifier: "v", nonce: "n1" }, ok({ ...good, iss: "https://accounts.google.com" }), now), /issuer/);
	await assert.rejects(exchangeCode(env, "openai", { origin: "https://x", code: "c", verifier: "v", nonce: "n1" }, ok({ ...good, nonce: "other" }), now), /nonce/);
	await assert.rejects(exchangeCode(env, "openai", { origin: "https://x", code: "c", verifier: "v", nonce: "n1" }, ok({ ...good, aud: "app_2" }), now), /audience/);
});

test("GitHub sign-in: numeric user ID from /user, nothing else", async () => {
	const env = { GITHUB_CLIENT_ID: "gh", GITHUB_CLIENT_SECRET: "sec" };
	const calls: string[] = [];
	const fake = (user: unknown, status = 200) => (async (url: string | URL | Request, init?: RequestInit) => {
		calls.push(String(url));
		if (String(url).includes("access_token")) {
			assert.equal((init!.body as URLSearchParams).get("client_secret"), "sec");
			return Response.json({ access_token: "gho_x", token_type: "bearer" });
		}
		assert.equal((init!.headers as Record<string, string>).Authorization, "Bearer gho_x");
		return Response.json(user, { status });
	}) as typeof fetch;
	assert.deepEqual(await exchangeCode(env, "github", { origin: "https://x", code: "c", verifier: "v" }, fake({ id: 583231, login: "octocat", email: "x@y" })), { provider: "github", subject: "583231" });
	assert.deepEqual(calls, ["https://github.com/login/oauth/access_token", "https://api.github.com/user"]);
	await assert.rejects(exchangeCode(env, "github", { origin: "https://x", code: "c", verifier: "v" }, fake({ id: "583231" })), /lookup failed/);
	await assert.rejects(exchangeCode(env, "github", { origin: "https://x", code: "c", verifier: "v" }, fake({ message: "Bad credentials" }, 401)), /lookup failed/);
	const denied = (async () => Response.json({ error: "bad_verification_code" })) as unknown as typeof fetch;
	await assert.rejects(exchangeCode(env, "github", { origin: "https://x", code: "c", verifier: "v" }, denied), /bad_verification_code/);
});

test("pages: one button per enabled sign-in method, a chooser, and sign-in methods on the account page", () => {
	const opts = [{ id: "google", label: "Google" }, { id: "github", label: "GitHub" }, { id: "openai", label: "ChatGPT" }];
	const consent = consentPage({ clientName: "Claude", clientDomain: "claude.ai", redirectHost: "claude.ai", redirectIsLoopback: false }, "h", opts);
	for (const o of opts) assert.ok(consent.includes(`name="provider" value="${o.id}"`), o.id);
	assert.ok(consent.includes("Continue with GitHub") && consent.includes("Continue with ChatGPT") && consent.includes('value="deny"'));
	const choice = signInChoicePage("Sign in to your account", "Use any sign-in method.", "/account", opts);
	assert.ok(choice.includes('href="/account?with=openai"') && choice.includes('href="/account?with=github"'));
	const acct = accountPage({
		usage: {}, runs: [], more_runs: false, topics: [], confirmation: "X",
		identities: [{ provider: "google", label: "Google", since: "2026-11-01T00:00:00Z" }, { provider: "github", label: "GitHub", since: "2026-11-27T00:00:00Z" }],
		linkable: [{ id: "openai", label: "ChatGPT" }], linking: true,
	}, "c");
	assert.ok(acct.includes("Sign-in methods") && acct.includes("since 1 Nov 2026"));
	assert.ok(acct.includes('value="unlink"') && acct.includes('name="provider" value="github"'));
	assert.ok(acct.includes('value="link"') && acct.includes("Add sign-in with ChatGPT"));
	const single = accountPage({ usage: {}, runs: [], more_runs: false, topics: [], confirmation: "X", identities: [{ provider: "google", label: "Google", since: "" }], linkable: [], linking: true }, "c");
	assert.ok(!single.includes('value="unlink"')); // the only sign-in cannot be removed
});

test("terms: a new identity has not accepted; acceptance is recorded per version", async () => {
	const reg = new AccountRegistry(d1(), () => "2026-11-27T00:00:00.000Z");
	assert.equal(await reg.exists("github", "5"), false);
	assert.equal(await reg.termsAccepted("github", "5", "2026-11-27"), false);
	const owner = await reg.signIn("github", "5");
	assert.equal(await reg.termsAccepted("github", "5", "2026-11-27"), false); // created, not yet accepted
	await reg.acceptTerms(owner, "2026-11-27");
	assert.equal(await reg.termsAccepted("github", "5", "2026-11-27"), true);
	assert.equal(await reg.termsAccepted("github", "5", "2027-01-01"), false); // new version asks again
	await reg.link(owner, "google", "g5");
	assert.equal(await reg.termsAccepted("google", "g5", "2026-11-27"), true); // per account, not per sign-in
	assert.equal(await new AccountRegistry(null).termsAccepted("github", "5", "2026-11-27"), false);
});

test("terms page: required checkbox, versioned links, token in the form, decline without validation", async () => {
	const { termsPage, TERMS_VERSION } = await import("../src/google.ts");
	const page = termsPage({ token: 't"1', providerLabel: "GitHub", isNew: true });
	assert.ok(page.includes("Create your Aetherica account") && page.includes("You signed in with GitHub"));
	assert.ok(page.includes('name="agree" value="yes" required'));
	assert.ok(page.includes('href="/terms"') && page.includes('href="/privacy"') && page.includes(`version ${TERMS_VERSION}`));
	assert.ok(page.includes('value="t&#34;1"') && page.includes('action="/signup"'));
	assert.ok(page.includes('value="decline" formnovalidate'));
	assert.ok(termsPage({ token: "t", providerLabel: "Google", isNew: false }).includes("Review the updated terms"));
});
