# 可搜索的技能选择器 / Searchable skills picker

[原文]
Issue #451 adds `/skills` as a TUI-only discovery workflow. The normal command registry returns a UI intent, keeping Textual out of the reusable command/session layers. The Textual adapter presents loaded skills sorted by name and filters names and descriptions case-insensitively.

[译文]
Issue #451 把 `/skills` 加入为一个仅限 TUI 的发现工作流。普通命令注册表返回一个 UI 意图,从而使 Textual 不进入可复用的命令/会话层。Textual 适配器按名称排序展示已加载技能,并对名称与描述做大小写不敏感的过滤。

[原文]
Selecting a row places `/skill:<name>` in the prompt without submitting. F1 previews the complete skill header description in a modal while leaving Space available for multi-word searches. Ctrl+Enter appends the full `SKILL.md` to display-only TUI state, so it appears in the transcript without entering persisted session history or model context. Cancelling restores the submitted `/skills` text. Empty collections and searches display explicit states; existing resource diagnostics remain on their existing surfaces.

[译文]
选中某一行会把 `/skill:<name>` 放入提示输入,但不提交。F1 会在模态框中预览完整的技能头部描述,同时把 Space 留给多词搜索。Ctrl+Enter 会把完整的 `SKILL.md` 追加到仅供显示的 TUI 状态中,因此它会出现在会话记录里,却不进入持久化的会话历史或模型上下文。取消会恢复已提交的 `/skills` 文本。空集合与无结果搜索都会显示明确状态;既有的资源诊断仍留在原有界面。

[原文]
Validate with:

[译文]
验证方式:

```bash
uv run pytest tests/test_commands.py tests/test_tui_app.py
```
