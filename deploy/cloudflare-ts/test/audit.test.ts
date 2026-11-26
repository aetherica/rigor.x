// Regression tests for the 2026-11-26 engineering audit (engineering/ai-system/32-*.md).
// Each test names its finding ID. They were written before the fixes and failed on the audited
// commit bf70c7e (the failure output is recorded in the audit report); they pass after the fixes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { dispatch, HostEngine } from "../src/engine.ts";
import { mandatoryStages, type Level } from "../src/protocol.ts";
import { DurableObjectRunStore } from "../src/store.ts";
import { MemoryStore } from "../src/memory.ts";
import { checkSource, resolveRef, MAX_REDIRECTS } from "../src/source.ts";
import { compute, ComputeError } from "../src/compute.ts";
import { route } from "../src/router.ts";
import { handleHttp } from "../src/mcp.ts";
import { localBackend, publicDns } from "./backend.ts";
import { memorySql } from "./sqlite-fake.ts";

type Env = { ok: true; result: any } | { ok: false; code: string; message: string };
const OWNER = "google:audit";

function harness(limits: Record<string, number> = {}) {
	const sql = memorySql();
	const memory = new MemoryStore(sql);
	const engine = new HostEngine(new DurableObjectRunStore(sql), { limits: { burstPerMinute: 100_000, ...limits }, memory });
	const call = (op: string, args: Record<string, unknown> = {}): Env => JSON.parse(dispatch(engine, OWNER, op, JSON.stringify(args)));
	const ok = (op: string, args: Record<string, unknown> = {}) => {
		const r = call(op, args);
		if (!r.ok) throw new Error(`${op} failed: ${r.code} ${r.message}`);
		return r.result;
	};
	return { sql, engine, memory, call, ok };
}
type H = ReturnType<typeof harness>;

let n = 0;
const summary = (stage: string) => `${stage}: the work for this stage was done and checked, step ${++n}.`;
const req = (id: string, extra: Record<string, unknown> = {}) => ({ id, text: `Requirement ${id} must hold for the delivered result`, ...extra });

function runner(h: H) {
	const id = h.ok("start_run", { task: "Prepare the list of options for the team" }).run_id as string;
	const submit = (stage: string, data: Record<string, unknown> = {}) => h.call("submit_stage", { run_id: id, stage, outcome: "completed", summary: summary(stage), data });
	const must = (stage: string, data: Record<string, unknown> = {}) => {
		const r = submit(stage, data);
		if (!r.ok) throw new Error(`${stage}: ${r.code} ${r.message}`);
		return r.result;
	};
	const evidence = (ref: string, extra: Record<string, unknown> = {}) => h.ok("record_evidence", { run_id: id, source_ref: ref, claim: `The source ${ref} supports a specific point`, ...extra }).evidence_id as string;
	const verify = (requirements: unknown[]) => h.call("verify", { run_id: id, requirements });
	return { id, submit, must, evidence, verify };
}

/** Drive a run to VALIDATE. `extra` lets a test add receipts (compute) before EVALUATE_EVIDENCE. */
function toValidate(h: H, level: Level, opts: { claims: (ev: string[], extra: string[]) => unknown[]; extra?: (r: ReturnType<typeof runner>) => string[]; sources?: string[] }) {
	const r = runner(h);
	r.must("QUERY");
	r.must("CLASSIFY", { objective: "Answer the question the user actually asked here", deliverable: "A short written answer with sources", level, stakes: "low", requirements: [req("R1")] });
	const stages = mandatoryStages(level);
	if (stages.includes("SELECT_METHODS")) r.must("SELECT_METHODS", { methods: [{ name: "source review", reason: "the comparison rests on sources" }] });
	if (stages.includes("ASSESS_COMPLEXITY")) r.must("ASSESS_COMPLEXITY");
	if (stages.includes("IDENTIFY_CAPABILITIES")) r.must("IDENTIFY_CAPABILITIES", { available: ["web_search"], missing: [] });
	r.must("PLAN", { operations: [{ id: "op1", capability: "web_search", depends_on: [], completion_condition: "The sources are found and recorded", requirement_ids: ["R1"], ...(stages.includes("STRESS_TEST") ? { tier: "A1" } : {}) }] });
	const ev = (opts.sources ?? ["https://source0.example.org/a", "https://source1.example.net/b"]).map((s) => r.evidence(s));
	r.must("EXECUTE", { operations: [{ id: "op1", status: "done", evidence_ids: [ev[0]] }] });
	const extra = opts.extra ? opts.extra(r) : [];
	if (stages.includes("EVALUATE_EVIDENCE")) r.must("EVALUATE_EVIDENCE", { claims: opts.claims(ev, extra), contradictions: [], ...(level === "L03_DEEP" ? {} : { assumptions: [] }) });
	return { ...r, ev, extra };
}
const check = (v: any, name: string) => v.checks.find((c: any) => c.check === name);

