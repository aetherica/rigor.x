"""Build the compact slash-command catalogue bundled into the Worker (src/commands.json).

Sources of truth: library/slash-commands/commands.json (the 999-entry research corpus) and
library/rigorx-commands/commands.json (the owner-authored set, kept separate from the corpus).
Corpus entries come first. The Worker needs only name, description, classification and aliases.
Run from the repository root:
    python deploy/cloudflare-ts/scripts/build_commands.py          # write
    python deploy/cloudflare-ts/scripts/build_commands.py --check  # fail if out of date (CI)
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SOURCES = (
    ROOT / "library" / "slash-commands" / "commands.json",
    ROOT / "library" / "rigorx-commands" / "commands.json",
)
TARGET = ROOT / "deploy" / "cloudflare-ts" / "src" / "commands.json"


def build() -> str:
    commands: list[list[object]] = []
    sources: list[dict[str, object]] = []
    for path in SOURCES:
        document = json.loads(path.read_text(encoding="utf-8"))
        part = [[c["name"], c["description"], c["classification"], c.get("aliases_or_equivalents", [])] for c in document["commands"]]
        if document["manifest"]["total_entries"] != len(part):
            raise SystemExit(f"{path.relative_to(ROOT)}: manifest count does not match the commands")
        sources.append({"path": path.relative_to(ROOT).as_posix(), "total": len(part)})
        commands.extend(part)
    names = [str(c[0]).lower() for c in commands]
    if len(set(names)) != len(names):
        raise SystemExit("a command name appears in more than one source")
    return json.dumps({"sources": sources, "total": len(commands), "commands": commands}, ensure_ascii=False, separators=(",", ":")) + "\n"


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
