# Contributing to RIGOR-X

Thank you for helping improve RIGOR-X.

## Before contributing

- Read the README and public-release checklist.
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

## Pull requests

External contributors should use a fork and submit a pull request to `main`. Describe the problem, solution, tests run, limitations, and any compatibility impact. Maintainers review and merge changes; the canonical repository's `main` branch remains the release source of truth.

## Coding and validation

- Prefer readable, typed Python and deterministic behavior.
- Use Ruff as configured by the project.
- Run the full unittest suite and distribution build locally when possible.
- Keep workflow permissions minimal and pin third-party GitHub Actions to immutable commit SHAs.
- Explain test gaps or environment-specific failures honestly.

## License and contributions

RIGOR-X is proprietary, source-available commercial software and is not offered under an open-source license. The repository [LICENSE](LICENSE) notice and [commercial licensing documents](LICENSING.md) describe the rights framework. Repository visibility does not grant permission to reuse or commercially deploy the software.

Submitting a contribution does not automatically transfer ownership or grant commercial rights. Contribution ownership, licensing, and any assignment or contributor agreement must be addressed in a separate written agreement with the rights holder before a contribution is accepted where such an agreement is required. Contributors must have the rights necessary to submit their contributions and must not include third-party material without compatible permissions.
