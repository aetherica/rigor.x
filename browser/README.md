# Aetherica Browser MCP — local GeckoDriver adapter

This is a standalone MCP server. It is not part of the Core RIGOR-X MCP server and must not be submitted to Anthropic/OpenAI/Gemini connector directories.

## Prerequisites
- Node.js 22.18+.
- GeckoDriver listening at `http://127.0.0.1:4444`.
- Firefox compatible with the GeckoDriver build.

Start the driver in a separate terminal, then run:

```sh
node --experimental-strip-types browser/server.ts
```

Configure an MCP client with command `node`, args `--experimental-strip-types` and the absolute path to `browser/server.ts`. The included Gemini manifest is a template; verify the client's extension-path substitution before enabling it.

## Tools
browser_open, browser_read, browser_screenshot, browser_scrape, browser_click, browser_type, browser_submit.

## Limitations
The adapter currently does not provide Tor egress. Onion URLs are refused before network access. Redirects within browser navigation are not intercepted by GeckoDriver; the final URL is checked after navigation, so local deployment should use OS/network egress controls for stronger SSRF protection. Evidence HTTP status/content-type/redirects are unknown in this adapter and intentionally returned as null/empty rather than invented. This is an initial adapter, not a hardened hosted browser.
