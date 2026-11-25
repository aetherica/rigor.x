# Contributing to RIGOR-X

Thank you for helping improve RIGOR-X.

## Before contributing

- Read the README, licensing policy, and security guidance.
- Check existing issues and discussions to avoid duplicate work.
- For security vulnerabilities, follow [SECURITY.md](SECURITY.md); do not disclose them in public issues.
- Keep changes evidence-based. Do not represent planned, heuristic, partial, or host-dependent behavior as verified functionality.

## Development setup

Python 3.13+ is required. The CI matrix currently covers Python 3.13 and 3.15.

```bash
python -m pip install -e '.[test]' ruff build
python -m unittest discover -s tests -v
ruff check src tests
python -m build
```

## Change expectations

- Keep changes focused and explain the reason and scope.
- Add or update tests for behavior changes and bug fixes.
- Preserve fail-closed behavior, explicit capability/approval gates, safe error reporting, and provenance where applicable.
- Update documentation, schemas, changelog, and validation fixtures when their contracts change.
- Never commit credentials, private data, unlicensed third-party content, or generated artifacts that are not intentionally tracked.
- Do not introduce fake providers, placeholder handlers, or unsupported integration claims.
- Do not add branches, workflow permissions, secrets, release credentials, or deployment actions without explicit project-owner authorization.

## Pull requests and contributions

- Contributions are accepted under the Apache License 2.0, subject to Section 5 of that license.
- By intentionally submitting a contribution for inclusion, you agree that the contribution is offered under Apache-2.0 unless you clearly state otherwise in writing or a separate signed agreement applies.
- You retain copyright ownership of your contributions; no copyright assignment is implied.
- You must have the rights necessary to submit the contribution and must identify third-party code, data, or other material and its applicable license.
- Do not submit material under terms that conflict with Apache-2.0 unless maintainers have approved the arrangement in writing before submission.
- A pull request is a proposal and may be reviewed, revised, or declined. Acceptance does not imply employment, agency, endorsement, or a promise of support.
- A separate Contributor License Agreement is not currently required. Any future contribution-policy change will be announced prospectively.

Describe the problem, solution, tests run, limitations, and compatibility impact.

## Coding and validation

- Prefer readable, typed Python and deterministic behavior.
- Use Ruff as configured by the project.
- Run the full unittest suite and distribution build locally when possible.
- Keep workflow permissions minimal and pin third-party GitHub Actions to immutable commit SHAs.
- Explain test gaps or environment-specific failures honestly.

## License

RIGOR-X is licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE), [LICENSING.md](LICENSING.md), and [NOTICE](NOTICE). Project names and marks are addressed separately in [TRADEMARKS.md](TRADEMARKS.md).
