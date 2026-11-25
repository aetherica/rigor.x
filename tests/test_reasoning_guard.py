"""Unit and adversarial normalization tests for reasoning safeguards."""
import unittest

from rigorx.reasoning_guard import (
    GuardAction,
    ReasoningGuard,
    distinct_fingerprints,
    fingerprint_state,
    normalize_state,
)


class ReasoningGuardTests(unittest.TestCase):
    def test_normalization_case_whitespace_punctuation_and_unicode(self):
        self.assertEqual(fingerprint_state("  Need   evidence "), fingerprint_state("need evidence"))
        self.assertEqual(fingerprint_state("Need-evidence!"), fingerprint_state("NEED evidence"))
        self.assertEqual(fingerprint_state("ＣＡＳＥ"), fingerprint_state("case"))
        self.assertEqual(normalize_state("A__B"), "a b")

    def test_repeat_warning_then_stop(self):
        guard = ReasoningGuard(max_steps=10, repeat_limit=2)
        self.assertEqual(guard.observe("search source A").action, GuardAction.CONTINUE)
        self.assertEqual(guard.observe("search source A").action, GuardAction.DIVERSIFY)
        self.assertEqual(guard.observe("search source A").action, GuardAction.STOP_REPEATED_STATE)

    def test_hard_budget(self):
        guard = ReasoningGuard(max_steps=2, repeat_limit=9)
        self.assertEqual(guard.observe("one").action, GuardAction.CONTINUE)
        stopped = guard.observe("two")
        self.assertEqual(stopped.action, GuardAction.STOP_BUDGET)
        self.assertIs(guard.observe("three"), stopped)

    def test_stall_requires_full_window(self):
        guard = ReasoningGuard(stall_window=3, max_steps=10)
        self.assertEqual(guard.observe("a", progress=0.2).action, GuardAction.CONTINUE)
        self.assertEqual(guard.observe("b", progress=0.2).action, GuardAction.CONTINUE)
        self.assertEqual(guard.observe("c", progress=0.2).action, GuardAction.STOP_STALLED)

    def test_progress_improvement_prevents_stall(self):
        guard = ReasoningGuard(stall_window=3, max_steps=10)
        guard.observe("a", progress=0.1)
        guard.observe("b", progress=0.1)
        self.assertEqual(guard.observe("c", progress=0.3).action, GuardAction.CONTINUE)

    def test_reject_nan_and_infinity(self):
        for bad in (float("nan"), float("inf"), float("-inf")):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                ReasoningGuard().observe("x", progress=bad)

    def test_reject_bool_progress(self):
        with self.assertRaises(TypeError):
            ReasoningGuard().observe("x", progress=True)

    def test_reject_empty_and_non_string_states(self):
        with self.assertRaises(ValueError):
            fingerprint_state("  !!! ")
        with self.assertRaises(TypeError):
            normalize_state(123)  # type: ignore[arg-type]

    def test_terminal_stop_is_latched_until_reset(self):
        guard = ReasoningGuard(max_steps=2, repeat_limit=9)
        guard.observe("one")
        stopped = guard.observe("two")
        self.assertEqual(stopped.action, GuardAction.STOP_BUDGET)
        self.assertIs(guard.observe("three"), stopped)
        self.assertEqual(stopped.step_count, 2)
        guard.reset_episode()
        self.assertEqual(guard.observe("fresh").step_count, 1)

    def test_invalid_progress_threshold_types(self):
        for value in (True, "0.1"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                ReasoningGuard(min_progress_delta=value)
        for value in (True, 1.5):
            with self.subTest(value=value), self.assertRaises(TypeError):
                ReasoningGuard(max_steps=value)

    def test_distinct_count(self):
        self.assertEqual(distinct_fingerprints(["A", " a ", "B"]), 2)


if __name__ == "__main__":
    unittest.main()
