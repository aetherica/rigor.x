// The shared AccountRegistry (accounts.ts) on the Node runtime's two account databases: SQLite (the
// D1 migration files themselves) and PostgreSQL (migration 2). One suite, both adapters.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AccountError, AccountRegistry, type SqlDatabase } from "../../cloudflare-ts/src/accounts.ts";
import { pgAccountsDb, sqliteAccountsDb, translateSql } from "../accounts-db.ts";
import { SCHEMA } from "../pg-migrations.ts";
import { freshDatabase, pgSkip, type TestDb } from "./pg-helpers.ts";

const dbs: TestDb[] = [];
after(async () => { for (const d of dbs) await d.drop(); });

function suite(label: string, make: () => Promise<SqlDatabase>, skip: string | false = false) {
	const t = (name: string, fn: (reg: AccountRegistry) => Promise<void>) => test(`${label}: ${name}`, { skip }, async () => fn(new AccountRegistry(await make(), () => "2026-11-27T12:00:00.000Z")));

	t("first sign-in creates the account (owner key = identity), repeat sign-ins return it", async (reg) => {
		assert.equal(await reg.signIn("google", "111"), "google:111");
		assert.equal(await reg.signIn("google", "111"), "google:111");
		assert.deepEqual((await reg.identities("google:111")).map((i) => i.provider), ["google"]);
	});

	t("linking a second method; one identity belongs to one account; the only method cannot be removed", async (reg) => {
		await reg.signIn("google", "222");
		await reg.link("google:222", "github", "9");
		assert.equal(await reg.signIn("github", "9"), "google:222");
		assert.deepEqual((await reg.identities("google:222")).map((i) => i.provider).sort(), ["github", "google"]);
		await reg.signIn("openai", "x1");
		await assert.rejects(reg.link("openai:x1", "github", "9"), (e: unknown) => e instanceof AccountError && /different Aetherica account/.test((e as Error).message));
		await assert.rejects(reg.link("google:222", "github", "10"), /already has a sign-in of that kind/);
		await reg.unlink("google:222", "github");
		await assert.rejects(reg.unlink("google:222", "google"), /only sign-in method/);
	});

	t("terms acceptance is recorded once per account and asked again for a new version", async (reg) => {
		await reg.signIn("google", "333");
		assert.equal(await reg.termsAccepted("google", "333", "2026-11-27"), false);
		await reg.acceptTerms("google:333", "2026-11-27");
		assert.equal(await reg.termsAccepted("google", "333", "2026-11-27"), true);
		assert.equal(await reg.termsAccepted("google", "333", "2027-01-01"), false);
		assert.equal(await reg.termsAccepted("github", "never-seen", "2026-11-27"), false);
	});

	t("account deletion removes the account and its identities; the next sign-in starts fresh", async (reg) => {
		await reg.signIn("google", "444");
		await reg.link("google:444", "github", "44");
		await reg.acceptTerms("google:444", "2026-11-27");
		await reg.deleteAccount("google:444");
		assert.equal(await reg.exists("github", "44"), false);
		assert.equal(await reg.exists("google", "444"), false); // (identities() of an unknown owner reports a synthetic entry by design)
		assert.equal(await reg.signIn("github", "44"), "github:44"); // a new, separate account
		assert.equal(await reg.termsAccepted("github", "44", "2026-11-27"), false);
	});

	t("concurrent first sign-ins of one identity create one account", async (reg) => {
		const keys = await Promise.all(Array.from({ length: 6 }, () => reg.signIn("google", "555")));
		assert.deepEqual(new Set(keys), new Set(["google:555"]));
		assert.equal((await reg.identities("google:555")).length, 1);
	});
}

suite("SQLite accounts", async () => sqliteAccountsDb(join(mkdtempSync(join(tmpdir(), "rigorx-acc-")), "accounts.sqlite")));

let pgDb: TestDb | null = null;
suite("PostgreSQL accounts", async () => {
	pgDb ??= await freshDatabase();
	if (!dbs.includes(pgDb)) dbs.push(pgDb);
	await pgDb.pool.query(`TRUNCATE ${SCHEMA}.identities, ${SCHEMA}.accounts`);
	return pgAccountsDb(pgDb.pool);
}, pgSkip);

test("SQLite accounts: the D1 migrations apply once and survive a reopen", async () => {
	const file = join(mkdtempSync(join(tmpdir(), "rigorx-acc-")), "accounts.sqlite");
	const a = sqliteAccountsDb(file);
	await new AccountRegistry(a).signIn("google", "777");
	a.close();
	const b = sqliteAccountsDb(file); // must not re-run 0002 (ALTER TABLE would fail)
	assert.deepEqual((await new AccountRegistry(b).identities("google:777")).map((i) => i.provider), ["google"]);
	b.close();
});

test("SQL translation: placeholders outside quotes, INSERT OR IGNORE, registry tables qualified", () => {
	assert.equal(translateSql("SELECT id FROM accounts WHERE owner_key = ?"), `SELECT id FROM ${SCHEMA}.accounts WHERE owner_key = $1`);
	assert.equal(
		translateSql("INSERT OR IGNORE INTO identities (provider, subject) VALUES (?, ?)"),
		`INSERT INTO ${SCHEMA}.identities (provider, subject) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
	);
	assert.equal(translateSql("SELECT '?' AS q, x FROM identities i JOIN accounts a ON a.id = i.account_id WHERE i.p = ?"),
		`SELECT '?' AS q, x FROM ${SCHEMA}.identities i JOIN ${SCHEMA}.accounts a ON a.id = i.account_id WHERE i.p = $1`);
	assert.equal(translateSql("UPDATE accounts SET terms_version = ? WHERE owner_key = ?"), `UPDATE ${SCHEMA}.accounts SET terms_version = $1 WHERE owner_key = $2`);
	assert.equal(translateSql("DELETE FROM identities WHERE account_id = ?"), `DELETE FROM ${SCHEMA}.identities WHERE account_id = $1`);
});
