import { DatabaseSync } from "node:sqlite";
import type { BrowserSessionRecord, BrowserSessionStore } from "./manager.ts";

/**
 * Durable single-process session metadata store for the hosted Node browser runtime.
 * Uses SQLite BEGIN IMMEDIATE to make owner-capacity reservations atomic across concurrent requests.
 * This store is intended for one Node process on a persistent disk; multi-replica deployments must
 * use a shared transactional store before being enabled.
 */
export class SqliteBrowserSessionStore implements BrowserSessionStore {
  private readonly db: DatabaseSync;
  private closed = false;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec("PRAGMA busy_timeout = 5000");
    this.db.exec(`CREATE TABLE IF NOT EXISTS browser_sessions (
      handle TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      provider_session_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    ) WITHOUT ROWID`);
    this.db.exec("CREATE INDEX IF NOT EXISTS browser_sessions_owner ON browser_sessions(owner_id)");
    this.db.exec(`CREATE TABLE IF NOT EXISTS browser_session_reservations (
      owner_id TEXT PRIMARY KEY,
      count INTEGER NOT NULL CHECK(count >= 0)
    ) WITHOUT ROWID`);
  }

  async get(handle: string): Promise<BrowserSessionRecord | undefined> {
    this.assertOpen();
    const row = this.db.prepare("SELECT handle, owner_id, provider, provider_session_id, created_at FROM browser_sessions WHERE handle = ?").get(handle) as Record<string, string> | undefined;
    return row ? this.decode(row) : undefined;
  }

  async listByOwner(ownerId: string): Promise<BrowserSessionRecord[]> {
    this.assertOpen();
    const rows = this.db.prepare("SELECT handle, owner_id, provider, provider_session_id, created_at FROM browser_sessions WHERE owner_id = ? ORDER BY created_at").all(ownerId) as Record<string, string>[];
    return rows.map(row => this.decode(row));
  }

  async put(record: BrowserSessionRecord): Promise<void> {
    this.assertOpen();
    this.db.prepare("INSERT INTO browser_sessions(handle, owner_id, provider, provider_session_id, created_at) VALUES (?, ?, ?, ?, ?)").run(
      record.handle, record.ownerId, record.provider, record.providerSessionId, record.createdAt
    );
  }

  async delete(handle: string): Promise<void> {
    this.assertOpen();
    this.db.prepare("DELETE FROM browser_sessions WHERE handle = ?").run(handle);
  }

  async reserve(ownerId: string, maximum: number): Promise<boolean> {
    this.assertOpen();
    if (!Number.isInteger(maximum) || maximum < 1 || maximum > 100) throw new RangeError("Invalid browser session concurrency limit.");
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const active = this.db.prepare("SELECT COUNT(*) AS count FROM browser_sessions WHERE owner_id = ?").get(ownerId) as {count:number};
      const pending = this.db.prepare("SELECT count FROM browser_session_reservations WHERE owner_id = ?").get(ownerId) as {count:number} | undefined;
      if (active.count + (pending?.count ?? 0) >= maximum) {
        this.db.exec("COMMIT");
        return false;
      }
      this.db.prepare(`INSERT INTO browser_session_reservations(owner_id, count) VALUES (?, 1)
        ON CONFLICT(owner_id) DO UPDATE SET count = count + 1`).run(ownerId);
      this.db.exec("COMMIT");
      return true;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  async releaseReservation(ownerId: string): Promise<void> {
    this.assertOpen();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.prepare("UPDATE browser_session_reservations SET count = count - 1 WHERE owner_id = ? AND count > 0").run(ownerId);
      this.db.prepare("DELETE FROM browser_session_reservations WHERE owner_id = ? AND count <= 0").run(ownerId);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.db.close();
  }

  private decode(row: Record<string, string>): BrowserSessionRecord {
    if (!["steel", "hyperbrowser", "browserbase"].includes(row.provider)) throw new Error("Unknown provider in browser session store.");
    return {
      handle: row.handle,
      ownerId: row.owner_id,
      provider: row.provider as BrowserSessionRecord["provider"],
      providerSessionId: row.provider_session_id,
      createdAt: row.created_at,
    };
  }

  private assertOpen(): void {
    if (this.closed) throw new Error("Browser session store is closed.");
  }
}
