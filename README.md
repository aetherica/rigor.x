# Aetherica × RIGOR-X

**Repository:** `aetherica/rigor.x` · **Canonical branch:** `main` · **Engineering package:** `0.4.0.dev0` (development pre-release; not stable)

RIGOR-X is a deterministic control-plane and live model/tool orchestration framework. It provides pipeline state, typed contracts, registry validation, durable storage and a bounded tool-call runtime. It is **not** a hosted model, provider service, or automatically connected ChatGPT plugin runtime.

## Proprietary licensing status

**RIGOR-X is proprietary, source-available commercial software — NOT Open Source.** Source visibility or repository access does not grant permission to use, copy, modify, redistribute, sublicense, host, or commercially deploy the software.

Commercial deployment, integration into a commercial product or service, hosted provision to third parties, OEM/embedded distribution, and white-label use require contractual authorization under the **RIGOR-X Commercial Subscription License (CSL)** and the applicable executed Order Form and addenda. No fixed public prices are offered; subscription and usage terms are negotiated for the authorized deployment.

Start with:
- [Repository LICENSE notice](LICENSE)
- [Commercial Subscription License](COMMERCIAL-LICENSE.md)
- [Licensing policy, categories and application process](LICENSING.md)
- [Monthly subscription terms](SUBSCRIPTION-TERMS.md)
- [Platform Provider Addendum](PLATFORM-PROVIDER-ADDENDUM.md)
- [OEM / Embedded Addendum](OEM-EMBEDDED-ADDENDUM.md)
- [Licensing Changelog](LICENSING-CHANGELOG.md)

**Commercial enquiries:** contact the rights holder through the official [Aetherica GitHub channel](https://github.com/aetherica) and request the current licensing application route. An enquiry, unsigned proposal, or repository access does not authorize use. Existing executed agreements are governed by their incorporated versions and amendment/renewal provisions; later public revisions do not automatically rewrite them.

RIGOR-X may include or interoperate with third-party software, models, datasets, and services. Those components remain subject to their own applicable licenses and terms. The proprietary notice does not override third-party rights or mandatory legal exceptions. Review component-specific notices and dependency metadata before deployment.

## Implemented components
- 11-stage pipeline state machine with explicit transitions, verification gate and bounded re-entry.
- SQLite persistence with transactional snapshots/events, append-only integrity and optimistic revisions.
- Registry structural validation/resolution; candidate status remains preserved.
- Typed stage-artifact contracts.
- Reasoning guard and adaptive selector; integration/evaluation boundaries are documented.
- Fail-closed command execution framework.
- Live model/tool loop using injected backend and registered host callbacks; capability/approval gates, JSON argument validation, receipts and bounded budgets.
- End-to-end 11-stage AgentPipeline with durable SQLite events/snapshots and fail-closed verification; CLI uses it by default.
- Slash-command catalog integration: **909/999** macro/image entries can be applied as user-level prompt modifiers; **90/999** native/UI/platform entries require actual host adapters. Domain activation is optional and heuristic; historical names remain pending ratification.
- OpenAI-compatible Chat Completions transport over HTTPS (loopback HTTP allowed), standard-library networking and environment credentials.
- Package version CLI.
- Runnable text-agent CLI `rigorx-agent` for a configured OpenAI-compatible endpoint (no tools unless host callbacks are wired).

## Owner requirements (scope, not implementation claims)
18 Functional Groups; six adaptive intensity levels and 12 heuristic analysis modes; nine research acquisition channels; 999 slash-command corpus; separate 102 operational/interface registry; 30 formulas; 33 algorithms; 111 topics; 15 operators; 36 knowledge domains; host/GitHub/cloud memory and Web/Android/iOS architecture.

These inventories do not imply live functionality. Missing source material stays missing. No dummy handlers or fake connections.

## Live runtime
See [WS21 Live Agent Runtime](engineering/ai-system/15-LIVE-AGENT-RUNTIME.md). A real model endpoint and plugin callbacks must be supplied by the integrating host. This repo does not automatically connect to ChatGPT's internal plugin runtime.

## Install and test
```bash
python -m pip install -e '.[test]'
python -m unittest discover -s tests -v
ruff check src tests
python -m build
rigorx-version
rigorx-agent --help
```

Python support: `>=3.13`; CI tests 3.13 and 3.15.

For text-only live execution, configure `RIGORX_MODEL_BASE_URL`, `RIGORX_MODEL_NAME`, optional `RIGORX_API_KEY`, then run `rigorx-agent "your question"`. Plugin tool execution requires an actual host adapter and registered callbacks.

## Governance and security
- Canonical engineering branch is `main`. Do not create project branches for work without explicit owner authorization. One pre-existing Dependabot branch remains: `dependabot/github_actions/actions/setup-python-7`; equivalent workflow updates have been applied to main, and deletion of this old ref is blocked by the available GitHub connector.
- Read [SECURITY.md](SECURITY.md) before reporting vulnerabilities and [CONTRIBUTING.md](CONTRIBUTING.md) before proposing changes.
- Capability states: PLANNED / SPECIFIED / IMPLEMENTED / TESTED / VERIFIED / PARTIAL / BLOCKED / NOT_IMPLEMENTED / NOT_ASSESSED.
- Release tag `v0.4.0` only after exact-head CI, integration acceptance, security and release gates.
- Standards are engineering references, not certification claims.

Progress and receipts: [AI System Engineering Index](engineering/ai-system/00-ENGINEERING-INDEX.md), [Execution Receipts](engineering/ai-system/06-EXECUTION-RECEIPTS.md). See the [Public Release Readiness Checklist](PUBLIC-RELEASE-CHECKLIST.md) for remaining publication gates.
