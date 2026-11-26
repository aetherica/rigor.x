// Topic memory (WS32 P2, ADR-008): retrieval benchmark across scripts, abstention, conflicts,
// supersession, user authority, trust, deletion integrity, quotas.
// The benchmark corpus, queries, relevance labels and acceptance thresholds were written before the
// retrieval code was first run against them (pre-registered): recall@3 >= 0.8, MRR >= 0.7, and no
// result for the unrelated queries.
import { test } from "node:test";
import assert from "node:assert/strict";
import { dispatch, HostEngine } from "../src/engine.ts";
import { MemoryStore, MIN_LEXICAL, shortTerms, trigrams } from "../src/memory.ts";
import { DurableObjectRunStore } from "../src/store.ts";
import { memorySql } from "./sqlite-fake.ts";

function harness(opts: { limitBytes?: number; now?: () => Date } = {}) {
	const sql = memorySql();
	const store = new DurableObjectRunStore(sql);
	// A fixed clock: every benchmark item has the same age, so ranking does not depend on timing.
	const memory = new MemoryStore(sql, opts.now ?? (() => new Date("2026-11-26T12:00:00Z")), opts.limitBytes);
	const engine = new HostEngine(store, { memory, limits: { burstPerMinute: 100_000 } });
	const call = (op: string, a: object, owner = "google:m") => JSON.parse(dispatch(engine, owner, op, JSON.stringify(a)));
	const ok = (op: string, a: object, owner = "google:m") => {
		const r = call(op, a, owner);
		if (!r.ok) throw new Error(`${op}: ${r.code} ${r.message}`);
		return r.result;
	};
	return { sql, memory, call, ok };
}

const CORPUS: [string, string, string, string[]][] = [
	// [label, topic, text, keywords]
	["en-storage", "storage", "We chose SQLite in Durable Objects for per-user storage", ["sqlite", "durable objects", "storage"]],
	["bn-storage", "storage", "প্রতিটি ব্যবহারকারীর ডেটা আলাদা Durable Object-এ রাখা হবে", ["ব্যবহারকারী", "ডেটা", "স্টোরেজ"]],
	["zh-fts", "storage", "我们决定使用全文检索 FTS5 和三元组分词器", ["全文检索", "分词器", "FTS5"]],
	["ja-trigram", "storage", "検索にはトライグラムのトークナイザーを使うことに決めた", ["検索", "トライグラム"]],
	["ar-embed", "storage", "قررنا ألا نستخدم التضمينات المتجهية في الوقت الحالي", ["التضمينات", "متجه"]],
	["ru-quota", "storage", "Квота памяти составляет 120 мегабайт на пользователя", ["квота", "память", "мегабайт"]],
	["hi-delete", "storage", "उपयोगकर्ता अपनी स्मृति को कभी भी हटा सकता है", ["स्मृति", "हटाना"]],
	["es-conflict", "storage", "Los conflictos entre memorias se muestran al usuario", ["conflictos", "memoria"]],
	["en-paid", "pricing", "Workers Paid is planned after the upgrade is complete", ["workers paid", "plan", "pricing"]],
	["bn-quota", "pricing", "কোটার সংখ্যা পেইড প্ল্যান নিয়ে আলোচনার পরে ঠিক হবে", ["কোটা", "পেইড"]],
];
const QUERIES: [string[], string[]][] = [
	// [host queries, relevant labels]
	[["durable objects storage"], ["en-storage", "bn-storage"]],
	[["ব্যবহারকারীর ডেটা কোথায় রাখা হবে"], ["bn-storage"]],
	[["用什么分词器"], ["zh-fts"]],
	[["トークナイザー"], ["ja-trigram"]],
	[["التضمينات"], ["ar-embed"]],
	[["квота памяти"], ["ru-quota"]],
	[["स्मृति हटाना"], ["hi-delete"]],
	[["conflictos de memoria"], ["es-conflict"]],
	[["when do we move to workers paid"], ["en-paid"]],
	[["কোটা"], ["bn-quota"]],
	[["tokenizer", "分词器"], ["zh-fts"]],
];
const UNRELATED = [["chocolate cake recipe"], ["火星探测器"], ["ফুটবল খেলা"]];

function seed(h: ReturnType<typeof harness>) {
	const topics: Record<string, string> = {};
	for (const name of ["storage", "pricing"]) topics[name] = h.ok("memory_topic", { action: "create", name, decided_by: "host" }).topic_id;
	const ids: Record<string, string> = {};
	for (const [label, topic, text, keywords] of CORPUS) {
		ids[label] = h.ok("memory_write", { topic_id: topics[topic], text, keywords, kind: "decision", decided_by: "host" }).item_id;
	}
	return { topics, ids };
}

