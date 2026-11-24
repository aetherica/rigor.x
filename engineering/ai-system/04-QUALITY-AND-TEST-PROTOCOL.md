# Quality & Test Protocol

## Test pyramid
1. Static checks: syntax, type/lint, dependency/security scans, schema checks.
2. Unit: transition invariants, serializers, validators, policy decisions.
3. Component/integration: database, adapter contracts, registry resolution.
4. End-to-end: 11-stage task with receipts and failure recovery.
5. Adversarial: prompt injection, tampered events, false receipts, malformed schemas.
6. Reliability: restart, concurrent writes, transaction rollback, bounded retries.
7. Acceptance: owner requirements and output contract.

## Acceptance gate for every capability
- Requirement ID and traceable design.
- Deterministic or clearly bounded behaviour.
- Positive, negative, boundary and failure tests.
- Actual test receipt.
- Security/privacy review appropriate to risk.
- Documentation and examples.
- Explicit status: PLANNED / IMPLEMENTED / TESTED / VERIFIED.

## Pipeline acceptance
- All 11 stages run in order.
- Evidence can be captured cross-stage.
- Verification must explicitly pass before Decision.
- Failed verification re-enters corrective stage under budget.
- Partial, blocked and waiting states can resume.
- Snapshot restoration validates structure.
- Durable store commits snapshot/events atomically.
- Concurrent stale writes rejected.
- Integrity check and backup/restore test.
- Feedback update cannot silently promote knowledge or policy.

## Test commands
```bash
python -m pip install '.[test]'
python -m unittest discover -s tests -v
```

Test reports should record runtime version, commit SHA, workflow run URL, total/pass/fail/skip counts and coverage if measured. Never invent coverage.
