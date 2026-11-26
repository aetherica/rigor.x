// Release-gate tests (2026-11-27 release directive): resilience policy and mechanisms, DNS check,
// SSRF properties, OIDC claims, idempotency, tenant isolation, account deletion, verified approvals,
// suspension and fault injection. Expected values are written by hand.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
	CircuitBreaker, DEFAULT_POLICY, Deadline, Limiter, ResilienceRegistry, ResourceExhaustedError, backoffMs, policyFromEnv, resilientFetch, retryAfterMs,
} from "../src/resilience.ts";
import { checkResolved, checkSource, dohResolver, resolveRef } from "../src/source.ts";
import { acquisitionStatus, crossrefLookup } from "../src/sources.ts";
import { parseGoogleIdToken } from "../src/google.ts";
import { dispatch, HostEngine, ACCOUNT_DELETE_CONFIRMATION } from "../src/engine.ts";
import { DurableObjectRunStore } from "../src/store.ts";
import { MemoryStore } from "../src/memory.ts";
import { isSuspended } from "../src/index-helpers.ts";
import { localBackend, publicDns } from "./backend.ts";
import { memorySql } from "./sqlite-fake.ts";

const fast = { ...DEFAULT_POLICY, retryBaseDelayMs: 50, retryMaxDelayMs: 100 };
const noSleep = async () => undefined;

// ---------------------------------------------------------------- resilience

test("policy: every parameter has bounds; invalid values are rejected and reported, defaults stay", () => {
	const { policy, rejected } = policyFromEnv({ RIGORX_RETRY_MAX_ATTEMPTS: "9", RIGORX_CB_FAILURE_RATE: "0.75", RIGORX_CB_OPEN_MS: "abc", RIGORX_ACQUISITION_CONCURRENCY: "2" });
	assert.equal(policy.retryMaxAttempts, 3);
	assert.equal(policy.cbFailureRate, 0.75);
	assert.equal(policy.cbOpenMs, 30_000);
	assert.equal(policy.acquisitionConcurrency, 2);
	assert.equal(rejected.length, 2);
	assert.deepEqual(policyFromEnv({}).policy, DEFAULT_POLICY);
	for (let a = 0; a < 10; a++) for (const r of [0, 0.5, 0.999]) assert.ok(backoffMs(a, DEFAULT_POLICY, () => r) <= DEFAULT_POLICY.retryMaxDelayMs);
	assert.equal(retryAfterMs("3"), 3_000);
	assert.equal(retryAfterMs("junk"), null);
});

test("retry: transient 503/429 are retried (Retry-After honoured, capped); 500, 404 and 401 are not", async () => {
	const delays: number[] = [];
	let calls = 0;
	const seq = (statuses: number[], headers: Record<string, string> = {}) => (async () => new Response("x", { status: statuses[Math.min(calls++, statuses.length - 1)]!, headers })) as unknown as typeof fetch;
	const run = (f: typeof fetch) => resilientFetch(f, "https://x.example/", {}, { policy: fast, deadline: new Deadline(10_000), sleep: async (ms) => { delays.push(ms); } });
	calls = 0;
	assert.equal((await run(seq([503, 503, 200]))).status, 200);
	assert.equal(calls, 3);
	calls = 0; delays.length = 0;
	assert.equal((await run(seq([429, 200], { "retry-after": "60" }))).status, 200);
	assert.deepEqual(delays, [100]); // Retry-After 60 s capped at retryMaxDelayMs
	for (const s of [500, 404, 401, 400]) {
		calls = 0;
		assert.equal((await run(seq([s, 200]))).status, s);
		assert.equal(calls, 1, `status ${s} must not be retried`);
	}
	calls = 0;
	assert.equal((await run(seq([503, 503, 503, 503]))).status, 503); // gives up after retryMaxAttempts
	assert.equal(calls, 3);
});

test("retry never outlives the deadline", async () => {
	let calls = 0;
	const failing = (async () => { calls++; throw new TypeError("network down"); }) as unknown as typeof fetch;
	await assert.rejects(resilientFetch(failing, "https://x.example/", {}, { policy: { ...fast, retryBaseDelayMs: 2_000, retryMaxDelayMs: 10_000 }, deadline: new Deadline(30), sleep: noSleep, rand: () => 0.99 }), /network down/);
	assert.equal(calls, 1);
});

