# Pi 风格事件迁移审计 / Pi-like Event Migration Audit

[原文]
**Worktree:** `~/.agents/worktrees/tau/pi-event-extension-parity`
**Branch:** `feat/pi-event-extension-parity`
**Date:** 2026-07-16

[译文]
**Worktree:** `~/.agents/worktrees/tau/pi-event-extension-parity`
**分支:** `feat/pi-event-extension-parity`
**日期:** 2026-07-16

## 执行摘要(Executive summary)

[原文]
The `tau_ai` and `tau_agent` event models are substantially cut over to the Pi-like shape. However, the migration is incomplete and inconsistent in four main areas:

[译文]
`tau_ai` 与 `tau_agent` 的事件模型已在很大程度上切换到 Pi 风格形态。然而,迁移仍不完整,并在四个主要方面存在不一致:

[原文]
1. **`tau_ai`** still uses transitional `_provider_events.py` internally; public Pi events are produced only through `canonicalize_provider_stream()`.
2. **`tau_agent`** no longer emits several old events (`retry`, `queue_update`, `message_delta`, `thinking_delta`, `error`), but the replacement semantics are only partially wired.
3. **`tau_coding`** defines new session-level events (`agent_settled`, `auto_retry_start/end`, `compaction_start/end`, etc.) but most are never actually emitted.
4. The **extension API** still advertises the old Tau-v1 event names and handler signatures, even though the core no longer produces those events.

[译文]
1. **`tau_ai`** 内部仍在使用过渡期的 `_provider_events.py`;公开的 Pi 事件只通过 `canonicalize_provider_stream()` 产生。
2. **`tau_agent`** 不再发出若干旧事件(`retry`、`queue_update`、`message_delta`、`thinking_delta`、`error`),但替代语义只接通了一部分。
3. **`tau_coding`** 定义了新的会话级事件(`agent_settled`、`auto_retry_start/end`、`compaction_start/end` 等),但其中大多数从未真正发出。
4. **扩展 API** 仍在宣传旧的 Tau-v1 事件名与处理器签名,尽管内核已不再产生那些事件。

[原文]
In addition, the circular dependency between `tau_agent` and `tau_ai` that PR #332 / issue #317 addressed has reappeared.

[译文]
此外,PR #332 / issue #317 所解决的 `tau_agent` 与 `tau_ai` 之间的循环依赖重新出现了。

---

## 第 1 层:`tau_ai`(1. `tau_ai` layer)

### 变更内容(What changed)

[原文]
- New canonical public events are defined in `src/tau_ai/events.py`:
  - `AssistantStartEvent`, `AssistantDoneEvent`, `AssistantErrorEvent`
  - `TextStartEvent`, `TextDeltaEvent`, `TextEndEvent`
  - `ThinkingStartEvent`, `ThinkingDeltaEvent`, `ThinkingEndEvent`
  - `ToolCallStartEvent`, `ToolCallDeltaEvent`, `ToolCallEndEvent`
- The provider protocol now returns `AsyncIterator[AssistantMessageEvent]` (`src/tau_ai/provider.py`).

[译文]
- 新的规范公开事件定义在 `src/tau_ai/events.py`:
  - `AssistantStartEvent`、`AssistantDoneEvent`、`AssistantErrorEvent`
  - `TextStartEvent`、`TextDeltaEvent`、`TextEndEvent`
  - `ThinkingStartEvent`、`ThinkingDeltaEvent`、`ThinkingEndEvent`
  - `ToolCallStartEvent`、`ToolCallDeltaEvent`、`ToolCallEndEvent`
- Provider 协议现在返回 `AsyncIterator[AssistantMessageEvent]`(`src/tau_ai/provider.py`)。

### 不一致之处(Inconsistencies)

[原文]
- **Transitional internal protocol still exists.** Every provider implementation (`anthropic.py`, `google.py`, `mistral.py`, `openai_compatible.py`, `openai_codex.py`) still emits the old `ProviderResponseStartEvent`, `ProviderTextDeltaEvent`, `ProviderToolCallEvent`, `ProviderResponseEndEvent`, etc. from `src/tau_ai/_provider_events.py`. These are then adapted by `canonicalize_provider_stream()` in `src/tau_ai/stream.py`.
- **No true streaming tool-call deltas.** The parsers emit a single completed `ProviderToolCallEvent`. `canonicalize_provider_stream()` maps this to `ToolCallStartEvent` immediately followed by `ToolCallEndEvent` with no `ToolCallDeltaEvent` in between. Pi expects tool-call arguments to stream via `toolcall_delta`.
- **Tool-call content is not inserted at the correct content index.** In `stream.py:112-120`, the start event is yielded before appending the block, so the `partial` snapshot in `ToolCallStartEvent` does not yet contain the tool call.
- **Retry events are swallowed.** `canonicalize_provider_stream()` drops `ProviderRetryEvent` (`stream.py:71-73`). Pi exposes retry at the coding-session layer, but Tau currently loses it entirely between `tau_ai` and `tau_coding`.
- **`AssistantErrorEvent` vs `AssistantDoneEvent` ambiguity.** `AssistantDoneEvent` carries `reason: StopReason`, and `AssistantErrorEvent` also carries `reason`. Consumers must check both event type and message `stop_reason` to detect failure.
- **Provider final message reconstruction is fragile.** `stream.py:145-158` rebuilds `final.content` by taking streamed thinking, final text, and final tools. This can reorder content relative to the provider's actual interleaving.

