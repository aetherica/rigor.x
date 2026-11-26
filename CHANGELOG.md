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

### Removed
- Static shared-token ("spike token") access to the Cloudflare MCP server: OAuth sign-in is the only credential for `/mcp` (WS32 P0.1).
- The Python Cloudflare Worker spike (`deploy/cloudflare`), superseded by the TypeScript Worker and sharing its Worker name.

### Known limitations
- No stable release/tag yet; package version remains `0.4.0.dev0`.
- External model/provider and host-plugin integrations require an integrating host and have not been acceptance-tested end-to-end in this repository.
- No claim of production autonomous-agent readiness, certification, or implementation of every catalogued command.
- Full-history rights/provenance audit and third-party license compatibility review remain separate release gates.
