from __future__ import annotations

import unittest

from rigorx.command_runtime import (
    CommandDefinition,
    CommandExecutor,
    CommandRegistry,
    CommandRegistryError,
    CommandState,
    ExecutionContext,
    ExecutionStatus,
)


def make_command(*, state=CommandState.IMPLEMENTED, approval=False, caps=frozenset(), validator=None):
    return CommandDefinition("CMD-001", "/sample", "FG-15", state, caps, approval, validator)


class CommandRuntimeTests(unittest.TestCase):
    def test_not_implemented_is_never_executed(self):
        registry = CommandRegistry([make_command(state=CommandState.NOT_IMPLEMENTED)])
        executor = CommandExecutor(registry, {"CMD-001": lambda _p, _c: "should not run"})
        receipt = executor.execute("/sample", {}, ExecutionContext("run-1"))
        self.assertEqual(receipt.status, ExecutionStatus.NOT_IMPLEMENTED)

    def test_missing_capability_blocks_execution(self):
        registry = CommandRegistry([make_command(caps=frozenset({"web.read"}))])
        executor = CommandExecutor(registry, {"CMD-001": lambda _p, _c: {"ok": True}})
        receipt = executor.execute("CMD-001", {}, ExecutionContext("run-2"))
        self.assertEqual(receipt.status, ExecutionStatus.BLOCKED)
        self.assertEqual(receipt.error_code, "CAPABILITY_MISSING")

    def test_approval_required_is_fail_closed(self):
        registry = CommandRegistry([make_command(approval=True)])
        executor = CommandExecutor(registry, {"CMD-001": lambda _p, _c: "done"})
        blocked = executor.execute("CMD-001", {}, ExecutionContext("run-3"))
        approved = executor.execute("CMD-001", {}, ExecutionContext("run-4", approved_command_ids=frozenset({"CMD-001"})))
        self.assertEqual(blocked.error_code, "APPROVAL_REQUIRED")
        self.assertEqual(approved.status, ExecutionStatus.EXECUTED)

    def test_input_validator_rejects_payload(self):
        registry = CommandRegistry([make_command(validator=lambda p: p.get("n", 0) > 0)])
        executor = CommandExecutor(registry, {"CMD-001": lambda p, _c: p["n"]})
        receipt = executor.execute("CMD-001", {"n": 0}, ExecutionContext("run-5"))
        self.assertEqual(receipt.status, ExecutionStatus.INVALID_INPUT)

    def test_handler_exception_is_redacted_receipt(self):
        registry = CommandRegistry([make_command()])
        def broken(_payload, _context):
            raise RuntimeError("secret details must not leak")
        executor = CommandExecutor(registry, {"CMD-001": broken})
        receipt = executor.execute("CMD-001", {}, ExecutionContext("run-6"))
        self.assertEqual(receipt.status, ExecutionStatus.FAILED)
        self.assertEqual(receipt.reason, "RuntimeError")
        self.assertNotIn("secret", str(receipt.to_dict()))

    def test_duplicate_registry_entries_rejected(self):
        with self.assertRaises(CommandRegistryError):
            CommandRegistry([make_command(), make_command()])

    def test_unknown_handler_id_rejected(self):
        registry = CommandRegistry([make_command()])
        with self.assertRaises(CommandRegistryError):
            CommandExecutor(registry, {"CMD-999": lambda _p, _c: None})

    def test_non_json_output_rejected_as_failure(self):
        registry = CommandRegistry([make_command()])
        executor = CommandExecutor(registry, {"CMD-001": lambda _p, _c: object()})
        receipt = executor.execute("CMD-001", {}, ExecutionContext("run-7"))
        self.assertEqual(receipt.status, ExecutionStatus.FAILED)
        self.assertEqual(receipt.error_code, "HANDLER_FAILURE")


if __name__ == "__main__":
    unittest.main()
