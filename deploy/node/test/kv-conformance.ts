// Workers KV semantics the OAuth provider relies on, as one suite run against every KV
// implementation of the Node runtime (SQLite kv.ts and PostgreSQL pg-kv.ts).
import { test } from "node:test";
import assert from "node:assert/strict";

export interface KvUnderTest {
	get(key: string, options?: "text" | "json" | { type?: "text" | "json" }): Promise<unknown>;
	put(key: string, value: string, options?: { expirationTtl?: number; expiration?: number; metadata?: unknown }): Promise<void>;
	delete(key: string): Promise<void>;
	list(options?: { prefix?: string | null; limit?: number; cursor?: string | null }): Promise<{ keys: { name: string; expiration?: number; metadata?: unknown }[]; list_complete: boolean; cursor?: string }>;
	purgeExpired(): number | Promise<number>;
	close(): void;
}

/** make(clock) returns a fresh, empty store whose clock is clock.t (milliseconds). */
export function kvConformance(label: string, make: (clock: { t: number }) => Promise<KvUnderTest> | KvUnderTest, opts: { skip?: string | false } = {}) {
	const t = (name: string, fn: () => Promise<void>) => test(`${label}: ${name}`, { skip: opts.skip || false }, fn);

	t("expirationTtl: a key reads as missing and is not listed once it expires", async () => {
		const clock = { t: 1_800_000_000_000 };
		const kv = await make(clock);
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

	t("absolute expiration and the Workers KV minimum of 60 seconds", async () => {
		const clock = { t: 1_800_000_000_000 };
		const kv = await make(clock);
		const now = clock.t / 1000;
		await assert.rejects(kv.put("k", "v", { expirationTtl: 59 }), /at least 60/);
		await assert.rejects(kv.put("k", "v", { expiration: now + 30 }), /at least 60/);
		await kv.put("k", "v", { expiration: now + 120 });
		await kv.put("unread", "v", { expirationTtl: 60 });
		const keys = (await kv.list()).keys;
		assert.equal(keys.find((k) => k.name === "k")!.expiration, now + 120);
		clock.t += 120_000;
		assert.equal(await kv.get("k"), null);
		assert.ok((await kv.purgeExpired()) >= 1); // "unread" expired without being read: removed by the purge
		assert.deepEqual((await kv.list()).keys, []);
		kv.close();
	});

	t("put overwrites value, expiration and metadata; delete removes", async () => {
		const kv = await make({ t: 1_800_000_000_000 });
		await kv.put("client:a", "1", { expirationTtl: 60, metadata: { m: 1 } });
		await kv.put("client:a", "2");
		assert.deepEqual((await kv.list({ prefix: "client:" })).keys, [{ name: "client:a" }]);
		assert.equal(await kv.get("client:a", "text"), "2");
		await kv.delete("client:a");
		assert.equal(await kv.get("client:a"), null);
		kv.close();
	});

	t("list: byte order, exact prefix (no wildcard widening), limit and cursor", async () => {
		const kv = await make({ t: 1_800_000_000_000 });
		for (const k of ["token:u:g:3", "token:u:g:1", "token:u:g:2", "token:v:g:1", "tokenXu", "token%u", "token:u:G:9"]) await kv.put(k, "x");
		const first = await kv.list({ prefix: "token:u:", limit: 2 });
		assert.deepEqual(first.keys.map((k) => k.name), ["token:u:G:9", "token:u:g:1"]); // byte order: "G" < "g"
		assert.equal(first.list_complete, false);
		const second = await kv.list({ prefix: "token:u:", limit: 2, cursor: first.cursor });
		assert.deepEqual(second.keys.map((k) => k.name), ["token:u:g:2", "token:u:g:3"]);
		assert.equal(second.list_complete, true);
		assert.deepEqual((await kv.list({ prefix: "token%" })).keys.map((k) => k.name), ["token%u"]);
		assert.deepEqual((await kv.list({ prefix: "token_" })).keys, []);
		kv.close();
	});
}
