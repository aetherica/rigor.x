from __future__ import annotations

import unittest

from rigorx.contracts import ArtifactKind, ContractError, StageArtifact
from rigorx.pipeline import Stage


class StageArtifactTests(unittest.TestCase):
    def test_round_trip(self):
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
        self.assertEqual(StageArtifact.from_dict(artifact.to_dict()), artifact)

    def test_stage_kind_mismatch_rejected(self):
        with self.assertRaisesRegex(ContractError, "must match"):
            StageArtifact(Stage.RESEARCH, "A1", ArtifactKind.CONTEXT, "1.0.0")

    def test_non_json_and_nan_metadata_rejected(self):
        with self.assertRaisesRegex(ContractError, "JSON-compatible"):
            StageArtifact(Stage.CONTEXT, "A1", ArtifactKind.CONTEXT, "1.0.0", metadata={"bad": object()})
        with self.assertRaisesRegex(ContractError, "JSON-compatible"):
            StageArtifact(Stage.CONTEXT, "A1", ArtifactKind.CONTEXT, "1.0.0", metadata={"nan": float("nan")})


if __name__ == "__main__":
    unittest.main()
