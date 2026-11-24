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

## Verified baseline
- 11-stage primary pipeline: specification and deterministic controller implemented.
- SQLite transactional persistence: implemented.
- Snapshots and append-only event ledger: transactionally coupled.
- Optimistic revision concurrency: implemented and tested across two connections.
- Recovery after process/store reopen: tested.
- Rollback on injected event insert failure: tested.
- SQLite integrity: tested.
- File database mode 0600: tested on Linux CI.
- CI tests: **28 passed** (current verified run [#45512305126](https://github.com/aetherica/rigor.x/actions/runs/45512305126)); Ruff gate is the next verification increment.

## Still incomplete
- Registry integration and crosswalks.
- Research channel adapters and source receipts.
- Capability/tool/model routing.
- External execution adapters.
- Durable evidence/provenance service.
- Verification policy beyond stage gate.
- Feedback learning/promotion.
- Broader security scanning, SBOM, artifact provenance and release controls.
