---
title: tau_agent · 数据模型
description: types / messages / tools / events
---

## `tau_agent/types.py` — JSON 值类型别名

只有 8 行，但整个 agent 包各处都用得到：

- **`JSONPrimitive = str | int | float | bool | None`**
- **`JSONValue = JSONPrimitive | list[JSONValue] | dict[str, JSONValue]`**（递归）
- **`JSONObject = dict[str, JSONValue]`**

用 PEP 695 `type` 别名（而非 `typing` 旧式），因为递归 JSON 值需要命名递归别名。
所有工具参数、结构化数据、事件 `data` 字段都基于它们。

---

## `tau_agent/messages.py` — 对话 transcript 的消息模型

一组 pydantic `BaseModel`（`extra="forbid"`），描述在模型、工具、持久化之间
流动的"消息"。所有消息都带 `role` 字面量判别字段，以保证反序列化时能路由到正确的具体类型。

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
  中上报进度的 fire-and-forget 回调（`data` 是有结构的可选字典，不是任意值）。loop 把它桥接成
  `ToolExecutionUpdateEvent`。必须在事件循环线程调用（桥接用 `asyncio.Queue`，非线程安全）；worker 线程里的
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

> Design note: 事件流是各层之间的契约。Tau 的设计原则之一即"Events make agents teachable"——agent 对外 emit 的不是埋在回调里的控制流，而是一条可被渲染、测试、导出的强类型事件流。provider、渲染层、TUI、以及自定义前端都在这条 `AgentEvent` 流上相遇：UI 只消费事件、绝不反向耦合到 loop 内部。这使同一份 agent 核心既能驱动 print 模式，也能驱动 Rich 或 Textual TUI，无需改动 `run_agent_loop`。

---

## 本部分小结

Part 2a 把"agent 世界"的基本名词定下来了：

- transcript 由 `UserMessage` / `AssistantMessage` / `ToolResultMessage` 组成；
- 工具是 `AgentTool`（声明 + 执行器），调用是 `ToolCall`，结果是
  `AgentToolResult`；
- agent 运行过程以 14 种 `AgentEvent` 对外广播。

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
- **关键字段/实现**:递归定义 —— 它可以是标量(`JSONPrimitive`)、`JSONValue` 列表,或键为 `str`、值为 `JSONValue` 的字典。这条递归别名是 Tau 中所有“结构化但 provider 中立”的 JSON 字段(如工具参数、自定义 metadata)的真实类型约束。

### JSONObject

```python
type JSONObject = dict[str, JSONValue]
```

- **作用**:定义一个 JSON 对象的类型别名。
- **关键字段/实现**:即 `dict[str, JSONValue]`,表示顶层为对象的 JSON 数据。与 `JSONValue` 的区别在于强制根节点是字典而非列表或标量。

---

## 文件:messages.py

本文件定义了 provider 中立的 transcript(对话记录)消息模型,全部基于 Pydantic `BaseModel`,并通过 `model_config = ConfigDict(extra="forbid")` 禁止未知字段,以保证会话文件在各版本的二进制间可前向兼容地解析。这些消息是 agent loop 在每一轮中累积、持久化、并序列化给 provider 的“转写本”。

### UsageCost

```python
class UsageCost(BaseModel)
```

- **作用**:记录单次 provider 响应按模型定价表折算的美元费用明细。移植自 Pi 的 `Usage.cost`。
- **关键字段/实现**:
  - `model_config = ConfigDict(extra="forbid")`:禁止额外字段。
  - `input: float = 0.0`:输入侧费用。
  - `output: float = 0.0`:输出侧费用。
  - `cache_read: float = 0.0`:缓存读取费用。
  - `cache_write: float = 0.0`:缓存写入费用。
  - `total: float = 0.0`:总费用。
  - 注释明确指出 Tau 目前尚无定价表,所以 provider 会把外层的 `Usage.cost` 置 `None`(phase-21 裁决),本模型仅预留接口。

### Usage

