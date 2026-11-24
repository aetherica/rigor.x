# WS15 — Registry Resolver & Typed Stage Contracts

**Status:** implementation increment; proposed registry data remains pending owner ratification.
**Scope:** read-only resolver, census checks, exact-ID lookup, typed stage artifact contracts.
**Workspace:** `engineering/ai-system/`

## What this increment does
- Loads the count-fit registry and the 999-entry slash-command library from repository files.
- Validates exact target counts for 30 formulas, 33 algorithms, 111 topics, 15 operators, 18 functional groups, 36 knowledge domains, and the 999 slash-command corpus.
- Checks stable ID prefixes, uniqueness, slash-command ordinal sequence, group crosswalks and per-group census, classification census, and the 102 interface-command target (91 reported definitions + 11 unresolved slots remain explicitly partial).
- Provides exact-ID resolution and category listing without runtime activation.
- Adds immutable typed stage artifacts with stage/kind consistency, reference checks and JSON-safe metadata.

## Deliberate boundaries
- The 36/30/33/111/15/18 architecture is still proposed/pending ratification; this resolver does not promote it to canonical.
- The 999 entries are a candidate corpus, not executable handlers. Inclusion never enables a command.
- The 102 interface/operational-command count remains a partial historical target; no fabricated 11 definitions.
- No model/tool execution, dynamic routing, research retrieval, evidence service or autonomous agent is implemented here.
- No duplicate registry or altered canonical inventory is created.

## Acceptance checks
- Exact census read from repository data.
- Stable IDs resolve uniquely; unknown IDs fail.
- Structural drift (missing entries, duplicate command names, invalid IDs, bad group crosswalk or changed classifications) fails closed.
- Stage artifact round-trip and invalid metadata/kind mismatch tests pass.
