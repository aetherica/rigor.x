"""End-to-end smoke test for the RIGOR-X MCP server over stdio.

Starts `python -m rigorx.mcp_server` as a subprocess (as Claude Desktop would),
then plays the role of a host AI: lists tools, runs one task through every
stage, records evidence, passes the verification gate and completes the run.

Usage (from the repository root, after `pip install -e '.[mcp]'`):
    python examples/mcp_smoke.py                                  # local stdio server
    python examples/mcp_smoke.py --url https://<worker>/mcp --token <token>   # deployed server
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys
import tempfile
from pathlib import Path

from mcp import Client, StdioServerParameters

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "library" / "slash-commands" / "commands.json"
STAGES = ["INTENT", "KNOWLEDGE", "RESEARCH", "ROUTING", "REASONING", "EXECUTION", "EVIDENCE"]


def show(label: str, result) -> dict:
    if result.is_error:
        print(f"  ✗ {label}: {result.content[0].text}")
        raise SystemExit(1)
    data = result.structured_content or {}
    stage = data.get("current_stage")
    print(f"  ✓ {label}" + (f"  → stage: {stage}" if stage else ""))
    return data


def _target(options: argparse.Namespace, tmp: str):
    if options.url:
        import httpx2
        from mcp.client.streamable_http import streamable_http_client

        headers = {"Authorization": f"Bearer {options.token}"} if options.token else {}
        return streamable_http_client(options.url, http_client=httpx2.AsyncClient(headers=headers, timeout=60))
    args = ["-m", "rigorx.mcp_server", "--database", str(Path(tmp) / "smoke.sqlite")]
    if CATALOG.exists():
        args += ["--catalog", str(CATALOG)]
    # Make `rigorx` importable in the subprocess even without `pip install -e`.
    env = {**os.environ, "PYTHONPATH": os.pathsep.join(filter(None, [str(ROOT / "src"), os.environ.get("PYTHONPATH")]))}
    return StdioServerParameters(command=sys.executable, args=args, env=env)


async def main(options: argparse.Namespace) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        async with Client(_target(options, tmp)) as client:
            tools = (await client.list_tools()).tools
            print(f"Server tools ({len(tools)}): {', '.join(t.name for t in tools)}\n")

            route = show("route", await client.call_tool("rigorx_route", {"task": "What is gravity?"}))
            print(f"    intent={route['profile']['intent']} level={route['profile']['level']}")
            if CATALOG.exists() or options.url:
                resolved = await client.call_tool("rigorx_resolve_commands", {"text": "/eli5 explain gravity"})
                if resolved.is_error and "not loaded" in resolved.content[0].text:
                    print("  - resolve /eli5: catalogue not available on this server (skipped)")
                else:
                    print(f"    {show('resolve /eli5', resolved)['applied_modifiers']}")

            run = show("start run", await client.call_tool("rigorx_start_run", {"task": "What is gravity?"}))
            run_id = run["run_id"]
            show("CONTEXT", await client.call_tool("rigorx_submit_stage", {"run_id": run_id, "stage": "CONTEXT", "outcome": "completed", "summary": "A physics question about gravity; one encyclopedia source is available."}))
            evidence = show("record evidence", await client.call_tool("rigorx_record_evidence", {"run_id": run_id, "source_ref": "https://en.wikipedia.org/wiki/Gravity", "claim": "Masses attract each other through gravity"}))
            for stage in STAGES:
                skip = stage in {"RESEARCH", "EXECUTION"}
                arguments = {"run_id": run_id, "stage": stage, "outcome": "skipped" if skip else "completed", "summary": f"{stage}: work for this stage was done and checked against the question."}
                if skip:
                    arguments["reason"] = "not needed for this question"
                show(stage + (" (skipped)" if skip else ""), await client.call_tool("rigorx_submit_stage", arguments))

            bad = await client.call_tool("rigorx_verify", {"run_id": "rx_" + "x" * 32, "criteria": []})
            print(f"  ✓ unknown run rejected: {bad.content[0].text}" if bad.is_error else "  ✗ unknown run was accepted")

            verdict = show("verify", await client.call_tool("rigorx_verify", {"run_id": run_id, "criteria": [{"criterion": "The answer cites a source", "passed": True, "evidence_ids": [evidence["evidence_id"]]}]}))
            print(f"    {verdict['wording']}")
            show("DECISION", await client.call_tool("rigorx_submit_stage", {"run_id": run_id, "stage": "DECISION", "outcome": "completed", "summary": "Answer: gravity is the mutual attraction between masses, per the cited source."}))
            done = show("FEEDBACK", await client.call_tool("rigorx_submit_stage", {"run_id": run_id, "stage": "FEEDBACK", "outcome": "completed", "summary": "Feedback: one source was enough; research and execution were rightly skipped."}))
            print(f"\nRun status: {done['status']}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--url", help="Streamable HTTP endpoint of a running server (default: start a local stdio server)")
    parser.add_argument("--token", help="Bearer token for the server, if it requires one")
    asyncio.run(main(parser.parse_args()))
