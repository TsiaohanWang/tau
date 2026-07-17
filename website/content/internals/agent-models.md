---
title: tau_agent · 数据模型
description: types / messages / tools / events
code_files:
  - tau_agent/types.py
  - tau_agent/messages.py
  - tau_agent/events.py
  - tau_agent/provider_events.py
  - tau_agent/tools.py
---

这一章把 agent 世界的基本"名词"定义清楚——消息长什么样、工具怎么描述、事件
怎么分类。这些数据类型是后续循环（loop）、持久化（session）和 UI 层共同使用的
公共词汇表。

## `tau_agent/types.py` — JSON 值类型别名

只有 8 行，但整个 agent 包各处都用得到：

- **`JSONPrimitive = str | int | float | bool | None`**
- **`JSONValue = JSONPrimitive | list[JSONValue] | dict[str, JSONValue]`**（递归）
- **`JSONObject = dict[str, JSONValue]`**

用 PEP 695 `type` 别名（而非 `typing` 旧式），因为递归 JSON 值需要命名递归别名。
所有工具参数、结构化数据、事件 `data` 字段都基于它们。

---

## `tau_agent/messages.py` — 对话 transcript 的消息模型

**Message（消息）**是 agent 系统中最基本的数据单元——用户说的话、模型的回复、
工具的执行结果，在系统内部都以"消息"的形式流动。而 **transcript（对话记录）**
就是这些消息按时间顺序排列的列表，模型每次回复前都会看到整个 transcript，才能
"记住"之前发生了什么。

### `WireModel` — 所有模型的基类

所有需要与 JSON 交互的 pydantic 模型都继承自 **`WireModel`**，而不是各自写
`model_config = ConfigDict(extra="forbid")`。`WireModel` 统一配置了：

- **`extra="forbid"`**：禁止未知字段，保证序列化格式严格稳定
- **`alias_generator=_to_camel`**：Python 字段名 `snake_case` 自动映射到 JSON
  的 `camelCase`（如 `tool_call_id` → `toolCallId`）
- **`serialize_by_alias`**：序列化时始终输出 camelCase 别名，保证 wire 格式一致
- **`populate_by_name` / `validate_by_name`**：构造时同时接受 Python 名和别名

> **为什么用 Pydantic 而不是 dataclass？** 消息需要从 JSON 序列化/反序列化——
> 比如从磁盘恢复会话、发给模型 API 时组装请求。Pydantic 提供自动校验、序列化器
> 和类型判别，而普通 dataclass 不具备这些能力。所以凡是需要与 JSON 打交道的模型
> 都用 Pydantic，而纯内存的数据结构（后面会看到的 `AgentTool`）则用更轻量的 dataclass。

### 内容类型（Content Types）

消息的内容不再是简单的 `str`，而是由一组**内容块（content blocks）**构成——
和 Pi 的消息协议一致，支持文本、思考、图片和工具调用等多种类型：

- **`TextContent`**（`WireModel`，`type="text"`）：一段文本。`text: str` + 可选
  `text_signature`（Gemini 等 provider 需要回传的签名）。
- **`ThinkingContent`**（`WireModel`，`type="thinking"`）：模型的推理/思考过程。
  `thinking: str` + 可选 `thinking_signature` + `redacted: bool`（标记被脱敏的思考）。
- **`ImageContent`**（`WireModel`，`type="image"`）：一张图片。`data: str`（base64）
  + `mime_type: str`。
- **`ToolCall`**（`WireModel`，`type="toolCall"`）：助手发起的一次工具调用请求。
  `id`、`name`、`arguments: dict[str, JSONValue]`、可选 `thought_signature`。
  **注意：`ToolCall` 现在定义在 `messages.py` 中**（不再在 `tools.py`），因为它
  是消息内容块的一部分。

基于内容块，定义了三个类型别名：

- **`UserContent = str | list[TextContent | ImageContent]`**：用户消息的内容，
  可以是纯字符串（向后兼容），也可以是结构化内容块列表。
- **`AssistantContent = TextContent | ThinkingContent | ToolCall`**：助手消息
  中每个内容块的类型——文本、思考或工具调用。
- **`ToolResultContent = TextContent | ImageContent`**：工具结果中的内容块类型。

### 消息模型

- **`UsageCost`**（`WireModel`）：单次响应的 USD 费用拆分
  `input`/`output`/`cache_read`/`cache_write`/`total`。Tau 目前**没有按模型定价
  表**，所以实际都是 `0.0`——只为前向兼容保留结构。
- **`Usage`**（`WireModel`）：一次助手响应真实计费的 token 用量。字段
  `input`/`output`/`cache_read`/`cache_write`/`cache_write_1h`（仅 Anthropic 报）
  /`reasoning`（是 `output` 子集）/ `total_tokens` / `cost: UsageCost`。
  约定：计数取 provider 的计费值，不是本地估算。
- **`UserMessage`**（`WireModel`，`role="user"`）：用户消息。`content: UserContent`
  （`str | list[TextContent | ImageContent]`）+ 可选 `timestamp`。
  提供 `.text` 属性，返回消息的纯文本内容。
- **`AssistantMessage`**（`WireModel`，`role="assistant"`）：助手消息。
  `content: list[AssistantContent]`（内容块列表），
  加上 `api`/`provider`/`model`/`usage: Usage`/`stop_reason` 等元数据。
  提供 `.text`（合并所有 `TextContent`）、`.thinking_text`（合并所有 `ThinkingContent`）、
  `.tool_calls`（提取所有 `ToolCall`）属性。构造时接受 `str` 自动转为
  `[TextContent(text=...)]`（`_normalize_convenient_content`）。
