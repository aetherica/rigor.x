# WS32 P4/P5 — Agentic Threat Model, Autonomy, Observability and Evaluation (2026-11-26)

Evidence tags as in [27](27-COGNITIVE-OS-REASSESSMENT-2026-11-26.md). This document maps threats to the controls that exist in code today; it does not claim controls that are only planned.

## 1. System boundary

RIGOR-X is a control plane called by a host AI (ChatGPT, Claude, Claude Code) over MCP. It sees only what the host sends; it executes nothing on the user's systems; its only outbound network action is `rigorx_check_source` (public http(s) GET). Trust boundaries: Internet ↔ Worker (OAuth), Worker ↔ owner Durable Object (owner from the verified token only), host-submitted content ↔ engine (always data).

## 2. OWASP Top 10 for Agentic Applications — mapping

Source: OWASP GenAI Security Project announcement (2025-12-09) and secondary summaries [B]; ASI08–ASI10 were not verified in this session and are therefore not mapped.

| Risk | Control in RIGOR-X (code) | Residual risk |
|---|---|---|
| ASI01 Agent goal hijack | Requirements are pre-registered at CLASSIFY and can change only by re-entering CLASSIFY, which costs budget and is reported as a limitation (`requirement_revisions`); DELIVER must disclose unmet requirements | A host that is itself hijacked can register the wrong requirements; RIGOR-X cannot see the user's words |
| ASI02 Tool misuse | Fixed tool list; internal operations (`evidence_for_check`, `record_source_check`) have no tool; `rigorx_compute` is a parser, not `eval`, and every malformed input is a controlled error (20,000-case fuzz test); `rigorx_check_source` fetches only public http(s) on default ports or 8080/8443, no credentials; redirects are followed manually (max 10) and every hop is checked against the IANA special-purpose IPv4/IPv6 registries (mapped, compatible, NAT64, 6to4 forms included) and local names; one 10 s deadline, 1 MiB; the owner's quota is reserved before anything is fetched (2026-11-26 audit, A1–A3) | A public DNS name that resolves to a private address (DNS rebinding) is not resolved by RIGOR-X; the Cloudflare edge does not route to private networks, the Node dev server does |
| ASI03 Identity and privilege abuse | OAuth only (spike token removed, regression-tested in CI); owner ID from the verified token; one Durable Object per owner; random per-owner profile ID; A4/A5 operations need a `USER_APPROVAL` bound to that operation's digest, single use, expiring after 24 h (audit B1); an explicit low level cannot go below the task's risk floor (audit F) | `decided_by` and `USER_APPROVAL` are host-declared: they record what the host says the user decided; an out-of-band approval page signed in with Google would make them user-verified (not built) |
| ASI04 Supply chain | One runtime dependency (`@cloudflare/workers-oauth-provider`), lockfile, `npm ci` in CI, GitHub Actions pinned by SHA, CodeQL workflow (owner) | Transitive dependencies of wrangler at build time |
| ASI05 Unexpected code execution | No code execution path; compute grammar is closed | — |
| ASI06 Memory and context poisoning | Memory returned in a data-not-instructions envelope; trust levels weigh ranking; `run_validated` requires the exact text (SHA-256) of a validated claim or evidence of a passed run, and recall flags a changed text (audit B4); supersession is limited to the same topic and cannot override the user (audit C4); `user_confirmed` requires `decided_by: user`; 60 writes per topic per hour; size caps; conflicts shown on both sides; merge and delete are user-only | A host can still write false items as `host_inferred`; ranking lowers but does not exclude them |
| ASI07 Insecure inter-agent communication | Not applicable: no agent-to-agent channel (A2A not implemented, see §5) | — |
| Indirect prompt injection through sources | Fetched content is never returned whole; only short metadata strings, with control and bidirectional characters removed, and `injection_signals` flagging text that addresses an AI or asks to change instructions; responses label it untrusted data; memory recall uses a data-not-instructions envelope | Heuristic detection is incomplete by nature; the host must still treat all source text as data |
| Availability (not an ASI item; finding N1) | Per-owner daily quotas, burst limit, stored-run cap, memory cap; reads and deletes never refused by the daily quota but counted by the burst limit; MCP bodies over 1 MiB (413), JSON deeper than 32 levels and non-scalar IDs refused before dispatch (audit G, C5) | Workers Free shared ceilings (100k requests and 100k rows written per day) until the move to Workers Paid |

Integrity of the record itself: append-only events (store refuses rewrites), engine receipts (`COMPUTE_RECEIPT`, `SOURCE_CHECK`) cannot be created by hosts, host-reported actions are labelled `HOST_REPORTED`. The gate is structural: it cannot detect a host that fabricates sources or claims consistently. [A]

## 3. Autonomy tiers (directive §15, implemented in PLAN/EXECUTE and the gate)

| Tier | Meaning | Rule |
|---|---|---|
| A0 Observe | read state | — |
| A1 Analyze | compute, read public sources | receipts |
| A2 Recommend | produce a recommendation | DELIVER disclosures |
| A3 Reversible action | draft, branch push | receipt |
| A4 Consequential action | merge, send, deploy, purchase | a done A4 operation cites a `USER_APPROVAL` evidence (EXECUTE refuses otherwise; gate `approvals_recorded`) |
| A5 Restricted | irreversible, financial, security policy, deleting user data | as A4 |

From L05 every planned operation must carry a tier. The tier follows reversibility, external effect and data sensitivity, never task length.

## 4. Observability and economics (P4)

- **In place:** Workers observability (logs, issues) enabled in `wrangler.jsonc`; per-owner usage counters (`usage_daily`, `rigorx_usage`); rows written per call measured on workerd (start_run 5, other writes 3, reads 0, delete 1) for the quota and pricing decision. [A]
- **Deferred (category C), with reason:** OpenTelemetry GenAI spans — the conventions are still "Development" [B-], there is no trace consumer, and the Workers logs already answer today's questions; adding it now would be infrastructure without operational value (directive §27). Calibration metrics (Brier score) need outcome feedback per requirement, which the protocol does not collect yet.

## 5. Agent interoperability (P5)

A2A v1.0 [B-] is not implemented: RIGOR-X is a tool server for one host at a time, and no use case needs agent-to-agent delegation yet (category C). MCP 2026-07-28 and the handshake era are both served.

## 6. Evaluation in CI (every push to main)

Unit and contract tests (TypeScript 78), language-neutral conformance scenarios with hand-written expectations (5: Test A coverage, Test B unit error, unknown-is-not-low-risk, L01, value statuses), memory benchmarks (development and held-out, pre-registered thresholds), `rigorx_compute` against pint (23 cases), slash catalogue sync, real Worker auth path under `wrangler dev`, Durable Object storage on workerd, official MCP SDK smoke in three connection modes, type check, Python suite, ruff, CodeQL. [A]
