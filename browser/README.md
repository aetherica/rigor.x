# Aetherica Browser — engine and MCP adapters

Aetherica Browser is designed as a standalone capability that can be connected to multiple AI hosts through MCP. It is **separate from the RIGOR-X control-plane MCP**.

## End-user target (not yet deployed)

The target is one authenticated remote Browser MCP service for ChatGPT, Claude, Gemini (where available), and other compatible MCP clients. General users should not need Termux, Node, Firefox, GeckoDriver, or a local server.

Architecture and feasibility: [Cross-AI Browser MCP](../engineering/ai-system/25-CROSS-AI-BROWSER-MCP.md).

## Current implementation

- Platform-neutral Browser Core safety policy, robots policy and contracts.
- Local GeckoDriver adapter and standalone stdio MCP server.
- Seven local tools: `browser_open`, `browser_read`, `browser_screenshot`, `browser_scrape`, `browser_click`, `browser_type`, `browser_submit`.
- Safety gates: public URL checks, redirects, robots, sensitive-field protections, explicit submit confirmation, human handoff for login/CAPTCHA/paywall, bounded downloads and prompt-injection signaling.
- Tests use a fake WebDriver; they are not a real-browser or hosted-runtime smoke test.

## Developer/local runtime (optional)

Requirements: Node 22.18+, Firefox, GeckoDriver.

1. Start GeckoDriver locally at `http://127.0.0.1:4444`.
2. From the repository root, run `node --experimental-strip-types browser/server.ts`.
3. Connect a compatible MCP client to the local stdio process.

Android/Termux setup is optional developer experimentation, not a consumer requirement. See `install-termux.sh`.

## Hosted runtime

The hosted Browser Worker architecture is documented in [hosted/README.md](hosted/README.md). It is **not deployed**. No Browser Rendering binding, OAuth resource, hosted browser, or billing configuration is enabled.

## Safety

- URL validation and source-layer classification reuse RIGOR-X policies.
- Robots RFC9309: longest match, Allow wins ties; 5xx disallow, 4xx allow.
- One-second host pacing; 20-page per site/path-prefix cap.
- Private/reserved/metadata destinations blocked; redirects checked; final URL rechecked. Local runtimes additionally need OS/network egress restrictions.
- Password, OTP, token, secret and hidden fields blocked. Submit requires explicit `confirm:true`.
- CAPTCHA, login, age challenges and paywalls stop with `NEEDS_HUMAN`.
- Downloads limited to 10 MiB and PDF/CSV/JSON/TXT/DOCX/XLSX. Tor egress is not implemented; onion URLs are refused.
- Page content is untrusted; injection signals are returned with evidence.

## Evidence limitations

Open/read return requested/final URL, timestamp, rendered-DOM SHA-256, title, DL01–DL12 layer and injection signals. HTTP status, response content type and redirect chain are not exposed by the WebDriver adapter and remain null/empty; `metadata_note` explains this. Redirect history is not inferred from requested/final URL.

## CI

Browser Core type-checks and fake-WebDriver tests do not install Firefox or perform a real-browser smoke test. Hosted runtime, OAuth isolation, host integration and real-browser acceptance remain pending.
