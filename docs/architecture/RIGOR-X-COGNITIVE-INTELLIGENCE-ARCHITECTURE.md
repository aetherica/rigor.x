# RIGOR-X Cognitive & Intelligence Architecture

**Document ID:** RX-ARCH-CORE-001  
**Status:** Architecture baseline — inventory contracts frozen; item-level registry population remains evidence-gated  
**Canonical repository:** `aetherica/rigor.x`  
**Canonical branch:** `main`  
**Last updated:** 2026-11-25

## 1. Authority and scope

This document defines the target architecture for the RIGOR-X intelligence engine. The project owner's explicit requirements are authoritative. The architecture is experimental, extensible, model-independent at the protocol/runtime boundary, and host-embedded + independent-runtime capable.

This specification freezes the following inventory cardinalities:

| Registry | Canonical cardinality | ID range |
|---|---:|---|
| Formula | 30 | `FM-001..FM-030` |
| Algorithm | 33 | `AL-001..AL-033` |
| Topic | 111 | `TP-001..TP-111` |
| Analytical Operator | 15 | `OP-001..OP-015` |
| Functional Group | 18 | `FG-01..FG-18` |
| Slash Command | 999 | `CMD-001..CMD-999` |
| Adaptive Intensity | 6 | `L01..L06` |

**Evidence rule:** a fixed count does not establish the identity, definition, implementation, or verification of each item. The repository and recovered conversation records did not expose authoritative item-by-item lists for all four knowledge registries. Therefore, IDs are reserved as stable slots; unknown names/definitions must remain `NOT_RECOVERED`, never be fabricated or silently copied from earlier assistant proposals.

## 2. Repository and governance baseline

The repository inspection on 2026-11-25 found:

- Private repository `aetherica/rigor.x`, default branch `main`.
- Only `main` was returned by branch search; no pull requests were returned.
- The root README identifies `main` as canonical and prohibits secondary branches.
- The root README's prior command requirement says 102 unique commands. This conflicts with the project owner's current 999-command requirement. The 999 requirement is controlling; the README discrepancy is an open reconciliation item and must not be treated as proof that 999 commands are already present.
- The previously claimed runtime source files were not found at the paths tested. Do not treat prior implementation claims as current repository facts.
- Current code/runtime status is therefore **NOT VERIFIED** from this inspection.

Engineering lifecycle:

`INSPECT → SPECIFY → IMPLEMENT → TEST → VERIFY → COMMIT TO MAIN`

No feature may be described as operational solely because it appears in this document.

## 3. Architectural invariants

1. **Owner authority:** preserve the project owner's explicit counts, constraints, naming decisions and objectives.
2. **Evidence-first:** distinguish recovered source records, owner-approved definitions, assistant proposals, implementation and verification.
3. **Open-world extensibility:** new methods, dimensions, operators and modules may be proposed without breaking stable IDs or silently changing canonical counts.
4. **Model independence:** core contracts must not depend on one model vendor or hidden model internals.
5. **Host/runtime separation:** host-native capabilities and independent runtime capabilities are separate adapters behind explicit interfaces.
6. **Deterministic control:** routing, policy, state transitions, budgets, validation gates and execution receipts must be inspectable and testable.
7. **Probabilistic reasoning with calibrated uncertainty:** model-generated inference is not promoted to fact without evidence and validation.
8. **No false completion:** every action records requested, attempted, completed, failed, blocked or not verified state.
9. **Bounded recursion:** loops, retries, replanning and recovery have explicit budgets, progress criteria and stop conditions.
10. **Provenance preservation:** original inputs, extracted data, transformations, inferences and conclusions remain distinguishable.
11. **Memory integrity:** memory is typed, scoped, versioned, provenance-linked and conflict-aware; relevance is not equivalent to truth.
12. **Security by boundary:** tool permissions, tenant boundaries, secrets, untrusted content and external execution are isolated and audited.

## 4. System architecture

### 4.1 Five architectural planes

