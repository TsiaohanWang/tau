---
title: tau_coding · TUI 界面与控件
description: tui/app / widgets / terminal_title
---

## `tui/app.py` — the Textual app

This is the largest file in `tau_coding` (5741 lines). It contains the
`TauTuiApp` class plus a fleet of `ModalScreen` subclasses for every picker and
dialog. It imports and orchestrates two substantial sibling modules we cover
separately (see `tui/widgets.py` and `tui/terminal_title.py` below). We cover
`app.py` in layers.

### Module constants & small classes

- `LoginRequiredProvider` — a stub `ModelProvider` used so the TUI can open
  *before* any credentials exist; its `stream_response` immediately yields a
  `ProviderErrorEvent` prompting login.
- `RESERVED_EXTENSION_INTERCEPTOR_KEYS = {"ctrl+c", "ctrl+d"}` — keys an
  extension key interceptor is never consulted for, so a buggy interceptor
  cannot swallow the hard quit/interrupt reflexes.

### `_TuiExtensionUiBridge` and the component seam

`_TuiExtensionUiBridge` implements the extension `UiBridge` protocol against the
live app: `notify`, `select`/`confirm`/`input` (each pushing a modal
`Extension*Screen` and awaiting dismissal via `_run_dialog`), `set_slot_widget`
(`_set_extension_slot_widget`), `open_main_view` (`_open_extension_main_view`),
`register_key_interceptor` (`_register_extension_key_interceptor`),
`request_render`, `clear_components`, and `get_prompt_text`. `_run_dialog`
uses `push_screen(screen, callback)` + an `asyncio.Future` so it works from any
coroutine (not just a Textual worker).

`_MainViewHandle` / `_DeadMainViewHandle` manage an extension-owned main-area
view: `close(result)` is idempotent and resolves `wait()` exactly once; every
other teardown path (reload, quarantine, superseded view) resolves `wait()`
with `None` so an awaiting extension task never hangs.

The "component seam" is the host-side machinery for mounting extension widgets
into fixed slots (`#above-prompt-slot`, `#below-prompt-slot`, `#main-slot`):
`_set_extension_slot_widget` → `_reconcile_slot`, `_open_extension_main_view` →
`_reconcile_main_view`, `_close_extension_main_view`, `_refresh_extension_components`,
`_clear_extension_components`, and `_quarantine_extension_widget` (which
isolates a crashing extension widget so it can't take down the TUI, recording a
per-component failure once via `_record_extension_component_failure`). Swaps run
on serialized async continuations (`_schedule_extension_swap`) so same-id
mounts/unmounts never collide with `DuplicateIds`.

### `PromptInput` (TextArea subclass)

The multiline prompt editor. It:

- Applies prompt bindings from `TuiKeybindings`, switching footer mode between
  `normal` / `completion` / `running`.
- Defines `value`/`cursor_position` compatibility aliases over `TextArea`.
- Routes submission/cancellation/completion keys in `on_key`, delegating to the
  app via `_completion_target()` (the `CompletionActionTarget` protocol).
- Handles large pastes by showing a compact placeholder and storing the real
  text (`_show_large_paste_placeholder`, `text_for_submission` expands it back).
- `on_paste` suppresses rendering of pastes over `PASTE_DISPLAY_THRESHOLD`
  characters.

### Modal screens

A consistent family of `ModalScreen` subclasses, each composing a `ListView` +
title + help and routing arrow/enter/escape keys to the list:

- `ExtensionSelectScreen` / `ExtensionConfirmScreen` / `ExtensionInputScreen` —
  back `context.ui.select` / `confirm` / `input`.
- `SessionPickerScreen` — pick an indexed session to resume.
- `TreePickerScreen` — branch from a past session entry; `Enter` branches,
  `S` summarizes, `C` custom summary, `Ctrl+T` toggles tool-call visibility.
  `BranchSummaryInstructionsScreen` collects custom summarization instructions.
- `CommandOutputScreen` — dismissible slash-command output.
- `LoginProviderPickerScreen` (with `LoginProviderSearchInput`) — searchable
  provider list for `/login`.
- `LoginMethodPickerScreen` / `LoginMethodListView` — choose subscription /
  API key / custom provider.
- `ThemePickerScreen` — pick a built-in theme.
- `ModelPickerScreen` (with `ModelPickerSearchInput`) — pick a model or toggle
  scoped-model membership; `Tab` switches all↔scoped.
