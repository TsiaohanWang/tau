---
title: "Phase 2: AI Provider Layer / 阶段 2:AI Provider 层"
---

[原文]
Phase 2 creates Tau's provider/model streaming layer in `tau_ai`.

[译文]
阶段 2 在 `tau_ai` 中建立了 Tau 的 provider/模型流式处理层。

[原文]
The purpose of this layer is to let Tau talk to model APIs without letting provider-specific details leak into the reusable agent loop.

[译文]
这一层的目的是:让 Tau 能够与各种模型 API 对话,同时不让 provider 特有的细节泄漏进可复用的 agent 循环。

## 新增了什么(What was added)

[原文]
Phase 2 added these modules:

[译文]
阶段 2 新增了以下模块:

```text
src/tau_ai/events.py              provider-neutral stream events
src/tau_ai/provider.py            ModelProvider protocol
src/tau_ai/fake.py                deterministic fake provider for tests
src/tau_ai/env.py                 environment-based provider configuration
src/tau_ai/openai_compatible.py   OpenAI-compatible chat completions adapter
```

## 为什么需要 provider 层(Why the provider layer exists)

[原文]
Model APIs do not all stream responses the same way. Each provider has its own request format, response chunks, tool-call encoding, error shape, and authentication rules.

[译文]
各家模型 API 的流式响应方式并不一致。每个 provider 都有自己的请求格式、响应分片、工具调用编码、错误形态与认证规则。

[原文]
Tau does not want the agent loop to know those details.

[译文]
Tau 不希望 agent 循环了解这些细节。

[原文]
Instead, the split is:

[译文]
因此,分层是这样的:

```text
Provider API payloads
        ↓
tau_ai adapter
        ↓
ProviderEvent stream
        ↓
tau_agent loop
```

[原文]
The future agent loop can consume the same Tau event stream regardless of the backend model.

[译文]
未来无论后端是哪个模型,agent 循环消费的都是同一条 Tau 事件流。

## Provider 事件(Provider events)

[原文]
Provider events are lower-level than agent events.

[译文]
Provider 事件比 agent 事件更底层。

[原文]
They describe what the model is streaming, not what the full agent is doing.

[译文]
它们描述的是模型正在流出什么,而不是整个 agent 正在做什么。

[原文]
Current provider events are:

- `ProviderResponseStartEvent`
- `ProviderTextDeltaEvent`
- `ProviderToolCallEvent`
- `ProviderResponseEndEvent`
- `ProviderErrorEvent`

[译文]
当前的 provider 事件有:

- `ProviderResponseStartEvent`
- `ProviderTextDeltaEvent`
- `ProviderToolCallEvent`
- `ProviderResponseEndEvent`
- `ProviderErrorEvent`

[原文]
A simple text response may look like this:

[译文]
一次简单的文本响应可能长这样:

```text
response_start
text_delta       "Hel"
text_delta       "lo"
response_end     AssistantMessage(content="Hello")
```

[原文]
A response with a tool call may look like this:

[译文]
一次带工具调用的响应可能长这样:

```text
response_start
text_delta       "I'll inspect that file."
tool_call        ToolCall(name="read", arguments={"path": "README.md"})
response_end     AssistantMessage(... tool_calls=[...])
```

## `ModelProvider`

[原文]
`ModelProvider` is the protocol every model adapter must satisfy.

[译文]
`ModelProvider` 是每个模型适配器都必须满足的协议。

[原文]
Conceptually, it says:

[译文]
从概念上讲,它表达的是:

```python
provider.stream_response(
    model="...",
    system="...",
    messages=[...],
    tools=[...],
)
```

[原文]
and returns an async stream of provider events.

[译文]
并返回一个 provider 事件的异步流。

[原文]
This is the seam that lets Tau support multiple backends later.

[译文]
这正是让 Tau 日后能支持多种后端的接缝。

## 假 provider(Fake provider)

[原文]
`FakeProvider` replays scripted provider events.

[译文]
`FakeProvider` 会回放预先编排好的 provider 事件。

[原文]
This is important because Tau should be testable without:

- network access
- API keys
- nondeterministic model output
- provider rate limits

[译文]
这很重要,因为 Tau 应该能在以下条件都不具备时被测试:

