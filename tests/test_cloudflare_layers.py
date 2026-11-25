"""Durable Object store and engine RPC, tested locally (WS31 phase P3)."""
from __future__ import annotations

import asyncio
import importlib.util
import json
import sqlite3
import unittest

from rigorx.do_store import DurableObjectRunStore
from rigorx.engine_rpc import RUN_OPERATIONS, RemoteEngine, RemoteEngineError, dispatch
from rigorx.host_engine import RELAXED_TEXT_POLICY, HostEngine
from rigorx.run_store import EventIntegrityError, RevisionConflict, RunNotFound

HAS_MCP = importlib.util.find_spec("mcp") is not None and importlib.util.find_spec("mcp_types") is not None
ALICE = "issuer|alice"
BOB = "issuer|bob"


_OPEN: list[sqlite3.Connection] = []


def tearDownModule():
    while _OPEN:
        _OPEN.pop().close()


class FakeCursor:
    def __init__(self, rows, written):
        self._rows = rows
        self.rowsWritten = written

    def toArray(self):
        return self._rows


class FakeDurableObjectSql:
    """Synchronous ``ctx.storage.sql``-like object backed by sqlite3."""

    def __init__(self):
        self.db = sqlite3.connect(":memory:", isolation_level=None)
        self.db.row_factory = sqlite3.Row
        _OPEN.append(self.db)

    def exec(self, query, *bindings):
        cursor = self.db.execute(query, bindings)
        rows = [dict(row) for row in cursor.fetchall()] if cursor.description else []
        return FakeCursor(rows, max(cursor.rowcount, 0))


class DurableObjectStoreTests(unittest.TestCase):
    def setUp(self):
        self.sql = FakeDurableObjectSql()
        self.store = DurableObjectRunStore(self.sql)
        self.engine = HostEngine(self.store, text_policy=RELAXED_TEXT_POLICY)

    def test_full_run_through_engine(self):
        run_id = self.engine.start_run(ALICE, "What is gravity?")["run_id"]
        self.engine.submit_stage(ALICE, run_id, stage="CONTEXT", outcome="completed", summary="ctx")
        ev = self.engine.record_evidence(ALICE, run_id, source_ref="https://example.org", claim="c")["evidence_id"]
        for stage in ["INTENT", "KNOWLEDGE", "RESEARCH", "ROUTING", "REASONING", "EXECUTION", "EVIDENCE"]:
            skip = stage in {"RESEARCH", "EXECUTION"}
            self.engine.submit_stage(ALICE, run_id, stage=stage, outcome="skipped" if skip else "completed", summary="s", reason="n/a" if skip else None)
        self.assertTrue(self.engine.verify(ALICE, run_id, criteria=[{"criterion": "c", "passed": True, "evidence_ids": [ev]}])["passed"])
        self.engine.submit_stage(ALICE, run_id, stage="DECISION", outcome="completed", summary="d")
        self.assertEqual(self.engine.submit_stage(ALICE, run_id, stage="FEEDBACK", outcome="completed", summary="f")["status"], "COMPLETED")

    def test_owner_scoping_revision_and_append_only(self):
        run_id = self.engine.start_run(ALICE, "Explain gravity")["run_id"]
        with self.assertRaises(RunNotFound):
            self.store.load(BOB, run_id)
        stale = self.store.load(ALICE, run_id)
        self.engine.submit_stage(ALICE, run_id, stage="CONTEXT", outcome="completed", summary="s")
        with self.assertRaises(RevisionConflict):
            self.store.save(ALICE, stale.run, stale.meta, expected_revision=stale.revision)
        current = self.store.load(ALICE, run_id)
        current.run.events.pop()
        with self.assertRaises(EventIntegrityError):
            self.store.save(ALICE, current.run, current.meta, expected_revision=current.revision)
        with self.assertRaises(RunNotFound):
            self.store.delete(BOB, run_id)
        self.store.delete(ALICE, run_id)
        with self.assertRaises(RunNotFound):
            self.store.load(ALICE, run_id)

    def test_store_reopens_on_existing_storage(self):
        run_id = self.engine.start_run(ALICE, "Explain gravity")["run_id"]
        reopened = HostEngine(DurableObjectRunStore(self.sql), text_policy=RELAXED_TEXT_POLICY)
        self.assertEqual(reopened.get_run(ALICE, run_id)["current_stage"], "CONTEXT")


