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
| One Durable Object per owner            | One SQLite file per owner (`DATA_DIR/owners/<sha256>.sqlite`) | `owners.ts` |
| `ctx.storage.transactionSync`           | SQLite savepoint per operation (rolled back on error) | `sqlite.ts`  |
| KV namespace `OAUTH_KV`                 | SQLite KV with TTL (`DATA_DIR/oauth-kv.sqlite`) | `kv.ts`          |
| Static assets (`public/`)               | Icons and favicon served by the HTTP layer    | `server.ts`        |
| `global_fetch_strictly_public`          | Address check at connection time (all resolved addresses must be public) | `guarded-fetch.ts` |
| Version metadata                        | `RIGORX_VERSION_TAG`, `RENDER_GIT_COMMIT` or `RAILWAY_GIT_COMMIT_SHA` | `config.ts` |
| `cloudflare:workers` module             | Shim with `WorkerEntrypoint` (the OAuth library uses it only for `instanceof` checks) | `cloudflare-workers-shim.mjs`, `register.mjs` |

The application itself (`deploy/cloudflare-ts/src/app.ts`) takes a small `Platform` interface
(`callOwner`, `version`, `fetcher`); `src/index.ts` binds it to Cloudflare and `server.ts` to Node.

## Run

Requirements: Node 22.18+ (24 recommended), the Worker's dependencies installed
(`cd deploy/cloudflare-ts && npm ci --omit=dev`).

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

- **Ephemeral hosting** (for example Render's free web services, which have no persistent disk,
  sleep after 15 minutes idle and lose files on restart): every restart deletes all accounts'
  runs, topic memory, registered OAuth clients and tokens. Users must sign in again and earlier
  runs are gone. Use such hosts for disposable staging only.
- **One process**: storage is per-process SQLite. Do not run several replicas on the same data
  (no cross-process locking of an owner's engine); scale vertically or use Cloudflare.
- **Client ID Metadata Documents** are disabled by the OAuth library outside Cloudflare (it enables
  them only when the runtime guarantees public-only fetches). Clients that support dynamic client
  registration (Claude, ChatGPT, the MCP SDK) are unaffected.
- **KV consistency** differs in the safe direction: writes are immediately visible (Workers KV is
  eventually consistent).
- **Cold starts** on sleeping hosts add seconds to the first request; MCP clients may time out once.

## Tests

```sh
# unit and integration (KV TTL, owner isolation, OAuth with real tokens, MCP, SSRF, shutdown)
node --import ./deploy/node/register.mjs --experimental-strip-types --test deploy/node/test/*.test.ts
# the Worker's auth probe, against the Node runtime
(cd deploy/cloudflare-ts && node test/integration/auth-probe.mjs --node)
```

CI (`.github/workflows/rigorx-pipeline.yml`) also runs the official MCP SDK client against the Node
runtime with a real OAuth token in all three protocol modes, and builds and starts the container.
