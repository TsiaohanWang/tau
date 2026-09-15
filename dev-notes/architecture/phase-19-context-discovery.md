---
title: "Phase 19: Project Context Discovery and Reload / 阶段 19:项目上下文发现与重载"
---

[原文]
This phase adds Tau's project instruction discovery and reload command. It stays in
`tau_coding`, beside resources, commands, and session startup.

[译文]
本阶段加入了 Tau 的项目指令发现与重载命令。它位于 `tau_coding`,与资源、命令和会话启动并列。

[原文]
The implementation lives in:

[译文]
实现位于:

```text
src/tau_coding/context.py
src/tau_coding/session.py
src/tau_coding/cli.py
src/tau_coding/commands.py
```

## 新增了什么(What was added)

[原文]
Tau now discovers markdown instruction files automatically and inserts them into
the existing `ProjectContextFile` system-prompt section.

[译文]
Tau 现在会自动发现 Markdown 指令文件,并把它们插入已有的 `ProjectContextFile` 系统提示词区块。

[原文]
The current discovery order is:

[译文]
当前的发现顺序是:

```text
~/.tau/AGENTS.md
~/.agents/AGENTS.md
<project root>/AGENTS.md
<project root>/.../<cwd>/AGENTS.md
<cwd>/.tau/AGENTS.md
<cwd>/.agents/AGENTS.md
```

[原文]
The project root is the nearest ancestor containing a common project marker such
as `.git`, `pyproject.toml`, `uv.lock`, `setup.py`, or `package.json`. If no
marker exists, Tau treats the session cwd as the project root.

[译文]
项目根目录是最近的、包含常见项目标记的祖先目录,标记例如 `.git`、`pyproject.toml`、`uv.lock`、`setup.py` 或 `package.json`。如果不存在任何标记,Tau 就把会话 cwd 当作项目根目录。

## 系统提示词集成(System Prompt Integration)

[原文]
Both normal `CodingSession` startup and non-interactive print mode pass
discovered context files into:

[译文]
正常的 `CodingSession` 启动与非交互式 print 模式都会把发现到的上下文文件传入:

```python
BuildSystemPromptOptions(context_files=...)
```

[原文]
That preserves the Phase 10 prompt boundary:

```text
tau_coding discovers local files
tau_coding.system_prompt formats them
tau_agent receives only a ready system string
```

[译文]
这保持了阶段 10 的提示词边界:

```text
tau_coding 发现本地文件
tau_coding.system_prompt 格式化它们
tau_agent 只接收一个就绪的系统字符串
```

[原文]
`tau_agent` still has no dependency on local resource discovery, Tau home,
project paths, slash commands, Rich, or Textual.

[译文]
`tau_agent` 仍然不依赖本地资源发现、Tau 主目录、项目路径、斜杠命令、Rich 或 Textual。

## 斜杠命令(Slash Command)

[原文]
Tau now has:

[译文]
Tau 现在有:

```text
/context
/reload
```

[原文]
`/context` lists the active project context files in the running session.

[译文]
`/context` 列出当前运行会话中活动的项目上下文文件。

[原文]
`/reload` refreshes Tau-owned resources for future turns:

- skills
- prompt templates
- project context files
- resource diagnostics

[译文]
`/reload` 为后续轮次刷新 Tau 持有的资源:

- 技能
- 提示词模板
- 项目上下文文件
- 资源诊断

[原文]
When the session is using Tau's generated system prompt, reload rebuilds the
harness system string only when the resources that feed that prompt changed.
The transcript and session tree are left untouched.

[译文]
当会话使用 Tau 生成的系统提示词时,只有在为提示词提供输入的资源发生变化时,reload 才会重建 harness 的系统字符串。会话记录与会话树保持不动。

[原文]
`/reload` does not refresh provider configuration. Provider/model settings are
refreshed by the provider-specific flows that use them, such as `/login` after
saving credentials and `/model` before validating choices or opening the model
picker.

[译文]
`/reload` 不刷新 provider 配置。Provider/模型设置由使用它们的、provider 特有的流程刷新,例如 `/login` 在保存凭据之后、`/model` 在校验选项或打开模型选择器之前。

[原文]
`/status` and `/resources` also include the current context-file count.

[译文]
`/status` 与 `/resources` 也会包含当前上下文文件的数量。

## 边界(Boundary)

[原文]
Reload is a `tau_coding` operation. It updates the coding-session environment
around the harness, then gives the harness a rebuilt system string for future
turns when needed. `tau_agent` does not know where skills, prompts, or context
files come from.

[译文]
Reload 是 `tau_coding` 的操作。它更新 harness 周围的编码会话环境,然后在需要时为后续轮次给 harness 一个重建后的系统字符串。`tau_agent` 不知道技能、提示词或上下文文件来自哪里。

## 测试(Tests)

[原文]
The phase is covered by:

[译文]
本阶段的测试覆盖为:

```text
tests/test_context.py
tests/test_coding_session.py
tests/test_cli.py
tests/test_commands.py
```

[原文]
The tests verify:

- user, project, nested, `.tau`, and `.agents` context discovery
- discovered context included in session system prompts
- discovered context included in print-mode system prompts
- `/context`, `/status`, and `/resources` command output
- `/reload` command output
- reload updating resources and the next-turn system prompt only when prompt
  inputs changed

[译文]
测试验证:

- 用户级、项目级、嵌套、`.tau` 与 `.agents` 的上下文发现
- 发现到的上下文被包含进会话系统提示词
- 发现到的上下文被包含进 print 模式系统提示词
- `/context`、`/status` 与 `/resources` 的命令输出
- `/reload` 的命令输出
- 仅当提示词输入发生变化时,reload 才更新资源与下一轮的系统提示词
