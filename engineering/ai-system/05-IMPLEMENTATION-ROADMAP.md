# Implementation Roadmap — RIGOR-X AI System Engineering

| Workstream | Deliverable | Dependency | Acceptance | State |
|---|---|---|---|---|
| WS-01 | Architecture + 11-stage spec | Owner sequence | Review + traceability | COMPLETED |
| WS-02 | Pipeline controller | Stage order | Unit tests + CI | VERIFIED |
| WS-03 | Durable persistence | Controller | SQLite transactions, restore, concurrency, integrity | VERIFIED |
| WS-04 | Typed stage contracts | Pipeline | Artifact schema, stage match, serialization, validation | VERIFIED (base contract) |
| WS-05 | Registry resolver | Registry corpus | Census, exact-ID resolution, crosswalk integrity, fail-closed tests | VERIFIED (read-only) |
| WS-06 | Research plan/acquisition | Source taxonomy | channel receipts, provenance and gaps | NOT STARTED |
| WS-07 | Capability routing | Host/tool inventory | actual capability receipts | NOT STARTED |
| WS-08 | Execution adapter contracts | Routing | authorization/idempotency/failure types | NOT STARTED |
| WS-09 | Evidence ledger | Research + execution | immutable provenance, contradictions | NOT STARTED |
| WS-10 | Verification policy | Evidence | independent validation + gates | PARTIAL |
| WS-11 | Feedback/promotion | Verification | bounded loops, approvals, metrics | PARTIAL |
| WS-12 | Security controls | All planes | threat-based tests, scans, policy | NOT STARTED |
| WS-13 | Observability | Runtime | trace/run metrics, redaction, correlation | NOT STARTED |
| WS-14 | Release engineering | Build pipeline | reproducible build, SBOM, provenance | NOT STARTED |
| WS-15 | Registry Resolver & typed stage contracts | Registry corpus + pipeline | Resolver/census/crosswalk + typed artifacts | VERIFIED |
| WS-16 | Reasoning-control guard (first increment) | Control-plane contracts | bounded repeats/stall/budget, validation, tests + CI | VERIFIED (not pipeline-integrated) |
| WS-17 | World-class standards and execution plan | Repository baseline | standards applicability, risk and execution gates documented | DOCUMENTED |
| WS-18 | Canonical FG inventory + candidate taxonomy crosswalk | 18 FG design + 18 candidate library groups | IDs/counts/coverage/refs validated; regression tests + CI | VERIFIED (category-level; not command activation) |
| WS-19 | Reasoning monitor/controller + adaptive mechanism selector | WS16 guard + reasoning-control specification | Bounded controller, typed profiles/receipts, advisory lexical signal, tests + benchmark + CI | VERIFIED (exact-head CI) |
| WS-20 | Operational command execution framework | Command contract + permission/capability model | Typed registry, fail-closed dispatcher, approval/capability checks, redacted receipts, tests + CI | VERIFIED (exact-head CI) |

## Dependency order

`WS-03 → WS-04 → WS-05 → WS-06/07 → WS-08 → WS-09 → WS-10 → WS-11`

WS16 guard is a parallel experimental control-plane increment. Before integration, false-stop and valid-repeated-operation benchmarks must be measured.

WS18 provides a structural taxonomy alignment baseline. It does not replace command-by-command operational contracts or capability ownership validation.

Security, test, observability and release controls are cross-cutting from the beginning, not postponed to the end.

## WS15 acceptance status
WS15 is complete and merged. It resolves the proposed records and candidate command corpus by stable ID while preserving their status, validates the recovered census, and defines typed artifacts for stage outputs. It does **not** activate command handlers, make the proposed architecture canonical, or implement routing/execution.

## WS16 current acceptance status
Implemented in `src/rigorx/reasoning_guard.py`: Unicode NFKC/casefold/text normalization, SHA-256 state fingerprints, repeat warning/stop threshold, hard step ceiling, optional progress-window stall signal, finite numeric validation and structured decision output. Nine targeted tests plus all 44 repository tests pass; Ruff passes in GitHub Actions. It remains unintegrated and does not detect semantic paraphrase loops or certify reasoning correctness.

## WS17 acceptance status
World-class engineering standards and execution plan are saved in `engineering/ai-system/12-WORLD-CLASS-ENGINEERING-EXECUTION-PLAN.md`. The listed standards are applicability baselines, not certification.

## WS19 implementation status

