# WS32 — Major Upgrade: Specification and Architecture Decision Records

**Status:** DRAFT for owner review · **Date:** 2026-11-25 · **Scope:** "everything of an AI system except the weights" around the live RIGOR-X MCP plugin.

Evidence tags (RIGOR-X convention): **[A]** verified in this repository or on the live server on 2026-11-25; **[B]** established source or standard; **[C]** design judgment or unverified.

## 0. Findings this specification responds to

1. **Verification integrity** — criteria are authored by the host at verification time; gate strictness depends on a keyword-routed intent; every pre-verification stage can be skipped. A run with a 10⁵ unit error passed the gate (ChatGPT acceptance test #2). [A]
2. **Survival and safety** — a static shared token grants permanent access; no quotas or rate limits; requests carrying `MCP-Protocol-Version: 2026-07-28` are rejected with 400 (`deploy/cloudflare-ts/src/mcp.ts`, `handleHttp`). [A]
3. **Structural debt** — two engines (Python, TypeScript) and two orchestration paths; whole-run snapshot rewritten on every call (O(n²) per run); auth path untested in CI; dead Python Worker; stale README. [A]
4. **Promise gap** — the draft Aetherica brief promises validation against the original objective (§11), capability awareness (§09.4), proportional intensity (§09.2), evidence status (§10), decomposition (§09.5) and continuity; none is implemented. [A]
5. **Memory feasibility** — per-owner Durable Object SQLite with an FTS5 `trigram` index matched 8/8 multilingual test queries in local workerd; the default `unicode61` tokenizer splits Bengali words into fragments. [A]

## ADR-001 — Language strategy: one canonical implementation per component

**Decision (owner):** polyglot and need-driven — TypeScript, Python or Rust wherever each fits, only as much as needed.

**Rule [C]:** every component has exactly **one** canonical implementation, written in the language of the runtime that executes it; other runtimes call it through a protocol, they do not re-implement it. A language-neutral **conformance suite** (JSON fixtures + expected results, evolved from `test/fixtures/parity.json`) is the contract.

| Component | Canonical | Why |
|---|---|---|
| Plugin engine, memory, gate, auth | TypeScript (Workers; same code on Node for local use) | It is what runs in production; Node already runs it locally (`scripts/dev-server.ts`, `node:sqlite`) [A] |
| Local agent runtime, CLI, analysis and research tooling | Python | Existing, standard-library only |
| Hot numeric kernels (only if profiling shows a need) | Rust → WASM | Not needed today: 5,000×512 scoring took ~3 ms [A] |

The Python host engine becomes the reference for the conformance suite until the suite stands alone, then it is retired (decision point at end of P1).

## ADR-002 — Twelve-stage pipeline (engine protocol v2)

**Decision (owner):** 12 stages in the sequence of the Aetherica brief.

| # | Stage | Contract (what the host must submit) | From the 11-stage pipeline |
|---|---|---|---|
| 1 | QUERY | Context summary; relevant topic memory is offered by the engine | CONTEXT |
| 2 | CLASSIFY | Objective, deliverable and **pre-registered requirements** (ADR-005) | INTENT |
| 3 | SELECT_METHODS | Methods and required knowledge | KNOWLEDGE + route methods |
| 4 | ASSESS_COMPLEXITY | Confirm or **raise** the level (never lower) | new |
| 5 | IDENTIFY_CAPABILITIES | Capability declaration and gaps (ADR-006) | half of ROUTING |
| 6 | PLAN | Operations, dependencies, parallel groups, completion conditions (ADR-006) | half of ROUTING |
| 7 | EXECUTE | Actions, sources and computations, each with a receipt | RESEARCH + REASONING + EXECUTION |
| 8 | EVALUATE_EVIDENCE | Claim statuses, contradictions, assumptions | EVIDENCE |
| 9 | VALIDATE | Gate (ADR-005, ADR-007) | VERIFICATION |
| 10 | STRESS_TEST | Counter-arguments and failure scenarios | new |
| 11 | OPTIMIZE | Revisions from the stress test | new |
| 12 | DELIVER | Result, assumptions, risks, limitations; topic memory captured | DECISION + FEEDBACK |

- Owner's answer on protocol v1 runs (2026-11-25): «১২ টি আলাদা ধাপেই হবে» ("it will be in 12 separate stages"). **Interpretation to confirm before P1:** (a) the twelve v2 stages stay distinct — no stage is merged or folded into another; (b) v1 runs (11 stages, test runs only so far) are not kept alive as 11-stage runs. Until confirmed, v1 runs are read-only and every new run uses v2. [C]
- `engine_protocol_version` is stored per run; the conformance suite covers both.

## ADR-003 — Level-dependent stage policy

**Decision (owner):** agreed. Levels stay six (`L01_BASIC` … `L06_HYPER_RIGOROUS`).

| Level | Mandatory stages (others are auto-skipped with a recorded reason) | Extra gate rules |
|---|---|---|
| L01 | 1, 2, 7, 12 | none |
| L02 | + 6, 9 | requirements coverage |
| L03 | + 3, 5, 8 | claim status required for cited evidence |
| L04 | + 4, 11 | assumptions register required |
| L05 | all 12 | stress test with ≥1 failure scenario per decision-critical requirement |
| L06 | all 12 | ≥2 independent sources per passed requirement; numeric claims must cite `rigorx_compute` receipts |

Intent and level can only be raised by the host, never lowered below the router's result (closes finding 1). [C]

## ADR-004 — OPTIMIZE → VALIDATE loop guard

**Decision (owner):** returning to VALIDATE is allowed but must never loop.

1. If OPTIMIZE changes the result, DELIVER is blocked until VALIDATE passes again.
2. At most **2** OPTIMIZE→VALIDATE cycles; each consumes the run's re-entry budget.
3. **No-progress stop:** the result fingerprint (NFKC-normalised digest, reusing `reasoning_guard.py` logic) unchanged across two cycles ends the loop.
4. On exhaustion the run proceeds to DELIVER with status `DELIVERED_WITH_LIMITATIONS` and the unmet requirements listed — never a silent pass, never an endless loop.

## ADR-005 — Requirements ledger and coverage gate (brief §11)

- CLASSIFY pre-registers requirements: each has an ID, a criterion text (stored as digest + length), an optional **enumeration** (for example ten named competitors) and a level of importance.
- VALIDATE must answer **every** pre-registered requirement; new requirements may be added, removals require re-entry to CLASSIFY (visible goalpost change, costs budget).
- Coverage check: each enumerated item needs ≥1 evidence or action ID of its own (extends `criteria_have_own_evidence`).
- Freshness: evidence carries `as_of`; requirements may set a maximum age (for example prices ≤ 90 days).
- Definition consistency: comparative requirements require equal `definition` fields on the compared claims.
- Assumptions register: DELIVER dependencies must be evidenced or labelled as assumptions.
- Verification levels reported: `structural` → `sources-resolved` → `computations-checked`.

## ADR-006 — Capability declaration and plan graph

- The engine cannot see host tools; at IDENTIFY_CAPABILITIES the host declares available capabilities (search, code execution, files, …) and missing ones. Missing capabilities required by the plan must be disclosed in DELIVER.
- PLAN submits operations `{id, capability, depends_on[], parallel_group, completion_condition}`; EXECUTE receipts reference operation IDs; VALIDATE reports operations not completed.

## ADR-007 — Deterministic tools

- `rigorx_compute`: safe expression evaluator with SI dimensional analysis and unit conversion (no `eval`, no dependencies); results recorded automatically as action receipts. Would have flagged the CGS/SI conductivity error. [A for the error, C for the design]
- `rigorx_check_source`: fetches a URL or DOI (public internet only, `global_fetch_strictly_public`), records status, final URL, retrieval time and content hash. Upgrades evidence from *claimed* to *resolved*; it does not establish that the source supports the claim.

## ADR-008 — Topic memory (host-memory-first)

**Decisions (owner):** personal context stays in the host AI's own memory; RIGOR-X controls memory only for the topics it works on; no app-level encryption; retention left to the host; no auxiliary model calls; global, language-agnostic.

- **Boundary [C]:** MCP gives plugins no access to ChatGPT or Claude memory; the host model bridges by passing relevant context into tool calls.
- **Topic hierarchy (owner):** «ইউজার-হোস্ট-ইঞ্জিন ডায়নামিক্স মেইনটেইন করে টপিক হায়ারার্কি নির্ধারণ করবে» — the hierarchy is shaped jointly by user, host and engine. Design [C]: topics form a tree (topic → subtopic …) owned by one user and runs attach to a node; the **user** can create, rename, move, merge or delete nodes and always has the last word; the **host** proposes placement from conversation context; the **engine** enforces structure (depth limit, unique names per parent, quota) and suggests merges or splits from keyword overlap. Every placement records who decided it (user / host / engine) and can be overridden by the user.
- **Stored per item:** text as given (any language), `lang` (BCP 47, host-supplied), kind, provenance (run, stage, event), trust level (user-confirmed > run-validated > host-inferred), `as_of`, supersedes/conflicts links. Cloudflare encrypts at rest.
- **Retrieval without embeddings:** the host supplies keywords in the content's language (optionally pivot keywords in a second language of its choice) when writing, and several phrasings when recalling; the engine ranks with FTS5 `trigram` BM25 + recency + importance, MMR de-duplication. Queries shorter than three characters (common in CJK) fall back to a substring scan within the topic. An embedding provider hook stays defined but disabled.
- **Retention:** kept until the user deletes it (topic or item) — a conversation can resume a year later. Deletion is real deletion (rows and index entries), with an audit record that holds no content.
- **Conflicts (owner):** when host memory and a RIGOR-X record disagree, both are shown and the conflict is flagged; neither silently wins.
- **Poisoning controls (OWASP ASI06):** memory is always returned as data inside an envelope, never as instructions; host-inferred items carry lower weight; per-topic write-rate limits; size limits.
- **Quota (owner): 120 MB per user**, shown like phone storage ("used / 120 MB"); at the cap new writes are refused while reads and deletes keep working. Workers Free allows 5 GB per account in total, so at most ~42 users at full quota; text-only items with the trigram index take roughly 2–4 KB, i.e. ~30–60 thousand items per user. [B for the limits, C for the per-item estimate]
- Evaluation: LongMemEval's five abilities (extraction, multi-session, temporal, updates, abstention) on a multilingual set covering several scripts.

## ADR-009 — Identity and access

- Spike token **removed** (owner). Access everywhere — ChatGPT, Claude (web, desktop, mobile) and **Claude Code** — through the existing OAuth flow; this session already uses the connector through OAuth. [A]
- Quotas and rate limits per user and an account-wide budget guard; `rigorx_profile` ID becomes an HMAC with a secret key.

## ADR-010 — MCP 2026-07-28 compatibility

Support the stateless revision (`server/discover`, `_meta` versioning, `Mcp-Method`/`Mcp-Name` headers) alongside 2025-11-25, 2025-06-18 and 2025-03-26. [B: MCP 2026-07-28 changelog]

## ADR-011 — Storage normalisation and migrations

Tables `runs`, `run_events` (append-only rows), topic memory tables and `usage`; a versioned migration runner replaces the hard schema-version check; existing `host_runs` rows are migrated lazily on first access.

## Phases

| Phase | Content | Exit evidence |
|---|---|---|
| P0 Foundation | ADR-009, ADR-010, ADR-011, `list_runs`/delete, CI test of the real Worker auth path, README/`.gitignore`/dead-code cleanup, conformance suite skeleton (ADR-001) | All MCP revisions pass conformance; quota → 429; live checks |
| P1 Promise core | ADR-002 … ADR-007 | Brief §11 example (9/10 competitors) and the EUV unit error are caught by tests; acceptance test #3 via ChatGPT |
| P2 Topic memory | ADR-008 | Multilingual memory evals and poisoning suite pass |
| P3 Evidence and knowledge | Claim ledger with value statuses (KNOWN / UNKNOWN / ZERO / NOT_COLLECTED / UNAVAILABLE / NOT_APPLICABLE), Workflows for background jobs, MCP Apps UI | Brief §10 "30% market share" example receives the correct status |
| P4 Measurement | OpenTelemetry GenAI spans, usage metering, eval harness in CI, outcome metrics | Every PR runs all suites |
| P5 Governance and interop | OWASP agentic threat model, NIST/ISO mapping, optional A2A | Documented audit |

## Resolved and open questions

Resolved by the owner on 2026-11-25: per-user cap 120 MB; topic hierarchy shaped by user–host–engine dynamics (ADR-008); twelve separate stages (ADR-002).

Open:
1. Confirm the interpretation of «১২ টি আলাদা ধাপেই হবে» (ADR-002) before P1 starts. P0 does not depend on it.
2. Licensing model — deferred by the owner; the Aetherica brief is a draft. The repository stays Apache-2.0.
3. When to move from Workers Free to Workers Paid (raises the 5 GB account cap and Workers AI/Vectorize allowances).