```python
class Usage(BaseModel)
```

- **作用**:记录 provider 对一次 assistant 响应上报的真实计费 token 用量(移植自 Pi 的 `Usage`,转为 snake_case)。注意这是 provider 的计费口径,不是本地估算。
- **关键字段/实现**:
  - `model_config = ConfigDict(extra="forbid")`。
  - `input: int = 0`:输入 token 数。
  - `output: int = 0`:输出 token 数。
  - `cache_read: int = 0`:缓存读取 token 数。
  - `cache_write: int = 0`:缓存写入 token 数。
  - `cache_write_1h: int | None = None`:1 小时缓存写入子集,仅 Anthropic 上报。
  - `reasoning: int | None = None`:推理 token,它是 `output` 的子集(已包含在 `output` 内)。
  - `total_tokens: int = 0`:总 token 数。
  - `cost: UsageCost | None = None`:费用明细,可空。

### UserMessage

```python
class UserMessage(BaseModel)
```

- **作用**:表示一条由用户撰写的消息。`custom_type`/`details` 是扩展通过 `send_custom_message` 附加的展示元数据,对模型无害(模型仍读 `content`),让前端用注册的自定义渲染器而非原始内容来呈现。
- **关键字段/实现**:
  - `model_config = ConfigDict(extra="forbid")`。
  - `role: Literal["user"] = "user"`:固定角色。
  - `content: str`:消息正文。
  - `custom_type: str | None = None`:可选自定义渲染类型。
  - `details: dict[str, JSONValue] | None = None`:可选结构化展示元数据。
  - 两者默认 `None`,且**当为 None 时从序列化中省略**,使未使用自定义消息的旧会话文件字节级兼容(旧二进制用 `extra="forbid"` 会拒绝未知键)。
#### method
  ```python
  @model_serializer(mode="wrap")
  def _omit_unused_custom_metadata(self, handler) -> dict[str, Any]
  ```
  - 序列化包装器:调用 `handler(self)` 得到基础 dict,若 `custom_type` 为 `None` 则 `pop` 掉它,若 `details` 为 `None` 则 `pop` 掉它,再返回。仅针对这两个条件字段做裁剪,其他字段(含显式 `None`)语义不变。

### AssistantMessage

```python
class AssistantMessage(BaseModel)
```

- **作用**:表示一条由 assistant 撰写的消息,可携带工具调用与用量信息。几乎每个会话都含 assistant 消息,因此 `usage` 的序列化处理尤为重要。
- **关键字段/实现**:
  - `model_config = ConfigDict(extra="forbid")`。
  - `role: Literal["assistant"] = "assistant"`:固定角色。
  - `content: str = ""`:回复正文,默认空串。
  - `tool_calls: list[ToolCall] = Field(default_factory=list)`:本消息包含的工具调用列表(`ToolCall` 来自 `tau_agent.tools`)。
  - `usage: Usage | None = None`:本次响应用量,默认 `None`。
  - `usage` 在 `None` 时**从序列化中省略**,理由与前向兼容相同(避免每个会话都写入 `"usage": null` 导致旧二进制无法读)。
#### method
  ```python
  @model_serializer(mode="wrap")
  def _omit_unused_usage(self, handler) -> dict[str, Any]
  ```
  - 序列化包装器:得到基础 dict 后,若 `usage` 为 `None` 则 `pop` 掉,返回。保证未记录用量的 assistant 消息保持旧 wire 格式。

### ToolResultMessage

```python
class ToolResultMessage(BaseModel)
```

- **作用**:表示一条包含先前工具调用结果的 transcript 消息,用于把工具执行结果回灌给模型。
- **关键字段/实现**:
  - `model_config = ConfigDict(extra="forbid")`。
  - `role: Literal["tool"] = "tool"`:固定角色。
  - `tool_call_id: str`:对应 `ToolCall.id`,用于关联请求。
  - `name: str`:工具名。
  - `content: str`:结果正文。
  - `ok: bool = True`:是否成功执行。
  - `data: dict[str, JSONValue] | None = None`:可选结构化结果数据。
  - `details: dict[str, JSONValue] | None = None`:可选展示元数据。
  - `error: str | None = None`:可选错误信息(失败时)。

