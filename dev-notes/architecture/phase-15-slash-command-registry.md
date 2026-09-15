---
title: "Phase 15: Slash Command Registry / 阶段 15:斜杠命令注册表"
---

[原文]
Phase 15 replaces Tau's hardcoded slash-command handling with a small registry in
`tau_coding`.

[译文]
阶段 15 用 `tau_coding` 中的一个小型注册表替换了 Tau 硬编码的斜杠命令处理。

[原文]
The implementation lives in:

[译文]
实现位于:

```text
src/tau_coding/commands.py
```

## 新增了什么(What was added)

[原文]
Tau now has a `CommandRegistry` that can:

- register slash commands with names, aliases, descriptions, and usage text
- list registered commands for generated help output
- parse slash-command input
- dispatch commands to handlers
- return structured command results to UI layers

[译文]
Tau 现在有了 `CommandRegistry`,它可以:

- 注册斜杠命令,包含名称、别名、描述与用法文本
- 列出已注册命令,用于生成帮助输出
- 解析斜杠命令输入
- 把命令分派给处理器
- 向 UI 层返回结构化的命令结果

[原文]
The core command types are:

[译文]
核心命令类型有:

```python
SlashCommand
CommandContext
CommandResult
CommandRegistry
```

[原文]
`CodingSession.handle_command()` now delegates to the registry instead of
hardcoding command behavior.

[译文]
`CodingSession.handle_command()` 现在委托给注册表,而不再硬编码命令行为。

## 内置命令(Built-in commands)

[原文]
The default registry includes:

- `/quit` — exit the current session
- `/new` — start a new session
- `/compact` — replace active context with a manual summary
- `/export` — export the current session
- `/session` — show session info and stats
- `/hotkeys` — show common TUI keyboard shortcuts
- `/resume` — open previous-session selection or resume a specific session id
- `/model` — choose or switch the current model
- `/login` — add or refresh a built-in provider login
- `/reload` — reload local resources and project context
- `/name` — rename the current session
- `/theme` — show or set the TUI theme

[译文]
默认注册表包含:

- `/quit` —— 退出当前会话
- `/new` —— 开始新会话
- `/compact` —— 用一份手动摘要替换活动上下文
- `/export` —— 导出当前会话
- `/session` —— 展示会话信息与统计
- `/hotkeys` —— 展示常用 TUI 键盘快捷键
- `/resume` —— 打开历史会话选择,或恢复指定的会话 id
- `/model` —— 选择或切换当前模型
- `/login` —— 添加或刷新内置 provider 登录
- `/reload` —— 重新加载本地资源与项目上下文
- `/name` —— 重命名当前会话
- `/theme` —— 显示或设置 TUI 主题

[原文]
Autocomplete also uses non-executable search terms. For example, typing
`/clear` suggests `/new`, but search terms are not registered commands.

[译文]
自动补全还使用不可执行的搜索词。例如输入 `/clear` 会建议 `/new`,但搜索词本身并不是已注册命令。

## 为什么它属于 `tau_coding`(Why this belongs in `tau_coding`)

[原文]
Slash commands are coding-agent application behavior. They depend on resources,
sessions, skills, provider/model UX, and UI expectations.

[译文]
斜杠命令是编码 agent 的应用行为。它们依赖资源、会话、技能、provider/模型交互以及 UI 预期。

[原文]
The reusable `tau_agent` package remains independent of slash commands, Textual,
Typer, local config directories, and Tau-specific product behavior.

[译文]
可复用的 `tau_agent` 包仍然独立于斜杠命令、Textual、Typer、本地配置目录以及 Tau 特有的产品行为。

## 与 Pi 命令对齐(Pi command alignment)

[原文]
Pi's built-in command list includes:

[译文]
Pi 的内置命令列表包括:

```text
settings, model, scoped-models, export, import, share, copy, name, session,
changelog, hotkeys, fork, clone, tree, login, logout, new, compact, resume,
reload, quit
```

[原文]
Tau mirrors the commands that map cleanly onto existing Tau capabilities:

[译文]
Tau 镜像了那些能干净地映射到现有 Tau 能力的命令:

[原文]
- `/session` maps to Tau's existing session status/details output.
- `/hotkeys` reports Tau's current common TUI shortcuts.
- `/quit` is the only registered exit command; older Tau-specific `/exit` and
  `/q` aliases are intentionally not retained.
- `/model`, `/login`, `/new`, `/compact`, `/resume`, `/reload`, `/name`,
  `/theme`, and `/export` exist in Tau's command registry.

[译文]
- `/session` 映射到 Tau 已有的会话状态/详情输出。
- `/hotkeys` 报告 Tau 当前常用的 TUI 快捷键。
- `/quit` 是唯一注册的退出命令;Tau 早期特有的 `/exit` 与 `/q` 别名被有意不再保留。
- `/model`、`/login`、`/new`、`/compact`、`/resume`、`/reload`、`/name`、`/theme` 与 `/export` 都存在于 Tau 的命令注册表中。

