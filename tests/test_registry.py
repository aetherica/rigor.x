from __future__ import annotations

import json
import unittest
from pathlib import Path

from rigorx.registry import RegistryCatalog, RegistryValidationError

ROOT = Path(__file__).resolve().parents[1]


class RegistryTests(unittest.TestCase):
    def load_catalog(self):
        return RegistryCatalog.load(
            ROOT / "registries/proposed-count-fit-architecture.v0.1.json",
            ROOT / "library/slash-commands/commands.json",
        )

    def test_repo_census_and_resolution(self):
        catalog = self.load_catalog()
        self.assertEqual(catalog.census, {
            "formulas": 30, "algorithms": 33, "topics": 111, "operators": 15,
            "functional_groups": 18, "knowledge_domains": 36, "slash_commands": 999,
        })
        self.assertEqual(catalog.resolve("KD-01").canonical_status, "PENDING_OWNER_RATIFICATION")
        command = catalog.resolve("SLC-0001")
        self.assertEqual(command.payload["name"], "/tldr")
        self.assertEqual(command.runtime_status, "not_implemented_in_rigor_x")

    def test_unknown_id_and_registry_rejected(self):
        catalog = self.load_catalog()
        with self.assertRaises(KeyError):
            catalog.resolve("NOT-A-REAL-ID")
        with self.assertRaises(KeyError):
            catalog.list_records("not-a-registry")

    def test_command_count_corruption_fails_closed(self):
        architecture = json.loads((ROOT / "registries/proposed-count-fit-architecture.v0.1.json").read_text())
        commands = json.loads((ROOT / "library/slash-commands/commands.json").read_text())
        commands["commands"].pop()
        with unittest.mock.patch("rigorx.registry._read_json", side_effect=[architecture, commands]):
            with self.assertRaisesRegex(RegistryValidationError, "exactly 999"):
                RegistryCatalog.load(Path("unused-arch"), Path("unused-cmd"))

    def test_duplicate_command_name_fails(self):
        architecture = json.loads((ROOT / "registries/proposed-count-fit-architecture.v0.1.json").read_text())
        commands = json.loads((ROOT / "library/slash-commands/commands.json").read_text())
        commands["commands"][1]["name"] = commands["commands"][0]["name"]
        with unittest.mock.patch("rigorx.registry._read_json", side_effect=[architecture, commands]):
            with self.assertRaisesRegex(RegistryValidationError, "duplicate command name"):
                RegistryCatalog.load(Path("unused-arch"), Path("unused-cmd"))


if __name__ == "__main__":
    unittest.main()
