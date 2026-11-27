# RIGOR-X MCP server on Cloudflare — TypeScript Worker

The plugin server for ChatGPT, Claude and other MCP hosts. It replaced the Python Worker spike (removed in WS32 P0.1; see `engineering/ai-system/24-HOST-PLUGIN-ARCHITECTURE.md` for its history), because the Python Worker cannot run on the Workers Free plan: importing the MCP SDK alone costs ~0.7 s CPU on CPython and ~2 s on the Workers runtime, against a 10 ms per-request limit (Free) and a 1 s startup limit (all plans).

- **One runtime dependency:** Cloudflare's `@cloudflare/workers-oauth-provider` for sign-in. MCP is implemented directly (`src/mcp.ts`) for the Streamable HTTP transport in both eras: handshake (`2025-11-25`, `2025-06-18`, `2025-03-26`, via `initialize`) and stateless `2026-07-28` (per-request `_meta` envelope, `MCP-Protocol-Version`/`Mcp-Method`/`Mcp-Name` headers checked in the reference SDK's order: `-32602` envelope, `-32020` header mismatch, `-32022` unsupported version with `data.supported`; `server/discover` with `ttlMs`/`cacheScope`; server identity in `_meta`). With the official SDK (`mcp 2.3.0`), `mode="auto"` now negotiates `2026-07-28`; `legacy` negotiates `2025-11-25`. Every POST gets one JSON response; there is no session or server-initiated stream.
- **Engine protocol 2 (canonical engine, ADR-012).** Twelve stages, six levels with level-dependent mandatory stages, pre-registered requirements, coverage gate 2.0.0, plan graph, assumptions, stress test, OPTIMIZE loop guard, disclosure at DELIVER: `src/protocol.ts`, `run.ts`, `ledger.ts`, `gate.ts`, `engine.ts`; specification in `engineering/ai-system/28-ENGINE-PROTOCOL-V2.md`. Protocol-1 runs (eleven stages) are read-only. The Python engine in `src/rigorx` is the frozen protocol-1 reference for the local `rigorx-mcp` command.
- **Deterministic tools:** `rigorx_compute` (SI dimensional analysis, CODATA 2022, checks with `expect`, receipts with `run_id`; differential test against pint in CI: `scripts/compute_differential.py`; malformed input is always a controlled error, fuzz-tested) and `rigorx_check_source` (URL/DOI resolution with manual redirects checked at every hop — IPv4/IPv6 special-purpose ranges in every spelling, local names, ports, loops, max 10 hops —, status, final URL, SHA-256 of the first 1 MiB, HTML metadata, `injection_signals`; Crossref metadata and retractions for DOIs; Wayback snapshot for unreachable sources; the owner's quota is reserved before anything is fetched). Live check against real services: `scripts/live_source_check.ts` (not in CI).
- **Source Intelligence Gate (2026-11-26):** `src/sources.ts` and `rigorx_assess_sources` — canonical identity (DOI, arXiv, PubMed, platform posts, archive originals, normalized URLs), twelve discovery layers DL01–DL12 — direct, surface, deep, dark, archive, local, social, alternative, mainstream, independent journalism, conspiracy, blog (never trust levels; per-domain adapter status, honestly `PARTIAL` or `CONTRACT_ONLY` where no provider is integrated), independence groups, lifecycle verdicts and claim-level cross-checks. Gate 2.1.0 uses them (`independent_sources`, `cited_sources_not_retracted`, `fringe_corroborated`).
- **Topic memory (P2):** `rigorx_memory_topic`, `rigorx_memory_write`, `rigorx_memory_recall` (deleting topics happens on the `/account` page) — topic tree with the user's last word, FTS5 trigram + CJK bigram retrieval with coverage scoring and abstention, trust levels, conflicts, real deletion with audit, 120 MB per user. See `engineering/ai-system/29-TOPIC-MEMORY.md`.
- **Conformance is specified, not recorded.** `conformance/v2/*.json` holds scenarios with hand-written expected outcomes (Test A competitor coverage, Test B unit error, unknown-is-not-low-risk, L01); `test/conformance.test.ts` replays them through `dispatch()`.
- **Conformance is tested with the official MCP SDK client.** CI starts `scripts/dev-server.ts` (the same MCP handler over `node:http` with `node:sqlite`) and runs `examples/mcp_smoke.py --url` against it: handshake, tool list, a full run to COMPLETED, wrong token → 401. The dev server is a local test harness with its own local test token; it is never deployed and does not exercise the Worker's OAuth path.
- **Sign-in:** OAuth with Google, GitHub or ChatGPT (each enabled when its client secrets exist) into one Aetherica account — see below. Every `/mcp` request needs an access token issued by this Worker; without one the answer is `401` with a `resource_metadata` pointer. There is no static or shared token (the spike token was removed in WS32 P0.1), so Claude Code signs in with OAuth like every other host.
- **User-facing tool surface and account page (2026-11-27):** 19 tools with plain titles ("Start a structured task", "Check the work", …); tool names are unchanged. Account management is not a tool: at `/account` the user signs in with Google (15-minute session, HttpOnly cookie scoped to `/account`, CSRF token on every form) to see usage and delete a task, a topic with its notes, or all data (typed confirmation). The internal humor helper (`src/humor.ts`) is no longer exposed over MCP.
- **Run management and limits (WS32 P0.3/P0.5/P0.8):** `rigorx_list_runs` (newest first, cursor pages); usage (today's calls, new runs, stored runs, storage bytes) is shown on the `/account` page; per-owner daily quotas and a per-minute burst limit, metered on calls that change state or fetch from the internet (reads and deletes are never refused by the daily quota but count against the burst limit; a refused call returns `QUOTA_EXCEEDED` with the reset time). Each operation runs in one storage transaction. MCP requests over 1 MiB (HTTP 413), JSON nested deeper than 32 levels and non-scalar IDs are refused before dispatch. Limits are **provisional** Worker `vars` in `wrangler.jsonc` (calls/day 2000, new runs/day 100, stored runs 500, burst 120/min) until the owner fixes them with the move to Workers Paid. Measured on workerd: `start_run` writes 5 rows, other state-changing calls 3, `get_run` 0, `delete_run` 1. `rigorx_profile` returns a random per-owner ID stored in the owner's Durable Object (not derivable from the Google account). Run views return the 10 most recent actions plus `actions_total` and `actions_unresolved`.
- **Storage schema** is versioned (`MIGRATIONS` in `src/store.ts`, now version 3); existing version-1 databases are upgraded in place on first access.
- **Resilience and release (2026-11-27):** `src/resilience.ts` holds one validated policy (bounds and defaults in `POLICY_BOUNDS`, overridable by `RIGORX_*` Worker vars; invalid values are rejected and counted in `/version`): bounded retries with full jitter and `Retry-After` for idempotent outbound reads only, one deadline per source check, per-adapter circuit breakers (5 consecutive failures or 50 % of ≥ 10 calls in 60 s open for 30 s; 2 half-open probes), at most 4 concurrent acquisitions per isolate with a queue of 16. Every hop's host name is resolved over DNS-over-HTTPS and refused if any answer is non-public (fail closed if DNS cannot be checked); the connection itself cannot be bound to the checked address (Workers resolve again), and the Cloudflare edge does not route to private networks. State-changing tools accept `idempotency_key`. `rigorx_request_approval` lets the user approve one operation on `/approve/<id>` after a Google sign-in (nonce, single-use state, CSRF, 10-minute session); A5 operations need it. `rigorx_delete_account_data`, `RIGORX_SUSPENDED_OWNERS` (SHA-256 prefixes of owner IDs), `RIGORX_FETCHES_PER_DAY`. `/version` (version ID and tag = commit SHA prefix, set by `scripts/deploy.mjs`) and `/health`; structured logs `rigorx_request`, `rigorx_op`, `rigorx_security`, `rigorx_circuit`, `rigorx_error` with request IDs (`x-rigorx-request-id`). New tables (`idempotency_keys`, `usage_extra`, `approval_requests`) are outside the versioned schema, which stays at 3, so the previous release still opens every database (`scripts/rollback_compat.ts`). Mutation test: `scripts/mutation_test.py`.
- **Icons (2026-11-26):** `public/` holds the circular transparent Aetherica icons (`icon-32.png` … `icon-448.png`, `favicon.ico`), built by `assets/brand/tools/make_circular_icon.py`. They are Workers static assets (served without running the Worker; every other path is `run_worker_first`), advertised in MCP `serverInfo.icons` and shown on the sign-in pages.
- **Integration tests on workerd:** `node test/integration/run.mjs` starts a harness Worker (`test/integration/wrangler.jsonc`, never deployed) under `wrangler dev` and checks migration, quotas, listing, profile IDs and rows written against real Durable Object SQLite.

Local CPU measurement (Node 22, `scripts/bench.ts`, median of three runs, 2026-11-26): `tools/list` 0.004 ms, `rigorx_route` 0.05 ms, `rigorx_start_run` 0.21 ms, `rigorx_get_run` 0.03 ms, `record_evidence` 0.26 ms (2.4 ms at 400 evidence records), `memory_recall` over 2,000 items 26 ms (p95 91 ms). Workers-runtime CPU is visible only in the Cloudflare dashboard.

## Run the tests (Node 22.6+ or 24; nothing to install)

```bash
cd deploy/cloudflare-ts
npm test
```

Conformance against the official SDK client (from the repository root, with `pip install -e '.[mcp]'`):

```bash
node --experimental-strip-types deploy/cloudflare-ts/scripts/dev-server.ts 8787 dev-token &
python examples/mcp_smoke.py --url http://127.0.0.1:8787/mcp --token dev-token
```

## Public address: x.aetherica.workers.dev (2026-11-27)

The service is reached at `https://x.aetherica.workers.dev` through the front-door Worker `x` (`deploy/x-front/`), which hands every request to this Worker over a service binding with the URL unchanged. OAuth metadata, sign-in callbacks and the connector address therefore use that origin; storage (Durable Objects, KV, D1) stays here. The Worker keeps its internal name `rigorx-mcp` (renaming a Worker that owns Durable Objects would risk the stored data), and `https://rigorx-mcp.aetherica.workers.dev` keeps serving existing connectors. `/` serves the Aetherica landing page formerly served by `x` (`src/landing.ts`).

## Aetherica account: Google, GitHub and ChatGPT sign-in (2026-11-27)

`src/providers.ts` holds the three sign-in providers in one shape; `src/accounts.ts` is the account registry in Cloudflare D1 (binding `ACCOUNTS_DB`, database `aetherica-accounts`, APAC; schema `migrations/accounts/0001_accounts.sql`, already applied). The registry stores only provider, the provider's stable subject (Google/OpenAI `sub`, GitHub numeric user ID), the account's owner key and timestamps (≈ 250 bytes per account, about 250 MB for a million accounts, inside D1's 10 GB per database). Work and memory stay in the owner's Durable Object.

- The owner key is the identity that created the account (`google:<sub>`, `github:<id>`, `openai:<sub>`), so existing Google accounts keep their storage without migration.
- `/authorize` shows one button per enabled provider; `/account` and `/approve/<id>` show a choice of sign-in methods (`?with=<provider>`). On `/account` the user adds or removes sign-in methods (at most one per kind, never the last one). An identity belongs to one account only; accounts are not merged. Deleting all data also deletes the account and its sign-in methods.
- Provider requests: PKCE S256 and single-use state for all; `openid` scope with nonce and ID-token checks (issuer, audience, `azp`, expiry, nonce) for Google and OpenAI (OpenAI uses `client_secret_basic` at `https://auth.openai.com/api/accounts/oauth/token`); GitHub with no scope, numeric `id` from `https://api.github.com/user`. No e-mail address or name is requested or stored.
- Setup (owner): GitHub → Settings → Developer settings → OAuth Apps → New OAuth App, callback `https://x.aetherica.workers.dev/oauth/github/callback`, then Worker secrets `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`. ChatGPT: a client ID from OpenAI ("Sign in with ChatGPT"; hosted apps are admitted through OpenAI's interest form), redirect URI `https://x.aetherica.workers.dev/oauth/openai/callback`, then `OPENAI_CLIENT_ID` / `OPENAI_CLIENT_SECRET`. A provider without both secrets is not shown.
- Explicit consent: a new account (or one without the current `TERMS_VERSION`) is created or continued only after the user ticks "I have read and accept the Terms of Service and the Privacy Policy" on `/signup` (identity held 15 min in KV under a token in an HttpOnly cookie and the form). The accepted version and time are stored (`migrations/accounts/0002_terms.sql`, applied by hand; do not run `wrangler d1 migrations apply` on this database). The account page shows each sign-in method's last sign-in.
- The `unlimited` column is reserved for operator-set limit exemptions; it is not wired to quotas yet.

## Sign-in with Google (OAuth, phase P4)

The Worker is its own OAuth authorization server (`src/auth.ts`, on `@cloudflare/workers-oauth-provider`): protected resource and authorization server metadata, PKCE S256, Client ID Metadata Documents, dynamic client registration at `/register`, tokens at `/token` bound to `https://<worker>/mcp`. `/authorize` shows a consent page (client name, verified domain for CIMD clients, redirect host, loopback warning), then sends the user to Google. The owner is `google:<sub>`, never the e-mail address. Clients, grants and tokens live in the KV namespace `OAUTH_KV` (`rigorx-mcp-oauth`), stored hashed or encrypted.

Setup (once):

1. Google Cloud Console → Google Auth Platform: External; app name RIGOR-X. Only the `openid` scope is requested (no e-mail), so publishing needs no verification. Any Google account can sign in; each account's runs are separate.
2. **Credentials → Create credentials → OAuth client ID → Web application.** Authorized redirect URI: `https://rigorx-mcp.<subdomain>.workers.dev/oauth/google/callback`.
3. Worker → Settings → Runtime variables and secrets (Production) → add secrets `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, then **Deploy**.

Add to a host with the URL `https://rigorx-mcp.<subdomain>.workers.dev/mcp` and no token: Claude (Settings → Connectors → Add custom connector) and ChatGPT (developer mode, authentication OAuth) discover sign-in from the `401`.

Verified locally under `wrangler dev`: metadata documents, `401` challenges, a static bearer token is rejected (WS32 P0.1), dynamic registration, consent page (escaping, no framing, browser-bound single-use handle), Deny and Google-error redirects with `state` and `iss`, redirect to Google with PKCE. Not verifiable locally: the Google token exchange and the end-to-end sign-in from Claude and ChatGPT.

## Deploy with Cloudflare Workers Builds

In the Cloudflare dashboard: **Workers & Pages → rigorx-mcp → Settings → Build**, change:

| Setting | Value |
|---|---|
| Root directory (Path) | `deploy/cloudflare-ts` |
| Build command | `npm run typecheck && npm test` |
| Deploy command | `npm run deploy` (provenance-guarded) |

Push to `main`. Cloudflare Workers Builds is the single production deploy path: it runs strict type-checking and tests, then `scripts/deploy.mjs` blocks deployment unless the checkout is clean, on `main`, and tagged with the exact full commit SHA. Production previews remain disabled. The Worker name, Durable Object binding and migration tag are unchanged, so existing runs stay in place.

Check: `https://rigorx-mcp.<subdomain>.workers.dev/` returns the banner; `POST /mcp` without a token returns `401` with `WWW-Authenticate: Bearer … resource_metadata=…`; a signed-in host (for example the Claude connector) can call `rigorx_profile` and run `rigorx_start_run` → `rigorx_delete_run`.

After WS32 P0.1 is deployed, delete the leftover Worker secrets `RIGORX_SPIKE_TOKEN` and `ALLOWED_EMAILS` (Settings → Variables and Secrets); the code no longer reads either.

### If the Workers Build fails with `root directory not found` or `can't cd to deploy/cloudflare-ts`

The build is running on a commit older than the TypeScript Worker (`deploy/cloudflare-ts` first appears in `0fdec7e`). **Retry** rebuilds the same old commit with the new settings, so it keeps failing. Check **Settings → Build → Build watch paths** (include `*`), then start a build from a new commit on `main` instead of retrying. Prefixing the deploy command with `git log -1 --oneline &&` prints the commit being built.
