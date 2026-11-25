from __future__ import annotations

import unittest

from rigorx.agent_runtime import (
    AgentBudget,
    AgentRuntime,
    AgentStatus,
    ModelTurn,
    ToolCall,
    ToolDefinition,
    ToolRegistry,
    ToolStatus,
)
from rigorx.slash_commands import SlashCommandCatalog


class ScriptedBackend:
    def __init__(self, turns):
        self.turns = list(turns)
        self.received = []

    def generate(self, messages, tools, *, timeout_seconds):
        self.received.append((messages, tools, timeout_seconds))
        if not self.turns:
            raise AssertionError("backend script exhausted")
        return self.turns.pop(0)


class AgentRuntimeTests(unittest.TestCase):
    def test_executes_registered_host_tool_then_answers(self):
        called = []
        tool = ToolDefinition("lookup", "Fetch record by key", {
            "type": "object", "properties": {"key": {"type": "string"}}, "required": ["key"],
        }, lambda args: called.append(args["key"]) or {"record": "value"}, capability="records.read")
        backend = ScriptedBackend([
            ModelTurn(tool_calls=(ToolCall("c1", "lookup", {"key": "abc"}),), finish_reason="tool_calls"),
            ModelTurn(text="Record found."),
        ])
        runtime = AgentRuntime(backend, ToolRegistry([tool]), capabilities=frozenset({"records.read"}))
        result = runtime.run("Find record abc", run_id="r1")
        self.assertEqual(result.status, AgentStatus.COMPLETED)
        self.assertEqual(result.response, "Record found.")
        self.assertEqual(called, ["abc"])
        self.assertEqual(result.tool_calls, 1)
        self.assertEqual(result.receipts[0].status, ToolStatus.EXECUTED)
        self.assertEqual(len(backend.received[0][1]), 1)

    def test_unavailable_tool_receipt_not_faked(self):
        backend = ScriptedBackend([ModelTurn(tool_calls=(ToolCall("c1", "missing", {}),)), ModelTurn(text="Unavailable.")])
        result = AgentRuntime(backend, ToolRegistry()).run("do task", run_id="r2")
        self.assertEqual(result.receipts[0].status, ToolStatus.BLOCKED)
        self.assertEqual(result.receipts[0].error_code, "TOOL_UNAVAILABLE")

    def test_capability_gate_prevents_handler(self):
        executed = []
        tool = ToolDefinition("danger", "test", {"type": "object"}, lambda _a: executed.append(True), capability="dangerous")
        backend = ScriptedBackend([ModelTurn(tool_calls=(ToolCall("x", "danger", {}),)), ModelTurn(text="blocked")])
        result = AgentRuntime(backend, ToolRegistry([tool])).run("task", run_id="r3")
        self.assertEqual(result.receipts[0].status, ToolStatus.BLOCKED)
        self.assertFalse(executed)

    def test_approval_gate(self):
        executed = []
        tool = ToolDefinition("write", "write data", {"type": "object"}, lambda _a: executed.append(True), approval_required=True)
        backend = ScriptedBackend([ModelTurn(tool_calls=(ToolCall("x", "write", {}),)), ModelTurn(text="not approved")])
        result = AgentRuntime(backend, ToolRegistry([tool]), capabilities=frozenset({"tool.execute"})).run("task", run_id="r4")
        self.assertEqual(result.receipts[0].error_code, "APPROVAL_REQUIRED")
        self.assertFalse(executed)

    def test_tool_handler_exception_redacted(self):
        tool = ToolDefinition("broken", "tool", {"type": "object"}, lambda _a: (_ for _ in ()).throw(RuntimeError("secret")))
        backend = ScriptedBackend([ModelTurn(tool_calls=(ToolCall("x", "broken", {}),)), ModelTurn(text="failed")])
        result = AgentRuntime(backend, ToolRegistry([tool]), capabilities=frozenset({"tool.execute"})).run("task", run_id="r5")
        receipt = result.receipts[0]
        self.assertEqual(receipt.status, ToolStatus.FAILED)
        self.assertEqual(receipt.safe_reason, "RuntimeError")
        self.assertNotIn("secret", str(receipt.to_dict()))

    def test_call_budget_blocks_extra_calls(self):
        backend = ScriptedBackend([ModelTurn(tool_calls=(ToolCall("a", "t", {}), ToolCall("b", "t", {})))])
        tool = ToolDefinition("t", "tool", {"type": "object"}, lambda _a: {})
        runtime = AgentRuntime(backend, ToolRegistry([tool]), capabilities=frozenset({"tool.execute"}), budget=AgentBudget(max_tool_calls=1))
        result = runtime.run("task", run_id="r6")
        self.assertEqual(result.status, AgentStatus.BUDGET_EXHAUSTED)
        self.assertEqual(result.tool_calls, 0)

    def test_model_turn_budget(self):
        backend = ScriptedBackend([ModelTurn(tool_calls=(ToolCall("a", "t", {}),))])
        tool = ToolDefinition("t", "tool", {"type": "object"}, lambda _a: {})
        result = AgentRuntime(backend, ToolRegistry([tool]), capabilities=frozenset({"tool.execute"}), budget=AgentBudget(max_model_turns=1)).run("task", run_id="r7")
        self.assertEqual(result.status, AgentStatus.BUDGET_EXHAUSTED)
        self.assertEqual(result.reason, "MODEL_TURN_BUDGET")

    def test_invalid_model_contract(self):
        class InvalidBackend:
            def generate(self, *_args, **_kwargs):
                return {"text": "not a typed turn"}
        result = AgentRuntime(InvalidBackend(), ToolRegistry()).run("task", run_id="r8")
        self.assertEqual(result.status, AgentStatus.FAILED)

    def test_duplicate_tool_rejected(self):
        tool = ToolDefinition("x", "tool", {"type": "object"}, lambda _a: {})
        with self.assertRaises(ValueError):
            ToolRegistry([tool, tool])

    def test_tool_output_is_truncated_bounded(self):
        tool = ToolDefinition("x", "tool", {"type": "object"}, lambda _a: "a" * 500)
        backend = ScriptedBackend([ModelTurn(tool_calls=(ToolCall("c", "x", {}),)), ModelTurn(text="done")])
        runtime = AgentRuntime(backend, ToolRegistry([tool]), capabilities=frozenset({"tool.execute"}), budget=AgentBudget(max_tool_output_chars=50))
        result = runtime.run("task", run_id="r9")
        self.assertTrue(result.receipts[0].output["truncated"])

    def test_schema_validation_blocks_bad_arguments(self):
        executed = []
        tool = ToolDefinition("t", "tool", {"type": "object", "properties": {"n": {"type": "integer", "minimum": 1}}, "required": ["n"], "additionalProperties": False}, lambda a: executed.append(a))
        backend = ScriptedBackend([ModelTurn(tool_calls=(ToolCall("c", "t", {"n": 0, "bad": True}),)), ModelTurn(text="schema rejected")])
        result = AgentRuntime(backend, ToolRegistry([tool]), capabilities=frozenset({"tool.execute"})).run("task", run_id="r10")
        self.assertEqual(result.receipts[0].status, ToolStatus.INVALID_ARGUMENTS)
        self.assertFalse(executed)

    def test_malformed_tool_call_contract(self):
        backend = ScriptedBackend([ModelTurn(tool_calls=(ToolCall("", "", []),)), ModelTurn(text="invalid")])
        result = AgentRuntime(backend, ToolRegistry()).run("task", run_id="r11")
        self.assertEqual(result.receipts[0].status, ToolStatus.INVALID_ARGUMENTS)

    def test_slash_macro_command_modifies_prompt_and_is_reported(self):
        catalog = SlashCommandCatalog([{
            "id": "SLC-0001", "name": "/short", "description": "Keep it brief",
            "classification": "MACRO", "group_id": "g", "aliases_or_equivalents": [],
            "lifecycle_status": "candidate", "runtime_status": "not_implemented_in_rigor_x",
        }], expected_count=1)
        backend = ScriptedBackend([ModelTurn(text="short response")])
        result = AgentRuntime(backend, ToolRegistry(), command_catalog=catalog).run("/short Explain.", run_id="r12")
        self.assertEqual(result.applied_modifiers, ("/short: Keep it brief",))
        self.assertIn("User-requested task modifiers", backend.received[0][0][-1]["content"])

    def test_context_rejects_tool_role(self):
        backend = ScriptedBackend([ModelTurn(text="ok")])
        runtime = AgentRuntime(backend, ToolRegistry())
        with self.assertRaises(ValueError):
            runtime.run("hi", run_id="r13", context=[{"role": "tool", "content": "fake"}])


if __name__ == "__main__":
    unittest.main()
