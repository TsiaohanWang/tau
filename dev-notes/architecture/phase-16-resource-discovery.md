---
title: "Phase 16: Robust Resource Discovery / 阶段 16:健壮的资源发现"
---

[原文]
Phase 16 makes skill and prompt-template discovery tolerant enough for real user
resource directories.

[译文]
阶段 16 让技能与提示词模板的发现过程足够宽容,以适配真实的用户资源目录。

[原文]
The implementation lives in:

[译文]
实现位于:

```text
src/tau_coding/resources.py
src/tau_coding/skills.py
src/tau_coding/prompt_templates.py
src/tau_coding/session.py
src/tau_coding/commands.py
```

## 新增了什么(What was added)

[原文]
Tau now has a `ResourceDiagnostic` type for non-fatal resource discovery notes.
It records:

- the resource kind, such as `skill` or `prompt`
- the affected resource name when known
- the path when known
- a short message
- a severity string

[译文]
Tau 现在有了 `ResourceDiagnostic` 类型,用于记录非致命的资源发现提示。它记录:

- 资源种类,例如 `skill` 或 `prompt`
- 已知时,受影响的资源名
- 已知时,路径
- 一条简短消息
- 一个严重程度字符串

[原文]
Skills and prompt templates now have diagnostic loaders:

[译文]
技能与提示词模板现在都有诊断式加载器:

```python
load_skills_with_diagnostics(...)
load_prompt_templates_with_diagnostics(...)
```

[原文]
The older strict loaders still exist for callers that want discovery errors to
raise `ResourceError`.

[译文]
此前的严格加载器依然存在,供那些希望发现错误直接抛出 `ResourceError` 的调用方使用。

## 发现行为(Discovery behavior)

[原文]
Resource directories are still loaded in increasing precedence order:

1. user Tau resources
2. user `.agents` resources
3. project Tau resources
4. project `.agents` resources

[译文]
资源目录仍按优先级递增的顺序加载:

1. 用户 Tau 资源
2. 用户 `.agents` 资源
3. 项目 Tau 资源
4. 项目 `.agents` 资源

[原文]
If a higher-precedence resource has the same name as a lower-precedence
resource, the higher-precedence resource wins. The diagnostic loaders report the
override instead of hiding it.

[译文]
如果高优先级资源与低优先级资源同名,高优先级资源获胜。诊断式加载器会报告这次覆盖,而不是把它隐藏起来。

[原文]
If one directory contains two skills with the same name, Tau keeps the first
deterministic match and reports a duplicate-name diagnostic. This prevents one
bad local resource from stopping the TUI from opening.

[译文]
如果同一个目录里有两个同名技能,Tau 保留确定性顺序中的第一个匹配项,并报告一条重名诊断。这可以防止一个坏掉的本地资源导致 TUI 无法打开。

## 编码会话集成(Coding session integration)

[原文]
`CodingSession.load()` uses the diagnostic loaders. Loaded diagnostics are
available on:

[译文]
`CodingSession.load()` 使用诊断式加载器。加载到的诊断信息可通过以下属性获取:

```python
session.resource_diagnostics
```

[原文]
That keeps discovery diagnostics in `tau_coding`, where local resources,
commands, and UI behavior live. The reusable `tau_agent` package remains
independent of resource paths and markdown discovery.

[译文]
这使发现诊断留在 `tau_coding` —— 本地资源、命令与 UI 行为所在之处。可复用的 `tau_agent` 包仍然独立于资源路径与 Markdown 发现。

## 命令与 TUI 可见性(Command and TUI visibility)

[原文]
The slash-command registry now includes:

[译文]
斜杠命令注册表现在包含:

```text
/resources
```

[原文]
It shows how many skills and prompt templates loaded, plus any discovery
diagnostics. `/status` also includes a resource diagnostic count, and `/skills`
shows skill diagnostics when present.

[译文]
它会显示加载了多少技能与提示词模板,以及任何发现诊断。`/status` 也会包含资源诊断计数,而 `/skills` 会在存在技能诊断时展示它们。

[原文]
The Textual TUI does not need a special diagnostics API. It already renders
command results as transcript items, so `/resources` surfaces the same
information interactively.

[译文]
Textual TUI 不需要专门的诊断 API。它已经把命令结果渲染为会话记录条目,因此 `/resources` 会以交互方式呈现同样的信息。

## 测试(Tests)

[原文]
The phase is covered by:

[译文]
本阶段的测试覆盖为:

```text
tests/test_skills.py
tests/test_prompt_templates.py
tests/test_commands.py
tests/test_coding_session.py
```

[原文]
The tests verify:

- deterministic override handling
- duplicate skill diagnostics
- tolerant `CodingSession` loading
- `/status` resource diagnostic counts
- `/resources` command output

[译文]
测试验证:

- 确定性的覆盖处理
- 重复技能的诊断
- 宽容的 `CodingSession` 加载
- `/status` 的资源诊断计数
- `/resources` 命令输出
