# RIGOR-X — Public Release Readiness Checklist

**Current target:** `0.4.0`
**Current package state:** `0.4.0.dev0`
**Repository visibility:** Private (confirmed)
**Release status:** NOT READY / NOT PUBLISHED

This checklist separates public source visibility from a stable release. Publishing the development baseline is a separate owner decision and must clearly communicate limitations.

## A. Public-source publication gates

- [ ] Owner approval to change repository visibility from Private to Public.
- [ ] Confirm repository name, description, homepage, topics, and public-facing README.
- [ ] Choose and add a license. No `LICENSE` file exists; public visibility without a license does not grant reuse rights.
- [ ] Audit complete Git history/current tree for secrets, credentials, personal data, private research, internal notes, artifacts, and sensitive issues/PR content. Rotate any exposed secrets and evaluate history cleanup.
- [x] Add `SECURITY.md` with reporting instructions and project support scope.
- [x] Add `CONTRIBUTING.md` with setup, test, lint, and contribution expectations.
- [x] Add root `CHANGELOG.md` with development status, summary, and known limitations.
- [x] Add issue templates and security contact link.
- [ ] Decide whether to add a Code of Conduct and enable Discussions.
- [ ] Verify documentation links and remove stale/misleading CI claims.
- [x] Clarify implemented vs tested vs verified vs partial vs planned; no certification or production readiness claims.
- [x] Add package README, project URLs, supported Python classifiers, and bounded test dependency.
- [x] Workflow permissions are read-only; third-party actions in active workflows are pinned by immutable commit SHA; CI triggers cover workflow/docs/registry changes.
- [ ] Configure main branch protection: required CI checks, review policy, prevent force-push/deletion, restrict bypasses.
- [ ] Confirm public issue/discussion policy and repository settings.
- [ ] Complete actual secret/history scan using a full clone and appropriate scanners; connector-only review is insufficient.

## B. Stable `0.4.0` release gates

- [ ] Complete WS29/WS30 onward and remaining exact-head integration acceptance.
- [ ] Run CI on exact final candidate SHA: Python 3.13/3.15, Ruff, full tests, validators, source/wheel build, installed-wheel smoke, and `pip check`.
- [ ] Execute approved real model endpoint + host callback/plugin adapter integration tests.
- [ ] Test callback failures, timeout/cancellation, retries, budgets, approvals, invalid/oversized payloads, secret redaction, and hostile tool/model output.
- [ ] Threat model, dependency vulnerability review, secret scan, security checks, SBOM, and artifact provenance.
- [ ] Confirm persistence/privacy, retention, backup/restore and limitations.
- [ ] Reconcile capability claims and requirements-to-tests; close/defer blockers with owner rationale.
- [ ] Ratify registries/taxonomies where intended; catalog counts do not mean functional handlers.
- [ ] Prepare migration/compatibility notes, known limitations and install/usage docs.
- [ ] Decide distribution (GitHub release, PyPI, etc.) and secure publishing if needed.
- [ ] Tag `v0.4.0` only after acceptance; verify tag SHA and artifact checksums.

## C. Current confirmed findings

- Repository is private, default branch `main`, not archived.
- Two non-main Dependabot branches remain: checkout-7 and setup-python-7. Scheduled Dependabot updates are disabled; workflow action updates have been applied to main. Branch deletion is not available through the connected GitHub action.
- No open PRs were found in the last audit.
- `SECURITY.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, issue templates, and package metadata have been added/updated on main.
- License remains undecided; no `LICENSE` file.
- Package version is development `0.4.0.dev0`; no stable tag.
- Current exact-head CI is still unverified; the connector returns no CI status records and cannot dispatch workflows.
- Visibility and branch deletion require owner/admin action outside currently available connector tools.
- Full Git-history secret scanning has not been performed.

## Recommended publication sequence

1. Owner selects license and approves public exposure.
2. Complete full-history secret/privacy audit and remediate any findings.
3. Configure branch protection and public CI behavior.
4. Delete the two stale branch refs; verify `main` is the only branch.
5. Make repository public through GitHub settings.
6. Run exact-head CI, then publish the source baseline as a clearly labeled development pre-release—or continue stable release gates and publish `v0.4.0` separately.

**Do not represent this repository as a stable, production-ready autonomous AI system.** It is a development control-plane/runtime increment with host-integration and registry gaps.
