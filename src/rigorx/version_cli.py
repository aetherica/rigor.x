"""Version and package integrity CLI."""
from __future__ import annotations

import json

from rigorx import __version__


def main() -> int:
    print(json.dumps({"name": "rigor-x-core", "version": __version__, "status": "installed"}, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
