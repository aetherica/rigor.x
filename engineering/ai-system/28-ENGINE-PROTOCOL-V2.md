# WS32 P1 — Engine Protocol v2: Specification (as implemented) and ADR-012

**Status:** IMPLEMENTED and TESTED (2026-11-26) · canonical code `deploy/cloudflare-ts/src/{protocol,run,ledger,gate,engine}.ts` · conformance `deploy/cloudflare-ts/conformance/v2/` · decisions ADR-002 … ADR-006 in [25](25-MAJOR-UPGRADE-SPEC-AND-ADRS.md), owner confirmation 2026-11-26 ("twelve separate stages, never merged").

Evidence tags as in [27](27-COGNITIVE-OS-REASSESSMENT-2026-11-26.md): [A] verified in this repository, [C] design judgment.

## 1. Stages and levels

Twelve distinct stages, in this order: `QUERY, CLASSIFY, SELECT_METHODS, ASSESS_COMPLEXITY, IDENTIFY_CAPABILITIES, PLAN, EXECUTE, EVALUATE_EVIDENCE, VALIDATE, STRESS_TEST, OPTIMIZE, DELIVER`. Six levels `L01_BASIC … L06_HYPER_RIGOROUS`.

| Level | Mandatory stages (others are skipped automatically, with the reason recorded) | Extra gate rules |
|---|---|---|
| L01 | QUERY, CLASSIFY, EXECUTE, DELIVER | none (no gate: the run ends `DELIVERED_UNVERIFIED`) |
| L02 | + PLAN, VALIDATE | requirements pre-registered; coverage |
| L03 | + SELECT_METHODS, IDENTIFY_CAPABILITIES, EVALUATE_EVIDENCE | every cited evidence has a claim status; a supporting claim; no contradicted claim; contradictions resolved |
| L04 | + ASSESS_COMPLEXITY, OPTIMIZE | assumptions register submitted |
| L05 | all twelve (+ STRESS_TEST) | one failure scenario per must-requirement |
| L06 | all twelve | two independent sources per met requirement; numeric claims cite successful `rigorx_compute` receipts |

- **Level resolution.** `start_run` seeds the level from the keyword router. The keyword lists are English, so a task with **no signal is `UNKNOWN`** with seed L02 and `classification_unknown: true`; its CLASSIFY must declare `level` and `stakes` (directive §2.2: unknown is not zero). At CLASSIFY the level becomes `max(seed, declared, stakes floor)` with floors low→L01, medium→L03, high→L04, critical→L05; ASSESS_COMPLEXITY may raise it again. **The level never decreases.** Wherever ASSESS_COMPLEXITY is mandatory, every earlier stage is too, so raising the level never reopens a past stage (invariant tested). [A]
- **No skipping.** A mandatory stage cannot be submitted as `skipped`; `partial` and `blocked` pause it with a reason. [A]

## 2. Stage contracts (`rigorx_submit_stage` → `data`)