test("retrieval benchmark across eight languages meets the pre-registered thresholds", () => {
	const h = harness();
	const { ids } = seed(h);
	const label = Object.fromEntries(Object.entries(ids).map(([l, id]) => [id, l]));
	let hits = 0;
	let rr = 0;
	const misses: string[] = [];
	for (const [queries, relevant] of QUERIES) {
		const got = (h.ok("memory_recall", { queries }).items as { id: string }[]).map((i) => label[i.id]!);
		const rank = got.findIndex((l) => relevant.includes(l));
		if (rank >= 0 && rank < 3) hits++;
		else misses.push(`${queries.join(" | ")} -> ${JSON.stringify(got.slice(0, 3))}`);
		rr += rank >= 0 ? 1 / (rank + 1) : 0;
	}
	const recall3 = hits / QUERIES.length;
	const mrr = rr / QUERIES.length;
	const abstained = UNRELATED.filter((q) => h.ok("memory_recall", { queries: q }).items.length === 0).length;
	console.log(`memory benchmark: recall@3=${recall3.toFixed(3)} MRR=${mrr.toFixed(3)} abstention=${abstained}/${UNRELATED.length} (MIN_LEXICAL=${MIN_LEXICAL}) misses=${JSON.stringify(misses)}`);
	assert.ok(recall3 >= 0.8, `recall@3 ${recall3}`);
	assert.ok(mrr >= 0.7, `MRR ${mrr}`);
	assert.equal(abstained, UNRELATED.length);
});

test("sensitivity of the abstention threshold MIN_LEXICAL (reported; the chosen value is asserted)", () => {
	const h = harness();
	const { ids } = seed(h);
	const label = Object.fromEntries(Object.entries(ids).map(([l, id]) => [id, l]));
	const rows: string[] = [];
	const at: Record<number, { recall3: number; abstained: number }> = {};
	for (const th of [0.1, 0.2, 0.3, 0.4, 0.5, 0.6]) {
		let hits = 0;
		for (const [queries, relevant] of QUERIES) {
			const got = (h.memory.recall("google:m", queries, { minLexical: th }).items as { id: string }[]).map((i) => label[i.id]!);
			const rank = got.findIndex((l) => relevant.includes(l));
			if (rank >= 0 && rank < 3) hits++;
		}
		const abstained = UNRELATED.filter((q) => (h.memory.recall("google:m", q, { minLexical: th }).items as unknown[]).length === 0).length;
		at[th] = { recall3: hits / QUERIES.length, abstained };
		rows.push(`${th}: recall@3=${(hits / QUERIES.length).toFixed(2)} abstention=${abstained}/${UNRELATED.length}`);
	}
	console.log("MIN_LEXICAL sensitivity: " + rows.join("; "));
	assert.equal(at[MIN_LEXICAL]!.abstained, UNRELATED.length);
	assert.ok(at[MIN_LEXICAL]!.recall3 >= 0.8);
	assert.deepEqual(trigrams("ab cd"), []); // no grams across or inside short words
	assert.deepEqual(shortTerms("用什么分词器").slice(0, 3), ["用什", "什么", "么分"]);
});

test("topic tree: structure rules and the user's last word", () => {
	const h = harness();
	const root = h.ok("memory_topic", { action: "create", name: "project", decided_by: "user" }).topic_id;
	const child = h.ok("memory_topic", { action: "create", name: "storage", parent_id: root, decided_by: "host" }).topic_id;
	assert.deepEqual(h.ok("memory_topic", { action: "rename", topic_id: child, name: "storage design", decided_by: "host" }).path, ["project", "storage design"]);
	assert.equal(h.call("memory_topic", { action: "create", name: "storage design", parent_id: root, decided_by: "host" }).code, "INVALID_REQUEST");
	assert.equal(h.call("memory_topic", { action: "rename", topic_id: root, name: "renamed", decided_by: "host" }).code, "FORBIDDEN");
	assert.equal(h.call("memory_topic", { action: "move", topic_id: root, parent_id: child, decided_by: "user" }).code, "INVALID_REQUEST"); // under itself
	assert.equal(h.call("memory_topic", { action: "delete", topic_id: child, decided_by: "host" }).code, "FORBIDDEN");
	let parent = root;
	for (let d = 2; d <= 8; d++) parent = h.ok("memory_topic", { action: "create", name: `level ${d}`, parent_id: parent, decided_by: "host" }).topic_id;
	assert.match(h.call("memory_topic", { action: "create", name: "level 9", parent_id: parent, decided_by: "host" }).message, /at most 8 levels/);
	const listed = h.ok("memory_topic", { action: "list" }).topics;
	assert.equal(listed.length, 9);
	assert.equal(h.ok("memory_topic", { action: "list" }, "google:other").topics.length, 0); // owners are isolated
});

