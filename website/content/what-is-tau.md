---
title: "What is Tau? / 什么是 Tau?"
description: "Tau is a small, readable coding agent for your terminal — and a working example of how coding agents are built. / Tau 是一个小巧、易读的终端编码 agent,也是一个「编码 agent 是如何构建的」的可运行示例。"
type: doc
---

[原文]
**Tau is a coding agent that lives in your terminal.** You type what you want in
plain English — "explain this repo", "add tests for the parser", "fix this
stack trace" — and Tau reads files, runs commands, and edits code to get it
done, streaming its work as it goes.

[译文]
**Tau 是一个住在你终端里的编码 agent。** 你用日常语言说出你想要什么 —— 「解释这个仓库」「给解析器加测试」「修掉这个堆栈」—— Tau 就会读文件、跑命令、改代码把它办成,并全程流式展示自己正在做什么。

[原文]
It's two things at once:

[译文]
它同时是两样东西:

[原文]
- **A tool you can use.** A real terminal coding agent with an interactive UI,
  multiple model providers, durable sessions you can resume and branch, and a
  resource system for your own skills and prompts.
- **A project you can learn from.** Tau is built to be *read*. Its source is
  organized into small, honest layers so you can see exactly how a coding agent
  works — from model streaming, to the agent loop, to tools and sessions.

[译文]
- **一个可以拿来用的工具。** 一个真正的终端编码 agent:带交互式 UI、支持多家模型 provider、会话持久化且可恢复与分支,还有一套属于你自己的技能与提示词资源系统。
- **一个可以拿来学的项目。** Tau 生来就是给人*读*的。它的源码按一层层小而诚实的结构组织,让你能看清编码 agent 究竟如何工作 —— 从模型流式输出,到 agent 循环,再到工具与会话。

[原文]
{{% note title="Why \"Tau\"?" %}}
The name is a small joke about picking the *right* foundation. See
[Why "Tau"?](../why-tau/) for the (genuinely fun) math rant behind it.
{{% /note %}}

[译文]
{{% note title="为什么叫 \"Tau\"?" %}}
这个名字是在开一个关于选择*正确*基础的玩笑。想了解背后那段(真的很好玩的)数学吐槽,见
[Why "Tau"?](../why-tau/)。
{{% /note %}}

## 它能做什么?(What can it do?)

[原文]
- Hold a conversation while **reading, writing, and editing files** and
  **running shell commands** in your project.
- Work in an **interactive TUI** or as a **one-shot command** for scripts and
  pipes.
- Talk to **OpenAI, Anthropic, OpenAI Codex, OpenRouter, Hugging Face**, or any
  OpenAI-compatible endpoint (including local models).
- **Remember** every session, let you **resume** it later, and **branch** from
  any earlier point to explore a different path.
- Stay usable in long sessions by **compacting** context automatically, and
  expose **thinking modes** on models that support them.
- Extend itself with your own **skills**, **prompt templates**, and per-project
  **instructions** (`AGENTS.md`).

[译文]
- 在项目中进行**读文件、写文件、改文件**与**运行 shell 命令**的同时保持对话。
- 既能以**交互式 TUI** 工作,也能作为**一次性命令**用于脚本与管道。
- 对接 **OpenAI、Anthropic、OpenAI Codex、OpenRouter、Hugging Face**,或任何 OpenAI 兼容端点(包括本地模型)。
- **记住**每一个会话,之后可以**恢复**,还能从任意早先位置**分支**去探索另一条路径。
- 通过自动**压缩**上下文,在长会话中保持可用;并在支持该能力的模型上暴露 **thinking 模式**。
- 用你自己的**技能**、**提示词模板**与按项目的**指令**(`AGENTS.md`)扩展它。

## 它是给谁用的?(Who is it for?)

[原文]
- **You want a coding agent you can run and shape** — install it, point it at a
  model, and work. Start with the [Quickstart]({{< relref "./quickstart.md" >}}).
- **You want to understand how coding agents are built** — read the
  [core concepts]({{< relref "./concepts.md" >}}), then the [How Tau works]({{< relref "./internals/architecture.md" >}})
  section.

[译文]
- **你想要一个能跑起来、也能改造的编码 agent** —— 装上它,指向一个模型,然后开始干活。从[快速上手]({{< relref "./quickstart.md" >}})开始。
- **你想理解编码 agent 是如何构建的** —— 先读[核心概念]({{< relref "./concepts.md" >}}),再读[「Tau 如何工作」]({{< relref "./internals/architecture.md" >}})一节。

## 接下来去哪里(Where to go next)

[原文]
- **[Quickstart]({{< relref "./quickstart.md" >}})** — install Tau and run your first session in
  a few minutes.
- **[Core concepts]({{< relref "./concepts.md" >}})** — the handful of ideas (agent loop,
  providers, tools, sessions, skills) that everything else builds on.
- **[Guides]({{< relref "./guides/tui.md" >}})** — task-focused how-tos for the TUI, sessions,
  providers, and more.
- **[Reference]({{< relref "./reference/cli.md" >}})** — exact CLI commands, slash commands, and
  keyboard shortcuts.

[译文]
- **[快速上手]({{< relref "./quickstart.md" >}})** —— 几分钟内安装 Tau 并跑完第一个会话。
- **[核心概念]({{< relref "./concepts.md" >}})** —— 少数几个支撑其余一切的想法(agent 循环、provider、工具、会话、技能)。
- **[指南]({{< relref "./guides/tui.md" >}})** —— 面向具体任务的 TUI、会话、provider 等操作说明。
- **[参考]({{< relref "./reference/cli.md" >}})** —— 精确的 CLI 命令、斜杠命令与键盘快捷键。
