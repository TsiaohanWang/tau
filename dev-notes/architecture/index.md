---
title: "Architecture Notes / 架构笔记"
---

[原文]
This section explains Tau's architecture as it is built, one phase at a time.

[译文]
本节按阶段逐一解释 Tau 的架构是如何构建起来的。

[原文]
Tau is intentionally developed in small layers. Each layer should answer three questions:

[译文]
Tau 被有意拆成小层逐步开发。每一层都应当回答三个问题:

[原文]
1. What was added?
2. Why does it exist?
3. How will later phases use it?

[译文]
1. 新增了什么?
2. 为什么需要它?
3. 后续阶段会如何使用它?

## 当前架构分层(Current architecture layers)

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

[原文]
The most important boundary is that `tau_agent` should stay portable. It can define the reusable agent brain, but it should not know about VS Code, Textual, Rich rendering, local config directories, slash commands, or project-specific prompts.

[译文]
最重要的边界是 `tau_agent` 必须保持可移植。它可以定义可复用的 agent 大脑,但不应了解 VS Code、Textual、Rich 渲染、本地配置目录、斜杠命令或项目特有的提示词。

[原文]
For the practical frontend contract, see [Building a Custom TUI](../custom-tui.md).

[译文]
实用的前端契约见 [Building a Custom TUI](../custom-tui.md)。

## 阶段笔记(Phase notes)

[原文]
- [Phase 1: Core Types and Events](./phase-1-core-types-and-events.md)
- [Phase 2: AI Provider Layer](./phase-2-ai-provider-layer.md)
- [Phase 3: Pure Agent Loop](./phase-3-agent-loop.md)
- [Phase 4: AgentHarness](./phase-4-agent-harness.md)
- [Phase 5: Built-in Coding Tools](./phase-5-coding-tools.md)
- [Multimodal read-tool results](./multimodal-read-results.md)
- [Bounded read-image processing](./read-image-processing.md)
- [Phase 6: Non-interactive Print-mode CLI](./phase-6-print-mode-cli.md)
- [Phase 7: Session Tree and JSONL Persistence](./phase-7-session-tree.md)
- [Phase 8: Coding Session Wrapper](./phase-8-coding-session.md)
- [Phase 9: Skills and Prompt Templates](./phase-9-skills-prompts.md)
- [Phase 10: System Prompt Assembly](./phase-10-system-prompt.md)
- [Phase 11: Print and Event Rendering Modes](./phase-11-print-event-rendering.md)
- [Phase 12: Textual TUI](./phase-12-textual-tui.md)
- [Phase 13: Tau Home, Paths, and `.agents` Resources](./phase-13-paths-agents-resources.md)
- [Phase 14: Session Manager and Resume](./phase-14-session-manager-resume.md)
- [Phase 15: Slash Command Registry](./phase-15-slash-command-registry.md)
- [Phase 16: Robust Resource Discovery](./phase-16-resource-discovery.md)
- [Phase 17: TUI Slash-command Autocomplete](./phase-17-tui-autocomplete.md)
- [Phase 17.5: TUI Transcript Wrapping](./phase-17-5-transcript-wrapping.md)
- [Phase 18: Provider Configuration Foundation](./phase-18-provider-config-foundation.md)
- [Config-driven Provider Catalog](./config-driven-provider-catalog.md)
- [Codex Runtime Model Limits](./codex-runtime-model-limits.md)
- [Provider Retry Events](./provider-retries.md)
- [Provider/model safety and HTTP error details](./provider-model-safety.md)
- [Phase 19: Project Context Discovery and Reload](./phase-19-context-discovery.md)
- [Phase 20: Installation and Configuration Docs](./phase-20-installation-docs.md)
- [Phase 20.1: Context Accounting Refresh](./phase-20-1-context-accounting.md)
- [Phase 20.2: Thinking Mode Controls](./phase-20-2-thinking-controls.md)
- [Phase 20.3: Skill Invocation Reliability](./phase-20-3-skill-invocation.md)
- [Phase 20.4: Session Export and Visualization](./phase-20-4-session-export.md)
- [Queued Steering and Follow-ups](./queued-steering-follow-ups.md)
- [Pre-extension Hardening Summary](./pre-extension-hardening.md)
- [Phase 21: Extensions](./phase-21-extensions.md)
- [Trusted hidden built-in extensions](./trusted-built-in-extensions.md)
- [Phase 6: Local inference hardening and second-backend validation](./phase-6-local-inference-hardening.md)
- [Extension Installer](./extension-installer.md)
- [Phase 22: Compaction Replay Foundation](./phase-22-compaction-foundation.md)
- [Phase 23: Advanced TUI and Product Polish](./phase-23-tui-polish.md)
- [Bounded TUI Transcript Rendering](./tui-long-transcript-performance.md)
- [Phase 24: Session Tree Branching](./phase-24-session-tree-branching.md)

