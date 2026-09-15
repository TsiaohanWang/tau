---
title: "Slash commands / 斜杠命令"
description: "Every in-session slash command in the Tau TUI. / Tau TUI 中所有会话内斜杠命令。"
---

[原文]
Type these inside the interactive [TUI]({{< relref "../guides/tui.md" >}}). Open the searchable
command palette with **Ctrl+K**.

[译文]
在交互式 [TUI]({{< relref "../guides/tui.md" >}}) 内输入这些命令。用 **Ctrl+K** 打开可搜索的命令面板。

[原文]
| Command | Description |
| --- | --- |
| `/quit` | Exit the session |
| `/new` | Start a new session |
| `/session` | Show session info and stats (model, cwd, tools, skills, context) |
| `/system` | Show the active system prompt grouped by source without adding it to context or session history |
| `/compact [instructions]` | Summarize and compact the active context |
| `/export [--format html\|jsonl] [dest]` | Export the current session |
| `/resume [session-id]` | Resume a previous session, or open the picker |
| `/tree` | Branch from an earlier point in the session tree |
| `/name <new name>` | Rename the current session and, in supported terminals, the terminal tab title |
| `/model` | Refresh provider catalogs and open the model picker |
| `/tools` | Browse active tools and open their full descriptions |
| `/scoped-models` | Refresh provider catalogs and choose favorite models for the Ctrl+P / Shift+Ctrl+P quick-cycle |
| `/theme [name]` | Show or set the TUI theme |
| `/login [provider]` | Connect a built-in provider with OAuth or an API key; Anthropic uses `anthropic-subscription` or `anthropic-api` |
| `/local` | Choose and manage a registered local backend; interactive-only. Compatible llama.cpp routers add explicit load/unload, Hugging Face GGUF search, and server-side download actions with confirmation and reconciliation. |
| `/sidebar` | Toggle the sidebar for this session without changing `tui.json` |
| `/logout [provider]` | Remove saved credentials for a provider |
| `/reload` | Reload local skills, prompts, extensions, and project context |
| `/prompts` | Search loaded prompt templates; press Enter to insert an invocation or Ctrl+E to edit the file |
| `/hotkeys` | Show the keyboard shortcuts |
| `/skills` | Open a searchable picker of loaded skills and insert a selection into the prompt |
| `/skill:<name> [request]` | Expand a loaded skill into your prompt |

[译文]
| 命令 | 说明 |
| --- | --- |
| `/quit` | 退出会话 |
| `/new` | 开始新会话 |
| `/session` | 展示会话信息与统计(模型、cwd、工具、技能、上下文) |
| `/system` | 按来源分组展示活动系统提示词,但不把它加入上下文或会话历史 |
| `/compact [instructions]` | 总结并压缩活动上下文 |
| `/export [--format html\|jsonl] [dest]` | 导出当前会话 |
| `/resume [session-id]` | 恢复此前的会话,或打开选择器 |
| `/tree` | 从会话树的更早位置分支 |
| `/name <new name>` | 重命名当前会话;在受支持的终端中同时重命名终端标签页标题 |
| `/model` | 刷新 provider 目录并打开模型选择器 |
| `/tools` | 浏览活动工具并打开它们的完整描述 |
| `/scoped-models` | 刷新 provider 目录并挑选收藏模型,用于 Ctrl+P / Shift+Ctrl+P 快速循环 |
| `/theme [name]` | 显示或设置 TUI 主题 |
| `/login [provider]` | 用 OAuth 或 API key 连接内置 provider;Anthropic 使用 `anthropic-subscription` 或 `anthropic-api` |
| `/local` | 选择并管理已注册的本地后端;仅交互模式可用。兼容的 llama.cpp router 还会提供显式的加载/卸载、Hugging Face GGUF 搜索,以及带确认与状态协调的服务端下载操作。 |
| `/sidebar` | 仅在本会话中切换侧边栏,不改动 `tui.json` |
| `/logout [provider]` | 移除某个 provider 已保存的凭据 |
| `/reload` | 重新加载本地技能、提示词、扩展与项目上下文 |
| `/prompts` | 搜索已加载的提示词模板;按 Enter 插入一次调用,或按 Ctrl+E 编辑该文件 |
| `/hotkeys` | 显示键盘快捷键 |
| `/skills` | 打开已加载技能的可搜索选择器,并把所选技能插入提示输入 |
| `/skill:<name> [request]` | 把已加载的技能展开进你的提示 |