// ---------------------------------------------------------------- A: source acquisition

test("A2 private and reserved hosts are refused in every spelling", () => {
	const blocked = [
		"http://127.0.0.1/", "http://0x7f.0.0.1/", "http://2130706433/", "http://017700000001/", "http://127.1/", "http://0/",
		"http://10.1.2.3/", "http://172.16.0.1/", "http://192.168.1.1/", "http://169.254.169.254/latest/meta-data/",
		"http://100.64.0.1/", "http://198.18.0.1/", "http://192.0.0.1/", "http://224.0.0.1/", "http://255.255.255.255/", "http://240.0.0.1/",
		"http://[::1]/", "http://[::]/", "http://[0:0:0:0:0:0:0:1]/", "http://[::ffff:127.0.0.1]/", "http://[::ffff:7f00:1]/", "http://[::ffff:a9fe:a9fe]/",
		"http://[::127.0.0.1]/", "http://[fe80::1]/", "http://[fc00::1]/", "http://[fd12:3456::1]/", "http://[ff02::1]/", "http://[64:ff9b::7f00:1]/",
		"http://[2002:7f00:1::]/", "http://[2001:db8::1]/",
		"http://localhost/", "http://localhost./", "http://LOCALHOST/", "http://foo.localhost/", "http://printer.local/", "http://metadata.google.internal/",
		"http://metadata.google.internal./", "http://router.home.arpa/", "http://user:pw@example.com/", "file:///etc/passwd", "gopher://example.com/",
		"http://example.com:22/",
	];
	for (const u of blocked) assert.ok("error" in resolveRef(u), `${u} must be refused`);
	for (const u of ["https://example.com/a?b=1", "http://93.184.216.34/", "https://[2606:4700:4700::1111]/", "doi:10.1038/nature12373", "https://doi.org/10.1000/xyz123", "https://example.com:8443/x"]) {
		assert.ok("url" in resolveRef(u), `${u} must be allowed`);
	}
});

test("A1 a public URL that redirects to a private address is refused at the redirect hop", async () => {
	const seen: string[] = [];
	const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input);
		seen.push(url);
		if (init?.redirect !== "manual") {
			// A runtime that follows redirects itself would end up on the metadata address.
			seen.push("http://169.254.169.254/latest/meta-data/");
			const r = new Response("secret");
			Object.defineProperty(r, "url", { value: "http://169.254.169.254/latest/meta-data/" });
			return r;
		}
		if (url.startsWith("https://public.example.com/")) return new Response(null, { status: 302, headers: { Location: "http://169.254.169.254/latest/meta-data/" } });
		return new Response("unexpected");
	}) as typeof fetch;
	const result = await checkSource("https://public.example.com/start", fetcher, undefined, { resolver: publicDns });
	assert.equal(result.ok, false);
	assert.match(String(result.error), /redirect/i);
	assert.ok(!seen.some((u) => u.includes("169.254")), `fetched ${JSON.stringify(seen)}`);
});

test("A1 redirect chains: relative locations followed, loops and long chains stopped", async () => {
	let calls = 0;
	const chain = (async (input: RequestInfo | URL) => {
		calls++;
		const url = new URL(String(input));
		if (url.pathname === "/loop") return new Response(null, { status: 301, headers: { Location: "/loop" } });
		const step = Number(url.searchParams.get("n") ?? "0");
		if (url.pathname === "/hop" && step < 50) return new Response(null, { status: 307, headers: { Location: `/hop?n=${step + 1}` } });
		if (url.pathname === "/start") return new Response(null, { status: 302, headers: { Location: "/final" } });
		return new Response("final body", { status: 200, headers: { "content-type": "text/plain" } });
	}) as typeof fetch;
	const ok = await checkSource("https://example.com/start", chain, undefined, { resolver: publicDns });
	assert.equal(ok.ok, true);
	assert.equal(ok.final_url, "https://example.com/final");
	assert.deepEqual(ok.redirects, ["https://example.com/final"]);
	calls = 0;
	const loop = await checkSource("https://example.com/loop", chain, undefined, { resolver: publicDns });
	assert.equal(loop.ok, false);
	assert.match(String(loop.error), /loop/);
	assert.ok(calls <= 2);
	calls = 0;
	const long = await checkSource("https://example.com/hop", chain, undefined, { resolver: publicDns });
	assert.equal(long.ok, false);
	assert.match(String(long.error), /more than \d+ redirects/);
	assert.ok(calls <= MAX_REDIRECTS + 1, `made ${calls} requests`);
});

