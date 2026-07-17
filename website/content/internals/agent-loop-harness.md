---
title: tau_agent · 执行核心
description: loop.py 纯循环 / harness.py 有状态大脑
code_files:
  - tau_agent/loop.py
  - tau_agent/harness.py
---

这一章是整个 Tau 最核心的部分：`loop.py` 实现了"请求模型 → 翻译事件 → 执行工具 → 回灌结果 → 继续"的 **agent loop（代理循环）**——一种让模型反复与环境交互直到任务完成的机制；`harness.py`（**harness，意思是"操纵装置"**）则在纯循环之上叠加了状态管理，让循环能够跨多轮保持对话历史、处理取消和排队消息。把"无状态的算法"和"有状态的大脑"拆开，是为了让循环本身可以脱离任何 UI 或文件系统独立复用——无论是 print 模式、Rich 渲染还是 Textual TUI，都只是套在循环外面的不同"壳"。

## `tau_agent/loop.py` — 纯 agent 循环

**`run_agent_loop(*, provider, model, system, messages, tools, max_turns, signal, get_steering_messages, get_follow_up_messages, get_queue_update) -> AsyncIterator[AgentEvent]`**

这是整座塔的算法核心。它是一个**异步生成器**（async generator）——你可以把它
想象成一个"会逐步吐出结果的函数"：每产生一个事件就 yield 出来，调用方边迭代
边拿到 `AgentEvent`，并且可以在运行途中通过三个回调注入消息，而**不必打断流**。
这种设计之所以重要，是因为 LLM 的流式输出可能持续数秒甚至数分钟，你需要在输出
过程中实时显示进度、执行工具，而不是干等着全部完成。

### 主循环逻辑

1. 先 `yield AgentStartEvent()`；当 `max_turns is not None and max_turns < 1`
   时直接报错收尾（`max_turns is None` 表示不限制轮数，不会走此分支）。
2. 把 `tools` 编成 `tool_by_name` 字典；`turn` 从 1 开始。
3. `while max_turns is None or turn <= max_turns`：
   - 每轮开头检查 `signal.is_cancelled()`（`signal` 是一个 **cancellation token**，
     即取消令牌——外部通过它通知循环"该停了"，循环每次轮询来决定是否退出），已取消则发可恢复
     `ErrorEvent` 并 `break`。
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

源码 (`loop.py:40-169`)——主循环完整骨架（节选关键路径）：

```python
async def run_agent_loop(
    *,
    provider: ModelProvider,
    model: str,
    system: str,
    messages: list[AgentMessage],
    tools: list[AgentTool],
    max_turns: int | None = None,
    signal: CancellationToken | None = None,
    get_steering_messages: Callable[[], Sequence[AgentMessage]] | None = None,
    get_follow_up_messages: Callable[[], Sequence[AgentMessage]] | None = None,
    get_queue_update: Callable[[], QueueUpdateEvent] | None = None,
) -> AsyncIterator[AgentEvent]:
    yield AgentStartEvent()
    tool_by_name = {tool.name: tool for tool in tools}
    turn = 1

    while max_turns is None or turn <= max_turns:
        if signal is not None and signal.is_cancelled():
            yield ErrorEvent(message="Agent run cancelled", recoverable=True)
            break
        yield TurnStartEvent(turn=turn)
        assistant_message: AssistantMessage | None = None
        saw_provider_error = False

        async for provider_event in provider.stream_response(
            model=model, system=system, messages=messages, tools=tools, signal=signal,
        ):
            if isinstance(provider_event, ProviderResponseStartEvent):
                yield MessageStartEvent()
            elif isinstance(provider_event, ProviderTextDeltaEvent):
                yield MessageDeltaEvent(delta=provider_event.delta)
            elif isinstance(provider_event, ProviderThinkingDeltaEvent):
                yield ThinkingDeltaEvent(delta=provider_event.delta)
            elif isinstance(provider_event, ProviderRetryEvent):
                yield RetryEvent(...)
            elif isinstance(provider_event, ProviderResponseEndEvent):
                assistant_message = provider_event.message
                messages.append(assistant_message)
                yield MessageEndEvent(message=assistant_message)
            elif isinstance(provider_event, ProviderErrorEvent):
                saw_provider_error = True
                yield ErrorEvent(message=provider_event.message, recoverable=False, ...)

        if assistant_message is None:
            ...  # 取消/错误收尾
            break

        if not assistant_message.tool_calls:
            yield TurnEndEvent(turn=turn)
            # 排空 steering / follow_up 队列
            queue_events = _drain_queued_messages(messages, get_steering_messages, ...)
            if queue_events:
                for queue_event in queue_events: yield queue_event
                turn += 1; continue
            break  # 模型认为任务完成

        async for tool_event in _execute_tool_calls(
            assistant_message.tool_calls, tool_by_name, messages, signal,
        ):
            yield tool_event

        yield TurnEndEvent(turn=turn)
        for queue_event in _drain_queued_messages(messages, get_steering_messages, ...):
            yield queue_event
        turn += 1

    yield AgentEndEvent()
```
> Design note: transcript 列表由**调用方（harness）拥有**，loop 只往里 append。
> 这是 loop/harness 边界的核心分工。Tau 的设计原则明确 **`AgentHarness = reusable agent brain`** 且 **`The core stays portable`**——`run_agent_loop` 因此被实现为纯 `async` 生成器：它不持有 transcript、不绑定工具、不感知会话文件或终端，所有状态都由调用方注入、就地修改。这样循环本身保持"无状态"，可被任意 harness、测试或嵌入场景复用；而真正有状态的大脑（持有 transcript、运行标志、取消令牌、排队与订阅）由 `AgentHarness` 叠加在循环之上。把"算法"与"状态"拆开，正对应 README 的 agent 拆分原则——可复用的 harness 绝不能依赖终端、文件路径或 Rich 渲染，那些只是包裹 harness 的外层。

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