[原文]
`/system` labels contiguous prompt sections with their origin, including Tau's
built-in prompt, `SYSTEM.md` and `APPEND_SYSTEM.md` files, project instruction
files, skills, extension sections, and runtime date/cwd values. In the TUI,
each section uses a separate faint background matching its source-name color.
If the active prompt no longer matches Tau's deterministic composition, Tau conservatively
shows one runtime-composed source instead of guessing.

[译文]
`/system` 会为每个连续的提示词区块标注来源,包括 Tau 的内置提示词、`SYSTEM.md` 与 `APPEND_SYSTEM.md` 文件、项目指令文件、技能、扩展区块,以及运行时的日期/cwd 值。在 TUI 中,每个区块使用一块与其来源名颜色匹配的淡色背景。如果活动提示词已不再与 Tau 的确定性组合结果一致,Tau 会保守地展示单个由运行时组合的来源,而不是去猜测。

[原文]
{{% note title="Live HTML exports include the system prompt" %}}
`/export` includes the current system prompt in a collapsed section when it
creates HTML. Review it before sharing because it may expose project
instructions or other local context. JSONL exports do not include the prompt.
Offline `tau export` from stored JSONL cannot recover it and omits the section.
The HTML export's **Usage** view charts token and cache activity. Its prompt-input
chart marks compactions, model and thinking-level changes, and branch summaries
against the next model request so cache changes have session context.
{{% /note %}}

[译文]
{{% note title="实时 HTML 导出会包含系统提示词" %}}
`/export` 生成 HTML 时,会把当前系统提示词放进一个默认折叠的区块。分享之前请先检查,因为它可能暴露项目指令或其他本地上下文。JSONL 导出不包含该提示词。从已存储 JSONL 离线执行的 `tau export` 无法恢复它,因此会省略该区块。HTML 导出的 **Usage** 视图会以图表展示 token 与缓存活动。它的提示输入图会把压缩、模型与 thinking 等级变更、分支摘要标记到下一次模型请求上,让缓存变化拥有会话上下文。
{{% /note %}}

[原文]
{{% note title="`/skill:` is special" %}}
`/skill:<name>` is a *prompt-expansion* path, not a normal command — Tau expands
the named skill into your prompt and runs it as a turn. Its optional request may
start on the same line or on following lines. See
[Skills & prompt templates]({{< relref "../guides/skills-and-prompts.md" >}}).
{{% /note %}}

[译文]
{{% note title="`/skill:` 是特殊的" %}}
`/skill:<name>` 是一条*提示词展开*路径,而不是普通命令 —— Tau 会把指定技能展开进你的提示,并把它作为一轮运行。它可选的请求可以从同一行开始,也可以从后续行开始。见[技能与提示词模板]({{< relref "../guides/skills-and-prompts.md" >}})。
{{% /note %}}

[原文]
Only registered commands are consumed locally. Other slash-prefixed input, including
absolute paths such as `/tmp` or `/Users/me/file.png`, is sent to the model as a normal
prompt.

[译文]
只有已注册的命令才会在本地被消费。其他以斜杠开头的内容,包括 `/tmp` 或 `/Users/me/file.png` 这样的绝对路径,都会作为普通提示发送给模型。

[原文]
Related:

[译文]
相关:

[原文]
- **Thinking mode** is keyboard-driven, not a slash command — see
  [Keyboard shortcuts]({{< relref "./keybindings.md" >}}) and [Managing context]({{< relref "../guides/context.md#thinking-modes" >}}).
- **Prompt templates** use slash invocations (for example, `/wt …`). Use `/prompts` to search loaded templates, insert an invocation without submitting it, or edit a selected template with **Ctrl+E**.

[译文]
- **Thinking 模式**由键盘驱动,不是斜杠命令 —— 见[键盘快捷键]({{< relref "./keybindings.md" >}})与[管理上下文]({{< relref "../guides/context.md#thinking-modes" >}})。
- **提示词模板**使用斜杠调用(例如 `/wt …`)。用 `/prompts` 搜索已加载模板、插入一次调用但不提交,或用 **Ctrl+E** 编辑所选模板。
