# RIGOR-X MCP server on Cloudflare (WS31 phase P3 spike)

This Worker serves the RIGOR-X MCP tools at `https://<worker>/mcp`. Each owner's runs live in that owner's Durable Object (SQLite storage). See [WS31 Host Plugin Architecture](../../engineering/ai-system/24-HOST-PLUGIN-ARCHITECTURE.md).

**Spike status.** Authentication is a single shared bearer token mapped to one development owner. Do not share the URL with the token. Google sign-in replaces this in phase P4.

## What is verified and what is not

- Verified in the repository (CI): the Durable Object store against a sqlite3 stand-in, Worker-to-Durable-Object RPC, the MCP server with an async engine, and that the Worker bundle imports without `sqlite3`. `entry.py` was also run locally under uvicorn with stand-ins for the Workers API: full run with the token, `401` with a wrong token, stateless tools only without a token.
- **Not yet verified:** running on Cloudflare itself (Pyodide runtime, real Durable Object SQL cursors, bundling of `mcp==2.3.0`). That is the purpose of this spike.

## Deploy

Requirements: a Cloudflare account, [Node.js](https://nodejs.org/) (for `npx wrangler`), [uv](https://docs.astral.sh/uv/), Python 3.

```bash
cd deploy/cloudflare
npm install
npx wrangler login                      # opens a browser to authorize your Cloudflare account
python3 -c "import secrets; print(secrets.token_urlsafe(32))"   # make a token; keep it private
npx wrangler secret put RIGORX_SPIKE_TOKEN                      # paste the token when asked
npm run deploy                          # syncs the engine into src/, then `uv run pywrangler deploy`
```

The deploy prints the Worker URL, for example `https://rigorx-mcp.<your-subdomain>.workers.dev`.

The first `npx wrangler secret put` may offer to create the Worker before the first deploy; accept it.

## Check the deployment

From the repository root (with `pip install -e '.[mcp]'`):

```bash
python examples/mcp_smoke.py --url https://rigorx-mcp.<your-subdomain>.workers.dev/mcp --token <token>
```

It should end with `Run status: COMPLETED`. Without `--token`, `rigorx_route` and `rigorx_resolve_commands` work and run tools report `AUTH_REQUIRED`.

Logs: `npx wrangler tail`.

## If something fails

| Symptom | Likely cause | What to try |
|---|---|---|
| Deploy fails while bundling `mcp` or `pydantic-core` | `mcp==2.3.0` dependencies not available for the Workers Python runtime | Set `mcp==2.2.0` in `pyproject.toml` (the version Cloudflare's own example uses) and deploy again |
| `ModuleNotFoundError: rigorx` | `sync_engine.py` did not run | `npm run deploy` runs it; or run `python3 sync_engine.py` first |
| `503 Server token is not configured` | Secret missing | `npx wrangler secret put RIGORX_SPIKE_TOKEN` |
| Errors mentioning `toArray` or `to_py` | Durable Object SQL cursor conversion differs from the stand-in | Send the `npx wrangler tail` output; the fix belongs in `src/rigorx/do_store.py` (`_rows`) |

## Local development

`npm run dev` runs the Worker locally with `pywrangler dev` (workerd). This needs a desktop OS supported by workerd.
