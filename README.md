# Aetherica × RIGOR-X

**Repository:** `aetherica/rigor.x` · **Canonical branch:** `main` · **Engineering package:** `0.4.0.dev0` (development pre-release; not stable)

RIGOR-X is a deterministic control-plane and live model/tool orchestration framework. It provides pipeline state, typed contracts, registry validation, durable storage and a bounded tool-call runtime. It is **not** a hosted model, provider service, or automatically connected ChatGPT plugin runtime.

## Open-source licensing

**RIGOR-X is licensed under the Apache License, Version 2.0 (SPDX: `Apache-2.0`).** You may use, modify, distribute, sublicense, and commercially exploit the licensed Work without paying Aetherica a software license fee, provided you comply with the license conditions. There is no paid core edition, license key, or mandatory subscription.

Start with:
- [Apache License 2.0](LICENSE)
- [Licensing policy](LICENSING.md)
- [NOTICE](NOTICE)
- [Trademark policy](TRADEMARKS.md)
- [Contribution guidelines](CONTRIBUTING.md)

Third-party software, models, datasets, and services retain their own licenses and terms. Review component-specific notices and dependency metadata before deployment. The Apache license does not grant rights to use Aetherica or RIGOR.X marks as a brand or endorsement.

Aetherica may offer optional paid managed hosting, API capacity, compute, enterprise deployment, integration, support, SLA, training, and consulting. These services are separate from the open-source license; users may self-host or obtain equivalent services elsewhere. Other providers may commercially host or distribute RIGOR-X under Apache-2.0.

## Public review status

This repository is published for **source review of a development baseline**, not as a stable `0.4.0` release or a production-readiness claim. Review scope, known limitations, feedback channels, and security-reporting instructions are documented in [PUBLIC-REVIEW.md](PUBLIC-REVIEW.md). The package remains `0.4.0.dev0`.

A public GitHub repository is subject to GitHub's [Terms of Service](https://docs.github.com/en/site-policy/github-terms/github-terms-of-service). The repository's Apache-2.0 license is a separate copyright license for the covered Work. Public visibility is not a promise that source copies or forks can be recalled later. Do not publish secrets, personal data, third-party materials without sufficient rights, or confidential information.

## Implemented components
- Python reference engine (`src/rigorx`, frozen at engine protocol 1 by ADR-012): 11-stage pipeline state machine with explicit transitions, verification gate and bounded re-entry.
- SQLite persistence with transactional snapshots/events, append-only integrity and optimistic revisions.
- Registry structural validation/resolution; candidate status remains preserved.
- Typed stage-artifact contracts.
- Reasoning guard and adaptive selector; integration/evaluation boundaries are documented.
- Fail-closed command execution framework.
- Live model/tool loop using injected backend and registered host callbacks; capability/approval gates, JSON argument validation, receipts and bounded budgets.
- End-to-end 11-stage AgentPipeline with durable SQLite events/snapshots and fail-closed verification; CLI uses it by default.
- Slash-command catalog integration: **909/999** macro/image entries of the research corpus can be applied as user-level prompt modifiers; **90/999** native/UI/platform entries require actual host adapters. Domain activation is optional and heuristic; historical names remain pending ratification.
- Owner-authored command set (`library/rigorx-commands/`, 48 candidate entries, kept separate from the 999-entry corpus): 42 task modifiers and 6 host commands, resolved by the Worker only; the Python resolver reads the corpus alone.
- OpenAI-compatible Chat Completions transport over HTTPS (loopback HTTP allowed), standard-library networking and environment credentials.
- Package version CLI.
- Runnable text-agent CLI `rigorx-agent` for a configured OpenAI-compatible endpoint (no tools unless host callbacks are wired).
- Local host plugin engine and MCP server (`rigorx-mcp`, official MCP SDK, optional extra `[mcp]`): 12 annotated tools on engine protocol 1, owner-scoped runs, deterministic verification gate. Local single-user mode; frozen reference (ADR-012).
- Cloudflare plugin server (`deploy/cloudflare-ts/`, the canonical engine since ADR-012): TypeScript Worker with one runtime dependency (`@cloudflare/workers-oauth-provider`) running engine protocol 2 (twelve stages, six levels with level-dependent mandatory stages, pre-registered requirements, gate 2.1.0) and 19 user-facing tools (plain titles; compute, source checks, topic memory and approvals beyond the Python reference). Account management (usage, deleting tasks, topics or all data) is done by the user on the signed-in `/account` page, not by a tool. Checked by the hand-written conformance suite (`conformance/v2/`) and the official MCP SDK client; Python/TypeScript parity testing was retired with protocol 2. Per-owner Durable Objects, OAuth sign-in with Google (no static or shared token). Live at `https://rigorx-mcp.aetherica.workers.dev/mcp`.

