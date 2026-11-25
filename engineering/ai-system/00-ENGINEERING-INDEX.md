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

## Still incomplete
- WS16 pipeline integration, false-stop benchmark/ablation and semantic loop detection.
- Claim-evidence gate, typed memory conflict handling and adaptive mechanism controller.
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
