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


async def walk_protocol_v2(client) -> None:
    """A full L03 run of engine protocol 2: stage contracts, evidence, gate and disclosure."""
    run = show("start run", await client.call_tool("rigorx_start_run", {"task": "Research what gravity is, with sources"}))
    if run.get("engine_protocol_version") != "2.0.0":
        print(f"  ✗ expected engine protocol 2.0.0, got {run.get('engine_protocol_version')}")
        raise SystemExit(1)
    run_id = run["run_id"]
    print(f"    level={run['level']} mandatory={','.join(run['mandatory_stages'])}")

    async def submit(stage: str, summary: str, data: dict | None = None) -> dict:
        return show(stage, await client.call_tool("rigorx_submit_stage", {"run_id": run_id, "stage": stage, "outcome": "completed", "summary": summary, "data": data or {}}))

    await submit("QUERY", "A physics question about gravity; an encyclopedia source is available to cite.")
    await submit("CLASSIFY", "Objective, deliverable and one pre-registered requirement are declared.", {
        "objective": "Explain what gravity is in plain words",
        "deliverable": "A short answer that cites one source",
        "level": "L03_DEEP", "stakes": "low",
        "requirements": [{"id": "R1", "text": "The answer cites a source for its definition"}],
    })
    await submit("SELECT_METHODS", "One method selected: read a reference source and summarize it.", {"methods": [{"name": "source review", "reason": "a reference source defines the term"}]})
    await submit("IDENTIFY_CAPABILITIES", "Web search is available; nothing else is needed for this task.", {"available": ["web_search"], "missing": []})
    await submit("PLAN", "One operation: look up the definition of gravity in a reference source.", {"operations": [{"id": "op1", "capability": "web_search", "depends_on": [], "completion_condition": "A reference source for the definition is recorded", "requirement_ids": ["R1"]}]})
    evidence = show("record evidence", await client.call_tool("rigorx_record_evidence", {"run_id": run_id, "source_ref": "https://en.wikipedia.org/wiki/Gravity", "claim": "Masses attract each other through gravity", "as_of": "2026-11-26"}))
    ev = evidence["evidence_id"]
    await submit("EXECUTE", "The lookup was done and the reference source was recorded as evidence.", {"operations": [{"id": "op1", "status": "done", "evidence_ids": [ev]}]})
    await submit("EVALUATE_EVIDENCE", "The one claim rests on the recorded source and is marked as supported.", {"claims": [{"id": "C1", "text": "Gravity is the mutual attraction between masses", "status": "SUPPORTED", "evidence_ids": [ev], "requirement_ids": ["R1"]}]})
    verdict = show("verify", await client.call_tool("rigorx_verify", {"run_id": run_id, "requirements": [{"id": "R1", "met": True, "evidence_ids": [ev]}]}))
    print(f"    {verdict['wording']} levels={verdict['levels']}")
    done = await submit("DELIVER", "Answer: gravity is the mutual attraction between masses, per the cited source.")
    print(f"\nRun status: {done['status']}")
    if done["status"] != "COMPLETED":
        raise SystemExit(1)


async def main(options: argparse.Namespace) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        async with Client(_target(options, tmp), mode=options.mode) as client:
            print(f"Negotiated protocol version: {client.protocol_version} (mode={options.mode})")
            if options.expect_version and client.protocol_version != options.expect_version:
                print(f"  ✗ expected protocol version {options.expect_version}")
                raise SystemExit(1)
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

            if options.url:
                # The Worker serves engine protocol 2 (twelve stages); the local Python server stays on protocol 1.
                await walk_protocol_v2(client)
                return
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
    parser.add_argument("--mode", default="auto", help="MCP SDK connect mode: auto (default), legacy, or a version such as 2026-07-28")
    parser.add_argument("--expect-version", help="Fail unless this protocol version is negotiated")
    asyncio.run(main(parser.parse_args()))