test("circuit breaker: opens after consecutive failures, refuses while open, probes half-open, closes on success", () => {
	let now = 0;
	const events: string[] = [];
	const b = new CircuitBreaker("crossref", DEFAULT_POLICY, (e) => events.push(`${e.from}->${e.to}`), () => now);
	for (let i = 0; i < 4; i++) { assert.ok(b.allow()); b.failure("HTTP 503"); }
	assert.equal(b.current(), "closed");
	b.failure("HTTP 503");
	assert.equal(b.current(), "open");
	assert.equal(b.allow(), false);
	now += 30_000;
	assert.equal(b.current(), "half_open");
	assert.ok(b.allow()); assert.ok(b.allow()); assert.equal(b.allow(), false); // two probes only
	b.success(); b.success();
	assert.equal(b.current(), "closed");
	assert.deepEqual(events, ["closed->open", "open->half_open", "half_open->closed"]);
	// A failed probe reopens; a low sample never trips on rate alone.
	const c = new CircuitBreaker("wayback", { ...DEFAULT_POLICY, cbFailureThreshold: 50 }, () => undefined, () => now);
	c.failure("x"); c.success(); c.failure("x");
	assert.equal(c.current(), "closed"); // 2/3 failures, but fewer than cbMinRequests
});

test("bulkhead: at most N concurrent acquisitions, a bounded queue, then controlled refusal", async () => {
	const l = new Limiter(1, 1);
	let release!: () => void;
	const first = l.run(() => new Promise<void>((r) => { release = r; }));
	const second = l.run(async () => "queued");
	await assert.rejects(l.run(async () => "third"), ResourceExhaustedError);
	release();
	await first;
	assert.equal(await second, "queued");
});

test("one failing adapter does not open another adapter's circuit", () => {
	const reg = new ResilienceRegistry(DEFAULT_POLICY);
	for (let i = 0; i < 5; i++) reg.breaker("crossref").failure("HTTP 503");
	assert.equal(reg.breaker("crossref").current(), "open");
	assert.equal(reg.breaker("wayback").current(), "closed");
	assert.equal(reg.breaker("host:example.com").current(), "closed");
});

test("fault injection: Crossref 429 with Retry-After then success; a dead adapter degrades to a reported error", async () => {
	const reg = new ResilienceRegistry(fast);
	let n = 0;
	const flaky = (async () => (++n === 1 ? new Response("", { status: 429, headers: { "retry-after": "0" } }) : Response.json({ message: { DOI: "10.1/x", title: ["T"] } }))) as unknown as typeof fetch;
	const ok = await crossrefLookup("10.1000/x", flaky, { registry: reg, deadline: new Deadline(5_000) });
	assert.equal(ok.title, "T");
	assert.equal(n, 2);
	const dead = (async () => { throw new TypeError("connection reset"); }) as unknown as typeof fetch;
	const r = await crossrefLookup("10.1000/x", dead, { registry: reg, deadline: new Deadline(5_000) });
	assert.match(r.error!, /Crossref lookup failed/);
	assert.equal(r.retracted, null); // unknown is not "not retracted"
});

// ---------------------------------------------------------------- SSRF: DNS and properties

test("DNS check: a public name resolving to a private address is refused; DNS failure fails closed", async () => {
	const resolver = (map: Record<string, string[]>) => async (h: string) => ({ addresses: map[h] ?? [], error: null });
	assert.match((await checkResolved("rebind.example.com", resolver({ "rebind.example.com": ["93.184.216.34", "127.0.0.1"] })))!, /non-public address/);
	assert.match((await checkResolved("v6.example.com", resolver({ "v6.example.com": ["::ffff:10.0.0.1"] })))!, /non-public/);
	assert.match((await checkResolved("nx.example.com", resolver({})))!, /does not resolve/);
	assert.match((await checkResolved("x.example.com", async () => ({ addresses: [], error: "DNS lookup unavailable" })))!, /could not be verified/);
	assert.equal(await checkResolved("ok.example.com", resolver({ "ok.example.com": ["93.184.216.34", "2606:2800:220:1::248"] })), null);
	assert.equal(await checkResolved("93.184.216.34", async () => { throw new Error("must not be called"); }), null);
	// Through the real fetch path: the DoH answer for the redirect target points to loopback.
	const fetcher = (async (input: RequestInfo | URL) => {
		const u = String(input);
		if (u.startsWith("https://cloudflare-dns.com/dns-query")) {
			const name = new URL(u).searchParams.get("name");
			const type = new URL(u).searchParams.get("type");
			const data = name === "evil.example.net" ? (type === "A" ? "127.0.0.1" : null) : (type === "A" ? "93.184.216.34" : null);
			return Response.json({ Status: 0, Answer: data ? [{ type: 1, data }] : [] });
		}
		if (u.startsWith("https://public.example.com/")) return new Response(null, { status: 302, headers: { Location: "https://evil.example.net/" } });
		return new Response("must not be fetched");
	}) as typeof fetch;
	const r = await checkSource("https://public.example.com/a", fetcher);
	assert.equal(r.ok, false);
	assert.match(r.error!, /redirect refused: the host name resolves to a non-public address/);
	const reg = new ResilienceRegistry(fast);
	const down = dohResolver((async () => new Response("", { status: 503 })) as unknown as typeof fetch, reg, new Deadline(2_000));
	assert.match((await checkResolved("a.example.com", down))!, /could not be verified/);
});

