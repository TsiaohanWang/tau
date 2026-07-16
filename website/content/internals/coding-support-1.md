---
title: tau_coding · 支撑模块(一)
description: thinking / catalog_loader / branch_summary / diagnostics
---

## `tau_coding/thinking.py` — thinking-mode primitives

A tiny, dependency-free module that *centralizes the vocabulary* of reasoning
effort so every layer (catalog, session, TUI, providers) agrees on the same set
of levels. This avoids stringly-typed reasoning settings scattered across the
codebase.

- **Type aliases:**
  - `ThinkingLevel = Literal["off", "minimal", "low", "medium", "high", "xhigh"]`
    — the user-facing UI vocabulary.
  - `ThinkingParameter = Literal["reasoning_effort", "reasoning.effort", "anthropic.thinking"]`
    — the *wire parameter name* each provider expects (OpenAI uses the first two
    in different API shapes; Anthropic uses `anthropic.thinking`). The catalog
    picks which one a model uses.
  - `ReasoningEffort = Literal["none", "minimal", "low", "medium", "high", "xhigh"]`
    — the OpenAI-compatible value (note `"off"` maps to `"none"`).
- **`THINKING_LEVELS`** — the canonical ordered tuple; `"off"` first so cycling
  reaches it.
- **`DEFAULT_THINKING_LEVEL = "medium"`**.
- **`THINKING_LEVEL_DESCRIPTIONS`** — human-readable labels for the TUI.
- **`normalize_thinking_level(value)`** — case/space-insenstive validation;
  `None` → default; raises a user-facing `ValueError` listing valid modes.
- **`normalize_thinking_levels(values)`** — validate a *sequence* (used by the
  catalog); rejects a bare string, empty lists, and duplicates.
- **`reasoning_effort_for_level(level)`** — maps to OpenAI: `"off"` → `"none"`,
  otherwise the same word.
- **`anthropic_thinking_budget_for_level(level)`** — maps to Anthropic extended-
  thinking token budgets: `minimal=1024`, `low=2048`, `medium=4096`,
  `high=8192`, `xhigh=16384`; `"off"` → `None` (no extended thinking).
- **`next_thinking_level(current, *, available)`** — stable cyclic rotation used
  by the TUI's "cycle thinking" key; wraps with modulo; unknown → first
  available.

> Design note: the module separates the *UI level* (stable, friendly) from the
> *provider parameter* (wire-specific). That is why adding a new provider later
> only means adding a mapping here plus a catalog entry, not touching the TUI.

---

## `tau_coding/catalog_loader.py` — provider catalog loading

Loads `tau_coding/data/catalog.toml` (built-in) and overlays the user's
`~/.tau/catalog.toml`, producing validated `ProviderCatalogEntry` objects used
by `provider_catalog.py`.

- **Constants:** `CATALOG_SCHEMA_VERSION = 1`, `USER_CATALOG_FILENAME = "catalog.toml"`,
  `_THINKING_FIELDS` (the four thinking keys that must be merged as a *group*,
  mirroring `_merge_provider_config` in `provider_config.py`).
- **Pydantic validators with strict types** (`_NonEmptyString`,
  `_NonEmptyStringTuple`, `_PositiveInt`, `_NonNegativeFloat`) — `extra="forbid"`
  and `frozen=True` on `_CatalogCostTier`, `_CatalogModelMetadata`,
  `_CatalogProvider`, `_CatalogFile` so malformed TOML fails loudly and entries
  are immutable.
- **`CatalogError(ValueError)`** — the single exception type for bad catalog
  files.
- **`builtin_catalog_resource_text()`** — reads the packaged TOML via
  `importlib.resources.files`.
- **`builtin_catalog()`** (`@cache`) — parsed/validated built-in providers.
- **`user_catalog_path(paths)`** — `~/.tau/catalog.toml`.
- **`effective_catalog(paths)`** — returns built-in if no user file; otherwise
  parses, validates, `_merge_raw_catalogs`, and re-validates.
- **`save_user_catalog_entries(entries, paths)`** — upserts full provider
  definitions into the user catalog (used by `/setup`); preserves other entries,
  writes atomically via `_atomic_write_text`.
- **Merge logic:** `_merge_raw_catalogs` overlays provider tables by name
  (overlay wins, new providers keep their order); `_merge_raw_provider` merges
  scalar overrides, concatenates `models` with `dict.fromkeys` de-dup, deep-merges
  `context_windows`/`headers`/`compat`/`model_metadata`, and — critically —
  treats the four thinking keys as a *unit*: if the overlay sets any thinking
  field, the whole group is replaced and the base's thinking group dropped.
  `_merge_model_metadata` does the same nested merge for per-model metadata.
- **Validation:** `_entries_from_raw` → `_entry_from_provider` runs semantic
  checks (default model in `models`; thinking models / context windows / metadata
  keys all reference real models; `thinking_default ∈ thinking_levels`; final
  cost tier must omit `max_input_tokens`; tier limits strictly increasing) and
  raises `CatalogError` with precise, dotted field paths.
