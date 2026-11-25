from __future__ import annotations

import unittest
from pathlib import Path

from rigorx.slash_commands import SlashCatalogError, SlashCommandCatalog


class SlashCommandCatalogTests(unittest.TestCase):
    def test_repository_corpus_loads_all_999(self):
        path = Path(__file__).resolve().parents[1] / "library" / "slash-commands" / "commands.json"
        catalog = SlashCommandCatalog.from_file(path)
        self.assertEqual(len(catalog), 999)
        self.assertIsNotNone(catalog.resolve("/tldr"))

    def test_macro_applies_as_user_modifier(self):
        catalog = SlashCommandCatalog([{
            "id": "SLC-0001", "name": "/brief", "description": "Summarize concisely",
            "classification": "MACRO", "group_id": "g", "aliases_or_equivalents": [],
            "lifecycle_status": "candidate", "runtime_status": "not_implemented_in_rigor_x",
        }], expected_count=1)
        resolved = catalog.resolve_prompt("/brief Explain the result")
        self.assertEqual(resolved.applied_modifiers, ("/brief: Summarize concisely",))
        self.assertIn("Explain the result", resolved.effective_prompt)
        self.assertNotIn("/brief", resolved.effective_prompt)

    def test_alias_resolution(self):
        catalog = SlashCommandCatalog([{
            "id": "SLC-0001", "name": "/summarize", "description": "Summarize",
            "classification": "MACRO ALIAS", "group_id": "g", "aliases_or_equivalents": ["/tldr"],
            "lifecycle_status": "candidate", "runtime_status": "not_implemented_in_rigor_x",
        }], expected_count=1)
        self.assertEqual(catalog.resolve("/tldr").name, "/summarize")

    def test_native_command_is_preserved_not_executed(self):
        catalog = SlashCommandCatalog([{
            "id": "SLC-0001", "name": "/native", "description": "Native feature",
            "classification": "NATIVE", "group_id": "g", "aliases_or_equivalents": [],
            "lifecycle_status": "candidate", "runtime_status": "not_implemented_in_rigor_x",
        }], expected_count=1)
        resolved = catalog.resolve_prompt("/native do it")
        self.assertEqual(resolved.pass_through_commands, ("/native",))
        self.assertIn("/native do it", resolved.effective_prompt)
        self.assertIn("not executed", resolved.effective_prompt)

    def test_unknown_command_is_kept(self):
        catalog = SlashCommandCatalog([{
            "id": "SLC-0001", "name": "/known", "description": "Known",
            "classification": "MACRO", "group_id": "g", "aliases_or_equivalents": [],
            "lifecycle_status": "candidate", "runtime_status": "not_implemented_in_rigor_x",
        }], expected_count=1)
        resolved = catalog.resolve_prompt("/unknown do task")
        self.assertEqual(resolved.unknown_commands, ("/unknown",))
        self.assertIn("/unknown do task", resolved.effective_prompt)

    def test_alias_collision_rejected(self):
        one = {
            "id": "SLC-0001", "name": "/one", "description": "x",
            "classification": "MACRO", "group_id": "g", "aliases_or_equivalents": ["/two"],
            "lifecycle_status": "candidate", "runtime_status": "not_implemented_in_rigor_x",
        }
        two = {**one, "id": "SLC-0002", "name": "/two", "aliases_or_equivalents": []}
        with self.assertRaises(SlashCatalogError):
            SlashCommandCatalog([one, two], expected_count=2)

    def test_duplicate_id_rejected(self):
        row = {
            "id": "SLC-0001", "name": "/one", "description": "x",
            "classification": "MACRO", "group_id": "g", "aliases_or_equivalents": [],
            "lifecycle_status": "candidate", "runtime_status": "not_implemented_in_rigor_x",
        }
        duplicate = {**row, "name": "/two"}
        with self.assertRaises(SlashCatalogError):
            SlashCommandCatalog([row, duplicate], expected_count=2)

    def test_count_mismatch_rejected(self):
        with self.assertRaises(SlashCatalogError):
            SlashCommandCatalog([], expected_count=999)


if __name__ == "__main__":
    unittest.main()