- **`ToolResultMessage`**（`WireModel`，`role="toolResult"`）：某次工具调用的结果。
  `tool_call_id`、`tool_name`、`content: list[ToolResultContent]`、`is_error: bool`、
  可选 `details`/`added_tool_names`。同样支持构造时传入 `str` 自动转换。
- **`BashExecutionMessage`**（`WireModel`，`role="bashExecution"`）：
  bash 命令执行的记录。`command`、`output`、`exit_code`、`cancelled`、`truncated`、
  `full_output_path`、`exclude_from_context`。
- **`CustomMessage`**（`WireModel`，`role="custom"`）：扩展通过
  `send_custom_message` 附带的展示元数据。`custom_type: str`、`content: UserContent`、
  `display: bool`、`details: JSONValue`。
- **`BranchSummaryMessage`**（`WireModel`，`role="branchSummary"`）：
  分支切换摘要。`summary`、`from_id`。
- **`CompactionSummaryMessage`**（`WireModel`，`role="compactionSummary"`）：
  上下文压缩摘要。`summary`、`tokens_before`。

### 联合类型与工具函数

- **`AgentMessage`**：以上 7 种消息的联合类型，用 `Field(discriminator="role")`
  按 `role` 字段判别。这是 transcript 的基本单元。
- **`content_text(content)`**：从 `str | list[TextContent | ImageContent]` 中
  提取纯文本。
- **`message_text(message)`**：从任意 `AgentMessage` 提取用户可见文本
  （`.text` / `.summary` / `.output`）。
- **`assistant_content(text, tool_calls)`**：从 parser 累积的文本和工具调用
  构建标准的 `list[AssistantContent]`。

> **为什么用 Pydantic 而不是 dataclass？** 消息需要从 JSON 序列化/反序列化——
> 比如从磁盘恢复会话、发给模型 API 时组装请求。Pydantic 提供自动校验、序列化器
> 和类型判别，而普通 dataclass 不具备这些能力。

---

## `tau_agent/tools.py` — 工具契约

**Tool（工具）**是 agent 能力的延伸——模型本身只能生成文字，但通过工具它可以
读文件、写文件、执行命令。**Tool call（工具调用）**是模型在回复中发出的"请求"，
意思是"请帮我执行这个操作"。工具执行后返回的结果会被回灌到 transcript 中，
模型就能看到操作的结果，再决定下一步怎么做。

这个文件定义"工具怎么执行、结果长什么样"，以及一组 Protocol。

> **什么是 Protocol？** `typing.Protocol` 是 Python 的结构化子类型（structural
> subtyping）机制：只要一个类实现了 Protocol 声明的方法，就自动满足这个接口——
> 不需要显式继承。类似于 Go 语言的"接口隐式实现"。用 Protocol 而不是抽象基类
> 的好处是：工具的执行器（executor）可以是任何 async 函数，只要签名匹配就行，
> 不需要继承某个基类。

### 取消 / 进度 / 渲染 Protocol

- **`ToolCancellationToken`**（Protocol）：工具的取消句柄，`is_cancelled()`。
  **Cancellation token（取消令牌）**是一种让外部代码"请求中止"的机制——当用户
  取消操作时，harness 会把令牌标记为已取消，循环和工具在每次执行前检查它，
  一旦发现取消就立即停止，避免浪费资源。
- **`ToolUpdateCallback`**：`Callable[[AgentToolResult], None]`，工具在执行
  中上报进度的同步回调。loop 把它桥接成 `ToolExecutionUpdateEvent`。
- **`ToolCallRenderer`**（Protocol）：`(arguments) -> str | None`，把工具参数渲染
  成一行友好展示（如 subagent 工具的 description），返回 `None` 则回落默认。
- **`ToolResultRenderer`**（Protocol）：`(result, *, expanded) -> str | None`，
  渲染工具结果（Rich markup），`expanded` 区分折叠/展开视图。
- **`ToolExecutor`**（Protocol）：`(tool_call_id, arguments, signal=None, on_update=None) -> Awaitable[AgentToolResult]`，
  执行工具的核心可调用。注意第一个参数是 `tool_call_id: str`，用于关联请求和结果。

### `AgentToolResult`（`WireModel`）

工具执行结果——`content: list[TextContent | ImageContent]`（不再是简单的 `str`）、
`details: JSONValue`、`added_tool_names: list[str] | None`、`terminate: bool | None`。
构造时接受 `str` 自动转为 `[TextContent(text=...)]`（`_normalize_text_content`）。
提供 `.text` 属性提取纯文本。

### `AgentTool`（frozen dataclass）

> **`@dataclass(frozen=True, slots=True)`** 是 Python 3.10+ 的 `dataclasses` 装饰器：
> `@dataclass` 自动生成 `__init__`、`__eq__`、`__repr__` 等样板方法；`frozen=True` 使实例不可变；`slots=True` 启用 `__slots__`，节省内存。

工具的能力单元，把"声明"与"实现"打包：

- 字段：`name`、`label`、`description`、`parameters`（JSON Schema）、
  `execute_fn`（`ToolExecutor`）、`prompt_snippet`、`prompt_guidelines`、
  `prepare_arguments`（参数预处理器）、`execution_mode`（`"parallel"` | `"sequential"`）、
  `render_call`/`render_result`（可选渲染器）。
- `input_schema` 属性是 `parameters` 的别名，供 provider payload builder 使用。
- **`execute(tool_call_id, arguments, signal, on_update)`**：直接转发给
  `execute_fn`，保证调用签名统一。

