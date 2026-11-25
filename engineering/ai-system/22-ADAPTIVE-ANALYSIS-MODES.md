# WS28 — Adaptive Analysis Modes

## Modes supported
1. EXPLORATORY
2. DESCRIPTIVE
3. DIAGNOSTIC
4. CAUSAL
5. HISTORICAL
6. COMPARATIVE
7. QUANTITATIVE
8. QUALITATIVE
9. FORENSIC
10. SYSTEMS
11. STRATEGIC
12. ACTION_RESEARCH

## Selection
The deterministic router selects one or more modes from inspectable prompt signals. If no mode-specific signal is found, it uses the task-intent default. Selected modes and trigger signals are included in AdaptiveProfile, model context, agent result and pipeline artifacts.

This is a lexical baseline, not a validated semantic classifier. Host/model reasoning may refine the analysis approach, and explicit intensity overrides remain available.