## Owner requirements (scope, not implementation claims)
18 Functional Groups; six adaptive intensity levels and 12 heuristic analysis modes; nine research acquisition channels; 999 slash-command corpus; separate 102 operational/interface registry; 30 formulas; 33 algorithms; 111 topics; 15 operators; 36 knowledge domains; host/GitHub/cloud memory and Web/Android/iOS architecture.

These inventories do not imply live functionality. Missing source material stays missing. No dummy handlers or fake connections.

## ChatGPT and Codex Plugin

A portable hybrid Plugin package is maintained in [`plugins/rigor-x/`](plugins/rigor-x/). It bundles focused Skills for structured runs, evidence research, unit-aware computation, and topic memory, and connects to the OAuth-protected Cloudflare MCP service. The package does not bundle or redeploy the hosted Worker. ChatGPT end-to-end OAuth acceptance and fresh-install smoke tests remain unverified; see the Plugin README before testing or submitting it.

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

MCP plugin server (development, single user; see [WS31 Host Plugin Architecture](engineering/ai-system/24-HOST-PLUGIN-ARCHITECTURE.md)):
```bash
python -m pip install -e '.[mcp]'
rigorx-mcp --catalog library/slash-commands/commands.json            # stdio, for Claude Desktop / Claude Code
rigorx-mcp --transport streamable-http --port 8000                    # http://127.0.0.1:8000/mcp (loopback only until sign-in exists)
python examples/mcp_smoke.py                                          # end-to-end check: one task through all 11 stages
```

Python support: `>=3.13`; CI tests 3.13 and 3.15.

For text-only live execution, configure `RIGORX_MODEL_BASE_URL`, `RIGORX_MODEL_NAME`, optional `RIGORX_API_KEY`, then run `rigorx-agent "your question"`. Plugin tool execution requires an actual host adapter and registered callbacks.

## Governance and security
- Canonical engineering branch is `main`. Do not create project branches for work without explicit owner authorization. Dependabot version updates (GitHub Actions, pip) open their own PR branches. Git history was rewritten on 2026-11-25 to remove superseded proprietary licensing documents; commit SHAs cited before that date refer to pre-rewrite history (see [Execution Receipts](engineering/ai-system/06-EXECUTION-RECEIPTS.md)).
- Read [SECURITY.md](SECURITY.md) before reporting vulnerabilities and [CONTRIBUTING.md](CONTRIBUTING.md) before proposing changes.
- Capability states: PLANNED / SPECIFIED / IMPLEMENTED / TESTED / VERIFIED / PARTIAL / BLOCKED / NOT_IMPLEMENTED / NOT_ASSESSED.
- Release tag `v0.4.0` only after exact-head CI, integration acceptance, security and release gates.
- Standards are engineering references, not certification claims.

Progress and receipts: [AI System Engineering Index](engineering/ai-system/00-ENGINEERING-INDEX.md), [Execution Receipts](engineering/ai-system/06-EXECUTION-RECEIPTS.md). See the [Public Release Readiness Checklist](PUBLIC-RELEASE-CHECKLIST.md) for remaining publication gates.