> `tau_coding.tools` 的 `create_coding_tools` 就是产出一堆 `AgentTool`
> （read/write/edit/bash），每个包一个 `execute_fn` 协程。

---

## `tau_agent/events.py` — agent 层事件词汇

**Streaming（流式处理）**是 LLM 应用的关键模式：模型生成回复时不是等全部生成完
再一次性返回，而是逐 token 流式输出——每生成一小段文字就立即推送出来。agent loop
把这些底层的流式片段"翻译"成上层的 `AgentEvent`，前端就能实时显示进度。

这里定义的事件是 agent loop 对外 emit 的"高层事件"（区别于 `tau_ai` 的
`ProviderEvent` 和 `tau_agent/provider_events.py` 的 `AssistantMessageEvent`——
那些在更底层，agent 把它**包装/翻译**成这里的事件）。全部继承 `WireModel`
（`extra="forbid"` + camelCase 别名），用 `type: Literal[...]` 判别：

- **`AgentStartEvent`**（`agent_start`）/ **`AgentEndEvent`**（`agent_end`）：
  一次完整 agent run 的起止。`AgentEndEvent` 新增 `messages: list[AgentMessage]`，
  携带本次运行产出的全部消息。
- **`TurnStartEvent`**（`turn_start`）/ **`TurnEndEvent`**（`turn_end`）：单个
  **turn**（一次模型往返）的起止。`TurnStartEvent` 不再有 `turn: int` 字段
  （轮次编号由调用方跟踪）。`TurnEndEvent` 携带 `message: AgentMessage`
  和 `tool_results: list[ToolResultMessage]`。
- **`MessageStartEvent`**（`message_start`）：一条消息开始组装，携带
  `message: AgentMessage`。
- **`MessageUpdateEvent`**（`message_update`）：消息的流式更新，替代了旧的
  `MessageDeltaEvent` + `ThinkingDeltaEvent`。携带 `message: AgentMessage`
  （累积中的消息）和 `assistant_message_event: AssistantMessageEvent`
  （来自 `provider_events.py` 的细粒度流式事件，如 `TextDeltaEvent`、
  `ThinkingDeltaEvent`、`ToolCallDeltaEvent` 等）。
- **`MessageEndEvent`**（`message_end`）：一条消息组装完成，携带完整
  `message: AgentMessage`（这是持久化的关键边界——`CodingSession` 在每个
  `MessageEndEvent` 时落盘）。
- **`ToolExecutionStartEvent`**（`tool_execution_start`）：工具开始执行，带
  `tool_call_id`、`tool_name`、`args`。
- **`ToolExecutionUpdateEvent`**（`tool_execution_update`）：工具进度，带
  `tool_call_id`/`tool_name`/`args`/`partial_result: AgentToolResult`。
- **`ToolExecutionEndEvent`**（`tool_execution_end`）：工具结束，带
  `tool_call_id`/`tool_name`/`result: AgentToolResult`/`is_error: bool`。
- **`AgentEvent`**：以上 10 个类的联合类型，用 `Field(discriminator="type")`
  按 `type` 字段判别。

> Design note: 事件流是各层之间的契约。Tau 的设计原则之一即"Events make agents teachable"——agent 对外 emit 的不是埋在回调里的控制流，而是一条可被渲染、测试、导出的强类型事件流。provider、渲染层、TUI、以及自定义前端都在这条 `AgentEvent` 流上相遇：UI 只消费事件、绝不反向耦合到 loop 内部。

---

## `tau_agent/provider_events.py` — provider 层流式事件

`provider_events.py` 定义了更底层的**助手消息流式事件**（`AssistantMessageEvent`），
是 `MessageUpdateEvent.assistant_message_event` 的类型。它们描述一个 `AssistantMessage`
从开始到完成的完整生命周期：

- **`AssistantStartEvent`**（`start`）：消息生成开始。
- **`TextStartEvent`**（`text_start`）/ **`TextDeltaEvent`**（`text_delta`）/
  **`TextEndEvent`**（`text_end`）：文本内容块的开始、增量、结束。
- **`ThinkingStartEvent`**（`thinking_start`）/ **`ThinkingDeltaEvent`**
  （`thinking_delta`）/ **`ThinkingEndEvent`**（`thinking_end`）：思考内容块的
  开始、增量、结束。
- **`ToolCallStartEvent`**（`toolcall_start`）/ **`ToolCallDeltaEvent`**
  （`toolcall_delta`）/ **`ToolCallEndEvent`**（`toolcall_end`）：工具调用
  内容块的开始、参数增量、结束（最终生成 `ToolCall` 对象）。
- **`AssistantDoneEvent`**（`done`）：助手回复完成，携带 `reason: DoneReason`
  和最终的 `message: AssistantMessage`。
- **`AssistantErrorEvent`**（`error`）：助手回复出错，携带 `reason: ErrorReason`
  和错误时的 `error: AssistantMessage`。

所有事件都继承 `WireModel`，携带 `partial: AssistantMessage`（累积中的消息快照），
让 UI 层可以跟踪消息的逐步构建过程。

---

## 串联:transcript 模型、agent 事件与 provider 事件的关系

### messages.py 的 transcript 模型如何被 loop/harness 使用
- `loop.py` 维护一份 `list[AgentMessage]` 作为 transcript。每轮开始时把历史消息
  连同系统提示一起序列化传给 provider；
- 模型流式返回时,loop 发出 `MessageStartEvent`→若干 `MessageUpdateEvent`
  （每个携带细粒度的 `AssistantMessageEvent`）→`MessageEndEvent`,并在
  `MessageEndEvent.message` 中把累积出的 `AssistantMessage` 追加进 transcript；
