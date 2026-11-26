// SqliteKv: the Workers KV semantics the OAuth provider relies on (TTL, listing, JSON reads).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteKv } from "../kv.ts";

function kvAt(clock: { t: number }) {
	return new SqliteKv(join(mkdtempSync(join(tmpdir(), "rigorx-kv-")), "kv.sqlite"), () => clock.t);
}

test("expirationTtl: a key reads as missing and is not listed once it expires", async () => {
	const clock = { t: 1_800_000_000_000 };
	const kv = kvAt(clock);
	await kv.put("grant:u:g1", JSON.stringify({ a: 1 }), { expirationTtl: 600 });
	await kv.put("grant:u:g2", "plain");
	assert.deepEqual(await kv.get("grant:u:g1", { type: "json" }), { a: 1 });
	assert.equal((await kv.list({ prefix: "grant:u:" })).keys.length, 2);
	clock.t += 599_000;
	assert.ok(await kv.get("grant:u:g1"));
	clock.t += 1_000; // exactly at expiry
	assert.equal(await kv.get("grant:u:g1"), null);
	assert.deepEqual((await kv.list({ prefix: "grant:u:" })).keys.map((k) => k.name), ["grant:u:g2"]);
	assert.equal(await kv.get("grant:u:g2"), "plain");
	kv.close();
});

test("absolute expiration and the Workers KV minimum of 60 seconds", async () => {
	const clock = { t: 1_800_000_000_000 };
	const kv = kvAt(clock);
	const now = clock.t / 1000;
	await assert.rejects(kv.put("k", "v", { expirationTtl: 59 }), /at least 60/);
	await assert.rejects(kv.put("k", "v", { expiration: now + 30 }), /at least 60/);
	await kv.put("k", "v", { expiration: now + 120 });
	await kv.put("unread", "v", { expirationTtl: 60 });
	const keys = (await kv.list()).keys;
	assert.equal(keys.find((k) => k.name === "k")!.expiration, now + 120);
	clock.t += 120_000;
	assert.equal(await kv.get("k"), null); // removed lazily on read
	assert.equal(kv.purgeExpired(), 1); // "unread" expired without being read: removed by the purge
	kv.close();
});

test("put overwrites value, expiration and metadata; delete removes", async () => {
	const kv = kvAt({ t: 1_800_000_000_000 });
	await kv.put("client:a", "1", { expirationTtl: 60, metadata: { m: 1 } });
	await kv.put("client:a", "2");
	const listed = await kv.list({ prefix: "client:" });
	assert.deepEqual(listed.keys, [{ name: "client:a" }]); // no expiration or metadata left over
	assert.equal(await kv.get("client:a", "text"), "2");
	await kv.delete("client:a");
	assert.equal(await kv.get("client:a"), null);
	kv.close();
});

test("list: lexicographic order, exact prefix (no wildcard widening), limit and cursor", async () => {
	const kv = kvAt({ t: 1_800_000_000_000 });
	for (const k of ["token:u:g:3", "token:u:g:1", "token:u:g:2", "token:v:g:1", "tokenXu", "token%u"]) await kv.put(k, "x");
	const first = await kv.list({ prefix: "token:u:", limit: 2 });
	assert.deepEqual(first.keys.map((k) => k.name), ["token:u:g:1", "token:u:g:2"]);
	assert.equal(first.list_complete, false);
	const second = await kv.list({ prefix: "token:u:", limit: 2, cursor: first.cursor });
	assert.deepEqual(second.keys.map((k) => k.name), ["token:u:g:3"]);
	assert.equal(second.list_complete, true);
	assert.deepEqual((await kv.list({ prefix: "token%" })).keys.map((k) => k.name), ["token%u"]); // "%" is literal
	assert.deepEqual((await kv.list({ prefix: "token_" })).keys, []); // "_" is literal
	kv.close();
});

test("values survive a reopen of the same file (persistent storage)", async () => {
	const dir = mkdtempSync(join(tmpdir(), "rigorx-kv-"));
	const a = new SqliteKv(join(dir, "kv.sqlite"));
	await a.put("client:x", JSON.stringify({ id: "x" }));
	a.close();
	const b = new SqliteKv(join(dir, "kv.sqlite"));
	assert.deepEqual(await b.get("client:x", "json"), { id: "x" });
	b.close();
});
