# Session Handoff — 2026-11-25 (WS31 P3/P4 completion → WS32 planning)

**Purpose:** let a new session continue exactly where this one stopped. Read together with [25-MAJOR-UPGRADE-SPEC-AND-ADRS.md](25-MAJOR-UPGRADE-SPEC-AND-ADRS.md) (the decisions and the plan). Times are UTC. Evidence tags: **[A]** verified in this session (code read, test run, live probe), **[B]** cited source, **[C]** judgment or unverified.

Both documents were written on branch `ccr-5630b1ba-fp2mi5` and are **not yet on `main`** (owner review pending). No implementation work for WS32 has started.

## 1. State at handoff

| Item | Value |
|---|---|
| `main` head | `73c2169` "Bump the verification gate to 1.1.0" — auto-deployed to Cloudflare |
| Live server | `https://rigorx-mcp.aetherica.workers.dev/mcp` — TypeScript Worker `deploy/cloudflare-ts`, OAuth (Google) required on every `/mcp` request |
| Bindings | Durable Object `OWNER_RUNS` (`OwnerRuns`, SQLite), KV `OAUTH_KV` (namespace `rigorx-mcp-oauth`); flags `nodejs_compat`, `global_fetch_strictly_public`; observability + issues enabled |
| Worker secrets (names only) | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `RIGORX_SPIKE_TOKEN` (to be removed in P0), `ALLOWED_EMAILS` (leftover, ignored by code) |
| Workers Builds | root `deploy/cloudflare-ts`, build `npm test`, deploy `npm run deploy`, branch `main`; preview deploy `npm run deploy -- --dry-run`; pushes to `main` deploy automatically |
| Google OAuth | Google Auth Platform app "Rigor X", External, **In production**, scope `openid` only (no verification needed); Web client redirect URI `https://rigorx-mcp.aetherica.workers.dev/oauth/google/callback` |
| Gate | `gate_version` 1.1.0: prior stages closed, criteria present, criteria met with evidence, evidence references exist, **criteria have own evidence**; `TextPolicy` (summary ≥40 chars/6 words and distinct; reasons, claims, criteria ≥15 chars/3 words) |
| Tests | Python 204 (`PYTHONPATH=src python3 -m unittest discover -s tests`), TypeScript 17 (`cd deploy/cloudflare-ts && npm test`), parity fixtures (`PYTHONPATH=src python3 deploy/cloudflare-ts/scripts/parity_fixtures.py --check`), `ruff check src tests examples deploy` (ruff 0.16.9) — all green at `73c2169` [A] |
| Hosts verified | Claude custom connector (OAuth) — profile, start/get/delete run [A]; ChatGPT developer-mode connector (OAuth) — full 11-stage runs in two acceptance tests [A] |

## 2. Timeline

### 2.1 Cloudflare connection (≈16:30–18:31)
- The repo held two deploy targets: `deploy/cloudflare` (Python Worker spike, cannot run on Workers Free: MCP SDK import ≈2 s CPU vs 10 ms per request / 1 s startup) and `deploy/cloudflare-ts` (dependency-free TypeScript Worker, `0fdec7e`). The live Worker was still the Python build (last modified 16:20:45). [A]
- Build settings were switched to `deploy/cloudflare-ts`; builds failed with "root directory not found" / "can't cd" because **Retry rebuilds the same old commit** (before `0fdec7e`). Added `package-lock.json` (`e591234`) and README troubleshooting (`c4e57cc`). [A]
- A dry-run deploy command had been left in Build settings; after removing it the TS Worker went live at 17:44:19 (wrangler 4.168.0, 55.87 KiB / gzip 15.26 KiB). [A]
- Spike-token secret returned 503 "Server token is not configured" although listed: the secret value was **empty** (Termux `read -s` captured nothing). Re-added in the dashboard → wrong token 401, authenticated run OK (18:31). The old token had also sat in a plain-text build variable → treat as leaked. [A]

### 2.2 Sign-in for ChatGPT and Claude (≈18:35–20:35)
- ChatGPT and Claude custom connectors do not accept a static bearer token (Claude "request headers" is an org-limited beta) → implemented OAuth (WS31 P4, `bce2713`): `src/auth.ts`, `src/google.ts`, `@cloudflare/workers-oauth-provider` 1.3.0, consent page, Google upstream with PKCE, owner `google:<sub>`, CIMD + DCR, tokens bound to the `/mcp` resource. Deviation from WS31 §7 lazy auth: every `/mcp` request needs a token, because hosts discover sign-in from a 401. [A]
- `/privacy` and `/terms` pages for the Google consent screen (`f8ad658`).
- After merging to `main`, pushes did **not** trigger builds; fixed by disconnecting and reconnecting the Git repository in Settings → Build. Dashboard "Create deployment" only rolls out existing versions ("empty rollout"). [A]
- `redirect_uri_mismatch` fixed by registering the callback URI on the Google client. E-mail allowlist removed and scope reduced to `openid` at the owner's request (`890e2dc`). Verified sign-in from Claude (`c31c4f1`). [A]
- Owner commit `fe793be` enabled Worker issues observability; merged. [A]

