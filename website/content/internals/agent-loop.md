---
title: 代理循环与事件
description: Tau 核心的小型引擎，以及每个前端都要渲染的事件流。
code_files:
  - tau_agent/loop.py
  - tau_agent/harness.py
---

**代理循环（agent loop）** 是整个 Tau 的核心引擎：它让模型不只是"一问一答"，
而是能像人一样——读一个文件、看到内容、再决定编辑什么。这种"思考 → 行动 → 根据
结果继续思考"的循环，正是*代理*（agent）与普通聊天框的本质区别。

## 循环做什么

每一轮（turn，即一次"把消息发给模型、拿到回复"的完整来回），循环都会：

1. 取用当前的系统提示、transcript（对话记录——模型能"记住"之前发生了什么的
   历史清单）、工具与模型选择；
2. 请求 provider（模型提供方，比如 OpenAI 或 Anthropic）流式返回响应；
3. 在文本与工具调用到达时发出事件；
4. 收集助手消息；
5. 执行任何被请求的工具；
6. 把工具结果追加进 transcript；
7. 重复上述过程，直到助手不再产生任何工具调用。

正是这种"调用工具、把结果回灌、继续"的循环，让模型能够读一个文件、看到其内容，
再决定要编辑什么。之所以要循环而不是一次性让模型回答所有问题，是因为模型每一步的
决策都依赖上一步工具返回的真实结果——比如先读文件才知道内容是什么，才知道该改哪里。

## 循环不做什么

循环对命令行参数、Textual 组件、会话文件位置或资源发现一无所知。这些属于
`tau_coding`。把这些都排除在外，循环才能在各种前端之间复用。

## 事件优先的设计

**事件（event）**是循环向外界播报进展的方式——每完成一个有意义的步骤，循环就
"广播"一条结构化的事件对象。这样做的好处是：循环本身不关心谁在听，无论是 print
模式、Rich 渲染还是 Textual TUI，都从同一条事件流消费信息，无需直接触碰循环内部。
前端只从这些 provider 中立的事件渲染——绝不直接消费 provider 的原始数据块。主要的
事件类型包括：

- `AgentStartEvent` / `AgentEndEvent` —— 一次运行开始 / 结束
- `TurnStartEvent` / `TurnEndEvent` —— 一次助手回复及其工具结果
- `MessageStartEvent` / `MessageUpdateEvent` / `MessageEndEvent` —— 一条消息的生命周期
- `ToolExecutionStartEvent` / `ToolExecutionUpdateEvent` / `ToolExecutionEndEvent`
  —— 一次工具运行

流式细节嵌套在 `MessageUpdateEvent.assistant_message_event` 下。这些 provider 中立的嵌套事件涵盖文本、推理内容以及工具调用的开始/增量/结束更新。Provider 的完成或失败通过 `MessageEndEvent` 传递的最终助手消息来表示。

`tau_coding.events.CodingSessionEvent` 在此基础上为前端和 SDK 用户扩展了 `agent_settled`（智能体真正空闲——注意：`agent_end` 之后可能还有自动压缩、重试或排队续接，只有 `agent_settled` 才表示完全结束）、队列更新、压缩、会话条目变更、推理级别变更以及自动重试等事件。扩展也能观察这些事件名，但会话到扩展的适配器会在 `turn_start` 中注入零起始的 `turn_index` 和毫秒级 `timestamp`，在 `turn_end` 中注入匹配的索引。详见 [扩展]({{< relref "../guides/extensions.md#events" >}}) 的完整事件载荷表。

既然契约是*事件*，前端的工作就被简化为：发送一个提示、消费这条流、把看到的内容画出来。

 → 关于具体 API，参见 [构建你自己的前端]({{< relref "./custom-frontend.md" >}})；关于循环所处的位置，参见
 [架构总览]({{< relref "./architecture.md" >}})。

 关于实际实现——`loop.py` 的 `run_agent_loop` 与 `harness.py` 的
 `AgentHarness`，逐方法讲解——参见
 [tau_agent · 循环与 harness]({{< relref "./agent-loop-harness.md" >}})。