[译文]
- **过渡期的内部协议仍然存在。** 每个 provider 实现(`anthropic.py`、`google.py`、`mistral.py`、`openai_compatible.py`、`openai_codex.py`)仍在发出旧的 `ProviderResponseStartEvent`、`ProviderTextDeltaEvent`、`ProviderToolCallEvent`、`ProviderResponseEndEvent` 等,来源为 `src/tau_ai/_provider_events.py`。这些事件随后由 `src/tau_ai/stream.py` 中的 `canonicalize_provider_stream()` 适配。
- **没有真正的流式工具调用增量。** 解析器发出的是一次完成的 `ProviderToolCallEvent`。`canonicalize_provider_stream()` 把它映射为紧挨着的 `ToolCallStartEvent` 与 `ToolCallEndEvent`,中间没有 `ToolCallDeltaEvent`。Pi 期望工具调用参数通过 `toolcall_delta` 流式输出。
- **工具调用内容没有插入到正确的 content 索引。** 在 `stream.py:112-120` 中,start 事件在追加块之前就被产出,因此 `ToolCallStartEvent` 中的 `partial` 快照尚未包含该工具调用。
- **重试事件被吞掉。** `canonicalize_provider_stream()` 丢弃了 `ProviderRetryEvent`(`stream.py:71-73`)。Pi 在编码会话层暴露重试,但 Tau 目前在 `tau_ai` 与 `tau_coding` 之间把它完全丢失了。
- **`AssistantErrorEvent` 与 `AssistantDoneEvent` 的歧义。** `AssistantDoneEvent` 携带 `reason: StopReason`,`AssistantErrorEvent` 也携带 `reason`。消费方必须同时检查事件类型与消息的 `stop_reason` 才能检测失败。
- **Provider 最终消息的重建很脆弱。** `stream.py:145-158` 通过取流式 thinking、最终文本与最终工具来重建 `final.content`。这可能让内容顺序与 provider 实际的交错顺序不一致。

---

## 第 2 层:`tau_agent`(2. `tau_agent` layer)

### 变更内容(What changed)

[原文]
- New event model in `src/tau_agent/events.py`:
  - `AgentStartEvent`, `AgentEndEvent`
  - `TurnStartEvent`, `TurnEndEvent`
  - `MessageStartEvent`, `MessageUpdateEvent`, `MessageEndEvent`
  - `ToolExecutionStartEvent`, `ToolExecutionUpdateEvent`, `ToolExecutionEndEvent`
- `MessageDeltaEvent` and `ThinkingDeltaEvent` are gone. Text/thinking deltas now arrive as `MessageUpdateEvent` wrapping a `tau_ai` `TextDeltaEvent`/`ThinkingDeltaEvent`.
- `ErrorEvent` is gone. Errors are terminal `AssistantMessage` objects with `stop_reason == "error"`.
- `RetryEvent` and `QueueUpdateEvent` are removed from `AgentEvent`.

[译文]
- `src/tau_agent/events.py` 中的新事件模型:
  - `AgentStartEvent`、`AgentEndEvent`
  - `TurnStartEvent`、`TurnEndEvent`
  - `MessageStartEvent`、`MessageUpdateEvent`、`MessageEndEvent`
  - `ToolExecutionStartEvent`、`ToolExecutionUpdateEvent`、`ToolExecutionEndEvent`
- `MessageDeltaEvent` 与 `ThinkingDeltaEvent` 已不存在。文本/thinking 增量现在以 `MessageUpdateEvent` 的形式到达,内部包装一个 `tau_ai` 的 `TextDeltaEvent`/`ThinkingDeltaEvent`。
- `ErrorEvent` 已不存在。错误是 `stop_reason == "error"` 的终态 `AssistantMessage` 对象。
- `RetryEvent` 与 `QueueUpdateEvent` 已从 `AgentEvent` 中移除。

### 不一致之处(Inconsistencies)

