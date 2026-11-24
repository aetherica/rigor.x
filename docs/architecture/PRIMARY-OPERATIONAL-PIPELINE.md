# RIGOR-X Primary Operational Pipeline

**Document ID:** RX-PIPELINE-001  
**Version:** 1.0.0  
**Status:** IMPLEMENTATION SPECIFICATION — pending runtime implementation and owner ratification  
**Canonical repository:** `aetherica/rigor.x`  
**Canonical branch:** `main`

## 1. Purpose and authority

This document establishes the owner's 11-stage sequence as the primary operational pipeline for RIGOR-X. It supersedes the older abbreviated lifecycle as the primary description of request processing; it does not delete or reduce any canonical inventory, research channel, command, or subsystem requirement.

The pipeline is:

```text
CONTEXT → INTENT → KNOWLEDGE → RESEARCH → ROUTING → REASONING
        → EXECUTION → EVIDENCE → VERIFICATION → DECISION → FEEDBACK
             ↑                                             │
             └──────────── adaptive feedback loop ─────────┘
```

The stages are ordered control gates, not a claim that all work is strictly linear. Evidence capture is active throughout. Verification failures and new discoveries return to the smallest relevant earlier stage. The controller must preserve stage order for forward progression and record every re-entry.

## 2. Design principles

1. **Owner-defined order:** the 11 stages and their order are the primary pipeline.
2. **Minimum-sufficient activation:** activate only the knowledge, methods, operators, tools and checks relevant to the task.
3. **Evidence is continuous:** capture provenance and execution events as they occur; consolidate and evaluate them at the EVIDENCE stage.
4. **Research precedes routing:** determine the appropriate research/acquisition method before selecting the execution capability that will carry it out.
5. **Reasoning is distinct from execution:** analysis and plan construction do not count as tool execution or completed work.
6. **Verification precedes decision:** a decision may use only outputs whose verification status and limitations are explicit.
7. **Feedback is controlled:** feedback can update task context, candidate knowledge, policies or memory only under explicit validation and promotion rules.
8. **No fabricated capability:** planned, unavailable, disconnected, failed and completed operations remain distinct.
9. **Bounded recursion:** retries and feedback loops have budgets, progress tests and terminal conditions.
10. **Traceability:** each stage emits a typed record linked to the request and preceding records.

## 3. Stage contracts

### Stage 01 — CONTEXT

**Purpose:** reconstruct the relevant operating context before interpreting the request.

**Inputs**
- Current user input and conversation state.
- Relevant working, episodic, semantic and procedural memory, when available.
- Prior decisions, active project state, artefacts, constraints and unresolved issues.
- Host/tool capability observations, with timestamps and scope.

**Operations**
- Resolve references to prior work and current artefacts.
- Retrieve only context relevant to the current task.
- Separate current-turn facts, user-approved decisions, historical records, assistant proposals and unverified claims.
- Detect stale, conflicting, incomplete or low-confidence context.
- Preserve privacy, authorization and scope boundaries.

**Outputs**
- `ContextSnapshot`: selected context items, source references, timestamps/version, relevance score and factual-confidence status.
- `ConstraintSet`: hard constraints, preferences, permissions, exclusions and resource budget.
- `OpenIssues`: unresolved conflicts and missing context.

**Gate**
- Continue when sufficient context exists or explicit assumptions are recorded.
- Ask the user only when a missing fact would materially change the operation and cannot be safely assumed.

### Stage 02 — INTENT

**Purpose:** identify the outcome the user actually wants.

**Operations**
- Classify primary intent: RESEARCH, ENGINEERING, ANALYSIS, DECISION, CREATION, EXPLANATION or GENERAL.
- Identify secondary intents without forcing a false single category.
- Extract desired outcome, deliverable, scope, audience, time horizon, freshness, quality threshold and authorization.
- Distinguish the requested action from background explanation or examples.
- Estimate ambiguity and intent confidence.

**Outputs**
- `IntentRecord`: primary/secondary intent, objective, deliverable, scope, constraints, confidence and assumptions.
- `AcceptanceCriteria`: observable conditions that define completion.

**Gate**
- Do not proceed to execution planning while the objective or authorization is materially ambiguous.

### Stage 03 — KNOWLEDGE

**Purpose:** classify the task and activate relevant knowledge, not yet execute the task.

