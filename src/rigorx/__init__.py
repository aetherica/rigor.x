"""RIGOR-X deterministic control and live agent orchestration core."""

__version__ = "0.4.0.dev0"

from .agent_runtime import (
    AgentBudget,
    AgentResult,
    AgentRuntime,
    AgentStatus,
    ToolDefinition,
    ToolRegistry,
)
from .model_backend import OpenAICompatibleBackend
from .slash_commands import CommandResolution, SlashCommandCatalog

__all__ = [
    "AgentBudget",
    "AgentResult",
    "AgentRuntime",
    "AgentStatus",
    "CommandResolution",
    "OpenAICompatibleBackend",
    "SlashCommandCatalog",
    "ToolDefinition",
    "ToolRegistry",
    "__version__",
]
