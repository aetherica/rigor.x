from __future__ import annotations

import importlib.util
import unittest

from rigorx.host_engine import HostEngine
from rigorx.run_store import SQLiteRunStore

HAS_MCP = importlib.util.find_spec("mcp") is not None and importlib.util.find_spec("mcp_types") is not None

EXPECTED_TOOLS = [
    "rigorx_route",
    "rigorx_resolve_commands",
    "rigorx_start_run",
    "rigorx_get_run",
    "rigorx_submit_stage",
    "rigorx_record_evidence",
    "rigorx_report_action",
    "rigorx_verify",
    "rigorx_reenter",
    "rigorx_cancel_run",
    "rigorx_delete_run",
    "rigorx_profile",
]
READ_ONLY = {"rigorx_route", "rigorx_resolve_commands", "rigorx_get_run", "rigorx_profile"}
DESTRUCTIVE = {"rigorx_cancel_run", "rigorx_delete_run"}


@unittest.skipUnless(HAS_MCP, "MCP SDK not installed (pip install 'rigor-x-core[mcp]')")
class McpServerTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        from mcp import Client

        from rigorx.mcp_server import build_server

        self.store = SQLiteRunStore(":memory:")
        self.addCleanup(self.store.close)
        self.current_owner = "issuer|alice"
        self.client = Client(build_server(HostEngine(self.store), owner_resolver=lambda: self.current_owner))

    async def call(self, name, **arguments):
        return await self.client.call_tool(name, arguments)

    async def test_tool_list_is_complete_ordered_and_annotated(self):
        async with self.client:
            tools = (await self.client.list_tools()).tools
            self.assertEqual([t.name for t in tools], EXPECTED_TOOLS)
            for tool in tools:
                with self.subTest(tool=tool.name):
                    self.assertTrue(tool.title)
                    self.assertTrue(tool.description)
                    self.assertIs(tool.annotations.open_world_hint, False)
                    self.assertIs(tool.annotations.read_only_hint, tool.name in READ_ONLY)
                    if tool.name not in READ_ONLY:
                        self.assertIs(tool.annotations.destructive_hint, tool.name in DESTRUCTIVE)
            profile = next(t for t in tools if t.name == "rigorx_profile")
            self.assertEqual(profile.meta, {"openai/profile": True})

    async def test_full_run_over_mcp(self):
        summaries = {
            "CONTEXT": "The user asks about gravity; no prior decisions, one web source is available.",
            "INTENT": "Explain what gravity is in two sentences, citing one reliable source.",
            "KNOWLEDGE": "Physics domain: Newtonian gravitation is enough; relativity is out of scope here.",
            "ROUTING": "Factual explanation at standard depth; no tools beyond the recorded source.",
            "REASONING": "Masses attract each other; the force grows with mass and falls with distance squared.",
            "EVIDENCE": "One source recorded and checked against the explanation; nothing contradicts it.",
            "DECISION": "Answer: gravity is the mutual attraction between masses, as the cited source states.",
            "FEEDBACK": "The run needed only one source; research and execution were rightly skipped.",
        }
        async with self.client:
            started = await self.call("rigorx_start_run", task="What is gravity?")
            self.assertFalse(started.is_error)
            run_id = started.structured_content["run_id"]
            short = await self.call("rigorx_submit_stage", run_id=run_id, stage="CONTEXT", outcome="completed", summary="ctx")
            self.assertTrue(short.is_error)
            self.assertIn("INVALID_REQUEST: summary is too short", short.content[0].text)
            await self.call("rigorx_submit_stage", run_id=run_id, stage="CONTEXT", outcome="completed", summary=summaries["CONTEXT"])
            evidence = await self.call(
                "rigorx_record_evidence", run_id=run_id, source_ref="https://example.org",
                claim="Masses attract each other in proportion to their mass",
            )
            ev = evidence.structured_content["evidence_id"]
            for stage in ["INTENT", "KNOWLEDGE", "RESEARCH", "ROUTING", "REASONING", "EXECUTION", "EVIDENCE"]:
                skip = stage in {"RESEARCH", "EXECUTION"}
                result = await self.call(
                    "rigorx_submit_stage", run_id=run_id, stage=stage, outcome="skipped" if skip else "completed",
                    summary=summaries.get(stage, "skipped"), reason="not needed for this question" if skip else None,
                )
                self.assertFalse(result.is_error, result.content)
            verified = await self.call(
                "rigorx_verify", run_id=run_id,
                criteria=[{"criterion": "The answer cites a source", "passed": True, "evidence_ids": [ev]}],
            )
            self.assertTrue(verified.structured_content["passed"])
            await self.call("rigorx_submit_stage", run_id=run_id, stage="DECISION", outcome="completed", summary=summaries["DECISION"])
            done = await self.call("rigorx_submit_stage", run_id=run_id, stage="FEEDBACK", outcome="completed", summary=summaries["FEEDBACK"])
            self.assertEqual(done.structured_content["status"], "COMPLETED")

    async def test_engine_errors_become_tool_errors_with_codes(self):
        async with self.client:
            run_id = (await self.call("rigorx_start_run", task="Explain gravity")).structured_content["run_id"]
            out_of_order = await self.call("rigorx_submit_stage", run_id=run_id, stage="INTENT", outcome="completed", summary="x")
            self.assertTrue(out_of_order.is_error)
            self.assertIn("STAGE_CONFLICT", out_of_order.content[0].text)
            self.current_owner = "issuer|bob"
            other = await self.call("rigorx_get_run", run_id=run_id)
            self.assertTrue(other.is_error)
            self.assertIn("RUN_NOT_FOUND", other.content[0].text)

    async def test_owner_is_required_for_run_tools_but_not_for_route(self):
        async with self.client:
            self.current_owner = None
            route = await self.call("rigorx_route", task="Debug this code")
            self.assertFalse(route.is_error)
            self.assertEqual(route.structured_content["profile"]["intent"], "TECHNICAL")
            start = await self.call("rigorx_start_run", task="x")
            self.assertTrue(start.is_error)
            self.assertIn("AUTH_REQUIRED", start.content[0].text)

    async def test_profile_is_stable_and_opaque(self):
        async with self.client:
            first = (await self.call("rigorx_profile")).structured_content["id"]
            again = (await self.call("rigorx_profile")).structured_content["id"]
            self.assertEqual(first, again)
            self.assertNotIn("alice", first)
            self.current_owner = "issuer|bob"
            self.assertNotEqual(first, (await self.call("rigorx_profile")).structured_content["id"])


