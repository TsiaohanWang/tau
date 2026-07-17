---
title: tau_agent · 执行核心
description: loop.py 纯循环 / harness.py 有状态大脑
code_files:
  - tau_agent/loop.py
  - tau_agent/harness.py
---

这一章是整个 Tau 最核心的部分：`loop.py` 实现了"请求模型 → 翻译事件 → 执行工具 → 回灌结果 → 继续"的 **agent loop（代理循环）**——一种让模型反复与环境交互直到任务完成的机制；`harness.py`（**harness，意思是"操纵装置"**）则在纯循环之上叠加了状态管理，让循环能够跨多轮保持对话历史、处理取消和排队消息。把"无状态的算法"和"有状态的大脑"拆开，是为了让循环本身可以脱离任何 UI 或文件系统独立复用——无论是 print 模式、Rich 渲染还是 Textual TUI，都只是套在循环外面的不同"壳"。

## `tau_agent/loop.py` — 纯 agent 循环

**`run_agent_loop(*, provider, model, system, messages, tools, prompts, max_turns, signal, get_steering_messages, get_follow_up_messages, before_tool_call, after_tool_call) -> AsyncIterator[AgentEvent]`**

这是整座塔的算法核心。它是一个**异步生成器**（async generator）——你可以把它
想象成一个"会逐步吐出结果的函数"：每产生一个事件就 `yield` 出来（`yield` 在 `async def` 函数中使函数成为异步生成器，调用方用 `async for` 逐个消费产出的值，类似 Go 的 channel 发送或 JavaScript 的 async generator），调用方边迭代
边拿到 `AgentEvent`，并且可以在运行途中通过两个回调注入消息，而**不必打断流**。
这种设计之所以重要，是因为 LLM 的流式输出可能持续数秒甚至数分钟，你需要在输出
过程中实时显示进度、执行工具，而不是干等着全部完成。

### 函数签名（新）

```python
async def run_agent_loop(
    *,
    provider: ModelProvider,
    model: str,
    system: str,
    messages: list[AgentMessage],
    tools: list[AgentTool],
    prompts: Sequence[AgentMessage] = (),
    max_turns: int | None = None,
    signal: CancellationToken | None = None,
    get_steering_messages: Callable[[], Sequence[AgentMessage]] | None = None,
    get_follow_up_messages: Callable[[], Sequence[AgentMessage]] | None = None,
    before_tool_call: BeforeToolCall | None = None,
    after_tool_call: AfterToolCall | None = None,
) -> AsyncIterator[AgentEvent]:
```

新增参数说明：

- **`prompts`**：初始提示消息序列，循环启动时追加到 `messages` 并逐条产出对应的 `MessageStartEvent` / `MessageEndEvent`。harness 用它把用户消息注入循环而不必手动在 `messages` 里拼。
- **`before_tool_call`**：**工具调用前拦截回调**（`BeforeToolCall`，签名为 `Callable[[ToolCall], Awaitable[tuple[bool, str | None]]]`）。返回 `(True, reason)` 可阻止工具执行并注入错误结果，`(False, None)` 则放行。用于权限控制、用户确认等场景。
- **`after_tool_call`**：**工具调用后修改回调**（`AfterToolCall`，签名为 `Callable[[ToolCall, AgentToolResult, bool], Awaitable[tuple[AgentToolResult, bool]]]`）。可修改工具结果内容或错误标记，用于日志记录、结果重写等。
- **移除**：`get_queue_update` 已被移除——队列更新事件的生产权上移到了编码层（`tau_coding`）。

### 主循环逻辑

1. 把 `prompts` 转成列表、追加进 `messages`，`yield AgentStartEvent()` → `yield TurnStartEvent()`，逐条 yield 每条 prompt 的 `MessageStartEvent` / `MessageEndEvent`。
2. 若 `max_turns is not None and max_turns < 1`：构造一个错误 `AssistantMessage`，追加到 `messages`，yield `MessageStartEvent` / `MessageEndEvent` / `TurnEndEvent` / `AgentEndEvent` 并 `return`。
3. 把 `tools` 编成 `tool_by_name` 字典；`turn` 从 1 开始；`first_turn = True`；预取 `pending = get_steering_messages()` 的当前快照。
4. **外层 `while True`**：
   - **内层 `while has_more_tools or pending`**：
     - 若非第一轮，`yield TurnStartEvent()`。置 `first_turn = False`。
     - 逐条将 `pending` 消息 append 到 `messages`，yield 对应事件；清空 `pending`。
     - 若 `max_turns is not None and turn > max_turns`：构造错误消息，yield 错误事件并 `return`。
     - 调用 `_assistant_events(...)` 获取助手消息子生成器，逐条 yield；取出最终的 `assistant` 消息并 append 到 `messages`。
     - 若 `assistant is None`（防御性兜底）：构造错误消息并 append。
     - 若 `assistant.stop_reason in {"error", "aborted"}`：yield `TurnEndEvent` + `AgentEndEvent` 并 `return`。
     - **工具执行阶段**：对 `assistant.tool_calls` 中的每个 `call`，调用 `_execute_tool_call(...)` yield 事件，把 `ToolResultMessage` 收集起来并追加到 `messages`。
     - `yield TurnEndEvent(message=assistant, tool_results=tool_results)`。`turn += 1`。
     - 预取下一批 `pending = get_steering_messages()`。
   - **外层收尾**：取 `follow_ups = get_follow_up_messages()`；若有则设 `pending = follow_ups` 继续外层循环，否则 `break`。
5. `yield AgentEndEvent(messages=new_messages)`。

