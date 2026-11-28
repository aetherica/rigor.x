# Aetherica Cross-AI Browser MCP

**Status:** Architecture and feasibility implementation — hosted service not deployed  
**Target repository:** `aetherica/x` (public)  
**Source of existing browser components:** `aetherica/xs` — copied components already present in `x`; no changes to `xs`  
**Working branch:** `feature/cross-ai-browser-mcp`

## Goal

Provide one Aetherica browser capability through a remote MCP service that can be connected from multiple AI hosts. Users should not need Termux, a local server, or browser-driver configuration. A hosted isolated browser is the default; local browser control is an optional later bridge.

## Current repository facts

- The 23 paths under `browser/` in `x` currently have the same Git blob/tree SHAs as `xs`.
- Existing standalone MCP server uses stdio and a GeckoDriver endpoint; it is not yet a hosted multi-user service.
- Existing Browser Safety Core, URL policy, robots handling, sensitive-field protections, explicit submission confirmation, and human challenge handoff should be reused.
- `browser/hosted/README.md` is preparation documentation, not deployed code.
- The existing RIGOR-X MCP endpoint is a separate service and must not be modified or overloaded for browser sessions.
- No Cloudflare Browser Rendering binding, deployment, credentials, or billing settings have been changed.

## Target topology

```
ChatGPT / Claude / Gemini (where eligible) / MCP-compatible clients
                  |
          Remote MCP (HTTPS)
                  |
       Aetherica Browser MCP Gateway
       OAuth / user authorization / quotas
                  |
       Browser Session Orchestrator
       owner-scoped session + budgets
                  |
       Isolated hosted browser context
                  |
        Browser Engine / Internet
```

The MCP gateway is stateless between calls except for authenticated session handles. Browser contexts are isolated per user and session; cookies are not persisted by default. A host may be unable to render a live embedded viewport, so screenshot/state/text are the portable baseline. Interactive UI is an optional MCP Apps-compatible surface and must be host-tested.

## Portable tool contract

Prefix every tool with `aetherica_browser_` to avoid collisions.

- `aetherica_browser_create_session` — create an isolated session; return opaque session ID and capability summary.
- `aetherica_browser_open` — navigate to a public HTTP(S) URL.
- `aetherica_browser_search` — search through an explicitly configured provider or host-provided search; never claim search works without a provider.
- `aetherica_browser_get_state` — current URL, title, page state and action progress.
- `aetherica_browser_read_page` — bounded rendered text/DOM extraction.
- `aetherica_browser_screenshot` — return a screenshot artifact/URL supported by the host.
- `aetherica_browser_click` — non-submit element click.
- `aetherica_browser_scroll` — bounded scroll.
- `aetherica_browser_type` — type only into non-sensitive fields; credentials, OTP, hidden, secret/token fields blocked.
- `aetherica_browser_back` / `aetherica_browser_forward` / `aetherica_browser_reload`
- `aetherica_browser_stop` — cancel current navigation/action.
- `aetherica_browser_close_session` — terminate session and release resources.

Submitting forms, purchases, posts, messages, or irreversible external actions require explicit per-action approval. CAPTCHA, login, age challenge and paywall must stop and hand off to the user; no bypass.

## Host compatibility

| Host | Connection method | Portable tool use | Embedded/live UI | Qualification |
|---|---|---|---|---|
| ChatGPT | Remote MCP connector | Expected where custom MCP is enabled | MCP Apps support is host/account dependent | Validate web setup and account entitlements; mobile custom connector support may differ |
| Claude | Remote MCP connector | Expected | Interactive connector/MCP Apps support varies by client | Test desktop and mobile separately |
| Gemini Apps | Connected Apps where available | Conditional | Host-specific | Consumer availability/eligibility may be geographically and account restricted |
| Cursor / VS Code / Codex | MCP configuration | Expected | Host-specific | Validate current client versions |
| Other MCP clients | Streamable HTTP MCP | Expected if protocol compatible | No universal UI guarantee | Text, state, screenshots are baseline |

This matrix is an integration target, not a record of end-to-end tests. Protocol compatibility does not mean each host has been connected or approved the service.

## Authentication and tenancy

- OAuth authorization per host/client; no shared API key in plugin files.
- Resource/audience-scoped token; do not reuse RIGOR-X access tokens for Browser MCP.
- Derive owner identity from verified token claims, not email/display name.
- Session ID is opaque and unguessable; every operation checks owner.
- Cross-host sessions should not be implicitly shared. Explicit user-created session sharing would require separate permission.
- No persistent cookies by default. If persistence is later added, opt-in, encrypted, clearable, and isolated by owner.

## Resource defaults (proposed, not enabled)

- 60-second idle timeout.
- Maximum 3 concurrent sessions per owner.
- Daily browser-time budget configurable by deployment.
- Bounded navigation/action timeouts and page-size limits.
- Download cap and allow-list.
- Rate limits and host pacing.
- No billing configuration changes without explicit owner authorization.

