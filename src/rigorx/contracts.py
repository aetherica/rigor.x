"""Typed stage contracts for the RIGOR-X pipeline.

Contracts validate references and JSON-safe metadata; they do not imply that
referenced tools, models, research channels or evidence stores exist.
"""
from __future__ import annotations

import json
from collections.abc import Mapping
from dataclasses import dataclass
from enum import StrEnum
from typing import Any

from .pipeline import Stage


class ContractError(ValueError):
    """Invalid stage input/output contract."""


class ArtifactKind(StrEnum):
    CONTEXT = "CONTEXT"
    INTENT = "INTENT"
    KNOWLEDGE = "KNOWLEDGE"
    RESEARCH = "RESEARCH"
    ROUTING = "ROUTING"
    REASONING = "REASONING"
    EXECUTION = "EXECUTION"
    EVIDENCE = "EVIDENCE"
    VERIFICATION = "VERIFICATION"
    DECISION = "DECISION"
    FEEDBACK = "FEEDBACK"


@dataclass(frozen=True, slots=True)
class StageArtifact:
    stage: Stage
    artifact_id: str
    kind: ArtifactKind
    schema_version: str
    input_refs: tuple[str, ...] = ()
    output_refs: tuple[str, ...] = ()
    evidence_refs: tuple[str, ...] = ()
    metadata: Mapping[str, Any] | None = None

    def __post_init__(self) -> None:
        if not self.artifact_id.strip() or not self.schema_version.strip():
            raise ContractError("artifact_id and schema_version are required")
        if self.kind.value != self.stage.value:
            raise ContractError("Artifact kind must match its pipeline stage")
        for label, refs in (("input_refs", self.input_refs), ("output_refs", self.output_refs), ("evidence_refs", self.evidence_refs)):
            if any(not isinstance(ref, str) or not ref.strip() for ref in refs):
                raise ContractError(f"{label} must contain only non-empty reference strings")
        if self.metadata is not None:
            try:
                json.dumps(dict(self.metadata), allow_nan=False)
            except (TypeError, ValueError) as exc:
                raise ContractError("metadata must be finite JSON-compatible data") from exc

    def to_dict(self) -> dict[str, Any]:
        return {
            "stage": self.stage.value,
            "artifact_id": self.artifact_id,
            "kind": self.kind.value,
            "schema_version": self.schema_version,
            "input_refs": list(self.input_refs),
            "output_refs": list(self.output_refs),
            "evidence_refs": list(self.evidence_refs),
            "metadata": dict(self.metadata or {}),
        }

    @classmethod
    def from_dict(cls, payload: Mapping[str, Any]) -> StageArtifact:
        try:
            return cls(
                stage=Stage(payload["stage"]),
                artifact_id=payload["artifact_id"],
                kind=ArtifactKind(payload["kind"]),
                schema_version=payload["schema_version"],
                input_refs=tuple(payload.get("input_refs", ())),
                output_refs=tuple(payload.get("output_refs", ())),
                evidence_refs=tuple(payload.get("evidence_refs", ())),
                metadata=payload.get("metadata", {}),
            )
        except (KeyError, TypeError, ValueError) as exc:
            if isinstance(exc, ContractError):
                raise
            raise ContractError(f"Invalid stage artifact: {exc}") from exc
