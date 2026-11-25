# RIGOR-X MCP server on Cloudflare — TypeScript Worker

The plugin server for ChatGPT, Claude and other MCP hosts. It replaces the Python Worker in `../cloudflare` for deployment, because the Python Worker cannot run on the Workers Free plan: importing the MCP SDK alone costs ~0.7 s CPU on CPython and ~2 s on the Workers runtime, against a 10 ms per-request limit (Free) and a 1 s startup limit (all plans).

- **No runtime dependencies.** MCP is implemented directly (`src/mcp.ts`) for the Streamable HTTP transport, handshake era (protocol `2025-11-25`, `2025-06-18`, `2025-03-26`). `server/discover` (2026-07-28) answers "method not found", which makes modern clients fall back to `initialize`. Every POST gets one JSON response; there is no session or server-initiated stream.
- **Same engine as Python.** `src/pipeline.ts`, `src/router.ts`, `src/engine.ts`, `src/store.ts` port the Python modules. The same 12 tools, titles, descriptions and annotations; the same Durable Object class (`OwnerRuns`), table layout and JSON snapshots.
- **Parity is tested, not assumed.** `scripts/parity_fixtures.py` records router profiles and five engine scenarios (75 steps) from the Python engine into `test/fixtures/parity.json`; `test/parity.test.ts` replays them on the TypeScript engine; `tests/test_ts_parity.py` fails if the Python engine drifts from the fixtures.
- **Conformance is tested with the official MCP SDK client.** CI starts `scripts/dev-server.ts` (the same handler over `node:http` with `node:sqlite`) and runs `examples/mcp_smoke.py --url` against it: handshake, tool list, a full run to COMPLETED, wrong token → 401.
- Spike authentication: one shared bearer token (secret `RIGORX_SPIKE_TOKEN`) → one development owner; wrong token → 401; no token → `rigorx_route` only (run tools answer `AUTH_REQUIRED`). Google sign-in (phase P4) comes next, in this Worker.
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

## Deploy with Cloudflare Workers Builds (switching from the Python Worker)

In the Cloudflare dashboard: **Workers & Pages → rigorx-mcp → Settings → Build**, change:

| Setting | Value |
|---|---|
| Root directory (Path) | `deploy/cloudflare-ts` |
| Build command | *(empty)* |
| Deploy command | `npx wrangler deploy` |

Then **Retry** the latest build or push to `main`. The Worker name, Durable Object binding and migration tag are unchanged, so existing runs and the `RIGORX_SPIKE_TOKEN` secret stay in place.

Check: `https://rigorx-mcp.<subdomain>.workers.dev/` returns the banner, and

```bash
python examples/mcp_smoke.py --url https://rigorx-mcp.<subdomain>.workers.dev/mcp --token <token>
```

ends with `Run status: COMPLETED`.
