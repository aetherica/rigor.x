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
