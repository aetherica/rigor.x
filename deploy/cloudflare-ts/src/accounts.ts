// The Aetherica account registry: which sign-in identities (Google, GitHub, ChatGPT) belong to one
// account. It holds no user data and nothing personal: only the provider's stable subject, the
// account's owner key and timestamps (≈ 250 bytes per account). Work and memory stay in each owner's
// own storage (one Durable Object per owner), addressed by the owner key.
//
// The owner key of an account is the key of the identity that created it ("google:<sub>",
// "github:<id>", "openai:<sub>"), so accounts that existed before the registry keep their storage
// unchanged. Further identities are linked to it from the account page.
//
// Storage: Cloudflare D1 (binding ACCOUNTS_DB). Without the binding every identity is its own account
// and linking is unavailable. Schema: migrations/accounts/0001_accounts.sql.

import type { ProviderId } from "./providers.ts";

/** The subset of the D1 API used here, so tests can supply a SQLite-backed stand-in. */
export interface SqlDatabase {
	prepare(sql: string): SqlStatement;
	batch(statements: SqlStatement[]): Promise<unknown[]>;
}
export interface SqlStatement {
	bind(...values: unknown[]): SqlStatement;
	first<T = Record<string, unknown>>(): Promise<T | null>;
	all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
	run(): Promise<unknown>;
}

export interface LinkedIdentity { provider: ProviderId; created_at: string; last_login_at: string }

export const identityKey = (provider: ProviderId, subject: string) => `${provider}:${subject}`;

export class AccountError extends Error {}

export class AccountRegistry {
	private readonly db: SqlDatabase | null;
	private readonly now: () => string;
	constructor(db: SqlDatabase | null, now: () => string = () => new Date().toISOString()) {
		this.db = db;
		this.now = now;
	}

	get linkingAvailable(): boolean {
		return this.db !== null;
	}

	/** Sign-in: the owner key for this identity, creating the account on first sign-in. */
	async signIn(provider: ProviderId, subject: string): Promise<string> {
		const key = identityKey(provider, subject);
		if (!this.db) return key;
		const now = this.now();
		const found = await this.db
			.prepare("SELECT a.owner_key AS owner_key FROM identities i JOIN accounts a ON a.id = i.account_id WHERE i.provider = ? AND i.subject = ?")
			.bind(provider, subject).first<{ owner_key: string }>();
		if (found) {
			await this.db.prepare("UPDATE identities SET last_login_at = ? WHERE provider = ? AND subject = ?").bind(now, provider, subject).run();
			return found.owner_key;
		}
		// First sign-in. The account ID is the owner key; INSERT OR IGNORE keeps two concurrent first
		// sign-ins of the same identity on one account.
		await this.db.batch([
			this.db.prepare("INSERT OR IGNORE INTO accounts (id, owner_key, created_at) VALUES (?, ?, ?)").bind(key, key, now),
			this.db.prepare("INSERT OR IGNORE INTO identities (provider, subject, account_id, created_at, last_login_at) VALUES (?, ?, ?, ?, ?)").bind(provider, subject, key, now, now),
		]);
		const created = await this.db
			.prepare("SELECT a.owner_key AS owner_key FROM identities i JOIN accounts a ON a.id = i.account_id WHERE i.provider = ? AND i.subject = ?")
			.bind(provider, subject).first<{ owner_key: string }>();
		return created?.owner_key ?? key;
	}

	private async accountId(owner: string): Promise<string | null> {
		if (!this.db) return null;
		const row = await this.db.prepare("SELECT id FROM accounts WHERE owner_key = ?").bind(owner).first<{ id: string }>();
		return row?.id ?? null;
	}

	/** Sign-in methods of the account behind this owner key. */
	async identities(owner: string): Promise<LinkedIdentity[]> {
		const id = await this.accountId(owner);
		if (!id || !this.db) {
			const [provider] = owner.split(":");
			return [{ provider: provider as ProviderId, created_at: "", last_login_at: "" }];
		}
		const { results } = await this.db
			.prepare("SELECT provider, created_at, last_login_at FROM identities WHERE account_id = ? ORDER BY created_at, provider")
			.bind(id).all<LinkedIdentity>();
		return results;
	}

