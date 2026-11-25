"""Engine RPC between a stateless front end and per-owner engine hosts (WS31, P3).

On Cloudflare, the MCP Worker is stateless and each owner's runs live in that
owner's Durable Object. The Worker uses ``RemoteEngine``; the Durable Object
answers with ``dispatch``. Messages are JSON strings so nothing depends on how
the runtime converts objects across the RPC boundary.

Only the run operations listed in ``RUN_OPERATIONS`` can be called remotely.
``route`` and ``resolve_commands`` store nothing and run in the front end.
"""
from __future__ import annotations

import json
from collections.abc import Awaitable, Callable
from typing import Any

from .host_engine import EngineError, HostEngine

RUN_OPERATIONS = frozenset({
    "start_run",
    "get_run",
    "submit_stage",
    "record_evidence",
    "report_action",
    "verify",
    "reenter",
    "cancel_run",
    "delete_run",
})

Transport = Callable[[str, str, str], Awaitable[str]]
"""``transport(owner_id, operation, payload_json) -> response_json``."""


class RemoteEngineError(EngineError):
    """An engine error reported by the remote engine host."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


def dispatch(engine: HostEngine, owner_id: str, operation: str, payload_json: str) -> str:
    """Run one operation on the engine host; always returns a JSON envelope."""
    try:
        if operation not in RUN_OPERATIONS:
            raise EngineError(f"Unknown operation: {operation!r}")
        payload = json.loads(payload_json)
        if not isinstance(payload, dict):
            raise EngineError("Payload must be a JSON object")
        result = getattr(engine, operation)(owner_id, **payload)
        return json.dumps({"ok": True, "result": result}, ensure_ascii=False, allow_nan=False)
    except EngineError as exc:
        return json.dumps({"ok": False, "code": exc.code, "message": str(exc)}, ensure_ascii=False)
    except (TypeError, ValueError) as exc:  # bad arguments or malformed JSON
        return json.dumps({"ok": False, "code": "INVALID_REQUEST", "message": type(exc).__name__}, ensure_ascii=False)


class RemoteEngine:
    """Async stand-in for ``HostEngine`` whose run operations go through a transport."""

    def __init__(self, transport: Transport, *, local: HostEngine) -> None:
        self._transport = transport
        self._local = local

    def route(self, task: str) -> dict[str, Any]:
        return self._local.route(task)

    def resolve_commands(self, text: str) -> dict[str, Any]:
        return self._local.resolve_commands(text)

    async def _call(self, owner_id: str, operation: str, **payload: Any) -> dict[str, Any]:
        response = json.loads(await self._transport(owner_id, operation, json.dumps(payload, ensure_ascii=False)))
        if not response.get("ok"):
            raise RemoteEngineError(response.get("code", "ENGINE_ERROR"), response.get("message", "Engine error"))
        return response["result"]

    async def start_run(self, owner_id: str, task: str) -> dict[str, Any]:
        return await self._call(owner_id, "start_run", task=task)

    async def get_run(self, owner_id: str, run_id: str) -> dict[str, Any]:
        return await self._call(owner_id, "get_run", run_id=run_id)

    async def submit_stage(self, owner_id: str, run_id: str, **kwargs: Any) -> dict[str, Any]:
        return await self._call(owner_id, "submit_stage", run_id=run_id, **kwargs)

    async def record_evidence(self, owner_id: str, run_id: str, **kwargs: Any) -> dict[str, Any]:
        return await self._call(owner_id, "record_evidence", run_id=run_id, **kwargs)

    async def report_action(self, owner_id: str, run_id: str, **kwargs: Any) -> dict[str, Any]:
        return await self._call(owner_id, "report_action", run_id=run_id, **kwargs)

    async def verify(self, owner_id: str, run_id: str, **kwargs: Any) -> dict[str, Any]:
        return await self._call(owner_id, "verify", run_id=run_id, **kwargs)

    async def reenter(self, owner_id: str, run_id: str, **kwargs: Any) -> dict[str, Any]:
        return await self._call(owner_id, "reenter", run_id=run_id, **kwargs)

    async def cancel_run(self, owner_id: str, run_id: str, **kwargs: Any) -> dict[str, Any]:
        return await self._call(owner_id, "cancel_run", run_id=run_id, **kwargs)

    async def delete_run(self, owner_id: str, run_id: str) -> dict[str, Any]:
        return await self._call(owner_id, "delete_run", run_id=run_id)
