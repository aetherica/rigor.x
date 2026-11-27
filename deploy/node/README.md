# Portable Node runtime

The Aetherica (RIGOR-X) MCP server outside Cloudflare: the **same application code** as the
production Worker (`deploy/cloudflare-ts/src`: MCP, OAuth with Google sign-in, approvals, quotas,
account deletion, the engine) bound to `node:http` and SQLite files. Nothing here re-implements
a tool or the protocol.

**Status:** staging and backup only. The Cloudflare Worker stays the production system of record.
Its data (Durable Objects, KV) is not shared with, or migrated to, a Node deployment: each
deployment has its own accounts, runs and sign-ins.

## What replaces what

| Cloudflare (production)                 | Node runtime                                  | File               |
|-----------------------------------------|-----------------------------------------------|--------------------|
| One Durable Object per owner            | `STORAGE=sqlite`: one SQLite file per owner (`DATA_DIR/owners/<sha256>.sqlite`); `STORAGE=postgres`: one snapshot row per owner in PostgreSQL | `owners.ts`, `pg-owners.ts` |
| `ctx.storage.transactionSync`           | SQLite savepoint per operation (rolled back on error) | `sqlite.ts`  |
| KV namespace `OAUTH_KV`                 | SQLite KV (`DATA_DIR/oauth-kv.sqlite`) or PostgreSQL KV, both with Workers KV TTL semantics | `kv.ts`, `pg-kv.ts` |
| Accounts registry (D1 `ACCOUNTS_DB`, `accounts.ts`) | `STORAGE=sqlite`: `DATA_DIR/accounts.sqlite` running the D1 migration files; `STORAGE=postgres`: `rigorx_private.accounts` / `identities` (migration 2). Same registry code: sign-in methods linked into one account, terms accepted once per version | `accounts-db.ts` |
| Static assets (`public/`)               | Icons and favicon served by the HTTP layer    | `server.ts`        |
| `global_fetch_strictly_public`          | Address check at connection time (all resolved addresses must be public) | `guarded-fetch.ts` |
| Version metadata                        | `RIGORX_VERSION_TAG`, `RENDER_GIT_COMMIT` or `RAILWAY_GIT_COMMIT_SHA` | `config.ts` |
| `cloudflare:workers` module             | Shim with `WorkerEntrypoint` (the OAuth library uses it only for `instanceof` checks) | `cloudflare-workers-shim.mjs`, `register.mjs` |

The application itself (`deploy/cloudflare-ts/src/app.ts`) takes a small `Platform` interface
(`callOwner`, `version`, `fetcher`); `src/index.ts` binds it to Cloudflare and `server.ts` to Node.

## Run

Requirements: Node 22.18+ (24 recommended), the Worker's dependencies and this directory's
(`cd deploy/cloudflare-ts && npm ci --omit=dev`, `cd deploy/node && npm ci --omit=dev`).

```sh
cp deploy/node/.env.example deploy/node/.env   # then fill in; never commit .env
set -a; . deploy/node/.env; set +a
node --import ./deploy/node/register.mjs --experimental-strip-types deploy/node/server.ts
```

Container (from the repository root):

```sh
docker build -f deploy/node/Dockerfile -t aetherica-node .
docker run --env-file deploy/node/.env -p 8787:8787 -v aetherica-data:/data aetherica-node
```

- Start command: `node --import ./deploy/node/register.mjs --experimental-strip-types --disable-warning=ExperimentalWarning deploy/node/server.ts`
- Health check: `GET /health` (200 while serving, 503 while draining); `GET /version` shows the release.
- Persistent storage: mount it at `DATA_DIR` (default `/data`). The image runs as user `node`.
- Shutdown: on SIGTERM/SIGINT the server stops accepting, waits for in-flight requests (up to
  `SHUTDOWN_GRACE_MS`, default 10 s), checkpoints and closes every database, and exits 0.
  A second signal exits at once.
- Startup validation: invalid configuration exits with code 78 and names the variable (never a value).

## Configuration

See `.env.example`. `PUBLIC_ORIGIN` is required: every request URL, OAuth metadata URL and the
Google callback are built on it, and the `Host` header is never trusted (absolute-form request
targets are refused). It must be `https://`; plain `http://` is accepted only for localhost.

