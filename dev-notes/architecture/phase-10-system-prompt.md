---
title: "Phase 10: System Prompt Assembly / 阶段 10:系统提示词组装"
---

[原文]
Phase 10 adds Tau's canonical system prompt builder.

[译文]
阶段 10 加入了 Tau 的规范化系统提示词构建器。

[原文]
The implementation lives in:

[译文]
实现位于:

```text
src/tau_coding/system_prompt.py
```

## 新增了什么(What was added)

[原文]
Tau can now build a deterministic Pi-style system prompt from:

- Tau's default coding-agent identity
- enabled tools
- tool prompt snippets
- tool prompt guidelines
- extra guidelines
- optional custom prompt text
- optional appended prompt text
- project context files
- loaded skills
- current date
- current working directory

[译文]
Tau 现在可以从以下输入构建确定性的 Pi 风格系统提示词:

- Tau 默认的编码 agent 身份说明
- 已启用的工具
- 工具的提示词片段(prompt snippet)
- 工具的提示词准则(prompt guidelines)
- 额外的准则
- 可选的自定义提示词文本
- 可选的追加提示词文本
- 项目上下文文件
- 已加载的技能
- 当前日期
- 当前工作目录

## 为什么需要它(Why this exists)

[原文]
Earlier phases added tools, skills, prompt templates, and coding sessions. Before this phase, the CLI used a small local prompt builder that only listed tools. Tau now has one shared prompt assembly layer that can be used by print mode, coding sessions, and later UI/session frontends.

[译文]
此前的阶段已经加入了工具、技能、提示词模板与编码会话。在本阶段之前,CLI 使用一个只列出工具的本地小提示词构建器。现在 Tau 有了一个共享的提示词组装层,可供 print 模式、编码会话以及后来的 UI/会话前端使用。

## 默认提示词形态(Default prompt shape)

[原文]
The default prompt starts with Tau's identity:

[译文]
默认提示词以 Tau 的身份说明开头:

```text
You are an expert coding assistant operating inside Tau, a coding agent harness.
```

[原文]
It then includes an available-tools section using each tool's `prompt_snippet`:

[译文]
随后是「可用工具」区块,使用每个工具的 `prompt_snippet`:

```text
Available tools:
- read: Read file contents
- write: Create or overwrite files
- edit: Make precise file edits ...
- bash: Execute bash commands ...
```

[原文]
Then it includes guidelines gathered from enabled tools:

[译文]
然后是汇总自已启用工具的准则:

```text
Guidelines:
- Use bash for file operations like ls, rg, find
- Use read to examine files instead of cat or sed.
- Use write only for new files or complete rewrites.
- Be concise in your responses
- Show file paths clearly when working with files
```

[原文]
Guidelines are de-duplicated in deterministic order.

[译文]
准则会按确定性顺序去重。

[原文]
The default prompt also mirrors Pi's progressive-disclosure documentation block,
adapted for Tau. It points to packaged Tau docs and examples for extensions,
skills, providers/models, commands, TUI behavior, and architecture, and tells the
model to read them only for Tau-specific questions. Custom prompts still replace
this default documentation block.

[译文]
默认提示词还镜像了 Pi 的「渐进式披露」文档区块,并为 Tau 做了适配。它指向随包分发的 Tau 文档与示例,涵盖扩展、技能、provider/模型、命令、TUI 行为与架构,并告诉模型只在遇到 Tau 特有问题时才去阅读它们。自定义提示词仍会替换掉这个默认文档区块。

## 自定义提示词(Custom prompts)

[原文]
If `custom_prompt` is supplied, it replaces the default Tau identity, tools, and guidelines sections.

[译文]
如果提供了 `custom_prompt`,它会替换默认的 Tau 身份说明、工具与准则区块。

[原文]
Tau still appends these after a custom prompt, matching Pi's behavior:

1. appended system prompt text
2. project context
3. skills section, if the `read` tool is enabled
4. current date
5. current working directory