- 若 assistant 发起工具调用,loop 依次发射 `ToolExecutionStartEvent`、
  `ToolExecutionUpdateEvent`(若有)、`ToolExecutionEndEvent`,并把 `AgentToolResult`
  转成 `ToolResultMessage` 追加回 transcript,形成下一轮的输入。

### events.py 的 agent 事件词汇如何被 loop/harness 使用
- loop 在每个阶段产出对应的 `AgentEvent`:运行级（`AgentStartEvent`/`AgentEndEvent`）、
  轮次级（`TurnStartEvent`/`TurnEndEvent`）、消息级（`MessageStartEvent`/
  `MessageUpdateEvent`/`MessageEndEvent`）、工具级（`ToolExecutionStartEvent`/
  `ToolExecutionUpdateEvent`/`ToolExecutionEndEvent`）。
- 这些事件是"agent 层词汇",UI(Textual/Rich/print)只订阅事件流来渲染,绝不反向耦合到
  loop 内部。事件流的稳定性正是 README "Events make agents teachable" 原则在代码中的体现。

### agent 事件与 provider 事件的层次差异
- **provider 层事件**（位于 `tau_ai`）是底层、provider 特定的流式原语，与某个
  具体模型/SDK 的流式格式绑定。
- **助手消息事件**（`provider_events.py` 的 `AssistantMessageEvent`）是 provider 中立
  的流式中间层：loop 把多个 provider 原语归并为 `TextDeltaEvent`、`ThinkingDeltaEvent`、
  `ToolCallDeltaEvent` 等标准事件。
- **agent 事件**（`events.py` 的 `AgentEvent`）是最高层的抽象：`MessageUpdateEvent`
  把 `AssistantMessageEvent` 包装进消息上下文；`ToolExecutionStartEvent`/`EndEvent`
  描述完整的工具执行生命周期。
- 层次是：`tau_ai` provider 事件（具体、细粒度、易变）→
  `provider_events.py` 助手消息事件（provider 中立的流式原语）→
  `events.py` agent 事件（稳定、可持久化、可渲染）。

---

## 本部分小结

Part 2a 把"agent 世界"的基本名词定下来了：

- 所有消息模型继承自 `WireModel` 基类（统一 `extra="forbid"` + camelCase 别名）；
- 消息内容由类型化的**内容块**构成（`TextContent`、`ThinkingContent`、
  `ImageContent`、`ToolCall`），不再是裸字符串；
- transcript 由 7 种消息类型组成：`UserMessage` / `AssistantMessage` /
  `ToolResultMessage` / `BashExecutionMessage` / `CustomMessage` /
  `BranchSummaryMessage` / `CompactionSummaryMessage`；
- 工具是 `AgentTool`（声明 + 执行器），结果是 `AgentToolResult`
  （`content: list[TextContent | ImageContent]`）；
- agent 运行过程以 10 种 `AgentEvent` 对外广播，流式更新通过
  `MessageUpdateEvent` + `AssistantMessageEvent` 二级事件传达。

下一任务（Part 2b）看执行核心：`loop.py` 如何把这些拼成"请求模型→执行工具→
回灌结果→循环"的 agent 循环，以及 `harness.py` 如何持有实时 transcript 并驱动它。

## 逐方法深度剖析（types / messages / tools / events）

> 以下为 agent 层数据模型与事件词汇的逐类型展开。

## 文件:types.py

本文件是 Tau 可移植 agent 层的底层共享类型,只定义 JSON 值相关的类型别名,供 `messages.py`、`tools.py`、`events.py` 等其他模块复用。

### JSONPrimitive

```python
type JSONPrimitive = str | int | float | bool | None
```

- **作用**:定义一个 JSON 原子(标量)值的类型别名。
- **关键字段/实现**:通过 PEP 695 命名类型别名语法,把 JSON 标量归纳为 `str`、`int`、`float`、`bool`、`None` 五类。Pydantic 需要这种命名的递归别名来表达 JSON 类结构(见文件头注释)。本别名不独立使用,而是作为 `JSONValue` 的递归基础。

### JSONValue

```python
type JSONValue = JSONPrimitive | list[JSONValue] | dict[str, JSONValue]
```

- **作用**:定义一个任意嵌套的 JSON 值的类型别名。
- **关键字段/实现**:递归定义 —— 它可以是标量(`JSONPrimitive`)、`JSONValue` 列表,或键为 `str`、值为 `JSONValue` 的字典。这条递归别名是 Tau 中所有"结构化但 provider 中立"的 JSON 字段(如工具参数、自定义 metadata)的真实类型约束。

### JSONObject

```python
type JSONObject = dict[str, JSONValue]
```

- **作用**:定义一个 JSON 对象的类型别名。
- **关键字段/实现**:即 `dict[str, JSONValue]`,表示顶层为对象的 JSON 数据。与 `JSONValue` 的区别在于强制根节点是字典而非列表或标量。

---

## 文件:messages.py

本文件定义了 provider 中立的 transcript(对话记录)消息模型,全部基于 `WireModel` 基类(统一配置 `extra="forbid"` + camelCase 别名生成)。这些消息是 agent loop 在每一轮中累积、持久化、并序列化给 provider 的"转写本"。

### WireModel

```python
class WireModel(BaseModel)
```

- **作用**:所有需要 JSON 交互的 pydantic 模型的基类,统一 wire 格式配置。
- **关键字段/实现**:
  - `model_config = ConfigDict(extra="forbid", populate_by_name=True, validate_by_name=True, serialize_by_alias=True, alias_generator=_to_camel)`:禁止额外字段、接受 Python 名/别名、序列化用 camelCase。
  - `_to_camel(name)`:将 `snake_case` 转为 `camelCase` 的别名生成函数。