- 无网络访问
- 无 API key
- 模型输出不确定
- provider 限流

[原文]
Later, the pure agent loop can be tested by giving it a fake provider that emits exactly the text and tool calls a test needs.

[译文]
之后,只要给纯 agent 循环一个假 provider,让它精确发出测试所需的文本与工具调用,就能完成测试。

## OpenAI 兼容 provider(OpenAI-compatible provider)

[原文]
The first real adapter targets OpenAI-compatible `/chat/completions` APIs.

[译文]
第一个真实适配器面向 OpenAI 兼容的 `/chat/completions` API。

[原文]
It handles:

- bearer token authentication
- chat message formatting
- tool schema formatting
- server-sent event streaming
- streamed text deltas
- streamed tool-call argument assembly
- provider errors

[译文]
它处理:

- bearer token 认证
- chat 消息格式化
- 工具 schema 格式化
- Server-Sent Events(SSE)流式传输
- 流式文本增量
- 流式工具调用参数的拼接
- provider 错误

[原文]
Configuration is loaded with:

[译文]
配置通过以下方式加载:

```python
openai_compatible_config_from_env()
```

[原文]
using:

[译文]
使用:

```text
OPENAI_API_KEY
OPENAI_BASE_URL
```

[原文]
`OPENAI_BASE_URL` defaults to:

[译文]
`OPENAI_BASE_URL` 默认为:

```text
https://api.openai.com/v1
```

## 重要边界(Important boundary)

[原文]
`tau_ai` does not execute tools.

[译文]
`tau_ai` 不执行工具。

[原文]
If a model asks for a tool, the provider layer only emits a `ProviderToolCallEvent` containing a neutral `ToolCall`.

[译文]
如果模型请求工具,provider 层只会发出一个 `ProviderToolCallEvent`,其中包含中立的 `ToolCall`。

[原文]
Tool execution belongs to the future `tau_agent` loop:

```text
tau_ai:
  "The model requested this tool call."

tau_agent:
  "Find the registered AgentTool, execute it, append the result, continue."
```

[译文]
工具执行属于未来的 `tau_agent` 循环:

```text
tau_ai:
  “模型请求了这次工具调用。”

tau_agent:
  “找到已注册的 AgentTool,执行它,追加结果,继续。”
```

[原文]
Keeping this boundary clean makes it possible to reuse the same provider layer for CLIs, tests, Rich output, Textual, and other frontends.

[译文]
保持这条边界清晰,才能让同一 provider 层被 CLI、测试、Rich 输出、Textual 以及其他前端复用。

## 阶段 2 如何支撑后续阶段(How Phase 2 supports later phases)

### 阶段 3:纯 agent 循环(Phase 3: pure agent loop)

[原文]
The loop consumes `ProviderEvent`s, converts them into higher-level
`AgentEvent`s, executes tools, and decides whether another model turn is needed.
Later provider hardening added retry and thinking-delta events to that same
conversion path without giving providers any knowledge of the CLI or TUI.

[译文]
循环消费 `ProviderEvent`,把它们转换成更高层的 `AgentEvent`,执行工具,并判断是否需要再来一轮模型调用。后来的 provider 加固在同一条转换路径上增加了重试与 thinking 增量事件,同时没有让 provider 了解任何 CLI 或 TUI 的知识。

### 阶段 4:harness(Phase 4: harness)

[原文]
The harness owns a provider instance, passes the current transcript into
`stream_response()`, and exposes prompt/continue APIs that can be used by print
mode, JSON event streaming, Rich rendering, and Textual.

[译文]
Harness 持有一个 provider 实例,把当前会话记录传给 `stream_response()`,并暴露 prompt/continue API,供 print 模式、JSON 事件流、Rich 渲染与 Textual 使用。

### 阶段 6:print 模式 CLI(Phase 6: print-mode CLI)

[原文]
The CLI chooses a provider/model from configuration or command-line flags, then
displays streamed output as it arrives.

[译文]
CLI 从配置或命令行参数中选择 provider/model,然后在流式输出到达时即时展示。

### 未来的 provider(Future providers)

[原文]
Additional providers can implement the same `ModelProvider` protocol without changing the agent loop.

[译文]
更多 provider 可以实现同一个 `ModelProvider` 协议,而无需改动 agent 循环。
