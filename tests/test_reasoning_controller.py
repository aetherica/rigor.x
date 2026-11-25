"""WS19 controller and selector tests."""
import unittest

from rigorx.reasoning_controller import (
    ControllerAction,
    Mechanism,
    MechanismSelector,
    ReasoningController,
    SemanticLoopMonitor,
    TaskKind,
    TaskProfile,
    token_jaccard,
)


class SemanticTests(unittest.TestCase):
    def test_jaccard(self):
        self.assertEqual(token_jaccard("a b c","a b c"),1.0)
        self.assertEqual(token_jaccard("a b","x y"),0.0)
    def test_signal_is_advisory(self):
        m=SemanticLoopMonitor(window=3,threshold=.8,min_tokens=3)
        m.observe("alpha beta gamma delta")
        s=m.observe("alpha beta gamma delta changed")
        self.assertTrue(s.advisory_only)
    def test_short_states_not_flagged(self):
        m=SemanticLoopMonitor(min_tokens=5); m.observe("yes no")
        self.assertIsNone(m.observe("yes no"))
    def test_validation(self):
        for kwargs in ({"window":1},{"threshold":float("nan")}):
            with self.assertRaises(ValueError): SemanticLoopMonitor(**kwargs)
        with self.assertRaises(ValueError): SemanticLoopMonitor().observe(" ")
class SelectorTests(unittest.TestCase):
    def test_research(self):
        p=MechanismSelector().select(TaskProfile(task_kind=TaskKind.RESEARCH,evidence_required=True))
        self.assertIn(Mechanism.EVIDENCE_SEARCH,(p.primary,*p.supporting))
    def test_causal(self):
        p=MechanismSelector().select(TaskProfile(task_kind=TaskKind.CAUSAL))
        self.assertIn(Mechanism.CAUSAL_COUNTERFACTUAL,(p.primary,*p.supporting))
    def test_decision(self):
        p=MechanismSelector().select(TaskProfile(task_kind=TaskKind.DECISION,risk=.7))
        self.assertIn(Mechanism.CONSTRAINT_OPTIMIZATION,(p.primary,*p.supporting))
    def test_unavailable_capability(self):
        p=MechanismSelector().select(TaskProfile(task_kind=TaskKind.RESEARCH,
            available_mechanisms=frozenset({Mechanism.STRUCTURED_DECOMPOSITION})))
        self.assertTrue(p.capability_gaps)
        self.assertNotIn(Mechanism.EVIDENCE_SEARCH,(p.primary,*p.supporting))
    def test_profile_limits(self):
        with self.assertRaises(ValueError): TaskProfile(intensity=7)
        with self.assertRaises(ValueError): TaskProfile(risk=1.5)
        with self.assertRaises(TypeError): TaskProfile(intensity=True)
        with self.assertRaises(TypeError): TaskProfile(task_kind="RESEARCH")
class ControllerTests(unittest.TestCase):
    def test_exact_repeat(self):
        c=ReasoningController(max_steps=8,repeat_limit=2)
        self.assertEqual(c.observe("repeat").action,ControllerAction.CONTINUE)
        self.assertEqual(c.observe("repeat").action,ControllerAction.DIVERSIFY)
        self.assertEqual(c.observe("repeat").action,ControllerAction.STOP_LOOP_SIGNAL)
    def test_first_semantic_signal_diversifies(self):
        c=ReasoningController(max_steps=20,repeat_limit=5,semantic_threshold=.8,recovery_budget=1)
        c.observe("reasoning state contains enough tokens for comparison")
        r=c.observe("reasoning state contains enough tokens for comparison changed")
        self.assertEqual(r.action,ControllerAction.DIVERSIFY); self.assertEqual(r.recovery_attempts,1)
    def test_recovery_budget_exhaustion(self):
        c=ReasoningController(max_steps=20,repeat_limit=5,semantic_threshold=.65,recovery_budget=1)
        c.observe("alpha beta gamma delta epsilon zeta eta theta")
        self.assertEqual(c.observe("alpha beta gamma delta epsilon zeta eta theta changed").action,ControllerAction.DIVERSIFY)
        self.assertEqual(c.observe("alpha beta gamma delta epsilon zeta eta theta changed again").action,ControllerAction.STOP_LOOP_SIGNAL)
    def test_step_budget(self):
        c=ReasoningController(max_steps=1,repeat_limit=8)
        stopped=c.observe("one")
        self.assertEqual(stopped.action,ControllerAction.STOP_BUDGET)
        self.assertIs(c.observe("two"),stopped)
    def test_terminal_receipt_is_latched(self):
        c=ReasoningController(max_steps=1,repeat_limit=9)
        stopped=c.observe("first")
        self.assertEqual(stopped.action,ControllerAction.STOP_BUDGET)
        self.assertIs(c.observe("second"),stopped)
        self.assertEqual(stopped.step,1)

    def test_reset_episode_clears_monitor_and_budget(self):
        c=ReasoningController(max_steps=20,repeat_limit=5,semantic_threshold=.6,recovery_budget=1)
        c.observe("a b c d e f g h")
        triggered=c.observe("a b c d e f g h modified")
        self.assertEqual(triggered.recovery_attempts,1)
        c.reset_episode()
        fresh=c.observe("fresh episode has distinct tokens and context")
        self.assertEqual(fresh.step,1)
        self.assertEqual(fresh.recovery_attempts,0)
        self.assertIsNone(fresh.semantic_signal)

    def test_no_available_mechanisms_does_not_claim_fallback(self):
        plan=MechanismSelector().select(TaskProfile(available_mechanisms=frozenset()))
        self.assertIsNone(plan.primary)
        self.assertEqual(plan.supporting,())
        self.assertTrue(plan.capability_gaps)

    def test_semantic_signal_uses_absolute_prior_step(self):
        monitor=SemanticLoopMonitor(window=3,threshold=.8,min_tokens=3)
        monitor.observe("alpha beta gamma delta")
        signal=monitor.observe("alpha beta gamma delta modified")
        self.assertEqual(signal.compared_state,1)
        monitor.observe("unrelated phrase with enough tokens here")
        signal=monitor.observe("alpha beta gamma delta modified again")
        self.assertEqual(signal.compared_state,2)
if __name__=="__main__": unittest.main()
