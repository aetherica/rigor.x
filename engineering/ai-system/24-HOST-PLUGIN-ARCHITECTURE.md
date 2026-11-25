# WS31 — Host Plugin Architecture (RIGOR-X as an MCP engine)

**Document ID:** RX-PLUGIN-001
**Status:** DRAFT — for owner review; nothing in this document is implemented yet
**Canonical branch:** `main`
**Last updated:** 2026-11-25

## 1. Owner decisions recorded

| Decision | Value |
|---|---|
| Product shape | RIGOR-X is an AI System Engine delivered as a **public plugin** for ChatGPT, Claude and other MCP-capable host AIs |
| Protocol | Model Context Protocol, using the **official MCP Python SDK** |
| Hosting | **Cloudflare** |
| User sign-in | **Google account** |

## 2. Inversion of control

The existing `AgentRuntime` calls a model itself (`OpenAICompatibleBackend`). In plugin mode the direction is reversed:

- The **host model is the driver.** It decides when to call RIGOR-X tools.
- **RIGOR-X is the control-plane engine.** It enforces stage order, re-entry budgets and the verification gate, keeps the evidence/receipt ledger, and tells the host what the current stage requires.
- RIGOR-X **never calls the host model.** MCP Sampling is deprecated in protocol revision `2026-07-28`, and the engine must not depend on it.

The standalone CLI (`rigorx-agent`) and `AgentRuntime` stay as a separate mode for self-hosted use with an OpenAI-compatible endpoint.

Reused unchanged: `pipeline.PipelineRun` (state machine), `contracts.StageArtifact`, `adaptive_router`, `domain_router`, `slash_commands`, `reasoning_guard`, `registry`. New: a transport-independent engine layer, a storage interface, the MCP adapter and the Cloudflare deployment.

## 3. Guarantees and non-guarantees

This section must be reproduced, in plain language, in the public documentation and in every host listing.

**RIGOR-X guarantees, for work that passes through its tools:**
- Stages advance only in the defined order; a stage cannot be completed before it is started.
- `DECISION` is refused until `VERIFICATION` has passed in the current lineage.
- Re-entry is bounded by an explicit budget and every re-entry is recorded.
- The event ledger is append-only and revision-checked.
- Each user's runs are visible only to that user.

**RIGOR-X does not and cannot guarantee:**
- That the host model calls RIGOR-X at all. A model can answer without using the tools.
- That content submitted by the host (summaries, claims, criteria results) is true. The engine checks **structure and completeness**, not truth.
- That actions the host performed with other tools actually happened. These are recorded as `HOST_REPORTED`, never as `VERIFIED`.

## 4. Protocol baseline

- Target revision **`2026-07-28`** (stateless; no protocol sessions). The SDK v2 also serves `2025-11-25` clients from the same server; both are supported.
- Cross-call state uses an explicit, **server-minted handle** passed as an ordinary tool argument, as the specification prescribes. In RIGOR-X this handle is `run_id`.
- Transports: **Streamable HTTP** for the public service; **stdio** for local development and testing only.
- `tools/list` returns tools in a deterministic order.
- No use of deprecated features: Sampling, Roots, Logging, HTTP+SSE transport.

## 5. Tool surface (proposed)

All tools carry a `rigorx_` prefix to avoid collisions with other plugins in the same host. Every tool has a `title` and explicit annotations, as the Claude directory requires. None of the tools touches anything outside the user's own RIGOR-X data, so `openWorldHint` is `false` for all.

