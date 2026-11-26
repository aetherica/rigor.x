// CI harness: starts the Node runtime and writes a REAL access token (issued by the server's own
// OAuth provider, see helpers.ts) to a file, so the official MCP SDK client (examples/mcp_smoke.py)
// can run against it. Test infrastructure only; never deployed.
// Usage: node --import ./deploy/node/register.mjs --experimental-strip-types deploy/node/test/sdk-smoke-server.ts <port> <token-file>
import { writeFileSync } from "node:fs";
import { issueToken, startTestServer } from "./helpers.ts";

const port = Number(process.argv[2] ?? 8797);
const tokenFile = process.argv[3] ?? "node-token.txt";
const srv = await startTestServer({ PORT: String(port), PUBLIC_ORIGIN: `http://127.0.0.1:${port}` });
writeFileSync(tokenFile, await issueToken(srv, "sdk-smoke"), { mode: 0o600 });
console.log(JSON.stringify({ evt: "sdk_smoke_ready", url: srv.url }));
for (const sig of ["SIGTERM", "SIGINT"] as const) process.on(sig, () => srv.shutdown(sig).then(() => process.exit(0)));
