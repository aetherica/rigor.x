import unittest
from pathlib import Path
import importlib.util

SCRIPT = Path(__file__).resolve().parents[1] / "library" / "slash-commands" / "scripts" / "validate_functional_group_crosswalk.py"
spec = importlib.util.spec_from_file_location("crosswalk_validator", SCRIPT)
validator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(validator)


class CrosswalkTests(unittest.TestCase):
    def test_validator_passes_current_files(self):
        validator.validate()

    def test_canonical_count_and_order(self):
        data = validator.load(validator.FG_FILE)["functional_groups"]
        self.assertEqual(len(data), 18)
        self.assertEqual([g["id"] for g in data], [f"FG-{i:02d}" for i in range(1, 19)])

    def test_all_candidate_groups_have_mapping(self):
        groups = validator.load(validator.GROUPS_FILE)
        crosswalk = validator.load(validator.CROSSWALK_FILE)
        self.assertEqual({g["id"] for g in groups}, {m["library_group_id"] for m in crosswalk["mappings"]})

    def test_mapping_is_non_activating(self):
        data = validator.load(validator.CROSSWALK_FILE)
        self.assertEqual(data["status"], "proposed_taxonomy_alignment_not_command_activation")


if __name__ == "__main__":
    unittest.main()
