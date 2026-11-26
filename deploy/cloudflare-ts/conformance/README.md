# RIGOR-X engine conformance suite (language-neutral)

Scenario files describe engine operations and the outcomes the **specification** requires
(ADR-002 … ADR-006, the 2026-11-26 directive). Expected values are written by hand, not recorded
from an implementation, so the suite checks an engine rather than repeating it (WS32 P0.7, ADR-012).
Any implementation (TypeScript today; a future Python or Rust port) passes if a runner replays
every step through its `dispatch(owner, operation, payload)` entry point and every expectation holds.

Format (`v2/*.json`):

- `steps[]`: `{ "op": <operation>, "args": {...}, "expect": {...}, "capture": {"name": "<path>"} }`
- Strings `"$name"` in `args` (also inside lists) are replaced by values captured earlier.
- `expect.ok`: `true` or `false`; `expect.code`: the error code when `ok` is `false`;
  `expect.message`: a substring of the error message;
  `expect.fields`: `{ "<path>": <exact JSON value> }` on the result.
- Paths: dot-separated keys and list indexes (`stage_status.PLAN`, `runs.0.status`); a list element
  can be selected by a field value with `[key=value]` (`checks.[check=items_have_own_evidence].detail`).

TypeScript runner: `test/conformance.test.ts`.
