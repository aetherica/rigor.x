# Aetherica Browser MCP — standalone local browser

This browser is separate from the Core RIGOR-X MCP. Do **not** submit it as the Core connector to Anthropic, OpenAI, or Gemini directories. Gemini integration is local through its extension manifest.

## Local engine (GeckoDriver)
Requirements: Node 22.18+, Firefox, and GeckoDriver on a local endpoint.

1. Start GeckoDriver separately at `http://127.0.0.1:4444`.
2. From the repository root run:
   ```sh
   node --experimental-strip-types browser/server.ts
   ```
3. Add the MCP server to your client using Node and the absolute `browser/server.ts` path.

The MCP surface is seven tools: `browser_open`, `browser_read`, `browser_screenshot`, `browser_scrape`, `browser_click`, `browser_type`, `browser_submit`.

## Android / Termux

**Clone inside Termux home, not shared storage:** `cd ~ && git clone https://github.com/aetherica/x.git && cd x`. Git may report `dubious ownership` when repositories are cloned under `/storage/emulated/...`; keep the working copy in `$HOME`.
The `browser/install-termux.sh` script is a best-effort installer: it installs Node and proot-distro, then attempts Firefox ESR and GeckoDriver in Debian. Android/ARM and the Firefox-in-proot compatibility matrix is not verified. Review the output and don't assume the packages installed if apt reports an error.

## Safety
- URL validation and discovery-layer classification dynamically reuse Core RIGOR-X `source.ts` and `sources.ts` policies.
- Robots RFC9309 handling: longest match, Allow wins ties; 5xx disallow, 4xx allow.
- One-second host pacing; 20-page per site/path-prefix cap.
- Private/reserved/metadata destinations blocked, redirect hops checked, final browser URL rechecked. Client-side navigation can still occur between checks; local deployments should enforce OS/network egress restrictions.
- Credentials, password/OTP/token/secret fields blocked. Submit buttons cannot be clicked; `browser_submit` requires `confirm:true`.
- CAPTCHA, login, age challenges and paywalls stop with `NEEDS_HUMAN`.
- Downloads limited to 10 MiB and PDF/CSV/JSON/TXT/DOCX/XLSX. Tor egress is not implemented; onion URLs are refused.
- Page content is untrusted; injection signals are returned with evidence.

## Evidence
Open and read return requested/final URL, timestamp, rendered-DOM SHA-256, title, shared DL01–DL12 layer classification, and injection signals. HTTP status, response content type and redirect chain are not exposed by this WebDriver adapter; they remain null/empty and `metadata_note` explains why. Redirect history is not inferred from requested/final URL.

## CI
The Browser Core workflow type-checks (TypeScript 5.9.3) and runs fake-WebDriver tests. It does not install Firefox or perform a real-browser smoke test.