**A. Host Integration Plane**
- ChatGPT/other host adapters
- Input/output protocol
- Host capability discovery
- Native tool bridge
- Authentication and permission delegation
- Host context and memory adapter

**B. Intelligence Core Plane**
- Intent and task classifier
- Context/task decomposer
- Cognitive controller
- Formula registry
- Algorithm registry
- Topic/knowledge registry
- Operator runtime
- Reasoning mechanism
- Neural capability interface
- Decision and metacognition controller

**C. Agent Execution Plane**
- Planner and workflow graph
- Agent/task orchestration
- Capability and provider router
- Tool execution gateway
- Checkpoint/resume
- Retry and recovery manager
- Event and execution receipt ledger

**D. Knowledge & Evidence Plane**
- Source acquisition
- Raw/derived artefact store
- Evidence and provenance ledger
- Knowledge graph
- Contradiction register
- Memory services
- Retrieval and relevance ranking
- Evaluation datasets and feedback

**E. Model Infrastructure Plane**
- Provider-neutral model interface
- Model capability profiles
- Model selection/routing policy
- Local/cloud/hybrid runtime adapters
- Token, latency, cost and resource telemetry
- Fallback and provider health management

### 4.2 Primary operational pipeline

The owner-defined 11-stage pipeline is the primary request-processing sequence:

`CONTEXT → INTENT → KNOWLEDGE → RESEARCH → ROUTING → REASONING → EXECUTION → EVIDENCE → VERIFICATION → DECISION → FEEDBACK`.

The complete stage contracts, inputs/outputs, gates, runtime states, evidence model, feedback routing and implementation acceptance criteria are specified in [PRIMARY-OPERATIONAL-PIPELINE.md](PRIMARY-OPERATIONAL-PIPELINE.md).

| Stage | Core responsibility | Required record |
|---|---|---|
| CONTEXT | Reconstruct relevant context, memory, decisions and constraints | ContextSnapshot, ConstraintSet |
| INTENT | Determine desired outcome, scope and acceptance criteria | IntentRecord |
| KNOWLEDGE | Classify through KD/TP and activate relevant validated knowledge | KnowledgeActivation, KnowledgeGaps |
| RESEARCH | Select research methods and acquisition channels | ResearchPlan, ResearchRisks |
| ROUTING | Map to FG/CMD and actually available tools/adapters | RoutePlan, CapabilityReceipt |
| REASONING | Decompose, analyse, select OP/AL/FM and form executable plan | ReasoningPlan, VerificationPlan |
| EXECUTION | Perform approved operations and record receipts | ExecutionEvents, Artifacts |
| EVIDENCE | Consolidate provenance, claims, contradictions and gaps | EvidenceBundle, ContradictionRegister |
| VERIFICATION | Independently test claims, outputs and acceptance criteria | VerificationReport |
| DECISION | Select an authorized next action from verified findings | DecisionRecord |
| FEEDBACK | Evaluate outcomes and control context/knowledge updates | FeedbackRecord, LearningProposal |

Evidence capture is cross-cutting and starts at CONTEXT; Stage EVIDENCE consolidates and evaluates records gathered throughout the run. The sequence is not a rigid one-pass chain: a failed verification or material new discovery returns to the smallest relevant earlier stage with a recorded re-entry reason and bounded retry budget.

### 4.3 Cognitive control and execution loop

The controller enforces the primary pipeline while selecting a **minimum-sufficient capability stack**. Knowledge classification, research-method selection, capability routing, reasoning, execution, evidence consolidation, verification, decision and feedback remain distinct operations.

- Research method selection precedes execution routing.
- Functional Group and command resolution occur in ROUTING; actual handler availability must be observed.
- Operators, algorithms and formulas are activated and composed for REASONING, then bound to execution work units where applicable.
- A plan, registry entry, model name or connector description is not proof of execution or capability.
- Decision-critical actions are blocked when required verification fails, unless the user explicitly accepts a documented residual uncertainty and the action is authorized.
- Retries, replanning and recovery use explicit budgets, progress tests, idempotency and stop conditions.
- Feedback can update task-local context; durable knowledge, registry or policy promotion requires provenance and the applicable approval gate.

