# RIGOR-X Public Source Review

**Review target:** canonical `main` branch  
**Package state:** `0.4.0.dev0` (development pre-release)  
**Stable release:** not published  
**Purpose:** independent technical review of the current source baseline

## What this publication is

This repository is being made available for independent review of its architecture, implementation, tests, documentation, security posture, and engineering maturity. It is not a declaration that RIGOR-X is a stable release, production-ready autonomous AI system, certified product, or complete implementation of every catalogued requirement.

The current package is `0.4.0.dev0`. Stable release gates remain separately tracked in [PUBLIC-RELEASE-CHECKLIST.md](PUBLIC-RELEASE-CHECKLIST.md).

## Suggested review areas

- Architecture boundaries, state transitions, persistence, and failure handling.
- Runtime safety: capability checks, approvals, bounded execution, timeouts, payload limits, and error redaction.
- Model/provider integration boundaries and host callback assumptions.
- Test quality, coverage gaps, deterministic behavior, and Python compatibility.
- Dependency and supply-chain risks, workflow permissions, and CI reproducibility.
- Documentation accuracy, traceability, and separation of implemented, tested, verified, partial, and planned capabilities.
- Proprietary licensing clarity and third-party component notices.

Please distinguish reproducible defects from design preferences, hypotheses, and unverified concerns. Include the affected commit, file/path, environment, reproduction steps, expected behavior, observed behavior, and impact where possible.

## Feedback channels

- Use the repository's issue forms for ordinary bugs, documentation problems, and review findings.
- Use pull requests to demonstrate proposed changes. A pull request is not automatically accepted or merged. External code contributions require confirmation of contributor authority and any necessary separate written contribution terms before acceptance.
- **Do not publish credentials, personal data, private research, exploit details, or other sensitive material in issues or pull requests.**

## Security reports

Do not open a public issue for a suspected vulnerability. Use GitHub's [private vulnerability reporting](https://github.com/aetherica/rigor.x/security/advisories/new) if enabled. If unavailable, contact the repository owner through a verified private channel. Follow [SECURITY.md](SECURITY.md).

## Licensing and GitHub platform terms

RIGOR-X is proprietary, source-available software and is **not Open Source**. The root [LICENSE](LICENSE) and [CSL documents](LICENSING.md) describe the intended commercial licensing framework. They do not grant a general commercial-use license merely because the repository is visible.

A public GitHub repository is also subject to GitHub's [Terms of Service](https://docs.github.com/en/site-policy/github-terms/github-terms-of-service). Those terms grant platform-level rights to view and fork/reproduce public repository content through GitHub functionality. The proprietary notice does not cancel those rights. Public forks and copies may persist even if the upstream repository later becomes private. Reviewers should not interpret GitHub access or a fork as a broader license to deploy, sell, sublicense, or commercially exploit RIGOR-X outside the rights provided by applicable terms and law.

Only publish material that the rights holder is authorized to make public. Third-party components remain governed by their own licenses and terms.

## Known maturity boundaries

- The package remains a development pre-release; no stable `v0.4.0` tag is claimed.
- A configured external model endpoint is required for live model use.
- Tool execution requires a real integrating host and registered callbacks; this repository does not automatically connect to ChatGPT's internal plugin runtime.
- Catalogued commands, domains, formulas, algorithms, topics, and operators are not all implemented as executable handlers.
- CI status for the exact publication candidate must be checked independently; historical successful runs do not prove that a later commit passed.
- Production deployment, security certification, service levels, and autonomous-agent readiness are not claimed.

## Review etiquette

Be specific, respectful, evidence-led, and mindful that this is an actively developed system. Avoid posting secrets or sensitive exploit details. The maintainers may close duplicate, out-of-scope, or non-actionable reports with an explanation.
