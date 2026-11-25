from __future__ import annotations

import subprocess
import sys
import unittest

import rigorx


class PackageVersionTests(unittest.TestCase):
    def test_version_is_040(self):
        self.assertEqual(rigorx.__version__, "0.4.0.dev0")

    def test_cli_reports_version_json(self):
        result = subprocess.run([sys.executable, "-m", "rigorx.version_cli"], capture_output=True, text=True, check=True)
        self.assertIn('"version": "0.4.0.dev0"', result.stdout)


if __name__ == "__main__":
    unittest.main()