test("A3 no external fetch is made once the owner's quota is used up", async () => {
	const h = harness({ callsPerDay: 4 });
	let fetches = 0;
	const fetcher = (async () => { fetches++; return new Response("ok"); }) as typeof fetch;
	const backend = localBackend(h.engine, fetcher);
	const r = runner(h); // start_run: 1 call
	const ev = r.evidence("https://example.com/a"); // 2
	h.ok("record_evidence", { run_id: r.id, source_ref: "https://example.com/b", claim: "Another source supports a point" }); // 3
	h.ok("record_evidence", { run_id: r.id, source_ref: "https://example.com/c", claim: "A third source supports a point" }); // 4 = limit
	await assert.rejects(backend.checkSource(OWNER, { run_id: r.id, evidence_id: ev }), /QUOTA|limit/i);
	assert.equal(fetches, 0, "the fetch must not happen when the quota is exhausted");
});

// ---------------------------------------------------------------- B: evidence and validation

test("B2 an unrelated successful computation does not validate a numeric claim", () => {
	const h = harness();
	const r = toValidate(h, "L06_HYPER_RIGOROUS", {
		extra: (rr) => [h.ok("compute", { run_id: rr.id, expression: "1 + 1" }).evidence_id],
		claims: (ev, extra) => [{ id: "C1", text: "The measured output is 42 kilowatts in total", status: "VERIFIED", evidence_ids: [ev[0], ev[1], extra[0]], requirement_ids: ["R1"], value: { status: "KNOWN", number: 42, unit: "kW" } }],
	});
	const v = (r.verify([{ id: "R1", met: true, evidence_ids: [r.ev[0], r.ev[1]] }]) as any).result;
	assert.equal(v.passed, false);
	assert.equal(check(v, "numeric_claims_computed").passed, false);
});

test("B2 a computation whose checked value matches the claim validates it; a mismatching one does not", () => {
	const good = harness();
	const r = toValidate(good, "L06_HYPER_RIGOROUS", {
		extra: (rr) => [good.ok("compute", { run_id: rr.id, expression: "P * t", variables: { P: { value: 6, unit: "kW" }, t: { value: 7, unit: "1" } }, expect: { value: 42, unit: "kW", rel_tol: 1e-9 } }).evidence_id],
		claims: (ev, extra) => [{ id: "C1", text: "The measured output is 42 kilowatts in total", status: "VERIFIED", evidence_ids: [ev[0], ev[1], extra[0]], requirement_ids: ["R1"], value: { status: "KNOWN", number: 42, unit: "kW" } }],
	});
	assert.equal((r.verify([{ id: "R1", met: true, evidence_ids: [r.ev[0], r.ev[1]] }]) as any).result.passed, true);
	const bad = harness();
	const s = toValidate(bad, "L06_HYPER_RIGOROUS", {
		extra: (rr) => [bad.ok("compute", { run_id: rr.id, expression: "6 [kW] * 7", expect: { value: 42, unit: "kW" } }).evidence_id],
		claims: (ev, extra) => [{ id: "C1", text: "The measured output is 43 kilowatts in total", status: "VERIFIED", evidence_ids: [ev[0], ev[1], extra[0]], requirement_ids: ["R1"], value: { status: "KNOWN", number: 43, unit: "kW" } }],
	});
	const v = (s.verify([{ id: "R1", met: true, evidence_ids: [s.ev[0], s.ev[1]] }]) as any).result;
	assert.equal(check(v, "numeric_claims_computed").passed, false);
});

test("B3 omitting requirement_ids does not let an UNKNOWN value support a met requirement", () => {
	const h = harness();
	const r = toValidate(h, "L03_DEEP", {
		claims: (ev) => [{ id: "C1", text: "The market share figure for the product line", status: "SUPPORTED", evidence_ids: [ev[0]], value: { status: "UNKNOWN" } }],
	});
	const v = (r.verify([{ id: "R1", met: true, evidence_ids: [r.ev[0]] }]) as any).result;
	assert.equal(v.passed, false);
	assert.equal(check(v, "unknown_values_not_supporting").passed, false);
});