Google sign-in: add `<PUBLIC_ORIGIN>/oauth/google/callback` to the authorized redirect URIs of the
Google OAuth client before signing in. This is a Google Cloud Console action for the account
owner. Changing the host does **not** change what Google's account chooser shows ("continue to
<domain>"): that needs brand verification of a domain the owner controls, on any host.

## Security properties kept

Same code paths as production, verified by the same probe (`auth-probe.mjs --node`) and by the
tests in `test/`:

- OAuth 2.1 with PKCE S256 only, exact redirect URIs, single-use codes, tokens bound to `/mcp`.
- Google sign-in with state, nonce and PKCE; issuer, audience, azp, expiry and iat checks.
- Approvals: CSRF token, session cookie, single use, bound to the operation digest, 24 h.
- Per-owner isolation: separate database files named by SHA-256 of the owner (never a path from
  input); quotas, rate limits, suspension and account deletion as on Cloudflare.
- Source checks: the engine's URL, redirect and DNS checks, plus the connection-time address check.
- Pages: CSP without scripts, `frame-ancestors 'none'`, `X-Frame-Options: DENY`.
- Request bodies capped (`MAX_BODY_BYTES`, default 2 MiB); MCP itself caps messages at 1 MiB.

## Limitations

- **Ephemeral hosting with `STORAGE=sqlite`** (for example Render's free web services, which have
  no persistent disk, sleep after 15 minutes idle and lose files on restart): every restart deletes
  all accounts' runs, topic memory, registered OAuth clients and tokens. Use `STORAGE=postgres` there.
- **One process with `STORAGE=sqlite`**: do not run several replicas on the same SQLite files.
  `STORAGE=postgres` is safe with several processes (compare-and-swap on every write).
- **Client ID Metadata Documents** are disabled by the OAuth library outside Cloudflare (it enables
  them only when the runtime guarantees public-only fetches). Clients that support dynamic client
  registration (Claude, ChatGPT, the MCP SDK) are unaffected.
- **KV consistency** differs in the safe direction: writes are immediately visible (Workers KV is
  eventually consistent).
- **Cold starts** on sleeping hosts add seconds to the first request; MCP clients may time out once.

## PostgreSQL storage (`STORAGE=postgres`, for example Supabase)

Persistent storage for hosts without a disk. The engine stays synchronous and identical to the
Durable Object code; each owner's whole SQLite database is stored as one row (a snapshot).

**How one operation works** (`pg-owners.ts`):

1. Read the owner's row version and generation. Download the snapshot only if the local cache
   (`DATA_DIR/pg-cache`) is not exactly that version. Every download is checked: SHA-256, SQLite
   header, `PRAGMA quick_check`, and an engine schema no newer than this release.
2. Run the operation on the local copy as one SQLite transaction (exactly as in a Durable Object).
3. If it changed anything, write the new snapshot in one PostgreSQL transaction under a per-owner
   advisory lock, compare-and-swap on (version, generation). The result is returned only after
   COMMIT; on any failure the local copy is discarded and nothing is reported as saved.
4. **Version conflict** (another process wrote first): wait a short random time (5–25 ms × attempt), reload and re-run, at most
   `STORAGE_MAX_ATTEMPTS` times (default 4, maximum 5), then `STORAGE_CONFLICT`. **Generation
   conflict** (the account was deleted meanwhile): `OWNER_DELETED_DURING_OPERATION`, no retry.

**Replay safety.** An operation does nothing outside the database (no network, no external writes),
so re-running it after a conflict has no side effect. An uncommitted attempt is never returned, so
its IDs and timestamps are never observed. Retries across requests use the engine's idempotency
keys, which are stored in the same snapshot and committed atomically with the effect.

**Account deletion** removes the owner row, records a tombstone with the next generation and
deletes the account's OAuth grants and tokens (`grant:<user>:*`, `token:<user>:*`) in **one**
PostgreSQL transaction. An operation that started before the deletion cannot write afterwards (its
generation no longer matches), so deleted data is never resurrected. A later sign-in starts a new,
empty account. This is the only operation that touches owner data and OAuth rows together; all
other OAuth writes (clients, grants, tokens, sign-in and approval sessions) are single-row KV
writes, and approval decisions themselves are engine operations inside the owner snapshot. Unlike
the Cloudflare Worker, deletion here also revokes the account's OAuth grants.

