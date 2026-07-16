---
title: tau_agent · 执行核心
description: loop.py 纯循环 / harness.py 有状态大脑
---

## `tau_agent/loop.py` — 纯 agent 循环

**`run_agent_loop(*, provider, model, system, messages, tools, max_turns, signal, get_steering_messages, get_follow_up_messages, get_queue_update) -> AsyncIterator[AgentEvent]`**

这是整座塔的算法核心。它是一个**异步生成器**：调用方边迭代边拿到 `AgentEvent`，
并且可以在运行途中通过三个回调注入消息，而**不必打断流**。

### 主循环逻辑

1. 先 `yield AgentStartEvent()`；当 `max_turns is not None and max_turns < 1`
   时直接报错收尾（`max_turns is None` 表示不限制轮数，不会走此分支）。
2. 把 `tools` 编成 `tool_by_name` 字典；`turn` 从 1 开始。
3. `while max_turns is None or turn <= max_turns`：
   - 每轮开头检查 `signal.is_cancelled()`，已取消则发可恢复 `ErrorEvent` 并 `break`。
   - `yield TurnStartEvent(turn=turn)`。
   - **`async for provider_event in provider.stream_response(...)`**：逐条消费
     Part 1a 的 `ProviderEvent`，**翻译**成 agent 事件：
     - `ProviderResponseStartEvent` → `MessageStartEvent()`
     - `ProviderTextDeltaEvent` → `MessageDeltaEvent`
     - `ProviderThinkingDeltaEvent` → `ThinkingDeltaEvent`
     - `ProviderRetryEvent` → `RetryEvent`（字段照搬）
     - `ProviderResponseEndEvent` → 取出 `assistant_message`，`messages.append`
       它（**循环直接修改调用方拥有的 transcript 列表**），`yield MessageEndEvent`
     - `ProviderErrorEvent` → 标记 `saw_provider_error`，`yield ErrorEvent(recoverable=False)`
   - 若 `assistant_message is None`（流没产出助手消息）：处理取消/错误收尾。
   - 若助手**没有 tool_calls**：`yield TurnEndEvent`；先排空 steering 队列，再排空
     follow_up 队列（各自通过 `_drain_queued_messages`），有则 `turn += 1` 继续，否则
     `break`（模型认为任务完成）。
   - 若有 tool_calls：`async for tool_event in _execute_tool_calls(...)` 执行工具并
     yield 事件；`yield TurnEndEvent`；再排空 steering 队列；`turn += 1`。
4. 若因 `max_turns` 耗尽退出 `while`：`yield` 可恢复 `ErrorEvent`。
5. 最后 `yield AgentEndEvent()`。

> 注意一个精妙处：transcript 列表由**调用方（harness）拥有**，loop 只往里 append。
> 这让 loop 保持"无状态"，而未来的 harness 可以拥有 transcript 状态——这正是
> Part 2a 文档里那句"keeps the loop stateless"的含义。

### 排队消息：`_drain_queued_messages`

`get_messages()` 取到队列里的消息 → `messages.extend(...)` → 为每条发
`MessageStartEvent` + `MessageEndEvent` → 若有 `get_queue_update` 再补一个
`QueueUpdateEvent`。steering（运行中插入）优先于 follow_up（运行将停时插入）。

### 工具执行：`_execute_tool_calls` / `_execute_tool` / `_run_tool`

- **`_execute_tool_calls(tool_calls, tool_by_name, messages, signal)`**：
  对每一个 `tool_call`：
  - 若已取消，把剩余所有 tool call 都补一个 `_cancelled_tool_result` 并结束；
  - `yield ToolExecutionStartEvent`；
  - 找不到工具名 → `_unknown_tool_result`；
  - 否则 `async for item in _execute_tool(...)`：进度更新（`ToolExecutionUpdateEvent`）
    直接 yield，最终结果（`AgentToolResult`）暂存；
  - `messages.append(_tool_result_message(result))`，`yield ToolExecutionEndEvent`。
- **`_execute_tool(tool, tool_call, signal)`**：把工具的"进度回调"桥接成本异步流。
  关键实现：
  - 建一个无界 `asyncio.Queue`；`on_update` 同步回调里 `queue.put_nowait(
    ToolExecutionUpdateEvent(...))`。
  - `task = asyncio.ensure_future(_run_tool(...))` 在后台跑工具；主协程用
    `asyncio.wait({task, getter}, FIRST_COMPLETED)` 在"工具结束"和"有更新"之间竞速：
    - getter 先完成 → yield 该更新（getter 已安全持有它）；
    - task 先完成 → `getter.cancel()`（此时 getter 还没 dequeue 任何东西，所以取消
      不会丢掉更新），随后排空队列尾部更新，`yield task.result()`。
  - `finally` 保证即使生成器被中途关闭（`GeneratorExit`）也 `task.cancel()` 并等待，
    **绝不遗留工具任务**。始终以恰好一个 `AgentToolResult` 收尾（即便工具报错/取消）。
- **`_run_tool`**：`try: result = await tool.execute(...)`，`except Exception` 把异常
  包成 `ok=False` 的 `AgentToolResult`（**工具是隔离边界，异常不向上冒泡**）；
  若结果的 `tool_call_id` 不符则 `model_copy` 修正。
- **`_unknown_tool_result` / `_cancelled_tool_result`**：构造对应的失败结果。
- **`_tool_result_message(result)`**：把 `AgentToolResult` 转成 transcript 用的
  `ToolResultMessage`；失败时把 `error` 拼进 `content`（`error not in content` 时），
  无 content 且有 data 时以 `str(data)` 兜底。

