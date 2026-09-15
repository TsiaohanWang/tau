---
title: "Agent Harness / Agent Harness"
---

[原文]
`AgentHarness` is Tau's reusable stateful agent brain.

[译文]
`AgentHarness` 是 Tau 可复用的有状态 agent 大脑。

[原文]
It lives in:

[译文]
它位于:

```text
src/tau_agent/harness.py
```

[原文]
The harness owns a transcript and delegates execution to the pure agent loop.

[译文]
Harness 持有一份会话记录,并把执行委托给纯 agent 循环。

## 基本形态(Basic shape)

```python
harness = AgentHarness(
    AgentHarnessConfig(
        provider=provider,
        model="...",
        system="...",
        tools=[...],
    )
)

async for event in harness.prompt("Hello"):
    ...
```

## 职责(Responsibilities)

[原文]
The harness:

- stores transcript messages
- appends `UserMessage` objects for new prompts
- calls `run_agent_loop()`
- streams `AgentEvent` objects
- exposes `continue_()` for running without a new user prompt
- rejects overlapping `prompt()` / `continue_()` runs
- queues steering and follow-up messages for an active run
- supports event listeners
- supports basic cancellation

[译文]
Harness 的职责:

- 存储会话记录消息
- 为新提示追加 `UserMessage` 对象
- 调用 `run_agent_loop()`
- 以流的方式产出 `AgentEvent` 对象
- 提供 `continue_()`,用于在没有新用户提示的情况下继续运行
- 拒绝重叠的 `prompt()` / `continue_()` 运行
- 为正在运行的任务排队插话与追加消息
- 支持事件监听器
- 支持基本的取消操作

[原文]
The harness does not know about CLI arguments, Textual, Rich rendering, slash commands, or session files.

[译文]
Harness 不关心 CLI 参数、Textual、Rich 渲染、斜杠命令或会话文件。

## 队列(Queues)

[原文]
Use queue APIs while a run is active:

[译文]
当一次运行处于活动状态时,使用队列 API:

```python
harness.steer("Adjust the current plan.")
harness.follow_up("When that is done, summarize the result.")
```

[原文]
Steering messages are injected after the current assistant turn and tool batch,
before the next provider call. Follow-up messages are injected only when the run
would otherwise stop. `AgentHarnessConfig.queue_mode` defaults to
`"one_at_a_time"`; set it to `"all"` to drain each queue as a full batch.

[译文]
插话消息会在当前 assistant 轮次与工具批次结束之后、下一次 provider 调用之前注入。追加消息只在本次运行本应停止时注入。`AgentHarnessConfig.queue_mode` 默认为 `"one_at_a_time"`;设为 `"all"` 时,每次会把整个队列作为一批全部排空。

[原文]
The harness emits `QueueUpdateEvent` values as queues change and as messages are
drained. Queued messages become durable transcript messages only when they are
injected into the loop.

[译文]
队列发生变化以及消息被排空时,Harness 会发出 `QueueUpdateEvent`。排队中的消息只有在被注入循环时,才会成为持久化的会话记录消息。

[原文]
For a detailed architecture walkthrough, read [Phase 4: AgentHarness](./architecture/phase-4-agent-harness.md).

[译文]
详细的架构走读见 [阶段 4:AgentHarness](./architecture/phase-4-agent-harness.md)。
