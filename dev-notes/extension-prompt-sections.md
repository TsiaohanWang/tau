# 扩展拥有的系统提示词区块 / Extension-owned system-prompt sections

[原文]
Issue: https://github.com/huggingface/tau/issues/648

[译文]
Issue:https://github.com/huggingface/tau/issues/648

## 变更内容(What changed)

[原文]
Extensions can now call:

[译文]
扩展现在可以调用:

```python
tau.add_prompt_section(title, body)
```

[原文]
The body is free-form Markdown suitable for paragraphs, lists, procedures, and
code blocks. A non-empty title renders as a level-two heading; `None` or a blank
title creates an unlabeled block. Sections follow CLI/resource append content
and retain extension load and registration order.

[译文]
body 是自由格式的 Markdown,适合段落、列表、流程说明与代码块。非空 title 会渲染为二级标题;`None` 或空白标题会创建一个无标签的块。区块排在 CLI/资源追加内容之后,并保持扩展的加载与注册顺序。

## 为什么(Why)

[原文]
`add_prompt_guideline` intentionally contributes one flat bullet to Tau's
`Guidelines` section. It cannot represent structured instructions cleanly.
Always-on extension context also should not be moved into an optional skill or a
global `AGENTS.md` when it applies only while that extension is active.

[译文]
`add_prompt_guideline` 有意只向 Tau 的 `Guidelines` 区块贡献一条扁平的要点,无法干净地表达结构化指令。当某些常驻扩展上下文只在该扩展活动期间适用时,也不应把它挪进可选技能或全局 `AGENTS.md`。

## 设计(Design)

[原文]
`PromptSection` is a frontend-free system-prompt assembly value. The extension
runtime stores sections with their canonical source owner, just like standalone
guidelines. Failed setup removes partial registrations; reload and retirement
clear the outgoing generation. Empty bodies and multi-line titles produce
bounded extension diagnostics rather than malformed prompt markup.

[译文]
`PromptSection` 是一个与前端无关的系统提示词组装值。扩展运行时像存储独立准则一样,把区块与其规范来源所有者一起保存。setup 失败会移除部分注册;reload 与退役会清空外出代际。空的 body 与多行 title 会产生有界的扩展诊断,而不是畸形的提示词标记。

[原文]
`CodingSession` passes runtime sections through
`BuildSystemPromptOptions.extra_sections` after the existing
`append_system_prompt` value. Reload compares section snapshots so adding,
changing, or removing an extension section rebuilds the next-turn prompt.
An exact low-level `CodingSessionConfig.system` override remains exact and does
not receive generated extension contributions.

[译文]
`CodingSession` 会把运行时区块经由 `BuildSystemPromptOptions.extra_sections` 传入,位置在既有的 `append_system_prompt` 值之后。Reload 会比较区块快照,因此新增、修改或移除某个扩展区块都会重建下一轮的提示词。精确的底层 `CodingSessionConfig.system` 覆盖仍然保持精确,不会接收生成的扩展贡献。

[原文]
Pi currently supports more general per-turn system-prompt mutation through its
`before_agent_start` hook. Tau does not yet expose that broader context-rewriting
surface. This narrower registration API addresses the always-on structured
context use case while preserving deterministic startup/reload assembly and
source ownership.

[译文]
Pi 目前通过其 `before_agent_start` 钩子支持更通用的逐轮系统提示词变更。Tau 尚未暴露那套更宽泛的上下文重写界面。这个更窄的注册 API 解决了常驻结构化上下文的用例,同时保持确定性的启动/reload 组装与来源所有权。

## 验证(Validation)

```bash
uv run pytest tests/test_system_prompt.py tests/test_extensions.py
uv run ruff check .
uv run ruff format --check .
uv run mypy
```

[原文]
For manual validation, load `examples/extensions/prompt_section.py` with `tau -e`
and use `/system` to confirm its heading, paragraphs, and fenced command block
appear after any `APPEND_SYSTEM.md` content. Remove the extension or run `/reload`
after deleting its registration and confirm the section disappears.

[译文]
手动验证时,用 `tau -e` 加载 `examples/extensions/prompt_section.py`,并用 `/system` 确认其标题、段落与围栏命令块出现在任何 `APPEND_SYSTEM.md` 内容之后。移除该扩展,或在删除其注册之后运行 `/reload`,确认该区块消失。
