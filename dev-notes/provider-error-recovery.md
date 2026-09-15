# Provider 错误恢复与可见的 TUI 失败 / Provider error recovery and visible TUI failures

## 变更内容(What changed)

[原文]
Tau now keeps empty failed or aborted assistant messages in durable session
history without replaying those messages to providers. The Textual frontend also
projects terminal assistant failures into the mounted transcript immediately,
including any partial assistant text that arrived before the failure.

[译文]
Tau 现在会把空的失败或中止 assistant 消息保留在持久化会话历史中,但不会把这些消息重放给 provider。Textual 前端还会立即把终态的 assistant 失败投射到已挂载的会话记录中,包括失败之前到达的任何部分 assistant 文本。

## 为什么需要它(Why it exists)

[原文]
A production Kimi session exhausted retries with HTTP 429. Tau persisted the
failure as an assistant message with no content. The user's next prompt replayed
that empty assistant turn through the OpenAI-compatible chat format, and Kimi
rejected the request with HTTP 400. Tau recorded the second failure internally,
but incremental TUI rendering finalized an empty assistant widget instead of
mounting the error item, so the run appeared to stop silently.

[译文]
一个生产环境的 Kimi 会话因 HTTP 429 耗尽了重试。Tau 把该失败持久化为一条没有内容的 assistant 消息。用户的下一条提示通过 OpenAI 兼容的 chat 格式重放了那个空的 assistant 轮次,Kimi 以 HTTP 400 拒绝了请求。Tau 在内部记录了第二次失败,但增量的 TUI 渲染最终生成了一个空的 assistant 组件,而没有挂载错误条目,因此这次运行看起来是静默停止的。

## 架构(Architecture)

[原文]
The fix preserves Tau's layer boundaries:

[译文]
该修复保持了 Tau 的分层边界:

[原文]
- `tau_agent.loop` derives provider-facing context from canonical harness
  history. Empty terminal failures are omitted only at this boundary; the
  original messages remain available to sessions, branches, and diagnostics.
- `tau_coding.tui.state` defines the canonical display projection for failed
  assistant messages: replayable partial text followed by an error block.
- `tau_coding.tui.app` rebuilds the transcript once at the terminal failure
  event. This is not a high-frequency streaming path and guarantees that live
  rendering matches restored session rendering.

[译文]
- `tau_agent.loop` 从规范的 harness 历史推导面向 provider 的上下文。空的终态失败只在这个边界上被省略;原始消息对会话、分支与诊断仍然可用。
- `tau_coding.tui.state` 定义了失败 assistant 消息的规范显示投射:可重放的部分文本,后跟一个错误块。
- `tau_coding.tui.app` 在终态失败事件处重建一次会话记录。这不是高频流式路径,并且保证实时渲染与恢复后的会话渲染一致。

[原文]
Only empty `error` and `aborted` assistant turns are filtered. A failed message
with text, thinking, or tool-call content remains in provider context for now so
this focused fix does not silently discard a partial response. A broader policy
for partially failed turns and unmatched tool calls can be handled separately.

[译文]
只有空的 `error` 与 `aborted` assistant 轮次会被过滤。带文本、thinking 或工具调用内容的失败消息目前仍留在 provider 上下文中,这样本次聚焦修复不会静默丢弃部分响应。针对「部分失败轮次」与「未匹配工具调用」的更广泛策略可以另行处理。

## 如何测试(How to test)

```bash
uv run pytest tests/test_agent_loop.py tests/test_tui_adapter.py tests/test_tui_app.py
uv run pytest
uv run ruff check .
uv run ruff format --check .
uv run mypy
```

[原文]
The regression tests prove that an empty failed turn remains in harness history
but is absent from the next provider call, restored failures retain their visible
error, and a mounted Textual transcript shows the provider error during a live
run.

[译文]
回归测试证明:空的失败轮次仍留在 harness 历史中,但在下一次 provider 调用中缺席;恢复后的失败保留其可见错误;已挂载的 Textual 会话记录在实时运行期间会显示 provider 错误。
