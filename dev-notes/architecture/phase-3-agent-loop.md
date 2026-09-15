---
title: "Phase 3: Pure Agent Loop / 阶段 3:纯 Agent 循环"
---

[原文]
Phase 3 adds Tau's first real agent engine: a pure loop that connects a model provider, a transcript, and a set of tools.

[译文]
阶段 3 加入了 Tau 第一个真正的 agent 引擎:一个连接模型 provider、会话记录与工具集的纯循环。

[原文]
The loop lives in:

[译文]
该循环位于:

```text
src/tau_agent/loop.py
```

[原文]
It is called “pure” because it does not know about the CLI, Rich, Textual, slash commands, local session files, or project-specific resources. It only works with provider-neutral Tau types.

[译文]
它被称为「纯」循环,是因为它不了解 CLI、Rich、Textual、斜杠命令、本地会话文件或项目特有资源。它只与 provider 无关的 Tau 类型打交道。

## 新增了什么(What was added)

[原文]
Phase 3 added:

- `run_agent_loop()`
- transcript mutation for assistant messages and tool results
- provider-event to agent-event conversion
- sequential tool execution
- unknown-tool handling
- tool-exception handling
- provider-error handling
- optional max-turn protection

[译文]
阶段 3 新增了:

- `run_agent_loop()`
- 针对 assistant 消息与工具结果的会话记录修改
- provider 事件到 agent 事件的转换
- 顺序执行工具
- 未知工具的处理
- 工具异常的处理
- provider 错误的处理
- 可选的 max-turn 保护

[原文]
Later hardening added queue-drain hooks for steering/follow-up prompts and
provider-neutral forwarding for retry and thinking/reasoning progress events.

[译文]
后续加固又加入了用于插话/追加提示的队列排空钩子,以及针对重试与 thinking/推理进度事件的 provider 无关转发。

## 循环的输入(The loop's inputs)

[原文]
`run_agent_loop()` receives:

- a `ModelProvider`
- a model name
- a system prompt
- a mutable list of `AgentMessage` objects
- a list of registered `AgentTool` objects
- an optional maximum turn count
- an optional cancellation token
- optional steering/follow-up queue drain callbacks
- an optional queue-state callback for `QueueUpdateEvent`

[译文]
`run_agent_loop()` 接收:

- 一个 `ModelProvider`
- 一个模型名
- 一个系统提示词
- 一个可变的 `AgentMessage` 对象列表
- 一个已注册的 `AgentTool` 对象列表
- 可选的最大轮次数
- 可选的取消令牌
- 可选的插话/追加队列排空回调
- 可选的队列状态回调(用于 `QueueUpdateEvent`)

[原文]
Conceptually:

[译文]
概念上:

```python
async for event in run_agent_loop(
    provider=provider,
    model="...",
    system="...",
    messages=messages,
    tools=tools,
):
    ...
```

[原文]
The caller owns the transcript. The loop appends to that transcript as work completes.

[译文]
调用方拥有会话记录。循环在工作完成时向该记录追加内容。

## 基础纯文本流程(Basic text-only flow)

[原文]
For a normal response with no tool calls, the flow is:

[译文]
对于没有工具调用的普通响应,流程如下:

```text
agent_start
turn_start
message_start
message_delta
message_delta
message_end
turn_end
agent_end
```

[原文]
Internally:

1. The loop asks the provider to stream a model response.
2. Provider text deltas become `MessageDeltaEvent`s.
3. The final provider response becomes an `AssistantMessage`.
4. The assistant message is appended to the transcript.
5. The loop stops because there are no tool calls.

[译文]
内部实现上:

1. 循环请求 provider 流式返回模型响应。
2. Provider 的文本增量变成 `MessageDeltaEvent`。
3. Provider 的最终响应变成一条 `AssistantMessage`。
4. 这条 assistant 消息被追加到会话记录。
5. 由于没有工具调用,循环停止。

## 工具调用流程(Tool-call flow)

[原文]
If the assistant asks for tools, the loop executes them before stopping.

[译文]
如果 assistant 请求了工具,循环会在停止之前先执行它们。

[原文]
Example assistant message:

[译文]
示例 assistant 消息:

```python
AssistantMessage(
    content="I'll inspect that file.",
    tool_calls=[
        ToolCall(id="call-1", name="read", arguments={"path": "README.md"})
    ],
)
```

