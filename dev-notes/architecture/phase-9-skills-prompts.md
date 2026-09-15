---
title: "Phase 9: Skills and Prompt Templates / 阶段 9:技能与提示词模板"
---

[原文]
Phase 9 adds Tau's first markdown resource system.

[译文]
阶段 9 加入了 Tau 的第一套 Markdown 资源系统。

[原文]
The implementation lives in:

[译文]
实现位于:

```text
src/tau_coding/resources.py
src/tau_coding/skills.py
src/tau_coding/prompt_templates.py
```

## 新增了什么(What was added)

[原文]
Tau can now load and use markdown resources from a Tau resource root:

[译文]
Tau 现在可以从 Tau 资源根目录加载并使用 Markdown 资源:

```text
~/.tau/
  skills/
  prompts/
```

[原文]
This phase includes:

- resource path helpers
- minimal markdown frontmatter parsing
- skill loading
- `/skill:name` prompt expansion
- skill index generation
- prompt template loading
- `{{ variable }}` template rendering
- light `CodingSession` integration for skill expansion

[译文]
本阶段包括:

- 资源路径辅助工具
- 最小化的 Markdown frontmatter 解析
- 技能加载
- `/skill:name` 提示词展开
- 技能索引生成
- 提示词模板加载
- `{{ variable }}` 模板渲染
- 为技能展开而做的轻量 `CodingSession` 集成

## 资源路径(Resource paths)

[原文]
`TauResourcePaths` describes where Tau resources live:

[译文]
`TauResourcePaths` 描述 Tau 资源所在的位置:

```python
from tau_coding import TauResourcePaths

paths = TauResourcePaths()  # ~/.tau
paths.skills_dir            # ~/.tau/skills
paths.prompts_dir           # ~/.tau/prompts
```

[原文]
Tests and callers can provide a custom root:

[译文]
测试与调用方可以提供自定义根目录:

```python
paths = TauResourcePaths(root=Path("/tmp/resources"))
```

## Frontmatter

[原文]
Skills and prompt templates can include simple frontmatter:

[译文]
技能与提示词模板可以包含简单的 frontmatter:

```md
---
description: Write and run Python tests.
---

# Python Testing

Use pytest.
```

[原文]
The parser intentionally supports only simple `key: value` pairs. It does not execute code or implement a full YAML parser.

[译文]
该解析器有意只支持简单的 `key: value` 键值对。它不执行代码,也不实现完整的 YAML 解析器。

## 技能(Skills)

[原文]
Tau supports two skill layouts:

[译文]
Tau 支持两种技能布局:

```text
~/.tau/skills/python-testing/SKILL.md
~/.tau/skills/git-review.md
```

[原文]
Load skills with:

[译文]
用以下方式加载技能:

```python
from tau_coding import TauResourcePaths, load_skills

skills = load_skills(TauResourcePaths())
```

[原文]
Duplicate skill names raise `ResourceError`.

[译文]
技能名重复会抛出 `ResourceError`。

## 技能展开(Skill expansion)

[原文]
Skill commands use the roadmap syntax:

[译文]
技能命令使用路线图规定的语法:

```text
/skill:python-testing add tests for parser.py
```

[原文]
Expansion produces prompt text like:

[译文]
展开后产生的提示词文本类似:

```md
<skill name="python-testing" location="/path/to/python-testing/SKILL.md">
References are relative to /path/to/python-testing.

...skill markdown...
</skill>

add tests for parser.py
```

[原文]
`CodingSession.prompt()` expands skill commands before sending the prompt to `AgentHarness`. `/skill:name` is not consumed by `handle_command()` because it is a prompt expansion directive, not a command that ends the run.

[译文]
`CodingSession.prompt()` 会在把提示发送给 `AgentHarness` 之前展开技能命令。`/skill:name` 不会被 `handle_command()` 消费,因为它是一条提示词展开指令,而不是会结束本次运行的命令。

## 技能索引(Skill index)

[原文]
`build_skill_index()` creates a concise list of available skills for future system prompt assembly:

[译文]
`build_skill_index()` 会为未来的系统提示词组装生成一份简洁的可用技能列表:

```md
Available skills:
- python-testing: Write and run Python tests.
- git-review: Review git changes safely.
```

[原文]
Phase 10 can use this when building the full system prompt.

[译文]
阶段 10 在构建完整系统提示词时可以使用它。

## 提示词模板(Prompt templates)

[原文]
Prompt templates live in:

[译文]
提示词模板位于:

```text
~/.tau/prompts/review.md
.agents/prompts/review.md
```

[原文]
Tau treats loaded prompt templates as slash-command prompt expansions. A file
named `.agents/prompts/example.md` can be invoked with:

[译文]
Tau 把加载的提示词模板视为斜杠命令的提示词展开。名为 `.agents/prompts/example.md` 的文件可以这样调用:

```text
/example src/app.py
```

[原文]
Tau expands the command before sending the prompt to the model. Invocation text
after the command supports Pi-compatible argument variables:

- `$1`, `$2`, ... for positional arguments
- `$@` or `$ARGUMENTS` for all arguments
- `${N:-default}` for positional defaults
- `${@:N}` and `${@:N:L}` for simple slices

[译文]
Tau 会在把提示发送给模型之前展开该命令。命令之后的调用文本支持与 Pi 兼容的参数变量:

- `$1`、`$2`…… 表示位置参数
- `$@` 或 `$ARGUMENTS` 表示全部参数
- `${N:-default}` 表示位置参数的默认值
- `${@:N}` 与 `${@:N:L}` 表示简单切片

```md
Review $@ for correctness.
```

[原文]
If the prompt template has no argument placeholder, Tau appends the invocation
arguments after a blank line. Legacy `{{ arguments }}` and `{{ args }}`
placeholders remain supported. Other placeholders are left blank during
slash-command expansion so a custom prompt can include optional fields without
crashing the TUI.

[译文]
如果提示词模板没有任何参数占位符,Tau 会把调用参数追加在一个空行之后。旧式的 `{{ arguments }}` 与 `{{ args }}` 占位符仍然受支持。在斜杠命令展开期间,其他占位符会被留空,这样自定义提示就可以包含可选字段,而不会让 TUI 崩溃。

[原文]
Direct template rendering also supports simple `{{ variable }}` placeholders:

[译文]
直接渲染模板同样支持简单的 `{{ variable }}` 占位符:

```md
Review {{ target }} for {{ focus }}.
```

[原文]
Render templates directly with:

[译文]
直接渲染模板的方式:

```python
from tau_coding import load_prompt_templates, render_prompt_template

templates = load_prompt_templates(paths)
text = render_prompt_template(
    templates[0],
    {"target": "auth.py", "focus": "security"},
)
```

[原文]
Missing variables raise `ResourceError`; extra variables are ignored. This strict
behavior applies to direct rendering. Slash-command expansion is more forgiving
and renders missing custom variables as blank text.

[译文]
缺失的变量会抛出 `ResourceError`;多余的变量会被忽略。这种严格行为只适用于直接渲染。斜杠命令展开则更宽容:缺失的自定义变量会被渲染成空文本。

## 边界(Boundary)

[原文]
This phase does not implement full system prompt assembly. It only adds the resource primitives and a minimal skill-expansion hook in `CodingSession`.

[译文]
本阶段不实现完整的系统提示词组装。它只增加了资源原语,以及 `CodingSession` 中一个最小的技能展开钩子。

[原文]
Full prompt assembly remains a later phase and will combine:

- base Tau identity
- tools and tool guidelines
- project instructions
- skills index
- prompt templates
- extension snippets later
- environment context

[译文]
完整的提示词组装仍留待后续阶段,它将组合:

- Tau 的基础身份说明
- 工具与工具准则
- 项目指令
- 技能索引
- 提示词模板
- 之后的扩展片段
- 环境上下文

## 测试(Tests)

[原文]
This phase is covered by:

[译文]
本阶段的测试覆盖为:

```text
tests/test_resources.py
tests/test_skills.py
tests/test_prompt_templates.py
tests/test_coding_session.py
```

[原文]
The tests verify:

- resource paths
- frontmatter parsing
- skill loading and duplicate detection
- skill expansion
- skill index output
- prompt template loading
- template rendering
- coding-session skill expansion

[译文]
测试验证:

- 资源路径
- frontmatter 解析
- 技能加载与重复检测
- 技能展开
- 技能索引输出
- 提示词模板加载
- 模板渲染
- 编码会话的技能展开

## 下一阶段(Next phase)

[原文]
The next roadmap phase is system prompt assembly. The resource models and loaders added here give that phase the skill and template inputs it needs.

[译文]
路线图上的下一阶段是系统提示词组装。这里加入的资源模型与加载器,为该阶段提供了所需的技能与模板输入。