class McpEntryPointTests(unittest.TestCase):
    @unittest.skipUnless(HAS_MCP, "MCP SDK not installed")
    def test_http_refuses_non_loopback_without_auth(self):
        import io
        from contextlib import redirect_stderr

        from rigorx.mcp_server import main

        err = io.StringIO()
        with redirect_stderr(err):
            code = main(["--transport", "streamable-http", "--host", "0.0.0.0", "--database", ":memory:"])
        self.assertEqual(code, 2)
        self.assertIn("non-loopback", err.getvalue())

    def test_token_owner_uses_issuer_and_subject(self):
        if not HAS_MCP:
            self.skipTest("MCP SDK not installed")
        from unittest.mock import patch

        from mcp.server.auth.provider import AccessToken

        from rigorx.mcp_server import token_owner

        token = AccessToken(token="t", client_id="chatgpt", scopes=[], subject="123", claims={"iss": "https://auth.example"})
        with patch("mcp.server.auth.middleware.auth_context.get_access_token", return_value=token):
            self.assertEqual(token_owner(), "https://auth.example|123")
        no_subject = AccessToken(token="t", client_id="chatgpt", scopes=[])
        with patch("mcp.server.auth.middleware.auth_context.get_access_token", return_value=no_subject):
            self.assertIsNone(token_owner())


if __name__ == "__main__":
    unittest.main()
