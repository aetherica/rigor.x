"""Validate the RIGOR-X owner-authored command set (library/rigorx-commands/commands.json).

Checks: manifest count, contiguous IDs and ordinals, name and alias syntax, allowed classifications
and groups, uniqueness inside the set, and no overlap with any name or alias of the 999-entry
research corpus (library/slash-commands/commands.json), which stays a separate, fixed inventory.
Run from the repository root: python library/rigorx-commands/scripts/validate_rigorx_commands.py
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SET = ROOT / "library" / "rigorx-commands" / "commands.json"
CORPUS = ROOT / "library" / "slash-commands" / "commands.json"
GROUPS = ROOT / "library" / "slash-commands" / "groups.json"
CLASSIFICATIONS = {"MACRO", "MACRO ALIAS", "UI/MENU"}
LIFECYCLE = {"candidate", "accepted", "rejected", "deprecated"}
TOKEN = re.compile(r"^/[A-Za-z0-9][A-Za-z0-9_.;:-]*$")


def fail(message: str) -> None:
    print(f"FAIL: {message}")
    sys.exit(1)


def main() -> int:
    document = json.loads(SET.read_text(encoding="utf-8"))
    commands = document.get("commands", [])
    total = document.get("manifest", {}).get("total_entries")
    if total != len(commands):
        fail(f"manifest total_entries {total} does not match {len(commands)} commands")
    corpus = json.loads(CORPUS.read_text(encoding="utf-8"))["commands"]
    taken = {c["name"].lower() for c in corpus} | {a.lower() for c in corpus for a in c.get("aliases_or_equivalents", [])}
    groups = {g["id"]: g["name"] for g in json.loads(GROUPS.read_text(encoding="utf-8"))}
    seen: set[str] = set()
    for index, item in enumerate(commands, start=1):
        where = f"{item.get('id', '?')} {item.get('name', '?')}"
        if item.get("id") != f"RXC-{index:03d}" or item.get("ordinal") != index:
            fail(f"{where}: IDs and ordinals must be contiguous (expected RXC-{index:03d}, ordinal {index})")
        if not TOKEN.fullmatch(item.get("name", "")):
            fail(f"{where}: invalid command name")
        if not isinstance(item.get("description"), str) or len(item["description"].split()) < 4:
            fail(f"{where}: description must be a sentence")
        if item.get("classification") not in CLASSIFICATIONS:
            fail(f"{where}: classification must be one of {sorted(CLASSIFICATIONS)}")
        if groups.get(item.get("group_id")) != item.get("group"):
            fail(f"{where}: unknown group or group name mismatch")
        if item.get("lifecycle_status") not in LIFECYCLE:
            fail(f"{where}: invalid lifecycle_status")
        if item.get("source", {}).get("source_type") != "owner_authored":
            fail(f"{where}: source_type must be owner_authored")
        for token in [item["name"], *item.get("aliases_or_equivalents", [])]:
            if not TOKEN.fullmatch(token):
                fail(f"{where}: invalid token {token}")
            key = token.lower()
            if key in taken:
                fail(f"{where}: {token} already exists in the 999-entry corpus")
            if key in seen:
                fail(f"{where}: {token} is repeated in the owner set")
            seen.add(key)
    print(f"PASS: {len(commands)} owner-authored commands; no overlap with the {len(corpus)}-entry corpus.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
