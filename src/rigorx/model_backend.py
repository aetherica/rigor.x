"""OpenAI-compatible Chat Completions transport using Python's standard library.

Use an explicitly configured endpoint and credential. API keys are never logged.
"""
from __future__ import annotations

import ipaddress
import json
import os
from collections.abc import Mapping, Sequence
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

from .agent_runtime import ModelTurn, ToolCall


class BackendConfigurationError(ValueError):
    """Backend configuration or transport failure, with secrets redacted."""


class OpenAICompatibleBackend:
    def __init__(
        self,
        *,
        base_url: str,
        model: str,
        api_key: str | None = None,
        api_key_env: str = "RIGORX_API_KEY",
        max_tokens: int = 2048,
        max_response_bytes: int = 5_000_000,
    ) -> None:
        try:
            parsed = urlsplit(base_url)
            hostname = parsed.hostname
            if not parsed.scheme or not hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
                raise BackendConfigurationError("Endpoint URL must be absolute and contain no userinfo, query or fragment")
            loopback = hostname.casefold() == "localhost"
            try:
                loopback = loopback or ipaddress.ip_address(hostname).is_loopback
            except ValueError:
                pass
            if parsed.scheme != "https" and not (parsed.scheme == "http" and loopback):
                raise BackendConfigurationError("Remote model endpoints must use HTTPS")
        except ValueError as exc:
            if isinstance(exc, BackendConfigurationError):
                raise
            raise BackendConfigurationError("Invalid model endpoint URL") from None
        if not model.strip():
            raise BackendConfigurationError("model is required")
        if isinstance(max_tokens, bool) or not isinstance(max_tokens, int) or max_tokens < 1:
            raise BackendConfigurationError("max_tokens must be a positive integer")
        if isinstance(max_response_bytes, bool) or not isinstance(max_response_bytes, int) or max_response_bytes < 1024:
            raise BackendConfigurationError("max_response_bytes must be an integer of at least 1024")
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.api_key = api_key or os.environ.get(api_key_env)
        self.max_tokens = max_tokens
        self.max_response_bytes = max_response_bytes

    def generate(self, messages: Sequence[Mapping[str, Any]], tools: Sequence[Mapping[str, Any]], *, timeout_seconds: float) -> ModelTurn:
        if isinstance(timeout_seconds, bool) or not isinstance(timeout_seconds, (int, float)) or not math.isfinite(timeout_seconds) or timeout_seconds <= 0:
            raise ValueError("timeout_seconds must be finite and positive")
        payload: dict[str, Any] = {"model": self.model, "messages": list(messages), "max_tokens": self.max_tokens}
        if tools:
            payload["tools"] = list(tools)
            payload["tool_choice"] = "auto"
        body = json.dumps(payload, ensure_ascii=False, allow_nan=False).encode("utf-8")
        headers = {"Content-Type": "application/json", "Accept": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        request = Request(f"{self.base_url}/chat/completions", data=body, headers=headers, method="POST")
        try:
            with urlopen(request, timeout=float(timeout_seconds)) as response:
                raw = response.read(self.max_response_bytes + 1)
            if len(raw) > self.max_response_bytes:
                raise BackendConfigurationError("Model response exceeds configured size limit")
            data = json.loads(raw)
        except HTTPError as exc:
            raise BackendConfigurationError(f"Model HTTP status {exc.code}") from None
        except URLError as exc:
            raise BackendConfigurationError(f"Model transport error: {type(exc.reason).__name__}") from None
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            raise BackendConfigurationError(f"Invalid model response: {type(exc).__name__}") from None
        if not isinstance(data, dict):
            raise BackendConfigurationError("Model response must be an object")
        choices = data.get("choices")
        if not isinstance(choices, list) or not choices:
            raise BackendConfigurationError("Response contains no choices")
        choice = choices[0]
        if not isinstance(choice, dict):
            raise BackendConfigurationError("Choice must be an object")
        message = choice.get("message") or {}
        if not isinstance(message, dict):
            raise BackendConfigurationError("Message must be an object")
        content = message.get("content")
        text = content if isinstance(content, str) else ""
        calls: list[ToolCall] = []
        for call in message.get("tool_calls") or []:
            if not isinstance(call, dict):
                continue
            fn = call.get("function") or {}
            if not isinstance(fn, dict):
                continue
            try:
                args = json.loads(fn.get("arguments") or "{}")
            except json.JSONDecodeError:
                args = {"_malformed_arguments": str(fn.get("arguments", ""))}
            if not isinstance(args, dict):
                args = {"_invalid_arguments_type": type(args).__name__}
            calls.append(ToolCall(str(call.get("id") or ""), str(fn.get("name") or ""), args))
        return ModelTurn(text=text, tool_calls=tuple(calls), finish_reason=str(choice.get("finish_reason", "stop")))