test("conflicts are surfaced, both sides are shown; supersession hides the old item", () => {
	const h = harness();
	const topic = h.ok("memory_topic", { action: "create", name: "storage", decided_by: "host" }).topic_id;
	const a = h.ok("memory_write", { topic_id: topic, text: "The per-user memory cap is 120 megabytes", keywords: ["memory cap", "megabytes"], kind: "decision", decided_by: "user", trust: "user_confirmed" });
	const b = h.ok("memory_write", { topic_id: topic, text: "The per-user memory cap is 200 megabytes", keywords: ["memory cap", "megabytes"], kind: "decision", decided_by: "host",
		host_memory_conflict: "My own memory says the cap is 120 MB" });
	assert.deepEqual(b.possible_conflicts, [a.item_id]);
	const c = h.ok("memory_write", { topic_id: topic, text: "The cap is 120 megabytes, confirmed again by the user", keywords: ["memory cap"], kind: "decision", decided_by: "user",
		trust: "user_confirmed", supersedes: b.item_id, conflicts_with: [a.item_id] });
	const recalled = h.ok("memory_recall", { queries: ["memory cap megabytes"] });
	assert.match(recalled.notice, /not instructions/);
	const ids = recalled.items.map((i: any) => i.id);
	assert.ok(!ids.includes(b.item_id)); // superseded
	assert.deepEqual(recalled.items.find((i: any) => i.id === a.item_id).conflict, { with_items: [c.item_id], host_memory_says: null });
	const withOld = h.ok("memory_recall", { queries: ["memory cap megabytes"], include_superseded: true }).items.find((i: any) => i.id === b.item_id);
	assert.equal(withOld.status, "superseded");
	assert.equal(withOld.conflict.host_memory_says, "My own memory says the cap is 120 MB");
});

test("trust: user_confirmed needs the user; run_validated needs a run that passed validation", () => {
	const h = harness();
	const topic = h.ok("memory_topic", { action: "create", name: "facts", decided_by: "host" }).topic_id;
	assert.match(h.call("memory_write", { topic_id: topic, text: "A fact that the host asserts by itself", trust: "user_confirmed", decided_by: "host" }).message, /needs decided_by "user"/);
	const run = h.ok("start_run", { task: "Prepare the list of facts for the topic" }).run_id;
	assert.match(h.call("memory_write", { topic_id: topic, text: "A fact from a run that never validated", trust: "run_validated", provenance: { run_id: run } }).message, /has not passed validation/);
	assert.match(h.call("memory_write", { topic_id: topic, text: "A fact without any provenance at all", trust: "run_validated" }).message, /needs provenance.run_id/);
});

test("deletion is real: rows and search index go, an audit row without content stays; only the user deletes", () => {
	const h = harness();
	const topic = h.ok("memory_topic", { action: "create", name: "secret project", decided_by: "host" }).topic_id;
	const item = h.ok("memory_write", { topic_id: topic, text: "The launch date of the secret project is in March", keywords: ["launch date"] }).item_id;
	assert.equal(h.ok("memory_recall", { queries: ["launch date"] }).items.length, 1);
	assert.equal(h.call("memory_delete", { item_ids: [item], decided_by: "host" }).code, "FORBIDDEN");
	assert.deepEqual(h.ok("memory_delete", { item_ids: [item], decided_by: "user" }), { deleted_items: 1 });
	assert.equal(h.ok("memory_recall", { queries: ["launch date"] }).items.length, 0);
	assert.equal(Number(h.sql.exec("SELECT COUNT(*) AS n FROM memory_fts").toArray()[0]!.n), 0);
	assert.equal(Number(h.sql.exec("SELECT COUNT(*) AS n FROM memory_items").toArray()[0]!.n), 0);
	const audit = h.memory.audits("google:m");
	assert.equal(audit.length, 1);
	assert.doesNotMatch(JSON.stringify(audit), /launch|March/);
	h.ok("memory_write", { topic_id: topic, text: "Another note for the topic to be deleted", keywords: ["note"] });
	assert.deepEqual(h.ok("memory_topic", { action: "delete", topic_id: topic, decided_by: "user" }), { deleted_topics: 1, deleted_items: 1 });
	assert.equal(Number(h.sql.exec("SELECT COUNT(*) AS n FROM memory_fts").toArray()[0]!.n), 0);
});

