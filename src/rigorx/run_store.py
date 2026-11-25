"""Owner-scoped run storage for the RIGOR-X host engine.

The host engine depends only on the ``RunStore`` protocol. ``SQLiteRunStore``
serves local use and tests; a Cloudflare Durable Object store implements the
same protocol in deployment (one object per owner).

Guarantees of every implementation:
- a run is visible only to the owner that created it; another owner's run is
  reported exactly like a missing run;
- the event history is append-only across saves;
- saves are revision-checked (optimistic concurrency).
"""
from __future__ import annotations

import json
import os
import sqlite3
from collections.abc import Iterator, Mapping
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Protocol, Self

from .pipeline import PipelineRun


class RunStoreError(RuntimeError):
    """Base class for run storage errors."""


class RunNotFound(RunStoreError):
    """The run does not exist for this owner."""


class RevisionConflict(RunStoreError):
    """The stored revision differs from the expected revision."""


class EventIntegrityError(RunStoreError):
    """A save would rewrite or remove persisted events."""


@dataclass(frozen=True, slots=True)
class StoredHostRun:
    run: PipelineRun
    meta: dict[str, Any]
    revision: int


class RunStore(Protocol):
    def create(self, owner_id: str, run: PipelineRun, meta: Mapping[str, Any]) -> int: ...

    def load(self, owner_id: str, run_id: str) -> StoredHostRun: ...

    def save(self, owner_id: str, run: PipelineRun, meta: Mapping[str, Any], *, expected_revision: int) -> int: ...

    def delete(self, owner_id: str, run_id: str) -> None: ...


def _json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)


def _now() -> str:
    return datetime.now(UTC).isoformat()


class SQLiteRunStore:
    """SQLite implementation of ``RunStore`` (standard library only)."""

    SCHEMA_VERSION = 1

    def __init__(self, database_path: str | Path, *, busy_timeout_ms: int = 5000) -> None:
        if isinstance(busy_timeout_ms, bool) or not isinstance(busy_timeout_ms, int) or busy_timeout_ms < 0:
            raise ValueError("busy_timeout_ms must be a non-negative integer")
        self.database_path = str(database_path)
        if self.database_path != ":memory:":
            Path(self.database_path).expanduser().resolve().parent.mkdir(parents=True, exist_ok=True)
        self._db = sqlite3.connect(self.database_path, timeout=busy_timeout_ms / 1000, isolation_level=None)
        if self.database_path != ":memory:":
            os.chmod(self.database_path, 0o600)
            self._db.execute("PRAGMA journal_mode = WAL")
            self._db.execute("PRAGMA synchronous = FULL")
        self._db.row_factory = sqlite3.Row
        self._db.execute(f"PRAGMA busy_timeout = {busy_timeout_ms}")
        with self._transaction():
            self._db.execute("CREATE TABLE IF NOT EXISTS host_store_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
            row = self._db.execute("SELECT value FROM host_store_meta WHERE key = 'schema_version'").fetchone()
            if row is None:
                self._db.execute("INSERT INTO host_store_meta(key, value) VALUES('schema_version', ?)", (str(self.SCHEMA_VERSION),))
            elif int(row["value"]) != self.SCHEMA_VERSION:
                raise RunStoreError(f"Unsupported host store schema version {row['value']}")
            self._db.execute(
                """CREATE TABLE IF NOT EXISTS host_runs (
                    run_id TEXT PRIMARY KEY,
                    owner_id TEXT NOT NULL,
                    revision INTEGER NOT NULL CHECK(revision >= 1),
                    snapshot_json TEXT NOT NULL,
                    meta_json TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )"""
            )
            self._db.execute("CREATE INDEX IF NOT EXISTS host_runs_owner ON host_runs(owner_id)")

    @contextmanager
    def _transaction(self) -> Iterator[None]:
        self._db.execute("BEGIN IMMEDIATE")
        try:
            yield
        except BaseException:
            self._db.rollback()
            raise
        else:
            self._db.commit()

    def create(self, owner_id: str, run: PipelineRun, meta: Mapping[str, Any]) -> int:
        snapshot = run.snapshot()
        PipelineRun.from_snapshot(snapshot)
        stamp = _now()
        with self._transaction():
            if self._db.execute("SELECT 1 FROM host_runs WHERE run_id = ?", (run.run_id,)).fetchone():
                raise RevisionConflict("Run ID already exists")
            self._db.execute(
                "INSERT INTO host_runs(run_id, owner_id, revision, snapshot_json, meta_json, created_at, updated_at) "
                "VALUES(?, ?, 1, ?, ?, ?, ?)",
                (run.run_id, owner_id, _json(snapshot), _json(dict(meta)), stamp, stamp),
            )
        return 1

    def load(self, owner_id: str, run_id: str) -> StoredHostRun:
        row = self._db.execute(
            "SELECT revision, snapshot_json, meta_json FROM host_runs WHERE run_id = ? AND owner_id = ?",
            (run_id, owner_id),
        ).fetchone()
        if row is None:
            raise RunNotFound(run_id)
        return StoredHostRun(
            run=PipelineRun.from_snapshot(json.loads(row["snapshot_json"])),
            meta=json.loads(row["meta_json"]),
            revision=row["revision"],
        )

    def save(self, owner_id: str, run: PipelineRun, meta: Mapping[str, Any], *, expected_revision: int) -> int:
        snapshot = run.snapshot()
        PipelineRun.from_snapshot(snapshot)
        with self._transaction():
            row = self._db.execute(
                "SELECT revision, snapshot_json FROM host_runs WHERE run_id = ? AND owner_id = ?",
                (run.run_id, owner_id),
            ).fetchone()
            if row is None:
                raise RunNotFound(run.run_id)
            if row["revision"] != expected_revision:
                raise RevisionConflict(f"Expected revision {expected_revision}, found {row['revision']}")
            previous = json.loads(row["snapshot_json"])["events"]
            events = snapshot["events"]
            if len(events) < len(previous) or events[: len(previous)] != previous:
                raise EventIntegrityError("Event history must remain append-only")
            revision = expected_revision + 1
            self._db.execute(
                "UPDATE host_runs SET revision = ?, snapshot_json = ?, meta_json = ?, updated_at = ? "
                "WHERE run_id = ? AND owner_id = ? AND revision = ?",
                (revision, _json(snapshot), _json(dict(meta)), _now(), run.run_id, owner_id, expected_revision),
            )
        return revision

    def delete(self, owner_id: str, run_id: str) -> None:
        with self._transaction():
            cursor = self._db.execute("DELETE FROM host_runs WHERE run_id = ? AND owner_id = ?", (run_id, owner_id))
            if cursor.rowcount != 1:
                raise RunNotFound(run_id)

    def close(self) -> None:
        self._db.close()

    def __enter__(self) -> Self:
        return self

    def __exit__(self, *_exc: object) -> None:
        self.close()
