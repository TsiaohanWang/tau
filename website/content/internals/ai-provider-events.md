---
title: tau_ai · Provider 契约与事件流
description: provider.py / events.py / retry.py / http.py / http_errors 之前的底层契约
---

## `tau_ai/provider.py` — 全栈依赖的两个 Protocol

这是整个代码库最关键的一层契约。两个 `typing.Protocol` 类定义了下游所有代码
使用的接口。注意它**从 `tau_agent` 反向 import** 了消息与工具类型——这是栈中
唯一一处"下层 import 上层"的地方，因为 provider 需要把"消息"和"工具"当作纯数据
来接收（消息/工具是结构性数据，不属于 provider 的职责）。

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

> 关键设计：消费者（agent loop）永远只看到这 7 种事件类型。provider 之间的差异
> （chat/completions vs `/v1/responses`、SSE 形态、工具调用编码方式）全部被吸收
> 在这一层之下。

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
  被取消）。这是取消能力真正生效的地方——不是一次性 `sleep`，而是可被轮询中止。

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

<!-- NAV -->
[← 源码剖析总览]({{< relref "./source-walkthrough.md" >}})
[↑ 总览]({{< relref "./source-walkthrough.md" >}})
[→ tau_ai · 环境配置]({{< relref "./ai-env-config.md" >}})
