// The Node fetch for source checks refuses non-public addresses at connection time (Cloudflare's
// global_fetch_strictly_public equivalent). Each refusal test also proves that no connection was
// made: a local server counts the requests it receives.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { LookupAddress } from "node:dns";
import { blockedAddress, createGuardedFetch } from "../guarded-fetch.ts";
import { checkSource } from "../../cloudflare-ts/src/source.ts";

let hits = 0;
const local = createServer((_req, res) => { hits++; res.end("secret metadata"); });
await new Promise<void>((r) => local.listen(0, "127.0.0.1", () => r()));
const port = (local.address() as { port: number }).port;
after(() => local.close());

const resolveTo = (...addresses: string[]) => async (): Promise<LookupAddress[]> => addresses.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));

test("address rules match the engine's: private, loopback, link-local, mapped and metadata addresses are refused", () => {
	for (const a of ["127.0.0.1", "10.0.0.1", "169.254.169.254", "192.168.1.1", "100.64.0.1", "0.0.0.0", "::1", "fe80::1", "::ffff:127.0.0.1", "fd00::1"]) {
		assert.ok(blockedAddress(a), `${a} must be refused`);
	}
	for (const a of ["93.184.216.34", "1.1.1.1", "2606:4700:4700::1111"]) assert.equal(blockedAddress(a), null, `${a} is public`);
});

test("a host name that resolves to loopback is refused before any connection", async () => {
	hits = 0;
	const f = createGuardedFetch(resolveTo("127.0.0.1"));
	await assert.rejects(f(`http://rebind.example:${port}/`, { redirect: "manual" }), /non-public address \(.*\)/);
	assert.equal(hits, 0);
});

test("one non-public address among public ones is enough to refuse", async () => {
	hits = 0;
	const f = createGuardedFetch(resolveTo("93.184.216.34", "127.0.0.1"));
	await assert.rejects(f(`http://mixed.example:${port}/`, { redirect: "manual" }), /non-public/);
	assert.equal(hits, 0);
});

test("IP literals are checked too (metadata address, mapped loopback)", async () => {
	const f = createGuardedFetch(resolveTo("93.184.216.34"));
	await assert.rejects(f("http://169.254.169.254/latest/meta-data/", { redirect: "manual" }), /non-public/);
	await assert.rejects(f(`http://[::ffff:127.0.0.1]:${port}/`, { redirect: "manual" }), /non-public/);
	assert.equal(hits, 0);
});

test("only redirect: manual is supported (the engine checks every hop itself)", async () => {
	const f = createGuardedFetch(resolveTo("93.184.216.34"));
	await assert.rejects(f("https://example.com/"), /redirect: "manual"/);
	await assert.rejects(f("file:///etc/passwd", { redirect: "manual" }), /unsupported protocol/);
});

test("DNS rebinding: the engine's check sees a public address, the connection-time lookup sees loopback; nothing is fetched", async () => {
	hits = 0;
	const engineResolver = async () => ({ addresses: ["93.184.216.34"], error: null }); // first answer: public
	const connectFetch = createGuardedFetch(resolveTo("127.0.0.1")); // second answer: loopback
	const r = await checkSource(`http://rebind.example:${port}/`, connectFetch, () => new Date(), { resolver: engineResolver });
	assert.equal(r.ok, false);
	assert.equal(r.sha256, null);
	assert.equal(hits, 0);
});

test("a public site is fetched, uncompressed, redirects returned not followed (network; RIGORX_NET_TESTS=1)", { skip: process.env.RIGORX_NET_TESTS !== "1" }, async () => {
	const f = createGuardedFetch();
	const r = await f("https://example.com/", { redirect: "manual", signal: AbortSignal.timeout(10_000) });
	assert.equal(r.status, 200);
	assert.match(await r.text(), /Example Domain/);
	const redirect = await f("http://example.com/", { redirect: "manual", signal: AbortSignal.timeout(10_000) });
	assert.ok(redirect.status === 200 || (redirect.status >= 300 && redirect.status < 400));
});
