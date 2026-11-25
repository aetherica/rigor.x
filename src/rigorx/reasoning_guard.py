"""Deterministic safeguards for bounded reasoning loops and progress tracking.

This module emits control signals; it does not verify truth or semantic equivalence.
"""
from __future__ import annotations

import math
import re
import unicodedata
from collections import deque
from collections.abc import Iterable
from dataclasses import dataclass
from hashlib import sha256
from enum import StrEnum


class GuardAction(StrEnum):
    CONTINUE = "CONTINUE"
    DIVERSIFY = "DIVERSIFY"
    STOP_REPEATED_STATE = "STOP_REPEATED_STATE"
    STOP_BUDGET = "STOP_BUDGET"
    STOP_STALLED = "STOP_STALLED"


@dataclass(frozen=True, slots=True)
class GuardDecision:
    action: GuardAction
    step_count: int
    fingerprint: str
    repeat_count: int
    best_progress: float | None
    reason: str


def normalize_state(state: str) -> str:
    """Normalize superficial textual differences, not semantic paraphrases."""
    if not isinstance(state, str):
        raise TypeError("state must be a string")
    value = unicodedata.normalize("NFKC", state).casefold()
    value = re.sub(r"\s+", " ", value).strip()
    value = re.sub(r"[\W_]+", " ", value, flags=re.UNICODE)
    return re.sub(r"\s+", " ", value).strip()


def fingerprint_state(state: str) -> str:
    normalized = normalize_state(state)
    if not normalized:
        raise ValueError("reasoning state must not be empty")
    return sha256(normalized.encode("utf-8")).hexdigest()


class ReasoningGuard:
    """Detect normalized repeats, stalls and hard budget exhaustion.

    Terminal decisions are latched. Further observations are ignored until reset,
    preventing a caller from bypassing the step budget by continuing to poll.
    """

    def __init__(
        self,
        *,
        max_steps: int = 24,
        repeat_limit: int = 2,
        stall_window: int = 5,
        min_progress_delta: float = 1e-6,
    ) -> None:
        if max_steps < 1 or repeat_limit < 1 or stall_window < 2:
            raise ValueError("budgets must be positive and stall_window >= 2")
        if (
            isinstance(min_progress_delta, bool)
            or not isinstance(min_progress_delta, (int, float))
            or not math.isfinite(min_progress_delta)
            or min_progress_delta < 0
        ):
            raise ValueError("min_progress_delta must be finite and non-negative")
        self.max_steps = max_steps
        self.repeat_limit = repeat_limit
        self.stall_window = stall_window
        self.min_progress_delta = min_progress_delta
        self.reset_episode()

    def reset_episode(self) -> None:
        """Reset counters and history for a new, separately scoped episode."""
        self._counts: dict[str, int] = {}
        self._progress: deque[float] = deque(maxlen=self.stall_window)
        self._steps = 0
        self._best_progress: float | None = None
        self._terminal: GuardDecision | None = None

    def observe(self, state: str, *, progress: float | None = None) -> GuardDecision:
        if self._terminal is not None:
            return self._terminal
        if progress is not None:
            if isinstance(progress, bool) or not isinstance(progress, (int, float)):
                raise TypeError("progress must be a numeric scalar, not bool")
            if not math.isfinite(progress):
                raise ValueError("progress must be finite")
        fingerprint = fingerprint_state(state)
        self._steps += 1
        repeats = self._counts.get(fingerprint, 0) + 1
        self._counts[fingerprint] = repeats
        if progress is not None:
            value = float(progress)
            self._progress.append(value)
            if self._best_progress is None or value > self._best_progress:
                self._best_progress = value

        if self._steps > self.max_steps:
            action, reason = GuardAction.STOP_BUDGET, "hard step budget exceeded"
        elif repeats > self.repeat_limit:
            action, reason = GuardAction.STOP_REPEATED_STATE, "state repeated beyond configured limit"
        elif self._is_stalled():
            action, reason = GuardAction.STOP_STALLED, "progress did not improve within stall window"
        elif repeats == self.repeat_limit:
            action, reason = GuardAction.DIVERSIFY, "repeat warning threshold reached"
        else:
            action, reason = GuardAction.CONTINUE, "within configured limits"

        decision = GuardDecision(
            action=action,
            step_count=self._steps,
            fingerprint=fingerprint,
            repeat_count=repeats,
            best_progress=self._best_progress,
            reason=reason,
        )
        if action in {
            GuardAction.STOP_BUDGET,
            GuardAction.STOP_REPEATED_STATE,
            GuardAction.STOP_STALLED,
        }:
            self._terminal = decision
        return decision

    def _is_stalled(self) -> bool:
        if len(self._progress) < self.stall_window:
            return False
        values = tuple(self._progress)
        return max(values) - min(values) <= self.min_progress_delta


def distinct_fingerprints(states: Iterable[str]) -> int:
    return len({fingerprint_state(state) for state in states})
