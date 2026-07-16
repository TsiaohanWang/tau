---
title: tau_agent · 数据模型
description: types / messages / tools / events
---

## `tau_agent/types.py` — JSON 值类型别名

只有 8 行，但 everywhere 用到：

- **`JSONPrimitive = str | int | float | bool | None`**
- **`JSONValue = JSONPrimitive | list[JSONValue] | dict[str, JSONValue]`**（递归）
- **`JSONObject = dict[str, JSONValue]`**

用 PEP 695 `type` 别名（而非 `typing` 旧式），因为递归 JSON 值需要命名递归别名。
所有工具参数、结构化数据、事件 `data` 字段都基于它们。

---

## `tau_agent/messages.py` — 对话 transcript 的消息模型

一组 pydantic `BaseModel`（`extra="forbid"`），描述在模型、工具、持久化之间
流动的"消息"。注意所有消息都带 `role` 字面量判别字段。

- **`UsageCost`**（frozen 语义的数据类）：单次响应的 USD 费用拆分
  `input`/`output`/`cache_read`/`cache_write`/`total`。Tau 目前**没有按模型定价
  表**，所以实际都是 `0.0`——只为前向兼容保留结构（对应 Pi 的 `Usage.cost`）。
- **`Usage`**：一次助手响应真实计费的 token 用量。字段
  `input`/`output`/`cache_read`/`cache_write`/`cache_write_1h`（仅 Anthropic 报）
  /`reasoning`（是 `output` 子集）/ `total_tokens` / `cost: UsageCost | None`。
  约定：**`None` 表示"provider 未上报"**，绝不用 `0` 冒充（provider 解析代码严格
  遵守）。计数取 provider 的计费值，不是本地估算。
- **`UserMessage`**（`role="user"`）：用户消息，`content: str` + 可选
  `custom_type`/`details`——扩展通过 `send_custom_message` 附带的**展示元数据**
  （让前端用注册的自定义渲染器显示，而不显示原始 content；对模型无害）。
  关键点：用 `@model_serializer(mode="wrap")` 的 `_omit_unused_custom_metadata`
  **在序列化时丢掉为 `None` 的 `custom_type`/`details`**。这是为了前向兼容——
  旧版二进制用了 `extra="forbid"`，若每个消息都带 `"custom_type": null` 键，
  老文件就加载不了。
- **`AssistantMessage`**（`role="assistant"`）：助手消息，`content: str = ""`、
  `tool_calls: list[ToolCall]`、`usage: Usage | None`。同样用
  `_omit_unused_usage` 在 `usage is None` 时**不写 `usage` 键**——原因同上：几乎
  每个 session 都有助手消息，常驻 `"usage": null` 会让老二进制无法读新文件。
- **`ToolResultMessage`**（`role="tool"`）：某次工具调用的结果。`tool_call_id`、
  `name`、`content`、`ok: bool = True`，外加可选 `data`/`details`/`error`。
- **`AgentMessage`**：三者联合类型 = `UserMessage | AssistantMessage |
  ToolResultMessage`。这是 transcript 的基本单元，也是 provider 收发的消息列表
  元素类型。

---

## `tau_agent/tools.py` — 工具契约

定义"工具是什么、工具怎么执行、结果长什么样"，以及一组 Protocol。

### 取消 / 进度 / 渲染 Protocol

- **`ToolCancellationToken`**（Protocol）：工具的取消句柄，`is_cancelled()`。
- **`ToolUpdateCallback`**（Protocol）：`(message: str, data: dict[str, JSONValue] | None = None) -> None`，工具在执行
  中上报进度的火忘式回调（`data` 是有结构的可选字典，不是任意值）。loop 把它桥接成
  `ToolExecutionUpdateEvent`。注意：必须
  在事件循环线程调用（桥接用 `asyncio.Queue`，非线程安全）；worker 线程里的
  执行器要先跳回 loop 再报告。
- **`ToolCallRenderer`**（Protocol）：`(arguments) -> str | None`，把工具参数渲染
  成一行友好展示（如 subagent 工具的 description），返回 `None` 则回落默认。
- **`ToolResultRenderer`**（Protocol）：`(result, *, expanded) -> str | None`，
  渲染工具结果（Rich markup），`expanded` 区分折叠/展开视图。
- **`ToolExecutor`**（Protocol）：`(arguments, signal=None) -> Awaitable[AgentToolResult]`，
  执行工具的核心可调用。
- **`ToolExecutorWithUpdate`**（Protocol）：`ToolExecutor` 的变体，多一个
  `on_update: ToolUpdateCallback` 关键字参数。**只有声明了 `on_update` 的执行器
  才会收到进度回调**，其余执行器签名完全不变（`AgentTool.execute` 在构造时通过
  `inspect.signature` 检测这一点）。

### 数据类

