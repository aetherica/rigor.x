# Aetherica × RIGOR-X

**Repository:** `aetherica/rigor.x` · **Canonical branch:** `main` only · **Engineering package:** `0.4.0.dev0` (not a final release)

RIGOR-X is a deterministic control-plane and live model/tool orchestration framework. It provides pipeline state, typed contracts, registry validation, durable storage and a bounded tool-call runtime. It is **not** a hosted model, provider service, or automatically connected ChatGPT plugin runtime.

## Implemented components
- 11-stage pipeline state machine with explicit transitions, verification gate and bounded re-entry.
- SQLite persistence with transactional snapshots/events, append-only integrity and optimistic revisions.
- Registry structural validation/resolution; candidate status remains preserved.
- Typed stage-artifact contracts.
- Reasoning guard and adaptive selector; integration/evaluation boundaries are documented.
- Fail-closed command execution framework.
- Live model/tool loop using injected backend and registered host callbacks; capability/approval gates, JSON argument validation, receipts and bounded budgets.
- Slash-command catalog integration: macro modifiers functional; native/UI/image entries remain host integration dependent.
- OpenAI-compatible Chat Completions transport over HTTPS (loopback HTTP allowed), standard-library networking and environment credentials.
- Package version CLI.
- Runnable text-agent CLI `rigorx-agent` for a configured OpenAI-compatible endpoint (no tools unless host callbacks are wired).

## Owner requirements (scope, not implementation claims)
18 Functional Groups; six adaptive intensity levels; nine research acquisition channels; 999 slash-command corpus; separate 102 operational/interface registry; 30 formulas; 33 algorithms; 111 topics; 15 operators; 36 knowledge domains; host/GitHub/cloud memory and Web/Android/iOS architecture.

These inventories do not imply live functionality. Missing source material stays missing. No dummy handlers or fake connections.

## Live runtime
See [WS21 Live Agent Runtime](engineering/ai-system/15-LIVE-AGENT-RUNTIME.md). A real model endpoint and plugin callbacks must be supplied by the integrating host. This repo does not automatically connect to ChatGPT's internal plugin runtime.

## Install and test
```bash
python -m pip install -e '.[test]'
python -m unittest discover -s tests -v
ruff check src tests
rigorx-version
rigorx-agent --help
```
Python support: `>=3.13`; CI tests 3.13 and 3.15.

For text-only live execution, configure `RIGORX_MODEL_BASE_URL`, `RIGORX_MODEL_NAME`, optional `RIGORX_API_KEY`, then run `rigorx-agent "your question"`. Plugin tool execution requires an actual host adapter and registered callbacks.

## Governance
- Only canonical branch `main`; no feature branches.
- No fake providers, dummy handlers or placeholder code presented as functional.
- Capability states: PLANNED / SPECIFIED / IMPLEMENTED / TESTED / VERIFIED / PARTIAL / BLOCKED / NOT_IMPLEMENTED / NOT_ASSESSED.
- Release tag `v0.4.0` only after exact-head CI, integration acceptance, security and release gates.
- Standards are engineering references, not certification claims.

Progress and receipts: [AI System Engineering Index](engineering/ai-system/00-ENGINEERING-INDEX.md), [Execution Receipts](engineering/ai-system/06-EXECUTION-RECEIPTS.md). Historical v0.3.9 issues are being corrected against available evidence; inaccessible historical artifacts cannot be independently audited.
