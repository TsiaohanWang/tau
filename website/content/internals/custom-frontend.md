---
title: "Build your own frontend / 构建你自己的前端"
description: "Advanced — drive Tau's coding session from your own UI by consuming its event stream. / 进阶 —— 通过消费 Tau 的事件流,用你自己的 UI 驱动它的编码会话。"
---

[原文]
{{% caution title="Advanced" %}}
This page is for building a *new frontend* on top of Tau's core. If you just want
to use Tau, see [The interactive session]({{< relref "../guides/tui.md" >}}). The APIs here are
Python and assume you've read the [architecture overview]({{< relref "./architecture.md" >}}).
{{% /caution %}}

[译文]
{{% caution title="进阶" %}}
本页讲的是在 Tau 内核之上构建一个*新前端*。如果你只是想使用 Tau,见[交互式会话]({{< relref "../guides/tui.md" >}})。这里的 API 是 Python,并假定你已经读过[架构概览]({{< relref "./architecture.md" >}})。
{{% /caution %}}

[原文]
Tau's Textual app is one frontend, not the architecture. A custom UI plugs into
the same primitives the built-in TUI uses:

```text
CodingSession   — owns the coding-agent environment
AgentEvent      — describes assistant text, tool calls, results, errors
Frontend state  — belongs to your UI
```

[译文]
Tau 的 Textual 应用只是其中一个前端,而不是架构本身。自定义 UI 接入的是内置 TUI 所使用的同一批原语:

[原文]
The reusable `tau_agent` package stays independent of terminal frameworks,
widgets, keybindings, config paths, and slash-command UX. Build against
`tau_coding.session.CodingSession`, not Textual widgets.

[译文]
可复用的 `tau_agent` 包保持独立于终端框架、控件、快捷键、配置路径与斜杠命令 UX。请针对 `tau_coding.session.CodingSession` 构建,而不是针对 Textual 控件。

[原文]
`CodingSession` provides the environment (provider/model, tools, persistence,
skills, prompt templates, project context, slash-command handling, compaction).
Your frontend provides the interface (prompt input, transcript rendering, command
entry, cancellation, pickers).

[译文]
`CodingSession` 提供环境(provider/模型、工具、持久化、技能、提示词模板、项目上下文、斜杠命令处理、压缩)。你的前端提供界面(提示输入、会话记录渲染、命令输入、取消、各类选择器)。

## 最小事件循环(Minimal event loop)

```python
async for event in session.prompt(user_text):
    render_event(event)
```

[原文]
The stream yields provider-neutral `CodingSessionEvent` values: portable
`AgentEvent` values from `tau_agent.events` plus session-level values from
`tau_coding.events` (see [the agent loop]({{< relref "./agent-loop.md" >}})).
Render from these, never from provider-specific chunks. Use `agent_start` to
enter the running state and `agent_settled`—not merely `agent_end`—to leave it,
because automatic compaction, retry, or queued continuation may follow an
`agent_end`. Provider failures arrive as assistant messages whose
`stop_reason` is `"error"`, followed by the normal turn/run lifecycle.

[译文]
该事件流产出与 provider 无关的 `CodingSessionEvent` 值:来自 `tau_agent.events` 的可移植 `AgentEvent` 值,加上来自 `tau_coding.events` 的会话级值(见 [agent 循环]({{< relref "./agent-loop.md" >}}))。请从这些值渲染,绝不从 provider 特有的分块渲染。用 `agent_start` 进入运行状态,用 `agent_settled` —— 而不仅仅是 `agent_end` —— 离开该状态,因为 `agent_end` 之后可能跟随自动压缩、重试或排队中的续跑。Provider 失败会以助手消息的形式到达,其 `stop_reason` 为 `"error"`,随后是正常的轮次/运行生命周期。

## 插话与追加消息(Steering and follow-ups)

[原文]
If the user submits while a run is active, queue instead of starting a second
run:

```python
async for event in session.prompt(user_text, streaming_behavior="steer"):
    adapter.apply(event); redraw(state)
```

[译文]
如果用户在一次运行进行中提交,请排队,而不是启动第二次运行:

[原文]
Use `streaming_behavior="follow_up"` for a prompt that waits until the run would
otherwise stop. Overlapping `session.prompt(...)` calls without
`streaming_behavior` are rejected so two runs can't mutate one transcript.
`QueueUpdateEvent` carries pending queued text for badges/status.

[译文]
对于「等到当前运行本来要停止时再执行」的提示词,请使用 `streaming_behavior="follow_up"`。不带 `streaming_behavior` 的重叠 `session.prompt(...)` 调用会被拒绝,以免两次运行同时改动同一份会话记录。`QueueUpdateEvent` 携带排队中的文本,可用于徽标/状态显示。

