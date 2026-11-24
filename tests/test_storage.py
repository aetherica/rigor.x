"""Durable-store contract tests for RIGOR-X."""
import tempfile
import unittest
from pathlib import Path

from rigorx.pipeline import PipelineRun, Stage
from rigorx.storage import (
    EventIntegrityError,
    RevisionConflict,
    RunNotFound,
    SQLitePipelineStore,
)


class SQLitePipelineStoreTests(unittest.TestCase):
    def test_persisted_snapshot_schema_valid(self) -> None:
        schema_path = Path(__file__).resolve().parents[1] / "schemas" / "pipeline-run.schema.json"
        import json
        from jsonschema import Draft202012Validator, FormatChecker
        schema = json.loads(schema_path.read_text(encoding="utf-8"))
        validator = Draft202012Validator(schema, format_checker=FormatChecker())
        with SQLitePipelineStore(":memory:") as store:
            run = PipelineRun("durable-schema-001")
            run.begin_stage()
            store.save(run)
            validator.validate(store.load(run.run_id).snapshot)

    def test_create_save_and_restore_across_store_reopen(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            db = Path(tmp) / "runs.sqlite3"
            store = SQLitePipelineStore(db)
            run = PipelineRun("durable-001")
            run.begin_stage()
            run.record_evidence(evidence_type="note", source_ref="src:001")
            rev1 = store.save(run)
            self.assertEqual(rev1, 1)
            store.close()

            with SQLitePipelineStore(db) as reopened:
                restored, revision = reopened.restore("durable-001")
                self.assertEqual(revision, 1)
                self.assertEqual(restored.snapshot(), run.snapshot())
                self.assertEqual(reopened.integrity_check(), ["ok"])

    def test_update_uses_optimistic_revision_and_persists_new_event(self) -> None:
        with SQLitePipelineStore(":memory:") as store:
            run = PipelineRun("durable-002")
            run.begin_stage()
            revision = store.save(run)
            run.record_evidence(evidence_type="source", source_ref="source://a")
            revision = store.save(run, expected_revision=revision)
            self.assertEqual(revision, 2)
            stored = store.load(run.run_id)
            self.assertEqual(stored.revision, 2)
            self.assertEqual(len(stored.snapshot["events"]), 2)

    def test_stale_revision_rejected(self) -> None:
        with SQLitePipelineStore(":memory:") as store:
            run = PipelineRun("durable-003")
            rev = store.save(run)
            run.begin_stage()
            store.save(run, expected_revision=rev)
            with self.assertRaises(RevisionConflict):
                store.save(run, expected_revision=rev)

    def test_existing_run_requires_revision(self) -> None:
        with SQLitePipelineStore(":memory:") as store:
            run = PipelineRun("durable-004")
            store.save(run)
            with self.assertRaises(RevisionConflict):
                store.save(run)

    def test_run_not_found(self) -> None:
        with SQLitePipelineStore(":memory:") as store:
            with self.assertRaises(RunNotFound):
                store.load("missing")

    def test_append_only_event_history_enforced(self) -> None:
        with SQLitePipelineStore(":memory:") as store:
            run = PipelineRun("durable-005")
            run.begin_stage()
            revision = store.save(run)
            run.events.clear()
            with self.assertRaises(EventIntegrityError):
                store.save(run, expected_revision=revision)

    def test_event_ledger_and_snapshot_consistency(self) -> None:
        with SQLitePipelineStore(":memory:") as store:
            run = PipelineRun("durable-006")
            run.begin_stage()
            store.save(run)
            run.complete_stage()
            store.save(run, expected_revision=1)
            loaded = store.load(run.run_id)
            self.assertEqual(loaded.snapshot["current_stage"], Stage.INTENT.value)
            self.assertEqual(loaded.snapshot["events"], [event.to_dict() for event in run.events])


if __name__ == "__main__":
    unittest.main()
