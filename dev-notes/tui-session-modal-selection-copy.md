# TUI `/session` 模态框的选择复制 / TUI /session modal selection copy

## 变更内容(What changed)

[原文]
The `/session` command output modal now opts into automatic copy-on-select behavior. Users can select text in the session details modal and Tau copies the selected text to the clipboard, even when the global transcript `auto_copy_selection` setting is disabled.

[译文]
`/session` 命令的输出模态框现在选择启用「选中即复制」行为。用户可以在会话详情模态框中选择文本,Tau 会把选中文本复制到剪贴板,即使全局的会话记录 `auto_copy_selection` 设置处于禁用状态。

## 为什么需要它(Why it exists)

[原文]
The session modal contains IDs, paths, provider/model details, resource diagnostics, and context accounting that are often useful when documenting production work or starting a follow-up PR. Copy-on-select makes that information easy to reuse without adding another command or exporting the whole session.

[译文]
会话模态框包含 ID、路径、provider/模型详情、资源诊断与上下文计量,这些在记录生产工作或发起后续 PR 时常常有用。选中即复制让这些信息易于复用,而无需新增命令或导出整个会话。

## 架构说明(Architecture notes)

[原文]
The change stays in the Textual TUI layer:

[译文]
该变更留在 Textual TUI 层:

[原文]
- `CommandOutputScreen` exposes a modal-local `auto_copy_selection` flag.
- `TauTuiApp._show_command_message()` enables that flag only for `/session` output.
- `TauTuiApp.on_text_selected()` now checks either the global TUI setting or the active screen's modal-local flag before copying.

[译文]
- `CommandOutputScreen` 暴露一个模态局部的 `auto_copy_selection` 标志。
- `TauTuiApp._show_command_message()` 只为 `/session` 输出启用该标志。
- `TauTuiApp.on_text_selected()` 现在会在复制之前,检查全局 TUI 设置或活动屏幕的模态局部标志。

[原文]
No clipboard or Textual dependencies were added to `tau_agent`.

[译文]
`tau_agent` 没有新增剪贴板或 Textual 依赖。

## 如何测试(How to test)

[原文]
Automated checks:

[译文]
自动化检查:

```bash
uv run pytest tests/test_tui_app.py -k "session_modal_auto_copies_selected_text or non_session_modal_uses_global_auto_copy_setting or command_modal"
uv run ruff check src/tau_coding/tui/app.py tests/test_tui_app.py
```

[原文]
Manual check:

[译文]
手动检查:

[原文]
1. Run `uv run tau`.
2. Open `/session`.
3. Select text inside the modal.
4. Paste into another application or terminal prompt and confirm the selected text was copied.

[译文]
1. 运行 `uv run tau`。
2. 打开 `/session`。
3. 在模态框内选择文本。
4. 粘贴到另一个应用或终端提示中,确认选中文本已被复制。
