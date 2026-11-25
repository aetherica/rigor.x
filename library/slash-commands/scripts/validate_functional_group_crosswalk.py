#!/usr/bin/env python3
"""Validate the canonical 18 Functional Groups and candidate-library crosswalk."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[3]
LIBRARY_ROOT = ROOT / "library" / "slash-commands"
FG_FILE = ROOT / "engineering" / "ai-system" / "functional-groups.json"
CROSSWALK_FILE = LIBRARY_ROOT / "functional-group-crosswalk.json"
MANIFEST_FILE = LIBRARY_ROOT / "manifest.json"
GROUPS_FILE = LIBRARY_ROOT / "groups.json"
EXPECTED_FG_COUNT = 18
EXPECTED_LIBRARY_GROUPS = 18


def load(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def validate_data(fg_doc: Any, xw: Any, manifest: Any, library_groups: Any) -> None:
    """Validate in-memory documents; raise ValueError on any malformed input."""
    if not all(isinstance(doc, dict) for doc in (fg_doc, xw, manifest)):
        raise ValueError("Functional groups, crosswalk, and manifest must be JSON objects")
    if not isinstance(library_groups, list):
        raise ValueError("candidate library groups must be a JSON array")

    fgs = fg_doc.get("functional_groups")
    if not isinstance(fgs, list) or len(fgs) != EXPECTED_FG_COUNT:
        actual = len(fgs) if isinstance(fgs, list) else "missing/non-array"
        raise ValueError(f"expected 18 Functional Groups, got {actual}")
    expected_ids = [f"FG-{i:02d}" for i in range(1, 19)]
    if any(not isinstance(item, dict) for item in fgs):
        raise ValueError("Functional Group entries must be objects")
    ids = [item.get("id") for item in fgs]
    if ids != expected_ids:
        raise ValueError("Functional Group IDs must be unique, contiguous, and ordered FG-01..FG-18")
    names = [item.get("name") for item in fgs]
    normalized_names = [name.strip().casefold() for name in names if isinstance(name, str)]
    if any(not isinstance(name, str) or not name.strip() for name in names) or len(set(normalized_names)) != EXPECTED_FG_COUNT:
        raise ValueError("Functional Group names must be unique and non-empty (case-insensitive)")

    if manifest.get("group_count") != EXPECTED_LIBRARY_GROUPS or len(library_groups) != EXPECTED_LIBRARY_GROUPS:
        raise ValueError("candidate library group count mismatch")
    if any(not isinstance(item, dict) for item in library_groups):
        raise ValueError("candidate library group entries must be objects")
    group_ids = [item.get("id") for item in library_groups]
    if any(not isinstance(group_id, str) or not group_id.strip() for group_id in group_ids):
        raise ValueError("candidate library group IDs must be non-empty strings")
    if len(set(group_ids)) != len(group_ids):
        raise ValueError("candidate library taxonomy has duplicate IDs")

    mappings = xw.get("mappings")
    if not isinstance(mappings, list):
        raise ValueError("crosswalk mappings must be an array")
    if any(not isinstance(item, dict) for item in mappings):
        raise ValueError("crosswalk mapping entries must be objects")
    map_ids = [item.get("library_group_id") for item in mappings]
    if any(not isinstance(group_id, str) or not group_id.strip() for group_id in map_ids):
        raise ValueError("crosswalk library_group_id values must be non-empty strings")
    if len(set(map_ids)) != len(map_ids):
        raise ValueError("crosswalk has duplicate mappings")
    if set(map_ids) != set(group_ids):
        missing = sorted(set(group_ids) - set(map_ids))
        extra = sorted(set(map_ids) - set(group_ids))
        raise ValueError(f"crosswalk coverage mismatch: missing={missing}, extra={extra}")

    covered_targets: set[str] = set()
    for mapping in mappings:
        targets = mapping.get("functional_group_ids")
        group = mapping.get("library_group_id")
        if not isinstance(targets, list) or not targets:
            raise ValueError(f"invalid FG targets for {group}: expected a non-empty array")
        if any(not isinstance(target, str) for target in targets):
            raise ValueError(f"invalid FG targets for {group}: IDs must be strings")
        if len(targets) != len(set(targets)) or set(targets) - set(expected_ids):
            raise ValueError(f"invalid FG targets for {group}")
        covered_targets.update(targets)

    if covered_targets != set(expected_ids):
        missing_targets = sorted(set(expected_ids) - covered_targets)
        raise ValueError(f"crosswalk FG coverage mismatch: missing={missing_targets}")

    if not isinstance(xw.get("mapping_policy"), str) or not xw["mapping_policy"].strip() or xw.get("status") != "proposed_taxonomy_alignment_not_command_activation":
        raise ValueError("crosswalk must be documented and explicitly non-activating")


def validate() -> None:
    fg_doc, xw, manifest, library_groups = map(
        load, (FG_FILE, CROSSWALK_FILE, MANIFEST_FILE, GROUPS_FILE)
    )
    validate_data(fg_doc, xw, manifest, library_groups)
    print("PASS: 18 canonical Functional Groups; 18 candidate categories; complete non-activating crosswalk.")


if __name__ == "__main__":
    validate()
