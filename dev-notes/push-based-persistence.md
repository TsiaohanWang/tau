# 推送式会话持久化 / Push-based session persistence

## 变更内容(What changed)

[原文]
`CodingSession` no longer persists messages from inside the loops that consume
harness events. It subscribes a persistence listener to the harness, and every
`message_end` notification writes that message to the session tree before the
event reaches the frontend. The count watermarks (`persisted_count = len(...)`
slicing in `prompt()`, `continue_()`, the overflow retry, and
`run_terminal_command`) are gone. All synthetic "Tool call interrupted by
user" repairs now flow through `message_start`/`message_end` events: the
run-start repair moved from `prompt()`/`continue_()` into `_run`, and the
cancelled-cleanup repair pushes to subscribers directly.

[译文]
`CodingSession` 不再在消费 harness 事件的循环内部持久化消息。它向 harness 订阅一个持久化监听器,每次 `message_end` 通知都会在事件到达前端之前把该消息写入会话树。基于计数的高水位标记(在 `prompt()`、`continue_()`、溢出重试与 `run_terminal_command` 中做 `persisted_count = len(...)` 切片)已被移除。所有合成的「Tool call interrupted by user」修复现在都经由 `message_start`/`message_end` 事件流动:运行开始时的修复从 `prompt()`/`continue_()` 移进了 `_run`,取消清理时的修复则直接推送给订阅者。

## 为什么需要它(Why it exists)

[原文]
Pressing Esc mid-tool-call makes the TUI cancel the worker that consumes
`session.prompt()`. With pull-side persistence, everything after the last
consumed event was silently dropped: the harness appended the synthetic
interrupted tool result in its `finally` block, but no consumer remained to
persist it, and the later count watermarks classified the orphan as already
persisted. Session files were left with `assistant(tool_use)` followed directly
by a user message. The fault stayed hidden — the in-memory repair protected the
live session and the `load()` repair protected restarts — until a replay that
skipped repair (`/tree`) sent the transcript to a provider, which rejected it
with a 400 (`tool_use` ids without `tool_result` blocks immediately after).

[译文]
在工具调用进行中按 Esc 会让 TUI 取消消费 `session.prompt()` 的 worker。在拉取式持久化下,最后一个被消费事件之后的一切都被静默丢弃了:harness 在其 `finally` 块中追加了合成的「中断的工具结果」,但已经没有消费者来持久化它,而后来的计数高水位又把这个孤儿归类为「已持久化」。会话文件里于是留下 `assistant(tool_use)` 后面直接跟着一条用户消息的形态。这个缺陷一直隐藏着 —— 内存中的修复保护了实时会话,`load()` 时的修复保护了重启 —— 直到一次跳过修复的重放(`/tree`)把会话记录发给 provider,后者以 400 拒绝(`tool_use` id 之后没有紧跟 `tool_result` 块)。

[原文]
This is the shape Pi uses. In Pi, an aborted tool call's error result is
created inside the same loop iteration as the call
(`packages/agent/src/agent-loop.ts`), so adjacency is structural, never
repaired after the fact (though Pi breaks the batch on abort, so later calls
in a multi-tool message get no result — Tau's repair sweep covers that case).
Persistence lives in the harness's event handler (`handleAgentEvent` in
`packages/agent/src/harness/agent-harness.ts`), which
persists on every `message_end` through an ordered append queue — a
subscriber, not a consumer, so UI teardown cannot lose writes, and no count
watermark exists anywhere. Tau already emitted Pi-compatible events; this
change moves persistence to the same side of the event stream.

[译文]
这正是 Pi 采用的形态。在 Pi 中,被中止工具调用的错误结果与调用本身在同一次循环迭代内创建(`packages/agent/src/agent-loop.ts`),因此相邻性是结构性的,从不事后修复(不过 Pi 在中止时会打断批次,所以多工具消息中更靠后的调用不会得到结果 —— Tau 的修复清扫覆盖了这种情况)。持久化位于 harness 的事件处理器中(`packages/agent/src/harness/agent-harness.ts` 里的 `handleAgentEvent`),它通过一个有序追加队列在每次 `message_end` 时持久化 —— 是订阅者,而不是消费者,因此 UI 拆卸不会丢失写入,任何地方都不存在计数高水位。Tau 本就在发出与 Pi 兼容的事件;本次变更把持久化挪到了事件流的同一侧。

## 架构(Architecture)

[原文]
- `tau_agent.harness` stays portable: dangling-call repairs now run inside
  `_run` and flow through events — at run start as normal
  `message_start`/`message_end` after canonical `agent_start`/`turn_start`, and
  during cancelled cleanup as notify-only
  pushes wrapped in `suppress(Exception)` so a listener failure cannot mask
  the in-flight `CancelledError`.