| Tool | Title | Sign-in | Annotations | Purpose |
|---|---|---|---|---|
| `rigorx_route` | Suggest analysis route | No | readOnly | Intent, intensity level (L01–L06), analysis modes and methods for a task description. Stores nothing. |
| `rigorx_resolve_commands` | Resolve slash commands | No | readOnly | Look up slash commands from the 999-entry catalogue; returns modifiers and host-only commands. Stores nothing. |
| `rigorx_start_run` | Start a RIGOR-X run | Yes | write, not destructive | Opens a run, returns `run_id`, the first stage and what it requires. |
| `rigorx_get_run` | Get run state | Yes | readOnly | Current stage, stage statuses, open requirements, re-entry budget left. |
| `rigorx_submit_stage` | Submit stage result | Yes | write, not destructive | Submits the result of the **current** stage (completed / partial / blocked / skipped-with-reason). Validated against the stage contract; advances by exactly one stage. |
| `rigorx_record_evidence` | Record evidence | Yes | write, not destructive | Records a source reference (URL, document ID, tool receipt) and the claim it supports. |
| `rigorx_report_action` | Report a host action | Yes | write, not destructive | Records an action the host performed with another tool, with its outcome. Stored as `HOST_REPORTED`. |
| `rigorx_verify` | Run verification gate | Yes | write, not destructive | Evaluates the deterministic gate (section 6); passes or fails the `VERIFICATION` stage. |
| `rigorx_reenter` | Return to an earlier stage | Yes | write, not destructive | Bounded re-entry with trigger and reason. |
| `rigorx_cancel_run` | Cancel run | Yes | write, **destructive** | Cancels the user's own run; cannot be resumed. |
| `rigorx_delete_run` | Delete run data | Yes | write, **destructive** | Permanently deletes the user's own run and its ledger (data-rights requirement). |
| `rigorx_profile` | Account profile | Yes | readOnly | Stable opaque user ID and display name; required by ChatGPT (`_meta["openai/profile"]`). |

Input and output schemas will be defined as JSON Schema 2020-12 and published in `schemas/`.

## 6. Verification gate in plugin mode

The gate is deterministic and inspectable. It passes only when **all** of these hold:

1. Every stage before `VERIFICATION` is `COMPLETED` or `SKIPPED_WITH_REASON`.
2. For a run whose route intent is `RESEARCH`, at least one evidence record with a source reference exists.
3. For a run whose route intent is `EXECUTION`, at least one reported action exists and none of the reported actions is `FAILED` or `BLOCKED` without a recorded resolution.
4. Every verification criterion submitted by the host has a pass/fail value and, when it is marked pass, at least one evidence reference.
5. No evidence reference points to a record that does not exist in the run.

The result records which checks ran and why any failed. The public wording is **"structurally verified"**, never "correct" or "true".

## 7. Identity and tenancy

- **Authorization server:** Cloudflare `workers-oauth-provider`. It implements PKCE, Client ID Metadata Documents and Dynamic Client Registration, and binds tokens to the MCP server URL as their audience. RIGOR-X does not implement its own token issuance.
- **Upstream sign-in:** Google (OpenID Connect). The user sees "Continue with Google".
- **Owner identity:** derived from the Google issuer and `sub`; never the e-mail address, which is display data only and can change.
- **Run handles:** `run_id` is at least 128 bits from a cryptographic random source. Every call checks that the run belongs to the caller. A run belonging to someone else is reported exactly like a run that does not exist.
- **Lazy authentication:** `rigorx_route` and `rigorx_resolve_commands` work without sign-in; every other tool answers `401` with a `WWW-Authenticate` `resource_metadata` pointer to start sign-in.

## 8. Cloudflare deployment

```text
ChatGPT / Claude / other host
        │  HTTPS (Streamable HTTP), OAuth bearer token
        ▼
Worker A — TypeScript
  • workers-oauth-provider (PKCE, CIMD, DCR, audience binding)
  • Google upstream sign-in
  • validates the token, then forwards with the verified owner ID
        │  service binding (internal only; not reachable from the internet)
        ▼
Worker B — Python
  • official MCP SDK (Streamable HTTP)
  • RIGOR-X engine
        │
        ▼
One Durable Object per owner (SQLite-backed storage)
  • holds only that user's runs and ledgers
```

Rationale:
- Cloudflare's OAuth provider is an npm library; the RIGOR-X engine is Python. Splitting them keeps each in its own language without reimplementing OAuth.
- **One Durable Object per user** makes tenant isolation structural: a request for one user cannot reach another user's storage.
- A `RunStore` interface separates the engine from storage. Implementations: the existing `SQLitePipelineStore` (local and tests) and a new Durable Object store (Cloudflare).
- Secrets (Google client secret, signing keys) live in Cloudflare Worker secrets. None are committed.

### Risks to retire first (spike before building)

| Risk | Why it matters | How to retire it |
|---|---|---|
| Official MCP SDK v2 inside Python Workers | Python Workers became generally available recently (reported September 2026); compatibility with SDK v2 is not yet confirmed by us | Deploy a one-tool server and connect it from Claude and MCP Inspector |
| Durable Object SQL storage from Python | `SQLitePipelineStore` uses the standard `sqlite3` module, which is not the Durable Object storage API | Implement the `RunStore` adapter against the Durable Object API in the spike |
| Owner ID across the service binding | Worker B must trust only Worker A | Service binding only; Worker B has no public route; reject requests without the internal marker |
| Endpoint latency | Claude allows 10 s for discovery, registration and token endpoints | Measure cold starts in the spike |

