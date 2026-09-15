---
title: "The agent loop & events / Agent 循环与事件"
description: "The small engine at Tau's center, and the event stream every frontend renders. / Tau 中心的小引擎,以及每个前端都在渲染的事件流。"
---

[原文]
The **agent loop** is the small, reusable engine that turns messages, tools, and
provider streams into a flow of progress **events**. It's the part that makes
something an *agent* rather than a chat box.

[译文]
**Agent 循环**是一个小巧、可复用的引擎,它把消息、工具与 provider 流转变成一连串进度**事件**。正是它让一个东西成为 *agent*,而不是一个聊天框。

## 循环做什么(What the loop does)

[原文]
For each turn, the loop:

[译文]
对每一轮,循环会:

[原文]
1. takes the current system prompt, transcript, tools, and model selection;
2. asks the provider to stream a response;
3. emits events as text and tool calls arrive;
4. collects the assistant message;
5. executes any requested tools;
6. appends the tool results to the transcript;
7. repeats until the assistant produces no more tool calls.

[译文]
1. 取当前的系统提示词、会话记录、工具与模型选择;
2. 请求 provider 流式返回响应;
3. 在文本与工具调用到达时发出事件;
4. 收集 assistant 消息;
5. 执行被请求的工具;
6. 把工具结果追加到会话记录;
7. 重复,直到 assistant 不再产生工具调用。

[原文]
That "call a tool, feed the result back, continue" cycle is what lets the model
read a file, see its contents, and then decide what to edit.

[译文]
正是「调用工具 → 回喂结果 → 继续」这一循环,让模型能够读取文件、看到内容,然后决定改什么。

## 循环*不*做什么(What the loop does *not* do)

[原文]
The loop knows nothing about CLI arguments, Textual widgets, session file
locations, or resource discovery. Those belong to `tau_coding`. Keeping them out
is what makes the loop reusable across every frontend.

[译文]
循环不了解 CLI 参数、Textual 组件、会话文件位置或资源发现。那些都属于 `tau_coding`。把它们挡在外面,才使循环能在所有前端之间复用。

## 事件优先设计(Event-first design)

[原文]
Every meaningful step is observable as an event, so print mode, Rich rendering,
and the Textual TUI all share the same core. Frontends render from these
provider-neutral events — never from raw provider chunks. The portable `tau_agent.events.AgentEvent` stream contains:

[译文]
每个有意义的步骤都可以作为事件被观察到,因此 print 模式、Rich 渲染与 Textual TUI 共享同一个内核。前端从这些 provider 无关的事件渲染 —— 绝不从原始 provider 分片渲染。可移植的 `tau_agent.events.AgentEvent` 流包含:

[原文]
- `AgentStartEvent` / `AgentEndEvent` — a run begins / ends
- `TurnStartEvent` / `TurnEndEvent` — one assistant response and its tool results
- `MessageStartEvent` / `MessageUpdateEvent` / `MessageEndEvent` — a message's
  Pi-compatible lifecycle
- `ToolExecutionStartEvent` / `ToolExecutionUpdateEvent` / `ToolExecutionEndEvent`
  — a tool runs

[译文]
- `AgentStartEvent` / `AgentEndEvent` —— 一次运行开始 / 结束
- `TurnStartEvent` / `TurnEndEvent` —— 一次 assistant 响应及其工具结果
- `MessageStartEvent` / `MessageUpdateEvent` / `MessageEndEvent` —— 一条消息的
  Pi 兼容生命周期
- `ToolExecutionStartEvent` / `ToolExecutionUpdateEvent` / `ToolExecutionEndEvent`
  —— 一次工具执行

[原文]
Streaming detail is nested under
`MessageUpdateEvent.assistant_message_event`. Those provider-neutral nested
events cover text, thinking, and tool-call start/delta/end updates. Provider
completion or failure is represented by the final assistant message delivered
through `MessageEndEvent`.

[译文]
流式细节嵌套在 `MessageUpdateEvent.assistant_message_event` 之下。这些 provider 无关的嵌套事件覆盖文本、thinking 与工具调用的 start/delta/end 更新。Provider 的完成或失败,由通过 `MessageEndEvent` 投递的最终 assistant 消息表示。

[原文]
`tau_coding.events.CodingSessionEvent` extends that portable stream for
frontends and SDK users with `agent_settled`, queue updates, compaction,
session-entry/session-info changes, thinking-level changes, and automatic-retry
events. Extensions observe those same event names, but the session-to-extension
adapter enriches `turn_start` with a zero-based `turn_index` and millisecond
`timestamp`, and `turn_end` with the matching index. See
[Extensions]({{< relref "../guides/extensions.md#events" >}}) for their complete
payload table.

[译文]
`tau_coding.events.CodingSessionEvent` 为前端与 SDK 用户扩展了那条可移植事件流,增加了 `agent_settled`、队列更新、压缩、会话条目/会话信息变更、thinking 等级变更与自动重试事件。扩展观察的是同一批事件名,但「会话到扩展」的适配器会为 `turn_start` 补充从零开始的 `turn_index` 与毫秒级 `timestamp`,并为 `turn_end` 补充对应的索引。完整载荷表见[扩展]({{< relref "../guides/extensions.md#events" >}})。

[原文]
The final `AssistantMessage` is authoritative: it persists text, thinking, and tool
calls as ordered content blocks. Nested update events provide responsive rendering,
while saved sessions and provider history replay use the finalized structured message.
It also carries optional monotonic response timing: accumulated time awaiting
provider events through completion and through the first text, thinking, or
tool-call output. Measuring only provider-event awaits excludes frontend rendering
and persistence work between stream pulls. Saved usage and timing remain paired for
effective output-speed and TTFT statistics.
Its `provider` field names Tau's configured provider. When a gateway reports a
more specific backend, `response_provider` records the backend that served that
request. For example, Hugging Face responses expose the selected Inference
Provider there while `provider` remains `huggingface`.

[译文]
最终 `AssistantMessage` 是权威的:它把文本、thinking 与工具调用持久化为有序内容块。嵌套更新事件提供响应式渲染,而已保存的会话与 provider 历史重放使用的是定稿后的结构化消息。它还携带可选的单调响应计时:累计的等待 provider 事件的时间 —— 直到完成,以及直到首次文本、thinking 或工具调用输出。只计量等待 provider 事件的时间,排除了两次拉流之间前端的渲染与持久化工作。已保存的用量与计时保持配对,用于有效输出速度与 TTFT 统计。
它的 `provider` 字段记录 Tau 配置的 provider。当网关报告了更具体的后端时,`response_provider` 记录服务该请求的后端。例如 Hugging Face 的响应会在那里暴露所选 Inference Provider,而 `provider` 仍是 `huggingface`。

[原文]
Because the contract is *events*, a frontend's job is reduced to: send a prompt,
consume the stream, draw what you see.

[译文]
由于契约是*事件*,前端的工作被缩减为:发送提示、消费事件流、把你看到的东西画出来。

[原文]
→ See [Build your own frontend]({{< relref "./custom-frontend.md" >}}) for the concrete API, and
[Architecture overview]({{< relref "./architecture.md" >}}) for where the loop sits.

[译文]
→ 具体 API 见[构建你自己的前端]({{< relref "./custom-frontend.md" >}});循环在架构中的位置见[架构总览]({{< relref "./architecture.md" >}})。
