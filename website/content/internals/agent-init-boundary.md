---
title: tau_agent · 公共导出与边界
description: __init__.py 与 tau_ai 的边界
code_files:
  - tau_agent/__init__.py
---

`tau_agent/__init__.py` 是整个 `tau_agent` 包的"门面"——外部代码（尤其是
`tau_coding`）只通过 `from tau_agent import ...` 使用它，不需要知道内部由哪些子模块
组成。本章还会解释 `tau_agent` 与 `tau_ai` 之间的依赖边界：谁依赖谁、为什么这样
设计、以及这种设计如何让单元测试能用 fake 实现替代真实网络。

## `tau_agent/__init__.py` — 公共导出面

这个文件把 `tau_agent` 所有公开符号集中 re-export，并写进 `__all__`。分组看：

- **事件**（`events.py`）：10 个 `AgentEvent` 子类 + `AgentEvent` 联合类型。
- **harness**（`harness.py`）：`AgentHarness`、`AgentHarnessConfig`、
  `SimpleCancellationToken`、`QueuedMessages`、`EventListener`。
- **循环**（`loop.py`）：`run_agent_loop`。
- **消息**（`messages.py`）：`AgentMessage`、`UserMessage`、`AssistantMessage`、
  `ToolResultMessage`、`Usage`、`UsageCost`。
- **会话树**（`session/*`）：`SessionEntry` 及各具体节点（`MessageEntry`、
  `ModelChangeEntry`、`ThinkingLevelChangeEntry`、`CompactionEntry`、
  `BranchSummaryEntry`、`LabelEntry`、`LeafEntry`、`SessionInfoEntry`、
  `CustomEntry`）、`SessionState`、`JsonlSessionStorage`。
- **工具**（`tools.py`）：`AgentTool`、`AgentToolResult`、`ToolCancellationToken`、
  `ToolExecutionMode`、`ToolExecutor`、`ToolUpdateCallback`。
- **类型**（`types.py`）：`JSONValue`、`JSONPrimitive`、`JSONObject`。

外部（尤其是 `tau_coding`）几乎永远只 `from tau_agent import ...`，不直接 import
子模块——这让 `tau_agent` 的包边界清晰、稳定。

---

## `tau_agent` 与 `tau_ai` 的边界

综合前面读过的代码，依赖关系如下：

```
tau_coding  ──►  tau_agent  ──►  tau_ai
 (CLI/TUI)      (大脑/状态)      (provider)
```

关键事实（已在源码中确认）：

1. **`tau_ai` 依赖 `tau_agent` 的数据类型**：`tau_ai/provider.py` 的
   `ModelProvider.stream_response` 的签名里直接用了 `tau_agent.messages.AgentMessage`
   和 `tau_agent.tools.AgentTool`；`tau_ai/events.py` 从 `tau_agent.provider_events`
   re-export 事件类型；各 provider 文件的 import 顶部都 `from tau_agent.messages
   import ...`、`from tau_agent.tools import ...`。
   —— 即 `tau_ai` 把"消息/工具"当作**纯数据结构**来接收，不依赖 agent 的行为。

2. **`tau_agent` 完全不依赖 `tau_ai`**：`tau_agent` 定义了自己的 `ModelProvider`
   Protocol 和 `CancellationToken` Protocol（在 `tau_agent/provider.py`），以及
   `AssistantMessageEvent` 等 provider 事件类型（在 `tau_agent/provider_events.py`）。
   `tau_agent/loop.py` 只 import `tau_agent.provider` 的 `ModelProvider`/
   `CancellationToken` 和 `tau_agent.provider_events` 的事件子类；`tau_agent/harness.py`
   同样只 import `tau_agent.provider.ModelProvider`。它**从不** import 任何 `tau_ai`
   模块，也从不碰 HTTP。

   > **什么是 Protocol？** 这里指的是 `typing.Protocol`——一种 Python 的结构化子类型
   > 机制：只要一个类实现了 Protocol 声明的方法签名，就自动满足这个接口，不需要显式
   > 继承。`ModelProvider` 是 `tau_agent` 定义的一个 Protocol，声明了 `stream_response`
   > 方法的签名。`tau_ai` 的具体 provider 实现这个 Protocol，而 `tau_agent` 只认
   > 这个"形状"——这样在测试时可以用 `FakeProvider` 完全替代真实网络请求。

3. **所以真正的单向数据流是**：
   - `tau_agent` 定义核心数据类型（消息、工具、类型）、Protocol（`ModelProvider`、
     `CancellationToken`）和事件（`AssistantMessageEvent`、`AgentEvent`）；
   - `tau_ai` 依赖 `tau_agent` 的数据类型，实现 `ModelProvider` Protocol，把模型
     响应翻译成 `AssistantMessageEvent` 流；
   - `tau_coding` 把具体 provider 实例（实现 `ModelProvider`）注入 `AgentHarness`，
     并把 `AgentEvent` 接到 CLI/TUI/工具上。

这种"**下层定义类型和 Protocol，上层实现 Protocol**"的安排，让 `tau_agent`
在单元测试里能用 `FakeProvider`（Part 1b）完全替代真实网络，也让 `tau_ai` 可以独立
演进各家 API 而不波及 agent 逻辑。

