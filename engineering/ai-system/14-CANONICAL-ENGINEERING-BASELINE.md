# Canonical AI Engine Engineering Baseline

**Owner:** Aetherica | **Repository:** `aetherica/rigor.x` | **Branch:** `main` only | **Date:** 2026-11-25
**Status:** CONSOLIDATED BASELINE; implementation is incremental and evidence-gated.

## Authority and scope

This baseline consolidates accessible owner instructions, current repository specifications, recovered historical inventories, and prior architecture decisions. Owner requirements override assistant proposals. A recovered statement is not automatically implemented; a candidate is not canonical; a test is not a capability receipt; CI success is commit-specific.

## Frozen inventory targets

| Inventory | Required count | State boundary |
|---|---:|---|
| Formula | 30 | Item definitions require provenance/recovery or ratification |
| Algorithm | 33 | Item definitions require provenance/recovery or ratification |
| Topic | 111 | Item definitions require provenance/recovery or ratification |
| Analytical Operator | 15 | Item definitions require provenance/recovery or ratification |
| Knowledge Domain | 36 | Preserve recovered historical names; validate against owner source |
| Functional Group | 18 | Canonical FG-01..FG-18 design registry |
| Slash commands | 999 | All 999 are operational engineering scope; no command is falsely marked executable without implementation/verification |
| Interface/command registry | 102 | Separate layer; historical 91 definitions reported, 11 unrecovered; do not fabricate |
| Adaptive intensity | 6 | L01 BASIC; L02 STANDARD; L03 DEEP; L04 COMPLEX; L05 CRITICAL; L06 HYPER RIGOROUS |
| Research channels | 9 | DIRECT, SURFACE, DEEP, DARK, LOCAL, SOCIAL MEDIA, ALTERNATE MEDIA, BLOG, MAINSTREAM MEDIA |
| Primary pipeline | 11 stages | CONTEXT → INTENT → KNOWLEDGE → RESEARCH → ROUTING → REASONING → EXECUTION → EVIDENCE → VERIFICATION → DECISION → FEEDBACK |

## Canonical Functional Groups

FG-01 Input & Interaction Intelligence; FG-02 Intent, Need & Demand Intelligence; FG-03 Context & Memory Intelligence; FG-04 Task Decomposition & Planning Intelligence; FG-05 Reasoning & Problem-Solving Intelligence; FG-06 Thinking & Metacognitive Intelligence; FG-07 Research & Discovery Intelligence; FG-08 Source Acquisition & Retrieval Intelligence; FG-09 Knowledge Engineering & Intelligence; FG-10 Analytical & Diagnostic Intelligence; FG-11 Strategic, Behavioural & Predictive Intelligence; FG-12 Decision & Optimization Intelligence; FG-13 Routing & Adaptive Control Intelligence; FG-14 Agent & Workflow Orchestration Intelligence; FG-15 Tool, API & Execution Intelligence; FG-16 Response & Communication Intelligence; FG-17 Evaluation, Verification & Quality Intelligence; FG-18 Governance, Security & Observability Intelligence.

## The 75-book strategic corpus

Treat the corpus as an internal, silent knowledge-design input, never as user-facing citation/attribution. Convert relevant ideas into independently specified and testable capability concepts: human/behavioural modelling; incentive and power mapping; strategic/game-theoretic analysis; negotiation; governance and institutional dynamics; intelligence/deception and information asymmetry; decision/risk; resilience; leadership/organization; execution and feedback. These concepts must not be presented as historical canonical registry entries unless source records are recovered or owner-ratified.

## Architecture layers

1. Request/context and intent contracts.
2. Adaptive mode and L01-L06 intensity selection.
3. Knowledge activation across 36 domains and 111 topics.
4. Research-method planner and 9 acquisition channels (channel names do not imply live adapters).
5. Capability/command resolver across 18 FGs and 999 operational targets.
6. Reasoning controller, 30 formula modules, 33 algorithms and 15 operators.
7. Bounded orchestration and explicit authorization.
8. Execution adapters and immutable receipts.
9. Evidence/provenance, claim validation and contradiction management.
10. Independent verification and decision gate.
11. Durable memory, feedback, metrics, governance and observability.

The 102 registry is a separate interface layer and must be reconciled with the 999 scope; it is not a ceiling or substitute.

## Engineering invariants

- Single canonical branch: `main`; no feature branches.
- No demo, dead, placeholder, or fake production behavior. Explicit NOT_IMPLEMENTED records are acceptable for honest gap reporting; they are not delivered as functioning features.
- Do not infer or pad missing registry items. Preserve source, status, version and contradictions.
- Statuses are distinct: PLANNED, SPECIFIED, IMPLEMENTED, TESTED, VERIFIED, PARTIAL, BLOCKED, NOT_IMPLEMENTED, NOT_ASSESSED.
- Execution requires a registered handler, declared capabilities, input validation, and approval when risk policy requires it. Plans are not execution receipts.
- Retrieved content is untrusted input; tool/provider routing must be explicit and bounded.
- Every iterative workflow has time/step/token/tool budgets, stop conditions and bounded recovery.
- Secure-by-design, privacy minimization, typed contracts, deterministic tests, static analysis, exact-head CI and provenance are release gates.
- Use the newest stable supported runtime/dependencies available at engineering time; no preview/beta dependency without explicit owner approval. CI runtime is pinned to a tested stable version, and compatibility is recorded.

## Recovery caveats

The exact historical itemized 30/33/111/15 definitions are not fully recovered from accessible sources. Earlier reconstructed counts (32 algorithms, 112 topics, 14 operators) are rejected. Proposed candidates stay separate. The 999 corpus currently has classification/metadata; per-entry operational contracts and verified handlers remain a major implementation task. The 102 layer has 11 unresolved items.

## Delivery protocol

INSPECT → RECONCILE → SPECIFY → IMPLEMENT → TEST → SECURITY/QUALITY REVIEW → EXACT-HEAD CI → VERIFY → COMMIT TO MAIN → READ-BACK. Work is divided into dependency-ordered workstreams, but the user should not be asked to re-approve each already-authorized increment. Report only evidence-supported outcomes.