```python
# loop.py:241 — 用「队列 + 任务」竞速把同步进度回调桥接进异步事件流
queue: asyncio.Queue[ToolExecutionUpdateEvent] = asyncio.Queue()

def on_update(message, data=None):
    queue.put_nowait(ToolExecutionUpdateEvent(tool_call_id=tool_call.id,
                                              message=message, data=data))

task = asyncio.ensure_future(_run_tool(tool, tool_call, signal, on_update))
while not task.done():
    getter = asyncio.ensure_future(queue.get())
    done, _ = await asyncio.wait({task, getter}, return_when=asyncio.FIRST_COMPLETED)
    if getter in done:
        yield getter.result()          # 工具还在跑，先吐进度
    else:
        getter.cancel()                # 工具先结束，取消 getter 不丢更新
        with contextlib.suppress(asyncio.CancelledError):
            await getter
while not queue.empty():               # 排空尾部更新
    yield queue.get_nowait()
yield task.result()                    # 必以恰好一个 AgentToolResult 收尾
```
> Design note: 这段"进度桥接"是 loop.py 最精巧的部分，也是 Rust `tau-rs` 用 channel +
> `tokio::select!` 实现 `ToolExecutionUpdateEvent` 流时所对应的逻辑。把同步的 `on_update`
> 回调桥接进异步事件流，是为了让工具进度以统一的 `AgentEvent` 形式对外广播——前端无论用
> print、Rich 还是 TUI，都从同一条事件流消费进度，无需直接触碰 worker 线程里的执行器。
> "工具进度即事件"正落实了 README 的 "Events make agents teachable" 原则。

---

## `tau_agent/harness.py` — 有状态 agent 大脑

如果说 `loop.py` 是一台没有记忆的机器——每次运行都从外部输入全部状态，运行完就
把结果交给外部；那么 `AgentHarness` 就是在这台机器之上叠加了**记忆**（transcript
对话记录）、**安全开关**（取消令牌）和**消息队列**（steering/follow-up）的完整大脑。
它拥有 transcript、管理运行态、支持消息排队、对外广播事件、可被取消。

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

```python
# harness.py:184 — 入口：防重入 → 修中断 → 追加用户消息 → 跑循环
def prompt(self, content, *, custom_type=None, details=None) -> AsyncIterator[AgentEvent]:
    self._ensure_not_running()
    self._append_interrupted_tool_results()
    self._running = True
    message = UserMessage(content=content, custom_type=custom_type, details=details)
    self._messages.append(message)
    return self._run(prompt_message=message)
```

  `_append_interrupted_tool_results()`，置 `_running=True`，append 一个
  `UserMessage`（可带 `custom_type`/`details` 展示元数据），调用 `_run`。
- **`continue_()`**：不 append 新用户消息，直接 `_run()`——用于从持久化状态恢复后续跑。
- **`_run(prompt_message=None)`**：创建 `SimpleCancellationToken` 作 `signal`，调用
  `run_agent_loop`（传入三个 drain 回调与一个 `queue_update_event`）；对每个事件
  `_notify(listener)` 后 yield。特殊处理：当事件流到达首个 `turn_start` 时，补发
  用户消息的 `MessageStartEvent` + `MessageEndEvent`（因为 `UserMessage` 是 prompt
  时单独 append 的，需要在事件流里也体现出来）。`finally` 里：若被取消则再修一次
  中断工具结果，清空 `_current_signal`，`_running=False`。

```python
# harness.py:244 — 事件广播：同步/异步监听器都支持
async def _notify(self, event):
    for listener in list(self._listeners):
        result = listener(event)
        if isawaitable(result):
            await result
```
**事件广播**：`_notify(event)` 遍历 `_listeners`，`listener` 若是 awaitable 就 `await`。
这是扩展/UI 观测 `AgentEvent` 的钩子（对应 `tau_coding` 里扩展 attach 到
`session._harness.subscribe`）。

**队列排空策略**：`_drain_queue` 按 `queue_mode`——
`"all"` 一次取光，`"one_at_a_time"` 只取队首一个（`popleft`）。steering/follow_up
分别由 `_drain_steering_messages`/`_drain_follow_up_messages` 提供，正是传给 loop 的
`get_*` 回调。

```python
# harness.py:280 — 中断修复：补上"助手调了工具却无结果"的半截 transcript
def _append_interrupted_tool_results(self):
    returned_ids = {m.tool_call_id for m in self._messages
                    if isinstance(m, ToolResultMessage)}
    for message in tuple(self._messages):
        if not isinstance(message, AssistantMessage):
            continue
        for tool_call in message.tool_calls:
            if tool_call.id in returned_ids:
                continue
            returned_ids.add(tool_call.id)
            self._messages.append(ToolResultMessage(
                tool_call_id=tool_call.id, name=tool_call.name,
                content="Tool call interrupted by user", ok=False,
                error="Tool call interrupted by user"))
```
**中断修复**：`append_interrupted_tool_results()` / `_append_interrupted_tool_results()`。
原因：OpenAI 兼容 provider 会拒绝"助手调了工具但没有对应工具结果"的 transcript。若
UI 在工具还在跑时取消 worker，正常循环可能来不及补取消结果——所以**下次请求模型前**
自动扫描：对每个 `AssistantMessage` 里没有匹配 `ToolResultMessage` 的 `tool_call`，
补一条 `ok=False`、`content="Tool call interrupted by user"` 的 `ToolResultMessage`。
`prompt`/`continue_` 一开始就调它，保证 transcript 永远可被模型接受。

> Design note: 这个修复逻辑对应 Rust `tau-rs` 的 `harness` 在发起新一轮前重放/补全中断的工具结果
> 的部分。其动机在于 transcript 必须是模型可接受的完整记录：OpenAI 兼容 provider 会拒绝
> "助手调了工具却没有对应工具结果" 的历史，否则下一轮请求直接失败。`AgentHarness` 在
> `prompt`/`continue_` 入口处主动补齐中断结果，就能保证任意时刻暂停、再恢复，transcript
> 都始终合法——这是会话"可持久化、可恢复"承诺在 harness 层的落地。

