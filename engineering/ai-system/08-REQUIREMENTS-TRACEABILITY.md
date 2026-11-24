# Requirements Traceability — Pipeline Core

**Review date:** 2026-11-25  
**Scope:** Stage controller + SQLite persistence increment.  
**Not a complete system traceability matrix.**

| ID | Requirement | Implementation | Verification | Status |
|---|---|---|---|---|
| RX-PIPE-001 | Enforce the owner's exact 11-stage order | `pipeline.py: STAGE_ORDER` | test_stage_order; full-run test | VERIFIED |
| RX-PIPE-002 | No stage skipping | `begin_stage/complete_stage` | out-of-order transition test | VERIFIED |
| RX-PIPE-003 | Evidence captured during active stage | `record_evidence` | evidence capture test | VERIFIED |
| RX-PIPE-004 | Verification explicit pass/fail | `complete_stage(VERIFICATION)` | gate tests | VERIFIED |
| RX-PIPE-005 | Decision blocked without accepted verification | `complete_stage(DECISION)` | decision gate test | VERIFIED |
| RX-PIPE-006 | Failed verification permits bounded corrective re-entry | `reenter` | failed verification recovery test | VERIFIED |
| RX-PIPE-007 | Loop/re-entry budget | `max_reentries` | budget exhaustion test | VERIFIED |
| RX-PIPE-008 | Partial/blocked/user-wait states recover | status transitions | recovery tests | VERIFIED |
| RX-PIPE-009 | Snapshot structural validation | `from_snapshot` + schema | schema and malformed snapshot tests | VERIFIED |
| RX-STORE-001 | Durable snapshots and events | `SQLitePipelineStore` | reopen/restore test | VERIFIED |
| RX-STORE-002 | Snapshot/event transaction atomicity | explicit `BEGIN IMMEDIATE` transaction | injected trigger failure rollback test | VERIFIED |
| RX-STORE-003 | Append-only event history | event-prefix validation + ledger table | tamper and consistency tests | VERIFIED |
| RX-STORE-004 | Optimistic concurrency | revision CAS | stale and two-connection tests | VERIFIED |
| RX-STORE-005 | DB integrity exposed | `integrity_check()` | integrity test | VERIFIED |
| RX-STORE-006 | File DB private permissions | chmod 0600 | Linux CI permission test | VERIFIED |
| RX-STORE-007 | Schema version is checked | `store_meta` | implementation inspection; mismatch test pending | PARTIAL |
| RX-STORE-008 | DB migrations | not implemented | none | NOT IMPLEMENTED |
| RX-STORE-009 | Encryption-at-rest | not implemented | none | NOT IMPLEMENTED |
| RX-STORE-010 | Backup/restore automation | not implemented | none | NOT IMPLEMENTED |

## Acceptance notes

Verified items are limited to the implementation and tests described. SQLite local persistence does not imply multi-host distributed transactions. File permission behaviour is OS-dependent; the test is executed on Linux CI. Schema-version mismatch behaviour exists but lacks a dedicated test in this increment.