> Design note: 这套边界正是 README 的 agent 拆分原则——`AgentHarness = reusable agent brain`、
> `AgentSession = coding-agent environment`、`TUI = one possible frontend`——在依赖方向上的落实。
> `tau_agent` 定义"消息/工具"作为纯数据类型和 Protocol，`tau_ai` 只实现这些 Protocol 而不
> 定义新数据类型；`tau_agent` 完全不知道 `tau_ai` 的存在——它只认自己定义的 Protocol。
> 结果是核心 agent 包满足 AGENTS.md 强调的"独立于 CLI、Textual、Rich、会话文件位置、
> 应用特定资源加载"——`tau_coding` 把具体 provider 注入 harness、把事件接到前端，
> 而 harness 自身对这些上层结构一无所知。这也是"Small layers beat magic"的直接后果:
> 每个包只暴露一个稳定的抽象面,边界清晰到可以用 fake 实现做确定性测试。

---

## 本部分小结

- `tau_agent/__init__.py` 是 `tau_agent` 的"门面"，集中导出事件、harness、循环、
  消息、会话树、工具、类型七类符号。
- 依赖边界的核心：**`tau_agent` 定义 Protocol 和数据类型，`tau_ai` 实现 Protocol
  并使用数据类型**。`tau_agent` 完全不知道 `tau_ai` 的存在——它只认自己定义的
  `ModelProvider` Protocol 和 `AssistantMessageEvent` 等类型。

至此整个 `tau_agent` 讲解完毕。下一任务（Part 3a）进入最上层 `tau_coding`，先看它
的"工具与提示"子集：`tools.py`（read/write/edit/bash）、`system_prompt.py`、
`context*.py`、`skills.py`、`resources.py`。

## 逐方法深度剖析（__init__ 导出面与边界）

> 以下为 `tau_agent/__init__.py` 公共导出与 tau_ai 边界的细化说明。

## tau_agent/__init__.py — 公共导出面

`tau_agent/__init__.py` 本身只有 68 行,且**没有任何模块内定义的辅助函数、懒加载逻辑、`get_version` 或版本常量**——它纯粹是一个"聚合再导出"(re-export aggregation)模块。文件开头的模块 docstring 是 `"""Portable agent harness primitives for Tau."""`,紧接着用 7 个 `from ... import (...)` 语句从子模块拉取符号,最后用一个显式 `__all__` 列表(第 68 行)声明公共契约。

从源码可以看到三个关键事实:

1. **没有任何模块级逻辑**:除了 import 和 `__all__`,文件里没有函数、类、`if TYPE_CHECKING:` 守卫、包级 `__version__`、或任何运行时初始化。导入 `tau_agent` 这个包时,Python 会立即执行那 7 组 `from` import,把子模块(以及它们各自的依赖,如 `tau_ai.provider`)一并加载。
2. **没有惰性加载**:所有符号在 `import tau_agent` 时一次性加载,不存在按需导入的 thunk、也不存在 `_LAZY` 注册表之类的机制。
3. **不存在 `get_version` 之类的辅助函数**:根据对 `tau_agent/__init__.py` 全文(仅 113 行)的检查,以及在整个 `tau_agent/` 包内搜索 `get_version` 均无匹配,确认该包**不提供** `get_version`。任何版本查询入口若存在,应在别处(如 `pyproject.toml` 或 `tau/` 门面包),而非本文件。

因此 `__init__.py` 的"公共导出面"完全由 `__all__` 的 54 个名字构成。下面逐条拆解每一项:它来自哪个子模块、对外暴露的契约是什么、以及它如何拼成 `tau_agent` 的 API 表面。

### 导出项:`__all__`

```python
# __init__.py:68 — 动态推导公共契约：所有非下划线开头的顶层名字自动入列
__all__ = [name for name in globals() if not name.startswith("_")]
```

`__all__` 使用**动态推导**——它收集 `globals()` 中所有不以 `_` 开头的名字，
而不是硬编码列表。它的作用是:

- 定义 `from tau_agent import *` 时的可见集合;
- 作为包公共契约的权威清单(谁在列,谁就是稳定的对外 API;谁不在列,谁就是内部实现)。

本文件 **re-export 的全部符号都进了 `__all__`**,没有"静默导出但不在 `__all__` 中"的遗漏——`__all__` 与文件实际 import 的符号一一对应、完全同步。

实际导出的符号按来源分组:
- **事件**（`events.py`）：11 个符号（`AgentStartEvent`、`AgentEndEvent`、`TurnStartEvent`、`TurnEndEvent`、`MessageStartEvent`、`MessageUpdateEvent`、`MessageEndEvent`、`ToolExecutionStartEvent`、`ToolExecutionUpdateEvent`、`ToolExecutionEndEvent`、`AgentEvent`）
- **harness**（`harness.py`）：5 个符号（`AgentHarness`、`AgentHarnessConfig`、`EventListener`、`QueuedMessages`、`SimpleCancellationToken`）
- **循环**（`loop.py`）：1 个符号（`run_agent_loop`）
- **消息**（`messages.py`）：16 个符号（`AgentMessage`、`AssistantMessage`、`BashExecutionMessage`、`BranchSummaryMessage`、`CompactionSummaryMessage`、`CustomMessage`、`ImageContent`、`TextContent`、`ThinkingContent`、`ToolCall`、`ToolResultMessage`、`Usage`、`UsageCost`、`UserMessage`、`content_text`、`message_text`）
- **会话**（`session/*`）：12 个符号（`BranchSummaryEntry`、`CompactionEntry`、`CustomEntry`、`JsonlSessionStorage`、`LabelEntry`、`LeafEntry`、`MessageEntry`、`ModelChangeEntry`、`SessionEntry`、`SessionInfoEntry`、`SessionState`、`ThinkingLevelChangeEntry`）
- **工具**（`tools.py`）：6 个符号（`AgentTool`、`AgentToolResult`、`ToolCancellationToken`、`ToolExecutionMode`、`ToolExecutor`、`ToolUpdateCallback`）
- **类型**（`types.py`）：3 个符号（`JSONObject`、`JSONPrimitive`、`JSONValue`）

