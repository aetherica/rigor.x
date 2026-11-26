# Changelog

This project is in pre-release development. Entries summarize notable changes; they are not a guarantee of stable API compatibility.

## Unreleased — 0.4.0.dev0

### Added
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

### Release hardening (2026-11-27)
- Resilience policy (retries, deadlines, circuit breakers, bulkhead), DNS-verified source fetches, idempotency keys, engine-verified user approvals (`rigorx_request_approval`), account data deletion, suspension, source-check quota, OIDC azp/iat/nonce, `/version` and `/health`, structured logs, commit-tagged deploys, discovery gap register; rollback-compatible storage; mutation test in CI.

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
