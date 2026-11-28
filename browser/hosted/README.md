# Hosted Browser Worker — preparation only (NOT deployed)

This is a separate OAuth-protected Browser MCP service, not the RIGOR-X Core MCP. No Browser Rendering binding, deployment, secret, or billing setting has been changed.

Cross-host feasibility, tool contract, ownership/security policy, acceptance gates and roadmap: [Cross-AI Browser MCP](../../engineering/ai-system/25-CROSS-AI-BROWSER-MCP.md).

## Proposed runtime

- Cloudflare Browser Rendering, subject to account entitlement and cost verification; do not enable billing for the spike.
- Streamable HTTP MCP endpoint `/mcp`, protected by resource-scoped OAuth. Do not reuse Core access tokens.
- Browser session Durable Object per owner/session; fresh isolated context, 60-second idle close, no cookie persistence by default.
- Owner/day budget Durable Object: proposed maximum 10 browser-minutes/day and 3 concurrent sessions; reserve before launch, charge actual elapsed time, release reservations on close/failure.
- Reuse Browser Core URL/redirect checks, robots policy, DL01–DL12 classification and injection detector. Enforce network egress policy to mitigate DNS rebinding and client-side navigation.
- External submit/irreversible action requires explicit, single-use approval bound to the exact operation. Never accept passwords/OTP; stop at CAPTCHA, login, age challenge or paywall.
- One-second host pacing, 20 pages/site-prefix, backoff on 429/503, bounded downloads.

## Deployment gates

1. Confirm Browser Rendering is available and a zero-cost entitlement is sufficient; do not enable billing.
2. Verify OAuth resource/audience binding and account identity; tokens cannot be replayed against Core.
3. Test budget atomicity, daily reset, concurrency and reservation release.
4. Test SSRF/egress: DNS rebinding, IPv4/IPv6 special ranges, redirect chains, metadata and private destinations, client-side navigation.
5. Test CAPTCHA/login/paywall and sensitive fields; submit approval.
6. Test evidence metadata, screenshot/download sandbox and artifact cleanup.
7. Owner approves staging deployment explicitly; production is a separate approval.

**State:** architecture only. Hosted worker, OAuth, Durable Objects and real-browser tests are not implemented/deployed.