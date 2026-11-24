# Validation Record

**Library version:** 0.2.0  
**Status:** Taxonomy correction committed; repository-side automated execution is pending the first GitHub Actions run.

## Taxonomy correction
- [x] Corrected the functional taxonomy from 17 to 18 groups.
- [x] Added **Finance, business & investment** as the 18th group.
- [x] Reclassified 7 directly relevant entries: `/roi`, `/budget`, `/finances`, `/marketmap`, `/businessmodel`, `/pitch`, and `/investor`.
- [x] Preserved all 999 records, IDs, ordinals, source provenance, lifecycle and runtime states.
- [x] Updated JSON, CSV, group catalogue, embedded/standalone manifests, validator and documentation.

## Validation gates
- [x] Deterministic repository validator updated for 18 groups, group/name parity, embedded metadata parity and full CSV/JSON field parity.
- [x] Validator now checks every record against JSON Schema Draft 2020-12 and validates the complete library envelope.
- [x] GitHub Actions workflow added for Python 3.15 and schema/structural checks.
- [ ] GitHub Actions run result: pending first push-triggered execution.
- [ ] Independently revalidate each command against its current original source and platform version.
- [ ] Complete alias semantic review and RIGOR-X capability/compatibility mapping.

## Reproduction
From this directory, install the validator dependency and run:

```bash
python3 -m pip install jsonschema
python3 scripts/validate_slash_command_library.py
```

The automated workflow uses the latest stable Python 3.15 patch release available from the official setup action at run time. A workflow definition is not evidence of a successful run; the run must be inspected separately.
