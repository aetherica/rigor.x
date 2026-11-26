-- Aetherica account registry (D1 binding ACCOUNTS_DB). No user data and nothing personal: the
-- provider's stable subject, the account's owner key and timestamps. Applied to production on
-- 2026-11-27 (database aetherica-accounts, APAC).
CREATE TABLE IF NOT EXISTS accounts (
	id TEXT PRIMARY KEY,
	owner_key TEXT NOT NULL UNIQUE,
	created_at TEXT NOT NULL,
	unlimited INTEGER NOT NULL DEFAULT 0 CHECK (unlimited IN (0, 1))
);
CREATE TABLE IF NOT EXISTS identities (
	provider TEXT NOT NULL CHECK (provider IN ('google', 'github', 'openai')),
	subject TEXT NOT NULL,
	account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
	created_at TEXT NOT NULL,
	last_login_at TEXT NOT NULL,
	PRIMARY KEY (provider, subject)
);
CREATE INDEX IF NOT EXISTS identities_by_account ON identities(account_id);