> Design note: transcript 列表由**调用方（harness）拥有**，loop 只往里 append。
> 这是 loop/harness 边界的核心分工。Tau 的设计原则明确 **`AgentHarness = reusable agent brain`** 且 **`The core stays portable`**——`run_agent_loop` 因此被实现为纯 `async` 生成器：它不持有 transcript、不绑定工具、不感知会话文件或终端，所有状态都由调用方注入、就地修改。这样循环本身保持"无状态"，可被任意 harness、测试或嵌入场景复用；而真正有状态的大脑（持有 transcript、运行标志、取消令牌、排队与订阅）由 `AgentHarness` 叠加在循环之上。把"算法"与"状态"拆开，正对应 README 的 agent 拆分原则——可复用的 harness 绝不能依赖终端、文件路径或 Rich 渲染，那些只是包裹 harness 的外层。

源码 (`loop.py:44-168`)——主循环完整骨架（节选关键路径）：

```python
async def run_agent_loop(
    *,
    provider: ModelProvider,
    model: str,
    system: str,
    messages: list[AgentMessage],
    tools: list[AgentTool],
    prompts: Sequence[AgentMessage] = (),
    max_turns: int | None = None,
    signal: CancellationToken | None = None,
    get_steering_messages: Callable[[], Sequence[AgentMessage]] | None = None,
    get_follow_up_messages: Callable[[], Sequence[AgentMessage]] | None = None,
    before_tool_call: BeforeToolCall | None = None,
    after_tool_call: AfterToolCall | None = None,
) -> AsyncIterator[AgentEvent]:
    new_messages = list(prompts)
    if prompts:
        messages.extend(prompts)

    yield AgentStartEvent()
    yield TurnStartEvent()
    for prompt in prompts:
        yield MessageStartEvent(message=prompt)
        yield MessageEndEvent(message=prompt)

    if max_turns is not None and max_turns < 1:
        error = _error_message(model, "max_turns must be at least 1")
        messages.append(error)
        new_messages.append(error)
        yield MessageStartEvent(message=error)
        yield MessageEndEvent(message=error)
        yield TurnEndEvent(message=error)
        yield AgentEndEvent(messages=new_messages)
        return

    tool_by_name = {tool.name: tool for tool in tools}
    turn = 1
    first_turn = True
    pending = tuple(get_steering_messages() if get_steering_messages else ())

    while True:
        has_more_tools = True
        while has_more_tools or pending:
            if not first_turn:
                yield TurnStartEvent()
            first_turn = False

            for message in pending:
                messages.append(message)
                new_messages.append(message)
                yield MessageStartEvent(message=message)
                yield MessageEndEvent(message=message)
            pending = ()

            if max_turns is not None and turn > max_turns:
                error = _error_message(model, f"Agent stopped after max_turns={max_turns}")
                messages.append(error)
                new_messages.append(error)
                yield MessageStartEvent(message=error)
                yield MessageEndEvent(message=error)
                yield TurnEndEvent(message=error)
                yield AgentEndEvent(messages=new_messages)
                return

            assistant = None
            async for event in _assistant_events(
                provider=provider, model=model, system=system,
                messages=messages, tools=tools, signal=signal,
            ):
                yield event
                if isinstance(event, MessageEndEvent) and isinstance(event.message, AssistantMessage):
                    assistant = event.message

            if assistant is None:
                assistant = _error_message(model, "Provider produced no assistant message")
                yield MessageStartEvent(message=assistant)
                yield MessageEndEvent(message=assistant)

            messages.append(assistant)
            new_messages.append(assistant)
            if assistant.stop_reason in {"error", "aborted"}:
                yield TurnEndEvent(message=assistant)
                yield AgentEndEvent(messages=new_messages)
                return

            tool_results: list[ToolResultMessage] = []
            calls = list(assistant.tool_calls)
            has_more_tools = bool(calls)
            for call in calls:
                async for event in _execute_tool_call(
                    call, tool_by_name, signal, before_tool_call, after_tool_call,
                ):
                    yield event
                    if isinstance(event, MessageEndEvent) and isinstance(event.message, ToolResultMessage):
                        tool_results.append(event.message)
                        messages.append(event.message)
                        new_messages.append(event.message)

            yield TurnEndEvent(message=assistant, tool_results=tool_results)
            turn += 1
            pending = tuple(get_steering_messages() if get_steering_messages else ())

        follow_ups = tuple(get_follow_up_messages() if get_follow_up_messages else ())
        if follow_ups:
            pending = follow_ups
            continue
        break

    yield AgentEndEvent(messages=new_messages)
```

### 事件生产：`_assistant_events`

`_assistant_events` 是循环内部的**事件翻译器**：它消费底层 `ModelProvider` 的流式事件（`AssistantMessageEvent`——包含 `AssistantStartEvent`/`TextDeltaEvent`/`ThinkingDeltaEvent`/`AssistantDoneEvent`/`AssistantErrorEvent` 等），将它们翻译成上层 `AgentEvent`。

翻译规则：

| provider 事件 | agent 事件 |
|---|---|
| `AssistantStartEvent` | `MessageStartEvent(message=event.partial)` |
| `AssistantDoneEvent` | `MessageEndEvent(message=event.message)`（若之前未发过 `MessageStartEvent` 则先补发） |
| `AssistantErrorEvent` | `MessageEndEvent(message=event.error)`（同上） |
| `TextDeltaEvent` / `ThinkingDeltaEvent` / 其他中间事件 | `MessageUpdateEvent(message=event.partial, assistant_message_event=event)` |

`MessageUpdateEvent` 是统一的**流式增量事件**，携带完整的 `partial` 助手消息和原始 provider 事件。前端可以检查 `assistant_message_event` 的类型来区分文本增量（`TextDeltaEvent`）、思考增量（`ThinkingDeltaEvent`）等不同内容块，同时始终能从 `message` 字段获取当前完整状态。这比旧版分别产出 `MessageDeltaEvent` / `ThinkingDeltaEvent` 更统一，也更符合 Pi 的事件模型。

### 新回调类型：`BeforeToolCall` / `AfterToolCall`

```python
BeforeToolCall = Callable[[ToolCall], Awaitable[tuple[bool, str | None]]]
AfterToolCall = Callable[[ToolCall, AgentToolResult, bool], Awaitable[tuple[AgentToolResult, bool]]]
```