---

## 本部分小结

- `loop.py` 是**纯算法**：请求模型 → 翻译事件 → 没有 tool call 就停（或排空队列
  续跑）→ 有 tool call 就执行并回灌结果 → 循环。`max_turns` 给循环封顶，`signal`
  允许中途取消，进度回调被桥接成事件流。
- `harness.py` 是**有状态驱动器**：持有 transcript、管理排队/订阅/取消、修复中断、
  把 `prompt`/`continue_` 暴露给上层 `tau_coding`。

下一任务（Part 2c）看 `tau_agent/session/`：如何把 transcript 持久化成"可分支的
JSONL 树"，以及从磁盘重建回 `harness` 需要的状态。

## 逐方法深度剖析（loop / harness）

> 以下为纯循环 `loop.py` 与有状态 `harness.py` 的逐方法展开。

## 文件:loop.py

> 模块定位:`tau_agent.loop` 是一个**纯函数式(provider/tool-neutral)**的 agent 循环。它不持有任何会话状态,所有状态都由调用方通过 `messages` 列表传入并就地追加。`run_agent_loop` 是一个 `async` 生成器,把底层 `ModelProvider` 的流式事件翻译为上层中立的 `AgentEvent`,驱动「模型回复 → 工具调用 → 回填结果 → 继续」的多轮循环。所有私有辅函数(`_drain_queued_messages`、`_execute_tool_calls`、`_execute_tool`、`_run_tool` 以及三个结果构造器、`_tool_result_message`)都围绕「无状态、可注入、可测试」这一目标设计。

### func

#### `run_agent_loop(*, provider, model, system, messages, tools, max_turns=None, signal=None, get_steering_messages=None, get_follow_up_messages=None, get_queue_update=None) -> AsyncIterator[AgentEvent]`

- **作用**:核心纯循环。以 `async for` 驱动 `provider.stream_response`,把 provider 事件翻译为 agent 事件并 `yield`;处理 thinking、工具调用(调用 `tool.execute` → 把结果回填 `messages` → 继续循环直到 completion 或 `max_turns`);处理取消、错误、队列(steering/follow-up)注入。
- **关键实现步骤/数据流**:
  1. 先 `yield AgentStartEvent()` 作为整轮运行的开始事件。
  2. **参数校验**:若 `max_turns is not None and max_turns < 1`,`yield ErrorEvent(message="max_turns must be at least 1", recoverable=False)`,再 `yield AgentEndEvent()` 并 `return`(短路结束)。
  3. 构建 `tool_by_name = {tool.name: tool for tool in tools}` 的名字→工具映射;`turn = 1` 初始化轮次计数。
  4. **主循环**:`while max_turns is None or turn <= max_turns`(无限或受 `max_turns` 限制)。
     - **取消检查**:若 `signal` 存在且 `signal.is_cancelled()`,`yield ErrorEvent("Agent run cancelled", recoverable=True)` 后 `break`。
     - `yield TurnStartEvent(turn=turn)` 标记一轮开始。
     - 局部 `assistant_message: AssistantMessage | None = None` 记录本轮模型回复;`saw_provider_error = False` 记录是否出现 provider 错误。
     - **内层 `async for provider_event` in `provider.stream_response(...)`**(传入 `model/system/messages/tools/signal`)做事件翻译:
       - `ProviderResponseStartEvent` → `yield MessageStartEvent()`(一条新助手消息开始)。
       - `ProviderTextDeltaEvent` → `yield MessageDeltaEvent(delta=provider_event.delta)`(增量正文)。
       - `ProviderThinkingDeltaEvent` → `yield ThinkingDeltaEvent(delta=provider_event.delta)`(增量思考内容)。
       - `ProviderRetryEvent` → `yield RetryEvent(...)` 把重试的 `attempt/max_attempts/delay_seconds/message/data` 透传。
       - `ProviderResponseEndEvent` → 把 `provider_event.message` 存入 `assistant_message`,并 `messages.append(assistant_message)`(就地写入调用方拥有的 transcript),再 `yield MessageEndEvent(message=assistant_message)`。
       - `ProviderErrorEvent` → 置 `saw_provider_error = True`,`yield ErrorEvent(message=..., recoverable=False, data=...)`。
     - **无助手消息分支**:循环结束后若 `assistant_message is None`:
       - 若信号已取消,`yield ErrorEvent("Agent run cancelled", recoverable=True)` → `yield TurnEndEvent(turn=turn)` → `break`。
       - 否则 `yield TurnEndEvent(turn=turn)`;若 `saw_provider_error` 为真则 `break`;否则 `yield ErrorEvent("Provider stream ended without an assistant message")` 并 `break`(异常结束整轮)。
     - **无工具调用分支**:`if not assistant_message.tool_calls`(模型本轮没有请求工具):
       - `yield TurnEndEvent(turn=turn)`。
       - 调用 `_drain_queued_messages(messages, get_steering_messages, get_queue_update)`:若返回非空,逐个 `yield`,`turn += 1`,`continue`(steering 消息注入后再跑一轮)。
       - 否则再调用 `_drain_queued_messages(messages, get_follow_up_messages, get_queue_update)`:若非空,逐个 `yield`,`turn += 1`,`continue`(follow-up 消息注入后再跑一轮)。
       - 两者都空 → `break`(模型自然结束,整轮结束)。
     - **有工具调用分支**:`async for tool_event in _execute_tool_calls(assistant_message.tool_calls, tool_by_name, messages, signal)`,把每个工具事件 `yield` 出去。
       - 随后 `yield TurnEndEvent(turn=turn)`。
       - 再 `_drain_queued_messages(messages, get_steering_messages, get_queue_update)` 并逐个 `yield`。
       - `turn += 1` 进入下一轮(工具结果已回填 `messages`,模型据此继续)。
  5. **`while` 的 `else` 分支**:若因 `max_turns` 耗尽正常退出循环(从未 `break`),`yield ErrorEvent("Agent loop stopped after reaching max_turns=...", recoverable=True)`。
  6. 最后 `yield AgentEndEvent()` 结束整轮运行。