**Owner keys** are `HMAC-SHA256(OWNER_KEY_SECRET, owner ID)`, so rows cannot be linked to an
account ID without the secret. The snapshot *content* is the engine's own database and contains the
owner ID (the provider's account number, never a name or e-mail), as Durable Object storage does.
Rotation: set the new secret in `OWNER_KEY_SECRET` and the old one in `OWNER_KEY_SECRET_PREVIOUS`;
each account's row is found under the old key and moved on its next write. Remove the previous
secret only when no rows under it remain. Losing the secret makes all rows unreachable.

**Snapshot size** is limited by `OWNER_SNAPSHOT_MAX_BYTES` (default 8 MiB). A write that would
exceed it is refused (`STORAGE_LIMIT`) and nothing is saved. Each write uploads the whole
snapshot, so this design suits staging and small accounts, not large ones.

**Schema and privileges** (`pg-migrations.ts`):

- Tables live in the private schema `rigorx_private`: `owners`, `owner_tombstones`, `kv` and
  `schema_migrations`.
- This schema is not exposed by Supabase's Data API. All privileges are revoked from `PUBLIC`,
  `anon`, `authenticated` and `service_role`, and row-level security is enabled with no policies.
- Only the role the server connects as can read or write.
- Migrations run only by the explicit command, under an advisory lock. The server checks versions
  and checksums at startup and refuses to start (exit 78) on a missing, changed or newer schema:

```sh
node --import ./deploy/node/register.mjs --experimental-strip-types deploy/node/migrate.ts
# or with the image:
docker run --rm --env-file deploy/node/.env aetherica-node node --import ./deploy/node/register.mjs --experimental-strip-types deploy/node/migrate.ts
```

**Startup messages.** A configuration problem stops the server with exit 78 and a message naming
what to change: a leftover `[YOUR-PASSWORD]`, a `…` or curly quote copied from an example, a
`DATABASE_URL=` prefix or quotes, an unencoded password, or the transaction pooler port. A failure to
reach the database is logged with a `hint`: IPv6-only direct host, unknown host name, wrong pooler
cluster or user (`Tenant or user not found`), wrong password, TLS verification (CA certificate),
refused connection or a paused project. Configuration warnings are logged before connecting.

**Connection** (`pg-config.ts`):

- **Pooler mode:** use Supabase's **session pooler** (`aws-…-<region>.pooler.supabase.com:5432`,
  user `postgres.<project-ref>`). The **transaction pooler (port 6543) is refused**: each write
  needs one session for a multi-statement transaction with an advisory transaction lock.
- **Direct host:** the direct host `db.<ref>.supabase.co` is IPv6-only on the free plan. A warning
  is printed; use it only from hosts with IPv6.
- **TLS:** mandatory, with certificate and hostname verification. Set `DATABASE_CA_CERT` to
  Supabase's CA certificate (Dashboard → Database Settings → SSL Configuration), as PEM text.
- **Plain connections:** `DATABASE_SSL=disable` is accepted only for a localhost database outside
  production.
- **Pool:** `DATABASE_POOL_MAX` (default 5, maximum 20). There is a 15 s statement timeout, and the
  pool closes on shutdown after in-flight requests finish.
- **Secrets:** `DATABASE_URL` and the secrets are never logged or passed to the application. The
  startup log shows only host, port, TLS mode and pool size.

**Supabase free plan notes:**

- A project with no activity for 7 days is paused. Database calls then fail until it is resumed in
  the dashboard.
- There are no downloadable backups or point-in-time recovery: treat this as staging data.
- Deleted rows remain in PostgreSQL's storage until vacuumed.

## Tests

```sh
# unit and integration (KV TTL, owner isolation, OAuth with real tokens, MCP, SSRF, shutdown)
node --import ./deploy/node/register.mjs --experimental-strip-types --test deploy/node/test/*.test.ts
# with PostgreSQL storage tests: a disposable local PostgreSQL 17 (each test file creates and drops its own database)
PG_TEST_URL=postgres://postgres:<password>@127.0.0.1:5432/postgres node --import ./deploy/node/register.mjs --experimental-strip-types --test deploy/node/test/*.test.ts
# the Worker's auth probe, against the Node runtime
(cd deploy/cloudflare-ts && node test/integration/auth-probe.mjs --node)
```

CI (`.github/workflows/rigorx-pipeline.yml`) runs all of these against a disposable PostgreSQL 17
service (the PostgreSQL tests cannot be skipped in CI), the official MCP SDK client against the
Node runtime with a real OAuth token in all three protocol modes, and builds and starts the
container with SQLite and with PostgreSQL storage (migration command, fail-closed start).