[原文]
- **`AgentEndEvent` payload does not match Pi.** Pi's `agent_end` carries the generated `messages`. Tau's `AgentEndEvent` currently has no fields (`loop.py:19`, `events.py:19`). The messages are computed but not attached to the event (`loop.py:168` yields `AgentEndEvent()` with no arguments).
- **`TurnEndEvent` payload is incomplete.** It carries `message` and `tool_results`, but Pi's turn end also carries final state such as the authoritative assistant message and tool results. The current dataclass has no `tool_results` field in the definition shown at `events.py:28`, yet the loop constructs `TurnEndEvent(message=assistant, tool_results=tool_results)` (`loop.py:158`). This works only because the model is permissive, but the schema is not explicit.
- **Tool-execution update semantics changed without updating consumers.** `ToolExecutionUpdateEvent` now carries `partial_result: AgentToolResult` (`events.py:60`), but the old field was a `str` message. The TUI adapter uses `.text` (`adapter.py:82`), which happens to work, but this is an implicit contract.
- **Tool-result messages do not emit `message_start`/`message_end`.** In `loop.py:255-260`, a `ToolResultMessage` is appended after `ToolExecutionEndEvent`, but no `MessageStartEvent`/`MessageEndEvent` is yielded for it. Pi emits message lifecycle events for tool results.
- **Cancellation produces no explicit event.** The loop checks `signal.is_cancelled()` inside tool execution but does not emit a dedicated cancellation event; it relies on an error result.
- **Circular dependency reintroduced.** `tau_agent` imports `tau_ai`:
  - `src/tau_agent/loop.py:29-35` imports from `tau_ai.events` and `tau_ai.provider`.
  - `src/tau_agent/events.py:12` imports `AssistantMessageEvent` from `tau_ai.events`.
  - `src/tau_agent/harness.py:22` imports `ModelProvider` from `tau_ai.provider`.

  Meanwhile `tau_ai` imports `tau_agent.messages`, `tau_agent.tools`, `tau_agent.types` in virtually every module. This is the same cycle PR #332 inverted by moving the provider protocol into `tau_agent`.

[译文]
- **`AgentEndEvent` 的载荷与 Pi 不匹配。** Pi 的 `agent_end` 携带生成的 `messages`。Tau 的 `AgentEndEvent` 目前没有任何字段(`loop.py:19`、`events.py:19`)。消息被计算出来了,却没有附加到事件上(`loop.py:168` 产出的是不带参数的 `AgentEndEvent()`)。
- **`TurnEndEvent` 的载荷不完整。** 它携带 `message` 与 `tool_results`,但 Pi 的 turn end 还携带最终状态,例如权威的 assistant 消息与工具结果。当前 dataclass 在 `events.py:28` 展示的定义中没有 `tool_results` 字段,而循环却构造了 `TurnEndEvent(message=assistant, tool_results=tool_results)`(`loop.py:158`)。这只因为模型是宽容的才能工作,但 schema 并不明确。
- **工具执行更新的语义变了,却没有同步更新消费方。** `ToolExecutionUpdateEvent` 现在携带 `partial_result: AgentToolResult`(`events.py:60`),而旧字段是一条 `str` 消息。TUI 适配器使用 `.text`(`adapter.py:82`),恰好能工作,但这是一份隐式契约。
- **工具结果消息不会发出 `message_start`/`message_end`。** 在 `loop.py:255-260` 中,`ToolResultMessage` 在 `ToolExecutionEndEvent` 之后被追加,但没有为它产出 `MessageStartEvent`/`MessageEndEvent`。Pi 会为工具结果发出消息生命周期事件。
- **取消不会产生显式事件。** 循环在工具执行内部检查 `signal.is_cancelled()`,但没有发出专门的取消事件;它依赖一个错误结果。
- **循环依赖重新出现。** `tau_agent` 导入了 `tau_ai`:
  - `src/tau_agent/loop.py:29-35` 从 `tau_ai.events` 与 `tau_ai.provider` 导入。
  - `src/tau_agent/events.py:12` 从 `tau_ai.events` 导入 `AssistantMessageEvent`。
  - `src/tau_agent/harness.py:22` 从 `tau_ai.provider` 导入 `ModelProvider`。

  与此同时,`tau_ai` 几乎每个模块都导入 `tau_agent.messages`、`tau_agent.tools`、`tau_agent.types`。这与 PR #332 通过把 provider 协议移入 `tau_agent` 所反转的是同一个循环。

---

## 第 3 层:`tau_coding`(3. `tau_coding` layer)

### 变更内容(What changed)

[原文]
- New `src/tau_coding/events.py` defines session-level events:
  - `AgentSettledEvent`
  - `QueueUpdateEvent`
  - `CompactionStartEvent`, `CompactionEndEvent`
  - `EntryAppendedEvent`
  - `SessionInfoChangedEvent`
  - `ThinkingLevelChangedEvent`
  - `AutoRetryStartEvent`, `AutoRetryEndEvent`
- `CodingSessionEvent = AgentEvent | SessionOwnEvent`.

