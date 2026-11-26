// Integration harness (see wrangler.jsonc next to this file). Not part of the deployed Worker.
import { DurableObject } from "cloudflare:workers";
import { OwnerRuns } from "../../src/index.ts";
import { DurableObjectRunStore, type SqlLike } from "../../src/store.ts";
import { dispatch, HostEngine } from "../../src/engine.ts";

export { OwnerRuns };

interface Env {
	OWNER_RUNS: DurableObjectNamespace<OwnerRuns>;
	MIGRATION_PROBE: DurableObjectNamespace<MigrationProbe>;
	WRITE_METER: DurableObjectNamespace<WriteMeter>;
}

/** Measures rows written per engine operation with the cursor's rowsWritten counter (billing unit). */
export class WriteMeter extends DurableObject<Env> {
	run(): string {
		let written = 0;
		const raw = this.ctx.storage.sql;
		const sql: SqlLike = {
			exec(query, ...bindings) {
				const cursor = raw.exec(query, ...bindings);
				const rows = cursor.toArray();
				written += cursor.rowsWritten;
				return { toArray: () => rows };
			},
			get databaseSize() { return raw.databaseSize; },
		};
		const engine = new HostEngine(new DurableObjectRunStore(sql));
		const owner = "google:meter";
		const measure = (operation: string, args: object) => {
			const before = written;
			const r = JSON.parse(dispatch(engine, owner, operation, JSON.stringify(args)));
			if (!r.ok) throw new Error(`${operation}: ${r.code} ${r.message}`);
			return { rows: written - before, result: r.result };
		};
		const start = measure("start_run", { task: "measure rows written per call" });
		const id = start.result.run_id;
		const submit = measure("submit_stage", { run_id: id, stage: "CONTEXT", outcome: "completed", summary: "Collected the context, constraints and the available tools for this run." });
		const evidence = measure("record_evidence", { run_id: id, source_ref: "https://example.org/a", claim: "The source supports one specific claim here" });
		const action = measure("report_action", { run_id: id, tool_name: "bash", status: "EXECUTED" });
		const read = measure("get_run", { run_id: id });
		const del = measure("delete_run", { run_id: id });
		return JSON.stringify({ start_run: start.rows, submit_stage: submit.rows, record_evidence: evidence.rows, report_action: action.rows, get_run: read.rows, delete_run: del.rows });
	}
}

/** Writes a version-1 database by hand, then opens it with the current store (runs migrations). */
export class MigrationProbe extends DurableObject<Env> {
	run(): string {
		const sql = this.ctx.storage.sql;
		sql.exec("CREATE TABLE IF NOT EXISTS host_store_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
		sql.exec("INSERT OR REPLACE INTO host_store_meta(key, value) VALUES('schema_version', '1')");
		sql.exec("CREATE TABLE IF NOT EXISTS host_runs (run_id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision >= 1), snapshot_json TEXT NOT NULL, meta_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)");
		sql.exec("INSERT OR REPLACE INTO host_runs VALUES('rx_legacyrun0000000000', 'google:legacy', 1, '{\"status\":\"IN_PROGRESS\",\"current_stage\":\"INTENT\"}', '{\"intent\":\"ANALYSIS\",\"level\":\"L03_DEEP\",\"engine_protocol_version\":\"1.0.0\"}', '2026-11-25T10:00:00+00:00', '2026-11-25T10:00:00+00:00')");
		const store = new DurableObjectRunStore(sql);
		const version = String(sql.exec("SELECT value FROM host_store_meta WHERE key = 'schema_version'").toArray()[0]!.value);
		return JSON.stringify({ version, listed: store.list("google:legacy", 10), bytes: store.databaseBytes() });
	}
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		if (url.pathname === "/rows-written") {
			return new Response(await env.WRITE_METER.get(env.WRITE_METER.idFromName("meter")).run());
		}
		if (url.pathname === "/migration") {
			return new Response(await env.MIGRATION_PROBE.get(env.MIGRATION_PROBE.idFromName("probe")).run());
		}
		const { owner, operation, args } = (await request.json()) as { owner: string; operation: string; args: unknown };
		const stub = env.OWNER_RUNS.get(env.OWNER_RUNS.idFromName(owner));
		return new Response(await stub.call(owner, operation, JSON.stringify(args ?? {})));
	},
} satisfies ExportedHandler<Env>;
