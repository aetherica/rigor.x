"""Experimental bounded reasoning controller and mechanism selector (control-plane only)."""
from __future__ import annotations

import math
import re
from collections import deque
from dataclasses import dataclass
from enum import StrEnum

from .reasoning_guard import GuardAction, GuardDecision, ReasoningGuard


class TaskKind(StrEnum):
    GENERAL = "GENERAL"
    RESEARCH = "RESEARCH"
    CAUSAL = "CAUSAL"
    DECISION = "DECISION"
    QUANTITATIVE = "QUANTITATIVE"
    CREATIVE = "CREATIVE"
    TECHNICAL = "TECHNICAL"
    DIAGNOSTIC = "DIAGNOSTIC"


class Mechanism(StrEnum):
    STRUCTURED_DECOMPOSITION = "STRUCTURED_DECOMPOSITION"
    EVIDENCE_SEARCH = "EVIDENCE_SEARCH"
    CAUSAL_COUNTERFACTUAL = "CAUSAL_COUNTERFACTUAL"
    PROBABILISTIC = "PROBABILISTIC"
    CONSTRAINT_OPTIMIZATION = "CONSTRAINT_OPTIMIZATION"
    TEMPORAL_SEQUENTIAL = "TEMPORAL_SEQUENTIAL"
    TOOL_AUGMENTED = "TOOL_AUGMENTED"
    STRATEGIC_SYSTEMS = "STRATEGIC_SYSTEMS"
    CREATIVE_DIVERGENCE = "CREATIVE_DIVERGENCE"


class ControllerAction(StrEnum):
    CONTINUE = "CONTINUE"
    DIVERSIFY = "DIVERSIFY"
    REPLAN = "REPLAN"
    STOP_LOOP_SIGNAL = "STOP_LOOP_SIGNAL"
    STOP_BUDGET = "STOP_BUDGET"
    STOP_STALLED = "STOP_STALLED"


@dataclass(frozen=True, slots=True)
class TaskProfile:
    task_kind: TaskKind = TaskKind.GENERAL
    intensity: int = 2
    uncertainty: float = 0.0
    risk: float = 0.0
    evidence_required: bool = False
    tool_capable: bool = False
    time_sensitive: bool = False
    available_mechanisms: frozenset[Mechanism] | None = None

    def __post_init__(self) -> None:
        if not isinstance(self.task_kind, TaskKind):
            raise TypeError("task_kind must be TaskKind")
        if isinstance(self.intensity, bool) or not isinstance(self.intensity, int):
            raise TypeError("intensity must be an integer in 1..6")
        if not 1 <= self.intensity <= 6:
            raise ValueError("intensity must be 1..6 (L01-L06)")
        for name, value in (("uncertainty", self.uncertainty), ("risk", self.risk)):
            if (
                isinstance(value, bool)
                or not isinstance(value, (int, float))
                or not math.isfinite(value)
                or not 0 <= value <= 1
            ):
                raise ValueError(f"{name} must be finite in [0,1]")
        for name, value in (
            ("evidence_required", self.evidence_required),
            ("tool_capable", self.tool_capable),
            ("time_sensitive", self.time_sensitive),
        ):
            if not isinstance(value, bool):
                raise TypeError(f"{name} must be bool")
        if self.available_mechanisms is not None:
            if not isinstance(self.available_mechanisms, frozenset):
                raise TypeError("available_mechanisms must be a frozenset or None")
            if any(not isinstance(item, Mechanism) for item in self.available_mechanisms):
                raise TypeError("available_mechanisms must contain Mechanism values")


@dataclass(frozen=True, slots=True)
class MechanismPlan:
    primary: Mechanism | None
    supporting: tuple[Mechanism, ...]
    rationale: tuple[str, ...]
    intensity: int
    capability_gaps: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class SemanticLoopSignal:
    similarity: float
    compared_state: int
    triggered: bool
    method: str = "token-set-jaccard"
    advisory_only: bool = True


