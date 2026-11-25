#!/usr/bin/env python3
"""Validate the canonical 18 Functional Groups and candidate-library crosswalk."""
from __future__ import annotations
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
LIBRARY_ROOT = ROOT / "library" / "slash-commands"
FG_FILE = ROOT / "engineering" / "ai-system" / "functional-groups.json"
CROSSWALK_FILE = LIBRARY_ROOT / "functional-group-crosswalk.json"
MANIFEST_FILE = LIBRARY_ROOT / "manifest.json"
GROUPS_FILE = LIBRARY_ROOT / "groups.json"
EXPECTED_FG_COUNT = 18
EXPECTED_LIBRARY_GROUPS = 18


def load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def validate():
    fg_doc, xw, manifest, library_groups = map(load, (FG_FILE, CROSSWALK_FILE, MANIFEST_FILE, GROUPS_FILE))
    fgs = fg_doc.get("functional_groups", [])
    if len(fgs) != EXPECTED_FG_COUNT:
        raise ValueError(f"expected 18 Functional Groups, got {len(fgs)}")
    expected_ids = [f"FG-{i:02d}" for i in range(1, 19)]
    ids = [item.get("id") for item in fgs]
    if ids != expected_ids:
        raise ValueError("Functional Group IDs must be unique, contiguous, and ordered FG-01..FG-18")
    if len({item.get("name") for item in fgs}) != 18 or any(not item.get("name", "").strip() for item in fgs):
        raise ValueError("Functional Group names must be unique and non-empty")
    if manifest.get("group_count") != 18 or len(library_groups) != 18:
        raise ValueError("candidate library group count mismatch")
    group_ids = [item.get("id") for item in library_groups]
    if len(set(group_ids)) != len(group_ids):
        raise ValueError("candidate library taxonomy has duplicate IDs")
    mappings = xw.get("mappings", [])
    map_ids = [item.get("library_group_id") for item in mappings]
    if len(set(map_ids)) != len(map_ids):
        raise ValueError("crosswalk has duplicate mappings")
    if set(map_ids) != set(group_ids):
        raise ValueError(f"crosswalk coverage mismatch: missing={sorted(set(group_ids)-set(map_ids))}, extra={sorted(set(map_ids)-set(group_ids))}")
    for m in mappings:
        targets = m.get("functional_group_ids", [])
        if not targets or len(targets) != len(set(targets)) or set(targets)-set(expected_ids):
            raise ValueError(f"invalid FG targets for {m.get('library_group_id')}")
    if not xw.get("mapping_policy") or xw.get("status") != "proposed_taxonomy_alignment_not_command_activation":
        raise ValueError("crosswalk must be documented and explicitly non-activating")
    print("PASS: 18 canonical Functional Groups; 18 candidate categories; complete non-activating crosswalk.")


if __name__ == "__main__":
    validate()
