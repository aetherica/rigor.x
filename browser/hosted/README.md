# Hosted Browser Worker — preparation only (NOT deployed)

The hosted browser is a separate Cloudflare Worker and a separate OAuth-protected MCP connector. It is not the Core MCP and is not submitted to any connector directory. No Cloudflare Browser Rendering binding, deployment, secret, or billing setting has been changed.

## Proposed architecture
- Cloudflare Browser Rendering binding, launched with the supported Playwright adapter.
- Streamable HTTP MCP endpoint `/mcp` protected by OAuth; reuse Core account identity/auth flow where appropriate, but issue resource-scoped tokens for the Browser Worker.
- BrowserSession Durable Object per user/session. Fresh isolated context, close on idle (60 s), no cookie persistence.
- BrowserBudget Durable Object per owner/day: reserve before launch; max 10 browser-minutes/day; max 3 concurrent sessions; charge actual elapsed time, release reservations on close/failure.
- Use shared Core source URL checks, redirect checks, DL01–DL12 classifier and injection detector. Apply a platform-level egress firewall as defence against DNS rebinding and client-side redirects.
- A4/A5 (submit or irreversible external actions) require Core USER_APPROVAL plus tool-level confirm. Never accept credentials/OTP; stop at CAPTCHA, login, age challenge or paywall.
- Robots.txt RFC9309, 1-second host pacing, 20 pages/site-prefix, backoff 429/503; downloads capped and allow-listed.

## Required gates before deployment
1. Browser Rendering availability and zero-cost entitlement confirmed in the owner Cloudflare account; do not enable billing.
2. OAuth audience/resource binding and account identity verified with tests; tokens cannot be replayed against Core.
3. Budget Durable Object atomicity, daily reset/time zone, concurrency and reservation-release tests.
4. Hosted SSRF/network egress tests including DNS rebinding, IPv6, redirect chains, metadata addresses, private IPs and client-side navigation.
5. CAPTCHA/login/paywall and secret-field refusal tests; submit approval integration tests.
6. Browser evidence tests (status/content type/redirect chain/hash), screenshot/download sandbox tests.
7. Deploy to staging only after owner approval; production deployment is a separate explicit decision.

**Current state:** architecture recorded only. Worker source, OAuth integration, Durable Objects and real hosted-browser tests remain unimplemented.
