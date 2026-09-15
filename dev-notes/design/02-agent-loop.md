---
title: "02 — Agent Loop / 02 —— Agent 循环"
---

[原文]
The agent loop is the small, reusable engine that turns messages, tools, and provider streams into progress events.

[译文]
Agent 循环是一个小巧、可复用的引擎,它把消息、工具和 provider 流转化为进度事件。

## 职责(Responsibilities)

[原文]
1. Receive the current system prompt, transcript, tools, and model selection.
2. Ask the provider to stream a response.
3. Emit events as text and tool calls arrive.
4. Collect the assistant message.
5. Execute requested tools.
6. Append tool results.
7. Continue until the assistant produces no more tool calls.

[译文]
1. 接收当前的系统提示词、会话记录(transcript)、工具集与模型选择。
2. 请求 provider 流式返回响应。
3. 在文本和工具调用到达时发出事件。
4. 收集 assistant 消息。
5. 执行被请求的工具。
6. 追加工具结果。
7. 持续循环,直到 assistant 不再产生工具调用。

## 非职责(Non-responsibilities)

[原文]
The loop does not know about CLI arguments, Textual widgets, session file locations, or project resource discovery.
Those belong in `tau_coding`.

[译文]
循环不关心 CLI 参数、Textual 组件、会话文件位置或项目资源发现。
这些都属于 `tau_coding`。

## 事件优先设计(Event-first design)

[原文]
Every meaningful step should be observable through events so print mode, Rich rendering, and Textual can share the same core.

[译文]
每个有意义的步骤都应能通过事件被观察到,这样 print 模式、Rich 渲染和 Textual 才能共享同一个内核。