- `CustomProviderLoginScreen` — collect fields for an OpenAI-compatible custom
  provider (`CustomProviderLoginResult`).
- `LoginScreen` — paste an API key.
- `OAuthLoginScreen` — drives the OAuth flow via `OAuthLoginCallbacks`
  (auth URL, device code, manual code input future).

All share the same navigation idiom: a `ListView` focused on mount, arrow keys
stopped and redirected to list actions, `enter`/`select` dismisses with the
chosen value.

### `TauTuiApp(App[None])`

The main application.

**Construction & layout.** `__init__` takes a `CodingSession` plus
`tui_settings`, startup messages/notices, and an optional `initial_prompt`. It:

- registers Tau themes with Textual (`_register_tau_textual_themes`),
- installs app bindings from `tui_settings.keybindings` (`_app_bindings`),
- seeds `TuiState` from the session's messages
  (`_load_session_messages_from_session`),
- creates the `TuiEventAdapter`,
- sets up the extension-seam tracking dicts and connects the extension runtime
  (`_connect_extension_runtime`),
- initializes the activity indicator, terminal-title controller, completion
  state, etc.

`compose()` lays out (in a `Horizontal` workspace) the `SessionSidebar`,
`main-pane` (`TranscriptView`, the three extension slots, `queued-messages`,
`prompt-row` with `PromptInput`, `CompactSessionInfo`), the `autocomplete`
widget, and `Footer`. The large inline `CSS` string wires every theme variable
(`$tau-…`) to the layout, including the extension mount points.

**Lifecycle.** `on_mount` focuses the prompt, applies responsive layout and
sidebar position, refreshes chrome, emits any pending session-start
(`session.emit_pending_session_start`), and submits the `initial_prompt` if
present. `on_unmount` stops the activity timer, restores the terminal title,
and clears extension components. `on_resize` updates responsive chrome.