**Operations**
- Map the task to one or more Knowledge Domains (`KD`) and Analytical Topics (`TP`).
- Retrieve relevant validated knowledge, prior evidence, definitions, domain models and known limitations.
- Identify applicable Functional Group candidates only as a preliminary capability classification; actual execution routing occurs at Stage 05.
- Identify potentially relevant formulas (`FM`), algorithms (`AL`) and analytical operators (`OP`) without treating a candidate as canonical merely because it exists in a proposal.
- Preserve cross-domain links; do not force one topic or domain when several materially apply.
- Mark each activated record by lifecycle and evidence status: HISTORICAL, OWNER_RATIFIED, PROPOSED, NOT_RECOVERED, IMPLEMENTED, TESTED or VERIFIED as applicable.

**Outputs**
- `KnowledgeActivation`: KD/TP records, knowledge references, candidate FG, relevant FM/AL/OP references and status.
- `KnowledgeGaps`: missing definitions, missing evidence, conflicting taxonomies and unratified candidates.

**Gate**
- An unratified or proposed entry may inform a labelled design proposal, but must not be represented as canonical or verified knowledge.

### Stage 04 — RESEARCH

**Purpose:** select how the task should discover, acquire, inspect and evaluate information.

**Method selection**
- EXPLORATORY
- DESCRIPTIVE
- DIAGNOSTIC
- CAUSAL
- HISTORICAL
- COMPARATIVE
- QUANTITATIVE
- QUALITATIVE
- FORENSIC
- SYSTEMS
- STRATEGIC
- ACTION_RESEARCH

Select one or more methods according to the task. This is an extensible method catalogue, not a mandatory checklist.

**Acquisition channels**
- DIRECT
- SURFACE
- DEEP
- DARK
- LOCAL
- SOCIAL MEDIA
- ALTERNATE MEDIA
- BLOG
- MAINSTREAM MEDIA

Channels describe acquisition paths, not source credibility. For each selected channel, record whether it is eligible, available, attempted, retrieved, partially retrieved, blocked, not connected or not collected. Never silently substitute one channel for another.

**Operations**
- Formulate research questions, hypotheses, competing explanations and search concepts.
- Identify required source types, data, observation units, populations, dates, languages and denominators.
- Define acquisition order and stopping criteria.
- Determine whether primary, secondary, quantitative, qualitative or direct evidence is needed.
- Record expected evidence and known coverage limitations.

**Outputs**
- `ResearchPlan`: methods, channels, questions, source/data requirements, acquisition sequence, coverage goals and stop criteria.
- `ResearchRisks`: access, sampling, source-dependence, freshness and measurement risks.

**Gate**
- A research plan is not a retrieval receipt. Actual acquisition status is emitted only by execution.

### Stage 05 — ROUTING

**Purpose:** assign each approved task operation to a suitable functional capability and an actually available execution resource.

**Routing dimensions**
- Functional Group (`FG`) and command (`CMD`).
- Host/model capability profile.
- Tool, connector, API, local runtime or provider adapter.
- Source channel and acquisition transport.
- Required permissions, data classification and trust boundary.
- Cost, latency, context, memory, compute and reliability constraints.

**Operations**
- Resolve the best-fit FG and command handler from the task and ResearchPlan.
- Check actual host/tool availability; distinguish AVAILABLE, NOT_ASSESSED, NOT_CONNECTED, UNAVAILABLE and AUTH_REQUIRED.
- Select deterministic, model-assisted or hybrid execution paths.
- Apply capability, authorization and security checks before dispatch.
- Choose fallback only when it preserves the intended source channel and task semantics.
- Assign budgets, timeout/retry policy, checkpoint policy and idempotency requirements.

**Outputs**
- `RoutePlan`: FG/CMD mapping, adapter/tool, permissions, execution mode, budgets, fallbacks and routing rationale.
- `CapabilityReceipt`: observed capability status and observation source/time.
- `BlockedRoutes`: unavailable or unauthorized paths and their exact reason.

**Gate**
- No route may be marked operational based solely on a registry entry, model name, roadmap or documentation.

### Stage 06 — REASONING

**Purpose:** analyse the task and construct a justified, executable plan.

