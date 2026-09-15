---
title: "Phase 12: Textual TUI / 阶段 12:Textual TUI"
---

[原文]
Phase 12 adds Tau's first interactive terminal UI using Textual.

[译文]
阶段 12 使用 Textual 加入了 Tau 的第一个交互式终端 UI。

[原文]
The implementation lives in:

[译文]
实现位于:

```text
src/tau_coding/tui/
```

## 新增了什么(What was added)

[原文]
Tau now has a minimal interactive TUI that:

- uses `CodingSession` rather than raw `AgentHarness`
- accepts user prompts through a Textual input widget
- streams `AgentEvent` values into TUI display state
- displays assistant messages, tool events, status messages, and errors
- shows a dark-mode session sidebar with model, cwd, tools, skills, and prompt templates
- restores previous session messages into the visible transcript
- supports existing `/help` and `/exit` command handling
- supports Escape to request cancellation
- stores the early default TUI session at `.tau/sessions/default.jsonl`

[译文]
Tau 现在有一个最小的交互式 TUI,它可以:

- 使用 `CodingSession`,而不是裸的 `AgentHarness`
- 通过 Textual 输入组件接收用户提示
- 把 `AgentEvent` 流式写入 TUI 显示状态
- 展示 assistant 消息、工具事件、状态消息与错误
- 显示深色模式的会话侧边栏,包含模型、cwd、工具、技能与提示词模板
- 把此前的会话消息恢复到可见的会话记录中
- 支持已有的 `/help` 与 `/exit` 命令处理
- 支持按 Escape 请求取消
- 把早期默认 TUI 会话存放在 `.tau/sessions/default.jsonl`

[原文]
The CLI opens the TUI by default:

[译文]
CLI 默认打开 TUI:

```bash
tau
```

[原文]
Global options can be passed before starting the TUI:

[译文]
启动 TUI 之前可以传入全局选项:

```bash
tau --model gpt-4.1-mini --cwd /path/to/project
```

## 为什么需要它(Why this exists)

[原文]
Pi separates the reusable agent layer from terminal UI concerns:

```text
agent/session emits events
terminal frontend consumes events
TUI components render display state
```

[译文]
Pi 把可复用的 agent 层与终端 UI 关注点分离:

```text
agent/session 发出事件
终端前端消费事件
TUI 组件渲染显示状态
```

[原文]
Tau now follows that same boundary with Python-native Textual:

```text
CodingSession.prompt()
  emits AgentEvent
      ↓
TuiEventAdapter
  updates TuiState
      ↓
TauTuiApp
  renders Textual widgets
```

[译文]
Tau 现在用 Python 原生的 Textual 遵循同一条边界:

```text
CodingSession.prompt()
  发出 AgentEvent
      ↓
TuiEventAdapter
  更新 TuiState
      ↓
TauTuiApp
  渲染 Textual 组件
```

[原文]
`tau_agent` still has no dependency on Textual, Rich, Typer, or terminal UI behavior.

[译文]
`tau_agent` 仍然不依赖 Textual、Rich、Typer 或终端 UI 行为。

## TUI 状态适配器(TUI state adapter)

[原文]
The adapter layer is intentionally separate from Textual:

[译文]
适配器层被有意与 Textual 分离:

```text
src/tau_coding/tui/state.py
src/tau_coding/tui/adapter.py
```

[原文]
`TuiState` stores display-only state:

- transcript items
- current assistant streaming buffer
- running flag
- latest error

[译文]
`TuiState` 保存仅供显示的状态:

- 会话记录条目
- 当前 assistant 的流式缓冲
- 运行标志
- 最近的错误

[原文]
`TuiEventAdapter` applies portable `AgentEvent` values to that state.

[译文]
`TuiEventAdapter` 把可移植的 `AgentEvent` 应用到该状态上。

[原文]
This makes event-to-display behavior testable without launching a terminal app.

[译文]
这使得「事件到显示」的行为无需启动终端应用即可测试。

## Textual 应用(Textual app)

[原文]
The Textual app is intentionally minimal:

[译文]
这个 Textual 应用被有意保持最小:

```text
src/tau_coding/tui/app.py
src/tau_coding/tui/widgets.py
```

[原文]
It uses:

- `Header`
- `Footer`
- `Static` for status and sidebar content
- `Horizontal` and `Vertical` containers for the sidebar/main layout
- a scrollable transcript made from selectable message widgets
- `Input` for prompt submission

[译文]
它使用:

- `Header`
- `Footer`
- `Static` 显示状态与侧边栏内容
- `Horizontal` 与 `Vertical` 容器组织侧边栏/主区域布局
- 由可选中消息组件构成的可滚动会话记录
- `Input` 提交提示

[原文]
Prompt execution runs in a Textual worker so the UI can continue updating while events stream.

[译文]
提示的执行运行在 Textual worker 中,因此事件流式传输期间 UI 仍能持续更新。

## 会话存储(Session storage)

[原文]
Phase 12 adds a temporary default local session path helper:

[译文]
阶段 12 增加了一个临时的默认本地会话路径辅助函数:

```python
def default_session_path(cwd: Path) -> Path:
    return cwd / ".tau" / "sessions" / "default.jsonl"
```

[原文]
This is intentionally simple. Later phases can replace it with a richer Pi-style session manager and picker.

[译文]
这是有意保持简单的。后续阶段可以用更丰富的 Pi 风格会话管理器与选择器替换它。

## 当前限制(Current limitations)

[原文]
The TUI is a foundation, not a full Pi-level interface yet. It does not include:

- session picker
- model picker
- command palette
- tree navigation
- diff viewer
- markdown rendering
- theme customization
- keybinding configuration
- extension UI hooks
- compaction UI

[译文]
这个 TUI 只是基础,还不是 Pi 级别的完整界面。它不包含:

- 会话选择器
- 模型选择器
- 命令面板
- 树导航
- diff 查看器
- Markdown 渲染
- 主题定制
- 键位配置
- 扩展 UI 钩子
- 压缩(compaction)UI

## 测试(Tests)

[原文]
The phase is covered by:

[译文]
本阶段的测试覆盖为:

```text
tests/test_tui_adapter.py
tests/test_cli.py
```

[原文]
Tests focus on the pure adapter and CLI wiring. Full terminal interaction testing is deferred until the TUI surface stabilizes.

[译文]
测试聚焦于纯适配器与 CLI 接线。完整的终端交互测试推迟到 TUI 界面稳定之后。

## 下一阶段(Next phase)

[原文]
The next phase can expand the TUI incrementally with one of:

- session selection and resume support
- richer transcript rendering
- command palette and slash-command registry
- extension hooks
- compaction/context management UI

[译文]
下一阶段可以选择以下方向之一来增量扩展 TUI:

- 会话选择与恢复(resume)支持
- 更丰富的会话记录渲染
- 命令面板与斜杠命令注册表
- 扩展钩子
- 压缩/上下文管理 UI
