"""Read-only registry loading, structural validation and stable-ID resolution.

Registry membership never implies runtime enablement. The resolver preserves the
proposal/recovery status of records and validates corpus crosswalks without
inventing missing definitions.
"""
from __future__ import annotations

import json
from collections import Counter
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Any

EXPECTED_TARGETS = {
    "formulas": 30,
    "algorithms": 33,
    "topics": 111,
    "operators": 15,
    "functional_groups": 18,
    "knowledge_domains": 36,
}
PREFIXES = {
    "formulas": "FM-",
    "algorithms": "AL-",
    "topics": "TP-",
    "operators": "OP-",
    "functional_groups": "FG-",
    "knowledge_domains": "KD-",
}


class RegistryValidationError(ValueError):
    """Raised when registry sources violate structural or census invariants."""


@dataclass(frozen=True, slots=True)
class RegistryRecord:
    registry: str
    record_id: str
    payload: Mapping[str, Any]

    @property
    def canonical_status(self) -> str | None:
        value = self.payload.get("canonical_status")
        return str(value) if value is not None else None

    @property
    def runtime_status(self) -> str | None:
        value = self.payload.get("runtime_status")
        return str(value) if value is not None else None


@dataclass(frozen=True, slots=True)
class RegistryCatalog:
    architecture: Mapping[str, Any]
    slash_library: Mapping[str, Any]
    records: Mapping[str, tuple[RegistryRecord, ...]]
    commands: tuple[RegistryRecord, ...]

    @classmethod
    def load(cls, architecture_path: Path, slash_library_path: Path) -> RegistryCatalog:
        architecture = _read_json(architecture_path)
        slash_library = _read_json(slash_library_path)
        if not isinstance(architecture, dict) or not isinstance(slash_library, dict):
            raise RegistryValidationError("Both registry documents must be JSON objects")
        if architecture.get("classification") != "PROPOSED_ARCHITECTURE_DERIVED_FROM_RECOVERED_MATERIAL":
            raise RegistryValidationError("Architecture provenance/status classification is missing or unexpected")
        targets = architecture.get("canonical_targets")
        registries = architecture.get("registries")
        if not isinstance(targets, dict) or not isinstance(registries, dict):
            raise RegistryValidationError("Architecture must contain canonical_targets and registries objects")

        records: dict[str, tuple[RegistryRecord, ...]] = {}
        for category, expected_count in EXPECTED_TARGETS.items():
            values = registries.get(category)
            if not isinstance(values, list) or len(values) != expected_count:
                raise RegistryValidationError(f"{category}: expected {expected_count} records, got {len(values) if isinstance(values, list) else 'non-list'}")
            if targets.get(category) != expected_count:
                raise RegistryValidationError(f"{category}: canonical target count mismatch")
            prefix = PREFIXES[category]
            seen: set[str] = set()
            parsed: list[RegistryRecord] = []
            for row in values:
                if not isinstance(row, dict):
                    raise RegistryValidationError(f"{category}: record must be an object")
                record_id = row.get("id")
                if not isinstance(record_id, str) or not record_id.startswith(prefix):
                    raise RegistryValidationError(f"{category}: invalid ID prefix or missing ID: {record_id!r}")
                if record_id in seen:
                    raise RegistryValidationError(f"{category}: duplicate ID {record_id}")
                seen.add(record_id)
                parsed.append(RegistryRecord(category, record_id, row))
            records[category] = tuple(parsed)

        records["slash_commands"] = _validate_commands(slash_library, registries, targets)
        commands = records["slash_commands"]
        return cls(architecture, slash_library, records, commands)

    def resolve(self, record_id: str) -> RegistryRecord:
        """Resolve one exact, stable ID. Ambiguous IDs are rejected."""
        matches = [item for group in self.records.values() for item in group if item.record_id == record_id]
        if not matches:
            raise KeyError(record_id)
        if len(matches) != 1:
            raise RegistryValidationError(f"ID is not globally unique: {record_id}")
        return matches[0]

    def list_records(self, registry: str) -> tuple[RegistryRecord, ...]:
        try:
            return self.records[registry]
        except KeyError as exc:
            raise KeyError(f"Unknown registry: {registry}") from exc

    @property
    def census(self) -> dict[str, int]:
        return {key: len(value) for key, value in self.records.items()}


