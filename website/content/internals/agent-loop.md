---
title: 代理循环与事件
description: Tau 核心的小型引擎，以及每个前端都要渲染的事件流。
---

**代理循环（agent loop）** 是一个小巧、可复用的引擎，它把消息、工具与
provider 流转化为一串进度 **事件（event）**。正是它让某个东西成为*代理*，
而非一个聊天框。

## 循环做什么

每一轮（turn），循环都会：

1. 取用当前的系统提示、transcript（对话记录）、工具与模型选择；
2. 请求 provider 流式返回响应；
3. 在文本与工具调用到达时发出事件；
4. 收集助手消息；
5. 执行任何被请求的工具；
6. 把工具结果追加进 transcript；
7. 重复上述过程，直到助手不再产生任何工具调用。

正是这种"调用工具、把结果回灌、继续"的循环，让模型能够读取一个文件、看到
其内容，再决定要编辑什么。

## 循环不做什么

循环对命令行参数、Textual 组件、会话文件位置或资源发现一无所知。这些属于
`tau_coding`。把这些都排除在外，循环才能在各种前端之间复用。

## 事件优先的设计

每一个有意义的步骤都以事件的形式可被观测，因此 print 模式、Rich 渲染与
Textual TUI 共享同一个核心。前端只从这些 provider 中立的事件渲染——绝不
直接消费 provider 的原始数据块。主要的事件类型包括：

- `AgentStartEvent` / `AgentEndEvent` —— 一次运行开始 / 结束
- `MessageStartEvent` / `MessageDeltaEvent` / `MessageEndEvent` —— 流式输出的
  助手文本
- `ThinkingDeltaEvent` —— 可选的流式推理内容（默认隐藏）
- `ToolExecutionStartEvent` / `ToolExecutionUpdateEvent` / `ToolExecutionEndEvent`
  —— 一次工具运行
- `QueueUpdateEvent` —— 待处理的 steering（转向）/ follow-up（后续）提示
- `ErrorEvent` —— 可恢复或致命的错误

既然契约是*事件*，前端的工作就被简化为：发送一个提示、消费这条流、把看到的
内容画出来。

 → 关于具体 API，参见 [构建你自己的前端]({{< relref "./custom-frontend.md" >}})；关于循环所处的位置，参见
 [架构总览]({{< relref "./architecture.md" >}})。

 关于实际实现——`loop.py` 的 `run_agent_loop` 与 `harness.py` 的
 `AgentHarness`，逐方法讲解——参见
 [tau_agent · 循环与 harness]({{< relref "./agent-loop-harness.md" >}})。