## Safety gates

Reuse Browser Core policies and add runtime network egress controls:

1. HTTP(S) only; reject URL credentials and unsafe ports.
2. Block private, loopback, link-local, reserved, metadata and internal destinations.
3. Check every redirect and browser navigation; enforce network-level egress to mitigate DNS rebinding and client-side navigation.
4. Robots policy and rate pacing.
5. Prompt-injection signals treated as untrusted page data, never as agent instructions.
6. Refuse secret/password/OTP/token fields.
7. No submit without explicit approval tied to the exact action; approval expires and is single-use.
8. Human handoff for CAPTCHA/login/age/paywall.
9. Session isolation, no shared profiles, secure artifact storage, cleanup.
10. Audit action metadata without storing unnecessary page contents or credentials.

## Build sequence and acceptance gates

### B0 — Source transfer audit (complete)
- Compare `browser/` trees in `xs` and `x`; record exact SHA equality.
- Confirm all development is in `x`, on a feature branch.

### B1 — Hosted runtime spike
- Cloudflare docs (checked 2026-11-28) state Browser Run is available on Workers Free and Workers Paid. Workers Free currently has 10 browser minutes/day, 3 concurrent browser sessions, 1 new browser every 20 seconds, and a 60-second browser timeout. Paid includes 10 browser hours/month, then $0.09/hour; concurrent sessions have a separate charge after the included limit. See [pricing](https://developers.cloudflare.com/browser-run/pricing/) and [limits](https://developers.cloudflare.com/browser-run/limits/).
- Read-only Cloudflare account check on 2026-11-28: Browser Run session-list API is accessible and currently returns an empty session list. This confirms API access, not plan tier or remaining allowance. Confirm actual account plan and usage/remaining allowance before runtime testing.
- Use a read-only Live View URL or the documented session API to prove visibility; do not create sessions or consume allowance before owner approval.
- If account free quota is exhausted, stop and compare free/low-cost alternatives; do not enable billing.

### B1.1 — Multi-provider session adapters (implementation committed; live credentials not tested)

- Added the provider-independent contract in `browser/providers/contract.ts`.
- Added Steel, Hyperbrowser and Browserbase session lifecycle adapters. Each adapter creates, retrieves and stops/releases a provider session and normalizes the returned CDP endpoint.
- Added a provider router with deterministic preference order (Steel → Hyperbrowser → Browserbase). It only falls back for known transient/capacity HTTP failures (408, 425, 429, 5xx); authentication/validation errors fail closed.
- Added mocked HTTP adapter tests and included them in Browser Core CI.
- Provider health currently checks whether required environment variables exist. It does not verify live authentication, account entitlements, credits, concurrency or remaining quota.
- Added an owner-scoped session manager with an injected storage interface. It issues opaque session handles, enforces per-owner concurrency, hides provider CDP URLs from callers, and stops a provider session if ownership persistence fails.
- The storage interface has no production Durable Object/database implementation yet; a durable backend and authenticated MCP gateway are still required.
- Browser Core CI currently passes 25 tests (including provider adapters and owner-isolation/session-cleanup tests), plus TypeScript type-check. This is mocked/unit verification, not a live provider browser test.
- No real provider session was created during this implementation. The adapters are not yet wired into the MCP server and do not constitute a hosted service.
- GitHub Actions secrets must be explicitly mapped into workflow environments; they are not automatically injected into Render or Cloudflare runtime environments.

### B2 — MCP Gateway and session API
- Implement create/open/state/read/screenshot/stop/close.
- Add OAuth resource binding and owner isolation.
- Unit-test session ownership, expiration, budget and cancellation.

### B3 — Safety validation
- SSRF tests: IPv4/IPv6 special ranges, DNS rebinding, redirects, metadata, client-side navigation.
- Sensitive form, submit approval, CAPTCHA/login/paywall and prompt-injection tests.
- Screenshot/download artifact privacy and cleanup.

### B4 — Host smoke tests
For each eligible client: connect, list tools, open safe test page, read, screenshot, click/scroll, stop, close; verify OAuth isolation and denial cases. Record client/version/platform and observed behavior. Never mark a host PASS without an actual test.

### B5 — Interactive browser viewport
- Cloudflare Browser Run has documented Live View and time-limited view URLs; a remote live viewport is therefore technically available at the runtime layer.
- Test whether MCP Apps/interactive connectors can surface that view inside each host. A host may still show a link or screenshot rather than embedding it.
- Keep text + screenshot + action progress as the portable fallback.

### B6 — Release
- Publish separate browser connector/package and documentation.
- Keep RIGOR-X control-plane MCP separate.
- Deploy staging only after explicit owner approval; production requires separate approval.

## Non-goals

- Do not modify `xs`.
- Do not change RIGOR-X OAuth, databases, secrets, or production Worker.
- Do not expose GeckoDriver port publicly.
- Do not require Termux for end users.
- Do not claim a host integration is live before a real smoke test.
