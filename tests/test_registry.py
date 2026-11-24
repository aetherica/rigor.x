from __future__ import annotations

import json
from pathlib import Path

import pytest

from rigorx.registry import RegistryCatalog, RegistryValidationError


ROOT = Path(__file__).resolve().parents[1]


def test_repo_census_and_resolution() -> None:
    catalog = RegistryCatalog.load(
        ROOT / "registries/proposed-count-fit-architecture.v0.1.json",
        ROOT / "library/slash-commands/commands.json",
    )
    assert catalog.census == {
        "formulas": 30,
        "algorithms": 33,
        "topics": 111,
        "operators": 15,
        "functional_groups": 18,
        "knowledge_domains": 36,
        "slash_commands": 999,
    }
    assert catalog.resolve("KD-01").canonical_status == "PENDING_OWNER_RATIFICATION"
    command = catalog.resolve("SLC-0001")
    assert command.payload["name"] == "/tldr"
    assert command.runtime_status == "not_implemented_in_rigor_x"


def test_unknown_id_and_registry_rejected() -> None:
    catalog = RegistryCatalog.load(ROOT / "registries/proposed-count-fit-architecture.v0.1.json", ROOT / "library/slash-commands/commands.json")
    with pytest.raises(KeyError):
        catalog.resolve("NOT-A-REAL-ID")
    with pytest.raises(KeyError):
        catalog.list_records("not-a-registry")


def test_command_count_corruption_fails_closed(tmp_path: Path) -> None:
    architecture = json.loads((ROOT / "registries/proposed-count-fit-architecture.v0.1.json").read_text())
    commands = json.loads((ROOT / "library/slash-commands/commands.json").read_text())
    commands["commands"].pop()
    arch_path, cmd_path = tmp_path / "architecture.json", tmp_path / "commands.json"
    arch_path.write_text(json.dumps(architecture))
    cmd_path.write_text(json.dumps(commands))
    with pytest.raises(RegistryValidationError, match="exactly 999"):
        RegistryCatalog.load(arch_path, cmd_path)


def test_duplicate_command_name_fails(tmp_path: Path) -> None:
    architecture = json.loads((ROOT / "registries/proposed-count-fit-architecture.v0.1.json").read_text())
    commands = json.loads((ROOT / "library/slash-commands/commands.json").read_text())
    commands["commands"][1]["name"] = commands["commands"][0]["name"]
    arch_path, cmd_path = tmp_path / "architecture.json", tmp_path / "commands.json"
    arch_path.write_text(json.dumps(architecture))
    cmd_path.write_text(json.dumps(commands))
    with pytest.raises(RegistryValidationError, match="duplicate command name"):
        RegistryCatalog.load(arch_path, cmd_path)
