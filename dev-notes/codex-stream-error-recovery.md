# Codex 流内错误恢复 / Codex in-stream error recovery

## 变更内容(What changed)

[原文]
The OpenAI Codex provider now surfaces the real failure behind SSE `error`
events, retries transient ones automatically, and records the provider's error
classification in the diagnostic log. After a terminal provider error, the TUI
also states that the run ended and can be retried by sending another message.

[译文]
OpenAI Codex provider 现在会暴露 SSE `error` 事件背后的真实故障,自动重试瞬时错误,并把 provider 的错误分类记录进诊断日志。在 provider 终态错误之后,TUI 还会说明本次运行已结束,并可通过再发送一条消息重试。

## 为什么需要它(Why it exists)

[原文]
A production Codex session failed twice with
`Error: OpenAI Codex returned an error` and no further detail. The session file
showed the provider had sent an HTTP 200 stream containing:

[译文]
一个生产环境的 Codex 会话失败了两次,只报出 `Error: OpenAI Codex returned an error`,没有任何进一步细节。会话文件显示 provider 发送了一个 HTTP 200 流,其中包含:

```json
{"type":"error","error":{"type":"service_unavailable_error","code":"server_is_overloaded","message":"Our servers are currently overloaded. Please try again later.","param":null},"sequence_number":2}
```

[原文]
Three gaps compounded:

[译文]
三个缺口叠加在一起:

[原文]
1. `_error_message()` only read top-level `message`/`code` fields, so nested
   `error.message` text never reached the user — only the generic fallback did.
2. In-stream errors on HTTP 200 were always terminal; the retry loop only
   covered HTTP statuses and transport exceptions, so a brief overload window
   ended the run immediately.
3. `agent-calls.jsonl` recorded only the (generic) error message, dropping the
   nested `type`/`code` that explain the failure.

[译文]
1. `_error_message()` 只读取顶层 `message`/`code` 字段,因此嵌套的 `error.message` 文本从未到达用户 —— 到达的只有通用回退文本。
2. HTTP 200 上的流内错误始终是终态的;重试循环只覆盖 HTTP 状态与传输异常,因此一个短暂的过载窗口就会立即结束运行。
3. `agent-calls.jsonl` 只记录了(通用的)错误消息,丢掉了用于解释故障的嵌套 `type`/`code`。

## 架构(Architecture)

[原文]
The fix preserves Tau's layer boundaries:

[译文]
该修复保持了 Tau 的分层边界:

[原文]
- `tau_ai.openai_codex` extracts `(code, message)` from all Codex error shapes
  (top-level fields, nested `error`, and `response.error` for
  `response.failed`). Transient in-stream errors that arrive before any content
  or thinking deltas are retried under the existing `max_retries` budget, with
  the usual backoff, `ProviderRetryEvent` progress, and cancellation checks.
  Retry classification stays in the provider adapter; `tau_agent` only forwards
  events.
- `tau_coding.diagnostics` copies only non-secret scalar fields (`type`,
  `code`, `message`, `sequence_number`, status code, attempt count) from the
  provider event into `agent-calls.jsonl`. Bodies and full payloads stay out.
- `tau_coding.tui.app` appends "Run ended before completion. Send a message to
  retry." to terminal error blocks, except for context-overflow errors, which
  Tau already auto-compacts and retries.

[译文]
- `tau_ai.openai_codex` 从所有 Codex 错误形态(顶层字段、嵌套 `error`,以及 `response.failed` 的 `response.error`)中提取 `(code, message)`。在任何内容或 thinking 增量之前到达的瞬时流内错误,会在既有 `max_retries` 预算下重试,并伴随通常的退避、`ProviderRetryEvent` 进度与取消检查。重试分类留在 provider 适配器;`tau_agent` 只转发事件。
- `tau_coding.diagnostics` 只把非密钥的标量字段(`type`、`code`、`message`、`sequence_number`、状态码、尝试次数)从 provider 事件复制进 `agent-calls.jsonl`。响应体与完整载荷不会进入。
- `tau_coding.tui.app` 会向终态错误块追加 "Run ended before completion. Send a message to retry.",但上下文溢出错误除外 —— 对后者,Tau 本就会自动压缩并重试。

## 如何测试(How to test)

```bash
uv run pytest tests/test_tau_ai.py -k codex
uv run pytest tests/test_coding_session.py -k stream_error
uv run pytest tests/test_tui_app.py -k prompt_worker
```

[原文]
Manual check: configure `openai-codex` with `max_retries: 2` and prompt during
a Codex overload window. Tau retries quietly, and if the overload persists the
error block shows the provider's own message plus the log path and retry hint.

[译文]
手动检查:把 `openai-codex` 配置为 `max_retries: 2`,并在 Codex 过载窗口期间提交提示。Tau 会安静地重试;若过载持续,错误块会显示 provider 自己的消息,以及日志路径与重试提示。
