---
title: tau_ai · Provider 契约与事件流
description: provider.py / events.py / stream.py 的 Pi 兼容事件重构
code_files:
  - tau_agent/provider.py
  - tau_agent/provider_events.py
  - tau_ai/provider.py
  - tau_ai/events.py
  - tau_ai/stream.py
  - tau_ai/_provider_events.py
---

本页介绍 `tau_ai` 层最核心的三个模块：它们定义了"provider（模型服务商，如 OpenAI、Anthropic）应该长什么样"、"流式响应（streaming，即边生成边返回而非等全部完成再返回）长什么样"、以及"旧格式事件如何翻译成 Pi 兼容事件"。这些是所有 provider 实现共享的基础设施。

## 依赖方向的变化

在早期设计中，`tau_ai/provider.py` 自身定义了 `ModelProvider` 和 `CancellationToken` 两个 Protocol，`tau_ai/events.py` 定义了一套 `Provider*` 前缀的事件类型。重构后，**Protocol 定义的权威来源下沉到了 `tau_agent` 层**，`tau_ai` 变成了纯 re-export 文件。

这种变化的原因在于 Pi 架构的一个核心原则：**事件即契约（Events are the contract）**——agent 循环只与事件流签订契约，而不与任何具体模型 SDK 耦合。把 Protocol 和事件定义放在 `tau_agent`（便携式 agent harness），可以让任何消费 agent 层的代码都直接 import 到权威定义，而不需要经过 `tau_ai` 这个适配层。`tau_ai` 保留 re-export 是为了向后兼容——已有的 `from tau_ai.provider import ModelProvider` 语句仍然有效。

---

## `tau_agent/provider.py` — 全栈依赖的两个 Protocol

这个文件定义了整个代码库最关键的一层契约：两个 `typing.Protocol` 类（Python 的结构化类型机制，类似 Go 的 interface——隐式实现，不需要显式声明"实现"该接口，只要对象拥有对应方法即可，也类似 TypeScript 的 structural typing）。Protocol（协议）是 Python 用"结构化子类型"来定义接口的方式——任何拥有对应方法的对象都自动满足协议，不需要显式继承。用 Protocol 而不是 ABC（抽象基类），好处是调用方可以传入任何"长得像"的对象，灵活性更高。

这两个 Protocol 定义了下游所有代码使用的接口。它**从 `tau_agent` 的消息与工具类型**中 import 了类型——因为 provider 必须把"消息"和"工具"当作纯数据来接收，而这两类数据的权威定义在 `tau_agent` 中；让 `provider.py` 依赖 agent 层的类型（而非自行定义私有格式），可保证转换只发生在 provider 内部，避免栈内出现两套并行的消息/工具表示。

- **`CancellationToken`**（Protocol）：一个最小化的取消句柄，只有一个方法
  `is_cancelled() -> bool`。当用户按下 Ctrl-C 或会话超时时，上层会通过这个对象通知 provider 停止生成。之所以用 Protocol 而非具体类，是为了让调用方可以传入任何实现了该方法的对象（agent 层会把它包成更丰富的信号），而 provider 不需要关心信号的来源。
- **`ModelProvider`**（Protocol）：provider（模型服务商）的统一接口，唯一方法是

  ```python
  def stream_response(
      self,
      *,
      model: str,
      system: str,
      messages: list[AgentMessage],
      tools: list[AgentTool],
      signal: CancellationToken | None = None,
  ) -> AsyncIterator[AssistantMessageEvent]:
      ...  # Python 的省略号字面量，在 Protocol 中表示"此方法由满足协议的具体类实现"
  ```

  给定模型名、系统提示、消息列表（对话历史）、工具清单（模型可以调用的外部函数）、取消令牌，以异步迭代器（Python 的异步迭代器类型，可以用 `async for` 逐个获取元素，类似 Go 的 channel 或 JavaScript 的 async generator）的形式产出 `AssistantMessageEvent` 流。`signal` 默认为 `None`，让调用方可选地注入取消能力。所有具体 provider（OpenAI、Anthropic、Google 等）都只需实现这一个方法；上层 agent 循环只依赖这个接口，完全不感知背后用的是哪家模型。

