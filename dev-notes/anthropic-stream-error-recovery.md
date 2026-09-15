# Anthropic 流内错误恢复 / Anthropic in-stream error recovery

## 变更内容(What changed)

[原文]
The Anthropic adapter now retries transient errors delivered inside an HTTP 200
Server-Sent Events response. It recognizes Anthropic's `api_error`,
`overloaded_error`, and `rate_limit_error` types and uses the provider's existing
retry count, backoff delay, progress event, and cancellation behavior.

[译文]
Anthropic 适配器现在会重试在 HTTP 200 的 Server-Sent Events 响应内部投递的瞬时错误。它识别 Anthropic 的 `api_error`、`overloaded_error` 与 `rate_limit_error` 类型,并使用该 provider 既有的重试次数、退避延迟、进度事件与取消行为。

## 为什么需要它(Why it exists)

[原文]
A production Claude Opus 5 session ended immediately after Anthropic sent an
`overloaded_error` SSE event. The provider was configured for two retries, but
the old adapter applied that budget only to retryable HTTP statuses and transport
exceptions. Every SSE `error` event was terminal, even before any response
content arrived.

[译文]
一个生产环境的 Claude Opus 5 会话在 Anthropic 发出 `overloaded_error` SSE 事件之后立即结束。该 provider 配置了两次重试,但旧适配器只把这笔预算用于可重试的 HTTP 状态与传输异常。每个 SSE `error` 事件都是终态的,即使在任何响应内容到达之前也是如此。

## 架构(Architecture)

[原文]
Retry classification remains in `tau_ai.anthropic`, where the provider-specific
error type is available. The adapter wraps final stream diagnostics as an
`event` plus the number of attempts, matching the safe extraction performed by
`tau_coding.diagnostics`. The portable agent layer does not gain Anthropic-specific
logic.

[译文]
重试分类仍留在 `tau_ai.anthropic`,因为那里可以获得 provider 特有的错误类型。适配器把最终的流诊断包装成 `event` 加上尝试次数,与 `tau_coding.diagnostics` 执行的安全提取保持一致。可移植 agent 层没有引入 Anthropic 特有逻辑。

[原文]
Only errors received before text, thinking, or tool payload starts are retried.
Once partial content exists, Tau surfaces the error rather than risking duplicate
output or tool execution.

[译文]
只有在线性文本、thinking 或工具载荷开始之前收到的错误才会被重试。一旦存在部分内容,Tau 就会暴露该错误,而不是冒险产生重复输出或重复执行工具。

## 如何测试(How to test)

```bash
uv run pytest tests/test_tau_ai.py -k anthropic_provider
uv run pytest
uv run ruff check .
uv run ruff format --check .
uv run mypy
```

[原文]
A manual check can use an Anthropic provider with `max_retries` greater than zero.
During a brief overload before any response content, Tau should retry quietly and
continue when a later attempt succeeds. Persistent overloads should surface the
final `Overloaded` error after the configured attempts are exhausted.

[译文]
手动检查可以使用一个 `max_retries` 大于零的 Anthropic provider。在任何响应内容之前的短暂过载期间,Tau 应当安静地重试,并在后续尝试成功时继续。持续过载则应在配置的尝试次数耗尽之后暴露最终的 `Overloaded` 错误。
