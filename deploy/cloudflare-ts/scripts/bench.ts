// CPU benchmark of engine operations (2026-11-26 audit, directive §09). Runs the same workload against
// any checkout of deploy/cloudflare-ts, so the audited commit and the current code are measured by
// one harness: node --experimental-strip-types scripts/bench.ts [<path to deploy/cloudflare-ts>]
// Node 22 on the audit container (not workerd): absolute numbers differ on Cloudflare; ratios between
// two runs of this script are what the report compares. Prints JSON.
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(process.argv[2] ?? ".");
const mod = async (p: string) => import(pathToFileURL(resolve(root, p)).href);
const { dispatch, HostEngine } = await mod("src/engine.ts");
const { DurableObjectRunStore } = await mod("src/store.ts");
const { MemoryStore } = await mod("src/memory.ts");
const { memorySql } = await mod("test/sqlite-fake.ts");
const { handleMessage } = await mod("src/mcp.ts");

const stats = (xs: number[]) => {
	const s = [...xs].sort((a, b) => a - b);
	const q = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))]!;
	return { n: s.length, median_ms: +q(0.5).toFixed(4), p95_ms: +q(0.95).toFixed(4), max_ms: +s[s.length - 1]!.toFixed(4) };
};
function engine() {
	const sql = memorySql();
	const e = new HostEngine(new DurableObjectRunStore(sql), { limits: { burstPerMinute: 1e9, callsPerDay: 1e9, runsPerDay: 1e9, storedRuns: 1e9 }, memory: new MemoryStore(sql), ...(sql.transaction ? { transaction: sql.transaction } : {}) });
	const call = (op: string, args: object) => {
		const r = JSON.parse(dispatch(e, "google:bench", op, JSON.stringify(args)));
		if (!r.ok) throw new Error(`${op}: ${r.code} ${r.message}`);
		return r.result;
	};
	return { e, sql, call };
}
const time = (fn: () => unknown) => { const t = performance.now(); fn(); return performance.now() - t; };
const out: Record<string, unknown> = { root, node: process.version };

// Warm-up (JIT), then measure.
for (let i = 0; i < 2; i++) { const { call } = engine(); call("start_run", { task: "warm up the engine for the benchmark" }); }

{ // start_run, get_run, submit QUERY
	const { call } = engine();
	const starts: number[] = [], gets: number[] = [], subs: number[] = [];
	for (let i = 0; i < 300; i++) {
		let id = "";
		starts.push(time(() => { id = call("start_run", { task: `Prepare the list of options for the team, variant ${i}` }).run_id; }));
		gets.push(time(() => call("get_run", { run_id: id })));
		subs.push(time(() => call("submit_stage", { run_id: id, stage: "QUERY", outcome: "completed", summary: `QUERY: the request and its context were restated, variant ${i}.` })));
	}
	Object.assign(out, { start_run: stats(starts), get_run: stats(gets), submit_stage_query: stats(subs) });
}
{ // record_evidence as the run grows to 400 evidence records (save cost grows with history)
	const { call } = engine();
	const id = call("start_run", { task: "Prepare the list of options for the team" }).run_id;
	const ts: number[] = [];
	for (let i = 0; i < 400; i++) ts.push(time(() => call("record_evidence", { run_id: id, source_ref: `https://source${i}.example${i}.org/doc/${i}`, claim: `The source number ${i} supports one specific point` })));
	out.record_evidence_first_50 = stats(ts.slice(0, 50));
	out.record_evidence_last_50 = stats(ts.slice(-50));
	out.record_evidence_total_ms = +ts.reduce((a, b) => a + b, 0).toFixed(2);
	const view = call("get_run", { run_id: id });
	out.run_view_bytes_at_400_evidence = JSON.stringify(view).length;
}
{ // memory: write 2000 items, then recall
	const { call } = engine();
	const words = ["reactor", "cooling", "pump", "budget", "market", "policy", "flood", "delta", "আইন", "নদী", "数据", "安全", "AI", "chair", "solar", "grid", "loan", "vaccine", "dose", "trial"];
	const topics = Array.from({ length: 40 }, (_, i) => call("memory_topic", { action: "create", name: `Topic ${i}`, decided_by: "user" }).topic_id);
	const writes: number[] = [];
	let seed = 7;
	const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
	for (let i = 0; i < 2000; i++) {
		const text = `Item ${i}: ` + Array.from({ length: 12 }, () => words[Math.floor(rnd() * words.length)]).join(" ") + " noted for the project review";
		writes.push(time(() => call("memory_write", { topic_id: topics[i % 40], text, keywords: [words[i % words.length]!] })));
	}
	out.memory_write_2000 = stats(writes);
	const recalls: number[] = [];
	for (const q of [["reactor cooling pump"], ["AI"], ["নদী আইন"], ["数据安全"], ["vaccine dose trial", "loan budget"], ["something unrelated entirely"]]) {
		for (let k = 0; k < 10; k++) recalls.push(time(() => call("memory_recall", { queries: q })));
	}
	out.memory_recall_2000_items = stats(recalls);
}
{ // MCP surface
	const b = { route: () => ({}), resolveCommands: () => ({}), compute: () => ({}), run: async () => ({}), checkSource: async () => ({}) };
	const ts: number[] = [];
	for (let i = 0; i < 300; i++) { const t = performance.now(); await handleMessage({ jsonrpc: "2.0", id: i, method: "tools/list" }, b, null); ts.push(performance.now() - t); }
	out.tools_list = stats(ts);
	const { e } = engine();
	const r: number[] = [];
	for (let i = 0; i < 300; i++) r.push(time(() => e.route("/l01 delete the production database and rotate all credentials, then send the report")));
	out.route = stats(r);
}
console.log(JSON.stringify(out, null, 1));