注意返回类型已从旧的 `AsyncIterator[ProviderEvent]` 改为 `AsyncIterator[AssistantMessageEvent]`——这是 Pi 兼容事件体系的核心变化，详见下一节。

---

## `tau_ai/provider.py` — 纯 re-export

这个文件现在只有五行：

```python
"""Public re-exports of the provider contract implemented by Tau adapters."""

from tau_agent.provider import CancellationToken, ModelProvider

__all__ = ["CancellationToken", "ModelProvider"]
```

它不定义任何逻辑，只是把 `tau_agent` 层的 Protocol 重新导出到 `tau_ai` 命名空间。这样已有的 `from tau_ai.provider import ModelProvider` 导入路径无需修改，但定义的权威来源已在 `tau_agent/provider.py` 中。

---

## `tau_agent/provider_events.py` — Pi 兼容的事件词汇表

这个文件定义了一套统一的"事件类型"，是 `ModelProvider.stream_response` 的产出格式。在 LLM 应用中，用户和模型之间的每一次问答来回叫做一个 **turn（轮次）**，而模型每次回应产生的文本、思考过程、工具调用请求等，都会被拆成一个个小的"事件"。使用事件（而非直接返回一整个字符串）的原因是：LLM 的输出是逐步生成的，事件机制让上层可以在文本刚产生时就实时渲染给用户，而不必等全部完成；同时，事件还能携带错误、完成原因等元信息。

新事件体系遵循 Pi 的 assistant stream 语义——每个事件都携带一个 `partial: AssistantMessage` 字段（增量快照，即截至当前事件的完整助手消息状态），这让消费者可以随时获取完整的进度状态，而不必自行维护状态机。

每个事件都继承自 `WireModel`（`tau_agent` 的 pydantic 模型基类），使用 `Literal[...]` 固定了 `type` 字段，实现 **discriminated union（判别联合类型）**——`tau_agent` 可以用 `match event.type:` 做精准的事件分派。

### 事件生命周期模型

Pi 的流式事件遵循"开始 → 增量 → 结束"的三段式生命周期，每个内容块（文本、思考、工具调用）都有独立的 Start/Delta/End 事件：

### AssistantStartEvent

表示"助手开始一次响应"。

#### 字段

- `type: Literal["start"] = "start"` —— 判别标签。
- `partial: AssistantMessage` —— 当前的助手消息快照（此时通常为空消息）。

### TextStartEvent / TextDeltaEvent / TextEndEvent

表示"文本内容块"的开始、增量、结束。

#### TextStartEvent 字段

- `type: Literal["text_start"] = "text_start"`
- `content_index: int` —— 当前内容块在 `partial.content` 中的索引位置。
- `partial: AssistantMessage`

#### TextDeltaEvent 字段

- `type: Literal["text_delta"] = "text_delta"`
- `content_index: int` —— 对应 `TextStartEvent` 中的索引。
- `delta: str` —— 本次增量文本片段；多个 `TextDeltaEvent` 按顺序拼接即得到完整助手文本。
- `partial: AssistantMessage`

#### TextEndEvent 字段

- `type: Literal["text_end"] = "text_end"`
- `content_index: int`
- `content: str` —— 完整的文本内容。
- `partial: AssistantMessage`

### ThinkingStartEvent / ThinkingDeltaEvent / ThinkingEndEvent

表示"思考/推理内容块"的开始、增量、结束，用于支持带思维链（thinking / chain-of-thought）的模型（如 o1、Claude）。单独成类，方便 UI 选择显示或隐藏思考内容。

#### ThinkingStartEvent 字段

- `type: Literal["thinking_start"] = "thinking_start"`
- `content_index: int`
- `partial: AssistantMessage`

#### ThinkingDeltaEvent 字段