### AgentMessage

```python
type AgentMessage = UserMessage | AssistantMessage | ToolResultMessage
```

- **作用**:transcript 消息的联合类型别名,代表一条合法的对话记录条目。
- **关键字段/实现**:是上面三个消息类的并集。agent loop 累积的 transcript 即 `list[AgentMessage]`;`events.py` 中的 `MessageEndEvent.message` 也用此类型承载最终完成的消息。注意不存在独立的 `ToolCallMessage`/`SystemMessage` 顶层模型:工具调用内嵌在 `AssistantMessage.tool_calls`,系统提示不在此 transcript 模型内(由 loop/harness 单独传入 provider)。

---

## 文件:tools.py

本文件定义 provider 中立的工具契约与工具执行结果,核心是 `AgentTool` 这个冻结 dataclass(工具的可调用单元),以及描述“调用请求”和“执行结果”的两个 Pydantic 模型,外加若干用于取消、进度、渲染和执行的 Protocol。

### ToolCancellationToken

```python
class ToolCancellationToken(Protocol)
```

- **作用**:工具可接受的极简取消接口 Protocol。
- **关键字段/实现**:声明方法 `is_cancelled(self) -> bool`,返回工具是否应当停止执行。loop 在调用工具时传入实现了该接口的对象,工具在执行中轮询它以支持中断。

### ToolUpdateCallback

```python
class ToolUpdateCallback(Protocol)
```

- **作用**:同步、fire-and-forget 的进度回调 Protocol,传给选择加入进度上报的执行器。
- **关键字段/实现**:
  - 声明 `__call__(self, message: str, data: dict[str, JSONValue] | None = None) -> None`:上报一条人类可读 `message` 及可选 `data`。
  - loop 会把每次调用桥接成 `ToolExecutionUpdateEvent(message, data)`;payload 比 Pi 的完整 `AgentToolResult` 部分更轻量(只有 message + data,无 content/details 回显)。
  - **必须在事件循环线程调用**:桥接层 `asyncio.Queue` 非线程安全,worker 线程中的执行器须切回 loop 线程再报告。

### ToolCallRenderer

```python
class ToolCallRenderer(Protocol)
```

- **作用**:可选展示钩子:把一个工具调用的参数渲染成单行显示文本(对应 Pi 的 `renderCall`,但返回纯字符串而非 UI 组件)。
- **关键字段/实现**:声明 `__call__(self, arguments: Mapping[str, JSONValue]) -> str | None`,返回展示行或 `None`(回退到通用的 `name arguments` 形式),例如 subagent 工具显示其 `description` 参数。

### ToolResultRenderer

```python
class ToolResultRenderer(Protocol)
```

- **作用**:可选展示钩子:为 transcript 中的工具结果渲染显示内容(对应 Pi 的 `renderResult`,返回 Rich-markup 字符串)。
- **关键字段/实现**:声明 `__call__(self, result: AgentToolResult, *, expanded: bool) -> str | None`,返回的 markup 替换通用结果块,而调用行(来自 `render_call`)保留;`expanded` 区分折叠行与展开结果视图;返回 `None` 则回退到通用结果块。运行状态(旋转/spinner/计时)留在宿主端。

### ToolExecutor

```python
class ToolExecutor(Protocol)
```

- **作用**:用于执行工具的异步可调用 Protocol,是 `AgentTool.executor` 的基本形态。
- **关键字段/实现**:声明 `__call__(self, arguments: Mapping[str, JSONValue], signal: ToolCancellationToken | None = None) -> Awaitable[AgentToolResult]`,以 provider 中立的 JSON 类参数执行工具,返回 `AgentToolResult`。

### ToolExecutorWithUpdate

```python
class ToolExecutorWithUpdate(Protocol)
```