> 这段"进度桥接"代码是 loop.py 最精巧的部分，也是 Rust `tau-rs` 用 channel +
> `tokio::select!` 实现 `ToolExecutionUpdateEvent` 流时所对应的逻辑。

---

## `tau_agent/harness.py` — 有状态 agent 大脑

`AgentHarness` 在纯循环之上叠加：**拥有 transcript、管理运行态、支持消息排队、
对外广播事件、可被取消**。

### 辅助类型

- **`QueuedMessages`**（frozen dataclass）：排队消息快照，`steering`/`follow_up`
  两个 tuple，带 `count` 属性。
- **`AgentHarnessConfig`**（dataclass）：`provider`/`model`/`system`/`tools`/
  `max_turns`/`queue_mode`（`"one_at_a_time"` 或 `"all"`）。
- **`SimpleCancellationToken`**：`AgentHarness` 与 loop 共用的具体取消令牌，
  `cancel()`/`is_cancelled()`。
- 模块级：`EventListener = Callable[[AgentEvent], Awaitable[None] | None]`、
  `QueueMode = Literal["one_at_a_time", "all"]`。

### `AgentHarness`

构造：`config` + 可选初始 `messages`（恢复会话时用）。内部状态：`_messages`、
`_listeners`、`_current_signal`、`_running`、`_steering_queue`/`_follow_up_queue`
（双端队列）。

**只读属性**：`messages`（不可变快照）、`config`、`is_running`、`queued_messages`、
`pending_message_count`、`has_queued_messages`。

**transcript 操作**：`append_message`（恢复用）、`replace_messages`（上下文重建后用）、
`subscribe(listener) -> unsubscribe`（事件订阅，返回退订回调）。

**取消与排队**：
- `cancel()`：取消当前运行的 `_current_signal`。
- `steer(content)`/`steer_message(msg)`：把消息压入 steering 队列（运行中插入），
  返回 `QueueUpdateEvent`。
- `follow_up(content)`/`follow_up_message(msg)`：压入 follow_up 队列（运行将停时插入）。
- `clear_queues()`、`pop_latest_follow_up()`、`pop_latest_steering()`、
  `queue_update_event()`（把当前队列内容转成 `QueueUpdateEvent`）。

**运行入口**：
- **`prompt(content, *, custom_type, details)`**：先 `_ensure_not_running()`，再
  `_append_interrupted_tool_results()`，置 `_running=True`，append 一个
  `UserMessage`（可带 `custom_type`/`details` 展示元数据），调用 `_run`。
- **`continue_()`**：不 append 新用户消息，直接 `_run()`——用于从持久化状态恢复后续跑。
- **`_run(prompt_message=None)`**：创建 `SimpleCancellationToken` 作 `signal`，调用
  `run_agent_loop`（传入三个 drain 回调与一个 `queue_update_event`）；对每个事件
  `_notify(listener)` 后 yield。特殊处理：当事件流到达首个 `turn_start` 时，补发
  用户消息的 `MessageStartEvent` + `MessageEndEvent`（因为 `UserMessage` 是 prompt
  时单独 append 的，需要在事件流里也体现出来）。`finally` 里：若被取消则再修一次
  中断工具结果，清空 `_current_signal`，`_running=False`。

**事件广播**：`_notify(event)` 遍历 `_listeners`，`listener` 若是 awaitable 就 `await`。
这是扩展/UI 观测 `AgentEvent` 的钩子（对应 `tau_coding` 里扩展 attach 到
`session._harness.subscribe`）。

**队列排空策略**：`_drain_queue` 按 `queue_mode`——
`"all"` 一次取光，`"one_at_a_time"` 只取队首一个（`popleft`）。steering/follow_up
分别由 `_drain_steering_messages`/`_drain_follow_up_messages` 提供，正是传给 loop 的
`get_*` 回调。

**中断修复**：`append_interrupted_tool_results()` / `_append_interrupted_tool_results()`。
原因：OpenAI 兼容 provider 会拒绝"助手调了工具但没有对应工具结果"的 transcript。若
UI 在工具还在跑时取消 worker，正常循环可能来不及补取消结果——所以**下次请求模型前**
自动扫描：对每个 `AssistantMessage` 里没有匹配 `ToolResultMessage` 的 `tool_call`，
补一条 `ok=False`、`content="Tool call interrupted by user"` 的 `ToolResultMessage`。
`prompt`/`continue_` 一开始就调它，保证 transcript 永远可被模型接受。

> 这个修复逻辑对应 Rust `tau-rs` 的 `harness` 在发起新一轮前重放/补全中断的工具结果
> 的部分。

---

## 本部分小结

- `loop.py` 是**纯算法**：请求模型 → 翻译事件 → 没有 tool call 就停（或排空队列
  续跑）→ 有 tool call 就执行并回灌结果 → 循环。`max_turns` 给循环封顶，`signal`
  允许中途取消，进度回调被桥接成事件流。
- `harness.py` 是**有状态驱动器**：持有 transcript、管理排队/订阅/取消、修复中断、
  把 `prompt`/`continue_` 暴露给上层 `tau_coding`。

下一任务（Part 2c）看 `tau_agent/session/`：如何把 transcript 持久化成"可分支的
JSONL 树"，以及从磁盘重建回 `harness` 需要的状态。

<!-- NAV -->
[← tau_agent · 数据模型]({{< relref "./agent-models.md" >}})
[↑ 总览]({{< relref "./source-walkthrough.md" >}})
[→ tau_agent · 会话持久化树]({{< relref "./agent-session-tree.md" >}})
