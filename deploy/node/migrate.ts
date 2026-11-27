// Explicit database migration command for STORAGE=postgres (the server never migrates by itself).
// Uses DATABASE_URL, DATABASE_CA_CERT, DATABASE_SSL like the server; prints only versions.
// Usage: node --import ./deploy/node/register.mjs --experimental-strip-types deploy/node/migrate.ts
// Exit codes: 0 done (or nothing to do), 78 configuration or schema refusal, 1 other failure.
import pg from "pg";
import { DatabaseConfigError, parseDatabaseSettings } from "./pg-config.ts";
import { LATEST_VERSION, SchemaError, migrate } from "./pg-migrations.ts";

async function main(): Promise<number> {
	let settings;
	try {
		settings = parseDatabaseSettings(process.env, process.env.NODE_ENV === "production");
	} catch (e) {
		if (e instanceof DatabaseConfigError) {
			console.error(JSON.stringify({ evt: "rigorx_migrate", ok: false, error: e.message }));
			return 78;
		}
		throw e;
	}
	for (const w of settings.warnings) console.error(JSON.stringify({ evt: "rigorx_migrate", warning: w }));
	const pool = new pg.Pool({ ...settings.pool, max: 1 });
	try {
		const applied = await migrate(pool);
		console.log(JSON.stringify({ evt: "rigorx_migrate", ok: true, applied, schema_version: LATEST_VERSION, target: settings.summary }));
		return 0;
	} catch (e) {
		const message = e instanceof Error ? e.message : String(e);
		console.error(JSON.stringify({ evt: "rigorx_migrate", ok: false, error: message }));
		return e instanceof SchemaError ? 78 : 1;
	} finally {
		await pool.end().catch(() => {});
	}
}

main().then((code) => process.exit(code), (e) => {
	console.error(JSON.stringify({ evt: "rigorx_migrate", ok: false, error: e instanceof Error ? e.message : String(e) }));
	process.exit(1);
});