[原文]
The loop then:

1. finds the registered `AgentTool` named `read`
2. emits `tool_execution_start`
3. executes the tool asynchronously
4. emits `tool_execution_end`
5. appends a `ToolResultMessage`
6. starts another model turn

[译文]
循环随后会:

1. 找到名为 `read` 的已注册 `AgentTool`
2. 发出 `tool_execution_start`
3. 异步执行该工具
4. 发出 `tool_execution_end`
5. 追加一条 `ToolResultMessage`
6. 开始下一轮模型调用

[原文]
That second model turn sees the updated transcript:

[译文]
这一轮新的模型调用会看到更新后的会话记录:

```text
UserMessage
AssistantMessage with tool call
ToolResultMessage
```

[原文]
and can produce a final answer.

[译文]
并据此给出最终回答。

## 为什么循环要修改会话记录(Why the loop mutates the transcript)

[原文]
The loop accepts a mutable `messages` list and appends new messages to it.

[译文]
循环接受一个可变的 `messages` 列表,并向其中追加新消息。

[原文]
This keeps the loop mostly stateless. Later, `AgentHarness` can own the transcript and pass it into the loop. The loop does not need to know where messages came from or how they will be persisted.

[译文]
这让循环基本保持无状态。之后,`AgentHarness` 可以持有会话记录并把它传入循环。循环无需知道消息从何而来、又将如何持久化。

## Provider 事件 vs Agent 事件(Provider events vs agent events)

[原文]
Phase 2 introduced provider events such as:

- `response_start`
- `text_delta`
- `response_end`
- `error`

[译文]
阶段 2 引入了这样的 provider 事件:

- `response_start`
- `text_delta`
- `response_end`
- `error`

[原文]
Phase 3 converts those into higher-level agent events:

[译文]
阶段 3 把它们转换成更高层的 agent 事件:

```text
ProviderResponseStartEvent  -> MessageStartEvent
ProviderTextDeltaEvent      -> MessageDeltaEvent
ProviderResponseEndEvent    -> MessageEndEvent
ProviderErrorEvent          -> ErrorEvent
```

[原文]
This means UI layers can listen to agent events without knowing about provider internals.

[译文]
这意味着 UI 层可以监听 agent 事件,而无需了解 provider 内部细节。

[原文]
Later provider adapters also translate:

[译文]
后续的 provider 适配器还翻译了:

```text
ProviderRetryEvent         -> RetryEvent
ProviderThinkingDeltaEvent -> ThinkingDeltaEvent
```

[原文]
The loop forwards those events without embedding provider-specific payloads in
the portable agent layer.

[译文]
循环会转发这些事件,而不会把 provider 特有的载荷嵌入可移植的 agent 层。

## 排队的插话与追加(Queued steering and follow-ups)

[原文]
`AgentHarness` owns prompt queues, but `run_agent_loop()` owns the injection
point. When queue callbacks are provided:

[译文]
`AgentHarness` 持有提示队列,但注入点由 `run_agent_loop()` 掌握。当提供队列回调时:

[原文]
- steering messages drain after the current assistant turn and any tool batch
- follow-up messages drain when the run would otherwise stop
- drained messages are appended to the transcript as normal user messages
- the loop emits `MessageStartEvent(message_role="user")` and `MessageEndEvent`
  for each injected user message before the next provider call
- the loop emits a `QueueUpdateEvent` after draining so frontends can update
  pending-message status

[译文]
- 插话消息在当前 assistant 轮次及任意工具批次结束后排空
- 追加消息在本次运行本应停止时排空
- 排空的消息作为普通用户消息追加到会话记录
- 在下一次 provider 调用之前,循环会为每条注入的用户消息发出 `MessageStartEvent(message_role="user")` 与 `MessageEndEvent`
- 排空之后循环会发出 `QueueUpdateEvent`,以便前端更新待处理消息状态

[原文]
Direct callers that do not pass queue callbacks keep the original behavior.

[译文]
不传队列回调的直接调用方保持原有行为。

## 错误处理(Error handling)

[原文]
The loop currently handles common failure cases explicitly.

[译文]
循环目前显式处理常见的失败情况。

### 未知工具(Unknown tools)

[原文]
If the model requests a tool that was not registered, the loop records a failed tool result:

[译文]
如果模型请求了未注册的工具,循环会记录一条失败的工具结果:

```text
Unknown tool: tool_name
```

[原文]
This result is appended as a `ToolResultMessage`, so the model can recover on a later turn.

[译文]
该结果会以 `ToolResultMessage` 的形式追加,因此模型可以在后续轮次中自我恢复。

### 工具异常(Tool exceptions)

[原文]
If a tool raises an exception, the loop catches it and turns it into a failed `AgentToolResult`.

[译文]
如果工具抛出异常,循环会捕获它,并转换成一个失败的 `AgentToolResult`。

[原文]
Tools are an isolation boundary. A broken tool should not crash the whole loop by default.

[译文]
工具是一道隔离边界。默认情况下,一个有问题的工具不应让整个循环崩溃。

### Provider 错误(Provider errors)

[原文]
If the provider emits an error, the loop emits an agent `error` event and stops the run.

[译文]
如果 provider 发出错误,循环会发出 agent 的 `error` 事件并停止本次运行。

### 最大轮次(Max turns)

[原文]
Like Pi, Tau's loop does not impose a default turn limit. It continues until the assistant stops requesting tools or another normal stop condition occurs.

[译文]
与 Pi 一样,Tau 的循环不设默认轮次上限。它会一直继续,直到 assistant 不再请求工具,或出现其他正常的停止条件。

[原文]
Callers that want a safety cap can pass `max_turns`. If that configured limit is reached, the loop emits a recoverable error.

[译文]
需要安全上限的调用方可以传入 `max_turns`。达到该配置上限时,循环会发出一个可恢复的错误。

## 重要边界(Important boundary)

[原文]
The loop executes registered tools, but it does not define coding tools itself.

[译文]
循环执行已注册的工具,但它自己并不定义编码工具。

[原文]
That means:

```text
tau_agent.loop:
  knows how to execute an AgentTool

tau_coding tools:
  know how to read files, write files, edit files, or run bash
```

[译文]
也就是说:

```text
tau_agent.loop:
  知道如何执行一个 AgentTool

tau_coding 工具:
  知道如何读文件、写文件、编辑文件或运行 bash
```

[原文]
This keeps Tau's reusable agent package independent from coding-agent-specific behavior.

[译文]
这使 Tau 可复用的 agent 包与编码 agent 特有的行为保持独立。

## 阶段 3 如何支撑后续层次(How Phase 3 supports the later layers)

### AgentHarness

[原文]
The harness owns the transcript, cancellation token, listeners, and queued
steering/follow-up prompts. It calls `run_agent_loop()` from methods like
`prompt()` and `continue_()`.

[译文]
Harness 持有会话记录、取消令牌、监听器以及排队的插话/追加提示。它从 `prompt()`、`continue_()` 等方法中调用 `run_agent_loop()`。

### 内置编码工具(Built-in coding tools)

[原文]
The coding tools are `AgentTool` instances. The loop executes them without
knowing whether a tool reads files, writes files, edits files, or runs a shell
command.

[译文]
编码工具都是 `AgentTool` 实例。循环执行它们时,并不知道某个工具是读文件、写文件、编辑文件还是运行 shell 命令。

### print 模式 CLI 与 TUI(Print-mode CLI and TUI)

[原文]
Renderers and the Textual TUI consume `AgentEvent`s from the loop and decide how
to display streamed text, tool activity, retry status, thinking deltas, queue
state, and errors.

[译文]
渲染器与 Textual TUI 消费循环发出的 `AgentEvent`,并决定如何展示流式文本、工具活动、重试状态、thinking 增量、队列状态与错误。

### 会话(Sessions)

[原文]
Session storage persists the transcript messages that the loop appends, including
tool results and queued user prompts after they are injected.

[译文]
会话存储会持久化循环追加的会话记录消息,包括工具结果,以及被注入之后的排队用户提示。

## 设计规则(Design rule)

[原文]
The agent loop should only coordinate provider streams, messages, tools, and events.

[译文]
Agent 循环应当只负责协调 provider 流、消息、工具与事件。

[原文]
If behavior requires CLI flags, terminal rendering, local config paths, slash commands, or project resources, it belongs outside `tau_agent.loop`.

[译文]
如果某种行为需要 CLI 参数、终端渲染、本地配置路径、斜杠命令或项目资源,它就应该放在 `tau_agent.loop` 之外。
