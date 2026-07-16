---
title: tau_ai · Provider 契约与事件流
description: provider.py / events.py / retry.py / http.py / http_errors 之前的底层契约
---

## `tau_ai/provider.py` — 全栈依赖的两个 Protocol

这是整个代码库最关键的一层契约。两个 `typing.Protocol` 类定义了下游所有代码
使用的接口。它**从 `tau_agent` 反向 import** 了消息与工具类型——这是栈中
唯一一处"下层 import 上层"的地方。其必要性的在于：provider 必须把"消息"和"工具"当作
纯数据来接收，而这两类数据的权威定义在 `tau_agent` 中；让 `provider.py` 依赖
agent 层的类型（而非自行定义私有格式），可保证转换只发生在 provider 内部，
避免栈内出现两套并行的消息/工具表示。

- **`CancellationToken`**（Protocol）：最小取消句柄，只有一个方法
  `is_cancelled() -> bool`。provider 与 agent loop 会轮询它（或基于它构造更
  强的信号）来在中途中止流。之所以用 Protocol 而非具体类，是为了让调用方可以
  传入任何实现了该方法的对象（agent 层会把它包成更丰富的信号）。
- **`ModelProvider`**（Protocol）：provider 的统一接口，唯一方法是

  ```python
  def stream_response(
      self,
      *,
      model: str,
      system: str,
      messages: list[AgentMessage],
      tools: list[AgentTool],
      signal: CancellationToken | None = None,
  ) -> AsyncIterator[ProviderEvent]:
      ...
  ```

  给定模型名、系统提示、消息列表、工具清单、取消令牌，产出 `ProviderEvent`
  流。`signal` 默认为 `None`（向后兼容），让调用方可选地注入取消能力。

---

## `tau_ai/events.py` — provider 无关的"事件词汇表"

来自任何 provider 的每一个流式 token、工具调用、错误，都会被归一化成下列
`pydantic.BaseModel` 子类之一。每个子类都用 `Literal[...]` 固定了 `type` 字段，
并设置 `model_config = ConfigDict(extra="forbid")`（严格禁止多余字段，保证线上
格式稳定）。

- **`ProviderResponseStartEvent`**（`type="response_start"`）：一次响应开始，
  带 `model`。
- **`ProviderRetryEvent`**（`type="retry"`）：一次瞬态错误后准备重试，带
  `attempt`、`max_attempts`、`delay_seconds`、`message`、`data`。
- **`ProviderTextDeltaEvent`**（`type="text_delta"`）：一小段助手文本
  （`delta`，是增量，不是整段回复）。
- **`ProviderThinkingDeltaEvent`**（`type="thinking_delta"`）：一小段推理/
  思考内容，单独成类，方便 UI 选择显示或隐藏。
- **`ProviderToolCallEvent`**（`type="tool_call"`）：一个**完整**的工具调用，
  携带 `tool_call: ToolCall`（已解析的 `tau_agent.tools.ToolCall`）。
- **`ProviderResponseEndEvent`**（`type="response_end"`）：响应结束，携带
  完整的 `message: AssistantMessage` 与可选 `finish_reason`。注意这里把整段
  助手消息打包传出，与过程中的 delta 互补。
- **`ProviderErrorEvent`**（`type="error"`）：终态错误，带 `message` 与 `data`。
- **`ProviderEvent`**（类型别名）：上述 7 个类的联合类型，是
  `stream_response` 的产出元素类型。

> **为什么这样设计**：消费者（agent loop）永远只看到这 7 种事件类型。provider 之间的
> 差异（chat/completions vs `/v1/responses`、SSE 形态、工具调用编码方式）全部被吸收
> 在这一层之下。这正是 Tau 的设计原则之一——**"Events are the contract"**：agent 循环
> 只与事件流签订契约，而不与任何具体模型 SDK 耦合；新增 provider 时只需在其内部把原生
> 响应归一化为这 7 种事件，上层逻辑无需改动。事件词汇表因此成为栈中最稳定的边界，
> 也是 Pi 架构中 "AgentHarness 独立于 provider" 的具体落点。

---

## `tau_ai/retry.py` — 瞬态失败的重试策略

