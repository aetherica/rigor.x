from __future__ import annotations

import pytest

from rigorx.contracts import ArtifactKind, ContractError, StageArtifact
from rigorx.pipeline import Stage


def test_stage_artifact_round_trip() -> None:
    artifact = StageArtifact(
        stage=Stage.RESEARCH,
        artifact_id="ART-RESEARCH-0001",
        kind=ArtifactKind.RESEARCH,
        schema_version="1.0.0",
        input_refs=("INT-0001",),
        output_refs=("SRC-0001",),
        evidence_refs=("EVD-0001",),
        metadata={"method": "direct-source"},
    )
    restored = StageArtifact.from_dict(artifact.to_dict())
    assert restored == artifact


def test_artifact_stage_kind_mismatch_rejected() -> None:
    with pytest.raises(ContractError, match="must match"):
        StageArtifact(Stage.RESEARCH, "A1", ArtifactKind.CONTEXT, "1.0.0")


def test_non_json_or_nan_metadata_rejected() -> None:
    with pytest.raises(ContractError, match="JSON-compatible"):
        StageArtifact(Stage.CONTEXT, "A1", ArtifactKind.CONTEXT, "1.0.0", metadata={"bad": object()})
    with pytest.raises(ContractError, match="JSON-compatible"):
        StageArtifact(Stage.CONTEXT, "A1", ArtifactKind.CONTEXT, "1.0.0", metadata={"nan": float("nan")})
