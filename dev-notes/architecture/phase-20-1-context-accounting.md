---
title: "Phase 20.1: Context Accounting Refresh / 阶段 20.1:上下文计量刷新"
---

[原文]
Phase 20.1 tightens Tau's context accounting and makes TUI refreshes follow the
same event stream that updates the active agent transcript.

[译文]
阶段 20.1 收紧了 Tau 的上下文计量,并让 TUI 刷新跟随同一条更新活动 agent 会话记录的事件流。

## 新增了什么(What Was Added)

[原文]
`tau_coding.context_window` now exposes `ContextUsageEstimate`, a structured
snapshot with:

[译文]
`tau_coding.context_window` 现在暴露 `ContextUsageEstimate`,这是一个结构化快照,包含:

```text
total_tokens
system_tokens
message_tokens
tool_tokens
message_count
tool_count
```

[原文]
`CodingSession.context_usage` returns that snapshot for the active provider
context. The older `context_token_estimate` property remains as a compatibility
shortcut for commands, widgets, and tests that only need the total.

[译文]
`CodingSession.context_usage` 为活动 provider 上下文返回该快照。此前的 `context_token_estimate` 属性仍作为兼容快捷方式保留,供只需要总数的命令、组件与测试使用。

[原文]
`/status` still prints:

[译文]
`/status` 仍然打印:

```text
Estimated context tokens: <count>
```

[原文]
It also includes a stable token breakdown for system prompt, messages, and tool
definitions.

[译文]
它还会给出稳定的 token 明细:系统提示词、消息与工具定义。

## Prompt 消息事件(Prompt Message Events)

[原文]
Prompt runs now emit portable message events for the user prompt:

[译文]
提示运行现在会为用户提示发出可移植的消息事件:

```text
agent_start
turn_start
message_start user
message_end user
...
```

[原文]
This mirrors Pi's loop behavior: the prompt is added to context, then the event
stream reports that message before assistant streaming begins. Direct low-level
`run_agent_loop()` callers are unchanged; they still pass an already prepared
message list and receive assistant/tool loop events only.

[译文]
这镜像了 Pi 的循环行为:提示先被加入上下文,然后事件流在 assistant 流式输出开始之前报告该消息。直接调用底层 `run_agent_loop()` 的调用方不受影响:它们仍然传入已准备好的消息列表,并且只接收 assistant/工具循环事件。

## TUI 刷新边界(TUI Refresh Boundary)

[原文]
The Textual app no longer pre-adds submitted user prompts to the visible
transcript. Instead, `TuiEventAdapter` renders user, assistant, and tool
messages from the streamed events. Because `_refresh()` runs after each event,
the sidebar and compact session line now observe context changes after:

[译文]
Textual 应用不再预先把手动提交的用户提示加入可见会话记录。相反,`TuiEventAdapter` 根据流式事件渲染用户、assistant 与工具消息。由于 `_refresh()` 在每个事件之后运行,侧边栏与紧凑会话行现在能在以下时机观察到上下文变化:

[原文]
- the submitted user message
- assistant message completion
- tool result insertion
- manual or automatic compaction
- session resume/new-session replacement

[译文]
- 提交的用户消息
- assistant 消息完成
- 工具结果插入
- 手动或自动压缩
- 会话恢复/新建会话替换

[原文]
This keeps the reusable `tau_agent` package UI-free: it only emits portable
events. Textual-specific rendering remains in `tau_coding.tui`.

[译文]
这使可复用的 `tau_agent` 包保持无 UI:它只发出可移植事件。Textual 特有的渲染仍然留在 `tau_coding.tui`。

## 测试(Tests)

[原文]
The phase is covered by:

[译文]
本阶段的测试覆盖为:

```text
tests/test_agent_harness.py
tests/test_context_window.py
tests/test_coding_session.py
tests/test_tui_adapter.py
tests/test_tui_app.py
```

[原文]
The tests verify that context usage is recalculated after normal turns,
compaction, and resumed sessions, and that TUI refreshes see the changed context
estimate at each streamed message/tool boundary.

[译文]
测试验证:在普通轮次、压缩与恢复会话之后,上下文用量都会被重新计算;并且 TUI 刷新能在每个流式消息/工具边界看到变化后的上下文估算值。
