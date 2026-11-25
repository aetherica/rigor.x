"""Deterministic safeguards for bounded reasoning loops and progress tracking.
This module does not verify truth; it emits control signals for policy.
"""
from __future__ import annotations
import re
import unicodedata
from collections import deque
from dataclasses import dataclass
from enum import StrEnum
from hashlib import sha256
from typing import Iterable

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
    value = unicodedata.normalize("NFKC", state).casefold()
    value = re.sub(r"\\s+", " ", value).strip()
    value = re.sub(r"[\\W_]+", " ", value, flags=re.UNICODE)
    return re.sub(r"\\s+", " ", value).strip()

def fingerprint_state(state: str) -> str:
    normalized = normalize_state(state)
    if not normalized:
        raise ValueError("reasoning state must not be empty")
    return sha256(normalized.encode("utf-8")).hexdigest()

class ReasoningGuard:
    """Detect repeated normalized states, stalls and budget exhaustion."""
    def __init__(self, *, max_steps: int = 24, repeat_limit: int = 2,
                 stall_window: int = 5, min_progress_delta: float = 1e-6):
        if max_steps < 1 or repeat_limit < 1 or stall_window < 2:
            raise ValueError("budgets must be positive and stall_window >= 2")
        if min_progress_delta < 0:
            raise ValueError("min_progress_delta cannot be negative")
        self.max_steps, self.repeat_limit = max_steps, repeat_limit
        self.stall_window, self.min_progress_delta = stall_window, min_progress_delta
        self._counts: dict[str, int] = {}
        self._progress: deque[float] = deque(maxlen=stall_window)
        self._steps = 0
        self._best_progress: float | None = None

    def observe(self, state: str, *, progress: float | None = None) -> GuardDecision:
        if progress is not None:
            if not isinstance(progress, (int, float)) or progress != progress:
                raise ValueError("progress must be finite numeric")
            if progress in (float("inf"), float("-inf")):
                raise ValueError("progress must be finite")
        fingerprint = fingerprint_state(state)
        self._steps += 1
        repeats = self._counts.get(fingerprint, 0) + 1
        self._counts[fingerprint] = repeats
        if progress is not None:
            self._progress.append(float(progress))
            if self._best_progress is None or progress > self._best_progress:
                self._best_progress = float(progress)
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
        return GuardDecision(action, self._steps, fingerprint, repeats,
                            self._best_progress, reason)

    def _is_stalled(self) -> bool:
        if len(self._progress) < self.stall_window:
            return False
        values = list(self._progress)
        return max(values) - min(values) <= self.min_progress_delta

def distinct_fingerprints(states: Iterable[str]) -> int:
    return len({fingerprint_state(state) for state in states})
