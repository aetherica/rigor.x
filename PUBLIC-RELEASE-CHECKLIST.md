# RIGOR-X — Public Release Readiness Checklist

**Current target:** `0.4.0`  
**Current package state:** `0.4.0.dev0`  
**Repository visibility:** Private (confirmed through repository metadata)  
**Release status:** NOT READY / NOT PUBLISHED

This checklist separates making the source repository public from declaring a stable software release. Public source visibility can be enabled before a stable release only if the owner intentionally publishes the development baseline and its limitations.

## A. Public-source publication gates

- [ ] Owner approval to change repository visibility from Private to Public.
- [ ] Confirm repository name, description, homepage, topics, and public-facing README.
- [ ] Decide and add an explicit open-source license. No `LICENSE` file was found; without a license, public visibility does not grant reuse rights.
- [ ] Audit the complete Git history and current tree for secrets, API keys, credentials, personal data, private research, internal notes, accidental artifacts, and sensitive issue/PR content. If any secret was committed, revoke/rotate it and assess history cleanup before publication.
- [ ] Add `SECURITY.md` with supported-version policy and private vulnerability-reporting instructions.
- [ ] Add `CONTRIBUTING.md` (development setup, tests/lint, change policy, review expectations) if external contributions are accepted.
- [ ] Decide whether to add a Code of Conduct and issue/PR templates.
- [ ] Verify all documentation links and external references work; remove misleading or stale CI run claims.
- [ ] Update public release/maturity language: implemented vs tested vs verified vs partial vs planned; no certification claims.
- [ ] Check package metadata, author/maintainer, project URLs, license metadata, supported Python versions, and dependency declarations.
- [ ] Confirm workflow permissions are least-privilege, action versions are pinned/approved, fork PR behavior is safe, and no secrets are required for public CI.
- [ ] Configure main-branch protection/rules: required CI checks, PR review policy (owner may choose), prevent force-push/deletion, and restrict bypasses.
- [ ] Confirm public issue/discussion policy and whether GitHub Discussions are enabled.

## B. Stable `0.4.0` release gates (separate from public visibility)

- [ ] Complete WS29/WS30 onward and remaining exact-head integration acceptance.
- [ ] Run CI on the exact final candidate SHA, including Python 3.13 and 3.15, Ruff, full tests, crosswalk and slash-library validators, source/wheel build, installed-wheel smoke, and `pip check`.
- [ ] Execute real integration tests with an approved model endpoint and host callback/plugin adapter; document provider-independent test fixtures and limitations.
- [ ] Test tool callback failure, timeout/cancellation behavior, retries, budgets, approvals, invalid/oversized payloads, secret redaction, and hostile tool/model output.
- [ ] Complete threat-model actions, dependency vulnerability review, secret scan, static/security checks, SBOM, and artifact provenance appropriate to release risk.
- [ ] Confirm persistence/privacy guarantees, data retention, backup/restore expectations, and limitations are documented.
- [ ] Reconcile capability claims and requirements-to-tests mapping; close or explicitly defer every blocker with owner rationale.
- [ ] Ratify the candidate registries/taxonomies where intended; don't treat catalog counts as functional handlers.
- [ ] Prepare `CHANGELOG`/release notes, migration/compatibility notes, known limitations, and installation/usage docs.
- [ ] Decide distribution channel (GitHub release only, PyPI, or other); configure publishing securely only if desired.
- [ ] Tag `v0.4.0` only after acceptance; verify tag points to the exact tested commit and release artifacts have checksums.

## C. Current confirmed findings

- Repository is private; default branch is `main`; repository is not archived.
- One non-main branch remains: `dependabot/github_actions/actions/setup-python-7`. Its setup-python v7 updates have been applied equivalently to all three workflows on `main`; the stale branch ref deletion was not possible with the available GitHub API connector. The browser deletion attempt was blocked by unavailable browser credits.
- No open PRs were returned.
- README and `pyproject.toml` exist. `LICENSE`, `SECURITY.md`, `CONTRIBUTING.md`, root `CHANGELOG.md`, and `docs/RELEASE.md` were not found at those paths during this inspection.
- Version remains development `0.4.0.dev0`; no final `v0.4.0` release is claimed.
- Latest CI evidence previously available is historical, not current exact HEAD. Current-head CI must be triggered/observed before claiming release verification.
- Repo visibility change and branch-ref deletion are not exposed by the connected GitHub API actions in this session.

## Recommended publication sequence

1. Decide license + public exposure + secret/history audit.
2. Add publication policies and finalize README/metadata.
3. Configure branch protection and validate public CI behavior.
4. Remove stale branch ref and verify `main` is the only branch (manual GitHub UI action is currently required).
5. Make repository public (owner/admin settings action required).
6. Run exact-head public CI and publish the source baseline with a clear **development / pre-release** notice—or continue to stable release gates and publish `v0.4.0` separately.

**Do not present the current repo as a stable, production-ready autonomous AI system.** It is an implemented development control-plane/runtime increment with documented host-integration and registry gaps.