	/** Adds a sign-in method to the signed-in account. One identity belongs to one account only. */
	async link(owner: string, provider: ProviderId, subject: string): Promise<"linked" | "already_linked"> {
		if (!this.db) throw new AccountError("Linking sign-in methods is not available on this server.");
		const id = await this.accountId(owner);
		if (!id) throw new AccountError("Your account was not found. Sign in again.");
		const existing = await this.db.prepare("SELECT account_id FROM identities WHERE provider = ? AND subject = ?").bind(provider, subject).first<{ account_id: string }>();
		if (existing) {
			if (existing.account_id === id) return "already_linked";
			throw new AccountError("That sign-in already belongs to a different Aetherica account. Sign in with it to use that account; accounts are not merged.");
		}
		const sameProvider = await this.db.prepare("SELECT 1 AS x FROM identities WHERE account_id = ? AND provider = ?").bind(id, provider).first();
		if (sameProvider) throw new AccountError("This account already has a sign-in of that kind. Remove it first to use a different one.");
		const now = this.now();
		await this.db.prepare("INSERT INTO identities (provider, subject, account_id, created_at, last_login_at) VALUES (?, ?, ?, ?, ?)").bind(provider, subject, id, now, now).run();
		return "linked";
	}

	/** Removes a sign-in method; the last one cannot be removed (the account would be unreachable). */
	async unlink(owner: string, provider: ProviderId): Promise<void> {
		if (!this.db) throw new AccountError("Linking sign-in methods is not available on this server.");
		const id = await this.accountId(owner);
		if (!id) throw new AccountError("Your account was not found. Sign in again.");
		const count = await this.db.prepare("SELECT COUNT(*) AS n FROM identities WHERE account_id = ?").bind(id).first<{ n: number }>();
		if (!count || count.n <= 1) throw new AccountError("This is your only sign-in method, so it cannot be removed.");
		await this.db.prepare("DELETE FROM identities WHERE account_id = ? AND provider = ?").bind(id, provider).run();
	}

	/** Deletes the account and all its sign-in methods (after the owner's data was deleted). */
	async deleteAccount(owner: string): Promise<void> {
		const id = await this.accountId(owner);
		if (!id || !this.db) return;
		await this.db.batch([
			this.db.prepare("DELETE FROM identities WHERE account_id = ?").bind(id),
			this.db.prepare("DELETE FROM accounts WHERE id = ?").bind(id),
		]);
	}

	/** Whether this identity already belongs to an account. */
	async exists(provider: ProviderId, subject: string): Promise<boolean> {
		if (!this.db) return false;
		return (await this.db.prepare("SELECT 1 AS x FROM identities WHERE provider = ? AND subject = ?").bind(provider, subject).first()) !== null;
	}

	/**
	 * Whether this identity's account has accepted terms version `version`. A new identity has not.
	 * Without the registry nothing can be recorded, so acceptance is asked at every sign-in.
	 */
	async termsAccepted(provider: ProviderId, subject: string, version: string): Promise<boolean> {
		if (!this.db) return false;
		const row = await this.db
			.prepare("SELECT a.terms_version AS v FROM identities i JOIN accounts a ON a.id = i.account_id WHERE i.provider = ? AND i.subject = ?")
			.bind(provider, subject).first<{ v: string | null }>();
		return row?.v === version;
	}

	/** Records that the account behind `owner` accepted terms version `version` now. */
	async acceptTerms(owner: string, version: string): Promise<void> {
		if (!this.db) return;
		await this.db.prepare("UPDATE accounts SET terms_version = ?, terms_accepted_at = ? WHERE owner_key = ?").bind(version, this.now(), owner).run();
	}

	/** Whether the account is exempt from usage limits (set by the operator only). */
	async unlimited(owner: string): Promise<boolean> {
		if (!this.db) return false;
		const row = await this.db.prepare("SELECT unlimited FROM accounts WHERE owner_key = ?").bind(owner).first<{ unlimited: number }>();
		return row?.unlimited === 1;
	}
}