- **作用**:`ToolExecutor` 的变体,额外接受进度回调,供想要上报实时进度的执行器声明。
- **关键字段/实现**:声明 `__call__(self, arguments, signal=None, *, on_update: ToolUpdateCallback | None = None) -> Awaitable[AgentToolResult]`。`AgentTool.execute` 在构造时通过 `inspect.signature` 探测此参数,只对声明了 `on_update` 的执行器转发回调,其余执行器保持原签名不变。

### ToolCall

```python
class ToolCall(BaseModel)
```

- **作用**:表示 assistant 发来的执行某具名工具的请求(工具调用请求模型)。
- **关键字段/实现**:
  - `model_config = ConfigDict(extra="forbid")`。
  - `id: str`:调用唯一标识,用于与 `ToolResultMessage.tool_call_id` / `ToolExecutionEndEvent` 关联。
  - `name: str`:要调用的工具名。
  - `arguments: dict[str, JSONValue] = Field(default_factory=dict)`:工具参数。
  - `thought_signature: str | None = None`:某些 provider(如 Gemini)要求下一轮回显的不透明签名;不使用它的 provider 忽略此字段。

### AgentToolResult

```python
class AgentToolResult(BaseModel)
```

- **作用**:工具执行返回的结构化结果模型(注意:本文件直接定义的具名结果类是 `AgentToolResult`,而非任务描述里假设的 `ToolResult`)。
- **关键字段/实现**:
  - `model_config = ConfigDict(extra="forbid")`。
  - `tool_call_id: str`:对应 `ToolCall.id`。
  - `name: str`:工具名。
  - `ok: bool`:是否成功。
  - `content: str`:结果正文。
  - `data: dict[str, JSONValue] | None = None`:可选结构化结果。
  - `details: dict[str, JSONValue] | None = None`:可选展示元数据。
  - `error: str | None = None`:可选错误信息。
  - 它是 `ToolResultRenderer.__call__` 与 `ToolExecutionEndEvent.result` 的承载类型,也是构造 `ToolResultMessage` 的输入来源。

### AgentTool

```python
@dataclass(frozen=True, slots=True)
class AgentTool
```

- **作用**:暴露给 agent loop 的一个完整工具单元(冻结、slot 化的 dataclass),聚合名称、描述、参数 schema、执行器与可选的展示钩子。它是“工具契约”的核心载体。
- **关键字段/实现**:
  - `name: str`:工具名(模型在 `tool_calls` 中按此名匹配)。
  - `description: str`:工具说明,作为系统提示/工具描述的一部分提供给模型。
  - `input_schema: Mapping[str, JSONValue]`:参数 JSON schema,用于约束并暴露给模型。
  - `executor: ToolExecutor`:实际执行函数(可以是普通 `ToolExecutor` 或 opt-in 进度的 `ToolExecutorWithUpdate`)。
  - `prompt_snippet: str | None = None`:注入进 prompt 的片段。
  - `prompt_guidelines: tuple[str, ...] = ()`:注入的指引集合。
  - `render_call: ToolCallRenderer | None = None`:可选调用渲染钩子。
  - `render_result: ToolResultRenderer | None = None`:可选结果渲染钩子。
  - `_accepts_on_update: bool = field(init=False, repr=False, compare=False, default=False)`:私有标志,记录执行器是否接受 `on_update` 回调(非构造参数)。
#### method
  ```python
  def __post_init__(self) -> None
  ```
  - 构造后钩子:用 `inspect.signature(self.executor).parameters` 探测执行器是否声明 `on_update` 参数,通过 `object.__setattr__` 设置 `_accepts_on_update`(因 dataclass 冻结,必须用 object 方式赋值)。仅在此处探测一次。
#### method
  ```python
  async def execute(self, arguments, signal=None, *, on_update=None) -> AgentToolResult
  ```
  - 执行工具:若传入 `on_update` 且 `_accepts_on_update` 为真,则把执行器 cast 为 `ToolExecutorWithUpdate` 并转发 `on_update`;否则按原始 `(arguments, signal)` 调用。返回 `AgentToolResult`。这保证了旧执行器无需改动即可兼容。