[译文]
- 新增的 `src/tau_coding/events.py` 定义了会话级事件:
  - `AgentSettledEvent`
  - `QueueUpdateEvent`
  - `CompactionStartEvent`、`CompactionEndEvent`
  - `EntryAppendedEvent`
  - `SessionInfoChangedEvent`
  - `ThinkingLevelChangedEvent`
  - `AutoRetryStartEvent`、`AutoRetryEndEvent`
- `CodingSessionEvent = AgentEvent | SessionOwnEvent`。

### 不一致之处(Inconsistencies)

[原文]
- **`AgentSettledEvent` is defined but never emitted.** Searching `src/tau_coding/session.py` finds no `AgentSettledEvent(...)` yield. The TUI adapter handles it (`adapter.py:34-37`) but falls back to `AgentEndEvent` because it never arrives.
- **`AutoRetryStartEvent` / `AutoRetryEndEvent` are never emitted.** The overflow-retry path in `session.py:1492-1518` re-runs the harness but does not emit retry lifecycle events.
- **`CompactionStartEvent` / `CompactionEndEvent` are never emitted.** Compaction runs in `_append_compaction` (`session.py:1903-1925`) and `_try_overflow_compact` but yield no events.
- **`EntryAppendedEvent` is never emitted.** Session entries are appended without streaming a persistence event.
- **`SessionInfoChangedEvent` and `ThinkingLevelChangedEvent` are never emitted.** Model/thinking changes update persisted state silently.
- **`QueueUpdateEvent` is not yielded from `prompt()` / `continue_()`.** `session.py:778-783` exposes `queue_update_event()` as a method, and `harness.steer()` / `harness.follow_up()` return `QueuedMessages`, but no `QueueUpdateEvent` is yielded into the stream. The TUI adapter imports `QueueUpdateEvent` and handles it, but the session never produces it. (Steering during a run currently returns early with the raw `QueuedMessages` object, not an event — `session.py:1444-1448`.)
- **`SessionAgentEndEvent` duplicates `AgentEndEvent`.** `events.py:14` defines a session-level `agent_end` event with `will_retry`, but the agent layer already emits `AgentEndEvent`. The coding stream could carry two different `agent_end` shapes.
- **`CodingSession.prompt()` and `continue_()` are typed as `AsyncIterator[AgentEvent]`** (`session.py:1412`, `1529`) rather than `AsyncIterator[CodingSessionEvent]`, even though the goal is to expose session-level events.

[译文]
- **`AgentSettledEvent` 已定义却从未发出。** 在 `src/tau_coding/session.py` 中搜索,找不到任何 `AgentSettledEvent(...)` 的产出。TUI 适配器会处理它(`adapter.py:34-37`),但由于它从不到达,只能回退到 `AgentEndEvent`。
- **`AutoRetryStartEvent` / `AutoRetryEndEvent` 从未发出。** `session.py:1492-1518` 中的溢出重试路径会重跑 harness,但不发出重试生命周期事件。
- **`CompactionStartEvent` / `CompactionEndEvent` 从未发出。** 压缩在 `_append_compaction`(`session.py:1903-1925`)与 `_try_overflow_compact` 中运行,但不产出任何事件。
- **`EntryAppendedEvent` 从未发出。** 会话条目被追加时不会流式发出持久化事件。
- **`SessionInfoChangedEvent` 与 `ThinkingLevelChangedEvent` 从未发出。** 模型/thinking 变更静默地更新持久化状态。
- **`QueueUpdateEvent` 不会从 `prompt()` / `continue_()` 中产出。** `session.py:778-783` 把 `queue_update_event()` 暴露为一个方法,`harness.steer()` / `harness.follow_up()` 返回 `QueuedMessages`,但没有任何 `QueueUpdateEvent` 被产出到流中。TUI 适配器导入并处理 `QueueUpdateEvent`,但会话从不产生它。(运行期间的插话目前会提前返回原始的 `QueuedMessages` 对象,而不是事件 —— `session.py:1444-1448`。)
- **`SessionAgentEndEvent` 与 `AgentEndEvent` 重复。** `events.py:14` 定义了一个带 `will_retry` 的会话级 `agent_end` 事件,而 agent 层已经发出 `AgentEndEvent`。编码流可能携带两种不同的 `agent_end` 形态。
- **`CodingSession.prompt()` 与 `continue_()` 的类型标注是 `AsyncIterator[AgentEvent]`**(`session.py:1412`、`1529`),而不是 `AsyncIterator[CodingSessionEvent]`,尽管目标正是暴露会话级事件。

---

## 第 4 层:扩展 API(4. Extension API)

### 当前状态(Current state)

[原文]
`src/tau_coding/extensions/api.py:22-39` still advertises the old Tau-v1 observation set:

[译文]
`src/tau_coding/extensions/api.py:22-39` 仍在宣传旧的 Tau-v1 观察事件集合:

```python
AGENT_EVENT_TYPES = {
    "agent_start", "agent_end", "turn_start", "turn_end",
    "retry",          # no longer emitted by tau_agent
    "queue_update",   # no longer emitted by tau_agent
    "message_start", "message_delta", "thinking_delta", "message_end",
    "tool_execution_start", "tool_execution_update", "tool_execution_end",
    "error",          # no longer emitted by tau_agent
}
```

### 不一致之处(Inconsistencies)

[原文]
- **`retry`, `message_delta`, `thinking_delta`, `error` are in the allow-list but are never produced.** Subscribing to them will silently never fire.
- **`message_update` is missing**, even though it is the only way the agent layer now streams text/thinking/tool deltas.
- **Session-level events are missing** from `AGENT_EVENT_TYPES`: `agent_settled`, `compaction_start`, `compaction_end`, `auto_retry_start`, `auto_retry_end`, `entry_appended`, `session_info_changed`, `thinking_level_changed`.
- **Handler signature is still one-argument.** `ExtensionHandler = Callable[[object], object | Awaitable[object]]` (`api.py:404`). The planned Pi-like API is `handler(event, context)`, but handlers are invoked as `handler(event)` (`runtime.py:812`, `819`).
- **`ToolCallHookEvent` / `ToolResultHookEvent` use the new `AgentToolResult` but expose old-shaped fields implicitly.** `ToolResultHookResult` still returns `content: str | None`, `ok: bool | None`, `details: dict | None` (`api.py:399-401`), which assumes the old result envelope. The runtime must convert this to the new `AgentToolResult` shape.
- **`InputEvent` still has the old `streaming_behavior` string** rather than a typed enum, and handlers are invoked without context.
- **`ExtensionCommandHandler` is sync-only** (`api.py:407`), whereas the Pi-like plan calls for async command handlers.

[译文]
- **`retry`、`message_delta`、`thinking_delta`、`error` 在白名单中,却从不产生。** 订阅它们会静默地永不触发。
- **缺少 `message_update`**,尽管它是 agent 层现在流式输出文本/thinking/工具增量的唯一方式。
- **`AGENT_EVENT_TYPES` 缺少会话级事件**:`agent_settled`、`compaction_start`、`compaction_end`、`auto_retry_start`、`auto_retry_end`、`entry_appended`、`session_info_changed`、`thinking_level_changed`。
- **处理器签名仍是单参数。** `ExtensionHandler = Callable[[object], object | Awaitable[object]]`(`api.py:404`)。计划中的 Pi 风格 API 是 `handler(event, context)`,但处理器实际以 `handler(event)` 被调用(`runtime.py:812`、`819`)。
- **`ToolCallHookEvent` / `ToolResultHookEvent` 使用新的 `AgentToolResult`,却隐式暴露旧形态字段。** `ToolResultHookResult` 仍返回 `content: str | None`、`ok: bool | None`、`details: dict | None`(`api.py:399-401`),它们假定的是旧的结果信封。运行时必须把它转换为新的 `AgentToolResult` 形态。
- **`InputEvent` 仍使用旧的 `streaming_behavior` 字符串**,而不是带类型的枚举,并且处理器被调用时不带上下文。
- **`ExtensionCommandHandler` 只支持同步**(`api.py:407`),而 Pi 风格的计划要求异步命令处理器。

---

## 第 5 层:消息与工具模型不一致(5. Message and tool model inconsistencies)

### `UserMessage`

[原文]
- Old Tau allowed `UserMessage` to carry `custom_type` and `details` for custom messages.
- New `UserMessage` (`messages.py:110-118`) has only `content` and `timestamp`. Custom messages are now a separate `CustomMessage` class.
- Several code paths still assume `UserMessage.custom_type` exists. For example, `TuiState.load_messages()` was recently patched to dispatch by class, but `session.py:1459-1465` constructs a `CustomMessage` when `custom_type` is provided. This split is correct in principle but must be propagated everywhere.

[译文]
- 旧 Tau 允许 `UserMessage` 为自定义消息携带 `custom_type` 与 `details`。
- 新的 `UserMessage`(`messages.py:110-118`)只有 `content` 与 `timestamp`。自定义消息现在是独立的 `CustomMessage` 类。
- 若干代码路径仍假定 `UserMessage.custom_type` 存在。例如,`TuiState.load_messages()` 最近已改为按类分派,但 `session.py:1459-1465` 在提供 `custom_type` 时会构造 `CustomMessage`。这种拆分在原则上是对的,但必须传播到所有地方。

### `AgentToolResult`

[原文]
- Old fields removed: `tool_call_id`, `name`, `ok`, `data`, `error`.
- New fields: `content` (block list), `details`, `added_tool_names`, `terminate`.
- The validator silently drops old fields (`tools.py:40-44`), which masks migration issues rather than failing fast.
- The `ToolResultRenderer` protocol does not accept the tool name (`tools.py:58-60`), but the TUI and extension runtime now need the name to look up the renderer. The runtime currently passes `tool_name` as a separate argument to `render_tool_result()` (`runtime.py:406-410`), while the `AgentTool.render_result` field still conforms to the two-argument protocol. This is a type/model mismatch.

