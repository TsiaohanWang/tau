---
title: "01 — Architecture / 01 —— 架构"
---

[原文]
Tau keeps the reusable agent core separate from the coding-agent application and from any UI.

[译文]
Tau 让可复用的 agent 内核与编码 agent 应用、以及任何 UI 保持分离。

## 分层(Layers)

### `tau_ai`

[原文]
Owns provider-specific model streaming. It will translate provider responses into Tau's provider-neutral events.

[译文]
负责与具体 provider 相关的模型流式处理:把各 provider 的响应翻译成 Tau 的 provider 无关事件。

### `tau_agent`

[原文]
Owns the portable agent brain: messages, tools, events, the agent loop, harness, and session primitives.
This package must not import CLI, Rich, Textual, or application resource loading code.

[译文]
负责可移植的 agent 大脑:消息、工具、事件、agent 循环、harness 与会话原语。
该包**不得**导入 CLI、Rich、Textual 或应用层的资源加载代码。

### `tau_coding`

[原文]
Owns the coding-agent application: CLI commands, built-in coding tools, project instructions, skills,
prompt templates, sessions on disk, and UI adapters.

[译文]
负责编码 agent 应用:CLI 命令、内置编码工具、项目指令、技能(skills)、提示词模板、磁盘上的会话以及 UI 适配器。

## 依赖方向(Dependency direction)

[原文]
```text
tau_coding -> tau_agent -> tau_ai
```

UI packages consume emitted events. The core does not render UI directly.

[译文]
UI 包消费发出的事件;内核不直接渲染 UI。

## 核心分工(Guiding split)

[原文]
```text
AgentHarness = reusable brain
AgentSession = coding-agent environment
TUI = one possible frontend
```

[译文]
```text
AgentHarness = 可复用的大脑
AgentSession = 编码 agent 的运行环境
TUI = 众多前端之一
```
