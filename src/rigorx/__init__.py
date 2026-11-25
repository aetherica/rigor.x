"""RIGOR-X deterministic control and live agent orchestration core."""

__version__ = "0.4.0.dev0"

from .adaptive_router import AdaptiveLevel, AdaptiveProfile, AdaptiveRouter, TaskIntent
from .agent_runtime import (
    AgentBudget,
    AgentResult,
    AgentRuntime,
    AgentStatus,
    ToolDefinition,
    ToolRegistry,
)
from .domain_router import DomainActivation, DomainCatalog, DomainRouter
from .host_engine import EngineError, HostEngine
from .model_backend import OpenAICompatibleBackend
from .pipeline_agent import AgentPipeline, PipelineAgentOutcome
from .run_store import RunStore, SQLiteRunStore
from .slash_commands import CommandResolution, SlashCommandCatalog

__all__ = [
    "AdaptiveLevel",
    "AdaptiveProfile",
    "AdaptiveRouter",
    "AgentBudget",
    "AgentPipeline",
    "AgentResult",
    "AgentRuntime",
    "AgentStatus",
    "CommandResolution",
    "DomainActivation",
    "DomainCatalog",
    "DomainRouter",
    "EngineError",
    "HostEngine",
    "OpenAICompatibleBackend",
    "PipelineAgentOutcome",
    "RunStore",
    "SQLiteRunStore",
    "SlashCommandCatalog",
    "TaskIntent",
    "ToolDefinition",
    "ToolRegistry",
    "__version__",
]