[译文]
- 已移除的旧字段:`tool_call_id`、`name`、`ok`、`data`、`error`。
- 新字段:`content`(块列表)、`details`、`added_tool_names`、`terminate`。
- 校验器会静默丢弃旧字段(`tools.py:40-44`),这掩盖了迁移问题,而不是快速失败。
- `ToolResultRenderer` 协议不接受工具名(`tools.py:58-60`),但 TUI 与扩展运行时现在需要该名称来查找渲染器。运行时目前把 `tool_name` 作为单独参数传给 `render_tool_result()`(`runtime.py:406-410`),而 `AgentTool.render_result` 字段仍符合双参数协议。这是一种类型/模型层面的不匹配。

### `AssistantMessage`

[原文]
- `content` is now a list of blocks. A validator accepts `str` and `tool_calls` for convenience (`messages.py:165-189`), which helps but also hides places that still treat `content` as a string.
- `ToolResultMessage` now has `tool_name` and `tool_call_id` as top-level fields, but the old `name` alias is accepted only during validation. Some consumers still reference `.name`.

[译文]
- `content` 现在是一个块列表。校验器为方便起见接受 `str` 与 `tool_calls`(`messages.py:165-189`),这有帮助,但也掩盖了那些仍把 `content` 当字符串处理的地方。
- `ToolResultMessage` 现在把 `tool_name` 与 `tool_call_id` 作为顶层字段,但旧的 `name` 别名只在校验期间被接受。一些消费方仍在引用 `.name`。

---

## 第 6 层:TUI 与前端不一致(6. TUI and frontend inconsistencies)

### `TuiEventAdapter`

[原文]
- Handles `AgentStartEvent`, `AgentEndEvent`, `agent_settled`, `QueueUpdateEvent`, `MessageStartEvent`, `MessageUpdateEvent`, `MessageEndEvent`, tool events, and `AutoRetryStartEvent`.
- It now flushes and clears `state.running` on `AgentEndEvent` (`adapter.py:30-33`) because `AgentSettledEvent` is never emitted. This is a workaround, not the intended design.

[译文]
- 处理 `AgentStartEvent`、`AgentEndEvent`、`agent_settled`、`QueueUpdateEvent`、`MessageStartEvent`、`MessageUpdateEvent`、`MessageEndEvent`、工具事件以及 `AutoRetryStartEvent`。
- 它现在在 `AgentEndEvent` 上冲刷并清除 `state.running`(`adapter.py:30-33`),因为 `AgentSettledEvent` 从未发出。这是一种绕行方案,而不是原本的设计。

### `TuiState`

[原文]
- `load_messages()` was recently patched to dispatch by message class (`state.py`), which fixes the `UserMessage.custom_type` crash.
- `record_tool_result()` now takes `tool_name` separately, matching the new result model.

[译文]
- `load_messages()` 最近已改为按消息类分派(`state.py`),修复了 `UserMessage.custom_type` 导致的崩溃。
- `record_tool_result()` 现在单独接收 `tool_name`,与新结果模型一致。

### 遗留问题(Remaining issues)

[原文]
- The adapter does not handle `CompactionStartEvent`, `CompactionEndEvent`, `AutoRetryEndEvent`, `SessionInfoChangedEvent`, or `ThinkingLevelChangedEvent`.
- `MessageStartEvent` sets `state.assistant_buffer = event.message.text` (`adapter.py:42-43`). For an empty assistant message this is fine, but for tool-call-only assistant messages it leaves the buffer empty and the subsequent tool call is rendered without finishing any assistant text.
- `MessageUpdateEvent` handling only recognizes `TextDeltaEvent` and `ThinkingDeltaEvent`. It does not handle `ToolCallStartEvent`/`ToolCallDeltaEvent`/`ToolCallEndEvent` inside `message_update`, so the TUI relies on `MessageEndEvent` to discover tool calls.

[译文]
- 适配器不处理 `CompactionStartEvent`、`CompactionEndEvent`、`AutoRetryEndEvent`、`SessionInfoChangedEvent` 或 `ThinkingLevelChangedEvent`。
- `MessageStartEvent` 会设置 `state.assistant_buffer = event.message.text`(`adapter.py:42-43`)。对于空的 assistant 消息这没问题,但对于仅含工具调用的 assistant 消息,它会让缓冲区为空,随后的工具调用会在没有任何 assistant 文本收尾的情况下被渲染。
- `MessageUpdateEvent` 的处理只识别 `TextDeltaEvent` 与 `ThinkingDeltaEvent`。它不处理 `message_update` 内的 `ToolCallStartEvent`/`ToolCallDeltaEvent`/`ToolCallEndEvent`,因此 TUI 依赖 `MessageEndEvent` 来发现工具调用。

