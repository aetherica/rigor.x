"""Build the compact slash-command catalogue bundled into the Worker (src/commands.json).

Source of truth: library/slash-commands/commands.json (999 entries with provenance). The Worker
needs only name, description, classification and aliases. Run from the repository root:
    python deploy/cloudflare-ts/scripts/build_commands.py          # write
    python deploy/cloudflare-ts/scripts/build_commands.py --check  # fail if out of date (CI)
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / "library" / "slash-commands" / "commands.json"
TARGET = ROOT / "deploy" / "cloudflare-ts" / "src" / "commands.json"


def build() -> str:
    document = json.loads(SOURCE.read_text(encoding="utf-8"))
    commands = [[c["name"], c["description"], c["classification"], c.get("aliases_or_equivalents", [])] for c in document["commands"]]
    if document["manifest"]["total_entries"] != len(commands):
        raise SystemExit("manifest count does not match the commands")
    return json.dumps({"source": "library/slash-commands/commands.json", "total": len(commands), "commands": commands}, ensure_ascii=False, separators=(",", ":")) + "\n"


def main() -> int:
    text = build()
    if "--check" in sys.argv:
        if TARGET.read_text(encoding="utf-8") != text:
            print("src/commands.json is out of date: run scripts/build_commands.py")
            return 1
        print("src/commands.json matches the library catalogue")
        return 0
    TARGET.write_text(text, encoding="utf-8")
    print(f"wrote {TARGET} ({len(text.encode())} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