### 工具契约如何被 harness/loop 调用

- agent loop 持有一组 `AgentTool`(注册表)。每轮把各工具的 `name`/`description`/`input_schema` 组装成 provider 的工具声明发给模型;模型返回 `AssistantMessage.tool_calls`(`list[ToolCall]`)。
- loop 按 `ToolCall.name` 从注册表取出 `AgentTool`,调用 `AgentTool.execute(arguments, signal, on_update=...)`(经 `ToolCall.id` 关联);执行结果 `AgentToolResult` 被包装成 `ToolResultMessage` 追加回 transcript,并以 `ToolExecutionStartEvent`/`ToolExecutionUpdateEvent`/`ToolExecutionEndEvent` 的形式广播给前端。
- 取消通过 `ToolCancellationToken` 贯穿 loop→执行器;进度通过 `ToolUpdateCallback`→`ToolExecutionUpdateEvent` 桥接。文件未在此提供独立的 `ToolError` 异常类或 `validate_tool_call` 辅助函数(任务描述中假定存在,但源码实际未定义);参数校验由 provider/loop 依据 `input_schema` 完成,错误以 `AgentToolResult.ok=False` + `error` 体现。

---

## 文件:events.py

本文件定义 Tau 可移植 agent 层向外发射的事件词汇表,全部为 PEP 695 之前的 Pydantic `BaseModel`,`extra="forbid"`。这些事件由 loop/harness 在运行期产生,UI 层(Textual/Rich/print)只消费事件,从而把渲染与 agent 核心解耦。文末 `AgentEvent` 联合类型是所有事件的并集。

### AgentStartEvent

```python
class AgentStartEvent(BaseModel)
```

- **作用**:标记一次 agent 运行(整个会话处理流程)的开始。
- **关键字段/实现**:`type: Literal["agent_start"] = "agent_start"` 固定判别字段。

### AgentEndEvent

```python
class AgentEndEvent(BaseModel)
```

- **作用**:标记一次 agent 运行的结束。
- **关键字段/实现**:`type: Literal["agent_end"] = "agent_end"`。

### TurnStartEvent

```python
class TurnStartEvent(BaseModel)
```

- **作用**:标记一个对话轮次(loop 的一次迭代)开始。
- **关键字段/实现**:`type: Literal["turn_start"] = "turn_start"`;`turn: int` 为轮次序号。

### TurnEndEvent

```python
class TurnEndEvent(BaseModel)
```

- **作用**:标记一个对话轮次结束。
- **关键字段/实现**:`type: Literal["turn_end"] = "turn_end"`;`turn: int` 轮次序号。

### RetryEvent

```python
class RetryEvent(BaseModel)
```

- **作用**:标记一次重试(如 provider 调用失败或解析失败后的恢复尝试)。
- **关键字段/实现**:
  - `type: Literal["retry"] = "retry"`。
  - `attempt: int`:当前尝试次数。
  - `max_attempts: int`:最大尝试次数。
  - `delay_seconds: float`:重试延迟秒数。
  - `message: str`:说明文本。
  - `data: dict[str, JSONValue] | None = None`:可选结构化上下文。

### QueueUpdateEvent

```python
class QueueUpdateEvent(BaseModel)
```

- **作用**:反映任务队列/调度状态的变化(如 steering 与 follow-up 条目)。
- **关键字段/实现**:
  - `type: Literal["queue_update"] = "queue_update"`。
  - `steering: tuple[str, ...] = ()`:转向型待办条目。
  - `follow_up: tuple[str, ...] = ()`:后续跟进条目。

### MessageStartEvent

```python
class MessageStartEvent(BaseModel)
```

- **作用**:标记一条消息(由某个角色产出)开始流式生成。
- **关键字段/实现**:
  - `type: Literal["message_start"] = "message_start"`。
  - `message_role: Literal["user", "assistant", "tool"] = "assistant"`:正在产出的消息角色,默认 assistant。

