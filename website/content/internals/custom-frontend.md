---
title: Build your own frontend
description: Advanced — drive Tau's coding session from your own UI by consuming its event stream.
code_files:
  - tau_coding/session.py
  - tau_coding/events.py
---

{{% caution title="Advanced" %}}
本页面向在 Tau 核心之上构建*新前端*的场景。如果你只是想使用 Tau,请参见 [The interactive session]({{< relref "../guides/tui.md" >}})。此处介绍的 API 为 Python,并默认你已读过 [architecture overview]({{< relref "./architecture.md" >}})。
{{% /caution %}}

Tau 的 Textual 应用只是一个前端,而非架构本身。一个自定义 UI 接入的是与内置 TUI 相同的原语:

```text
CodingSession   — owns the coding-agent environment
AgentEvent      — describes assistant text, tool calls, results, errors
Frontend state  — belongs to your UI
```

可复用的 `tau_agent` 包独立于终端框架、控件、键位绑定、配置路径以及斜杠命令的用户体验。请基于 `tau_coding.session.CodingSession` 构建,而非 Textual 控件。

`CodingSession` 提供环境(提供方/模型、工具、持久化、技能、提示模板、项目上下文、斜杠命令处理、压缩)。你的前端则提供界面(提示输入、记录渲染、命令录入、取消、选择器)。

## 最小事件循环

```python
async for event in session.prompt(user_text):
    render_event(event)
```

该流产出 `CodingSessionEvent` 值：来自 `tau_agent.events` 的可移植 `AgentEvent` 值，加上来自 `tau_coding.events` 的会话层事件（列表见 [the agent loop]({{< relref "./agent-loop.md" >}}))。请基于这些进行渲染，绝不要基于提供方特定的数据块。应将 `agent_start` 视为进入运行状态的信号，用 `agent_settled`（而非仅 `agent_end`）来标记运行结束——因为自动压缩、重试或排队的后续回合可能在 `agent_end` 之后继续发生。提供方错误以 `stop_reason` 为 `"error"` 的助手消息形式到达，随后是正常的回合/运行生命周期。

## 转向与后续消息

如果用户在一次运行进行时提交输入,请排队等待,而不是启动第二次运行:

```python
async for event in session.prompt(user_text, streaming_behavior="steer"):
    adapter.apply(event); redraw(state)
```

对一条会一直等到本次运行本将停止时才继续的提示,使用 `streaming_behavior="follow_up"`。不带 `streaming_behavior` 的重叠 `session.prompt(...)` 调用会被拒绝,从而确保两次运行不会修改同一份记录。`QueueUpdateEvent` 携带待处理的排队文本,用于徽标/状态显示。

## 斜杠命令

斜杠命令属于 `tau_coding`。在把输入当作提示处理之前:

```python
result = session.handle_command(text)
```

若 `result.handled`,则应用所请求的效果(`exit_requested`、`clear_requested`、`new_session_requested`、`compact_summary`、`message`),并在持久对话*之外*显示引用/状态输出。若 `result.compact_summary is not None`,调用 `await session.compact(result.compact_summary)`(空字符串表示"原样使用内置提示")。

`/skill:<name>` 有意地**不是**一条命令——请将其透传给 `session.prompt(...)`,它会在运行前展开。

## 恢复与切换会话

从 `session.messages` 初始化可见的记录(内置的 `TuiState.load_messages()` 是一个参考实现)。`ToolResultMessage` 保留了结构化元数据(例如编辑补丁),因此你可以渲染已恢复的工具体结果而无需直接读取 JSONL。

对于会话切换,使用 `tau_coding.session_manager.SessionManager`——先 `list_sessions(session.cwd)`,再 `await session.resume(session_id)`(或以 `storage=jsonl_session_storage(record.path)` 加载一个全新的 `CodingSession`),然后从 `session.messages` 重建记录。

## 取消、选择器与键位绑定

- 用 `session.cancel()` 取消——持续消费事件直到流结束。
- 直接从会话读取选择器数据:`command_registry.list_commands()`、
  `skills`、`prompt_templates`、`available_model_choices`、`available_models`、
  `available_providers`、`thinking_level`、`available_thinking_levels`、
  `session_manager`。若要切换为另一提供方的模型,先调用
  `set_provider(...)` 再调用 `set_model(...)`。
- 键位绑定与主题是**前端策略**。内置应用通过 `tau_coding.tui.load_tui_settings()` 读取
  `~/.tau/tui.json`,但你的 UI 可以忽略它。

## 不要依赖什么

避免耦合到私有的 `CodingSession` 属性、提供方特定的响应数据块、Textual 内部实现,或原始 JSONL 结构(请使用 `SessionManager` / `CodingSession`)。坚持使用事件、消息、工具、harness 与会话这些原语。

{{% note %}}
这些系统的完整逐阶段构建日志存放在仓库的 `dev-notes/` 目录下(参见 [Contributing]({{< relref "../contributing.md" >}}))。
{{% /note %}}
