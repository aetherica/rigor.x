# Hosted browser provider adapters

This directory implements provider session lifecycle adapters. It does not replace the existing Browser Core or GeckoDriver engine.

## Supported providers

| Provider | Credential | Create | Read | Stop | CDP field |
|---|---|---|---|---|---|
| Steel | `STEEL_API_KEY` | `POST /v1/sessions` | `GET /v1/sessions/{id}` | `POST /v1/sessions/{id}/release` | `websocketUrl` |
| Hyperbrowser | `HYPERBROWSER_API_KEY` | `POST /api/session` | `GET /api/session/{id}` | `PUT /api/session/{id}/stop` | `wsEndpoint` |
| Browserbase | `BROWSERBASE_API_KEY` + `BROWSERBASE_PROJECT_ID` | `POST /v1/sessions` | `GET /v1/sessions/{id}` | `POST /v1/sessions/{id}` with `REQUEST_RELEASE` | `connectUrl` |

Provider credentials are read only from environment variables. They must never be committed, returned from MCP tools, or included in logs.

## Important limits

- `health()` checks credential configuration only. It does not call the provider, validate authentication, or report remaining quota.
- Session creation is not enabled from the public MCP server yet. These adapters are an isolated integration layer pending real credential smoke tests and hosted authentication/ownership.
- The adapters return provider-specific CDP URLs. Treat these as secrets: do not log them, persist them in plaintext, or expose them to an untrusted client.
- A failed provider session is not migrated. Fallback creates a fresh session at another provider; cookies and browser state are never copied.
- Router fallback is restricted to known transient/capacity HTTP statuses (408, 425, 429, 5xx). Authentication and validation failures stop immediately.
- No account quota or pricing data is inferred from historical free-tier advertisements.

## Runtime configuration

Set the three credentials in the hosting runtime's secret manager, not just in GitHub Actions, if the hosted service runs outside Actions. Browserbase additionally needs its project ID. The adapter constructors support injected fetch implementations for deterministic tests.