- **`BeforeToolCall`**：在工具执行**之前**调用。返回 `(blocked, reason)`——若 `blocked=True`，工具不执行，直接用 `reason`（或默认消息）构造错误结果。适用于：用户确认（"要允许读取文件吗？"）、权限检查、速率限制等。
- **`AfterToolCall`**：在工具执行**之后**、结果回填 transcript **之前**调用。可修改 `AgentToolResult` 内容和 `is_error` 标记。适用于：结果过滤、日志记录、统一重写工具输出格式等。

这两个回调都定义在 `loop.py`，由 harness 配置透传：`AgentHarnessConfig.before_tool_call` / `AgentHarnessConfig.after_tool_call` → `run_agent_loop(before_tool_call=..., after_tool_call=...)`。

### 工具执行：`_execute_tool_call` / `_run_tool`

- **`_execute_tool_call(call, tools, signal, before_tool_call, after_tool_call)`**：
  1. `yield ToolExecutionStartEvent(tool_call_id, tool_name, args)`。
  2. 调用 `before_tool_call`：若返回 `(True, reason)` 则结果为错误 `AgentToolResult`。
  3. 否则检查 `signal.is_cancelled()` → 错误结果。
  4. 否则查找工具 → 找不到则错误结果。
  5. 否则调用 `_run_tool(tool, call, signal)`：获得 `(result, is_error, updates)`。对每个 update `yield ToolExecutionUpdateEvent`。
  6. 调用 `after_tool_call`：可修改 `result` 和 `is_error`。
  7. `yield ToolExecutionEndEvent(tool_call_id, tool_name, result, is_error)`。
  8. 把结果转为 `ToolResultMessage`，yield `MessageStartEvent` + `MessageEndEvent`。

- **`_run_tool(tool, call, signal)`**：真正调用 `tool.execute`，捕获异常转为失败结果（**工具是隔离边界，异常不向上冒泡**）。返回 `(result, is_error, updates)` 三元组。

```python
# loop.py:267 — _run_tool：执行工具并隔离异常
async def _run_tool(tool, call, signal):
    updates: list[AgentToolResult] = []
    accepting = True
    def on_update(partial: AgentToolResult) -> None:
        if accepting:
            updates.append(partial.model_copy(deep=True))
    try:
        result = await tool.execute(call.id, call.arguments, signal, on_update)
        return result, False, updates
    except asyncio.CancelledError:
        raise
    except Exception as exc:
        return _error_result(str(exc)), True, updates
    finally:
        accepting = False
```

> Design note: `on_update` 回调把工具的进度更新收集到一个列表中——`_execute_tool_call` 随后逐条 `yield ToolExecutionUpdateEvent`，让前端实时看到工具进度。`accepting` 标志确保生成器关闭后不再写入，防止竞态。整体设计目标仍然是"工具进度即事件"，正落实 README 的 "Events make agents teachable" 原则。旧版使用的"队列 + 任务"竞速方案在新版中被简化为顺序收集——因为工具是顺序执行的，不再需要并发桥接。

### 排队消息：`_drain_queued_messages` 已移除

旧版的 `_drain_queued_messages` 以及 `get_queue_update` 参数已被**完全移除**。循环内部不再关心队列状态事件的生产——这部分逻辑已上移到 `tau_coding` 层的 `CodingSession`，由它根据自身订阅机制决定何时生成 `QueueUpdateEvent`。循环本身只通过 `get_steering_messages` 和 `get_follow_up_messages` 回调拉取消息，纯粹的消息注入逻辑与事件生产彻底解耦。

---

## `tau_agent/harness.py` — 有状态 agent 大脑

如果说 `loop.py` 是一台没有记忆的机器——每次运行都从外部输入全部状态，运行完就把结果交给外部；那么 `AgentHarness` 就是在这台机器之上叠加了**记忆**（transcript 对话记录）、**安全开关**（取消令牌）和**消息队列**（steering/follow-up）的完整大脑。
它拥有 transcript、管理运行态、支持消息排队、对外广播事件、可被取消。

### 辅助类型

- **`QueuedMessages`**（frozen dataclass）：排队消息快照，`steering`/`follow_up` 两个 tuple，带 `count` 属性。
- **`AgentHarnessConfig`**（dataclass）：`provider`/`model`/`system`/`tools`/`max_turns`/`queue_mode`（`"one_at_a_time"` 或 `"all"`）/`before_tool_call`/`after_tool_call`。
- **`SimpleCancellationToken`**：`AgentHarness` 与 loop 共用的具体取消令牌，`cancel()`/`is_cancelled()`。
- 模块级：`EventListener = Callable[[AgentEvent], Awaitable[None] | None]`（`Callable[[参数类型], 返回类型]` 是 Python 的函数类型注解，类似 Go 的 `func(...)` 或 TypeScript 的 `(...) => ...`）、`QueueMode = Literal["one_at_a_time", "all"]`。

### `AgentHarness`

构造：`config` + 可选初始 `messages`（恢复会话时用）。内部状态：`_messages`、`_listeners`、`_current_signal`、`_running`、`_steering_queue`/`_follow_up_queue`（双端队列）。

**只读属性**：`messages`（不可变快照）、`config`、`is_running`、`queued_messages`、`pending_message_count`、`has_queued_messages`。

**transcript 操作**：`append_message`（恢复用）、`replace_messages`（上下文重建后用）、`subscribe(listener) -> unsubscribe`（事件订阅，返回退订回调）。

**取消与排队**：
- `cancel()`：取消当前运行的 `_current_signal`。
- `steer(content)` / `steer_message(msg)`：把消息压入 steering 队列（运行中插入），返回 `QueuedMessages` 快照（而非旧版的 `QueueUpdateEvent`，事件生产权在编码层）。
- `follow_up(content)` / `follow_up_message(msg)`：压入 follow_up 队列（运行将停时插入），返回 `QueuedMessages` 快照。
- `clear_queues()`、`pop_latest_follow_up()`、`pop_latest_steering()`。

