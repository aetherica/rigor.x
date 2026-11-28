# Hosted Browser MCP — preparation and provider adapter foundation (NOT deployed)

This is a separate OAuth-protected Browser MCP service, not the RIGOR-X Core MCP. The hosted gateway, OAuth resource, session ownership store and deployment are not implemented. The Steel, Hyperbrowser and Browserbase session adapters now exist in `../providers/`; they are not yet wired into the MCP server.

Cross-host feasibility, tool contract, ownership/security policy, acceptance gates and roadmap: [Cross-AI Browser MCP](../../engineering/ai-system/25-CROSS-AI-BROWSER-MCP.md).

## Current provider adapter state

- Steel: session create, retrieve and release through the documented REST API.
- Hyperbrowser: session create, retrieve and stop through the session API.
- Browserbase: session create, retrieve and release through the session API; project ID is required by this adapter configuration.
- Provider router: deterministic preference order with fallback only on known transient/capacity errors (408, 425, 429 and 5xx).
- Health currently means credential configuration presence only. It does **not** verify API authentication, account quota, remaining credits or concurrency entitlement.
- No real provider sessions have been launched by CI. Unit tests use mocked HTTP responses.

## Runtime secret configuration

The adapters read:

- `STEEL_API_KEY`
- `HYPERBROWSER_API_KEY`
- `BROWSERBASE_API_KEY`
- `BROWSERBASE_PROJECT_ID`

GitHub Actions repository secrets are available to workflows that explicitly map them into a job's environment. They are **not automatically injected into Render, Cloudflare Workers, or another hosting runtime**. Configure the same secrets separately in the actual service's secret manager before deploying that service. Never paste credentials into source code, issues, pull requests, chat, or logs.

## Proposed hosted runtime

- Cloudflare Browser Rendering or another selected provider runtime, subject to account entitlement and cost verification; do not enable billing.
- Streamable HTTP MCP endpoint `/mcp`, protected by resource-scoped OAuth. Do not reuse Core access tokens.
- Durable owner/session records; fresh isolated context, short idle timeout, no cookie persistence by default.
- Owner/day budget with atomic reservation and release on close/failure.
- Reuse Browser Core URL/redirect checks, robots policy, DL01–DL12 classification and injection detector. Enforce network egress policy to mitigate DNS rebinding and client-side navigation.
- External submit/irreversible action requires explicit, single-use approval bound to the exact operation. Never accept passwords/OTP; stop at CAPTCHA, login, age challenge or paywall.

## Cloudflare Browser Run reference (checked 2026-11-28)

- Workers Free is documented with 10 browser minutes/day, 3 concurrent sessions, one browser launch per 20 seconds and a 60-second browser timeout.
- Account plan, actual usage and remaining allowance were not verified. No browser session was launched and billing was not enabled.
- See [pricing](https://developers.cloudflare.com/browser-run/pricing/), [limits](https://developers.cloudflare.com/browser-run/limits/) and [Live View](https://developers.cloudflare.com/browser-run/features/live-view/).

## Deployment gates

1. Confirm actual provider credentials and plan entitlements through non-secret metadata or dashboard checks.
2. Verify OAuth resource/audience binding and account identity; tokens cannot be replayed against Core.
3. Test budget atomicity, daily reset, concurrency and reservation release.
4. Test SSRF/egress: DNS rebinding, IPv4/IPv6 special ranges, redirect chains, metadata and private destinations, client-side navigation.
5. Test CAPTCHA/login/paywall and sensitive fields; submit approval.
6. Test evidence metadata, screenshot/download artifact privacy and cleanup.
7. Owner approves staging deployment explicitly; production is a separate approval.

**State:** provider session adapters committed; hosted MCP gateway, OAuth, durable session ownership, real provider smoke tests and deployment remain pending.

## Hosted browser action runtime (implementation in progress)

- Added a Playwright CDP engine that connects to provider-issued secure CDP endpoints and implements the existing Browser Core contract: navigate, read, click, type, confirmed submit, screenshot and bounded file fetch.
- Added an owner-scoped runtime orchestrator that maps opaque session handles to provider sessions, serializes actions per session, and closes the browser engine before releasing provider resources.
- Added a hosted MCP tool registry for create-session, navigate, read, scrape, write/type, click, submit, screenshot, fetch and close-session. The registry requires an authenticated owner subject supplied by a future OAuth gateway; it does not trust an owner ID from tool arguments.
- Browser-originated HTTP(S) requests are URL-checked before being allowed. This is defense-in-depth only: production must still enforce network-level egress restrictions to prevent DNS rebinding and other resolution-time SSRF.
- playwright-core is a runtime dependency. CI/unit tests still need to be run against this commit; provider credentials and a real browser session have not been used.

**Not yet complete:** the registry is not exposed by a Streamable HTTP MCP server; OAuth middleware/resource metadata, durable production storage, quota accounting, private artifact delivery/cleanup, real provider smoke tests and deployment are still pending. The existing stdio server remains the local GeckoDriver implementation.