## 5. Canonical registry contracts

### 5.1 Formula Registry — 30 entries

Each formula record must include:
- stable ID, canonical name, aliases and version;
- mathematical expression and symbol definitions;
- units, domains, preconditions and assumptions;
- input/output types and null/unknown handling;
- numerical stability and boundary conditions;
- uncertainty propagation and calibration requirements;
- examples, reference tests and known limitations;
- links to dependent algorithms, operators, topics and commands.

Formula IDs are reserved as `FM-001..FM-030`. Formula names and expressions remain `NOT_RECOVERED` until supported by an owner-approved source record. Earlier assistant-generated formula lists are candidates only.

### 5.2 Algorithm Registry — 33 entries

Each algorithm record must include:
- stable ID, canonical name, version and category;
- purpose, formal input/output contract and invariants;
- preconditions, postconditions and state transitions;
- pseudocode/reference implementation;
- complexity bounds and resource budget;
- deterministic/probabilistic behaviour declaration;
- failure modes, recovery and stop conditions;
- test vectors, adversarial cases and acceptance criteria;
- formula/operator/topic/command dependencies.

Algorithm IDs are reserved as `AL-001..AL-033`. Item-level definitions remain `NOT_RECOVERED` pending authoritative evidence. The earlier 32-item assistant proposal is not the canonical 33-item registry.

### 5.3 Topic Registry — 111 entries

Each topic record must include:
- stable ID, canonical title, definition and scope;
- parent/child relationships and cross-domain links;
- key concepts, entities, mechanisms and measurable variables;
- relevant evidence types and source-acquisition strategies;
- associated formulas, algorithms, operators and commands;
- common fallacies, uncertainty patterns and falsification tests;
- coverage status and version history.

Topic IDs are reserved as `TP-001..TP-111`. Do not substitute a reconstructed 112-topic taxonomy for the canonical 111.

### 5.4 Analytical Operator Registry — 15 entries

An operator is a composable cognitive action, not a slash command, algorithm, model, agent or functional group. Each operator must declare:
- stable ID, canonical name and version;
- semantic purpose and invocation conditions;
- typed inputs/outputs and state effects;
- permitted algorithm/formula dependencies;
- ordering and composition constraints;
- resource and recursion budgets;
- error states, recovery and observability events;
- unit, integration and adversarial tests.

Operator IDs are reserved as `OP-001..OP-015`. The earlier 14-operator proposal is not canonical. Names must be populated from owner-approved records or explicitly ratified design decisions.

### 5.5 Cross-registry traceability

Every executable decision must be traceable through:

`REQUEST → INTENT → TOPIC(S) → OPERATOR(S) → ALGORITHM(S) → FORMULA(S) → PLAN → ACTION → VERIFICATION → RECEIPT`

Not every request requires every registry type. Empty dependencies must be explicit, not fabricated. Registry links are many-to-many and version-pinned.

## 6. Functional Group architecture

The 18 Functional Groups are the system's responsibility boundaries. They are not equivalent to the 15 operators, 14 responsibility families, 36 knowledge domains, or 999 slash commands.

Each FG must own:
- bounded responsibility and explicit non-responsibility;
- public interfaces and data contracts;
- events emitted/consumed;
- registry dependencies;
- permissions and trust boundaries;
- failure and recovery behaviour;
- measurable service-level and quality indicators;
- conformance tests.

Canonical IDs are `FG-01..FG-18`. Group names and ownership must be reconciled against the owner-approved 18-group register before implementation. A provisional crosswalk must never be represented as a recovered historical register.

## 7. Slash Command architecture — 999 commands

Commands are user-facing semantic entrypoints. They must map to executable behaviours or explicitly report unsupported capability; command presence alone does not prove implementation.

