"""The TypeScript Worker's parity fixtures must still describe the Python engine."""
from __future__ import annotations

import importlib.util
import json
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "deploy" / "cloudflare-ts" / "scripts" / "parity_fixtures.py"


class TypeScriptParityFixtureTests(unittest.TestCase):
    def test_fixtures_match_python_engine(self):
        spec = importlib.util.spec_from_file_location("parity_fixtures", SCRIPT)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        committed = json.loads(module.OUT.read_text(encoding="utf-8"))
        self.assertEqual(committed, json.loads(json.dumps(module.build())), "regenerate with scripts/parity_fixtures.py")


if __name__ == "__main__":
    unittest.main()