- `tau_coding.session` owns persistence as a harness subscriber. The listener
  is attached first — before the extension event fan-out — in every path:
  construction, load (re-attached after the load-time repair rebuilds the
  harness), and `_adopt_replacement` on resume/`/new` (the replacement's own
  listener is detached so writes advance the outer session's parent pointers).
- `message_end` remains the durable-message boundary. A message whose
  `message_end` never fired is not persisted; an abandoned first prompt still
  leaves no durable trace and does not index the session.
- A reconcile backstop in the `finally` of `prompt()`/`continue_()` closes the
  run generator and retries only messages whose `message_end` fired but whose
  write failed. It is keyed on message identity, never counts: the loop emits
  an assistant's `message_end` before appending it to the transcript, so
  count-based sweeps can double-write. Each pending write retains one stable
  message entry id; a retry reads durable ids and skips an entry whose append
  reached disk before raising. Only retries pay that read — a first attempt
  mints an id that cannot already be on disk. Repeated failures are logged
  without masking cancellation, retained,
  and flushed before the next prompt, continuation, compaction, or contextual
  terminal command.

[译文]
- `tau_agent.harness` 保持可移植:悬空调用的修复现在在 `_run` 内部运行并经由事件流动 —— 在运行开始时作为规范的 `agent_start`/`turn_start` 之后的普通 `message_start`/`message_end`;在取消清理期间则作为仅通知的推送,并包裹在 `suppress(Exception)` 中,使监听器失败无法掩盖正在进行的 `CancelledError`。
- `tau_coding.session` 作为 harness 订阅者持有持久化。在每条路径上,监听器都最先挂载 —— 早于扩展事件扇出:构造时、load 时(在加载期修复重建 harness 之后重新挂载),以及 resume/`/new` 时的 `_adopt_replacement`(替换会话自己的监听器会被摘除,使写入推进外层会话的父指针)。
- `message_end` 仍是持久化消息边界。`message_end` 从未触发的消息不会被持久化;被放弃的首个提示仍不会留下持久痕迹,也不会为会话建立索引。
- `prompt()`/`continue_()` 的 `finally` 中有一道对账兜底:关闭运行生成器,并只重试那些 `message_end` 已触发但写入失败的消息。它以消息身份为键,绝不用计数:循环会先发出 assistant 的 `message_end`,再把它追加到会话记录,因此基于计数的清扫可能重复写入。每个待处理写入保留一个稳定的消息条目 id;重试会读取持久化 id,并跳过「追加已到达磁盘后才抛错」的条目。只有重试才付出这次读取代价 —— 首次尝试铸造的 id 不可能已经在磁盘上。重复失败会被记录(但不掩盖取消)、保留下来,并在下一次提示、继续、压缩或带上下文的终端命令之前被冲刷。

[原文]
Older files are repaired by the compatibility layer described in
`dev-notes/tool-history-recovery.md`. It validates active history on load and
`/tree`, writes a provider-safe append-only branch with a durable diagnostic,
and leaves the original entries intact. The agent loop applies the same repair
in memory as a final provider-request backstop.

[译文]
较旧的文件由 `dev-notes/tool-history-recovery.md` 中描述的兼容层修复。它在加载与 `/tree` 时校验活动历史,写入一个 provider 安全的只追加分支以及一条持久化诊断,并保持原始条目不被打动。Agent 循环在内存中应用同样的修复,作为 provider 请求的最终兜底。

## 如何测试(How to test)

```bash
uv run pytest tests/test_agent_harness.py tests/test_coding_session.py tests/test_extensions.py
```

[原文]
Key regression tests:

[译文]
关键回归测试:

[原文]
- `test_cancelled_prompt_teardown_persists_interrupted_tool_result` replays the
  TUI interrupt exactly (`session.cancel()` then worker cancel, no await
  between) and asserts the session file holds the synthetic result adjacent to
  its tool call.
- `test_cancelled_run_notifies_listeners_of_interrupted_tool_repair` and
  `test_listener_error_during_teardown_does_not_mask_cancellation` pin the
  harness contract; `test_entry_path_repair_is_pushed_to_listeners` also pins
  canonical run event ordering.
- `test_message_persistence_retry_is_idempotent` injects failures before and
  after the single message append, plus during refresh, and verifies retry
  leaves exactly one message and no leaf pointer. The next-prompt test verifies a write
  that fails twice is retained and flushed before provider context is built.
- `test_session_resumes_indexed_session` asserts each message persists exactly
  once after resume (guards the listener detach in `_adopt_replacement`).

[译文]
- `test_cancelled_prompt_teardown_persists_interrupted_tool_result` 精确重放 TUI 中断(`session.cancel()` 随后取消 worker,中间不 await),并断言会话文件中合成的结果紧邻其工具调用。
- `test_cancelled_run_notifies_listeners_of_interrupted_tool_repair` 与 `test_listener_error_during_teardown_does_not_mask_cancellation` 锁定 harness 契约;`test_entry_path_repair_is_pushed_to_listeners` 还锁定规范的运行事件顺序。
- `test_message_persistence_retry_is_idempotent` 在单次消息追加之前、之后以及刷新期间注入失败,并验证重试后只留下一条消息、也没有 leaf 指针。下一条提示的测试验证「连续失败两次的写入」会被保留,并在构建 provider 上下文之前冲刷。
- `test_session_resumes_indexed_session` 断言恢复之后每条消息只持久化一次(守护 `_adopt_replacement` 中的监听器摘除)。