---

## 第 7 节:测试套件状态(7. Test suite status)

[原文]
- 11 test modules fail at collection time because they import removed symbols:
  - `ErrorEvent`, `RetryEvent`, `QueueUpdateEvent`, `MessageDeltaEvent`, `ThinkingDeltaEvent` from `tau_agent`
  - `ProviderEvent`, `ProviderErrorEvent`, `ProviderRetryEvent`, etc. in their old forms
- Affected files include `tests/test_agent_harness.py`, `tests/test_agent_loop.py`, `tests/test_agent_types.py`, `tests/test_cli.py`, `tests/test_coding_session.py`, `tests/test_extensions.py`, `tests/test_rendering.py`, `tests/test_tau_ai.py`, `tests/test_tui_adapter.py`, `tests/test_tui_app.py`, `tests/test_tui_components.py`.
- Only 340 tests collect successfully; the rest of the suite is blocked by these import errors.

[译文]
- 11 个测试模块在收集阶段失败,因为它们导入了已移除的符号:
  - 来自 `tau_agent` 的 `ErrorEvent`、`RetryEvent`、`QueueUpdateEvent`、`MessageDeltaEvent`、`ThinkingDeltaEvent`
  - 旧形态的 `ProviderEvent`、`ProviderErrorEvent`、`ProviderRetryEvent` 等
- 受影响的文件包括 `tests/test_agent_harness.py`、`tests/test_agent_loop.py`、`tests/test_agent_types.py`、`tests/test_cli.py`、`tests/test_coding_session.py`、`tests/test_extensions.py`、`tests/test_rendering.py`、`tests/test_tau_ai.py`、`tests/test_tui_adapter.py`、`tests/test_tui_app.py`、`tests/test_tui_components.py`。
- 只有 340 个测试能成功收集;套件的其余部分被这些导入错误阻塞。

---

## 第 8 节:循环依赖回归(8. Circular dependency regression)

[原文]
The intended architecture after PR #332 is:

[译文]
PR #332 之后预期的架构是:

```
tau_agent defines provider protocol and events
tau_ai implements them
tau_coding consumes them
```

[原文]
Current worktree:

[译文]
当前 worktree:

```
tau_agent/loop.py       -> tau_ai.events, tau_ai.provider
tau_agent/events.py     -> tau_ai.events
tau_agent/harness.py    -> tau_ai.provider
tau_ai/*                -> tau_agent.messages, tau_agent.tools, tau_agent.types
```

[原文]
This creates a bidirectional import graph between `tau_agent` and `tau_ai`. Imports currently succeed because `tau_agent.types` and `tau_agent.messages` load before `tau_ai`, but the layering test from PR #332 would fail.

[译文]
这在 `tau_agent` 与 `tau_ai` 之间造成了双向导入图。导入目前能成功,是因为 `tau_agent.types` 与 `tau_agent.messages` 在 `tau_ai` 之前加载,但 PR #332 的分层测试会失败。

---

## 最严重不一致的总结(Summary of the most critical inconsistencies)

[原文]
| Area | Inconsistency | Severity |
|---|---|---|
| `tau_ai` | Providers still emit old `_provider_events` internally | Medium (transitional) |
| `tau_ai` | No real `toolcall_delta` streaming | Medium |
| `tau_agent` | `AgentEndEvent` carries no `messages` | High |
| `tau_agent` | `TurnEndEvent(tool_results=...)` not reflected in schema | High |
| `tau_agent` | Tool-result messages lack `message_start`/`message_end` | Medium |
| `tau_coding` | `AgentSettledEvent` defined but never emitted | High |
| `tau_coding` | `AutoRetry*`, `Compaction*`, `EntryAppended*`, `SessionInfoChanged*`, `ThinkingLevelChanged*` never emitted | High |
| `tau_coding` | `QueueUpdateEvent` not yielded from session stream | High |
| Extensions | `AGENT_EVENT_TYPES` lists events that no longer exist | High |
| Extensions | Handler signature still one-argument | High |
| Architecture | Circular `tau_agent` ↔ `tau_ai` dependency reintroduced | High |
| Tests | 11 test modules fail to import | High |