**运行入口**：
- **`prompt(content)`**：追加一条 `UserMessage` 并运行。内部调用 `prompt_message`。
- **`prompt_message(message)`**：先 `_ensure_not_running()`，再 `_append_interrupted_tool_results()`，置 `_running=True`，调用 `_run(prompts=(message,))`。
- **`continue_()`**：不 append 新用户消息，直接 `_run()`——用于从持久化状态恢复后续跑。
- **`_run(*, prompts=())`**：创建 `SimpleCancellationToken` 作 `signal`，调用 `run_agent_loop`（传入 `prompts`、两个 drain 回调、`before_tool_call`/`after_tool_call`）；对每个事件 `_notify(listener)` 后 yield。`finally` 里：若被取消则再修一次中断工具结果，清空 `_current_signal`，`_running=False`。

```python
# harness.py:161 — _run：委托循环，转发前先广播
async def _run(self, *, prompts=()):
    signal = SimpleCancellationToken()
    self._current_signal = signal
    try:
        async for event in run_agent_loop(
            provider=self._config.provider, model=self._config.model,
            system=self._config.system, messages=self._messages,
            prompts=prompts, tools=self._config.tools,
            max_turns=self._config.max_turns, signal=signal,
            get_steering_messages=self._drain_steering_messages,
            get_follow_up_messages=self._drain_follow_up_messages,
            before_tool_call=self._config.before_tool_call,
            after_tool_call=self._config.after_tool_call,
        ):
            await self._notify(event)
            yield event
    finally:
        if signal.is_cancelled():
            self._append_interrupted_tool_results()
        if self._current_signal is signal:
            self._current_signal = None
        self._running = False
```

> 与旧版的关键区别：harness 不再给 `run_agent_loop` 传 `get_queue_update`。`QueueUpdateEvent` 的生产完全由 `tau_coding.CodingSession` 自行管理（它在 `steer_message` / `follow_up_message` 时同步返回 `QueuedMessages`，并决定是否发出 `QueueUpdateEvent`）。这让纯 agent 层和编码层的职责更清晰：loop 只管"请求→翻译→执行→回灌"，harness 管状态，coding 层管展示。

```python
# harness.py:192 — 事件广播：同步/异步监听器都支持
async def _notify(self, event):
    for listener in list(self._listeners):
        result = listener(event)
        if isawaitable(result):
            await result
```
**事件广播**：`_notify(event)` 遍历 `_listeners`，`listener` 若是 awaitable 就 `await`。这是扩展/UI 观测 `AgentEvent` 的钩子（对应 `tau_coding` 里扩展 attach 到 `session._harness.subscribe`）。

**队列排空策略**：`_drain_queue` 按 `queue_mode`——
`"all"` 一次取光，`"one_at_a_time"` 只取队首一个（`popleft`）。steering/follow_up
分别由 `_drain_steering_messages`/`_drain_follow_up_messages` 提供，正是传给 loop 的
`get_*` 回调。

```python
# harness.py:210 — 按 queue_mode 从队列取消息
def _drain_queue(self, queue):
    if not queue:
        return ()
    if self._config.queue_mode == "all":
        messages = tuple(queue)
        queue.clear()
        return messages
    return (queue.popleft(),)
```

```python
# harness.py:224 — 中断修复：补上"助手调了工具却无结果"的半截 transcript
def _append_interrupted_tool_results(self):
    returned_ids = {m.tool_call_id for m in self._messages
                    if isinstance(m, ToolResultMessage)}
    for message in tuple(self._messages):
        if not isinstance(message, AssistantMessage):
            continue
        for call in message.tool_calls:
            if call.id in returned_ids:
                continue
            returned_ids.add(call.id)
            self._messages.append(ToolResultMessage(
                tool_call_id=call.id, tool_name=call.name,
                content=[TextContent(text="Tool call interrupted by user")],
                is_error=True))
```
**中断修复**：`append_interrupted_tool_results()` / `_append_interrupted_tool_results()`。
原因：OpenAI 兼容 provider 会拒绝"助手调了工具但没有对应工具结果"的 transcript。若
UI 在工具还在跑时取消 worker，正常循环可能来不及补取消结果——所以**下次请求模型前**
自动扫描：对每个 `AssistantMessage` 里没有匹配 `ToolResultMessage` 的 `tool_call`，
补一条 `is_error=True`、`content="Tool call interrupted by user"` 的 `ToolResultMessage`。
`prompt_message` / `continue_` 一开始就调它，保证 transcript 永远可被模型接受。

> Design note: 这个修复逻辑对应 Rust `tau-rs` 的 `harness` 在发起新一轮前重放/补全中断的工具结果
> 的部分。其动机在于 transcript 必须是模型可接受的完整记录：OpenAI 兼容 provider 会拒绝
> "助手调了工具却没有对应工具结果" 的历史，否则下一轮请求直接失败。`AgentHarness` 在
> `prompt_message` / `continue_` 入口处主动补齐中断结果，就能保证任意时刻暂停、再恢复，transcript
> 都始终合法——这是会话"可持久化、可恢复"承诺在 harness 层的落地。

---

## 本部分小结

- `loop.py` 是**纯算法**：请求模型 → 翻译事件 → 没有 tool call 就停（或排空队列续跑）→ 有 tool call 就执行并回灌结果 → 循环。`max_turns` 给循环封顶，`signal` 允许中途取消，进度回调被桥接成事件流。`before_tool_call`/`after_tool_call` 让循环可在工具前后插入拦截逻辑，而无需修改循环本体。
- `harness.py` 是**有状态驱动器**：持有 transcript、管理排队/订阅/取消、修复中断、把 `prompt_message`/`continue_` 暴露给上层 `tau_coding`。不再生产 `QueueUpdateEvent`，让编码层自主决定展示逻辑。

下一任务（Part 2c）看 `tau_agent/session/`：如何把 transcript 持久化成"可分支的
JSONL 树"，以及从磁盘重建回 `harness` 需要的状态。

