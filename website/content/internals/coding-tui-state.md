---
title: tau_coding · TUI 状态与适配
description: tui/state / adapter / config / autocomplete
code_files:
  - tau_coding/tui/state.py
  - tau_coding/tui/adapter.py
  - tau_coding/events.py
---

## `tui/state.py` — 对话流的数据模型

TUI（Text User Interface，文本用户界面）是运行在终端里的交互式程序——不需要浏览器，也不需要图形窗口。Tau 的 TUI 让你在终端中与 AI agent 对话，就像用一个增强版的命令行聊天工具。

这个文件定义了 TUI 展示区（transcript，即对话流）的数据模型。它**不依赖任何 UI 框架**，只负责描述"当前要显示什么"。为什么要这样设计？因为 Tau 的架构要求核心模块保持可移植——同一个数据模型可以被 Textual 界面、打印模式、甚至未来的其他前端复用，而不需要修改任何逻辑。

### `ChatItemRole`

一个 `Literal`（字面量类型别名，即一组固定的字符串值），枚举对话流能展示的各类内容块：`user`、`assistant`、`tool`、`error`、`status`、`thinking`、`skill`、`branch_summary`、`compaction_summary`、`custom`。每种角色都以专属的边框颜色渲染（颜色见 `config.py` 中的主题定义）。

### 常量（Constants）

用于预览/交互体验的微调参数：`TOOL_RESULT_PREVIEW_LINES`、`TOOL_PATCH_PREVIEW_LINES`、`TOOL_RESULT_PREVIEW_CHARS`、`TERMINAL_COMMAND_OUTPUT_PREVIEW_LINES`、`TOOL_SPINNER_FRAMES`（盲文旋转动画帧），以及 `_INVOCATION_MARKERS`（`"→ "`、`"▸ "`，工具执行时会被旋转帧临时替换），还有 `TOOL_TIMER_MIN_SECONDS`（避免对瞬时完成的工具调用闪烁 `(0s)` 计时器）。

### `ChatItem`（dataclass 数据类，`slots=True`）

一条可渲染的对话行——可以是用户消息、AI 回复、工具调用结果等等。关键字段如下：

- `role`、`text` — 块类型与主要文本。
- `tool_call_id` — 把一次工具调用与其结果/更新关联起来。
- `tool_result_text`、`tool_result` — 格式化后的结果*与*原始 `AgentToolResult` 对象，二者都保留，以便已注册的 `render_result` 能进行懒格式化。
- `update_text` — 工具运行期间的实时进度。
- `tool_name`、`tool_arguments` — 供 `render_call` 钩子使用。
- `started_at` — 单调时间戳（用于经过时长计时器）。
- `always_show_tool_result`、`custom_type`、`details`。

### `TuiState`（dataclass 数据类，`slots=True`）

TUI 的"状态管理"中心——这是**分离关注点**原则的体现：把"显示什么数据"和"怎么渲染成界面"拆开。`TuiState` 只管数据，视图层（widgets）只读取数据来渲染。这样每次事件到来时，状态更新一次，视图就能重新投影，不需要在渲染逻辑里混杂业务判断。

单个 TUI 会话的可变展示状态：

- `items: list[ChatItem]`、`assistant_buffer`（流式文本在刷入最终 `assistant` 条目之前的累积缓冲）。
- `running`、`error`、`show_tool_results`、`show_thinking`。
- `queued_steering`、`queued_follow_up` — 待处理消息（来自 `QueueUpdateEvent`）。
- `skills` — 仅供展示用的路径匹配（读取某个技能文件会显示为一个 "skill" 条目）。
- 自定义/工具渲染器（`custom_renderer`、`tool_call_renderer`、`tool_result_renderer`）— 由扩展运行时安装。
- `tool_spinner` — 当前的旋转动画帧。

重要方法：