### 导出项:`AgentHarness`

- **来源**:`tau_agent.harness`(第 18–24 行导入)。
- **契约**:`AgentHarness` 是一个**有状态的、可复用的"agent 大脑"**(`harness.py:61` 的类定义,docstring 原文:*"Reusable stateful agent brain"*)。它持有 transcript(对话记录)并把执行委托给 `run_agent_loop`。它独立于 CLI、Rich、Textual、`session` 文件位置与编码代理的资源加载。
- **关键能力**(基于 `harness.py`):
  - 构造时接收 `AgentHarnessConfig` 和可选的初始 `messages`(`harness.py:71`)。
  - 属性:`messages`(只读 transcript 快照)、`config`、`is_running`、`queued_messages`、`pending_message_count`。
  - `append_message` / `replace_messages`:用于恢复或重建会话状态。
  - `subscribe(listener)`:订阅 `AgentEvent` 流,返回**取消订阅回调**(`harness.py:107`)。
  - `cancel()`:请求取消当前运行。
  - `steer` / `steer_message` / `follow_up` / `follow_up_message`:在运行中或下一次运行前,把用户消息压入"转向队列"或"后续队列",返回 `QueuedMessages` 快照。
  - `clear_queues` / `pop_latest_follow_up` / `pop_latest_steering`:队列管理。
  - `prompt(content, ...)` → `AsyncIterator[AgentEvent]`:追加用户消息并跑循环。
  - `continue_()` → `AsyncIterator[AgentEvent]`:不追加新用户消息地继续循环。
  - `append_interrupted_tool_results()`:修复被中断运行留下的"半截工具调用"transcript(给没有对应结果的 `ToolCall` 补一条 `ok=False` 的 `ToolResultMessage`),满足 OpenAI 兼容 provider 对"tool call 必须有 tool result"的要求(`harness.py:219`)。
- **如何构成公共面**:它是 `tau_agent` 对外的"最高层门面"——上层应用(CLI / TUI)通常只直接持有 `AgentHarness`,通过它获得事件流并管理 transcript,而不必自己编排 `run_agent_loop`。

```python
# __init__.py:18 — AgentHarness 从 harness 子模块 re-export
from tau_agent.harness import (
    AgentHarness, AgentHarnessConfig, EventListener,
    QueuedMessages, SimpleCancellationToken,
)
```


### 导出项:`AgentHarnessConfig`

- **来源**:`tau_agent.harness`(第 18–24 行导入)。
- **契约**:`harness.py:39` 定义的 `@dataclass(slots=True)`,是 `AgentHarness` 的配置对象。
- **字段**:`provider: ModelProvider`、`model: str`、`system: str`、`tools: list[AgentTool]`(默认空)、`max_turns: int | None`(默认 `None` 表示不限)、`queue_mode: QueueMode`(默认 `"one_at_a_time"`)、`before_tool_call: BeforeToolCall | None`、`after_tool_call: AfterToolCall | None`。其中 `QueueMode = Literal["one_at_a_time", "all"]`(`harness.py:25`)。(`Literal` 等 typing 构造的含义见[速查表]({{< relref "./_index.md#python-typing-速查" >}}))。
- **如何构成公共面**:它是把 `tau_ai` 的 `ModelProvider` 与 agent 的 `tools`/系统提示/轮次上限绑定在一起的"接线配置",是构造 `AgentHarness` 的唯一入口参数。

```python
# harness.py:39 — AgentHarnessConfig 的接线配置
@dataclass(slots=True)
class AgentHarnessConfig:
    provider: ModelProvider
    model: str
    system: str
    tools: list[AgentTool] = field(default_factory=list)
    max_turns: int | None = None
    queue_mode: QueueMode = "one_at_a_time"
    before_tool_call: BeforeToolCall | None = None
    after_tool_call: AfterToolCall | None = None
```


### 导出项:`EventListener`

- **来源**:`tau_agent.harness`(第 18–24 行导入),但它是 `harness.py:24` 的类型别名:
  `EventListener = Callable[[AgentEvent], Awaitable[None] | None]`。
- **契约**:任何接收 `AgentEvent`、可返回 `None`(同步)或 `Awaitable[None]`(异步)的可调用对象。`AgentHarness.subscribe` 接受它。
- **如何构成公共面**:它定义了 agent 向外广播事件时,订阅者必须实现的"函数形状",是事件驱动集成的契约类型。

```python
# harness.py:24 — EventListener 是模块级类型别名
EventListener = Callable[[AgentEvent], Awaitable[None] | None]
```


### 导出项:`QueuedMessages`

- **来源**:`tau_agent.harness`(第 18–24 行导入)。
- **契约**:`harness.py:29` 的 `@dataclass(frozen=True, slots=True)`,是 harness 拥有的排队消息快照:`steering: tuple[AgentMessage, ...]` 和 `follow_up: tuple[AgentMessage, ...]`,带 `count` 属性(两者之和)。
- **如何构成公共面**:`harness.queued_messages` 返回它,让 UI 读取当前排队状态以展示待发消息,而无需碰 harness 内部 deque。

```python
# harness.py:29 — QueuedMessages 是 frozen 快照
@dataclass(frozen=True, slots=True)
class QueuedMessages:
    steering: tuple[AgentMessage, ...] = ()
    follow_up: tuple[AgentMessage, ...] = ()

    @property
    def count(self) -> int:
        return len(self.steering) + len(self.follow_up)
```