## 斜杠命令(Slash commands)

[原文]
Slash commands belong to `tau_coding`. Before treating input as a prompt:

```python
result = session.handle_command(text)
```

[译文]
斜杠命令属于 `tau_coding`。在把输入当作提示词之前,先:

[原文]
If `result.handled`, apply the requested effect (`exit_requested`,
`clear_requested`, `new_session_requested`, `compact_summary`, `message`) and
show reference/status output *outside* the durable conversation. If
`result.compact_summary is not None`, call `await session.compact(result.compact_summary)`
(an empty string means "use the built-in prompt as-is").

[译文]
如果 `result.handled` 为真,请应用所请求的效果(`exit_requested`、`clear_requested`、`new_session_requested`、`compact_summary`、`message`),并把参考/状态输出显示在持久对话*之外*。如果 `result.compact_summary is not None`,请调用 `await session.compact(result.compact_summary)`(空字符串表示「按原样使用内置提示词」)。

[原文]
`/skill:<name>` is intentionally **not** a command — pass it through to
`session.prompt(...)`, which expands it before the run.

[译文]
`/skill:<name>` 有意**不是**一条命令 —— 请把它透传给 `session.prompt(...)`,后者会在运行之前展开它。

## 恢复与切换会话(Restoring and switching sessions)

[原文]
Initialize the visible transcript from `session.messages` (the built-in
`TuiState.load_messages()` is a reference). `ToolResultMessage` preserves
structured metadata (e.g. edit patches), so you can render restored tool results
without reading JSONL directly.

[译文]
用 `session.messages` 初始化可见的会话记录(内置的 `TuiState.load_messages()` 可作为参考)。`ToolResultMessage` 保留了结构化元数据(例如编辑 patch),因此你无需直接读取 JSONL 就能渲染恢复出来的工具结果。

[原文]
For session switching, use `tau_coding.session_manager.SessionManager` —
`list_sessions(session.cwd)`, then `await session.resume(session_id)` (or load a
fresh `CodingSession` with `storage=jsonl_session_storage(record.path)`), then
rebuild the transcript from `session.messages`.

[译文]
会话切换请使用 `tau_coding.session_manager.SessionManager` —— 先 `list_sessions(session.cwd)`,再 `await session.resume(session_id)`(或用 `storage=jsonl_session_storage(record.path)` 加载一个新的 `CodingSession`),然后从 `session.messages` 重建会话记录。

## 取消、选择器、快捷键(Cancellation, pickers, keybindings)

[原文]
- Cancel with `session.cancel()` — keep consuming events until the stream ends.
- Read picker data directly from the session: `command_registry.list_commands()`,
  `skills`, `prompt_templates`, `available_model_choices`, `available_models`,
  `available_providers`, `thinking_level`, `available_thinking_levels`,
  `session_manager`. For model changes from another provider, call
  `set_provider(...)` then `set_model(...)`.
- Keybindings and themes are **frontend policy**. The built-in app reads
  `~/.tau/tui.json` via `tau_coding.tui.load_tui_settings()`, but your UI can
  ignore it.

[译文]
- 用 `session.cancel()` 取消 —— 继续消费事件,直到事件流结束。
- 直接从会话读取选择器数据:`command_registry.list_commands()`、`skills`、`prompt_templates`、`available_model_choices`、`available_models`、`available_providers`、`thinking_level`、`available_thinking_levels`、`session_manager`。若要切换到另一个 provider 的模型,请先调用 `set_provider(...)`,再调用 `set_model(...)`。
- 快捷键与主题属于**前端策略**。内置应用会通过 `tau_coding.tui.load_tui_settings()` 读取 `~/.tau/tui.json`,但你的 UI 可以忽略它。

## 不要依赖什么(What not to depend on)

[原文]
Avoid coupling to private `CodingSession` attributes, provider-specific response
chunks, Textual internals, or the raw JSONL structure (use `SessionManager` /
`CodingSession`). Stick to the event, message, tool, harness, and session
primitives.

[译文]
不要耦合到 `CodingSession` 的私有属性、provider 特有的响应分块、Textual 内部实现或原始 JSONL 结构(请使用 `SessionManager` / `CodingSession`)。请坚持使用事件、消息、工具、harness 与会话这些原语。

[原文]
{{% note %}}
The full per-phase build journals for these systems live in the repo under
`dev-notes/` (see [Contributing]({{< relref "../contributing.md" >}})).
{{% /note %}}

[译文]
{{% note %}}
这些系统的完整逐阶段构建日志保存在仓库的 `dev-notes/` 下(见[贡献指南]({{< relref "../contributing.md" >}}))。
{{% /note %}}
