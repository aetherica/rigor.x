// Owner database snapshots: an owner's whole SQLite database as bytes (for PostgreSQL storage) and
// back, with integrity and schema checks before a snapshot is ever used.
//   toBytes:   VACUUM INTO a temporary file (a consistent, compact copy without the WAL), read it.
//   fromBytes: verify the SHA-256 recorded with the snapshot, write it to a temporary file, open it,
//              run PRAGMA quick_check, refuse an engine schema newer than this code supports, and
//              only then move it into place. A bad snapshot is reported, never used or overwritten.
import { createHash, randomBytes } from "node:crypto";
import { readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { SCHEMA_VERSION } from "../cloudflare-ts/src/store.ts";

export class SnapshotError extends Error {
	readonly code: "STORAGE_CORRUPT" | "STORAGE_UNSUPPORTED";
	constructor(code: "STORAGE_CORRUPT" | "STORAGE_UNSUPPORTED", message: string) {
		super(message);
		this.code = code;
	}
}

export const sha256Hex = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

const SQLITE_HEADER = Buffer.from("SQLite format 3\0", "latin1");

/** The engine schema version recorded in an owner database (0 for a database the engine never initialized). */
export function engineSchemaOf(db: DatabaseSync): number {
	const hasMeta = db.prepare("SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = 'host_store_meta'").get();
	if (!hasMeta) return 0;
	const row = db.prepare("SELECT value FROM host_store_meta WHERE key = 'schema_version'").get() as { value?: unknown } | undefined;
	return row ? Number(row.value) : 0;
}

/** A consistent copy of an open database as bytes, with its engine schema version. */
export function snapshotOf(db: DatabaseSync, dir: string): { bytes: Buffer; engineSchema: number } {
	const tmp = `${dir}/.snap-${randomBytes(8).toString("hex")}.sqlite`;
	try {
		db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`); // operator-set DATA_DIR plus a random hex name; quotes escaped
		const bytes = readFileSync(tmp);
		return { bytes, engineSchema: engineSchemaOf(db) };
	} finally {
		rmSync(tmp, { force: true });
	}
}

/** Validates snapshot bytes and installs them at `target` (replacing it). Throws SnapshotError when unusable. */
export function installSnapshot(bytes: Buffer, expectedSha256: string, target: string): number {
	if (sha256Hex(bytes) !== expectedSha256) throw new SnapshotError("STORAGE_CORRUPT", "stored owner data failed its checksum");
	if (bytes.length < 100 || !bytes.subarray(0, 16).equals(SQLITE_HEADER)) throw new SnapshotError("STORAGE_CORRUPT", "stored owner data is not a SQLite database");
	const tmp = `${target}.incoming-${randomBytes(6).toString("hex")}`;
	writeFileSync(tmp, bytes, { mode: 0o600 });
	try {
		let schema: number;
		const db = new DatabaseSync(tmp);
		try {
			const check = db.prepare("PRAGMA quick_check").all() as { quick_check: string }[];
			if (check.length !== 1 || check[0]!.quick_check !== "ok") throw new SnapshotError("STORAGE_CORRUPT", "stored owner data failed the SQLite integrity check");
			schema = engineSchemaOf(db);
		} catch (e) {
			if (e instanceof SnapshotError) throw e;
			throw new SnapshotError("STORAGE_CORRUPT", "stored owner data could not be opened");
		} finally {
			db.close();
		}
		if (schema > SCHEMA_VERSION) throw new SnapshotError("STORAGE_UNSUPPORTED", `stored owner data has engine schema ${schema}, newer than this release supports (${SCHEMA_VERSION})`);
		for (const suffix of ["", "-wal", "-shm"]) rmSync(target + suffix, { force: true });
		renameSync(tmp, target);
		return schema;
	} finally {
		rmSync(tmp, { force: true });
	}
}
