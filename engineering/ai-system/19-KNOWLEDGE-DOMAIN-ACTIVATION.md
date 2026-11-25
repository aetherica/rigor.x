# WS25 — Knowledge Domain Activation

## Source inventory and status
The ordered 36-name domain list was recovered as a historical assistant-produced record. It is preserved with:
- `source_status: HISTORICAL_ASSISTANT_RECORD`
- `canonical_status: PENDING_OWNER_RATIFICATION`

This source status is carried into every activation result; the list is not silently promoted to canonical.

## Runtime
`DomainCatalog` validates IDs KD-01 through KD-36 and record structure.
`DomainRouter` performs bounded keyword matching and returns the relevant domains, matched keywords, score, and provenance status. It is contextual: it does not activate all 36 for every request.
`AgentRuntime` accepts an optional router; activated domain metadata is appended to the model request and included in the execution receipt. The CLI can load the optional catalogue via `--domain-catalog`.

## Limitations
- Keyword matching is a transparent heuristic, not semantic model classification.
- Keyword maps are provisional.
- The historical 36 names still require owner ratification.
- No full domain-specific reasoning module, registry integration, or evaluation benchmark is claimed.
