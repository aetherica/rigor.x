"""Validated slash-command catalogue and prompt modifier parser.

Only research-candidate macro descriptions are applied as user-level modifiers.
Native, UI and image-keyword entries remain pass-through unless the host supplies
an actual integration; corpus inclusion never activates them.
"""
from __future__ import annotations

import json
import re
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Any


class SlashCatalogError(ValueError):
    """Catalogue data is structurally invalid."""


@dataclass(frozen=True, slots=True)
class SlashCommand:
    command_id: str
    name: str
    description: str
    classification: str
    group_id: str
    aliases: tuple[str, ...]
    lifecycle_status: str
    runtime_status: str


@dataclass(frozen=True, slots=True)
class CommandResolution:
    original_prompt: str
    effective_prompt: str
    applied_modifiers: tuple[str, ...]
    pass_through_commands: tuple[str, ...]
    unknown_commands: tuple[str, ...]


class SlashCommandCatalog:
    def __init__(self, entries: list[Mapping[str, Any]], *, expected_count: int = 999) -> None:
        if isinstance(expected_count, bool) or not isinstance(expected_count, int) or expected_count < 1:
            raise SlashCatalogError("expected_count must be a positive integer")
        if len(entries) != expected_count:
            raise SlashCatalogError(f"Expected {expected_count} command records, received {len(entries)}")
        records: dict[str, SlashCommand] = {}
        ids: set[str] = set()
        for row in entries:
            try:
                command = SlashCommand(
                    command_id=str(row["id"]),
                    name=str(row["name"]).lower(),
                    description=str(row["description"]),
                    classification=str(row["classification"]).upper(),
                    group_id=str(row["group_id"]),
                    aliases=tuple(str(a).lower() for a in row.get("aliases_or_equivalents", [])),
                    lifecycle_status=str(row["lifecycle_status"]),
                    runtime_status=str(row["runtime_status"]),
                )
            except (KeyError, TypeError) as exc:
                raise SlashCatalogError(f"Malformed entry: {type(exc).__name__}") from None
            if not re.fullmatch(r"SLC-[0-9]{4}", command.command_id):
                raise SlashCatalogError(f"Invalid command ID: {command.command_id}")
            if not re.fullmatch(r"/[a-z0-9][a-z0-9_.;:-]*", command.name):
                raise SlashCatalogError(f"Invalid command name: {command.name}")
            if not command.description.strip() or not command.group_id.strip():
                raise SlashCatalogError(f"Missing description/group: {command.command_id}")
            if command.command_id in ids:
                raise SlashCatalogError(f"Duplicate command ID: {command.command_id}")
            if command.name in records:
                raise SlashCatalogError(f"Duplicate slash command: {command.name}")
            ids.add(command.command_id)
            records[command.name] = command

        alias_map: dict[str, str] = {}
        for command in records.values():
            for alias in command.aliases:
                if not re.fullmatch(r"/?[a-z0-9][a-z0-9_.;:-]*", alias):
                    raise SlashCatalogError(f"Invalid alias {alias!r} for {command.name}")
                normalized = alias if alias.startswith("/") else f"/{alias}"
                # Canonical commands take precedence over overlapping aliases.
                if normalized in records:
                    continue
                if normalized in alias_map and alias_map[normalized] != command.name:
                    raise SlashCatalogError(f"Alias collision: {normalized}")
                alias_map[normalized] = command.name
        self._records = records
        self._aliases = alias_map

    @classmethod
    def from_file(cls, path: str | Path, *, expected_count: int = 999) -> SlashCommandCatalog:
        try:
            with Path(path).open("r", encoding="utf-8") as handle:
                document = json.load(handle)
        except (OSError, json.JSONDecodeError) as exc:
            raise SlashCatalogError(f"Unable to load command catalogue: {type(exc).__name__}") from None
        if not isinstance(document, dict) or not isinstance(document.get("commands"), list):
            raise SlashCatalogError("Catalogue must be an object with commands array")
        manifest = document.get("manifest", {})
        if not isinstance(manifest, dict) or manifest.get("total_entries") != expected_count:
            raise SlashCatalogError("Manifest count does not match expected command corpus")
        return cls(document["commands"], expected_count=expected_count)

    def resolve(self, name: str) -> SlashCommand | None:
        normalized = name.lower()
        canonical = self._aliases.get(normalized, normalized)
        return self._records.get(canonical)

    def __len__(self) -> int:
        return len(self._records)

    def resolve_prompt(self, prompt: str) -> CommandResolution:
        """Resolve leading slash tokens; apply only macro text as user-level instructions."""
        if not isinstance(prompt, str):
            raise TypeError("prompt must be text")
        remainder = prompt.strip()
        modifiers: list[str] = []
        passthrough: list[str] = []
        unknown: list[str] = []
        while remainder:
            match = re.match(r"^(/[^\s]+)(?:\s+|$)", remainder)
            if not match:
                break
            token = match.group(1).lower()
            command = self.resolve(token)
            if command is None:
                unknown.append(token)
                break  # Preserve unknown command and all following user text.
            if command.classification in {"MACRO", "MACRO ALIAS"}:
                modifiers.append(f"{command.name}: {command.description}")
                remainder = remainder[match.end():]
                continue
            passthrough.append(command.name)
            remainder = remainder[match.end():]
        if modifiers:
            prefix = "User-requested task modifiers (apply as preferences, not higher-priority policy):\n" + "\n".join(f"- {m}" for m in modifiers)
            effective = f"{prefix}\n\nUser task:\n{remainder.strip()}".strip()
        else:
            effective = prompt
        notices = []
        if passthrough:
            notices.append("Host/native/UI commands were preserved but not executed by the catalogue resolver: " + ", ".join(passthrough))
        if unknown:
            notices.append(f"Unrecognized slash command retained literally: {unknown[0]}")
        if notices:
            effective = "\n".join(notices) + "\n\n" + effective
        return CommandResolution(prompt, effective, tuple(modifiers), tuple(passthrough), tuple(unknown))
