// Tor egress for the dark-web layer (DL04): the SOCKS5h client against a local fake SOCKS server.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer as netServer, connect as netConnect, type AddressInfo } from "node:net";
import { createServer as httpServer } from "node:http";
import { createTorFetch, parseSocksUrl } from "../tor-fetch.ts";

async function fakeTor(target: number, reply = 0) {
	const names: string[] = [];
	const srv = netServer((c) => {
		let stage = 0;
		let buf = Buffer.alloc(0);
		c.on("data", (d) => {
			buf = Buffer.concat([buf, d]);
			if (stage === 0 && buf.length >= 3) { buf = buf.subarray(3); c.write(Buffer.from([5, 0])); stage = 1; }
			if (stage === 1 && buf.length >= 5 && buf[3] === 3 && buf.length >= 5 + buf[4]! + 2) {
				const len = buf[4]!;
				names.push(`${buf.subarray(5, 5 + len).toString()}:${(buf[5 + len]! << 8) | buf[6 + len]!}`);
				const rest = buf.subarray(7 + len);
				stage = 2;
				if (reply) { c.end(Buffer.from([5, reply, 0, 1, 0, 0, 0, 0, 0, 0])); return; }
				c.pause();
				c.removeAllListeners("data");
				c.write(Buffer.from([5, 0, 0, 1, 127, 0, 0, 1, 0, 80]));
				const up = netConnect(target, "127.0.0.1", () => { if (rest.length) up.write(rest); c.pipe(up).pipe(c); });
			}
		});
	});
	await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
	return { url: `socks5h://127.0.0.1:${(srv.address() as AddressInfo).port}`, names, close: () => srv.close() };
}

test("tor fetch: onion name goes to the proxy (SOCKS5h, no local DNS); status, headers and body come back", async () => {
	const web = httpServer((req, res) => { res.writeHead(200, { "content-type": "text/html", "x-path": req.url ?? "" }); res.end("<title>Hidden</title>"); });
	await new Promise<void>((r) => web.listen(0, "127.0.0.1", r));
	const tor = await fakeTor((web.address() as AddressInfo).port);
	try {
		const f = createTorFetch(tor.url);
		const r = await f("http://abcdefghijklmnopqrstuvwxyz234567abcdefghijklmnopqrstuv.onion/page?q=1", { redirect: "manual" });
		assert.equal(r.status, 200);
		assert.equal(r.headers.get("x-path"), "/page?q=1");
		assert.equal(await r.text(), "<title>Hidden</title>");
		assert.deepEqual(tor.names, ["abcdefghijklmnopqrstuvwxyz234567abcdefghijklmnopqrstuv.onion:80"]);
		await assert.rejects(f("https://example.com/", { redirect: "manual" }), /\.onion hosts only/);
		await assert.rejects(f("http://a.onion/", {}), /redirect: "manual"/);
	} finally {
		tor.close();
		web.close();
	}
});

test("tor fetch: a SOCKS error is reported in words (TTL expired = onion service did not answer)", async () => {
	const tor = await fakeTor(1, 6);
	try {
		await assert.rejects(createTorFetch(tor.url)("http://a.onion/", { redirect: "manual" }), /onion service did not answer/);
	} finally {
		tor.close();
	}
	assert.deepEqual(parseSocksUrl("socks5h://127.0.0.1:9050"), { host: "127.0.0.1", port: 9050 });
	assert.throws(() => parseSocksUrl("http://127.0.0.1:9050"), /socks5h/);
});