test("B1 a USER_APPROVAL is bound to one operation and cannot be reused for another", () => {
	const h = harness();
	const r = runner(h);
	r.must("QUERY");
	r.must("CLASSIFY", { objective: "Send the two prepared messages to the team", deliverable: "Two messages sent with receipts", level: "L02_STANDARD", stakes: "low", requirements: [req("R1")] });
	r.must("PLAN", { operations: [
		{ id: "op1", capability: "email", depends_on: [], completion_condition: "The first message is sent", requirement_ids: ["R1"], tier: "A4" },
		{ id: "op2", capability: "email", depends_on: [], completion_condition: "The second message is sent", requirement_ids: ["R1"], tier: "A4" },
	] });
	const a1 = h.ok("report_action", { run_id: r.id, tool_name: "send_email", status: "EXECUTED" }).action_id;
	const a2 = h.ok("report_action", { run_id: r.id, tool_name: "send_email", status: "EXECUTED" }).action_id;
	const approval = h.ok("record_evidence", { run_id: r.id, source_ref: "chat:message:approve-first", claim: "The user approved sending the first message", evidence_type: "USER_APPROVAL", approves: "op1" }).evidence_id;
	const reused = r.submit("EXECUTE", { operations: [{ id: "op1", status: "done", evidence_ids: [a1, approval] }, { id: "op2", status: "done", evidence_ids: [a2, approval] }] }) as any;
	assert.equal(reused.ok, false);
	assert.match(reused.message, /approval/i);
});

test("B4 run_validated memory must be the exact text of a claim of that validated run", () => {
	const h = harness();
	const r = runner(h);
	r.must("QUERY");
	r.must("CLASSIFY", { objective: "Answer the question the user actually asked here", deliverable: "A short written answer with sources", level: "L02_STANDARD", stakes: "low", requirements: [req("R1")] });
	r.must("PLAN", { operations: [{ id: "op1", capability: "web_search", depends_on: [], completion_condition: "The source is found", requirement_ids: ["R1"] }] });
	const ev = r.evidence("https://example.com/source");
	r.must("EXECUTE", { operations: [{ id: "op1", status: "done", evidence_ids: [ev] }] });
	assert.equal((r.verify([{ id: "R1", met: true, evidence_ids: [ev] }]) as any).result.passed, true);
	const topic = h.ok("memory_topic", { action: "create", name: "Audit topic", decided_by: "user" }).topic_id;
	const forged = h.call("memory_write", { topic_id: topic, text: "Anything at all can be stored as validated knowledge here", trust: "run_validated", provenance: { run_id: r.id } });
	assert.equal(forged.ok, false);
	assert.match((forged as any).message, /claim|evidence/i);
});

test("D a done operation whose prerequisite failed is refused", () => {
	const h = harness();
	const r = runner(h);
	r.must("QUERY");
	r.must("CLASSIFY", { objective: "Answer the question the user actually asked here", deliverable: "A short written answer with sources", level: "L02_STANDARD", stakes: "low", requirements: [req("R1")] });
	r.must("PLAN", { operations: [
		{ id: "fetch", capability: "web_search", depends_on: [], completion_condition: "The data is downloaded" },
		{ id: "analyse", capability: "code_execution", depends_on: ["fetch"], completion_condition: "The data is analysed", requirement_ids: ["R1"] },
	] });
	const ev = r.evidence("https://example.com/analysis");
	const bad = r.submit("EXECUTE", { operations: [{ id: "fetch", status: "failed", evidence_ids: [] }, { id: "analyse", status: "done", evidence_ids: [ev] }] }) as any;
	assert.equal(bad.ok, false);
	assert.match(bad.message, /depends on fetch/);
});

// ---------------------------------------------------------------- C: memory

test("C1 a merge that collides changes nothing", () => {
	const h = harness();
	const a = h.ok("memory_topic", { action: "create", name: "Alpha", decided_by: "user" }).topic_id;
	const b = h.ok("memory_topic", { action: "create", name: "Beta", decided_by: "user" }).topic_id;
	const ax = h.ok("memory_topic", { action: "create", name: "Shared", parent_id: a, decided_by: "user" }).topic_id;
	h.ok("memory_topic", { action: "create", name: "Shared", parent_id: b, decided_by: "user" });
	const item = h.ok("memory_write", { topic_id: a, text: "Alpha keeps its own fact about the reactor design" }).item_id;
	const before = h.ok("memory_topic", { action: "list" }).topics;
	const merged = h.call("memory_topic", { action: "merge", topic_id: a, into_id: b, decided_by: "user" });
	assert.equal(merged.ok, false);
	assert.deepEqual(h.ok("memory_topic", { action: "list" }).topics, before);
	const recalled = h.ok("memory_recall", { queries: ["reactor design"] }).items;
	assert.equal(recalled[0].id, item);
	assert.equal(recalled[0].topic_id, a);
	assert.ok(before.some((t: any) => t.id === ax && t.parent_id === a));
});

