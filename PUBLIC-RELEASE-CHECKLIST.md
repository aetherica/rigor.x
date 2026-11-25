# RIGOR-X — Public Release Readiness Checklist

**Current target:** `0.4.0`  
**Current package state:** `0.4.0.dev0`  
**Repository visibility:** Public (observed 2026-11-25)  
**Release status:** NOT READY / NOT PUBLISHED

This checklist separates public source review from a stable release. The repository became public before every gate in section A was closed; the open gates still apply and should be closed promptly.

## A. Public-source publication gates

- [ ] Record owner approval of public visibility (the repository is already public).
- [ ] Confirm repository name, description, homepage, topics, and public-facing README.
- [x] Adopt Apache License 2.0 in LICENSE and package metadata; add NOTICE and trademark policy; align contribution and licensing documents.
- [ ] Confirm rights-holder authority to license all included code, documentation, assets, and reachable contributions under Apache-2.0.
- [ ] Complete a full-clone, full-history scan of every reachable ref for secrets, credentials, personal data, private research, internal notes, build artifacts, and sensitive content. Separately audit GitHub Actions run history, logs, and artifacts. Connector search is not a substitute. **Partial (2026-11-25):** regex-based scan of all commits on `main` found no secrets; dedicated scanner run and Actions logs/artifacts audit remain.
- [ ] Complete third-party license compatibility review and generate an SBOM.
- [x] Add SECURITY.md, CONTRIBUTING.md, CHANGELOG.md, issue templates, and package metadata.
- [ ] Verify documentation links and remove stale/misleading CI claims.
- [x] Clarify implemented vs tested vs verified vs partial vs planned; no certification or production-readiness claims.
- [ ] Configure main branch protection: required CI checks, review policy, prevent force-push/deletion, restrict bypasses.
- [ ] Confirm public issue/discussion policy and repository settings.
- [x] Record full-history scan tool, date, scanned refs, and result in release receipts (see engineering/ai-system/06-EXECUTION-RECEIPTS.md).

## B. Stable `0.4.0` release gates

- [ ] Complete remaining integration acceptance.
- [ ] Run CI on exact final candidate SHA: Python 3.13/3.15, Ruff, full tests, validators, source/wheel build, installed-wheel smoke, and `pip check`.
- [ ] Execute approved real model endpoint + host callback/plugin adapter integration tests.
- [ ] Test callback failures, timeout/cancellation, retries, budgets, approvals, invalid/oversized payloads, secret redaction, and hostile tool/model output.
- [ ] Threat model, dependency vulnerability review, secret scan, security checks, SBOM, and artifact provenance.
- [ ] Confirm persistence/privacy, retention, backup/restore and limitations.
- [ ] Reconcile capability claims and requirements-to-tests.
- [ ] Prepare migration/compatibility notes and install/usage docs.
- [ ] Decide distribution and secure publishing if needed.
- [ ] Tag `v0.4.0` only after acceptance; verify tag SHA and artifact checksums.

## C. Current confirmed findings

- Repository is public, default branch `main`.
- Git history was rewritten on 2026-11-25 to remove superseded proprietary licensing documents; no pre-rewrite branch remains. The read-only ref `refs/pull/5/head` (closed Dependabot PR) still holds pre-rewrite objects and can only be purged by GitHub Support.
- Dependabot version updates are enabled (GitHub Actions, pip) and open their own PR branches from current `main`.
- Apache-2.0 licensing documents are present on `main`; full-history rights/provenance and third-party license audit remain required.
- Package version is development `0.4.0.dev0`; no stable tag.
- Exact-head CI remains unverified; no CI status records were returned by the connected repository checks.
- Branch protection and repository settings require owner/admin action.
- Full-history secret scan: regex-based scan completed and recorded 2026-11-25 (no secrets found); a dedicated scanner run and Actions log/artifact audit remain.

## Recommended publication sequence

1. Confirm rights-holder authority for Apache-2.0 coverage and third-party compatibility.
2. Complete full-history secret/privacy audit and remediate findings.
3. Configure branch protection and public issue/security settings.
4. Review the stale Dependabot ref after scanning all refs.
5. Make the repository public through GitHub settings.
6. Run exact-head CI and publish a clearly labeled development pre-release. Stable `v0.4.0` remains a separate decision.

**Do not represent this repository as a stable, production-ready autonomous AI system.**
