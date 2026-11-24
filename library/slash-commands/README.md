# Aetherica RIGOR-X Slash Command Library

**Version:** 0.1.0  
**Status:** Research candidate library  
**Canonical location:** `library/slash-commands/`  
**Canonical branch:** `main`

## Purpose
A versioned, machine-readable research library containing 999 unique slash-prefixed tokens grouped into 17 functional categories. This is a discovery and normalization corpus, not a declaration that every entry is executable in RIGOR-X.

## Contents
- `commands.json` — canonical structured dataset with entries, provenance and lifecycle/runtime status.
- `commands.csv` — spreadsheet/import-friendly export of the same 999 entries.
- `groups.json` — category definitions and expected counts.
- `schema/command.schema.json` — JSON Schema for a command record.
- `scripts/validate_slash_command_library.py` — deterministic structural validator.
- `provenance/SOURCES.md` — source register, extraction method and limitations.
- `ENGINEERING-STANDARD.md` — library data, provenance, versioning and acceptance rules.
- `CHANGELOG.md` — version history.
- `VALIDATION.md` — validation record and reproduction steps.

## Classification
| Classification | Meaning |
|---|---|
| `NATIVE` | Platform-native command; platform is recorded per entry. |
| `NATIVE — OPENAI` / `NATIVE — CHATGPT` / `NATIVE — CODEX` | Native command associated with the named OpenAI surface. |
| `UI/MENU` | Slash-menu or interface-level token; not necessarily a prompt command. |
| `MACRO` | Community-authored prompt shortcut/convention. |
| `MACRO ALIAS` | Alternative token identified as an alias/equivalent. |
| `IMAGE KEYWORD` | Image-generation, photography or visual-style keyword. |
| `UNCLASSIFIED` | Source corpus does not provide enough type information. |

**Important:** Native status is platform-scoped. It does not mean the command is native to every ChatGPT surface or implemented in RIGOR-X. No entry is runtime-enabled by inclusion in this library.

## Data contract
Each command has a stable ID (`SLC-0001` … `SLC-0999`), ordinal, slash name, description, group, classification, alias/equivalent list, source provenance, lifecycle status and runtime status.
- `lifecycle_status=candidate` means awaiting RIGOR-X semantic review and owner acceptance.
- `runtime_status=not_implemented_in_rigor_x` means this library does not provide an execution handler.
- Source-family identification is not command-level validation. Verification status preserves that distinction.

## Validation
From this directory:
```bash
python3 scripts/validate_slash_command_library.py
```
The validator checks count, unique IDs/names, naming grammar, required metadata, group membership, group-count consistency and JSON/CSV parity.

## Governance
1. Preserve source URLs and references; do not silently overwrite source records.
2. Do not merge aliases with canonical commands until semantic equivalence is verified.
3. Do not mark a candidate accepted without documented semantic review.
4. Do not mark a command implemented or verified without a runtime handler and tests.
5. Version changes must update the manifest, dataset, changelog and validation record together.
6. Keep this 999-entry research corpus distinct from the separate RIGOR-X canonical operational registry (historical target: 102 commands).
