---
title: tau_coding · 会话索引
description: session_manager.py
---

## `tau_coding/session_manager.py` — the session index

`CodingSession` (Part 3b) owns *one* conversation file. The `SessionManager`
owns the *directory of all sessions* so the CLI can list, resume, and create
them across runs.

### `SessionRecordModel` (Pydantic)

The on-disk JSON shape for one session's metadata:

- `id: str` — session id (hex uuid, or `default-<project-hash>`).
- `path: str`, `cwd: str` — JSONL file location and the resolved working dir.
- `model: str`, `provider_name: str | None`.
- `title: str | None` — user-visible name.
- `created_at`, `updated_at: float` — epoch seconds.

`model_config = ConfigDict(extra="ignore")` means new fields can be added
without breaking old index files.

### `CodingSessionRecord` (frozen dataclass)

The in-memory, typed twin of `SessionRecordModel`. It carries `Path` objects
instead of strings and is what the rest of the app uses.

- `from_model` / `to_model` — convert between the JSON model and the record.
- It is `frozen=True, slots=True` like the other Tau data types: immutable and
  memory-light, since the manager may hold many of them.

### `SessionManager`

The index is a set of `index.jsonl` files. There is one *legacy global* index
at `paths.sessions_dir / "index.jsonl"` and one *per-project* index at
`paths.project_session_dir(cwd) / "index.jsonl"`. Each line is a JSON
`CodingSessionRecord`.

Key methods:

- **`index_path`** — the legacy global index.
- **`project_index_path(cwd)`** — the per-project index for a resolved cwd.
- **`list_sessions(cwd=None)`** — returns records sorted by `updated_at`
  descending. With a `cwd`, it reads only that project's index plus any global
  records pointing at that cwd (deduplicated). Without `cwd`, it aggregates the
  global index and every `*/index.jsonl` under the sessions dir.
- **`get_session(session_id)`** — linear scan across all indexes.
- **`latest_session_for_cwd(cwd)`** — the most recently updated session for a
  directory (used by `tau` with no `--session` argument).
- **`create_session(...)`** — calls `prepare_session` then `index_session`.
- **`prepare_session(...)`** — builds a `CodingSessionRecord` *without* writing
  it, resolving the cwd, generating an id (or using a supplied one), and
  computing the JSONL path. It also creates the parent directory.
- **`index_session(record)`** — calls `_upsert`.
- **`get_or_create_default_session(...)`** — returns a stable `default-<hash>`
  session for a project, creating the index entry if missing. This is the
  "just run `tau` in this repo" session.
- **`touch_session(...)`** — updates `model`/`provider_name`/`title` and bumps
  `updated_at` (called whenever a session is used so it floats to the top of
  `list_sessions`).

Index I/O helpers:

- **`_read_index(path)`** — reads a JSONL index into records; missing file → `[]`.
- **`_read_project_records(cwd)`** — project index + global records for that
  cwd; dedup.
- **`_read_all_records()`** — global index + every `*/index.jsonl`; dedup.
- **`_write_index(path, records)`** — writes all records, one JSON object per
  line, trailing newline.
- **`_upsert(record)`** — read the project index, drop any existing entry with
  the same id, append, and write back. So re-opening a session updates its
  metadata in place rather than duplicating it.

### `_deduplicate_records`

Module-level helper: given possibly-overlapping records from multiple indexes,
keep one per id, preferring the one with the newer `updated_at`. This handles
the case where a session appears in both the global and a project index.

> Note the migration story: the global `index.jsonl` is legacy; new sessions are
> written to per-project indexes. The manager reads both so old installs keep
> working.

---

<!-- NAV -->
[← tau_coding · Slash 命令]({{< relref "./coding-commands.md" >}})
[↑ 总览]({{< relref "./source-walkthrough.md" >}})
[→ tau_coding · Provider 配置]({{< relref "./coding-provider-config.md" >}})