- **纯性要点**:函数本身不保存任何跨调用状态;`messages` 由调用方拥有并就地修改(使其在无状态条件下仍能与有状态 harness 协作);provider、tools、取消信号、队列拉取函数全部通过参数注入,便于用 fake provider / fake tool 做确定性测试。

```python
# loop.py:70 — 纯循环主结构（事件翻译 + transcript 就地追加）
while max_turns is None or turn <= max_turns:
    if signal is not None and signal.is_cancelled():
        yield ErrorEvent(message="Agent run cancelled", recoverable=True)
        break
    yield TurnStartEvent(turn=turn)
    async for provider_event in provider.stream_response(
        model=model, system=system, messages=messages, tools=tools, signal=signal
    ):
        if isinstance(provider_event, ProviderResponseEndEvent):
            assistant_message = provider_event.message
            messages.append(assistant_message)
            yield MessageEndEvent(message=assistant_message)
    if not assistant_message.tool_calls:
        yield TurnEndEvent(turn=turn)
        if _drain_queued_messages(messages, get_steering_messages, get_queue_update):
            turn += 1; continue
        if _drain_queued_messages(messages, get_follow_up_messages, get_queue_update):
            turn += 1; continue
        break
    async for tool_event in _execute_tool_calls(assistant_message.tool_calls,
                                                 tool_by_name, messages, signal):
        yield tool_event
    yield TurnEndEvent(turn=turn)
    turn += 1
else:
    yield ErrorEvent(message=f"Agent loop stopped after reaching max_turns={max_turns}",
                      recoverable=True)
```


#### `_drain_queued_messages(messages, get_messages, get_queue_update) -> tuple[AgentEvent, ...]`

- **作用**:把某个队列(steering 或 follow-up)中此刻可取出的消息注入 transcript,并生成对应的 `MessageStartEvent` / `MessageEndEvent` 以及可选的 `QueueUpdateEvent`(纯函数,非 async)。
- **关键实现步骤/数据流**:
  1. 若 `get_messages is None`,直接 `return ()`(未配置该队列来源)。
  2. `queued_messages = tuple(get_messages())` 取出当前队列内容;若为空 `return ()`。
  3. `messages.extend(queued_messages)` 把取出的消息追加到共享 transcript。
  4. 对每个 `message` 依次 `events.append(MessageStartEvent(message_role=message.role))` 与 `events.append(MessageEndEvent(message=message))`(让消费者看到这些被注入的消息)。
  5. 若 `get_queue_update is not None`,`events.append(get_queue_update())`(附上最新队列状态快照)。
  6. `return tuple(events)`。
- **与循环的关系**:由 `run_agent_loop` 在「模型无工具调用 / 工具调用完成后」调用,支持运行中动态往 transcript 注入用户消息而不打断循环。

```python
# loop.py:172 — 把队列消息注入 transcript 并生成对应事件（纯函数）
def _drain_queued_messages(messages, get_messages, get_queue_update):
    if get_messages is None:
        return ()
    queued = tuple(get_messages())
    if not queued:
        return ()
    messages.extend(queued)
    events = []
    for message in queued:
        events.append(MessageStartEvent(message_role=message.role))
        events.append(MessageEndEvent(message=message))
    if get_queue_update is not None:
        events.append(get_queue_update())
    return tuple(events)
```


#### `_execute_tool_calls(tool_calls, tool_by_name, messages, signal) -> AsyncIterator[AgentEvent]`

- **作用**:顺序执行一轮中的所有 `ToolCall`,为每个调用产出 `ToolExecutionStartEvent` / 中间 `ToolExecutionUpdateEvent` / 最终 `ToolExecutionEndEvent`,并把工具结果回填 `messages`(async 生成器)。
- **关键实现步骤/数据流**:
  1. `for index, tool_call in enumerate(tool_calls)` 逐个处理工具调用。
     - **取消处理**:若 `signal` 存在且已取消,对 `tool_calls[index:]` 中剩余的每个调用用 `_cancelled_tool_result` 生成结果,`_tool_result_message` 转化为消息并 `messages.append`,再 `yield ToolExecutionEndEvent(result=result)`,最后 `yield ErrorEvent("Agent run cancelled", recoverable=True)` 并 `return`(批量取消剩余工具)。
     - `yield ToolExecutionStartEvent(tool_call=tool_call)`(工具开始)。
     - `tool = tool_by_name.get(tool_call.name)`:若为 `None` → `result = _unknown_tool_result(tool_call)`(未知工具)。
     - 否则 `produced: AgentToolResult | None = None`,`async for item in _execute_tool(tool, tool_call, signal)`:若 `item` 是 `ToolExecutionUpdateEvent` 则直接 `yield`(进度更新);否则(即最终结果)存入 `produced`。若 `produced is None`(理论上 `_execute_tool` 总会以结果结尾)则兜底用 `_cancelled_tool_result`。
  2. `messages.append(_tool_result_message(result))` 把结果消息回填 transcript;`yield ToolExecutionEndEvent(result=result)`。
- **数据闭环**:工具结果经 `_tool_result_message` 转为 `ToolResultMessage` 并就地追加到调用方 transcript,从而下一轮 `provider.stream_response` 能看到工具结果。

```python
# loop.py:193 — 顺序执行工具调用，回填结果并广播事件
async def _execute_tool_calls(tool_calls, tool_by_name, messages, signal):
    for index, tool_call in enumerate(tool_calls):
        if signal is not None and signal.is_cancelled():
            for t in tool_calls[index:]:
                result = _cancelled_tool_result(t)
                messages.append(_tool_result_message(result))
                yield ToolExecutionEndEvent(result=result)
            yield ErrorEvent(message="Agent run cancelled", recoverable=True)
            return
        yield ToolExecutionStartEvent(tool_call=tool_call)
        tool = tool_by_name.get(tool_call.name)
        result = _unknown_tool_result(tool_call) if tool is None else None
        if tool is not None:
            produced = None
            async for item in _execute_tool(tool, tool_call, signal):
                if isinstance(item, ToolExecutionUpdateEvent):
                    yield item
                else:
                    produced = item
            if produced is None:
                produced = _cancelled_tool_result(tool_call)
            result = produced
        messages.append(_tool_result_message(result))
        yield ToolExecutionEndEvent(result=result)
```


