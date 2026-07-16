---
title: Architecture overview
description: How Tau is split into three layers — and why that boundary is the whole point.
---

Tau 在设计上有意保持精简且分层。最重要的设计理念是一道**边界**:可复用的智能体"大脑"对终端、文件路径或渲染一无所知。所有与应用相关的部分都包裹在它外围。

## Three packages

```text
tau_coding  →  tau_agent  →  tau_ai
```

### `tau_ai` — talking to models

负责与提供方相关的模型流式传输。它把各提供方(OpenAI、Anthropic 等)的 API 转换为 Tau 的**提供方无关事件流**,因而其上层无需关心当前使用的是哪家模型厂商。

### `tau_agent` — the portable brain

负责可复用的智能体核心:消息、工具、事件、[agent loop]({{< relref "./agent-loop.md" >}})、harness 与会话原语。该包**禁止**引入 CLI、Rich、Textual 或资源加载代码。这正是它保持可移植的原因。

### `tau_coding` — the coding application

负责让 Tau 成为"你运行的编码智能体"的一切:CLI、内置[工具]({{< relref "../reference/tools.md" >}})、[项目指令]({{< relref "../guides/project-instructions.md" >}})、
[技能与提示]({{< relref "../guides/skills-and-prompts.md" >}})、
[磁盘上的会话]({{< relref "../guides/sessions.md" >}})、提供方配置,以及
Textual TUI。

## Dependency direction

依赖只指向一个方向:`tau_coding → tau_agent → tau_ai`。UI 代码*消费*事件;核心绝不向上伸手去渲染任何东西。简言之:

```text
AgentHarness = reusable brain
CodingSession = coding-agent environment
TUI = one possible frontend
```

## Why the boundary matters

因为核心是 UI 无关的,同一个智能体可以驱动打印模式、Textual TUI,或你自己构建的前端——全都通过消费同一条事件流实现。这也正是 Tau 易于阅读的原因:每一层只回答一个问题,你可以单独研究它而无需理清其他层。

这些并非偶然的选择。项目在仓库 README 中明确列出了其设计原则,它们是下层每一层都必须遵守的契约:

> - **小层胜于魔法。** 每个包只做一件事,且可单独阅读。
> - **事件即契约。** 提供方、渲染器、TUI 与自定义前端在一个有类型的事件流处相遇。
> - **核心保持可移植。** 可复用的 harness 不依赖 CLI、Textual、Rich 或 Tau 的文件布局。
> - **工具就是普通的类型化函数。** 一个工具是一份 schema 加上一个返回结构化结果的异步执行器。
> - **会话持久且可检视。** 历史是只追加的 JSONL;活动上下文可以被压缩而无须重写记录。
>
> — Tau README,"Design principles"

这正是 `tau_agent` 被禁止引入 Textual 或 Rich 的原因,也是提供方流是一套*中性*事件词汇而非厂商形态对象的原因,更是 `CodingSession`(而非 `AgentHarness`)承载斜杠命令与文件工具的原因。边界本身就是特性;其余一切都是它的结果。

 → Next: [The agent loop & events]({{< relref "./agent-loop.md" >}}) ·
 [Design principles]({{< relref "./design-principles.md" >}}) ·
 [Build your own frontend]({{< relref "./custom-frontend.md" >}})

 若想对每个模块进行逐文件、自下而上的剖析(基于阅读源码得出),请从
 [Source code walkthrough]({{< relref "./source-walkthrough.md" >}}) 开始。

{{% note title="Going deeper" %}}
逐阶段的构建日志、设计文档与 ADR 存放在仓库的 `dev-notes/` 目录下(不在本网站)。参见 [Contributing]({{< relref "../contributing.md" >}})。
{{% /note %}}
