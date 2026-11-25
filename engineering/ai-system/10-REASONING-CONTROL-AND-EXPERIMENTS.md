# Reasoning Control & Experimental Engineering

Status: EXPERIMENTAL SPECIFICATION + FIRST DETERMINISTIC GUARD IMPLEMENTATION
Workspace: engineering/ai-system/
Canonical branch: main (no secondary branches)

## Objective
This project experiments with command-governed functional intelligence intended to detect and contain hallucination, reasoning loops, context drift, memory contamination, premature closure, contradictions and execution failures. These are engineering targets, not a guarantee of permanent elimination.

## Non-negotiable controls
1. Generation is not verification; model output is not self-authenticating evidence.
2. Iterative mechanisms have explicit step/time/token/tool budgets and stop conditions.
3. Loop detection is a signal, not proof of incorrect reasoning.
4. Progress metrics must be explicit and comparable; never fabricate them.
5. Memory records carry type, scope, version, provenance and epistemic status.
6. UNKNOWN, ZERO, NOT_COLLECTED, UNAVAILABLE and NOT_APPLICABLE remain distinct.
7. Claims link to evidence or are labeled inference/hypothesis.
8. Failed checks trigger bounded recovery/diversification; exhausted budgets stop.
9. Host-level and model-internal capabilities are separate; hidden internals are not presumed accessible.
10. Experiments require baseline, ablation, repeatability, regression tests and recorded outcomes.

## Failure classes and controls
| Failure | Control | Residual risk |
|---|---|---|
| Hallucination | Claim/evidence gate, provenance, independent validation | Evidence may be flawed |
| Repeated loop | State fingerprint, threshold, budget | Paraphrased semantic loops may evade |
| Stalled progress | Explicit progress metric + window | Metric may be weak |
| Context drift | Typed snapshots, constraints, freshness | Missing/conflicting context |
| Memory contamination | Type, scope, provenance, conflict status | Extraction/source error |
| Premature conclusion | Sufficiency gate, alternatives, counter-evidence | Gate quality |
| Contradiction | Contradiction register, temporal/source reconciliation | Incomplete detection |
| Tool failure | Receipt, bounded retry, idempotency, rollback | External non-transactional effects |

## First increment: reasoning_guard.py
Implemented deterministic normalized-state fingerprints, hard step budget, repeat warning/stop threshold, optional progress window and structured decision receipt. It is intentionally not integrated into the main pipeline yet. It does not prove answer correctness or automatically change the strategy.

## Planned mechanism subsystem
Monitor, Controller, Executor, Evaluator and bounded state interface. Mechanism families: logical; structured search; causal/counterfactual; probabilistic; constraint/optimization; temporal/sequential; tool-augmented; strategic/systems. Selection adapts to task, risk, evidence, capabilities, cost and L01-L06.

## Evidence-gate target contract
Material claims record ID, type, evidence references, source-dependence, scope/time, status, uncertainty, counter-evidence and validation. Status values: UNSUPPORTED, SUPPORTED, CONTRADICTED, UNCERTAIN, NOT_APPLICABLE. Model confidence alone cannot promote a claim.

## Memory integrity target
Typed, scope-bound memory (decision, preference, fact/source, task state, hypothesis, transient context) with provenance, timestamps, version, expiry/review, status and conflict links. Relevance and truth are evaluated independently. Conflicts are preserved, not silently overwritten.

## Evaluation
Freeze baseline and adversarial tests. Measure detection precision/recall, false-stop rate, latency/cost, recovery success. Test Unicode, paraphrases, repetition, misleading progress, budget exhaustion. Record code version, configuration, dataset hash and receipt. Promote only after repeatable results.

## Status
- Deterministic loop/progress guard: implemented; baseline CI verified, WS19 hardening CI pending.
- Pipeline integration: not implemented.
- Lexical-overlap loop signal: implemented experimentally in WS19, opt-in only; it is not semantic equivalence detection.
- Evidence gate: specified, not implemented.
- Typed memory conflict system: specified, not implemented.
- Mechanism selector/controller: implemented experimentally in WS19; plans only, not integrated or executed.
- Neural capability interface: capability boundary specified; model internals not presumed.

## Standards applicability (reference, not certification)
Map controls to ISO/IEC 25010, ISO/IEC/IEEE 29148, ISO/IEC/IEEE 42010, ISO/IEC 27001/27002, NIST AI RMF, NIST SSDF, OWASP practices, JSON Schema 2020-12 and reproducible CI. No certification/conformance claim.

## Acceptance
Deterministic outputs; loop, stall and hard-budget tests; reject empty/non-finite inputs; preserve existing pipeline/storage contracts; CI and Ruff pass. Distinguish implemented vs planned.
