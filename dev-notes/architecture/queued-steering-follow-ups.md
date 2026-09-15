---
title: "Queued Steering And Follow-ups / 排队的插话与追加"
---

[原文]
This slice adds Pi-style message queueing while an agent run is active.

[译文]
本切片加入了 agent 运行期间的 Pi 风格消息排队。

## 新增了什么(What Was Added)

[原文]
`tau_agent.AgentHarness` now owns two prompt queues:

[译文]
`tau_agent.AgentHarness` 现在持有两个提示队列:

[原文]
- steering messages, injected after the current assistant turn and any tool batch
- follow-up messages, injected only when the run would otherwise stop

[译文]
- 插话(steering)消息:在当前 assistant 轮次与任意工具批次之后注入
- 追加(follow-up)消息:只在本次运行本应停止时注入

[原文]
The harness exposes `steer()`, `follow_up()`, `clear_queues()`,
`queued_messages`, `pending_message_count`, and `is_running`. Direct overlapping
`prompt()` and `continue_()` calls are rejected so callers cannot mutate one
transcript from two active runs.

[译文]
Harness 暴露 `steer()`、`follow_up()`、`clear_queues()`、`queued_messages`、`pending_message_count` 与 `is_running`。直接重叠的 `prompt()` 与 `continue_()` 调用会被拒绝,因此调用方无法用两个活动运行同时修改同一份会话记录。

[原文]
`run_agent_loop()` accepts provider-neutral queue-drain callbacks. When a queue
drains, the loop appends the queued user message to the same message list used
for normal prompts and emits ordinary user `MessageStartEvent` and
`MessageEndEvent` values before the next provider call.

[译文]
`run_agent_loop()` 接受 provider 无关的队列排空回调。当队列被排空时,循环会把排队的用户消息追加到与普通提示相同的消息列表中,并在下一次 provider 调用之前发出普通的用户 `MessageStartEvent` 与 `MessageEndEvent`。

[原文]
`QueueUpdateEvent` reports pending steering and follow-up text for frontends.
The Textual TUI uses it for status-line queue counts.

[译文]
`QueueUpdateEvent` 为前端报告待处理的插话与追加文本。Textual TUI 用它来显示状态行的队列计数。

## 编码会话边界(Coding Session Boundary)

[原文]
`CodingSession.prompt()` keeps ordinary non-running prompts unchanged. While the
harness is running, callers must pass one of:

[译文]
`CodingSession.prompt()` 对普通的、非运行中的提示保持不变。当 harness 正在运行时,调用方必须传入以下二者之一:

```python
session.prompt(text, streaming_behavior="steer")
session.prompt(text, streaming_behavior="follow_up")
```

[原文]
The session expands `/skill:<name>` prompt text before queueing. It does not
persist a queued message at queue time. Persistence still happens after the
active run finishes, when the harness has injected queued user messages into the
transcript.

[译文]
会话会在入队之前展开 `/skill:<name>` 提示文本。它不会在入队时持久化排队的消息。持久化仍发生在活动运行结束之后 —— 也就是 harness 已把排队的用户消息注入会话记录之时。

## TUI 行为(TUI Behavior)

[原文]
The built-in Textual frontend maps:

[译文]
内置的 Textual 前端映射如下:

[原文]
- `Enter` while running to steering queueing
- `Alt-Enter` while running to follow-up queueing
- `Up` on an empty prompt while running to edit the latest queued follow-up

[译文]
- 运行时按 `Enter` → 加入插话队列
- 运行时按 `Alt-Enter` → 加入追加队列
- 运行时在空提示上按 `Up` → 编辑最近排队的追加消息

[原文]
Pending queues are visible above the prompt while the run continues. If several
follow-ups are queued, edit pulls the most recently queued follow-up back into
the prompt and removes it from the queue. Once a queued message is injected, it
appears in the transcript as a normal user message and the pending queue display
updates.

[译文]
运行继续期间,待处理队列会显示在提示输入上方。如果排队了多条追加消息,编辑会把最近入队的那条追加拉回提示输入,并从队列中移除。排队消息一旦被注入,就会作为普通用户消息出现在会话记录中,待处理队列显示也随之更新。

## 边界(Boundary)

[原文]
Queue ownership lives in `tau_agent`, prompt expansion and persistence stay in
`tau_coding`, and Textual only decides keybindings and presentation. Provider
adapters do not know about queued messages; they receive the updated transcript
on the next provider call.

[译文]
队列的所有权在 `tau_agent`;提示词展开与持久化留在 `tau_coding`;Textual 只决定键位与呈现。Provider 适配器不知道排队消息的存在;它们在下一次 provider 调用时收到更新后的会话记录。

## 测试(Tests)

[原文]
The behavior is covered by:

[译文]
该行为由以下测试覆盖:

```text
tests/test_agent_loop.py
tests/test_agent_harness.py
tests/test_coding_session.py
tests/test_tui_adapter.py
tests/test_tui_app.py
```
