# Changelog

This project is in pre-release development. Entries summarize notable changes; they are not a guarantee of stable API compatibility.

## Unreleased — 0.4.0.dev0

### Added
- Aetherica account: sign-in with Google, GitHub or ChatGPT into one account (registry in Cloudflare D1 storing only provider subjects and timestamps), sign-in methods managed on `/account`, provider choice on the consent, account and approval pages.
- Deterministic 11-stage pipeline controller, typed artifacts, verification gates, bounded re-entry and durable SQLite event/snapshot storage.
- Registry validation/resolution, adaptive reasoning controls, transparent adaptive intensity and analysis-mode profiles.
- Fail-closed command runtime and bounded live model/tool loop with injected backend and host callbacks.
- OpenAI-compatible HTTPS transport, CLI entry points, slash-command catalogue integration, and optional heuristic domain routing.
- Crosswalk validator for the canonical 18 Functional Groups and candidate command-library categories.
- CI matrix for Python 3.13/3.15, lint, tests, source/wheel build and installed-wheel smoke checks.
- Apache License 2.0 adoption for the RIGOR-X core repository, with NOTICE, trademark policy, open-source contribution terms, and optional service monetization boundaries.

### Changed
- Release maturity and capability claims distinguish implemented, tested, verified, partial, planned and host-integration-dependent functionality.
- CI workflows pin checkout/setup actions by immutable commit SHA and use read-only repository permissions.
- Root README, contributor guidance, and repository licensing policy consistently identify RIGOR-X as Apache-2.0 open-source software; paid services are optional and do not restrict open-source rights.
- Removed the superseded proprietary subscription license and deployment addenda from the active repository document set.

### Added (WS32, Cloudflare Worker — the canonical engine)
- Engine protocol 2: twelve distinct stages, six levels with level-dependent mandatory stages, pre-registered requirements, coverage gate 2.0.0, plan graph, assumptions, stress test, OPTIMIZE loop guard, disclosures at DELIVER, value statuses, autonomy tiers.
- Tools: `rigorx_list_runs`, `rigorx_usage`, `rigorx_compute` (SI dimensional analysis), `rigorx_check_source`, topic memory (`rigorx_memory_topic`, `_write`, `_recall`, `_delete`), `rigorx_humor_policy`; `rigorx_resolve_commands` now works on the Worker.
- MCP 2026-07-28 (stateless) alongside the handshake era; per-owner quotas; schema migrations; random per-owner profile IDs.
- CI: real Worker auth path and Durable Object storage under `wrangler dev`, type check, conformance suite, memory benchmarks, compute differential test against pint, slash catalogue sync.

### Security and integrity (2026-11-26 engineering audit)
- Source checks follow redirects manually and check every hop (IPv4/IPv6 special-purpose ranges in every spelling, local names, ports, loops, at most 10 hops); the quota is reserved before any external fetch.
- Gate 2.1.0: claims linked by requirement IDs or shared evidence; numeric claims bound to a computation that checked their own value; single-use, expiring approvals bound to one operation; dependency integrity; canonical source independence; retraction and fringe-corroboration checks.
- Topic memory: atomic operations (storage transactions), merge preflight, move-collision check, whole-word short-token recall, scoped supersession, run_validated bound to a validated claim by SHA-256.
- Router risk floor for explicit low levels and a multilingual risk lexicon; compute exponents validated (no runtime exceptions); MCP request limits (1 MiB, depth 32, string/integer IDs).

### Node runtime: account registry and clearer storage errors (2026-11-27)
- The shared account registry (sign-in methods linked into one account, terms accepted once per version) now runs on the Node runtime: SQLite (the D1 migration files) or PostgreSQL (migration 2: `rigorx_private.accounts`/`identities`, same RLS and privilege rules).
- Configuration and connection errors name the fix: password placeholder, copied `…`/curly quotes, `DATABASE_URL=` prefix or quotes, unencoded password, transaction pooler port; IPv6-only direct host, unknown host, wrong pooler cluster or user, wrong password, TLS CA, refused connection, paused project. Warnings are logged before connecting.
- Version-conflict retries wait a short random time (no lockstep collisions or starvation under load).
- Rollout: apply migration 2 to the database before deploying this release (the server refuses a schema without it; a running server is unaffected).

### PostgreSQL storage for the Node runtime (2026-11-27)
- `STORAGE=postgres` (for example Supabase): each owner's engine database stored as one snapshot row, written with compare-and-swap under a per-owner advisory lock; bounded retries on version conflicts; deletion tombstones (generation) so a stale operation cannot recreate a deleted account; account deletion, tombstone and OAuth grant/token removal in one transaction; HMAC-keyed owner rows with secret rotation; SHA-256, integrity and schema checks before a snapshot is used; snapshot size limit. OAuth KV in PostgreSQL with Workers KV TTL semantics (one conformance suite for both KV stores). Private schema with RLS and no API-role privileges; explicit, locked migration command; fail-closed startup on a missing or incompatible schema. Session pooler only (port 6543 refused), mandatory TLS with certificate and hostname verification. Cloudflare production code unchanged.
- Node runtime test: the landing page at `/` (the pipeline was red on main since 4fe5204).