### 导出项:`SimpleCancellationToken`

- **来源**:`tau_agent.harness`(第 18–24 行导入)。
- **契约**:`harness.py:50` 定义的轻量取消令牌。有 `cancel()`(置 `_cancelled=True`)、`is_cancelled() -> bool`。
- **如何构成公共面**:agent 循环与 harness 用它向 provider/工具传递"是否该停"的信号。注意它是 `tau_agent` 自己的实现;而 `run_agent_loop` 接受的是 `tau_ai.provider.CancellationToken`(协议),二者通过 `is_cancelled()` 形状兼容。

```python
# harness.py:50 — SimpleCancellationToken 的轻量实现
class SimpleCancellationToken:
    def __init__(self) -> None:
        self._cancelled = False

    def cancel(self) -> None:
        self._cancelled = True

    def is_cancelled(self) -> bool:
        return self._cancelled
```


### 导出项:`run_agent_loop`

- **来源**:`tau_agent.loop`(第 25 行导入)。
- **契约**:`loop.py:44` 的 `async def run_agent_loop(*, provider, model, system, messages, tools, prompts=(), max_turns=None, signal=None, get_steering_messages=None, get_follow_up_messages=None, before_tool_call=None, after_tool_call=None) -> AsyncIterator[AgentEvent]`。
- **行为要点**(严格基于 `loop.py`):
  - 纯 provider/工具 agent 循环(`loop.py:1` docstring:"Pure provider/tool agent loop")。
  - 它**不持有 transcript**:传入的 `messages: list[AgentMessage]` 由调用方拥有,循环把 assistant message 和 tool result 追加进去(保持无状态但允许 harness 拥有状态)。
  - 开头 `yield AgentStartEvent()`;然后按 `max_turns` 循环,每个 turn `yield TurnStartEvent`。
  - 内部 `await provider.stream_response(...)` 并把 `AssistantMessageEvent` 翻译/映射为 `AgentEvent`:`AssistantStartEvent → MessageStartEvent`、`TextDeltaEvent` 等 → `MessageUpdateEvent`、`AssistantDoneEvent → MessageEndEvent(带完整 assistant_message)`、`AssistantErrorEvent → MessageEndEvent`。
  - 没有 tool call 时:先尝试 drain steering 队列、再 drain follow_up 队列,有则继续下一 turn,否则结束。
  - 有 tool call 时:调 `_execute_tool_call` 逐个执行(未知工具名 → 错误结果;取消 → 错误结果),每个结果追加为 `ToolResultMessage`,并 `yield ToolExecutionStart/Update/EndEvent`。支持 `before_tool_call` / `after_tool_call` 钩子。
  - `max_turns` 耗尽时构造错误消息并结束;最后 `yield AgentEndEvent()`。
- **如何构成公共面**:它是 harness 之下的"引擎",把 provider 流与工具执行编排成统一的 `AgentEvent` 流。需要无状态/嵌入式使用的调用方可以直接用它本身,而不经过 `AgentHarness`。

> **什么是 AsyncIterator？** `AsyncIterator[AgentEvent]` 意味着这个函数返回的不是一个
> 值，而是一个可以被 `async for` 循环逐个消费的事件序列。每次迭代都会 yield 出
> 一个 `AgentEvent`，消费者可以边接收事件边做处理（比如实时打印、发送到前端），
> 而不是等函数全部执行完才拿到结果。这在 LLM 流式场景中至关重要——模型可能需要
> 数秒才回复完毕，但每个 token 生成时就应该立即展示给用户。

```python
# __init__.py:25 — run_agent_loop 从 loop 子模块 re-export
from tau_agent.loop import run_agent_loop

# loop.py:44 — 纯循环的签名：一切靠参数注入，messages 由调用方拥有
async def run_agent_loop(
    *,
    provider: ModelProvider,
    model: str,
    system: str,
    messages: list[AgentMessage],
    tools: list[AgentTool],
    prompts: Sequence[AgentMessage] = (),
    max_turns: int | None = None,
    signal: CancellationToken | None = None,
    get_steering_messages: Callable[[], Sequence[AgentMessage]] | None = None,
    get_follow_up_messages: Callable[[], Sequence[AgentMessage]] | None = None,
    before_tool_call: BeforeToolCall | None = None,
    after_tool_call: AfterToolCall | None = None,
) -> AsyncIterator[AgentEvent]: ...
```


### 导出项:`AgentMessage`

- **来源**:`tau_agent.messages`(第 26–43 行导入)。
- **契约**:`messages.py:235` 的 `Annotated` 联合类型别名（带 `Field(discriminator="role")` 判别器）:
  `AgentMessage = UserMessage | AssistantMessage | ToolResultMessage | BashExecutionMessage | CustomMessage | BranchSummaryMessage | CompactionSummaryMessage`。
- **如何构成公共面**:它是 transcript 中"一条消息"的联合类型,被 harness、loop、session 各处统一使用——是 agent 数据的核心载体类型。

### 导出项:`UserMessage`

- **来源**:`tau_agent.messages`(第 26–43 行导入)。
- **契约**:`messages.py:92` 的 `WireModel`。字段:`role: Literal["user"] = "user"`、`content: UserContent`（`str | list[TextContent | ImageContent]`）、`timestamp: int`。带 `text` 属性用于快速提取纯文本。
- **如何构成公共面**:用户输入与 `harness.steer`/`prompt` 产生的消息类型。

### 导出项:`AssistantMessage`

