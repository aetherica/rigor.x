// In-process EngineBackend for tests: the same dispatch() path as the Durable Object, with an
// injectable fetcher for rigorx_check_source.
import { dispatch, EngineError, HostEngine } from "../src/engine.ts";
import type { EngineBackend } from "../src/mcp.ts";
import { runSourceCheck } from "../src/source.ts";
import { DurableObjectRunStore } from "../src/store.ts";
import type { JsonObject } from "../src/text.ts";
import { memorySql } from "./sqlite-fake.ts";

export function localBackend(engine?: HostEngine, fetcher: typeof fetch = fetch): EngineBackend {
	if (!engine) {
		const sql = memorySql();
		engine = new HostEngine(new DurableObjectRunStore(sql), { transaction: sql.transaction });
	}
	const e = engine;
	const run = async (owner: string, operation: string, args: JsonObject): Promise<JsonObject> => {
		const r = JSON.parse(dispatch(e, owner, operation, JSON.stringify(args)));
		if (!r.ok) throw new EngineError(r.message, r.code);
		return r.result;
	};
	return {
		route: (t) => e.route(t),
		resolveCommands: (t) => e.resolveCommands(t),
		compute: (args) => e.computeOp(null, args),
		run,
		checkSource: (owner, args) => runSourceCheck((operation, a) => run(owner, operation, a), args, fetcher),
	};
}
