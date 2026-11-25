"""Auditable agent orchestration over the RIGOR-X pipeline.

The model/tool loop is run once by AgentRuntime. Pipeline stages record routing,
execution reconciliation, evidence hashes and a deterministic verification gate.
Raw prompts and tool output bodies are not persisted in snapshots.
"""
from __future__ import annotations

from hashlib import sha256
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

from .agent_runtime import AgentResult, AgentRuntime, AgentStatus, ToolStatus
from .contracts import ArtifactKind, StageArtifact
from .pipeline import PipelineRun, RunStatus, Stage
from .storage import SQLitePipelineStore


class PipelineAgentError(RuntimeError):
    """Unexpected error with durable pipeline failure state."""


@dataclass(frozen=True, slots=True)
class PipelineAgentOutcome:
    run_id: str
    pipeline_status: RunStatus
    verified: bool
    verification_reasons: tuple[str, ...]
    agent_result: AgentResult
    artifacts: tuple[StageArtifact, ...]
    snapshot: Mapping[str, Any]
    storage_revision: int

    def to_dict(self) -> dict[str, Any]:
        return {
            "run_id": self.run_id,
            "pipeline_status": self.pipeline_status.value,
            "verified": self.verified,
            "verification_reasons": list(self.verification_reasons),
            "agent_result": self.agent_result.to_dict(),
            "artifacts": [item.to_dict() for item in self.artifacts],
            "snapshot": dict(self.snapshot),
            "storage_revision": self.storage_revision,
        }