test("C2 moving a topic next to a sibling of the same name is a clear error, not a database error", () => {
	const h = harness();
	const a = h.ok("memory_topic", { action: "create", name: "Notes", decided_by: "user" }).topic_id;
	const p = h.ok("memory_topic", { action: "create", name: "Parent", decided_by: "user" }).topic_id;
	h.ok("memory_topic", { action: "create", name: "Notes", parent_id: p, decided_by: "user" });
	const moved = h.call("memory_topic", { action: "move", topic_id: a, parent_id: p, decided_by: "user" });
	assert.equal(moved.ok, false);
	assert.equal((moved as any).code, "INVALID_REQUEST");
	assert.match((moved as any).message, /already exists/);
});

test("C3 a short query matches whole words only (AI does not match chair)", () => {
	const h = harness();
	const t = h.ok("memory_topic", { action: "create", name: "Mixed", decided_by: "user" }).topic_id;
	h.ok("memory_write", { topic_id: t, text: "The chair in the meeting room is made of oak and steel" });
	const ai = h.ok("memory_write", { topic_id: t, text: "AI safety review notes for the evaluation plan" }).item_id;
	const got = h.ok("memory_recall", { queries: ["AI"] }).items.map((i: any) => i.id);
	assert.deepEqual(got, [ai]);
});

test("C4 supersedes stays inside its topic and cannot override the user's item", () => {
	const h = harness();
	const a = h.ok("memory_topic", { action: "create", name: "Project A", decided_by: "user" }).topic_id;
	const b = h.ok("memory_topic", { action: "create", name: "Project B", decided_by: "user" }).topic_id;
	const old = h.ok("memory_write", { topic_id: a, kind: "decision", text: "Project A uses PostgreSQL as its main database", trust: "user_confirmed", decided_by: "user" }).item_id;
	const cross = h.call("memory_write", { topic_id: b, kind: "decision", text: "Project B uses SQLite for its small database", supersedes: old });
	assert.equal(cross.ok, false);
	const host = h.call("memory_write", { topic_id: a, kind: "decision", text: "Project A now uses MySQL as its main database", supersedes: old });
	assert.equal(host.ok, false);
	assert.match((host as any).message, /user/);
	const recalled = h.ok("memory_recall", { queries: ["PostgreSQL database"] }).items;
	assert.equal(recalled[0].id, old);
	assert.equal(recalled[0].status, "active");
});

// ---------------------------------------------------------------- E, F, G

test("E malformed unit exponents are controlled errors, never runtime exceptions", () => {
	for (const expression of ["2 [m^2000]", "2 [m^1/13]", "2 [kg^-1001]", "2 [m^99999999999999999999]", "((((2 [m])^3)^3)^3)^3"]) {
		try {
			compute({ expression });
		} catch (e) {
			assert.ok(e instanceof ComputeError, `${expression}: ${(e as Error).name} ${(e as Error).message}`);
		}
	}
});

test("F an explicit low-effort token cannot lower a risky task below its risk floor", () => {
	assert.ok(["L05_CRITICAL", "L06_HYPER_RIGOROUS"].includes(route("/l01 delete the production database and rotate all credentials").level));
	assert.ok(["L03_DEEP", "L04_COMPLEX", "L05_CRITICAL", "L06_HYPER_RIGOROUS"].includes(route("/l01 what is a password manager").level));
	assert.equal(route("/l01 what is gravity").level, "L01_BASIC");
	// Destructive action with no risk vocabulary (found on the live server after the 2.1.0 deploy).
	assert.equal(route("/l01 delete production database and all backups").level, "L05_CRITICAL");
	assert.equal(route("delete production database and all backups").level, "L05_CRITICAL");
	assert.equal(route("/l01 wipe the server").level, "L05_CRITICAL");
	assert.equal(route("/l01 how do I format a date in javascript").level, "L03_DEEP");
	const bn = route("আমার ব্যাংক অ্যাকাউন্টের পাসওয়ার্ড কীভাবে রিসেট করব");
	assert.ok(bn.risk_score >= 1, JSON.stringify(bn.signals));
});

test("G oversized bodies, non-scalar ids and excessive nesting are refused before dispatch", async () => {
	const backend = localBackend();
	const post = (body: string) => handleHttp(new Request("https://x/mcp", { method: "POST", body, headers: { "content-type": "application/json" } }), backend, OWNER);
	const big = await post(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "rigorx_route", arguments: { task: "x".repeat(2_000_000) } } }));
	assert.equal(big.status, 413);
	const objId = await (await post(JSON.stringify({ jsonrpc: "2.0", id: { a: 1 }, method: "ping" }))).json() as any;
	assert.equal(objId.error.code, -32600);
	let deep = "1";
	for (let i = 0; i < 200; i++) deep = `[${deep}]`;
	const nested = await post(`{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"rigorx_route","arguments":{"task":${deep}}}}`);
	assert.equal(nested.status, 400);
});

// ---------------------------------------------------------------- edge cases of the fixes