### TextContent

```python
class TextContent(WireModel)
```

- **作用**:消息中的文本内容块。
- **关键字段/实现**:
  - `type: Literal["text"] = "text"`:判别字段。
  - `text: str`:文本内容。
  - `text_signature: str | None = None`:某些 provider(如 Gemini)需要回传的签名。

### ThinkingContent

```python
class ThinkingContent(WireModel)
```

- **作用**:消息中的思考/推理内容块。
- **关键字段/实现**:
  - `type: Literal["thinking"] = "thinking"`:判别字段。
  - `thinking: str`:思考文本。
  - `thinking_signature: str | None = None`:可选签名。
  - `redacted: bool = False`:是否被脱敏。

### ImageContent

```python
class ImageContent(WireModel)
```

- **作用**:消息中的图片内容块。
- **关键字段/实现**:
  - `type: Literal["image"] = "image"`:判别字段。
  - `data: str`:base64 编码的图片数据。
  - `mime_type: str`:图片 MIME 类型。

### ToolCall

```python
class ToolCall(WireModel)
```

- **作用**:表示 assistant 发来的执行某具名工具的请求,作为消息内容块存在于 `AssistantMessage.content` 中。
- **关键字段/实现**:
  - `type: Literal["toolCall"] = "toolCall"`:判别字段。
  - `id: str`:调用唯一标识,用于与 `ToolResultMessage.tool_call_id` 关联。
  - `name: str`:要调用的工具名。
  - `arguments: dict[str, JSONValue] = Field(default_factory=dict)`:工具参数。
  - `thought_signature: str | None = None`:某些 provider(如 Gemini)要求下一轮回显的不透明签名。

### UsageCost

```python
class UsageCost(WireModel)
```

- **作用**:记录单次 provider 响应按模型定价表折算的美元费用明细。
- **关键字段/实现**:
  - `input: float = 0.0`:输入侧费用。
  - `output: float = 0.0`:输出侧费用。
  - `cache_read: float = 0.0`:缓存读取费用。
  - `cache_write: float = 0.0`:缓存写入费用。
  - `total: float = 0.0`:总费用。

### Usage

```python
class Usage(WireModel)
```

- **作用**:记录 provider 对一次 assistant 响应上报的真实计费 token 用量。
- **关键字段/实现**:
  - `input: int = 0`:输入 token 数。
  - `output: int = 0`:输出 token 数。
  - `cache_read: int = 0`:缓存读取 token 数。
  - `cache_write: int = 0`:缓存写入 token 数。
  - `cache_write_1h: int | None = None`:1 小时缓存写入子集,仅 Anthropic 上报。
  - `reasoning: int | None = None`:推理 token,是 `output` 的子集。
  - `total_tokens: int = 0`:总 token 数。
  - `cost: UsageCost = UsageCost()`:费用明细,默认空实例。

### UserMessage

```python
class UserMessage(WireModel)
```

- **作用**:表示一条由用户撰写的消息。
- **关键字段/实现**:
  - `role: Literal["user"] = "user"`:固定角色。
  - `content: UserContent`:消息正文,类型为 `str | list[TextContent | ImageContent]`。传入 `str` 时自动转为 `[TextContent(text=...)]`。
  - `timestamp: int`:消息创建时间戳(毫秒)。
  - `.text` 属性:返回消息的纯文本内容(通过 `content_text` 提取)。

### AssistantDiagnosticError

```python
class AssistantDiagnosticError(WireModel)
```

- **作用**:助手消息中的诊断错误信息。
- **关键字段/实现**:
  - `name: str | None = None`:错误名。
  - `message: str`:错误描述。
  - `stack: str | None = None`:堆栈。
  - `code: str | int | None = None`:错误码。

### AssistantMessageDiagnostic

```python
class AssistantMessageDiagnostic(WireModel)
```

- **作用**:助手消息中的诊断条目。
- **关键字段/实现**:
  - `type: str`:诊断类型。
  - `timestamp: int`:时间戳。
  - `error: AssistantDiagnosticError | None = None`:可选错误。
  - `details: dict[str, JSONValue] | None = None`:可选详情。

### AssistantMessage

```python
class AssistantMessage(WireModel)
```

- **作用**:表示一条由 assistant 撰写的消息,内容由有序的内容块列表构成。
- **关键字段/实现**:
  - `role: Literal["assistant"] = "assistant"`:固定角色。
  - `content: list[AssistantContent]`:内容块列表(`TextContent`/`ThinkingContent`/`ToolCall`)。
  - `api: str = "unknown"`:API 名称。
  - `provider: str = "unknown"`:provider 名称。
  - `model: str = "unknown"`:模型名。
  - `response_model: str | None = None`:响应模型。
  - `response_id: str | None = None`:响应 ID。
  - `diagnostics: list[AssistantMessageDiagnostic] | None = None`:诊断信息。
  - `usage: Usage = Usage()`:用量信息。
  - `stop_reason: StopReason = "stop"`:停止原因。
  - `error_message: str | None = None`:错误信息。
  - `timestamp: int`:时间戳。
  - `.text` 属性:合并所有 `TextContent` 的文本。
  - `.thinking_text` 属性:合并所有 `ThinkingContent` 的思考文本。
  - `.tool_calls` 属性:提取所有 `ToolCall` 内容块。
  - `_normalize_convenient_content`:构造时接受 `str` 自动转为 `[TextContent(text=...)]`。

### ToolResultMessage

```python
class ToolResultMessage(WireModel)
```

