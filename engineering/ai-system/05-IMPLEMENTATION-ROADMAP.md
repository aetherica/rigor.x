# Implementation Roadmap — RIGOR-X AI System Engineering

| Workstream | Deliverable | Dependency | Acceptance | State |
|---|---|---|---|---|
| WS-01 | Architecture + 11-stage spec | Owner sequence | Review + traceability | COMPLETED |
| WS-02 | Pipeline controller | Stage contracts | Unit tests + CI | VERIFIED |
| WS-03 | Durable persistence | Controller | SQLite transactions, restore, concurrency, integrity | IMPLEMENTING |
| WS-04 | Typed contracts | Schema base | Stage payload schema + validation | PARTIAL |
| WS-05 | Registry resolver | Registries | lifecycle-aware lookup and crosswalks | NOT STARTED |
| WS-06 | Research plan/acquisition | Source taxonomy | channel receipts, provenance and gaps | NOT STARTED |
| WS-07 | Capability routing | Host/tool inventory | actual capability receipts | NOT STARTED |
| WS-08 | Execution adapter contracts | Routing | authorization/idempotency/failure types | NOT STARTED |
| WS-09 | Evidence ledger | Research + execution | immutable provenance, contradictions | NOT STARTED |
| WS-10 | Verification policy | Evidence | independent validation + gates | PARTIAL |
| WS-11 | Feedback/promotion | Verification | bounded loops, approvals, metrics | PARTIAL |
| WS-12 | Security controls | All planes | threat-based tests, scans, policy | NOT STARTED |
| WS-13 | Observability | Runtime | trace/run metrics, redaction, correlation | NOT STARTED |
| WS-14 | Release engineering | Build pipeline | reproducible build, SBOM, provenance | NOT STARTED |

## Dependency order

`WS-03 → WS-04 → WS-05 → WS-06/07 → WS-08 → WS-09 → WS-10 → WS-11`

Security, test, observability and release controls are cross-cutting from the beginning, not postponed to the end.
