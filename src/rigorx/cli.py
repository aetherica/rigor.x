"""Runnable text-agent CLI for a configured model endpoint.

No external tool/plugin handlers are registered by this CLI. Host integrations
can instantiate AgentRuntime and register real callback tools in their own code.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from uuid import uuid4

from rigorx.adaptive_router import AdaptiveLevel
from rigorx.agent_runtime import AgentRuntime, ToolRegistry
from rigorx.model_backend import OpenAICompatibleBackend
from rigorx.slash_commands import SlashCommandCatalog


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="rigorx-agent", description="Run RIGOR-X against a configured model endpoint.")
    parser.add_argument("prompt", nargs="*", help="Task/question text. If omitted, read stdin.")
    parser.add_argument("--base-url", default=os.environ.get("RIGORX_MODEL_BASE_URL"))
    parser.add_argument("--model", default=os.environ.get("RIGORX_MODEL_NAME"))
    parser.add_argument("--api-key-env", default="RIGORX_API_KEY", help="Environment variable containing API key.")
    parser.add_argument("--run-id", default=None)
    parser.add_argument("--level", choices=[level.value for level in AdaptiveLevel], help="Override adaptive intensity.")
    parser.add_argument("--catalog", help="Optional slash-command catalogue JSON file.")
    parser.add_argument("--json", action="store_true", dest="json_output", help="Print complete structured run receipt.")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    prompt = " ".join(args.prompt).strip() if args.prompt else sys.stdin.read().strip()
    if not prompt:
        print("Prompt is required (argument or stdin).", file=sys.stderr)
        return 2
    if not args.base_url or not args.model:
        print("Set RIGORX_MODEL_BASE_URL and RIGORX_MODEL_NAME or pass --base-url and --model.", file=sys.stderr)
        return 2
    try:
        backend = OpenAICompatibleBackend(base_url=args.base_url, model=args.model, api_key_env=args.api_key_env)
        catalog = SlashCommandCatalog.from_file(args.catalog) if args.catalog else None
        runtime = AgentRuntime(backend, ToolRegistry(), command_catalog=catalog)
        result = runtime.run(
            prompt,
            run_id=args.run_id or str(uuid4()),
            override_level=AdaptiveLevel(args.level) if args.level else None,
        )
    except (ValueError, OSError) as exc:
        print(f"Configuration error: {type(exc).__name__}", file=sys.stderr)
        return 2
    if args.json_output:
        print(json.dumps(result.to_dict(), ensure_ascii=False, indent=2))
    else:
        print(result.response)
        print(f"\n[RIGOR-X: {result.status.value}; run={result.run_id}; turns={result.model_turns}; tool_calls={result.tool_calls}]")
    if result.status.value == "COMPLETED":
        return 0
    if result.status.value == "BUDGET_EXHAUSTED":
        return 4
    if result.status.value == "BLOCKED":
        return 3
    if result.status.value == "FAILED":
        return 1
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
