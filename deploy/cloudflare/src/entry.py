"""RIGOR-X MCP server on Cloudflare Python Workers (WS31 phase P3 spike).

- The Worker serves MCP over stateless Streamable HTTP at ``/mcp``.
- Each owner's runs live in that owner's Durable Object (``OwnerRuns``), which
  runs the unchanged synchronous ``HostEngine`` on Durable Object SQL storage.
- Spike authentication: a single shared bearer token (Worker secret
  ``RIGORX_SPIKE_TOKEN``) maps to one development owner. Phase P4 replaces this
  with OAuth sign-in (Google) in front of this Worker.
"""
from __future__ import annotations

import contextvars
import hashlib
import hmac
from pathlib import Path
from urllib.parse import urlparse

from workers import DurableObject, Response, WorkerEntrypoint, asgi

from rigorx.do_store import DurableObjectRunStore
from rigorx.engine_rpc import RemoteEngine, dispatch
from rigorx.host_engine import HostEngine
from rigorx.slash_commands import SlashCommandCatalog

CATALOG_PATH = Path(__file__).parent / "data" / "commands.json"
SPIKE_OWNER = "spike:dev"
_current_owner: contextvars.ContextVar[str | None] = contextvars.ContextVar("rigorx_owner", default=None)


class OwnerRuns(DurableObject):
    """One instance per owner; holds that owner's runs and ledgers."""

    def __init__(self, ctx, env):
        super().__init__(ctx, env)
        self.engine = HostEngine(DurableObjectRunStore(self.ctx.storage.sql))

    async def call(self, owner_id, operation, payload_json):
        return dispatch(self.engine, str(owner_id), str(operation), str(payload_json))


class _NoStore:
    """The Worker's local engine only serves stateless tools; it never stores runs."""

    def _refuse(self, *_args, **_kwargs):
        raise RuntimeError("Run storage is only available inside the owner's Durable Object")

    create = load = save = delete = _refuse


def _load_catalog():
    try:
        return SlashCommandCatalog.from_file(CATALOG_PATH)
    except Exception:  # noqa: BLE001 - the catalogue is optional; resolve_commands reports it missing
        return None


def build_app(env):
    from rigorx.mcp_server import build_server

    async def transport(owner_id, operation, payload_json):
        name = hashlib.sha256(owner_id.encode("utf-8")).hexdigest()
        stub = env.OWNER_RUNS.get(env.OWNER_RUNS.idFromName(name))
        return str(await stub.call(owner_id, operation, payload_json))

    local = HostEngine(_NoStore(), command_catalog=_load_catalog())
    server = build_server(RemoteEngine(transport, local=local), owner_resolver=_current_owner.get)
    return server.streamable_http_app(streamable_http_path="/mcp", stateless_http=True)


def _owner_from(request, env):
    """Return (owner, error_response). No header: anonymous (stateless tools only)."""
    header = request.headers.get("Authorization")
    if not header:
        return None, None
    expected = getattr(env, "RIGORX_SPIKE_TOKEN", None)
    if not expected:
        return None, Response("Server token is not configured", status=503)
    scheme, _, token = str(header).partition(" ")
    if scheme.lower() != "bearer" or not hmac.compare_digest(token.encode("utf-8"), str(expected).encode("utf-8")):
        return None, Response("Invalid token", status=401, headers={"WWW-Authenticate": "Bearer"})
    return SPIKE_OWNER, None


class Default(WorkerEntrypoint):
    def __init__(self, ctx, env):
        super().__init__(ctx, env)
        self.app = build_app(env)

    async def fetch(self, request):
        path = urlparse(request.url).path
        if path == "/" and request.method == "GET":
            return Response("RIGOR-X MCP server (spike). MCP endpoint: POST /mcp")
        if path != "/mcp" or request.method != "POST":
            return Response("Not found", status=404)
        owner, error = _owner_from(request, self.env)
        if error is not None:
            return error
        token = _current_owner.set(owner)
        try:
            return await asgi.fetch(self.app, request, self.env)
        finally:
            _current_owner.reset(token)