[译文]
- [阶段 1:核心类型与事件](./phase-1-core-types-and-events.md)
- [阶段 2:AI Provider 层](./phase-2-ai-provider-layer.md)
- [阶段 3:纯 Agent 循环](./phase-3-agent-loop.md)
- [阶段 4:AgentHarness](./phase-4-agent-harness.md)
- [阶段 5:内置编码工具](./phase-5-coding-tools.md)
- [多模态 read 工具结果](./multimodal-read-results.md)
- [有界的 read 图片处理](./read-image-processing.md)
- [阶段 6:非交互式 Print 模式 CLI](./phase-6-print-mode-cli.md)
- [阶段 7:会话树与 JSONL 持久化](./phase-7-session-tree.md)
- [阶段 8:编码会话包装层](./phase-8-coding-session.md)
- [阶段 9:技能与提示词模板](./phase-9-skills-prompts.md)
- [阶段 10:系统提示词组装](./phase-10-system-prompt.md)
- [阶段 11:Print 与事件渲染模式](./phase-11-print-event-rendering.md)
- [阶段 12:Textual TUI](./phase-12-textual-tui.md)
- [阶段 13:Tau 主目录、路径与 `.agents` 资源](./phase-13-paths-agents-resources.md)
- [阶段 14:会话管理器与恢复](./phase-14-session-manager-resume.md)
- [阶段 15:斜杠命令注册表](./phase-15-slash-command-registry.md)
- [阶段 16:健壮的资源发现](./phase-16-resource-discovery.md)
- [阶段 17:TUI 斜杠命令自动补全](./phase-17-tui-autocomplete.md)
- [阶段 17.5:TUI 会话记录换行](./phase-17-5-transcript-wrapping.md)
- [阶段 18:Provider 配置基础](./phase-18-provider-config-foundation.md)
- [配置驱动的 Provider 目录](./config-driven-provider-catalog.md)
- [Codex 运行时模型上限](./codex-runtime-model-limits.md)
- [Provider 重试事件](./provider-retries.md)
- [Provider/模型安全与 HTTP 错误详情](./provider-model-safety.md)
- [阶段 19:项目上下文发现与重载](./phase-19-context-discovery.md)
- [阶段 20:安装与配置文档](./phase-20-installation-docs.md)
- [阶段 20.1:上下文计量刷新](./phase-20-1-context-accounting.md)
- [阶段 20.2:Thinking 模式控制](./phase-20-2-thinking-controls.md)
- [阶段 20.3:技能调用可靠性](./phase-20-3-skill-invocation.md)
- [阶段 20.4:会话导出与可视化](./phase-20-4-session-export.md)
- [排队插话与追加](./queued-steering-follow-ups.md)
- [扩展系统之前的加固总结](./pre-extension-hardening.md)
- [阶段 21:扩展](./phase-21-extensions.md)
- [受信的内置隐藏扩展](./trusted-built-in-extensions.md)
- [阶段 6:本地推理加固与第二后端验证](./phase-6-local-inference-hardening.md)
- [扩展安装器](./extension-installer.md)
- [阶段 22:压缩重放基础](./phase-22-compaction-foundation.md)
- [阶段 23:高级 TUI 与产品化打磨](./phase-23-tui-polish.md)
- [有界的 TUI 会话记录渲染](./tui-long-transcript-performance.md)
- [阶段 24:会话树分支](./phase-24-session-tree-branching.md)

[原文]
Phase 21 extensions are implemented; see the phase note and the user guide at
`website/content/guides/extensions.md`.

[译文]
阶段 21 的扩展系统已经实现;见对应的阶段笔记以及用户指南 `website/content/guides/extensions.md`。