#### `_execute_tool(tool, tool_call, signal) -> AsyncIterator[ToolExecutionUpdateEvent | AgentToolResult]`

- **作用**:执行单个工具,在工具**仍在运行**期间就按序产出实时进度更新 `ToolExecutionUpdateEvent`,最后恰好以**一个** `AgentToolResult` 收尾(即使工具报错或被取消也不丢失结果)。
- **关键实现步骤/数据流**:
  1. 创建无界队列 `queue: asyncio.Queue[ToolExecutionUpdateEvent]`。
  2. 定义同步回调 `on_update(message, data=None)`,把进度封装为 `ToolExecutionUpdateEvent(tool_call_id=tool_call.id, message=message, data=data)` 并 `queue.put_nowait`(把同步回调桥接进异步流)。
  3. `task = asyncio.ensure_future(_run_tool(tool, tool_call, signal, on_update))` 启动工具执行任务。
  4. `while not task.done()`:用 `asyncio.wait({task, getter}, return_when=FIRST_COMPLETED)` 在「工具任务」与「队列取数 getter」之间竞速:
     - 若 `getter in done`:有更新入队,`yield getter.result()` 把该更新吐出。
     - 否则(工具先完成):`getter.cancel()` 并 `suppress(CancelledError)` 后 `await getter`(避免丢掉尚未取出的更新)。
  5. 工具完成后 `while not queue.empty(): yield queue.get_nowait()` 排空尾部更新,再 `yield task.result()`(最终结果,必为恰好一个 `AgentToolResult`)。
  6. `finally`:若 `task` 仍未完成则 `task.cancel()` 并等待(防止工具任务被孤立;即便消费方 generator 中途关闭或取消也会执行)。
- **设计要点**:用「任务 + 队列」竞速让同步 `on_update` 与异步结果共存,保证更新顺序与「工具仍在跑」的实时性,且收尾必有一个结果。

```python
# loop.py:228 — 单工具执行：同步回调桥接为异步事件流，必以单个结果收尾
async def _execute_tool(tool, tool_call, signal):
    queue: asyncio.Queue = asyncio.Queue()
    def on_update(message, data=None):
        queue.put_nowait(ToolExecutionUpdateEvent(
            tool_call_id=tool_call.id, message=message, data=data))
    task = asyncio.ensure_future(_run_tool(tool, tool_call, signal, on_update))
    try:
        while not task.done():
            getter = asyncio.ensure_future(queue.get())
            done, _ = await asyncio.wait({task, getter},
                                         return_when=asyncio.FIRST_COMPLETED)
            if getter in done:
                yield getter.result()
            else:
                getter.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await getter
        while not queue.empty():
            yield queue.get_nowait()
        yield task.result()
    finally:
        if not task.done():
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task
```


#### `_run_tool(tool, tool_call, signal, on_update) -> AgentToolResult`

- **作用**:真正调用工具的 `execute` 并做异常隔离,返回标准化的 `AgentToolResult`(普通 async 函数,非生成器)。
- **关键实现步骤/数据流**:
  1. `try: result = await tool.execute(tool_call.arguments, signal=signal, on_update=on_update)`。
  2. `except Exception as exc`:返回 `AgentToolResult(tool_call_id=tool_call.id, name=tool_call.name, ok=False, content=str(exc), error=str(exc))`(工具层是隔离边界,任何异常都被吞掉并转成失败结果)。
   3. 若 `result.tool_call_id != tool_call.id`,用 `result.model_copy(update={"tool_call_id": tool_call.id})` 修正 id 后返回;否则直接返回 `result`。

```python
# loop.py:280 — 真正调用工具并隔离异常（工具是隔离边界）
async def _run_tool(tool, tool_call, signal, on_update):
    try:
        result = await tool.execute(tool_call.arguments, signal=signal, on_update=on_update)
    except Exception as exc:   # 异常不向上冒泡，转为失败结果
        return AgentToolResult(tool_call_id=tool_call.id, name=tool_call.name,
                               ok=False, content=str(exc), error=str(exc))
    if result.tool_call_id != tool_call.id:
        return result.model_copy(update={"tool_call_id": tool_call.id})
    return result
```


#### `_unknown_tool_result(tool_call) -> AgentToolResult`

- **作用**:当 `tool_by_name` 中找不到对应工具名时,构造一个失败结果。
- **关键实现**:`message = f"Unknown tool: {tool_call.name}"`,返回 `AgentToolResult(tool_call_id=tool_call.id, name=tool_call.name, ok=False, content=message, error=message)`。

#### `_cancelled_tool_result(tool_call) -> AgentToolResult`

- **作用**:当工具因取消信号未执行/被取消时,构造一个失败结果。
- **关键实现**:`message = "Tool call cancelled"`,返回 `AgentToolResult(tool_call_id=tool_call.id, name=tool_call.name, ok=False, content=message, error=message)`。

#### `_tool_result_message(result) -> ToolResultMessage`

- **作用**:把 `AgentToolResult` 规整为可供 transcript 使用的 `ToolResultMessage`(纯函数)。
- **关键实现步骤/数据流**:
  1. `data = result.data`,`content = result.content`。
  2. 若 `not result.ok and result.error and result.error not in content`:把 `content = f"{content}\n\nError: {result.error}"` 把错误信息补进内容。
  3. 若 `data is not None and not content`:`content = str(data)`(没有正文时用 data 作兜底内容)。
   4. 返回 `ToolResultMessage(tool_call_id=, name=, content=, ok=, data=, details=, error=)`(把结果所有字段映射到消息)。

