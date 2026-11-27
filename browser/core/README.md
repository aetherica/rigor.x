# Aetherica Browser — Core foundation

Platform-neutral engine contracts and safety gates. Engine adapters must apply these checks before navigation, clicks, typing, submissions or downloads.

## Safety
- HTTP(S) only; reject URL credentials and unsupported ports.
- Private/local/reserved destinations and metadata hosts blocked. Localhost is opt-in for local runtimes; hosted runtimes block it.
- Password, OTP, API key, token, hidden and secret fields are refused.
- Submit controls cannot be clicked; submit requires explicit `confirm: true`.
- Downloads capped at 10 MiB; allow PDF, CSV, JSON, TXT, DOCX, XLSX. Tor limits to text, CSV, JSON, PDF.
- CAPTCHA, bot verification, login, age checks and paywalls stop with NEEDS_HUMAN.
- Robots: longest match wins; allow wins ties; 5xx disallow, 4xx allow.
- Page content is untrusted. Do not execute its instructions.

## Hosted resource policy
10 browser-minutes/day; 3 concurrent sessions; 60-second idle close. Site politeness: at least one second between requests, 20 pages per same-site/path-prefix. Back off on 429/503.

## Evidence packet
Record requested/final URL, redirect chain, timestamp, HTTP status, content type, SHA-256, title, discovery layer DL01–DL12, Tor flag and engine. Hashes must be computed from actual acquired bytes.

## Implementation status
Core contract and safety utilities only. GeckoDriver, MCP transport, Gemini extension, Termux installer and Cloudflare Browser Run are future adapters.