定义重试循环的通用规则，被每个 provider 复用，保证退避行为一致。

- 常量：`RETRY_POLL_SECONDS = 0.05`（取消轮询粒度）、
  `RETRY_BASE_DELAY_SECONDS = 0.25`（指数退避基数）。
- **`retry_delay_seconds(attempt, *, max_delay_seconds)`**：指数退避并封顶，
  返回第 `attempt` 次之后的等待秒数。实际算法是先把基数封顶到 `max_delay`——
  `base_delay = min(RETRY_BASE_DELAY_SECONDS, max_delay_seconds)`，再返回
  `min(max_delay_seconds, base_delay * 2**attempt)`。因此当 `max_delay_seconds >= 0.25`
  时等价于 `min(max_delay, 0.25 * 2**attempt)`；当 `max_delay_seconds < 0.25` 时基数
  被压到 `max_delay` 本身，第一次退避即封顶。若 `max_delay <= 0` 直接返回 `0.0`。
- **`provider_retry_event(*, attempt, max_retries, delay_seconds, reason, data)`**：
  构造一个 `ProviderRetryEvent`，把"第几次/共几次"换算成人类可读文案
  （注意 `next_attempt = attempt + 2`，`max_attempts = max_retries + 1`）。
- **`wait_for_retry(delay_seconds, *, signal)`**：退避睡眠，但用轮询方式分段
   睡眠，**允许在退避中途被 `signal.is_cancelled()` 打断**并返回 `False`（表示
   被取消）。这是取消能力真正生效的地方——不是一次性 `sleep`，而是可被轮询中止，
   因此用户在退避等待期间按下 Ctrl-C 能立即获得响应，而非卡在最长延迟上。

---

## `tau_ai/http.py` — 共享的 HTTP 客户端助手

把所有网络基建集中到一处，让每个 provider 文件保持短小。

- `_PROXY_ENV_VARS`：列出 6 个代理相关环境变量（大小写各一）。
- **`normalize_proxy_url(proxy_url)`**：把 httpx 不认的通用 `socks://` 规范成
  `socks5://`，其余原样返回。
- **`normalized_proxy_environment()`**：上下文管理器，临时把 6 个代理环境变量
  规范化为 httpx 可识别的形式，退出时还原（仅当确有改动才还原）。
- **`create_async_client(**kwargs)`**：在代理规范化环境下创建
  `httpx.AsyncClient`。
- **`get_json(url, *, timeout, follow_redirects)`**：同步 `httpx.get` 取 JSON
  对象，要求返回是 `dict`，否则抛 `ValueError`。

---

## 逐方法深度剖析（provider / events / retry / http）

> 以下为 `tau_ai` 协议层与共享助手各定义的逐方法展开。

## 文件:provider.py

本文件定义了 Tau 模型适配层（`tau_ai`）与上层 `tau_agent` 之间的**依赖边界协议（Protocol）**。它不实现任何具体逻辑，而是用 `typing.Protocol` 描述“一个模型 provider 应当长什么样”，让 `tau_agent` 可以完全不感知具体的 OpenAI / Anthropic / 本地模型实现，只依赖这个抽象接口。

### CancellationToken

一个**最小化的取消令牌接口（Protocol）**，被所有 provider 接受，用于在流式响应过程中允许调用方中断（例如用户按 Ctrl-C、会话超时或上层主动取消）。

#### is_cancelled(self) -> bool

- 签名（保留原始）：

  ```python
  def is_cancelled(self) -> bool:
      """Return whether the current stream should stop."""
      ...
  ```

- 作用：返回“当前这个流是否应当停止”。返回 `True` 时，provider 应尽快停止产生事件并结束 `AsyncIterator`。
- 关键实现：作为 Protocol 仅声明签名与 `...` 桩体，本身无实现；任何拥有 `is_cancelled() -> bool` 方法的对象都满足该协议（结构化子类型，无需显式继承）。语义是“轮询式取消”：provider 在生成每个事件前/后调用它来检测取消，而不是依赖异常信号。

### ModelProvider

