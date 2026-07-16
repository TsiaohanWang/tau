---
title: tau_coding · 支撑模块(二)
description: prompt_templates / reload / session_export / shell_config / update_check / version
---

## `tau_coding/prompt_templates.py` — Markdown prompt templates

Lets users author reusable prompt snippets as `*.md` files (in Tau's resource
dirs or a project's `.agents/`) and invoke them as `/name [arguments]`.

- **`_TEMPLATE_VARIABLE_RE`** — matches `{{ variable }}` placeholders.
  `_ARGUMENT_TEMPLATE_VARIABLES = {"arguments", "args"}` — the two names that
  expose the invocation's trailing arguments.
- **`PromptTemplate`** (frozen, slots) — `name`, `path`, `content`,
  `description` (from front-matter or derived from the first line).
- **`load_prompt_templates(paths)`** — loads from every `prompts_dir`, keyed by
  stem, last-write wins; raises `ResourceError` on any diagnostic.
- **`load_prompt_templates_with_diagnostics(paths)`** — the non-fatal variant
  returning `(templates, diagnostics)`; records override and duplicate-name
  diagnostics instead of raising.
- **`render_prompt_template(template, variables, *, missing=None)`** — substitutes
  `{{ var }}`; by default a missing var raises `ResourceError`; pass `missing` to
  substitute a fallback string instead (for user-facing shortcuts).
- **`expand_prompt_template_command(text, templates)`** — the `/name args` entry
  point: rejects `/` (slash commands), `//` (comment), and `/skill:` (skills);
  parses name+args; renders with `arguments`/`args`; if the template has no
  argument placeholder, the args are appended after a blank line.
- **`_template_references_arguments`**, **`_find_prompt_template`** (case/space
  insensitive stem match), **`_parse_prompt_template_command`** (splits on first
  space).
- **`_load_prompt_templates_from_dir*`** — globs `*.md`, dedupes by stem,
  captures read/decode errors as `ResourceDiagnostic` (severity "error"), and
  parses each file via `resources.parse_markdown_resource`.

> Design note: prompt templates are a *resource discovery* concern, kept apart
> from the command registry. They reuse the same `TauResourcePaths` precedence as
> skills/context files, so a project can ship its own `/prompts` alongside its
> `.agents/` skills.

---

## `tau_coding/reload.py` — reload summary types

Defines the before/after summary dataclasses returned by a local resource
reload (`/reload`), so the UI can report exactly what changed.

- **`ReloadCategorySummary`** (frozen, slots) — `before`, `after`, `changed`,
  with a `delta` property (`after - before`).
- **`CodingReloadSummary`** (frozen, slots) — groups one
  `ReloadCategorySummary` per category: `skills`, `prompt_templates`,
  `context_files`, `extensions`, `diagnostics`, plus a `system_prompt_rebuilt`
  flag.

> Design note: a reload touches several independent resource systems; bundling
> their counts into one summary lets the `/reload` command print a single,
> scannable "reloaded N skills, M prompts, …" line without coupling to each
> subsystem's internals.

---

## `tau_coding/session_export.py` — HTML/JSONL transcript export

Renders a session tree + transcript into a self-contained HTML file (or JSONL),
used by `tau export` and the TUI export command.

- **Errors/paths:** `SessionExportError(ValueError)`;
  `default_session_export_path` (`<session>.html`);
  `default_session_export_artifact_path` (in a destination dir).
- **Writers:** `export_session_jsonl` (raw `model_dump_json` per line),
  `export_session_html`, and `export_session_artifact` (picks format by
  `format` arg or suffix). `normalize_export_format` accepts `html`/`htm`/`jsonl`
  (case-insensitive, leading dot stripped); `_export_suffix` maps back.
- **`render_session_html`** — the centerpiece: a full standalone HTML document
  with inline `<style>` (light/dark via `prefers-color-scheme` and a
  `data-theme` toggle persisted to `localStorage`), a sticky sidebar session
  tree, and a transcript stream. It computes `_active_leaf_id` (last `LeafEntry`,
  else last entry), `_active_path_ids` (via `tau_agent.session.path_to_entry`,
  falling back to the leaf on `SessionTreeError`), and `_visible_entries`
  (drops `LeafEntry` plumbing rows — that info is already shown by active-path
  styling).
- **Tree rendering:** `_render_tree` builds `children_by_parent`, finds roots,
  and `_render_tree_chain` deliberately *flattens single-child chains* into
  sibling `<li>`s, only nesting an `<ol>` where history actually forks — so a
  straight-line session doesn't render one nested level per entry. Dangling
  (unreachable) entries are grouped under an "Unreachable entries" node.
- **Entry rendering:** `_render_entry_details` → `_render_entry_detail` (index,
  id, parent link, timestamp, active-path/leaf badges) → `_render_entry_body`,
  which `isinstance`-dispatches over every `SessionEntry` subtype (`MessageEntry`
  → `_render_message_entry` with role icon, tool-call list, optional `data`/
  `details` JSON blocks; `ModelChangeEntry`, `ThinkingLevelChangeEntry`,
  `CompactionEntry`, `BranchSummaryEntry`, `LabelEntry`, `LeafEntry`,
  `SessionInfoEntry`, `CustomEntry`). `_render_json_block` syntax-highlights
  JSON via Pygments (`JsonLexer` + `HtmlFormatter`, nowrap) with a safe escaped
  fallback.
- **Icons:** inline SVG constants `_ICON_USER`/`_ASSISTANT`/`_TOOL`/`_BRANCH`/
  `_LABEL`/`_INFO`/`_MODEL`/`_GENERIC`/`_SUN`/`_MOON`, chosen by `_entry_icon`
  per entry type.
- **Helpers:** `_entry_title`, `_entry_summary` (<=92-char single-line summary via
  `_summarize_text`), `_entry_parent_html`, `_format_timestamp` (UTC), `_escape`
  (`quote=False`) and `_attr` (`quote=True`) for HTML/text escaping.

> Design note: the export is a *pure function of immutable `SessionEntry`s* — no
> `CodingSession` needed. That makes it trivially testable and lets `tau export`
> run on any saved `.jsonl` offline.

---

## `tau_coding/shell_config.py` — durable shell settings

Loads the single durable shell setting (a command prefix prepended to every
shell command the agent runs) from `~/.tau/settings.json`.

- **`ShellConfigError(ValueError)`**.
- **`ShellSettings`** (frozen, slots) — `shell_command_prefix: str | None`;
  `to_json()` emits `{"shellCommandPrefix": …}` or `{}` when unset.
- **`shell_settings_path`** — `~/.tau/settings.json`.
- **`load_shell_settings`** — returns defaults if missing; raises
  `ShellConfigError` on invalid JSON or a non-object.
- **`shell_settings_from_json`** — accepts *either* `shellCommandPrefix` or
  `shell_command_prefix` (never both), rejects unknown fields, and normalizes a
  whitespace-only prefix to `None`. (The dual-name support lets older/newer
  tooling interop; the exclusivity check prevents ambiguous configs.)

> Design note: only one durable shell setting exists today, but the dataclass +
> `from_json` shape means new settings slots in without changing callers.

---

## `tau_coding/update_check.py` — best-effort PyPI update check

On startup, Tau may tell the user a newer version exists or surface release
notes — but *only* as a best-effort, never-blocking notice.

- **Constants:** `PYPI_PACKAGE_NAME = "tau-ai"` (note: the published dist is
  `tau-ai`, not `tau_coding`), `PYPI_JSON_URL`, `UPDATE_CHECK_INTERVAL =
  timedelta(days=1)`, `UPDATE_CHECK_TIMEOUT_SECONDS = 1.5`,
  `TAU_NO_UPDATE_CHECK` env disable, and the bundled
  `data/release-notes/releases.json` path. `Fetcher` / `Clock` type aliases make
  the network + time injectable for tests.
- **Dataclasses:** `UpdateNotice` (current/latest + `message` property with the
  `uv tool upgrade` command), `UpdateCheckResult` (cached `checked_at` +
  `latest_version`), `ReleaseNoteSection` / `ReleaseNotesEntry` (with
  `transcript_items` flattening), `ReleaseNotesNotice` (previous→current, with
  `notes` and a `message` Markdown block).
- **`startup_update_notice(current_version, *, fetcher, cache_path, now, env)`**
  — returns an `UpdateNotice` only if PyPI has a strictly newer *stable* version.
  Skips when disabled (`_update_check_disabled`: `TAU_NO_UPDATE_CHECK` truthy or
  `CI` set), uses a 1-day cache, swallows *all* network/JSON/version errors
  (every failure path is a quiet `None`/`return None`) so startup never blocks.
- **`startup_release_notes_notice(current_version, *, state_path, release_notes)`**
  — on the first run it only records the version (no banner on fresh install);
  on later runs it diffs against the stored `last_seen_version` and returns
  `ReleaseNotesNotice` for entries between the two versions. All I/O failures are
  quiet no-ops.
- **`load_release_notes` / `release_notes_between`** — parse the bundled JSON
  and select entries with `previous < parsed <= current` (sorted).
- **`fetch_latest_pypi_version(*, fetcher)`** — prefers the max *stable* version
  from the `releases` map (skipping prereleases/devreleases and empty file
  lists), falling back to `info.version` when filtered out.
- **Cache/state I/O:** `_cached_update_check_result` (honors the 1-day interval),
  `_write_update_check_cache` / `_write_release_notes_state` (mkdir + write,
  `OSError` swallowed), `_read_last_seen_version`. `_stable_release_versions`
  filters pre/dev releases; `_httpx_fetch_json` wraps `tau_ai.http.get_json`.
- **`_update_check_disabled(env)`** — treats any non-empty, non-false
  `TAU_NO_UPDATE_CHECK` as disabled, and always disables under `CI`.
- **`_utc_now`** — injectable clock default.

> Design note: the *entire* module is written so that any failure (network,
> cache corruption, bad version string, missing file) degrades to "say nothing."
> That is the only acceptable behavior for a startup-time network call.

---

## `tau_coding/version.py` — version helper

A four-line module, but worth naming explicitly since everything above imports
it.

- **`_DISTRIBUTION_NAME = "tau-ai"`** — the *published* distribution name (the
  `tau_coding` import package is not what `importlib.metadata` reports).
- **`_UNKNOWN_VERSION = "0+unknown"`**.
- **`current_version()`** — returns `version("tau-ai")` from package metadata,
  or `_UNKNOWN_VERSION` if the distribution isn't installed (e.g. running from a
  source checkout). Used by `update_check.py` and the CLI `--version`.