## 9. Data handling

- Default policy from the existing pipeline is kept: raw prompts and raw tool outputs are stored only as hashes.
- Stage summaries, evidence references and criteria submitted by the host **are user content** and are stored. This must be stated in the privacy policy.
- A retention period must be chosen (owner decision). Expired runs are deleted automatically.
- `rigorx_delete_run` gives users deletion on demand.

## 10. Host requirements

| Requirement | ChatGPT | Claude |
|---|---|---|
| Server | Remote, public HTTPS | Remote, public HTTPS (local servers only inside a Claude plugin) |
| OAuth | OAuth 2.1, PKCE S256; `resource` copied into token audience; CIMD preferred, DCR alternative; RFC 9207 `iss` | OAuth 2.0; CIMD (needs `none` in `token_endpoint_auth_methods_supported`) or DCR, or Anthropic-held client; PKCE S256 |
| Discovery | Protected resource metadata | `401` with `resource_metadata` pointer; only the first authorization server is used |
| Redirects | OpenAI-managed | `https://claude.ai/api/mcp/auth_callback`; Claude Code loopback on any port for `localhost` and `127.0.0.1` |
| Tool metadata | `securitySchemes` per tool; profile tool with `_meta["openai/profile"]` | `title` and `readOnlyHint` / `destructiveHint` on every tool |
| Listing | Workspace-level publishing documented; public directory process to be confirmed | Developer portal; documentation URL, privacy policy URL, support contact, icon, reviewer test account; seven policy acknowledgments |
| Latency | — | 10 s for OAuth endpoints, 30 s for refresh |

## 11. Host guidance

- **Claude:** ship a Claude plugin that bundles the connector with a skill describing when to start a run and how to move through the stages.
- **ChatGPT and other hosts:** the same guidance goes into the server instructions and tool descriptions, kept short and factual. Tool descriptions are treated as untrusted by hosts and must not contain instructions that override the user.

## 12. Implementation phases

| Phase | Deliverable | Needs Cloudflare/Google accounts | Acceptance |
|---|---|---|---|
| P1 | `RunStore` interface + `host_engine.py` (all tools in section 5, owner checks, gate in section 6) | No | Unit tests incl. cross-owner access, stage-order violations, gate failures |
| P2 | MCP adapter on the official SDK; stdio and Streamable HTTP | No | MCP Inspector and Claude Desktop/Claude Code (stdio) run every tool |
| P3 | Cloudflare spike: Python Worker + Durable Object store, no auth | Cloudflare | Risks in section 8 retired or documented |
| P4 | Worker A: OAuth provider + Google sign-in | Cloudflare, Google Cloud | Sign-in works from Claude (web and Claude Code) and ChatGPT |
| P5 | Public documentation, privacy policy, support contact | Owner | Pages published |
| P6 | Directory submissions | Owner | Claude portal; ChatGPT per its current process |

## 13. Open owner decisions

1. Public domain name for the service (for example `mcp.<your-domain>`).
2. Data retention period for runs.
3. Whether stage summaries are stored in full or only as hashes (privacy versus usefulness).
4. Usage limits per user (abuse protection and cost control).
5. Who operates the service (Aetherica managed hosting, as mentioned in the README).

## Sources

- MCP specification `2026-07-28` changelog — https://modelcontextprotocol.io/specification/2026-07-28/changelog.md
- MCP Python SDK v2 — https://py.sdk.modelcontextprotocol.io/whats-new/
- Claude connector authentication — https://claude.com/docs/connectors/building/authentication
- Claude directory submission — https://claude.com/docs/connectors/building/submission
- ChatGPT Apps SDK authentication — https://developers.openai.com/apps-sdk/build/auth
- ChatGPT custom MCP servers — https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt
- Cloudflare MCP authorization — https://developers.cloudflare.com/agents/model-context-protocol/protocol/authorization/
- Cloudflare: Streamable HTTP and Python MCP servers — https://blog.cloudflare.com/streamable-http-mcp-servers-python/
