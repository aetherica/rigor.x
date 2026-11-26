# RIGOR-X MCP server on Cloudflare — TypeScript Worker

The plugin server for ChatGPT, Claude and other MCP hosts. It replaced the Python Worker spike (removed in WS32 P0.1; see `engineering/ai-system/24-HOST-PLUGIN-ARCHITECTURE.md` for its history), because the Python Worker cannot run on the Workers Free plan: importing the MCP SDK alone costs ~0.7 s CPU on CPython and ~2 s on the Workers runtime, against a 10 ms per-request limit (Free) and a 1 s startup limit (all plans).

- **One runtime dependency:** Cloudflare's `@cloudflare/workers-oauth-provider` for sign-in. MCP is implemented directly (`src/mcp.ts`) for the Streamable HTTP transport, handshake era (protocol `2025-11-25`, `2025-06-18`, `2025-03-26`). `server/discover` (2026-07-28) answers "method not found", which makes modern clients fall back to `initialize`. Every POST gets one JSON response; there is no session or server-initiated stream.
- **Same engine as Python.** `src/pipeline.ts`, `src/router.ts`, `src/engine.ts`, `src/store.ts` port the Python modules. The same 12 tools, titles, descriptions and annotations; the same Durable Object class (`OwnerRuns`), table layout and JSON snapshots.
- **Parity is tested, not assumed.** `scripts/parity_fixtures.py` records router profiles and five engine scenarios (75 steps) from the Python engine into `test/fixtures/parity.json`; `test/parity.test.ts` replays them on the TypeScript engine; `tests/test_ts_parity.py` fails if the Python engine drifts from the fixtures.
- **Conformance is tested with the official MCP SDK client.** CI starts `scripts/dev-server.ts` (the same MCP handler over `node:http` with `node:sqlite`) and runs `examples/mcp_smoke.py --url` against it: handshake, tool list, a full run to COMPLETED, wrong token → 401. The dev server is a local test harness with its own local test token; it is never deployed and does not exercise the Worker's OAuth path.
- **Sign-in:** OAuth with Google only — see below. Every `/mcp` request needs an access token issued by this Worker; without one the answer is `401` with a `resource_metadata` pointer. There is no static or shared token (the spike token was removed in WS32 P0.1), so Claude Code signs in with OAuth like every other host.
- Not yet available here: `rigorx_resolve_commands` (the 999-entry catalogue is not bundled; the tool reports this).

Local CPU measurement (Node 22, per call): `tools/list` 0.01 ms, `rigorx_route` 0.1 ms, `rigorx_start_run` 0.3 ms, engine construction 0.9 ms. Workers-runtime figures will be recorded after deployment.

## Run the tests (Node 22.6+ or 24; nothing to install)

```bash
cd deploy/cloudflare-ts
npm test
```

Conformance against the official SDK client (from the repository root, with `pip install -e '.[mcp]'`):

```bash
node --experimental-strip-types deploy/cloudflare-ts/scripts/dev-server.ts 8787 dev-token &
python examples/mcp_smoke.py --url http://127.0.0.1:8787/mcp --token dev-token
```

## Sign-in with Google (OAuth, phase P4)

The Worker is its own OAuth authorization server (`src/auth.ts`, on `@cloudflare/workers-oauth-provider`): protected resource and authorization server metadata, PKCE S256, Client ID Metadata Documents, dynamic client registration at `/register`, tokens at `/token` bound to `https://<worker>/mcp`. `/authorize` shows a consent page (client name, verified domain for CIMD clients, redirect host, loopback warning), then sends the user to Google. The owner is `google:<sub>`, never the e-mail address. Clients, grants and tokens live in the KV namespace `OAUTH_KV` (`rigorx-mcp-oauth`), stored hashed or encrypted.

Setup (once):

1. Google Cloud Console → Google Auth Platform: External; app name RIGOR-X. Only the `openid` scope is requested (no e-mail), so publishing needs no verification. Any Google account can sign in; each account's runs are separate.
2. **Credentials → Create credentials → OAuth client ID → Web application.** Authorized redirect URI: `https://rigorx-mcp.<subdomain>.workers.dev/oauth/google/callback`.
3. Worker → Settings → Runtime variables and secrets (Production) → add secrets `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, then **Deploy**.

Add to a host with the URL `https://rigorx-mcp.<subdomain>.workers.dev/mcp` and no token: Claude (Settings → Connectors → Add custom connector) and ChatGPT (developer mode, authentication OAuth) discover sign-in from the `401`.

Verified locally under `wrangler dev`: metadata documents, `401` challenges, a static bearer token is rejected (WS32 P0.1), dynamic registration, consent page (escaping, no framing, browser-bound single-use handle), Deny and Google-error redirects with `state` and `iss`, redirect to Google with PKCE. Not verifiable locally: the Google token exchange and the end-to-end sign-in from Claude and ChatGPT.

## Deploy with Cloudflare Workers Builds

In the Cloudflare dashboard: **Workers & Pages → rigorx-mcp → Settings → Build**, change:

| Setting | Value |
|---|---|
| Root directory (Path) | `deploy/cloudflare-ts` |
| Build command | `npm test` |
| Deploy command | `npm run deploy` |

Push to `main` (a Retry rebuilds the same commit; see below). The Worker name, Durable Object binding and migration tag are unchanged, so existing runs stay in place.

Check: `https://rigorx-mcp.<subdomain>.workers.dev/` returns the banner; `POST /mcp` without a token returns `401` with `WWW-Authenticate: Bearer … resource_metadata=…`; a signed-in host (for example the Claude connector) can call `rigorx_profile` and run `rigorx_start_run` → `rigorx_delete_run`.

After WS32 P0.1 is deployed, delete the leftover Worker secrets `RIGORX_SPIKE_TOKEN` and `ALLOWED_EMAILS` (Settings → Variables and Secrets); the code no longer reads either.

### If the Workers Build fails with `root directory not found` or `can't cd to deploy/cloudflare-ts`

The build is running on a commit older than the TypeScript Worker (`deploy/cloudflare-ts` first appears in `0fdec7e`). **Retry** rebuilds the same old commit with the new settings, so it keeps failing. Check **Settings → Build → Build watch paths** (include `*`), then start a build from a new commit on `main` instead of retrying. Prefixing the deploy command with `git log -1 --oneline &&` prints the commit being built.
