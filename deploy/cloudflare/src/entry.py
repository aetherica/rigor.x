"""RIGOR-X MCP server on Cloudflare Python Workers (WS31 phase P3 spike).

- The Worker serves MCP over stateless Streamable HTTP at ``/mcp``.
- Each owner's runs live in that owner's Durable Object (``OwnerRuns``), which
  runs the unchanged synchronous ``HostEngine`` on Durable Object SQL storage.
- CPU budget: the MCP app is built at import time, so Python Workers capture it
  in the deploy-time memory snapshot instead of rebuilding it per isolate. It
  does not touch bindings; the request's ``env`` reaches the RPC transport
  through a context variable. A build error therefore shows in the deploy log.
  The slash-command catalogue loads on first use.
- Spike authentication: a single shared bearer token (Worker secret
  ``RIGORX_SPIKE_TOKEN``) maps to one development owner. Phase P4 replaces this
  with OAuth sign-in (Google) in front of this Worker.
"""
from __future__ import annotations

import contextvars
import hashlib
import hmac
import traceback
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
_current_env: contextvars.ContextVar = contextvars.ContextVar("rigorx_env")


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


class _LazyCatalogEngine(HostEngine):
    """Loads the 999-entry catalogue on the first resolve_commands call, not at startup."""

    _catalog_loaded = False

    def resolve_commands(self, text):
        if not self._catalog_loaded:
            self._catalog_loaded = True
            try:
                self.command_catalog = SlashCommandCatalog.from_file(CATALOG_PATH)
            except Exception:  # noqa: BLE001 - optional; resolve_commands then reports it missing
                self.command_catalog = None
        return super().resolve_commands(text)


def build_app():
    from rigorx.mcp_server import build_server

    async def transport(owner_id, operation, payload_json):
        env = _current_env.get()
        name = hashlib.sha256(owner_id.encode("utf-8")).hexdigest()
        stub = env.OWNER_RUNS.get(env.OWNER_RUNS.idFromName(name))
        return str(await stub.call(owner_id, operation, payload_json))

    local = _LazyCatalogEngine(_NoStore())
    server = build_server(RemoteEngine(transport, local=local), owner_resolver=_current_owner.get)
    return server.streamable_http_app(streamable_http_path="/mcp", stateless_http=True)


APP = build_app()


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
        env_token = _current_env.set(self.env)
        try:
            return await asgi.fetch(APP, request, self.env)
        except Exception as exc:  # noqa: BLE001 - log the traceback for Workers Logs; return a safe message
            print("RIGORX_ERROR " + traceback.format_exc())
            return Response(f"Internal error: {type(exc).__name__}: {exc}"[:300], status=500)
        finally:
            _current_env.reset(env_token)
            _current_owner.reset(token)
