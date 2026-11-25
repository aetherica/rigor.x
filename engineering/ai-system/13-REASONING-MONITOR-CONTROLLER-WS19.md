# WS19 — Reasoning Monitor, Controller & Adaptive Mechanism Selection

**Status:** Experimental implementation; CI verification pending. **Branch:** main, no branch created.

## Pre-algorithm review
Reviewed the WS16 guard, WS17 engineering standards, WS18 taxonomy, cognitive architecture, reasoning-control specification, and experiment plan. The current normalized-repeat guard is reused, not reimplemented. WS19 does not claim model-hidden-state access or pipeline integration.

## Components
- `ReasoningController`: composes WS16 repeat/progress/budget guard with lexical-overlap advisory and bounded recovery.
- `SemanticLoopMonitor`: sliding-window token-set Jaccard. It is a lexical heuristic, **not semantic understanding**.
- `MechanismSelector`: candidate selection from task class, intensity, uncertainty, risk, evidence requirement, time sensitivity and declared mechanism availability.
- Immutable typed `TaskProfile`, `MechanismPlan`, `ControllerReceipt` and signal records.

## Mechanism families
Structured decomposition; evidence search; causal/counterfactual; probabilistic; constraint optimization; temporal/sequential; tool-augmented; strategic/systems; creative divergence.

Mechanism selection produces a plan only. It does not execute tools, switch models, inspect hidden reasoning or imply a capability that caller availability excludes.

## Controller priority
1. Step-budget stop.
2. Exact normalized-repeat stop.
3. Progress-stall stop.
4. Exact-repeat diversify signal.
5. Lexical overlap: diversify/replan while recovery budget remains; stop signal only when the bounded recovery budget is exhausted.
6. Otherwise continue.

A controller stop is a control-plane receipt, not proof of model-level termination.

## Test/benchmark result (local isolated run)
- 14 controller/selector unit tests + 1 fixture benchmark test passed.
- Eight hand-authored paired fixtures at Jaccard threshold 0.88: TP=2, FP=0, TN=3, FN=3; precision=1.00, recall=0.40, FPR=0.00.
- Small, unblinded fixture only; no production or generalization claim. Three paraphrase-style loop cases are missed.

## Gates / limitations
Not pipeline-integrated. No executor, provider/model adapter, hidden-state access or automatic replanning. Lexical signal can false-positive/false-negative. Integration requires larger diverse evaluation, false-stop impact measurement, ablation, cost/latency, repeatability and review.
