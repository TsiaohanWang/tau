# Hugging Face 自动路由故障转移 / Hugging Face automatic route failover

## 变更内容(What changed)

[原文]
Tau now distinguishes two session-scoped Hugging Face routing modes:

[译文]
Tau 现在区分两种会话级的 Hugging Face 路由模式:

[原文]
- `automatic`: an unsuffixed first request becomes sticky after a successful
  `x-inference-provider` response, but the route remains recoverable.
- `fixed`: a route selected through provider preferences or the extension API is
  explicit user intent and is never silently replaced.

[译文]
- `automatic`:第一次不带后缀的请求在收到成功的 `x-inference-provider` 响应之后变为粘性(sticky),但该路由仍可恢复。
- `fixed`:通过 provider 偏好或扩展 API 选择的路由是明确的用户意图,永远不会被静默替换。

[原文]
When a sticky automatic route exhausts its provider-level retries with HTTP 408,
409, 425, 429, or 5xx before emitting content, the coding session clears the
resolved suffix and continues the same agent run once through Hugging Face's
unsuffixed automatic router. A successful response supplies the replacement
route header, which becomes the new automatic session pin.

[译文]
当粘性的自动路由在输出任何内容之前,因 HTTP 408、409、425、429 或 5xx 耗尽 provider 级重试时,编码会话会清除已解析的后缀,并让同一次 agent 运行通过 Hugging Face 不带后缀的自动路由器继续一次。成功的响应会提供替换路由头,它成为新的自动会话固定路由。

## 为什么由内核负责恢复(Why core owns recovery)

[原文]
The provider adapter knows how to repeat one HTTP request, but it cannot change
application-owned session metadata or restart the interrupted agent run with a
new runtime. An extension can select a route, but its only public way to trigger
another turn adds a user message. `tau_coding.CodingSession` already owns safe
continuation, persistence, cancellation, auto-retry events, and overflow
recovery, so it is the correct boundary for route failover.

[译文]
Provider 适配器知道如何重发一次 HTTP 请求,但它无法修改应用持有的会话元数据,也无法用新运行时重启被中断的 agent 运行。扩展可以选择路由,但它触发下一轮的唯一公开方式会追加一条用户消息。`tau_coding.CodingSession` 本就持有安全续跑、持久化、取消、自动重试事件与溢出恢复,因此它是路由故障转移的正确边界。

[原文]
The split remains:

[译文]
分层仍为:

[原文]
- `tau_ai`: retry the same wire request and preserve provider diagnostics.
- `tau_agent`: portable provider/tool loop with no Hugging Face assumptions.
- `tau_coding`: classify a terminal route failure, replace the runtime, continue
  without another user message, and persist the route mode and result.
- Hugging Face extension: discover live routes and let users choose automatic or
  fixed mode.

[译文]
- `tau_ai`:重试同一个线上请求,并保留 provider 诊断。
- `tau_agent`:可移植的 provider/工具循环,不含 Hugging Face 假设。
- `tau_coding`:对终态路由失败进行分类、替换运行时、在不追加用户消息的情况下继续,并持久化路由模式与结果。
- Hugging Face 扩展:发现实时路由,让用户选择自动或固定模式。

## 安全规则(Safety rules)

[原文]
Failover happens only when all conditions hold:

[译文]
只有在以下条件全部成立时才会发生故障转移:

[原文]
1. the logical Tau provider is `huggingface`;
2. the session mode is `automatic`;
3. a resolved route is currently pinned;
4. provider diagnostics contain a retryable HTTP status; and
5. the failed assistant message has no text, thinking, or tool-call content.

[译文]
1. 逻辑 Tau provider 是 `huggingface`;
2. 会话模式是 `automatic`;
3. 当前固定了一个已解析路由;
4. provider 诊断中包含可重试的 HTTP 状态;且
5. 失败的 assistant 消息没有任何文本、thinking 或工具调用内容。

[原文]
Only one automatic reroute is attempted per prompt. The fallback itself is not
rerouted again, preventing loops. Fixed routes still receive their configured
same-route retries and then surface the terminal error.

[译文]
每条提示只尝试一次自动重新路由。回退路径本身不会被再次重新路由,从而防止循环。固定路由仍会获得其配置的同路由重试,然后暴露终态错误。

## 持久化与兼容性(Persistence and compatibility)

[原文]
Session indexes now store `inference_provider_mode` next to the existing
`inference_provider`. The current route remains a projection used for startup and
resume; logical model identity and transcript entries remain unchanged.

[译文]
会话索引现在在既有的 `inference_provider` 旁边存储 `inference_provider_mode`。当前路由仍是一个用于启动与恢复的投射;逻辑模型身份与会话记录条目保持不变。

[原文]
Older records with a route but no mode load as `fixed`. That conservative default
prevents an upgrade from overriding a route that may have been selected manually.
Records without a route load as `automatic`.

[译文]
有路由但没有模式的旧记录会按 `fixed` 加载。这个保守默认值防止升级过程覆盖一个可能是手动选择的路由。没有路由的记录按 `automatic` 加载。

[原文]
The extension API exposes both the current resolved route and its mode. Existing
extensions remain compatible: passing a route to `set_inference_provider` now
means fixed, while passing `None` means automatic.

[译文]
扩展 API 同时暴露当前已解析路由与其模式。既有扩展保持兼容:向 `set_inference_provider` 传入路由现在意味着固定,传入 `None` 则意味着自动。

## 用户可见行为(User-visible behavior)

[原文]
`/session` reports either:

[译文]
`/session` 会报告二者之一:

```text
Hugging Face inference provider: automatic (currently baseten)
Hugging Face inference provider: deepinfra (fixed)
```

[原文]
Automatic recovery emits `agent_end(will_retry=true)`, `auto_retry_start`, the
continuation events, `auto_retry_end`, and finally `agent_settled`. Print-mode
renderers treat a successful retry as a successful command. The TUI removes the
intermediate terminal error when retry progress begins.

[译文]
自动恢复会发出 `agent_end(will_retry=true)`、`auto_retry_start`、继续运行的事件、`auto_retry_end`,最后是 `agent_settled`。Print 模式渲染器把成功的重试当作成功的命令。当重试进度开始时,TUI 会移除中间那个终态错误。

[原文]
Failover may lose provider-local prefix cache state and require a cold prefill.
It also cannot bypass account-wide or router-wide rate limits.

[译文]
故障转移可能丢失 provider 本地的前缀缓存状态,并需要一次冷预填充。它也无法绕过账号级或路由器级的限流。

## 验证(Validation)

[原文]
Deterministic tests cover automatic failover and repinning, exact continuation
context without an extra user message, fixed-route non-failover, legacy session
compatibility, extension-visible mode, frontend retry rendering, and session
metadata round trips.

[译文]
确定性测试覆盖:自动故障转移与重新固定、不追加额外用户消息的精确续跑上下文、固定路由不转移、旧会话兼容性、扩展可见模式、前端重试渲染,以及会话元数据的双向读写。

[原文]
Run:

[译文]
运行:

```bash
uv run pytest
uv run ruff check .
uv run ruff format --check .
uv run mypy
```