[译文]
与 Pi 的行为一致,自定义提示词之后 Tau 仍会追加:

1. 追加的系统提示词文本
2. 项目上下文
3. 技能区块(当 `read` 工具启用时)
4. 当前日期
5. 当前工作目录

## 项目上下文(Project context)

[原文]
Project instructions are represented with `ProjectContextFile` values and formatted in Pi's XML-like style:

[译文]
项目指令用 `ProjectContextFile` 值表示,并按 Pi 的类 XML 风格格式化:

```xml
<project_context>

Project-specific instructions and guidelines:

<project_instructions path="/repo/AGENTS.md">
...content...
</project_instructions>

</project_context>
```

[原文]
Phase 10 formats provided context files. Full discovery of files such as `AGENTS.md` and `CLAUDE.md` can be expanded later.

[译文]
阶段 10 只负责格式化传入的上下文文件。对 `AGENTS.md`、`CLAUDE.md` 等文件的完整发现可以留待后续扩展。

## 技能(Skills)

[原文]
Skills are formatted in Pi's XML-style skill index:

[译文]
技能按 Pi 的 XML 风格技能索引格式化:

```xml
<available_skills>
  <skill>
    <name>python-testing</name>
    <description>Write and run Python tests.</description>
    <location>/home/user/.tau/skills/python-testing/SKILL.md</location>
  </skill>
</available_skills>
```

[原文]
Tau includes the skills section only when the `read` tool is enabled. This mirrors Pi: the model should use `read` to load the full skill file when a task matches a skill description.

[译文]
只有 `read` 工具启用时,Tau 才会包含技能区块。这与 Pi 一致:当任务与某个技能描述匹配时,模型应当用 `read` 加载完整的技能文件。

[原文]
Prompt templates are not inserted into the system prompt. They are user prompt expansion resources.

[译文]
提示词模板不会被插入系统提示词。它们是用户提示词的展开资源。

## 集成(Integration)

[原文]
Print mode now uses `build_system_prompt()` instead of a local minimal prompt builder.

[译文]
Print 模式现在使用 `build_system_prompt()`,而不再使用本地的极简提示词构建器。

[原文]
`CodingSessionConfig.system` is now optional. If omitted, `CodingSession.load()` builds a system prompt from:

- cwd
- configured tools or default coding tools
- loaded skills
- custom/append prompt options
- provided context files

[译文]
`CodingSessionConfig.system` 现在是可选的。如果省略,`CodingSession.load()` 会从以下输入构建系统提示词:

- cwd
- 已配置的工具或默认编码工具
- 已加载的技能
- 自定义/追加提示词选项
- 传入的上下文文件

[原文]
Existing callers can still pass an explicit `system` string.

[译文]
现有调用方仍然可以传入显式的 `system` 字符串。

## 测试(Tests)

[原文]
The phase is covered by:

[译文]
本阶段的测试覆盖为:

```text
tests/test_system_prompt.py
tests/test_cli.py
tests/test_coding_session.py
```

[原文]
The tests verify:

- default prompt sections
- available tool formatting
- hidden tools without snippets
- guideline de-duplication
- custom prompt behavior
- project context formatting
- skill XML escaping
- skill inclusion only with `read`
- print-mode integration
- coding-session integration

[译文]
测试验证:

- 默认提示词各区块
- 可用工具的格式化
- 没有片段的隐藏工具
- 准则去重
- 自定义提示词行为
- 项目上下文格式化
- 技能 XML 转义
- 仅在启用 `read` 时包含技能
- print 模式集成
- 编码会话集成

## 下一阶段(Next phase)

[原文]
The next roadmap phase is Rich console rendering. The system prompt builder introduced here gives future frontends a shared prompt assembly layer instead of duplicating prompt logic.

[译文]
路线图上的下一阶段是 Rich 控制台渲染。这里引入的系统提示词构建器为未来的前端提供了共享的提示词组装层,避免各自重复实现提示词逻辑。
