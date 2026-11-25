"""Tests for deterministic loop/progress safeguards."""
import unittest
from rigorx.reasoning_guard import GuardAction, ReasoningGuard, distinct_fingerprints, fingerprint_state

class ReasoningGuardTests(unittest.TestCase):
    def test_normalization_case_and_whitespace(self):
        self.assertEqual(fingerprint_state("  Need   evidence "), fingerprint_state("need evidence"))
    def test_repeat_warning_then_stop(self):
        g = ReasoningGuard(max_steps=10, repeat_limit=2)
        self.assertEqual(g.observe("search source A").action, GuardAction.CONTINUE)
        self.assertEqual(g.observe("search source A").action, GuardAction.DIVERSIFY)
        self.assertEqual(g.observe("search source A").action, GuardAction.STOP_REPEATED_STATE)
    def test_hard_budget(self):
        g = ReasoningGuard(max_steps=2, repeat_limit=9)
        g.observe("one"); g.observe("two")
        self.assertEqual(g.observe("three").action, GuardAction.STOP_BUDGET)
    def test_stall_requires_full_window(self):
        g = ReasoningGuard(stall_window=3, max_steps=10)
        self.assertEqual(g.observe("a", progress=.2).action, GuardAction.CONTINUE)
        self.assertEqual(g.observe("b", progress=.2).action, GuardAction.CONTINUE)
        self.assertEqual(g.observe("c", progress=.2).action, GuardAction.STOP_STALLED)
    def test_progress_improvement(self):
        g = ReasoningGuard(stall_window=3, max_steps=10)
        g.observe("a", progress=.1); g.observe("b", progress=.1)
        self.assertEqual(g.observe("c", progress=.3).action, GuardAction.CONTINUE)
    def test_reject_nan(self):
        with self.assertRaises(ValueError): ReasoningGuard().observe("x", progress=float("nan"))
    def test_distinct_count(self):
        self.assertEqual(distinct_fingerprints(["A", " a ", "B"]), 2)

if __name__ == "__main__":
    unittest.main()