### 2.3 Acceptance test #1 via ChatGPT (DO vs D1 decision) (≈20:40–21:20)
- Scripted traps (stage order, skipping VERIFICATION, uncited criterion, cross-owner access) all behaved correctly; the server-side run matched GPT's report, including criterion SHA-256 digests. [A]
- Weaknesses found: one evidence record could support every criterion; stage summaries unchecked; evidence IDs are ledger sequence numbers (gaps are by design). Fixed: `criteria_have_own_evidence` + `TextPolicy` in both engines, tool descriptions, corrected privacy page (`12f6e9f`), gate 1.1.0 (`73c2169`), verified live. Remaining gap: every pre-verification stage can still be skipped with a valid reason. [A]

### 2.4 Acceptance test #2 via ChatGPT (EUV lithography, hard domain)
- 18 premises (8 correct, 10 wrong) and 8 numeric checks with an answer key. GPT caught 9/10 wrong premises (softened P17), got all 8 numbers right, but labelled 6/8 correct premises "oversimplified". [A]
- Server run verified (21 evidence, 8 calc actions, gate 1.1.0 pass). **The gate passed although the answer contained a 10⁵ unit error** (Spitzer conductivity in CGS labelled SI → 6×10⁻¹⁸ s instead of ≈0.62 ps), a TM RCWA eigen-equation with the wrong Fourier factorisation, and a mis-targeted Dill 1975 citation. Lesson: structural verification needs executable checks (units, sources) and pre-registered requirements. [A]

### 2.5 Repository scan and audit
Key findings (details and fixes in the spec):
1. Criteria authored at verification time (goalpost moving). 2. Gate strictness depends on keyword-routed intent. 3. All stages skippable. 4. Spike token = permanent backdoor. 5. No quotas or rate limits. 6. No retention, no run listing. 7. Whole-run snapshot rewritten per call (O(n²)). 8. Every response returns the full `actions` list. 9. `listChanged: false`, hosts cache tool descriptions. 10. Real Worker auth path not tested in CI (`dev-server.ts` has its own auth). 11. `rigorx_profile` ID is an unsalted hash. 12. Text policy bypassable by templated summaries; skip reasons not de-duplicated. 13. `source_ref` never validated. 14. Abandoned threads on tool timeout (`agent_runtime.py`). 15. Stale README and docs. 16. 45 tracked `.pyc` files, no root `.gitignore`, dead Python Worker in CI. Structural: two engines (Python/TS) and two orchestration paths; `reasoning_controller`, `command_runtime`, `registry` unused at runtime; Worker lacks the slash-command catalogue. [A]

### 2.6 Storage and memory research
- Cloudflare limits [B]: Durable Object SQLite 1 GB per object (Free) / 10 GB (Paid), 5 GB per account (Free), 100k rows written / 5M read per day (Free), 8 MB max row; Vectorize Free 5M stored and 30M queried dimensions/month, 1,000 namespaces per index; Workers AI 10,000 neurons/day free, `bge-m3` (multilingual) and `embeddinggemma-2` (768/512/256/128 dims).
- Local workerd measurements [A]: FTS5 available; `unicode61` splits Bengali words into fragments; `trigram` matched 8/8 mixed-script queries; `sqlite_version()` is not authorised inside Durable Objects; brute-force cosine over 5,000×512 vectors took ≈13 ms read + 3 ms scoring, ≈20.6 MB on disk (≈4 KB per vector).