@dataclass(frozen=True, slots=True)
class ControllerReceipt:
    action: ControllerAction
    step: int
    guard: GuardDecision
    semantic_signal: SemanticLoopSignal | None
    reason: str
    recovery_attempts: int


def _tokens(text: str) -> set[str]:
    if not isinstance(text, str):
        raise TypeError("state must be str")
    return set(re.findall(r"[\w]+", text.casefold(), flags=re.UNICODE))


def token_jaccard(left: str, right: str) -> float:
    a, b = _tokens(left), _tokens(right)
    return len(a & b) / len(a | b) if a and b else 0.0


class SemanticLoopMonitor:
    """Advisory lexical overlap signal; it is not semantic-equivalence detection."""

    def __init__(self, *, window: int = 6, threshold: float = 0.88, min_tokens: int = 6):
        if isinstance(window, bool) or not isinstance(window, int) or window < 2:
            raise ValueError("window must be an integer >= 2")
        if (
            isinstance(threshold, bool)
            or not isinstance(threshold, (int, float))
            or not math.isfinite(threshold)
            or not 0 < threshold <= 1
        ):
            raise ValueError("threshold must be finite and in (0,1]")
        if isinstance(min_tokens, bool) or not isinstance(min_tokens, int) or min_tokens < 1:
            raise ValueError("min_tokens must be an integer >= 1")
        self.window = window
        self.threshold = float(threshold)
        self.min_tokens = min_tokens
        self._states: deque[tuple[int, str]] = deque(maxlen=window)
        self._step = 0

    def reset_episode(self) -> None:
        self._states.clear()
        self._step = 0

    def observe(self, state: str) -> SemanticLoopSignal | None:
        if not isinstance(state, str) or not state.strip():
            raise ValueError("state must be non-empty")
        self._step += 1
        score, compared_step = 0.0, -1
        if len(_tokens(state)) >= self.min_tokens:
            for prior_step, previous in self._states:
                similarity = token_jaccard(state, previous)
                if similarity > score:
                    score, compared_step = similarity, prior_step
        signal = (
            SemanticLoopSignal(score, compared_step, True)
            if compared_step >= 1 and score >= self.threshold
            else None
        )
        self._states.append((self._step, state))
        return signal


class MechanismSelector:
    """Candidate planner. Selected mechanisms are not executed."""

    def select(self, profile: TaskProfile) -> MechanismPlan:
        if not isinstance(profile, TaskProfile):
            raise TypeError("profile must be a TaskProfile")
        selected: list[Mechanism] = []
        rationale: list[str] = []
        gaps: list[str] = []
        allowed = profile.available_mechanisms

        def add(mechanism: Mechanism, reason: str) -> None:
            if allowed is not None and mechanism not in allowed:
                gaps.append(f"{mechanism.value} unavailable: {reason}")
            elif mechanism not in selected:
                selected.append(mechanism)
                rationale.append(reason)

        add(Mechanism.STRUCTURED_DECOMPOSITION, "default task decomposition")
        if profile.task_kind is TaskKind.RESEARCH or profile.evidence_required:
            add(Mechanism.EVIDENCE_SEARCH, "research/evidence requirement")
        if profile.task_kind in {TaskKind.CAUSAL, TaskKind.DIAGNOSTIC}:
            add(Mechanism.CAUSAL_COUNTERFACTUAL, "causal/root mechanism analysis")
            add(Mechanism.STRATEGIC_SYSTEMS, "system interdependencies and feedback")
        if profile.task_kind is TaskKind.DECISION or profile.risk >= 0.6:
            add(Mechanism.CONSTRAINT_OPTIMIZATION, "decision trade-offs or high risk")
            add(Mechanism.PROBABILISTIC, "uncertainty-aware evaluation")
        if profile.task_kind is TaskKind.QUANTITATIVE:
            add(Mechanism.CONSTRAINT_OPTIMIZATION, "quantitative constraints")
            add(Mechanism.PROBABILISTIC, "statistical interpretation")
        if profile.time_sensitive:
            add(Mechanism.TEMPORAL_SEQUENTIAL, "time-sensitive analysis")
        if profile.tool_capable:
            add(Mechanism.TOOL_AUGMENTED, "tools declared available by caller")
        if profile.task_kind is TaskKind.CREATIVE:
            add(Mechanism.CREATIVE_DIVERGENCE, "divergent ideation")
        if profile.uncertainty >= 0.6 or profile.intensity >= 5:
            add(Mechanism.PROBABILISTIC, "high uncertainty/intensity")

        return MechanismPlan(
            primary=selected[0] if selected else None,
            supporting=tuple(selected[1:]),
            rationale=tuple(rationale),
            intensity=profile.intensity,
            capability_gaps=tuple(gaps),
        )


