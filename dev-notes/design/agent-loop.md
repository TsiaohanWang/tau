---
title: "Agent Loop / Agent 循环"
---

[原文]
Tau's pure agent loop is implemented by `run_agent_loop()` in `tau_agent.loop`.

[译文]
Tau 的纯 agent 循环由 `tau_agent.loop` 中的 `run_agent_loop()` 实现。

[原文]
It connects:

[译文]
它连接三样东西:

```text
transcript + tools + provider
```

[原文]
and emits agent events while appending new messages to the transcript.

[译文]
并在把新消息追加到会话记录(transcript)的同时,发出 agent 事件。

## 最小形态(Minimal shape)

```python
async for event in run_agent_loop(
    provider=provider,
    model="...",
    system="...",
    messages=messages,
    tools=tools,
):
    ...
```

[原文]
The loop is intentionally independent of the CLI, Rich, Textual, and session file locations.

[译文]
这个循环刻意不依赖 CLI、Rich、Textual 以及会话文件位置。

[原文]
The current loop also accepts optional queue-drain hooks from `AgentHarness`.
Those hooks let the loop inject steering messages after a turn/tool batch and
follow-up messages when a run would otherwise stop, while still emitting normal
user message events and mutating the same transcript list.

[译文]
当前循环还接受来自 `AgentHarness` 的可选队列排空钩子(queue-drain hooks)。
这些钩子让循环可以在一轮对话/一批工具执行之后注入插话(steering)消息,并在本轮即将停止时注入追加(follow-up)消息;同时仍然发出常规的 user 消息事件,并修改同一个会话记录列表。

[原文]
For a detailed architecture walkthrough, read [Phase 3: Pure Agent Loop](./architecture/phase-3-agent-loop.md).

[译文]
详细的架构走读见 [阶段 3:纯 Agent 循环](./architecture/phase-3-agent-loop.md)。