### 2.7 Research: an AI system without weights
Fifteen layers (interface, identity, auxiliary model gateway, context engineering, memory, knowledge, deterministic tools, orchestration, verification integrity, evaluation, security, observability, governance, engineering, learning without weights). External facts [B]: MCP `2026-07-28` is stateless (`server/discover`, `_meta` versioning, `Mcp-Method`/`Mcp-Name` headers, 12-month deprecation window); MCP Apps official since 2026-01-26; A2A v1.0 under the Linux Foundation; OWASP Top 10 for Agentic Applications 2026 (ASI01–ASI10, ASI06 memory poisoning); CaMeL and agent design patterns for injection defence; OpenTelemetry GenAI conventions still "Development"; EU Digital Omnibus (Regulation (EU) 2026/1744) moved Annex III high-risk duties to 2 December 2027, GPAI duties unchanged; NIST AI 600-1 revision pending and AI Agent Standards Initiative (February 2026); LongMemEval's five memory abilities; LLM-as-judge needs calibration against human labels.

### 2.8 Analysis of the draft Aetherica investor brief
- Nine principles extracted (outcome over output, proportional intensity, evidence before conclusion, honesty about capability, method follows problem, model independence, human control, traceability, claims grow with evidence).
- Plugin reality: the host model thinks and runs tools; RIGOR-X is the control plane (process, ledger, gate, memory); it cannot see host tools, so capabilities must be declared.
- Gaps: validation against the original objective (§11), capability assessment (§09.4), proportional intensity (§09.2), evidence status (§10), decomposition (§09.5) and continuity are not implemented.
- Brief issues: licensing line vs Apache-2.0 (owner: decide later, brief is a draft); IDC "95%" figure not found publicly (IDC's public quote says "almost three-quarters"); OECD February 2026 citation correct; levels and stages differed from code (owner: 6 levels, 12 stages); live traction not mentioned.

## 3. Decision register (owner, 2026-11-25; latest wins)

| Topic | Decision |
|---|---|
| Scope | Major upgrade: everything of an AI system except the weights |
| Languages | Polyglot, need-driven (TypeScript, Python, Rust where each fits); one canonical implementation per component (ADR-001) |
| Levels | Six (`L01`–`L06`) |
| Stages | Twelve, brief sequence QUERY → … → DELIVER; «১২ টি আলাদা ধাপেই হবে» (interpretation to confirm, ADR-002) |
| Stage policy | Mandatory stages by level (ADR-003) |
| Loop | OPTIMIZE may return to VALIDATE, never endlessly (ADR-004) |
| Spike token | Remove entirely; access everywhere including Claude Code via OAuth |
| Memory | Host AI memory for personal context; RIGOR-X controls topic memory only; no app-level encryption; kept until the user deletes it; language-agnostic; 120 MB per user; conflicts shown and flagged; topic hierarchy shaped by user–host–engine dynamics (ADR-008) |
| Auxiliary models | Depend on the host; no own model calls now ⇒ no embeddings now; host-assisted keyword retrieval, embedding hook disabled |
| Licensing | Deferred |

Superseded during the day: "remember everything like ChatGPT/Claude" (narrowed to topic memory), "dynamic embedding provider" (deferred), "Python and TypeScript dual engine" (replaced by ADR-001), Bengali/English-specific handling (replaced by language-agnostic design), e-mail allowlist (removed).

## 4. Next steps

1. Read this file and the spec; verify `main` head, tests and the live server.
2. Ask the owner to confirm the ADR-002 interpretation; P0 does not depend on it.
3. Start **P0** in this order, each as a small PR-sized change with tests and a live check: remove the spike token (code, docs, then the owner deletes the secret) → MCP `2026-07-28` support → quotas and rate limits (including the 120 MB memory cap groundwork) → storage normalisation and migrations → `list_runs` and delete → CI test of the real Worker auth path → conformance-suite skeleton → HMAC profile ID → README, `.gitignore`, dead Python Worker cleanup.
4. Merge to `main` only with the owner's approval: every push to `main` deploys.

## 5. Operational notes
- Live testing as the owner: the Claude connector "Aetherica" (tools `mcp__Aetherica__rigorx_*`) works from a Claude Code session; delete test runs afterwards. Hosts cache tool descriptions — ask the owner to refresh connectors after tool changes.
- The default cloud environment blocks the Worker host; a personal environment "rigor.x" was created that allows `rigorx-mcp.aetherica.workers.dev`.
- Cloudflare dashboard: plain-text variables are wiped by `wrangler deploy` — always use type Secret; Retry rebuilds the same commit.
- The deprecated Cloudflare developer-platform MCP tool `workers_get_worker_code` crashes the connector; use `workers_list` (modified time) and live probes instead.
- Running Python tests rewrites tracked `tests/__pycache__/*.pyc`; restore them with `git checkout -- tests/__pycache__/` until P0 adds `.gitignore`.
- Criteria are stored as SHA-256 digests: to check a host's claimed criteria, hash the exact text (hosts may include labels such as `C1 "…"`).