**Operations**
- Decompose the task into ordered, dependency-aware work units.
- Select applicable analytical operators and bind them to algorithms and formulas.
- Apply relevant reasoning mechanisms: logical, deductive, inductive, abductive, Bayesian, causal, counterfactual, temporal, strategic, game-theoretic, adversarial, probabilistic, constraint-based, multi-objective, graph-based, systems, hypothesis-testing, metacognitive, decision and feedback-based.
- Track assumptions, hypotheses, uncertainty, alternative explanations and contradictions.
- Define expected results, failure modes, stop conditions and verification tests.
- Produce a plan without presenting planned actions as completed actions.

**Outputs**
- `ReasoningPlan`: work graph, dependencies, selected OP/AL/FM, assumptions, hypotheses, expected outcomes and failure handling.
- `VerificationPlan`: claim checks, test cases, calculations, provenance checks and acceptance criteria.
- `DecisionOptions`: preliminary options only; final decision remains Stage 10.

**Gate**
- Every selected registry item must resolve to a known version and status. Missing or proposed entries must remain visibly labelled.

### Stage 07 — EXECUTION

**Purpose:** perform the routed and approved operations.

**Operations**
- Execute work units through actual host tools, APIs, connectors, code runtimes or authorized local resources.
- Capture inputs, outputs, timestamps, status, errors, retries, checkpoints and side effects.
- Preserve idempotency and avoid duplicate side effects on retries.
- Keep untrusted retrieved content isolated from control instructions.
- Distinguish planned, attempted, completed, partial, failed, blocked and not-executed actions.
- Stop or replan when authorization, safety, resource or acceptance conditions fail.

**Outputs**
- `ExecutionEvents`: ordered action records and tool receipts.
- `Artifacts`: retrieved files, code changes, calculations, outputs and other produced materials.
- `ExecutionStatus`: per-action and aggregate status.

**Gate**
- A tool call is complete only when a result/receipt is observed. A generated plan, URL or command string is not execution.

### Stage 08 — EVIDENCE

**Purpose:** consolidate the evidence generated or acquired across the entire pipeline.

**Evidence sources**
- User-supplied facts and artefacts.
- Research acquisitions and source records.
- Execution receipts, logs, API responses and test output.
- Calculations, derived datasets and analytical observations.
- Feedback and decision outcomes, with their own provenance.

**Operations**
- Preserve original source, retained raw material, extracted information, translation/OCR, interpretation, inference and conclusion as separate layers.
- Record source identity, locator, publication/event/retrieval dates, acquisition method, scope, definitions, units, denominator, source independence and limitations.
- Record hashes only when calculated from retained original bytes.
- Link claims to supporting, contradicting and contextual evidence.
- Classify claims as ESTABLISHED, CREDIBLE_SIGNAL, UNVERIFIED_HYPOTHESIS or EXPLORATORY_UNKNOWN.
- Keep data states distinct: KNOWN, UNKNOWN, ZERO, NOT_COLLECTED, UNAVAILABLE and NOT_APPLICABLE.

**Outputs**
- `EvidenceBundle`: claim-evidence graph, provenance, raw/derived artefact references and coverage.
- `ContradictionRegister`: competing claims, source dependencies and resolution needs.
- `EvidenceGaps`: missing observations, unavailable channels and unresolved provenance.

**Gate**
- No unsupported inference is promoted to fact. Repeated derivatives of one original source are not independent corroboration.

### Stage 09 — VERIFICATION

**Purpose:** independently test whether execution and evidence satisfy the user's acceptance criteria.

**Verification dimensions**
- Intent and scope fidelity.
- Source authenticity, provenance, date, population, denominator and independence.
- Claim-to-evidence traceability and contradiction handling.
- Logical consistency, assumptions, alternative explanations and uncertainty.
- Arithmetic, units, transformations and statistical validity.
- Code, schema, unit, integration, acceptance and security tests where relevant.
- Tool execution receipts, side effects, persistence and state changes.
- Deliverable completeness, format and usability.

**Operations**
- Run the VerificationPlan using checks independent of the original assertion where feasible.
- Record each check as PASS, FAIL, PARTIAL, BLOCKED or NOT_APPLICABLE with evidence.
- Identify the smallest failed stage and route for correction.
- Re-run only affected checks after correction; preserve prior failures and results.

**Outputs**
- `VerificationReport`: checks, results, evidence, confidence, residual risk and acceptance status.
- `CorrectionRoutes`: exact stage(s) requiring re-entry.