全栈最核心的**provider 无关接口（Protocol）**，定义了“流式返回模型响应”的契约。所有具体 provider（OpenAI、Anthropic、本地 vLLM 等）都需满足它；`tau_agent` 的循环只消费这个接口，从而在 `tau_ai` 与 `tau_agent` 之间建立明确边界。

#### stream_response(self, *, model: str, system: str, messages: list[AgentMessage], tools: list[AgentTool], signal: CancellationToken | None = None) -> AsyncIterator[ProviderEvent]

- 签名（保留原始）：

  ```python
  def stream_response(
      self,
      *,
      model: str,
      system: str,
      messages: list[AgentMessage],
      tools: list[AgentTool],
      signal: CancellationToken | None = None,
  ) -> AsyncIterator[ProviderEvent]:
      """Stream one model response as Tau provider events."""
      ...
  ```

- 作用：以**异步迭代器**的形式，把“一次模型响应”逐段流式吐出，每一段都是 `events.py` 中定义的 `ProviderEvent`（一个联合类型，涵盖响应开始、文本增量、思考增量、工具调用、响应结束、重试、错误等）。
- 参数语义：
  - `model: str` —— 请求的具体模型名（如 `"gpt-4o"`），由调用方指定，provider 据此路由。
  - `system: str` —— 系统提示词（system prompt）。
  - `messages: list[AgentMessage]` —— 来自 `tau_agent.messages` 的对话历史（注意是 agent 层的消息类型，而非 provider 私有格式，说明转换发生在 provider 内部）。
  - `tools: list[AgentTool]` —— 来自 `tau_agent.tools` 的可用工具清单，供模型决定是否发起工具调用。
  - `signal: CancellationToken | None = None` —— 可选的取消令牌；为 `None` 时表示不可取消。
- 返回：`AsyncIterator[ProviderEvent]`，即逐个产出 `events.py` 中那 7 种事件之一。
- 关键实现：
  - 作为 Protocol，仅含 `...` 桩体与文档串，无具体逻辑。
  - 使用仅关键字参数（`*` 之后），强制调用方按名传参，避免位置参数错位。
  - 数据流向：`tau_agent` 把 agent 层的 `AgentMessage` / `AgentTool` 交给 provider，provider 内部转换为自有请求格式，再把模型原生流归一化成 `ProviderEvent` 流回给 agent 层。这正是“provider 无关事件词汇”的来源——`tau_agent` 永不解析 provider 私有响应对象。

> 补充说明（基于源码结构）：任务描述中提及的 `supports_thinking` / `provider_name` / `model` 等方法或属性，在 `provider.py` 当前源码中**并未定义**——该 Protocol 实际只声明了 `stream_response` 一个成员（外加模块内定义的 `CancellationToken`）。本文严格依据真实源码，不臆测未出现的成员。同样，`ProviderErrorEvent` / `RetryEvent` / `ProviderEvent` 等并不在本文件定义，而是统一在 `events.py` 中定义并由本文件 `from tau_ai.events import ProviderEvent` 引入（见 `provider.py:10`）。模块顶部还引入了 `AgentMessage`（`tau_agent.messages`）与 `AgentTool`（`tau_agent.tools`），说明该协议刻意依赖 agent 层类型而非 provider 私有类型。

---

## 文件:events.py

本文件定义了**provider 无关的流式事件词汇**——即 `provider.py` 中 `ModelProvider.stream_response` 产出的 `ProviderEvent` 联合类型所包含的全部具体事件。所有事件都是 `pydantic.BaseModel` 子类，统一用 `ConfigDict(extra="forbid")` 禁止多余字段，并用 `Literal` 类型的 `type` 字段做判别标签（discriminated union 风格），便于 `tau_agent` 做 `event.type` 的窄化分派与 JSON 序列化。

注意：本文件中事件均为 **Pydantic 模型**，而非普通 dataclass；`RetryEvent.data` 在任务描述中记为 `RetryData` dataclass，但**真实源码中并不存在 `RetryData` 类型**——`ProviderRetryEvent.data` 的实际类型是 `dict[str, JSONValue] | None`（见下）。本文严格按源码描述。

### ProviderResponseStartEvent

表示“provider 已经开始一次模型响应”。

