from __future__ import annotations

import json
import unittest
from unittest.mock import patch
from urllib.error import HTTPError

from rigorx.model_backend import BackendConfigurationError, OpenAICompatibleBackend


class FakeResponse:
    status = 200

    def __init__(self, payload):
        self.payload = json.dumps(payload).encode()

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return None

    def read(self):
        return self.payload


class ModelBackendTests(unittest.TestCase):
    def test_parses_text_completion(self):
        response = {"choices": [{"message": {"content": "answer"}, "finish_reason": "stop"}]}
        backend = OpenAICompatibleBackend(base_url="https://example.org/v1", model="test")
        with patch("rigorx.model_backend.urlopen", return_value=FakeResponse(response)):
            result = backend.generate([], [], timeout_seconds=2)
        self.assertEqual(result.text, "answer")
        self.assertFalse(result.tool_calls)

    def test_parses_function_tool_call(self):
        response = {"choices": [{"message": {"content": None, "tool_calls": [{
            "id": "tc-1", "function": {"name": "read", "arguments": '{"id":3}'}
        }]}, "finish_reason": "tool_calls"}]}
        backend = OpenAICompatibleBackend(base_url="https://example.org/v1", model="test", api_key="secret")
        with patch("rigorx.model_backend.urlopen", return_value=FakeResponse(response)) as mock:
            result = backend.generate([], [{"type": "function"}], timeout_seconds=4)
        self.assertEqual(result.tool_calls[0].arguments, {"id": 3})
        request = mock.call_args.args[0]
        self.assertEqual(request.full_url, "https://example.org/v1/chat/completions")
        self.assertEqual(request.get_header("Authorization"), "Bearer secret")

    def test_remote_http_endpoint_rejected(self):
        with self.assertRaises(BackendConfigurationError):
            OpenAICompatibleBackend(base_url="http://remote.example", model="x")

    def test_http_error_details_are_redacted(self):
        backend = OpenAICompatibleBackend(base_url="https://example.org", model="x", api_key="secret")
        error = HTTPError("https://example.org", 401, "Unauthorized secret", {}, None)
        with patch("rigorx.model_backend.urlopen", side_effect=error):
            with self.assertRaises(BackendConfigurationError) as raised:
                backend.generate([], [], timeout_seconds=1)
        self.assertNotIn("secret", str(raised.exception))
        self.assertIn("401", str(raised.exception))


if __name__ == "__main__":
    unittest.main()