- `type: Literal["thinking_delta"] = "thinking_delta"`
- `content_index: int`
- `delta: str` —— 本次思考过程文本片段。
- `partial: AssistantMessage`

#### ThinkingEndEvent 字段

- `type: Literal["thinking_end"] = "thinking_end"`
- `content_index: int`
- `content: str` —— 完整的思考内容。
- `partial: AssistantMessage`

### ToolCallStartEvent / ToolCallDeltaEvent / ToolCallEndEvent

表示"工具调用内容块"的开始、增量（JSON 参数流式构建）、结束。

#### ToolCallStartEvent 字段

- `type: Literal["toolcall_start"] = "toolcall_start"`
- `content_index: int`
- `partial: AssistantMessage`

#### ToolCallDeltaEvent 字段

- `type: Literal["toolcall_delta"] = "toolcall_delta"`
- `content_index: int`
- `delta: str` —— 工具调用参数的增量片段（JSON 字符串逐步构建）。
- `partial: AssistantMessage`

#### ToolCallEndEvent 字段

- `type: Literal["toolcall_end"] = "toolcall_end"`
- `content_index: int`
- `tool_call: ToolCall` —— 来自 `tau_agent.tools` 的完整 `ToolCall` 对象，包含工具名、调用参数、调用 ID 等。
- `partial: AssistantMessage`

### AssistantDoneEvent

表示"助手完成一次响应"。

#### 字段

- `type: Literal["done"] = "done"`
- `reason: DoneReason` —— 结束原因，为 `Literal["stop", "length", "toolUse"]` 之一。`"stop"` 正常结束，`"length"` 达到长度限制，`"toolUse"` 需要执行工具。
- `message: AssistantMessage` —— 完整的最终助手消息，聚合了本次流中的所有文本、思考与工具调用。

### AssistantErrorEvent

表示"一个无法恢复的错误"。

#### 字段

- `type: Literal["error"] = "error"`
- `reason: ErrorReason` —— 错误原因，为 `Literal["aborted", "error"]` 之一。`"aborted"` 用户取消，`"error"` 其他错误。
- `error: AssistantMessage` —— 错误信息封装在助手消息中（`error_message` 字段包含人类可读描述）。

### AssistantMessageEvent（类型别名）

```python
type AssistantMessageEvent = Annotated[
    AssistantStartEvent
    | TextStartEvent
    | TextDeltaEvent
    | TextEndEvent
    | ThinkingStartEvent
    | ThinkingDeltaEvent
    | ThinkingEndEvent
    | ToolCallStartEvent
    | ToolCallDeltaEvent
    | ToolCallEndEvent
    | AssistantDoneEvent
    | AssistantErrorEvent,
    Field(discriminator="type"),
]
```

这是 `ModelProvider.stream_response` 的产出元素类型。因为每一个具体事件都有 `type: Literal[...]` 字段，`tau_agent` 可以用 `match event.type:` 做精准的分派。`Annotated[..., Field(discriminator="type")]` 是 Pydantic 的判别联合语法，使得序列化/反序列化也能自动按 `type` 字段路由。

> **为什么这样设计**：消费者（agent loop，即 agent 的主循环）永远只看到这 12 种事件类型。不同 provider 之间的差异（OpenAI 的 `/chat/completions` vs `/v1/responses` 端点、SSE 格式、工具调用编码方式等）全部被吸收在这一层之下。这正是 Tau 的设计原则之一——**"Events are the contract"（事件即契约）**：agent 循环只与事件流签订契约，而不与任何具体模型 SDK 耦合；新增 provider 时只需在其内部把原生响应归一化为这 12 种事件，上层逻辑无需改动。事件词汇表因此成为栈中最稳定的边界。

---

## `tau_ai/events.py` — re-export Pi 事件

这个文件现在是纯 re-export，把 `tau_agent/provider_events.py` 中定义的 Pi 兼容事件重新导出到 `tau_ai` 命名空间：