- **作用**:表示一条包含先前工具调用结果的 transcript 消息。
- **关键字段/实现**:
  - `role: Literal["toolResult"] = "toolResult"`:固定角色。
  - `tool_call_id: str`:对应 `ToolCall.id`。
  - `tool_name: str`:工具名。
  - `content: list[ToolResultContent]`:结果内容块列表(`TextContent`/`ImageContent`)。
  - `details: JSONValue = None`:可选结构化结果数据。
  - `added_tool_names: list[str] | None = None`:可选新增工具名。
  - `is_error: bool = False`:是否错误。
  - `.text` 属性:提取纯文本。
  - 构造时支持传入 `str` 自动转换。

### BashExecutionMessage

```python
class BashExecutionMessage(WireModel)
```

- **作用**:表示一条 bash 命令执行记录。
- **关键字段/实现**:
  - `role: Literal["bashExecution"] = "bashExecution"`:固定角色。
  - `command: str`:执行的命令。
  - `output: str`:命令输出。
  - `exit_code: int | None = None`:退出码。
  - `cancelled: bool = False`:是否被取消。
  - `truncated: bool = False`:输出是否被截断。
  - `full_output_path: str | None = None`:完整输出文件路径。
  - `exclude_from_context: bool = False`:是否从上下文中排除。

### CustomMessage

```python
class CustomMessage(WireModel)
```

- **作用**:表示一条扩展自定义消息,用于展示元数据。
- **关键字段/实现**:
  - `role: Literal["custom"] = "custom"`:固定角色。
  - `custom_type: str`:自定义渲染类型。
  - `content: UserContent`:消息内容。
  - `display: bool = True`:是否显示。
  - `details: JSONValue = None`:可选结构化展示元数据。
  - `.text` 属性:提取纯文本。

### BranchSummaryMessage

```python
class BranchSummaryMessage(WireModel)
```

- **作用**:表示一条分支切换摘要消息。
- **关键字段/实现**:
  - `role: Literal["branchSummary"] = "branchSummary"`:固定角色。
  - `summary: str`:摘要文本。
  - `from_id: str`:来源消息 ID。

### CompactionSummaryMessage

```python
class CompactionSummaryMessage(WireModel)
```

- **作用**:表示一条上下文压缩摘要消息。
- **关键字段/实现**:
  - `role: Literal["compactionSummary"] = "compactionSummary"`:固定角色。
  - `summary: str`:摘要文本。
  - `tokens_before: int`:压缩前 token 数。

### AgentMessage

```python
type AgentMessage = Annotated[UserMessage | AssistantMessage | ToolResultMessage | BashExecutionMessage | CustomMessage | BranchSummaryMessage | CompactionSummaryMessage, Field(discriminator="role")]
```

- **作用**:transcript 消息的联合类型别名,用 `role` 字段判别。
- **关键字段/实现**:是上面 7 个消息类的并集。agent loop 累积的 transcript 即 `list[AgentMessage]`。

### content_text

```python
def content_text(content: str | list[Any]) -> str
```

- **作用**:从 `str | list[TextContent | ImageContent]` 中提取纯文本。
- **关键字段/实现**:若 `content` 是 `str` 直接返回;否则合并所有 `TextContent.text`。

### message_text

```python
def message_text(message: AgentMessage) -> str
```

- **作用**:从任意 `AgentMessage` 提取用户可见文本。
- **关键字段/实现**:根据消息类型返回 `.text`、`.summary` 或 `.output`。

### assistant_content

```python
def assistant_content(text: str, tool_calls: list[ToolCall] | tuple[ToolCall, ...] = ()) -> list[AssistantContent]
```

- **作用**:从 parser 累积的文本和工具调用构建标准的 `list[AssistantContent]`。
- **关键字段/实现**:先放 `TextContent`(若有文本),再追加 `ToolCall`。

---

## 文件:tools.py

本文件定义 provider 中立的工具契约与工具执行结果,核心是 `AgentTool` 这个冻结 dataclass(工具的可调用单元),以及描述"执行结果"的 `AgentToolResult` Pydantic 模型,外加若干用于取消、进度、渲染和执行的 Protocol。

### ToolCancellationToken

```python
class ToolCancellationToken(Protocol)
```

- **作用**:工具可接受的极简取消接口 Protocol。
- **关键字段/实现**:声明方法 `is_cancelled(self) -> bool`,返回工具是否应当停止执行。

### ToolUpdateCallback

```python
ToolUpdateCallback = Callable[[AgentToolResult], None]
```

- **作用**:同步的进度回调,传给选择加入进度上报的执行器。
- **关键字段/实现**:接受 `AgentToolResult` 参数(包含 `content`/`details`/`added_tool_names`/`terminate`)。loop 会把每次调用桥接成 `ToolExecutionUpdateEvent`。

### ToolCallRenderer

```python
class ToolCallRenderer(Protocol)
```

- **作用**:可选展示钩子:把一个工具调用的参数渲染成单行显示文本。
- **关键字段/实现**:声明 `__call__(self, arguments: Mapping[str, JSONValue]) -> str | None`,返回展示行或 `None`。

### ToolResultRenderer

```python
class ToolResultRenderer(Protocol)
```

- **作用**:可选展示钩子:为 transcript 中的工具结果渲染显示内容。
- **关键字段/实现**:声明 `__call__(self, result: AgentToolResult, *, expanded: bool) -> str | None`。

### ToolExecutor

```python
class ToolExecutor(Protocol)
```

- **作用**:用于执行工具的异步可调用 Protocol。
- **关键字段/实现**:声明 `__call__(self, tool_call_id: str, arguments: Mapping[str, JSONValue], signal: ToolCancellationToken | None = None, on_update: ToolUpdateCallback | None = None) -> Awaitable[AgentToolResult]`。第一个参数是 `tool_call_id`。

