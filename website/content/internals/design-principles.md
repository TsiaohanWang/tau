---
title: "Design principles / 设计原则"
description: "The handful of rules that keep Tau small, portable, and readable. / 让 Tau 保持小巧、可移植、可读的少数几条规则。"
---

[原文]
Tau follows a few principles consistently. They're why the codebase stays
approachable as it grows.

[译文]
Tau 始终如一地遵循少数几条原则。它们正是这份代码库在成长中依然平易近人的原因。

## 小层胜过魔法(Small layers beat magic)

[原文]
Each package has one job: `tau_ai` streams models, `tau_agent` runs the loop,
`tau_coding` is the application. You can read and test any layer on its own
without understanding the others. → [Architecture]({{< relref "./architecture.md" >}})

[译文]
每个包只做一件事:`tau_ai` 负责模型流式输出,`tau_agent` 负责运行循环,`tau_coding` 是应用本身。你可以在不理解其他层的情况下单独阅读和测试任何一层。→ [架构]({{< relref "./architecture.md" >}})

## 事件就是契约(Events are the contract)

[原文]
The agent communicates progress through a stream of provider-neutral events.
Frontends render from those events, never from provider-specific chunks or
internal control flow. This is what lets print mode, the TUI, and custom
frontends share one core. → [The agent loop & events]({{< relref "./agent-loop.md" >}})

[译文]
Agent 通过一条 provider 无关的事件流传达进度。前端从这些事件渲染,绝不从 provider 特有的分片或内部控制流渲染。正是这一点让 print 模式、TUI 与自定义前端共享同一个内核。→ [Agent 循环与事件]({{< relref "./agent-loop.md" >}})

## 内核保持可移植(The core stays portable)

[原文]
`tau_agent` must not depend on Textual, Rich, the CLI, config directories, slash
commands, or app-specific resources. Those live in `tau_coding` and wrap the
core from outside. The reusable brain never reaches up into a UI.

[译文]
`tau_agent` 不得依赖 Textual、Rich、CLI、配置目录、斜杠命令或应用特有的资源。它们都住在 `tau_coding`,从外部包裹内核。可复用的大脑永远不会向上伸手去碰 UI。

## 工具就是普通的带类型函数(Tools are ordinary typed functions)

[原文]
A tool is a name, a description, a JSON input schema, and an async executor that
returns a structured result. There's no framework magic — which makes tools easy
to read, test, and add. → [Built-in tools]({{< relref "../reference/tools.md" >}})

[译文]
一个工具就是名称、描述、JSON 输入 schema,以及一个返回结构化结果的异步执行器。没有任何框架魔法 —— 这使工具易于阅读、测试与新增。→ [内置工具]({{< relref "../reference/tools.md" >}})

## 会话可持久化且可检查(Sessions are durable and inspectable)

[原文]
Every conversation is an append-only JSONL transcript on disk. History is a tree
you can resume and branch; compaction changes the *active* context without
rewriting the record. The format is plain enough to read by hand.
→ [Sessions]({{< relref "../guides/sessions.md" >}})

[译文]
每段对话都是磁盘上一份只追加的 JSONL 会话记录。历史是一棵树,你可以恢复与分支;压缩改变的是*活动*上下文,而不重写记录。这个格式足够朴素,可以直接手工阅读。
→ [会话]({{< relref "../guides/sessions.md" >}})

## 小的产品差异是显式的(Small product divergences are explicit)

[原文]
Tau mostly follows [Pi](https://pi.dev)'s minimalist separation of agent brain,
coding session, and frontend. A few user-facing conveniences intentionally
diverge from that baseline. One example is automatic session naming: Tau asks the active
provider/model for a short title after the first user message is persisted, then
stores that title as session metadata. This remains in `tau_coding`, not the
portable `tau_agent` harness, because it is application workflow rather than
agent-loop behavior.

[译文]
Tau 大体上遵循 [Pi](https://pi.dev) 对「agent 大脑、编码会话与前端」的极简划分。少数面向用户的便利功能有意偏离了这个基线。一个例子是自动会话命名:在第一条用户消息持久化之后,Tau 会向活动的 provider/模型请求一个简短标题,再把该标题存为会话元数据。它留在 `tau_coding`,而不是可移植的 `tau_agent` harness,因为它是应用工作流,而不是 agent 循环的行为。

## 文档跟随实现(Documentation follows implementation)

[原文]
Tau was built in small, documented phases so a reader can trace how the system
grew. Those phase notes live in the repo under `dev-notes/` (see
[Contributing]({{< relref "../contributing.md" >}})); these pages distill the result.

[译文]
Tau 以一个个小而可记录文档的阶段构建起来,让读者能够追溯系统是如何成长的。那些阶段笔记位于仓库的 `dev-notes/`(见[参与贡献]({{< relref "../contributing.md" >}}));而这里的页面只提炼结果。
