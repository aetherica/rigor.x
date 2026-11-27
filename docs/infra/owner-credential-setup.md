# Owner credential setup: WP1–WP4

**Never paste credentials into ChatGPT, Claude, GitHub issues, commits, or logs.**

## GitHub secrets and variables
Secrets: https://github.com/aetherica/x/settings/secrets/actions
Add:
- `CLOUDFLARE_API_TOKEN` (account-scoped custom token, least privilege)
- `CLOUDFLARE_ACCOUNT_ID`
- `STAGING_DATABASE_URL` (staging-only connection)
- `STAGING_DATABASE_CA_CERT` (only if SSL setup requires it)

Variable: https://github.com/aetherica/x/settings/variables/actions
- `AGE_BACKUP_RECIPIENT` = public age recipient (starts `age1...`)

## Cloudflare token
Create at https://dash.cloudflare.com/profile/api-tokens
Custom, scoped to Aetherica account:
- Workers Scripts: Edit
- D1: Read
- Analytics: Read (WP3 quota integration remains pending verification)
No DNS permissions, no Global API Key. Save token in GitHub secret `CLOUDFLARE_API_TOKEN`.
Account ID: https://dash.cloudflare.com/ → select account → overview sidebar → Account ID.

## GitHub environments / approvals
https://github.com/aetherica/x/settings/environments
Create `production` with required reviewer = owner account.
Create `staging-migrations` with required reviewer = owner and restrict deployment branch to main.

## Staging database
Render service environment: https://dashboard.render.com/web/srv-dc4lshbl550s739r9580/env
Supabase DB settings: https://supabase.com/dashboard/project/jlobzwneufhzgpdszsau/settings/database
Use staging-only connection; do not edit existing service secrets. Put verified staging URL into `STAGING_DATABASE_URL`. Add CA PEM only if required.

## Google OAuth staging redirect
https://console.cloud.google.com/apis/credentials
Add redirect URI to staging OAuth client only:
`https://x-8xah.onrender.com/oauth/google/callback`
Do not touch production OAuth configuration.

## age key on Termux
```sh
pkg install age
age-keygen -o aetherica-backup-key.txt
```
Keep private key file offline. Copy only the printed public recipient line (`age1...`) to GitHub variable `AGE_BACKUP_RECIPIENT`. Do not upload private key.
Encrypted artifacts retained 7 days only; download and store ciphertext offline. Backup is not DR-ready until a restore test/checksum passes.

## Workflows
WP1 (manual production release, owner-gated): https://github.com/aetherica/x/actions/workflows/cloudflare-production-release.yml
WP2 (migration CI / optional owner-approved staging apply): https://github.com/aetherica/x/actions/workflows/staging-migration.yml
WP3 (six-hourly smoke): https://github.com/aetherica/x/actions/workflows/playground-smoke-quota.yml
WP4 (nightly encrypted backup): https://github.com/aetherica/x/actions/workflows/encrypted-backup.yml

## Gate status caveats
- WP1 is prepared, but token and Environment reviewer configuration are owner actions; do not launch production release without explicit approval.
- WP2 disposable migration CI is included. Live staging migration is manual and gated; Render auto-deploy currently is not held by this workflow.
- WP3 smoke probes are implemented. Cloudflare GraphQL quota analytics is not yet wired; it is explicitly not claiming usage figures.
- WP4 encrypts before artifact upload, but needs credentials and public age recipient. Restore validation is still required.
- No paid service/resource was activated.
