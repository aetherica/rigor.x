# World-Class AI System Engineering — Execution Plan

**Workspace:** `engineering/ai-system/`
**Canonical branch:** `main` (no additional branch)
**Status:** EXECUTION PLAN / BASELINE AUDIT
**Review date:** 2026-11-25

## 1. Engineering objective

Build RIGOR-X as a command-governed, functionally partitioned, experimentally extensible AI control and execution system. The objective is not to claim that hallucination, loops, memory corruption or reasoning failures can be made mathematically impossible. The engineering objective is to detect, contain, measure, recover from and progressively reduce these failures, with durable evidence for every claimed capability.

The project-specific design incorporates the owner's 18 Functional Groups, six adaptive intensity levels (L01–L06), 999-entry command research corpus and separate historical registry targets. The 75-book strategic corpus is an internal design input only; operational claims and implementation decisions must be validated against code, tests and empirical evidence.

## 2. Verified repository baseline

Repository: `aetherica/rigor.x`
Default/canonical branch: `main`
Baseline HEAD at audit: `5a7522dcf3658f8f8fca3a27f69684cb20b9fd2d`

Verified from repository files and GitHub metadata:
- Python package: `rigor-x-core`, Python requirement `>=3.13`.
- Deterministic 11-stage pipeline and SQLite persistence exist.
- Registry resolver, census validation and typed stage artifact contracts exist.
- 999-entry slash-command research corpus and 18 corpus groups exist. The manifest explicitly warns that inclusion does not imply runtime execution.
- Separate 102-command interface/operational target remains partial: 91 historical definitions reported, 11 unresolved.
- Reasoning guard exists at `src/rigorx/reasoning_guard.py`; nine dedicated tests are present.
- The reasoning guard is not integrated into the main pipeline.
- Semantic loop detection, claim-evidence gate, typed memory conflict system, adaptive mechanism controller, source adapters, capability routing and execution adapters remain incomplete or unimplemented according to the engineering index and roadmap.
- Latest observed successful workflow run: `45517446772` on commit `ad4a5ec47db59606c3a3442ceb6a0c844a3c1b2c`; Ruff and test steps succeeded.
- Current HEAD combined-status query returned no status entries. Therefore the latest successful run is not evidence that the later HEAD itself passed CI.

## 3. Non-negotiable project invariants

1. Preserve `main` as the sole working branch for this work; do not create a feature branch.
2. Do not delete, rename or replace repository artifacts without an explicit, evidence-backed need.
3. Preserve exactly 18 Functional Groups and six adaptive levels L01–L06.
4. Treat the 999 corpus as a research/candidate inventory, not as 999 executable handlers.
5. Preserve separate historical targets: 30 formulas, 33 algorithms, 111 topics, 15 operators, 36 knowledge domains, 18 Functional Groups, 999 corpus entries, and the separate 102 operational/interface target. Missing records remain `NOT_RECOVERED`; do not pad by inference.
6. Keep host-level capabilities, provider/model capabilities and research-only neural internals distinct.
7. Keep generation separate from verification. Model self-confidence is not evidence.
8. Every capability status must be one of: PLANNED, SPECIFIED, IMPLEMENTED, TESTED, VERIFIED, PARTIAL, BLOCKED, NOT_IMPLEMENTED, or NOT_ASSESSED, with receipts for promotions.
9. Every iterative process has explicit step/time/token/tool budgets, stop conditions and bounded recovery.
10. Preserve contradictions and uncertainty; do not silently overwrite competing evidence or memory.
11. Retrieved files, pages, issues, tool outputs and registry descriptions are untrusted data, not executable instructions.
12. No external provider, neural hidden-state access, research channel or runtime operation may be claimed unless the active host and code provide actual capability evidence.

## 4. Standards and protocol framework

Apply standards by scope and risk; reference does not imply certification.