## 逐方法深度剖析（loop / harness）

> 以下为纯循环 `loop.py` 与有状态 `harness.py` 的逐方法展开。

## 文件:loop.py

> 模块定位:`tau_agent.loop` 是一个**纯函数式(provider/tool-neutral)**的 agent 循环。它不持有任何会话状态,所有状态都由调用方通过 `messages` 列表传入并就地追加。`run_agent_loop` 是一个 `async` 生成器,把底层 `ModelProvider` 的流式事件翻译为上层中立的 `AgentEvent`,驱动「模型回复 → 工具调用 → 回填结果 → 继续」的多轮循环。所有私有辅函数(`_assistant_events`、`_execute_tool_call`、`_run_tool` 以及结果构造器 `_error_result`/`_error_message`)都围绕「无状态、可注入、可测试」这一目标设计。

### func

#### `run_agent_loop(*, provider, model, system, messages, tools, prompts=(), max_turns=None, signal=None, get_steering_messages=None, get_follow_up_messages=None, before_tool_call=None, after_tool_call=None) -> AsyncIterator[AgentEvent]`

- **作用**:核心纯循环。以 `async for` 驱动 `_assistant_events`(消费 provider 流),把事件 yield 给调用方;处理工具调用(`before_tool_call` 拦截 → `tool.execute` → `after_tool_call` 修改 → 回填 `messages` → 继续循环直到 completion 或 `max_turns`);处理取消、错误、队列(steering/follow-up)注入。`prompts` 参数在循环启动时注入初始提示消息。
- **关键实现步骤/数据流**:
  1. `new_messages = list(prompts)` 追踪本轮新产生的消息(用于最终 `AgentEndEvent.messages`)。若 `prompts` 非空则 `messages.extend(prompts)`。
  2. `yield AgentStartEvent()` → `yield TurnStartEvent()` → 逐条 yield 每条 prompt 的 `MessageStartEvent`/`MessageEndEvent`。
  3. **参数校验**:若 `max_turns is not None and max_turns < 1`,构造 `_error_message` 并 yield `MessageStartEvent`/`MessageEndEvent`/`TurnEndEvent`/`AgentEndEvent` 并 `return`。
  4. 构建 `tool_by_name = {tool.name: tool for tool in tools}` 的名字→工具映射;`turn = 1` 初始化轮次计数;`first_turn = True`;预取 `pending = tuple(get_steering_messages() if get_steering_messages else ())`。
  5. **外层 `while True`**:
     - **内层 `while has_more_tools or pending`**:
       - 若非第一轮,`yield TurnStartEvent()`。置 `first_turn = False`。
       - 逐条将 `pending` 消息 `append` 到 `messages`,yield `MessageStartEvent`+`MessageEndEvent`;清空 `pending`。
       - **max_turns 检查**:若 `max_turns is not None and turn > max_turns`:构造 `_error_message`,yield 错误事件并 `return`。
       - **助手消息翻译**:`async for event in _assistant_events(...)` yield 事件,从 `MessageEndEvent` 中提取最终 `assistant`。若 `assistant is None`(防御性兜底):构造 `_error_message` yield。
       - `messages.append(assistant); new_messages.append(assistant)`。
       - 若 `assistant.stop_reason in {"error", "aborted"}`:yield `TurnEndEvent` + `AgentEndEvent` 并 `return`。
       - **工具执行**:对 `assistant.tool_calls` 中的每个 `call`,`async for event in _execute_tool_call(call, tool_by_name, signal, before_tool_call, after_tool_call)` yield 事件;收集 `ToolResultMessage` 追加到 `messages`。
       - `yield TurnEndEvent(message=assistant, tool_results=tool_results)`。`turn += 1`。
       - 预取 `pending = tuple(get_steering_messages() if get_steering_messages else ())`。
     - **外层收尾**:取 `follow_ups`;若有则 `pending = follow_ups` 继续外层循环,否则 `break`。
  6. 最后 `yield AgentEndEvent(messages=new_messages)`。
- **纯性要点**:函数本身不保存任何跨调用状态;`messages` 由调用方拥有并就地修改(使其在无状态条件下仍能与有状态 harness 协作);provider、tools、取消信号、队列拉取函数、工具回调全部通过参数注入,便于用 fake provider / fake tool 做确定性测试。

```python
# loop.py:44-168 — 纯循环主结构
async def run_agent_loop(*, provider, model, system, messages, tools,
                         prompts=(), max_turns=None, signal=None,
                         get_steering_messages=None, get_follow_up_messages=None,
                         before_tool_call=None, after_tool_call=None):
    new_messages = list(prompts)
    if prompts:
        messages.extend(prompts)
    yield AgentStartEvent()
    yield TurnStartEvent()
    for prompt in prompts:
        yield MessageStartEvent(message=prompt)
        yield MessageEndEvent(message=prompt)
    # ... max_turns 校验 ...
    tool_by_name = {tool.name: tool for tool in tools}
    turn = 1; first_turn = True
    pending = tuple(get_steering_messages() if get_steering_messages else ())
    while True:
        has_more_tools = True
        while has_more_tools or pending:
            if not first_turn:
                yield TurnStartEvent()
            first_turn = False
            # ... 消费 pending, 翻译助手事件, 执行工具 ...
            yield TurnEndEvent(message=assistant, tool_results=tool_results)
            turn += 1
            pending = tuple(get_steering_messages() if get_steering_messages else ())
        follow_ups = tuple(get_follow_up_messages() if get_follow_up_messages else ())
        if follow_ups:
            pending = follow_ups; continue
        break
    yield AgentEndEvent(messages=new_messages)
```


#### `_assistant_events(*, provider, model, system, messages, tools, signal) -> AsyncIterator[AgentEvent]`

