#!/usr/bin/env python3
"""Validate the RIGOR-X slash-command library and its Draft 2020-12 schemas."""
import csv
import json
import pathlib
import re
import sys

from jsonschema import Draft202012Validator
from referencing import Registry, Resource

ROOT = pathlib.Path(__file__).resolve().parents[1]
DATA = ROOT / "commands.json"
CSV_FILE = ROOT / "commands.csv"
GROUPS = ROOT / "groups.json"
MANIFEST = ROOT / "manifest.json"
LIBRARY_SCHEMA = ROOT / "schema" / "library.schema.json"
COMMAND_SCHEMA = ROOT / "schema" / "command.schema.json"
EXPECTED_ENTRIES = 999
EXPECTED_GROUPS = 18


def fail(message):
    print("FAIL: " + message, file=sys.stderr)
    raise SystemExit(1)


def load_json(path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        fail(f"cannot load {path.name}: {exc}")


def main():
    payload = load_json(DATA)
    groups = load_json(GROUPS)
    manifest = load_json(MANIFEST)
    command_schema = load_json(COMMAND_SCHEMA)
    library_schema = load_json(LIBRARY_SCHEMA)
    commands = payload.get("commands", [])
    embedded_groups = payload.get("groups", [])
    embedded_manifest = payload.get("manifest", {})

    if len(commands) != EXPECTED_ENTRIES:
        fail(f"expected {EXPECTED_ENTRIES} records; got {len(commands)}")
    if len(groups) != EXPECTED_GROUPS:
        fail(f"expected {EXPECTED_GROUPS} groups; got {len(groups)}")
    ids = [item.get("id") for item in commands]
    names = [item.get("name") for item in commands]
    if len(set(ids)) != EXPECTED_ENTRIES:
        fail("command IDs are not unique")
    if len(set(names)) != EXPECTED_ENTRIES:
        fail("command names are not unique")
    if ids != [f"SLC-{n:04d}" for n in range(1, EXPECTED_ENTRIES + 1)]:
        fail("IDs are not contiguous and ordered")
    if [item.get("ordinal") for item in commands] != list(range(1, EXPECTED_ENTRIES + 1)):
        fail("ordinals are not contiguous and ordered")

    known = {group["id"]: group for group in groups}
    if len(known) != EXPECTED_GROUPS:
        fail("group IDs are not unique")
    allowed = {
        "NATIVE", "NATIVE — OPENAI", "NATIVE — CHATGPT", "NATIVE — CODEX",
        "UI/MENU", "MACRO", "MACRO ALIAS", "IMAGE KEYWORD", "UNCLASSIFIED"
    }
    for item in commands:
        if not re.fullmatch(r"SLC-[0-9]{4}", item.get("id", "")):
            fail("invalid ID " + str(item.get("id")))
        if not re.fullmatch(r"/[A-Za-z0-9][A-Za-z0-9_.;:-]*", item.get("name", "")):
            fail("invalid name " + str(item.get("name")))
        if not item.get("description", "").strip():
            fail("empty description " + item["name"])
        group = known.get(item.get("group_id"))
        if group is None or item.get("group") != group["name"]:
            fail("unknown or mismatched group " + item["name"])
        if item.get("classification") not in allowed:
            fail("unknown classification " + item["name"])
        source = item.get("source", {})
        for key in ("source_id", "repository_or_platform", "source_ref", "url", "source_type", "verification_status"):
            if not source.get(key):
                fail("missing source." + key + " for " + item["name"])

    counts = {}
    for item in commands:
        counts[item["group_id"]] = counts.get(item["group_id"], 0) + 1
    for group in groups:
        if counts.get(group["id"], 0) != group["count"]:
            fail("group count mismatch " + group["id"])
    if embedded_groups != groups:
        fail("embedded groups and groups.json differ")
    if manifest != embedded_manifest:
        fail("standalone and embedded manifests differ")
    if manifest.get("group_count") != EXPECTED_GROUPS:
        fail("manifest group_count mismatch")
    if manifest.get("total_entries") != EXPECTED_ENTRIES or manifest.get("unique_names") != EXPECTED_ENTRIES:
        fail("manifest entry count mismatch")

    command_validator = Draft202012Validator(command_schema)
    for item in commands:
        errors = list(command_validator.iter_errors(item))
        if errors:
            fail(f"command schema violation for {item['name']}: {errors[0].message}")

    registry = Registry().with_resource(
        "https://aetherica.github.io/rigor.x/schemas/command.schema.json",
        Resource.from_contents(command_schema),
    )
    library_validator = Draft202012Validator(library_schema, registry=registry)
    library_errors = list(library_validator.iter_errors(payload))
    if library_errors:
        fail("library schema violation: " + library_errors[0].message)

    with CSV_FILE.open(newline="", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))
    if len(rows) != EXPECTED_ENTRIES:
        fail(f"CSV row count is not {EXPECTED_ENTRIES}")
    fields = ("id", "ordinal", "name", "description", "group_id", "group", "classification",
              "aliases_or_equivalents", "source_id", "source_platform", "source_ref",
              "source_url", "source_type", "verification_status", "lifecycle_status", "runtime_status")
    for index, (row, item) in enumerate(zip(rows, commands), start=1):
        source = item["source"]
        expected = {
            "id": item["id"], "ordinal": str(item["ordinal"]), "name": item["name"],
            "description": item["description"], "group_id": item["group_id"], "group": item["group"],
            "classification": item["classification"],
            "aliases_or_equivalents": "|".join(item["aliases_or_equivalents"]),
            "source_id": source["source_id"], "source_platform": source["repository_or_platform"],
            "source_ref": source["source_ref"], "source_url": source["url"],
            "source_type": source["source_type"], "verification_status": source["verification_status"],
            "lifecycle_status": item["lifecycle_status"], "runtime_status": item["runtime_status"]
        }
        if any(row.get(field) != expected[field] for field in fields):
            fail(f"CSV/JSON field parity mismatch at row {index} ({item['name']})")

    print(f"PASS: {EXPECTED_ENTRIES} records, {EXPECTED_GROUPS} groups, provenance, Draft 2020-12 schemas and full CSV/JSON parity.")


if __name__ == "__main__":
    main()
