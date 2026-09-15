---
title: "Provider Retry Events / Provider 重试事件"
---

[原文]
Tau retries transient provider failures in `tau_ai`, where HTTP status codes and
transport exceptions are visible. This keeps retry classification out of
`tau_agent` while still allowing the portable agent loop to surface progress.

[译文]
Tau 在 `tau_ai` 中重试瞬时的 provider 故障 —— 因为 HTTP 状态码与传输异常在这里可见。这使重试分类不进入 `tau_agent`,同时仍让可移植 agent 循环能够呈现进度。

## 新增了什么(What Was Added)

[原文]
Provider adapters can emit `ProviderRetryEvent` before retrying a failed request.
The event includes the next attempt number, total attempts, delay, a
human-readable message, and structured diagnostic data.

[译文]
Provider 适配器可以在重试失败请求之前发出 `ProviderRetryEvent`。该事件包含:下一次尝试的序号、总尝试次数、延迟、人类可读消息,以及结构化诊断数据。

[原文]
`run_agent_loop()` maps that provider event to `RetryEvent`, a provider-neutral
agent event consumed by renderers and TUI adapters.

[译文]
`run_agent_loop()` 把该 provider 事件映射为 `RetryEvent` —— 一个 provider 无关的 agent 事件,由渲染器与 TUI 适配器消费。

## 行为(Behavior)

[原文]
OpenAI-compatible, Anthropic, and OpenAI Codex subscription providers retry
transient status codes such as `408`, `409`, `429`, and `5xx` responses before
surfacing a final provider error. The default is two retries, for three total
request attempts.

[译文]
OpenAI 兼容、Anthropic 与 OpenAI Codex 订阅 provider 会在抛出最终 provider 错误之前,重试 `408`、`409`、`429` 以及 `5xx` 等瞬时状态码。默认重试两次,即总共三次请求尝试。

[原文]
The Anthropic and OpenAI Codex adapters also retry transient *in-stream*
failures. Both APIs can return HTTP 200 and then send an SSE error event. For
Anthropic, retryable error types are `api_error`, `overloaded_error`, and
`rate_limit_error`. Codex classifies `error` and `response.failed` events against
transient markers such as overloaded, service unavailable, rate limit,
internal/server errors, and timeouts.

[译文]
Anthropic 与 OpenAI Codex 适配器还会重试瞬时的**流内(in-stream)**失败。这两个 API 都可能先返回 HTTP 200,随后再发送 SSE 错误事件。对 Anthropic 而言,可重试的错误类型是 `api_error`、`overloaded_error` 与 `rate_limit_error`。Codex 则根据 overloaded、service unavailable、rate limit、internal/server errors、timeouts 等瞬时标记,对 `error` 与 `response.failed` 事件进行分类。

[原文]
When an in-stream error arrives before content or thinking deltas, the adapter
emits `ProviderRetryEvent` and reissues the request under the same `max_retries`
budget. Errors after partial content, and non-transient errors such as
`authentication_error` or `invalid_api_key`, stay terminal to avoid replaying
visible output or tool calls.

[译文]
当流内错误在内容或 thinking 增量之前到达时,适配器会发出 `ProviderRetryEvent`,并在同一个 `max_retries` 预算下重新发起请求。部分内容之后出现的错误,以及 `authentication_error`、`invalid_api_key` 等非瞬时错误,都保持终止状态,以避免重放已经可见的输出或工具调用。

[原文]
Backoff is short, exponential, and capped by `max_retry_delay_seconds`.
Cancellation is checked during the backoff delay so Escape/TUI cancellation does
not wait for the entire retry sleep to finish.

[译文]
退避时间很短、按指数增长,并由 `max_retry_delay_seconds` 设上限。退避等待期间会检查取消状态,因此 Escape/TUI 取消不必等整个重试休眠结束。

## 渲染(Rendering)

[原文]
Transcript and TUI renderers show retry progress as subtle status output. Final
text mode ignores retry progress and only prints the final assistant response or
final error.

[译文]
会话记录与 TUI 渲染器把重试进度显示为不打扰的状态输出。最终文本模式忽略重试进度,只打印最终的 assistant 响应或最终错误。

## 边界(Boundary)

[原文]
`tau_agent` does not decide whether an HTTP response is retryable. It only
forwards `RetryEvent` as portable progress. Provider-specific details stay in
the adapter's `data` payload for diagnostics.

[译文]
`tau_agent` 不判断某个 HTTP 响应是否可重试。它只把 `RetryEvent` 作为可移植进度转发。Provider 特有的细节留在适配器的 `data` 载荷中,用于诊断。