- **作用**:消费 `ModelProvider.stream_response` 的原始 `AssistantMessageEvent` 流,翻译为 `AgentEvent`（async 生成器）。
- **关键实现步骤/数据流**:
  1. `source = provider.stream_response(model=model, system=system, messages=messages, tools=tools, signal=signal)` 启动 provider 流。
  2. `started = False` 跟踪是否已发过 `MessageStartEvent`。
  3. `async for event in source` 逐条翻译:
     - `AssistantStartEvent` → `started = True`;`yield MessageStartEvent(message=event.partial)`。
     - `AssistantDoneEvent` → 若未 started 则先补 `MessageStartEvent`;`yield MessageEndEvent(message=event.message)`。
     - `AssistantErrorEvent` → 若未 started 则先补 `MessageStartEvent`;`yield MessageEndEvent(message=event.error)`。
     - 其他（`TextDeltaEvent`/`ThinkingDeltaEvent`/`TextStartEvent` 等） → `yield MessageUpdateEvent(message=event.partial, assistant_message_event=event)`。

```python
# loop.py:171 — provider 事件 → agent 事件的翻译器
async def _assistant_events(*, provider, model, system, messages, tools, signal):
    source = provider.stream_response(model=model, system=system, messages=messages, tools=tools, signal=signal)
    started = False
    async for event in source:
        if isinstance(event, AssistantStartEvent):
            started = True
            yield MessageStartEvent(message=event.partial)
        elif isinstance(event, AssistantDoneEvent):
            if not started:
                yield MessageStartEvent(message=event.message)
            yield MessageEndEvent(message=event.message)
        elif isinstance(event, AssistantErrorEvent):
            if not started:
                yield MessageStartEvent(message=event.error)
            yield MessageEndEvent(message=event.error)
        else:
            yield MessageUpdateEvent(message=event.partial, assistant_message_event=event)
```


#### `_execute_tool_call(call, tools, signal, before_tool_call, after_tool_call) -> AsyncIterator[AgentEvent]`

- **作用**:执行单个工具调用,在前后插入回调拦截,最终 yield `ToolExecutionStartEvent` → 进度更新 → `ToolExecutionEndEvent` → `MessageStartEvent`/`MessageEndEvent`（async 生成器）。
- **关键实现步骤/数据流**:
  1. `yield ToolExecutionStartEvent(tool_call_id=call.id, tool_name=call.name, args=call.arguments)`。
  2. **`before_tool_call` 拦截**:若回调存在,调用 `blocked, block_reason = await before_tool_call(call)`;若 `blocked=True`,结果为错误 `AgentToolResult(block_reason or "Tool execution was blocked")`。
  3. **取消检查**:否则若 `signal.is_cancelled()`,结果为错误 `AgentToolResult("Operation aborted")`。
  4. **工具查找**:否则 `tool = tools.get(call.name)`;找不到则错误 `AgentToolResult(f"Tool {call.name} not found")`。
  5. **正常执行**:否则 `result, is_error, updates = await _run_tool(tool, call, signal)`,对每个 update `yield ToolExecutionUpdateEvent`。
  6. **`after_tool_call` 修改**:若回调存在,`result, is_error = await after_tool_call(call, result, is_error)`。
  7. `yield ToolExecutionEndEvent(tool_call_id, tool_name, result, is_error)`。
  8. 转为 `ToolResultMessage`,yield `MessageStartEvent` + `MessageEndEvent`。

```python
# loop.py:207 — 单工具执行：拦截 → 执行 → 修改 → 产出事件
async def _execute_tool_call(call, tools, signal, before_tool_call, after_tool_call):
    yield ToolExecutionStartEvent(tool_call_id=call.id, tool_name=call.name, args=call.arguments)
    blocked = False; block_reason = None
    if before_tool_call is not None:
        blocked, block_reason = await before_tool_call(call)
    if blocked:
        result = _error_result(block_reason or "Tool execution was blocked")
        is_error = True
    elif signal is not None and signal.is_cancelled():
        result = _error_result("Operation aborted"); is_error = True
    else:
        tool = tools.get(call.name)
        if tool is None:
            result = _error_result(f"Tool {call.name} not found"); is_error = True
        else:
            result, is_error, updates = await _run_tool(tool, call, signal)
            for update in updates:
                yield ToolExecutionUpdateEvent(tool_call_id=call.id, tool_name=call.name,
                                               args=call.arguments, partial_result=update)
    if after_tool_call is not None:
        result, is_error = await after_tool_call(call, result, is_error)
    yield ToolExecutionEndEvent(tool_call_id=call.id, tool_name=call.name,
                                result=result, is_error=is_error)
    message = ToolResultMessage(tool_call_id=call.id, tool_name=call.name,
                                content=result.content, details=result.details,
                                added_tool_names=result.added_tool_names, is_error=is_error)
    yield MessageStartEvent(message=message)
    yield MessageEndEvent(message=message)
```


#### `_run_tool(tool, call, signal) -> tuple[AgentToolResult, bool, list[AgentToolResult]]`

- **作用**:真正调用工具的 `execute` 并做异常隔离,返回标准化的 `(AgentToolResult, is_error, updates)` 三元组（普通 async 函数,非生成器）。
- **关键实现步骤/数据流**:
  1. `updates = []; accepting = True`。
  2. 定义 `on_update(partial)`:若 `accepting` 为真则 `updates.append(partial.model_copy(deep=True))`。
  3. `try: result = await tool.execute(call.id, call.arguments, signal, on_update)`;返回 `(result, False, updates)`。
  4. `except asyncio.CancelledError: raise`（不吞取消）。
  5. `except Exception as exc`:返回 `(_error_result(str(exc)), True, updates)`（**工具层是隔离边界,任何异常都被吞掉并转成失败结果**）。
  6. `finally: accepting = False`（关闭写入窗口,防止竞态）。

```python
# loop.py:267 — 执行工具并隔离异常
async def _run_tool(tool, call, signal):
    updates: list[AgentToolResult] = []
    accepting = True
    def on_update(partial: AgentToolResult) -> None:
        if accepting:
            updates.append(partial.model_copy(deep=True))
    try:
        result = await tool.execute(call.id, call.arguments, signal, on_update)
        return result, False, updates
    except asyncio.CancelledError:
        raise
    except Exception as exc:
        return _error_result(str(exc)), True, updates
    finally:
        accepting = False
```