test("property: private destinations are refused in every numeric and encoded spelling (2,000 seeded cases)", () => {
	let seed = 42;
	const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
	const privateV4 = () => {
		const nets: [number, number, number, number][] = [[10, rnd(256), rnd(256), rnd(256)], [127, rnd(256), rnd(256), rnd(256)], [192, 168, rnd(256), rnd(256)],
			[172, 16 + rnd(16), rnd(256), rnd(256)], [169, 254, rnd(256), rnd(256)], [100, 64 + rnd(64), rnd(256), rnd(256)], [0, rnd(256), rnd(256), rnd(256)]];
		return nets[rnd(nets.length)]!;
	};
	const spell = (a: number[]) => {
		const n = ((a[0]! << 24) | (a[1]! << 16) | (a[2]! << 8) | a[3]!) >>> 0;
		const hex = (x: number) => (x >>> 0).toString(16);
		const forms = [a.join("."), String(n), `0x${hex(n)}`, a.map((x) => `0x${x.toString(16)}`).join("."), a.map((x) => `0${x.toString(8)}`).join("."),
			`[::ffff:${a.join(".")}]`, `[::ffff:${hex((a[0]! << 8) | a[1]!)}:${hex((a[2]! << 8) | a[3]!)}]`, `[64:ff9b::${a.join(".")}]`, `${a.join(".")}.`];
		return forms[rnd(forms.length)]!;
	};
	for (let i = 0; i < 2_000; i++) {
		const url = `http://${spell(privateV4())}/x`;
		assert.ok("error" in resolveRef(url), url);
	}
	for (const u of ["http://ⓛⓞⓒⓐⓛⓗⓞⓢⓣ/", "http://%6c%6f%63%61%6c%68%6f%73%74/", "http://LocalHost./", "http://0177.0.0.1/", "http://[0::1]/", "http://xn--mgba3gch31f.localhost/"]) {
		assert.ok("error" in resolveRef(u), u);
	}
});

// ---------------------------------------------------------------- OIDC

const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const tok = (claims: object) => `${b64({ alg: "RS256" })}.${b64(claims)}.sig`;
test("OIDC: azp must be this client when present or when there are several audiences; nonce and iat are checked", () => {
	const now = 1_800_000_000;
	const base = { iss: "https://accounts.google.com", aud: "cid", sub: "123", exp: now + 600, iat: now };
	assert.equal(parseGoogleIdToken(tok({ ...base, azp: "cid" }), "cid", now).sub, "123");
	assert.throws(() => parseGoogleIdToken(tok({ ...base, aud: ["cid", "other"] }), "cid", now), /authorized party/);
	assert.throws(() => parseGoogleIdToken(tok({ ...base, azp: "other" }), "cid", now), /authorized party/);
	assert.throws(() => parseGoogleIdToken(tok({ ...base, iat: now + 3_600 }), "cid", now), /future/);
	assert.throws(() => parseGoogleIdToken(tok({ ...base, nonce: "a" }), "cid", now, "b"), /nonce/);
	assert.equal(parseGoogleIdToken(tok({ ...base, nonce: "a" }), "cid", now, "a").sub, "123");
});

// ---------------------------------------------------------------- engine harness

