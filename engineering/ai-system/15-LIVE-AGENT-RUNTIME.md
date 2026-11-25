# WS21 — Live Agent Runtime (0.4.0 development)

Adds a **real model/tool-call loop**. It is not a model, plugin provider, or hosted service. A host must inject a live model backend and actual plugin/tool callbacks.

## Components
- `AgentRuntime`: bounded model↔tool loop, context validation, tool dispatch, receipts.
- `ToolRegistry`: explicit host callbacks with JSON Schema object contracts.
- `OpenAICompatibleBackend`: real Chat Completions HTTP transport via stdlib.
- Remote endpoints require HTTPS; HTTP only for localhost/127.0.0.1.
- API key from explicit argument or `RIGORX_API_KEY`; secrets are not logged.
- Capability and approval gates; argument validation; model turns, tool calls, tool output, context, elapsed time and request timeouts are bounded.
- Tool/model exceptions redacted. Tool results must be JSON serializable.
- Callback timeout/cancellation is the adapter's responsibility; core cannot forcibly cancel synchronous side effects.
- Tool/retrieved content is untrusted.

## Quick start
```python
import os
from rigorx.agent_runtime import AgentRuntime, ToolDefinition, ToolRegistry
from rigorx.model_backend import OpenAICompatibleBackend

backend = OpenAICompatibleBackend(
    base_url=os.environ["RIGORX_MODEL_BASE_URL"],
    model=os.environ["RIGORX_MODEL_NAME"],
)
tools = ToolRegistry([
    ToolDefinition(
        name="read_order",
        description="Read an order from the connected ERP",
        parameters={"type":"object","properties":{"order_id":{"type":"string"}},"required":["order_id"],"additionalProperties":False},
        handler=real_erp_callback,  # supplied by the connected integration
        capability="erp.read",
    )
])
agent = AgentRuntime(backend, tools, capabilities=frozenset({"erp.read"}))
result = agent.run("Check order 123 and summarize status.", run_id="task-123")
print(result.to_dict())
```

`real_erp_callback` is integration-supplied wiring, not a repository implementation. Register only actual available connectors. Do not register unavailable actions.

## Setup
```bash
python -m pip install -e '.[test]'
python -m unittest discover -s tests -v
ruff check src tests
```
