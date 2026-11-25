import copy
import importlib.util
from pathlib import Path
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "library" / "slash-commands" / "scripts" / "validate_functional_group_crosswalk.py"
spec = importlib.util.spec_from_file_location("crosswalk_validator", SCRIPT)
validator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(validator)


def documents():
    return tuple(
        validator.load(path)
        for path in (validator.FG_FILE, validator.CROSSWALK_FILE, validator.MANIFEST_FILE, validator.GROUPS_FILE)
    )


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

    def test_rejects_non_object_functional_group(self):
        fg, xw, manifest, groups = documents()
        fg["functional_groups"][0] = "not-a-record"
        with self.assertRaisesRegex(ValueError, "entries must be objects"):
            validator.validate_data(fg, xw, manifest, groups)

    def test_rejects_duplicate_functional_group_names(self):
        fg, xw, manifest, groups = documents()
        fg["functional_groups"][1]["name"] = fg["functional_groups"][0]["name"]
        with self.assertRaisesRegex(ValueError, "unique and non-empty"):
            validator.validate_data(fg, xw, manifest, groups)

    def test_rejects_crosswalk_targets_not_array(self):
        fg, xw, manifest, groups = documents()
        xw["mappings"][0]["functional_group_ids"] = "FG-01"
        with self.assertRaisesRegex(ValueError, "expected a non-empty array"):
            validator.validate_data(fg, xw, manifest, groups)

    def test_rejects_unknown_crosswalk_target(self):
        fg, xw, manifest, groups = documents()
        xw["mappings"][0]["functional_group_ids"] = ["FG-99"]
        with self.assertRaisesRegex(ValueError, "invalid FG targets"):
            validator.validate_data(fg, xw, manifest, groups)

    def test_rejects_duplicate_crosswalk_targets(self):
        fg, xw, manifest, groups = documents()
        xw["mappings"][0]["functional_group_ids"] = ["FG-01", "FG-01"]
        with self.assertRaisesRegex(ValueError, "invalid FG targets"):
            validator.validate_data(fg, xw, manifest, groups)

    def test_rejects_duplicate_mapping_records(self):
        fg, xw, manifest, groups = documents()
        xw["mappings"].append(copy.deepcopy(xw["mappings"][0]))
        with self.assertRaisesRegex(ValueError, "duplicate mappings"):
            validator.validate_data(fg, xw, manifest, groups)

    def test_rejects_mapping_coverage_gap(self):
        fg, xw, manifest, groups = documents()
        xw["mappings"].pop()
        with self.assertRaisesRegex(ValueError, "coverage mismatch"):
            validator.validate_data(fg, xw, manifest, groups)


if __name__ == "__main__":
    unittest.main()