- **来源**:`tau_agent.messages`(第 26–43 行导入)。
- **契约**:`messages.py:119` 的 `WireModel`。字段:`role: Literal["assistant"] = "assistant"`、`content: list[AssistantContent]`（`TextContent | ThinkingContent | ToolCall` 的有序列表）、`api: str`、`provider: str`、`model: str`、`response_model: str | None`、`response_id: str | None`、`diagnostics: list[AssistantMessageDiagnostic] | None`、`usage: Usage`、`stop_reason: StopReason`、`error_message: str | None`、`timestamp: int`。带 `text`、`thinking_text`、`tool_calls` 属性用于快速提取各类内容。
- **注意**:构造时可以传 `content: str` 作为便利写法——`model_validator` 会自动把字符串包装成 `[TextContent(text=content)]`,但存储和序列化始终使用块列表格式。
- **如何构成公共面**:模型回复,可能携带工具调用、思考过程与用量统计。

### 导出项:`ToolResultMessage`

- **来源**:`tau_agent.messages`(第 26–43 行导入)。
- **契约**:`messages.py:170` 的 `WireModel`。字段:`role: Literal["toolResult"] = "toolResult"`、`tool_call_id: str`、`tool_name: str`、`content: list[ToolResultContent]`（`TextContent | ImageContent` 的列表）、`details: JSONValue`、`added_tool_names: list[str] | None`、`is_error: bool`、`timestamp: int`。带 `text` 属性用于快速提取纯文本。
- **如何构成公共面**:工具执行结果在 transcript 中的表示,被 loop 的 `_tool_result_message` 从 `AgentToolResult` 转换而来。

### 导出项:`Usage`

- **来源**:`tau_agent.messages`(第 26–43 行导入)。
- **契约**:`messages.py:45` 的 `WireModel`(端口 Pi 的 `Usage` 到 snake_case)。字段:`input: int`、`output: int`、`cache_read: int`、`cache_write: int`、`cache_write_1h: int | None`、`reasoning: int | None`、`total_tokens: int`、`cost: UsageCost`。
- **如何构成公共面**:provider 报告的真实计费 token 用量(非本地估算),挂在 `AssistantMessage.usage` 上。

### 导出项:`UsageCost`

- **来源**:`tau_agent.messages`(第 26–43 行导入)。
- **契约**:`messages.py:35` 的 `WireModel`,USD 计费的细分:`input / output / cache_read / cache_write / total`(float,默认 0.0)。
- **如何构成公共面**:用量成本的细分结构,作为 `Usage.cost` 的可选子对象。

### 导出项:`AgentTool`

- **来源**:`tau_agent.tools`(第 58–65 行导入)。
- **契约**:`tools.py:77` 的 `@dataclass(frozen=True, slots=True)`。字段:`name: str`、`label: str`、`description: str`、`parameters: Mapping[str, JSONValue]`、`execute_fn: ToolExecutor`、`prompt_snippet: str | None`、`prompt_guidelines: tuple[str, ...]`、`prepare_arguments: ToolArgumentPreparer | None`、`execution_mode: ToolExecutionMode`（`"parallel"` 或 `"sequential"`）、`render_call: ToolCallRenderer | None`、`render_result: ToolResultRenderer | None`。
- **行为**:`async def execute(...)` 直接把调用委托给 `execute_fn`——所有参数转发由数据类完成。
- **如何构成公共面**:暴露给 agent 的一个工具。构造 `AgentHarnessConfig.tools` 用的就是它。

### 导出项:`AgentToolResult`

- **来源**:`tau_agent.tools`(第 58–65 行导入)。
- **契约**:`tools.py:21` 的 `WireModel`。字段:`content: list[TextContent | ImageContent]`（结构化内容块）、`details: JSONValue`（任意附加数据）、`added_tool_names: list[str] | None`（新注册的工具名）、`terminate: bool | None`（是否终止 agent 循环）。带 `text` 属性用于快速提取纯文本。
- **如何构成公共面**:工具执行的结构化结果,被 loop 转换成 `ToolResultMessage` 并喂回 transcript。

### 导出项:`ToolCall`

- **来源**:`tau_agent.messages`(第 26–43 行导入)。
- **契约**:`messages.py:77` 的 `WireModel`。字段:`type: Literal["toolCall"] = "toolCall"`、`id: str`、`name: str`、`arguments: dict[str, JSONValue]`、`thought_signature: str | None`(某些 provider 如 Gemini 需回传的不透明签名)。
- **如何构成公共面**:模型发起的工具调用请求(出现在 `AssistantMessage.content` 中作为 `ToolCall` 内容块),也是 `ToolExecutionStartEvent` 的载荷。注意 `ToolCall` 定义在 `messages.py` 而非 `tools.py`,因为它作为消息内容块存在于 `AssistantMessage.content` 中。

### 导出项:`ToolCallRenderer`

- **来源**:`tau_agent.tools`(但**未被 `__init__.py` re-export**,不属于 `tau_agent` 顶层公共 API)。
- **契约**:`tools.py:45` 的 `Protocol`。`__call__(self, arguments: Mapping[str, JSONValue]) -> str | None`,把工具参数渲染成一行展示文本,返回 `None` 则回退。
- **使用场景**:只在 `AgentTool.render_call` 字段中作为类型引用,前端渲染工具调用的可选 hook(对应 Pi 的 `renderCall`,但只返回字符串而非 UI 组件)。需要通过 `tau_agent.tools.ToolCallRenderer` 访问。

### 导出项:`ToolResultRenderer`

