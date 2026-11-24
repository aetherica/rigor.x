# Quickstart — Durable Pipeline Runs

This is a deterministic pipeline-control and local persistence library. It does not itself invoke AI models, research sources, tools or connectors.

## Requirements
- Python >= 3.13
- SQLite included in Python runtime
- Test extra: JSON Schema validation

## Install and test
```bash
python -m pip install '.[test]'
python -m unittest discover -s tests -v
```

## Example
```python
from pathlib import Path
from rigorx.pipeline import PipelineRun, Stage
from rigorx.storage import SQLitePipelineStore

store = SQLitePipelineStore(Path("./data/rigorx-runs.sqlite3"))
run = PipelineRun("task-unique-id")

revision = store.save(run)  # New record; revision 1
run.begin_stage()
revision = store.save(run, expected_revision=revision)

# Evidence events are appended as part of the snapshot/event transaction.
run.record_evidence(
    evidence_type="retrieval_receipt",
    source_ref="source-id-or-url",
)
revision = store.save(run, expected_revision=revision)

# Process restart / recovery:
restored_run, observed_revision = store.restore("task-unique-id")
# Pass observed_revision on the next save to prevent lost updates.

store.close()
```

## Guarantees and limits
- Snapshot and newly appended event rows are written inside an explicit SQLite transaction.
- Optimistic revision checks reject stale writers.
- Existing event history cannot be removed or rewritten through this store API.
- Restore checks the stored event ledger against the snapshot.
- SQLite `PRAGMA integrity_check` is exposed.
- File-backed databases receive owner-only mode (`0600`) on POSIX-compatible systems.
- No encryption-at-rest, backup, multi-host coordination, schema migration framework or cloud replication is provided in this increment.
- The application must protect the parent directory, manage retention, backups, privacy and keys.
