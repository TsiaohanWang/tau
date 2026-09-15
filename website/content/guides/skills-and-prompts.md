---
title: "Skills & prompt templates / 技能与提示词模板"
description: "Teach Tau reusable know-how with skills, and stop retyping instructions with prompt templates. / 用技能把可复用的知识教给 Tau,用提示词模板免去反复输入同样的指令。"
---

[原文]
Tau loads two kinds of reusable Markdown from disk: **skills** (how to do a
task) and **prompt templates** (a saved prompt you trigger by name). Both can
live at the user level (available everywhere) or inside a project.

[译文]
Tau 会从磁盘加载两类可复用的 Markdown:**技能(skills)**(如何完成某项任务)与**提示词模板(prompt templates)**(按名称触发的已保存提示词)。两者都可以放在用户级(随处可用),或放在某个项目内。

## 文件放在哪里(Where the files go)

[原文]
Skills are loaded from these locations, in increasing precedence (later
overrides earlier on name clashes):

```text
~/.tau/skills/
~/.agents/skills/
<cwd>/.tau/skills/
<cwd>/.agents/skills/
```

[译文]
技能从以下位置加载,优先级递增(同名冲突时后者覆盖前者):

[原文]
Prompt templates load from:

```text
~/.tau/prompts/
~/.agents/prompts/
<cwd>/.tau/prompts/
<cwd>/.agents/prompts/
```

[译文]
提示词模板从以下位置加载:

[原文]
After adding or editing files while the TUI is open, run **`/reload`** to
rediscover them. Duplicate/overridden resources are reported as diagnostics, not
fatal errors. At TUI startup, Tau also shows a red transcript alert when skills or
prompt templates in different locations share a name. The alert lists both paths
so you can rename or remove the unintended duplicate; Tau still uses the
higher-precedence resource.

[译文]
TUI 打开期间新增或修改文件之后,请运行 **`/reload`** 重新发现它们。重复/被覆盖的资源会作为诊断上报,而不是致命错误。TUI 启动时,如果不同位置下的技能或提示词模板同名,Tau 还会在会话记录中显示一条红色警告。该警告会列出两条路径,便于你重命名或移除那个非预期的重复项;Tau 仍会使用优先级更高的资源。

## 技能(Skills)