#### 字段

- `type: Literal["response_start"] = "response_start"` —— 判别标签，固定为字符串 `"response_start"`，用于事件分派。
- `model: str` —— 实际被调用/开始响应的模型名（注意区别于请求时传入的 `model`，此处是 provider 确认后的真实模型标识）。

#### 配置

- `model_config = ConfigDict(extra="forbid")` —— 禁止任何未在模型里声明的额外字段，防止上游误传或版本漂移导致静默忽略。

### ProviderRetryEvent

表示“provider 适配器正在因瞬时失败而重试请求”，供上层在 UI / 日志中展示重试进度。

#### 字段

- `type: Literal["retry"] = "retry"` —— 判别标签，固定为 `"retry"`。
- `attempt: int` —— 当前这一轮重试是第几次尝试（由 `retry.py` 的 `provider_retry_event` 计算为 `attempt + 2`，即从 1 计数的“将要进行”的尝试序号）。
- `max_attempts: int` —— 最大尝试总次数（由 `retry.py` 计算为 `max_retries + 1`，含首次）。
- `delay_seconds: float` —— 本次重试前将等待的退避延迟秒数（来自 `retry.py` 的 `retry_delay_seconds`）。
- `message: str` —— 人类可读的重试说明，例如 `"Retrying provider request 2/4 after rate limit in 0.5s."`，由 `retry.py` 拼装。
- `data: dict[str, JSONValue] | None = None` —— 附带的结构化调试信息（如错误码、原始响应片段等），**不是字符串，而是 `dict[str, JSONValue] | None`**；缺省为 `None`。这就是任务描述中指出的“实际类型与字符串不同”之处。

#### 配置

- `model_config = ConfigDict(extra="forbid")`。

### ProviderTextDeltaEvent

表示“从 provider 流式收到的一段文本增量（助手可见输出）”。

#### 字段

- `type: Literal["text_delta"] = "text_delta"` —— 判别标签，固定为 `"text_delta"`。
- `delta: str` —— 本次增量文本片段；多个该事件按顺序拼接即得到完整助手文本。

#### 配置

- `model_config = ConfigDict(extra="forbid")`。

### ProviderThinkingDeltaEvent

表示“从 provider 流式收到的一段思考/推理（reasoning）增量”，用于支持带思维链（thinking / chain-of-thought）的模型。

#### 字段

- `type: Literal["thinking_delta"] = "thinking_delta"` —— 判别标签，固定为 `"thinking_delta"`。
- `delta: str` —— 本次思考过程文本片段；可与 `ProviderTextDeltaEvent.delta` 同时或交替出现，UI 一般将其与正式文本区分渲染。

#### 配置

- `model_config = ConfigDict(extra="forbid")`。

### ProviderToolCallEvent

表示“模型要求执行一个完整的工具调用”（注意是**完整**调用，而非增量）。

#### 字段

- `type: Literal["tool_call"] = "tool_call"` —— 判别标签，固定为 `"tool_call"`。
- `tool_call: ToolCall` —— 来自 `tau_agent.tools` 的 `ToolCall` 对象，封装了工具名、调用参数、调用 ID 等。它已是 agent 层类型，说明 provider 在内部把模型原生工具调用格式转换成了 agent 通用结构，交给 `tau_agent` 去执行。

#### 配置

- `model_config = ConfigDict(extra="forbid")`。

### ProviderResponseEndEvent

表示“provider 已完成一次模型响应”。

#### 字段

- `type: Literal["response_end"] = "response_end"` —— 判别标签，固定为 `"response_end"`。
- `message: AssistantMessage` —— 来自 `tau_agent.messages` 的 `AssistantMessage`，通常聚合了本次流中的所有文本、思考与工具调用，是可供 agent 循环持久化/追加到历史的“完整助手消息”。
- `finish_reason: str | None = None` —— provider 给出的结束原因（如 `"stop"`、`"tool_calls"`、`"length"` 等），缺省 `None`。用于 agent 层判断是否需要继续、是否截断。

#### 配置

- `model_config = ConfigDict(extra="forbid")`。

### ProviderErrorEvent

表示“一个可被 agent 层向上抛出的 provider 级错误”。

