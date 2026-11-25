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
from .model_backend import OpenAICompatibleBackend
from .pipeline_agent import AgentPipeline, PipelineAgentOutcome
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
    "OpenAICompatibleBackend",
    "PipelineAgentOutcome",
    "SlashCommandCatalog",
    "TaskIntent",
    "ToolDefinition",
    "ToolRegistry",
    "__version__",
]