> Design note: centralizing the distribution name + fallback here means the
> update checker, the CLI, and any "about" UI all report one consistent version
> string.

---

## How 3f fits the picture

- `thinking.py` — the shared vocabulary every provider/catalog/session layer
  uses for reasoning effort.
- `catalog_loader.py` — turns TOML data into validated `ProviderCatalogEntry`s;
  the source of truth for which providers/models exist.
- `branch_summary.py` — model-assisted context recovery when switching branches.
- `diagnostics.py` / `version.py` / `update_check.py` — operational
  observability + self-update, all best-effort and secret-free.
- `prompt_templates.py` / `reload.py` / `shell_config.py` — user-facing resource
  and settings systems, discovered through `TauResourcePaths` / `TauPaths`.
- `session_export.py` — a pure renderer from immutable `SessionEntry`s to shareable
  HTML/JSONL.

Next: **Part 3g** covers the rendering layer (`rendering/base.py`,
`rendering/transcript.py`) and the extension base (`extensions/base.py`) — the
pieces that turn session state into screen output and let third-party code plug
into Tau.

<!-- NAV -->
[← tau_coding · 支撑模块(一)]({{< relref "./coding-support-1.md" >}})
[↑ 总览]({{< relref "./source-walkthrough.md" >}})
[→ tau_coding · 渲染层]({{< relref "./coding-rendering.md" >}})
