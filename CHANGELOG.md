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

### Changed
- Release maturity and capability claims distinguish implemented, tested, verified, partial, planned and host-integration-dependent functionality.
- CI workflows now pin checkout/setup actions by immutable commit SHA, use read-only repository permissions, deterministic validation dependencies and concurrency cancellation.
- Pipeline CI path filters include workflow and release-governance files so engineering changes trigger validation.

### Known limitations
- No stable release/tag yet; package version remains `0.4.0.dev0`.
- External model/provider and host-plugin integrations require an integrating host and have not been acceptance-tested end-to-end in this repository.
- No claim of production autonomous-agent readiness, certification, or implementation of every catalogued command.
- License selection remains pending owner decision.
