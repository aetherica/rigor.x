from __future__ import annotations

import unittest
from pathlib import Path

from rigorx.domain_router import DomainCatalog, DomainCatalogError, DomainRouter


class DomainRouterTests(unittest.TestCase):
    def setUp(self):
        path = Path(__file__).resolve().parents[1] / "library" / "knowledge-domains" / "domains.json"
        self.catalog = DomainCatalog.from_file(path)
        self.router = DomainRouter(self.catalog)

    def test_inventory_has_36_records_and_pending_provenance(self):
        self.assertEqual(len(self.catalog.domains), 36)
        self.assertEqual(self.catalog.source_status, "HISTORICAL_ASSISTANT_RECORD")
        self.assertEqual(self.catalog.canonical_status, "PENDING_OWNER_RATIFICATION")

    def test_contextual_activation_only_matches_relevant_domains(self):
        activated = self.router.activate("Assess RMG supply chain, economics, negotiation and finance.")
        ids = {d.domain_id for d in activated}
        self.assertIn("KD-31", ids)
        self.assertIn("KD-09", ids)
        self.assertIn("KD-11", ids)
        self.assertIn("KD-10", ids)
        self.assertLess(len(activated), 36)

    def test_activation_is_bounded(self):
        router = DomainRouter(self.catalog, max_activations=2)
        activated = router.activate("strategy, finance, law, psychology, operations, innovation")
        self.assertLessEqual(len(activated), 2)

    def test_no_keyword_match_returns_empty(self):
        self.assertEqual(self.router.activate("qzxv"), ())

    def test_empty_input_rejected(self):
        with self.assertRaises(ValueError):
            self.router.activate("")

    def test_incomplete_registry_rejected(self):
        data = {"inventory_count": 36, "domains": []}
        with self.assertRaises(DomainCatalogError):
            DomainCatalog(data)


if __name__ == "__main__":
    unittest.main()
