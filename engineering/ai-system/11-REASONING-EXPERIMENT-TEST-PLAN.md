# Reasoning Experiment Test Plan

Regression coverage includes normalized fingerprints, repeat warning/stop, exact hard-step ceiling, terminal latching/reset, stall window, progress improvement, non-finite rejection, distinct-state counting, strict task profiles, capability-unavailable plans, semantic monitor window/index and explicit opt-in/ablation.

Metrics: exact-loop detection; false-stop rate; stall detection latency; budget compliance; adversarial Unicode/punctuation/paraphrase; future evidence coverage, source independence, contradiction recall; memory provenance/scope/conflict integrity.

| Experiment | Baseline | Treatment | Acceptance |
|---|---|---|---|
| Exact loop | Unbounded | Fingerprint guard | Detect normalized exact repeats at configured threshold |
| Progress stall | No controller | Rolling metric | False-stop measured on valid flat-progress tasks |
| Semantic loop | None | Embedding/semantic detector | Precision/recall and cost demonstrated before adoption |
| Context drift | Raw context | Typed snapshot/constraints | Retention and stale-context error measured |
| Memory conflict | Last-write-wins | Conflict-aware | No silent conflict destruction |
| Evidence gate | Free-form | Claim-evidence validation | Unsupported claims flagged; calibration evaluated |
| Recovery | Unbounded retry | Budget + diversify | Hard ceiling; recovery success measured |

Passing unit tests is not production reliability proof. CI, benchmark evidence and integration acceptance are separate gates.