#### `_error_result(message) -> AgentToolResult`

- **作用**:构造一个失败的 `AgentToolResult`。
- **关键实现**:返回 `AgentToolResult(content=[TextContent(text=message)], details={})`。

#### `_error_message(model, message) -> AssistantMessage`

- **作用**:构造一个错误 `AssistantMessage`（用于 max_turns 耗尽、provider 无输出等场景）。
- **关键实现**:返回 `AssistantMessage(model=model, content=[], stop_reason="error", error_message=message)`。

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
- **字段**:`provider: ModelProvider`、`model: str`、`system: str`、`tools: list[AgentTool] = field(default_factory=list)`、`max_turns: int | None = None`、`queue_mode: QueueMode = "one_at_a_time"`（`QueueMode = Literal["one_at_a_time", "all"]`）、`before_tool_call: BeforeToolCall | None = None`、`after_tool_call: AfterToolCall | None = None`。

#### `SimpleCancellationToken`

- **作用**:harness 与 loop 共用的轻量取消令牌(非 `asyncio`-内部令牌)。
- `__init__(self)`:`self._cancelled = False`。
- `cancel(self) -> None`:置 `self._cancelled = True`(请求取消)。
- `is_cancelled(self) -> bool`:返回 `self._cancelled`。

#### `__init__(self, config, *, messages=())`

- **作用**:初始化 harness 的全部内部状态。
- **关键实现**:`self._config = config`;`self._messages = list(messages)`(transcript,可变列表);`self._listeners: list[EventListener] = []`(订阅者);`self._current_signal: SimpleCancellationToken | None = None`(当前运行令牌);`self._running = False`;`self._steering_queue: deque[AgentMessage] = deque()` 与 `self._follow_up_queue: deque[AgentMessage] = deque()`(两个 FIFO 消息队列)。

```python
# harness.py:64 — 初始化：全部状态由 harness 持有（与纯循环解耦）
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
# harness.py:107 — 订阅事件流，返回退订回调
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
# harness.py:116 — 取消当前运行
def cancel(self):
    if self._current_signal is not None:
        self._current_signal.cancel()
```


#### `steer(self, content) -> QueuedMessages`

- **作用**:为「当前/下一轮运行」排队一条 steering 消息(用字符串便捷封装)。内部 `return self.steer_message(UserMessage(content=content))`。返回 `QueuedMessages` 快照。

#### `steer_message(self, message) -> QueuedMessages`

- **作用**:把一条消息排入 steering 队列(在**当前轮/工具批次之后**注入)。`self._steering_queue.append(message)`;返回 `self.queued_messages`（`QueuedMessages` 快照）。

```python
# harness.py:120 — steer / follow_up：运行中或停前注入消息
def steer(self, content):
    return self.steer_message(UserMessage(content=content))

def steer_message(self, message):
    self._steering_queue.append(message)
    return self.queued_messages
```


#### `follow_up(self, content) -> QueuedMessages`

- **作用**:为「当前运行本应停止时」排队一条 follow-up 消息(字符串便捷封装)。`return self.follow_up_message(UserMessage(content=content))`。返回 `QueuedMessages` 快照。

#### `follow_up_message(self, message) -> QueuedMessages`

- **作用**:把一条消息排入 follow-up 队列(在**当前运行本应停止时**注入,用于让 agent 继续)。`self._follow_up_queue.append(message)`;返回 `self.queued_messages`。

#### `clear_queues(self) -> QueuedMessages`

- **作用**:清空所有排队消息,返回被清空内容的快照。先 `snapshot = self.queued_messages`,再 `.clear()` 两个队列,最后 `return snapshot`。

#### `pop_latest_follow_up(self) -> AgentMessage | None`

- **作用**:弹出并返回**最近**入队的 follow-up 消息。`if not self._follow_up_queue: return None`;否则 `return self._follow_up_queue.pop()`(从右端取,即最近一条)。

#### `pop_latest_steering(self) -> AgentMessage | None`

- **作用**:弹出并返回**最近**入队的 steering 消息。逻辑同上,作用于 `self._steering_queue`。

#### `prompt(self, content) -> AsyncIterator[AgentEvent]`

- **作用**:追加一条用户消息并运行 agent 循环。便捷封装,内部调用 `prompt_message(UserMessage(content=content))`。
- **关键实现**:`return self.prompt_message(UserMessage(content=content))`。

#### `prompt_message(self, message) -> AsyncIterator[AgentEvent]`

- **作用**:追加一条 `AgentMessage` 并运行 agent 循环。
- **关键实现**:
  1. `self._ensure_not_running()`(防重入)。
  2. `self._append_interrupted_tool_results()`(修复被中断的运行可能留下的半截工具调用)。
  3. `self._running = True`。
  4. `return self._run(prompts=(message,))` (通过 `prompts` 参数注入消息,而非直接 append 后再传空)。

```python
# harness.py:146 — prompt 入口：防重入 + 修中断 + 通过 prompts 注入
def prompt_message(self, message):
    self._ensure_not_running()
    self._append_interrupted_tool_results()
    self._running = True
    return self._run(prompts=(message,))
```


#### `continue_(self) -> AsyncIterator[AgentEvent]`

- **作用**:**不追加**新用户消息,直接继续 agent 循环(用于在已存在 pending 上下文时续跑)。
- **关键实现**:`self._ensure_not_running()` → `self._append_interrupted_tool_results()` → `self._running = True` → `return self._run()`。

#### `_run(self, *, prompts=()) -> AsyncIterator[AgentEvent]`