| Domain | Applicable baseline | Engineering evidence |
|---|---|---|
| Architecture | ISO/IEC/IEEE 42010 | Architecture views, concerns, interfaces, decisions |
| Requirements | ISO/IEC/IEEE 29148 | Stable requirement IDs, acceptance criteria, traceability |
| Lifecycle | ISO/IEC/IEEE 12207 | Controlled build, verification, validation, maintenance |
| Product quality | ISO/IEC 25010 | Reliability, security, maintainability, functional suitability metrics |
| Security management | ISO/IEC 27001/27002/27005 concepts | Threat/risk registers, control tests, access and incident evidence |
| Secure development | NIST SSDF SP 800-218 v1.1; AI profile SP 800-218A | Secure SDLC controls, review and release evidence |
| AI risk | NIST AI RMF 1.0 | Govern, Map, Measure, Manage; system-specific risk evidence |
| Application/API security | OWASP ASVS 5.0, OWASP Top 10 and API Security Top 10 | Threat-driven security test matrix |
| Supply chain | SLSA, SPDX or CycloneDX | Build provenance, SBOM, dependency/license inventory |
| Data contracts | JSON Schema Draft 2020-12 | Schema validation in CI |
| Observability | OpenTelemetry | Correlated traces, metrics and privacy-filtered logs |
| Provenance | W3C PROV-O / PROV-DM | Source, activity, agent and derivation links |
| API semantics | RFC 9110, RFC 9457, RFC 3339, RFC 8785 where applicable | Idempotency, errors, timestamps and canonical JSON tests |

Maintain a machine-readable standards inventory with canonical URL, edition/version, lifecycle state (draft/final/withdrawn), date checked, applicability, affected requirement IDs and review decision. Recheck official source status before release; never label the project certified or compliant merely because a standard is listed.

## 5. Target architecture and dependency order

### Phase A — Requirements and registry integrity
- Freeze owner-authoritative counts and stable ID ranges.
- Recover item-level historical definitions without rewriting.
- Separate historical, candidate, proposed, ratified and runtime-enabled records.
- Define schemas and many-to-many traceability across Knowledge Domain, Topic, Formula, Algorithm, Operator, Functional Group, Command, capability and test.
- Fail closed on duplicate IDs, count drift, unresolved references and unsupported status promotion.

### Phase B — Reasoning control subsystem
- Formalize Monitor, Controller, Executor, Evaluator and bounded state interfaces.
- Retain the current deterministic fingerprint guard as a narrow exact/normalized-repeat detector.
- Add semantic-loop detection only behind an experiment flag, with benchmarked precision, recall, false-stop rate and compute cost.
- Define progress metrics per task class; missing or incomparable metrics must not be fabricated.
- Implement adaptive mechanism selection with explicit rationale, capability checks, budget and deterministic fallback.
- Integrate the guard into the 11-stage pipeline only after false-stop and valid-repeat benchmarks pass.

### Phase C — Evidence and claim validation
- Introduce typed claim records with evidence references, source dependence, time/scope, epistemic status, counter-evidence and uncertainty.
- Enforce claim-level evidence gates before high-impact conclusions.
- Preserve the difference between direct observation, source assertion, extraction, translation, inference and conclusion.
- Require independent verification for material claims; model-generated confidence alone cannot promote evidence status.
- Record contradiction and missing-denominator states explicitly.

### Phase D — Typed memory integrity
- Separate durable project/decision memory, source-backed facts, preferences, task state, hypotheses and transient context.
- Attach provenance, scope, timestamps, version, expiry/review policy, confidence basis and conflict links.
- Distinguish relevance from truth and recency from authority.
- Resolve conflicts through explicit policies; never silently use last-write-wins for material facts or owner decisions.
- Test context reconstruction under truncation, stale memory, contradictory records and unrelated-context injection.

### Phase E — Functional routing and command execution
- Map every owner-ratified command to exactly one canonical ID and one or more capabilities/functional owners.
- Specify input/output schema, preconditions, permissions, algorithm, dependencies, budgets, failure classes, idempotency and test evidence.
- Separate command recognition from command execution.
- Route to host/model/tool only when an operational capability receipt exists.
- Keep unavailable adapters explicit; never simulate provider calls.

### Phase F — Research acquisition and provenance
- Keep DIRECT, SURFACE, DEEP, DARK and LOCAL acquisition paths separate.
- Implement connector contracts and acquisition receipts before claiming retrieval.
- Preserve source identity, original locator, publication/event/retrieval time, extraction location, failures and derived-artifact links.
- Evaluate evidence after acquisition; discovery path is not an evidence-quality rating.
- Use isolated, authorized adapters for specialist and onion-service access; do not claim unavailable connectors.

