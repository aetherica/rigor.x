# WS22 — Slash Command Resolver

This resolver provides actual prompt-level execution for command records classified as `MACRO` and `MACRO ALIAS`: it converts the command description into a user-level task modifier and runs it through the live model backend. This is not pretend execution of native tools.

## Rules
- Read and structurally validate the canonical 999-entry JSON catalogue.
- Canonical names win when a token also appears as an alias.
- Duplicate command IDs, canonical names and conflicting aliases fail validation.
- Macro descriptions are passed as user-level task preferences, never elevated above system policy.
- Unknown slash tokens are retained and surfaced.
- Native, platform-native, UI/menu and image-keyword records are pass-through with explicit notice; they require actual host capabilities and are not activated by catalogue presence.
- The command catalogue is optional. Without one, the engine does not claim slash command resolution.

## API
```python
from pathlib import Path
from rigorx.agent_runtime import AgentRuntime, ToolRegistry
from rigorx.model_backend import OpenAICompatibleBackend
from rigorx.slash_commands import SlashCommandCatalog

catalog = SlashCommandCatalog.from_file(Path("library/slash-commands/commands.json"))
backend = OpenAICompatibleBackend(base_url="https://provider.example/v1", model="your-model")
agent = AgentRuntime(backend, ToolRegistry(), command_catalog=catalog)
result = agent.run("/tldr summarize this report", run_id="run-001")
print(result.applied_modifiers, result.response)
```

## Acceptance
- Repository corpus census: 999 entries.
- Alias/canonical collision regression.
- Macro transformation, native pass-through, unknown-command preservation.
- Agent result records modifier and command-resolution metadata.
