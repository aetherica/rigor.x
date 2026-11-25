from __future__ import annotations

import io
import json
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from unittest.mock import patch

from rigorx.agent_runtime import ModelTurn
from rigorx.cli import main


class AgentCliTests(unittest.TestCase):
    def test_missing_endpoint_config_is_exit_two(self):
        with patch.dict("os.environ", {}, clear=True):
            out = io.StringIO()
            with redirect_stderr(out):
                code = main(["ask something"])
        self.assertEqual(code, 2)
        self.assertIn("RIGORX_MODEL_BASE_URL", out.getvalue())

    def test_invalid_database_path_returns_safe_error(self):
        with patch.dict("os.environ", {"RIGORX_MODEL_BASE_URL": "https://example.test/v1", "RIGORX_MODEL_NAME": "unit"}, clear=True):
            out = io.StringIO()
            with redirect_stderr(out):
                code = main(["--database", "/dev/null/child.sqlite", "question"])
        self.assertEqual(code, 2)
        self.assertIn("Configuration error", out.getvalue())
        self.assertRegex(out.getvalue(), r"Configuration error: \w+: \S")

    def test_cli_runs_pipeline_and_persists(self):
        with tempfile.TemporaryDirectory() as tmp, patch.dict("os.environ", {"RIGORX_MODEL_BASE_URL": "https://example.test/v1", "RIGORX_MODEL_NAME": "unit"}, clear=True), patch("rigorx.model_backend.OpenAICompatibleBackend.generate", return_value=ModelTurn(text="Test answer")):
            database = str(Path(tmp) / "runs.sqlite")
            out = io.StringIO()
            with redirect_stdout(out):
                code = main(["--database", database, "--run-id", "cli-run", "question"])
            self.assertTrue(Path(database).exists())
        self.assertEqual(code, 0)
        self.assertIn("Test answer", out.getvalue())
        self.assertIn("verified=True", out.getvalue())

    def test_json_mode_returns_pipeline_and_agent_receipt(self):
        with tempfile.TemporaryDirectory() as tmp, patch.dict("os.environ", {"RIGORX_MODEL_BASE_URL": "https://example.test/v1", "RIGORX_MODEL_NAME": "unit"}, clear=True), patch("rigorx.model_backend.OpenAICompatibleBackend.generate", return_value=ModelTurn(text="Answer")):
            out = io.StringIO()
            with redirect_stdout(out):
                code = main(["--json", "--database", str(Path(tmp) / "db.sqlite"), "question"])
        payload = json.loads(out.getvalue())
        self.assertEqual(code, 0)
        self.assertTrue(payload["verified"])
        self.assertEqual(payload["pipeline_status"], "COMPLETED")
        self.assertEqual(payload["agent_result"]["response"], "Answer")
        self.assertEqual(len(payload["artifacts"]), 11)


if __name__ == "__main__":
    unittest.main()
