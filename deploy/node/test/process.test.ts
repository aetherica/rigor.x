// The server as a real process: startup validation (exit 78, no secret in the message) and
// graceful shutdown on SIGTERM (exit 0, storage closed).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const SECRET = "very-secret-value-that-must-not-appear";

function start(env: Record<string, string>) {
	const child = spawn(process.execPath, ["--import", "./deploy/node/register.mjs", "--experimental-strip-types", "--disable-warning=ExperimentalWarning", "deploy/node/server.ts"], {
		cwd: ROOT, env: { PATH: process.env.PATH ?? "", ...env }, stdio: ["ignore", "pipe", "pipe"],
	});
	let out = "";
	child.stdout.on("data", (d) => { out += d; });
	child.stderr.on("data", (d) => { out += d; });
	const exited = new Promise<number | null>((r) => child.on("exit", (code) => r(code)));
	return { child, exited, output: () => out };
}

test("invalid configuration stops startup with exit 78 and names the variable, never the secret", async () => {
	for (const [env, pattern] of [
		[{ GOOGLE_CLIENT_SECRET: SECRET }, /PUBLIC_ORIGIN is required/],
		[{ PUBLIC_ORIGIN: "http://example.com", GOOGLE_CLIENT_SECRET: SECRET }, /must use https/],
		[{ PUBLIC_ORIGIN: "https://example.com/path", GOOGLE_CLIENT_SECRET: SECRET }, /origin only/],
		[{ PUBLIC_ORIGIN: "https://example.com", NODE_ENV: "production", GOOGLE_CLIENT_SECRET: SECRET }, /GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required/],
		[{ PUBLIC_ORIGIN: "https://example.com", PORT: "99999", GOOGLE_CLIENT_SECRET: SECRET }, /PORT must be an integer/],
	] as const) {
		const p = start({ DATA_DIR: mkdtempSync(join(tmpdir(), "rigorx-cfg-")), ...env });
		assert.equal(await p.exited, 78, p.output());
		assert.match(p.output(), pattern);
		assert.equal(p.output().includes(SECRET), false);
	}
});

test("SIGTERM: drains, closes storage and exits 0", async () => {
	const port = 20000 + Math.floor(Math.random() * 20000);
	const p = start({ PUBLIC_ORIGIN: `http://127.0.0.1:${port}`, PORT: String(port), HOST: "127.0.0.1", DATA_DIR: mkdtempSync(join(tmpdir(), "rigorx-sig-")), GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: SECRET });
	for (let i = 0; i < 100 && !p.output().includes("rigorx_start"); i++) await new Promise((r) => setTimeout(r, 100));
	assert.equal((await fetch(`http://127.0.0.1:${port}/health`)).status, 200);
	p.child.kill("SIGTERM");
	assert.equal(await p.exited, 0, p.output());
	assert.match(p.output(), /"evt":"rigorx_shutdown","phase":"complete"/);
	assert.equal(p.output().includes(SECRET), false);
});