### Portable Node runtime (2026-11-26)
- `deploy/node`: the same application (MCP, OAuth, approvals, quotas, engine) on `node:http` for staging or backup hosting: one SQLite file per owner (the Durable Object boundary), a SQLite KV with Workers KV TTL semantics for OAuth, a connection-time SSRF address check, startup validation, graceful shutdown, Dockerfile and `.env.example`. `src/app.ts` holds the platform-neutral application; `src/index.ts` binds it to Cloudflare (production unchanged). CI runs the Worker's auth probe and the official MCP SDK client against the Node runtime with real OAuth tokens and builds the container.

### Aetherica sign-in (2026-11-26)
- Sign-in, approval, privacy, terms and home pages carry the Aetherica brand in one card design (light/dark, phone-first): "Allow <app> to use Aetherica?", Cancel/Continue, a one-line Terms/Privacy notice; the redirect host stays visible. Pages send CSP, `frame-ancestors none` and X-Frame-Options DENY. MCP serverInfo title is "Aetherica"; tool names keep the `rigorx_` prefix.

### Release hardening (2026-11-26)
- Resilience policy (retries, deadlines, circuit breakers, bulkhead), DNS-verified source fetches, idempotency keys, engine-verified user approvals (`rigorx_request_approval`), account data deletion, suspension, source-check quota, OIDC azp/iat/nonce, `/version` and `/health`, structured logs, commit-tagged deploys, discovery gap register; rollback-compatible storage; mutation test in CI.
- Router: a destructive action with no risk vocabulary ("/l01 delete production database") was routable at L01; it now has an L05 floor (L03 for one broad term such as "format"), found by post-deploy verification.

### Changed (2026-11-27 user-facing surface)
- MCP tools reduced from 24 to 19, with plain titles ("Start a structured task", "Check the work", "Remember a note", …); tool names are unchanged. Removed from MCP: `rigorx_usage`, `rigorx_delete_run`, `rigorx_memory_delete`, `rigorx_delete_account_data` (now on the account page) and `rigorx_humor_policy` (internal helper). `rigorx_memory_topic` no longer deletes topics and is no longer marked destructive.
- New `/account` page: the user signs in with Google (15-minute session, HttpOnly cookie scoped to `/account`, CSRF token on every form) to see today's usage and delete a task, a topic with its notes, or all data (typed confirmation). Privacy policy and the plugin skill point there.

### Added (2026-11-26 audit, scope C)
- Owner-authored command set `library/rigorx-commands/` (48 candidate entries `RXC-001`…`RXC-048`: 42 MACRO task modifiers, 6 UI/MENU host commands) with its own validator in CI. It stays separate from the fixed 999-entry research corpus and may not repeat any corpus name or alias. The Worker bundle now holds both (1,047 entries, corpus first); the frozen Python resolver reads the corpus only.

### Fixed (2026-11-26 audit, scope A)
- README: the Worker is described as the canonical protocol-2 engine with 24 tools and one runtime dependency; the retired Python parity claim and "same tools" wording were removed, and the Python engine is labelled as the frozen protocol-1 reference (ADR-012).

### Fixed (2026-11-26 connector test)
- `data.level` at CLASSIFY and ASSESS_COMPLEXITY accepts the short codes `L01`–`L06` (any case) and normalizes them to the full level name; the stage guidance lists the full names.
- Finished runs return host-disclosed DELIVER limitations in `disclosed_limitations` (count, SHA-256 digests and lengths; the text is still not stored), next to the engine's own `limitations`.

### Added (2026-11-26 engineering audit)
- Source Intelligence Gate (`src/sources.ts`, tool `rigorx_assess_sources`): canonical identity, nine source domains, independence groups, lifecycle verdicts, claim-level cross-checks; Crossref (metadata, retractions) and Wayback lookups in `rigorx_check_source`; HTML metadata and injection signals.
- Circular transparent Aetherica icons (static assets, MCP `serverInfo.icons`, sign-in pages).
- Regression tests for every finding (`test/audit.test.ts`, `test/sources.test.ts`), workerd transaction probe, Chromium render check, CPU benchmark (`scripts/bench.ts`), live source check (`scripts/live_source_check.ts`).

### Changed (WS32)
- Text policy accepts Chinese, Japanese and Thai text; dense scripts count two units for minimum length.
- Tasks without a router signal are UNKNOWN and need a declared level and stakes.
- The Python engine is the frozen protocol-1 reference (ADR-012); Python/TypeScript parity is replaced by the conformance suite.

### Removed
- Static shared-token ("spike token") access to the Cloudflare MCP server: OAuth sign-in is the only credential for `/mcp` (WS32 P0.1).
- The Python Cloudflare Worker spike (`deploy/cloudflare`), superseded by the TypeScript Worker and sharing its Worker name.

### Known limitations
- No stable release/tag yet; package version remains `0.4.0.dev0`.
- External model/provider and host-plugin integrations require an integrating host and have not been acceptance-tested end-to-end in this repository.
- No claim of production autonomous-agent readiness, certification, or implementation of every catalogued command.
- Full-history rights/provenance audit and third-party license compatibility review remain separate release gates.
