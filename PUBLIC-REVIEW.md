# RIGOR-X Public Source Review

**Review target:** canonical `main` branch  
**Package state:** `0.4.0.dev0` (development pre-release)  
**Stable release:** not published  
**Purpose:** independent technical review of the current source baseline

## Pre-publication verification status

This document is a review guide, not a security attestation. At the time of this revision:

- The repository is **public** (observed 2026-11-25: anonymous clone succeeds). It became public before every gate in [PUBLIC-RELEASE-CHECKLIST.md](PUBLIC-RELEASE-CHECKLIST.md) was closed.
- A full-history scan of `main` was completed on 2026-11-25 with regex-based detectors: no credentials or secrets found. A dedicated scanner run (e.g. gitleaks) is still recommended. See [Execution Receipts](engineering/ai-system/06-EXECUTION-RECEIPTS.md).
- Superseded proprietary licensing documents were removed from all Git history on 2026-11-25 by owner decision; commit SHAs changed.
- GitHub Actions run history, logs, and artifacts have **not** been fully audited for sensitive output.
- CI status for the exact publication candidate has **not** been verified.
- The owner must confirm that all source, documentation, datasets, examples, and historical commits are authorized for public disclosure and Apache-2.0 licensing.

Complete the dedicated scanner run, the Actions log/artifact audit and the rights/provenance review.

## What this publication is

This repository is made available for independent review of architecture, implementation, tests, documentation, security posture, and engineering maturity. It is not a declaration that RIGOR-X is stable, production-ready, certified, or complete. The current package is `0.4.0.dev0`; stable release gates remain in [PUBLIC-RELEASE-CHECKLIST.md](PUBLIC-RELEASE-CHECKLIST.md).

## Suggested review areas

- Architecture boundaries, state transitions, persistence, and failure handling.
- Runtime safety: capability checks, approvals, bounded execution, timeouts, payload limits, and error redaction.
- Model/provider integration boundaries and host callback assumptions.
- Test quality, coverage gaps, deterministic behavior, and Python compatibility.
- Dependency and supply-chain risks, workflow permissions, and CI reproducibility.
- Documentation accuracy and separation of implemented, tested, verified, partial, and planned capabilities.
- Open-source license clarity, trademark boundaries, and third-party component notices.

Please distinguish reproducible defects from design preferences, hypotheses, and unverified concerns. Include affected commit, path, environment, reproduction steps, expected and observed behavior, and impact.

## Feedback and security

Use repository issue forms for ordinary bugs and documentation issues. Pull requests are proposals and are governed by [CONTRIBUTING.md](CONTRIBUTING.md) and Apache-2.0. Do not publish credentials, personal data, private research, or exploit details. For suspected vulnerabilities, use [private vulnerability reporting](https://github.com/aetherica/rigor.x/security/advisories/new) if enabled; otherwise contact the owner through a verified private channel. Follow [SECURITY.md](SECURITY.md).

## Licensing and GitHub platform terms

RIGOR-X is licensed under the **Apache License, Version 2.0 (SPDX: `Apache-2.0`)**. The root [LICENSE](LICENSE) contains the complete text; [LICENSING.md](LICENSING.md) explains scope and policy; [NOTICE](NOTICE) and [TRADEMARKS.md](TRADEMARKS.md) cover attribution and project identity. The license permits commercial use, modification, and redistribution subject to its conditions. Aetherica's optional paid services are independent of the open-source grant. Third-party components remain governed by their own licenses and terms.

A public GitHub repository is also subject to GitHub's [Terms of Service](https://docs.github.com/en/site-policy/github-terms/github-terms-of-service). Public forks and copies may persist if the upstream repository later becomes private. Only publish material the rights holder is authorized to disclose and license.

## Known maturity boundaries

- The package remains a development pre-release; no stable `v0.4.0` tag is claimed.
- A configured external model endpoint is required for live model use.
- Tool execution requires a real integrating host and registered callbacks; this repository does not automatically connect to ChatGPT's internal plugin runtime.
- Catalogued commands, domains, formulas, algorithms, topics, and operators are not all implemented as executable handlers.
- Exact-head CI, full-history rights/provenance review, third-party license audit, and secret scanning remain separate gates.
- Production deployment, security certification, service levels, and autonomous-agent readiness are not claimed.