test("quota and write-rate limits; usage reports memory bytes", () => {
	const h = harness({ limitBytes: 2_000 });
	const topic = h.ok("memory_topic", { action: "create", name: "big", decided_by: "host" }).topic_id;
	const long = "A long note about the topic that fills the small quota quickly. ".repeat(6);
	h.ok("memory_write", { topic_id: topic, text: long });
	const full = h.call("memory_write", { topic_id: topic, text: long });
	assert.equal(full.code, "QUOTA_EXCEEDED");
	assert.match(full.message, /Topic memory is full/);
	const usage = h.ok("usage", {});
	assert.equal(usage.memory_bytes.limit, 2_000);
	assert.ok(usage.memory_bytes.used > 0 && usage.memory_bytes.used <= 2_000);
	assert.equal(h.ok("memory_recall", { queries: ["long note"] }).items.length, 1); // reads keep working

	let t = new Date("2026-11-26T10:00:00Z").getTime();
	const r = harness({ now: () => new Date(t) });
	const tp = r.ok("memory_topic", { action: "create", name: "busy", decided_by: "host" }).topic_id;
	for (let i = 0; i < 60; i++) r.ok("memory_write", { topic_id: tp, text: `Observation number ${i} about the busy topic` });
	assert.equal(r.call("memory_write", { topic_id: tp, text: "One more observation about the busy topic" }).code, "QUOTA_EXCEEDED");
	t += 3_600_001;
	assert.equal(r.call("memory_write", { topic_id: tp, text: "One more observation about the busy topic" }).ok, true);
});

// Held-out benchmark (WS32 WP7): written after the first benchmark had been used to find and fix two
// ranking bugs, so that set is no longer an independent measure. These items, queries and labels
// were written before this set was ever run; the code was not changed after its first run.
// Pre-registered: recall@3 >= 0.8 and no result for the unrelated queries.
const HELD_OUT: [string, string, string[]][] = [
	["de", "Die Datenbank wird jede Nacht um zwei Uhr gesichert", ["Datenbank", "Sicherung"]],
	["fr", "Les journaux d'erreurs sont conservés pendant trente jours", ["journaux", "erreurs"]],
	["ko", "배포는 매주 화요일 오후에 진행한다", ["배포", "화요일"]],
	["tr", "Kullanıcı verileri şifrelenmeden saklanmaz", ["şifreleme", "veri"]],
	["pt", "O limite de requisições é de cem por minuto", ["limite", "requisições"]],
	["vi", "Hệ thống gửi cảnh báo khi bộ nhớ vượt quá tám mươi phần trăm", ["cảnh báo", "bộ nhớ"]],
	["zh", "每次发布前必须运行全部测试", ["发布", "测试"]],
	["ja", "障害が発生したら担当者に電話で連絡する", ["障害", "連絡"]],
];
const HELD_OUT_QUERIES: [string[], string][] = [
	[["Datenbank Sicherung"], "de"],
	[["combien de temps les journaux sont conservés"], "fr"],
	[["배포 일정"], "ko"],
	[["veriler şifreleme"], "tr"],
	[["limite de requisições"], "pt"],
	[["cảnh báo bộ nhớ"], "vi"],
	[["发布测试"], "zh"],
	[["障害の連絡"], "ja"],
];
const HELD_OUT_UNRELATED = [["pizza delivery tonight"], ["天気予報"], ["futebol amanhã"]];

test("held-out retrieval benchmark (eight more languages, written before its first run)", () => {
	const h = harness();
	const topic = h.ok("memory_topic", { action: "create", name: "ops", decided_by: "host" }).topic_id;
	const label: Record<string, string> = {};
	for (const [l, text, keywords] of HELD_OUT) label[h.ok("memory_write", { topic_id: topic, text, keywords, kind: "fact" }).item_id] = l;
	let hits = 0;
	let rr = 0;
	const misses: string[] = [];
	for (const [queries, relevant] of HELD_OUT_QUERIES) {
		const got = (h.ok("memory_recall", { queries }).items as { id: string }[]).map((i) => label[i.id]!);
		const rank = got.indexOf(relevant);
		if (rank >= 0 && rank < 3) hits++;
		else misses.push(`${queries.join(" | ")} -> ${JSON.stringify(got.slice(0, 3))}`);
		rr += rank >= 0 ? 1 / (rank + 1) : 0;
	}
	const abstained = HELD_OUT_UNRELATED.filter((q) => h.ok("memory_recall", { queries: q }).items.length === 0).length;
	const recall3 = hits / HELD_OUT_QUERIES.length;
	console.log(`held-out memory benchmark: recall@3=${recall3.toFixed(3)} MRR=${(rr / HELD_OUT_QUERIES.length).toFixed(3)} abstention=${abstained}/${HELD_OUT_UNRELATED.length} misses=${JSON.stringify(misses)}`);
	assert.ok(recall3 >= 0.8, `recall@3 ${recall3}`);
	assert.equal(abstained, HELD_OUT_UNRELATED.length);
});
