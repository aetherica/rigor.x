# WS32 P2 — Topic Memory (ADR-008, as implemented)

**Status:** IMPLEMENTED, TESTED, INTEGRATION_TESTED on workerd (2026-11-26) · code `deploy/cloudflare-ts/src/memory.ts` · tools `rigorx_memory_topic`, `rigorx_memory_write`, `rigorx_memory_recall`, `rigorx_memory_delete` · schema version 3.

## Scope and boundary
RIGOR-X remembers **topics it works on** (facts, decisions, preferences, sources, summaries, questions, notes), per user, in any language, until the user deletes them. Personal context stays in the host AI's memory; MCP gives a plugin no access to it. When the two disagree, the item stores what the host memory says (`host_memory_conflict`) and recall shows both (owner decision).

## Topic tree and authority
A tree per user (≤ 8 levels, ≤ 1,000 topics, unique names per parent). Operations: list, create, rename, move, merge, delete. Every placement records `decided_by` (`user` | `host`), declared by the host — the engine cannot see who typed what. Rule: what the user placed only the user can change; **merge and delete are always the user's decision**. Items record `decided_by` too; `user_confirmed` trust requires `decided_by: user`.

## Retrieval (no embeddings, no model calls)
1. Candidates: FTS5 (`tokenize='trigram'`, any script) with each host query as an OR of its in-word trigrams, best BM25 first; plus a bounded substring scan (≤ 5,000 newest items) for CJK bigrams and, only when a query has no trigram, short tokens.
2. Lexical score = best coverage of one query by the item (share of the query's trigrams, or of its bigrams/short terms, present). Items below `MIN_LEXICAL = 0.3` are not returned (abstention).
3. Relevance = 0.6·lexical + 0.2·exp(−age/180 d) + 0.2·trust weight (user_confirmed 1, run_validated 0.7, host_inferred 0.4); deterministic tie-break; MMR (λ = 0.7) over keyword/trigram Jaccard.

Why coverage and not BM25 alone: BM25 normalised per query always ranks something first and cannot say "no real match". Why bigrams: measured in SQLite 3.54 — a Chinese question shares no trigram with a text containing its two-character words; Cloudflare documents the same effect for whole-sentence CJK queries (AI Search changelog 2026-10-16). Why short tokens only without trigrams: in the first benchmark run, "de", "to" and "we" matched inside unrelated words with full coverage.

## Evaluation (test/memory.test.ts)
| Set | Languages | Queries | recall@3 | MRR | Abstention | Note |
|---|---|---|---|---|---|---|
| Development | en, bn, zh, ja, ar, ru, hi, es | 11 | 1.000 | 1.000 | 3/3 | First run: recall@3 1.000, MRR 0.909 and non-deterministic; fixed the short-token bug and tie-breaking. No longer independent. |
| Held-out | de, fr, ko, tr, pt, vi, zh, ja | 8 | 1.000 | 1.000 | 3/3 | Written before its first run; retrieval code unchanged after it. Its first run stopped at a write: a full 13-character Chinese sentence failed the 15-character minimum, so the text policy now counts Han/Kana/Hangul characters as two units (text.ts `charUnits`). |

Thresholds were pre-registered (recall@3 ≥ 0.8, MRR ≥ 0.7, full abstention). `MIN_LEXICAL` sensitivity on the development set: recall@3 1.00 for 0.1–0.4, 0.91 at 0.5–0.6; abstention 3/3 throughout. **Limitations:** the sets are small (19 queries, 6 unrelated); no paraphrase without lexical overlap can be found by design (that needs embeddings, deferred by the owner); LongMemEval-style temporal, multi-session and update abilities are not yet measured.

## Poisoning controls (OWASP ASI06), quota, deletion
Recall returns an envelope stating that items are data, not instructions. Trust weighs ranking; `run_validated` requires `provenance.run_id` of the owner's run whose VALIDATE passed. ≤ 60 writes per topic per hour; ≤ 8,000 characters and 32 keywords per item. Quota **120 MB per user** of stored memory text (text, keywords, notes, search-index text; index structures not counted); at the cap writes fail, reads and deletes work; `rigorx_usage.memory_bytes`. Deletion removes rows and FTS entries; `memory_audit` keeps action, target ID, counts and time, no content.

## Verification receipts
TypeScript tests 69/69 (memory 8), tsc clean; workerd: FTS5 trigram recall in Chinese and Bengali, abstention, deletion, usage (test/integration/run.mjs). [A]

## Changes from the 2026-11-26 engineering audit ([32](32-ENGINEERING-AUDIT-2026-11-26.md))

- **Atomic operations (C1):** every engine operation runs in one Durable Object storage transaction (`ctx.storage.transactionSync`); `mergeTopic` also runs all its checks (sibling-name collisions, depth) before the first write. Verified on workerd: a write followed by an error is rolled back; a colliding merge leaves the topic list unchanged.
- **Move collisions (C2):** moving a topic next to a sibling of the same name is a clear `INVALID_REQUEST`, no longer a raw `UNIQUE constraint` error (which surfaced as HTTP 500).
- **Short-token precision (C3):** a short query token of a space-delimited script (for example "AI") matches whole words only, never substrings ("chair", "said"); CJK bigrams are unchanged. The eight-language and held-out benchmarks are unchanged (recall@3 1.000, MRR 1.000, abstention 3/3).
- **Scoped supersession (C4):** `supersedes` only replaces an active item of the same topic, and an item the user placed, or of higher trust, only with `decided_by: "user"`.
- **run_validated is earned (B4):** the item text must be exactly the text of a claim (`provenance.claim_id`) or evidence claim (`provenance.evidence_id`) of a run whose last validation passed, bearing on a requirement it accepted as met (SHA-256 match). The item stores `content_sha256`, `gate_version` and `validated_at`; recall reports `integrity` and shows a mismatching item as `host_inferred`.
- **Quota (C5):** reads (`memory_recall`, topic `list`) and deletes are never refused by the daily quota but count against the per-minute burst limit.
- **Cost (§09):** recall prefilters short terms in SQLite (`instr`) and diversifies only the best `max(8 × limit, 64)` candidates: on a 2,000-item corpus the median recall time fell from 35.8 ms to 26.0 ms and p95 from 142 ms to 91 ms (Node 22, three runs each; `scripts/bench.ts`).