test("C1 every operation is atomic: writes made before an error are rolled back", () => {
	const sql = memorySql();
	const engine = new HostEngine(new DurableObjectRunStore(sql), { transaction: sql.transaction });
	sql.exec("CREATE TABLE probe (x INTEGER)");
	assert.throws(() => engine.atomic(() => { sql.exec("INSERT INTO probe VALUES (1)"); throw new Error("boom"); }), /boom/);
	assert.equal(sql.exec("SELECT COUNT(*) AS n FROM probe").toArray()[0]!.n, 0);
	engine.atomic(() => sql.exec("INSERT INTO probe VALUES (2)"));
	assert.equal(sql.exec("SELECT COUNT(*) AS n FROM probe").toArray()[0]!.n, 1);
});

test("B1 an approval expires, and a plan changed after the approval invalidates it", () => {
	let clock = new Date("2026-11-26T10:00:00Z");
	const sql = memorySql();
	const engine = new HostEngine(new DurableObjectRunStore(sql), { limits: { burstPerMinute: 100_000 }, now: () => clock, transaction: sql.transaction });
	const call = (op: string, a: object): Env => JSON.parse(dispatch(engine, OWNER, op, JSON.stringify(a)));
	const ok = (op: string, a: object) => { const r = call(op, a); if (!r.ok) throw new Error(`${op}: ${r.message}`); return r.result; };
	const id = ok("start_run", { task: "Prepare the list of options for the team" }).run_id;
	const s = (stage: string, data: object) => call("submit_stage", { run_id: id, stage, outcome: "completed", summary: `${stage}: the work of this stage was done and checked ${++n}.`, data });
	s("QUERY", {});
	s("CLASSIFY", { objective: "Send the prepared message to the team", deliverable: "One message sent with a receipt", level: "L02_STANDARD", stakes: "low", requirements: [req("R1")] });
	const plan = (condition: string) => ({ operations: [{ id: "op1", capability: "email", depends_on: [], completion_condition: condition, requirement_ids: ["R1"], tier: "A4" }] });
	s("PLAN", plan("The message is sent to the team"));
	const sent = ok("report_action", { run_id: id, tool_name: "send_email", status: "EXECUTED" }).action_id;
	const approval = ok("record_evidence", { run_id: id, source_ref: "chat:approve", claim: "The user approved sending the message", evidence_type: "USER_APPROVAL", approves: "op1" });
	assert.deepEqual(approval.approval, { approves: "op1", expires_at: "2026-11-27T10:00:00.000Z", authenticity: "host_declared", single_use: true });
	clock = new Date("2026-11-27T10:00:01Z");
	const late = call("submit_stage", { run_id: id, stage: "EXECUTE", outcome: "completed", summary: "EXECUTE: the message was sent and the receipt recorded.", data: { operations: [{ id: "op1", status: "done", evidence_ids: [sent, approval.evidence_id] }] } });
	assert.match((late as any).message, /expired/);
	clock = new Date("2026-11-26T11:00:00Z");
	ok("reenter", { run_id: id, target_stage: "PLAN", trigger: "scope_change", reason: "the message now goes to everyone" });
	s("PLAN", plan("The message is sent to the whole company"));
	const stale = call("submit_stage", { run_id: id, stage: "EXECUTE", outcome: "completed", summary: "EXECUTE: the message was sent and the receipt recorded again.", data: { operations: [{ id: "op1", status: "done", evidence_ids: [sent, approval.evidence_id] }] } });
	assert.match((stale as any).message, /earlier version of op1/);
});

test("B4 the exact text of a validated evidence claim may be stored as run_validated; a tampered item loses its trust", () => {
	const h = harness();
	const r = runner(h);
	r.must("QUERY");
	r.must("CLASSIFY", { objective: "Answer the question the user actually asked here", deliverable: "A short written answer with sources", level: "L02_STANDARD", stakes: "low", requirements: [req("R1")] });
	r.must("PLAN", { operations: [{ id: "op1", capability: "web_search", depends_on: [], completion_condition: "The source is found", requirement_ids: ["R1"] }] });
	const claimText = "The reactor design uses passive cooling for its core";
	const evid = h.ok("record_evidence", { run_id: r.id, source_ref: "https://example.com/reactor", claim: claimText }).evidence_id;
	r.must("EXECUTE", { operations: [{ id: "op1", status: "done", evidence_ids: [evid] }] });
	assert.equal((r.verify([{ id: "R1", met: true, evidence_ids: [evid] }]) as any).result.passed, true);
	const topic = h.ok("memory_topic", { action: "create", name: "Reactor", decided_by: "user" }).topic_id;
	const altered = h.call("memory_write", { topic_id: topic, text: claimText + " and needs no pumps", trust: "run_validated", provenance: { run_id: r.id, evidence_id: evid } });
	assert.match((altered as any).message, /SHA-256 differs/);
	const item = h.ok("memory_write", { topic_id: topic, text: claimText, trust: "run_validated", provenance: { run_id: r.id, evidence_id: evid } }).item_id;
	const recalled = h.ok("memory_recall", { queries: ["passive cooling"] }).items[0];
	assert.equal(recalled.trust, "run_validated");
	assert.equal(recalled.integrity, "ok");
	assert.equal(recalled.provenance.anchor, "evidence");
	h.sql.exec("UPDATE memory_items SET text = ? WHERE id = ?", "The reactor design needs no cooling at all for its core", item);
	const tampered = h.ok("memory_recall", { queries: ["reactor design"] }).items[0];
	assert.equal(tampered.integrity, "mismatch");
	assert.equal(tampered.trust, "host_inferred");
});

