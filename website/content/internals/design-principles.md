---
title: Design principles
description: The handful of rules that keep Tau small, portable, and readable.
---

Tau 始终遵循少数几条原则。这正是代码库在增长过程中仍能保持易读的原因。这些原则在项目的 README("Design principles" 一节)中原样列明,是每一层都必须遵守的契约;下面各页解释了每一条在代码中是什么样子。它们源自——并在很大程度上映照了——[Pi](https://pi.dev) 对*智能体大脑*、*编码会话*与*前端*的极简分离,而这一架构正是 Tau 明确借鉴的对象(参见项目 README 与 [Architecture overview]({{< relref "./architecture.md" >}}))。

## Small layers beat magic

每个包只做一件事:`tau_ai` 流式传输模型,`tau_agent` 运行循环,`tau_coding` 是应用程序。你可以独自阅读并测试任何一层,而无需理解其他层。→ [Architecture]({{< relref "./architecture.md" >}})

## Events are the contract

智能体通过一条提供方无关的事件流来传达进度。前端从这些事件进行渲染,绝不来自提供方特定的数据块或内部控制流。正是这一点让打印模式、TUI 与自定义前端能够共享同一个核心。→ [The agent loop & events]({{< relref "./agent-loop.md" >}})

## The core stays portable

`tau_agent` 不得依赖 Textual、Rich、CLI、配置目录、斜杠命令或应用特定的资源。它们存在于 `tau_coding` 中,并从外部包裹核心。可复用的"大脑"绝不向上伸入某个 UI。

## Tools are ordinary typed functions

一个工具就是一个名称、一段描述、一份 JSON 输入 schema,以及一个返回结构化结果的异步执行器。没有任何框架魔法——这使得工具易于阅读、测试和添加。→ [Built-in tools]({{< relref "../reference/tools.md" >}})

## Sessions are durable and inspectable

每次对话都是磁盘上一份只追加的 JSONL 记录。历史是一棵你可以恢复与分叉的树;压缩改变的是*活动*上下文,而无需重写记录本身。该格式足够简单,可以手工阅读。
→ [Sessions]({{< relref "../guides/sessions.md" >}})

## Small product divergences are explicit

Tau 大体上遵循 [Pi](https://pi.dev) 对智能体大脑、编码会话与前端的极简分离。少数面向用户的便利功能有意偏离了这一基线。一个例子是自动会话命名:Tau 在第一条用户消息被持久化后,向当前活动的提供方/模型请求一个简短标题,并将该标题作为会话元数据存储。它仍留在 `tau_coding` 中,而非可移植的 `tau_agent` harness,因为它属于应用工作流而非智能体循环行为。

## Documentation follows implementation

Tau 以小型、有文档记录的阶段逐步构建,以便读者能够追溯系统是如何成长起来的。那些阶段笔记存放在仓库的 `dev-notes/` 目录下(参见 [Contributing]({{< relref "../contributing.md" >}}));本页则提炼了其成果。