### MessageDeltaEvent

```python
class MessageDeltaEvent(BaseModel)
```

- **作用**:流式增量:一条消息正文新增的一段文本(delta)。
- **关键字段/实现**:`type: Literal["message_delta"] = "message_delta"`;`delta: str` 增量文本。对应 provider 流式输出的内容片段,loop 将其累积进 `AssistantMessage.content`(或 user/tool 消息)。

### ThinkingDeltaEvent

```python
class ThinkingDeltaEvent(BaseModel)
```

- **作用**:流式增量:模型推理/思考过程新增的一段文本。
- **关键字段/实现**:`type: Literal["thinking_delta"] = "thinking_delta"`;`delta: str` 增量思考文本。与 `MessageDeltaEvent` 分离,便于前端把“思考”与“正式回复”区分呈现。

### MessageEndEvent

```python
class MessageEndEvent(BaseModel)
```

- **作用**:标记一条消息完整生成/接收完毕,并携带完整的 `AgentMessage`。
- **关键字段/实现**:
  - `type: Literal["message_end"] = "message_end"`。
  - `message: AgentMessage`:完成的消息对象(来自 `messages.py` 的联合类型),loop 通常把它追加进 transcript。

### ToolExecutionStartEvent

```python
class ToolExecutionStartEvent(BaseModel)
```

- **作用**:标记一个工具调用开始执行。
- **关键字段/实现**:
  - `type: Literal["tool_execution_start"] = "tool_execution_start"`。
  - `tool_call: ToolCall`:对应的工具调用请求(来自 `tools.py`)。

### ToolExecutionUpdateEvent

```python
class ToolExecutionUpdateEvent(BaseModel)
```

- **作用**:标记工具执行过程中的一次进度更新(由 `ToolUpdateCallback` 桥接而来)。
- **关键字段/实现**:
  - `type: Literal["tool_execution_update"] = "tool_execution_update"`。
  - `tool_call_id: str`:关联的工具调用。
  - `message: str`:人类可读进度文本。
  - `data: dict[str, JSONValue] | None = None`:可选结构化进度数据。

### ToolExecutionEndEvent

```python
class ToolExecutionEndEvent(BaseModel)
```

- **作用**:标记一个工具调用执行结束,并携带最终结果。
- **关键字段/实现**:
  - `type: Literal["tool_execution_end"] = "tool_execution_end"`。
  - `result: AgentToolResult`:工具结果(来自 `tools.py`),loop 据此生成 `ToolResultMessage`。

### ErrorEvent

```python
class ErrorEvent(BaseModel)
```

- **作用**:标记发生了一个错误。
- **关键字段/实现**:
  - `type: Literal["error"] = "error"`。
  - `message: str`:错误描述。
  - `recoverable: bool = False`:是否可恢复(影响 loop 是否重试或中止)。
  - `data: dict[str, JSONValue] | None = None`:可选结构化错误上下文。

### AgentEvent

```python
type AgentEvent = AgentStartEvent | AgentEndEvent | TurnStartEvent | TurnEndEvent | QueueUpdateEvent | RetryEvent | MessageStartEvent | MessageDeltaEvent | ThinkingDeltaEvent | MessageEndEvent | ToolExecutionStartEvent | ToolExecutionUpdateEvent | ToolExecutionEndEvent | ErrorEvent
```

- **作用**:所有 agent 层事件的联合类型别名,是 loop 发射事件流的统一类型。
- **关键字段/实现**:并集覆盖上面全部 14 个事件类。注意源码中真实的事件类名以 `...Event` 结尾(如 `AgentStartEvent`、`MessageDeltaEvent`、`ThinkingDeltaEvent`、`ToolExecutionStartEvent`/`ToolExecutionEndEvent`),而非任务描述假设的 `AgentTextDeltaEvent`/`AgentThinkingDeltaEvent`/`AgentToolCallEvent`/`AgentToolResultEvent`/`AgentCompletionEvent`/`AgentErrorEvent`/`SessionStartEvent` 等;上述假设名在源码中并不存在,但语义由对应的真实事件承担(`MessageDeltaEvent`≈文本增量、`ThinkingDeltaEvent`≈思考增量、`ToolExecutionStartEvent`+`ToolExecutionEndEvent`≈工具调用/结果、`AgentEndEvent`≈完成、`ErrorEvent`≈错误、`AgentStartEvent`≈会话/运行开始)。

