import { test } from "node:test";
import assert from "node:assert/strict";
import { dohResolver } from "../src/source.ts";
import { Deadline, ResilienceRegistry, DEFAULT_POLICY } from "../src/resilience.ts";

const answer = (data: unknown) => new Response(JSON.stringify(data), { headers: { "content-type": "application/dns-json" } });

test("DoH asks A and AAAA at the same time and merges them (2026-11-28 audit)", async () => {
	let inFlight = 0, peak = 0;
	const fetcher = (async (input: RequestInfo | URL) => {
		inFlight++; peak = Math.max(peak, inFlight);
		await new Promise((r) => setTimeout(r, 20));
		inFlight--;
		const aaaa = String(input).includes("type=AAAA");
		return answer({ Status: 0, Answer: [aaaa ? { type: 28, data: "2606:4700::1" } : { type: 1, data: "93.184.216.34" }] });
	}) as typeof fetch;
	const reg = new ResilienceRegistry(DEFAULT_POLICY);
	const r = await dohResolver(fetcher, reg, new Deadline(5_000))("example.org");
	assert.equal(r.error, null);
	assert.deepEqual(r.addresses.sort(), ["2606:4700::1", "93.184.216.34"]);
	assert.equal(peak, 2, "both record types were in flight together");
});

test("DoH fails closed when one record type fails at every provider", async () => {
	const fetcher = (async (input: RequestInfo | URL) => String(input).includes("type=AAAA") ? new Response("no", { status: 500 }) : answer({ Status: 0, Answer: [{ type: 1, data: "93.184.216.34" }] })) as typeof fetch;
	const r = await dohResolver(fetcher, new ResilienceRegistry(DEFAULT_POLICY), new Deadline(5_000))("example.org");
	assert.notEqual(r.error, null);
});