- `add_item`、`add_user_message` — `add_user_message` 很智能：它能识别分支摘要和压缩摘要载荷（通过 `_parse_branch_summary_message` / `_parse_compaction_summary_message`）以及技能调用，把它们作为各自独立的条目类型存储，从而以特殊方式渲染（并且保持可折叠）。
- `add_tool_call` — 追加一个折叠的工具调用条目；或者当 `read` 指向某个已加载的技能路径（`_read_skill_name`）时，追加一个 `skill` 条目。
- `record_tool_update` / `record_tool_result` — 通过 `tool_call_id` 把进度/结果挂到匹配的工具条目上，否则追加一个孤儿（orphan）结果。
- `add_thinking_delta` — 把推理碎片追加到一个 `thinking` 块中。
- `resolve_tool_invocation` / `resolve_tool_result` / `resolve_custom_markup` —
  在绘制时懒调用已安装的渲染器；当工具仍在运行（`tool_spinner` 已设置）时，旋转帧会替换静态标记，并在超过 `TOOL_TIMER_MIN_SECONDS` 后显示经过时长。
- `toggle_tool_results`、`toggle_thinking`、`update_queue`、`queued_message_count`、`clear`、`set_skills`、`load_messages`（从恢复的 `AgentMessage` 重建转录）、`find_tool_item`。

### 格式化辅助函数

- `format_elapsed` — 紧凑时长 `23s` / `1m 23s` / `1h 2m`。
- `apply_tool_spinner`、`format_tool_call_block` / `format_tool_call_invocation`
  — 紧凑、工具专属的调用串（`read path:1-20`、`$ command`、`edit path`）。`bash` 显示 `$ command` 时不含 `→` 标记。
- `format_tool_result_block` / `format_tool_result_summary` — 渲染结果，带折叠预览（`_preview_text`）和编辑补丁预览（`_result_patch`）。
- `format_terminal_command_result_block` — 为转录区格式化 `!!` 终端命令输出。

> 设计说明（Design note）：state 模块是纯数据 + 格式化，不导入任何 Textual。这是刻意为之，而非偶然——它让模型独立于任何 UI 框架，从而能被单元测试、也能被任意前端复用。这个边界同时强制执行了 Tau 的分层规则：可移植核心不得依赖 Textual 或 Rich：`state.py` 只描述"要显示什么"，只有 `app.py` 才了解 widget 层。因为视图是这个模型的只读投影（见 widgets 页面），每次事件都重新渲染、却从不重复格式化逻辑。这也印证了 Tau README 的设计原则——"核心保持可移植（The core stays portable）"与"事件即契约（Events are the contract）"：事件流修改 `TuiState`，而视图消费的是这个状态，而非事件本身。

---

## `tui/adapter.py` — 事件 → 状态

`TuiEventAdapter` 是把 `CodingSessionEvent` 映射到 `TuiState` 的唯一边界——这就是经典的**适配器模式**（Adapter Pattern）。为什么需要适配器？因为 agent 核心发出的是通用事件流（"用户说了一句话"、"工具开始执行了"），而 TUI 需要的是结构化的展示数据（"对话列表里多了一条消息"、"工具状态变成了运行中"）。适配器做的就是这个翻译工作，而且只做这一件事。它的 `apply(event)` 是对事件继承体系的一次 `isinstance` 分发：

适配器从两个模块导入事件：
- **`tau_agent.events`**：可移植 agent 层的 `AgentEvent`（`AgentStartEvent`、`AgentEndEvent`、`MessageStartEvent`、`MessageUpdateEvent`、`MessageEndEvent`、`ToolExecutionStartEvent`、`ToolExecutionUpdateEvent`、`ToolExecutionEndEvent`）。
- **`tau_coding.events`**：coding 会话层的事件（`AutoRetryStartEvent`、`QueueUpdateEvent` 等）。
- **`tau_ai.events`**：Pi 兼容的流式子事件（`TextDeltaEvent`、`ThinkingDeltaEvent`），用于解析 `MessageUpdateEvent` 的嵌套载荷。

