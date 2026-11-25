"""MCP adapter for the RIGOR-X host engine (WS31, phase P2).

Exposes ``HostEngine`` as MCP tools using the official MCP Python SDK
(optional dependency: ``pip install 'rigor-x-core[mcp]'``).

Owner identity comes from, in order: an injected resolver (tests and custom
hosts), the verified OAuth access token (issuer + subject), or a fixed local
owner for single-user development. Remote multi-user deployment requires the
authentication layer of phase P4; until then the HTTP transport refuses to bind
to non-loopback addresses.
"""
from __future__ import annotations

import argparse
import getpass
import inspect
import ipaddress
import os
import sys
from collections.abc import Awaitable, Callable
from hashlib import sha256
from pathlib import Path
from typing import TYPE_CHECKING, Any

from . import __version__
from .host_engine import EngineError, HostEngine

if TYPE_CHECKING:  # pragma: no cover
    from mcp.server import MCPServer

OwnerResolver = Callable[[], str | None]

SERVER_INSTRUCTIONS = (
    "RIGOR-X is a control-plane engine for rigorous multi-step work. For a non-trivial task, call "
    "rigorx_start_run, then work through the stages in order with rigorx_submit_stage, following the "
    "guidance each response returns. Record sources with rigorx_record_evidence and actions you take with "
    "other tools with rigorx_report_action. Pass the gate with rigorx_verify before deciding. RIGOR-X checks "
    "structure and completeness, not truth: report results honestly, including failures. "
    "rigorx_route and rigorx_resolve_commands work without a run."
)


def token_owner() -> str | None:
    """Owner from the verified access token: issuer plus subject, never the client ID or e-mail."""
    from mcp.server.auth.middleware.auth_context import get_access_token

    token = get_access_token()
    if token is None or not token.subject:
        return None
    issuer = (token.claims or {}).get("iss") or "unknown-issuer"
    return f"{issuer}|{token.subject}"