function harness(clock?: () => Date) {
	const sql = memorySql();
	const engine = new HostEngine(new DurableObjectRunStore(sql), { limits: { burstPerMinute: 100_000 }, memory: new MemoryStore(sql), transaction: sql.transaction, ...(clock ? { now: clock } : {}) });
	const call = (owner: string, op: string, a: object = {}) => JSON.parse(dispatch(engine, owner, op, JSON.stringify(a))) as { ok: boolean; result?: any; code?: string; message?: string };
	const ok = (owner: string, op: string, a: object = {}) => { const r = call(owner, op, a); if (!r.ok) throw new Error(`${op}: ${r.code} ${r.message}`); return r.result; };
	return { sql, engine, call, ok };
}
let step = 0;
const summary = (s: string) => `${s}: the work of this stage was done and checked, step ${++step}.`;
function planned(h: ReturnType<typeof harness>, owner: string, tier: "A4" | "A5") {
	const id = h.ok(owner, "start_run", { task: "Prepare the list of options for the team" }).run_id;
	const s = (stage: string, data: object) => h.ok(owner, "submit_stage", { run_id: id, stage, outcome: "completed", summary: summary(stage), data });
	s("QUERY", {});
	const level = tier === "A5" ? "L05_CRITICAL" : "L02_STANDARD";
	s("CLASSIFY", { objective: "Send the prepared payment to the supplier", deliverable: "One payment made with a receipt", level, stakes: "low", requirements: [{ id: "R1", text: "The payment is made correctly for the delivered result" }] });
	if (tier === "A5") {
		s("SELECT_METHODS", { methods: [{ name: "review", reason: "the payment needs a careful review" }] });
		s("ASSESS_COMPLEXITY", {});
		s("IDENTIFY_CAPABILITIES", { available: ["payments"], missing: [] });
	}
	s("PLAN", { operations: [{ id: "pay", capability: "payments", depends_on: [], completion_condition: "The payment is sent", requirement_ids: ["R1"], tier }, { id: "pay2", capability: "payments", depends_on: [], completion_condition: "The second payment is sent", tier }] });
	return { id, s };
}

// ---------------------------------------------------------------- idempotency

test("idempotency: WRITE SUCCEEDS → RESPONSE LOST → RETRY returns the first result without a second effect or charge", () => {
	const h = harness();
	const id = h.ok("google:a", "start_run", { task: "Prepare the list of options for the team" }).run_id;
	const args = { run_id: id, source_ref: "https://example.com/a", claim: "The page states one specific fact", idempotency_key: "4d1c9a52-key-0001" };
	const first = h.ok("google:a", "record_evidence", args);
	const callsAfterFirst = h.ok("google:a", "usage").calls.used;
	const retry = h.ok("google:a", "record_evidence", args);
	assert.equal(retry.evidence_id, first.evidence_id);
	assert.equal(retry.idempotent_replay, true);
	assert.equal(h.ok("google:a", "get_run", { run_id: id }).evidence_count, 1);
	assert.equal(h.ok("google:a", "usage").calls.used, callsAfterFirst); // not charged again
	const conflicting = h.call("google:a", "record_evidence", { ...args, claim: "A different claim with the same key" });
	assert.equal(conflicting.code, "INVALID_REQUEST");
	assert.match(conflicting.message!, /different call/);
	assert.match(h.call("google:a", "get_run", { run_id: id, idempotency_key: "4d1c9a52-key-0002" }).message!, /only by tools that change state/);
	assert.match(h.call("google:a", "record_evidence", { ...args, idempotency_key: "short" }).message!, /8 to 128/);
	// A failed call stores nothing: the same key can be used again once the call is valid.
	const bad = h.call("google:a", "record_evidence", { run_id: id, source_ref: "https://example.com/b", claim: "short", idempotency_key: "4d1c9a52-key-0003" });
	assert.equal(bad.ok, false);
	assert.ok(h.call("google:a", "record_evidence", { run_id: id, source_ref: "https://example.com/b", claim: "A valid claim this time around", idempotency_key: "4d1c9a52-key-0003" }).ok);
	// Keys are per owner: another owner's identical key is independent.
	const other = h.ok("google:b", "start_run", { task: "Prepare the list of options for the team", idempotency_key: "4d1c9a52-key-0001" });
	assert.notEqual(other.idempotent_replay, true);
});

test("concurrency: ten simultaneous identical requests produce one effect", async () => {
	const backend = localBackend();
	const start = await backend.run("google:c", "start_run", { task: "Prepare the list of options for the team" });
	const results = await Promise.all(Array.from({ length: 10 }, () => backend.run("google:c", "record_evidence", { run_id: start.run_id!, source_ref: "https://example.com/x", claim: "The page states one specific fact", idempotency_key: "same-key-000001" })));
	assert.equal(new Set(results.map((r) => r.evidence_id)).size, 1);
	assert.equal((await backend.run("google:c", "get_run", { run_id: start.run_id! })).evidence_count, 1);
});