[原文]
A skill is a directory containing a `SKILL.md` file, following the
[Agent Skills spec](https://agentskills.io/specification#directory-structure).
The directory name is the skill name. Optional frontmatter gives it a
description:

```text
~/.tau/skills/security-review/SKILL.md
```

```md
---
description: Review a diff for security issues.
---

Steps to review the current diff for security problems...
```

[译文]
一个技能就是一个包含 `SKILL.md` 文件的目录,遵循 [Agent Skills 规范](https://agentskills.io/specification#directory-structure)。目录名即技能名。可选的前置元数据为它提供一句描述:

[原文]
Any supporting files (references, snippets) can live alongside `SKILL.md`
inside the same directory.

[译文]
任何辅助文件(参考资料、代码片段)都可以与 `SKILL.md` 放在同一个目录中。

[原文]
{{% tip %}}
Bare `.md` files at the root of a skills directory (for example
`~/.tau/skills/review.md`) are **not** loaded as skills. Tau will surface a
diagnostic telling you to move them into their own directory:

```bash
cd ~/.tau/skills
mkdir review && mv review.md review/SKILL.md
```

This matches the Agent Skills spec and applies uniformly across `.tau/` and
`.agents/` locations.
{{% /tip %}}

[译文]
{{% tip %}}
技能目录根部单独的 `.md` 文件(例如 `~/.tau/skills/review.md`)**不会**被加载为技能。Tau 会给出诊断,提示你把它移进自己的目录:

```bash
cd ~/.tau/skills
mkdir review && mv review.md review/SKILL.md
```

这与 Agent Skills 规范一致,并在 `.tau/` 与 `.agents/` 两类位置上统一适用。
{{% /tip %}}

[原文]
Tau's own extension and provider workflows are packaged documentation rather
than built-in skills. They remain available to the agent without appearing in
your skill list, competing with your skill names, or being disabled by
`--no-skills`.

[译文]
Tau 自身的扩展与 provider 工作流是随包文档,而不是内置技能。它们对 agent 仍然可用,但不会出现在你的技能列表中、不会与你的技能名竞争,也不会被 `--no-skills` 禁用。

[原文]
Tau lists loaded user and project skills in the system prompt so the model knows they exist and
can read the full file (via the `read` tool) when relevant. Run **`/skills`** to search names and
descriptions, then select one to insert its invocation into the prompt for further instructions.
In the picker, **F1** opens the complete header description and **Ctrl+Enter** displays the
full `SKILL.md` in the transcript for inspection without adding it to model context. Or invoke one
explicitly:

```text
/skill:security-review check the changes on this branch
```

[译文]
Tau 会在系统提示词中列出已加载的用户级与项目级技能,让模型知道它们存在,并能在相关时(通过 `read` 工具)读取完整文件。运行 **`/skills`** 可以搜索名称与描述,然后选中一个,把它的调用形式插入提示框以便补充指令。在选择器中,**F1** 打开完整的头部描述,**Ctrl+Enter** 在会话记录中显示完整的 `SKILL.md` 供检查,而不会把它加入模型上下文。也可以显式调用某个技能:

[原文]
For longer instructions, put the request on following lines:

```text
/skill:security-review

Check the changes on this branch.
Pay special attention to authentication boundaries.
```

[译文]
若指令较长,请把请求写在后续行中:

[原文]
`/skill:<name>` is a *prompt-expansion* path — Tau expands the skill and any
inline or multiline request into your prompt, then runs it as a normal turn.

[译文]
`/skill:<name>` 是一条*提示词展开*路径 —— Tau 会把该技能以及任何行内或多行请求展开进你的提示词,然后作为一次普通轮次运行它。

### 对模型隐藏某个技能(Hiding a skill from the model)

[原文]
Set `disable-model-invocation: true` in the frontmatter to keep a skill out of
the system prompt. The model will not see it or invoke it on its own, but you
can still run it explicitly with `/skill:<name>` (and it still appears in the
`/skills` picker and autocomplete):

```md
---
description: Generate the weekly status report.
disable-model-invocation: true
---

Steps to build the report...
```

[译文]
在前置元数据中设置 `disable-model-invocation: true`,即可让某个技能不出现在系统提示词中。模型不会看到它,也不会自行调用它,但你仍然可以用 `/skill:<name>` 显式运行它(它也仍会出现在 `/skills` 选择器与自动补全中):

[原文]
This is useful for user-triggered workflows that would otherwise add noise to
the skill list or tempt the model to fire them at the wrong time.

[译文]
这对「由用户触发」的工作流很有用 —— 否则它们会给技能列表增添噪音,或诱使模型在错误的时机触发。

## 提示词模板(Prompt templates)

[原文]
A prompt template is a saved prompt you trigger by its filename. For example,
`~/.agents/prompts/wt.md` is invoked with `/wt`. Run `/prompts` in the TUI to
search every loaded template. Press **Enter** to insert its invocation without
submitting it, or **Ctrl+E** to edit its Markdown directly. Save with **Ctrl+S**;
Tau reloads resources automatically. The filenames `prompts.md` and `tools.md` are
reserved for built-in commands; Tau ignores templates with those names and
reports a resource diagnostic. Templates use the same argument variables as Pi:

[译文]
提示词模板是一个按文件名触发的已保存提示词。例如,`~/.agents/prompts/wt.md` 用 `/wt` 调用。在 TUI 中运行 `/prompts` 可以搜索每个已加载的模板。按 **Enter** 插入它的调用形式而不提交,或按 **Ctrl+E** 直接编辑其 Markdown。用 **Ctrl+S** 保存;Tau 会自动重新加载资源。文件名 `prompts.md` 与 `tools.md` 为内置命令保留;Tau 会忽略使用这些名字的模板,并上报一条资源诊断。模板使用与 Pi 相同的参数变量:

[原文]
- `$1`, `$2`, ... for positional arguments
- `$@` or `$ARGUMENTS` for all arguments joined with spaces
- `${1:-default}` and `${@:-default}` for defaults
- `${@:N}` or `${@:N:L}` for simple argument slices

```md
---
description: Implement a feature in an isolated git worktree.
---

Implement this feature safely in a new worktree:
Feature: $1
Additional instructions: ${@:2}
```

[译文]
- `$1`、`$2`、…… 表示位置参数
- `$@` 或 `$ARGUMENTS` 表示以空格连接的全部参数
- `${1:-default}` 与 `${@:-default}` 表示默认值
- `${@:N}` 或 `${@:N:L}` 表示简单的参数切片

[原文]
Invoke it with `/wt add caching`. Quoted arguments are preserved as one
positional argument, for example `/wt add "shared caching"`. Legacy
`{{ arguments }}` and `{{ args }}` placeholders remain supported.

[译文]
用 `/wt add caching` 调用它。带引号的参数会作为一个位置参数保留,例如 `/wt add "shared caching"`。旧式的 `{{ arguments }}` 与 `{{ args }}` 占位符仍然受支持。

[原文]
If a template has no argument placeholder, your arguments are appended after a
blank line.

[译文]
如果模板没有参数占位符,你的参数会追加在一个空行之后。

[原文]
The filenames `prompts.md` and `skills.md` are reserved for the built-in `/prompts`
and `/skills` pickers. Tau ignores either template and reports a resource diagnostic;
rename the file to load it as a custom prompt.

[译文]
文件名 `prompts.md` 与 `skills.md` 为内置的 `/prompts` 与 `/skills` 选择器保留。Tau 会忽略这两种模板,并上报一条资源诊断;请重命名该文件,以便把它作为自定义提示词加载。

## 技能与提示词模板 —— 该用哪个?(Skill vs. prompt template — which?)

[原文]
- Use a **prompt template** when you keep typing the *same instructions* and
  just want a shortcut (with optional fill-in variables).
- Use a **skill** when you want to give the model *reference know-how* it can
  pull in when a task calls for it, invoked with `/skill:<name>`.

[译文]
- 当你反复输入*同样的指令*、只想要一个快捷方式(可带可选的填空变量)时,请使用**提示词模板**。
- 当你想给模型一份*可参考的知识*,让它在任务需要时自行取用时,请使用**技能**,并以 `/skill:<name>` 调用。

[原文]
{{% tip %}}
Keep personal, cross-project helpers in `~/.agents/`. Keep project-specific ones
in the repo's `.tau/` or `.agents/` so they're shared with collaborators.
{{% /tip %}}

[译文]
{{% tip %}}
把个人的、跨项目的辅助资源放在 `~/.agents/`。把项目专用的资源放在仓库的 `.tau/` 或 `.agents/` 中,以便与协作者共享。
{{% /tip %}}
