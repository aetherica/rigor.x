"""Transport-independent RIGOR-X engine for host plugins (WS31, phase P1).

The host model drives; this engine enforces stage order, bounded re-entry and
the verification gate, and keeps an append-only ledger per run. It never calls
a model. Every method takes the caller's verified ``owner_id`` (supplied by the
authentication layer) and returns JSON-safe dictionaries for the MCP adapter.

Content submitted by the host (stage summaries, evidence claims, criteria) is
stored only as SHA-256 digests and character counts by default.
See engineering/ai-system/24-HOST-PLUGIN-ARCHITECTURE.md.
"""
from __future__ import annotations

import re
import secrets
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from hashlib import sha256
from typing import Any

from .adaptive_router import AdaptiveRouter
from .pipeline import (
    STAGE_ORDER,
    InvalidTransition,
    PipelineRun,
    RunStatus,
    Stage,
    StageStatus,
)
from .run_store import RunNotFound, RunStore
from .slash_commands import SlashCommandCatalog

ENGINE_PROTOCOL_VERSION = "1.0.0"
GATE_VERSION = "1.1.0"
ACTION_EVIDENCE_TYPE = "HOST_REPORTED_ACTION"

STAGE_GUIDANCE: Mapping[Stage, str] = {
    Stage.CONTEXT: "Collect the context the task depends on: prior decisions, constraints, available tools, and what is missing. Submit a short summary.",
    Stage.INTENT: "State what the user actually wants, the expected output and the success criteria. Submit them as the summary.",
    Stage.KNOWLEDGE: "Identify the knowledge domains and known facts that apply, and what must still be looked up.",
    Stage.RESEARCH: "Acquire sources for anything that must be looked up. Record each source with rigorx_record_evidence. Skip with a reason if no research is needed.",
    Stage.ROUTING: "Choose which tools or methods will carry out the work and why. Note any capability that is unavailable.",
    Stage.REASONING: "Work out the answer or plan. Keep reasoning separate from actions: nothing is executed in this stage.",
    Stage.EXECUTION: "Perform the actions with your tools. Report each one with rigorx_report_action, including failures. Skip with a reason if nothing must be executed.",
    Stage.EVIDENCE: "Make sure every claim the answer depends on has recorded evidence. Record anything still missing.",
    Stage.VERIFICATION: "Call rigorx_verify with your success criteria. Each passed criterion must cite evidence IDs. Submitting this stage directly is not allowed.",
    Stage.DECISION: "Decide the final result using only verified material. State remaining limitations.",
    Stage.FEEDBACK: "Note what should change next time (gaps, failures, follow-ups). Completing this stage completes the run.",
}

_ACTIVE_RECOVERABLE = {RunStatus.PARTIAL, RunStatus.BLOCKED}
# FEEDBACK closes the run; a completed run requires a completed FEEDBACK stage.
_NO_SKIP = {Stage.VERIFICATION, Stage.DECISION, Stage.FEEDBACK}
_OUTCOMES = {"completed", "partial", "blocked", "skipped"}
_ACTION_STATUSES = {"EXECUTED", "FAILED", "BLOCKED"}
_EVIDENCE_ID = re.compile(r"ev-([1-9][0-9]{0,6})")


class EngineError(RuntimeError):
    """Base error. ``code`` is a stable machine-readable identifier."""

    code = "ENGINE_ERROR"


class InvalidRequest(EngineError):
    code = "INVALID_REQUEST"


class RunUnavailable(EngineError):
    code = "RUN_NOT_FOUND"


class StageConflict(EngineError):
    code = "STAGE_CONFLICT"


class LimitExceeded(EngineError):
    code = "LIMIT_EXCEEDED"


