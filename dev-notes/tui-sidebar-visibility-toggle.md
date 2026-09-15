# 仅限会话的 TUI 侧边栏可见性 / Session-only TUI sidebar visibility

[原文]
Tau's interactive TUI now exposes `/sidebar` in the slash-command palette. The
command toggles the detailed session sidebar without changing `~/.tau/tui.json`
or the configured `sidebar_position`.

[译文]
Tau 的交互式 TUI 现在在斜杠命令面板中暴露 `/sidebar`。该命令切换详细的会话侧边栏,但不修改 `~/.tau/tui.json` 或已配置的 `sidebar_position`。

## 行为(Behavior)

[原文]
- Configured `left` and `right` positions remain unchanged while the sidebar is
  hidden and shown.
- Responsive hiding still applies until the user explicitly changes visibility.
- Once the user hides the sidebar, resizing the terminal does not unexpectedly
  restore it.
- A configured `off` sidebar can be shown for the current session at the
  existing default right position. Restarting Tau honors the saved `off` value.

[译文]
- 在侧边栏隐藏与显示期间,已配置的 `left` 与 `right` 位置保持不变。
- 在用户显式改变可见性之前,响应式隐藏仍然生效。
- 用户一旦隐藏侧边栏,调整终端尺寸不会意外地把它恢复出来。
- 配置为 `off` 的侧边栏可以在当前会话中按既有的默认右侧位置显示出来。重启 Tau 时仍遵循保存的 `off` 值。

[原文]
The visibility override belongs to `TauTuiApp`, alongside other frontend-only
state. It is intentionally not part of `TuiSettings`, so theme persistence and
other durable TUI settings cannot accidentally serialize it.

[译文]
该可见性覆盖属于 `TauTuiApp`,与其他仅前端的状态放在一起。它有意不属于 `TuiSettings`,因此主题持久化与其他持久化 TUI 设置不会意外地把它序列化进去。

## 测试(Tests)

[原文]
Deterministic Textual pilot tests cover left/right toggling, responsive resize
behavior, configured-off temporary showing, and the no-write guarantee. Run the
focused suite with:

[译文]
确定性的 Textual 试点测试覆盖左/右切换、响应式尺寸变化行为、配置为 off 时的临时显示,以及「不写入」保证。运行聚焦套件:

```bash
uv run pytest tests/test_tui_app.py tests/test_commands.py
```
