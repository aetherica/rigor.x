# Session Handoff — 2026-11-26 (WS32 major upgrade: P0 → P5)

Read with [27](27-COGNITIVE-OS-REASSESSMENT-2026-11-26.md) (audit and roadmap), [28](28-ENGINE-PROTOCOL-V2.md) (protocol 2, ADR-012), [29](29-TOPIC-MEMORY.md) (topic memory), [30](30-THREAT-MODEL-AND-OPERATIONS.md) (threat model, autonomy, observability, evaluation). Tags: [A] verified this session, [B] cited, [C] judgment.

## 1. Owner decisions recorded on 2026-11-26

| Topic | Decision |
|---|---|
| Merging | Merge every finished work package to `main` immediately (standing instruction) |
| Owner-side actions | Collect them and give them once, at the end |
| N1 availability | Move to Workers Paid — but only after the work is 100 % finished |
| Quota numbers | Decide together with the Workers Paid discussion; until then provisional Worker vars |
| P0 order | Approved: quotas before MCP 2026-07-28 |
| Stages | Twelve separate stages, never merged (ADR-002 interpretation confirmed) |
| N2, N3 | Fix (done); N5: the simplest, fastest fix (done: in-repo `tsc`) |

## 2. What is live (main = `d52da24`, auto-deployed)

| Area | State | Evidence |
|---|---|---|
| Auth | OAuth only; spike token code and dead Python Worker removed | live 401 probes; CI auth probe under `wrangler dev` [A] |
| Engine | Protocol 2.0.0, gate 2.0.0; protocol-1 runs read-only | full L02 run to COMPLETED through the Claude connector on production [A] |
| MCP | 2025-11-25/06-18/03-26 handshake and 2026-07-28 stateless | official SDK 2.3.0 in auto, legacy and modern modes (CI) [A] |
| Tools (21) | route, resolve_commands, start/get/submit/record/report/verify/reenter/cancel/delete, list_runs, usage, compute, check_source, memory_topic/write/recall/delete, humor_policy, profile | `rigorx_resolve_commands` live-tested; the rest tested on workerd or in unit/conformance tests [A] |
| Storage | Schema version 3 (runs, usage, profile, memory with FTS5 trigram) | migration v1→v3 on workerd; profile ID change seen live [A] |
| Quotas | Per-owner calls/day 2000, runs/day 100, stored runs 500, burst 120/min, memory 120 MB (provisional) | unit + workerd tests [A] |
| Multilingual | zh/ja/th summaries accepted (N3); dense scripts count two units for minimum length; unknown-signal tasks need declared level and stakes (N2) | live (N3) and tests [A] |

## 3. Tests at `d52da24` (local; CI runs the same on every push)

TypeScript 78/78 · tsc --strict clean · conformance 5 scenarios · memory benchmarks: development recall@3 1.000 / MRR 1.000, held-out 1.000 / 1.000, abstention 3/3 each · compute vs pint 23 cases, worst relative difference 8.8e-13 · slash resolver vs frozen Python 13 prompts, no difference · workerd integration 5/5 · auth probe 6/6 · SDK smoke COMPLETED · Python 204 OK · ruff clean. GitHub CI was green for every merged commit checked (WP1–WP5); later runs were queued at the time of writing. [A]

## 4. Not done, and why

| Item | Status | Reason / next step |
|---|---|---|
| Live runs of compute, check_source, memory and humor through Claude/ChatGPT | UNVERIFIED live | Hosts cache tool lists; needs a connector refresh (owner). Covered on workerd and by tests. |
| Acceptance test #3 via ChatGPT on protocol 2 | Not run | Owner's parallel tester; suggested scenario: Test A and Test B fixtures as prompts |
| RCWA TM factorisation and mis-targeted citation (EUV test) | Not detectable | Domain rule (Li's factorisation) and source-content review; no structural check can catch them |
| Larger memory evaluation (LongMemEval-style temporal, multi-session, updates) | Partial | 19 queries in 16 languages so far; build a larger labelled set |
| OpenTelemetry GenAI, calibration metrics | Deferred (C) | No consumer yet; calibration needs outcome feedback the protocol does not collect |
| A2A | Not implemented (C) | No use case |
| Python engine `src/rigorx/host_engine.py` | Frozen protocol-1 reference | Retire with the local `rigorx-mcp` command when the owner decides |
| `decided_by`, `USER_APPROVAL` | Host-declared | The engine cannot observe the user; recorded and enforced as declared |

## 5. Owner actions (one batch)

1. Cloudflare dashboard → Workers & Pages → `rigorx-mcp` → Settings → Variables and Secrets: delete `RIGORX_SPIKE_TOKEN` and `ALLOWED_EMAILS` (the code reads neither).
2. Refresh the RIGOR-X connector in Claude (Settings → Connectors) and in ChatGPT (developer-mode connector), so they load the 21 tools and the protocol-2 parameters.
3. When the work is accepted: Workers Paid, then fix the quota numbers (measured: start_run writes 5 rows, other writes 3, reads 0).
4. Optional: old protocol-1 test runs are read-only; delete them with `rigorx_list_runs` + `rigorx_delete_run`.