#### 字段

- `type: Literal["error"] = "error"` —— 判别标签，固定为 `"error"`。
- `message: str` —— 人类可读的错误描述。
- `data: dict[str, JSONValue] | None = None` —— 结构化错误上下文（如 HTTP 状态码、响应体片段、错误类型），缺省 `None`。与 `ProviderRetryEvent.data` 同为 `dict[str, JSONValue] | None`。

#### 配置

- `model_config = ConfigDict(extra="forbid")`。

### ProviderEvent（类型别名）

- 定义（保留原始）：

  ```python
  type ProviderEvent = (
      ProviderResponseStartEvent
      | ProviderResponseEndEvent
      | ProviderTextDeltaEvent
      | ProviderThinkingDeltaEvent
      | ProviderToolCallEvent
      | ProviderRetryEvent
      | ProviderErrorEvent
  )
  ```

- 作用：把上述 7 个具体事件联合成一个判别联合类型（PEP 604 语法）。它是 `provider.py` 中 `ModelProvider.stream_response` 的产出元素类型，也是 `tau_agent` 消费事件流时的统一类型。
- 关键实现/数据流：因为每一个具体事件都有 `type: Literal[...]` 字段，`tau_agent` 可以用 `match event.type:` 做精准的分派（response_start → 初始化 UI；text_delta / thinking_delta → 增量渲染；tool_call → 执行工具；response_end → 收尾；retry → 展示重试；error → 处理错误）。这整套“provider 无关事件词汇”正是 `tau_agent` 与具体模型解耦的关键——它只认 `ProviderEvent`，永不直接解析 OpenAI / Anthropic 私有的响应结构。其设计动机是 Tau 的 **“Small layers beat magic”** 原则：以一组显式、可枚举的事件作为唯一契约，比把各 SDK 的响应对象层层封装更易于推理、测试与替换。

---

## 文件:retry.py

本文件提供**所有 provider 适配器共享的重试助手**：退避延迟计算、重试事件构造、以及“可被取消的退避等待”。它把“是否重试 / 等多久 / 怎么上报”从各个 provider 中抽离出来，保证全栈重试行为一致。`http.py`（共享 HTTP 客户端）则负责在重试之前把请求真正发出去并解析错误，二者共同支撑 `ModelProvider` 的实现。

模块级常量：

- `RETRY_POLL_SECONDS = 0.05` —— 取消轮询粒度：退避等待时被切成每 0.05 秒一小步来检查取消令牌。
- `RETRY_BASE_DELAY_SECONDS = 0.25` —— 指数退避的基准延迟（首跳基数）。

### retry_delay_seconds(attempt: int, *, max_delay_seconds: float) -> float

- 签名（保留原始）：

  ```python
  def retry_delay_seconds(attempt: int, *, max_delay_seconds: float) -> float:
      """Return an exponential retry delay capped by provider config."""
      ...
  ```

- 作用：根据尝试次数 `attempt` 计算指数退避延迟，并用 `max_delay_seconds` 做封顶。
- 关键实现 / 分支：
  1. 若 `max_delay_seconds <= 0`：直接返回 `0.0`（表示不延迟、立刻重试，或禁用退避）。
  2. 否则 `base_delay = min(RETRY_BASE_DELAY_SECONDS, max_delay_seconds)`：取基准延迟与上限中较小者，避免基准本身超过上限。
  3. 返回 `float(min(max_delay_seconds, base_delay * (2**attempt)))`：指数增长 `base_delay * 2^attempt`，再用 `max_delay_seconds` 封顶。
  - 说明：这是纯指数退避（无随机抖动 / jitter），抖动由调用方自行决定是否叠加；`attempt` 从 0 开始计数（第 1 次重试对应 `attempt=0`）。

### provider_retry_event(*, attempt: int, max_retries: int, delay_seconds: float, reason: str, data: dict[str, JSONValue] | None = None) -> ProviderRetryEvent

- 签名（保留原始）：

  ```python
  def provider_retry_event(
      *,
      attempt: int,
      max_retries: int,
      delay_seconds: float,
      reason: str,
      data: dict[str, JSONValue] | None = None,
  ) -> ProviderRetryEvent:
      """Build a provider-neutral retry progress event."""
      ...
  ```