test("C5 reads and deletes are never refused by the daily quota, but count against the burst limit", () => {
	const h = harness({ callsPerDay: 1, burstPerMinute: 5 });
	const t = h.ok("memory_topic", { action: "create", name: "Quota", decided_by: "user" }).topic_id; // the one metered call
	assert.equal((h.call("memory_topic", { action: "create", name: "Second", decided_by: "user" }) as any).code, "QUOTA_EXCEEDED");
	// The refused call is not counted in the burst window (the daily check refuses first): 1 + 4 = 5.
	for (let i = 0; i < 4; i++) assert.ok(h.call("memory_recall", { queries: ["anything"] }).ok);
	assert.equal((h.call("memory_recall", { queries: ["anything"] }) as any).code, "QUOTA_EXCEEDED");
	assert.ok(t);
	// Listing topics is a read: never refused by the daily quota (only the burst limit applies).
	const h2 = harness({ callsPerDay: 1, burstPerMinute: 100 });
	h2.ok("memory_topic", { action: "create", name: "Only", decided_by: "user" });
	assert.equal(h2.ok("memory_topic", { action: "list" }).topics.length, 1);
});

test("A3 a source check on a finished run is refused before anything is fetched", async () => {
	const h = harness();
	let fetches = 0;
	const backend = localBackend(h.engine, (async () => { fetches++; return new Response("x"); }) as typeof fetch);
	const r = runner(h);
	const e = r.evidence("https://example.com/a");
	h.ok("cancel_run", { run_id: r.id, reason: "the user stopped this run early" });
	await assert.rejects(backend.checkSource(OWNER, { run_id: r.id, evidence_id: e }), /CANCELLED/);
	assert.equal(fetches, 0);
});

test("E fuzz: 20,000 random expressions and units never raise anything but ComputeError", () => {
	let seed = 20261126;
	const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
	const atoms = ["1", "0", "-", "+", "*", "/", "^", "(", ")", ",", "2.5e300", "1e-320", "pi", "c", "x", "sqrt", "ln", "exp", "min", "pow", "[m]", "[kg^2/s]", "[m^1/13]", "[J/(mol K)]", "[", "]", "[eV]", "[%]", "[1/0]", "[m^-1001]", "9".repeat(400), ".", "e", "  "];
	for (let i = 0; i < 20_000; i++) {
		const expression = Array.from({ length: 1 + Math.floor(rand() * 12) }, () => atoms[Math.floor(rand() * atoms.length)]).join(rand() < 0.5 ? "" : " ");
		const unit = Array.from({ length: Math.floor(rand() * 4) }, () => ["m", "s^-2", "^", "/", "(", ")", "kg", "2", "1/3", "Ω", "%", "µm", "x"][Math.floor(rand() * 13)]).join("");
		for (const input of [{ expression }, { expression, as: unit || "m" }, { expression, variables: { x: { value: rand() * 10, unit } } }, { expression, expect: { value: 1, unit } }]) {
			try {
				const r = compute(input);
				assert.ok(Number.isFinite(r.value_si), `${expression} gave ${r.value_si}`);
			} catch (e) {
				assert.ok(e instanceof ComputeError, `${JSON.stringify(input)}: ${(e as Error).name}: ${(e as Error).message}`);
			}
		}
	}
});

test("G a normal request still passes the limits; a null id is refused (MCP forbids it)", async () => {
	const backend = localBackend();
	const post = (body: unknown) => handleHttp(new Request("https://x/mcp", { method: "POST", body: JSON.stringify(body) }), backend, OWNER);
	const ok = await (await post({ jsonrpc: "2.0", id: "a-1", method: "initialize", params: { protocolVersion: "2025-11-25" } })).json() as any;
	assert.equal(ok.result.serverInfo.icons.length, 4);
	assert.equal((await post({ jsonrpc: "2.0", id: null, method: "ping" })).status, 400);
	assert.equal((await post({ jsonrpc: "2.0", id: 1.5, method: "ping" })).status, 400);
	assert.equal((await post({ jsonrpc: "2.0", method: "notifications/initialized" })).status, 202);
});

