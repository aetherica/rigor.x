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
| WS-19 | Reasoning monitor/controller + adaptive mechanism selector | WS16 guard + reasoning-control specification | Bounded controller, typed profiles/receipts, advisory lexical signal, tests + benchmark + CI | VERIFIED (experimental; not pipeline-integrated) |

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

Implemented `src/rigorx/reasoning_controller.py`: mechanism candidate selection, typed profiles, capability-gap reporting, bounded lexical-overlap signal, composition with WS16 repeat/progress/budget guard, recovery limit and structured receipts. Added 14 tests plus fixture benchmark. Tiny fixture shows paraphrase misses; pipeline integration remains gated on stronger empirical evaluation.

## WS18 acceptance status
Canonical FG IDs/names were saved separately from the candidate slash-library taxonomy. A many-to-many category crosswalk was added with explicit non-activation status. Validator and four regression tests passed in [GitHub Actions run #45518939024](https://github.com/aetherica/rigor.x/actions/runs/45518939024), commit `608e249eb4044aa369d8db58fea10256d6ef944f`. Per-entry mapping and command activation remain out of scope.