- 作用：构造一个 `events.ProviderRetryEvent`（即 `ProviderEvent` 联合类型中的 `"retry"` 事件），把重试进度以 provider 无关的形式上报给 `tau_agent`。
- 关键实现 / 数据流：
  1. `next_attempt = attempt + 2`：将“已经失败的次数 `attempt`”（0 计数）换算成“将要进行的总尝试序号”（从 1 计数）。例如 `attempt=0` → `next_attempt=2`，即“第 2 次尝试（首次之后的第 1 次重试）”。
  2. `max_attempts = max_retries + 1`：最大尝试总次数 = 允许的重试次数 + 首次。
  3. `delay_suffix = f" in {delay_seconds:g}s" if delay_seconds else ""`：仅当延迟大于 0 时追加 `" in <延迟>s"` 后缀；`:g` 去掉无意义的小数尾零。
  4. 组装 `message`，形如 `"Retrying provider request 2/4 after rate limit in 0.5s."`，其中 `reason` 描述失败原因（如 `"rate limit"`、`"connection reset"`）。
  5. 把 `data` 原样透传进事件，供上层调试。
  - 最终返回 `ProviderRetryEvent(attempt=next_attempt, max_attempts=max_attempts, delay_seconds=delay_seconds, message=..., data=data)`。

### wait_for_retry(delay_seconds: float, *, signal: CancellationToken | None) -> bool

- 签名（保留原始）：

  ```python
  async def wait_for_retry(
      delay_seconds: float,
      *,
      signal: CancellationToken | None,
  ) -> bool:
      """Sleep before a retry while allowing cancellation to interrupt backoff."""
      ...
  ```

- 作用：在重试之前执行退避等待，但**允许取消令牌在等待途中中断**——这是把 `provider.py` 的 `CancellationToken` 与重试逻辑连接起来的关键函数。返回 `True` 表示“可以继续重试”，`False` 表示“已被取消，应停止重试”。
- 关键实现 / 分支：
  1. 若 `delay_seconds <= 0`：不睡眠，直接返回 `signal is None or not signal.is_cancelled()`（无令牌或未被取消则允许继续）。
  2. 否则进入循环：`remaining = delay_seconds`，每次取 `step = min(RETRY_POLL_SECONDS, remaining)`（最多 0.05s 一小步），`await sleep(step)` 后 `remaining -= step`。
  3. 每一步睡眠前检查 `if signal is not None and signal.is_cancelled(): return False`——即把整段退避拆成小步，每步都能及时响应取消，而不是一次性 `sleep(delay_seconds)` 无法中断。
  4. 等待完成（或零延迟）后，最终再返回 `signal is None or not signal.is_cancelled()`，确保退出等待那一刻若被取消也返回 `False`。
- 数据流：provider 在捕获到瞬时错误 → 调 `retry_delay_seconds` 算延迟 → 调 `provider_retry_event` 发 `ProviderRetryEvent` → 调 `wait_for_retry` 等待（可被取消）→ 若返回 `True` 则重发请求。`http.py` 负责实际发请求并把 HTTP 错误暴露给这一步的“是否重试”判断。

> 补充说明（基于真实源码）：任务描述中提到的 `RetryStrategy` / `ExponentialBackoff` / `next_delay` / `should_retry` / `record_failure` 等类名与方法，在 `retry.py` 当前源码中**并不存在**——该模块实际只提供上述三个函数（`retry_delay_seconds`、`provider_retry_event`、`wait_for_retry`）加两个模块常量，且**没有“瞬时错误判定”函数**（瞬时/非瞬时的区分由调用方在 provider 内完成，本文件不内置）。本文严格依据真实源码，不臆测未出现的类。

---

## 文件:http.py

本文件提供**被 Tau 所有网络集成（各 provider 的 HTTP 调用）共享的 httpx 助手**：主要是**代理（proxy）环境变量的规范化**与两个便捷构造/请求函数。它的职责集中在“让 httpx 在各类代理/SOCKS 环境下都能正确构造客户端并取 JSON”，为 `retry.py` 重试逻辑之上的实际网络请求提供底层支撑。模块依赖 `httpx`。