```python
from tau_agent.provider_events import (
    AssistantDoneEvent,
    AssistantErrorEvent,
    AssistantMessageEvent,
    AssistantStartEvent,
    DoneReason,
    ErrorReason,
    TextDeltaEvent,
    TextEndEvent,
    TextStartEvent,
    ThinkingDeltaEvent,
    ThinkingEndEvent,
    ThinkingStartEvent,
    ToolCallDeltaEvent,
    ToolCallEndEvent,
    ToolCallStartEvent,
)
```

这样已有的 `from tau_ai.events import TextDeltaEvent` 等导入路径无需修改。旧的 `Provider*` 前缀事件（`ProviderResponseStartEvent`、`ProviderTextDeltaEvent` 等）已移到 `tau_ai/_provider_events.py`（带下划线前缀，表示私有/过渡），不再从公共 API 导出。

---

## `tau_ai/stream.py` — 新旧事件格式的翻译层

这个文件提供了 `canonicalize_provider_stream()` 函数，负责把旧的 `ProviderEvent` 流翻译成 Pi 兼容的 `AssistantMessageEvent` 流。它的存在是因为各 provider 内部的解析器（parser）仍然产出旧格式事件，而公共协议已切换到 Pi 事件——翻译层让迁移可以增量进行，不必一次性重写所有 provider。

### canonicalize_provider_stream()

```python
async def canonicalize_provider_stream(
    source: AsyncIterator[ProviderEvent],
    *,
    api: str,
    provider: str,
    model: str,
) -> AsyncIterator[AssistantMessageEvent]:
```

- **输入**：旧格式的 `ProviderEvent` 异步迭代器，加上 `api`、`provider`、`model` 三个元数据字符串（用于构建 `AssistantMessage` 的来源信息）。
- **输出**：Pi 兼容的 `AssistantMessageEvent` 异步迭代器。

翻译规则：

| 旧事件 | 翻译为 |
|---|---|
| `ProviderRetryEvent` | **跳过**（重试是 provider 内部行为，不暴露给 agent 层） |
| `ProviderResponseStartEvent` | `AssistantStartEvent`（带初始 `partial` 快照） |
| `ProviderTextDeltaEvent` | 首次出现时先发 `TextStartEvent`，然后发 `TextDeltaEvent` |
| `ProviderThinkingDeltaEvent` | 首次出现时先发 `ThinkingStartEvent`，然后发 `ThinkingDeltaEvent` |
| `ProviderToolCallEvent` | `ToolCallStartEvent` + `ToolCallEndEvent`（工具调用是完整的，直接发开始和结束） |
| `ProviderResponseEndEvent` | 如果有未结束的文本/思考块，先发 `TextEndEvent` / `ThinkingEndEvent`，然后发 `AssistantDoneEvent` |
| `ProviderErrorEvent` | `AssistantErrorEvent`（`reason="error"`） |

关键设计细节：

- **`_snapshot()` 辅助函数**：每次产出事件时，都会把当前 `partial` 做一次深拷贝（`model_copy(deep=True)`），确保消费者拿到的 `partial` 快照不受后续修改影响。
- **隐式 start**：如果旧流没有发 `ProviderResponseStartEvent`，翻译层会在第一个实质性事件前自动补发 `AssistantStartEvent`。
- **`_finish_reason()` 映射**：把旧的 `finish_reason` 字符串（如 `"tool_calls"`、`"max_tokens"`）映射为 Pi 的 `DoneReason`（`"toolUse"`、`"length"`、`"stop"`）。
- **兜底处理**：如果旧流结束时没有发 `ProviderResponseEndEvent`（即没有 terminal 事件），翻译层会补发一个 `AssistantErrorEvent`，避免 agent 循环无限等待。

---

## 旧事件词汇（过渡期）

旧的事件类型现在位于 `tau_ai/_provider_events.py`（注意下划线前缀，表示私有）。这些类型仍然被各 provider 内部的解析器使用，但不再从公共 API 导出：

