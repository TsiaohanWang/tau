---
title: "00 — Roadmap / 00 —— 路线图"
---

[原文]
Tau is being built as a Python implementation of Pi's minimalist coding-agent harness architecture.
The goal is not a line-by-line port; the goal is to preserve the same boundaries while using Python-native tools.

[译文]
Tau 是 Pi 极简编码 agent harness 架构的 Python 实现。
目标不是逐行移植,而是在使用 Python 原生工具的同时,保留相同的边界划分。

## 包分层(Package layers)

[原文]
```text
tau_ai       provider/model streaming layer
tau_agent    portable agent harness, loop, tools, events, sessions
tau_coding   CLI app, resources, skills, extensions, commands, UI integration
```

[译文]
```text
tau_ai       provider/模型流式处理层
tau_agent    可移植的 agent harness、循环、工具、事件、会话
tau_coding   CLI 应用、资源、技能、扩展、命令、UI 集成
```

## 当前状态(Current status)

[原文]
Phases 0 through 20.4, 22, and 23 are implemented and documented. Phase 21
extensions were deferred until the core harness, coding session, and TUI were
stable; they are now implemented (see architecture/phase-21-extensions.md).

[译文]
阶段 0 到 20.4、22 以及 23 均已实现并有文档记录。阶段 21 的扩展系统曾被推迟,直到核心 harness、编码会话与 TUI 稳定下来;现在它已经实现(见 architecture/phase-21-extensions.md)。

[原文]
The latest pre-extension hardening pass added context accounting refreshes,
thinking-mode controls, optional thinking-token display, provider retries,
credential precedence, skill invocation reliability, session export, transcript
selection/copy, activity status, and Pi-style queued steering/follow-up prompts.
See [Pre-extension Hardening Summary](./architecture/pre-extension-hardening.md)
for the current behavior and verification coverage.

[译文]
最近一轮「扩展系统之前的加固」新增了:上下文计量刷新、thinking 模式控制、可选的 thinking token 展示、provider 重试、凭据优先级、技能调用的可靠性、会话导出、会话记录的选择/复制、活动状态,以及 Pi 风格的排队插话/追加提示。当前行为与验证覆盖情况见 [Pre-extension Hardening Summary](./architecture/pre-extension-hardening.md)。

[原文]
Context compaction now uses Pi-style model-generated summaries, preserves recent
context during automatic compaction, and can recover from a context-overflow
provider error with one compact-and-retry attempt. See
[Context Compaction](./context-compaction.md).

[译文]
上下文压缩现在采用 Pi 风格的「由模型生成摘要」方式,在自动压缩时保留最近的上下文,并且能在 provider 报出上下文溢出错误后,通过一次「压缩并重试」恢复。见 [Context Compaction](./context-compaction.md)。

[原文]
Project-trust enforcement is not implemented. Its documentation-first design,
Pi compatibility research, resource matrix, staged implementation, and test plan
are recorded in [Project trust](./project-trust.md) for issue #535.

[译文]
项目信任(project trust)的强制执行尚未实现。它「文档先行」的设计、与 Pi 的兼容性调研、资源矩阵、分阶段实施方案与测试计划记录在 [Project trust](./project-trust.md) 中,对应 issue #535。

## 阶段计划(Phase plan)

[原文]
0. Project foundation and design docs.
1. Core message, tool, and event types.
2. Provider interface with fake and real providers.
3. Pure agent loop.
4. Reusable `AgentHarness`.
5. Built-in coding tools.
6. Non-interactive print-mode CLI.
7. Append-only session tree persistence.
8. Coding session wrapper with commands.
9. Skills and prompt templates.
10. System prompt assembly.
11. Print and event rendering modes.
12. Textual TUI behind an adapter boundary.
13. Tau home, paths, and automatic `.agents` resources.
14. Session manager and resume.
15. Slash command registry.
16. Robust skills and prompt discovery.
17. TUI slash-command autocomplete.
18. Provider configuration and setup.
19. Project context discovery and reload.
20. Packaging and installation polish.
20.1. Accurate context accounting and sidebar refresh.
20.2. Thinking mode controls.
20.3. Skill invocation reliability.
20.4. Session visualization and export.
21. Extensions. Implemented.
22. Compaction and context management.
23. Advanced TUI and product polish.

[译文]
0. 项目基础与设计文档。
1. 核心消息、工具与事件类型。
2. Provider 接口,含假 provider 与真实 provider。
3. 纯 agent 循环。
4. 可复用的 `AgentHarness`。
5. 内置编码工具。
6. 非交互式 print 模式 CLI。
7. 只追加(append-only)的会话树持久化。
8. 带命令系统的编码会话包装层。
9. 技能(skills)与提示词模板。
10. 系统提示词组装。
11. Print 与事件渲染模式。
12. 位于适配器边界之后的 Textual TUI。
13. Tau 主目录、路径与自动 `.agents` 资源。
14. 会话管理器与恢复(resume)。
15. 斜杠命令注册表。
16. 健壮的技能与提示词发现。
17. TUI 斜杠命令自动补全。
18. Provider 配置与初始化。
19. 项目上下文发现与重载。
20. 打包与安装体验打磨。
20.1. 准确的上下文计量与侧边栏刷新。
20.2. Thinking 模式控制。
20.3. 技能调用可靠性。
20.4. 会话可视化与导出。
21. 扩展系统。已实现。
22. 压缩与上下文管理。
23. 高级 TUI 与产品化打磨。

## 阶段 0 交付物(Phase 0 deliverables)

[原文]
Phase 0 creates the docs, package scaffold, development checks, and a basic `tau --version` command.

[译文]
阶段 0 产出了文档、包脚手架、开发检查工具,以及最基本的 `tau --version` 命令。
