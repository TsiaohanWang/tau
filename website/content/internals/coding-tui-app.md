---
title: tau_coding · TUI 界面与控件
description: tui/app / widgets / terminal_title
---

## `tui/app.py` — the Textual app

This is the largest file in `tau_coding` (5741 lines). It contains the
`TauTuiApp` class plus a fleet of `ModalScreen` subclasses for every picker and
dialog. It imports and orchestrates two substantial sibling modules covered
separately (see `tui/widgets.py` and `tui/terminal_title.py` below). `app.py` is
covered in layers.

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
view) keeps the model pure and the view a projection of it: the adapter is the
only writer of `TuiState`, while `_apply_streaming_transcript_event` only reads
state to update widgets, so the event→state→view pipeline can be reasoned about
and tested in isolation.

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

> Design note: the TUI's defining architectural choice is that it owns **no
> agent logic**. Every decision — what a command does, how to branch, which
> model, whether to compact — is delegated to `CodingSession` (Part 3b). The TUI
> only translates events → widgets and widgets → commands. This boundary is not
> a stylistic preference but a load-bearing constraint inherited from Tau's
> architecture: `TUI = one possible frontend`, and "The core stays portable…
> Frontends consume events" (Tau README). The agent harness in `tau_agent`
> emits portable `AgentEvent`s and must remain free of Textual, Rich, and any
> UI concern, so that the same harness can drive the print renderer, the JSON
> renderer, or this Textual frontend interchangeably. Concretely, `app.py`
> calls `CodingSession` methods and consumes the `AgentEvent` stream; it never
> re-implements branching, model selection, or compaction. The Textual
> framework (https://textual.textualize.io/) is chosen as the interactive
> frontend precisely because its `ModalScreen`/`Widget` composition model lets
> the TUI stay a thin projection layer: pickers, dialogs, and the transcript are
> all widgets that render from `TuiState`, never from embedded agent logic.

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
> these functions only read it. This stateless, read-only projection is what
> lets the TUI re-render on every event without duplicating formatting logic,
> and it is the practical consequence of the event→state→view two-phase design:
> events mutate the model (via the adapter), the view is derived from the model.
> Because the renderers are pure (input: a `ChatItem`/`TuiState` + `TuiTheme`;
> output: a Rich renderable), they are independently testable and reusable by
> both the interactive transcript and any other consumer of `TuiState`.

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
> in environments where OSC writes are unsupported or noisy. The `_last_title`
> guard prevents re-emitting an identical escape sequence on every activity tick,
> and the permanent self-disable on `OSError`/`ValueError` means a broken or
> unsupported terminal can never turn a cosmetic title update into a crash —
> consistent with the module's deliberate lack of any Textual dependency, so it
> remains unit-testable as pure stdlib.

## 逐方法深度剖析(app.py)

> 以下为 `app.py` 各顶层类与方法的逐方法展开,是对上方分层概述的细化补充。

# tau_coding/tui/app.py 源码逐方法剖析

> 本文件是 Tau 编码会话的交互式 Textual 前端。它把 `CodingSession` 的 agent 事件流渲染到图形界面,并提供命令、登录、会话选择、补全、扩展 UI 桥等全套交互。下文按"类 → 方法"逐条展开,严格基于源码行为。

> 设计要点:`TauTuiApp` 不持有任何 agent 决策逻辑,所有分支/模型选择/压缩等动作都委派给 `CodingSession`;本文件只负责把 `AgentEvent` 投影到 widget,以及把 widget 交互回传为命令(`TUI = one possible frontend`,与 README "The core stays portable… Frontends consume events" 一致)。

---

## 顶层常量与类型别名

- `BindingEntry = Binding | tuple[str, str] | tuple[str, str, str]`:键位绑定的联合类型别名。
- `SIDEBAR_MIN_WIDTH/HEIGHT`、`ACTIVITY_TICK_SECONDS`、`ACTIVITY_COLOR_FADE_STEPS`、`ACTIVITY_INDICATOR_HEIGHT`、`COMPLETION_MAX_VISIBLE_LINES` 等常量:控制侧栏最小尺寸、活动指示器动画节拍、补全窗口最大行数等 UI 阈值。
- `PROMPT_PLACEHOLDER` / `NO_STORED_CREDENTIALS_MESSAGE`:提示占位符与 `/logout` 无凭据时的提示文案。
- `PASTE_DISPLAY_THRESHOLD = 2_000`:粘贴内容超过该字符数时只显示占位符,不渲染原文。

---

## LoginRequiredProvider

占位用模型 provider,用于在用户尚未登录时让 TUI 能够正常启动(而不是崩溃)。

### `__init__(self, message: str) -> None`
保存一条"需要登录"的说明文案 `self.message`。

### `async def aclose(self) -> None`
空的资源关闭方法,不做任何事(外壳 provider 无需清理)。

### `def stream_response(self, *, model, system, messages, tools, signal=None) -> AsyncIterator[ProviderEvent]`
立即返回一个只产出一条 `ProviderErrorEvent(message=self.message)` 的异步迭代器。这样当用户未登录就发起对话时,事件流会立刻以"需登录"错误结束,UI 能友好提示。

---

## _TuiExtensionUiBridge

把扩展(extension)API 的 UI 请求路由到正在运行的 Textual 应用。它是扩展运行时与 TUI 之间的"桥"。

### `__init__(self, app: TauTuiApp) -> None`
保存宿主应用引用 `self._app`。

### `property has_ui -> bool`
始终返回 `True`,表示已挂载可交互 TUI。

### `def notify(self, message: str, level: str = "info") -> None`
把扩展通知转发到 `app._notify`,将扩展的 `info/warning/error` 映射到内部严重级别字典 `_SEVERITIES`。

### `async def select(self, title, options, *, timeout=None) -> str | None`
打开 `ExtensionSelectScreen` 模态选择器,通过 `_run_dialog` 等待结果;取消/超时返回 `None`。

### `async def confirm(self, title, message, *, timeout=None) -> bool`
打开 `ExtensionConfirmScreen` 确认框;确认返回 `True`,否则 `False`(默认 `False`)。

### `async def input(self, title, placeholder="", *, timeout=None) -> str | None`
打开 `ExtensionInputScreen` 单行文本输入;返回输入文本或 `None`。

### `property supports_components -> bool`
返回 `True`,表示 TUI 可承载扩展 widget。

### `property theme -> TuiTheme`
返回 app 当前解析出的 TUI 主题,供 widget 工厂使用。

### `def get_prompt_text(self) -> str`
返回当前 prompt 编辑器文本(委托 `app._current_prompt_text()`)。

### `def request_render(self) -> None`
请求重渲染已挂载的扩展 widget(委托 `app._refresh_extension_components()`)。

### `def set_slot_widget(self, key, content, *, placement="above_prompt") -> None`
挂载或移除一个扩展 slot widget(委托 `app._set_extension_slot_widget`)。

### `def open_main_view(self, factory) -> MainViewHandle`
打开一个全主区域扩展视图(委托 `app._open_extension_main_view`)。

### `def register_key_interceptor(self, handler) -> Callable[[], None]`
注册按键前拦截器,返回取消订阅函数(委托 `app._register_extension_key_interceptor`)。注释说明它模拟 Pi 的 `onTerminalInput`,在主屏幕底层派发前被咨询。

### `def clear_components(self) -> None`
拆除所有扩展自有 UI(委托 `app._clear_extension_components()`)。

### `async def _run_dialog(self, screen, *, default, timeout) -> _DialogResult`
核心对话框运行器。用 `push_screen(screen, _resolve)` + `asyncio.Future`(而非 `push_screen_wait`),可在任意协程上下文工作。`_resolve` 将 Textual 传来的 `None`(取消)映射为 `default`。`timeout` 非 `None` 时调用 `asyncio.wait_for`;超时若 dialog 仍是顶层则 `screen.dismiss(default)`。注意:若超时前已有其它屏幕压在 dialog 之上,旧的 dialog 会留在栈里直至被手动关闭(已知限制)。

---

## _MainViewHandle

宿主侧对"已打开扩展主视图"的句柄,类似 Pi 的 `done(result)`。

### `__init__(self, app: TauTuiApp, result: asyncio.Future) -> None`
保存 app、标记 `_open=True`、初始化 `widget=None` 以及创建于事件循环的 `result` future。

### `def close(self, result=None) -> None`
幂等关闭:若已关则直接返回;否则标记关闭、`_resolve(result)`、`app._close_extension_main_view(self)`。

### `def _resolve(self, result) -> None`
一次性地 `result.set_result`(已完成则忽略,保证 `wait()` 只被唤醒一次)。

### `async def wait(self) -> object | None`
await 拆除结果 future,返回 `close` 传入的 `result`(被清除时为 `None`)。

### `property is_open -> bool`
返回当前是否仍打开(本质是 `_open`)。

---

## _DeadMainViewHandle

当视图无法打开时返回的空操作主视图句柄。

### `def close(self, result=None) -> None`
什么都不做(`result` 被忽略)。

### `async def wait(self) -> object | None`
立即返回 `None`(死句柄永不打开视图)。

### `property is_open -> bool`
始终返回 `False`。

---

## CompletionActionTarget (Protocol)

仅声明 app 上为 prompt 补全绑定所提供的动作接口(只有方法签名,无实现):

- `action_accept_completion(self) -> None`
- `action_cancel(self) -> None`
- `action_completion_next(self) -> None`
- `action_completion_previous(self) -> None`
- `action_open_command_palette(self) -> None`
- `action_open_session_picker(self) -> None`
- `action_cycle_thinking(self) -> None`
- `action_cycle_model(self) -> None`
- `action_toggle_tool_results(self) -> None`
- `action_toggle_thinking(self) -> None`
- `action_edit_queued_message(self) -> bool`
- `async action_submit_prompt(self) -> None`
- `async action_submit_follow_up(self) -> None`

---

## SessionCompletionRecord (Protocol)

恢复选择器补全所需的会话元信息(仅属性签名):

- `id: str`
- `title: str | None`
- `model: str`
- `cwd: Path`
- `updated_at: float`

---

## PromptInput(TextArea)

多行提示输入组件,继承自 Textual `TextArea`,带补全键位与粘贴处理。`BINDINGS` 为空;类属性 `shell_mode_style` 为 shell 模式边框样式。

### `__init__(self, *, tui_keybindings=None, **kwargs) -> None`
关闭 `highlight_cursor_line`,调用父类构造;保存 `tui_keybindings`(默认 `TuiKeybindings()`),复制一份基础绑定 `_base_bindings`,初始 `_footer_mode="normal"`,初始化粘贴占位队列,调用 `_apply_prompt_bindings()`。

### `def set_footer_mode(self, mode) -> None`
切换 footer 显示的绑定集(`normal`/`completion`/`running`):若变化则重算绑定并 `refresh_bindings()`。

### `def _apply_prompt_bindings(self) -> None`
用 `BindingsMap.merge([_base_bindings, BindingsMap(_prompt_bindings(...))])` 重新生成绑定映射。

### `property value -> str`
兼容别名,返回 `self.text`。

### `value.setter`
把字符串赋给 `self.text`。

### `property cursor_position -> int`
返回扁平光标偏移量(按行列累加计算),供 `Input` 风格代码兼容。

### `cursor_position.setter`
把偏移量反算成 `(row, column)` 并 `move_cursor`。

### `def action_accept_completion(self) -> None`
转发到 `self._completion_target().action_accept_completion()`。

### `def action_completion_next(self) -> None`
若有补全选项则转给 target 的 `action_completion_next`,否则在 prompt 中下移一行。

### `def action_completion_previous(self) -> None`
若有补全则转 target;否则先尝试 `action_edit_queued_message`(编辑已排队消息),失败才在 prompt 中上移。

### `def action_cancel(self) -> None`
转发到 target 的 `action_cancel()`。

### `def action_open_command_palette(self) -> None` / `action_open_session_picker` / `action_cycle_thinking` / `action_cycle_model` / `action_toggle_tool_results` / `action_toggle_thinking`
这些都是 `action_*`,统一转发到 `self._completion_target()` 对应方法。

### `def action_clear_prompt(self) -> None`
若当前有选中文本则不动;否则清空 `self.text`、光标归零、清除待粘贴记录。

### `def get_line(self, line_index) -> Text`
获取一行文本并高亮 shell 前缀:首行且处于 shell 模式时,用 `_terminal_command_prefix_span` 求出前缀区间并 `stylize`。

### `async def action_submit_follow_up(self) -> None` / `async def action_submit_prompt(self) -> None`
分别转发到 target 的 `action_submit_follow_up` / `action_submit_prompt`。

### `def action_insert_newline(self) -> None`
`self.insert("\n")` 插入换行。

### `async def action_quit(self) -> None`
转发到 `app.action_quit()`。

### `def action_scroll_down(self)` / `action_scroll_up(self)`
聚焦时把上下键分别用于 `action_completion_next` / `action_completion_previous`(补全导航)。

### `def on_paste(self, event: events.Paste) -> None`
粘贴处理:若粘贴文本长度 ≤ `PASTE_DISPLAY_THRESHOLD` 则放行;否则 `event.stop()` + `prevent_default()`,改调 `_show_large_paste_placeholder` 显示紧凑占位符。

### `def _show_large_paste_placeholder(self, content) -> None`
占位计数 +1,生成占位符串,加入 `_pending_pastes`,并 `self.insert(placeholder)` 把占位符插到编辑器。

### `def _large_paste_placeholder(self, content, paste_number) -> str`
根据字符数/行数/KB 构造形如 `[Pasted content #n: 1,234 characters, 3 lines, 1.2 KB]` 的描述。

### `def _clear_pending_paste(self) -> None`
清空 `_pending_pastes`(编辑器被清空时调用)。

### `def sync_pending_paste(self) -> None`
按需失效:若某占位符已不在 `self.text` 中,则从 `_pending_pastes` 剔除(编辑走样时同步)。

### `def text_for_submission(self) -> str`
提交文本:先 `sync_pending_paste()`,再把文本中每个完整占位符替换回原始大段内容,返回可用于提交的文本。

### `async def on_key(self, event: Key) -> None`
在默认输入处理前路由补全/提交按键。依次判断:`queue_follow_up`(提交 follow-up)、`enter`(提交)、`shift+enter`(换行)、`accept_completion`、`cancel`、`command_palette`、`session_picker`、`thinking_cycle`(含 `backtab`)、`model_cycle`、`toggle_tool_results`、`toggle_thinking`、`copy_message`(无选区时清空)、`completion_next`/`completion_previous`、`quit`。命中后 `stop()`/`prevent_default()` 并转发。

### `def _has_completion_options(self) -> bool`
从 `self.app._completion_state` 判断是否当前有补全项。

### `def _completion_target(self) -> CompletionActionTarget`
把 `self.app` 强转为 `CompletionActionTarget` 接口返回。

---

## ExtensionSelectScreen(ModalScreen[str | None])

为 `context.ui.select` 提供模态选项选择器,键位接线与 `SessionPickerScreen` 一致。

### `__init__(self, title, options, *, theme) -> None`
保存标题、选项元组与主题。

### `def compose(self) -> ComposeResult`
垂直容器内含标题 `Static`、选项 `ListView`(每项一个 `Label`)、底部帮助 `Static`。

### `def on_mount(self) -> None`
聚焦列表,`index=0`。

### `def on_key(self, event) -> None`
把 `up`/`down`/`enter` 路由到 `action_cursor_up/down/select_cursor` 并 `stop()`。

### `def on_list_view_selected(self, event) -> None`
选择后 `dismiss(self.options[event.index])`。

### `action_cursor_up` / `action_cursor_down` / `action_select_cursor`
分别代理到内部 `ListView` 的对应动作。

### `def action_cancel(self) -> None`
`dismiss(None)`。

---

## ExtensionConfirmScreen(ModalScreen[bool])

`context.ui.confirm` 的模态 Yes/No 确认框,结构与 `ExtensionSelectScreen` 类似。

### `__init__(self, title, message, *, theme) -> None`
保存标题、消息与主题。

### `compose` / `on_mount` / `on_key`
同 `ExtensionSelectScreen`(列表为 Yes/No 两项)。

### `on_list_view_selected(self, event)` 
`dismiss(event.index == 0)`(Yes 为 index 0)。

### `action_cursor_up/down/select_cursor` 与 `action_cancel`
同 `ExtensionSelectScreen`,`cancel` 对应 `dismiss(False)`。

---

## ExtensionInputScreen(ModalScreen[str | None])

`context.ui.input` 的模态单行文本输入。

### `__init__(self, title, placeholder="", *, theme) -> None`
保存标题、占位符、主题。

### `compose`
垂直容器:标题、单行 `Input`(id=`extension-input-field`)、帮助文本。

### `on_mount`
聚焦输入字段。

### `on_input_submitted(self, event)`
若来自目标 input,则 `stop()` 并 `dismiss(event.value)`。

### `action_cancel`
`dismiss(None)`。

---

## SessionPickerScreen(ModalScreen[str | None])

已索引会话的最小模态选择器。

### `__init__(self, records, *, theme) -> None`
保存会话记录元组与主题。

### `compose` / `on_mount` / `on_key`
标准 ListView 选择器:标题、"Sessions"、记录列表、帮助文本;挂载时聚焦列表。

### `on_list_view_selected(self, event)`
`dismiss(self.records[event.index].id)`。

### `action_cursor_up/down/select_cursor/ cancel`
代理到列表动作;`cancel` → `dismiss(None)`。

---

## TreePickerResult

`@dataclass(frozen=True, slots=True)` 数据类,表示树分支选择结果:`entry_id: str`、`summarize: bool = False`、`custom_instructions: str | None = None`。

---

## TreePickerScreen(ModalScreen[TreePickerResult | None])

从历史会话条目分支的模态选择器,支持"仅分支 / 带摘要 / 自定义摘要 / 切换工具调用显隐"。

### `__init__(self, choices, *, theme) -> None`
保存选择元组、主题,`show_tool_calls=True`。

### `compose`
标题、ListView(由 `_list_items()` 生成)、动态帮助文本。

### `on_mount`
聚焦列表,初始 index 设为当前活跃选择(`_active_tree_choice_index`)。

### `on_key(self, event)`
处理 `up`/`down`/`enter`(分支)、`s`(带摘要)、`c`(自定义摘要)、`ctrl+t`(切换工具调用),均 `stop()` 后调用对应 action。

### `on_list_view_selected(self, event)`
`dismiss(TreePickerResult(entry_id=self._visible_choices()[event.index].entry_id))`(默认不带摘要)。

### `action_cursor_up/down`
代理到列表导航。

### `action_select_cursor`
代理到列表选择。

### `action_select_with_summary(self)`
分支并带摘要:`dismiss(TreePickerResult(entry_id=..., summarize=True))`。

### `action_select_with_custom_summary(self)`
先弹出 `BranchSummaryInstructionsScreen`,回调 `_dismiss_with_custom_summary(index, instructions)`。

### `_dismiss_with_custom_summary(self, index, instructions)`
`instructions` 非空时 `dismiss` 带 `summarize=True` 与 `custom_instructions`。

### `action_toggle_tool_calls(self)`
`run_worker(self._toggle_tool_calls())` 切换工具调用条目显隐。

### `async def _toggle_tool_calls(self)`
记录当前选中 entry_id,翻转 `show_tool_calls`,`clear()` 并 `extend()` 重建列表,重设 index 与帮助文本(`_help_text`)。

### `_selected_entry_id(self)`
返回当前可见选择对应的 entry_id(越界返回 `None`)。

### `_visible_choices(self)`
`show_tool_calls` 为真返回全部,否则过滤掉 `is_tool_call` 的条目。

### `_list_items(self)`
为每个可见选择生成 `ListItem(Label(...))`,用 `_tree_picker_label` 渲染。

### `_help_text(self)`
描述 Enter/S/C/Ctrl+T/Escape 操作及工具调用当前显隐状态。

### `action_cancel`
`dismiss(None)`。

---

## BranchSummaryInstructionsScreen(ModalScreen[str | None])

为树分支请求自定义摘要说明的小模态框。

### `__init__(self, *, theme) -> None`
保存主题。

### `compose`
标题、`TextArea` 输入、帮助文本(Ctrl+Enter 提交,Escape 返回)。

### `on_mount`
聚焦输入 `TextArea`。

### `on_key(self, event)`
`ctrl+enter` → `action_submit`;`escape` → `action_cancel`。

### `action_submit(self)`
读取输入 `.strip()`,`dismiss(value or None)`。

### `action_cancel(self)`
`dismiss(None)`。

---

## CommandOutputScroll(VerticalScroll)

带确定性方向键滚动的命令输出区。

### `BINDINGS`
`up`/`down` 以 `priority=True` 绑定到 `scroll_up`/`scroll_down`。

### `action_scroll_up(self)`
`self.scroll_y = max(0, self.scroll_y - 1)`。

### `action_scroll_down(self)`
`self.scroll_y = min(self.max_scroll_y, self.scroll_y + 1)`。

---

## CommandOutputScreen(ModalScreen[None])

斜杠命令输出的可关闭模态框。

### 类属性 `auto_copy_selection: bool = False`

### `__init__(self, title, message, *, theme, auto_copy_selection=False)`
保存标题、消息、主题与 `auto_copy_selection`。

### `compose`
标题 + `CommandOutputScroll`(内含消息 `Static`) + 帮助文本。

### `on_mount`
聚焦滚动区,使方向键可导航长输出。

### `on_key(self, event)`
`up`/`down` 转发到 `action_scroll_up/down` 并 `stop()`。

### `action_close(self)`
`dismiss(None)`(Enter/Escape 均关闭)。

### `_help_text(self)`
根据 `auto_copy_selection` 返回"选择复制"或"Enter/Escape 关闭"提示。

### `action_scroll_up/down(self)`
代理到内部 `CommandOutputScroll` 的同名动作。

---

## LoginProviderSearchInput(Input)

带本地化导航的搜索输入,避免 Up/Down/Escape 被输入默认行为吞掉。

### `BINDINGS`
`escape`/`up`/`down` 均 `priority=True`。

### `_picker(self) -> LoginProviderPickerScreen`
返回当前所在 picker 屏幕。

### `on_key(self, event)`
`up`/`down` 转给 picker 导航并 `stop()`+`prevent_default`;`escape` 转 `action_cancel`。

### `action_cursor_up/down/cancel`
转给 `self._picker()` 的对应动作。

---

## LoginProviderPickerScreen(ModalScreen[str | None])

TUI 登录流程中可搜索的 provider 选择器。

### `__init__(self, providers, *, theme, title="Login")`
保存 provider 元组、初始 `visible_providers=providers`、主题与标题。

### `compose`
标题、`LoginProviderSearchInput`、`ListView`(由 `providers` 生成)、帮助文本。

### `on_mount`
聚焦搜索框并 `_refresh_provider_list()`。

### `on_input_changed(self, event)`
搜索值变化时过滤 `_filter_login_providers` 并刷新列表。

### `on_input_submitted(self, event)`
提交时选择当前高亮 provider。

### `on_key(self, event)`
`up`/`down`/`enter` 路由到列表动作。

### `on_list_view_selected(self, event)`
`event.stop()` 后 `_select_visible_provider()`。

### `action_cursor_up/down/select_cursor/cancel`
导航/选择/取消;`cancel` → `dismiss(None)`。

### `_select_visible_provider(self)`
取列表 index,`dismiss(self.visible_providers[index].name)`。

### `_refresh_provider_list(self)`
重建过滤后的列表项,重置 index,更新"无匹配"帮助文案。

---

## CustomProviderLoginResult

`@dataclass(frozen=True, slots=True)`,收集自定义 provider 登录信息:`provider_name`、`display_name`、`base_url`、`api_key_env`、`models`、`default_model`、`api_key`。

---

## LoginMethodPickerScreen(ModalScreen[str | None])

登录方式选择器(subscription / api-key / custom)。所有键位带 `priority=True`。

### `__init__(self, *, theme)` / `compose`
三个 `ListItem`(subscription/api-key/custom)及标题说明。

### `on_mount`
聚焦默认(第 0 项)。

### `on_key(self, event)`
`up`/`down`/`enter` 路由。

### `on_button_pressed(self, event)` 与 `on_list_view_selected(self, event)`
按 id 分发 `dismiss("subscription"|"api-key"|"custom")`。

### `action_cancel(self)` → `dismiss(None)`

### `action_cursor_up/down(self)`
`self._move_method_cursor(offset=±1)` 循环移动。

### `action_select_cursor(self)`
代理到列表选择。

### `_move_method_cursor(self, *, offset)`
按子项数量做取模循环移动 `method_list.index`。

---

## LoginMethodListView(ListView)

带环绕方向键导航的 ListView(供登录方式选择使用)。

### `action_cursor_up/down(self)`
调用 `_move_cursor(offset=±1)`。

### `_move_cursor(self, *, offset)`
子项数为 0 时 index=None;否则 `(current+offset) % count` 循环。

---

## ThemePickerScreen(ModalScreen[TuiThemeName | None])

内置 TUI 主题选择器。

### `__init__(self, *, current_theme, theme)` / `compose`
列出 `BUILTIN_TUI_THEME_NAMES`,每项 `Label` 由 `_theme_picker_label` 渲染(当前主题带 ✓)。

### `on_mount`
index 设为当前主题索引,聚焦列表。

### `on_key` / `on_list_view_selected` / `action_cursor_up/down/select_cursor`
标准选择器;`select` → `dismiss(BUILTIN_TUI_THEME_NAMES[event.index])`。

### `action_cancel` → `dismiss(None)`。

---

## ModelPickerSearchInput(Input)

模型选择器的搜索输入,把控制键留在 picker 本地(同 `LoginProviderSearchInput` 模式)。额外支持 `tab`/`ctrl+i` 切换 all/scoped 模式。

### `on_key(self, event)`
`up`/`down` 导航;`tab`/`ctrl+i` 切模式;`escape` 取消;均 `stop()`+`prevent_default`。

### `action_cursor_up/down/toggle_mode/cancel`
转发到 `self._picker()`。

---

## ModelPickerScreen(ModalScreen[ModelChoice | None])

当前 provider 的模型选择器,支持搜索、all/scoped 模式切换、scoped 成员切换。

### `__init__(self, choices, *, scoped_choices, current_model, provider_name, theme, on_toggle_scoped=None, picker_kind="model")`
去重保存 `choices`/`scoped_choices`、`visible_choices`、`current_model`、`provider_name`、`theme`、`on_toggle_scoped`、`picker_kind`、`mode="all"`、`search_value=""`。

### `compose`
标题(按 kind)、tabs `Static`、`ModelPickerSearchInput`、`ListView`、`help` 区。

### `on_mount`
聚焦搜索框并 `_refresh_model_list()`。

### `on_input_changed` / `on_input_submitted`
搜索值变化即过滤;提交即选当前高亮。

### `_reset_model_list_index(self)`
优先把选中项移到"当前模型"(匹配 `ModelChoice`)或首项。

### `on_key(self, event)`
`up`/`down`/`enter`(选模型)/`tab`(切模式)路由,均 `stop()`。

### `on_list_view_selected(self, event)`
`stop()` 后 `_select_visible_choice()`。

### `action_cursor_up/down`
代理到列表导航。

### `action_accept_model(self)`
`_select_visible_choice()`。

### `action_toggle_mode(self)`
仅 `picker_kind=="model"` 时,在 `all`/`scoped` 间切换并刷新。

### `action_toggle_scoped(self)`
在 scoped 模式下把当前高亮模型加入/移除 scoped 集(经 `on_toggle_scoped` 回调),刷新列表。

### `action_cancel` → `dismiss(None)`。

### `_select_visible_choice(self)`
无可见项返回;scoped 模式触发 `action_toggle_scoped`;否则 `dismiss(choice)`。

### `_refresh_model_list(self)`
按 `mode` 取 base(全部或 scoped),`_filter_model_choices` 过滤,重建列表并 `_reset_model_list_index`,更新 tabs 与 help 文案(含 scoped 数量等)。

---

## CustomProviderLoginScreen(ModalScreen[CustomProviderLoginResult | None])

添加 OpenAI 兼容自定义 provider 的表单。

### `BINDINGS` 与 `_INPUT_ORDER`
仅有 `escape` 取消;输入顺序为 7 个字段 id。

### `__init__(self, *, theme)` / `compose`
依次放标题、说明与 7 个 `Input`(api-key 为 password)。

### `on_mount` / `on_input_submitted(self, event)`
聚焦首字段;非末字段 Enter 时 `_focus_next`,末字段触发 `_collect_result`,成功则 `dismiss(result)`。

### `_focus_next(self, input_id)`
聚焦 `_INPUT_ORDER` 中下一个字段。

### `_collect_result(self) -> CustomProviderLoginResult | None`
逐个 `_field` 校验必填;校验模型列表非空且 default 在列表中;用 `dict.fromkeys` 去重模型;返回 `CustomProviderLoginResult`(display_name 缺省回退 provider_name)。

### `_field(self, input_id, label) -> str | None`
读字段值,空则更新 help 并聚焦返回 `None`。

### `action_cancel` → `dismiss(None)`。

---

## LoginScreen(ModalScreen[str | None])

保存 provider API key 的密码输入模态框。

### `__init__(self, provider, *, theme)` / `compose`
标题 + 说明 + password `Input`(id=`login-api-key`)+ help。

### `on_mount`
聚焦 API key 字段。

### `on_input_submitted(self, event)`
`dismiss(event.value.strip() or None)`。

### `action_cancel` → `dismiss(None)`。

---

## OAuthLoginScreen(ModalScreen[OAuthCredential | None])

provider 订阅 OAuth 登录流程。

### `__init__(self, provider, *, theme, login=None)`
保存 provider、主题、可选 `login` 回调,初始化 `_manual_code_future=None`、`_manual_code_value=None`、`_prompt_allows_empty=False`。

### `compose`
标题、说明、`login-oauth-url` 静态区、手动 code `Input`、`login-footer`。

### `on_mount`
聚焦 code 输入,`run_worker(self._run_login(), exclusive=True)`。

### `async def _run_login(self)`
取 `oauth_provider.login`(或传入的 `login`),以 `OAuthLoginCallbacks`(绑定 `_show_auth`/`_show_device_code`/`_prompt_for_code`/`_select_option`/`_show_progress`/`_manual_code_input`)调用;成功则 `dismiss(credential)`,异常则更新 help 文案。

### `_show_auth(self, info)` / `_show_device_code(self, info)`
把 auth/device-code 信息写进对应 `Static`。

### `_show_progress(self, message)`
更新 help 文本。

### `async def _prompt_for_code(self, prompt) -> str`
更新 help 并设 `_prompt_allows_empty`,然后 `await self._manual_code_input()`(finally 复位)。

### `async def _select_option(self, prompt) -> str | None`
返回 `prompt.options[0].id`(当前实现取首个选项)。

### `async def _manual_code_input(self) -> str`
若已缓存值直接返回;否则建 future 并 `await`,finally 清空 future。

### `on_input_submitted(self, event)`
若为空且不允许空则返回;否则存 `_manual_code_value` 并 `set_result`(若 future 未完成)。

### `action_cancel(self)`
取消 future(若未完成)并 `dismiss(None)`。

---

## RESERVED_EXTENSION_INTERCEPTOR_KEYS

模块级 frozenset:`{"ctrl+c", "ctrl+d"}`——扩展按键拦截器永远不被咨询的硬中断/退出键,防止坏拦截器吞掉退出路径。

---

## TauTuiApp(App[None])

`CodingSession` 的交互式 Textual 前端,是整个文件的核心。

### 类级 `TITLE = "Tau"` 与 `CSS`

一长段 Textual CSS,定义屏幕/Header/Footer/Toast 颜色变量、工作区与侧栏布局、`#sidebar`(含 hide/right 变体)、`#transcript`、`#main-slot`/`#above-prompt-slot`/`#below-prompt-slot`(扩展挂载点)、`#prompt`/`#prompt-prefix`、补全框、各 ModalScreen 及其列表/帮助外观。变量名统一为 `$tau-*`,映射到主题。

### `BINDINGS: ClassVar[list[BindingEntry]] = []`

### `__init__(self, session, *, tui_settings=None, startup_message=None, startup_notice=None, startup_notices=(), initial_prompt=None)`
构造并接线。要点:
- 保存 `tui_settings`、`startup_message`/`startup_notices`、`initial_prompt`。
- `super().__init__()`。
- `_register_tau_textual_themes()` 注册主题;`self.theme=tui_settings.theme`。
- 用 `_app_bindings(keybindings)` 生成应用级绑定。
- 保存 `session`、`state=TuiState(skills=...)`、把 startup notices 加进 state。
- `_load_session_messages_from_session()` 重放历史消息。
- 创建 `adapter=TuiEventAdapter(state)`。
- 初始化扩展组件追踪字典(`_extension_slot_widgets`/`_mounted`/`_slot_ids`/`_locks`、`_extension_key_interceptors`、`_extension_main_view*`、`_extension_main_view_lock`、`_extension_swap_tasks`、`_extension_component_failures_reported`)。
- `_connect_extension_runtime(session)` 安装 UI 桥。
- 初始化 prompt worker/compaction worker、`_prompt_run_id=0`、`_optimistic_user_messages`、`_completion_state`、活动指示器帧/定时器、`_terminal_title`、通知去重集合、`_supports_pyperclip`。
- 末尾 `_sync_header_title()`。

### `def _sync_header_title(self) -> None`
`self.title="Tau"`,`self.sub_title=_session_header_sub_title(session)`,并 `_sync_terminal_title()`。

### `def _sync_terminal_title(self) -> None`
用 `TerminalTitleController.update(session_title, running=state.running, frame=activity_frame)` 同步终端标签页标题。

### `def _sync_text_selection_state(self) -> None`
运行中时禁用原生文本选择(`ALLOW_SELECT=False`)并清空当前选择,避免转录变动时误选。

### `def copy_to_clipboard(self, text) -> None`
优先用 pyperclip(按需 import 探测),失败回退 `super().copy_to_clipboard`。

### `def _register_tau_textual_themes(self) -> None`
清空并逐一 `register_theme(_textual_theme_for_tau_theme(name))`,让 Textual 原生主题菜单也更新同一主题。

### `def _watch_theme(self, theme_name) -> None`
Textual 主题变化后若属内置主题且与当前设置不同,则 `_replace_tui_settings(theme=...)` 并持久化。

### `def get_theme_variable_defaults(self) -> dict[str, str]`
在父类变量基础上叠加 `_theme_css_variables(resolved_theme)` 提供 Tau 专属 CSS 变量。

### `def compose(self) -> ComposeResult`
布局:`Header` → 水平 `#workspace`(`SessionSidebar` `#sidebar` + 垂直 `#main-pane`)→ 主区依次放 `TranscriptView` `#transcript`、`#main-slot`、`#above-prompt-slot`、`#queued-messages`、`#prompt-row`(含 `prompt-prefix` "τ" 与 `PromptInput` `#prompt`)、`CompactSessionInfo`、`#autocomplete`、`#below-prompt-slot` → `Footer`。

### `async def on_mount(self) -> None`
聚焦 prompt、设 shell 模式样式、算响应式布局、应用侧栏位置、`_refresh()`、`_sync_text_selection_state()`、`_refresh_completions()`;有 startup_message 则警告通知。随后 `await session.emit_pending_session_start()`(释放延迟的 session_start,使扩展能弹窗/通知);若有 `initial_prompt` 则提交。

### `async def on_event(self, event) -> None`
扩展按键拦截钩子(模拟 Pi 的 `onTerminalInput`):仅当是主屏幕 `Key`、非转发、键不在保留集、已注册拦截器、且 screen_stack ≤ 1 时,才依次咨询拦截器;任一返回 `True` 则 `stop()`+`prevent_default` 并吞掉事件。否则 `await super().on_event(event)`。

### `def on_unmount(self) -> None`
停止活动定时器、还原终端标题、`_clear_extension_components()`。

### `def on_resize(self, event) -> None`
清空补全行预算并 `_update_responsive_layout(w,h)`。

### `def on_click(self, event) -> None`
左键点击后把焦点还给 prompt,但若扩展主视图存在则跳过(避免抢走其键盘)。

### `@on(events.TextSelected) async def on_text_selected(self)`
在 `auto_copy_selection` 或当前屏幕 `auto_copy_selection` 为真时,把选中文本复制到剪贴板并通知。

### `def on_text_area_changed(self, event)`
仅处理 `#prompt`:`sync_pending_paste()`、更新 shell 模式、重建 `_completion_state` 并刷新补全。

### `async def action_submit_prompt(self) -> None`
`await self._submit_prompt_from_editor(streaming_behavior="steer")`。

### `async def action_submit_follow_up(self) -> None`
`await self._submit_prompt_from_editor(streaming_behavior="follow_up")`(运行中排队)。

### `async def _submit_prompt_from_editor(self, *, streaming_behavior)`
核心提交流程:
1. 取 `prompt.text_for_submission()`,先尝试 `_apply_selected_completion`;若应用了且改变文本,则回填、移光标、重建补全并返回。
2. `text=raw_text.strip()`,空则清空并返回。
3. 若 compaction 进行中且非 `/compact` 则警告;运行中则提示等待。
4. 清空编辑器与补全状态。
5. `parse_terminal_command`:若为 `!`/`!!` shell 命令,`run_worker(_run_terminal_command)`。
6. `session.handle_command(text)`:若命中斜杠命令,依次处理 `clear`/`reload`/`new_session`/`compact`/`export`/`resume`/`session_picker`/`tree_picker`/`login*`/`logout*`/`model_picker`/`scoped_models`/`theme_picker`/`thinking`/`theme`/`exit` 等(通过对应 `_open_*`/`_resume_session` 等方法),并在 `command.message` 存在时按通知/转录/弹窗三种方式呈现;最后 `_refresh()`,`exit_requested` 则退出。
7. 若 `state.running`:`_remember_prompt` + `_queue_prompt(...)`(运行中排队)。
8. 否则 `_remember_prompt` + `await self._submit_prompt(text)`(新开一轮)。

### `def _remember_prompt(self, text)`
非空则把文本追加到 `_prompt_history`(轻量输入回溯)。

### `def _load_session_messages_from_session(self) -> None`
`state.load_messages(session.messages)` 重放可见消息,并用 UserMessage 内容重置 `_prompt_history`。

### `def _is_compaction_active(self) -> bool`
compaction worker 存在且未结束/未取消返回真。

### `def _is_agent_or_queue_active(self) -> bool`
`_sync_queue_state()` 后,根据 `state.running`/session `is_running`/prompt worker 活跃/队列数判断是否有活动或排队 agent 回合。

### `async def _run_compaction(self, summary) -> None`
清空 state 显示"Compacting…",`await session.compact(summary)`,finally 清 worker;结束重装消息、`_notify` 并刷新。捕获取消/异常。

### `async def _submit_prompt(self, text, *, source="interactive", custom_type=None, details=None)`
开启一轮 prompt:
- `_prompt_run_id += 1`。
- 若 `custom_type is None and _should_optimistically_render_prompt(text)`:把 `(run_id, text)` 加入 `_optimistic_user_messages` 并 `_append_optimistic_user_message(text)`(立即渲染用户气泡,避免等待事件往返)。
- `self._prompt_worker = run_worker(self._run_prompt(...), exclusive=True)`。

### `async def _append_optimistic_user_message(self, text, *, custom_type=None, details=None)`
不重建整个 transcript 而即时渲染用户消息:`state.add_user_message(...)`,`follow_output`,对新增的 items 逐条 `transcript.append_item(...)`(带主题与工具结果展开),最后 `_refresh_chrome`。

### `def _consume_optimistic_user_event(self, event, *, run_id) -> bool`
当收到 `MessageEndEvent` 且 message 是 `UserMessage`、且存在相同 `run_id`+内容匹配的乐观消息时,删除该乐观记录并返回 `True`(确认已被渲染,无需再追加)。

### `def _replace_transformed_optimistic_user_message(self, event, *, run_id) -> bool`
当扩展 `input` hook 改写提交文本致确认事件与乐观渲染内容不符时,就地改写乐观 item 的 `text` 并 `_refresh()`,返回 `True`(避免重复渲染用户气泡)。仅在 `_consume_optimistic_user_event` 之后运行。

### `def _clear_optimistic_user_messages(self, *, run_id) -> None`
剔除该 run_id 遗留的未确认乐观消息。

### `async def _append_confirmed_user_message(self, message) -> None`
对非乐观的用户事件,委托 `_append_optimistic_user_message(message.content, ...)` 增量渲染。

### `def _connect_extension_runtime(self, session) -> None`
若 session 有 `extension_runtime`:先 `_clear_extension_components()`(强清旧 widget),再 `runtime.set_ui_bridge(_TuiExtensionUiBridge(self))`、`set_turn_requested_callback(self._on_extension_turn_requested)`;并把 `runtime.render_custom_message`/`render_tool_call`/`render_tool_result` 接到 `state` 的自定义/工具调用/工具结果渲染器。

### `def _on_extension_turn_requested(self, content, custom_type=None, details=None) -> None`
`self.call_later(self._deliver_extension_message, ...)` 把扩展请求的消息投递到串行 prompt 路径。

### `async def _deliver_extension_message(self, content, custom_type=None, details=None) -> None`
若 session 正在运行则排队(经 `queue_follow_up_message`),否则 `await self._submit_prompt(content, source="extension", ...)`。

### `def _current_prompt_text(self) -> str`
安全读取 `#prompt.text`(未存在时返回 `""`)。

### `def _register_extension_key_interceptor(self, handler) -> Callable[[], None]`
把 handler 加入 `_extension_key_interceptors`,返回可移除它的 `unsubscribe` 闭包。

### `def _run_extension_key_interceptors(self, event, text) -> bool`
依次咨询拦截器,任一返回 `True` 即返回 `True`;拦截器抛异常则 `_record_extension_component_failure(...)` 并视为未消费(降级为正常输入)。

### `def _schedule_extension_swap(self, coro) -> None`
`asyncio.ensure_future(coro)` 在应用循环上运行 slot/main-view 协调协程,并把 task 加入 `_extension_swap_tasks`(done 时丢弃),无事件循环时关闭协程。

### `@staticmethod def _string_slot_widget(lines) -> Static`
把若干显示行用 `_custom_markup_to_text`(Rich markup,失败回退原文本)构造 `Static`。

### `def _set_extension_slot_widget(self, key, content, placement) -> None`
挂载/卸载扩展 slot widget:`content` 为 callable 工厂、字符串列表(归一为工厂)、字符串(单行)或 `None`(卸载)。同步记录"意图 widget"到 `_extension_slot_widgets`/`_slot_ids`,再 `_schedule_extension_swap(_reconcile_slot(key))`。

### `async def _reconcile_slot(self, key) -> None`
带锁串行协调:读"实时"目标,若已挂载且非目标则 `remove()`;重新读取后若目标存在且未挂载则 `mount`(失败则卸载意图并记录失败)。实现"后写者胜"——突发 set 合并为最后一次状态。

### `def _open_extension_main_view(self, factory) -> MainViewHandle`
返回 `_MainViewHandle`(同步建 future);`factory(handle, theme)` 构造 widget,失败时 `_resolve(None)` 并返回 `_DeadMainViewHandle()`;若有前一个主视图则 `_release_main_view_handle(previous)`(被取代);设 `_extension_main_view`,`_schedule_extension_swap(_reconcile_main_view())`。

### `async def _reconcile_main_view(self) -> None`
带锁串行协调主视图:移除旧挂载、挂载新 widget 到 `#main-slot`,并把 `#transcript` 隐藏、`#main-slot` 显示;若目标清空则 `_restore_main_transcript()`。

### `def _close_extension_main_view(self, handle) -> None`
若 handle 是当前主视图则清空并 `_schedule_extension_swap(_reconcile_main_view())`。

### `def _release_main_view_handle(self, handle) -> None`
宿主驱动的拆除:标记 closed 并 `_resolve(None)`(supersede/rebind/失败/quarantine 路径)。

### `def _restore_main_transcript(self) -> None`
隐藏 `#main-slot`、显示并 `follow_output()` `#transcript`、聚焦 prompt。

### `def _refresh_extension_components(self) -> None`
对所有已跟踪的扩展 widget 调用 `refresh()`(模拟 requestRender)。

### `def _clear_extension_components(self) -> None`
强制清除所有扩展 widget/视图/拦截器:清 slot 意图并逐个 reconcile;清主视图并释放 handle;清空拦截器与失败报告集(使新世界可重新通知)。

### `def _tracked_extension_widgets(self) -> tuple[Widget, ...]`
返回所有被跟踪的扩展根 widget(去重:slot 意图/已挂载 + 主视图 widget/已挂载)。

### `def _extension_root_for(self, widget, tracked) -> Widget | None`
从 `widget` 沿父链上溯,找到所属的被跟踪扩展根。

### `def _quarantine_extension_widget(self, error) -> bool`
崩溃隔离:遍历 `error.__traceback__`,定位属于被跟踪扩展 widget 的帧,隐藏并 `disable` 该 widget,从对应追踪字典移除并 `remove()`;若是主视图则还原 transcript。返回 `True`(吞掉异常、应用继续运行)或 `False`(交给 Textual 默认)。

### `def _handle_exception(self, error) -> None`
重写 Textual 私有异常处理:若 `_quarantine_extension_widget` 命中则吞掉,否则 `super()._handle_exception`。

### `def _record_extension_component_failure(self, context, error, *, notify=False) -> None`
每条 context 仅通知一次:始终记日志(traceback),若 context 未报告过则加入集合并在 `notify=True` 时弹出带简短摘要的 error 通知。

### `def _follow_transcript_output(self) -> None`
在显式用户操作后让 transcript 回到 follow 模式(`follow_output()`)。

### `async def _run_terminal_command(self, command, *, add_to_context) -> None`
向 state 加一项 tool(`$ command`,`always_show_tool_result`),调用 `session.run_terminal_command`;完成后回填 `tool_result_text`(用 `format_terminal_command_result_block`),失败则填异常并重通知。

### `def _replace_tui_settings(self, *, theme) -> None`
用新主题重建不可变 `TuiSettings`(保留其余设置)。

### `def _set_tui_theme(self, theme) -> None`
替换设置、持久化、`self.theme=theme`、`_refresh()`。

### `async def _queue_prompt(self, text, *, streaming_behavior) -> None`
运行中排队:`async for event in session.prompt(text, streaming_behavior=...): self.adapter.apply(event)`;失败则通知。

### `async def _run_prompt(self, text, run_id=None, *, source, custom_type, details) -> None`
**核心事件流渲染循环**:
- `active_run_id = self._prompt_run_id if run_id is None else run_id`。
- `async for event in session.prompt(text, source=..., custom_type=..., details=...)`:
  - 若 `active_run_id != self._prompt_run_id`:早退(被取消/取代)。
  - `_consume_optimistic_user_event`:确认用户事件已乐观渲染 → 仅 `_sync_text_selection_state`+`_refresh_chrome`+`continue`。
  - `_replace_transformed_optimistic_user_message`:改写乐观用户气泡 → `continue`。
  - 若非"用户消息结束事件且屏幕栈非空",则 `self.adapter.apply(event)`(更新 state)。
  - `_sync_text_selection_state()`。
  - 若 `ErrorEvent and not recoverable`:`_attach_diagnostic_log_path_to_error`。
  - `await self._apply_streaming_transcript_event(event)`(把事件映射到 transcript widget)。
- `except`:格式化为错误、加入 state、`running=False`、刷新。
- `finally`:`_clear_optimistic_user_messages`、若该 run 仍是最新则清 `_prompt_worker`。

### `async def _apply_streaming_transcript_event(self, event) -> None`
把单个 agent 事件增量应用到已挂载 transcript widget(避免整屏重绘):
- `AgentStartEvent`:`_refresh_chrome()`。
- `AgentEndEvent`:`transcript.finish_assistant_message()` + 刷新 chrome。
- `MessageStartEvent`:无操作。
- `MessageDeltaEvent`:`append_assistant_delta` + `_sync_activity_indicator`。
- `ThinkingDeltaEvent`:`append_thinking_delta`(按 `show_thinking`)+ 活动指示。
- `MessageEndEvent`(user):`_append_confirmed_user_message` + 同步标题。
- `MessageEndEvent`(assistant):`finish_assistant_message(content)` + 刷新。
- `ToolExecutionStartEvent`:先 `finish_assistant_message`,再为最后一项 `append_item`(带工具调用展开)。
- `ToolExecutionUpdateEvent`:`finish_assistant_message`,对 `find_tool_item` 调 `update_item`(按展开状态重渲染调用与结果)。
- `RetryEvent | ErrorEvent`:`finish_assistant_message` 并把最后一项重 append。
- `ToolExecutionEndEvent`:`_refresh()`。
- `QueueUpdateEvent`:`_refresh_chrome()`。
- 其它:`_refresh_chrome()`。

### `def action_cancel(self) -> None`
先尝试 `_cancel_active_compaction(notify=True)`,否则 `_cancel_active_prompt(notify=True)`。

### `def _cancel_active_compaction(self, *, notify) -> bool`
取消 compaction worker、清 state、重装消息、刷新、通知;无活动则返回 `False`。

### `def _cancel_active_prompt(self, *, notify, interrupt=False) -> None`
取消当前 prompt worker:`_prompt_run_id += 1`、`session.cancel()`、`worker.cancel()`、`running=False`、清空 assistant 缓冲、刷新、通知"已中断"。

### `def action_accept_completion(self) -> None`
若当前是 `ModelPickerScreen` 则切模式;`SessionPicker/Tree/Login*/Theme/Extension*` 则 `select_cursor`;否则把当前选中补全应用到 prompt 文本(经 `_apply_selected_completion`)。

### `def action_completion_next(self) -> None`
`CommandOutputScreen` → 滚动下;各 picker → `cursor_down`;无补全项则 prompt 下移;否则 `_completion_state.select_next()` 并刷新补全。

### `def action_completion_previous(self) -> None`
`CommandOutputScreen` → 滚动上;各 picker → `cursor_up`;无补全项时依次尝试 `edit_queued_message`、`recall_previous_prompt`、prompt 上移;否则 `select_previous()`。

### `def action_recall_previous_prompt(self) -> bool`
仅当 prompt 为空且历史非空时,把最近一次提交文本回填到 prompt(避免误覆盖正在写的输入)。

### `def action_edit_queued_message(self) -> bool`
运行中且 prompt 为空时,从 session 弹出最近一条排队消息(follow_up 或 steering)回填 prompt 并 `_sync_queue_state`、重建补全。

### `def action_edit_queued_follow_up(self) -> bool`
等价于 `action_edit_queued_message()`。

### `def _pop_latest_queued_message(self) -> str | None`
依次尝试 `pop_latest_follow_up_message`、`pop_latest_steering_message`,返回非空字符串。

### `def action_open_command_palette(self) -> None`
聚焦 prompt、把文本设为 `/`、光标移到第 1 列、重建补全(打开斜杠命令面板)。

### `def action_open_session_picker(self) -> None`
非运行中时,用 `_session_records` 取记录,`push_screen(SessionPickerScreen(...), callback=_handle_session_picker_result)`;无记录则通知。

### `def action_cycle_thinking(self) -> None`
`run_worker(self._cycle_thinking_level())`(非独占)。

### `def action_cycle_model(self) -> None`
非运行中时 `run_worker(self._cycle_scoped_model())`(独占否)。

### `def action_toggle_tool_results(self) -> None`
`state.toggle_tool_results()` 后 `_refresh()` 并通知展开/折叠。

### `def action_toggle_thinking(self) -> None`
`state.toggle_thinking()` 并 `transcript.update_thinking_visibility(state, theme=...)`。

### `def _handle_session_picker_result(self, session_id) -> None`
非空则 `run_worker(self._resume_session(session_id))`。

### `async def _resume_session(self, session_id) -> None`
`await session.resume(session_id)`,清 state、重装消息、通知;异常则 error 通知;最后 `_refresh()`。

### `async def _open_tree_picker(self) -> None`
若 agent/队列活跃则警告;取 `session.tree_choices()` 元组,`push_screen(TreePickerScreen(...), callback=_handle_tree_picker_result)`。

### `def _handle_tree_picker_result(self, result) -> None`
非空则 `run_worker(self._branch_to_tree_entry(entry_id, summarize=, custom_instructions=))`。

### `async def _branch_to_tree_entry(self, entry_id, *, summarize, custom_instructions) -> None`
活跃则警告;`session.branch_to_entry(...)`(可 await),清 state、重装;若返回 `SessionTreeBranchResult` 则按 `input_prefill` 回填 prompt 并通知;字符串则通知。

### `async def _new_session(self) -> None`
取消当前 prompt,`await session.new_session()`,清 state、重装消息、刷新。

### `def _apply_selected_completion(self, value) -> str | None`
把当前选中补全项应用到 `value`(经 `item.apply`)。

### `def _append_command_message(self, command_text, message) -> None`
把命令的非持久输出作为 `status` 项加入 transcript(标题+正文)。

### `def _show_command_message(self, command_text, message) -> None`
用 `CommandOutputScreen` 弹窗展示命令输出(`/session` 时 `auto_copy_selection=True`)。

### `def _open_login_picker(self) -> None`
`push_screen(LoginMethodPickerScreen, callback=_handle_login_method_result)`。

### `def _handle_login_method_result(self, method) -> None`
按 method 取 provider 子集(subscription/api-key/custom):custom 直接开自定义登录;其余 `push_screen(LoginProviderPickerScreen, callback=...)`。

### `def _handle_login_provider_result(self, provider_name, *, method=None) -> None`
非空则 `_open_login(provider_name, method=method)`。

### `def _open_custom_provider_login(self) -> None`
`push_screen(CustomProviderLoginScreen, callback=_handle_custom_provider_login_result)`。

### `def _handle_custom_provider_login_result(self, result) -> None`
用结果构造 `OpenAICompatibleProviderConfig` 与 `ProviderCatalogEntry`,`save_user_catalog_entries`、`FileCredentialStore().set(api_key)`、`upsert_openai_compatible_provider`、`session.reload_provider_settings()`、`session.set_provider(name)`;异常则 error 通知。

### `def _open_login(self, provider_name, *, method=None) -> None`
取 `builtin_provider_entry`,决定 OAuth 或 API key 登录(OAuth 含 `openai-codex` 特例);相应 `push_screen(OAuthLoginScreen | LoginScreen, callback=...)`。

### `def _handle_login_result(self, entry, api_key) -> None`
保存 API key、`upsert_saved_provider`、`reload_provider_settings`、`set_provider`;异常则 error 通知。

### `def _handle_oauth_login_result(self, entry, credential) -> None`
`FileCredentialStore().set_oauth`、`upsert_saved_provider`、reload、set_provider。

### `def _open_logout_picker(self) -> None`
取有存储凭据的 provider,`push_screen(LoginProviderPickerScreen(title="Logout"), callback=_handle_logout_provider_result)`;无则通知。

### `def _handle_logout_provider_result(self, provider_name) -> None`
非空则 `_logout(provider_name)`。

### `def _logout(self, provider_name) -> None`
校验 entry/凭据存在,`credential_store.delete`、`reload_provider_settings`,通知"已登出/已移除存储 key"。

### `def _available_model_choices(self) -> tuple[ModelChoice, ...]`
优先 `session.available_model_choices`,回退 `provider_name + session.available_models`。

### `def _open_model_picker(self) -> None`
取 choices,`push_screen(ModelPickerScreen(kind="model"), callback=_handle_model_picker_result)`;无可用 provider 则警告。

### `def _open_scoped_models_picker(self) -> None`
类似但 `kind="scoped"`、`on_toggle_scoped=self._toggle_scoped_model`,回调 `_handle_scoped_models_picker_result`。

### `def _toggle_scoped_model(self, choice) -> Sequence[ModelChoice]`
`session.toggle_scoped_model(choice)`,异常回退当前 scoped 集。

### `def _handle_scoped_models_picker_result(self, choice) -> None`
丢弃 choice,只 `_refresh_chrome()`。

### `def _handle_model_picker_result(self, choice) -> None`
非空则 `session.set_model_choice(choice)`(或旧式 `set_provider`+`set_model`),异常则 error 通知;最后 `_refresh_chrome()`。

### `def _open_theme_picker(self) -> None`
`push_screen(ThemePickerScreen(current_theme=...), callback=_handle_theme_picker_result)`。

### `def _handle_theme_picker_result(self, theme) -> None`
非空则 `_set_tui_theme(theme)`。

### `async def _set_thinking_level(self, level) -> None`
`session.set_thinking_level(level)`(可 await),`_refresh_chrome()`。

### `async def _cycle_thinking_level(self) -> None`
`session.cycle_thinking_level()`,`_refresh_chrome()`。

### `async def _cycle_scoped_model(self) -> None`
`session.cycle_scoped_model()`,`_refresh_chrome()`。

### `def _notify(self, message, *, severity="information") -> None`
按 `(message, severity)` 去重(用定时器在 `NOTIFICATION_TIMEOUT` 后从 `_active_notification_keys` 移除),再 `self.notify(..., markup=False)`。

### `def _refresh(self) -> None`
`_refresh_chrome(theme=...)` + `transcript.update_from_state(state, theme=...)`(全量刷新 transcript)。

### `def _refresh_chrome(self, *, theme=None) -> None`
非 transcript 的 chrome 刷新:同步标题/选择状态/队列状态,更新 `#sidebar`(SessionSidebar)、`#compact-session-info`、`#queued-messages`(按计数显隐并渲染排队消息)、活动指示器、footer 绑定。

### `def _sync_queue_state(self) -> None`
若 session 有 `queue_update_event` 可调,则 `self.adapter.apply(queue_event())` 同步队列 UI 状态。

### `def _sync_activity_indicator(self) -> None`
同步终端标题;运行中则(启/恢复)活动定时器并应用指示;非运行中则复位帧/ spinner、暂停定时器、应用静止指示。

### `def _tick_activity(self) -> None`
每 `ACTIVITY_TICK_SECONDS` 触发:帧+1、应用活动边框、`_sync_terminal_title`、置 `state.tool_spinner` 为下一帧 spinner、`call_later(self._respin_pending_tool)`。

### `async def _respin_pending_tool(self) -> None`
找到最后一个"工具执行中(无结果)"的 item,`transcript.update_item` 以推进 spinner 动画。

### `def _apply_activity_indicator(self) -> None`
根据 `theme`/帧/运行/shell 模式更新 prompt 边框颜色与 `prompt-prefix`(用 `_render_activity_indicator`,运行中把 τ 变为上下移动的小方块)。

### `def _refresh_completions(self) -> None`
更新 `#autocomplete`:无项则隐藏并渲染空建议;有项则按 `_completion_window_line_budget` 算可见行数、`_visible_completion_state` 窗口化后 `render_completion_suggestions`,并 `_refresh_footer_bindings()`。

### `def _completion_window_line_budget(self, suggestions) -> int`
稳定补全窗口高度:避免"选更多行→缩窗口→更少行"反馈环,保留当前补全会话测到的最大高度(首次用 `_initial_completion_line_budget` 估计)。

### `def _initial_completion_line_budget(self) -> int`
终端高度扣除保留行(最小 transcript、chrome、prompt-row/compact/queued、header/footer)后,与 `terminal//3`、上限 `COMPLETION_MAX_VISIBLE_LINES` 取交集,估算首窗高度。

### `def _update_responsive_layout(self, width, height) -> None`
侧栏开启时,若 `width>=MIN_WIDTH and height>=MIN_HEIGHT` 则显示,否则加 `-hide-sidebar` 类。

### `def _apply_sidebar_position(self) -> None`
按 `sidebar_position` 加 `-sidebar-right`(右)/`-hide-sidebar`(off)类。

### `def _build_completion_state(self, text) -> CompletionState`
用 `_session_command_registry`、`session.skills`、`prompt_templates`、`available_models`、`available_providers + LOGIN_PROVIDER_ALIASES`、`available_thinking_levels`、`BUILTIN_TUI_THEME_NAMES`、`_session_options(cwd)` 等构造补全状态。

### `def _refresh_footer_bindings(self) -> None`
`prompt.set_footer_mode(_prompt_footer_mode(state, completion_state))`(normal/completion/running)。

### `def _sync_prompt_shell_mode(self, text) -> None`
设 shell 模式样式/`-shell-mode` 类、`refresh()`、`_apply_activity_indicator()`。

---

## 模块级辅助函数(供上述类使用)

### `_activity_prompt_border_color(theme, *, frame, running, shell_mode) -> str`
shell 模式返回 accent 色,否则返回 prompt_border 色。

### `_render_activity_indicator(theme, *, frame, running) -> Text`
运行中把 prompt 前缀 τ 渲染成在 3 行高度内上下移动的方块(带颜色拖尾),静止时显示 `τ`。

### `_is_terminal_command_prompt(text) -> bool`
是否存在 `!`/`!!` 前缀(`_terminal_command_prefix_span` 非空)。

### `_should_optimistically_render_prompt(text) -> bool`
非空且不以 `/` 开头的文本才可乐观渲染。

### `_is_user_message_end_event(event) -> bool`
`MessageEndEvent` 且 message 为 `UserMessage`。

### `_terminal_command_prefix_span(text) -> tuple[int,int] | None`
返回前导 `!` 或 `!!` 的字符区间。

### `_blend_hex_colors` / `_hex_to_rgb`
两个 `#rrggbb` 颜色按 fraction 混合 / 解析。

### `_completion_visible_line_limit(suggestions) -> int`
按 widget 实际高度返回可见补全行数(限制在 `COMPLETION_MAX_VISIBLE_LINES`)。

### `_visible_completion_state(state, *, max_lines, width=None) -> CompletionState`
计算保证选中项可见的窗口化补全状态(上下收缩区间)。

### `_completion_selected_render_line` / `_completion_render_line_count` / `_completion_item_extra_wrapped_lines`
估算补全项渲染行数(含分类标题换行、描述换行)。

### `_session_command_registry` / `_session_options` / `_session_records` / `_session_option` / `_session_picker_label` / `_session_updated_at_label` / `_named_session_title` / `_session_header_sub_title`
围绕 `CodingSession`/`SessionManager` 的会话记录、补全选项、列表标签与 header 副标题的提取与格式化。

### `_short_path(path) -> str`
把路径相对于 home 显示为 `~/...`。

### `_tree_picker_label(choice, *, theme) -> Text` / `_active_tree_choice_index` / `_tree_choice_index`
树选择器标签渲染(活跃以 `*` 标记、作者名用 accent 样式)与初始 index 计算。

### `_login_provider_label` / `_subscription_login_providers` / `_api_key_login_providers` / `_stored_credential_providers` / `_credential_store_has_entry`
provider 显示标签与按 auth 方式/OAuth/已存凭据过滤 provider。

### `_theme_picker_label(theme_name, *, current_theme) -> str`
当前主题前加 `✓`。

### `_model_picker_label(choice, *, current_model, current_provider, scoped=False) -> str`
模型标签(当前选中 `*`、scoped 加 `[scoped]`)。

### `_filter_login_providers` / `_filter_model_choices`
按查询串(名字/显示名、provider+model)过滤 provider/模型。

### `_command_message_uses_transcript` / `_command_message_uses_notification` / `_command_output_title`
判断命令输出应入 transcript(`/reload`、`/system`)、应通知(`/name` 改名)、以及弹窗标题生成。

### `_is_thinking_cycle_key(key, configured_key) -> bool`
处理 `shift+tab` 映射到 `backtab` 的特殊键。

### `_textual_theme_for_tau_theme(theme_name) -> Theme` / `_theme_css_variables(theme) -> dict`
把 Tau 主题映射为 Textual 原生 `Theme` 及 CSS 变量字典。

### `_render_queued_messages(state, *, theme) -> Group` / `_queued_message_preview(message) -> str`
渲染排队消息(steering/follow-up)预览行。

### `_prompt_footer_mode(state, completion_state) -> Literal[...]`
依补全项/运行状态返回 footer 模式。

### `_key_hint(key) -> str` / `_app_bindings(keybindings) -> list[Binding]` / `_prompt_bindings(keybindings, *, mode) -> list[Binding]` / `_hidden_prompt_bindings(...)`
键位提示格式化与应用级/按 footer 模式 prompt 级绑定构造(含可见与隐藏 `priority=True` 绑定)。

### `_text_end_location(text) -> tuple[int,int]`
返回文本末尾 `(row, column)` 光标位置。

### `_format_prompt_error(exc, session) -> str` / `_attach_diagnostic_log_path_to_error(state, session) -> None`
prompt 错误文案格式化与把诊断日志路径附加到错误 item。

### `_explicit_resume_record` / `_create_startup_session_record` / `_resolve_tui_startup_selection` / `_first_usable_startup_selection` / `_selection_from_session_record` / `_usable_scoped_startup_choices`
启动期会话记录解析与 provider 选择解析(优先显式 provider/model、resume 记录、可用凭据,否则回退)。

### `async def run_tui_app(...) -> None`
**程序入口**:解析 `--resume`/`--new-session` 互斥;加载 provider/shell 设置、SessionManager、记录与 provider 选择;尝试 `create_model_provider`,失败时以 `LoginRequiredProvider` 占位并置 startup_message;构造 `CodingSession`(含 jsonl 存储、扩展路径、thinking 级别等);`TauTuiApp(...).run_async()`;`finally` 中 `session.aclose()` + `provider.aclose()`。

---

## 核心数据流

端到端把"用户输入 → CodingSession.prompt → 事件 → TauTuiApp 渲染"串联如下:

1. **用户在 `PromptInput`(`#prompt`)输入并回车**(或 `action_submit_follow_up`):`PromptInput.on_key` 捕获 `enter`/`queue_follow_up`,`stop()` 后转发到 `TauTuiApp.action_submit_prompt` → `_submit_prompt_from_editor`。
2. **提交分流**:`_submit_prompt_from_editor` 先尝试补全应用;若文本是 `!`/`!!` shell 命令则 `run_worker(_run_terminal_command)`;若命中斜杠命令则走 `session.handle_command` 的各分支(可能打开各种 ModalScreen);否则——运行中(有 agent 回合)就 `_queue_prompt`(经 `session.prompt(..., streaming_behavior="follow_up"/"steer")` 排队),空闲则 `_submit_prompt(text)`。
3. **开启一轮**:`_submit_prompt` 递增 `_prompt_run_id`,对普通非命令文本乐观地把用户气泡即时渲染(`_append_optimistic_user_message`),再 `run_worker(self._run_prompt(...), exclusive=True)`。
4. **事件流循环**:`_run_prompt` 内 `async for event in session.prompt(text, source=..., custom_type=..., details=...)`:
   - 用 `_prompt_run_id` 守卫,被取代/取消即早退。
   - 用 `_consume_optimistic_user_event` / `_replace_transformed_optimistic_user_message` 把乐观用户气泡与确认事件对账(避免重复渲染)。
   - 每个事件先 `self.adapter.apply(event)`(更新 `TuiState`),再 `await self._apply_streaming_transcript_event(event)` 把事件增量映射到已挂载的 `TranscriptView` 等 widget:
     - `MessageDeltaEvent`/`ThinkingDeltaEvent` → `append_assistant_delta`/`append_thinking_delta`(流式打字);
     - `ToolExecutionStart/Update/EndEvent` → `finish_assistant_message` + `append_item`/`update_item`(工具调用与结果展开);
     - `AgentStart/EndEvent`、`MessageStart/EndEvent`、`Retry/ErrorEvent`、`QueueUpdateEvent` → 相应的 transcript 收尾与 chrome 刷新。
   - 同时 `_sync_activity_indicator` 驱动 prompt 前缀动画与工具 spinner(经 `_tick_activity`/`_respin_pending_tool`)。
5. **ModalScreen 子系统**:命令如 `/login`、`/session`、`/resume`、`/branch`、`/model`、`/theme` 等通过 `_open_*_picker`/`_open_login` 等 `push_screen` 打开对应 ModalScreen;`dismiss` 结果经 `_handle_*_result` 回调落到 `session.resume`/`branch_to_entry`/`set_provider`/`set_model`/`set_thinking_level` 等,再 `_refresh_chrome`/`_refresh`。
6. **扩展桥**:扩展运行时通过 `_TuiExtensionUiBridge` 调 `select/confirm/input`(→ `_run_dialog` 推 `Extension*Screen`)、`set_slot_widget`/`open_main_view`(→ `_set_extension_slot_widget`/`_open_extension_main_view`,经 `_reconcile_slot`/`_reconcile_main_view` 串行挂载到 `#above/below-prompt-slot`/`#main-slot`),以及 `register_key_interceptor`(在 `on_event` 派发前被咨询)。崩溃由 `_quarantine_extension_widget` 隔离,应用继续运行。
7. **收尾**:`_run_prompt` 的 `finally` 清乐观消息、清 `_prompt_worker`;错误路径把异常格式化进 state 并刷新;任何 state 变化最终都经 `_refresh`/`_refresh_chrome` 把 `TuiState` 同步到 `TranscriptView`、`SessionSidebar`、`CompactSessionInfo`、活动指示器与 footer 绑定,完成"事件 → 界面"的闭环。

整个过程体现了架构原则:`CodingSession`(agent 大脑)只产出 `AgentEvent` 事件流,`TauTuiApp`(一个可能的 frontend)通过 `TuiEventAdapter` 把事件映射到 `TuiState`,再增量渲染到 Textual widget——UI 层不反向污染可复用的 agent 核心。

## 逐方法深度剖析(widgets.py)

> 以下为 `widgets.py` 各顶层类与模块级渲染函数的逐方法展开。

## TranscriptLine

### 类定义

`dataclass(frozen=True, slots=True)` 的不可变数据类,封装一条用于兼容性检查/测试的无格式转录文本行。仅含一个字段 `text: str`,由 `TranscriptView.lines` 属性在遍历已挂载消息的 `selection_text` 时按行拆分构造。

## SessionSummarySource

### 类定义

`Protocol` 接口,定义侧边栏/紧凑信息所需的会话属性集合,供 `render_session_sidebar` 与 `render_compact_session_info` 在不知道具体会话实现的情况下消费。以下仅声明只读属性签名(均为 `@property`,无实现体):

- `cwd -> Path`:会话工作目录。
- `model -> str`:当前模型名称。
- `provider_name -> str`:提供者名称。
- `tools -> Sequence[AgentTool]`:可用工具列表。
- `skills -> Sequence[Skill]`:已加载技能列表。
- `prompt_templates -> Sequence[PromptTemplate]`:提示模板列表。
- `context_files -> Sequence[ProjectContextFile]`:上下文文件列表。
- `context_token_estimate -> int`:上下文 token 估算值。
- `auto_compact_token_threshold -> int | None`:自动压缩阈值。
- `context_window_tokens -> int`:上下文窗口大小。
- `thinking_level -> str`:思考级别。
- (实际代码中 `_thinking_level` 还会用到 `available_thinking_levels`、`state` 等可选属性,但协议本身未声明。)

## SessionSidebar

### 类定义

`Static` 子类,作为紧凑会话元数据的侧边栏容器,自身不绘制内容,而是把渲染委托给模块级函数 `render_session_sidebar`。

### update_from_session

```python
def update_from_session(self, session: SessionSummarySource, *, theme: TuiTheme = TAU_DARK_THEME) -> None:
```

依据当前会话元数据重绘侧边栏。调用 `self.update(render_session_sidebar(session, theme=theme))`,用 `render_session_sidebar` 生成的 Rich 渲染对象更新 Static 内容。

## CompactSessionInfo

### 类定义

`Static` 子类,用于窄布局下的单行会话元信息容器,渲染同样委托给模块级函数。

### update_from_session

```python
def update_from_session(self, session: SessionSummarySource, *, theme: TuiTheme = TAU_DARK_THEME) -> None:
```

重绘紧凑会话元信息。调用 `self.update(render_compact_session_info(session, theme=theme))`。

## TauMarkdownBlock

### 类定义

`MarkdownBlock` 子类,专用于 Tau 的 ThemedMarkdownWidget,提供带主题色的 Markdown 内联链接渲染,并修正未挂载时的原生选择崩溃问题。

### allow_select

```python
@property
def allow_select(self) -> bool:
```

控制该块是否允许原生文本选择。返回 `self.parent is not None and super().allow_select`。Textual 在鼠标按下时可能选中尚未挂载(无父容器)的块,其选择路径假设选中内容有父容器,否则会 `container is None` 崩溃;此属性确保块已挂载后才允许选择。

### _token_to_content

```python
def _token_to_content(self, token: Any) -> Any:
```

把 Markdown 令牌转换为内容 renderable,并给链接 span 套上 Tau 主题链接色。步骤:
1. 调 `super()._token_to_content(token)` 得到原始 content。
2. 若所属 `markdown` 不是 `ThemedMarkdownWidget`,直接返回 content。
3. 取 `markdown.tau_link_style` 解析为 `TextualStyle`。
4. 遍历 content 的 spans:若 span 的 style 是带 `@click` meta 的 `TextualStyle`(即链接),则 `link_style + style` 叠加主题色;否则保留原 style。
5. 用同类型构造器重建 content 返回。

## ThemedMarkdownWidget

### 类定义

`TextualMarkdown` 子类,专供 Tau 转录流式 markdown 使用。覆盖 `BLOCKS` 映射,把 `paragraph_open` 替换为 `TauMarkdownBlock`;并通过 `DEFAULT_CSS` 设置各 Markdown 标题/内联代码/项目符号/代码块/表格的主题 CSS 变量样式(标题色 `$tau-markdown-highlight`、内联代码 `$tau-markdown-inline-code`、代码块背景 `$tau-markdown-code-block-background` 等)。

### __init__

```python
def __init__(self, markdown: str | None = None, *, theme: TuiTheme, classes: str | None = None) -> None:
```

保存 `self.tau_link_style = theme.markdown_link`(供 TauMarkdownBlock 使用),再调 `super().__init__(markdown, classes=classes)` 完成 Textual Markdown 初始化。

## TranscriptMessageWidget

### 类定义

`Horizontal` 子类,表示一条可选中的完整高度角色块消息。CSS 默认 `width: 1fr; height: auto; margin: 1 1 2 0;`,正文 `.transcript-message-body` 有左右内边距,Markdown 段落间有下边距。`_BORDERLESS_TRANSCRIPT_ROLES` 冻结集合为 `{"assistant", "thinking"}`,这些角色采用无边框/无背景的自由流式渲染。

### __init__

```python
def __init__(self, item: ChatItem, *, theme: TuiTheme, show_tool_results: bool, custom_markup: str | None = None, invocation: str | None = None, result_markup: str | None = None) -> None:
```

构造一条消息 widget。步骤:
1. 存 `self.item`。
2. 仅当 `item.role == "custom"` 时存 `self._custom_markup`,仅 `item.role == "tool"` 时存 `self._invocation` 与 `self._result_markup`(其他角色忽略)。
3. 调 `transcript_item_selection_text(...)` 预计算 `self.selection_text`(纯文本选择内容)。
4. 调 `_transcript_item_markdown(...)` 预计算 `self._markdown_text`。
5. 存 `self._theme` 与 `self._role_style = _chat_item_role_style(item, theme)`。
6. 调 `super().__init__(classes="transcript-message")`。
7. `_split_rich_style_colors(self._role_style.body)` 拆出前景/背景色,存 `self._body_foreground`。
8. 若角色在 `_BORDERLESS_TRANSCRIPT_ROLES` 中,`self._body_background = None`(无背景/无左边框);否则设背景、`styles.border_left = ("tall", self._role_style.border)`、若有背景再设 `styles.background`。

### compose

```python
def compose(self) -> Any:
```

仅 `yield self._body_widget()`,即挂接一条正文 widget。

### _body_widget

```python
def _body_widget(self) -> Static | ThemedMarkdownWidget:
```

生成消息正文 widget,按角色与内容形态分三种路径:
1. **custom 角色**:返回 `Static`,内容由 `_custom_body_renderable(self._custom_markup, raw_text=item.text, body_style=self._role_style.body)` 生成,`markup=False`,类 `transcript-message-body transcript-plain-body`。
2. **`_use_plain_transcript_body(item)` 为真**(user/tool/skill/error):返回 `Static`,内容由 `_transcript_plain_body_text(...)` 生成,同样 `transcript-plain-body`。
3. **其余**:返回 `ThemedMarkdownWidget(self._markdown_text, theme=self._theme, classes="transcript-markdown-body")`。
最后把 `self._body_foreground`/`self._body_background` 应用到 body 的 `styles.color`/`styles.background` 后返回。

### get_selection

```python
def get_selection(self, selection: Selection) -> tuple[str, str] | None:
```

返回该消息被选中区域的纯文本(而非 Markdown 标记)。调 `_extract_text_selection(self.selection_text, selection)`,为空则返回 `None`,否则返回 `(selected_text, "\n")`。

### refresh_invocation

```python
def refresh_invocation(self, *, show_tool_results: bool, invocation: str | None = None, result_markup: str | None = None) -> bool:
```

就地重渲染 plain-body 文本(用于高频更新:spinner 帧、工具进度),避免 remount 引发闪烁。步骤:
1. 若角色为 custom 或不是 plain-body,返回 `False`。
2. 更新 `self._invocation`、`self._result_markup`、`self.selection_text`、`self._markdown_text`(重新调 `transcript_item_selection_text` 与 `_transcript_item_markdown`)。
3. 用 `query_one(".transcript-plain-body", Static)` 找到 body,若 `NoMatches` 返回 `False`。
4. `body.update(_transcript_plain_body_text(...))`,返回 `True`。

## StreamingTranscriptMessageWidget

### 类定义

`ThemedMarkdownWidget` 子类,表示可接收流式片段的 assistant/thinking Markdown 块。CSS 设 `margin: 1 1 2 1; padding: 0 1 0 0;`,并定义 `-streaming` 类(代码块隐藏横向滚动)与 `-finalized` 类(代码块可横向滚动)两种状态。

### __init__

```python
def __init__(self, item: ChatItem, *, theme: TuiTheme) -> None:
```

1. 若 `item.role not in {"assistant", "thinking"}` 抛 `ValueError`。
2. 存 `self.item`、`self.selection_text = item.text`、`self._stream = None`、`self._is_streaming = True`。
3. 调 `super().__init__(item.text, theme=theme)`。
4. `add_class("transcript-message")`、`add_class("-streaming")`。
5. `_split_rich_style_colors(_chat_item_role_style(item, theme).body)` 取前景色,若有则设 `self.styles.color`(使流式文本颜色与终态块一致,避免再次重绘时变色)。

### stream

```python
@property
def stream(self) -> MarkdownStream:
```

惰性创建并返回 `MarkdownStream`:若 `self._stream is None`,则 `self._stream = self.get_stream(self)`(Textual 的流式接口),否则返回已有实例。

### append_fragment

```python
async def append_fragment(self, fragment: str) -> None:
```

追加流式 markdown 片段而不重解析整段累积消息。若 `fragment` 为空直接返回;否则 `self.item.text += fragment`、`self.selection_text += fragment`,再 `await self.stream.write(fragment)`。

### _stop_stream

```python
async def _stop_stream(self) -> None:
```

停止 Textual markdown 流,先 flush 挂起片段。若 `self._stream is None` 直接返回;否则置 `None` 并 `await stream.stop()`。

### replace_text

```python
async def replace_text(self, text: str) -> None:
```

以修正后的最终内容替换当前 markdown。先 `await self._stop_stream()`,再更新 `self.item.text` 与 `self.selection_text`,最后 `await self.update(text)`。

### finalize

```python
async def finalize(self, text: str | None = None) -> None:
```

标记流式消息完成并恢复终态 markdown chrome。逻辑:
- 若 `text` 给定且不同于 `self.selection_text`:`await self.replace_text(text)`。
- 否则若 `text` 给定,仅更新 `item.text`/`selection_text`;然后 `await self._stop_stream()`。
- 置 `self._is_streaming = False`,`remove_class("-streaming")`,`add_class("-finalized")`。

### on_unmount

```python
async def on_unmount(self) -> None:
```

widget 在流式中被移除时取消 markdown 流任务:`await self._stop_stream()`。

### get_selection

```python
def get_selection(self, selection: Selection) -> tuple[str, str] | None:
```

返回该流式消息块的选中文本。调 `_extract_text_selection(self.selection_text, selection)`,空则返回 `None`,否则返回 `(selected_text, "\n")`。

## TranscriptView

### 类定义

`VerticalScroll` 子类,可滚动的转录视图,由若干可选中的消息 widget 组成。构造时清理 `wrap/highlight/markup` 等遗留 kwargs、可选的 `min_width`;内部状态包括 `_render_state`、`_render_theme`、`_last_render_width`、`_active_assistant_widget`、`_active_thinking_widget`、`_hidden_thinking_placeholder_visible`、`_follow_output`、`_follow_scroll_pending`。

### __init__

```python
def __init__(self, *args: Any, **kwargs: Any) -> None:
```

1. `pop` 掉遗留选项 `wrap/highlight/markup` 与可选 `min_width`。
2. `super().__init__(*args, **kwargs)`,若 `min_width` 非 None 则设 `self.styles.min_width`。
3. 初始化各内部状态字段(见类定义)。

### on_mount

```python
def on_mount(self) -> None:
```

挂载后进入跟随模式,调用 `self.follow_output()`(内容更新时自动滚到底部,直到用户向上滚动)。

### follow_output

```python
def follow_output(self) -> None:
```

返回跟随模式(用于用户主动回合或显式跳到底部)。置 `self._follow_output = True`、`self.anchor(True)`、`self._request_follow_scroll(force=True)`。

### _request_follow_scroll

```python
def _request_follow_scroll(self, *, force: bool = False) -> None:
```

布局后滚到底部(当跟随模式仍激活)。若已有挂起请求且非 force 则跳过;否则置 `_follow_scroll_pending=True`,定义 `scroll_if_still_following()` 闭包(清标志,若 `force` 或 `_follow_output` 或已到垂直末端则 `scroll_end(animate=False, immediate=True)`),并 `call_after_refresh(scroll_if_still_following)`。

### _should_follow_output

```python
@property
def _should_follow_output(self) -> bool:
```

返回是否应把视口钉在底部:`_follow_output or self.is_vertical_scroll_end`。

### watch_scroll_y

```python
def watch_scroll_y(self, old_value: float, new_value: float) -> None:
```

追踪用户是否退出跟随模式。先 `super().watch_scroll_y`;若用户向上滚(`new_value < old_value`)则 `_follow_output = False`;若已滚到最大位置则 `_follow_output = True`。

### _finalize_active_thinking_message

```python
async def _finalize_active_thinking_message(self) -> None:
```

另一个块开始之前,停止正在流式的 thinking 块。若存在 `_active_thinking_widget`,`await widget.finalize()` 并置 `None`。

### _finalize_active_assistant_message

```python
async def _finalize_active_assistant_message(self) -> None:
```

类似上一方法,停止正在流式的 assistant 块,`await widget.finalize()` 后置 `_active_assistant_widget = None`。

### update_from_state

```python
def update_from_state(self, state: TuiState, *, theme: TuiTheme = TAU_DARK_THEME) -> None:
```

从显示状态重绘整个转录。仅保存 `self._render_state = state`、`self._render_theme = theme`,然后调 `self._redraw(scroll_end=self._should_follow_output)`。`_redraw` 负责清空所有消息 widget 并按 `state.items` 重新挂载每条消息(详见 `_redraw`)。注意:该方法做全量重建,高频流式更新走 `append_*`/`update_item` 路径。

### update_thinking_visibility

```python
def update_thinking_visibility(self, state: TuiState, *, theme: TuiTheme = TAU_DARK_THEME) -> None:
```

仅在处理思考可见性变化后更新 thinking 相关 widget(不重建全部)。步骤:
1. 存 state/theme;记录 `should_follow = self._should_follow_output` 与 `previous_scroll_y`。
2. 收集当前消息子 widget(message_children),再筛出 thinking_children 并 `remove_children`。
3. 收集 non_thinking_children;准备 `pending_thinking` 列表与 `hidden_thinking_placeholder` 标志;定义 `flush_pending(before=...)` 闭包,把累积的 pending thinking widget 用 `mount(..., before=before)` 插入。
4. 遍历 `state.items`:对 thinking 项,若 `show_thinking` 则追加真实 `TranscriptMessageWidget`,否则仅当尚未添加占位时追加一个占位(`ChatItem(role="thinking", text=_HIDDEN_THINKING_PLACEHOLDER)`)并置标志;continue。
5. 对非 thinking 项:flush pending(插到匹配已有 non_thinking child 之前);用 `while` 在 non_thinking_children 中按 `child.item is item` 找到对应 widget 作为 `target`,`flush_pending(before=target)`。
6. 处理尾部的剩余 non_thinking child(`tail_child`),`flush_pending(before=tail_child)`。
7. 置 `_active_thinking_widget = None`,用 `_last_transcript_child_is_hidden_thinking_placeholder(self.children)` 更新 `_hidden_thinking_placeholder_visible`,刷新 `_last_render_width`,`refresh(layout=True)`;若 `should_follow` 则 `_request_follow_scroll`,否则 `call_after_refresh` 恢复到 `previous_scroll_y`。

### on_resize

```python
def on_resize(self, event: Resize) -> None:
```

终端宽度变化时重渲染转录条目。忽略 `event`;若没有 `_render_state` 返回;取 `width = self.scrollable_content_region.width`,若 `width <= 0` 或与 `_last_render_width` 相同则返回;记录 `was_at_end = self.is_vertical_scroll_end`,`_redraw(scroll_end=was_at_end)`,再 `scroll_to(x=0, ...)`。

### _redraw

```python
def _redraw(self, *, scroll_end: bool) -> None:
```

全量重绘的核心实现。步骤:
1. 取 `state = self._render_state`,为空返回;`theme = self._render_theme`;更新 `_last_render_width`。
2. `remove_children` 移除所有消息 widget;重置 `_active_assistant_widget`、`_active_thinking_widget`、`_hidden_thinking_placeholder_visible = False`;设 `hidden_thinking_placeholder = False`。
3. 遍历 `state.items`:
   - 若 `item.role == "thinking" and not state.show_thinking`:仅当尚未添加占位时 mount 一个占位消息 widget(`_HIDDEN_THINKING_PLACEHOLDER`),置标志,continue。
   - 否则 `hidden_thinking_placeholder = False`;若 custom 角色用 `state.resolve_custom_markup(item, expanded=state.show_tool_results)` 得 `custom_markup`(否则 None)。
   - `mount` 一个 `TranscriptMessageWidget`,传入 `show_tool_results=state.show_tool_results or item.always_show_tool_result`、`custom_markup`、`invocation=state.resolve_tool_invocation(item)`、`result_markup=state.resolve_tool_result(item, ...)`。
4. 若 `state.assistant_buffer` 非空,mount 一条 `assistant` 缓冲消息 widget。
5. `refresh(layout=True)`;若 `scroll_end` 则 `_request_follow_scroll()`。

### append_item

```python
async def append_item(self, item: ChatItem, *, theme: TuiTheme = TAU_DARK_THEME, show_tool_results: bool = False, scroll_end: bool = False, custom_markup: str | None = None, invocation: str | None = None, result_markup: str | None = None) -> TranscriptMessageWidget | StreamingTranscriptMessageWidget:
```

不重建已有块地追加一条消息。步骤:
1. `should_follow = self._should_follow_output if not scroll_end else True`。
2. `await self._finalize_active_assistant_message()` 与 `await self._finalize_active_thinking_message()`(先收尾任何流式)。
3. 存 theme;用 `_transcript_widget(...)` 构造 widget;`await self.mount(widget)`。
4. 清空 `_active_assistant_widget`/`_active_thinking_widget`/`_hidden_thinking_placeholder_visible`,更新 `_last_render_width`,`refresh(layout=True)`。
5. 若 `should_follow` 则 `_request_follow_scroll(force=scroll_end)`,返回 widget。

### update_item

```python
async def update_item(self, item: ChatItem, *, theme: TuiTheme = TAU_DARK_THEME, show_tool_results: bool = False, invocation: str | None = None, result_markup: str | None = None) -> bool:
```

就地重新渲染一条已挂载的消息。遍历 children,对 `TranscriptMessageWidget` 且 `child.item is item` 的:
1. 优先调 `child.refresh_invocation(...)`,若返回 `True` 则就地更新并返回。
2. 否则构造 replacement widget,`await self.mount(replacement, after=child)` 后 `await child.remove()`,`refresh(layout=True)`,若 `_should_follow_output` 则 `_request_follow_scroll()`,返回 `True`。
3. 未找到匹配返回 `False`。

### start_assistant_message

```python
async def start_assistant_message(self, *, theme: TuiTheme = TAU_DARK_THEME, scroll_end: bool = False) -> StreamingTranscriptMessageWidget:
```

按需创建激活的 assistant 流式 widget。若已有则返回;否则先 `await self._finalize_active_thinking_message()`,`should_follow = ... if not scroll_end else True`,构造 `StreamingTranscriptMessageWidget(ChatItem(role="assistant", text=""), theme=theme)`,存 theme,mount 它,置 `_active_assistant_widget`,更新 `_last_render_width`,若 `should_follow` 则 `_request_follow_scroll(force=scroll_end)`,返回。

### append_assistant_delta

```python
async def append_assistant_delta(self, delta: str, *, theme: TuiTheme = TAU_DARK_THEME, scroll_end: bool = False) -> None:
```

把流式 assistant 文本追加到激活 widget。`should_follow = ... if not scroll_end else True`;`widget = await self.start_assistant_message(...)`;`await widget.append_fragment(delta)`;若 `should_follow` 则 `_request_follow_scroll(force=scroll_end)`。

### append_thinking_delta

```python
async def append_thinking_delta(self, delta: str, *, theme: TuiTheme = TAU_DARK_THEME, show_thinking: bool, scroll_end: bool = False) -> None:
```

追加流式 thinking 文本或一个隐藏 thinking 占位。步骤:
1. `should_follow = ... if not scroll_end else True`。
2. 若 `not show_thinking`:若 `_hidden_thinking_placeholder_visible` 已显示则直接返回;否则构造占位 `TranscriptMessageWidget(_HIDDEN_THINKING_PLACEHOLDER)`,`mount(widget, before=self._active_assistant_widget)`,置 `_active_thinking_widget = None`、`_hidden_thinking_placeholder_visible = True`,更新宽度,`refresh(layout=True)`,若 `should_follow` 则 `_request_follow_scroll(force=scroll_end)`,返回。
3. 否则 `_hidden_thinking_placeholder_visible = False`;若 `_active_thinking_widget is None`,创建 `StreamingTranscriptMessageWidget(role="thinking", text="")`,mount 到 `_active_assistant_widget` 之前。
4. `await self._active_thinking_widget.append_fragment(delta)`;若 `should_follow` 则 `_request_follow_scroll(force=scroll_end)`。

### finish_assistant_message

```python
async def finish_assistant_message(self, text: str | None = None) -> None:
```

provider 发完全部消息后收尾激活的 assistant widget。若 `_active_assistant_widget is None`:仅当 `text` 非空时 `await self.append_item(ChatItem(role="assistant", text=text), ...)` 并返回。否则 `await widget.finalize(text)`,置 `_active_assistant_widget = None`、`_hidden_thinking_placeholder_visible = False`。

### lines

```python
@property
def lines(self) -> tuple[TranscriptLine, ...]:
```

兼容性文本视图,用于测试和轻量转录检查。收集所有消息子 widget,把每个的 `selection_text` 按行拆分,每条生成一个 `TranscriptLine`。

## 模块级函数

### _last_transcript_child_is_hidden_thinking_placeholder

```python
def _last_transcript_child_is_hidden_thinking_placeholder(children: Sequence[Widget]) -> bool:
```

判断最后一个消息子 widget 是否为隐藏 thinking 占位。逆序遍历 children,找到第一个 `TranscriptMessageWidget | StreamingTranscriptMessageWidget`,返回 `child.item.role == "thinking" and child.selection_text == _HIDDEN_THINKING_PLACEHOLDER`;若无则返回 `False`。

### _transcript_widget

```python
def _transcript_widget(item: ChatItem, *, theme: TuiTheme, show_tool_results: bool, custom_markup: str | None = None, invocation: str | None = None, result_markup: str | None = None) -> TranscriptMessageWidget | StreamingTranscriptMessageWidget:
```

按角色分配 widget 类型:`assistant`/`thinking` 返回 `StreamingTranscriptMessageWidget(item, theme=theme)`;其余返回 `TranscriptMessageWidget(...)`。

### transcript_item_selection_text

```python
def transcript_item_selection_text(item: ChatItem, *, show_tool_results: bool = False, custom_markup: str | None = None, invocation: str | None = None, result_markup: str | None = None) -> str:
```

返回可选中转录项的纯文本表示。分支:
- custom 角色:`_custom_selection_text(custom_markup, item.text)`。
- tool 角色且 `result_markup is not None`:返回 `invocation_line\n` + 去标记后的卡片(`_custom_markup_to_text(result_markup).plain`),其中 `invocation_line = invocation or item.text`。
- 其余:`_visible_chat_text(item, show_tool_results=show_tool_results, invocation=invocation)`。

### _custom_markup_to_text

```python
def _custom_markup_to_text(markup: str) -> Text:
```

安全解析 Rich 标记;标记损坏时回退为字面文本。用 `Text.from_markup(markup)`;捕获任意异常(避免坏渲染串崩溃 TUI)返回 `Text(markup)`。

### _custom_selection_text

```python
def _custom_selection_text(markup: str | None, raw_text: str) -> str:
```

返回 custom 项的可选纯文本。若 `markup is None` 返回 `raw_text`,否则返回 `_custom_markup_to_text(markup).plain`。

### _custom_body_renderable

```python
def _custom_body_renderable(markup: str | None, *, raw_text: str, body_style: str) -> RenderableType:
```

从渲染标记生成 custom 消息正文,回退为原始文本。若 `markup is None` 返回 `Text(raw_text, style=body_style, overflow="fold", no_wrap=False)`;否则 `_custom_markup_to_text(markup)` 并设 `overflow="fold"`、`no_wrap=False`。

### _split_rich_style_colors

```python
def _split_rich_style_colors(style: str) -> tuple[str | None, str | None]:
```

从简单 Rich 样式串拆分前景/背景色。`Style.parse(style)` 后取 `color.name`(无则 None)与 `bgcolor.name`(无则 None)返回。

### _use_plain_transcript_body

```python
def _use_plain_transcript_body(item: ChatItem) -> bool:
```

判断转录项是否可用快速可选纯文本渲染。返回 `item.role in {"user", "tool", "skill", "error"}`。

### _transcript_plain_body_text

```python
def _transcript_plain_body_text(item: ChatItem, *, text: str, body_style: str, theme: TuiTheme, invocation: str | None = None, result_markup: str | None = None) -> RenderableType:
```

为可选纯文本行返回带样式的转录文本。逻辑:
- 非 tool 角色:`Text(text, style=body_style, overflow="fold", no_wrap=False)`。
- tool 且 `result_markup is not None`:用 `_render_transcript_tool_invocation` 渲染调用行(状态色强调),再 `_custom_markup_to_text(result_markup)`(设 fold/no_wrap),返回二者 `Group`。
- tool 常规路径:`text.partition("\n\n")` 拆出 invocation_line/separator/result_text;`_render_transcript_tool_invocation` 渲染调用行;若无 separator 直接返回调用文本。
- 否则尝试 `_render_patch_body(result_text, ...)`,非 None 则返回 `Group(invocation_text, Text(""), patch_body)`。
- 否则构造 `Text`:追加 invocation_text、separator、result_text(用 body_style)。

### _render_transcript_tool_invocation

```python
def _render_transcript_tool_invocation(text: str, *, body_style: str, accent_style: str | None) -> Text:
```

渲染带状态色(前缀之后)的可选工具调用。构造 `Text(style=body_style, ...)`;`accent_style = accent_style or body_style`;用 `_split_tool_invocation(text)` 拆 prefix/name/remainder;依次 append prefix(body)、name(accent)、remainder(accent)。

### _transcript_item_markdown

```python
def _transcript_item_markdown(item: ChatItem, *, show_tool_results: bool, invocation: str | None = None) -> str:
```

返回供 Textual Markdown 块使用的 markdown。`visible_text = _visible_chat_text(item, show_tool_results, invocation)`;若角色在 `{"assistant", "thinking", "status", "branch_summary", "compaction_summary"}` 直接返回 `visible_text`,否则返回 `_plain_markdown(visible_text)`。

### _plain_markdown

```python
def _plain_markdown(text: str) -> str:
```

把任意纯文本表示为可换行的 markdown 段落。空则 `""`;否则每行经 `_escape_plain_markdown_line` 后用 `\n` 连接。

### _escape_plain_markdown_line

```python
def _escape_plain_markdown_line(line: str) -> str:
```

转义 markdown 语法同时保留纯文本换行。先 `line.replace("\\", "\\\\")`,再对字符集 `\`*_{}[]()#+-.!|>` 逐个加反斜杠转义。

### _extract_text_selection

```python
def _extract_text_selection(text: str, selection: Selection) -> str:
```

从文本中抽取选中内容。先 `_clip_selection_to_text(selection, text)` 得到裁剪后的 Selection,再 `.extract(text)` 返回子串。

### _clip_selection_to_text

```python
def _clip_selection_to_text(selection: Selection, text: str) -> Selection:
```

把 Selection 的坐标裁剪到文本实际范围内。按 `text.splitlines()`;若无行则返回 `Selection(Offset(0,0), Offset(0,0))`;否则对 start/end 调 `_clip_selection_offset` 重建 Selection。

### _clip_selection_offset

```python
def _clip_selection_offset(offset: Offset | None, lines: list[str]) -> Offset | None:
```

裁剪单个坐标到合法范围。`offset is None` 返回 None;否则 `line_index = clamp(offset.y, 0, len-1)`,`column = clamp(offset.x, 0, len(lines[line_index]))`,返回 `Offset(column, line_index)`。

### render_session_sidebar

```python
def render_session_sidebar(session: SessionSummarySource, *, theme: TuiTheme = TAU_DARK_THEME) -> RenderableType:
```

渲染活跃会话的暗色极简摘要。步骤:
1. 建 `Table.grid(padding=(0,1))`,两列分别用 `theme.completion_description` 与 `theme.prompt_text` 样式;添加 `provider/model/thinking/tools/skills` 四行(其中 thinking 值来自 `_thinking_level`)。
2. 用 `_bullet_list` 生成 tools、skills、prompts(来自 `session.prompt_templates`)、context(来自 `_context_file_labels`)四个列表,空时显示对应占位串。
3. 构造 logo 文本 `TAU_SIDEBAR_LOGO`(`τ = 2π`),样式 `bold {theme.prompt_text}`。
4. 返回 `Group`:居中 logo、`session` 段、`--` 分隔、context、tools、skills、prompts 各段(各由 `_sidebar_section` 与 `_sidebar_separator` 组装)。

### _sidebar_section

```python
def _sidebar_section(title: str, body: RenderableType, *, theme: TuiTheme) -> RenderableType:
```

无边框渲染一个侧边栏小节。标题 `Text(title, style=f"bold {theme.accent}")`;返回 `Group(Padding(header, (0,0,0,1)), Padding(body, (0,0,1,1)))`。

### _sidebar_separator

```python
def _sidebar_separator(*, theme: TuiTheme) -> RenderableType:
```

渲染小节间的微妙分隔线。返回 `Padding(Rule(style=theme.border), (0,0,1,0))`。

### render_compact_session_info

```python
def render_compact_session_info(session: SessionSummarySource, *, theme: TuiTheme = TAU_DARK_THEME) -> RenderableType:
```

在 prompt 下方渲染单行会话信息。构造 `left` 文本(`_short_path(session.cwd) (_git_branch(session.cwd))`,`theme.prompt_text`);`right` 文本右对齐(`theme.muted_text`),依次 append `_context_usage`(用 `completion_description`)、空格、`provider:model`(`prompt_text`)、thinking 级别(`completion_description`)。用 `Table.grid(expand=True)` 两列(`ratio=1`、右对齐 `ratio=1`)放 left/right 并返回。

### render_chat_item

```python
def render_chat_item(item: ChatItem, *, theme: TuiTheme = TAU_DARK_THEME, show_tool_results: bool = False, custom_markup: str | None = None) -> RenderableType:
```

把聊天项渲染为独立 Toad 风格的转录块。步骤:
1. `role_style = _chat_item_role_style(item, theme)`。
2. body 选择:custom 用 `_custom_body_renderable`;tool 用 `_render_tool_chat_body`;其余用 `_render_chat_body(_visible_chat_text(item, show_tool_results), role=item.role, body_style=role_style.body, ...)`。
3. 构造 `Table.grid(expand=True)`:第一列宽 1(边框色)、第二列 ratio=1(body 色);行内放左对齐的 `▌` 字符(边框色)与 `Padding(body, (0,1,0,1), role_style.body)`。
4. 整体 `Padding(table, (1,1,1,0), role_style.body)` 返回。

### _chat_item_role_style

```python
def _chat_item_role_style(item: ChatItem, theme: TuiTheme) -> TuiRoleStyle:
```

按角色与工具结果取角色样式。若 tool 且 `tool_result_text` 以 `✓` 开头:返回 `TuiRoleStyle(border=_tool_success_color(theme), body=tool.body)`;若以 `✗` 开头:返回 `TuiRoleStyle(border="#ff4f4f", body=tool.body)`;否则 `theme.role_styles[item.role]`。

### _tool_accent_style

```python
def _tool_accent_style(item: ChatItem, *, theme: TuiTheme) -> str | None:
```

返回工具调用的强调样式串。非 tool 或无 `tool_result_text` 返回 None;`✓` 返回 `_tool_success_style(theme)`,`✗` 返回 `_tool_error_style(theme)`,否则 None。

### _tool_success_color

```python
def _tool_success_color(theme: TuiTheme) -> str:
```

返回工具成功色。浅色主题 `tau-light` 返回 `#166534`,否则 `#9cffb1`。

### _tool_success_style

```python
def _tool_success_style(theme: TuiTheme) -> str:
```

返回成功文字样式。成功色基础上:浅色主题直接返回 color,否则 `color on #000000`。

### _tool_error_style

```python
def _tool_error_style(theme: TuiTheme) -> str:
```

返回错误文字样式。浅色主题返回 `theme.role_styles["error"].border`,否则 `#ff4f4f on #000000`。

### _render_tool_chat_body

```python
def _render_tool_chat_body(item: ChatItem, *, body_style: str, accent_style: str | None, show_tool_results: bool, syntax_theme: str, theme: TuiTheme) -> RenderableType:
```

渲染工具聊天正文。先 `_render_tool_invocation(item.text, ...)` 得调用文本;若 `not show_tool_results or not item.tool_result_text` 返回该调用文本;否则再 `_render_chat_body(item.tool_result_text, role=item.role, ...)` 得结果体,返回 `Group(text, Text(""), result_body)`。

### _render_tool_invocation

```python
def _render_tool_invocation(text: str, *, body_style: str, accent_style: str | None) -> Text:
```

渲染工具调用文本。构造 `Text(style=body_style, ...)`;`accent = accent or body`;用 `_split_tool_invocation` 拆 prefix/name/remainder;依次 append prefix(body)、name(body)、remainder(accent)。(注意:此函数 name 用 body 色,而 `_render_transcript_tool_invocation` 中 name 用 accent 色。)

### _split_tool_invocation

```python
def _split_tool_invocation(text: str) -> tuple[str, str, str]:
```

拆分工具调用串。规则:
- 以 `"→ "` 开头:`rest = text[2:]`,`name, sep, remainder = rest.partition(" ")`,返回 `("→ ", name, sep+remainder 或 "")`。
- 以 `"$ "` 开头:返回 `("$", "", text[1:])`。
- 否则:`name, sep, remainder = text.partition(" ")`,返回 `("", name, sep+remainder 或 "")`。

### _visible_chat_text

```python
def _visible_chat_text(item: ChatItem, *, show_tool_results: bool, invocation: str | None = None) -> str:
```

返回可见聊天文本(按角色/标志组合)。逻辑:
- `branch_summary`:`show_tool_results and tool_result_text` 时返回 `**Branch Summary**\n\n{tool_result_text}`,否则 `item.text`。
- `compaction_summary`:类似返回 `**Compaction Summary**\n\n{...}` 或 `item.text`。
- 非 tool/skill:返回 `item.text`。
- tool/skill:基础文本 `invocation if tool and invocation else item.text`;若 `show_tool_results and tool_result_text` 返回 `{text}\n\n{tool_result_text}`;若 `update_text and not tool_result_text` 返回 `{text}\n\n… {update_text}`;否则 `text`。

### _render_chat_body

```python
def _render_chat_body(text: str, *, role: str, body_style: str, syntax_theme: str, theme: TuiTheme) -> RenderableType:
```

渲染聊天正文主体。步骤:
1. 先试 `_render_patch_body(text, ...)`,非 None 则返回(处理含 `\nPatch:\n` 的 diff)。
2. 若 `role in {"assistant", "thinking", "status"}`:若 `_has_unclosed_fence(text)` 返回纯文本 `_plain_text`;否则返回 `ThemedMarkdown(...)`(带主题 heading/inline_code/link/bullet/table/code_block 样式)。
3. 否则试 `_render_fenced_body(text, ...)`,非 None 返回。
4. 若文本含 ```` ``` ```` 或其余情况:返回 `_plain_text(text, body_style)`。

### _render_patch_body

```python
def _render_patch_body(text: str, *, body_style: str, syntax_theme: str, code_block_background: str) -> RenderableType | None:
```

渲染含 patch 的文本。若 `"\nPatch:\n"` 不在 text 返回 None;按该 marker 拆 `before_patch`/`patch`,若 patch 空白返回 None;返回 `Group(_plain_text(f"{before_patch}{marker.rstrip()}", body_style), Syntax(patch.rstrip("\n"), "diff", theme=syntax_theme, word_wrap=True, background_color=code_block_background))`。

### ThemedCodeBlock

### 类定义

`CodeBlock` 子类,Rich markdown 代码块,带 Tau 主题背景色。覆盖 `create` 工厂、自定义 `__init__`、`__rich_console__`。

#### create

```python
@classmethod
def create(cls, markdown: Markdown, token: Any) -> ThemedCodeBlock:
```

工厂方法:从 token 取 `node_info`,lexer 名取首词;从 markdown 取 `code_block_background`(缺省 `"default"`);返回 `cls(lexer_name or "text", markdown.code_theme, code_block_background)`。

#### __init__

```python
def __init__(self, lexer_name: str, theme: str, code_block_background: str) -> None:
```

调 `super().__init__(lexer_name, theme)`,存 `self.code_block_background`。

#### __rich_console__

```python
def __rich_console__(self, console: Console, options: Any) -> Any:
```

渲染代码块:`code = str(self.text).rstrip()`,用 `Syntax(code, self.lexer_name, theme=self.theme, word_wrap=True, padding=1, background_color=self.code_block_background)` yield。

### LeftAlignedMarkdownHeading

### 类定义

`Heading` 子类,所有标题级别左对齐。定义 `LEVEL_ALIGN` 类变量,`h1`–`h6` 全部为 `"left"`。

### ThemedMarkdown

### 类定义

`Markdown` 子类,Tau 柔和标题/强调色 markdown 渲染器。覆盖 `elements` 映射,把 `heading_open` 改为 `LeftAlignedMarkdownHeading`、`fence`/`code_block` 改为 `ThemedCodeBlock`。

#### __init__

```python
def __init__(self, markup: str, *, heading_style: str, inline_code_style: str, link_style: str, bullet_style: str, table_border_style: str, code_block_background: str, code_theme: str, inline_code_theme: str, style: str = "none") -> None:
```

调 `super().__init__(markup, style=style, code_theme=code_theme, inline_code_theme=inline_code_theme)`,并保存全部主题样式字段(heading/inline_code/link/bullet/table_border/code_block_background)。

#### __rich_console__

```python
def __rich_console__(self, console: Console, options: Any) -> Any:
```

在 `_markdown_theme(...)` 构造的 Rich 主题上下文下,`yield from super().__rich_console__(console, options)`。

### _markdown_highlight_style

```python
def _markdown_highlight_style(theme: TuiTheme) -> str:
```

返回 markdown 标题样式串 `theme.markdown_heading`。

### _markdown_inline_code_style

```python
def _markdown_inline_code_style(theme: TuiTheme) -> str:
```

返回内联代码样式串 `theme.markdown_inline_code`。

### _markdown_theme

```python
def _markdown_theme(heading_style, inline_code_style, link_style, bullet_style, table_border_style, code_block_background) -> Theme:
```

构造 Rich `Theme`。把各样式 `Style.parse` 解析,组装映射:所有 `markdown.h1`–`h6` 为 `highlight + bold`,`markdown.item.bullet/number` 为 bullet,`markdown.block_quote` 为 highlight,`markdown.link/link_url` 为 link,`markdown.table.header` 为 `highlight+bold`,`markdown.table.border` 为 table_border,`markdown.code` 为 inline_code,`markdown.code_block` 为 `Style(bgcolor=code_block_background)`。

### _render_fenced_body

```python
def _render_fenced_body(text: str, *, body_style: str, syntax_theme: str, code_block_background: str) -> RenderableType | None:
```

渲染带围栏代码块的文本。若 ```` ``` ```` 不在 text 返回 None。循环解析:
1. 找下一个 ```` ``` ````;若无,把剩余 `_append_plain` 后跳出。
2. 检查 ```` ``` ```` 是否位于行首(否则返回 None 表示无法解析)。
3. 找到 fence 行尾、闭合 ```` \n``` ````;缺失则返回 None。
4. `_append_plain(text[cursor:fence_start])`;`language = _syntax_language(text[fence_start+3:fence_line_end])`;代码 `text[fence_line_end+1:closing_start]`;append `Syntax(code.rstrip("\n"), language, theme=syntax_theme, word_wrap=True, background_color=code_block_background)`。
5. cursor 推进到闭合行尾或结尾。
最后 `Group(*renderables)`(空则 None)。

### _append_plain

```python
def _append_plain(renderables: list[RenderableType], text: str, *, body_style: str) -> None:
```

把纯文本追加到 renderable 列表。若 text 非空,append `_plain_text(text.rstrip("\n"), body_style=body_style)`。

### _plain_text

```python
def _plain_text(text: str, *, body_style: str) -> Text:
```

返回带样式的纯文本 `Text(text, style=body_style, overflow="fold", no_wrap=False)`。

### _context_usage

```python
def _context_usage(session: SessionSummarySource) -> str:
```

返回上下文用量串。若 `threshold is None or <= 0`:返回 `{compact(context_token_estimate)}/{compact(context_window_tokens)} context`;否则 `{compact(context_token_estimate)}/{compact(threshold)} context`。

### _compact_token_count

```python
def _compact_token_count(value: int) -> str:
```

把 token 数压成紧凑串:`<=0` 返回 `"0k"`,`<1000` 返回 `"<1k"`,否则返回 `{(value+500)//1000}k`(四舍五入取千)。

### _context_file_labels

```python
def _context_file_labels(context_files: Sequence[ProjectContextFile], *, cwd: Path) -> list[str]:
```

返回每个上下文文件的相对标签列表,逐个调 `_context_file_label(Path(context_file.path), cwd=cwd)`。

### _context_file_label

```python
def _context_file_label(path: Path, *, cwd: Path) -> str:
```

返回相对 cwd 的标签。先 `expanduser()`;非绝对则 `cwd / expanded`;尝试 `resolve().relative_to(cwd.expanduser().resolve())`;出错(`OSError/ValueError`)则返回 `_short_path(expanded)`。

### _thinking_level

```python
def _thinking_level(session: SessionSummarySource) -> str:
```

返回思考级别显示串。若有 `available_thinking_levels == ()` 返回 `"unavailable"`;否则 `explicit_level`(即 `session.thinking_level`)非空返回其字符串;再尝试 `session.state.thinking_level`,非空返回其字符串;否则返回 `"--"`。

### _git_branch

```python
def _git_branch(cwd: Path) -> str:
```

返回当前 git 分支名。尝试 `git -C cwd branch --show-current`(超时 0.5s、`capture_output`、`check=False`);`OSError`/`TimeoutExpired` 或空输出均返回 `"--"`。

### _has_unclosed_fence

```python
def _has_unclosed_fence(text: str) -> bool:
```

判断是否存在未闭合围栏。统计 `splitlines()` 中以 ```` ``` ```` 开头的行数,返回 `count % 2 == 1`。

### _fence_language

```python
def _fence_language(raw: str) -> str:
```

从围栏信息串取语言名。`raw.strip()` 后取 `split(maxsplit=1)[0]`,空则返回 `"text"`。

### _syntax_language

```python
def _syntax_language(raw: str) -> str:
```

规范化语法名。先 `_fence_language(raw)`,若 `"text"` 直接返回;`get_lexer_by_name` 若 `ClassNotFound` 返回 `"text"`,否则返回语言名。

### render_completion_suggestions

```python
def render_completion_suggestions(state: CompletionState, *, theme: TuiTheme = TAU_DARK_THEME) -> RenderableType:
```

渲染 prompt 补全建议(对齐的命令/描述双列)。建 `Table.grid(expand=True)`,两列(第一列 `no_wrap`,第二列 `ratio=1`)。遍历 `state.items`:
1. 当 `item.category != previous_category`:若已有行则加空行分隔;若 category 非空加一行分类标题(`theme.completion_description`);更新 `previous_category`。
2. `selected = index == state.selected_index`;前缀 `"› "`(选中)或 `"  "`;`style` 用 `completion_selected`/`prompt_text`,描述用 `completion_selected_description`/`completion_description`。
3. `command = Text(prefix, style); command.append(item.display, style); command.append("  ", style)`;加一行 `(command, Text(description, description_style))`。
返回 table。

### _bullet_list

```python
def _bullet_list(items: Sequence[str], *, empty: str, theme: TuiTheme) -> Text:
```

渲染项目符号列表。空时 `Text(empty, style=theme.completion_description)`;否则逐条 append `"• "`(`completion_description`)+ 条目(`prompt_text`),项间换行。

### _short_path

```python
def _short_path(path: Path) -> str:
```

返回相对 home 的简短路径。`Path.home()` 后尝试 `f"~/{path.relative_to(home)}`;`ValueError`(不在 home 内)则返回 `str(path)`。

---

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