Implemented and corrective-hardened `src/rigorx/reasoning_controller.py`: candidate selection, strict typed profiles, capability-gap reporting without false fallback, lexical-overlap advisory, WS16 guard composition, bounded recovery, terminal decision latching and full episode reset. Semantic monitor reports absolute prior-step references and is explicitly opt-in (default disabled). Tests now cover terminal latching, reset lifecycle, capability absence, strict profile/action validation and exact step-budget ceiling. Corrective CI is pending. Tiny hand-authored fixture remains non-production evidence; pipeline integration is gated on larger empirical evaluation.

## WS18 acceptance status
Canonical FG IDs/names were saved separately from the candidate slash-library taxonomy. A many-to-many category crosswalk was added with explicit non-activation status. Validator and four regression tests passed in [GitHub Actions run #45518939024](https://github.com/aetherica/rigor.x/actions/runs/45518939024), commit `608e249eb4044aa369d8db58fea10256d6ef944f`. Per-entry mapping and command activation remain out of scope.

## WS20 implementation status

Implemented in `src/rigorx/command_runtime.py`: typed command definition/registry, duplicate rejection, ID/name resolution, execution state guard, capability gating, explicit approval gating, optional input contract, JSON-safe input/output checks, and redacted failure receipts. Eight unit tests added. CI verified. This is a framework increment, not activation or handler implementation for the 999 entries.


## WS21 — Live Model/Tool Agent Runtime (0.4.0 development)

Implemented source: `src/rigorx/agent_runtime.py` (bounded model-tool loop, registry, capability/approval gates, JSON argument validation, receipts, safe errors, budgets); `src/rigorx/model_backend.py` (actual OpenAI-compatible HTTP transport with HTTPS remote policy and environment credential support); package exports/version CLI. Tests cover tool execution, permissions, approval, budgets, schema errors, redaction and context validation.

Package version is `0.4.0.dev0`; final tag withheld until release acceptance. CI matrix: Python 3.13 and 3.15.

Limit: synchronous callback cancellation/timeout must be provided by the connector adapter; the core cannot forcibly cancel external side effects. Host/plugin wiring is required and is not simulated. Exact-head CI run #45572558422 passed both matrix jobs, Ruff, 93 tests and CLI smoke for commit `d41c2ba09c8563591882f8c262cb66733ac21739`.


## WS22 — Slash-command catalog and modifier integration

Implemented `src/rigorx/slash_commands.py` and integrated into `AgentRuntime`. The 999 corpus is loaded and structurally checked; canonical names resolve, aliases map without overriding canonical command names, macro classifications are transformed into user-level prompt modifiers, unknown tokens are preserved, and native/UI/image entries are passed through with an explicit non-execution notice. No command description is treated as executable code. CI exact-head: run #45573800515, both Python 3.13 and 3.15, Ruff PASS and 106 tests PASS.


## WS23 — Adaptive Intent/Intensity Router

`src/rigorx/adaptive_router.py` selects intent and methods using deterministic text signals and risk/complexity cues. It supports L01 BASIC through L06 HYPER RIGOROUS, explicit user overrides, transparent signal records and a serialized AdaptiveProfile. AgentRuntime injects this profile into the request as a heuristic route, not an immutable truth. CLI supports `--level`. Exact-head CI run #45574552128: Python 3.13/3.15, Ruff PASS, 117 tests PASS, package CLI smoke PASS.

Known limit: this is a deterministic heuristic baseline, not a semantic classifier or all-36-domain activation system. Domain registry activation and evaluation against real task datasets remain future work.


## WS24 — Release Build & Model Transport Hardening

The OpenAI-compatible transport rejects remote HTTP, endpoint credentials/query/fragment, non-finite timeouts, invalid token/response limits and oversized model response bodies. CI now pins GitHub Actions by full commit SHA, tests both supported Python versions, builds wheel+sdist, installs the wheel, checks dependencies and smoke-tests both CLI entry points. Exact-head CI #45575436952: 123 tests PASS, Ruff PASS, source/wheel build PASS and installed-wheel checks PASS on 3.13 and 3.15.


## WS25 — Knowledge Domain Activation (provisional historical inventory)

`library/knowledge-domains/domains.json` stores the recovered 36 ordered domain names with `source_status=HISTORICAL_ASSISTANT_RECORD` and `canonical_status=PENDING_OWNER_RATIFICATION`. `src/rigorx/domain_router.py` provides bounded keyword activation; results carry provenance status. AgentRuntime can receive an optional DomainRouter and include activated domains in context and result receipts. No domain names are silently promoted to canonical. CI exact-head acceptance is pending.