def build_server(
    engine: HostEngine | Any,
    *,
    owner_resolver: OwnerResolver | None = None,
    local_owner: str | None = None,
) -> MCPServer:
    """Create the MCP server. Tools are registered in a fixed order.

    ``engine`` is a ``HostEngine`` or any object with the same methods, which may
    be coroutines (for example ``engine_rpc.RemoteEngine`` on Cloudflare).
    """
    from mcp.server import MCPServer
    from mcp.server.mcpserver.exceptions import ToolError
    from mcp_types import ToolAnnotations

    server = MCPServer(
        "rigor-x",
        title="RIGOR-X",
        description="Stage-gated control plane for rigorous AI work",
        instructions=SERVER_INSTRUCTIONS,
        version=__version__,
    )
    read_only = ToolAnnotations(read_only_hint=True, open_world_hint=False)
    additive = ToolAnnotations(read_only_hint=False, destructive_hint=False, open_world_hint=False)
    destructive = ToolAnnotations(read_only_hint=False, destructive_hint=True, open_world_hint=False)

    def owner() -> str:
        value = owner_resolver() if owner_resolver is not None else None
        if value is None:
            try:
                value = token_owner()
            except ImportError:  # pragma: no cover - SDK auth module unavailable
                value = None
        if value is None:
            value = local_owner
        if not value:
            raise ToolError("AUTH_REQUIRED: sign in to use this tool")
        return value

    async def call(operation: Callable[[], dict[str, Any] | Awaitable[dict[str, Any]]]) -> dict[str, Any]:
        try:
            result = operation()
            if inspect.isawaitable(result):
                result = await result
            return result
        except EngineError as exc:
            raise ToolError(f"{exc.code}: {exc}") from None

    @server.tool(name="rigorx_route", title="Suggest analysis route", annotations=read_only)
    async def rigorx_route(task: str) -> dict[str, Any]:
        """Suggest intent, intensity level (L01-L06), analysis modes and methods for a task. Heuristic; stores nothing."""
        return await call(lambda: engine.route(task))

    @server.tool(name="rigorx_resolve_commands", title="Resolve slash commands", annotations=read_only)
    async def rigorx_resolve_commands(text: str) -> dict[str, Any]:
        """Resolve leading slash commands in text against the RIGOR-X catalogue. Stores nothing."""
        return await call(lambda: engine.resolve_commands(text))

    @server.tool(name="rigorx_start_run", title="Start a RIGOR-X run", annotations=additive)
    async def rigorx_start_run(task: str) -> dict[str, Any]:
        """Start a run for a task. Returns run_id, the first stage and what it requires. The task text is stored only as a digest."""
        return await call(lambda: engine.start_run(owner(), task))

    @server.tool(name="rigorx_get_run", title="Get run state", annotations=read_only)
    async def rigorx_get_run(run_id: str) -> dict[str, Any]:
        """Current stage, stage statuses, guidance, evidence count, reported actions and re-entry budget."""
        return await call(lambda: engine.get_run(owner(), run_id))

    @server.tool(name="rigorx_submit_stage", title="Submit stage result", annotations=additive)
    async def rigorx_submit_stage(run_id: str, stage: str, outcome: str, summary: str, reason: str | None = None) -> dict[str, Any]:
        """Submit the result of the current stage. outcome: completed, partial, blocked or skipped (partial, blocked and skipped need a reason). VERIFICATION is passed only with rigorx_verify."""
        return await call(lambda: engine.submit_stage(owner(), run_id, stage=stage, outcome=outcome, summary=summary, reason=reason))

    @server.tool(name="rigorx_record_evidence", title="Record evidence", annotations=additive)
    async def rigorx_record_evidence(run_id: str, source_ref: str, claim: str, evidence_type: str = "SOURCE") -> dict[str, Any]:
        """Record a source (URL, document ID, receipt) and the claim it supports. Returns an evidence_id (ev-N) to cite in rigorx_verify."""
        return await call(lambda: engine.record_evidence(owner(), run_id, source_ref=source_ref, claim=claim, evidence_type=evidence_type))

    @server.tool(name="rigorx_report_action", title="Report a host action", annotations=additive)
    async def rigorx_report_action(
        run_id: str, tool_name: str, status: str, receipt_ref: str | None = None, resolves: str | None = None
    ) -> dict[str, Any]:
        """Report an action you performed with another tool. status: EXECUTED, FAILED or BLOCKED. Use resolves=<ev-N> when a later action fixes an earlier failure. Recorded as host-reported, not verified."""
        return await call(lambda: engine.report_action(owner(), run_id, tool_name=tool_name, status=status, receipt_ref=receipt_ref, resolves=resolves))

    @server.tool(name="rigorx_verify", title="Run verification gate", annotations=additive)
    async def rigorx_verify(run_id: str, criteria: list[dict[str, Any]]) -> dict[str, Any]:
        """Run the deterministic gate. criteria: list of {criterion, passed, evidence_ids}; every passed criterion must cite evidence IDs. Result is 'structurally verified' at most, never a truth guarantee."""
        return await call(lambda: engine.verify(owner(), run_id, criteria=criteria))

    @server.tool(name="rigorx_reenter", title="Return to an earlier stage", annotations=additive)
    async def rigorx_reenter(run_id: str, target_stage: str, trigger: str, reason: str) -> dict[str, Any]:
        """Return to the current or an earlier stage within the re-entry budget, for example after a failed verification."""
        return await call(lambda: engine.reenter(owner(), run_id, target_stage=target_stage, trigger=trigger, reason=reason))

    @server.tool(name="rigorx_cancel_run", title="Cancel run", annotations=destructive)
    async def rigorx_cancel_run(run_id: str, reason: str) -> dict[str, Any]:
        """Cancel one of your runs. A cancelled run cannot be resumed."""
        return await call(lambda: engine.cancel_run(owner(), run_id, reason=reason))

    @server.tool(name="rigorx_delete_run", title="Delete run data", annotations=destructive)
    async def rigorx_delete_run(run_id: str) -> dict[str, Any]:
        """Permanently delete one of your runs and its ledger."""
        return await call(lambda: engine.delete_run(owner(), run_id))

    @server.tool(name="rigorx_profile", title="Account profile", annotations=read_only, meta={"openai/profile": True})
    async def rigorx_profile() -> dict[str, Any]:
        """Stable, opaque identifier of the signed-in account."""
        return {"id": sha256(owner().encode("utf-8")).hexdigest()[:32]}

    return server


def _is_loopback(host: str) -> bool:
    if host.casefold() == "localhost":
        return True
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False


def _default_database() -> str:
    return os.environ.get("RIGORX_HOST_DATABASE", str(Path.home() / ".local" / "share" / "rigorx" / "host-runs.sqlite"))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="rigorx-mcp", description="Run the RIGOR-X MCP server (single-user development mode).")
    parser.add_argument("--transport", choices=["stdio", "streamable-http"], default="stdio")
    parser.add_argument("--database", default=_default_database(), help="SQLite run store path.")
    parser.add_argument("--catalog", help="Optional slash-command catalogue JSON (library/slash-commands/commands.json).")
    parser.add_argument("--host", default="127.0.0.1", help="HTTP bind address; loopback only until P4 authentication exists.")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--owner", default=None, help="Local owner ID for single-user mode (default: local:<user name>).")
    args = parser.parse_args(argv)
    try:
        import mcp  # noqa: F401
    except ImportError:
        print("The MCP SDK is not installed. Install with: pip install 'rigor-x-core[mcp]'", file=sys.stderr)
        return 2
    if args.transport == "streamable-http" and not _is_loopback(args.host):
        print("Refusing to bind to a non-loopback address without authentication (planned for phase P4).", file=sys.stderr)
        return 2

    from .run_store import SQLiteRunStore
    from .slash_commands import SlashCommandCatalog

    catalog = SlashCommandCatalog.from_file(args.catalog) if args.catalog else None
    owner = args.owner or f"local:{getpass.getuser()}"
    store = SQLiteRunStore(args.database)
    try:
        server = build_server(HostEngine(store, command_catalog=catalog), local_owner=owner)
        if args.transport == "stdio":
            server.run("stdio")
        else:
            server.run(transport="streamable-http", host=args.host, port=args.port)
    finally:
        store.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