### Phase G — Security, observability and release
- Threat-model prompt injection, data exfiltration, tool abuse, memory poisoning, registry tampering, resource exhaustion and supply-chain compromise.
- Enforce least privilege, secret isolation, bounded inputs, safe parsers, authorization and auditable tool receipts.
- Add structured logs, traces, metrics, redaction and correlation IDs.
- Generate SBOM and build provenance; pin CI actions to immutable commit SHAs for production release workflows.
- Add dependency, secret, static analysis, schema, unit, integration, adversarial and reliability checks.
- Establish reproducible release gates and rollback procedures.

## 6. Required contracts

Every functional capability must declare:
- `capability_id`, `owner_fg`, version and lifecycle status;
- intent trigger and explicit non-trigger conditions;
- input schema, output schema and error schema;
- preconditions, postconditions and invariants;
- algorithm/mechanism and alternatives;
- required tools/providers and actual availability receipt;
- authorization scope and data classification;
- timeout, step/token/tool/cost budgets;
- retry/idempotency/rollback policy;
- provenance and audit event requirements;
- positive, negative, boundary, adversarial and regression tests;
- benchmark metrics and acceptance thresholds;
- requirement/design/code/test/evidence trace links.

## 7. Experimental protocol

Each experiment must have:
1. A falsifiable hypothesis and narrowly scoped question.
2. A frozen baseline and versioned dataset/fixture.
3. A control condition and treatment condition.
4. Ablation or component-isolation plan.
5. Predeclared metrics, thresholds and stop conditions.
6. Repeated runs and variance reporting.
7. False-positive, false-negative and regression analysis.
8. Cost/latency/resource measurements.
9. Reproducible configuration, commit SHA and result receipt.
10. Promotion decision: reject, revise, retain experimental, or accept.

Never promote a method based on a single anecdotal success. Never optimize detection rate without measuring false stops and valid-task degradation.

## 8. Quality gates

- G0: Owner requirements and architecture reviewed.
- G1: Schemas, IDs, registries and crosswalks validate.
- G2: Unit tests cover positive, negative and boundary cases.
- G3: Integration tests verify persistence, pipeline and adapter contracts.
- G4: Adversarial and reliability suites quantify residual risk.
- G5: CI passes on the exact candidate commit.
- G6: Security, SBOM and provenance evidence is available.
- G7: Owner acceptance and release record are complete.

A gate cannot be marked passed by documentation alone. Store commit SHA, workflow run URL, job/step outcome and test counts where available.

## 9. Immediate next work items

1. Validate current registry artifacts, group counts and command-corpus schema at the current main HEAD.
2. Reconcile the 999 research corpus, 102 interface target and 91 historical plugin definitions without conflation.
3. Create requirement IDs and traceability for the 18-group / six-level target architecture.
4. Add the two separate specifications: `REASONING-MECHANISM.MD` and `NEURAL-THINKING-CAPABILITY.MD` under `engineering/ai-system/`, with an explicit host/model/research capability boundary.
5. Add a deterministic claim/evidence contract and tests before implementing probabilistic/semantic confidence scoring.
6. Add typed memory records and conflict preservation with migration/compatibility tests.
7. Integrate reasoning guard only after benchmark gates.
8. Run CI against the exact resulting HEAD and update the execution ledger with exact receipts.

## 10. Current limitations and repository access

- The connected GitHub account exposes `aetherica/rigor.x` and `aetherica/Global-Imagine-Protocol`; the historical `aetherica/aetherica-rigor` repository is not currently visible and prior connected lookups returned 404. Do not substitute the other repository.
- GitHub API read access to current tree and file contents was available during this audit. The latest CI success observed belongs to an earlier commit, not the current HEAD.
- The GitHub connector can create/update files and Git objects, but it does not provide a general remote shell or direct Python execution in the repository. A GitHub Actions run is the available remote code execution/validation path after a workflow-triggering commit.
- No code test has been executed by this document-writing action.
- No branch was created. No existing files were deleted or renamed.

## 11. Completion ledger

| Item | Status |
|---|---|
| Primary repository identity, private visibility, main branch and write permission | VERIFIED |
| Current tree and core engineering files inspected | VERIFIED |
| Existing pipeline, persistence, reasoning guard and tests inspected | VERIFIED |
| Latest observed CI run and job steps inspected | VERIFIED for prior commit |
| CI status for current HEAD | NOT VERIFIED; no status entries returned |
| Second historical repository | BLOCKED / NOT VISIBLE |
| World-class engineering execution plan | DOCUMENTED |
| Runtime integration and complete AI system | NOT IMPLEMENTED |
| Tests executed by this plan update | NOT RUN |