---

## 串联:transcript 模型、agent 事件与 provider 事件的关系

### messages.py 的 transcript 模型如何被 loop/harness 使用
- `loop.py` 维护一份 `list[AgentMessage]` 作为 transcript。每轮开始时把历史(`UserMessage`/`AssistantMessage`/`ToolResultMessage`)连同系统提示一起序列化传给 provider;
- 模型流式返回时,loop 发出 `MessageStartEvent`→若干 `MessageDeltaEvent`/`ThinkingDeltaEvent`→`MessageEndEvent`,并在 `MessageEndEvent.message` 中把累积出的 `AssistantMessage`(含 `tool_calls` 与 `usage`)追加进 transcript;
- 若 assistant 发起工具调用,loop 依次发射 `ToolExecutionStartEvent`、`ToolExecutionUpdateEvent`(若有)、`ToolExecutionEndEvent`,并把 `AgentToolResult` 转成 `ToolResultMessage`(`role="tool"`,带 `tool_call_id`)追加回 transcript,形成下一轮的输入。这样 transcript 是与具体 provider 无关的“真相来源”,可持久化、可重放。

### events.py 的 agent 事件词汇如何被 loop/harness 使用
- loop 在每个阶段产出对应的 `AgentEvent`:运行级(`AgentStartEvent`/`AgentEndEvent`)、轮次级(`TurnStartEvent`/`TurnEndEvent`/`RetryEvent`)、消息级(`MessageStartEvent`/`MessageDeltaEvent`/`ThinkingDeltaEvent`/`MessageEndEvent`)、工具级(`ToolExecutionStartEvent`/`ToolExecutionUpdateEvent`/`ToolExecutionEndEvent`)、以及 `QueueUpdateEvent`、`ErrorEvent`。
- 这些事件是“agent 层词汇”,UI(Textual/Rich/print)只订阅事件流来渲染,绝不反向耦合到 loop 内部,符合 AGENTS.md 强调的“harness 发射事件、UI 消费事件”的 adapter 边界。事件流的稳定性正是 README “Events make agents teachable” 原则在代码中的体现。

### agent 事件与 provider 事件的层次差异
- **provider 事件**(位于 `tau_ai`,不属于本包)是底层、provider 特定的流式原语(如 token 块、tool_call delta、usage 块),与某个具体模型/SDK 的流式格式绑定。
- **agent 事件**(本 `events.py`)是 provider 中立、语义更高层的抽象:loop 把多个 provider 事件“翻译/归并”成稳定的 agent 事件。例如 provider 的一段 content delta 被归并为 `MessageDeltaEvent`,provider 的 tool_call 片段被聚合成一次 `ToolExecutionStartEvent`+`ToolExecutionEndEvent`,provider 的 reasoning delta 被归并为 `ThinkingDeltaEvent`。
- 因此层次是:`tau_ai` 的 provider 事件(具体、细粒度、易变) → `tau_agent` 的 loop(归并/适配) → `AgentEvent`(抽象、稳定、可持久化/可渲染)。`messages.py` 的 transcript 模型则是这一归并过程的“状态沉淀”,`MessageEndEvent.message` 即每轮归并后的产物。

---

<!-- NAV -->
[← tau_ai · 各 Provider 实现]({{< relref "./ai-providers.md" >}})
[↑ 总览]({{< relref "./source-walkthrough.md" >}})
[→ tau_agent · 执行核心]({{< relref "./agent-loop-harness.md" >}})