事件分发映射：
- `AgentStartEvent` → `running = True`，清空错误。
- `AgentEndEvent` → 刷新 assistant 缓冲区，`running = False`。
- `agent_settled`（按 `event.type` 匹配）→ 刷新缓冲区，`running = False`。
- `QueueUpdateEvent` → `update_queue`。
- `MessageStartEvent` → 若消息为 `AssistantMessage`，用其 `text` 初始化 `assistant_buffer`。
- **`MessageUpdateEvent`** → 解析嵌套的 `assistant_message_event` 字段：若为 `TextDeltaEvent` 则追加 delta 到 `assistant_buffer`；若为 `ThinkingDeltaEvent` 则调用 `add_thinking_delta`。（注意：旧版的 `MessageDeltaEvent`/`ThinkingDeltaEvent` 顶层事件已替换为统一的 `MessageUpdateEvent`，delta 信息嵌套在其中。）
- `MessageEndEvent` → 若为 `UserMessage`，则 `add_user_message`；若为 `CustomMessage`，则 `add_user_message` 带 `custom_type`；若为 `AssistantMessage`，则根据 `stop_reason` 判断——错误/中止时标记 `error` 并停止 `running`，否则把 assistant 缓冲区刷入 `assistant` 条目。
- `ToolExecutionStartEvent` → 刷新缓冲区，`add_tool_call`。
- `ToolExecutionUpdateEvent` → `record_tool_update`。
- `AutoRetryStartEvent` → 一个瞬时的 `status` 条目。
- `ToolExecutionEndEvent` → `record_tool_result`（现在接收 `tool_call_id`、`tool_name`、`result`、`is_error` 四个独立参数，而非单独的 `result` 对象）。

`_flush` 把任何已累积的流式文本推进一个最终的 assistant 条目。这种分离意味着*同一个*适配器可以驱动任意视图；只有 `app.py` 才了解 Textual。适配器是把 `tau_agent` 可移植的 `AgentEvent` 与 `tau_coding` 的会话事件映射到 `TuiState` 的唯一边界，因此事件→状态的翻译与任何渲染关注点完全解耦（"薄层胜过魔法（Small layers beat magic）"——适配器只做一件事，且在一个窄接口背后完成）。

---

## `tui/config.py` — 持久化的 TUI 设置

这个文件管理 TUI 的外观和行为配置——键位绑定、主题、侧栏位置等等。它不依赖 Textual，只产出纯数据结构，这意味着配置可以被单元测试验证，也可以在未来被其他前端复用。

### `TuiKeybindings`（frozen 冻结）

TUI 使用的每一个按键及其默认值：`cancel=escape`、`command_palette=ctrl+k`、`session_picker=ctrl+r`、`queue_follow_up=alt+enter`、`accept_completion=tab`、`thinking_cycle=shift+tab`、`model_cycle=ctrl+p`、`toggle_thinking=ctrl+t`、`toggle_tool_results=ctrl+o`、`copy_message=ctrl+c`、`quit=ctrl+d`，外加 `completion_next/previous`（上/下）。`to_json` 将其序列化。

### `TuiThemeName` 与 `TuiRoleStyle`

`TuiThemeName = "tau-dark" | "tau-light" | "high-contrast"`。`TuiRoleStyle` 只是一个角色的 `border`（边框）色 + `body`（正文）色。

### `TuiTheme`（frozen 冻结）

一个完全解析好的调色板：屏幕/边框/侧栏/转录区/提示框 颜色，自动补全色、强调色、markdown 颜色、补全色、`syntax_theme` 语法主题，以及 `role_styles`（每个角色一个 `TuiRoleStyle`）。定义了三个具体实例：`TAU_DARK_THEME`、`TAU_LIGHT_THEME`、`HIGH_CONTRAST_THEME`，收集在 `_THEMES` 中，并通过 `get_tui_theme` / `BUILTIN_TUI_THEME_NAMES` 暴露。

### `TuiSettings`（frozen 冻结）

`keybindings`、`theme`（主题名，经 `resolved_theme` 解析）、`auto_copy_selection`（选中自动复制）、`sidebar_position`（`left`/`right`/`off`）。经 `load_tui_settings` / `save_tui_settings` / `tui_settings_from_json` 持久化到 `tui.json`。解析时会校验允许的字段、拒绝重复的键位绑定（`_reject_duplicate_keys`）、并拒绝未知主题。

---