test("§11 every icon advertised in serverInfo exists in public/ (served as a static asset)", async () => {
	const { existsSync } = await import("node:fs");
	const { ICON_SIZES } = await import("../src/mcp.ts");
	for (const n of ICON_SIZES) assert.ok(existsSync(new URL(`../public/icon-${n}.png`, import.meta.url)), `public/icon-${n}.png`);
	assert.ok(existsSync(new URL("../public/favicon.ico", import.meta.url)));
});

test("H store integrity: history is append-only (an edited, removed or reordered event is refused)", async () => {
	const { DurableObjectRunStore: Store, EventIntegrityError, RevisionConflict } = await import("../src/store.ts");
	const sql = memorySql();
	const store = new Store(sql);
	const ev = (i: number, details: Record<string, unknown> = {}) => ({ sequence: i, type: "E", stage: "QUERY", timestamp: `2026-11-26T00:00:0${i}Z`, details });
	store.create("o", "rx_integrity00000000000", { events: [ev(1), ev(2, { a: 1, b: [1, 2] })] } as never, {});
	const r2 = store.save("o", "rx_integrity00000000000", { events: [ev(1), ev(2, { b: [1, 2], a: 1 }), ev(3)] } as never, {}, 1); // key order does not matter
	assert.equal(r2, 2);
	assert.throws(() => store.save("o", "rx_integrity00000000000", { events: [ev(1), ev(2, { a: 2, b: [1, 2] }), ev(3), ev(4)] } as never, {}, 2), EventIntegrityError);
	assert.throws(() => store.save("o", "rx_integrity00000000000", { events: [ev(1), ev(2, { a: 1, b: [1, 2] })] } as never, {}, 2), EventIntegrityError);
	assert.throws(() => store.save("o", "rx_integrity00000000000", { events: [ev(2, { a: 1, b: [1, 2] }), ev(1), ev(3)] } as never, {}, 2), EventIntegrityError);
	assert.throws(() => store.save("o", "rx_integrity00000000000", { events: [ev(1), ev(2, { a: 1, b: [1, 2] }), ev(3), ev(4)] } as never, {}, 1), RevisionConflict);
	assert.equal(store.save("o", "rx_integrity00000000000", { events: [ev(1), ev(2, { a: 1, b: [1, 2] }), ev(3), ev(4)], other: { events: [] } } as never, {}, 2), 3);
});

test("B1 an approval valid when the operation ran stays valid at a later validation", () => {
	let clock = new Date();
	const sql = memorySql();
	const engine = new HostEngine(new DurableObjectRunStore(sql), { limits: { burstPerMinute: 100_000 }, now: () => clock, transaction: sql.transaction });
	const call = (op: string, a: object): Env => JSON.parse(dispatch(engine, OWNER, op, JSON.stringify(a)));
	const ok = (op: string, a: object) => { const r = call(op, a); if (!r.ok) throw new Error(`${op}: ${r.message}`); return r.result; };
	const id = ok("start_run", { task: "Prepare the list of options for the team" }).run_id;
	const s = (stage: string, data: object) => ok("submit_stage", { run_id: id, stage, outcome: "completed", summary: `${stage}: the work of this stage was done and checked, step ${++n}.`, data });
	s("QUERY", {});
	s("CLASSIFY", { objective: "Send the prepared message to the team", deliverable: "One message sent with a receipt", level: "L02_STANDARD", stakes: "low", requirements: [req("R1")] });
	s("PLAN", { operations: [{ id: "op1", capability: "email", depends_on: [], completion_condition: "The message is sent to the team", requirement_ids: ["R1"], tier: "A4" }] });
	const sent = ok("report_action", { run_id: id, tool_name: "send_email", status: "EXECUTED" }).action_id;
	const approval = ok("record_evidence", { run_id: id, source_ref: "chat:approve", claim: "The user approved sending the message", evidence_type: "USER_APPROVAL", approves: "op1" }).evidence_id;
	s("EXECUTE", { operations: [{ id: "op1", status: "done", evidence_ids: [sent, approval] }] });
	clock = new Date(clock.getTime() + 3 * 86_400_000); // validated three days later
	const v = ok("verify", { run_id: id, requirements: [{ id: "R1", met: true, evidence_ids: [sent] }] });
	assert.equal(v.checks.find((c: any) => c.check === "approvals_recorded").passed, true);
	assert.equal(v.passed, true);
});
