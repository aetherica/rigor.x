"""Runnable RIGOR-X pipeline CLI for a configured model endpoint.

This command runs the 11-stage pipeline and persists stage receipts. It does not
register any external plugin tools; tool callbacks require a real host adapter.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from uuid import uuid4

from rigorx.adaptive_router import AdaptiveLevel
from rigorx.agent_runtime import AgentRuntime, ToolRegistry
from rigorx.domain_router import DomainCatalog, DomainRouter
from rigorx.model_backend import OpenAICompatibleBackend
from rigorx.pipeline_agent import AgentPipeline
from rigorx.slash_commands import SlashCommandCatalog
from rigorx.storage import SQLitePipelineStore


def _default_database() -> str:
    return os.environ.get("RIGORX_DATABASE", str(Path.home() / ".local" / "share" / "rigorx" / "runs.sqlite"))


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="rigorx-agent", description="Run a task through the RIGOR-X 11-stage pipeline.")
    parser.add_argument("prompt", nargs="*", help="Task/question text. If omitted, read stdin.")
    parser.add_argument("--base-url", default=os.environ.get("RIGORX_MODEL_BASE_URL"))
    parser.add_argument("--model", default=os.environ.get("RIGORX_MODEL_NAME"))
    parser.add_argument("--api-key-env", default="RIGORX_API_KEY", help="Environment variable containing API key.")
    parser.add_argument("--run-id", default=None)
    parser.add_argument("--level", choices=[level.value for level in AdaptiveLevel], help="Override adaptive intensity.")
    parser.add_argument("--catalog", help="Optional slash-command catalogue JSON file.")
    parser.add_argument("--domain-catalog", help="Optional historical 36-domain catalogue JSON file.")
    parser.add_argument("--database", default=_default_database(), help="SQLite run ledger path.")
    parser.add_argument("--json", action="store_true", dest="json_output", help="Print full task result and pipeline receipts.")
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
        domains = DomainRouter(DomainCatalog.from_file(args.domain_catalog)) if args.domain_catalog else None
        runtime = AgentRuntime(backend, ToolRegistry(), command_catalog=catalog, domain_router=domains)
        with SQLitePipelineStore(args.database) as store:
            outcome = AgentPipeline(runtime, store).run(
                prompt,
                run_id=args.run_id or str(uuid4()),
                override_level=AdaptiveLevel(args.level) if args.level else None,
            )
    except (ValueError, OSError, RuntimeError, sqlite3.Error) as exc:
        print(f"Configuration error: {type(exc).__name__}", file=sys.stderr)
        return 2
    if args.json_output:
        print(json.dumps(outcome.to_dict(), ensure_ascii=False, indent=2))
    else:
        print(outcome.agent_result.response)
        print(
            f"\n[RIGOR-X: pipeline={outcome.pipeline_status.value}; verified={outcome.verified}; "
            f"run={outcome.run_id}; revision={outcome.storage_revision}]"
        )
        if outcome.verification_reasons:
            print("Verification:", "; ".join(outcome.verification_reasons), file=sys.stderr)
    if outcome.verified and outcome.pipeline_status.value == "COMPLETED":
        return 0
    if outcome.pipeline_status.value == "FAILED":
        return 1
    if outcome.pipeline_status.value == "BLOCKED":
        return 3
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
