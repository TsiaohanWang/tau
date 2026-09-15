---
title: "Phase 13: Tau Home, Paths, and `.agents` Resources / 阶段 13:Tau 主目录、路径与 `.agents` 资源"
---

[原文]
Phase 13 makes Tau's user/project filesystem locations explicit and starts loading `.agents` resources automatically for every normal Tau session.

[译文]
阶段 13 明确了 Tau 的用户级/项目级文件系统位置,并开始为每个普通 Tau 会话自动加载 `.agents` 资源。

[原文]
The implementation lives in:

[译文]
实现位于:

```text
src/tau_coding/paths.py
src/tau_coding/resources.py
src/tau_coding/skills.py
src/tau_coding/prompt_templates.py
```

## 新增了什么(What was added)

[原文]
Tau now has a canonical path helper:

[译文]
Tau 现在有了一个规范化的路径辅助对象:

```python
TauPaths
```

[原文]
It defines user-level locations such as:

[译文]
它定义了这样的用户级位置:

```text
~/.tau/
~/.tau/sessions/
~/.tau/skills/
~/.tau/prompts/
~/.agents/
~/.agents/skills/
~/.agents/prompts/
```

[原文]
and project-level locations such as:

[译文]
以及这样的项目级位置:

```text
<project>/.tau/skills/
<project>/.tau/prompts/
<project>/.agents/
<project>/.agents/skills/
<project>/.agents/prompts/
```

## 会话位置(Session location)

[原文]
The early TUI default session path moved from project-local storage:

[译文]
早期 TUI 的默认会话路径从项目本地存储:

```text
<project>/.tau/sessions/default.jsonl
```

[原文]
to user-home storage keyed by project path:

[译文]
迁移到了以项目路径为键的用户主目录存储:

```text
~/.tau/sessions/<project-hash>/default.jsonl
```

[原文]
This keeps JSONL transcripts in a consistent user-owned location while still separating sessions by project.

[译文]
这让 JSONL 会话记录统一存放在用户自己的位置,同时仍按项目分隔会话。

## 自动加载 `.agents` 资源(Automatic `.agents` resources)

[原文]
TauResourcePaths now includes `.agents` directories by default.

[译文]
TauResourcePaths 现在默认包含 `.agents` 目录。

[原文]
When no cwd is supplied, Tau loads user resources from:

[译文]
未提供 cwd 时,Tau 从以下位置加载用户资源:

```text
~/.tau/skills/
~/.agents/skills/
~/.agents/
~/.tau/prompts/
~/.agents/prompts/
```

[原文]
When a cwd is supplied, Tau also loads project resources from:

[译文]
提供 cwd 时,Tau 还会从以下位置加载项目资源:

```text
<project>/.tau/skills/
<project>/.agents/skills/
<project>/.agents/
<project>/.tau/prompts/
<project>/.agents/prompts/
```

[原文]
This makes `.agents` part of the normal Tau session environment, not an optional extension mechanism.

[译文]
这使 `.agents` 成为普通 Tau 会话环境的一部分,而不再是一种可选的扩展机制。

## 优先级(Precedence)

[原文]
Resource directories are loaded in increasing precedence order:

1. user Tau resources
2. user `.agents` resources
3. project Tau resources
4. project `.agents` resources

[译文]
资源目录按优先级递增的顺序加载:

1. 用户 Tau 资源
2. 用户 `.agents` 资源
3. 项目 Tau 资源
4. 项目 `.agents` 资源

[原文]
If two directories define the same skill or prompt template name, the later/higher-precedence resource wins. This lets project resources override user defaults.

[译文]
如果两个目录定义了同名的技能或提示词模板,后加载/优先级更高的资源获胜。这让项目资源可以覆盖用户默认值。

[原文]
Duplicate names within the same directory remain invalid and raise `ResourceError`.

[译文]
同一目录内的重名仍然非法,会抛出 `ResourceError`。

[原文]
`AGENTS.md` files found directly inside `.agents` directories are not treated as skills. Project instruction discovery is reserved for a later context-discovery phase.

[译文]
直接位于 `.agents` 目录内的 `AGENTS.md` 文件不会被当作技能。项目指令发现保留给之后的上下文发现阶段。

## CodingSession 集成(CodingSession integration)

[原文]
`CodingSession.load()` now builds default resource paths with the session cwd:

[译文]
`CodingSession.load()` 现在会用会话的 cwd 构建默认资源路径:

```python
TauResourcePaths(cwd=config.cwd)
```

[原文]
That means normal coding sessions automatically see both user and project `.agents` resources.

[译文]
这意味着普通编码会话会自动看到用户级与项目级的 `.agents` 资源。

[原文]
Print mode also passes cwd-aware resource paths when loading skills for system prompt assembly.

[译文]
Print 模式在为系统提示词组装而加载技能时,也会传入感知 cwd 的资源路径。

## 测试(Tests)

[原文]
The phase is covered by:

[译文]
本阶段的测试覆盖为:

```text
tests/test_paths.py
tests/test_resources.py
tests/test_skills.py
tests/test_prompt_templates.py
tests/test_cli.py
tests/test_coding_session.py
```

[原文]
The tests verify:

- canonical Tau path construction
- user-home project session paths
- `.agents` skill discovery
- `.agents` prompt discovery
- project resources overriding user resources
- `AGENTS.md` not being loaded as a skill
- isolated resource paths for deterministic tests

[译文]
测试验证:

- 规范化 Tau 路径的构建
- 用户主目录下的项目会话路径
- `.agents` 技能发现
- `.agents` 提示词发现
- 项目资源覆盖用户资源
- `AGENTS.md` 不会被当作技能加载
- 为确定性测试而隔离的资源路径

## 下一阶段(Next phase)

[原文]
The next phase should add a real session manager and resume flow on top of these stable user-home session locations.

[译文]
下一阶段应当在这些稳定的用户主目录会话位置之上,加入真正的会话管理器与恢复(resume)流程。
