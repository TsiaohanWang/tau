# 侧边栏文件编辑器 / Sidebar file editor

## 变更内容(What changed)

[原文]
Prompt-template, project-context, and skill rows in the TUI sidebar are now
interactive file entries. Clicking one replaces the transcript with a main-area
text editor. Arrow keys move the editing cursor, `Ctrl+S` saves without closing
the editor, and `Escape` restores the transcript. Save success and filesystem
errors remain visible in both the editor status line and a TUI notification.
Saves use path-based permission handling for Windows compatibility, reject
files changed externally since opening, and block switching sidebar files while
the current editor has unsaved changes.

[译文]
TUI 侧边栏中的提示词模板、项目上下文与技能行现在是可交互的文件条目。点击其中一行会用主区域的文本编辑器替换会话记录。方向键移动编辑光标,`Ctrl+S` 保存但不关闭编辑器,`Escape` 恢复会话记录。保存成功与文件系统错误会同时显示在编辑器状态行与一条 TUI 通知中。保存使用基于路径的权限处理以兼容 Windows;若文件在打开之后被外部修改,保存会被拒绝;当当前编辑器存在未保存修改时,禁止切换侧边栏文件。

[原文]
Skills deliberately expose only their main `SKILL.md`. Supporting files beside
it remain outside this first editor surface.

[译文]
技能有意只暴露其主文件 `SKILL.md`。与其并列的辅助文件仍不在这一版编辑器界面范围内。

## 为什么(Why)

[原文]
The sidebar already identifies the files that shape a session, but editing them
required switching to another terminal or opening the prompt-template picker.
A direct editor makes those visible resources actionable while preserving the
existing session and agent loop.

[译文]
侧边栏已经能标出塑造一次会话的文件,但编辑它们仍需要切到另一个终端,或打开提示词模板选择器。直接编辑器让这些可见资源变得可操作,同时保持既有的会话与 agent 循环不变。

## 架构(Architecture)

[原文]
The feature stays in `tau_coding.tui`. `SidebarFileItem` owns mouse/keyboard
activation and emits a typed Textual message. `TauTuiApp` reads the selected
path and mounts `SidebarFileEditor` through the existing main-view seam, leaving
`tau_agent` and session semantics unchanged. Saving writes only the selected
file; `/reload` remains the explicit operation that reapplies changed resources
to the active session.

[译文]
该功能留在 `tau_coding.tui`。`SidebarFileItem` 持有鼠标/键盘激活逻辑,并发出带类型的 Textual 消息。`TauTuiApp` 读取所选路径,并通过既有的主视图接缝挂载 `SidebarFileEditor`,`tau_agent` 与会话语义保持不变。保存只写入所选文件;`/reload` 仍是把变更后的资源重新应用到活动会话的显式操作。

## 验证(Validation)

```bash
uv run pytest tests/test_tui_app.py -k sidebar
uv run ruff check .
uv run ruff format --check .
uv run mypy
```

[原文]
For a manual check, expand the sidebar skills or prompts section, hover a file
row, click it, edit the text, save with `Ctrl+S`, then close with `Escape`.
Repeat with a context file such as `AGENTS.md` and run `/reload` to apply it.

[译文]
手动检查:展开侧边栏的技能或提示词区块,把鼠标悬停在某个文件行上,点击它,编辑文本,用 `Ctrl+S` 保存,再用 `Escape` 关闭。对 `AGENTS.md` 之类的上下文文件重复此过程,并运行 `/reload` 使其生效。