[译文]
| 领域 | 不一致 | 严重程度 |
|---|---|---|
| `tau_ai` | Provider 内部仍在发出旧的 `_provider_events` | 中(过渡期) |
| `tau_ai` | 没有真正的 `toolcall_delta` 流式输出 | 中 |
| `tau_agent` | `AgentEndEvent` 不携带 `messages` | 高 |
| `tau_agent` | `TurnEndEvent(tool_results=...)` 未反映在 schema 中 | 高 |
| `tau_agent` | 工具结果消息缺少 `message_start`/`message_end` | 中 |
| `tau_coding` | `AgentSettledEvent` 已定义却从未发出 | 高 |
| `tau_coding` | `AutoRetry*`、`Compaction*`、`EntryAppended*`、`SessionInfoChanged*`、`ThinkingLevelChanged*` 从未发出 | 高 |
| `tau_coding` | `QueueUpdateEvent` 未从会话流中产出 | 高 |
| 扩展 | `AGENT_EVENT_TYPES` 列出了已不存在的事件 | 高 |
| 扩展 | 处理器签名仍是单参数 | 高 |
| 架构 | `tau_agent` ↔ `tau_ai` 循环依赖重新出现 | 高 |
| 测试 | 11 个测试模块导入失败 | 高 |

[原文]
The core text-only path works end-to-end, but any path involving session-level lifecycle, retries, compaction, tool-call streaming, or extensions is only partially migrated.

[译文]
核心的纯文本路径可以端到端工作,但任何涉及会话级生命周期、重试、压缩、工具调用流式或扩展的路径都只完成了部分迁移。

## 修复更新(Remediation update)

[原文]
The follow-up implementation addressed several audit findings:

[译文]
后续实现解决了若干审计发现:

[原文]
- Moved the provider contract and canonical assistant events into `tau_agent`, with
  `tau_ai` retaining identity-preserving public re-exports. A layering test now
  prevents `tau_agent -> tau_ai` imports.
- Added focused canonical event-order and tool-result lifecycle tests.
- Preserved streamed block ordering and fixed tool-call start snapshots.
- Added coding-session `agent_end` (`willRetry`) and `agent_settled` events, queue
  updates, and overflow compaction/retry lifecycle events.
- Replaced the extension event allow-list with canonical event names and dispatches
  fresh `(event, context)` handler arguments, including session-owned events.
- Migrated built-in tools, provider payload conversion for session-only messages,
  print frontends, and the hello-tool example to canonical models.
- Verified real text and tool-call streams manually in JSON and text modes.

[译文]
- 把 provider 契约与规范 assistant 事件移入 `tau_agent`,`tau_ai` 保留保持身份不变的公开 re-export。现在有一项分层测试阻止 `tau_agent -> tau_ai` 导入。
- 增加了聚焦的规范事件顺序与工具结果生命周期测试。
- 保留流式内容块顺序,并修复了工具调用 start 快照。
- 增加了编码会话的 `agent_end`(`willRetry`)与 `agent_settled` 事件、队列更新,以及溢出压缩/重试生命周期事件。
- 用规范事件名替换了扩展事件白名单,并分派全新的 `(event, context)` 处理器参数,包括会话自有事件。
- 把内置工具、面向「仅会话消息」的 provider 载荷转换、print 前端与 hello-tool 示例迁移到规范模型。
- 在 JSON 与文本模式下手动验证了真实的文本流与工具调用流。

[原文]
The cutover is now complete at every public boundary:

[译文]
现在每个公开边界都已完成切换:

[原文]
- The full Tau suite passes on canonical models and events; mypy and Ruff are clean.
- Extension handlers consistently receive fresh `(event, context)` arguments, and
  shipped examples plus the published guide use canonical tool definitions/results.
- Persisted Tau-v1 JSONL messages migrate at the storage boundary and rewrite as
  canonical assistant blocks, `toolResult` messages, and dedicated custom messages.
- Runtime models reject removed Tau-v1 fields instead of silently discarding them.
- Print, JSON, TUI, exporters, branch summaries, and provider tests consume one
  protocol.

[译文]
- 完整的 Tau 测试套件在规范模型与事件上通过;mypy 与 Ruff 干净。
- 扩展处理器一致地接收全新的 `(event, context)` 参数,随包示例与已发布指南都使用规范的工具定义/结果。
- 持久化的 Tau-v1 JSONL 消息会在存储边界迁移,并改写为规范 assistant 内容块、`toolResult` 消息与专门的自定义消息。
- 运行时模型会拒绝已移除的 Tau-v1 字段,而不是静默丢弃它们。
- Print、JSON、TUI、导出器、分支摘要与 provider 测试都消费同一套协议。

[原文]
Provider implementations still use `_provider_events.py` plus `stream.py` as a
**private parser-normalization implementation**. This is not an advertised profile:
`ModelProvider`, `tau_ai.events`, and every provider's `stream_response()` expose
only identity-preserving canonical `tau_agent` events. Removing that parser helper
is optional internal simplification, not a release or compatibility blocker.

[译文]
Provider 实现仍把 `_provider_events.py` 加 `stream.py` 用作**私有的解析器归一化实现**。这不是对外宣传的接口形态:`ModelProvider`、`tau_ai.events` 以及每个 provider 的 `stream_response()` 只暴露保持身份不变的规范 `tau_agent` 事件。移除该解析器辅助层属于可选的内部简化,不是发布或兼容性阻塞项。
