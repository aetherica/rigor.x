# WS23 — Adaptive Intent & Intensity Router

## Purpose
Route each request to a proportionate initial processing profile before model execution. This router is deterministic and inspectable; it is a pre-routing heuristic, not an AI semantic classifier.

## Supported profile fields
- Task intent: INFORMATION, RESEARCH, ANALYSIS, DECISION, EXECUTION, CREATIVE, TECHNICAL, COMMUNICATION, UNKNOWN.
- Adaptive intensity: L01 BASIC, L02 STANDARD, L03 DEEP, L04 COMPLEX, L05 CRITICAL, L06 HYPER RIGOROUS.
- Method set, trigger signals, risk score, explicit-override flag.

## Selection
- Short simple information request → L01.
- Standard request → L02.
- Research, analysis, decision or complexity signals → L03.
- Complex technical/execution request → L04.
- Risk-related cues (health, legal, finance, security, safety, credentials, production, irreversible actions) → L05.
- Explicit hyper-rigorous/red-team/forensic/full-audit cues → L06.
- User override can set any level.

The route is included in the model context as a provisional heuristic profile and in `AgentResult` receipts. The model may refine the task, but the profile itself is observable.

## Limitations
- Text patterns can misclassify; no benchmark-based accuracy claim.
- Risk score is a cue count, not a calibrated probability.
- This increment does not yet activate the 36 Knowledge Domains or dynamic domain ontology.
- It does not replace capability/permission gates, tool verification or user authorization.