```python
# loop.py:324 — AgentToolResult → ToolResultMessage（失败信息并入 content）
def _tool_result_message(result):
    data, content = result.data, result.content
    if not result.ok and result.error and result.error not in content:
        content = f"{content}\n\nError: {result.error}"
    if data is not None and not content:
        content = str(data)
    return ToolResultMessage(tool_call_id=result.tool_call_id, name=result.name,
                             content=content, ok=result.ok, data=result.data,
                             details=result.details, error=result.error)
```


---

## 文件:harness.py

> 模块定位:`tau_agent.harness` 提供 `AgentHarness`——**有状态、可复用的 agent 大脑**。它拥有 transcript(`_messages`)、工具/系统提示配置、事件订阅者列表、当前取消令牌,以及 steering / follow-up 两个消息队列(`deque`)。它把执行完全委托给 `loop.py` 的 `run_agent_loop`,自身只负责「状态管理 + 事件广播 + 队列编排 + 运行保护」。它**不依赖** CLI、Rich、Textual、会话文件或 coding-agent 资源加载,因此与更上层的 `tau_coding.CodingSession`(负责把 harness 接入 TUI / 文件 / 资源)保持清晰边界:`CodingSession` 调用 harness,harness 不知道 TUI 的存在。

### AgentHarness

#### `QueuedMessages`(frozen dataclass, slots=True)

- **作用**:harness 拥有的排队用户消息的不可变快照。
- **字段/方法**:
  - `steering: tuple[AgentMessage, ...] = ()`、`follow_up: tuple[AgentMessage, ...] = ()`。
  - `count` 属性 → `len(self.steering) + len(self.follow_up)`(总排队数)。

#### `AgentHarnessConfig`(dataclass, slots=True)

- **作用**:`AgentHarness` 的配置载体。
- **字段**:`provider: ModelProvider`、`model: str`、`system: str`、`tools: list[AgentTool] = field(default_factory=list)`、`max_turns: int | None = None`、`queue_mode: QueueMode = "one_at_a_time"`(`QueueMode = Literal["one_at_a_time", "all"]`)。

#### `SimpleCancellationToken`

- **作用**:harness 与 loop 共用的轻量取消令牌(非 `asyncio`-内部令牌)。
- `__init__(self)`:`self._cancelled = False`。
- `cancel(self) -> None`:置 `self._cancelled = True`(请求取消)。
- `is_cancelled(self) -> bool`:返回 `self._cancelled`。

#### `__init__(self, config, *, messages=())`

- **作用**:初始化 harness 的全部内部状态。
- **关键实现**:`self._config = config`;`self._messages = list(messages)`(transcript,可变列表);`self._listeners: list[EventListener] = []`(订阅者);`self._current_signal: SimpleCancellationToken | None = None`(当前运行令牌);`self._running = False`;`self._steering_queue: deque[AgentMessage] = deque()` 与 `self._follow_up_queue: deque[AgentMessage] = deque()`(两个 FIFO 消息队列)。

```python
# harness.py:71 — 初始化：全部状态由 harness 持有（与纯循环解耦）
def __init__(self, config, *, messages=()):
    self._config = config
    self._messages = list(messages)
    self._listeners: list[EventListener] = []
    self._current_signal = None
    self._running = False
    self._steering_queue: deque[AgentMessage] = deque()
    self._follow_up_queue: deque[AgentMessage] = deque()
```


#### `messages`(property)

- **作用**:返回当前 transcript 的**不可变**快照 `tuple(self._messages)`(防止外部直接改内部列表)。

#### `config`(property)

- **作用**:返回 `self._config`(harness 配置)。

#### `is_running`(property)

- **作用**:返回 `self._running`——当前是否有 prompt / continuation 正在运行。

#### `queued_messages`(property)

- **作用**:返回 `QueuedMessages(steering=tuple(self._steering_queue), follow_up=tuple(self._follow_up_queue))`(排队消息快照)。

#### `pending_message_count`(property)

- **作用**:`return self.queued_messages.count`(总排队数,委托给 `QueuedMessages.count`)。

#### `has_queued_messages(self) -> bool`

- **作用**:`return bool(self._steering_queue or self._follow_up_queue)`(任一队列非空即为真)。

#### `append_message(self, message)`

- **作用**:把一个既有消息追加到 transcript,便于**恢复会话状态**(如从磁盘重载历史)。`self._messages.append(message)`。

#### `replace_messages(self, messages)`

- **作用**:整体替换 transcript,便于在「持久化上下文重建」后重置历史。`self._messages = list(messages)`。

#### `subscribe(self, listener) -> Callable[[], None]`

- **作用**:订阅流式事件;返回**取消订阅**回调。
- **关键实现**:`self._listeners.append(listener)`;定义 `unsubscribe()` 用 `suppress(ValueError)` 安全 `self._listeners.remove(listener)`;`return unsubscribe`。

```python
# harness.py:125 — 订阅事件流，返回退订回调
def subscribe(self, listener):
    self._listeners.append(listener)
    def unsubscribe():
        with suppress(ValueError):
            self._listeners.remove(listener)
    return unsubscribe
```


#### `cancel(self) -> None`

- **作用**:请求取消当前正在运行的 prompt(若有)。若 `self._current_signal is not None` 则 `self._current_signal.cancel()`。

```python
# harness.py:135 — 取消当前运行
def cancel(self):
    if self._current_signal is not None:
        self._current_signal.cancel()
```


#### `steer(self, content) -> QueueUpdateEvent`

- **作用**:为「当前/下一轮运行」排队一条 steering 消息(用字符串便捷封装)。内部 `return self.steer_message(UserMessage(content=content))`。

#### `steer_message(self, message) -> QueueUpdateEvent`

- **作用**:把一条消息排入 steering 队列(在**当前轮/工具批次之后**注入)。`self._steering_queue.append(message)`;返回 `self.queue_update_event()`(让调用方立即拿到队列状态快照)。