- **来源**:`tau_agent.tools`(但**未被 `__init__.py` re-export**,不属于 `tau_agent` 顶层公共 API)。
- **契约**:`tools.py:51` 的 `Protocol`。`__call__(self, result: AgentToolResult, *, expanded: bool) -> str | None`,返回 Rich 标记的展示文本,`None` 回退。
- **使用场景**:只在 `AgentTool.render_result` 字段中作为类型引用,前端渲染工具结果的展示 hook(对应 Pi 的 `renderResult`,返回 Rich markup 字符串)。需要通过 `tau_agent.tools.ToolResultRenderer` 访问。

### 导出项:`ToolExecutor`

- **来源**:`tau_agent.tools`(第 58–65 行导入)。
- **契约**:`tools.py:60` 的 `Protocol`。`__call__(self, tool_call_id: str, arguments: Mapping[str, JSONValue], signal: ToolCancellationToken | None = None, on_update: ToolUpdateCallback | None = None) -> Awaitable[AgentToolResult]`。
- **如何构成公共面**:执行一个工具的最小异步可调用契约,是 `AgentTool.execute_fn` 的类型。

### 导出项:`ToolUpdateCallback`

- **来源**:`tau_agent.tools`(第 58–65 行导入)。
- **契约**:`tools.py:57` 的类型别名: `ToolUpdateCallback = Callable[[AgentToolResult], None]`。同步、fire-and-forget 的进度回调,接收一个 `AgentToolResult`（可以是部分结果,用于实时汇报工具执行进度）。
- **如何构成公共面**:工具向 loop 实时汇报进度的契约,被 loop 的 `on_update` 转成 `ToolExecutionUpdateEvent`。

### 导出项:`JSONObject` / `JSONPrimitive` / `JSONValue`

- **来源**:`tau_agent.types`(第 66 行导入)。
- **契约**:`types.py` 的三个 PEP 695 类型别名(供 Pydantic 递归 JSON 值用):
  - `JSONPrimitive = str | int | float | bool | None`
  - `JSONValue = JSONPrimitive | list[JSONValue] | dict[str, JSONValue]`
  - `JSONObject = dict[str, JSONValue]`
- **如何构成公共面**:贯穿 `messages`/`tools`/`events`/`session` 的低层 JSON 值类型。凡是"任意结构化 payload"(`data`、`details`、`arguments`)都用它做类型标注,是整个包数据模型的公共词汇表。

### 导出项:`AgentEvent`(及全部 10 个具体事件类)

`AgentEvent` 是 `events.py:75` 的 Union 类型别名,涵盖下列全部事件。`__init__.py` 把它们从 `tau_agent.events`(第 5–17 行)逐一 re-export:

- **`AgentStartEvent`**(`events.py:15`):`type="agent_start"`。一次运行的开始。
- **`AgentEndEvent`**(`events.py:19`):`type="agent_end"`,带 `messages: list[AgentMessage]`。一次运行的结束,附带完整消息列表。
- **`TurnStartEvent`**(`events.py:24`):`type="turn_start"`。一轮开始。
- **`TurnEndEvent`**(`events.py:28`):`type="turn_end"`,带 `message: AgentMessage`、`tool_results: list[ToolResultMessage]`。一轮结束。
- **`MessageStartEvent`**(`events.py:34`):`type="message_start"`,带 `message: AgentMessage`。一条消息开始生成。
- **`MessageUpdateEvent`**(`events.py:39`):`type="message_update"`,带 `message: AgentMessage`、`assistant_message_event: AssistantMessageEvent`。消息更新（来自 provider 层的细粒度更新）。
- **`MessageEndEvent`**(`events.py:47`):`type="message_end"`,带 `message: AgentMessage`。一条消息完成。
- **`ToolExecutionStartEvent`**(`events.py:52`):`type="tool_execution_start"`,带 `tool_call_id: str`、`tool_name: str`、`args: dict[str, JSONValue]`。工具开始执行。
- **`ToolExecutionUpdateEvent`**(`events.py:59`):`type="tool_execution_update"`,带 `tool_call_id: str`、`tool_name: str`、`args: dict[str, JSONValue]`、`partial_result: AgentToolResult`。工具执行进度。
- **`ToolExecutionEndEvent`**(`events.py:67`):`type="tool_execution_end"`,带 `tool_call_id: str`、`tool_name: str`、`result: AgentToolResult`、`is_error: bool`。工具执行结束。

**共同契约**:全部继承 `WireModel`（Pydantic BaseModel 的严格版本,`extra="forbid"`）,每个都用 `Literal` 的 `type` 字段作为判别标签——这让它们能安全地作为 `AgentEvent` Union 的成员被反序列化与分发。

**如何构成公共面**:`AgentEvent`(以及这些具体类)是 agent 向外广播的**统一事件协议**。harness 的订阅者、TUI/Rich 渲染层都只消费 `AgentEvent`,从而与 provider 实现、工具实现彻底解耦——这正是 README "Events make agents teachable" 原则的体现:agent 的对外边界是一条可被渲染、测试、导出的事件流,而非埋在回调里的控制流。AGENTS.md 中"agent harness 发事件、UI 层消费事件"的约定即由此而来。

### 导出项:`SessionEntry`(Union 类型别名)

- **来源**:`tau_agent.session`(第 44–57 行导入)。`session/__init__.py` 又从 `session.entries` 导入。
- **契约**:`entries.py:103` 的 `Annotated[MessageEntry | ModelChangeEntry | ThinkingLevelChangeEntry | CompactionEntry | BranchSummaryEntry | LabelEntry | LeafEntry | SessionInfoEntry | CustomEntry, Field(discriminator="type")]`。即以 `type` 字段判别的"追加式会话条目"联合类型。（`Annotated` 的含义见[速查表]({{< relref "./_index.md#python-typing-速查" >}})）。
- **如何构成公共面**:会话持久化的原子单位。下面 9 个具体 entry 都是它的成员,被 `SessionStorage` 逐条追加。

