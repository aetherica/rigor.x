"""Generate behaviour fixtures from the Python engine for the TypeScript port.

Writes test/fixtures/parity.json: router profiles for a prompt list, and engine
scenarios driven through ``engine_rpc.dispatch`` (the same envelope the Durable
Object returns). The TypeScript tests replay the scenarios and must produce the
same results. tests/test_ts_parity.py checks that this file still matches the
Python engine, so drift on either side fails CI.

Usage (repository root): PYTHONPATH=src python deploy/cloudflare-ts/scripts/parity_fixtures.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from rigorx.adaptive_router import AdaptiveRouter
from rigorx.engine_rpc import dispatch
from rigorx.host_engine import RELAXED_TEXT_POLICY, HostEngine
from rigorx.run_store import SQLiteRunStore

OUT = Path(__file__).resolve().parents[1] / "test" / "fixtures" / "parity.json"
OWNER = "issuer|alice"
OTHER = "issuer|bob"

PROMPTS = [
    "What is gravity?",
    "Explain the bookmark feature",
    "List the open resources",
    "What is the capital of France?",
    "Please update my notes",
    "Debug this code",
    "Research the latest policy and verify sources.",
    "Review this medication decision.",
    "Perform a hyper-rigorous adversarial audit.",
    "/l06 answer a simple question",
    "What is at example.com/critical?",
    "Compare the historical causes and quantitative impact of the policy.",
    "Execute and delete permanently after production system audit",
    "Should I choose option A or B? Give pros and cons.",
    "Write a short story about a robot",
    "Translate this email into French",
    "Describe an embankment",
    "Analyze why the deployment failed step by step and then propose a fix",
    "Please update the record and send the email",
    "Brainstorm several strategic positioning options for a long-term plan",
]

BEFORE_VERIFY = ["INTENT", "KNOWLEDGE", "RESEARCH", "ROUTING", "REASONING", "EXECUTION", "EVIDENCE"]


def steps_to_verification(skip=("RESEARCH", "EXECUTION")):
    out = []
    for stage in BEFORE_VERIFY:
        if stage in skip:
            out.append(["submit_stage", {"run_id": "$RUN", "stage": stage, "outcome": "skipped", "summary": "n/a", "reason": "not needed"}])
        else:
            out.append(["submit_stage", {"run_id": "$RUN", "stage": stage, "outcome": "completed", "summary": f"{stage} done"}])
    return out


SCENARIOS = {
    "full_run": [
        ["start_run", {"task": "What is gravity?"}],
        ["submit_stage", {"run_id": "$RUN", "stage": "CONTEXT", "outcome": "completed", "summary": "ctx"}],
        ["record_evidence", {"run_id": "$RUN", "source_ref": "https://example.org/physics", "claim": "Masses attract"}],
        *steps_to_verification(),
        ["submit_stage", {"run_id": "$RUN", "stage": "VERIFICATION", "outcome": "completed", "summary": "trust me"}],
        ["verify", {"run_id": "$RUN", "criteria": [{"criterion": "Answer cites a source", "passed": True, "evidence_ids": ["ev-4"]}]}],
        ["submit_stage", {"run_id": "$RUN", "stage": "DECISION", "outcome": "completed", "summary": "final"}],
        ["submit_stage", {"run_id": "$RUN", "stage": "FEEDBACK", "outcome": "completed", "summary": "none"}],
        ["record_evidence", {"run_id": "$RUN", "source_ref": "late", "claim": "late"}],
    ],
    "gate_failure_and_reentry": [
        ["start_run", {"task": "What is gravity?"}],
        ["submit_stage", {"run_id": "$RUN", "stage": "INTENT", "outcome": "completed", "summary": "jump ahead"}],
        ["submit_stage", {"run_id": "$RUN", "stage": "CONTEXT", "outcome": "completed", "summary": "ctx"}],
        *steps_to_verification(),
        ["verify", {"run_id": "$RUN", "criteria": [
            {"criterion": "uncited", "passed": True, "evidence_ids": []},
            {"criterion": "dangling", "passed": True, "evidence_ids": ["ev-999"]},
            {"criterion": "bad", "passed": "yes"},
        ]}],
        ["submit_stage", {"run_id": "$RUN", "stage": "DECISION", "outcome": "completed", "summary": "skip the gate"}],
        ["reenter", {"run_id": "$RUN", "target_stage": "VERIFICATION", "trigger": "t", "reason": "r"}],
        ["reenter", {"run_id": "$RUN", "target_stage": "EVIDENCE", "trigger": "gate_failed", "reason": "missing evidence"}],
        ["record_evidence", {"run_id": "$RUN", "source_ref": "doc:1", "claim": "c"}],
        ["submit_stage", {"run_id": "$RUN", "stage": "EVIDENCE", "outcome": "completed", "summary": "ok"}],
        ["verify", {"run_id": "$RUN", "criteria": [{"criterion": "cited", "passed": True, "evidence_ids": ["ev-22"]}]}],
    ],
    "research_and_execution_intents": [
        ["start_run", {"task": "Please update the record and send the email"}],
        ["submit_stage", {"run_id": "$RUN", "stage": "CONTEXT", "outcome": "partial", "summary": "half", "reason": "more later"}],
        ["submit_stage", {"run_id": "$RUN", "stage": "CONTEXT", "outcome": "completed", "summary": "full"}],
        ["submit_stage", {"run_id": "$RUN", "stage": "INTENT", "outcome": "blocked", "summary": "x", "reason": "need user"}],
        ["submit_stage", {"run_id": "$RUN", "stage": "INTENT", "outcome": "completed", "summary": "y"}],
        *steps_to_verification()[1:],
        ["report_action", {"run_id": "$RUN", "tool_name": "send_email", "status": "FAILED", "receipt_ref": "mail:1"}],
        ["report_action", {"run_id": "$RUN", "tool_name": "send_email", "status": "EXECUTED", "resolves": "ev-1"}],
        ["verify", {"run_id": "$RUN", "criteria": [{"criterion": "sent", "passed": True, "evidence_ids": ["ev-24"]}]}],
        ["reenter", {"run_id": "$RUN", "target_stage": "EXECUTION", "trigger": "gate_failed", "reason": "retry"}],
        ["report_action", {"run_id": "$RUN", "tool_name": "send_email", "status": "EXECUTED", "receipt_ref": "mail:2", "resolves": "ev-24"}],
        ["submit_stage", {"run_id": "$RUN", "stage": "EXECUTION", "outcome": "completed", "summary": "s"}],
        ["submit_stage", {"run_id": "$RUN", "stage": "EVIDENCE", "outcome": "completed", "summary": "s"}],
        ["verify", {"run_id": "$RUN", "criteria": [{"criterion": "sent", "passed": True, "evidence_ids": ["ev-29"]}]}],
    ],
    "research_without_sources": [
        ["start_run", {"task": "Research the latest policy and cite sources"}],
        ["submit_stage", {"run_id": "$RUN", "stage": "CONTEXT", "outcome": "completed", "summary": "c"}],
        *steps_to_verification(),
        ["report_action", {"run_id": "$RUN", "tool_name": "web_search", "status": "EXECUTED"}],
        ["verify", {"run_id": "$RUN", "criteria": [{"criterion": "c", "passed": True, "evidence_ids": ["ev-17"]}]}],
    ],
    "isolation_validation_cancel_delete": [
        ["start_run", {"task": "Explain gravity"}],
        ["get_run", {"run_id": "$RUN"}, OTHER],
        ["delete_run", {"run_id": "$RUN"}, OTHER],
        ["get_run", {"run_id": "rx_doesnotexist000000000000000000"}],
        ["submit_stage", {"run_id": "$RUN", "stage": "NOPE", "outcome": "completed", "summary": "x"}],
        ["submit_stage", {"run_id": "$RUN", "stage": "CONTEXT", "outcome": "done", "summary": "x"}],
        ["submit_stage", {"run_id": "$RUN", "stage": "CONTEXT", "outcome": "partial", "summary": "half"}],
        ["record_evidence", {"run_id": "$RUN", "source_ref": "a", "claim": "c", "evidence_type": "HOST_REPORTED_ACTION"}],
        ["record_evidence", {"run_id": "$RUN", "source_ref": "a", "claim": "c", "evidence_type": "lower"}],
        ["report_action", {"run_id": "$RUN", "tool_name": "t", "status": "MAYBE"}],
        ["cancel_run", {"run_id": "$RUN", "reason": "user stopped"}],
        ["submit_stage", {"run_id": "$RUN", "stage": "CONTEXT", "outcome": "completed", "summary": "x"}],
        ["delete_run", {"run_id": "$RUN"}],
        ["get_run", {"run_id": "$RUN"}],
        ["unknown_op", {}],
    ],
}


# Scenarios run with the default (strict) text policy; all others with the relaxed policy, because
# they exercise stage order, ownership and the gate rather than text substance.
STRICT = "$RUN"
SCENARIOS["strict_text_policy"] = [
    ["start_run", {"task": "Compare two database designs for a service"}],
    ["submit_stage", {"run_id": STRICT, "stage": "CONTEXT", "outcome": "completed", "summary": "ctx"}],
    ["submit_stage", {"run_id": STRICT, "stage": "CONTEXT", "outcome": "completed", "summary": "The user wants two database designs compared for one small service."}],
    ["submit_stage", {"run_id": STRICT, "stage": "INTENT", "outcome": "completed", "summary": "the user wants two DATABASE designs compared for one small   service."}],
    ["submit_stage", {"run_id": STRICT, "stage": "INTENT", "outcome": "completed", "summary": "Deliver a recommendation with storage, latency and migration cost criteria."}],
    ["submit_stage", {"run_id": STRICT, "stage": "KNOWLEDGE", "outcome": "skipped", "summary": "skipped", "reason": "n/a"}],
    ["submit_stage", {"run_id": STRICT, "stage": "KNOWLEDGE", "outcome": "skipped", "summary": "skipped", "reason": "domain facts come from the research sources"}],
    ["record_evidence", {"run_id": STRICT, "source_ref": "https://example.org/x", "claim": "c"}],
    ["record_evidence", {"run_id": STRICT, "source_ref": "https://example.org/storage", "claim": "Design A stores up to ten gigabytes per tenant"}],
    ["record_evidence", {"run_id": STRICT, "source_ref": "https://example.org/latency", "claim": "Design B adds one network hop per query"}],
    ["submit_stage", {"run_id": STRICT, "stage": "RESEARCH", "outcome": "completed", "summary": "Two sources recorded: tenant storage limits of A and query latency of B."}],
    ["submit_stage", {"run_id": STRICT, "stage": "ROUTING", "outcome": "completed", "summary": "Comparative technical analysis at standard depth, no external actions needed."}],
    ["submit_stage", {"run_id": STRICT, "stage": "REASONING", "outcome": "completed", "summary": "A fits per-tenant isolation; B costs latency but eases cross-tenant reporting."}],
    ["submit_stage", {"run_id": STRICT, "stage": "EXECUTION", "outcome": "skipped", "summary": "skipped", "reason": "a recommendation needs no actions"}],
    ["submit_stage", {"run_id": STRICT, "stage": "EVIDENCE", "outcome": "completed", "summary": "Each comparison point is backed by one recorded source of its own."}],
    ["verify", {"run_id": STRICT, "criteria": [{"criterion": "ok", "passed": True, "evidence_ids": ["ev-8"]}]}],
    ["verify", {"run_id": STRICT, "criteria": [
        {"criterion": "Storage limits are identified", "passed": True, "evidence_ids": ["ev-8"]},
        {"criterion": "Latency trade-off is identified", "passed": True, "evidence_ids": ["ev-8"]},
    ]}],
    ["reenter", {"run_id": STRICT, "target_stage": "EVIDENCE", "trigger": "gate_failed", "reason": "each criterion needs its own source"}],
    ["submit_stage", {"run_id": STRICT, "stage": "EVIDENCE", "outcome": "completed", "summary": "Re-checked: storage cites the storage source, latency the latency source."}],
    ["verify", {"run_id": STRICT, "criteria": [
        {"criterion": "Storage limits are identified", "passed": True, "evidence_ids": ["ev-8"]},
        {"criterion": "Latency trade-off is identified", "passed": True, "evidence_ids": ["ev-8", "ev-9"]},
    ]}],
    ["reenter", {"run_id": STRICT, "target_stage": "EVIDENCE", "trigger": "gate_failed", "reason": "storage criterion shares its only source"}],
    ["submit_stage", {"run_id": STRICT, "stage": "EVIDENCE", "outcome": "completed", "summary": "Final check: storage and latency criteria each cite a distinct source now."}],
    ["verify", {"run_id": STRICT, "criteria": [
        {"criterion": "Storage limits are identified", "passed": True, "evidence_ids": ["ev-8"]},
        {"criterion": "Latency trade-off is identified", "passed": True, "evidence_ids": ["ev-9"]},
    ]}],
]
# Scripts without spaces between words: substantive summaries in Chinese, Japanese and Thai pass,
# a short Chinese summary and a short Thai claim fail, Bengali and English behave as before.
MULTI = "$RUN"
SCENARIOS["multilingual_text_policy"] = [
    ["start_run", {"task": "Summarize the context in several languages"}],
    ["submit_stage", {"run_id": MULTI, "stage": "CONTEXT", "outcome": "completed", "summary": "我们收集了背景资料。"}],
    ["submit_stage", {"run_id": MULTI, "stage": "CONTEXT", "outcome": "completed", "summary": "我们收集了用户提供的所有背景资料，确认了现有的约束条件、可用工具以及仍然缺失的信息。"}],
    ["submit_stage", {"run_id": MULTI, "stage": "INTENT", "outcome": "completed", "summary": "ユーザーが提供した背景情報をすべて収集し、既存の制約条件と利用可能なツールを確認しました。"}],
    ["submit_stage", {"run_id": MULTI, "stage": "KNOWLEDGE", "outcome": "completed", "summary": "เราได้รวบรวมข้อมูลพื้นฐานทั้งหมดที่ผู้ใช้ให้มาและตรวจสอบข้อจำกัดที่มีอยู่แล้ว"}],
    ["record_evidence", {"run_id": MULTI, "source_ref": "https://example.org/th", "claim": "ข้อมูล"}],
    ["record_evidence", {"run_id": MULTI, "source_ref": "https://example.org/zh", "claim": "该来源说明了每个租户的存储上限"}],
    ["submit_stage", {"run_id": MULTI, "stage": "RESEARCH", "outcome": "completed", "summary": "আমরা ব্যবহারকারীর দেওয়া সব প্রেক্ষাপট সংগ্রহ করেছি এবং সীমাবদ্ধতা যাচাই করেছি"}],
    ["submit_stage", {"run_id": MULTI, "stage": "ROUTING", "outcome": "completed", "summary": "Mixed text 混合文本 with English words and 中文 characters in one summary line."}],
]
STRICT_SCENARIOS = {"strict_text_policy", "multilingual_text_policy"}


def normalize(envelope: dict, run_id: str | None) -> dict:
    """Errors compare by code only (messages are formatted per language); results replace the run ID."""
    if not envelope.get("ok"):
        return {"ok": False, "code": envelope["code"]}
    text = json.dumps(envelope["result"], sort_keys=True)
    if run_id:
        text = text.replace(run_id, "$RUN")
    return {"ok": True, "result": json.loads(text)}


def run_scenarios() -> dict:
    results = {}
    for name, steps in SCENARIOS.items():
        store = SQLiteRunStore(":memory:")
        strict = name in STRICT_SCENARIOS
        engine = HostEngine(store) if strict else HostEngine(store, text_policy=RELAXED_TEXT_POLICY)
        run_id = None
        outputs = []
        for step in steps:
            operation, args = step[0], step[1]
            owner = step[2] if len(step) > 2 else OWNER
            payload = json.loads(json.dumps(args).replace("$RUN", run_id or "$RUN"))
            envelope = json.loads(dispatch(engine, owner, operation, json.dumps(payload)))
            if operation == "start_run" and envelope.get("ok"):
                run_id = envelope["result"]["run_id"]
            outputs.append(normalize(envelope, run_id))
        store.close()
        results[name] = {"steps": steps, "expected": outputs, "text_policy": "default" if strict else "relaxed"}
    return results


def build() -> dict:
    router = AdaptiveRouter()
    return {
        "owner": OWNER,
        "router": [{"prompt": p, "profile": router.route(p).to_dict()} for p in PROMPTS],
        "scenarios": run_scenarios(),
    }


if __name__ == "__main__":
    data = build()
    if "--check" in sys.argv:
        current = json.loads(OUT.read_text(encoding="utf-8"))
        if current != json.loads(json.dumps(data)):
            print("parity.json is out of date; regenerate it", file=sys.stderr)
            raise SystemExit(1)
        print("parity.json matches the Python engine")
    else:
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(json.dumps(data, indent=1, sort_keys=True) + "\n", encoding="utf-8")
        print(f"wrote {OUT}")