**Gate**
- Stage 10 may proceed only when decision-critical checks pass or the user explicitly accepts a documented residual uncertainty. Failed critical checks block the decision.

### Stage 10 — DECISION

**Purpose:** choose the next action from verified findings and explicit constraints.

**Operations**
- Compare options against objectives, hard constraints, expected utility, cost, risk, reversibility, dependencies and time.
- Separate evidence-backed findings from assumptions and preferences.
- Identify no-action, defer, gather-more-evidence and execute options where relevant.
- Select a recommendation or action only within the user's authorization.
- Record why alternatives were rejected and what new evidence would change the decision.

**Outputs**
- `DecisionRecord`: selected option, rationale, evidence links, assumptions, confidence, residual risk, authorization and next actions.
- `DecisionStatus`: APPROVED, CONDITIONAL, DEFERRED, REJECTED or USER_AUTHORIZATION_REQUIRED.

**Gate**
- RIGOR-X may recommend; it must not perform an irreversible or externally consequential action without the required user authorization.

### Stage 11 — FEEDBACK

**Purpose:** learn from user feedback, verified outcomes and execution performance without corrupting memory or canonical knowledge.

**Feedback types**
- User correction, approval, rejection or preference.
- Execution success/failure and measured performance.
- Verification defects and missed evidence.
- Decision outcomes and post-action observations.
- Newly discovered domains, topics, methods, actors or dependencies.

**Operations**
- Compare expected and observed outcomes.
- Identify root causes, model/routing/method errors and recurring failure patterns.
- Update task-local context immediately where appropriate.
- Propose durable memory, knowledge, registry or policy changes with provenance and versioning.
- Promote a candidate to validated knowledge only after the relevant review/ratification gate.
- Adjust budgets, routing weights and method selection from measured results, not anecdote alone.
- Close the task or reopen the smallest affected stage.

**Outputs**
- `FeedbackRecord`: source, type, observation, proposed correction and confidence.
- `LearningProposal`: versioned change proposal with evidence and approval requirement.
- `ContextUpdate`: approved task/session context changes.
- `NextIteration`: CLOSED, REOPEN_CONTEXT, REOPEN_KNOWLEDGE, REOPEN_RESEARCH, REOPEN_ROUTING, REOPEN_REASONING, REEXECUTE or REVERIFY.

**Gate**
- Feedback is not automatically truth. User corrections update the task's user-defined requirements; empirical claims still require evidence. Durable policy/registry changes require their defined approval process.

## 4. Cross-stage evidence capture

Evidence capture is a cross-cutting service, not a task postponed until Stage 08.

| Stage | Evidence emitted |
|---|---|
| CONTEXT | Memory/source references, versions, relevance and conflict flags |
| INTENT | Original request, intent classification, assumptions and acceptance criteria |
| KNOWLEDGE | Registry IDs, versions, lifecycle status and retrieval provenance |
| RESEARCH | Search/acquisition plan and actual channel status |
| ROUTING | Capability observations, route decisions and permissions |
| REASONING | Assumptions, hypotheses, method/operator/algorithm/formula selections |
| EXECUTION | Tool receipts, logs, outputs, errors, checkpoints and side effects |
| EVIDENCE | Consolidated claim-evidence graph and provenance bundle |
| VERIFICATION | Test/check results and residual risks |
| DECISION | Decision rationale, authorization and outcome criteria |
| FEEDBACK | Corrections, measured outcomes and approved learning changes |

## 5. Feedback and recovery routing

The controller must return to the smallest stage that can resolve the defect:

| Trigger | Re-entry stage |
|---|---|
| Missing or stale prior context | CONTEXT |
| Misunderstood user objective | INTENT |
| Wrong domain/topic or missing knowledge | KNOWLEDGE |
| Wrong research method/channel or inadequate coverage | RESEARCH |
| Unavailable or unsuitable tool/FG | ROUTING |
| Invalid inference, causal model or plan | REASONING |
| Execution error or incomplete side effect | EXECUTION |
| Missing/contradictory source material | RESEARCH or EVIDENCE, as applicable |
| Failed claim/test/provenance verification | Smallest implicated stage, then VERIFICATION |
| Decision changed by new verified information | DECISION |
| User correction or observed outcome | FEEDBACK, then smallest implicated stage |

