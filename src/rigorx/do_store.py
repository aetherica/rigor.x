"""``RunStore`` on Cloudflare Durable Object SQLite storage (WS31, phase P3).

One Durable Object instance holds the runs of one owner. The store still filters
every query by ``owner_id`` (defence in depth). Durable Object SQL calls are
synchronous and a Durable Object handles one event at a time, so the revision
check and the update run atomically inside a single call.

The adapter takes the ``ctx.storage.sql`` object as a parameter, so it is tested
locally against a sqlite3-backed stand-in with the same ``exec`` interface.
"""
from __future__ import annotations

import json
from collections.abc import Mapping
from datetime import UTC, datetime
from typing import Any

from .pipeline import PipelineRun
from .run_store import (
    EventIntegrityError,
    RevisionConflict,
    RunNotFound,
    RunStoreError,
    StoredHostRun,
)

SCHEMA_VERSION = 1


def _json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)


def _now() -> str:
    return datetime.now(UTC).isoformat()


def _rows(cursor: Any) -> list[dict[str, Any]]:
    """Normalize a Durable Object SQL cursor (JS proxy) or a test cursor to dictionaries."""
    rows = cursor.toArray()
    if hasattr(rows, "to_py"):
        rows = rows.to_py()
    return [row if isinstance(row, dict) else (row.to_py() if hasattr(row, "to_py") else dict(row)) for row in rows]


class DurableObjectRunStore:
    def __init__(self, sql: Any) -> None:
        self.sql = sql
        self.sql.exec("CREATE TABLE IF NOT EXISTS host_store_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
        found = _rows(self.sql.exec("SELECT value FROM host_store_meta WHERE key = 'schema_version'"))
        if not found:
            self.sql.exec("INSERT INTO host_store_meta(key, value) VALUES('schema_version', ?)", str(SCHEMA_VERSION))
        elif int(found[0]["value"]) != SCHEMA_VERSION:
            raise RunStoreError(f"Unsupported host store schema version {found[0]['value']}")
        self.sql.exec(
            "CREATE TABLE IF NOT EXISTS host_runs ("
            "run_id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision >= 1), "
            "snapshot_json TEXT NOT NULL, meta_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"
        )

    def create(self, owner_id: str, run: PipelineRun, meta: Mapping[str, Any]) -> int:
        snapshot = run.snapshot()
        PipelineRun.from_snapshot(snapshot)
        if _rows(self.sql.exec("SELECT run_id FROM host_runs WHERE run_id = ?", run.run_id)):
            raise RevisionConflict("Run ID already exists")
        stamp = _now()
        self.sql.exec(
            "INSERT INTO host_runs(run_id, owner_id, revision, snapshot_json, meta_json, created_at, updated_at) "
            "VALUES(?, ?, 1, ?, ?, ?, ?)",
            run.run_id, owner_id, _json(snapshot), _json(dict(meta)), stamp, stamp,
        )
        return 1

    def load(self, owner_id: str, run_id: str) -> StoredHostRun:
        rows = _rows(self.sql.exec(
            "SELECT revision, snapshot_json, meta_json FROM host_runs WHERE run_id = ? AND owner_id = ?", run_id, owner_id
        ))
        if not rows:
            raise RunNotFound(run_id)
        row = rows[0]
        return StoredHostRun(
            run=PipelineRun.from_snapshot(json.loads(row["snapshot_json"])),
            meta=json.loads(row["meta_json"]),
            revision=int(row["revision"]),
        )

    def save(self, owner_id: str, run: PipelineRun, meta: Mapping[str, Any], *, expected_revision: int) -> int:
        snapshot = run.snapshot()
        PipelineRun.from_snapshot(snapshot)
        rows = _rows(self.sql.exec(
            "SELECT revision, snapshot_json FROM host_runs WHERE run_id = ? AND owner_id = ?", run.run_id, owner_id
        ))
        if not rows:
            raise RunNotFound(run.run_id)
        if int(rows[0]["revision"]) != expected_revision:
            raise RevisionConflict(f"Expected revision {expected_revision}, found {rows[0]['revision']}")
        previous = json.loads(rows[0]["snapshot_json"])["events"]
        events = snapshot["events"]
        if len(events) < len(previous) or events[: len(previous)] != previous:
            raise EventIntegrityError("Event history must remain append-only")
        revision = expected_revision + 1
        self.sql.exec(
            "UPDATE host_runs SET revision = ?, snapshot_json = ?, meta_json = ?, updated_at = ? "
            "WHERE run_id = ? AND owner_id = ? AND revision = ?",
            revision, _json(snapshot), _json(dict(meta)), _now(), run.run_id, owner_id, expected_revision,
        )
        return revision

    def delete(self, owner_id: str, run_id: str) -> None:
        if not _rows(self.sql.exec("SELECT run_id FROM host_runs WHERE run_id = ? AND owner_id = ?", run_id, owner_id)):
            raise RunNotFound(run_id)
        self.sql.exec("DELETE FROM host_runs WHERE run_id = ? AND owner_id = ?", run_id, owner_id)
