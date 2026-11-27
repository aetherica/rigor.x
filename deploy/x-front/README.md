# Aetherica front door (`x.aetherica.workers.dev`)

A Worker of a few lines that hands every request to the Aetherica service Worker (`rigorx-mcp`)
over a service binding. The request URL keeps this host, so the service answers as
`https://x.aetherica.workers.dev`: connector address `https://x.aetherica.workers.dev/mcp`, sign-in
callbacks `https://x.aetherica.workers.dev/oauth/<google|github|openai>/callback`. Nothing is stored
here; accounts, work and memory stay in the service Worker.

Deploy: Cloudflare dashboard → Workers & Pages → `x` → Settings → Build → Connect to
`aetherica/x`, branch `main`, root directory `deploy/x-front`, deploy command `npx wrangler deploy`.