Host texts are stored only as SHA-256 digest and length (the run store's privacy model); IDs, statuses, capability and method names are stored as given because checks compare them. Text substance: summaries ≥ 40 characters and 6 word units, notes ≥ 15 and 3 (one unit per character in scripts written without spaces); a summary may not repeat another stage's.

| Stage | `data` |
|---|---|
| QUERY | optional `constraints[]`, `ambiguities[]` |
| CLASSIFY | `objective`, `deliverable`, `requirements[] {id, text, importance: must|should, items[]?, max_age_days?}` (≥ 1 from L02), `level`, `stakes` (required when `classification_unknown`), `language` (BCP 47) |
| SELECT_METHODS | `methods[] {name, reason}` (≥ 1) |
| ASSESS_COMPLEXITY | optional `level` (only higher) |
| IDENTIFY_CAPABILITIES | `available[]`, `missing[]` (names; disjoint) |
| PLAN | `operations[] {id, capability, depends_on[], parallel_group?, completion_condition, requirement_ids[]?}`; acyclic (Kahn), references exist, capability declared |
| EXECUTE | `operations[] {id, status: done|failed|not_done, evidence_ids[]}` for every planned operation; `done` cites receipts |
| EVALUATE_EVIDENCE | `claims[] {id, text, status (directive §2.2 labels), evidence_ids[], requirement_ids[]?, numeric?}`; ESTABLISHED/VERIFIED/SUPPORTED/PROBABLE need evidence; `contradictions[] {claim_ids, resolved, note}`; `assumptions[] {id, text, consequence_if_false, status}` (required from L04; verified/refuted need evidence) |
| VALIDATE | only `rigorx_verify` with `requirements[] {id, met: true|false|"partial", evidence_ids[], items[]? {id, evidence_ids[]}}` |
| STRESS_TEST | `scenarios[] {id, requirement_ids[], failure_mode, outcome: survives|breaks|unknown, mitigation?}` |
| OPTIMIZE | `changed`, `result_summary` |
| DELIVER | the disclosures the view lists in `requires`: `unmet_requirements`, `missing_capabilities` (those the plan relies on), `unverified_assumptions`, `broken_scenarios` (breaks and unknown); optional `limitations[]` |

Requirements can only change by re-entering CLASSIFY; a changed set is counted (`requirement_revisions`) and reported as a limitation at delivery. [A]

## 3. Gate 2.0.0 (`rigorx_verify`)

Checks, all deterministic: `prior_stages_closed`, `requirements_preregistered`, `requirements_covered` (each registered requirement answered once, nothing else), `must_requirements_met`, `met_requirements_cite_evidence`, `requirements_have_own_evidence`, `items_have_own_evidence` (each enumerated item cites evidence no other item of the requirement cites), `no_unresolved_failed_actions` (for every intent; finding 2 closed), `planned_operations_done` (operations linked to a met requirement), `evidence_fresh` (`max_age_days` against `as_of`; missing `as_of` fails), `cited_receipts_ok`, and by level `claims_support_requirements`, `contradictions_resolved` (L03+), `assumptions_registered` (L04+), `independent_sources` (distinct URL hosts or DOI prefixes), `numeric_claims_computed` (L06).

Verification level per met requirement: `structural`; `sources_resolved` when every cited source has a successful `SOURCE_CHECK` receipt; `computations_checked` when, in addition, its numeric claims cite successful `COMPUTE_RECEIPT`s. A pass is "structurally verified" at most, never a truth guarantee. Evidence may be recorded after a failed validation (for example the fixing action) before re-entering.

### 3a. Gate 2.1.0 (2026-11-26 engineering audit)

- **One claim–requirement resolver (B3):** a claim bears on a met requirement when it names it in `requirement_ids` OR rests on evidence the requirement cites. `unknown_values_not_supporting`, `claims_support_requirements`, `contradictions_resolved` and `numeric_claims_computed` all use it, so omitting `requirement_ids` takes no claim out of a check.
- **Numeric claims bound to their computation (B2, L06):** a numeric claim must state `value {status, number, unit}` and cite a `COMPUTE_RECEIPT` that succeeded *and* whose `expect` checked that same value (same dimension, SI value within 1e-9; a unit rigorx_compute does not know is a label: dimensionless receipt, same number). An unrelated or unchecked computation no longer validates anything. The `computations_checked` verification level uses the same rule.
- **Approvals bound to one operation (B1):** `USER_APPROVAL` evidence needs `approves=<A4/A5 operation id>`; the engine stores the operation's digest (ID, capability, completion condition, tier, requirements), an approval ID, `approved_at` and `expires_at` (24 h). EXECUTE and the gate (`approvals_recorded`) accept it only for that operation, unchanged since the approval, unexpired, and once (single use). Authenticity stays `host_declared`: RIGOR-X cannot observe the user.
- **Dependency integrity (D):** EXECUTE refuses a `done` operation whose prerequisite is not `done`; the gate repeats it (`dependencies_done`).
- **Canonical source independence (B5):** `independent_sources` (L06) counts independence groups from `sources.ts` (same DOI in any spelling, same arXiv/PubMed ID, same post across hosts, archive and original, same registrable site, rel=canonical, identical content hash, wire byline, declared `derived_from`/`origin_ref`), not distinct hosts. Different DOIs are different works.
- **New checks:** `cited_sources_not_retracted` (any level, when a source check carries Crossref data: a met requirement may not cite a retracted work) and `fringe_corroborated` (L03+: a requirement cannot be met on dark-web DL3 or conspiracy DL7 sources alone; before 27 Nov 2026: declared D09).
- Verifications record `gate_version`, so runs validated under 2.0.0 stay identifiable.

## 4. OPTIMIZE loop guard (ADR-004) and run outcomes

`OPTIMIZE` with `changed: true` sends the run back to VALIDATE (VALIDATE, STRESS_TEST and OPTIMIZE are done again), at most **2** cycles. The result fingerprint is SHA-256 of the NFKC-normalised, case-folded, punctuation-stripped `result_summary`; a fingerprint seen before stops the loop (`no_progress`), a third change stops it (`budget`). Either stop proceeds to DELIVER with the limitation recorded by the engine.

Terminal statuses: `COMPLETED` (validated, nothing to disclose, no engine limitation), `DELIVERED_WITH_LIMITATIONS`, `DELIVERED_UNVERIFIED` (no validation at the run's level), `CANCELLED`. A run never ends `COMPLETED` without a passed validation. [A]

## 5. ADR-012 — TypeScript engine canonical; Python engine frozen; parity replaced by conformance

**Context.** ADR-001 requires one canonical implementation per component. Until WS32 the Python `host_engine.py` and the TypeScript engine were kept identical by recorded parity fixtures (`parity.json`, generated by Python). Protocol v2 runs only in the Worker; re-implementing it in Python would double the work without a runtime that needs it (the Node dev server runs the TypeScript engine locally).

**Decision.** (1) The TypeScript engine is canonical for the plugin engine from protocol 2.0.0. (2) `src/rigorx/host_engine.py`, `mcp_server.py` and the run stores stay as the frozen protocol-1 reference behind the local `rigorx-mcp` command, with their own tests. (3) Python↔TypeScript parity (`parity.json`, `parity_fixtures.py`, `parity.test.ts`, `tests/test_ts_parity.py`) is retired, because protocol 2 has no second implementation to compare. (4) Its role as an independent check moves to the language-neutral conformance suite (`conformance/v2/*.json`): expected outcomes written by hand from the specification, replayed through `dispatch()`; any future port must pass it. (5) Protocol-1 runs stored in the Worker are read-only (read, list, delete).

**Consequences.** One engine to evolve; behaviour is pinned by hand-written expectations (unit tests and conformance) and by the official MCP SDK smoke run in CI, not by a second implementation. Risk: hand-written expectations share the author's understanding of the spec; mitigated by small, reviewable scenarios and by the acceptance runs through ChatGPT and Claude.

## 6. Verification receipts (2026-11-26)

TypeScript tests 51/51 (protocol-v2 21, conformance 3 scenarios, modern era 6, run management 9, others), `tsc --strict` clean, workerd integration 4/4, real-Worker auth probe 6/6, official SDK `mcp 2.3.0` smoke: a full L03 run to `COMPLETED` in `auto` (2026-07-28) and `legacy` (2025-11-25) modes. Python 204 OK (frozen v1 engine). [A]

## 7. Deterministic tools (ADR-007, WP6)

- **`rigorx_compute`** (`src/compute.ts`): arithmetic with SI dimensional analysis and rational exponents (no `eval`, no dependencies). Units with SI prefixes (incl. Q, R, r, q), derived units, CGS mechanical units (erg, dyn), the gauss by the NIST SP 811 B-field correspondence only; exact SI 2019 constants and CODATA 2022 values. Adding mismatched dimensions, transcendental functions of dimensioned values, division by zero and overflow are errors. `expect {value, unit, rel_tol}` checks a claimed number and reports `rel_error` and `ratio` (computed/expected; 4·π·ε₀ ≈ 1.1e-10 is the Gaussian-vs-SI signature). With `run_id` every result, including a failed check or evaluation, becomes an engine-verified `COMPUTE_RECEIPT`.
- **`rigorx_check_source`** (`src/source.ts`): fetches an evidence record's URL or DOI (via doi.org; http(s) only; no credentials, no private or local hosts; 10 s timeout; first 1 MiB hashed) and records status, final URL, content type, size and SHA-256 as an engine-verified `SOURCE_CHECK` receipt. It shows that the source resolved and what it contained, not that it supports the claim.
- **Independent verification:** `scripts/compute_differential.py` compares 23 conversions and constants with pint 0.26.2 (CODATA 2022): worst relative difference 8.8e-13 (run in CI). The comparison found that the first version used CODATA 2018 values for m_e and Da (differences 1.4e-9), now updated, and that pint models the gauss in Gaussian dimensions, which is why only the B-field correspondence is offered. [A]
- **Test B** (`conformance/v2/test-b-unit-error.json`): a Gaussian conductivity labelled S/m fails its compute check, so an L06 validation citing it fails (`cited_receipts_ok`, `numeric_claims_computed`); a correct SI receipt passes and the run is COMPLETED. It reconstructs the failure mode of acceptance test #2; the original answer's numbers are not in the repository. The RCWA TM factorisation error and the mis-targeted citation of that test are not catchable by unit analysis: they need domain checks (Li's factorisation rules) and source-content review — not implemented. [A for the mechanism, C for the scope statement]

## 8. Not yet done

Topic memory at QUERY (P2). Live end-to-end runs of the new parameters through Claude and ChatGPT: hosts cache tool descriptions, so the connectors must be refreshed first.