// ---------------------------------------------------------------- tenant isolation

test("tenant isolation: another account can neither read, change, delete nor detect this account's objects", () => {
	const h = harness();
	const A = "google:tenant-a", B = "google:tenant-b";
	const { id } = planned(h, A, "A4");
	const ev = h.ok(A, "record_evidence", { run_id: id, source_ref: "https://example.com/private", claim: "A private source of tenant A only" }).evidence_id;
	const topic = h.ok(A, "memory_topic", { action: "create", name: "Secret project", decided_by: "user" }).topic_id;
	const item = h.ok(A, "memory_write", { topic_id: topic, text: "Tenant A keeps its supplier contract terms here" }).item_id;
	const apv = h.ok(A, "request_approval", { run_id: id, operation_id: "pay", description: "Pay the supplier" }).approval_id;
	const missingRun = "rx_" + "Z".repeat(32);
	const attempts: [string, object][] = [
		["get_run", { run_id: id }], ["submit_stage", { run_id: id, stage: "EXECUTE", outcome: "completed", summary: summary("EXECUTE"), data: {} }],
		["record_evidence", { run_id: id, source_ref: "https://x.example/", claim: "Injected evidence into another tenant" }], ["verify", { run_id: id, requirements: [] }],
		["cancel_run", { run_id: id, reason: "cancel another tenant's run now" }], ["delete_run", { run_id: id }], ["assess_sources", { run_id: id }],
		["evidence_for_check", { run_id: id, evidence_id: ev }], ["request_approval", { run_id: id, operation_id: "pay" }], ["request_approval", { approval_id: apv }],
		["approval_view", { approval_id: apv }], ["approval_decide", { approval_id: apv, decision: "approve" }],
		["memory_topic", { action: "rename", topic_id: topic, name: "Mine now", decided_by: "user" }], ["memory_topic", { action: "delete", topic_id: topic, decided_by: "user" }],
		["memory_write", { topic_id: topic, text: "Writing into another tenant's topic now" }], ["memory_delete", { item_ids: [item], decided_by: "user" }],
	];
	for (const [op, args] of attempts) {
		const r = h.call(B, op, args);
		assert.equal(r.ok, false, `${op} must fail for another tenant`);
		// Same answer as for an object that does not exist: no existence oracle.
		assert.ok(["RUN_NOT_FOUND", "NOT_FOUND"].includes(r.code!), `${op}: ${r.code} ${r.message}`);
	}
	assert.equal(h.call(B, "get_run", { run_id: missingRun }).message, h.call(B, "get_run", { run_id: id }).message);
	assert.deepEqual(h.ok(B, "memory_recall", { queries: ["supplier contract terms"] }).items, []);
	assert.deepEqual(h.ok(B, "list_runs").runs, []);
	assert.deepEqual(h.ok(B, "memory_topic", { action: "list" }).topics, []);
	// Tenant A is untouched.
	assert.equal(h.ok(A, "get_run", { run_id: id }).status, "IN_PROGRESS");
	assert.equal(h.ok(A, "memory_recall", { queries: ["supplier contract terms"] }).items[0].id, item);
	assert.equal(h.ok(A, "request_approval", { approval_id: apv }).status, "pending");
});

// ---------------------------------------------------------------- account lifecycle

test("account data deletion: explicit confirmation by the user; removes everything of that account only", () => {
	const h = harness();
	const A = "google:del-a", B = "google:del-b";
	const run = h.ok(A, "start_run", { task: "Prepare the list of options for the team" }).run_id;
	h.ok(A, "profile");
	const t = h.ok(A, "memory_topic", { action: "create", name: "To delete", decided_by: "user" }).topic_id;
	h.ok(A, "memory_write", { topic_id: t, text: "An item that must disappear with the account" });
	const runB = h.ok(B, "start_run", { task: "Prepare the list of options for the team" }).run_id;
	assert.equal(h.call(A, "delete_account_data", { confirm: "yes", decided_by: "user" }).code, "INVALID_REQUEST");
	assert.equal(h.call(A, "delete_account_data", { confirm: ACCOUNT_DELETE_CONFIRMATION, decided_by: "host" }).code, "FORBIDDEN");
	const r = h.ok(A, "delete_account_data", { confirm: ACCOUNT_DELETE_CONFIRMATION, decided_by: "user" });
	assert.equal(r.runs, 1);
	assert.equal(r.memory_items, 1);
	assert.equal(h.call(A, "get_run", { run_id: run }).code, "RUN_NOT_FOUND");
	assert.deepEqual(h.ok(A, "memory_topic", { action: "list" }).topics, []);
	assert.equal(h.ok(B, "get_run", { run_id: runB }).status, "IN_PROGRESS");
});

