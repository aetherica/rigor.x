from __future__ import annotations

import unittest

from rigorx.adaptive_router import AdaptiveLevel, AdaptiveRouter, TaskIntent


class AdaptiveRouterTests(unittest.TestCase):
    def setUp(self):
        self.router = AdaptiveRouter()

    def test_simple_information_routes_basic(self):
        profile = self.router.route("What is gravity?")
        self.assertEqual(profile.intent, TaskIntent.INFORMATION)
        self.assertEqual(profile.level, AdaptiveLevel.L01_BASIC)

    def test_dynamic_analysis_modes(self):
        profile = self.router.route("Compare the historical causes and quantitative impact of the policy.")
        self.assertIn("COMPARATIVE", profile.modes)
        self.assertIn("HISTORICAL", profile.modes)
        self.assertIn("CAUSAL", profile.modes)
        self.assertIn("QUANTITATIVE", profile.modes)

    def test_research_routes_deep(self):
        profile = self.router.route("Research the latest policy and verify sources.")
        self.assertEqual(profile.intent, TaskIntent.RESEARCH)
        self.assertEqual(profile.level, AdaptiveLevel.L03_DEEP)
        self.assertIn("evidence-validation", profile.methods)

    def test_high_risk_escalates_critical(self):
        profile = self.router.route("Review this medication decision.")
        self.assertEqual(profile.level, AdaptiveLevel.L05_CRITICAL)
        self.assertIn("independent-verification", profile.methods)

    def test_explicit_hyper_rigorous_signal(self):
        profile = self.router.route("Perform a hyper-rigorous adversarial audit.")
        self.assertEqual(profile.level, AdaptiveLevel.L06_HYPER_RIGOROUS)
        self.assertIn("adversarial-review", profile.methods)

    def test_slash_intensity_token_overrides_heuristic(self):
        profile = self.router.route("/l06 answer a simple question")
        self.assertEqual(profile.level, AdaptiveLevel.L06_HYPER_RIGOROUS)
        self.assertIn("SLASH_OVERRIDE:L06_HYPER_RIGOROUS", profile.signals)

    def test_user_override(self):
        profile = self.router.route("What is this?", override_level=AdaptiveLevel.L04_COMPLEX)
        self.assertEqual(profile.level, AdaptiveLevel.L04_COMPLEX)
        self.assertTrue(profile.explicit_override)

    def test_execution_route_includes_authorization_checks(self):
        profile = self.router.route("Execute and delete permanently after production system audit")
        self.assertEqual(profile.intent, TaskIntent.EXECUTION)
        self.assertIn("authorization", profile.methods)
        self.assertEqual(profile.level, AdaptiveLevel.L05_CRITICAL)

    def test_substrings_inside_other_words_do_not_set_intent(self):
        self.assertNotEqual(self.router.route("Explain the bookmark feature").intent, TaskIntent.EXECUTION)
        self.assertNotEqual(self.router.route("List the open resources").intent, TaskIntent.RESEARCH)
        self.assertNotEqual(self.router.route("What is the capital of France?").intent, TaskIntent.TECHNICAL)
        self.assertEqual(self.router.route("Describe an embankment").risk_score, 0)

    def test_whole_word_intents_still_detected(self):
        self.assertEqual(self.router.route("Please update my notes").intent, TaskIntent.EXECUTION)
        self.assertEqual(self.router.route("Debug this code").intent, TaskIntent.TECHNICAL)

    def test_slash_level_token_ignored_inside_url_path(self):
        profile = self.router.route("What is at example.com/critical?")
        self.assertNotIn("SLASH_OVERRIDE:L05_CRITICAL", profile.signals)

    def test_empty_prompt_rejected(self):
        with self.assertRaises(ValueError):
            self.router.route("")


if __name__ == "__main__":
    unittest.main()
