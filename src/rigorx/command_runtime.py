"""Fail-closed command execution framework for RIGOR-X operational scope.

A command is in operational scope when its definition is registered. It executes
only when a reviewed handler, required capabilities and any approval are present.
This module never treats a command description as executable code.
"""
from __future__ import annotations

import json
import re
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from datetime import UTC, datetime
from enum import StrEnum
from hashlib import sha256
from typing import Any


class CommandState(StrEnum):
    NOT_IMPLEMENTED = "NOT_IMPLEMENTED"
    IMPLEMENTED = "IMPLEMENTED"
    VERIFIED = "VERIFIED"


class ExecutionStatus(StrEnum):
    EXECUTED = "EXECUTED"
    BLOCKED = "BLOCKED"
    NOT_IMPLEMENTED = "NOT_IMPLEMENTED"
    INVALID_INPUT = "INVALID_INPUT"
    FAILED = "FAILED"


class ApprovalRequired(RuntimeError):
    """Raised by an approval policy when caller has not granted approval."""


class CommandRegistryError(ValueError):
    """Invalid or conflicting command definitions."""


@dataclass(frozen=True, slots=True)
class CommandDefinition:
    command_id: str
    name: str
    functional_group: str
    state: CommandState = CommandState.NOT_IMPLEMENTED
    required_capabilities: frozenset[str] = frozenset()
    approval_required: bool = False
    input_validator: Callable[[Mapping[str, Any]], bool] | None = None

    def __post_init__(self) -> None:
        if not re.fullmatch(r"CMD-[0-9]{3,4}", self.command_id):
            raise ValueError("command_id must match CMD-000..CMD-9999")
        if not re.fullmatch(r"/[a-z0-9][a-z0-9_-]*", self.name):
            raise ValueError("name must be a normalized slash command")
        if not re.fullmatch(r"FG-[0-9]{2}", self.functional_group):
            raise ValueError("functional_group must match FG-01..FG-18")
        if not isinstance(self.state, CommandState):
            raise TypeError("state must be CommandState")
        if any(not isinstance(cap, str) or not cap.strip() for cap in self.required_capabilities):
            raise ValueError("required capabilities must be non-empty strings")
        if not isinstance(self.approval_required, bool):
            raise TypeError("approval_required must be bool")


@dataclass(frozen=True, slots=True)
class ExecutionContext:
    run_id: str
    capabilities: frozenset[str] = frozenset()
    approved_command_ids: frozenset[str] = frozenset()
    correlation_id: str | None = None

    def __post_init__(self) -> None:
        if not self.run_id.strip():
            raise ValueError("run_id is required")
        if any(not isinstance(value, str) or not value.strip() for value in self.capabilities):
            raise ValueError("capabilities must be non-empty strings")


@dataclass(frozen=True, slots=True)
class ExecutionReceipt:
    receipt_id: str
    command_id: str
    command_name: str
    run_id: str
    status: ExecutionStatus
    timestamp: str
    input_digest: str
    output: Any = None
    error_code: str | None = None
    reason: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "receipt_id": self.receipt_id,
            "command_id": self.command_id,
            "command_name": self.command_name,
            "run_id": self.run_id,
            "status": self.status.value,
            "timestamp": self.timestamp,
            "input_digest": self.input_digest,
            "output": self.output,
            "error_code": self.error_code,
            "reason": self.reason,
        }


Handler = Callable[[Mapping[str, Any], ExecutionContext], Any]


class CommandRegistry:
    """Immutable-after-construction command map; aliases are explicit definitions."""

    def __init__(self, definitions: tuple[CommandDefinition, ...] | list[CommandDefinition]):
        by_id: dict[str, CommandDefinition] = {}
        by_name: dict[str, CommandDefinition] = {}
        for item in definitions:
            if not isinstance(item, CommandDefinition):
                raise TypeError("registry entries must be CommandDefinition")
            if item.command_id in by_id or item.name in by_name:
                raise CommandRegistryError(f"duplicate command id or name: {item.command_id}/{item.name}")
            by_id[item.command_id] = item
            by_name[item.name] = item
        self._by_id = by_id
        self._by_name = by_name

    def resolve(self, identifier: str) -> CommandDefinition | None:
        return self._by_id.get(identifier) or self._by_name.get(identifier)

    def __len__(self) -> int:
        return len(self._by_id)


class CommandExecutor:
    """Dispatch only reviewed handlers; unknown or unimplemented entries fail closed."""

    def __init__(self, registry: CommandRegistry, handlers: Mapping[str, Handler]):
        self.registry = registry
        self.handlers = dict(handlers)
        unknown_handlers = set(self.handlers) - set(registry._by_id)
        if unknown_handlers:
            raise CommandRegistryError(f"handler references unknown command IDs: {sorted(unknown_handlers)}")

    @staticmethod
    def _digest(payload: Mapping[str, Any]) -> str:
        try:
            encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)
        except (TypeError, ValueError) as exc:
            raise ValueError("input must be finite JSON-compatible data") from exc
        return sha256(encoded.encode("utf-8")).hexdigest()

    def execute(self, identifier: str, payload: Mapping[str, Any], context: ExecutionContext) -> ExecutionReceipt:
        if not isinstance(payload, Mapping):
            raise TypeError("payload must be a mapping")
        if not isinstance(context, ExecutionContext):
            raise TypeError("context must be ExecutionContext")
        definition = self.registry.resolve(identifier)
        if definition is None:
            raise KeyError(f"unknown command: {identifier}")
        digest = self._digest(payload)
        stamp = datetime.now(UTC).isoformat()
        base = f"{context.run_id}:{definition.command_id}:{digest}:{stamp}"
        receipt_id = sha256(base.encode()).hexdigest()

        def receipt(status: ExecutionStatus, *, output: Any = None, error: str | None = None, reason: str | None = None) -> ExecutionReceipt:
            return ExecutionReceipt(receipt_id, definition.command_id, definition.name, context.run_id, status, stamp, digest, output, error, reason)

        if definition.state is CommandState.NOT_IMPLEMENTED or definition.command_id not in self.handlers:
            return receipt(ExecutionStatus.NOT_IMPLEMENTED, reason="no implemented handler is registered")
        missing = definition.required_capabilities - context.capabilities
        if missing:
            return receipt(ExecutionStatus.BLOCKED, error="CAPABILITY_MISSING", reason=f"missing capabilities: {sorted(missing)}")
        if definition.approval_required and definition.command_id not in context.approved_command_ids:
            return receipt(ExecutionStatus.BLOCKED, error="APPROVAL_REQUIRED", reason="explicit approval required")
        if definition.input_validator and not definition.input_validator(payload):
            return receipt(ExecutionStatus.INVALID_INPUT, error="INPUT_VALIDATION_FAILED", reason="payload failed command contract")
        try:
            output = self.handlers[definition.command_id](payload, context)
            self._digest({"output": output})  # reject non-JSON and non-finite results
            return receipt(ExecutionStatus.EXECUTED, output=output)
        except Exception as exc:  # noqa: BLE001 - isolate handler boundary; redact traceback and message
            return receipt(ExecutionStatus.FAILED, error="HANDLER_FAILURE", reason=type(exc).__name__)