- **Serialization round-trip:** `_raw_provider_from_entry` / `_raw_model_metadata_from_entry`
  regenerate TOML-serializable dicts; `_catalog_to_toml` and `_toml_value` /
  `_toml_key` emit clean TOML; `thinking_level_map` is split into positive
  entries + `unsupported_thinking_levels` (the inverse of the load-time merge in
  `_model_metadata_from_provider`, which turns `unsupported_thinking_levels`
  back into `None` map values).
- **`_format_validation_error` / `_dotted_location`** — turn Pydantic errors into
  human-readable `providers.<name>.<field>` paths (resolving the array index to
  the provider name).

> Design note: the catalog is *data, not code*. The loader's job is to make data
> authoritative and code-derived: providers are validated once here, then the
> runtime never re-checks them. Strict Pydantic models + a single `CatalogError`
> type keep that contract airtight.

---

## `tau_coding/branch_summary.py` — abandoned-branch summaries

When the user switches session branches, the abandoned branch's conversation can
be summarized by the model and re-attached as context. This module builds the
prompt and parses the result.

- **Constants / prompts:** `BRANCH_SUMMARY_SYSTEM_PROMPT` (strictly "summarize,
  do not continue"), `BRANCH_SUMMARY_PREAMBLE` (the "you explored a different
  branch" framing prepended to the summary), `BRANCH_SUMMARY_PROMPT` (a fixed
  Markdown template with Goal / Constraints / Progress / Key Decisions /
  Next Steps sections), and `MAX_SUMMARY_SOURCE_MESSAGE_CHARS = 4_000`,
  `MAX_SUMMARY_SOURCE_TOTAL_CHARS = 60_000`, `TOOL_RESULT_MAX_CHARS = 2_000` —
  hard caps so the summary request itself never blows up the context window.
- **`summarize_branch_messages_with_model(*, provider, model, messages, custom_instructions, replace_instructions)`**
  — streams a `UserMessage` (no tools) through the provider, returns the
  assistant text or `None` on any `ProviderErrorEvent` / empty result, then
  wraps it with `_add_branch_summary_context`.
- **`_branch_summary_prompt`** — serializes the conversation and assembles the
  instructions; `replace_instructions` swaps the template entirely, otherwise
  `custom_instructions` is appended as "Additional focus".
- **`_serialize_branch_conversation`** — trims each message to
  `MAX_SUMMARY_SOURCE_MESSAGE_CHARS`, stops when the running total exceeds
  `MAX_SUMMARY_SOURCE_TOTAL_CHARS`, and appends an "[N message(s) omitted]"
  note. This budget discipline is why a 60k-char branch still fits a summary
  request.
- **`_format_summary_source_message` / `_format_assistant_summary_source` /
  `_format_tool_call_arguments`** — render each `AgentMessage` into a compact
  labeled line; tool calls are shown as `name(key=val, …)`.
- **`_trim_summary_source_text`** — truncation with an explicit "[… N more
  characters truncated]" marker.
- **`_add_branch_summary_context`** — scans assistant tool calls for `read`,
  `edit`, `write` on `path` arguments, emitting `<read-files>` /
  `<modified-files>` blocks so the summary retains the most decision-relevant
  file list. `read_only` files (read but not modified) are separated from
  `modified`.

> Design note: the summarizer is deliberately *lossy but structured*. It trades
> verbatim fidelity for a bounded, schema-shaped summary plus the file-set, which
> is what an agent actually needs when it later returns to a branch.

---

## `tau_coding/diagnostics.py` — structured failure logging

Appends machine-readable JSONL diagnostics when agent calls fail, so support /
debugging can reconstruct what happened without secrets.

- **`AgentCallDiagnosticContext`** (frozen, slots) — non-secret context:
  `provider_name`, `model`, `cwd`, `session_id`, `run_id`. Note it deliberately
  carries *no* API keys or message content.
- **`AgentCallDiagnosticLogger`** — constructed with a `path`; `from_paths`
  builds it at `TauPaths().agent_calls_log_path`. `log_exception` writes a
  `kind="exception"` entry with type/message/full traceback; `log_error_event`
  writes a `kind="error_event"` entry with the `ErrorEvent.message`,
  `recoverable` flag, and optional `data`. `_append` makes the parent dir and
  appends one JSON line (sorted keys) — append-only, so crashes mid-write don't
  corrupt prior entries.
- **`new_agent_call_run_id()`** — a `uuid4().hex` identifying one coding-session
  agent call; threaded through `AgentCallDiagnosticContext` so multiple log
  entries for the same run share an id.
- **`_base_entry`** — stamps `timestamp` (UTC ISO), `kind`, `phase`, and the
  context fields. The `phase` argument lets callers record *where* in the loop
  the failure happened (provider call, tool execution, compaction, …).

> Design note: diagnostics are separated from user-facing errors. They are
> append-only, secret-free, and structured so they can be grepped/parsed later;
> nothing here is shown to the user unless explicitly surfaced.

---

<!-- NAV -->
[← tau_coding · 扩展系统]({{< relref "./coding-extensions.md" >}})
[↑ 总览]({{< relref "./source-walkthrough.md" >}})
[→ tau_coding · 支撑模块(二)]({{< relref "./coding-support-2.md" >}})
