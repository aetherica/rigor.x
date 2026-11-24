"""Transactional SQLite persistence for RIGOR-X pipeline runs.

Guarantees:
- snapshot and event writes commit atomically;
- event history is append-only and sequence-checked;
- optimistic revision checks prevent lost updates;
- SQLite integrity checks are exposed for operations;
- only standard-library SQLite/JSON are used.
"""
from __future__ import annotations

import json
import os
import sqlite3
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping

from rigorx.pipeline import PipelineRun


class StorageError(RuntimeError):
    """Base class for durable storage errors."""


class RunNotFound(StorageError):
    """Requested run ID does not exist."""


class RevisionConflict(StorageError):
    """Optimistic revision check failed."""


class EventIntegrityError(StorageError):
    """Persisted event stream does not match the snapshot append-only contract."""


@dataclass(frozen=True, slots=True)
class StoredRun:
    snapshot: dict[str, Any]
    revision: int


def _canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)


class SQLitePipelineStore:
    """Durable run store with transactional snapshot and event-ledger persistence."""

    SCHEMA_VERSION = 1

    def __init__(self, database_path: str | Path, *, busy_timeout_ms: int = 5000) -> None:
        if busy_timeout_ms < 0:
            raise ValueError("busy_timeout_ms must be non-negative")
        self.database_path = str(database_path)
        if self.database_path != ":memory:":
            Path(self.database_path).expanduser().resolve().parent.mkdir(parents=True, exist_ok=True)
        self._connection = sqlite3.connect(
            self.database_path,
            timeout=busy_timeout_ms / 1000,
            isolation_level=None,
        )
        if self.database_path != ":memory:":
            os.chmod(self.database_path, 0o600)
        self._connection.row_factory = sqlite3.Row
        self._connection.execute(f"PRAGMA busy_timeout = {busy_timeout_ms}")
        self._connection.execute("PRAGMA foreign_keys = ON")
        if self.database_path != ":memory:":
            self._connection.execute("PRAGMA journal_mode = WAL")
            self._connection.execute("PRAGMA synchronous = FULL")
        self._initialize()

    @contextmanager
    def _transaction(self):
        """Explicit transaction even with SQLite autocommit enabled."""
        self._connection.execute("BEGIN IMMEDIATE")
        try:
            yield
        except BaseException:
            self._connection.rollback()
            raise
        else:
            self._connection.commit()

    def _initialize(self) -> None:
        with self._transaction():
            self._connection.execute(
                """CREATE TABLE IF NOT EXISTS store_meta (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                )"""
            )
            row = self._connection.execute(
                "SELECT value FROM store_meta WHERE key = 'schema_version'"
            ).fetchone()
            if row is None:
                self._connection.execute(
                    "INSERT INTO store_meta(key, value) VALUES('schema_version', ?)",
                    (str(self.SCHEMA_VERSION),),
                )
            elif int(row["value"]) != self.SCHEMA_VERSION:
                raise StorageError(
                    f"Unsupported database schema version {row['value']}; "
                    f"expected {self.SCHEMA_VERSION}"
                )
            self._connection.execute(
                """CREATE TABLE IF NOT EXISTS pipeline_runs (
                    run_id TEXT PRIMARY KEY,
                    revision INTEGER NOT NULL CHECK(revision >= 0),
                    snapshot_json TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )"""
            )
            self._connection.execute(
                """CREATE TABLE IF NOT EXISTS pipeline_events (
                    run_id TEXT NOT NULL,
                    sequence INTEGER NOT NULL CHECK(sequence > 0),
                    event_json TEXT NOT NULL,
                    PRIMARY KEY(run_id, sequence),
                    FOREIGN KEY(run_id) REFERENCES pipeline_runs(run_id)
                        ON DELETE RESTRICT
                )"""
            )

    def save(self, run: PipelineRun, *, expected_revision: int | None = None) -> int:
        """Atomically persist a run snapshot and its newly appended events.

        New runs must use expected_revision=None. Existing runs must pass their
        observed revision. The return value is the newly committed revision.
        """
        snapshot = run.snapshot()
        PipelineRun.from_snapshot(snapshot)  # Validate before any durable mutation.
        snapshot_json = _canonical_json(snapshot)
        events = snapshot["events"]
        with self._transaction():
            row = self._connection.execute(
                "SELECT revision, snapshot_json FROM pipeline_runs WHERE run_id = ?",
                (run.run_id,),
            ).fetchone()
            if row is None:
                if expected_revision is not None:
                    raise RevisionConflict("Run does not exist at the expected revision")
                revision = 1
                self._connection.execute(
                    "INSERT INTO pipeline_runs(run_id, revision, snapshot_json, updated_at) "
                    "VALUES(?, ?, ?, ?)",
                    (run.run_id, revision, snapshot_json, snapshot["events"][-1]["timestamp"] if events else ""),
                )
                existing_events: list[dict[str, Any]] = []
            else:
                if expected_revision is None or row["revision"] != expected_revision:
                    raise RevisionConflict(
                        f"Expected revision {expected_revision}, found {row['revision']}"
                    )
                previous = json.loads(row["snapshot_json"])
                existing_events = previous["events"]
                if len(events) < len(existing_events) or events[: len(existing_events)] != existing_events:
                    raise EventIntegrityError("Event history must remain append-only")
                revision = row["revision"] + 1
                updated_at = events[-1]["timestamp"] if events else previous.get("updated_at", "")
                self._connection.execute(
                    "UPDATE pipeline_runs SET revision = ?, snapshot_json = ?, updated_at = ? "
                    "WHERE run_id = ? AND revision = ?",
                    (revision, snapshot_json, updated_at, run.run_id, expected_revision),
                )
            new_events = events[len(existing_events):]
            for event in new_events:
                self._connection.execute(
                    "INSERT INTO pipeline_events(run_id, sequence, event_json) VALUES(?, ?, ?)",
                    (run.run_id, event["sequence"], _canonical_json(event)),
                )
            return revision

    def load(self, run_id: str) -> StoredRun:
        row = self._connection.execute(
            "SELECT revision, snapshot_json FROM pipeline_runs WHERE run_id = ?",
            (run_id,),
        ).fetchone()
        if row is None:
            raise RunNotFound(run_id)
        snapshot = json.loads(row["snapshot_json"])
        event_rows = self._connection.execute(
            "SELECT sequence, event_json FROM pipeline_events WHERE run_id = ? ORDER BY sequence",
            (run_id,),
        ).fetchall()
        ledger = [json.loads(event["event_json"]) for event in event_rows]
        if ledger != snapshot["events"]:
            raise EventIntegrityError("Event ledger differs from stored snapshot")
        return StoredRun(snapshot=snapshot, revision=row["revision"])

    def restore(self, run_id: str) -> tuple[PipelineRun, int]:
        stored = self.load(run_id)
        return PipelineRun.from_snapshot(stored.snapshot), stored.revision

    def integrity_check(self) -> list[str]:
        """Return SQLite integrity messages; ['ok'] indicates a healthy DB."""
        return [row[0] for row in self._connection.execute("PRAGMA integrity_check")]

    def close(self) -> None:
        self._connection.close()

    def __enter__(self) -> "SQLitePipelineStore":
        return self

    def __exit__(self, exc_type: object, exc: object, traceback: object) -> None:
        self.close()