模块级常量：

- `_PROXY_ENV_VARS = ("HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy")` —— 需要被规范化的代理环境变量全集（同时覆盖大写与小写形式）。

### normalize_proxy_url(proxy_url: str) -> str

- 签名（保留原始）：

  ```python
  def normalize_proxy_url(proxy_url: str) -> str:
      """Return an httpx-compatible proxy URL. ..."""
      ...
  ```

- 作用：把一个代理 URL 转换为 httpx 可接受的格式。核心处理是 **SOCKS 通用方案修正**。
- 关键实现 / 分支：
  1. 若 `proxy_url.lower().startswith("socks://")`：有些环境用通用的 `socks://` 作为 SOCKS 代理方案，但 httpx 只认显式版本（`socks5://`、`socks5h://` 等）并在建连前直接拒绝通用形式。因此这里返回 `f"socks5://{proxy_url[len('socks://'):]}"`，把通用形式当作 SOCKS5 处理，使 Tau 能尊重这些代理变量。
  2. 否则原样返回 `proxy_url`（如 `http://`、`https://`、`socks5://` 等已是 httpx 兼容形式）。

### normalized_proxy_environment() -> Iterator[None]（上下文管理器）

- 签名（保留原始）：

  ```python
  @contextmanager
  def normalized_proxy_environment() -> Iterator[None]:
      """Temporarily normalize proxy environment variables for httpx construction."""
      ...
  ```

- 作用：以**上下文管理器**方式，在 `yield` 期间临时把不兼容的代理环境变量规范化（例如 `socks://` → `socks5://`），退出时还原，从而保证在 `with` 块内 `httpx.AsyncClient(...)` / `httpx.get(...)` 能正确读取代理配置而不报错。
- 关键实现 / 数据流：
  1. 遍历 `_PROXY_ENV_VARS`，对每个变量用 `os.environ.get(name)` 取值；为 `None` 则跳过。
  2. 对每个有值变量调用 `normalize_proxy_url(value)`；若规范化后与原值相同则跳过（无需改动）。
  3. 若不同：先把原值存入 `original[name]` 备份，再把 `os.environ[name]` 设为规范化值，并标记 `changed = True`。
  4. `try: yield` 把控制权交给 `with` 块内的 httpx 构造/请求代码。
  5. `finally`：只要 `changed`，就遍历 `original` 把每个变量还原——值为 `None` 的用 `os.environ.pop(name, None)` 删除，否则写回原值。保证对进程环境变量**无副作用**。
  - 数据流：所有需要代理的请求入口（见下两个函数）都套用此上下文管理器，使“代理兼容”在单一处集中处理，provider 无需各自关心。

### create_async_client(**kwargs: Any) -> httpx.AsyncClient

- 签名（保留原始）：

  ```python
  def create_async_client(**kwargs: Any) -> httpx.AsyncClient:
      """Create an ``httpx.AsyncClient`` with Tau's proxy normalization applied."""
      ...
  ```

- 作用：创建一个应用了 Tau 代理规范化的 `httpx.AsyncClient`，供各 provider 发起异步流式/一次性 HTTP 请求。
- 关键实现：在 `with normalized_proxy_environment():` 块内 `return httpx.AsyncClient(**kwargs)`——即把调用方传入的所有关键字参数（超时、headers、base_url、proxy 等）透传给 httpx，同时保证此构造期间代理变量已被规范化。`**kwargs: Any` 允许任意 httpx 客户端参数，最大化灵活性。

### get_json(url: str, *, timeout: float, follow_redirects: bool = False) -> dict[str, object]

- 签名（保留原始）：

  ```python
  def get_json(url: str, *, timeout: float, follow_redirects: bool = False) -> dict[str, object]:
      """Fetch a JSON object with Tau's proxy normalization applied."""
      ...
  ```

