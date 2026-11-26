# RIGOR-X MCP server on Cloudflare — TypeScript Worker

The plugin server for ChatGPT, Claude and other MCP hosts. It replaced the Python Worker spike (removed in WS32 P0.1; see `engineering/ai-system/24-HOST-PLUGIN-ARCHITECTURE.md` for its history), because the Python Worker cannot run on the Workers Free plan: importing the MCP SDK alone costs ~0.7 s CPU on CPython and ~2 s on the Workers runtime, against a 10 ms per-request limit (Free) and a 1 s startup limit (all plans).

- **One runtime dependency:** Cloudflare's `@cloudflare/workers-oauth-provider` for sign-in. MCP is implemented directly (`src/mcp.ts`) for the Streamable HTTP transport in both eras: handshake (`2025-11-25`, `2025-06-18`, `2025-03-26`, via `initialize`) and stateless `2026-07-28` (per-request `_meta` envelope, `MCP-Protocol-Version`/`Mcp-Method`/`Mcp-Name` headers checked in the reference SDK's order: `-32602` envelope, `-32020` header mismatch, `-32022` unsupported version with `data.supported`; `server/discover` with `ttlMs`/`cacheScope`; server identity in `_meta`). With the official SDK (`mcp 2.3.0`), `mode="auto"` now negotiates `2026-07-28`; `legacy` negotiates `2025-11-25`. Every POST gets one JSON response; there is no session or server-initiated stream.
- **Engine protocol 2 (canonical engine, ADR-012).** Twelve stages, six levels with level-dependent mandatory stages, pre-registered requirements, coverage gate 2.0.0, plan graph, assumptions, stress test, OPTIMIZE loop guard, disclosure at DELIVER: `src/protocol.ts`, `run.ts`, `ledger.ts`, `gate.ts`, `engine.ts`; specification in `engineering/ai-system/28-ENGINE-PROTOCOL-V2.md`. Protocol-1 runs (eleven stages) are read-only. The Python engine in `src/rigorx` is the frozen protocol-1 reference for the local `rigorx-mcp` command.
- **Deterministic tools:** `rigorx_compute` (SI dimensional analysis, CODATA 2022, checks with `expect`, receipts with `run_id`; differential test against pint in CI: `scripts/compute_differential.py`; malformed input is always a controlled error, fuzz-tested) and `rigorx_check_source` (URL/DOI resolution with manual redirects checked at every hop — IPv4/IPv6 special-purpose ranges in every spelling, local names, ports, loops, max 10 hops —, status, final URL, SHA-256 of the first 1 MiB, HTML metadata, `injection_signals`; Crossref metadata and retractions for DOIs; Wayback snapshot for unreachable sources; the owner's quota is reserved before anything is fetched). Live check against real services: `scripts/live_source_check.ts` (not in CI).
- **Source Intelligence Gate (2026-11-26):** `src/sources.ts` and `rigorx_assess_sources` — canonical identity (DOI, arXiv, PubMed, platform posts, archive originals, normalized URLs), nine source domains D01–D09 (discovery domains, never trust levels; per-domain adapter status, honestly `PARTIAL` or `CONTRACT_ONLY` where no provider is integrated), independence groups, lifecycle verdicts and claim-level cross-checks. Gate 2.1.0 uses them (`independent_sources`, `cited_sources_not_retracted`, `fringe_corroborated`). See `engineering/ai-system/32-ENGINEERING-AUDIT-2026-11-26.md`.
- **Topic memory (P2):** `rigorx_memory_topic`, `rigorx_memory_write`, `rigorx_memory_recall`, `rigorx_memory_delete` — topic tree with the user's last word, FTS5 trigram + CJK bigram retrieval with coverage scoring and abstention, trust levels, conflicts, real deletion with audit, 120 MB per user. See `engineering/ai-system/29-TOPIC-MEMORY.md`.
- **Conformance is specified, not recorded.** `conformance/v2/*.json` holds scenarios with hand-written expected outcomes (Test A competitor coverage, Test B unit error, unknown-is-not-low-risk, L01); `test/conformance.test.ts` replays them through `dispatch()`.
- **Conformance is tested with the official MCP SDK client.** CI starts `scripts/dev-server.ts` (the same MCP handler over `node:http` with `node:sqlite`) and runs `examples/mcp_smoke.py --url` against it: handshake, tool list, a full run to COMPLETED, wrong token → 401. The dev server is a local test harness with its own local test token; it is never deployed and does not exercise the Worker's OAuth path.
- **Sign-in:** OAuth with Google only — see below. Every `/mcp` request needs an access token issued by this Worker; without one the answer is `401` with a `resource_metadata` pointer. There is no static or shared token (the spike token was removed in WS32 P0.1), so Claude Code signs in with OAuth like every other host.
- **Run management and limits (WS32 P0.3/P0.5/P0.8):** `rigorx_list_runs` (newest first, cursor pages), `rigorx_usage` (today's calls, new runs, stored runs, storage bytes), per-owner daily quotas and a per-minute burst limit, metered on calls that change state or fetch from the internet (reads and deletes are never refused by the daily quota but count against the burst limit; a refused call returns `QUOTA_EXCEEDED` with the reset time). Each operation runs in one storage transaction. MCP requests over 1 MiB (HTTP 413), JSON nested deeper than 32 levels and non-scalar IDs are refused before dispatch. Limits are **provisional** Worker `vars` in `wrangler.jsonc` (calls/day 2000, new runs/day 100, stored runs 500, burst 120/min) until the owner fixes them with the move to Workers Paid. Measured on workerd: `start_run` writes 5 rows, other state-changing calls 3, `get_run` 0, `delete_run` 1. `rigorx_profile` returns a random per-owner ID stored in the owner's Durable Object (not derivable from the Google account). Run views return the 10 most recent actions plus `actions_total` and `actions_unresolved`.
- **Storage schema** is versioned (`MIGRATIONS` in `src/store.ts`, now version 3); existing version-1 databases are upgraded in place on first access.
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
| Build command | `npm test` |
| Deploy command | `npm run deploy` |

Push to `main` (a Retry rebuilds the same commit; see below). The Worker name, Durable Object binding and migration tag are unchanged, so existing runs stay in place.

Check: `https://rigorx-mcp.<subdomain>.workers.dev/` returns the banner; `POST /mcp` without a token returns `401` with `WWW-Authenticate: Bearer … resource_metadata=…`; a signed-in host (for example the Claude connector) can call `rigorx_profile` and run `rigorx_start_run` → `rigorx_delete_run`.

After WS32 P0.1 is deployed, delete the leftover Worker secrets `RIGORX_SPIKE_TOKEN` and `ALLOWED_EMAILS` (Settings → Variables and Secrets); the code no longer reads either.

### If the Workers Build fails with `root directory not found` or `can't cd to deploy/cloudflare-ts`

The build is running on a commit older than the TypeScript Worker (`deploy/cloudflare-ts` first appears in `0fdec7e`). **Retry** rebuilds the same old commit with the new settings, so it keeps failing. Check **Settings → Build → Build watch paths** (include `*`), then start a build from a new commit on `main` instead of retrying. Prefixing the deploy command with `git log -1 --oneline &&` prints the commit being built.