- **`ToolCall`**（pydantic）：助手发起的一次工具调用——`id`、`name`、
  `arguments: dict[str, JSONValue]`、可选 `thought_signature`（Gemini 等要求回传
  的不透明签名，其它 provider 忽略）。这正是 Part 1b 里各家 parser 最后拼出来的
  对象。
- **`AgentToolResult`**（pydantic）：工具执行结果——`tool_call_id`、`name`、
  `ok`、`content`，可选 `data`/`details`/`error`。

### `AgentTool`（frozen dataclass）

工具的能力单元，把"声明"与"实现"打包：

- 字段：`name`、`description`、`input_schema`（JSON Schema）、`executor`
  （`ToolExecutor`）、`prompt_snippet`（注入 system 的片段）、`prompt_guidelines`
  （tuple，扩展给 system 的额外指引）、`render_call`/`render_result`（可选渲染器）、
  以及私有 `_accepts_on_update`（构造时算好，不比较、不序列化）。
- **`__post_init__`**：用 `inspect.signature(self.executor)` 检测执行器是否声明
  `on_update`，把结果存进 `_accepts_on_update`（只算一次）。
- **`execute(arguments, signal, *, on_update)`**：统一执行入口。仅当
  `on_update is not None 且 self._accepts_on_update` 时，把回调转发给
  `ToolExecutorWithUpdate`；否则按原 `(arguments, signal)` 调用。这样存量执行器
  零改动即可兼容进度回调。

> `tau_coding.tools` 的 `create_coding_tools` 就是产出一堆 `AgentTool`
> （read/write/edit/bash），每个包一个 `executor` 协程。

---

## `tau_agent/events.py` — agent 层事件词汇

agent loop 对外 emit 的"高层事件"（区别于 `tau_ai` 的 `ProviderEvent`——provider
事件在更底层，agent 把它**包装/翻译**成这里的事件）。全部 pydantic +
`extra="forbid"`，用 `type: Literal[...]` 判别：

- **`AgentStartEvent`**（`agent_start`）/ **`AgentEndEvent`**（`agent_end`）：
  一次完整 agent run 的起止括号。
- **`TurnStartEvent`**（`turn_start`）/ **`TurnEndEvent`**（`turn_end`）：单个
  turn（一次模型往返）的起止，带 `turn: int`。
- **`RetryEvent`**（`retry`）：agent loop 在可恢复错误后重试，带
  `attempt`/`max_attempts`/`delay_seconds`/`message`，外加可选 `data`
  （`dict[str, JSONValue] | None`，由 provider 的 `ProviderRetryEvent.data` 原样转发；
  类比 provider 的 `ProviderRetryEvent`，但发生在 agent 层）。
- **`QueueUpdateEvent`**（`queue_update`）：待处理的用户消息队列变化（steering /
  follow-up），`steering`/`follow_up` 两个 tuple。
- **`MessageStartEvent`**（`message_start`）：一条消息开始组装，带
  `message_role`（user/assistant/tool）。
- **`MessageDeltaEvent`**（`message_delta`）：消息增量文本 `delta`。
- **`ThinkingDeltaEvent`**（`thinking_delta`）：思考增量 `delta`。
- **`MessageEndEvent`**（`message_end`）：一条消息组装完成，携带完整
  `message: AgentMessage`（这是持久化的关键边界——`CodingSession` 在每个
  `MessageEndEvent` 时落盘）。
- **`ToolExecutionStartEvent`**（`tool_execution_start`）：工具开始执行，带
  `tool_call: ToolCall`。
- **`ToolExecutionUpdateEvent`**（`tool_execution_update`）：工具进度，带
  `tool_call_id`/`message`/`data`。
- **`ToolExecutionEndEvent`**（`tool_execution_end`）：工具结束，带
  `result: AgentToolResult`。
- **`ErrorEvent`**（`error`）：错误，`recoverable: bool`（决定 agent 是否重试或
  上抛）、`message`、`data`。
- **`AgentEvent`**：以上 14 个类的联合类型，是 `run_agent_loop` 的产出元素类型。

---

## 本部分小结

Part 2a 把"agent 世界"的基本名词定下来了：

- transcript 由 `UserMessage` / `AssistantMessage` / `ToolResultMessage` 组成；
- 工具是 `AgentTool`（声明 + 执行器），调用是 `ToolCall`，结果是
  `AgentToolResult`；
- agent 运行过程以 14 种 `AgentEvent` 对外广播。

下一任务（Part 2b）看执行核心：`loop.py` 如何把这些拼成"请求模型→执行工具→
回灌结果→循环"的 agent 循环，以及 `harness.py` 如何持有实时 transcript 并驱动它。

<!-- NAV -->
[← tau_ai · 各 Provider 实现]({{< relref "./ai-providers.md" >}})
[↑ 总览]({{< relref "./source-walkthrough.md" >}})
[→ tau_agent · 执行核心]({{< relref "./agent-loop-harness.md" >}})
