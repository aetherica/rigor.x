from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from rigorx.host_engine import (
    EngineError,
    HostEngine,
    InvalidRequest,
    LimitExceeded,
    RunUnavailable,
    StageConflict,
)
from rigorx.pipeline import STAGE_ORDER, Stage
from rigorx.run_store import RevisionConflict, SQLiteRunStore
from rigorx.slash_commands import SlashCommandCatalog

ALICE = "google:alice-sub"
BOB = "google:bob-sub"
BEFORE_VERIFY = [s.value for s in STAGE_ORDER[: STAGE_ORDER.index(Stage.VERIFICATION)]]


class HostEngineTests(unittest.TestCase):
    def setUp(self):
        self.store = SQLiteRunStore(":memory:")
        self.engine = HostEngine(self.store)

    def tearDown(self):
        self.store.close()

    def advance_to_verification(self, owner, run_id, *, skip=()):
        for stage in BEFORE_VERIFY:
            if stage in skip:
                self.engine.submit_stage(owner, run_id, stage=stage, outcome="skipped", summary="n/a", reason="not needed")
            else:
                self.engine.submit_stage(owner, run_id, stage=stage, outcome="completed", summary=f"{stage} done")

    def test_start_run_returns_unguessable_handle_and_first_stage(self):
        first = self.engine.start_run(ALICE, "Explain gravity")
        second = self.engine.start_run(ALICE, "Explain gravity")
        self.assertNotEqual(first["run_id"], second["run_id"])
        self.assertRegex(first["run_id"], r"^rx_[A-Za-z0-9_-]{32}$")
        self.assertEqual(first["current_stage"], "CONTEXT")
        self.assertEqual(first["stage_status"]["CONTEXT"], "IN_PROGRESS")
        self.assertTrue(first["guidance"])

    def test_raw_task_and_summaries_are_not_stored(self):
        run_id = self.engine.start_run(ALICE, "SECRET-TASK-TEXT")["run_id"]
        self.engine.submit_stage(ALICE, run_id, stage="CONTEXT", outcome="completed", summary="SECRET-SUMMARY")
        self.engine.record_evidence(ALICE, run_id, source_ref="https://example.org/a", claim="SECRET-CLAIM")
        stored = self.store.load(ALICE, run_id)
        dump = str(stored.run.snapshot()) + str(stored.meta)
        for secret in ("SECRET-TASK-TEXT", "SECRET-SUMMARY", "SECRET-CLAIM"):
            self.assertNotIn(secret, dump)

    def test_other_owner_sees_run_as_missing(self):
        run_id = self.engine.start_run(ALICE, "Explain gravity")["run_id"]
        for call in (
            lambda: self.engine.get_run(BOB, run_id),
            lambda: self.engine.submit_stage(BOB, run_id, stage="CONTEXT", outcome="completed", summary="x"),
            lambda: self.engine.record_evidence(BOB, run_id, source_ref="s", claim="c"),
            lambda: self.engine.cancel_run(BOB, run_id, reason="x"),
            lambda: self.engine.delete_run(BOB, run_id),
        ):
            with self.assertRaises(RunUnavailable):
                call()
        with self.assertRaises(RunUnavailable):
            self.engine.get_run(ALICE, "rx_doesnotexist000000000000000000")
        self.assertEqual(self.engine.get_run(ALICE, run_id)["status"], "IN_PROGRESS")

    def test_owner_identity_is_required(self):
        with self.assertRaises(InvalidRequest):
            self.engine.start_run("", "task")

    def test_stage_order_is_enforced(self):
        run_id = self.engine.start_run(ALICE, "Explain gravity")["run_id"]
        with self.assertRaises(StageConflict):
            self.engine.submit_stage(ALICE, run_id, stage="INTENT", outcome="completed", summary="jump ahead")
        with self.assertRaises(InvalidRequest):
            self.engine.submit_stage(ALICE, run_id, stage="NOPE", outcome="completed", summary="x")
        with self.assertRaises(InvalidRequest):
            self.engine.submit_stage(ALICE, run_id, stage="CONTEXT", outcome="done", summary="x")

    def test_full_run_completes_after_structural_verification(self):
        run_id = self.engine.start_run(ALICE, "What is gravity?")["run_id"]
        self.engine.submit_stage(ALICE, run_id, stage="CONTEXT", outcome="completed", summary="ctx")
        ev = self.engine.record_evidence(ALICE, run_id, source_ref="https://example.org/physics", claim="Masses attract")["evidence_id"]
        for stage in BEFORE_VERIFY[1:]:
            skip = stage in {"RESEARCH", "EXECUTION"}
            self.engine.submit_stage(ALICE, run_id, stage=stage, outcome="skipped" if skip else "completed", summary="s", reason="not needed" if skip else None)
        with self.assertRaises(StageConflict):
            self.engine.submit_stage(ALICE, run_id, stage="VERIFICATION", outcome="completed", summary="trust me")
        result = self.engine.verify(ALICE, run_id, criteria=[{"criterion": "Answer cites a source", "passed": True, "evidence_ids": [ev]}])
        self.assertTrue(result["passed"], result["checks"])
        self.assertEqual(result["wording"], "structurally verified")
        self.assertEqual(result["current_stage"], "DECISION")
        self.engine.submit_stage(ALICE, run_id, stage="DECISION", outcome="completed", summary="final")
        done = self.engine.submit_stage(ALICE, run_id, stage="FEEDBACK", outcome="completed", summary="none")
        self.assertEqual(done["status"], "COMPLETED")
        self.assertIsNone(done["current_stage"])
        with self.assertRaises(StageConflict):
            self.engine.record_evidence(ALICE, run_id, source_ref="late", claim="late")

    def test_verification_rejects_uncited_or_dangling_criteria_then_reentry_recovers(self):
        run_id = self.engine.start_run(ALICE, "What is gravity?")["run_id"]
        self.advance_to_verification(ALICE, run_id)
        failed = self.engine.verify(ALICE, run_id, criteria=[
            {"criterion": "uncited", "passed": True, "evidence_ids": []},
            {"criterion": "dangling", "passed": True, "evidence_ids": ["ev-999"]},
        ])
        self.assertFalse(failed["passed"])
        self.assertEqual(failed["status"], "VERIFICATION_FAILED")
        checks = {c["check"]: c for c in failed["checks"]}
        self.assertFalse(checks["criteria_met_with_evidence"]["passed"])
        self.assertEqual(checks["evidence_references_exist"]["detail"], ["ev-999"])
        with self.assertRaises(StageConflict):
            self.engine.submit_stage(ALICE, run_id, stage="DECISION", outcome="completed", summary="skip the gate")
        with self.assertRaises(StageConflict):
            self.engine.reenter(ALICE, run_id, target_stage="VERIFICATION", trigger="t", reason="r")
        back = self.engine.reenter(ALICE, run_id, target_stage="EVIDENCE", trigger="gate_failed", reason="missing evidence")
        self.assertEqual(back["current_stage"], "EVIDENCE")
        self.assertEqual(back["reentries"]["used"], 1)
        ev = self.engine.record_evidence(ALICE, run_id, source_ref="doc:1", claim="c")["evidence_id"]
        self.engine.submit_stage(ALICE, run_id, stage="EVIDENCE", outcome="completed", summary="ok")
        ok = self.engine.verify(ALICE, run_id, criteria=[{"criterion": "cited", "passed": True, "evidence_ids": [ev]}])
        self.assertTrue(ok["passed"], ok["checks"])

    def test_unmet_or_missing_criteria_fail(self):
        for criteria in ([], [{"criterion": "x", "passed": False, "evidence_ids": []}]):
            run_id = self.engine.start_run(ALICE, "What is gravity?")["run_id"]
            self.advance_to_verification(ALICE, run_id)
            self.assertFalse(self.engine.verify(ALICE, run_id, criteria=criteria)["passed"])

    def test_research_intent_requires_sources(self):
        run_id = self.engine.start_run(ALICE, "Research the latest policy and cite sources")["run_id"]
        self.assertEqual(self.engine.get_run(ALICE, run_id)["route"]["intent"], "RESEARCH")
        self.advance_to_verification(ALICE, run_id)
        action = self.engine.report_action(ALICE, run_id, tool_name="web_search", status="EXECUTED")["action_id"]
        result = self.engine.verify(ALICE, run_id, criteria=[{"criterion": "c", "passed": True, "evidence_ids": [action]}])
        checks = {c["check"]: c for c in result["checks"]}
        self.assertFalse(checks["research_has_sources"]["passed"])

    def test_execution_intent_requires_resolved_actions(self):
        run_id = self.engine.start_run(ALICE, "Please update the record and send the email")["run_id"]
        self.assertEqual(self.engine.get_run(ALICE, run_id)["route"]["intent"], "EXECUTION")
        self.advance_to_verification(ALICE, run_id)
        failed_action = self.engine.report_action(ALICE, run_id, tool_name="send_email", status="FAILED", receipt_ref="mail:1")["action_id"]
        result = self.engine.verify(ALICE, run_id, criteria=[{"criterion": "sent", "passed": True, "evidence_ids": [failed_action]}])
        self.assertFalse({c["check"]: c for c in result["checks"]}["no_unresolved_failed_actions"]["passed"])
        self.engine.reenter(ALICE, run_id, target_stage="EXECUTION", trigger="gate_failed", reason="retry")
        with self.assertRaises(InvalidRequest):
            self.engine.report_action(ALICE, run_id, tool_name="send_email", status="EXECUTED", resolves="ev-1")
        retry = self.engine.report_action(ALICE, run_id, tool_name="send_email", status="EXECUTED", receipt_ref="mail:2", resolves=failed_action)["action_id"]
        for stage in ("EXECUTION", "EVIDENCE"):
            self.engine.submit_stage(ALICE, run_id, stage=stage, outcome="completed", summary="s")
        ok = self.engine.verify(ALICE, run_id, criteria=[{"criterion": "sent", "passed": True, "evidence_ids": [retry]}])
        self.assertTrue(ok["passed"], ok["checks"])
        self.assertTrue(all(a["status"] in {"FAILED", "EXECUTED"} for a in ok["actions"]))

    def test_partial_and_blocked_stages_resume(self):
        run_id = self.engine.start_run(ALICE, "Explain gravity")["run_id"]
        with self.assertRaises(InvalidRequest):
            self.engine.submit_stage(ALICE, run_id, stage="CONTEXT", outcome="partial", summary="half")
        partial = self.engine.submit_stage(ALICE, run_id, stage="CONTEXT", outcome="partial", summary="half", reason="more later")
        self.assertEqual(partial["status"], "PARTIAL")
        self.engine.record_evidence(ALICE, run_id, source_ref="s", claim="c")
        resumed = self.engine.submit_stage(ALICE, run_id, stage="CONTEXT", outcome="completed", summary="full")
        self.assertEqual(resumed["current_stage"], "INTENT")
        blocked = self.engine.submit_stage(ALICE, run_id, stage="INTENT", outcome="blocked", summary="x", reason="need user")
        self.assertEqual(blocked["status"], "BLOCKED")
        self.assertEqual(self.engine.submit_stage(ALICE, run_id, stage="INTENT", outcome="completed", summary="y")["current_stage"], "KNOWLEDGE")

    def test_gate_stages_cannot_be_skipped(self):
        run_id = self.engine.start_run(ALICE, "Explain gravity")["run_id"]
        self.advance_to_verification(ALICE, run_id)
        with self.assertRaises(StageConflict):
            self.engine.submit_stage(ALICE, run_id, stage="VERIFICATION", outcome="skipped", summary="x", reason="r")

    def test_reentry_budget_is_bounded(self):
        engine = HostEngine(self.store, max_reentries=1)
        run_id = engine.start_run(ALICE, "Explain gravity")["run_id"]
        engine.submit_stage(ALICE, run_id, stage="CONTEXT", outcome="completed", summary="s")
        engine.reenter(ALICE, run_id, target_stage="CONTEXT", trigger="t", reason="r")
        engine.submit_stage(ALICE, run_id, stage="CONTEXT", outcome="completed", summary="s")
        with self.assertRaises(StageConflict):
            engine.reenter(ALICE, run_id, target_stage="CONTEXT", trigger="t", reason="r")

    def test_cancel_and_delete(self):
        run_id = self.engine.start_run(ALICE, "Explain gravity")["run_id"]
        self.assertEqual(self.engine.cancel_run(ALICE, run_id, reason="user stopped")["status"], "CANCELLED")
        with self.assertRaises(StageConflict):
            self.engine.submit_stage(ALICE, run_id, stage="CONTEXT", outcome="completed", summary="x")
        self.assertTrue(self.engine.delete_run(ALICE, run_id)["deleted"])
        with self.assertRaises(RunUnavailable):
            self.engine.get_run(ALICE, run_id)
        with self.assertRaises(RunUnavailable):
            self.engine.delete_run(ALICE, run_id)

    def test_limits(self):
        engine = HostEngine(self.store, max_evidence_per_run=2, max_text_chars=10)
        run_id = engine.start_run(ALICE, "short")["run_id"]
        with self.assertRaises(LimitExceeded):
            engine.submit_stage(ALICE, run_id, stage="CONTEXT", outcome="completed", summary="x" * 11)
        engine.record_evidence(ALICE, run_id, source_ref="a", claim="c")
        engine.report_action(ALICE, run_id, tool_name="t", status="EXECUTED")
        with self.assertRaises(LimitExceeded):
            engine.record_evidence(ALICE, run_id, source_ref="b", claim="c")
        with self.assertRaises(InvalidRequest):
            engine.record_evidence(ALICE, run_id, source_ref="a", claim="c", evidence_type="HOST_REPORTED_ACTION")

    def test_route_is_stateless_and_resolve_needs_catalog(self):
        self.assertEqual(self.engine.route("Debug this code")["profile"]["intent"], "TECHNICAL")
        with self.assertRaises(EngineError):
            self.engine.resolve_commands("/short hi")
        catalog = SlashCommandCatalog([{
            "id": "SLC-0001", "name": "/short", "description": "Keep it brief", "classification": "MACRO",
            "group_id": "g", "lifecycle_status": "x", "runtime_status": "y",
        }], expected_count=1)
        resolved = HostEngine(self.store, command_catalog=catalog).resolve_commands("/short hello")
        self.assertEqual(len(resolved["applied_modifiers"]), 1)

    def test_revision_conflict_and_persistence_across_reopen(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "host.sqlite"
            with SQLiteRunStore(path) as store:
                engine = HostEngine(store)
                run_id = engine.start_run(ALICE, "Explain gravity")["run_id"]
                stale = store.load(ALICE, run_id)
                engine.submit_stage(ALICE, run_id, stage="CONTEXT", outcome="completed", summary="s")
                with self.assertRaises(RevisionConflict):
                    store.save(ALICE, stale.run, stale.meta, expected_revision=stale.revision)
            with SQLiteRunStore(path) as store:
                self.assertEqual(HostEngine(store).get_run(ALICE, run_id)["current_stage"], "INTENT")


if __name__ == "__main__":
    unittest.main()
