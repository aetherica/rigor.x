# Hosted Browser MCP — implementation foundation (NOT deployed)

The cross-AI browser implementation is in the public repository `aetherica/x`. The private repository `aetherica/xs` is untouched.

## What exists

- Provider adapters: Steel, Hyperbrowser and Browserbase.
- Provider router: deterministic order with fallback only for transient/capacity errors (408, 425, 429 and 5xx).
- Playwright CDP engine: navigate, read, click, type, confirmed submit, screenshot and bounded fetch/download.
- Owner-scoped runtime: opaque session handles, ownership checks before each action, per-session serialization and provider cleanup.
- Hosted MCP tool registry: create session, navigate, read, scrape, write/type, click, submit, screenshot, fetch and close.
- Artifact packaging: screenshots and fetched files are embedded as MCP content; temporary files are removed.
- SQLite session store: persistent owner-scoped session metadata and atomic per-owner capacity reservations for a single Node process.
- Hosted service factory composes the provider router, SQLite store, runtime and MCP tool registry without starting provider sessions.
- Stateless Streamable HTTP MCP transport implements initialize, tools/list and tools/call behind an injected resource/audience-aware token-verifier contract.
- Browser Core CI tests the provider/runtime/registry/session/transport components.

## Existing Aetherica infrastructure and integration boundary

The repository already contains an OAuth-protected Streamable HTTP RIGOR-X MCP endpoint at `/mcp`, plus a portable Node runtime in `deploy/node` that runs the same platform-neutral application using `node:http`.

That does **not** mean Browser MCP should reuse the RIGOR-X access token. Browser MCP must have its own resource/audience-bound token and isolated browser-session authorization. Core tokens must not be replayable against Browser MCP. Do not modify or overload the production RIGOR-X OAuth route as a shortcut.

The current Playwright/CDP engine needs a Node execution boundary; it cannot run directly inside the Cloudflare Worker runtime. The hosted service factory now wires the provider router, SQLite session store, runtime and tool registry together. A stateless Streamable HTTP transport is implemented, with token verification deliberately injected so it cannot silently trust client-supplied owner IDs. It is not yet mounted behind a concrete Browser MCP OAuth issuer. The current SQLite store is single-process only; multi-replica deployment requires a shared transactional store.

## Runtime secrets

Provider adapters read these environment variables:

- `STEEL_API_KEY`
- `HYPERBROWSER_API_KEY`
- `BROWSERBASE_API_KEY`
- `BROWSERBASE_PROJECT_ID`

GitHub Actions secrets are not automatically injected into Render, Railway, Cloudflare or another runtime. Configure runtime secrets separately in the chosen service's secret manager. Never put credential values in source, pull requests, chat or logs.

## Remaining gates before a usable hosted service

1. Implement a distinct Browser MCP OAuth issuer/resource/audience and concrete token verifier; reject RIGOR-X tokens.
2. Mount the service factory and transport into the Node HTTP runtime, deriving owner identity only from verified Browser MCP token claims.
3. Mount the hosted service factory into a single-process Node service or implement a shared transactional store for multi-replica use. Add durable provider-session expiry/reconciliation and atomic time-budget accounting.
4. Enforce network-level egress restrictions against DNS rebinding, IPv4/IPv6 special ranges, metadata endpoints, redirects and client-side navigation.
5. Complete artifact privacy, size, retention and cleanup policy. Do not expose local filesystem paths or provider CDP URLs.
6. Run minimal live provider smoke tests only after explicit approval of possible free-credit use or charge exposure.
7. Test connection and behavior separately in ChatGPT, Claude, Gemini (where available), and other MCP hosts.
8. Staging deployment requires explicit owner approval; production requires separate approval.

## Safety and cost boundaries

- No provider API key values have been read or printed.
- No live provider session has been launched; no credits have been consumed.
- No billing settings, production Worker, OAuth configuration, database or migrations have been changed.
- No deployment has been performed.
- A configured environment variable is not proof of provider authentication, account entitlement, remaining quota or available credits.
- Browser-originated URL checks are defense-in-depth only; network egress controls remain mandatory.

**Status:** Browser engine, provider adapters, owner-scoped runtime, MCP tool definitions and single-process durable SQLite session storage are implemented. The authenticated remote Browser MCP endpoint, runtime wiring, shared quota/time-budget layer, network egress controls, live provider validation, host acceptance and deployment are not complete.
