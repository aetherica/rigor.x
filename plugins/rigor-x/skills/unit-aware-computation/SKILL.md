---
name: rigorx-unit-aware-computation
description: Use when a numerical task needs dimensional analysis, physical units, constants, conversions, or a tolerance check through RIGOR-X.
---

# RIGOR-X Unit-Aware Computation

Use `rigorx_compute` for supported arithmetic and dimensional analysis. It is a constrained calculator, not a general-purpose code execution tool.

## Inputs

- `expression`: arithmetic expression using supported operators and functions.
- `variables`: optional named values with units.
- `as`: optional output unit.
- `expect`: optional expected value, unit, and relative tolerance for checking a claimed result.
- `run_id`: optional active RIGOR-X run. Supply it when the calculation belongs in the run's evidence ledger.

Supported constants include `pi`, `c`, `h`, `hbar`, `q_e`, `k_B`, `N_A`, `G`, `eps0`, `mu0`, `m_e`, `m_p`, `sigma_SB`, `R_gas`, and `g_n`. Supported functions include `sqrt`, `exp`, `ln`, `log10`, `sin`, `cos`, `tan`, `abs`, `min`, `max`, and `pow`. Units use bracket notation, for example `3 [eV]` or `[m/s^2]`.

## Procedure

1. Translate the user's calculation into an explicit expression with units.
2. Preserve significant figures and state any assumptions about input units.
3. Call `rigorx_compute`; do not estimate the result mentally when a deterministic calculation is required.
4. If checking a supplied number, pass `expect: {value, unit, rel_tol}`. Report the computed value, expected value, relative error, and whether the tolerance check passed.
5. If the calculation belongs to a RIGOR-X run, pass `run_id`. The engine records a `COMPUTE_RECEIPT`, including failed checks, for later evidence citation.
6. Explain dimensional mismatches, unsupported units, division by zero, or overflow as errors; do not silently drop units or coerce incompatible dimensions.

## Boundaries

- This tool does not execute arbitrary code or fetch external data.
- A successful calculation validates the arithmetic and dimensional consistency within the supported model; it does not validate the empirical inputs or prove that a selected physical model applies.
- Do not describe a failed expectation check as a successful verification.
- At L06, numeric claims must cite successful compute receipts to pass the engine's numeric-claim gate.
