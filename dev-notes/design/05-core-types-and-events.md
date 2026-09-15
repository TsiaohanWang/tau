---
title: "05 — Core Types and Events / 05 —— 核心类型与事件"
---

[原文]
Phase 1 defines the provider-neutral objects that later Tau phases share.

[译文]
阶段 1 定义了后续 Tau 各阶段共享的、与 provider 无关的对象。

## 为什么需要这些类型(Why these types exist)

[原文]
The provider layer, agent loop, harness, tools, sessions, and UI should not exchange provider-specific objects.
Instead, they use Tau's own message, tool, result, and event models.

[译文]
Provider 层、agent 循环、harness、工具、会话与 UI 之间不应交换 provider 特有的对象。
它们改用 Tau 自己的消息、工具、结果与事件模型。

## 消息(Messages)

[原文]
Messages live in `tau_agent.messages`:

- `UserMessage` records user input.
- `AssistantMessage` records assistant text and optional tool calls.
- `ToolResultMessage` records the result of a specific tool call.
- `AgentMessage` is the union of all transcript message types.

[译文]
消息定义在 `tau_agent.messages`:

- `UserMessage` 记录用户输入。
- `AssistantMessage` 记录 assistant 文本以及可选的工具调用。
- `ToolResultMessage` 记录某次具体工具调用的结果。
- `AgentMessage` 是所有会话记录消息类型的联合。

[原文]
These are the objects that will eventually be passed to model providers and persisted in sessions.

[译文]
这些对象最终会传给模型 provider,并持久化到会话中。

## 工具(Tools)

[原文]
Tools live in `tau_agent.tools`:

- `ToolCall` is the assistant's request to execute a named tool with JSON-like arguments.
- `AgentTool` describes an executable tool: name, description, input schema, and async executor.
- `AgentToolResult` is the structured response from running a tool.

[译文]
工具定义在 `tau_agent.tools`:

- `ToolCall` 是 assistant 发出的请求:用类 JSON 参数执行某个具名工具。
- `AgentTool` 描述一个可执行工具:名称、描述、输入 schema 与异步执行器。
- `AgentToolResult` 是工具运行后返回的结构化响应。

[原文]
The core types do not implement coding tools. Built-in tools such as `read`,
`write`, `edit`, and `bash` live under the coding-agent application layer in
`tau_coding`.

[译文]
核心类型不实现编码工具。`read`、`write`、`edit`、`bash` 等内置工具位于 `tau_coding` 的编码 agent 应用层。

## 事件(Events)

[原文]
Events live in `tau_agent.events`. They describe progress from the portable agent layer:

- `agent_start`
- `agent_end`
- `turn_start`
- `turn_end`
- `queue_update`
- `retry`
- `message_start`
- `message_delta`
- `thinking_delta`
- `message_end`
- `tool_execution_start`
- `tool_execution_update`
- `tool_execution_end`
- `error`

[译文]
事件定义在 `tau_agent.events`。它们描述可移植 agent 层的进度:

- `agent_start`
- `agent_end`
- `turn_start`
- `turn_end`
- `queue_update`
- `retry`
- `message_start`
- `message_delta`
- `thinking_delta`
- `message_end`
- `tool_execution_start`
- `tool_execution_update`
- `tool_execution_end`
- `error`

[原文]
Print mode, Rich renderers, JSON event streaming, and the Textual TUI all
consume the same event stream.

[译文]
Print 模式、Rich 渲染器、JSON 事件流以及 Textual TUI 消费的都是同一个事件流。

[原文]
`queue_update` reports pending steering/follow-up prompts. `retry` reports
provider retry progress. `thinking_delta` carries optional streamed reasoning
text from providers that expose it; frontends decide whether to show it, and it
is not recorded as durable assistant message text.

[译文]
`queue_update` 报告待处理的插话/追加提示。`retry` 报告 provider 重试进度。`thinking_delta` 携带来自支持该能力的 provider 的可选流式推理文本;是否展示由前端决定,且它不会被记录为持久化的 assistant 消息文本。

## 设计边界(Design boundary)

[原文]
These models are intentionally small and provider-neutral. Provider adapters
translate Anthropic, OpenAI-compatible, OpenAI Codex subscription, or other API
payloads into Tau types before the agent loop or frontends see them.

[译文]
这些模型刻意保持小巧且与 provider 无关。Provider 适配器会在 agent 循环或前端看到数据之前,把 Anthropic、OpenAI 兼容、OpenAI Codex 订阅或其他 API 的载荷翻译成 Tau 类型。