## `tui/autocomplete.py` — 提示符自动补全

在输入框中输入 `/` 时弹出的命令建议列表、输入 `@` 时的文件路径补全——这些都由这个模块计算。它是纯函数式的，没有状态，也没有任何 UI 框架依赖。

### 数据类型

- `CompletionOption(value, description)` — 一个参数值。
- `CompletionItem(display, replacement, start, end, description, category)` —
  一条建议；`apply(text)` 把 `replacement` 拼接到提示文本中。
- `CompletionState(items, selected_index)` — 当前建议集合，带 `select_next` / `select_previous`（环形）以及 `selected` 属性。

### `build_completion_state(text, ...)`

入口函数。给定当前提示文本，以及全部命令、技能、提示模板、模型/provider/思考级别/主题/会话名，还有 cwd，它返回相关的 `CompletionState`：

- 若文本不是 `/` 命令（也不是 `//`），它提供文件引用（`@path`）补全；在 `!`/`!!` shell 命令内部时，提供 shell 路径补全（`_shell_path_completions`）。忽略的目录（`IGNORED_FILE_COMPLETION_DIRS`）与 `MAX_FILE_COMPLETIONS` 限制了扫描范围。
- 对 `/skill:…`，补全技能名。
- 对带参数的已知命令，`_command_argument_completions` 提供取值：`/model` 与 `/scoped-models` → 模型名；`/login` 与 `/logout` → provider 名；`/resume` → 会话 id；`/theme` → 主题名。
- 否则补全命令名（`_command_completions`）与提示模板名，按前缀匹配排序。

其余辅助函数（`_file_reference_completions`、`_shell_path_completions`、`_command_alias_completions`、`_value_completions`、`_completion_options`、`*_token_end`）都是纯字符串逻辑；该函数返回一个不可变的 `CompletionState` 供 app 渲染。

---

## 逐方法深度剖析（state / adapter / config / autocomplete）

> 以下为 `tui/state.py`、`tui/adapter.py`、`tui/config.py`、`tui/autocomplete.py` 各顶层定义的逐方法展开，是对上方概述的细化补充。

## 文件:state.py

本文件定义 Tau 文本 TUI 的**展示状态模型**——即 `TranscriptView` 等 widget 只读投影所依赖的数据源。它不含任何 Textual 依赖，只描述"当前要显示什么"。Textual 是一个 Python TUI 框架，提供了类似 Web 开发的 widget 体系来构建终端界面，但它只在渲染层出现，不会渗透到这里。

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
def record_tool_result(self, tool_call_id: str, tool_name: str, result: AgentToolResult, is_error: bool) -> None
```

- 作用:把 Pi 兼容的工具结果绑定到对应调用,若无匹配则以孤儿结果追加。参数为四个独立值而非单个 `AgentToolResult` 对象，因为适配器层直接从 `ToolExecutionEndEvent` 拆出各字段传入。
- 步骤:
  1. `format_tool_result_block(name=tool_name, ok=not is_error, content=result.text, data=…)` 生成 `result_text`。
  2. 倒序查 `tool`/`skill` 条目且 `tool_call_id == tool_call_id`:命中则写 `tool_result_text`/`tool_result`、清空 `update_text` 并返回。
  3. 未命中:追加 `tool` 条目,`text=format_tool_result_summary(name=tool_name, ok=not is_error)`,并带 `tool_result_text`/`tool_result`。

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

本文件是 **coding 会话事件 → TuiState 投影**的适配器边界——它把 `tau_agent` 的可移植 `AgentEvent` 与 `tau_coding` 的会话事件增量地翻译成 `TuiState.items` 的增删改，使下游 widget 能纯投影渲染。**适配器模式**（Adapter Pattern）是一种设计模式，它把一种数据格式（这里是事件流）转换为另一种（这里是状态模型），转换逻辑集中在一个地方，方便测试和维护。

### 事件来源与导入

适配器同时从三个模块导入事件，体现了 Tau 的分层设计：
- **`tau_agent.events`**：agent 可移植层的事件——`AgentStartEvent`、`AgentEndEvent`、`MessageStartEvent`、`MessageUpdateEvent`、`MessageEndEvent`、`ToolExecutionStartEvent`、`ToolExecutionUpdateEvent`、`ToolExecutionEndEvent`。
- **`tau_coding.events`**：coding 会话层的事件——`AutoRetryStartEvent`、`QueueUpdateEvent`（以及 `CodingSessionEvent` 类型别名，即 `AgentEvent | SessionOwnEvent`）。
- **`tau_ai.events`**：Pi 兼容的流式子事件——`TextDeltaEvent`、`ThinkingDeltaEvent`，用于解析 `MessageUpdateEvent` 中嵌套的 `assistant_message_event` 字段。

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
def apply(self, event: CodingSessionEvent) -> None
```