- **作用**:harness 运行器的核心,把执行委托给 `run_agent_loop`,在转发事件前先广播给订阅者。
- **关键实现步骤/数据流**:
  1. `signal = SimpleCancellationToken()`;`self._current_signal = signal`。
  2. `try:` 内 `async for event in run_agent_loop(provider=..., model=..., system=..., messages=self._messages, prompts=prompts, tools=..., max_turns=..., signal=signal, get_steering_messages=..., get_follow_up_messages=..., before_tool_call=..., after_tool_call=...)`:
     - `await self._notify(event)` 先广播给所有订阅者。
     - `yield event` 再把事件透传给消费者。
  3. `finally:` 若 `signal.is_cancelled()` 则再次 `self._append_interrupted_tool_results()`;若 `self._current_signal is signal` 则置 `None`;`self._running = False`。
- **状态叠加点**:`self._messages` 被直接传给 loop 作为 transcript,loop 就地追加助手/工具结果消息——harness 就这样在纯循环之上透明地持有并累积跨轮会话状态。
- **与旧版的关键区别**:`_run` 不再给 `run_agent_loop` 传 `get_queue_update`;不再在首个 turn 补发 `MessageStartEvent`/`MessageEndEvent`（prompt 消息现在通过 `prompts` 参数注入,循环本身已处理其事件产出）。

```python
# harness.py:161 — _run：委托循环，转发前先广播
async def _run(self, *, prompts=()):
    signal = SimpleCancellationToken()
    self._current_signal = signal
    try:
        async for event in run_agent_loop(
            provider=self._config.provider, model=self._config.model,
            system=self._config.system, messages=self._messages,
            prompts=prompts, tools=self._config.tools,
            max_turns=self._config.max_turns, signal=signal,
            get_steering_messages=self._drain_steering_messages,
            get_follow_up_messages=self._drain_follow_up_messages,
            before_tool_call=self._config.before_tool_call,
            after_tool_call=self._config.after_tool_call,
        ):
            await self._notify(event)
            yield event
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
# harness.py:210 — 按 queue_mode 从队列取消息
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

- **作用**:**内部**修复 transcript——若某条 `AssistantMessage` 的 tool_call 在整个历史中找不到对应的 `ToolResultMessage`(因为 UI 取消 worker 时循环来不及补取消结果),则补一条 `is_error=True`、content 为 `"Tool call interrupted by user"` 的 `ToolResultMessage`。
- **关键实现步骤/数据流**:
  1. `returned_ids = {message.tool_call_id for message in self._messages if isinstance(message, ToolResultMessage)}`(已回填结果的 tool_call id 集合)。
  2. 遍历 `tuple(self._messages)`(拷贝避免迭代期修改):若非 `AssistantMessage` 跳过;否则对 `message.tool_calls` 中每个 `tool_call`:
     - 若 `tool_call.id in returned_ids` 跳过。
     - 否则 `returned_ids.add(tool_call.id)` 并 `self._messages.append(ToolResultMessage(tool_call_id=, tool_name=, content=[TextContent(text="Tool call interrupted by user")], is_error=True))`。

```python
# harness.py:224 — 中断修复：补齐"无对应结果"的工具调用
def _append_interrupted_tool_results(self):
    returned_ids = {m.tool_call_id for m in self._messages
                    if isinstance(m, ToolResultMessage)}
    for message in tuple(self._messages):
        if not isinstance(message, AssistantMessage):
            continue
        for call in message.tool_calls:
            if call.id in returned_ids:
                continue
            returned_ids.add(call.id)
            self._messages.append(ToolResultMessage(
                tool_call_id=call.id, tool_name=call.name,
                content=[TextContent(text="Tool call interrupted by user")],
                is_error=True))
```

- **动机**:OpenAI 兼容 provider 会拒绝「助手工具调用缺失对应结果」的历史;此修复保证下一次模型请求合法。

---

### 边界与关系小结

- **`loop.py` 的「纯」**: `run_agent_loop` 是纯 `async` 生成器,不持有 transcript、不持有 tools 绑定、不持有会话;一切(`messages`/`tools`/`provider`/`signal`/队列来源函数/工具回调)都靠参数注入,`messages` 由调用方拥有且就地修改。**为什么这样设计**:README 把 agent 拆成 `AgentHarness = reusable agent brain / AgentSession = coding-agent environment / TUI = one possible frontend`,并规定 "The core stays portable"。若循环本身持有 transcript 或会话状态,它就无法脱离具体环境复用。把状态全部外推给调用方,循环就退化为一个纯算法函数——这正是 "Small layers beat magic" 原则的体现:每一层只做一件事,循环只负责"请求模型→翻译事件→执行工具→回灌→续跑"。因此循环可脱离任何 UI、用 fake 实现做确定性单元测试。
- **`harness.py` 的「状态叠加」**: `AgentHarness` 把 `self._messages` 作为 transcript 直接交给 loop,loop 每轮就地追加;harness 额外维护 `tools`、`system`、运行标志、取消令牌、steering/follow-up 队列与订阅者,把「多轮会话、运行中注入消息、事件广播、运行保护、中断修复」叠加在纯循环之上,自身仍与 CLI/Rich/Textual/session 文件解耦。
- **与 `CodingSession` 的关系**: `tau_coding` 的 `CodingSession` 是更上层,负责把 harness 接入 TUI、资源/技能加载、命令与文件操作;harness 完全不知道 TUI 的存在,只通过 `AgentEvent` 向外发事件、`subscribe` 接收回调。`CodingSession` 调用 harness 的 `prompt_message()`/`prompt()` 并消费其 `AgentEvent` 流,从而把「可复用 agent 大脑」与「具体前端/环境」解耦,符合 Pi 的 `AgentHarness = reusable agent brain / AgentSession = coding-agent environment / TUI = one possible frontend` 三层划分。`QueueUpdateEvent` 等展示层事件由 `tau_coding` 自行生产,不污染纯 agent 层。

---

<!-- NAV -->
[← tau_agent · 数据模型]({{< relref "./agent-models.md" >}})
[↑ 总览]({{< relref "./source-walkthrough.md" >}})
[→ tau_agent · 会话持久化树]({{< relref "./agent-session-tree.md" >}})
