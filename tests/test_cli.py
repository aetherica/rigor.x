from __future__ import annotations

import io
import json
import unittest
from contextlib import redirect_stderr, redirect_stdout
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

    def test_cli_calls_backend_and_prints_response(self):
        with (
            patch.dict("os.environ", {"RIGORX_MODEL_BASE_URL": "https://example.test/v1", "RIGORX_MODEL_NAME": "unit"}, clear=True),
            patch("rigorx.model_backend.OpenAICompatibleBackend.generate", return_value=ModelTurn(text="Test answer")),
        ):
            out = io.StringIO()
            with redirect_stdout(out):
                code = main(["question"])
        self.assertEqual(code, 0)
        self.assertIn("Test answer", out.getvalue())
        self.assertIn("COMPLETED", out.getvalue())

    def test_json_mode_returns_receipt_structure(self):
        with (
            patch.dict("os.environ", {"RIGORX_MODEL_BASE_URL": "https://example.test/v1", "RIGORX_MODEL_NAME": "unit"}, clear=True),
            patch("rigorx.model_backend.OpenAICompatibleBackend.generate", return_value=ModelTurn(text="Answer")),
        ):
            out = io.StringIO()
            with redirect_stdout(out):
                code = main(["--json", "question"])
        payload = json.loads(out.getvalue())
        self.assertEqual(code, 0)
        self.assertEqual(payload["status"], "COMPLETED")
        self.assertEqual(payload["response"], "Answer")


if __name__ == "__main__":
    unittest.main()
