// Runs the language-neutral conformance scenarios (conformance/v2/*.json, WS32 P0.7) against the
// TypeScript engine through dispatch(), the same entry point the Durable Object uses.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dispatch, HostEngine } from "../src/engine.ts";
import { DurableObjectRunStore } from "../src/store.ts";
import { memorySql } from "./sqlite-fake.ts";

interface Step { op: string; args: unknown; expect: { ok: boolean; code?: string; message?: string; fields?: Record<string, unknown> }; capture?: Record<string, string> }
interface Scenario { name: string; description: string; steps: Step[] }

const dir = fileURLToPath(new URL("../conformance/v2/", import.meta.url).href);

function substitute(value: unknown, vars: Map<string, unknown>): unknown {
	if (typeof value === "string" && value.startsWith("$") && vars.has(value.slice(1))) return vars.get(value.slice(1));
	if (typeof value === "string") return value.replace(/\$([a-z][a-z0-9_]*)/g, (m, k: string) => (vars.has(k) ? String(vars.get(k)) : m));
	if (Array.isArray(value)) return value.map((v) => substitute(v, vars));
	if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, substitute(v, vars)]));
	return value;
}

/** Path syntax: dot-separated keys and indexes; `[key=value]` selects a list element by a field. */
export function resolve(root: unknown, path: string): unknown {
	let cur: unknown = root;
	for (const part of path.split(".")) {
		const sel = /^\[([^=]+)=(.*)\]$/.exec(part);
		if (sel) {
			if (!Array.isArray(cur)) return undefined;
			cur = cur.find((x) => x && typeof x === "object" && String((x as Record<string, unknown>)[sel[1]!]) === sel[2]);
		} else if (Array.isArray(cur) && /^\d+$/.test(part)) cur = cur[Number(part)];
		else if (cur && typeof cur === "object") cur = (cur as Record<string, unknown>)[part];
		else return undefined;
	}
	return cur;
}

for (const file of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
	const scenario = JSON.parse(readFileSync(dir + file, "utf8")) as Scenario;
	test(`conformance v2: ${scenario.name}`, () => {
		const engine = new HostEngine(new DurableObjectRunStore(memorySql()), { limits: { burstPerMinute: 100_000 } });
		const vars = new Map<string, unknown>();
		scenario.steps.forEach((step, i) => {
			const where = `${scenario.name} step ${i} (${step.op})`;
			const r = JSON.parse(dispatch(engine, "google:conformance", step.op, JSON.stringify(substitute(step.args, vars)))) as { ok: boolean; code?: string; message?: string; result?: unknown };
			assert.equal(r.ok, step.expect.ok, `${where}: ${r.ok ? "succeeded" : `${r.code} ${r.message}`}`);
			if (step.expect.code) assert.equal(r.code, step.expect.code, where);
			if (step.expect.message) assert.ok(r.message?.includes(step.expect.message), `${where}: message ${JSON.stringify(r.message)}`);
			for (const [path, expected] of Object.entries(step.expect.fields ?? {})) {
				assert.deepEqual(resolve(r.result, path), substitute(expected, vars), `${where}: ${path}`);
			}
			for (const [name, path] of Object.entries(step.capture ?? {})) vars.set(name, resolve(r.result, path));
		});
	});
}