### ToolExecutionMode

```python
ToolExecutionMode = Literal["sequential", "parallel"]
```

- **作用**:工具执行模式——顺序或并行。

### ToolArgumentPreparer

```python
ToolArgumentPreparer = Callable[[object], Mapping[str, JSONValue]]
```

- **作用**:参数预处理器,在执行前转换/验证参数。

### AgentToolResult

```python
class AgentToolResult(WireModel)
```

- **作用**:工具执行返回的结构化结果模型。
- **关键字段/实现**:
  - `content: list[TextContent | ImageContent]`:结果内容块列表(不再是裸 `str`)。
  - `details: JSONValue = None`:可选结构化结果。
  - `added_tool_names: list[str] | None = None`:可选新增工具名。
  - `terminate: bool | None = None`:是否终止循环。
  - `.text` 属性:提取纯文本。
  - `_normalize_text_content`:构造时传入 `str` 自动转为 `[TextContent(text=...)]`。

### AgentTool

```python
@dataclass(frozen=True, slots=True)
class AgentTool
```

- **作用**:暴露给 agent loop 的一个完整工具单元。
- **关键字段/实现**:
  - `name: str`:工具名。
  - `label: str`:显示标签。
  - `description: str`:工具说明。
  - `parameters: Mapping[str, JSONValue]`:参数 JSON schema。
  - `execute_fn: ToolExecutor`:实际执行函数。
  - `prompt_snippet: str | None = None`:注入进 prompt 的片段。
  - `prompt_guidelines: tuple[str, ...] = ()`:注入的指引集合。
  - `prepare_arguments: ToolArgumentPreparer | None = None`:参数预处理器。
  - `execution_mode: ToolExecutionMode = "parallel"`:执行模式。
  - `render_call: ToolCallRenderer | None = None`:可选调用渲染钩子。
  - `render_result: ToolResultRenderer | None = None`:可选结果渲染钩子。
  - `input_schema` 属性:返回 `parameters` 的别名。
#### method
  ```python
  async def execute(self, tool_call_id, arguments, signal=None, on_update=None) -> AgentToolResult
  ```
  - 执行工具:直接转发给 `execute_fn`。

### 工具契约如何被 harness/loop 调用

- agent loop 持有一组 `AgentTool`(注册表)。每轮把各工具的 `name`/`description`/`parameters` 组装成 provider 的工具声明发给模型;模型返回的 `ToolCall` 嵌在 `AssistantMessage.content` 中。
- loop 按 `ToolCall.name` 从注册表取出 `AgentTool`,调用 `AgentTool.execute(tool_call_id, arguments, signal, on_update)`;执行结果 `AgentToolResult` 被包装成 `ToolResultMessage` 追加回 transcript,并以 `ToolExecutionStartEvent`/`ToolExecutionUpdateEvent`/`ToolExecutionEndEvent` 的形式广播给前端。

---

## 文件:events.py

本文件定义 Tau 可移植 agent 层向外发射的事件词汇表,全部继承 `WireModel`(统一 `extra="forbid"` + camelCase 别名),用 `type: Literal[...]` 判别。这些事件由 loop/harness 在运行期产生,UI 层只消费事件。文末 `AgentEvent` 联合类型是所有事件的并集。

### AgentStartEvent

```python
class AgentStartEvent(WireModel)
```

- **作用**:标记一次 agent 运行的开始。
- **关键字段/实现**:`type: Literal["agent_start"] = "agent_start"` 固定判别字段。

### AgentEndEvent

```python
class AgentEndEvent(WireModel)
```

- **作用**:标记一次 agent 运行的结束。
- **关键字段/实现**:
  - `type: Literal["agent_end"] = "agent_end"`。
  - `messages: list[AgentMessage] = Field(default_factory=list)`:本次运行产出的全部消息。

### TurnStartEvent

```python
class TurnStartEvent(WireModel)
```

- **作用**:标记一个对话轮次开始。
- **关键字段/实现**:`type: Literal["turn_start"] = "turn_start"`。不再有 `turn: int` 字段。

### TurnEndEvent

```python
class TurnEndEvent(WireModel)
```

- **作用**:标记一个对话轮次结束。
- **关键字段/实现**:
  - `type: Literal["turn_end"] = "turn_end"`。
  - `message: AgentMessage`:本轮产出的助手消息。
  - `tool_results: list[ToolResultMessage] = Field(default_factory=list)`:本轮的工具结果。

### MessageStartEvent

```python
class MessageStartEvent(WireModel)
```

- **作用**:标记一条消息开始组装。
- **关键字段/实现**:
  - `type: Literal["message_start"] = "message_start"`。
  - `message: AgentMessage`:正在组装的消息。

### MessageUpdateEvent

```python
class MessageUpdateEvent(WireModel)
```

- **作用**:消息的流式更新,替代旧的 `MessageDeltaEvent` + `ThinkingDeltaEvent`。
- **关键字段/实现**:
  - `type: Literal["message_update"] = "message_update"`。
  - `message: AgentMessage`:累积中的消息快照。
  - `assistant_message_event: AssistantMessageEvent`:来自 `provider_events.py` 的细粒度流式事件。

### MessageEndEvent

```python
class MessageEndEvent(WireModel)
```

- **作用**:标记一条消息完整生成/接收完毕。
- **关键字段/实现**:
  - `type: Literal["message_end"] = "message_end"`。
  - `message: AgentMessage`:完成的消息对象。

### ToolExecutionStartEvent

