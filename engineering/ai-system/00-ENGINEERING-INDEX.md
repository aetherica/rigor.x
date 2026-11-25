# AI System Engineering — Master Index

**Workspace:** `engineering/ai-system/`  
**Owner project:** Aetherica × RIGOR-X  
**Mode:** L06 — HYPER RIGOROUS  
**Primary branch:** `main`

## Saved engineering documents
- [Canonical Engineering Baseline](14-CANONICAL-ENGINEERING-BASELINE.md)
- [WS21 Live Agent Runtime](15-LIVE-AGENT-RUNTIME.md)
- [WS22 Slash Command Resolver](16-SLASH-COMMAND-RESOLVER.md)
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
- WS16 normalized fingerprint guard: implemented; 9 original dedicated tests and full 44-test suite passed; Ruff PASS (corrective increment adds 2 guard tests; current exact-head CI pending) in GitHub Actions [run #45517446772](https://github.com/aetherica/rigor.x/actions/runs/45517446772).
- WS18 crosswalk integrity: **4 regression tests passed**, validator passed on GitHub Actions. No runtime command activation.
- WS19 baseline implementation: experimental controller/selector, lexical signal and fixture benchmark; no pipeline integration.
- WS20 command execution framework: fail-closed typed registry/dispatcher, capability and approval gates, safe receipts; exact-head CI verified.
- WS19 corrective engineering exact-head CI verified.

- WS21 Live Agent Runtime implemented and CI verified: model backend, tool callback registry, bounded loop, capability/approval gates, schema validation, receipts and OpenAI-compatible HTTPS transport. Requires real host/plugin callbacks; no internal ChatGPT connection is claimed.

## Still incomplete
- WS19 corrective exact-head CI is now verified SUCCESS for commit `14f10ca4fdb1e6670c00ec7becbadb220232c4e9` (run #45568949396); pipeline integration remains gated.
- WS20 command framework exact-head CI verified; per-command handler integration remains pending.
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
This is an implemented, tested control-plane increment—not a complete autonomous AI runtime. Model/tool loop is implemented through host-injected backend/callbacks. Dynamic RIGOR-X mode routing, research adapters, provider connections and 999 handlers are not claimed.
