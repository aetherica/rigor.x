# Standards & Protocol Applicability Map

Standards are mapped to the specific system risk and control. Compliance/certification is not claimed merely because the engineering approach references a standard. Verify edition/version and applicability before formal compliance claims.

| Standard / protocol | Scope to apply | RIGOR-X engineering controls | Evidence needed |
|---|---|---|---|
| ISO/IEC/IEEE 42010 | Architecture description | Stakeholders, concerns, viewpoints, interfaces, rationale | Architecture views and decision records |
| ISO/IEC 25010 | Software product quality | Functional suitability, reliability, security, maintainability, usability, portability | Quality model + measurable acceptance criteria |
| ISO/IEC/IEEE 12207 | Software lifecycle processes | Requirements, implementation, verification, validation, configuration, maintenance | Lifecycle artifacts and change history |
| ISO/IEC/IEEE 29148 | Requirements engineering | Requirement IDs, traceability, testable statements, change control | Requirements register + trace matrix |
| ISO 9001 concepts | Quality management | Document control, corrective action, continual improvement | Controlled records and defect CAPA |
| ISO/IEC 27001 concepts | Information security management | Risk-based controls, asset inventory, access, incident management | Risk register, control evidence; no certification claim |
| ISO/IEC 27002 | Security control guidance | Least privilege, secrets, access logging, secure configuration | Security control checks |
| ISO/IEC 27005 | Security risk | Threat/risk assessment and treatment | Risk register with owners/treatment |
| NIST SSDF SP 800-218 | Secure development | Protect software, secure environments, produce well-secured software, respond to vulnerabilities | SDLC control checklist and CI receipts |
| NIST SP 800-53 Rev. 5 | Control catalogue | Select relevant controls for identity, audit, configuration, contingency and integrity | Applicability rationale and control tests |
| NIST SP 800-61 Rev. 3 | Incident response | Incident readiness, detection, response, recovery | Incident runbook and exercises |
| NIST SP 800-63 | Digital identity | Auth/authentication assurance and lifecycle if user identity introduced | Threat-based identity requirements |
| OWASP ASVS 5.x | Application security | Validation, auth, session, access, crypto, logging, API, data protection | Versioned ASVS checklist; automated/manual checks |
| OWASP Top 10 2025 | Web application risk | Common web risk review; supplement, not replace, threat model | Risk-specific checks |
| OWASP API Security Top 10 2023 | API risks | Object/function authorization, resource limits, SSRF, inventory, auth | API test matrix |
| OWASP SAMM 2.x | Secure maturity | Governance, design, implementation, verification, operations maturity | Maturity roadmap |
| SLSA 1.x | Build provenance | Build integrity, provenance and artifact attestation when CI supports | Build attestations |
| SPDX 3.x / CycloneDX 1.7 | SBOM | Dependency inventory and license/security metadata | Generated SBOM artifact |
| RFC 9110 | HTTP semantics | Idempotency, methods, status, cache, retry semantics | API contract tests |
| RFC 9111 | HTTP caching | Cache policy, freshness and invalidation | Cache behavior tests |
| RFC 9457 | Problem Details | Stable structured API error representation | Error contract tests |
| RFC 3339 | Timestamps | Offset-aware timestamps and date-time validation | Timestamp tests |
| RFC 8785 | JSON canonicalization | Canonical serialization where signatures/hashes are used | Canonicalization tests |
| JSON Schema Draft 2020-12 | Data contracts | Run snapshot schema and payload validation | Schema CI |
| OpenTelemetry | Observability | Trace context, metrics, structured logs with privacy control | Trace/metric/log test evidence |
| W3C PROV-O / PROV-DM | Provenance | Entity/activity/agent relations for source and derived evidence | Provenance graph validation |
| SQLite official guarantees | Embedded durability | Transactions, WAL, integrity check, migrations, locking | Integration, restart and integrity tests |
| GitHub Actions security hardening | CI/CD | Minimal permissions, pinned actions, secret handling, workflow triggers | Workflow review and run receipts |

## Standards lifecycle

For standards requiring current editions, maintain version and last-checked date in a future machine-readable standards registry. This table is an applicability baseline, not an audited current-edition list.
