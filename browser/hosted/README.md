# Hosted Browser MCP — implementation foundation (NOT deployed)

The cross-AI browser implementation is in the public repository `aetherica/x`. The private repository `aetherica/xs` is untouched.

## What exists

- Provider adapters: Steel, Hyperbrowser and Browserbase.
- Provider router: deterministic order with fallback only for transient/capacity errors (408, 425, 429 and 5xx).
- Playwright CDP engine: navigate, read, click, type, confirmed submit, screenshot and bounded fetch/download.
- Owner-scoped runtime: opaque session handles, ownership checks before each action, per-session serialization and provider cleanup.
- Hosted MCP tool registry: create session, navigate, read, scrape, write/type, click, submit, screenshot, fetch and close.
- Screenshot and fetched-file artifacts are packaged as MCP content; temporary files are cleaned up.
- CI: Browser Core, CodeQL Advanced and RIGOR-X Pipeline all pass on the current PR head.

## Existing Aetherica infrastructure and integration boundary

The repository already contains an OAuth-protected Streamable HTTP RIGOR-X MCP endpoint at `/mcp`, plus a portable Node runtime in `deploy/node` that runs the same platform-neutral application using `node:http`.

That does **not** mean Browser MCP should reuse the RIGOR-X access token. Browser MCP must have its own resource/audience-bound token and isolated browser-session authorization. The existing sign-in/account identity primitives may be reused, but Core tokens must not be replayable against Browser MCP and the RIGOR-X production OAuth route must not be modified as part of this work without separate approval.

The Node runtime is the viable execution boundary for the current Playwright CDP engine; Cloudflare Workers cannot directly host this Node/Playwright implementation. The hosted tool registry is not yet mounted into an authenticated remote MCP endpoint.

## Runtime secrets

Provider adapters read these environment variables:

- `STEEL_API_KEY`
- `HYPERBROWSER_API_KEY`
- `BROWSERBASE_API_KEY`
- `BROWSERBASE_PROJECT_ID`

GitHub Actions secrets are not automatically injected into Render, Railway, Cloudflare or another runtime. Configure runtime secrets separately in the chosen service's secret manager. Never put credential values in source, pull requests, chat or logs.

## What is still required before a usable hosted service

1. Add a distinct Browser MCP OAuth resource/audience and authenticated Streamable HTTP route without reusing RIGOR-X access tokens.
2. Mount the browser tool registry into that route and derive owner identity only from verified token claims.
3. Implement durable owner-scoped session storage and atomic per-owner concurrency/time-budget reservations. The current storage interface and test store are not a production persistence layer.
4. Enforce network-level egress restrictions against DNS rebinding, IPv4/IPv6 special ranges, metadata endpoints, redirects and client-side navigation.
5. Complete artifact size, private delivery, retention and cleanup policy. Do not expose local filesystem paths or provider CDP URLs.
6. Run minimal live provider smoke tests only after explicit approval of possible free-credit use or charge exposure.
7. Test connection and behavior separately in ChatGPT, Claude, Gemini (where available), and other MCP hosts.
8. Staging deployment requires explicit owner approval; production requires separate approval.

## Safety and cost boundaries

- No provider API key values have been read or printed.
- No live provider session has been launched; no credits have been consumed.
- No billing settings, production Worker, OAuth configuration, database or migrations have been changed.
- No deployment has been performed.
- A configured environment variable is not proof of provider authentication, plan entitlement, remaining quota or available credits.
- Browser-originated URL checks are defense-in-depth only; network egress controls remain mandatory.

**Status:** Browser engine, provider adapters, owner-scoped runtime and MCP tool definitions are implemented and CI-green. The authenticated remote Browser MCP endpoint, durable storage/quota layer, live provider validation, host acceptance and deployment are not complete.