class ReasoningController:
    """Exact-repeat/progress/budget guard plus advisory lexical signal and recovery budget."""

    def __init__(
        self,
        *,
        max_steps: int = 32,
        repeat_limit: int = 2,
        stall_window: int = 5,
        semantic_window: int = 6,
        semantic_threshold: float = 0.88,
        recovery_budget: int = 2,
        semantic_signal_action: ControllerAction = ControllerAction.DIVERSIFY,
    ):
        if isinstance(recovery_budget, bool) or not isinstance(recovery_budget, int) or recovery_budget < 0:
            raise ValueError("recovery_budget must be an integer >= 0")
        if semantic_signal_action not in {ControllerAction.DIVERSIFY, ControllerAction.REPLAN}:
            raise ValueError("semantic action may only DIVERSIFY or REPLAN")
        self.guard = ReasoningGuard(
            max_steps=max_steps, repeat_limit=repeat_limit, stall_window=stall_window
        )
        self.semantic = SemanticLoopMonitor(window=semantic_window, threshold=semantic_threshold)
        self.recovery_budget = recovery_budget
        self.semantic_signal_action = semantic_signal_action
        self._recovery_attempts = 0
        self._terminal_receipt: ControllerReceipt | None = None

    def observe(self, state: str, *, progress: float | None = None) -> ControllerReceipt:
        if self._terminal_receipt is not None:
            return self._terminal_receipt
        guard = self.guard.observe(state, progress=progress)
        signal = self.semantic.observe(state)
        if guard.action is GuardAction.STOP_BUDGET:
            action, reason = ControllerAction.STOP_BUDGET, guard.reason
        elif guard.action is GuardAction.STOP_REPEATED_STATE:
            action, reason = ControllerAction.STOP_LOOP_SIGNAL, guard.reason
        elif guard.action is GuardAction.STOP_STALLED:
            action, reason = ControllerAction.STOP_STALLED, guard.reason
        elif guard.action is GuardAction.DIVERSIFY:
            action, reason = ControllerAction.DIVERSIFY, guard.reason
        elif signal:
            if self._recovery_attempts >= self.recovery_budget:
                action, reason = (
                    ControllerAction.STOP_LOOP_SIGNAL,
                    "lexical signal repeated; recovery budget exhausted",
                )
            else:
                self._recovery_attempts += 1
                action, reason = (
                    self.semantic_signal_action,
                    "advisory lexical-overlap signal; diversify/replan",
                )
        else:
            action, reason = ControllerAction.CONTINUE, guard.reason

        receipt = ControllerReceipt(
            action, guard.step_count, guard, signal, reason, self._recovery_attempts
        )
        if action in {
            ControllerAction.STOP_LOOP_SIGNAL,
            ControllerAction.STOP_BUDGET,
            ControllerAction.STOP_STALLED,
        }:
            self._terminal_receipt = receipt
        return receipt

    def reset_episode(self) -> None:
        """Reset all state for a separately scoped episode."""
        self.guard.reset_episode()
        self.semantic.reset_episode()
        self._recovery_attempts = 0
        self._terminal_receipt = None