test("suspension: an owner whose hash matches a configured prefix is refused (server-side, fail closed)", () => {
	const hash = "a3f1c2d4e5b6a7980011223344556677889900aabbccddeeff00112233445566";
	assert.equal(isSuspended({ RIGORX_SUSPENDED_OWNERS: "a3f1c2d4e5b6a798" }, hash), true);
	assert.equal(isSuspended({ RIGORX_SUSPENDED_OWNERS: " ffff0000ffff0000 , a3f1c2d4e5b6a798" }, hash), true);
	assert.equal(isSuspended({ RIGORX_SUSPENDED_OWNERS: "a3f1" }, hash), false); // too short to be used: never matches broadly
	assert.equal(isSuspended({}, hash), false);
});

// ---------------------------------------------------------------- verified approvals

test("verified approval: requested by the host, decided by the signed-in user, engine-verified, single use", () => {
	let clock = new Date("2026-11-27T10:00:00Z");
	const h = harness(() => clock);
	const A = "google:apv";
	const { id, s } = planned(h, A, "A5");
	const sent = h.ok(A, "report_action", { run_id: id, tool_name: "send_payment", status: "EXECUTED" }).action_id;
	const sent2 = h.ok(A, "report_action", { run_id: id, tool_name: "send_payment", status: "EXECUTED" }).action_id;
	// A host-declared approval is not enough for A5.
	const declared = h.ok(A, "record_evidence", { run_id: id, source_ref: "chat:yes", claim: "The user said yes in the chat", evidence_type: "USER_APPROVAL", approves: "pay" }).evidence_id;
	assert.match(h.call(A, "submit_stage", { run_id: id, stage: "EXECUTE", outcome: "completed", summary: summary("EXECUTE"), data: { operations: [{ id: "pay", status: "done", evidence_ids: [sent, declared] }, { id: "pay2", status: "not_done", evidence_ids: [] }] } }).message!, /host-declared; an A5 operation needs/);
	const req = h.ok(A, "request_approval", { run_id: id, operation_id: "pay", description: "Pay supplier invoice 17" });
	assert.equal(req.status, "pending");
	assert.match(req.approve_path, /^\/approve\/apv_[0-9a-f]{32}$/);
	const view = h.ok(A, "approval_view", { approval_id: req.approval_id });
	assert.deepEqual([view.description, view.tier, view.plan_changed], ["Pay supplier invoice 17", "A5", false]);
	const decided = h.ok(A, "approval_decide", { approval_id: req.approval_id, decision: "approve" });
	assert.equal(decided.status, "approved");
	assert.equal(h.call(A, "approval_decide", { approval_id: req.approval_id, decision: "approve" }).code, "STAGE_CONFLICT"); // replay refused
	assert.equal(h.ok(A, "request_approval", { approval_id: req.approval_id }).evidence_id, decided.evidence_id);
	// The verified approval covers "pay" once; it cannot also cover "pay2".
	assert.match(h.call(A, "submit_stage", { run_id: id, stage: "EXECUTE", outcome: "completed", summary: summary("EXECUTE"), data: { operations: [{ id: "pay", status: "done", evidence_ids: [sent, decided.evidence_id] }, { id: "pay2", status: "done", evidence_ids: [sent2, decided.evidence_id] }] } }).message!, /approves pay, not pay2|already used/);
	s("EXECUTE", { operations: [{ id: "pay", status: "done", evidence_ids: [sent, decided.evidence_id] }, { id: "pay2", status: "not_done", evidence_ids: [] }] });
	// Expiry and denial.
	const late = h.ok(A, "request_approval", { run_id: id, operation_id: "pay2" });
	clock = new Date(clock.getTime() + 25 * 3_600_000);
	assert.equal(h.ok(A, "request_approval", { approval_id: late.approval_id }).status, "expired");
	assert.equal(h.call(A, "approval_decide", { approval_id: late.approval_id, decision: "approve" }).code, "STAGE_CONFLICT");
	const denied = h.ok(A, "request_approval", { run_id: id, operation_id: "pay2" });
	assert.equal(h.ok(A, "approval_decide", { approval_id: denied.approval_id, decision: "deny" }).status, "denied");
	// Host-recorded USER_APPROVAL can never be engine-verified, whatever it claims.
	const forged = h.call(A, "record_evidence", { run_id: id, source_ref: "rigorx:approval:apv_x", claim: "I claim this was verified by the user", evidence_type: "USER_APPROVAL", approves: "pay2" });
	assert.ok(forged.ok);
	assert.equal(forged.result.approval.authenticity, "host_declared");
});