```python
# harness.py:140 — steer / follow_up：运行中或停前注入消息
def steer(self, content):
    return self.steer_message(UserMessage(content=content))

def steer_message(self, message):
    self._steering_queue.append(message)
    return self.queue_update_event()
```


#### `follow_up(self, content) -> QueueUpdateEvent`

- **作用**:为「当前运行本应停止时」排队一条 follow-up 消息(字符串便捷封装)。`return self.follow_up_message(UserMessage(content=content))`。

#### `follow_up_message(self, message) -> QueueUpdateEvent`

- **作用**:把一条消息排入 follow-up 队列(在**当前运行本应停止时**注入,用于让 agent 继续)。`self._follow_up_queue.append(message)`;返回 `self.queue_update_event()`。

#### `clear_queues(self) -> QueuedMessages`

- **作用**:清空所有排队消息,返回被清空内容的快照。先 `snapshot = self.queued_messages`,再 `.clear()` 两个队列,最后 `return snapshot`。

#### `pop_latest_follow_up(self) -> AgentMessage | None`

- **作用**:弹出并返回**最近**入队的 follow-up 消息。`if not self._follow_up_queue: return None`;否则 `return self._follow_up_queue.pop()`(从右端取,即最近一条)。

#### `pop_latest_steering(self) -> AgentMessage | None`

- **作用**:弹出并返回**最近**入队的 steering 消息。逻辑同上,作用于 `self._steering_queue`。

#### `queue_update_event(self) -> QueueUpdateEvent`

- **作用**:把当前队列状态封装为可移植的 agent 事件。返回 `QueueUpdateEvent(steering=tuple(message.content for message in self._steering_queue), follow_up=tuple(message.content for message in self._follow_up_queue))`(只取 `content` 文本)。

#### `prompt(self, content, *, custom_type=None, details=None) -> AsyncIterator[AgentEvent]`

- **作用**:追加一条用户消息并运行 agent 循环。`custom_type` / `details` 仅作为展示元数据附着在 `UserMessage` 上,不改变模型读取 `content` 的方式。
- **关键实现**:
  1. `self._ensure_not_running()`(防重入)。
  2. `self._append_interrupted_tool_results()`(修复被中断的运行可能留下的半截工具调用)。
  3. `self._running = True`。
  4. `message = UserMessage(content=content, custom_type=custom_type, details=details)`;`self._messages.append(message)`。
   5. `return self._run(prompt_message=message)`(进入内部运行器)。

```python
# harness.py:184 — prompt 入口：防重入 + 修中断 + 追加用户消息
def prompt(self, content, *, custom_type=None, details=None) -> AsyncIterator[AgentEvent]:
    self._ensure_not_running()
    self._append_interrupted_tool_results()
    self._running = True
    message = UserMessage(content=content, custom_type=custom_type, details=details)
    self._messages.append(message)
    return self._run(prompt_message=message)
```


#### `continue_(self) -> AsyncIterator[AgentEvent]`

- **作用**:**不追加**新用户消息,直接继续 agent 循环(用于在已存在 pending 上下文时续跑)。
- **关键实现**:`self._ensure_not_running()` → `self._append_interrupted_tool_results()` → `self._running = True` → `return self._run()`。

#### `_run(self, *, prompt_message=None) -> AsyncIterator[AgentEvent]`

- **作用**:harness 运行器的核心,把执行委托给 `run_agent_loop`,在转发事件前先广播给订阅者,并在首个 turn 开始时补发 prompt 用户消息的开始/结束事件。
- **关键实现步骤/数据流**:
  1. `signal = SimpleCancellationToken()`;`self._current_signal = signal`;`pending_prompt_event = prompt_message`。
  2. `try:` 内 `async for event in run_agent_loop(provider=self._config.provider, model=..., system=..., messages=self._messages, tools=self._config.tools, max_turns=self._config.max_turns, signal=signal, get_steering_messages=self._drain_steering_messages, get_follow_up_messages=self._drain_follow_up_messages, get_queue_update=self.queue_update_event)`:
     - `await self._notify(event)` 先广播给所有订阅者。
     - `yield event` 再把事件透传给 `prompt()` 的消费者。
     - 若 `pending_prompt_event is not None and event.type == "turn_start"`:补发 `MessageStartEvent(message_role="user")` 与 `MessageEndEvent(message=pending_prompt_event)`(让消费者看到刚追加的 prompt 用户消息),随后 `pending_prompt_event = None`(只在第一轮补一次)。
  3. `finally:` 若 `signal.is_cancelled()` 则再次 `self._append_interrupted_tool_results()`(确保被取消时补齐工具结果);若 `self._current_signal is signal` 则置 `None`;`self._running = False`。
- **状态叠加点**:`self._messages` 被直接传给 loop 作为 transcript,loop 就地追加助手/工具结果消息——harness 就这样在纯循环之上透明地持有并累积跨轮会话状态。

```python
# harness.py:211 — _run：把执行委托给纯循环，转发前先广播
async def _run(self, *, prompt_message=None):
    signal = SimpleCancellationToken()
    self._current_signal = signal
    pending_prompt_event = prompt_message
    try:
        async for event in run_agent_loop(
            provider=self._config.provider, model=self._config.model,
            system=self._config.system, messages=self._messages,
            tools=self._config.tools, max_turns=self._config.max_turns,
            signal=signal, get_steering_messages=self._drain_steering_messages,
            get_follow_up_messages=self._drain_follow_up_messages,
            get_queue_update=self.queue_update_event):
            await self._notify(event)
            yield event
            if pending_prompt_event is not None and event.type == "turn_start":
                yield MessageStartEvent(message_role="user")
                yield MessageEndEvent(message=pending_prompt_event)
                pending_prompt_event = None
    finally:
        if signal.is_cancelled():
            self._append_interrupted_tool_results()
        if self._current_signal is signal:
            self._current_signal = None
        self._running = False
```


