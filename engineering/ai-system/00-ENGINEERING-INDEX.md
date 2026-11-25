# AI System Engineering — Master Index

**Workspace:** `engineering/ai-system/`  
**Owner project:** Aetherica × RIGOR-X  
**Mode:** L06 — HYPER RIGOROUS  
**Primary branch:** `main`

## Saved engineering documents
- [Standards applicability](01-REFERENCE-STANDARDS.md)
- [Architecture](02-SYSTEM-ARCHITECTURE.md)
- [Threat model](03-THREAT-MODEL.md)
- [Quality and testing](04-QUALITY-AND-TEST-PROTOCOL.md)
- [Roadmap](05-IMPLEMENTATION-ROADMAP.md)
- [Execution receipts](06-EXECUTION-RECEIPTS.md)
- [Durable pipeline quickstart](07-DURABLE-PIPELINE-QUICKSTART.md)
- [Requirements traceability](08-REQUIREMENTS-TRACEABILITY.md)
- [WS15 Registry Resolver & Typed Stage Contracts](09-REGISTRY-RESOLVER-AND-STAGE-CONTRACTS.md)
- [WS16 Reasoning Control & Experiments](10-REASONING-CONTROL-AND-EXPERIMENTS.md)
- [WS16 Experiment Test Plan](11-REASONING-EXPERIMENT-TEST-PLAN.md)
- [WS17 World-Class Engineering Execution Plan](12-WORLD-CLASS-ENGINEERING-EXECUTION-PLAN.md)
- [Canonical 18 Functional Groups](functional-groups.json)

## Registry alignment (WS18)
- The candidate slash-command library's 18 taxonomy groups are distinct from the canonical 18 Functional Groups.
- [Many-to-many crosswalk](../../library/slash-commands/functional-group-crosswalk.json) is explicitly non-activating; it is category-level exploratory alignment, not a verified per-command ownership map.
- [Crosswalk validator](../../library/slash-commands/scripts/validate_functional_group_crosswalk.py) and [regression tests](../../tests/test_registry_crosswalk.py) validate count/order, coverage and referential integrity.
- CI: [Functional Group Crosswalk Validation run #45518939024](https://github.com/aetherica/rigor.x/actions/runs/45518939024) — SUCCESS; exact commit `608e249eb4044aa369d8db58fea10256d6ef944f`.

## Verified baseline
- 11-stage primary pipeline: specification and deterministic controller implemented.
- SQLite transactional persistence: implemented.
- Snapshots and append-only event ledger: transactionally coupled.
- Optimistic revision concurrency: implemented and tested across two connections.
- Recovery after process/store reopen: tested.
- Rollback on injected event insert failure: tested.
- SQLite integrity: tested.
- File database mode 0600: tested on Linux CI.
- Registry Resolver: exact-ID resolution + census/crosswalk validation implemented; proposed records remain status-preserving.
- Typed StageArtifact contracts: implemented with JSON-safe metadata and schema.
- WS15 GitHub Actions: 35 tests passed; Ruff static analysis: PASS.
- WS16 normalized fingerprint guard: implemented; 9 dedicated tests and full 44-test suite passed; Ruff PASS in GitHub Actions [run #45517446772](https://github.com/aetherica/rigor.x/actions/runs/45517446772).
- WS18 crosswalk integrity: **4 regression tests passed**, validator passed on GitHub Actions. No runtime command activation.
- WS19 baseline implementation: experimental controller/selector, lexical signal and fixture benchmark; no pipeline integration.
- WS19 corrective engineering adds terminal-decision latching, resettable episode state, exact hard-step ceilings, strict profile/limit validation, truthful empty-capability plans and stable prior-step references. Corrective CI is pending.

## Still incomplete
- WS19 corrected controller/selector is implemented; exact-head corrective CI verification is pending. Pipeline integration remains gated.
- Broader false-stop benchmark/ablation and semantic-loop evaluation remain pending.
- WS18 per-command verified mapping to capability contracts and the canonical FG architecture.
- Claim-evidence gate and typed memory conflict handling.
- Runtime registry activation/lifecycle governance and complete traceability graph.
- Research channel adapters and source receipts.
- Capability/tool/model routing.
- External execution adapters.
- Durable evidence/provenance service.
- Verification policy beyond stage gate.
- Feedback learning/promotion.
- Broader security scanning, SBOM, artifact provenance and release controls.
- Interface/operational-command registry: 102 target remains partial (91 historical definitions reported; 11 unresolved).

## Maturity boundary
This is an implemented, tested control-plane increment—not a complete autonomous AI runtime. No model/tool execution, dynamic routing or research acquisition is claimed.