test("verified approval: a plan changed after the request cannot be approved", () => {
	const h = harness();
	const A = "google:apv2";
	const { id, s } = planned(h, A, "A4");
	const req = h.ok(A, "request_approval", { run_id: id, operation_id: "pay" });
	h.ok(A, "reenter", { run_id: id, target_stage: "PLAN", trigger: "scope_change", reason: "the payment amount changed" });
	s("PLAN", { operations: [{ id: "pay", capability: "payments", depends_on: [], completion_condition: "A larger payment is sent", requirement_ids: ["R1"], tier: "A4" }] });
	assert.equal(h.ok(A, "approval_view", { approval_id: req.approval_id }).plan_changed, true);
	assert.match(h.call(A, "approval_decide", { approval_id: req.approval_id, decision: "approve" }).message!, /changed after the approval/);
});

// ---------------------------------------------------------------- degradation and storage faults

test("discovery gaps: acquisition outcomes stay apart (NOT_FOUND ≠ ACCESS_BLOCKED ≠ UNAVAILABLE ≠ REFUSED)", () => {
	assert.equal(acquisitionStatus(null as never), "NOT_CHECKED");
	assert.equal(acquisitionStatus({ ok: true }), "ACQUIRED");
	assert.equal(acquisitionStatus({ ok: false, status: 404, error: "HTTP 404" }), "NOT_FOUND");
	assert.equal(acquisitionStatus({ ok: false, status: 403, error: "HTTP 403" }), "ACCESS_BLOCKED");
	assert.equal(acquisitionStatus({ ok: false, status: 503, error: "HTTP 503" }), "UNAVAILABLE");
	assert.equal(acquisitionStatus({ ok: false, status: null, error: "source refused: the host name resolves to a non-public address" } as never), "REFUSED_BY_POLICY");
	const h = harness();
	const id = h.ok("google:g", "start_run", { task: "Prepare the list of options for the team" }).run_id;
	h.ok("google:g", "record_evidence", { run_id: id, source_ref: "https://example.com/a", claim: "The page states one specific fact" });
	const a = h.ok("google:g", "assess_sources", { run_id: id });
	assert.deepEqual(a.discovery_gaps.acquisition, { NOT_CHECKED: ["ev-3"] });
	assert.ok(a.discovery_gaps.domains_without_sources.some((d: any) => d.domain === "D03" && /NOT_CONNECTED/.test(d.gap)));
});

test("storage fault mid-operation: the error surfaces, nothing is half-written, the next call works", () => {
	const sql = memorySql();
	let failOn: RegExp | null = null;
	const flaky = { ...sql, exec(q: string, ...b: (string | number)[]) { if (failOn && failOn.test(q)) throw new Error("SQLITE_IOERR: disk I/O error"); return sql.exec(q, ...b); } };
	const engine = new HostEngine(new DurableObjectRunStore(flaky), { memory: new MemoryStore(flaky), transaction: sql.transaction, limits: { burstPerMinute: 1_000 } });
	const call = (op: string, a: object) => JSON.parse(dispatch(engine, "google:f", op, JSON.stringify(a)));
	const t = call("memory_topic", { action: "create", name: "Faults", decided_by: "user" }).result.topic_id;
	failOn = /INSERT INTO memory_fts/; // the item row is written first, then the index write fails
	assert.throws(() => call("memory_write", { topic_id: t, text: "An item whose index write fails half-way" }), /SQLITE_IOERR/);
	failOn = null;
	assert.equal(sql.exec("SELECT COUNT(*) AS n FROM memory_items").toArray()[0]!.n, 0); // rolled back
	assert.ok(call("memory_write", { topic_id: t, text: "An item written after the fault cleared" }).ok);
});
