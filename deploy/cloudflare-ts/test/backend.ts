// In-process EngineBackend for tests: the same dispatch() path as the Durable Object, with an
// injectable fetcher for rigorx_check_source.
import { dispatch, EngineError, HostEngine } from "../src/engine.ts";
import type { EngineBackend } from "../src/mcp.ts";
import { checkSource } from "../src/source.ts";
import { DurableObjectRunStore } from "../src/store.ts";
import type { JsonObject } from "../src/text.ts";
import { memorySql } from "./sqlite-fake.ts";

export function localBackend(engine = new HostEngine(new DurableObjectRunStore(memorySql())), fetcher: typeof fetch = fetch): EngineBackend {
	const run = async (owner: string, operation: string, args: JsonObject): Promise<JsonObject> => {
		const r = JSON.parse(dispatch(engine, owner, operation, JSON.stringify(args)));
		if (!r.ok) throw new EngineError(r.message, r.code);
		return r.result;
	};
	return {
		route: (t) => engine.route(t),
		resolveCommands: (t) => engine.resolveCommands(t),
		compute: (args) => engine.computeOp(null, args),
		run,
		async checkSource(owner, args) {
			const evidence = await run(owner, "evidence_for_check", args);
			const check = await checkSource(String(evidence.source_ref), fetcher);
			return run(owner, "record_source_check", { run_id: args.run_id ?? null, evidence_id: args.evidence_id ?? null, check: check as unknown as JsonObject });
		},
	};
}