- **`ProviderResponseStartEvent`**（`type="response_start"`）：旧的响应开始事件。
- **`ProviderRetryEvent`**（`type="retry"`）：重试进度事件，现已从公共 API 移除——重试是 provider 内部行为，agent 层不需要感知。
- **`ProviderTextDeltaEvent`**（`type="text_delta"`）：旧的文本增量事件，只有一个 `delta` 字段。
- **`ProviderThinkingDeltaEvent`**（`type="thinking_delta"`）：旧的思考增量事件，只有一个 `delta` 字段。
- **`ProviderToolCallEvent`**（`type="tool_call"`）：旧的完整工具调用事件。
- **`ProviderResponseEndEvent`**（`type="response_end"`）：旧的响应结束事件。
- **`ProviderErrorEvent`**（`type="error"`）：旧的错误事件。

新旧事件的核心区别在于：旧事件只携带增量数据（如 `delta: str`），而 Pi 事件额外携带 `partial: AssistantMessage`（完整的增量快照），让消费者无需自行维护状态。

---

## `tau_ai/__init__.py` — 公共导出

`tau_ai/__init__.py` 现在导出 Pi 兼容事件，而非旧的 `ProviderEvent` 类型：

```python
from tau_ai.events import (
    AssistantDoneEvent,
    AssistantErrorEvent,
    AssistantMessageEvent,
    AssistantStartEvent,
    TextDeltaEvent,
    TextEndEvent,
    TextStartEvent,
    ThinkingDeltaEvent,
    ThinkingEndEvent,
    ThinkingStartEvent,
    ToolCallDeltaEvent,
    ToolCallEndEvent,
    ToolCallStartEvent,
)
from tau_ai.provider import CancellationToken, ModelProvider
```

这意味着 `import tau_ai` 后可以直接访问所有 Pi 事件类型和 Provider 协议，且这些类型都来自 `tau_agent` 的权威定义。

---

## 串联总览：新架构如何共同支撑 `tau_ai` 全栈

把这五个文件放在一起看，它们构成了一条清晰的分工链：

1. **`tau_agent/provider.py` 定义权威 Protocol**：`ModelProvider` 和 `CancellationToken` 是整个栈的依赖边界。Agent 循环只持有 `ModelProvider` 协议对象，调用 `stream_response(...)` 拿到 `AsyncIterator[AssistantMessageEvent]`，从而完全不用关心背后是 OpenAI、Anthropic 还是本地模型。

2. **`tau_agent/provider_events.py` 定义权威事件**：12 种 Pi 兼容事件（`AssistantStartEvent`、`TextDeltaEvent`、`ThinkingDeltaEvent`、`ToolCallEndEvent`、`AssistantDoneEvent`、`AssistantErrorEvent` 等）是 agent 循环唯一消费的事件类型。每个事件携带 `partial: AssistantMessage` 增量快照，让 agent 层无需自行维护状态机。

3. **`tau_ai/provider.py` 和 `tau_ai/events.py` 做 re-export**：保持向后兼容的导入路径，不定义任何新逻辑。

4. **`tau_ai/stream.py` 做新旧翻译**：各 provider 内部的解析器仍产出旧的 `ProviderEvent`，`canonicalize_provider_stream()` 把它们翻译为 Pi 事件。`ProviderRetryEvent` 在此层被过滤掉——重试是 provider 内部行为，不暴露给 agent 层。

5. **`tau_ai/_provider_events.py` 保留旧事件**：作为过渡期的内部实现，带下划线前缀表示私有，最终会随着各 provider 的迁移而废弃。

这种分层确保了：新增或替换模型后端时，只需在其内部把原生响应转换为 Pi 事件（或通过翻译层间接转换），上层逻辑完全无需改动。事件词汇表因此成为栈中最稳定的边界。

---

<!-- NAV -->
[← 源码剖析总览]({{< relref "./source-walkthrough.md" >}})
[↑ 总览]({{< relref "./source-walkthrough.md" >}})
[→ tau_ai · 环境配置]({{< relref "./ai-env-config.md" >}})
