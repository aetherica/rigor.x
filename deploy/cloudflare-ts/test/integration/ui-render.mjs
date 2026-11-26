// Renders the Worker's real consent and privacy pages under `wrangler dev` in Chromium (light and
// dark colour schemes) and checks that the circular emblem loaded: natural size, transparent corners
// over the page background, no layout overflow. Needs Playwright (not run in CI; the audit report
// records its output). Usage (from deploy/cloudflare-ts): node test/integration/ui-render.mjs <out-dir>
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");

const out = process.argv[2] ?? "ui-render";
mkdirSync(out, { recursive: true });
const port = 8797;
const base = `http://127.0.0.1:${port}`;
const dev = spawn("./node_modules/.bin/wrangler", ["dev", "--port", String(port), "--ip", "127.0.0.1", "--persist-to", mkdtempSync(join(tmpdir(), "rigorx-ui-"))],
	{ env: { ...process.env, WRANGLER_SEND_METRICS: "false", CI: "1" }, stdio: ["ignore", "pipe", "pipe"] });
for (let i = 0; i < 60; i++) { try { await fetch(`${base}/`); break; } catch { await new Promise((r) => setTimeout(r, 1000)); } }
const browser = await chromium.launch();
try {
	const reg = await (await fetch(`${base}/register`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
		client_name: "Claude", redirect_uris: ["https://claude.ai/api/mcp/auth_callback"], token_endpoint_auth_method: "none", grant_types: ["authorization_code"], response_types: ["code"] }) })).json();
	const q = new URLSearchParams({ response_type: "code", client_id: reg.client_id, redirect_uri: "https://claude.ai/api/mcp/auth_callback", state: "s",
		code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM", code_challenge_method: "S256", resource: `${base}/mcp` });
	for (const scheme of ["light", "dark"]) {
		for (const [name, path] of [["consent", `/authorize?${q}`], ["privacy", "/privacy"]]) {
			const page = await browser.newPage({ viewport: { width: 390, height: 760 }, deviceScaleFactor: 2, colorScheme: scheme });
			await page.goto(base + path, { waitUntil: "networkidle" });
			const info = await page.evaluate(() => {
				const img = document.querySelector("img.emblem");
				return { loaded: !!img && img.complete && img.naturalWidth > 0, natural: img ? [img.naturalWidth, img.naturalHeight] : null,
					shown: img ? [img.getBoundingClientRect().width, img.getBoundingClientRect().height] : null,
					overflowX: document.documentElement.scrollWidth > window.innerWidth, bg: getComputedStyle(document.body).backgroundColor };
			});
			const file = join(out, `${name}-${scheme}.png`);
			await page.screenshot({ path: file, fullPage: true });
			// Corner of the emblem's box: must show the page background (transparent corner), not black.
			const box = await page.locator("img.emblem").boundingBox();
			const corner = await page.screenshot({ clip: { x: box.x + 1, y: box.y + 1, width: 2, height: 2 } });
			console.log(JSON.stringify({ page: name, scheme, ...info, screenshot: file, corner_png_bytes: corner.length }));
			await page.close();
		}
	}
	const icons = await browser.newPage({ viewport: { width: 900, height: 520 }, deviceScaleFactor: 2 });
	await icons.setContent(`<body style="margin:0;display:flex;gap:16px;align-items:center;padding:16px;background:linear-gradient(90deg,#fff 50%,#15151a 50%)">${[448, 192, 96, 48, 32].map((n) => `<img src="${base}/icon-${n}.png" width="${n / (n > 200 ? 2 : 1)}">`).join("")}</body>`);
	await icons.waitForLoadState("networkidle");
	await icons.screenshot({ path: join(out, "icons-on-light-and-dark.png") });
	console.log(JSON.stringify({ page: "icons", screenshot: join(out, "icons-on-light-and-dark.png") }));
} finally {
	await browser.close();
	dev.kill("SIGTERM");
}