def _digest(text: str) -> str:
    return sha256(text.encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class TextPolicy:
    """Minimum substance for host-submitted text (counted after trimming; words contain a letter or digit).

    Summaries describe completed stages; notes are reasons, evidence claims and verification
    criteria. With ``distinct_summaries`` a completed stage may not repeat another stage's summary
    (compared case- and whitespace-insensitively). This is a structural check of effort, not of truth.
    """

    min_summary_chars: int = 40
    min_summary_words: int = 6
    min_note_chars: int = 15
    min_note_words: int = 3
    distinct_summaries: bool = True


#: No minimums and no duplicate check; for tests of unrelated behaviour.
RELAXED_TEXT_POLICY = TextPolicy(0, 0, 0, 0, False)


# Scripts written without spaces between words (Unicode blocks): Thai, Lao, Tibetan, Myanmar,
# Khmer, Hiragana, Katakana, CJK ideographs (BMP and supplementary planes), halfwidth Katakana.
# Whitespace does not separate their words, so each of their characters counts as one word unit;
# for such text the word minimum reduces to the character minimum. The same block list is used by
# the TypeScript engine (deploy/cloudflare-ts/src/engine.ts, SPACELESS); parity fixtures cover it.
_SPACELESS = re.compile(
    "[\u0E00-\u0EFF\u0F00-\u0FFF\u1000-\u109F\u1780-\u17FF\u19E0-\u19FF"
    "\u3040-\u30FF\u31F0-\u31FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uFF66-\uFF9F"
    "\U00020000-\U0003134F]"
)


def _words(text: str) -> int:
    total = 0
    for token in text.split():
        spaceless = len(_SPACELESS.findall(token))
        rest = _SPACELESS.sub("", token)
        total += spaceless + (1 if any(ch.isalnum() for ch in rest) else 0)
    return total


def _normalized(text: str) -> str:
    return " ".join(text.lower().split())


def _substantial(name: str, text: str, min_chars: int, min_words: int, hint: str) -> None:
    trimmed = text.strip()
    if len(trimmed) < min_chars or _words(trimmed) < min_words:
        raise InvalidRequest(f"{name} is too short: use at least {min_chars} characters and {min_words} words ({hint})")


def _text(name: str, value: Any, *, max_chars: int, required: bool = True) -> str:
    if value is None and not required:
        return ""
    if not isinstance(value, str):
        raise InvalidRequest(f"{name} must be text")
    if required and not value.strip():
        raise InvalidRequest(f"{name} is required")
    if len(value) > max_chars:
        raise LimitExceeded(f"{name} exceeds {max_chars} characters")
    return value


class HostEngine:
    """Owner-scoped control-plane operations behind the plugin tools."""

    def __init__(
        self,
        store: RunStore,
        *,
        router: AdaptiveRouter | None = None,
        command_catalog: SlashCommandCatalog | None = None,
        max_reentries: int = 6,
        max_evidence_per_run: int = 500,
        max_text_chars: int = 20_000,
        max_ref_chars: int = 2_048,
        max_criteria: int = 50,
        text_policy: TextPolicy | None = None,
    ) -> None:
        for name, value in (
            ("max_evidence_per_run", max_evidence_per_run),
            ("max_text_chars", max_text_chars),
            ("max_ref_chars", max_ref_chars),
            ("max_criteria", max_criteria),
        ):
            if isinstance(value, bool) or not isinstance(value, int) or value < 1:
                raise ValueError(f"{name} must be a positive integer")
        if isinstance(max_reentries, bool) or not isinstance(max_reentries, int) or max_reentries < 0:
            raise ValueError("max_reentries must be a non-negative integer")
        self.store = store
        self.router = router or AdaptiveRouter()
        self.command_catalog = command_catalog
        self.max_reentries = max_reentries
        self.max_evidence_per_run = max_evidence_per_run
        self.max_text_chars = max_text_chars
        self.max_ref_chars = max_ref_chars
        self.max_criteria = max_criteria
        self.text_policy = text_policy or TextPolicy()

    # ------------------------------------------------------------------ stateless tools

    def route(self, task: str) -> dict[str, Any]:
        task = _text("task", task, max_chars=self.max_text_chars)
        return {"profile": self.router.route(task).to_dict(), "heuristic": True}

    def resolve_commands(self, text: str) -> dict[str, Any]:
        text = _text("text", text, max_chars=self.max_text_chars)
        if self.command_catalog is None:
            raise EngineError("Slash-command catalogue is not loaded on this server")
        resolution = self.command_catalog.resolve_prompt(text)
        return {
            "applied_modifiers": list(resolution.applied_modifiers),
            "host_only_commands": list(resolution.pass_through_commands),
            "unknown_commands": list(resolution.unknown_commands),
            "effective_prompt": resolution.effective_prompt,
        }

    # ------------------------------------------------------------------ run lifecycle

    def start_run(self, owner_id: str, task: str) -> dict[str, Any]:
        owner_id = self._owner(owner_id)
        task = _text("task", task, max_chars=self.max_text_chars)
        profile = self.router.route(task)
        run = PipelineRun(f"rx_{secrets.token_urlsafe(24)}", max_reentries=self.max_reentries)
        run.begin_stage()
        meta = {
            "engine_protocol_version": ENGINE_PROTOCOL_VERSION,
            "task_sha256": _digest(task),
            "task_chars": len(task),
            "intent": profile.intent.value,
            "level": profile.level.value,
            "modes": list(profile.modes),
            "verifications": [],
        }
        self.store.create(owner_id, run, meta)
        return self._view(run, meta)

    def get_run(self, owner_id: str, run_id: str) -> dict[str, Any]:
        stored = self._load(owner_id, run_id)
        return self._view(stored.run, stored.meta)

    def submit_stage(
        self,
        owner_id: str,
        run_id: str,
        *,
        stage: str,
        outcome: str,
        summary: str,
        reason: str | None = None,
    ) -> dict[str, Any]:
        stored = self._load(owner_id, run_id)
        run, meta = stored.run, stored.meta
        target = self._stage(stage)
        if outcome not in _OUTCOMES:
            raise InvalidRequest(f"outcome must be one of {sorted(_OUTCOMES)}")
        summary = _text("summary", summary, max_chars=self.max_text_chars)
        self._activate(run)
        if target is not run.current_stage:
            raise StageConflict(f"Current stage is {run.current_stage.value}, not {target.value}")
        if target is Stage.VERIFICATION:
            raise StageConflict("VERIFICATION is completed only through rigorx_verify")
        normalized = _digest(_normalized(summary))
        result_ref = f"summary:sha256:{_digest(summary)}:norm:{normalized}:chars:{len(summary)}"
        try:
            if outcome == "completed":
                self._check_summary(run, target, summary, normalized)
                run.complete_stage(result_ref=result_ref)
            elif outcome == "skipped":
                if target in _NO_SKIP:
                    raise StageConflict(f"{target.value} cannot be skipped")
                run.skip_stage(reason=self._note("reason", reason))
            elif outcome == "partial":
                run.mark_partial(reason=self._note("reason", reason))
            else:
                run.mark_blocked(reason=self._note("reason", reason))
        except InvalidTransition as exc:
            raise StageConflict(str(exc)) from None
        self._advance(run)
        self._save(owner_id, run, meta, stored.revision)
        return self._view(run, meta)

    def record_evidence(
        self,
        owner_id: str,
        run_id: str,
        *,
        source_ref: str,
        claim: str,
        evidence_type: str = "SOURCE",
    ) -> dict[str, Any]:
        stored = self._load(owner_id, run_id)
        run, meta = stored.run, stored.meta
        source_ref = _text("source_ref", source_ref, max_chars=self.max_ref_chars)
        claim = _text("claim", claim, max_chars=self.max_text_chars)
        policy = self.text_policy
        _substantial("claim", claim, policy.min_note_chars, policy.min_note_words, "state what this source supports")
        evidence_type = _text("evidence_type", evidence_type, max_chars=64)
        if not re.fullmatch(r"[A-Z][A-Z0-9_]{0,63}", evidence_type) or evidence_type == ACTION_EVIDENCE_TYPE:
            raise InvalidRequest("evidence_type must be an upper-case identifier and not HOST_REPORTED_ACTION")
        event = self._capture(run, evidence_type, source_ref, {"claim_sha256": _digest(claim), "claim_chars": len(claim)})
        self._save(owner_id, run, meta, stored.revision)
        return {"evidence_id": f"ev-{event.sequence}", "stage": event.stage.value, **self._view(run, meta)}

    def report_action(
        self,
        owner_id: str,
        run_id: str,
        *,
        tool_name: str,
        status: str,
        receipt_ref: str | None = None,
        resolves: str | None = None,
    ) -> dict[str, Any]:
        stored = self._load(owner_id, run_id)
        run, meta = stored.run, stored.meta
        tool_name = _text("tool_name", tool_name, max_chars=128)
        if status not in _ACTION_STATUSES:
            raise InvalidRequest(f"status must be one of {sorted(_ACTION_STATUSES)}")
        receipt_ref = _text("receipt_ref", receipt_ref, max_chars=self.max_ref_chars, required=False)
        details: dict[str, Any] = {"tool_name": tool_name, "status": status, "verification": "HOST_REPORTED"}
        if resolves is not None:
            actions = {item["id"]: item for item in self._actions(run)}
            if resolves not in actions or actions[resolves]["status"] == "EXECUTED":
                raise InvalidRequest("resolves must reference an earlier FAILED or BLOCKED action")
            details["resolves"] = resolves
        source = receipt_ref or f"host-action:{tool_name}"
        event = self._capture(run, ACTION_EVIDENCE_TYPE, source, details)
        self._save(owner_id, run, meta, stored.revision)
        return {"action_id": f"ev-{event.sequence}", **self._view(run, meta)}

    def verify(self, owner_id: str, run_id: str, *, criteria: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
        stored = self._load(owner_id, run_id)
        run, meta = stored.run, stored.meta
        self._activate(run)
        if run.current_stage is not Stage.VERIFICATION:
            raise StageConflict(f"Current stage is {run.current_stage.value}, not VERIFICATION")
        checks, recorded = self._gate(run, meta, criteria)
        passed = all(check["passed"] for check in checks)
        run.complete_stage(result_ref=f"gate:{GATE_VERSION}:{'pass' if passed else 'fail'}", verification_passed=passed)
        meta["verifications"].append({"gate_version": GATE_VERSION, "passed": passed, "checks": checks, "criteria": recorded})
        self._advance(run)
        self._save(owner_id, run, meta, stored.revision)
        return {"passed": passed, "wording": "structurally verified" if passed else "not verified", "checks": checks, **self._view(run, meta)}

    def reenter(self, owner_id: str, run_id: str, *, target_stage: str, trigger: str, reason: str) -> dict[str, Any]:
        stored = self._load(owner_id, run_id)
        run, meta = stored.run, stored.meta
        target = self._stage(target_stage)
        try:
            run.reenter(
                target,
                trigger=_text("trigger", trigger, max_chars=self.max_ref_chars),
                reason=_text("reason", reason, max_chars=self.max_ref_chars),
            )
        except InvalidTransition as exc:
            raise StageConflict(str(exc)) from None
        run.begin_stage()
        self._save(owner_id, run, meta, stored.revision)
        return self._view(run, meta)

    def cancel_run(self, owner_id: str, run_id: str, *, reason: str) -> dict[str, Any]:
        stored = self._load(owner_id, run_id)
        run, meta = stored.run, stored.meta
        try:
            run.cancel(reason=_text("reason", reason, max_chars=self.max_ref_chars))
        except InvalidTransition as exc:
            raise StageConflict(str(exc)) from None
        self._save(owner_id, run, meta, stored.revision)
        return self._view(run, meta)

    def delete_run(self, owner_id: str, run_id: str) -> dict[str, Any]:
        owner_id = self._owner(owner_id)
        try:
            self.store.delete(owner_id, self._run_id(run_id))
        except RunNotFound:
            raise RunUnavailable("Run not found") from None
        return {"run_id": run_id, "deleted": True}

    # ------------------------------------------------------------------ verification gate

    def _gate(
        self, run: PipelineRun, meta: Mapping[str, Any], criteria: Sequence[Mapping[str, Any]]
    ) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
        if not isinstance(criteria, Sequence) or isinstance(criteria, (str, bytes)):
            raise InvalidRequest("criteria must be a list")
        if len(criteria) > self.max_criteria:
            raise LimitExceeded(f"At most {self.max_criteria} criteria are allowed")
        evidence = {item["id"] for item in self._evidence(run)}
        actions = self._actions(run)
        all_ids = evidence | {item["id"] for item in actions}
        checks: list[dict[str, Any]] = []

        before = STAGE_ORDER[: STAGE_ORDER.index(Stage.VERIFICATION)]
        open_stages = [s.value for s in before if run.stage_status[s] not in {StageStatus.COMPLETED, StageStatus.SKIPPED_WITH_REASON}]
        checks.append({"check": "prior_stages_closed", "passed": not open_stages, "detail": open_stages})

        if meta.get("intent") == "RESEARCH":
            checks.append({"check": "research_has_sources", "passed": bool(evidence), "detail": len(evidence)})

        if meta.get("intent") == "EXECUTION":
            resolved = {item["resolves"] for item in actions if item.get("resolves") and item["status"] == "EXECUTED"}
            unresolved = [item["id"] for item in actions if item["status"] != "EXECUTED" and item["id"] not in resolved]
            checks.append({"check": "execution_has_actions", "passed": bool(actions), "detail": len(actions)})
            checks.append({"check": "no_unresolved_failed_actions", "passed": not unresolved, "detail": unresolved})

        recorded: list[dict[str, Any]] = []
        problems: list[str] = []
        dangling: list[str] = []
        cited: list[tuple[int, set[str]]] = []
        for index, item in enumerate(criteria):
            if not isinstance(item, Mapping):
                raise InvalidRequest(f"criteria[{index}] must be an object")
            text = self._note(f"criteria[{index}].criterion", item.get("criterion"), hint="state what must be true")
            passed = item.get("passed")
            refs = item.get("evidence_ids", [])
            if not isinstance(passed, bool):
                problems.append(f"criteria[{index}]: passed must be true or false")
                continue
            if not isinstance(refs, list) or any(not isinstance(ref, str) or not _EVIDENCE_ID.fullmatch(ref) for ref in refs):
                problems.append(f"criteria[{index}]: evidence_ids must be a list of ev-N identifiers")
                continue
            if passed and not refs:
                problems.append(f"criteria[{index}]: a passed criterion must cite evidence")
            if passed and refs:
                cited.append((index, set(refs)))
            if not passed:
                problems.append(f"criteria[{index}]: criterion reported as not met")
            dangling.extend(ref for ref in refs if ref not in all_ids)
            recorded.append({"criterion_sha256": _digest(text), "passed": passed, "evidence_ids": list(refs)})
        checks.append({"check": "criteria_present", "passed": bool(criteria), "detail": len(criteria)})
        checks.append({"check": "criteria_met_with_evidence", "passed": not problems, "detail": problems})
        checks.append({"check": "evidence_references_exist", "passed": not dangling, "detail": sorted(set(dangling))})
        # One source may support several criteria, but each passed criterion needs at least one
        # evidence ID of its own: citing the same record for everything does not pass the gate.
        shared = []
        for index, refs in cited:
            others = set().union(*(other for i, other in cited if i != index))
            if not refs - others:
                shared.append(f"criteria[{index}]: cites no evidence of its own (every cited ID is also cited by another criterion)")
        checks.append({"check": "criteria_have_own_evidence", "passed": not shared, "detail": shared})
        return checks, recorded

    # ------------------------------------------------------------------ helpers

    def _note(self, name: str, value: Any, *, hint: str = "explain why") -> str:
        text = _text(name, value, max_chars=self.max_ref_chars)
        policy = self.text_policy
        _substantial(name, text, policy.min_note_chars, policy.min_note_words, hint)
        return text

    def _check_summary(self, run: PipelineRun, target: Stage, summary: str, normalized: str) -> None:
        policy = self.text_policy
        _substantial("summary", summary, policy.min_summary_chars, policy.min_summary_words, "describe what was done in this stage")
        if not policy.distinct_summaries:
            return
        marker = f":norm:{normalized}:"
        for event in run.events:
            if event.event_type == "STAGE_COMPLETED" and event.stage is not target and marker in str(event.details.get("result_ref", "")):
                raise InvalidRequest(f"summary repeats the {event.stage.value} summary: describe this stage's own work")

    def _owner(self, owner_id: str) -> str:
        if not isinstance(owner_id, str) or not owner_id.strip() or len(owner_id) > 256:
            raise InvalidRequest("A verified owner identity is required")
        return owner_id

    @staticmethod
    def _run_id(run_id: str) -> str:
        if not isinstance(run_id, str) or not re.fullmatch(r"rx_[A-Za-z0-9_-]{16,64}", run_id):
            raise RunUnavailable("Run not found")
        return run_id

    @staticmethod
    def _stage(value: str) -> Stage:
        try:
            return Stage(value)
        except ValueError:
            raise InvalidRequest(f"Unknown stage: {value!r}") from None

    def _load(self, owner_id: str, run_id: str):
        owner_id = self._owner(owner_id)
        try:
            return self.store.load(owner_id, self._run_id(run_id))
        except RunNotFound:
            raise RunUnavailable("Run not found") from None

    def _save(self, owner_id: str, run: PipelineRun, meta: Mapping[str, Any], revision: int) -> None:
        self.store.save(owner_id, run, meta, expected_revision=revision)

    @staticmethod
    def _activate(run: PipelineRun) -> None:
        """Resume a partial or blocked stage so it can be worked on again."""
        if run.status is RunStatus.BLOCKED:
            run.resume_blocked()
            run.begin_stage()
        elif run.status is RunStatus.PARTIAL:
            run.begin_stage()
        if run.status is not RunStatus.IN_PROGRESS:
            raise StageConflict(f"Run is {run.status.value}")

    @staticmethod
    def _advance(run: PipelineRun) -> None:
        if run.status is RunStatus.IN_PROGRESS and run.stage_status[run.current_stage] is StageStatus.READY:
            run.begin_stage()

    def _capture(self, run: PipelineRun, evidence_type: str, source_ref: str, metadata: Mapping[str, Any]):
        if len(self._evidence(run)) + len(self._actions(run)) >= self.max_evidence_per_run:
            raise LimitExceeded(f"At most {self.max_evidence_per_run} evidence records per run")
        self._activate(run)
        return run.record_evidence(evidence_type=evidence_type, source_ref=source_ref, metadata=metadata)

    @staticmethod
    def _evidence_events(run: PipelineRun):
        return (event for event in run.events if event.event_type == "EVIDENCE_CAPTURED")

    def _evidence(self, run: PipelineRun) -> list[dict[str, Any]]:
        return [
            {"id": f"ev-{e.sequence}", "type": e.details["evidence_type"], "stage": e.stage.value}
            for e in self._evidence_events(run)
            if e.details.get("evidence_type") != ACTION_EVIDENCE_TYPE
        ]

    def _actions(self, run: PipelineRun) -> list[dict[str, Any]]:
        actions = []
        for e in self._evidence_events(run):
            if e.details.get("evidence_type") == ACTION_EVIDENCE_TYPE:
                meta = e.details.get("metadata", {})
                item = {"id": f"ev-{e.sequence}", "tool_name": meta.get("tool_name"), "status": meta.get("status")}
                if meta.get("resolves"):
                    item["resolves"] = meta["resolves"]
                actions.append(item)
        return actions

    def _view(self, run: PipelineRun, meta: Mapping[str, Any]) -> dict[str, Any]:
        active = run.status not in {RunStatus.COMPLETED, RunStatus.CANCELLED}
        last = meta.get("verifications") or []
        return {
            "run_id": run.run_id,
            "status": run.status.value,
            "current_stage": run.current_stage.value if active else None,
            "stage_status": {stage.value: run.stage_status[stage].value for stage in STAGE_ORDER},
            "guidance": STAGE_GUIDANCE[run.current_stage] if active and run.status is not RunStatus.VERIFICATION_FAILED
            else ("Verification failed: call rigorx_reenter to return to an earlier stage and fix the gaps." if run.status is RunStatus.VERIFICATION_FAILED else None),
            "route": {"intent": meta.get("intent"), "level": meta.get("level"), "modes": meta.get("modes", [])},
            "reentries": {"used": run.reentry_count, "max": run.max_reentries},
            "evidence_count": len(self._evidence(run)),
            "actions": self._actions(run),
            "verified": run.verification_accepted,
            "last_verification": last[-1] if last else None,
        }
