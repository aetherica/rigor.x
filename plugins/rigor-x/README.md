# RIGOR-X ChatGPT / Codex Plugin

A portable hybrid Plugin package for the RIGOR-X control-plane engine.

## Components

- `plugin.json`: portable Agent Plugins manifest with OpenAI presentation metadata.
- `.codex-plugin/plugin.json`: Codex compatibility manifest.
- `mcp.json` and `.mcp.json`: portable and Codex MCP connection declarations for the same remote server.
- `skills/`: focused workflows for structured runs, evidence research, unit-aware computation, and topic memory.
- `assets/`: self-contained light/dark SVG brand marks and a compact square composer icon.

## Remote connection

The Plugin connects to:

`https://x.aetherica.workers.dev/mcp`

The endpoint uses OAuth. Users sign in with Google; every MCP request requires an OAuth access token. No API key or shared bearer token is embedded in this package.

The remote Worker currently implements the RIGOR-X engine and per-owner storage. The package does not bundle or redeploy that service.

## Tool and data boundaries

RIGOR-X provides structured workflow control, evidence and action ledgers, deterministic verification, unit-aware computation, source-resolution receipts, and per-user topic memory. The host assistant still performs research and external actions with its own available tools.

RIGOR-X verification checks stage order, requirement coverage, evidence references, receipts, and other deterministic conditions. It does not establish that submitted claims are true or that a source supports a claim.

The service stores task and stage text as hashes and lengths. It also stores source references, selected reasons and identifiers, calculation inputs/results, action receipts, and topic-memory text/keywords as described at the deployed privacy page:
https://x.aetherica.workers.dev/privacy

Terms:
https://x.aetherica.workers.dev/terms

## Validation status

This package is an implementation candidate, not a claim of OpenAI approval or publication.

Before public submission:
1. Run the repository's full tests and lint checks at the exact package commit.
2. Validate the package against the current OpenAI Plugin contract and inspect a clean extracted ZIP.
3. Test OAuth discovery, Google sign-in, tool discovery, and representative positive/negative workflows in ChatGPT and Codex.
4. Refresh the live MCP connector and verify all 21 tools against the current protocol.
5. Complete developer identity verification and prepare reviewer credentials, five positive tests, three negative tests, and a video walkthrough.
6. Confirm the public listing and legal/support URLs with the publisher.

ChatGPT end-to-end OAuth acceptance and fresh-install smoke tests have not yet been recorded for this package.