### 导出项:`MessageEntry`

- **来源**:`tau_agent.session.entries`(经 `session/__init__.py`)。
- **契约**:`entries.py:35`,`type="message"`,带 `message: AgentMessage`(来自 `tau_agent.messages`)。一条 transcript 消息条目。

### 导出项:`ModelChangeEntry`

- **来源**:`tau_agent.session.entries`。
- **契约**:`entries.py:42`,`type="model_change"`,带 `model: str`。模型切换记录。

### 导出项:`ThinkingLevelChangeEntry`

- **来源**:`tau_agent.session.entries`。
- **契约**:`entries.py:49`,`type="thinking_level_change"`,带 `thinking_level: str | None`。思考层级变更。

### 导出项:`CompactionEntry`

- **来源**:`tau_agent.session.entries`。
- **契约**:`entries.py:56`,`type="compaction"`,带 `summary: str`、`replaces_entry_ids: list[str]`。上下文压缩/摘要条目,重放时替换旧消息(`memory.py:_apply_compaction`)。

### 导出项:`BranchSummaryEntry`

- **来源**:`tau_agent.session.entries`。
- **契约**:`entries.py:64`,`type="branch_summary"`,带 `summary: str`、`branch_root_id: str | None`。分支摘要条目(前瞻式,目前由 `memory.py` 重放成一条 `UserMessage` 分支总结)。

### 导出项:`LabelEntry`

- **来源**:`tau_agent.session.entries`。
- **契约**:`entries.py:72`,`type="label"`,带 `label: str`。人类可读的会话标签。

### 导出项:`LeafEntry`

- **来源**:`tau_agent.session.entries`。
- **契约**:`entries.py:79`,`type="leaf"`,带 `entry_id: str | None`。当前活动分支的叶子指针条目。

### 导出项:`SessionInfoEntry`

- **来源**:`tau_agent.session.entries`。
- **契约**:`entries.py:86`,`type="session_info"`,带 `created_at: float`、`cwd: str | None`、`title: str | None`。会话基本元数据。

### 导出项:`CustomEntry`

- **来源**:`tau_agent.session.entries`。
- **契约**:`entries.py:95`,`type="custom"`,带 `namespace: str`、`data: dict[str, JSONValue]`。扩展/应用自有的会话数据(agent 包本身不解释它,只负责搬运)。

### 导出项:`BaseSessionEntry`

- **来源**:`tau_agent.session.entries`。
- **契约**:`entries.py:25`,全部 entry 的基类,带 `id: str`(默认 `uuid4().hex`)、`parent_id: str | None`、`timestamp: float`(默认 `time()`)。所有具体 entry 都继承它,构成"追加式、可形成树"的条目基础。

### 导出项:`SessionState`

- **来源**:`tau_agent.session.memory`(经 `session/__init__.py`)。
- **契约**:`memory.py:21` 的 `@dataclass(frozen=True, slots=True)`,是不可变快照:`messages`、`model`、`thinking_level`、`label`、`active_leaf_id`、`session_info`、`custom_entries`、`compaction_entries`、`context_entry_ids`、`entries`。
- **关键方法**:`SessionState.from_entries(entries, *, leaf_id=...)` 把追加式条目**重放**成当前状态。不传 `leaf_id` 则线性重放;传 `leaf_id` 则只重放 root→leaf 路径(`memory.py:36`);显式传 `None` 则重放第一条 root 之前的空路径。重放逻辑 `match entry.type` 处理各类条目,compaction 用 `_apply_compaction` 替换被压缩的消息,branch_summary 用 `_format_branch_summary` 合成 `UserMessage`。
- **如何构成公共面**:会话层对外的"当前状态视图",让上层无需理解条目树即可拿到 messages / model / label 等。

### 导出项:`JsonlSessionStorage`

- **来源**:`tau_agent.session.storage`(经 `session/__init__.py`)。
- **契约**:`storage.py:24` 的本地追加式 JSONL 存储实现。构造接收 `path: str | Path`。`async def append(entry)` 在父目录不存在时自动创建,并以追加模式写一行(末尾带 `\n`);`async read_all()` 文件不存在则返回 `[]`,否则按行反序列化为 `SessionEntry` 列表。
- **如何构成公共面**:`SessionStorage` 协议的默认本地实现,把上面那些 entry 落到磁盘(注意:agent 包只定义"如何序列化/存",**不知道文件该放在哪个目录**——路径由调用方传入;CLI 层才决定 session 文件位置)。

### 导出项(相关但未在 `tau_agent` 顶层再导出,列出以明确边界):`SessionStorage`