#### `_notify(self, event) -> None`

- **作用**:把事件分发给所有订阅者。遍历 `list(self._listeners)`(拷贝避免迭代期修改),`result = listener(event)`;若 `isawaitable(result)` 则 `await result`(支持同步与异步监听器)。

#### `_ensure_not_running(self) -> None`

- **作用**:运行前重入保护。若 `self._running` 为真,抛 `RuntimeError("AgentHarness is already running; use steer() or follow_up() to queue messages.")`。

#### `_drain_steering_messages(self) -> tuple[AgentMessage, ...]`

- **作用**:供 loop 拉取 steering 队列。直接 `return self._drain_queue(self._steering_queue)`。

#### `_drain_follow_up_messages(self) -> tuple[AgentMessage, ...]`

- **作用**:供 loop 拉取 follow-up 队列。直接 `return self._drain_queue(self._follow_up_queue)`。

#### `_drain_queue(self, queue) -> tuple[AgentMessage, ...]`

- **作用**:按 `queue_mode` 从给定队列取出消息。
- **关键实现**:若队列空 `return ()`;若 `self._config.queue_mode == "all"`:`messages = tuple(queue)`;`queue.clear()`;`return messages`(一次性全部取出);否则 `return (queue.popleft(),)`(只取最旧一条,one_at_a_time)。

```python
# harness.py:262 — 按 queue_mode 从队列取消息
def _drain_queue(self, queue):
    if not queue:
        return ()
    if self._config.queue_mode == "all":
        messages = tuple(queue)
        queue.clear()
        return messages
    return (queue.popleft(),)
```


#### `append_interrupted_tool_results(self) -> int`

- **作用**:对外暴露的「修复被中断运行遗留半截工具调用」方法。返回被追加的合成工具结果数量(供上层判断是否需要持久化修复)。
- **关键实现**:`before_count = len(self._messages)`;`self._append_interrupted_tool_results()`;`return len(self._messages) - before_count`。

#### `_append_interrupted_tool_results(self) -> None`

- **作用**:**内部**修复 transcript——若某条 `AssistantMessage` 的 tool_call 在整个历史中找不到对应的 `ToolResultMessage`(因为 UI 取消 worker 时循环来不及补取消结果),则补一条 `ok=False`、content/error 为 `"Tool call interrupted by user"` 的 `ToolResultMessage`。
- **关键实现步骤/数据流**:
  1. `returned_ids = {message.tool_call_id for message in self._messages if isinstance(message, ToolResultMessage)}`(已回填结果的 tool_call id 集合)。
  2. 遍历 `tuple(self._messages)`(拷贝避免迭代期修改):若非 `AssistantMessage` 跳过;否则对 `message.tool_calls` 中每个 `tool_call`:
     - 若 `tool_call.id in returned_ids` 跳过。
     - 否则 `returned_ids.add(tool_call.id)` 并 `self._messages.append(ToolResultMessage(tool_call_id=, name=, content="Tool call interrupted by user", ok=False, error="Tool call interrupted by user"))`。

```python
# harness.py:280 — 中断修复：补齐"无对应结果"的工具调用
def _append_interrupted_tool_results(self):
    returned_ids = {m.tool_call_id for m in self._messages
                    if isinstance(m, ToolResultMessage)}
    for message in tuple(self._messages):
        if not isinstance(message, AssistantMessage):
            continue
        for tool_call in message.tool_calls:
            if tool_call.id in returned_ids:
                continue
            returned_ids.add(tool_call.id)
            self._messages.append(ToolResultMessage(
                tool_call_id=tool_call.id, name=tool_call.name,
                content="Tool call interrupted by user", ok=False,
                error="Tool call interrupted by user"))
```

- **动机**:OpenAI 兼容 provider 会拒绝「助手工具调用缺失对应结果」的历史;此修复保证下一次模型请求合法。

---

### 边界与关系小结

- **`loop.py` 的「纯」**:`run_agent_loop` 是纯 `async` 生成器,不持有 transcript、不持有 tools 绑定、不持有会话;一切(`messages`/`tools`/`provider`/`signal`/队列来源函数)都靠参数注入,`messages` 由调用方拥有且就地修改。**为什么这样设计**:README 把 agent 拆成 `AgentHarness = reusable agent brain / AgentSession = coding-agent environment / TUI = one possible frontend`,并规定 "The core stays portable"。若循环本身持有 transcript 或会话状态,它就无法脱离具体环境复用。把状态全部外推给调用方,循环就退化为一个纯算法函数——这正是 "Small layers beat magic" 原则的体现:每一层只做一件事,循环只负责"请求模型→翻译事件→执行工具→回灌→续跑"。因此循环可脱离任何 UI、用 fake 实现做确定性单元测试。
- **`harness.py` 的「状态叠加」**:`AgentHarness` 把 `self._messages` 作为 transcript 直接交给 loop,loop 每轮就地追加;harness 额外维护 `tools`、`system`、运行标志、取消令牌、steering/follow-up 队列与订阅者,把「多轮会话、运行中注入消息、事件广播、运行保护、中断修复」叠加在纯循环之上,自身仍与 CLI/Rich/Textual/session 文件解耦。
- **与 `CodingSession` 的关系**:`tau_coding` 的 `CodingSession` 是更上层,负责把 harness 接入 TUI、资源/技能加载、命令与文件操作;harness 完全不知道 TUI 的存在,只通过 `AgentEvent` 向外发事件、`subscribe` 接收回调。`CodingSession` 调用 harness 的 `prompt()` 并消费其 `AgentEvent` 流,从而把「可复用 agent 大脑」与「具体前端/环境」解耦,符合 Pi 的 `AgentHarness = reusable agent brain / AgentSession = coding-agent environment / TUI = one possible frontend` 三层划分。

---

<!-- NAV -->
[← tau_agent · 数据模型]({{< relref "./agent-models.md" >}})
[↑ 总览]({{< relref "./source-walkthrough.md" >}})
