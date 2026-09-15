# Provider 锚定的上下文计量与溢出恢复 / Provider-anchored context accounting and overflow recovery

## 变更内容(What changed)

[原文]
Tau now anchors active context accounting to the latest applicable successful
assistant response's provider-reported usage. It estimates only messages and
dynamically added tools after that response. The existing character-based
estimate remains the fallback when no valid provider usage is available.

[译文]
Tau 现在把活动上下文计量锚定到最近一次适用的、成功 assistant 响应的 provider 上报用量上。它只估算该响应之后的消息与动态添加的工具。当没有可用的合法 provider 用量时,既有的基于字符的估算仍是回退方案。

[原文]
The TUI also treats a recognized context-overflow response as provisional while
the coding session compacts and retries. It shows recovery progress and only
surfaces the provider error if compaction or retry cannot recover. The low-level
`agent_end` event no longer settles session-driven TUI runs; `agent_settled`
remains the final boundary.

[译文]
在编码会话进行压缩与重试期间,TUI 还会把已识别的上下文溢出响应视为临时状态。它展示恢复进度,只有当压缩或重试无法恢复时才暴露 provider 错误。底层 `agent_end` 事件不再让「会话驱动的 TUI 运行」进入终态;`agent_settled` 仍是最终边界。

## 为什么(Why)

[原文]
Character-only accounting can substantially undercount token-dense tool output,
provider framing, and opaque reasoning state. In a production Codex session,
the provider reported almost 397K processed tokens while Tau displayed a much
smaller estimate, so proactive compaction did not run.

[译文]
仅基于字符的计量可能严重低估 token 密集的工具输出、provider 框架开销与不透明的推理状态。在一个生产环境的 Codex 会话中,provider 报告处理了将近 397K token,而 Tau 显示的估算值小得多,因此主动压缩没有运行。

[原文]
A provider overflow is stronger evidence than a local estimate. Tau's existing
overflow path already bypassed the threshold and retried once, but the TUI
rendered its intermediate provider error as terminal before recovery completed.

[译文]
Provider 报出的溢出是比本地估算更强的证据。Tau 既有的溢出路径本已绕过阈值并重试一次,但 TUI 在恢复完成之前就把其中间 provider 错误渲染成了终态。

## 与 Pi 的对应(Pi mapping)

[原文]
This follows Pi's hybrid accounting in `packages/ai/src/utils/estimate.ts`:
provider usage describes a valid context prefix and deterministic estimation
covers only the trailing messages. Errored, aborted, zero-usage, and stale
pre-compaction responses cannot anchor the count.

[译文]
这遵循 Pi 在 `packages/ai/src/utils/estimate.ts` 中的混合计量:provider 用量描述一个合法的上下文前缀,确定性估算只覆盖尾部的消息。出错、被中止、零用量以及压缩前的陈旧响应都不能作为计数的锚点。

[原文]
It also preserves Pi's lifecycle distinction: `agent_end` closes one low-level
agent run, while `agent_settled` means no compaction, retry, or queued continuation
remains.

[译文]
它还保留了 Pi 的生命周期区分:`agent_end` 结束一次底层 agent 运行,而 `agent_settled` 意味着不再有压缩、重试或排队的续跑。

## 验证(Validation)

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

[原文]
Manual check:

[译文]
手动检查:

[原文]
1. Start a long Codex subscription session and run `/session` after a successful
   turn. Confirm it shows a provider token basis plus estimated trailing tokens.
2. Trigger a context overflow with automatic compaction enabled.
3. Confirm the TUI shows `Context limit reached; compacting and retrying` and no
   terminal error when retry succeeds.
4. Make summarization fail and confirm the original overflow becomes visible.

[译文]
1. 启动一个长时间的 Codex 订阅会话,在一次成功轮次后运行 `/session`。确认它显示 provider token 基数加上估算的尾部 token。
2. 在启用自动压缩的情况下触发一次上下文溢出。
3. 确认 TUI 显示 `Context limit reached; compacting and retrying`,并且在重试成功时不显示终态错误。
4. 让摘要生成失败,确认原始的溢出错误变为可见。
