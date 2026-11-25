from __future__ import annotations

import unittest

from rigorx.agent_runtime import (
    AgentRuntime,
    ModelTurn,
    ToolCall,
    ToolDefinition,
    ToolRegistry,
)
from rigorx.pipeline import RunStatus, StageStatus
from rigorx.pipeline_agent import AgentPipeline
from rigorx.storage import SQLitePipelineStore


class ScriptedBackend:
    def __init__(self, turns):
        self.turns = list(turns)

    def generate(self, messages, tools, *, timeout_seconds):
        return self.turns.pop(0)


class AgentPipelineTests(unittest.TestCase):
    def test_simple_question_pipeline_and_persistence(self):
        runtime = AgentRuntime(ScriptedBackend([ModelTurn(text="Gravity attracts masses.")]), ToolRegistry())
        store = SQLitePipelineStore(":memory:")
        outcome = AgentPipeline(runtime, store).run("What is gravity?", run_id="simple-1")
        self.assertEqual(outcome.pipeline_status, RunStatus.COMPLETED)
        self.assertTrue(outcome.verified)
        self.assertEqual(outcome.snapshot["stage_status"]["RESEARCH"], StageStatus.SKIPPED_WITH_REASON.value)
        stored = store.load("simple-1")
        self.assertEqual(stored.snapshot["status"], "COMPLETED")
        self.assertEqual(store.integrity_check(), ["ok"])
        self.assertNotIn("What is gravity", str(stored.snapshot))
        store.close()

    def test_successful_tool_action_passes_gate(self):
        tool = ToolDefinition("write_record", "Write record", {"type": "object", "properties": {"id": {"type": "string"}}, "required": ["id"]}, lambda args: {"written": args["id"]}, capability="records.write")
        backend = ScriptedBackend([ModelTurn(tool_calls=(ToolCall("c1", "write_record", {"id": "A"}),)), ModelTurn(text="Record A written.")])
        runtime = AgentRuntime(backend, ToolRegistry([tool]), capabilities=frozenset({"records.write"}))
        store = SQLitePipelineStore(":memory:")
        outcome = AgentPipeline(runtime, store).run("Execute write record A", run_id="action-1")
        self.assertTrue(outcome.verified)
        self.assertEqual(outcome.pipeline_status, RunStatus.COMPLETED)
        self.assertEqual(outcome.agent_result.receipts[0].status.value, "EXECUTED")
        store.close()

    def test_blocked_action_stops_before_decision(self):
        tool = ToolDefinition("write_record", "Write record", {"type": "object"}, lambda _args: {"written": True}, capability="records.write")
        backend = ScriptedBackend([ModelTurn(tool_calls=(ToolCall("c1", "write_record", {}),)), ModelTurn(text="The action was blocked.")])
        runtime = AgentRuntime(backend, ToolRegistry([tool]))
        store = SQLitePipelineStore(":memory:")
        outcome = AgentPipeline(runtime, store).run("Execute the record write", run_id="blocked-1")
        self.assertFalse(outcome.verified)
        self.assertEqual(outcome.pipeline_status, RunStatus.VERIFICATION_FAILED)
        self.assertEqual(outcome.snapshot["stage_status"]["DECISION"], StageStatus.NOT_STARTED.value)
        store.close()

    def test_research_without_source_receipt_fails_gate(self):
        backend = ScriptedBackend([ModelTurn(text="Cannot verify with sources.")])
        runtime = AgentRuntime(backend, ToolRegistry())
        store = SQLitePipelineStore(":memory:")
        outcome = AgentPipeline(runtime, store).run("Research the latest policy and cite sources", run_id="research-1")
        self.assertFalse(outcome.verified)
        self.assertTrue(any("source-acquisition" in reason for reason in outcome.verification_reasons))
        store.close()

    def test_snapshot_does_not_store_raw_tool_output(self):
        tool = ToolDefinition("lookup", "Lookup", {"type": "object"}, lambda _args: {"private": "sensitive-data"})
        backend = ScriptedBackend([ModelTurn(tool_calls=(ToolCall("c1", "lookup", {}),)), ModelTurn(text="Found it.")])
        runtime = AgentRuntime(backend, ToolRegistry([tool]), capabilities=frozenset({"tool.execute"}))
        store = SQLitePipelineStore(":memory:")
        outcome = AgentPipeline(runtime, store).run("Lookup something", run_id="privacy-1")
        stored = store.load("privacy-1").snapshot
        self.assertNotIn("sensitive-data", str(stored))
        self.assertTrue(outcome.verified)
        store.close()


if __name__ == "__main__":
    unittest.main()
