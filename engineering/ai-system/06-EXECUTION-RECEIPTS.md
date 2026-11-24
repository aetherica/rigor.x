# Execution Receipts

## Pipeline controller
- CI: [Run #45509490594](https://github.com/aetherica/rigor.x/actions/runs/45509490594)
- Tests: 16 passed.
- Scope: deterministic 11-stage controller, transition/gate/re-entry contracts.

## Durable SQLite persistence
- CI: [Run #45512305126](https://github.com/aetherica/rigor.x/actions/runs/45512305126)
- Commit tested: `2527d349f0cfe7489fb09704609f7f813aff6468`
- Outcome: **28 tests passed** on GitHub Actions.
- Test areas: pipeline transitions, schema validation, SQLite reopen/restore, atomic event/snapshot writes, append-only event integrity, optimistic revision conflicts, cross-connection conflict, injected transaction rollback, database integrity and file permissions.

## Static analysis increment
- Ruff gate added to CI.
- Latest run: pending final receipt at time of this ledger update.
- Dependency update automation: Dependabot weekly configured.
- Workflow concurrency: superseded runs cancelled.

## Limitations
- No encryption-at-rest; no backup automation; no cloud replication or multi-node coordination.
- No formal ISO/NIST/OWASP certification.
- No live external provider/model or acquisition adapters.
- No end-to-end autonomous task executor.