**Key routing.** `on_event` consults extension key interceptors *before* Textual
dispatch (porting Pi's `onTerminalInput`), but skips the reserved
`ctrl+c`/`ctrl+d` keys and never fires while a modal is on the stack. Each
`action_*` method implements a binding: `action_submit_prompt`,
`action_submit_follow_up`, `action_cancel`, `action_accept_completion`,
`action_completion_next/previous`, `action_open_command_palette`,
`action_open_session_picker`, `action_cycle_thinking`, `action_cycle_model`,
`action_toggle_tool_results`, `action_toggle_thinking`, `action_edit_queued_message`,
`action_recall_previous_prompt`, `action_quit`.

**Submitting a prompt — the run loop.** `_submit_prompt_from_editor` reads the
prompt, applies any selected completion, and then:

1. If a compaction is active, it defers.
2. If the text is a terminal command (`parse_terminal_command`), it runs
   `_run_terminal_command`.
3. Otherwise it calls `session.handle_command(text)`. If `handled`, it performs
   the requested side effects (clear, reload, new session, compact, export,
   resume, open pickers, login/logout, model/theme/thinking changes) and shows
   the command's message.
4. If the session is already `running`, it remembers the prompt and queues it
   (`_queue_prompt`).
5. Otherwise it remembers the prompt and calls `_submit_prompt(text)`.

`_submit_prompt` increments a `_prompt_run_id` (so a newer run can supersede an
old one), optionally renders the user message *optimistically*
(`_append_optimistic_user_message`, matched later by
`_consume_optimistic_user_event` / `_replace_transformed_optimistic_user_message`),
and launches the `_run_prompt` coroutine as a Textual worker (`exclusive=True`).

`_run_prompt` is the streaming loop:

```python
async for event in self.session.prompt(text, source=..., custom_type=..., details=...):
    if active_run_id != self._prompt_run_id:
        return                       # superseded by a newer run
    if self._consume_optimistic_user_event(...):  # dup of our own optimistic msg
        continue
    if self._replace_transformed_optimistic_user_message(...):
        continue
    if not (_is_user_message_end_event(event) and self.screen_stack):
        self.adapter.apply(event)   # update TuiState
    await self._apply_streaming_transcript_event(event)
```

Each event is first applied to `TuiState` via the adapter, then reflected onto
the *mounted* transcript widgets by `_apply_streaming_transcript_event` —
appending assistant deltas, thinking deltas, tool-call/result items, finishing
the assistant message, and refreshing chrome. This two-step design (state then
view) keeps the model pure and the view a projection of it.

**Extension delivery.** An extension can request a turn via
`_on_extension_turn_requested` → `_deliver_extension_message`, which either
queues the message (if a run is active) or submits it through the normal path.

**Chrome & activity.** `_refresh` / `_refresh_chrome` repaint the sidebar,
header subtitle, queued-message strip, and footer. `_tick_activity` /
`_sync_activity_indicator` / `_apply_activity_indicator` animate a spinner
while a run is in flight. `_refresh_completions` builds the autocomplete window
from `_build_completion_state`.

**Pickers & login.** The many `_open_*` / `_handle_*_result` methods wire each
modal screen to a session or provider action: session picker → `_resume_session`,
tree picker → `_branch_to_tree_entry`, model picker → `session.set_model`,
thinking cycle → `_cycle_thinking_level`, theme picker → `_set_tui_theme`,
login picker → `_open_login` (API key via `LoginScreen`, OAuth via
`OAuthLoginScreen`, custom via `CustomProviderLoginScreen`), logout picker →
`_logout`. Cancel/compaction paths (`action_cancel`, `_cancel_active_prompt`,
`_cancel_active_compaction`) stop the worker and notify.

> The TUI's defining architectural choice: it owns **no agent logic**. Every
> decision (what a command does, how to branch, which model, compacting) is
> delegated to `CodingSession` (Part 3b). The TUI only translates events →
> widgets and widgets → commands.

---

## `tui/widgets.py` — the transcript & sidebar widgets

The views that actually paint the conversation live here (1744 lines). `app.py`
builds its layout by importing `TranscriptView`, `SessionSidebar`,
`CompactSessionInfo`, and the `render_*` helpers. The module is split into
**widgets** (Textual `Widget` subclasses) and **pure render functions** (take a
`ChatItem`/`TuiState` + `TuiTheme`, return Rich renderables — no Textual state).

### Widgets

- `TranscriptLine` (dataclass): a single renderable line paired with its
  selection source, so the TUI can copy a clean text span rather than styled
  markup.
- `SessionSummarySource` (Protocol): the minimal session view the sidebar needs
  (`cwd`, `model`, context usage, thinking level, git branch) — keeps the sidebar
  decoupled from `CodingSession`.
- `SessionSidebar(Static)`: the left rail. Painted by `render_session_sidebar`,
  showing session title, model, thinking level, context-window usage bar, and
  git branch (`_git_branch` shells out to `git rev-parse`).
- `CompactSessionInfo(Static)`: the slim header line above the transcript
  (`render_compact_session_info`), summarizing the same metadata compactly.
- `TauMarkdownBlock` / `ThemedMarkdownWidget` / `ThemedMarkdown` /
  `ThemedCodeBlock` / `LeftAlignedMarkdownHeading`: a Markdown stack overridden to
  honor the active `TuiTheme` (syntax-highlight style via `_markdown_theme`,
  `_markdown_highlight_style`, `_markdown_inline_code_style`). This is how code
  blocks and headings pick up theme colors.
- `TranscriptMessageWidget(Horizontal)`: one assistant/user/tool message row.
  Composes the role gutter, the markdown body, and tool-call/tool-result blocks.
  Handles the "toggle tool results/thinking" collapse state and selection
  styling.
- `StreamingTranscriptMessageWidget(ThemedMarkdownWidget)`: the live message
  currently being generated; re-renders deltas as they arrive and shows the
  spinner/`apply_tool_spinner` placeholder while a tool runs.
- `TranscriptView(VerticalScroll)`: the scrollable transcript container. Its
  `mount`/`update` path calls `_transcript_widget(...)` to turn each `ChatItem`
  into the right widget, appends streaming widgets, and auto-scrolls. Helper
  `_last_transcript_child_is_hidden_thinking_placeholder` suppresses a dangling
  "thinking…" placeholder once real content arrives.

### Pure render helpers (the contract between `state.py` and the widgets)

- `render_chat_item(item, *, theme)` → the Rich renderable for one `ChatItem`;
  dispatches by role via `_chat_item_role_style` / `_tool_accent_style` /
  `_tool_success_style` / `_tool_error_style`.
- `_render_chat_body` / `_render_patch_body`: render assistant text vs. an
  edit/write diff; `_render_tool_chat_body` + `_render_tool_invocation` format a
  tool row (bash shows `$ command` via `_split_tool_invocation`).
- `_use_plain_transcript_body` / `_transcript_plain_body_text` /
  `_plain_markdown` / `_escape_plain_markdown_line`: when a theme or message has
  no markdown, fall back to plain text so copy/selection stays clean.
- `_extract_text_selection` / `_clip_selection_to_text` /
  `_clip_selection_offset`: map a Textual screen selection back to the clean
  source text range for copy.
- `_custom_markup_to_text` / `_custom_selection_text` / `_custom_body_renderable`:
  render extension `custom_message` items through their registered
  `MessageRenderer`.
- `render_completion_suggestions(items, ...)`: turns the `CompletionState` from
  `autocomplete.py` into the suggestion popover (`_bullet_list`, `_short_path`).
- `_context_usage` / `_compact_token_count` / `_context_file_labels` /
  `_context_file_label` / `_thinking_level` / `_git_branch`: sidebar/compact
  derivations.
- `_markdown_theme` / `_fenced_*`: theme-aware fenced-code highlighting.
- `_has_unclosed_fence` / `_fence_language` / `_syntax_language`: detect and
  label unterminated code fences (so a half-streamed block still renders).

> Design note: keeping `render_*` as pure functions means the widget layer never
> reaches into `TuiState` mutable fields directly — `state.py` owns the model,
> these functions only read it. That is why the TUI can re-render on every event
> without duplicating formatting logic.

## `tui/terminal_title.py` — terminal tab-title control

A tiny self-contained module that animates the terminal window/tab title while
Tau runs (e.g. `⠋ τ | my-session`). It is pure stdlib + `os`/`sys` (no Textual
dependency) so it can be unit-tested and reused.

- `MAX_TERMINAL_TITLE_LENGTH = 120`, `OSC_TERMINATOR = "\a"`,
  `TAU_TITLE_MARK = "τ"`, `RUNNING_TITLE_FRAMES` (10 braille spinner frames).
- `terminal_title_supported(*, environ, stream)` — feature-detect: off when
  `TAU_TERMINAL_TITLE` is `0/false/no/off`, when stdout is not a TTY, when
  `TERM=dumb`, or under `CI` unless `TAU_TERMINAL_TITLE=1`.
- `sanitize_terminal_title(value, *, max_length)` — strip OSC-breaking control
  bytes (`_CONTROL_CHARS_RE`), trim, and truncate with a `…` (never emit a
  control char that would break the OSC sequence).
- `build_terminal_title(session_title, *, running, frame)` — assemble
  `τ | <title>` (or just `τ` for an untitled session), prefixing the spinner
  frame while running.
- `osc_terminal_title_sequence(title)` — wrap the sanitized title in an
  OSC 0 (`\x1b]0;…\a`) sequence.
- `TerminalTitleController` — stateful writer that (a) only emits when
  `terminal_title_supported`, (b) **skips duplicate** titles
  (`_last_title` guard), and (c) disables itself permanently if a write raises
  (`_write` swallows `OSError`/`ValueError`). `update(...)` writes the current
  title; `restore()` resets to the neutral `τ` idle mark on shutdown.

> Design note: the controller's "write-on-change + self-disable-on-error" policy
> keeps title updates cheap (no flicker, no redundant escape sequences) and safe
> in environments where OSC writes are unsupported or noisy.

## How 3d fits the picture

- `state.py` + `adapter.py` = the pure transcript model and the event→state
  mapping (no Textual dependency).
- `config.py` = durable appearance (keybindings, themes).
- `autocomplete.py` = prompt suggestion logic (pure string functions).
- `app.py` = the Textual `App`, all modal screens, the extension seam, and the
  `_submit_prompt` → `_run_prompt` streaming loop that ties `CodingSession`
  events to the widgets.

Next: **Part 3e** covers authentication (`credentials.py`, `oauth*.py`),
`cli.py`, the `extensions/` package, and `__init__.py` — the entry points that
actually launch all of the above.

<!-- NAV -->
[← tau_coding · TUI 状态与适配]({{< relref "./coding-tui-state.md" >}})
[↑ 总览]({{< relref "./source-walkthrough.md" >}})
[→ tau_coding · 凭证存储]({{< relref "./coding-credentials.md" >}})