- 作用:事件主分发器,按事件类型调用对应处理(全部为 `isinstance` 分支,逐个返回)。
- 分支映射:
  - `AgentStartEvent` → `state.running=True`、`error=None`。
  - `AgentEndEvent` → `_flush()` 后 `running=False`。
  - `event.type == "agent_settled"` → `_flush()` 后 `running=False`（通过字符串类型匹配，而非 isinstance，因为 `AgentSettledEvent` 定义在 `tau_coding.events`）。
  - `QueueUpdateEvent` → `update_queue(steering=…, follow_up=…)`。
  - `MessageStartEvent` → 若 `event.message` 是 `AssistantMessage`，用其 `text` 初始化 `assistant_buffer`。
  - **`MessageUpdateEvent`** → 取 `event.assistant_message_event`（嵌套的 Pi 兼容流式事件）：若为 `TextDeltaEvent` 则 `assistant_buffer += delta`；若为 `ThinkingDeltaEvent` 则 `add_thinking_delta(delta)`。（旧版的 `MessageDeltaEvent` / 顶层 `ThinkingDeltaEvent` 已被 `MessageUpdateEvent` 统一替代。）
  - `MessageEndEvent` → 见下:
    - `UserMessage` → `add_user_message(message.text)`。
    - `CustomMessage` → `add_user_message(message.text, custom_type=…, details=…)`。
    - `AssistantMessage` → 若 `stop_reason in {"error", "aborted"}`，标记 `error` 并 `running=False`；否则把 `assistant_buffer` 刷入 `assistant` 条目；清空 `assistant_buffer`。
  - `ToolExecutionStartEvent` → `_flush()` 后 `add_tool_call(ToolCall(id=…, name=…, arguments=…))`（注意：适配器在这里手动构造 `ToolCall` 对象）。
  - `ToolExecutionUpdateEvent` → `record_tool_update(tool_call_id, partial_result.text)`。
  - `AutoRetryStartEvent` → `add_item("status", f"… {event.error_message}")`。
  - `ToolExecutionEndEvent` → `record_tool_result(event.tool_call_id, event.tool_name, event.result, event.is_error)`（四个独立参数，而非旧版的单个 `result` 对象）。

#### method: _flush

```python
def _flush(self) -> None
```

- 作用:把尚未成块的 assistant 增量缓冲落盘为一条 transcript 条目,并清空缓冲。
- 使用位置:在 tool 开始、agent 结束时调用,确保零散 delta 先成块。

### 串联说明(adapter → TuiState → render)

`CodingSession` 驱动事件循环，每个 `CodingSessionEvent`（`AgentEvent | SessionOwnEvent`）经 `TuiEventAdapter.apply` 增量修改同一份 `TuiState`:Pi 流式 delta（`TextDeltaEvent`/`ThinkingDeltaEvent`）通过 `MessageUpdateEvent` 进入 `assistant_buffer`，工具以 `add_tool_call` 占位、`record_tool_update` 追加进度、`record_tool_result` 收口，思考碎片进 `thinking` 条目，用户/工具消息经 `add_user_message`/`record_tool_result` 落地。下游 `TranscriptView` 仅需 `for item in state.items` 纯投影渲染,通过 `resolve_*` 懒调用注册的 renderer,完全不持有逻辑——这正是 widgets 页"state 拥有模型、render 只读"约定的落地。

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
