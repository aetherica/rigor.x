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

    def read(self, size=-1):
        return self.payload if size < 0 else self.payload[:size]


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

    def test_loopback_http_is_permitted(self):
        backend = OpenAICompatibleBackend(base_url="http://127.0.0.1:1234/v1", model="local")
        self.assertEqual(backend.model, "local")

    def test_url_credentials_are_rejected(self):
        with self.assertRaises(BackendConfigurationError):
            OpenAICompatibleBackend(base_url="https://user:pass@example.org/v1", model="x")

    def test_response_size_limit_is_enforced(self):
        backend = OpenAICompatibleBackend(base_url="https://example.org/v1", model="x", max_response_bytes=1024)
        with patch("rigorx.model_backend.urlopen", return_value=FakeResponse({"choices": [{"message": {"content": "x" * 2000}}]})), self.assertRaises(BackendConfigurationError):
            backend.generate([], [], timeout_seconds=1)

    def test_nonfinite_timeout_rejected(self):
        backend = OpenAICompatibleBackend(base_url="https://example.org/v1", model="x")
        with self.assertRaises(ValueError):
            backend.generate([], [], timeout_seconds=float("nan"))

    def test_remote_http_endpoint_rejected(self):
        with self.assertRaises(BackendConfigurationError):
            OpenAICompatibleBackend(base_url="http://remote.example", model="x")

    def test_redirects_are_not_followed_and_key_is_not_forwarded(self):
        import threading
        from http.server import BaseHTTPRequestHandler, HTTPServer

        seen: list[str | None] = []

        class Target(BaseHTTPRequestHandler):
            def do_POST(self):
                seen.append(self.headers.get("Authorization"))
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b"{}")

            do_GET = do_POST

            def log_message(self, *args):
                pass

        target = HTTPServer(("127.0.0.1", 0), Target)

        class Redirector(BaseHTTPRequestHandler):
            def do_POST(self):
                self.send_response(302)
                self.send_header("Location", f"http://127.0.0.1:{target.server_port}/x")
                self.end_headers()

            def log_message(self, *args):
                pass

        redirector = HTTPServer(("127.0.0.1", 0), Redirector)
        for server in (target, redirector):
            threading.Thread(target=server.serve_forever, daemon=True).start()
        self.addCleanup(lambda: [s.shutdown() or s.server_close() for s in (target, redirector)])
        backend = OpenAICompatibleBackend(base_url=f"http://127.0.0.1:{redirector.server_port}/v1", model="m", api_key="SECRET")
        with self.assertRaises(BackendConfigurationError) as raised:
            backend.generate([{"role": "user", "content": "hi"}], [], timeout_seconds=5)
        self.assertIn("302", str(raised.exception))
        self.assertEqual(seen, [])

    def test_http_error_details_are_redacted(self):
        backend = OpenAICompatibleBackend(base_url="https://example.org", model="x", api_key="secret")
        error = HTTPError("https://example.org", 401, "Unauthorized secret", {}, None)
        with patch("rigorx.model_backend.urlopen", side_effect=error), self.assertRaises(BackendConfigurationError) as raised:
            backend.generate([], [], timeout_seconds=1)
        self.assertNotIn("secret", str(raised.exception))
        self.assertIn("401", str(raised.exception))


if __name__ == "__main__":
    unittest.main()
