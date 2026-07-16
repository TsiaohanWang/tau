---
title: tau_coding · TUI 状态与适配
description: tui/state / adapter / config / autocomplete
---

## `tui/state.py` — the transcript model

### `ChatItemRole`

A `Literal` of the kinds of block the transcript can show: `user`, `assistant`,
`tool`, `error`, `status`, `thinking`, `skill`, `branch_summary`,
`compaction_summary`, `custom`. Each is rendered with a role-specific border
color (see `config.py` themes).

### Constants

Preview/UX tunables: `TOOL_RESULT_PREVIEW_LINES`, `TOOL_PATCH_PREVIEW_LINES`,
`TOOL_RESULT_PREVIEW_CHARS`, `TERMINAL_COMMAND_OUTPUT_PREVIEW_LINES`, the
`TOOL_SPINNER_FRAMES` (braille spinner), `_INVOCATION_MARKERS` (`"→ "`, `"▸ "`)
the spinner temporarily replaces, and `TOOL_TIMER_MIN_SECONDS` (don't flash a
`(0s)` timer on instant tool calls).

### `ChatItem` (dataclass, `slots=True`)

One rendered transcript row. Key fields:

- `role`, `text` — the block kind and primary text.
- `tool_call_id` — links a tool call to its result/updates.
- `tool_result_text`, `tool_result` — the formatted result *and* the raw
  `AgentToolResult`, kept so a registered `render_result` can re-format lazily.
- `update_text` — live progress while a tool runs.
- `tool_name`, `tool_arguments` — for the `render_call` hook.
- `started_at` — monotonic timestamp (for the elapsed timer).
- `always_show_tool_result`, `custom_type`, `details`.

### `TuiState` (dataclass, `slots=True`)

The mutable display state for one TUI session:

- `items: list[ChatItem]`, `assistant_buffer` (accumulates streamed text before
  it is flushed into a final `assistant` item).
- `running`, `error`, `show_tool_results`, `show_thinking`.
- `queued_steering`, `queued_follow_up` — pending messages (from
  `QueueUpdateEvent`).
- `skills` — for presentation-only path matching (a `read` of a skill file is
  shown as a "skill" item).
- custom/tool renderers (`custom_renderer`, `tool_call_renderer`,
  `tool_result_renderer`) — installed by the extension runtime.
- `tool_spinner` — current spinner frame.

Important methods:

- `add_item`, `add_user_message` — `add_user_message` is smart: it recognizes
  branch-summary and compaction-summary payloads (via `_parse_branch_summary_message`
  / `_parse_compaction_summary_message`) and skill invocations, storing them as
  their own item kinds so they render specially (and stay collapsible).
- `add_tool_call` — appends a collapsed tool-call item, or a `skill` item when
  the `read` targets a loaded skill path (`_read_skill_name`).
- `record_tool_update` / `record_tool_result` — attach progress / results to
  the matching tool item by `tool_call_id`, or append an orphan result.
- `add_thinking_delta` — append reasoning fragments to a `thinking` block.
- `resolve_tool_invocation` / `resolve_tool_result` / `resolve_custom_markup` —
  lazily call the installed renderers at draw time; while a tool is still
  running (`tool_spinner` set), the spinner frame replaces the static marker and
  an elapsed time is shown after `TOOL_TIMER_MIN_SECONDS`.
- `toggle_tool_results`, `toggle_thinking`, `update_queue`, `queued_message_count`,
  `clear`, `set_skills`, `load_messages` (rebuild the transcript from restored
  `AgentMessage`s), `find_tool_item`.

### Formatting helpers

- `format_elapsed` — terse `23s` / `1m 23s` / `1h 2m`.
- `apply_tool_spinner`, `format_tool_call_block` / `format_tool_call_invocation`
  — terse, tool-specific invocations (`read path:1-20`, `$ command`,
  `edit path`). `bash` shows `$ command` without the `→` marker.
- `format_tool_result_block` / `format_tool_result_summary` — renders the result,
  with a collapsed preview (`_preview_text`) and an edit-patch preview
  (`_result_patch`).
- `format_terminal_command_result_block` — formats `!!` terminal-command output
  for the transcript.

> The state module is pure data + formatting. It has no Textual imports, which
> is the whole point: it is testable and reusable independent of the UI.

---

## `tui/adapter.py` — events → state

`TuiEventAdapter` is the only place that maps `AgentEvent`s onto `TuiState`.
Its `apply(event)` is a big `isinstance` chain:

- `AgentStartEvent` → `running = True`, clear error.
- `AgentEndEvent` → flush assistant buffer, `running = False`.
- `MessageStartEvent` → reset `assistant_buffer` for an assistant turn.
- `MessageDeltaEvent` → append to `assistant_buffer`.
- `ThinkingDeltaEvent` → `add_thinking_delta`.
- `QueueUpdateEvent` → `update_queue`.
- `MessageEndEvent` → if `user`, `add_user_message`; if `tool`, ignore (the
  harness already recorded it via `ToolExecutionEndEvent`); otherwise flush the
  assistant buffer into an `assistant` item.
- `ToolExecutionStartEvent` → flush buffer, `add_tool_call`.
- `ToolExecutionUpdateEvent` → `record_tool_update`.
- `RetryEvent` → a transient `status` item.
- `ToolExecutionEndEvent` → `record_tool_result`.
- `ErrorEvent` → flush, mark error/cancellation; non-recoverable stops `running`.

`_flush_assistant_buffer` pushes any accumulated streamed text into a final
assistant item. This separation means the *same* adapter could feed any view;
only `app.py` knows about Textual.

---

## `tui/config.py` — durable TUI settings

### `TuiKeybindings` (frozen)

Every key the TUI uses, with defaults: `cancel=escape`, `command_palette=ctrl+k`,
`session_picker=ctrl+r`, `queue_follow_up=alt+enter`, `accept_completion=tab`,
`thinking_cycle=shift+tab`, `model_cycle=ctrl+p`, `toggle_thinking=ctrl+t`,
`toggle_tool_results=ctrl+o`, `copy_message=ctrl+c`, `quit=ctrl+d`, plus
`completion_next/previous` (up/down). `to_json` serializes them.

### `TuiThemeName` and `TuiRoleStyle`

`TuiThemeName = "tau-dark" | "tau-light" | "high-contrast"`. `TuiRoleStyle`
is just `border` + `body` colors for one transcript role.

### `TuiTheme` (frozen)

A fully-resolved palette: screen/chrome/sidebar/transcript/prompt colors,
autocomplete, accent, markdown colors, completion colors, `syntax_theme`, and
`role_styles` (one `TuiRoleStyle` per role). Three concrete instances are
defined: `TAU_DARK_THEME`, `TAU_LIGHT_THEME`, `HIGH_CONTRAST_THEME`, collected
in `_THEMES` and exposed via `get_tui_theme` / `BUILTIN_TUI_THEME_NAMES`.

### `TuiSettings` (frozen)

`keybindings`, `theme` (name, resolved via `resolved_theme`),
`auto_copy_selection`, `sidebar_position` (`left`/`right`/`off`). Persisted at
`tui.json` via `load_tui_settings` / `save_tui_settings` /
`tui_settings_from_json`. Parsing validates allowed fields, rejects duplicate
keybindings (`_reject_duplicate_keys`), and rejects unknown themes.

---

## `tui/autocomplete.py` — prompt completions

### Data types

- `CompletionOption(value, description)` — an argument value.
- `CompletionItem(display, replacement, start, end, description, category)` —
  one suggestion; `apply(text)` splices `replacement` into the prompt.
- `CompletionState(items, selected_index)` — the current suggestion set with
  `select_next` / `select_previous` (wrapping) and a `selected` property.

### `build_completion_state(text, ...)`

The entry point. Given the current prompt text and the universe of commands,
skills, prompt templates, model/provider/thinking/theme/session names, and the
cwd, it returns the relevant `CompletionState`:

- If the text is not a `/` command (and not `//`), it offers file-reference
  (`@path`) completions and, inside a `!`/`!!` shell command, shell path
  completions (`_shell_path_completions`). Ignored dirs
  (`IGNORED_FILE_COMPLETION_DIRS`) and `MAX_FILE_COMPLETIONS` bound the scan.
- For `/skill:…` it completes skill names.
- For a known command with an argument, `_command_argument_completions` supplies
  values: `/model` & `/scoped-models` → model names; `/login` & `/logout` →
  provider names; `/resume` → session ids; `/theme` → theme names.
- Otherwise it completes command names (`_command_completions`) and prompt
  template names, sorted by prefix match.

The remaining helpers (`_file_reference_completions`, `_shell_path_completions`,
`_command_alias_completions`, `_value_completions`, `_completion_options`,
`*_token_end`) are pure string logic; the function returns an immutable
`CompletionState` the app renders.

---

<!-- NAV -->
[← tau_coding · 渲染层(print/json)]({{< relref "./coding-rendering-print.md" >}})
[↑ 总览]({{< relref "./source-walkthrough.md" >}})
[→ tau_coding · TUI 界面与控件]({{< relref "./coding-tui-app.md" >}})