def _read_json(path: Path) -> Any:
    try:
        with path.open("r", encoding="utf-8") as stream:
            return json.load(stream)
    except (OSError, json.JSONDecodeError) as exc:
        raise RegistryValidationError(f"Cannot load registry source {path}: {exc}") from exc


def _validate_commands(
    library: Mapping[str, Any], registries: Mapping[str, Any], targets: Mapping[str, Any]
) -> tuple[RegistryRecord, ...]:
    manifest = library.get("manifest")
    groups = library.get("groups")
    commands = library.get("commands")
    expected = registries.get("slash_commands", {})
    if not isinstance(manifest, dict) or not isinstance(groups, list) or not isinstance(commands, list):
        raise RegistryValidationError("Slash library requires manifest, groups[], and commands[]")
    if targets.get("slash_command_corpus") != 999 or expected.get("corpus_count") != 999:
        raise RegistryValidationError("Slash command corpus target must be 999")
    if manifest.get("total_entries") != 999 or len(commands) != 999:
        raise RegistryValidationError("Slash command corpus must contain exactly 999 entries")
    if manifest.get("group_count") != 18 or len(groups) != 18:
        raise RegistryValidationError("Slash command library must contain exactly 18 groups")
    if manifest.get("unique_names") != 999:
        raise RegistryValidationError("Manifest unique-name census must be 999")

    group_counts = {row.get("id"): row.get("count") for row in groups if isinstance(row, dict)}
    if len(group_counts) != 18 or any(not isinstance(k, str) or not isinstance(v, int) for k, v in group_counts.items()):
        raise RegistryValidationError("Group IDs/counts are malformed or duplicated")
    command_ids: set[str] = set()
    names: set[str] = set()
    actual_groups: Counter[str] = Counter()
    actual_classes: Counter[str] = Counter()
    parsed: list[RegistryRecord] = []
    for ordinal, row in enumerate(commands, start=1):
        if not isinstance(row, dict):
            raise RegistryValidationError(f"Command row {ordinal} must be an object")
        record_id, name, group_id = row.get("id"), row.get("name"), row.get("group_id")
        if record_id != f"SLC-{ordinal:04d}" or row.get("ordinal") != ordinal:
            raise RegistryValidationError(f"Command ordinal/ID mismatch at row {ordinal}")
        if not isinstance(name, str) or not name.strip() or name in names:
            raise RegistryValidationError(f"Missing or duplicate command name at row {ordinal}")
        if record_id in command_ids:
            raise RegistryValidationError(f"Duplicate command ID {record_id}")
        if group_id not in group_counts:
            raise RegistryValidationError(f"Command {record_id} references unknown group {group_id!r}")
        classification = row.get("classification")
        if not isinstance(classification, str) or not classification:
            raise RegistryValidationError(f"Command {record_id} lacks classification")
        names.add(name)
        command_ids.add(record_id)
        actual_groups[group_id] += 1
        actual_classes[classification] += 1
        parsed.append(RegistryRecord("slash_commands", record_id, row))
    if dict(actual_groups) != group_counts:
        raise RegistryValidationError("Per-group command census does not match declared group counts")
    if dict(actual_classes) != manifest.get("classification_counts"):
        raise RegistryValidationError("Command classification census does not match manifest")
    if targets.get("interface_operational_commands") != 102 or expected.get("interface", {}).get("target_count") != 102:
        raise RegistryValidationError("Interface/operational command target must remain 102")
    if expected.get("interface", {}).get("historical_reference_definitions_reported") != 91 or expected.get("interface", {}).get("unresolved_slots") != 11:
        raise RegistryValidationError("Interface command partial-recovery census is inconsistent")
    return tuple(parsed)