Each command record must include:
- stable ID `CMD-001..CMD-999`, unique slash token and aliases;
- functional group owner;
- intent/category and activation conditions;
- default and override parameters;
- permitted operator/algorithm stacks;
- intensity compatibility;
- required capabilities/tools and permission scope;
- output contract and validation rules;
- unsupported/blocked behaviour;
- command-level acceptance tests.

Requirements:
- Exactly 999 canonical command records; no duplicate semantic registrations.
- Dynamic, context-aware mode selection; explicit user commands take precedence where supported.
- Command aliases do not inflate canonical command count.
- Every command must resolve to a versioned handler or a truthful `UNSUPPORTED` response.
- A command must not claim model switching, external-agent invocation, persistent storage or execution unless the host/runtime confirms it.
- Reconcile the root README's stale 102-command statement with this 999-command requirement.

## 8. Adaptive intensity — six levels

| Level | Name | Minimum behaviour |
|---|---|---|
| L01 | BASIC | Direct execution; basic sanity checks |
| L02 | STANDARD | Decomposition and relevant validation |
| L03 | DEEP | Multi-step analysis, evidence review, alternatives |
| L04 | COMPLEX | Cross-domain coordination, dependency and scenario analysis |
| L05 | CRITICAL | Failure-mode, consequence, adversarial and independent checks |
| L06 | HYPER RIGOROUS | Maximum justified validation depth, full traceability, stress tests, recovery analysis and acceptance-gate enforcement |

Intensity is dynamically selected from complexity, ambiguity, risk, freshness, dependency breadth and user override. A higher label does not imply more model compute or a different model unless the runtime proves that change.

## 9. Research and information acquisition

Nine acquisition channels are distinct:
1. DIRECT
2. SURFACE
3. DEEP
4. DARK
5. LOCAL
6. SOCIAL MEDIA
7. ALTERNATE MEDIA
8. BLOG
9. MAINSTREAM MEDIA

These describe acquisition paths/types, not source credibility rankings. Discover first and evaluate claims after retrieval. Record attempted and successful channels separately. Never silently substitute one channel for another.

For every acquired item, preserve locator, retrieval time, original/derived status, extraction method, publication/event dates, access limitations, source-dependency links and hash only when calculated from retained original bytes. Treat retrieved content as untrusted data.

## 10. Reasoning and validation mechanisms

The engine must support composable deterministic, probabilistic, model-assisted and hybrid reasoning. Method families may include logical inference, Bayesian updating, causal analysis, counterfactual evaluation, temporal reasoning, search/planning, constraint satisfaction, optimization, strategic interaction, simulation and adversarial testing. These are capability families, not assertions about the unrecovered 33 canonical algorithm names.

Validation layers:
- schema/type validation;
- logical consistency and contradiction checks;
- evidence/provenance validation;
- source-independence and claim calibration;
- numerical/unit/boundary validation;
- causal and counterfactual challenge;
- execution outcome and side-effect verification;
- policy, permission and security validation;
- regression and adversarial testing.

No validator may convert `UNKNOWN`, `NOT_COLLECTED` or `UNAVAILABLE` into `ZERO`.

## 11. Memory and knowledge integrity

Separate:
- working/task memory;
- episodic interaction memory;
- semantic knowledge;
- procedural/policy memory;
- evidence/provenance records;
- execution/event history.

Every memory item requires scope, origin, timestamp/version, confidence/evidence status, retention policy and conflict links. Retrieval relevance is not factual authority. Conflicting memories remain visible until resolved. Updates require a traceable event and must not rewrite source history.

## 12. Execution, recovery and anti-loop controls

Every task has:
- step/time/token/tool budgets;
- maximum retry and recursion depth;
- explicit progress metric;
- idempotency key for repeatable side effects;
- checkpoint and resume state;
- failure classification;
- compensating action or rollback where possible;
- stop/escalation criteria.