class EngineRpcTests(unittest.TestCase):
    def setUp(self):
        self.host = HostEngine(DurableObjectRunStore(FakeDurableObjectSql()), text_policy=RELAXED_TEXT_POLICY)
        self.calls = []

        async def transport(owner_id, operation, payload_json):
            self.calls.append((owner_id, operation))
            return dispatch(self.host, owner_id, operation, payload_json)

        self.remote = RemoteEngine(transport, local=HostEngine(DurableObjectRunStore(FakeDurableObjectSql()), text_policy=RELAXED_TEXT_POLICY))

    def run_async(self, coro):
        return asyncio.run(coro)

    def test_remote_round_trip_matches_engine(self):
        started = self.run_async(self.remote.start_run(ALICE, "Explain gravity"))
        moved = self.run_async(self.remote.submit_stage(ALICE, started["run_id"], stage="CONTEXT", outcome="completed", summary="s"))
        self.assertEqual(moved["current_stage"], "INTENT")
        self.assertEqual(self.calls, [(ALICE, "start_run"), (ALICE, "submit_stage")])

    def test_engine_errors_keep_their_codes(self):
        run_id = self.run_async(self.remote.start_run(ALICE, "Explain gravity"))["run_id"]
        with self.assertRaises(RemoteEngineError) as conflict:
            self.run_async(self.remote.submit_stage(ALICE, run_id, stage="INTENT", outcome="completed", summary="x"))
        self.assertEqual(conflict.exception.code, "STAGE_CONFLICT")
        with self.assertRaises(RemoteEngineError) as missing:
            self.run_async(self.remote.get_run(BOB, run_id))
        self.assertEqual(missing.exception.code, "RUN_NOT_FOUND")

    def test_stateless_tools_stay_local(self):
        self.assertEqual(self.remote.route("Debug this code")["profile"]["intent"], "TECHNICAL")
        self.assertEqual(self.calls, [])

    def test_dispatch_rejects_unknown_operations_and_bad_payloads(self):
        for operation, payload in (("route", "{}"), ("__init__", "{}"), ("get_run", "[]"), ("get_run", "not json"), ("get_run", json.dumps({"bogus": 1}))):
            response = json.loads(dispatch(self.host, ALICE, operation, payload))
            self.assertFalse(response["ok"], (operation, payload))
        self.assertNotIn("route", RUN_OPERATIONS)


@unittest.skipUnless(HAS_MCP, "MCP SDK not installed")
class RemoteEngineOverMcpTests(unittest.IsolatedAsyncioTestCase):
    async def test_mcp_server_accepts_async_engine(self):
        from mcp import Client

        from rigorx.mcp_server import build_server

        host = HostEngine(DurableObjectRunStore(FakeDurableObjectSql()), text_policy=RELAXED_TEXT_POLICY)

        async def transport(owner_id, operation, payload_json):
            return dispatch(host, owner_id, operation, payload_json)

        remote = RemoteEngine(transport, local=host)
        async with Client(build_server(remote, owner_resolver=lambda: ALICE)) as client:
            started = await client.call_tool("rigorx_start_run", {"task": "Explain gravity"})
            self.assertFalse(started.is_error, started.content)
            run_id = started.structured_content["run_id"]
            wrong = await client.call_tool("rigorx_submit_stage", {"run_id": run_id, "stage": "INTENT", "outcome": "completed", "summary": "x"})
            self.assertTrue(wrong.is_error)
            self.assertIn("STAGE_CONFLICT", wrong.content[0].text)


if __name__ == "__main__":
    unittest.main()


class WorkerBundleTests(unittest.TestCase):
    """The Worker bundle must import without sqlite3 and with only the Workers API stubs."""

    @unittest.skipUnless(HAS_MCP, "MCP SDK not installed")
    def test_synced_bundle_imports_without_sqlite3(self):
        import subprocess
        import sys
        import tempfile
        from pathlib import Path

        repo = Path(__file__).resolve().parents[1]
        worker = repo / "deploy" / "cloudflare"
        subprocess.run([sys.executable, str(worker / "sync_engine.py")], check=True, capture_output=True)
        probe = (
            "import sys, types\n"
            "sys.modules['sqlite3'] = None\n"
            "w = types.ModuleType('workers')\n"
            "class _Base:\n"
            "    def __init__(self, ctx, env): self.ctx, self.env = ctx, env\n"
            "w.DurableObject = w.WorkerEntrypoint = _Base\n"
            "w.Response = lambda *a, **k: (a, k)\n"
            "w.asgi = types.SimpleNamespace(fetch=None)\n"
            "sys.modules['workers'] = w\n"
            f"sys.path.insert(0, {str(worker / 'src')!r})\n"
            "import entry, rigorx\n"
            "assert rigorx.__file__.startswith(" + repr(str(worker / "src")) + ")\n"
            "assert 'rigorx.storage' not in sys.modules and 'rigorx.cli' not in sys.modules\n"
            "print('ok')\n"
        )
        with tempfile.TemporaryDirectory() as tmp:
            result = subprocess.run([sys.executable, "-I", "-c", probe], cwd=tmp, capture_output=True, text=True, check=False)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("ok", result.stdout)
