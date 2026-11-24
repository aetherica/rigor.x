# Threat Model — RIGOR-X AI System

## Assets
- User data, project files, credentials and tokens.
- Pipeline state and event/evidence history.
- Registry integrity and configuration.
- External adapter permissions and execution outputs.
- Build artefacts and release provenance.

## Trust boundaries
1. User prompt → model context.
2. Retrieved source/file → analysis context.
3. Model-generated plan → external execution adapter.
4. Adapter/provider → evidence ledger.
5. Local database → filesystem/backup.
6. GitHub source → CI runner → release artefact.

## Threat register

| Threat | Scenario | Primary controls | Test/evidence |
|---|---|---|---|
| Prompt injection | Retrieved content requests secret disclosure or tool actions | Treat content as data; instruction separation; no autonomous execution of source instructions | Malicious fixture tests |
| Tool overreach | Route calls unauthorized/unavailable capability | Capability allow/deny contract, user authorization, scope check | Adapter authorization tests |
| Hallucinated receipt | Plan/result text claims retrieval/execution without receipt | Receipt schema and evidence gate | Negative contract tests |
| Lost update | Two workers save same run revision | Optimistic concurrency | Revision conflict tests |
| Event tampering | Old events modified/deleted | Append-only checks, ledger consistency, DB permissions | Tamper test |
| Data corruption | Partial write or damaged DB | Transaction, integrity check, backup/restore | Fault/recovery tests |
| Secret leakage | Tokens enter repo/logs | Secret scanning, redaction, least privilege | CI secret scanning |
| Supply-chain compromise | Dependency/action compromised | Pin actions/dependencies, SBOM, provenance | Dependency audit |
| SSRF/private network access | Research adapter targets private infrastructure | Network boundary controls, destination policy | Network policy tests |
| Resource exhaustion | Huge prompts, files, retries, data | Quotas, timeouts, bounded budgets | Load/limit tests |
| Unauthorized persistence | Sensitive data stored without policy | Data minimization, retention, access controls | Privacy review |
| Registry poisoning | Candidate records promoted without validation | Lifecycle states, provenance, review gates | Promotion tests |

## Risk treatment

- **Critical/High:** must block release if not treated or explicitly accepted by owner.
- **Medium:** mitigation and monitoring required; release may proceed only with documented rationale.
- **Low:** accept with rationale and periodic review.

No formal risk scoring has been performed in this initial threat-model draft.
