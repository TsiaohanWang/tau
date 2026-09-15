---
title: "Extension-owned sidebar sections / 扩展拥有的侧边栏区块"
---

[原文]
Tau extensions can now add host-framed sections to the interactive session
sidebar through `context.ui.sidebar`. This closes the gap between the existing
prompt-adjacent component slots and the host-owned sidebar without exposing
`TauTuiApp`, Textual container IDs, or private sidebar widgets.

[译文]
Tau 扩展现在可以通过 `context.ui.sidebar` 向交互式会话侧边栏添加由宿主框定的区块。这填补了「提示输入附近的组件槽位」与「宿主拥有的侧边栏」之间的空白,同时不暴露 `TauTuiApp`、Textual 容器 ID 或私有的侧边栏组件。

## API

[原文]
An extension feature-detects the facade, checks availability, then sets content
under a local stable key:

[译文]
扩展先对门面做特性探测、检查可用性,然后以一个本地稳定键设置内容:

```python
sidebar = getattr(context.ui, "sidebar", None)
if sidebar is not None and sidebar.supported:
    sidebar.set_section(
        "status",
        title="build",
        content=["[green]ready[/green]"],
    )
```

[原文]
Calling `set_section` again with the same key replaces the section in place.
For host-rendered display lines, Tau retains the mounted section root and updates
its title and body directly; identical contributions are no-ops. Widget factories
retain replacement semantics because the host cannot safely mutate an arbitrary
extension widget. `remove_section(key)` removes it. Keys are internally scoped by
extension name, so unrelated extensions can safely choose the same local key. Registration
order is deterministic; replacing preserves position, while remove plus re-add
moves the section to the end.

[译文]
用同一个键再次调用 `set_section` 会就地替换该区块。对于由宿主渲染的显示行,Tau 会保留已挂载的区块根节点,并直接更新其标题与正文;完全相同的贡献是无操作。控件工厂则保留「替换」语义,因为宿主无法安全地修改任意的扩展控件。`remove_section(key)` 会移除该区块。键在内部按扩展名做了作用域隔离,因此不相关的扩展可以安全地选择同一个本地键。注册顺序是确定性的;替换会保持原位置,而「先移除再加入」会把该区块移到末尾。

[原文]
A body may be Rich-markup display lines or a `factory(theme) -> Widget`.
Display lines are preferred because they do not import Textual. A factory is
available for live or interactive content and is rebuilt when Tau's live theme
changes.

[译文]
正文可以是 Rich 标记显示行,也可以是一个 `factory(theme) -> Widget`。首选显示行,因为它们不导入 Textual。工厂适用于实时或交互式内容,并会在 Tau 的实时主题变化时重建。

## 所有权边界(Ownership boundary)

[原文]
This remains in `tau_coding`:

```text
extension event handler
        ↓
ExtensionSidebar (extension identity + generation guard)
        ↓
UiBridge sidebar methods
        ↓
TauTuiApp mounts into SessionSidebar
```

[译文]
这仍留在 `tau_coding`:

```text
扩展事件处理器
        ↓
ExtensionSidebar(扩展身份 + 代际守卫)
        ↓
UiBridge 的侧边栏方法
        ↓
TauTuiApp 挂载进 SessionSidebar
```

[原文]
`tau_agent` is unchanged. The host owns section headings, separators, width,
wrapping, scrolling, left/right placement, responsive hiding, and teardown.
Extensions never receive a sidebar container.

[译文]
`tau_agent` 不变。宿主拥有区块标题、分隔符、宽度、折行、滚动、左右放置、响应式隐藏与拆卸。扩展永远不会拿到侧边栏容器。

[原文]
`ExtensionSidebar` carries the extension name so host keys are
`(extension_name, local_key)`, unlike the older raw component bridge's global
keys. The generation guard rejects a facade captured before `/reload`.

[译文]
`ExtensionSidebar` 携带扩展名,因此宿主键是 `(extension_name, local_key)`,不同于更早的原始组件桥所使用全局键。代际守卫会拒绝在 `/reload` 之前捕获到的门面。

## 可用性与生命周期(Availability and lifecycle)

[原文]
The sidebar reports unsupported in print/headless mode and when
`sidebar_position` is `"off"`; setters then safely do nothing and do not invoke
widget factories. Responsive hiding is different: contributions remain mounted
and return when the terminal grows.

[译文]
在 print/无头模式以及 `sidebar_position` 为 `"off"` 时,侧边栏会报告为不支持;此时 setter 安全地什么都不做,也不会调用控件工厂。响应式隐藏则不同:贡献保持挂载,并在终端变大时重新出现。

[原文]
The existing `clear_components()` lifecycle path also clears sidebar sections.
It runs for `/reload`, `/new`, `/resume`, related session replacement flows,
and application teardown. Extensions should normally mount in `session_start`,
after the frontend bridge exists, and may explicitly remove their sections from
`session_shutdown`.

[译文]
既有的 `clear_components()` 生命周期路径也会清空侧边栏区块。它会在 `/reload`、`/new`、`/resume`、相关的会话替换流程与应用拆卸时运行。扩展通常应在 `session_start` 中挂载(此时前端桥已存在),并可以在 `session_shutdown` 中显式移除自己的区块。

## 失败隔离(Failure isolation)

[原文]
Factory and mount failures keep the prior UI usable, produce the existing
extension-component notification, and add an extension-owned runtime diagnostic.
A body that crashes during `render` or `on_mount` is found through the existing
tracked-widget traceback boundary, quarantined, and removed without terminating
the TUI.

[译文]
工厂与挂载失败会让先前的 UI 保持可用,产生既有的扩展组件通知,并添加一条扩展拥有的运行时诊断。若某个正文在 `render` 或 `on_mount` 期间崩溃,会经由既有的「受跟踪组件回溯边界」被发现、隔离并移除,而不会终止 TUI。

## 验证(Verification)

[原文]
Focused coverage lives in `tests/test_extensions.py` and
`tests/test_tui_components.py`. It exercises ownership, validation, update and
ordering semantics, removal, disabled and responsive sidebars, live themes,
factory isolation, headless no-ops, stale generations, and lifecycle cleanup.
Run the complete project gate with:

[译文]
聚焦覆盖位于 `tests/test_extensions.py` 与 `tests/test_tui_components.py`。它演练:所有权、校验、更新与排序语义、移除、禁用与响应式侧边栏、实时主题、工厂隔离、无头模式无操作、陈旧代际,以及生命周期清理。运行完整项目关卡:

```bash
uv run pytest
uv run ruff check .
uv run ruff format --check .
uv run mypy
```
