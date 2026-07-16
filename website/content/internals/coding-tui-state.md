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

> Design note: the state module is pure data + formatting, with no Textual
> imports. This is deliberate, not incidental — it keeps the model independent of
> any UI framework so it can be unit-tested and reused from any frontend. The
> boundary also enforces Tau's layering rule that the portable core must not
> depend on Textual or Rich: `state.py` describes *what to display*, and only
> `app.py` knows about the widget layer. Because the view is a read-only
> projection of this model (see the widgets page), re-rendering on every event
> never duplicates formatting logic. This mirrors the Tau README design
> principles — "The core stays portable" and "Events are the contract": the
> event stream mutates `TuiState`, and views consume that state rather than the
> events directly.

---

## `tui/adapter.py` — events → state

`TuiEventAdapter` is the sole boundary that maps `AgentEvent`s onto `TuiState`.
Its `apply(event)` is a single `isinstance` dispatch over the event hierarchy:

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
only `app.py` knows about Textual. The adapter is the single boundary that maps
`tau_agent`'s portable `AgentEvent` stream onto `TuiState`, so the event→state
translation is fully decoupled from any rendering concern ("Small layers beat
magic" — the adapter does one job and does it behind a narrow interface).

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

## 逐方法深度剖析（state / adapter / config / autocomplete）

> 以下为 `tui/state.py`、`tui/adapter.py`、`tui/config.py`、`tui/autocomplete.py` 各顶层定义的逐方法展开，是对上方概述的细化补充。

## 文件:state.py

本文件定义 Tau 文本 TUI 的**展示状态模型**——即 `TranscriptView` 等 widget 只读投影所依赖的数据源。它不含任何 Textual 依赖，只描述"当前要显示什么"。

### ChatItemRole

```python
ChatItemRole = Literal["user", "assistant", "tool", "error", "status", "thinking", "skill", "branch_summary", "compaction_summary", "custom"]
```

- 作用:类型别名,枚举 transcript 中一条 `ChatItem` 可能扮演的角色。
- 取值含义:
  - `user`:用户消息(含技能附加指令、分支/压缩摘要的回退)。
  - `assistant`:助手文本块。
  - `tool`:工具调用/结果行。
  - `error`:错误行。
  - `status`:状态提示(如重试、取消)。
  - `thinking`:思考/推理碎片。
  - `skill`:技能加载或使用提示。
  - `branch_summary` / `compaction_summary`:分支回退 / 上下文压缩摘要(可展开)。
  - `custom`:交由注册的自定义 renderer 渲染的消息。

### 模块级常量

```python
TOOL_RESULT_PREVIEW_LINES = 8
```
- 工具结果文本块在 transcript 中最多预览的行数,超出则截断并提示"hidden from the TUI"。

```python
TOOL_PATCH_PREVIEW_LINES = 32
```
- 工具结果中 `edit` 的 patch 文本最多预览行数。

```python
TOOL_RESULT_PREVIEW_CHARS = 2_000
```
- 单条预览文本按字符计的上限;超过则截断并在提示中追加 "additional text"。

```python
TERMINAL_COMMAND_OUTPUT_PREVIEW_LINES = 120
```
- 输入框 shell 命令 (`!`/`!!`) 结果输出最多预览行数。

```python
TOOL_SPINNER_FRAMES = ("⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏")
```
- 工具执行中用于旋转的 10 帧 braille 字符序列,由 `resolve_tool_invocation` / `apply_tool_spinner` 使用。

```python
_INVOCATION_MARKERS = ("→ ", "▸ ")
```
- 工具调用静态前缀标记;当 `tool_spinner` 存在且工具仍在执行时,这些前缀会被替换为当前旋转帧。

```python
TOOL_TIMER_MIN_SECONDS = 1.0
```
- 工具执行计时器阈值:仅在耗时超过 1 秒时才在工具行追加 `(Xs)` 实时计时,避免瞬时读写闪烁 `(0s)`。

### ChatItem

```python
@dataclass(slots=True)
class ChatItem:
    role: ChatItemRole
    text: str
    tool_call_id: str | None = None
    tool_result_text: str | None = None
    tool_result: AgentToolResult | None = None
    update_text: str | None = None
    tool_name: str | None = None
    tool_arguments: dict[str, JSONValue] | None = None
    started_at: float | None = None
    always_show_tool_result: bool = False
    custom_type: str | None = None
    details: dict[str, JSONValue] | None = None
```

- 作用:transcript 中一个可渲染条目。`slots=True` 节省内存。
- 字段:
  - `role`:条目角色(见 `ChatItemRole`)。
  - `text`:主文本(对用户/助手是正文;对工具是格式化后的调用块,如 `→ read path`;对 custom 是原始回退文本)。
  - `tool_call_id`:关联的 `ToolCall.id`,用于增量更新工具行(结果/进度绑定到同一调用)。
  - `tool_result_text`:格式化后的结果块(由 `format_tool_result_block` 生成)。
  - `tool_result`:原始 `AgentToolResult` 对象,保留以便 render 时调用工具自身的 `render_result` 懒渲染。
  - `update_text`:工具执行中附加的实时进度消息。
  - `tool_name` / `tool_arguments`:工具名与参数字典,用于懒渲染调用块(`resolve_tool_invocation`)。
  - `started_at`:`time.monotonic()` 时间戳,用于执行计时。
  - `always_show_tool_result`:是否为始终展开结果的工具(覆盖全局 `show_tool_results` 开关)。
  - `custom_type`:自定义消息类型,交给 `custom_renderer` 处理。
  - `details`:自定义/扩展用的附加字典。

### TuiState

```python
@dataclass(slots=True)
class TuiState:
    items: list[ChatItem] = field(default_factory=list)
    assistant_buffer: str = ""
    running: bool = False
    error: str | None = None
    show_tool_results: bool = False
    show_thinking: bool = False
    queued_steering: tuple[str, ...] = ()
    queued_follow_up: tuple[str, ...] = ()
    skills: tuple[Skill, ...] = ()
    custom_renderer: CustomMessageMarkup | None = None
    tool_call_renderer: ToolCallMarkup | None = None
    tool_result_renderer: ToolResultMarkup | None = None
    tool_spinner: str | None = None
```

- 作用:交互式 TUI 的可变展示状态,是 render 的唯一数据源(对应 widgets 页"state 拥有模型、render 只读"的设计)。
- 字段:
  - `items`:所有 transcript 条目。
  - `assistant_buffer`:assistant 文本尚未成块前的增量缓冲(由 `MessageDeltaEvent` 累积)。
  - `running`:是否正在运行 agent 循环(控制 spinner / 输入锁定)。
  - `error`:当前不可恢复错误信息。
  - `show_tool_results`:是否展开工具结果。
  - `show_thinking`:是否显示思考 token。
  - `queued_steering` / `queued_follow_up`:待处理的转向/后续追问消息元组。
  - `skills`:已加载技能元数据(用于把 `read <skill-path>` 识别为技能调用)。
  - `custom_renderer` / `tool_call_renderer` / `tool_result_renderer`:扩展注册的懒渲染回调。
  - `tool_spinner`:当前旋转帧字符串(由 render 循环每帧写入),驱动执行中工具行的动画。

#### method: add_item

```python
def add_item(self, role, text, *, tool_call_id=None, tool_result_text=None, always_show_tool_result=False, custom_type=None, details=None) -> None
```

- 作用:向 `items` 追加一条 transcript 条目。
- 步骤:直接用给定关键字参数构造 `ChatItem` 并 `append`。

#### method: resolve_custom_markup

```python
def resolve_custom_markup(self, item: ChatItem, *, expanded: bool) -> str | None
```

- 作用:对 `custom` 条目调用注册 renderer 生成标记文本;否则返回 `None` 让调用方回退到 `item.text`。
- 分支:若 `role != "custom"` 或 `custom_type is None` 或 `custom_renderer is None` 返回 `None`;否则返回 `self.custom_renderer(custom_type, text, details, expanded)`。

#### method: resolve_tool_invocation

```python
def resolve_tool_invocation(self, item: ChatItem) -> str | None
```

- 作用:懒渲染工具调用行(若安装了 `tool_call_renderer`);并在工具执行中时用 `tool_spinner` 帧替换静态前缀、追加实时计时。
- 步骤:
  1. 非 `tool` 角色返回 `None`。
  2. 若 `tool_name` 与 `tool_call_renderer` 都存在,先算 `line = tool_call_renderer(...)`;否则 `line` 保持 `None`。
  3. 若 `tool_spinner` 设置且 `tool_result_text is None`(仍在执行):用 `apply_tool_spinner` 把前缀替换为旋转帧(基于 `line` 或回退 `item.text`);若 `started_at` 存在且耗时 ≥ `TOOL_TIMER_MIN_SECONDS`,追加 `(format_elapsed(elapsed))`。
  4. 否则(已完成)返回步骤 2 的 `line`(`None` 表示回退到 `item.text`)。

#### method: resolve_tool_result

```python
def resolve_tool_result(self, item: ChatItem, *, expanded: bool) -> str | None
```

- 作用:懒渲染工具结果(调用工具自身 `render_result`);否则 `None` 回退到通用结果块。
- 分支:仅当 `role == "tool"` 且 `tool_result is not None` 且 `tool_result_renderer is not None` 时返回渲染结果,否则 `None`。

#### method: add_tool_call

```python
def add_tool_call(self, tool_call: ToolCall) -> None
```

- 作用:追加一个折叠的工具调用条目。
- 步骤:
  1. 调 `_read_skill_name(tool_call)`;若命中已加载技能,以 `skill` 角色追加 `Loading skill: <name>` 并返回。
  2. 否则追加 `tool` 角色 `ChatItem`,`text=format_tool_call_block(tool_call)`,记录 `tool_name`/`tool_arguments`,`started_at=time.monotonic()`。

#### method: add_user_message

```python
def add_user_message(self, content, *, custom_type=None, details=None) -> None
```

- 作用:追加用户消息,并对技能 / 分支摘要 / 压缩摘要做特殊折叠。
- 分支:
  1. `custom_type` 非空 → 追加 `custom` 条目(原始 `content` 作为回退)。
  2. `_parse_branch_summary_message(content)` 命中 → 追加 `branch_summary`,`tool_result_text` 为摘要正文(可展开)。
  3. `_parse_compaction_summary_message(content)` 命中 → 追加 `compaction_summary`,同上。
  4. `parse_skill_invocation(content)` 命中 → 追加 `skill`(`Using skill: name`);若含附加指令,再追加 `user` 条目。
  5. 否则普通 `user` 条目。

#### method: add_thinking_delta

```python
def add_thinking_delta(self, delta: str) -> None
```

- 作用:把思考碎片追加到当前思考块(连续增量拼接到同一条目)。
- 步骤:若 `items` 非空且最后一条是 `thinking`,则 `text += delta`;否则新建 `thinking` 条目。

#### method: find_tool_item

```python
def find_tool_item(self, tool_call_id: str) -> ChatItem | None
```

- 作用:从后向前查找匹配 `tool_call_id` 的工具/技能条目。
- 步骤:倒序遍历 `items`,返回第一个 `role in {"tool","skill"}` 且 `tool_call_id` 相等的条目,否则 `None`。

#### method: record_tool_update

```python
def record_tool_update(self, tool_call_id: str, message: str) -> ChatItem | None
```

- 作用:把实时进度挂到待定工具调用;孤儿更新(无匹配或已完成)丢弃。
- 步骤:`find_tool_item`;若 `None` 或已 `tool_result_text` 已存在则返回 `None`;否则写 `item.update_text = message` 并返回该条目。

#### method: record_tool_result

```python
def record_tool_result(self, result: AgentToolResult) -> None
```

- 作用:把工具结果绑定到对应调用,若无匹配则以孤儿结果追加。
- 步骤:
  1. `format_tool_result_block(...)` 生成 `result_text`。
  2. 倒序查 `tool`/`skill` 条目且 `tool_call_id == result.tool_call_id`:命中则写 `tool_result_text`/`tool_result`、清空 `update_text` 并返回。
  3. 未命中:追加 `tool` 条目,`text=format_tool_result_summary(name, ok)`,并带 `tool_result_text`/`tool_result`。

#### method: toggle_tool_results

```python
def toggle_tool_results(self) -> bool
```

- 作用:切换工具结果展开开关,返回新状态。

#### method: toggle_thinking

```python
def toggle_thinking(self) -> bool
```

- 作用:切换思考 token 显示开关,返回新状态。

#### method: update_queue

```python
def update_queue(self, *, steering, follow_up) -> None
```

- 作用:整体替换可见的排队消息状态。

#### property: queued_message_count

```python
@property
def queued_message_count(self) -> int
```

- 作用:返回待处理排队消息总数(`steering` + `follow_up` 长度)。

#### method: clear

```python
def clear(self) -> None
```

- 作用:清空可见 transcript(不触碰持久会话历史):`items.clear()`、`assistant_buffer=""`、`error=None`。

#### method: set_skills

```python
def set_skills(self, skills: Iterable[Skill]) -> None
```

- 作用:用已加载技能元数据替换 `skills`,供纯展示路径匹配(识别 `read <skill>`)。

#### method: load_messages

```python
def load_messages(self, messages: Iterable[AgentMessage]) -> None
```

- 作用:从恢复的会话消息重建 transcript。
- 分支:
  - `user` → `add_user_message`(带 `custom_type`/`details`)。
  - `assistant` → 有 `content` 则 `add_item("assistant", ...)`;逐个 `tool_call` → `add_tool_call`。
  - `tool` → 用消息字段构造 `AgentToolResult` 调 `record_tool_result`。

#### method: _read_skill_name

```python
def _read_skill_name(self, tool_call: ToolCall) -> str | None
```

- 作用:若工具调用是 `read` 且路径命中某已加载技能,返回技能名,否则 `None`。
- 步骤:仅 `name == "read"`;用 `_string_argument` 取 `path`;`_normalized_path` 与每个 `skill.path` 比较。

### 模块级辅助函数

#### function: _parse_branch_summary_message

```python
def _parse_branch_summary_message(content: str) -> str | None
```

- 作用:识别并抽取"分支回退摘要"正文。
- 步骤:若 `content` 以固定前缀开头、以 `<summary>` 后缀结尾,返回去前缀后缀后的正文;否则 `None`。

#### function: _parse_compaction_summary_message

```python
def _parse_compaction_summary_message(content: str) -> str | None
```

- 作用:识别"上下文压缩摘要"。
- 步骤:以 `"Previous conversation summary:\n"` 为前缀则去前缀返回,否则 `None`。

#### function: format_elapsed

```python
def format_elapsed(seconds: float) -> str
```

- 作用:把秒数格式化为紧凑时长(`23s` / `1m 23s` / `1h 2m`)。
- 步骤:取整后按 <60 / <3600 / 否则分三段。

#### function: apply_tool_spinner

```python
def apply_tool_spinner(text: str, frame: str) -> str
```

- 作用:用旋转帧替换静态调用前缀。
- 步骤:遍历 `_INVOCATION_MARKERS`,若 `text` 以某标记开头则替换为 `f"{frame} {去前缀}"`;否则返回 `f"{frame} {text}"`。

#### function: format_tool_call_block

```python
def format_tool_call_block(tool_call: ToolCall) -> str
```

- 作用:生成折叠的工具调用行。
- 步骤:`bash` 直接返回调用串;否则返回 `→ {invocation}`。

#### function: format_tool_call_invocation

```python
def format_tool_call_invocation(tool_call: ToolCall) -> str
```

- 作用:把工具调用格式化为简洁可读串。
- 分支:
  - `read` → `read {path}{行后缀}`。
  - `edit`/`write` → `{op} {path}`。
  - `bash` → `$ {command} (timeout Xs)`(若含 timeout)。
  - 其他 → `_fallback_tool_call_invocation`。

#### function: _read_line_suffix

```python
def _read_line_suffix(arguments: dict[str, JSONValue]) -> str
```

- 作用:为 `read` 生成行范围后缀(如 `:1-50` / `:1-`)。
- 步骤:用 `_int_argument` 取 `offset`/`limit`,换算为 `start = max(1, offset)` 及区间。

#### constant: FALLBACK_INVOCATION_ARGS_CHARS

```python
FALLBACK_INVOCATION_ARGS_CHARS = 160
```

- 未知工具调用参数渲染的字符上限,超出截断加 `…`。

#### function: _fallback_tool_call_invocation

```python
def _fallback_tool_call_invocation(tool_call: ToolCall) -> str
```

- 作用:通用工具的回退文案。
- 步骤:有参数则 `str(args)`(超 160 字符截断加 `…`)追加到工具名;无参仅工具名。

#### function: _string_argument

```python
def _string_argument(arguments, key) -> str | None
```

- 作用:安全取字符串型参数值,非 `str` 返回 `None`。

#### function: _normalized_path

```python
def _normalized_path(path) -> Path
```

- 作用:`expanduser().resolve(strict=False)` 规范化路径。

#### function: _int_argument

```python
def _int_argument(arguments, key) -> int | None
```

- 作用:取整数参数(排除 `bool`),否则 `None`。

#### function: _number_argument

```python
def _number_argument(arguments, key) -> int | float | None
```

- 作用:取数值参数(排除 `bool`),否则 `None`。

#### function: format_tool_result_summary

```python
def format_tool_result_summary(*, name, ok) -> str
```

- 作用:孤儿结果的极简行(`✓ name` / `✗ name`)。

#### function: format_tool_result_block

```python
def format_tool_result_block(*, name, ok, content, data=None) -> str
```

- 作用:生成完整结果块(状态行 + 内容预览 + 可选 patch 预览)。
- 步骤:
  1. 状态行 `{✓|✗} {name}`。
  2. 有 `content` 追加 `_preview_text(content, TOOL_RESULT_PREVIEW_LINES)`。
  3. `_result_patch` 取出 edit patch,有则追加 `Patch:` 段(按 `TOOL_PATCH_PREVIEW_LINES` 预览)。

#### function: format_terminal_command_result_block

```python
def format_terminal_command_result_block(*, ok, added_to_context, output) -> str
```

- 作用:格式化输入框 shell 命令结果(用于可见 TUI 显示)。
- 步骤:状态行 + 是否"added to context"后缀;有 `output` 按 `TERMINAL_COMMAND_OUTPUT_PREVIEW_LINES` 预览。

#### function: _result_patch

```python
def _result_patch(*, name, ok, data) -> str | None
```

- 作用:仅当 `edit` 成功且 `data["patch"]` 为非空字符串时返回 patch,否则 `None`。

#### function: _preview_text

```python
def _preview_text(text: str, *, max_lines: int) -> str
```

- 作用:按行数 + 字符数双重截断生成预览,并附"隐藏提示"。
- 步骤:
  1. 无换行则按 `TOOL_RESULT_PREVIEW_CHARS` 切。
  2. 取前 `max_lines` 行;计算 `hidden_lines`。
  3. 超过字符上限则截断并标 `truncated_by_chars`。
  4. 有隐藏则追加 `[Preview only: ... hidden from the TUI.]`。

---

## 文件:adapter.py

本文件是 **agent 事件 → TuiState 投影**的适配器边界:它把 `tau_agent` 发出的可移植事件流增量地翻译成 `TuiState.items` 的增删改,使下游 widget 能纯投影渲染(呼应"state 拥有模型、render 只读")。

### class: TuiEventAdapter

```python
class TuiEventAdapter:
    def __init__(self, state: TuiState) -> None:
        self.state = state
```

#### method: __init__

```python
def __init__(self, state: TuiState) -> None
```

- 作用:持有目标 `TuiState` 实例;所有事件应用都直接修改该共享状态。

#### method: apply

```python
def apply(self, event: AgentEvent) -> None
```

- 作用:事件主分发器,按事件类型调用对应处理(全部为 `isinstance` 分支,逐个返回)。
- 分支映射:
  - `AgentStartEvent` → `state.running=True`、`error=None`。
  - `AgentEndEvent` → `_flush_assistant_buffer()` 后 `running=False`。
  - `MessageStartEvent` → 若 `message_role == "assistant"` 清空 `assistant_buffer`。
  - `MessageDeltaEvent` → `assistant_buffer += delta`(累积增量)。
  - `ThinkingDeltaEvent` → `add_thinking_delta(delta)`。
  - `QueueUpdateEvent` → `update_queue(steering=…, follow_up=…)`。
  - `MessageEndEvent` → 见下:
    - `role == "user"` → `add_user_message(...)`。
    - `role == "tool"` → 直接返回(工具结果由 `ToolExecutionEndEvent` 单独处理)。
    - 否则 → `text = message.content or assistant_buffer`;非空则 `add_item("assistant", text)`,清空 `assistant_buffer`。
  - `ToolExecutionStartEvent` → `_flush_assistant_buffer()` 后 `add_tool_call(event.tool_call)`。
  - `ToolExecutionUpdateEvent` → `record_tool_update(tool_call_id, message)`。
  - `RetryEvent` → `add_item("status", f"… {message}")`。
  - `ToolExecutionEndEvent` → `record_tool_result(event.result)`。
  - `ErrorEvent` → `_flush_assistant_buffer()`;若 `recoverable and message=="Agent run cancelled"` → 添加 `status` 行;否则设 `error` 并 `add_item("error", …)`,不可恢复时 `running=False`。

#### method: _flush_assistant_buffer

```python
def _flush_assistant_buffer(self) -> None
```

- 作用:把尚未成块的 assistant 增量缓冲落盘为一条 transcript 条目,并清空缓冲。
- 使用位置:在 tool 开始、agent 结束、错误发生前调用,确保零散 delta 先成块。

### 串联说明(adapter → TuiState → render)

`CodingSession` 驱动 `tau_agent` 的事件循环,每个 `AgentEvent` 经 `TuiEventAdapter.apply` 增量修改同一份 `TuiState`:文本 delta 进 `assistant_buffer`,工具以 `add_tool_call` 占位、`record_tool_update` 追加进度、`record_tool_result` 收口,思考碎片进 `thinking` 条目,用户/工具消息经 `add_user_message`/`record_tool_result` 落地。下游 `TranscriptView` 仅需 `for item in state.items` 纯投影渲染,通过 `resolve_*` 懒调用注册的 renderer,完全不持有逻辑——这正是 widgets 页"state 拥有模型、render 只读"约定的落地。

---

## 文件:config.py

本文件负责 Textual TUI 的**持久化配置**(键位、主题、外观),从 `~/.tau/tui.json` 读写并做校验合并。不依赖 Textual,只产出纯数据。

### class: TuiConfigError

```python
class TuiConfigError(ValueError):
    """Raised when Tau TUI configuration is invalid."""
```

- 作用:配置非法时抛出的异常类型(继承自 `ValueError`)。

### class: TuiKeybindings

```python
@dataclass(frozen=True, slots=True)
class TuiKeybindings:
    cancel: str = "escape"
    command_palette: str = "ctrl+k"
    session_picker: str = "ctrl+r"
    queue_follow_up: str = "alt+enter"
    accept_completion: str = "tab"
    completion_next: str = "down"
    completion_previous: str = "up"
    thinking_cycle: str = "shift+tab"
    model_cycle: str = "ctrl+p"
    toggle_thinking: str = "ctrl+t"
    toggle_tool_results: str = "ctrl+o"
    copy_message: str = "ctrl+c"
    quit: str = "ctrl+d"
```

- 作用:可配置键位的不可变集合(`frozen`,`slots`)。
- 字段:每个字段即一个动作对应的 Textual 按键串,默认值见上。

#### method: to_json

```python
def to_json(self) -> dict[str, str]
```

- 作用:序列化为 JSON 字典(键名即各字段名,值即按键串)。

### type: TuiThemeName

```python
type TuiThemeName = Literal["tau-dark", "tau-light", "high-contrast"]
```

- 作用:内置主题名字面量别名。

### class: TuiRoleStyle

```python
@dataclass(frozen=True, slots=True)
class TuiRoleStyle:
    border: str
    body: str
```

- 作用:单一 transcript 角色块的颜色(边框 + 正文)。

### class: TuiTheme

```python
@dataclass(frozen=True, slots=True)
class TuiTheme:
    name: TuiThemeName
    screen_background, screen_text, chrome_background, chrome_text, muted_text,
    sidebar_background, border, transcript_background, prompt_background, prompt_text,
    prompt_border, autocomplete_background, accent, highlight_background, highlight_text,
    markdown_heading, markdown_table_header, markdown_table_border, markdown_inline_code,
    markdown_code_block_background, markdown_link, markdown_bullet,
    completion_selected, completion_selected_description, completion_description,
    syntax_theme: str
    role_styles: dict[str, TuiRoleStyle]
```

- 作用:解析后的完整主题(不可变)。
- 字段:全局色(屏幕/侧栏/提示框/自动补全/语法主题等)、markdown 各元素色、补全选中/描述色,以及按角色名映射的 `role_styles`。

### 常量主题实例

#### constant: TAU_DARK_THEME

- 作用:暗色主题(默认),定义全部颜色字段与 `role_styles`(user/assistant/tool/error/status/thinking/skill/custom/branch_summary/compaction_summary)。

#### constant: HIGH_CONTRAST_THEME

- 作用:高对比主题,绿色强调、更亮边框与纯黑背景。

#### constant: TAU_LIGHT_THEME

- 作用:亮色主题,浅灰背景、`ansi_light` 语法主题。

#### constant: _THEMES

```python
_THEMES: dict[TuiThemeName, TuiTheme] = { ... }
```

- 作用:主题名 → 主题实例的查找表。

#### constant: BUILTIN_TUI_THEME_NAMES

```python
BUILTIN_TUI_THEME_NAMES: tuple[TuiThemeName, ...] = tuple(_THEMES)
```

- 作用:可用主题名元组(供补全/校验)。

### function: get_tui_theme

```python
def get_tui_theme(name: TuiThemeName = "tau-dark") -> TuiTheme
```

- 作用:按名返回内置主题(直接查 `_THEMES`)。

### class: TuiSettings

```python
@dataclass(frozen=True, slots=True)
class TuiSettings:
    keybindings: TuiKeybindings = field(default_factory=TuiKeybindings)
    theme: TuiThemeName = "tau-dark"
    auto_copy_selection: bool = False
    sidebar_position: Literal["left", "right", "off"] = "left"
```

- 作用:从 Tau home 加载的 TUI 设置(不可变)。
- 字段:`keybindings`、`theme`(主题名)、`auto_copy_selection`(选中自动复制)、`sidebar_position`(侧栏位置)。

#### method: to_json

```python
def to_json(self) -> dict[str, Any]
```

- 作用:序列化为 JSON(含 `keybindings.to_json()`)。

#### property: resolved_theme

```python
@property
def resolved_theme(self) -> TuiTheme
```

- 作用:返回所选内置主题实例(`get_tui_theme(self.theme)`)。

### function: tui_settings_path

```python
def tui_settings_path(paths: TauPaths | None = None) -> Path
```

- 作用:返回持久化设置路径 `paths.home / "tui.json"`。

### function: load_tui_settings

```python
def load_tui_settings(paths: TauPaths | None = None) -> TuiSettings
```

- 作用:加载设置,文件缺失则回退默认 `TuiSettings()`。
- 步骤:算路径;不存在返回默认;存在则 `loads` 文本,非 dict 抛 `TuiConfigError`;否则交 `tui_settings_from_json`。

### function: save_tui_settings

```python
def save_tui_settings(settings: TuiSettings, paths: TauPaths | None = None) -> Path
```

- 作用:持久化设置并返写路径。
- 步骤:确保父目录存在;以 `indent=2` 写 JSON + 换行。

### function: tui_settings_from_json

```python
def tui_settings_from_json(data: dict[str, Any]) -> TuiSettings
```

- 作用:核心解析/校验/合并入口。
- 步骤:
  1. `allowed_fields` 校验未知字段 → 抛错。
  2. `keybindings` 须为 dict。
  3. `sidebar_position` 须为 `left/right/off`。
  4. 组装 `TuiSettings`:`keybindings=_keybindings_from_json(...)`、`theme=_theme_name(...)`、`auto_copy_selection=_bool_setting(...)`。

### function: _bool_setting

```python
def _bool_setting(value: object, field_name: str) -> bool
```

- 作用:强制字段为 `bool`,否则抛 `TuiConfigError`。

### function: _keybindings_from_json

```python
def _keybindings_from_json(data: dict[str, Any]) -> TuiKeybindings
```

- 作用:解析并校验键位(合并默认值)。
- 步骤:
  1. 允许字段 = 默认键位字段;`legacy_fields = {"message_previous","message_next"}`(兼容旧名,忽略不报错)。
  2. 未知字段(非默认非遗留)→ 抛错。
  3. 每个字段取用户值或默认,经 `_key_string` 校验。
  4. `_reject_duplicate_keys` 查重,最后构造 `TuiKeybindings`。

### function: _key_string

```python
def _key_string(value: object, field_name: str) -> str
```

- 作用:校验键位为非空字符串(去空白后),否则抛错。

### function: _theme_name

```python
def _theme_name(value: object) -> TuiThemeName
```

- 作用:校验主题为三大内置名之一,否则抛 `TuiConfigError`。

### function: _reject_duplicate_keys

```python
def _reject_duplicate_keys(values: dict[str, str]) -> None
```

- 作用:确保同一按键未被两个动作复用;冲突即抛错。

---

## 文件:autocomplete.py

本文件提供输入框**提示符自动补全**逻辑:根据当前文本、命令注册表、技能、模板及各类名称生成 `CompletionState`,供 TUI 补全 widget 投影展示。纯函数式,无 Textual 依赖。

### 常量

```python
IGNORED_FILE_COMPLETION_DIRS = frozenset({".git",".hg",".mypy_cache",".pytest_cache",".ruff_cache",".tau",".tox",".venv","__pycache__","build","dist","node_modules"})
```
- 补全文件遍历时忽略的目录名集合。

```python
MAX_FILE_COMPLETIONS = 50
```
- 单次文件补全最多返回条目数。

### class: CompletionOption

```python
@dataclass(frozen=True, slots=True)
class CompletionOption:
    value: str
    description: str | None = None
```

- 作用:一个参数候选值(带可选描述),用于命令参数补全。

### class: CompletionItem

```python
@dataclass(frozen=True, slots=True)
class CompletionItem:
    display: str
    replacement: str
    start: int
    end: int
    description: str | None = None
    category: str | None = None
```

- 作用:一个可选项(展示 + 替换区间)。
- 字段:`display`(展示文本)、`replacement`(替换文本)、`start`/`end`(替换区间索引)、`description`、`category`(如 "Commands"/"Custom prompts")。

#### method: apply

```python
def apply(self, text: str) -> str
```

- 作用:把当前补全应用到输入文本:`text[:start] + replacement + text[end:]`。

### class: CompletionState

```python
@dataclass(frozen=True, slots=True)
class CompletionState:
    items: tuple[CompletionItem, ...] = ()
    selected_index: int = 0
```

- 作用:当前补全状态(候选集 + 选中位置)。

#### property: selected

```python
@property
def selected(self) -> CompletionItem | None
```

- 作用:返回当前选中项(空列表返回 `None`)。

#### method: select_next

```python
def select_next(self) -> CompletionState
```

- 作用:返回下移一位的副本(环形取模),空则自返。

#### method: select_previous

```python
def select_previous(self) -> CompletionState
```

- 作用:返回上移一位的副本(环形取模),空则自返。

### function: build_completion_state

```python
def build_completion_state(text, *, command_registry, skills, prompt_templates, model_names=(), provider_names=(), thinking_levels=(), theme_names=(), session_ids=(), session_options=(), cwd=None) -> CompletionState
```

- 作用:总入口,按输入形态分派到不同补全来源。
- 触发条件与分支:
  1. 非 `/` 开头或 `//` 开头:
     - 有 `cwd`:先试 `_shell_path_completions`(shell 命令路径),命中返回;否则返回 `_file_reference_completions`。
     - 无 `cwd`:返回空。
  2. 取首个 token(`_first_token_end`),`has_argument_text = token_end < len(text)`。
  3. token 为 `/skill:` 且已有参数匹配技能 → 空(不再补);否则补 `_skill_completions`。
  4. token 含 `:`(其他带参未知命令)→ 空。
  5. 试 `_command_argument_completions`(model/login/resume/theme 等命令参数)命中即返回。
  6. 有参数文本且匹配到模板/注册命令 → 空(参数由专门逻辑处理)。
  7. 否则返回命令级 `_command_completions`。

### function: _file_reference_completions

```python
def _file_reference_completions(*, text, cwd) -> tuple[CompletionItem, ...]
```

- 作用:补全 `@path` 文件引用。
- 步骤:`_active_file_reference_token` 取 `@` 令牌区间;`prefix` 为 `@` 后文本;遍历 `_iter_file_reference_paths`,子串(大小写不敏感)匹配;展示 `relative + ('/' if dir)`。

### function: _active_file_reference_token

```python
def _active_file_reference_token(text) -> tuple[int, int] | None
```

- 作用:定位光标前最近的 `@` 文件引用令牌(以空格/换行为界)。

### function: _iter_file_reference_paths

```python
def _iter_file_reference_paths(cwd) -> tuple[Path, ...]
```

- 作用:DFS 收集 `cwd` 下全部文件(忽略目录),按名排序。

### function: _is_ignored_file_completion_path

```python
def _is_ignored_file_completion_path(path, *, cwd) -> bool
```

- 作用:路径任一段以 `.` 开头或在忽略集合中则忽略。

### function: _shell_path_completions

```python
def _shell_path_completions(*, text, cwd) -> tuple[CompletionItem, ...] | None
```

- 作用:`!`/`!!` shell 命令后的路径补全。
- 步骤:`_shell_command_prefix_span` 定位命令起;取活动路径令牌;`_parse_shell_path_token` 解析父/前缀;列父目录子项,前缀匹配(`startswith`),跳过被忽略、跳过与原文相同、跳过含特殊字符;目录补 `/`。

### function: _shell_command_prefix_span

```python
def _shell_command_prefix_span(text) -> tuple[int, int] | None
```

- 作用:识别 `!!`(长度2)或 `!`(长度1)前缀区间;否则 `None`。

### function: _active_shell_path_token

```python
def _active_shell_path_token(*, text, command_start) -> tuple[int, int]
```

- 作用:从光标向前(处理反斜杠转义)找当前路径令牌起止。

### function: _parse_shell_path_token

```python
def _parse_shell_path_token(token) -> tuple[str, str, str] | None
```

- 作用:解析 `./`、`/`、`~`、含引号/通配符/特殊字符一律拒绝;返回 `(parent_text, name_prefix, replacement_prefix)`。

### function: _matches_skill_command

```python
def _matches_skill_command(token, skills) -> bool
```

- 作用:判断 `/skill:<name>` 是否已匹配某技能名(小写比较)。

### function: _matches_prompt_template_command

```python
def _matches_prompt_template_command(token, prompt_templates) -> bool
```

- 作用:判断 token 是否匹配某 prompt 模板名。

### function: _matches_registered_command

```python
def _matches_registered_command(token, registry) -> bool
```

- 作用:`registry.get(name)` 是否命中。

### function: _command_completions

```python
def _command_completions(*, token, token_end, registry, prompt_templates) -> tuple[CompletionItem, ...]
```

- 作用:命令级补全(命令名 + 模板名)。
- 步骤:`prefix = token.removeprefix("/").lower()`;遍历 `registry.list_commands()` 用 `_command_alias_completions` 展开别名/搜索词;模板以 `/{name}` 构造;均按 `_command_completion_sort_key` 排序。

### function: _command_completion_sort_key

```python
def _command_completion_sort_key(item, prefix) -> tuple[int, str]
```

- 作用:排序键——`prefix` 为空排名 0;否则 `display` 去 `/` 去 `:` 后是否以 `prefix` 开头(直接匹配排前),同组内按 `display`。

### function: _command_alias_completions

```python
def _command_alias_completions(command, *, prefix, token_end) -> list[CompletionItem]
```

- 作用:为一个命令生成其名称、别名、搜索词的补全项(去重,`skill` 特例显示 `/skill:`)。
- 步骤:有 `prefix` 时含 `(name, *aliases, *search_terms)`;以 `prefix` 过滤;替换名解析回主名;去重 `seen`;构造 `CompletionItem(category="Commands")`。

### function: _skill_completions

```python
def _skill_completions(*, token, token_end, skills) -> tuple[CompletionItem, ...]
```

- 作用:`/skill:` 后按技能名前缀补全(按名排序)。

### function: _command_argument_completions

```python
def _command_argument_completions(*, text, token_end, model_names, provider_names, thinking_levels, theme_names, session_ids, session_options) -> tuple[CompletionItem, ...] | None
```

- 作用:命令参数级补全分派,无参文本(`token_end >= len(text)`)返回 `None`。
- 分支:
  - `model`/`scoped-models` → `_value_completions(model_names, sort=True)`。
  - `login`/`logout` → `_value_completions(provider_names, sort=True)`。
  - `resume` → `session_options`(有则)或 `session_ids`,`sort=False`。
  - `theme` → `_value_completions(theme_names)`。
  - 其他 → `None`(交由命令级逻辑)。

### function: _value_completions

```python
def _value_completions(*, text, start, options, sort) -> tuple[CompletionItem, ...]
```

- 作用:对参数值做前缀匹配。
- 步骤:`_argument_token_end` 取区间;`prefix` 为已输入值(小写);`sort` 时按 `value` 排序;仅 `option.value.startswith(prefix)` 的进入结果。

### function: _completion_options

```python
def _completion_options(values, *, description) -> tuple[CompletionOption, ...]
```

- 作用:把字符串列表包装为带描述的 `CompletionOption` 元组。

### function: _first_token_end

```python
def _first_token_end(text) -> int
```

- 作用:首个空格前的长度(无空格则为全文本长)。

### function: _argument_token_end

```python
def _argument_token_end(text, start) -> int
```

- 作用:从 `start` 起到下一个空格或文末的索引。

### 串联说明(autocomplete 触发条件)

补全在输入框每次文本变化时由 `build_completion_state` 计算:以 `/` 开头走命令/参数/技能补全(前缀过滤 + 排序),否则在有 `cwd` 时走 `@` 文件引用或 `!`/`!!` shell 路径补全;参数已有且匹配已知命令则收敛为空(避免冗余)。结果以不可变 `CompletionState` 供给补全 widget 投影,用户用 `accept_completion`(tab)等键经 `apply()` 替换文本——与 `config.py` 键位、`state.py` 的纯数据模型保持一致。

---

<!-- NAV -->
[← tau_coding · 渲染层(print/json)]({{< relref "./coding-rendering-print.md" >}})
[↑ 总览]({{< relref "./source-walkthrough.md" >}})
[→ tau_coding · TUI 界面与控件]({{< relref "./coding-tui-app.md" >}})