class AgentPipeline:
    """Execute a task through stage controls and persist each transition."""

    def __init__(self, runtime: AgentRuntime, store: SQLitePipelineStore, *, max_reentries: int = 4) -> None:
        if isinstance(max_reentries, bool) or not isinstance(max_reentries, int) or max_reentries < 0:
            raise ValueError("max_reentries must be a non-negative integer")
        self.runtime = runtime
        self.store = store
        self.max_reentries = max_reentries

    @staticmethod
    def _digest(value: str) -> str:
        return sha256(value.encode("utf-8")).hexdigest()

    @staticmethod
    def _research_tools(names: tuple[str, ...]) -> tuple[str, ...]:
        markers = ("search", "web", "browser", "research", "fetch", "source", "crawl")
        return tuple(name for name in names if any(marker in name.casefold() for marker in markers))

    def _verify(self, result: AgentResult) -> tuple[bool, tuple[str, ...]]:
        reasons: list[str] = []
        if result.status is not AgentStatus.COMPLETED:
            reasons.append(f"Agent ended with {result.status.value}, not COMPLETED.")
        if not result.response.strip():
            reasons.append("Final response is empty.")
        if result.tool_calls != len(result.receipts):
            reasons.append("Tool-call count does not match receipt count.")
        for receipt in result.receipts:
            if receipt.status is not ToolStatus.EXECUTED:
                reasons.append(f"{receipt.tool_name}: tool receipt is {receipt.status.value}.")
            if receipt.status is ToolStatus.EXECUTED and receipt.output is None:
                reasons.append(f"{receipt.tool_name}: executed without a returned output.")
            if len(receipt.input_digest) != 64:
                reasons.append(f"{receipt.tool_name}: malformed input digest.")
        intent = result.adaptive_profile.intent.value if result.adaptive_profile else ""
        if intent == "EXECUTION" and not any(r.status is ToolStatus.EXECUTED for r in result.receipts):
            reasons.append("Execution-intent task has no successful action receipt.")
        if intent == "RESEARCH":
            executed_names = tuple(r.tool_name for r in result.receipts if r.status is ToolStatus.EXECUTED)
            if not self._research_tools(executed_names):
                reasons.append("Research-intent task has no successful source-acquisition receipt.")
        return not reasons, tuple(reasons)

    def run(self, prompt: str, *, run_id: str, override_level: Any = None) -> PipelineAgentOutcome:
        if not isinstance(prompt, str) or not prompt.strip():
            raise ValueError("prompt must be non-empty")
        if not isinstance(run_id, str) or not run_id.strip():
            raise ValueError("run_id must be non-empty")
        run = PipelineRun(run_id, max_reentries=self.max_reentries)
        revision = self.store.save(run)
        artifacts: list[StageArtifact] = []
        artifact_refs: list[str] = []

        def persist() -> None:
            nonlocal revision
            revision = self.store.save(run, expected_revision=revision)

        def begin() -> None:
            run.begin_stage()
            persist()

        def create_artifact(stage: Stage, metadata: Mapping[str, Any]) -> StageArtifact:
            artifact = StageArtifact(
                stage=stage,
                artifact_id=f"{run_id}:{stage.value}:{len(artifacts) + 1:02d}",
                kind=ArtifactKind(stage.value),
                schema_version="1.0.0",
                input_refs=tuple(artifact_refs[-3:]),
                metadata=metadata,
            )
            artifacts.append(artifact)
            artifact_refs.append(artifact.artifact_id)
            return artifact

        def finish(artifact: StageArtifact, *, verification_passed: bool | None = None) -> None:
            run.complete_stage(result_ref=artifact.artifact_id, verification_passed=verification_passed)
            persist()

        # 1 — context: hash only; do not persist raw prompt.
        begin()
        item = create_artifact(Stage.CONTEXT, {"prompt_sha256": self._digest(prompt), "prompt_chars": len(prompt), "raw_prompt_persisted": False})
        finish(item)

        # 2 — intent/adaptive profile.
        begin()
        profile = self.runtime.adaptive_router.route(prompt, override_level=override_level)
        item = create_artifact(Stage.INTENT, {"adaptive_profile": profile.to_dict()})
        finish(item)

        # 3 — knowledge/domain activation.
        begin()
        domains = self.runtime.domain_router.activate(prompt) if self.runtime.domain_router else ()
        item = create_artifact(Stage.KNOWLEDGE, {"activated_domains": [domain.to_dict() for domain in domains], "domain_catalogue_loaded": self.runtime.domain_router is not None})
        finish(item)

        # 4 — research is explicitly skipped until dedicated planner exists.
        begin()
        item = create_artifact(Stage.RESEARCH, {"implementation_status": "NOT_IMPLEMENTED", "reason": "Dedicated source-acquisition planner unavailable; registered tools may still be used in agent loop."})
        run.skip_stage(reason="Dedicated research planner/source-acquisition stage is not implemented.")
        persist()

        # 5 — routing/capability inventory.
        begin()
        tools = [tool.name for tool in self.runtime.registry.available()]
        item = create_artifact(Stage.ROUTING, {"available_tools": tools, "tool_count": len(tools), "granted_capabilities": sorted(self.runtime.capabilities)})
        finish(item)

        # 6 — model reasoning and tool loop.
        begin()
        try:
            result = self.runtime.run(prompt, run_id=run_id, override_level=override_level)
        except Exception as exc:
            run.mark_failed(reason=f"Agent runtime boundary: {type(exc).__name__}")
            persist()
            raise PipelineAgentError(f"Runtime failed; pipeline run recorded as {run.status.value}") from None
        item = create_artifact(Stage.REASONING, {"agent_status": result.status.value, "model_turns": result.model_turns, "tool_calls": result.tool_calls, "response_sha256": self._digest(result.response)})
        finish(item)

        # 7 — reconcile receipts; never replay actions.
        begin()
        counts = {status.value: sum(receipt.status is status for receipt in result.receipts) for status in ToolStatus}
        item = create_artifact(Stage.EXECUTION, {"receipts": [receipt.to_dict() for receipt in result.receipts], "receipt_counts": counts, "actions_replayed": False})
        finish(item)

        # 8 — evidence ledger references and digests, no raw output.
        begin()
        run.record_evidence(evidence_type="AGENT_RESPONSE", source_ref=f"sha256:{self._digest(result.response)", metadata={"response_chars": len(result.response)})
        for receipt in result.receipts:
            run.record_evidence(
                evidence_type=f"TOOL_{receipt.status.value}",
                source_ref=f"receipt:{receipt.receipt_id}",
                metadata={
                    "tool_name": receipt.tool_name,
                    "input_digest": receipt.input_digest,
                    "output_digest": self._digest(str(receipt.output)) if receipt.output is not None else None,
                },
            )
        evidence_count = sum(event.stage is Stage.EVIDENCE and event.event_type == "EVIDENCE_CAPTURED" for event in run.events)
        item = create_artifact(Stage.EVIDENCE, {"evidence_event_count": evidence_count, "raw_tool_outputs_persisted": False})
        finish(item)

        # 9 — explicit deterministic acceptance gate.
        begin()
        verified, reasons = self._verify(result)
        item = create_artifact(Stage.VERIFICATION, {"passed": verified, "reasons": list(reasons), "criteria_version": "1.0.0"})
        finish(item, verification_passed=verified)
        if not verified:
            return PipelineAgentOutcome(run_id, run.status, False, reasons, result, tuple(artifacts), run.snapshot(), revision)

        # 10 — decision/result state.
        begin()
        item = create_artifact(Stage.DECISION, {"decision": "COMPLETED", "response_sha256": self._digest(result.response)})
        finish(item)

        # 11 — feedback metrics.
        begin()
        item = create_artifact(Stage.FEEDBACK, {"elapsed_seconds": result.elapsed_seconds, "model_turns": result.model_turns, "tool_calls": result.tool_calls, "verified": verified, "reentries": run.reentry_count})
        finish(item)
        return PipelineAgentOutcome(run_id, run.status, verified, reasons, result, tuple(artifacts), run.snapshot(), revision)