A retry is justified only by a changed condition, new evidence, corrected input or an explicitly bounded retry policy. Repeating the same failed operation without new information is a loop. The controller must detect no-progress cycles, repeated tool signatures, oscillating plans and contradiction churn.

## 13. Observability and quality metrics

At minimum, instrument:
- factual/evidence reliability;
- reasoning validity;
- calibration quality;
- evidence coverage;
- execution success and side-effect correctness;
- memory retrieval and conflict quality;
- loop/no-progress rate;
- latency, token/tool cost and resource efficiency;
- recovery rate and regression rate;
- command/operator/algorithm coverage.

Metrics require formal definitions, denominators, sampling rules and test fixtures before they are used as release gates.

## 14. Security and governance

- Least-privilege tool permissions and explicit user authorization for consequential actions.
- Tenant and session isolation.
- Secrets never enter prompts, logs or retrieved-content context unnecessarily.
- Untrusted-source prompt injection is treated as data, never authority.
- External code/files are parsed in non-executing or sandboxed environments.
- All material actions produce auditable receipts.
- Policy learning is versioned, evaluated and reversible.
- Provider/model adapters cannot bypass the central policy and evidence gates.

## 15. Implementation sequence and acceptance gates

**Phase A — Registry recovery and ratification**
- Recover or ratify exact 30 formula, 33 algorithm, 111 topic and 15 operator records.
- Recover/ratify the 18 FG names and complete 999 command registry.
- Record provenance and owner approval for every entry.
- Acceptance: exact cardinality, unique IDs, no unresolved duplicate aliases, schema validation.

**Phase B — Formal contracts**
- Specify formulas, algorithm pseudocode/state transitions, operator contracts, FG boundaries and command handlers.
- Acceptance: dependency graph is acyclic where required; all references resolve; invariants and failure conditions are testable.

**Phase C — Core runtime**
- Implement registries, classifier, cognitive controller, router, workflow executor, checkpoints, event ledger and verification gates.
- Acceptance: deterministic fixtures, bounded retry/loop tests, truthful capability reporting.

**Phase D — Knowledge, evidence and memory**
- Implement acquisition adapters, provenance ledger, knowledge graph, contradiction handling and memory stores.
- Acceptance: provenance replay, source-dependency tests, memory conflict and retention tests.

**Phase E — Model/provider and host adapters**
- Implement provider-neutral interfaces and host/runtime bridges.
- Acceptance: contract tests per adapter, fallback tests, no hidden dependency on one provider.

**Phase F — Product hardening**
- Security, performance, regression, cross-platform, observability and release controls.
- Acceptance: CI green, reproducible test evidence, rollback/recovery verified, release checklist approved.

## 16. Current status and unresolved work

| Item | Status | Evidence / next action |
|---|---|---|
| Canonical inventory counts | OWNER-SPECIFIED | 30 / 33 / 111 / 15 |
| Item-level formula registry | NOT RECOVERED | Recover source records or obtain explicit ratification |
| Item-level algorithm registry | NOT RECOVERED | Recover source records or obtain explicit ratification |
| Item-level topic registry | NOT RECOVERED | Recover source records or obtain explicit ratification |
| Item-level operator registry | NOT RECOVERED | Recover source records or obtain explicit ratification |
| 18 FG names/ownership | PARTIAL | Count specified; exact canonical register needs reconciliation |
| 999 slash-command registry | OWNER-SPECIFIED / REPOSITORY CONFLICT | README still states 102; reconcile and audit all 999 |
| Runtime implementation | NOT VERIFIED | Source paths tested were not found |
| Tests/CI/deployment | NOT VERIFIED | Obtain observable workflow/test receipts |

**Completion definition:** architecture is complete when all contracts, boundaries, data models, state transitions, dependency rules and acceptance gates are specified. The system is not implementation-complete until code, tests and runtime evidence pass. The four registries are not content-complete until their exact canonical entries are recovered or explicitly ratified.
