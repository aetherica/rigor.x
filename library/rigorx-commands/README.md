# RIGOR-X owner-authored command set

**Version:** 0.1.0 · **Status:** candidate (descriptions drafted 2026-11-26, pending owner ratification) · **Entries:** 48

The commands the repository owner uses with RIGOR-X that are not in the 999-entry research corpus
(`library/slash-commands/`). This set is kept **separate** from that corpus: the corpus is a fixed
inventory of 999 externally sourced tokens (requirement RX-REG-003), and nothing here is counted
into it. No name or alias in this set may repeat a corpus name or alias.

## Contents
- `commands.json`: manifest and entries `RXC-001` … `RXC-048`, each with name, description, functional
  group (the corpus's 18 groups), classification, aliases, source and lifecycle status.
- `scripts/validate_rigorx_commands.py`: structural validator (run in CI).

## Classification and runtime
| Classification | Count | Runtime in the Worker resolver |
|---|---|---|
| `MACRO` | 42 | Applied as a user-level task modifier (a preference, not higher-priority policy). |
| `UI/MENU` | 6 | Preserved for the host and not executed (`/ls`, `/boostReasoning`, `/reset`, `/save`, `/load`, `/help`). |

The Worker bundles both inventories into `deploy/cloudflare-ts/src/commands.json`
(`scripts/build_commands.py`); corpus entries are listed first. The frozen protocol-1 Python
resolver (`src/rigorx/slash_commands.py`) reads only the corpus.

## Changing the set
Edit `commands.json`, keep IDs and ordinals contiguous, then run from the repository root:

```
python library/rigorx-commands/scripts/validate_rigorx_commands.py
python deploy/cloudflare-ts/scripts/build_commands.py
```
