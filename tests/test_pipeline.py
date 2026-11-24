"""Contract tests for the RIGOR-X primary operational pipeline."""
import unittest

from rigorx.pipeline import (
    InvalidTransition,
    PipelineRun,
    RunStatus,
    Stage,
    StageStatus,
    STAGE_ORDER,
)


class PipelineRunTests(unittest.TestCase):
    def test_stage_order_is_owner_defined_eleven_stage_sequence(self) -> None:
        self.assertEqual(
            [stage.value for stage in STAGE_ORDER],
            [
                "CONTEXT", "INTENT", "KNOWLEDGE", "RESEARCH", "ROUTING",
                "REASONING", "EXECUTION", "EVIDENCE", "VERIFICATION",
                "DECISION", "FEEDBACK",
            ],
        )

    def test_run_advances_in_order_and_completes(self) -> None:
        run = PipelineRun("run-001")
        for stage in STAGE_ORDER:
            self.assertEqual(run.begin_stage(), stage)
            if stage is Stage.VERIFICATION:
                next_stage = run.complete_stage(verification_passed=True)
            else:
                next_stage = run.complete_stage()
        self.assertIsNone(next_stage)
        self.assertEqual(run.status, RunStatus.COMPLETED)
        self.assertEqual(run.stage_status[Stage.FEEDBACK], StageStatus.COMPLETED)

    def test_evidence_can_be_captured_during_any_active_stage(self) -> None:
        run = PipelineRun("run-002")
        run.begin_stage()
        event = run.record_evidence(
            evidence_type="context_reference",
            source_ref="conversation://current/request",
        )
        self.assertEqual(event.event_type, "EVIDENCE_CAPTURED")
        self.assertEqual(event.stage, Stage.CONTEXT)
        self.assertEqual(event.sequence, 2)

    def test_decision_is_blocked_until_verification_passes(self) -> None:
        run = PipelineRun("run-003")
        for stage in STAGE_ORDER[: STAGE_ORDER.index(Stage.VERIFICATION)]:
            run.begin_stage()
            run.complete_stage()
        run.begin_stage()
        with self.assertRaises(ValueError):
            run.complete_stage()
        run.complete_stage(verification_passed=False)
        self.assertEqual(run.status, RunStatus.VERIFICATION_FAILED)
        self.assertEqual(run.stage_status[Stage.VERIFICATION], StageStatus.FAILED)
        with self.assertRaises(InvalidTransition):
            run.begin_stage()

    def test_failed_verification_can_reenter_smallest_earlier_stage(self) -> None:
        run = PipelineRun("run-004")
        for stage in STAGE_ORDER[: STAGE_ORDER.index(Stage.VERIFICATION)]:
            run.begin_stage()
            run.complete_stage()
        run.begin_stage()
        run.complete_stage(verification_passed=False)
        self.assertEqual(
            run.reenter(Stage.RESEARCH, trigger="evidence_gap", reason="Primary source missing"),
            Stage.RESEARCH,
        )
        self.assertEqual(run.current_stage, Stage.RESEARCH)
        self.assertEqual(run.stage_status[Stage.RESEARCH], StageStatus.READY)
        self.assertEqual(run.stage_status[Stage.VERIFICATION], StageStatus.NOT_STARTED)
        self.assertFalse(run.verification_accepted)

    def test_reentry_budget_is_enforced(self) -> None:
        run = PipelineRun("run-005", max_reentries=1)
        run.begin_stage()
        run.reenter(Stage.CONTEXT, trigger="context_conflict", reason="Refresh context")
        with self.assertRaises(InvalidTransition):
            run.reenter(Stage.CONTEXT, trigger="repeat", reason="Budget exhausted")

    def test_cannot_skip_forward_or_start_out_of_order(self) -> None:
        run = PipelineRun("run-006")
        with self.assertRaises(InvalidTransition):
            run.complete_stage()
        with self.assertRaises(InvalidTransition):
            run.reenter(Stage.DECISION, trigger="invalid", reason="Forward jump")

    def test_blocked_stage_requires_explicit_resume(self) -> None:
        run = PipelineRun("run-008")
        run.begin_stage()
        run.mark_blocked(reason="Connector authorization required")
        self.assertEqual(run.status, RunStatus.BLOCKED)
        with self.assertRaises(InvalidTransition):
            run.complete_stage()
        self.assertEqual(run.resume_blocked(), Stage.CONTEXT)
        run.begin_stage()
        run.complete_stage()
        self.assertEqual(run.current_stage, Stage.INTENT)

    def test_waiting_for_user_can_resume_same_stage(self) -> None:
        run = PipelineRun("run-009")
        run.begin_stage()
        run.set_waiting_for_user(reason="Need a scope decision")
        self.assertEqual(run.status, RunStatus.WAITING_FOR_USER)
        self.assertEqual(run.resume_waiting_for_user(), Stage.CONTEXT)
        run.complete_stage()
        self.assertEqual(run.current_stage, Stage.INTENT)

    def test_partial_stage_can_be_retried(self) -> None:
        run = PipelineRun("run-010")
        run.begin_stage()
        run.mark_partial(reason="Some context sources unavailable")
        self.assertEqual(run.status, RunStatus.PARTIAL)
        run.begin_stage()
        run.complete_stage()
        self.assertEqual(run.current_stage, Stage.INTENT)

    def test_snapshot_is_json_serializable(self) -> None:
        import json

        run = PipelineRun("run-007")
        run.begin_stage()
        json.dumps(run.snapshot())


if __name__ == "__main__":
    unittest.main()
