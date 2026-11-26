"""Differential test of rigorx_compute against pint (an independent units library, CODATA 2022).

Usage (from the repository root, with `pip install pint==0.26.2`):
    python deploy/cloudflare-ts/scripts/compute_differential.py
Each case is [pint expression, rigorx_compute expression, target unit]. The gauss is skipped on
purpose: pint models it in Gaussian dimensions, rigorx_compute uses the B-field correspondence
1 G <-> 1e-4 T (NIST SP 811), so the two are not comparable by design.
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pint

HERE = Path(__file__).resolve().parent
CASES = HERE / "compute_cases.json"
ALIAS = {"m^3 kg^-1 s^-2": "m**3/kg/s**2", "W m^-2 K^-4": "W/m**2/K**4", "J/(mol K)": "J/mol/K", "N/A^2": "N/A**2", "J s": "J*s", "m^3": "m**3"}
SKIP = {"[G]"}
TOLERANCE = 1e-9


def main() -> int:
    cases = json.loads(CASES.read_text())
    ours = json.loads(subprocess.run(
        ["node", "--no-warnings", "--experimental-strip-types", str(HERE / "compute_eval.ts"), str(CASES)],
        check=True, capture_output=True, text=True).stdout)
    ureg = pint.UnitRegistry()
    worst, failures = 0.0, []
    for pint_expr, expr, unit in cases:
        if expr in SKIP:
            continue
        ref = ureg(pint_expr).to(ALIAS.get(unit, unit)).magnitude
        rel = abs(ours[expr] - ref) / abs(ref)
        worst = max(worst, rel)
        if rel > TOLERANCE:
            failures.append(f"{expr} -> {unit}: rigorx {ours[expr]!r}, pint {ref!r}, relative difference {rel:.2e}")
    print(f"compared {len(cases) - len(SKIP)} cases with pint {pint.__version__}: worst relative difference {worst:.2e}")
    for f in failures:
        print("DIFFERS:", f)
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
