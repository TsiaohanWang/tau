---
title: "Project instructions (AGENTS.md) / 项目指令(AGENTS.md)"
description: "Give Tau standing instructions about your project with AGENTS.md files. / 用 AGENTS.md 文件给 Tau 提供关于你项目的常驻指令。"
---

[原文]
An **`AGENTS.md`** file is how you give the agent durable, project-specific
context: conventions to follow, commands to run, things to avoid. Tau discovers
these files automatically and includes them in the system prompt for every turn,
wrapped in `<project_context>` tags.

[译文]
**`AGENTS.md`** 文件是你给 agent 提供持久、项目专属上下文的方式:要遵循的约定、要运行的命令、要避开的事情。Tau 会自动发现这些文件,并把它们包在 `<project_context>` 标签中,包含进每一轮的系统提示词。

## 里面该写什么(What to put in it)

[原文]
Anything you'd otherwise repeat to the agent every session:

[译文]
任何你本来每个会话都要向 agent 重复一遍的内容:

[原文]
- how to run tests, lint, build, and format
- project conventions (style, commit message format, branch naming)
- architectural notes and gotchas
- "always do X / never do Y" rules

[译文]
- 如何运行测试、lint、构建与格式化
- 项目约定(代码风格、提交信息格式、分支命名)
- 架构说明与坑点
- 「总是做 X / 绝不做 Y」的规则

[原文]
Keep it focused — it's part of the prompt budget for every turn.

[译文]
保持聚焦 —— 它是每一轮提示词预算的一部分。

## Tau 会在哪里查找(Where Tau looks)

[原文]
Tau discovers instruction files in this order. User files are always eligible;
project files are included only after the active cwd's [project-trust decision]
({{< relref "./project-trust.md" >}}):

[译文]
Tau 按以下顺序发现指令文件。用户级文件始终可用;项目文件只在活动 cwd 的[项目信任决策]({{< relref "./project-trust.md" >}})之后才会被包含:

```text
~/.tau/AGENTS.md
~/.agents/AGENTS.md
<project root>/AGENTS.md
<project root>/.../<cwd>/AGENTS.md   # ancestor dirs between root and cwd
<cwd>/.tau/AGENTS.md
<cwd>/.agents/AGENTS.md
```

[原文]
The **project root** is the nearest ancestor directory containing a marker such
as `.git`, `pyproject.toml`, `uv.lock`, `setup.py`, or `package.json`.

[译文]
**项目根目录**是最近的、包含某个标记的祖先目录,标记例如 `.git`、`pyproject.toml`、`uv.lock`、`setup.py` 或 `package.json`。

[原文]
This layering lets you keep personal global instructions in `~/.tau/` or
`~/.agents/`, project-wide rules in the repo's `AGENTS.md`, and narrower rules in
a subdirectory closer to where you're working.

[译文]
这种分层让你可以把个人全局指令放在 `~/.tau/` 或 `~/.agents/`,把项目级规则放在仓库的 `AGENTS.md`,再把更细的规则放在更贴近工作位置的子目录里。

## 修改之后重新加载(Reloading after edits)

[原文]
If you change an `AGENTS.md` while the TUI is open, run **`/reload`** to refresh
project context for future turns. Adding the first protected file to an empty
project triggers trust resolution rather than silently inheriting the old empty
snapshot.

[译文]
如果你在 TUI 打开期间修改了 `AGENTS.md`,运行 **`/reload`** 为后续轮次刷新项目上下文。向空项目加入第一个受保护文件会触发信任解析,而不是静默继承旧的空快照。

[原文]
{{% note %}}
Tau itself uses an `AGENTS.md` at the repo root — a real example of the format
in practice.
{{% /note %}}

[译文]
{{% note %}}
Tau 自己在仓库根目录就使用了一个 `AGENTS.md` —— 这是该格式在实践中的真实示例。
{{% /note %}}
