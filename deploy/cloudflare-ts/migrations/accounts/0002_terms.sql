-- Explicit acceptance of the Terms of Service and Privacy Policy: the version accepted and when.
-- An account without the current version is asked to accept at its next sign-in. Applied 2026-11-27.
ALTER TABLE accounts ADD COLUMN terms_version TEXT;
ALTER TABLE accounts ADD COLUMN terms_accepted_at TEXT;
