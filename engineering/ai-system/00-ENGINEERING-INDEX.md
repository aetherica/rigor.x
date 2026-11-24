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

## Baseline and active work
- 11-stage primary pipeline: architecture specified.
- Deterministic controller: implemented and CI-verified (16 prior tests).
- SQLite durable store: code added, tests pending current CI.
- Registry integration: not implemented.
- External provider integrations: not connected/verified.
- End-to-end execution: not implemented.

## Current engineering increment
Transactional SQLite store, event/snapshot consistency, optimistic concurrency, reopen/recovery and integrity checks.
