---
title: "Core concepts / 核心概念"
description: "The handful of ideas behind Tau — agents, providers, tools, sessions, skills, context, and thinking. / Tau 背后的少数几个想法:agent、provider、工具、会话、技能、上下文与 thinking。"
type: doc
---

[原文]
Tau is built from a small set of concepts. Understand these and the rest of the
docs (and the agent itself) will make sense.

[译文]
Tau 由一小组概念构成。理解了它们,其余的文档(以及这个 agent 本身)就都说得通了。

## Agent 循环(The agent loop)

[原文]
When you send a prompt, Tau runs an **agent loop**: it asks the model to respond,
streams that response, and when the model asks to use a **tool**, Tau runs the
tool, feeds the result back, and asks the model to continue — repeating until the
model has nothing left to do. That loop is the heart of every coding agent.
→ [How Tau works: the agent loop]({{< relref "./internals/agent-loop.md" >}})

[译文]
当你发送一条提示,Tau 会运行一个 **agent 循环**:它请求模型作答、流式接收响应;当模型要求使用某个**工具**时,Tau 运行该工具、把结果回喂给模型、再请模型继续 —— 如此往复,直到模型无事可做。这个循环就是每一个编码 agent 的心脏。
→ [Tau 如何工作:agent 循环]({{< relref "./internals/agent-loop.md" >}})

## Provider 与模型(Providers and models)

[原文]
A **provider** is the service that hosts AI models (OpenAI, Anthropic, OpenAI
Codex, OpenRouter, Hugging Face, or any OpenAI-compatible endpoint). A **model**
is the specific brain you're talking to (e.g. `gpt-5.5`, `claude-sonnet-4-6`).
You pick a provider + model; you can switch either mid-session.
→ [Providers & models]({{< relref "./guides/providers-and-models.md" >}})

[译文]
**provider** 是托管 AI 模型的服务(OpenAI、Anthropic、OpenAI Codex、OpenRouter、Hugging Face,或任何 OpenAI 兼容端点)。**模型**是你正在对话的那个具体大脑(例如 `gpt-5.5`、`claude-sonnet-4-6`)。你选择 provider + 模型;两者都可以在会话中途切换。
→ [Provider 与模型]({{< relref "./guides/providers-and-models.md" >}})

## 工具(Tools)

[原文]
**Tools** are the actions the agent can take in your project. Tau ships four:
`read`, `write`, `edit`, and `bash`. The model decides when to call them; Tau
executes them in your working directory and streams the results.
→ [Tools reference]({{< relref "./reference/tools.md" >}})

[译文]
**工具**是 agent 在你的项目中可以执行的动作。Tau 自带四个:`read`、`write`、`edit` 与 `bash`。何时调用由模型决定;Tau 在你的工作目录中执行它们并流式返回结果。
→ [工具参考]({{< relref "./reference/tools.md" >}})

## 会话(Sessions)

[原文]
A **session** is one ongoing conversation plus everything the agent did in it.
Sessions are saved to disk as append-only files, so you can **resume** them
later. Because the history is a tree, you can also **branch** from any earlier
point to try a different direction, and **export** a session to HTML or JSONL.
→ [Sessions]({{< relref "./guides/sessions.md" >}})

[译文]
**会话**是一段持续进行的对话,加上 agent 在其中所做的一切。会话以只追加文件的形式保存到磁盘,因此你可以之后**恢复**它。由于历史是一棵树,你还可以从任意更早的位置**分支**去尝试另一个方向,并把会话**导出**为 HTML 或 JSONL。
→ [会话]({{< relref "./guides/sessions.md" >}})

## 项目指令 / Project instructions (`AGENTS.md`)

[原文]
An **`AGENTS.md`** file gives the agent standing instructions about *your*
project — conventions, gotchas, how to run tests. Tau discovers these files
automatically and folds them into the system prompt.
→ [Project instructions]({{< relref "./guides/project-instructions.md" >}})

[译文]
**`AGENTS.md`** 文件向 agent 提供关于*你的*项目的常驻指令 —— 约定、坑点、如何跑测试。Tau 会自动发现这些文件,并把它们折入系统提示词。
→ [项目指令]({{< relref "./guides/project-instructions.md" >}})

## 技能与提示词模板(Skills and prompt templates)

[原文]
**Skills** are Markdown files describing how to do a specific task; you invoke
one with `/skill:<name>`. **Prompt templates** are reusable prompts you trigger
by name (with optional variables) instead of retyping. Both can live at the user
level (all projects) or per-project.
→ [Skills & prompt templates]({{< relref "./guides/skills-and-prompts.md" >}})

[译文]
**技能**是描述如何完成某项具体任务的 Markdown 文件;用 `/skill:<name>` 调用。**提示词模板**是可按名称触发(可带变量)的可复用提示词,省去反复重打。两者都可以放在用户级(对所有项目生效)或项目级。
→ [技能与提示词模板]({{< relref "./guides/skills-and-prompts.md" >}})

## 上下文与压缩(Context and compaction)

[原文]
The model can only "see" a limited amount of text at once — its **context
window**. Long sessions fill it up. Tau estimates usage and **compacts**
automatically: it summarizes older messages so the conversation can keep going.
You can also compact on demand with `/compact`.
→ [Managing context]({{< relref "./guides/context.md" >}})

[译文]
模型一次只能「看到」有限的文本量 —— 这就是它的**上下文窗口**。长会话会把它填满。Tau 会估算用量并自动**压缩**:把较旧的消息总结掉,让对话继续下去。你也可以用 `/compact` 按需压缩。
→ [管理上下文]({{< relref "./guides/context.md" >}})

## Thinking 模式(Thinking modes)

[原文]
Some models can spend extra effort "thinking" before they answer. Tau exposes a
**thinking mode** (off → minimal → low → medium → high → xhigh → max) you can cycle
when the active model supports it, and optionally show the streamed reasoning.
→ [Managing context]({{< relref "./guides/context.md#thinking-modes" >}})

[译文]
有些模型会在回答之前花额外力气「思考」。Tau 暴露一个 **thinking 模式**(off → minimal → low → medium → high → xhigh → max),当活动模型支持时你可以循环切换,并可选地展示流式推理内容。
→ [管理上下文]({{< relref "./guides/context.md#thinking-modes" >}})

## 两种界面(Two interfaces)

[原文]
Tau runs as an **interactive TUI** (the default) or in **print mode** (`-p`) for
a single non-interactive prompt. Both share the same session environment.
→ [The interactive session]({{< relref "./guides/tui.md" >}}) · [Print mode]({{< relref "./guides/print-mode.md" >}})

[译文]
Tau 既可以作为**交互式 TUI** 运行(默认),也可以进入 **print 模式**(`-p`)处理单条非交互式提示。两者共享同一个会话环境。
→ [交互式会话]({{< relref "./guides/tui.md" >}}) · [Print 模式]({{< relref "./guides/print-mode.md" >}})