Every re-entry records `parent_run_id`, `from_stage`, `to_stage`, `trigger`, `reason`, `attempt` and `budget_remaining`.

## 6. Runtime state model

A run has one current stage and one aggregate state:

- `CREATED`
- `IN_PROGRESS`
- `WAITING_FOR_USER`
- `PARTIAL`
- `BLOCKED`
- `FAILED`
- `VERIFICATION_FAILED`
- `DECISION_PENDING`
- `COMPLETED`
- `CANCELLED`

Each stage has one state:

- `NOT_STARTED`
- `READY`
- `IN_PROGRESS`
- `COMPLETED`
- `PARTIAL`
- `BLOCKED`
- `FAILED`
- `SKIPPED_WITH_REASON`

A stage may be skipped only when its contract explicitly allows it and a reason is recorded. Verification cannot be skipped for consequential execution. Decision can be deferred. Feedback may close with no durable learning proposal.

## 7. Required run envelope

Every runtime run must be traceable through a versioned envelope containing at least:

- `run_id`, `parent_run_id`, `pipeline_version`, `created_at`, `updated_at`;
- original request reference and normalized intent;
- context snapshot and constraint-set references;
- selected KD/TP/FM/AL/OP/FG/CMD IDs and their versions/statuses;
- research methods and nine-channel acquisition ledger;
- route plan and actual capability receipts;
- reasoning plan and dependency graph;
- execution events, tool receipts, artifacts and side-effect records;
- evidence bundle and contradiction register;
- verification report and acceptance state;
- decision record and authorization state;
- feedback records, learning proposals and re-entry history;
- budgets, attempts, stop reason and final status.

Do not store hidden chain-of-thought. Store auditable decisions, concise rationales, structured assumptions, source links, tool receipts and validation results.

## 8. Mapping to canonical inventory

| Inventory | Primary pipeline use |
|---|---|
| 36 Knowledge Domains | KNOWLEDGE classification and activation |
| 111 Analytical Topics | KNOWLEDGE scope and cross-domain mapping |
| 30 Formulas | KNOWLEDGE activation; REASONING and VERIFICATION use |
| 33 Algorithms | KNOWLEDGE activation; REASONING plan and EXECUTION binding |
| 15 Analytical Operators | KNOWLEDGE activation; REASONING composition |
| 18 Functional Groups | Preliminary classification in KNOWLEDGE; actual dispatch in ROUTING |
| 999 Slash Commands | ROUTING command resolution; execution only when a compatible handler exists |
| 102 Interface/Operational Commands | Host/interface control layer; separate from the 999 research corpus until owner-approved reconciliation |
| 6 Adaptive Intensity Levels | Controller policy across all stages |
| 9 Research Acquisition Channels | RESEARCH planning and EXECUTION acquisition; EVIDENCE records actual status |

Inventory cardinality never implies item-level recovery, owner ratification, implementation or verification.

## 9. Adaptive intensity

The owner's six levels apply across the pipeline:

- L01 BASIC
- L02 STANDARD
- L03 DEEP
- L04 COMPLEX
- L05 CRITICAL
- L06 HYPER RIGOROUS

Intensity controls the depth, breadth, independent checks, evidence threshold, adversarial review and resource budget. It does not change the stage order or authorize unavailable capabilities. The controller selects the minimum sufficient level unless the user explicitly requests a higher level.

## 10. Acceptance criteria for implementation

The pipeline is not runtime-complete until all of the following are evidenced:

1. Typed contracts exist for all 11 stages and the run envelope.
2. A deterministic state machine enforces forward stage order and allowed re-entry.
3. Every stage emits structured events and preserves provenance.
4. Evidence capture operates across all stages, not only at Stage 08.
5. Research method selection and nine-channel acquisition status are separate.
6. Routing checks actual host/tool capability and authorization before dispatch.
7. Registry references are versioned and status-aware.
8. Verification gates decision-critical actions.
9. Feedback updates are provenance-linked and promotion-controlled.
10. Retry, recursion, time, token, tool and cost budgets have explicit stop conditions.
11. Unit, integration, acceptance, adversarial and failure-recovery tests pass.
12. Repository documentation and implementation status match observed test and runtime receipts.

**Current implementation status:** specification authored; runtime implementation, automated tests and CI execution remain NOT VERIFIED until separately implemented and observed.