[原文]
Tau intentionally removes older Tau-specific diagnostic commands from the
registry, including `/help`, `/status`, `/skills`, `/resources`, `/context`,
and `/thinking`. Equivalent information remains visible through
Pi-aligned commands, persistent UI surfaces, keybindings, or the model's system
prompt.

[译文]
Tau 有意从注册表中移除了早期 Tau 特有的诊断命令,包括 `/help`、`/status`、`/skills`、`/resources`、`/context` 与 `/thinking`。等价信息仍可通过与 Pi 对齐的命令、常驻 UI 界面、键位绑定或模型的系统提示词看到。

[原文]
The remaining Pi commands are deferred because they require larger workflows
outside this registry cleanup:

[译文]
其余 Pi 命令被推迟,因为它们需要超出本次注册表清理范围的更大工作流:

[原文]
- `/settings`
- `/scoped-models`
- `/import`
- `/share`
- `/copy`
- `/changelog`
- `/fork`
- `/clone`
- `/tree`
- `/logout`

[译文]
- `/settings`
- `/scoped-models`
- `/import`
- `/share`
- `/copy`
- `/changelog`
- `/fork`
- `/clone`
- `/tree`
- `/logout`

## TUI 集成(TUI integration)

[原文]
The TUI still calls:

[译文]
TUI 仍然调用:

```python
session.handle_command(text)
```

[原文]
but the returned `CommandResult` can now request more than exit behavior.

[译文]
但返回的 `CommandResult` 现在可以请求退出之外的更多行为。

[原文]
For example, `/new` returns `new_session_requested=True`. The TUI responds by
creating and loading a fresh indexed session without deleting older durable JSONL
session history.

[译文]
例如,`/new` 返回 `new_session_requested=True`。TUI 的响应是创建并加载一个全新的、已建立索引的会话,同时不删除旧的持久化 JSONL 会话历史。

## 提示词展开命令的行为(Prompt expansion command behavior)

[原文]
`/skill:<name> [request]` remains a prompt-expansion path, not a normal slash
command.

[译文]
`/skill:<name> [request]` 仍然是一条提示词展开路径,而不是普通的斜杠命令。

[原文]
Prompt templates also behave as dynamic prompt-expansion commands. For example,
`.agents/prompts/example.md` is invoked as `/example [arguments]` and expanded by
`CodingSession.prompt()` before the model sees the prompt.

[译文]
提示词模板也表现为动态的提示词展开命令。例如 `.agents/prompts/example.md` 通过 `/example [arguments]` 调用,并由 `CodingSession.prompt()` 在模型看到提示之前展开。

[原文]
The registry intentionally returns `handled=False` for skill and prompt-template
expansion directives so `CodingSession.prompt()` can replace them before sending
the prompt to the model.

[译文]
注册表有意对技能与提示词模板的展开指令返回 `handled=False`,以便 `CodingSession.prompt()` 能在把提示发送给模型之前替换它们。

[原文]
Like Pi, Tau also returns `handled=False` for every unregistered slash-prefixed
input. Only recognized commands are consumed locally; unknown command-like text
and absolute paths such as `/tmp` or `/Users/me/file.png` continue as normal
prompts.

[译文]
与 Pi 一样,Tau 对所有未注册的、以斜杠开头的内容也返回 `handled=False`。只有被识别的命令才在本地消费;未知的类命令文本以及 `/tmp`、`/Users/me/file.png` 这样的绝对路径,都会继续作为普通提示处理。

[原文]
There is no plain `/skill` slash command in the Pi-aligned registry.

[译文]
在与 Pi 对齐的注册表中,没有单独的 `/skill` 斜杠命令。

## 未来用途(Future use)

[原文]
This registry is the foundation for later phases:

- TUI slash-command autocomplete can read command metadata from the registry.
- Extensions can eventually contribute commands.
- A future command palette can show the same command metadata.

[译文]
该注册表是后续阶段的基础:

- TUI 斜杠命令自动补全可以从注册表读取命令元数据。
- 扩展最终可以贡献命令。
- 未来的命令面板可以展示同一份命令元数据。

## 测试(Tests)

[原文]
The phase is covered by:

[译文]
本阶段的测试覆盖为:

```text
tests/test_commands.py
tests/test_coding_session.py
tests/test_tui_app.py
```

[原文]
The tests verify:

- command parsing and dispatch
- generated help output
- exit and new-session control flags
- status and skills output
- `/skill:<name>` passthrough behavior
- indexed session listing
- structured `/resume <session-id>` requests
- TUI handling for `/new`

[译文]
测试验证:

- 命令解析与分派
- 生成的帮助输出
- 退出与新建会话的控制标志
- 状态与技能输出
- `/skill:<name>` 的透传行为
- 已索引会话的列举
- 结构化的 `/resume <session-id>` 请求
- TUI 对 `/new` 的处理
