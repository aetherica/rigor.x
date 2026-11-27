// SqliteKv: the Workers KV semantics the OAuth provider relies on (shared suite), plus file persistence.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteKv } from "../kv.ts";
import { kvConformance } from "./kv-conformance.ts";

kvConformance("SQLite KV", (clock) => new SqliteKv(join(mkdtempSync(join(tmpdir(), "rigorx-kv-")), "kv.sqlite"), () => clock.t));

test("SQLite KV: values survive a reopen of the same file (persistent storage)", async () => {
	const dir = mkdtempSync(join(tmpdir(), "rigorx-kv-"));
	const a = new SqliteKv(join(dir, "kv.sqlite"));
	await a.put("client:x", JSON.stringify({ id: "x" }));
	a.close();
	const b = new SqliteKv(join(dir, "kv.sqlite"));
	assert.deepEqual(await b.get("client:x", "json"), { id: "x" });
	b.close();
});
