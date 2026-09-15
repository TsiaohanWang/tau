---
title: "Phase 1: Core Types and Events / 阶段 1:核心类型与事件"
---

[原文]
Phase 1 creates the shared vocabulary for Tau's future agent loop.

[译文]
阶段 1 为 Tau 未来的 agent 循环建立了共享词汇表。

[原文]
Before Tau can talk to a model, execute tools, save sessions, or render a UI, every layer needs to agree on the shape of the data flowing through the system. That is what the core message, tool, JSON, and event types provide.

[译文]
在 Tau 能与模型对话、执行工具、保存会话或渲染 UI 之前,每一层都必须对系统中流动的数据形态达成一致。核心的消息、工具、JSON 与事件类型正是为此而生。

## 新增了什么(What was added)

[原文]
Phase 1 added four modules in `tau_agent`:

[译文]
阶段 1 在 `tau_agent` 中新增了四个模块:

```text
src/tau_agent/types.py      JSON-like shared type aliases
src/tau_agent/messages.py   transcript message models
src/tau_agent/tools.py      tool calls, tools, and tool results
src/tau_agent/events.py     event models emitted by the agent layer
```

[原文]
These modules are provider-neutral and UI-neutral. They do not mention Anthropic, OpenAI, Rich, Textual, Typer, local files, or terminal rendering.

[译文]
这些模块与 provider 无关、与 UI 无关。它们不提及 Anthropic、OpenAI、Rich、Textual、Typer、本地文件或终端渲染。

## 为什么需要消息(Why messages exist)

[原文]
Messages represent the transcript: the conversation state that the agent and model work with.

[译文]
消息代表会话记录(transcript):即 agent 与模型共同处理的对话状态。

[原文]
Tau currently defines:

- `UserMessage`
- `AssistantMessage`
- `ToolResultMessage`
- `AgentMessage`

[译文]
Tau 目前定义了:

- `UserMessage`
- `AssistantMessage`
- `ToolResultMessage`
- `AgentMessage`

### `UserMessage`

[原文]
A `UserMessage` stores text written by the user.

[译文]
`UserMessage` 保存用户写下的文本。

```python
UserMessage(content="Read README.md")
```

[原文]
Later, the harness will append one of these whenever a user submits a prompt.

[译文]
之后,每当用户提交一次提示,harness 就会追加一条这样的消息。

### `AssistantMessage`

[原文]
An `AssistantMessage` stores assistant text and optional tool calls.

[译文]
`AssistantMessage` 保存 assistant 的文本以及可选的工具调用。

```python
AssistantMessage(
    content="I'll inspect the README.",
    tool_calls=[...],
)
```

[原文]
This is important because assistants can do two things in one turn:

1. produce visible text
2. request tool execution

[译文]
这一点很重要,因为 assistant 可以在一轮中做两件事:

1. 产生可见文本
2. 请求执行工具

[原文]
The future agent loop will collect streamed model output into an `AssistantMessage`.
If the message has tool calls, the loop will execute those tools and continue.

[译文]
未来的 agent 循环会把流式输出的模型内容收集进一个 `AssistantMessage`。
如果该消息带有工具调用,循环会执行这些工具并继续。

### `ToolResultMessage`

[原文]
A `ToolResultMessage` stores the result of a specific tool call.

[译文]
`ToolResultMessage` 保存某次具体工具调用的结果。

```python
ToolResultMessage(
    tool_call_id="call-1",
    name="read",
    content="file contents...",
    ok=True,
)
```

[原文]
The model needs tool results in the transcript so it can continue reasoning after a tool runs. For example:

[译文]
模型需要会话记录中的工具结果,才能在工具运行后继续推理。例如:

```text
User asks to read README.md
Assistant calls read
Tau executes read
Tau appends ToolResultMessage
Assistant sees file contents and answers
```

### `AgentMessage`

[原文]
`AgentMessage` is the union of all message types. It lets later APIs accept a transcript as:

[译文]
`AgentMessage` 是所有消息类型的联合。它让后续 API 可以这样接收一份会话记录:

```python
list[AgentMessage]
```

[原文]
without caring whether each item is from the user, assistant, or a tool.

[译文]
而无需关心每一项来自用户、assistant 还是工具。

## 为什么需要工具类型(Why tool types exist)

[原文]
Tools are how the assistant asks Tau to interact with the environment.

[译文]
工具是 assistant 请求 Tau 与环境交互的方式。

[原文]
Tau currently defines:

- `ToolCall`
- `AgentTool`
- `AgentToolResult`

[译文]
Tau 目前定义了:

- `ToolCall`
- `AgentTool`
- `AgentToolResult`

### `ToolCall`

[原文]
A `ToolCall` is not the tool itself. It is a request to run a named tool with JSON-like arguments.

[译文]
`ToolCall` 不是工具本身,而是一个请求:用类 JSON 参数运行某个具名工具。

```python
ToolCall(
    id="call-1",
    name="read",
    arguments={"path": "README.md"},
)
```

[原文]
Future provider adapters will translate provider-specific tool call payloads into this neutral Tau shape.

[译文]
未来的 provider 适配器会把各 provider 特有的工具调用载荷翻译成这种中立的 Tau 形态。

### `AgentTool`

[原文]
An `AgentTool` describes a tool Tau can expose to a model.

[译文]
`AgentTool` 描述一个 Tau 可以暴露给模型的工具。

[原文]
It contains:

- a `name`
- a human-readable `description`
- an `input_schema`
- an async `executor`

[译文]
它包含:

- 一个 `name`
- 人类可读的 `description`
- 一个 `input_schema`
- 一个异步 `executor`

[原文]
The coding-agent layer will later register built-in tools like:

- `read`
- `write`
- `edit`
- `bash`

[译文]
编码 agent 层之后会注册这样的内置工具:

- `read`
- `write`
- `edit`
- `bash`

[原文]
But the portable agent loop only needs to know that an `AgentTool` can be executed with arguments and returns an `AgentToolResult`.

[译文]
但可移植的 agent 循环只需要知道:`AgentTool` 可以用参数执行,并返回一个 `AgentToolResult`。

### `AgentToolResult`

[原文]
An `AgentToolResult` is the structured output from a tool execution.

[译文]
`AgentToolResult` 是工具执行产生的结构化输出。

```python
AgentToolResult(
    tool_call_id="call-1",
    name="read",
    ok=True,
    content="file contents...",
)
```

[原文]
Later, the loop will convert tool results into `ToolResultMessage` objects and append them to the transcript.

[译文]
之后,循环会把工具结果转换成 `ToolResultMessage` 对象,并追加到会话记录中。

## 为什么需要 JSON 类型(Why JSON types exist)

[原文]
Tool arguments and provider payloads need to be JSON-like because model APIs exchange structured data as JSON.

[译文]
工具参数与 provider 载荷必须是类 JSON 的,因为模型 API 之间以 JSON 交换结构化数据。

[原文]
Tau defines shared aliases for:

- `JSONPrimitive`
- `JSONValue`
- `JSONObject`

[译文]
Tau 定义了这些共享别名:

- `JSONPrimitive`
- `JSONValue`
- `JSONObject`

[原文]
These keep tool schemas, tool arguments, event data, and provider-neutral payloads type-safe without tying them to a specific provider SDK.

[译文]
它们让工具 schema、工具参数、事件数据以及 provider 无关载荷保持类型安全,又不必绑定到某个具体 provider 的 SDK。

## 为什么需要事件(Why events exist)

[原文]
Events are how the reusable agent layer reports progress without knowing who is listening.

[译文]
事件是可复用 agent 层报告进度的方式,而且无需知道谁在监听。

[原文]
This is the key design:

```text
Agent loop emits events
        ↓
CLI print mode consumes events
Rich renderers consume events
Textual TUI consumes events
Tests can inspect events
```

[译文]
这是关键设计:

```text
Agent 循环发出事件
        ↓
CLI print 模式消费事件
Rich 渲染器消费事件
Textual TUI 消费事件
测试可以检查事件
```

[原文]
Tau currently defines events for:

- agent start/end
- turn start/end
- assistant message start/delta/end
- tool execution start/update/end
- errors

[译文]
Tau 目前定义的事件涵盖:

- agent 开始/结束
- 轮次开始/结束
- assistant 消息 开始/增量/结束
- 工具执行 开始/更新/结束
- 错误

## 未来事件如何流动(How events will flow in the future)

[原文]
A future prompt run might produce this sequence:

[译文]
未来一次提示运行可能产生这样的序列:

```text
agent_start
turn_start
message_start
message_delta       "I'll inspect the file."
message_end         AssistantMessage(... tool_calls=[read])
tool_execution_start
tool_execution_end  AgentToolResult(...)
turn_end
turn_start
message_start
message_delta       "The README says..."
message_end         AssistantMessage(... no tool calls)
turn_end
agent_end
```

[原文]
The important part is that the same event stream can power multiple frontends.
The core loop does not need `print()`, Rich panels, or Textual widgets.

[译文]
关键在于:同一个事件流可以驱动多个前端。
核心循环不需要 `print()`、Rich 面板或 Textual 组件。

## 阶段 1 如何支撑后续阶段(How Phase 1 supports later phases)

### 阶段 2:provider 层(Phase 2: provider layer)

[原文]
Providers translate external model streams into Tau messages, tool calls, and
provider-neutral events.

[译文]
Provider 把外部模型流翻译成 Tau 消息、工具调用以及 provider 无关事件。

### 阶段 3:纯 agent 循环(Phase 3: pure agent loop)

[原文]
The loop uses these types to:

1. send messages to a provider
2. collect assistant output
3. detect tool calls
4. execute `AgentTool`s
5. append `ToolResultMessage`s
6. emit `AgentEvent`s throughout

[译文]
循环使用这些类型来:

1. 向 provider 发送消息
2. 收集 assistant 输出
3. 检测工具调用
4. 执行 `AgentTool`
5. 追加 `ToolResultMessage`
6. 在整个过程中发出 `AgentEvent`

### 阶段 4:harness(Phase 4: harness)

[原文]
The harness maintains a transcript of `AgentMessage` objects and exposes
higher-level methods like `prompt()` and `continue_()`.

[译文]
Harness 维护一份由 `AgentMessage` 对象组成的会话记录,并暴露 `prompt()`、`continue_()` 等更高层方法。

### 阶段 6 及以后:UI(Phase 6 and beyond: UI)

[原文]
Print mode, Rich rendering, JSON event streaming, and Textual consume
`AgentEvent`s rather than reaching into loop, provider, or harness internals.

[译文]
Print 模式、Rich 渲染、JSON 事件流与 Textual 消费的都是 `AgentEvent`,而不是深入循环、provider 或 harness 的内部实现。

### 阶段 7:会话(Phase 7: sessions)

[原文]
Session persistence saves and replays message objects and related state changes.
The message models give that persistence layer a stable base.

[译文]
会话持久化负责保存并重放消息对象及相关状态变更。
这些消息模型为该持久化层提供了稳定的基础。

## 设计规则(Design rule)

[原文]
If a type belongs to the reusable agent brain, it lives in `tau_agent`.
If a type knows about command-line behavior, project files, slash commands, prompts, or UI rendering, it belongs outside the core agent package.

[译文]
如果一个类型属于可复用的 agent 大脑,它就应该放在 `tau_agent`。
如果一个类型了解命令行行为、项目文件、斜杠命令、提示词或 UI 渲染,它就应该放在核心 agent 包之外。