需要修正一点:`__init__.py` 的 import(第 44–57 行)实际从 `tau_agent.session` 导入了 `BranchSummaryEntry / CompactionEntry / CustomEntry / JsonlSessionStorage / LabelEntry / LeafEntry / MessageEntry / ModelChangeEntry / SessionEntry / SessionInfoEntry / SessionState / ThinkingLevelChangeEntry`,**没有直接把 `SessionStorage`(协议类)列进 `tau_agent` 顶层**。`SessionStorage` 只在 `session/__init__.py` 的 `__all__` 中导出(作为 `tau_agent.session.SessionStorage` 可用),但顶层 `tau_agent/__init__.py` 的 `__all__`(第 68 行)未包含它,所以 `from tau_agent import SessionStorage` 会失败。这与任务描述里"覆盖 …SessionStorage 等所有 re-export"略有出入——严格基于源码,`SessionStorage` 是 `tau_agent.session` 子包的导出,而非 `tau_agent` 包顶层的导出。同理,session 子包还导出了 `BaseSessionEntry`(已在前述条目中覆盖)、`SessionTreeError`、`entries_by_id`、`path_to_entry`、`SessionJsonlError`、`entry_to_json_line`、`entry_from_json_line`、`entries_from_json_lines`,这些也都在 `tau_agent.session` 命名空间下,但不在 `tau_agent` 顶层 `__all__` 中。

换言之,**`tau_agent.__init__` 顶层的 session 类导出是 `SessionEntry` 的 9 个具体子类 + `SessionState` + `JsonlSessionStorage`**,而 `SessionStorage`(协议)、`SessionTreeError`(树遍历异常)、`path_to_entry` / `entries_by_id`(树助手)、JSONL 编解码函数等都归属于子包 `tau_agent.session`。`tau_agent/__init__.py` 的 `__all__` 第 68 行经逐行核对,确实**没有** `SessionStorage`、`SessionTree`、`SessionTreeError`、`entries_by_id`、`path_to_entry` 等名字——任务描述把它们笼统归为"re-export"是不准确的,这里以源码为准给出澄清。

## 与 tau_ai 的边界

`tau_agent` 是整个 agent harness 的可移植核心,而 `tau_ai` 是 provider/模型的流式层。**边界的本质是单向依赖 + 事件翻译**:

- **agent 不知道 TUI / CLI / Textual / Rich**:`AgentHarness` 的 docstring(`harness.py:62`)明言它是 *"Reusable stateful agent brain independent of coding/UI policy"*。agent 只通过 `EventListener` 和 `AgentEvent` 广播事件;渲染交给上层。agent 也**不知道 session 文件该放在哪**——`JsonlSessionStorage` 的路径由调用方传入,agent 包自身不决定目录。
- **provider 流是 agent 的输入**:agent 不自己生产 token。它把 `tau_ai.provider.ModelProvider.stream_response` 返回的 provider 事件**翻译成**自己的 `AgentEvent`(见 `run_agent_loop`,`loop.py:79` 起)。provider 是上游数据源,agent 循环是其消费者与编排者。
- **agent 不绑定具体 provider**:`AgentHarnessConfig.provider: ModelProvider` 是 `tau_ai` 定义的协议/接口,agent 只依赖这个抽象,不依赖任何具体模型实现(符合 AGENTS.md "Avoid provider-specific assumptions in core agent code")。

### agent 包对 tau_ai 的依赖点（**无**）

严格基于源码搜索,`tau_agent` 的所有模块（`loop.py`、`harness.py`、`events.py`、
`messages.py`、`tools.py`、`types.py`、`session/*`）**完全不 import `tau_ai`**。

`tau_agent` 定义了自己的 Protocol 和事件类型：

1. **`tau_agent/provider.py`**：定义 `ModelProvider` Protocol 和 `CancellationToken`
   Protocol。这些是 `tau_agent` 自己的抽象，不来自 `tau_ai`。

2. **`tau_agent/provider_events.py`**：定义 `AssistantMessageEvent` 等 provider 层
   流式事件。这些也是 `tau_agent` 自己的类型。

3. **`tau_agent/loop.py`** 只 import `tau_agent.provider` 和 `tau_agent.provider_events`
   的符号——完全在 `tau_agent` 包内部。

4. **`tau_agent/harness.py`** 只 import `tau_agent.provider.ModelProvider`。

反过来，**`tau_ai` 依赖 `tau_agent`**：
- `tau_ai/provider.py` 从 `tau_agent.provider` re-export `CancellationToken` 和
  `ModelProvider`。
- `tau_ai/events.py` 从 `tau_agent.provider_events` re-export 事件类型。
- 各 provider 实现文件 import `tau_agent.messages`、`tau_agent.tools`、`tau_agent.types`
  的数据类型。

**总结边界契约**:`tau_agent` 定义 Protocol 和数据类型，`tau_ai` 实现 Protocol
并使用数据类型，`tau_coding`(CLI/TUI)负责"前端与资源"。`tau_agent` 通过自定义的
`ModelProvider` Protocol 定义 provider 接口、通过 `AgentEvent` 向外广播、通过
`SessionStorage` 协议接受调用方选定的落盘位置——它自身不触碰渲染、不碰文件位置、
不绑具体模型，也完全不知道 `tau_ai` 的存在。

```python
# tau_agent/provider.py — Protocol 定义在 tau_agent 内部
class ModelProvider(Protocol):
    def stream_response(self, *, model, system, messages, tools, signal=None)
        -> AsyncIterator[AssistantMessageEvent]: ...

# tau_ai/provider.py — tau_ai 只是 re-export tau_agent 的 Protocol
from tau_agent.provider import CancellationToken, ModelProvider

# tau_ai 各 provider 实现这些 Protocol
class OpenAICompatibleProvider:
    def stream_response(self, *, model, system, messages, tools, signal=None):
        # ... 实现 ModelProvider Protocol
```


---

<!-- NAV -->
[← tau_agent · 会话持久化树]({{< relref "./agent-session-tree.md" >}})
[↑ 总览]({{< relref "./source-walkthrough.md" >}})
[→ tau_coding · 工具与提示组装]({{< relref "./coding-tools-prompt.md" >}})