```python
class ToolExecutionStartEvent(WireModel)
```

- **作用**:标记一个工具调用开始执行。
- **关键字段/实现**:
  - `type: Literal["tool_execution_start"] = "tool_execution_start"`。
  - `tool_call_id: str`:关联的工具调用 ID。
  - `tool_name: str`:工具名。
  - `args: dict[str, JSONValue]`:工具参数。

### ToolExecutionUpdateEvent

```python
class ToolExecutionUpdateEvent(WireModel)
```

- **作用**:标记工具执行过程中的一次进度更新。
- **关键字段/实现**:
  - `type: Literal["tool_execution_update"] = "tool_execution_update"`。
  - `tool_call_id: str`:关联的工具调用。
  - `tool_name: str`:工具名。
  - `args: dict[str, JSONValue]`:工具参数。
  - `partial_result: AgentToolResult`:部分/最终结果。

### ToolExecutionEndEvent

```python
class ToolExecutionEndEvent(WireModel)
```

- **作用**:标记一个工具调用执行结束。
- **关键字段/实现**:
  - `type: Literal["tool_execution_end"] = "tool_execution_end"`。
  - `tool_call_id: str`:关联的工具调用 ID。
  - `tool_name: str`:工具名。
  - `result: AgentToolResult`:最终结果。
  - `is_error: bool`:是否错误。

### AgentEvent

```python
type AgentEvent = Annotated[AgentStartEvent | AgentEndEvent | TurnStartEvent | TurnEndEvent | MessageStartEvent | MessageUpdateEvent | MessageEndEvent | ToolExecutionStartEvent | ToolExecutionUpdateEvent | ToolExecutionEndEvent, Field(discriminator="type")]
```

- **作用**:所有 agent 层事件的联合类型别名,用 `type` 字段判别。
- **关键字段/实现**:并集覆盖上面全部 10 个事件类。

---

## 文件:provider_events.py

本文件定义助手消息的流式原语,是 `MessageUpdateEvent.assistant_message_event` 的类型,描述 `AssistantMessage` 从开始到完成的完整生命周期。全部继承 `WireModel`。

### AssistantStartEvent

```python
class AssistantStartEvent(WireModel)
```

- **作用**:助手消息生成开始。
- **关键字段/实现**:
  - `type: Literal["start"] = "start"`。
  - `partial: AssistantMessage`:当前消息快照。

### TextStartEvent / TextDeltaEvent / TextEndEvent

```python
class TextStartEvent(WireModel)
class TextDeltaEvent(WireModel)
class TextEndEvent(WireModel)
```

- **作用**:文本内容块的开始、增量、结束。
- **关键字段/实现**:
  - `type`: `"text_start"` / `"text_delta"` / `"text_end"`。
  - `content_index: int`:内容块在列表中的索引。
  - `partial: AssistantMessage`:消息快照。
  - `TextDeltaEvent` 额外有 `delta: str`。
  - `TextEndEvent` 额外有 `content: str`(完整文本)。

### ThinkingStartEvent / ThinkingDeltaEvent / ThinkingEndEvent

```python
class ThinkingStartEvent(WireModel)
class ThinkingDeltaEvent(WireModel)
class ThinkingEndEvent(WireModel)
```

- **作用**:思考内容块的开始、增量、结束。
- **关键字段/实现**:结构同文本事件,type 分别为 `"thinking_start"`/`"thinking_delta"`/`"thinking_end"`。

### ToolCallStartEvent / ToolCallDeltaEvent / ToolCallEndEvent

```python
class ToolCallStartEvent(WireModel)
class ToolCallDeltaEvent(WireModel)
class ToolCallEndEvent(WireModel)
```

- **作用**:工具调用内容块的开始、参数增量、结束。
- **关键字段/实现**:
  - `type`: `"toolcall_start"` / `"toolcall_delta"` / `"toolcall_end"`。
  - `content_index: int`、`partial: AssistantMessage`。
  - `ToolCallDeltaEvent` 额外有 `delta: str`。
  - `ToolCallEndEvent` 额外有 `tool_call: ToolCall`(最终生成的工具调用对象)。

### AssistantDoneEvent

```python
class AssistantDoneEvent(WireModel)
```

- **作用**:助手回复完成。
- **关键字段/实现**:
  - `type: Literal["done"] = "done"`。
  - `reason: DoneReason`:停止原因(`"stop"`/`"length"`/`"toolUse"`)。
  - `message: AssistantMessage`:最终消息。

### AssistantErrorEvent

```python
class AssistantErrorEvent(WireModel)
```

- **作用**:助手回复出错。
- **关键字段/实现**:
  - `type: Literal["error"] = "error"`。
  - `reason: ErrorReason`:错误原因(`"aborted"`/`"error"`)。
  - `error: AssistantMessage`:错误时的消息。

### AssistantMessageEvent

```python
type AssistantMessageEvent = Annotated[AssistantStartEvent | TextStartEvent | TextDeltaEvent | TextEndEvent | ThinkingStartEvent | ThinkingDeltaEvent | ThinkingEndEvent | ToolCallStartEvent | ToolCallDeltaEvent | ToolCallEndEvent | AssistantDoneEvent | AssistantErrorEvent, Field(discriminator="type")]
```

- **作用**:助手消息流式事件的联合类型,是 `MessageUpdateEvent.assistant_message_event` 的类型。

---

<!-- NAV -->
[← tau_ai · 各 Provider 实现]({{< relref "./ai-providers.md" >}})
[↑ 总览]({{< relref "./source-walkthrough.md" >}})
[→ tau_agent · 执行核心]({{< relref "./agent-loop-harness.md" >}})