- 作用：以同步方式抓取一个 URL 并解析为 JSON 对象，同样套用代理规范化。常用于拉取模型清单、配置等轻量元数据。
- 关键实现 / 步骤：
  1. 在 `with normalized_proxy_environment():` 内调用 `httpx.get(url, timeout=timeout, follow_redirects=follow_redirects)`——仅关键字参数 `timeout` 必填，`follow_redirects` 默认 `False`。
  2. `response.raise_for_status()`：非 2xx 响应直接抛 `httpx.HTTPStatusError`（注意本函数是同步路径，未叠加 `retry.py` 的退避；真正的请求重试逻辑由 provider 在异步路径上配合 `retry.py` 实现）。
  3. `data = response.json()` 解析响应体。
  4. 若 `not isinstance(data, dict)`：抛 `ValueError("HTTP response must be a JSON object")`，强制要求顶层是对象而非数组/标量。
  5. 返回 `dict[str, object]` 形式的 `data`。
- 误差/约束：`timeout` 是必传浮点秒数；返回类型注解为 `dict[str, object]`（宽松值类型），调用方通常自行进一步校验字段。

> 补充说明（基于真实源码）：任务描述中提到的 `http_client` / `build_http_client` / `_raise_for_status` / `http_error_detail` / “超时、重试、错误体提取、UA”等名称，在 `http.py` 当前源码中**并不存在**——本文件实际只提供 `normalize_proxy_url`、`normalized_proxy_environment`（上下文管理器）、`create_async_client`、`get_json` 四个定义，且**不包含自定义 UA 设置、错误体提取函数、或内建重试**。超时通过 `get_json` 的 `timeout=` 参数与 `create_async_client` 透传的 `kwargs` 表达；重试由 `retry.py` 在外层负责，而非本文件。错误体提取（`http_error_detail`）未在此实现。本文严格依据真实源码，不臆测未出现的助手。

---

## 串联总览：四文件如何共同支撑 `tau_ai` 全栈

1. **`ModelProvider`（provider.py）作为依赖边界**：它是 `tau_agent` 与具体模型实现之间唯一的耦合点。Agent 循环只持有 `ModelProvider` 协议对象，调用 `stream_response(...)` 拿到 `AsyncIterator[ProviderEvent]`，从而彻底不感知 OpenAI / Anthropic / 本地模型等差异。模块内 `CancellationToken` 协议则把“可取消”抽象成最小接口，向下贯穿到 `retry.py` 的退避等待。

2. **`events.py` 的 provider 无关事件词汇被 `tau_agent` 消费**：`stream_response` 产出的每一个元素都是 `ProviderEvent` 联合类型之一（7 种 Pydantic 事件，均以 `type: Literal[...]` 做判别标签）。`tau_agent` 用 `match event.type:` 做分派——`response_start` 初始化、`text_delta`/`thinking_delta` 增量渲染、`tool_call` 执行工具、`response_end` 收尾并取 `AssistantMessage`、`retry` 展示重试进度、`error` 处理错误。因为所有字段都是 agent 层类型（`AgentMessage`/`ToolCall`/`AssistantMessage`）或基本类型，`tau_agent` 永不接触 provider 私有响应结构，这正是 Pi 架构中“AgentHarness 独立于 provider”原则的体现。

3. **`retry.py` 与 `http.py` 支撑所有 provider 实现**：任何具体 provider 在 `stream_response` 内部都遵循同一套路——用 `http.py` 的 `create_async_client` 建连（自动规范 `socks://` 等代理环境）发起请求；捕获到瞬时失败（如 429 / 5xx / 连接重置）后，用 `retry.py.retry_delay_seconds` 算指数退避、用 `provider_retry_event` 发出 `ProviderRetryEvent` 让上层可见、用 `wait_for_retry` 做可取消的退避等待，再借 `CancellationToken` 判断是否中断。如此，`retry`/`http` 把“网络请求 + 退避重试 + 取消”的横向关注点从各 provider 抽离，保证全栈行为一致，并使 `ModelProvider` 协议得以被稳定、可观测、可取消地实现。

---

<!-- NAV -->
[← 源码剖析总览]({{< relref "./source-walkthrough.md" >}})
[↑ 总览]({{< relref "./source-walkthrough.md" >}})
[→ tau_ai · 环境配置]({{< relref "./ai-env-config.md" >}})
