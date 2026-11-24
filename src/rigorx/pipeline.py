"""Deterministic control-plane state machine for the RIGOR-X 11-stage pipeline.

This module governs stage order, re-entry, verification gates and append-only
execution/evidence events. It does not execute tools or claim external
capabilities; adapters must provide their own receipts to the run ledger.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import StrEnum
from typing import Any, Mapping


class Stage(StrEnum):
    CONTEXT = "CONTEXT"
    INTENT = "INTENT"
    KNOWLEDGE = "KNOWLEDGE"
    RESEARCH = "RESEARCH"
    ROUTING = "ROUTING"
    REASONING = "REASONING"
    EXECUTION = "EXECUTION"
    EVIDENCE = "EVIDENCE"
    VERIFICATION = "VERIFICATION"
    DECISION = "DECISION"
    FEEDBACK = "FEEDBACK"


STAGE_ORDER: tuple[Stage, ...] = tuple(Stage)


class StageStatus(StrEnum):
    NOT_STARTED = "NOT_STARTED"
    READY = "READY"
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED = "COMPLETED"
    PARTIAL = "PARTIAL"
    BLOCKED = "BLOCKED"
    FAILED = "FAILED"
    SKIPPED_WITH_REASON = "SKIPPED_WITH_REASON"


class RunStatus(StrEnum):
    CREATED = "CREATED"
    IN_PROGRESS = "IN_PROGRESS"
    WAITING_FOR_USER = "WAITING_FOR_USER"
    PARTIAL = "PARTIAL"
    BLOCKED = "BLOCKED"
    FAILED = "FAILED"
    VERIFICATION_FAILED = "VERIFICATION_FAILED"
    DECISION_PENDING = "DECISION_PENDING"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"


class InvalidTransition(ValueError):
    """Raised when a run attempts a disallowed state transition."""


@dataclass(frozen=True, slots=True)
class PipelineEvent:
    sequence: int
    event_type: str
    stage: Stage
    timestamp: str
    details: Mapping[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "sequence": self.sequence,
            "event_type": self.event_type,
            "stage": self.stage.value,
            "timestamp": self.timestamp,
            "details": dict(self.details),
        }


@dataclass(slots=True)
class PipelineRun:
    """One auditable execution of the 11-stage RIGOR-X pipeline."""

    run_id: str
    pipeline_version: str = "1.0.0"
    max_reentries: int = 8
    current_stage: Stage = Stage.CONTEXT
    status: RunStatus = RunStatus.CREATED
    verification_accepted: bool = False
    reentry_count: int = 0
    stage_status: dict[Stage, StageStatus] = field(
        default_factory=lambda: {
            stage: (StageStatus.READY if stage is Stage.CONTEXT else StageStatus.NOT_STARTED)
            for stage in STAGE_ORDER
        }
    )
    events: list[PipelineEvent] = field(default_factory=list)

    def __post_init__(self) -> None:
        if not self.run_id.strip():
            raise ValueError("run_id must be a non-empty string")
        if self.max_reentries < 0:
            raise ValueError("max_reentries cannot be negative")

    def begin_stage(self) -> Stage:
        """Begin the current stage; stages cannot be started out of order."""
        if self.status in {RunStatus.COMPLETED, RunStatus.CANCELLED, RunStatus.VERIFICATION_FAILED}:
            raise InvalidTransition(
                f"Cannot start a stage for a {self.status.value} run; re-enter an earlier stage first"
            )
        state = self.stage_status[self.current_stage]
        if state not in {StageStatus.READY, StageStatus.PARTIAL, StageStatus.BLOCKED, StageStatus.FAILED}:
            raise InvalidTransition(
                f"{self.current_stage.value} is {state.value}; expected READY or a recoverable state"
            )
        self.stage_status[self.current_stage] = StageStatus.IN_PROGRESS
        self.status = RunStatus.IN_PROGRESS
        self._emit("STAGE_STARTED", self.current_stage)
        return self.current_stage

    def record_evidence(
        self,
        *,
        evidence_type: str,
        source_ref: str,
        claim_ref: str | None = None,
        metadata: Mapping[str, Any] | None = None,
    ) -> PipelineEvent:
        """Capture evidence at any active stage, preserving its provenance reference."""
        if self.status is not RunStatus.IN_PROGRESS:
            raise InvalidTransition("Evidence can only be captured while a stage is in progress")
        if self.stage_status[self.current_stage] is not StageStatus.IN_PROGRESS:
            raise InvalidTransition("The current stage has not been started")
        if not evidence_type.strip() or not source_ref.strip():
            raise ValueError("evidence_type and source_ref are required")
        details: dict[str, Any] = {
            "evidence_type": evidence_type,
            "source_ref": source_ref,
        }
        if claim_ref is not None:
            details["claim_ref"] = claim_ref
        if metadata:
            details["metadata"] = dict(metadata)
        return self._emit("EVIDENCE_CAPTURED", self.current_stage, details)

    def complete_stage(
        self,
        *,
        result_ref: str | None = None,
        verification_passed: bool | None = None,
    ) -> Stage | None:
        """Complete the active stage and advance exactly one stage.

        VERIFICATION requires an explicit pass/fail result. DECISION is blocked
        until verification has passed in the current execution lineage.
        """
        stage = self.current_stage
        if self.status is not RunStatus.IN_PROGRESS:
            raise InvalidTransition("No stage is currently in progress")
        if self.stage_status[stage] is not StageStatus.IN_PROGRESS:
            raise InvalidTransition(f"{stage.value} has not been started")
        if stage is Stage.DECISION and not self.verification_accepted:
            raise InvalidTransition("DECISION is blocked until VERIFICATION passes")
        if stage is Stage.VERIFICATION and verification_passed is None:
            raise ValueError("verification_passed must be explicitly True or False")

        if stage is Stage.VERIFICATION and verification_passed is False:
            self.stage_status[stage] = StageStatus.FAILED
            self.status = RunStatus.VERIFICATION_FAILED
            self.verification_accepted = False
            self._emit("VERIFICATION_FAILED", stage, {"result_ref": result_ref})
            return None

        self.stage_status[stage] = StageStatus.COMPLETED
        details: dict[str, Any] = {}
        if result_ref is not None:
            details["result_ref"] = result_ref
        if stage is Stage.VERIFICATION:
            self.verification_accepted = True
            details["verification_passed"] = True
        self._emit("STAGE_COMPLETED", stage, details)

        index = STAGE_ORDER.index(stage)
        if index == len(STAGE_ORDER) - 1:
            self.status = RunStatus.COMPLETED
            self._emit("RUN_COMPLETED", stage)
            return None

        next_stage = STAGE_ORDER[index + 1]
        self.current_stage = next_stage
        self.stage_status[next_stage] = StageStatus.READY
        self.status = RunStatus.IN_PROGRESS
        return next_stage

    def reenter(self, target: Stage, *, trigger: str, reason: str) -> Stage:
        """Return to the smallest relevant earlier stage under a bounded budget."""
        if self.status in {RunStatus.COMPLETED, RunStatus.CANCELLED}:
            raise InvalidTransition(f"Cannot re-enter a {self.status.value} run")
        if not trigger.strip() or not reason.strip():
            raise ValueError("trigger and reason are required")
        target_index = STAGE_ORDER.index(target)
        current_index = STAGE_ORDER.index(self.current_stage)
        if target_index > current_index:
            raise InvalidTransition("Re-entry may target the current or an earlier stage")
        if self.status is RunStatus.VERIFICATION_FAILED and target_index >= STAGE_ORDER.index(Stage.VERIFICATION):
            raise InvalidTransition("Failed verification must re-enter an earlier corrective stage")
        if self.reentry_count >= self.max_reentries:
            raise InvalidTransition("Maximum re-entry budget exhausted")

        for stage in STAGE_ORDER[target_index:]:
            self.stage_status[stage] = StageStatus.NOT_STARTED
        self.stage_status[target] = StageStatus.READY
        self.current_stage = target
        self.status = RunStatus.IN_PROGRESS
        self.verification_accepted = False
        self.reentry_count += 1
        self._emit(
            "PIPELINE_REENTERED",
            target,
            {
                "trigger": trigger,
                "reason": reason,
                "reentry_count": self.reentry_count,
                "max_reentries": self.max_reentries,
            },
        )
        return target

    def set_waiting_for_user(self, *, reason: str) -> None:
        if self.status is not RunStatus.IN_PROGRESS:
            raise InvalidTransition("Only an in-progress run can wait for the user")
        if not reason.strip():
            raise ValueError("reason is required")
        self.status = RunStatus.WAITING_FOR_USER
        self._emit("WAITING_FOR_USER", self.current_stage, {"reason": reason})

    def mark_partial(self, *, reason: str) -> None:
        """Mark the active stage partial while retaining it as the retry point."""
        if self.status is not RunStatus.IN_PROGRESS:
            raise InvalidTransition("Only an in-progress run can become partial")
        if self.stage_status[self.current_stage] is not StageStatus.IN_PROGRESS:
            raise InvalidTransition("The current stage has not been started")
        if not reason.strip():
            raise ValueError("reason is required")
        self.stage_status[self.current_stage] = StageStatus.PARTIAL
        self.status = RunStatus.PARTIAL
        self._emit("STAGE_PARTIAL", self.current_stage, {"reason": reason})

    def mark_blocked(self, *, reason: str) -> None:
        """Block the active stage when a dependency or authorization is missing."""
        if self.status is not RunStatus.IN_PROGRESS:
            raise InvalidTransition("Only an in-progress run can become blocked")
        if self.stage_status[self.current_stage] is not StageStatus.IN_PROGRESS:
            raise InvalidTransition("The current stage has not been started")
        if not reason.strip():
            raise ValueError("reason is required")
        self.stage_status[self.current_stage] = StageStatus.BLOCKED
        self.status = RunStatus.BLOCKED
        self._emit("STAGE_BLOCKED", self.current_stage, {"reason": reason})

    def resume_blocked(self) -> Stage:
        """Resume a blocked run after its external dependency is resolved."""
        if self.status is not RunStatus.BLOCKED:
            raise InvalidTransition("Only a blocked run can be resumed")
        self.stage_status[self.current_stage] = StageStatus.READY
        self.status = RunStatus.IN_PROGRESS
        self._emit("BLOCK_RESOLVED", self.current_stage)
        return self.current_stage

    def resume_waiting_for_user(self) -> Stage:
        """Resume the active stage after the required user input is received."""
        if self.status is not RunStatus.WAITING_FOR_USER:
            raise InvalidTransition("Run is not waiting for the user")
        self.status = RunStatus.IN_PROGRESS
        self._emit("USER_INPUT_RECEIVED", self.current_stage)
        return self.current_stage

    def cancel(self, *, reason: str) -> None:
        if self.status is RunStatus.COMPLETED:
            raise InvalidTransition("A completed run cannot be cancelled")
        if not reason.strip():
            raise ValueError("reason is required")
        self.status = RunStatus.CANCELLED
        self._emit("RUN_CANCELLED", self.current_stage, {"reason": reason})

    def snapshot(self) -> dict[str, Any]:
        """Return a JSON-serializable state snapshot (not hidden reasoning)."""
        return {
            "run_id": self.run_id,
            "pipeline_version": self.pipeline_version,
            "current_stage": self.current_stage.value,
            "status": self.status.value,
            "verification_accepted": self.verification_accepted,
            "reentry_count": self.reentry_count,
            "max_reentries": self.max_reentries,
            "stage_status": {stage.value: self.stage_status[stage].value for stage in STAGE_ORDER},
            "events": [event.to_dict() for event in self.events],
        }

    def _emit(
        self,
        event_type: str,
        stage: Stage,
        details: Mapping[str, Any] | None = None,
    ) -> PipelineEvent:
        event = PipelineEvent(
            sequence=len(self.events) + 1,
            event_type=event_type,
            stage=stage,
            timestamp=datetime.now(timezone.utc).isoformat(),
            details=dict(details or {}),
        )
        self.events.append(event)
        return event
