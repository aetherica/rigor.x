# WS27 — AgentPipeline Integration

## Scope
AgentRuntime executes one bounded model/tool loop. AgentPipeline adds the deterministic 11-stage state machine, stage artifacts, persistence, evidence ledger references and a verification gate.

## Stage handling
- CONTEXT: store prompt digest and length only; raw prompt is not persisted.
- INTENT: adaptive profile and override.
- KNOWLEDGE: optional 36-domain activation with provenance.
- RESEARCH: explicitly `SKIPPED_WITH_REASON` until dedicated source-acquisition planner exists.
- ROUTING: available tool names and granted capability names.
- REASONING: actual model/tool loop.
- EXECUTION: reconcile execution receipts; do not replay actions.
- EVIDENCE: store response/tool receipt IDs and hashes; raw tool output not stored.
- VERIFICATION: deterministic acceptance criteria.
- DECISION: reached only when verification passes.
- FEEDBACK: timing, turns, calls, verification and re-entry metrics.

## Verification gates
- Agent status must be COMPLETED and response non-empty.
- Tool call count must reconcile with receipts.
- Every attempted tool receipt must be EXECUTED and include a returned output.
- Execution-intent requests require at least one successful action receipt.
- Research-intent requests require successful source-acquisition receipt from a registered tool whose name signals search/web/browser/research/fetch/source/crawl.
- Any failure prevents DECISION and sets pipeline status `VERIFICATION_FAILED`.

These checks are conservative and not semantic fact verification. A real research/evidence verifier remains future work.

## Storage and privacy
SQLite snapshots/events persist transitions and metadata. Raw prompt and raw tool outputs are not written into the pipeline ledger; only hashes, lengths, IDs and status metadata. The outcome object in memory contains the model response and tool receipt outputs, so callers remain responsible for handling that returned data securely.

## CLI
`rigorx-agent` now executes through AgentPipeline and persists to SQLite. Default database is `~/.local/share/rigorx/runs.sqlite`, override with `--database` or `RIGORX_DATABASE`.
