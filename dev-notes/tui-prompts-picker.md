# 可搜索的提示词模板选择器 / Searchable prompt-template picker

[原文]
Issue #452 adds `/prompts` as a built-in TUI command. It opens a Textual modal over the coding session, keeping picker behavior in `tau_coding.tui` rather than the reusable agent harness.

[译文]
Issue #452 把 `/prompts` 加入为内置 TUI 命令。它会在编码会话之上打开一个 Textual 模态框,把选择器行为留在 `tau_coding.tui`,而不是放进可复用的 agent harness。

[原文]
The modal sorts loaded templates by name, displays names and descriptions, and filters both fields case-insensitively. Up/Down move the selection, Enter inserts `/<template-name>` into the prompt editor without submitting, and Escape cancels. Dedicated messages explain empty and no-match states.

[译文]
该模态框按名称排序已加载模板,展示名称与描述,并对两个字段做大小写不敏感的过滤。Up/Down 移动选择,Enter 把 `/<template-name>` 插入提示编辑器但不提交,Escape 取消。空集合与无匹配状态都有专门的消息说明。

[原文]
The command registry communicates the UI request through `CommandResult.prompts_picker_requested`, matching existing session/model picker boundaries. The resource loader reserves the case-insensitive template name `prompts`, ignores colliding files with a diagnostic, and therefore guarantees that a template cannot shadow the picker command.

[译文]
命令注册表通过 `CommandResult.prompts_picker_requested` 传达该 UI 请求,与既有的会话/模型选择器边界一致。资源加载器保留大小写不敏感的模板名 `prompts`,遇到冲突文件时忽略它并给出诊断,因此保证模板无法遮蔽该选择器命令。

[原文]
Validate with:

[译文]
验证方式:

```bash
uv run pytest tests/test_commands.py tests/test_tui_app.py -k prompts
uv run ruff check .
uv run mypy
```
