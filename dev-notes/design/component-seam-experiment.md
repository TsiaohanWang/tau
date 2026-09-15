# 组件接缝实验:由扩展持有的 agent UI / Component-seam experiment: extension-owned agent UI

[原文]
**Decision (2026-07-09): adopted — this is the committed design, no longer an
experiment.** Extensions need real control over the UI to be useful, and this
seam carried the full subagents UX in practice. The measured costs in §8 are
accepted and recorded: core grew rather than shrank, and Textual is now
deliberately part of the public extension contract (extensions build against
the Textual version tau pins; a Textual major bump is a coordinated break for
core and extensions together). The phase-21 strings-not-widgets Ruling is
superseded (see the follow-up Ruling in `phase-21-extensions.md`); strings
remain the preferred form wherever they suffice. Everything below is preserved
as the historical record of how the decision was made.

[译文]
**决定(2026-07-09):已采纳 —— 这是既定设计,不再是实验。** 扩展若要有用,就需要对 UI 的真实控制权,而这条接缝在实践中承载了完整的子代理 UX。第 8 节中实测到的代价被接受并记录:内核是变大而不是变小,而且 Textual 现在被有意纳入公开扩展契约(扩展针对 tau 固定的 Textual 版本构建;Textual 的大版本升级是内核与扩展共同承担的协同破坏性变更)。阶段 21 中「用字符串而非控件」的裁定已被取代(见 `phase-21-extensions.md` 中后续的裁定);在够用的地方,字符串仍是首选形式。以下所有内容作为该决定如何做出的历史记录保留。

[原文]
**Status:** implemented through Step 3 on branch `component-seam-experiment` (both
repos), plus post-experiment fixes: the pre-dispatch interceptor relocation
(§2e implementation note) and the sequenced slot/main-view swaps (§2f
implementation note, bug fix 2). Core adds the generic component seam and has
fully removed the old transcript-source seam (§3); the `tau-subagents`
extension owns the entire agent UI via `ComponentBridge`. Both suites green
(core 802, extension 116). Measured outcome recorded in §8 (updated after the
fix commits). This is the deliberate other-path exploration of
the phase-21 strings-not-widgets Ruling (`phase-21-extensions.md` L416–442). The
Ruling's reopen triggers and the "preferred middle ground" (a declarative UI
layer) are unchanged; this branch instead tests the raw-widget seam so we can
measure the contract cost the Ruling predicted rather than argue it in the
abstract.

[译文]
**状态:** 已在分支 `component-seam-experiment`(两个仓库)上实现到 Step 3,外加实验后的修复:分发前的拦截器重定位(§2e 实现说明)与有序列的槽位/主视图交换(§2f 实现说明,缺陷修复 2)。内核新增了通用组件接缝,并已完全移除旧的 transcript-source 接缝(§3);`tau-subagents` 扩展通过 `ComponentBridge` 拥有整个 agent UI。两套测试均为绿色(内核 802,扩展 116)。第 8 节记录了实测结果(在修复提交之后更新)。这是对阶段 21「用字符串而非控件」裁定的有意「另一条路」探索(`phase-21-extensions.md` L416–442)。该裁定的重新开启触发条件与「优先折中方案」(声明式 UI 层)保持不变;本分支改为测试原生控件接缝,以便实测该裁定所预测的契约代价,而不是在抽象层面争论它。

[原文]
The experiment migrates the **entire** agent UI — agents strip, in-place
conversation view, steer composer, two-press stop — out of tau core and into the
`tau-subagents` extension, replacing the current generic *transcript-sources*
data seam with a pi-style *component* seam. Core keeps only a generic,
agent-agnostic widget-hosting layer.

[译文]
该实验把**整个** agent UI —— agents 状态条、就地对话视图、插话输入框、双击停止 —— 从 tau 内核迁移进 `tau-subagents` 扩展,用 pi 风格的*组件*接缝替换当前通用的 *transcript-sources* 数据接缝。内核只保留一个通用的、与 agent 无关的控件托管层。

[原文]
Design order below follows the porting rule: pi's surface first, then the tau
analog, deviations flagged **Ruling-style**.

[译文]
下文的设计顺序遵循移植规则:先讲 pi 的接口面,再讲 tau 的对应物,偏离之处以 **Ruling 风格**标出。

---

## 第 1 节:Pi 的实际接口面,即我们要移植的东西 / 1. Pi's actual surface (what we are porting)

### 1a. `ctx.ui` 中与组件相关的 API(1a. `ctx.ui` component-related API)

[原文]
All from `packages/coding-agent/src/core/extensions/types.ts` in
`earendil-works/pi`,
interface `ExtensionUIContext` (L125–276). Only the component-relevant members:

[译文]
全部来自 `earendil-works/pi` 中 `packages/coding-agent/src/core/extensions/types.ts` 的接口 `ExtensionUIContext`(L125–276)。只列出与组件相关的成员:

[原文]
| Member | Signature (abridged) | Semantics |
|---|---|---|
| `setWidget` | `(key, string[] \| ((tui, theme) => Component & {dispose?}) \| undefined, {placement?}) ` — L163–169 | Persistent widget above/below the editor. String-array or **factory callback** form; the callback re-runs on theme change and is re-invoked via `tui.requestRender()` without re-mounting. `undefined` removes it. `placement`: `"aboveEditor"` (default) \| `"belowEditor"` — L97–104. |
| `custom<T>` | `(factory:(tui,theme,keybindings,done)=>Component\|Promise<Component>, {overlay?, overlayOptions?, onHandle?}) => Promise<T>` — L190–204 | Show a **focus-capturing** component. `done(result)` resolves the promise and tears it down. `overlay:true` floats it via `showOverlay`; `overlayOptions` is `OverlayOptions` or a `()=>OverlayOptions` re-evaluated per frame; `onHandle` receives the `OverlayHandle` for visibility control. This is what the conversation viewer uses. |
| `onTerminalInput` | `(handler:(data:string)=>{consume?,data?}\|undefined) => (()=>void)` — L107, L139 | **Pre-editor raw-input listener.** Fires *before* the focused editor, can `consume` a key or rewrite `data`. Returns an unsubscribe fn. The fleet list routes ALL its nav keys through this, self-gated on `getEditorText()===""`. |
| `setHeader` / `setFooter` | `((tui,theme[,footerData]) => Component & {dispose?}) \| undefined` — L177–184 | Replace the startup header / status footer with a custom component. Not needed by subagents; not ported. |
| `setEditorComponent` / `getEditorComponent` | `(EditorFactory \| undefined)` — L119, L254–257 | Swap the input editor itself (vim mode etc.). Not needed by subagents; not ported. |
| `getEditorText` / `setEditorText` / `pasteToEditor` | L207–213 | Read/write the core editor buffer. The fleet list reads it to gate activation. |
| `theme` | `readonly Theme` — L260 | Current theme, handed into every factory callback. |
| `notify` / `setStatus` / `setTitle` | L136, L142, L187 | Toasts, footer status keys, terminal title. `notify` and `setStatus` are used by the widgets. |
| `select` / `confirm` / `input` | L127–133 | Host dialogs. **Stay host-side in tau** (constraint 3); already ported. |

[译文]
| 成员 | 签名(节选) | 语义 |
|---|---|---|
| `setWidget` | `(key, string[] \| ((tui, theme) => Component & {dispose?}) \| undefined, {placement?}) ` —— L163–169 | 位于编辑器上方/下方的常驻控件。支持字符串数组或**工厂回调**形式;回调会在主题变化时重新运行,并通过 `tui.requestRender()` 重新调用,而不重新挂载。`undefined` 会移除它。`placement`:`"aboveEditor"`(默认)\| `"belowEditor"` —— L97–104。 |
| `custom<T>` | `(factory:(tui,theme,keybindings,done)=>Component\|Promise<Component>, {overlay?, overlayOptions?, onHandle?}) => Promise<T>` —— L190–204 | 显示一个**捕获焦点**的组件。`done(result)` 会解决该 promise 并拆卸它。`overlay:true` 通过 `showOverlay` 把它浮起;`overlayOptions` 是 `OverlayOptions`,或每帧重新求值的 `()=>OverlayOptions`;`onHandle` 接收用于可见性控制的 `OverlayHandle`。对话查看器使用的就是它。 |
| `onTerminalInput` | `(handler:(data:string)=>{consume?,data?}\|undefined) => (()=>void)` —— L107、L139 | **编辑器前的原始输入监听器。** 它在获得焦点的编辑器*之前*触发,可以 `consume` 某个按键或重写 `data`。返回一个取消订阅函数。fleet list 的所有导航键都经由它路由,并以 `getEditorText()===""` 自我门控。 |
| `setHeader` / `setFooter` | `((tui,theme[,footerData]) => Component & {dispose?}) \| undefined` —— L177–184 | 用自定义组件替换启动页头/状态页脚。子代理不需要;未移植。 |
| `setEditorComponent` / `getEditorComponent` | `(EditorFactory \| undefined)` —— L119、L254–257 | 替换输入编辑器本身(如 vim 模式)。子代理不需要;未移植。 |
| `getEditorText` / `setEditorText` / `pasteToEditor` | L207–213 | 读/写核心编辑器缓冲。fleet list 读取它来门控激活。 |
| `theme` | `readonly Theme` —— L260 | 当前主题,会传给每个工厂回调。 |
| `notify` / `setStatus` / `setTitle` | L136、L142、L187 | Toast、页脚状态键、终端标题。控件使用了 `notify` 与 `setStatus`。 |
| `select` / `confirm` / `input` | L127–133 | 宿主对话框。**在 tau 中保持宿主侧**(约束 3);已移植。 |

### 1b. pi-tui 的 `Component` 生命周期(1b. pi-tui `Component` lifecycle)

[原文]
From `packages/tui/src/tui.ts` in `earendil-works/pi`:

[译文]
来自 `earendil-works/pi` 中的 `packages/tui/src/tui.ts`:

[原文]
- **`Component`** (L64–88): `render(width:number):string[]`; optional
  `handleInput?(data:string):void` (only when focused); optional
  `wantsKeyRelease?:boolean` (Kitty press/release filtering); `invalidate():void`
  (drop cached render state — called on theme change / forced redraw). Widget
  factories additionally may expose `dispose?()`.
- **`Focusable`** (L104–112): a `focused:boolean` the TUI sets; the component
  emits `CURSOR_MARKER` (L120) at the cursor so the host positions the hardware
  cursor. `isFocusable()` type-guard.
- **Overlays**: `TUI.showOverlay(component, options):OverlayHandle` (L493);
  `OverlayHandle` (L218–231) = `hide/setHidden/isHidden/focus/unfocus/isFocused`;
  `OverlayOptions` (L171–207) = sizing (`width`, `minWidth`, `maxHeight` as
  `number` or `"%"`), anchor + offsets, `row/col`, `margin`, a `visible(w,h)`
  predicate, and `nonCapturing`.
- **Render/input model**: single-threaded pull. `render(width)` returns lines;
  the TUI diffs them. Input is pushed to a pre-dispatch listener chain
  (`onTerminalInput`) first, then to `focusedComponent.handleInput` (L761–832).
  Live updates are driven by the component calling `tui.requestRender()` — e.g.
  `ConversationViewer` subscribes to `session.subscribe(cb)` and calls
  `requestRender()` on each event (conversation-viewer.ts L50–54). **This is
  push, not polling.**

[译文]
- **`Component`**(L64–88):`render(width:number):string[]`;可选的 `handleInput?(data:string):void`(仅在获得焦点时);可选的 `wantsKeyRelease?:boolean`(Kitty 按下/释放过滤);`invalidate():void`(丢弃缓存的渲染状态 —— 在主题变化/强制重绘时调用)。控件工厂额外可以暴露 `dispose?()`。
- **`Focusable`**(L104–112):由 TUI 设置的一个 `focused:boolean`;组件在光标处发出 `CURSOR_MARKER`(L120),让宿主定位硬件光标。`isFocusable()` 类型守卫。
- **Overlay**:`TUI.showOverlay(component, options):OverlayHandle`(L493);`OverlayHandle`(L218–231)= `hide/setHidden/isHidden/focus/unfocus/isFocused`;`OverlayOptions`(L171–207)= 尺寸(`width`、`minWidth`、`maxHeight`,取值为 `number` 或 `"%"`)、锚点与偏移、`row/col`、`margin`、一个 `visible(w,h)` 谓词,以及 `nonCapturing`。
- **渲染/输入模型**:单线程拉取。`render(width)` 返回若干行;TUI 对它们做 diff。输入先被推送到分发前的监听器链(`onTerminalInput`),然后才送到 `focusedComponent.handleInput`(L761–832)。实时更新由组件调用 `tui.requestRender()` 驱动 —— 例如 `ConversationViewer` 订阅 `session.subscribe(cb)`,并在每个事件上调用 `requestRender()`(conversation-viewer.ts L50–54)。**这是推送,不是轮询。**

### 1c. 消费者:三个控件实际依赖什么 / 1c. The consumer (what the three widgets actually rely on)

[原文]
- **`agent-widget.ts`** — persistent `aboveEditor` widget, factory-callback form,
  reads live manager state each `render()`, drives an 80 ms `setInterval` +
  `requestRender()`, unregisters (`setWidget(key,undefined)`) when empty.
- **`fleet-list.ts`** — `belowEditor` render-only widget + **all** key handling via
  `onTerminalInput`, gated on `getEditorText()===""`; `↓`/`←` at empty prompt
  activates, `↑↓` move, Enter → `ctx.ui.custom(...,{overlay:true})`, Esc/up-past-top
  deactivate; press-only (`isKeyRelease` filter); yields to the overlay while open.
- **`conversation-viewer.ts`** — `Component` shown via `custom({overlay:true})`;
  `session.subscribe` push updates; embedded `Input` steer composer (Enter sends,
  Esc cancels); two-press `x` stop guard; scroll via resolved keybindings
  (`viewer-keys.ts`); auto-scroll stickiness.

[译文]
- **`agent-widget.ts`** —— 常驻的 `aboveEditor` 控件、工厂回调形式,每次 `render()` 读取实时的 manager 状态,由 80 ms 的 `setInterval` + `requestRender()` 驱动,为空时注销(`setWidget(key,undefined)`)。
- **`fleet-list.ts`** —— `belowEditor` 的只渲染控件,外加**全部**按键处理都经由 `onTerminalInput`,以 `getEditorText()===""` 门控;空提示下 `↓`/`←` 激活,`↑↓` 移动,Enter → `ctx.ui.custom(...,{overlay:true})`,Esc/在顶部继续向上则取消激活;只处理按下(`isKeyRelease` 过滤);overlay 打开时让出。
- **`conversation-viewer.ts`** —— 通过 `custom({overlay:true})` 显示的 `Component`;`session.subscribe` 推送更新;内嵌 `Input` 插话输入框(Enter 发送,Esc 取消);双击 `x` 停止守卫;通过解析后的键位滚动(`viewer-keys.ts`);自动滚动粘性。

---

## 第 2 节:tau 的接缝设计(2. The tau seam design)

### 2a. 核心「组件」类型 = Textual `Widget`(2a. The core "component" type = a Textual `Widget`)

[原文]
Pi hands extensions its own `Component` because it owns pi-tui. Tau renders with
Textual. Per constraint 5 the experiment **accepts** that extension widgets
`import textual` directly — that is the cost being measured. So the seam's
"component" is simply `textual.widget.Widget` (and, for overlays, a widget the
host wraps in a screen). Core does **not** invent a `Component` protocol; it
mounts Textual widgets the extension builds.

[译文]
Pi 把自家的 `Component` 交给扩展,因为它拥有 pi-tui。Tau 用 Textual 渲染。按照约束 5,本实验**接受**扩展控件直接 `import textual` —— 这正是要测量的代价。因此这条接缝的「组件」就是 `textual.widget.Widget`(对于 overlay,则是宿主包装进 screen 的控件)。内核**不**发明 `Component` 协议;它挂载扩展构建的 Textual 控件。

[原文]
**Ruling (experiment):** the component type is Textual's `Widget`, not a
tau-owned abstraction. This is the whole point of the branch and the exact thing
the phase-21 Ruling warns against (Textual promoted into the public contract).
Recorded honestly, not hidden.

[译文]
**Ruling(实验):** 组件类型是 Textual 的 `Widget`,而不是 tau 自有的抽象。这正是本分支的全部意义所在,也正是阶段 21 裁定所警告的事情(把 Textual 提升进公开契约)。如实记录,不予隐藏。

[原文]
Core stays **agent-agnostic** (constraint 4): every name below is generic
("slot", "overlay", "interceptor"). No "agent", "fleet", "subagent" anywhere in
core.

[译文]
内核保持**与 agent 无关**(约束 4):下面每个名称都是通用的(「slot」「overlay」「interceptor」)。内核中任何地方都没有「agent」「fleet」「subagent」。

### 2b. 新 API:签名与位置(2b. New API — signatures and placement)

[原文]
Three files change. All type names live in `extensions/api.py`; the host
implementation lives in `tui/app.py`; `runtime.py` only loses code.

[译文]
三个文件发生变化。所有类型名都位于 `extensions/api.py`;宿主实现位于 `tui/app.py`;`runtime.py` 只减少代码。

```python
# --- extensions/api.py -----------------------------------------------------
from typing import Literal, Protocol
from collections.abc import Callable
# NB: api.py already imports nothing from textual and must not; the Widget type
# is referenced only under TYPE_CHECKING to keep print-mode import-clean.
if TYPE_CHECKING:
    from textual.widget import Widget
    from textual import events
    from tau_coding.tui.theme import TuiTheme

Placement = Literal["above_prompt", "below_prompt"]

# Factories are called by the host on the UI thread. They receive the live
# theme (theme handoff, mirrors pi's (tui, theme) => Component).
SlotWidgetFactory = Callable[["TuiTheme"], "Widget"]
OverlayWidgetFactory = Callable[["OverlayHandle", "TuiTheme"], "Widget"]

# Pre-editor key hook (ports onTerminalInput). Returns True to consume the key.
# The host passes the Textual Key event and the current prompt text so the
# handler can self-gate (pi gates on getEditorText()===\"\").
KeyInterceptor = Callable[["events.Key", str], bool]

class OverlayHandle(Protocol):
    """Handle to an open overlay (ports pi's OverlayHandle, trimmed)."""
    def close(self) -> None: ...
    @property
    def is_open(self) -> bool: ...

class ComponentBridge(Protocol):
    """Host widget-hosting capability. Part of what a UiBridge exposes when a
    TUI is attached; NullUiBridge/StderrUiBridge implement it as no-ops so an
    extension stays fully functional (just widget-less) in print mode."""
    @property
    def supports_components(self) -> bool: ...
    @property
    def theme(self) -> "TuiTheme": ...
    def get_prompt_text(self) -> str: ...
    def request_render(self) -> None: ...
    def set_slot_widget(
        self, key: str, factory: SlotWidgetFactory | None, *, placement: Placement
    ) -> None: ...
    def open_overlay(self, factory: OverlayWidgetFactory) -> OverlayHandle: ...
    def register_key_interceptor(self, handler: KeyInterceptor) -> Callable[[], None]: ...
```

[原文]
`UiBridge` (the existing Protocol, L229) gains these members;
`NullUiBridge`/`StderrUiBridge` gain no-op defaults (`supports_components ->
False`, `set_slot_widget`/`open_overlay` do nothing, `open_overlay` returns a
dead handle, `register_key_interceptor` returns a no-op unsubscribe,
`get_prompt_text -> ""`, `theme` raises or returns a shared default). `ExtensionUi`
(L349) grows a `components` property returning the bridge (or a
`supports_components=False` view) so extensions call
`context.ui.components.set_slot_widget(...)`.

[译文]
`UiBridge`(既有的 Protocol,L229)新增这些成员;`NullUiBridge`/`StderrUiBridge` 获得无操作默认实现(`supports_components -> False`、`set_slot_widget`/`open_overlay` 什么也不做、`open_overlay` 返回一个失效句柄、`register_key_interceptor` 返回无操作的取消订阅函数、`get_prompt_text -> ""`、`theme` 抛异常或返回一个共享默认值)。`ExtensionUi`(L349)新增一个 `components` 属性,返回该桥(或一个 `supports_components=False` 的视图),因此扩展可以调用 `context.ui.components.set_slot_widget(...)`。

[原文]
> **Implementation note (landed):** `set_slot_widget` now matches pi's
> `setWidget` on two points the first cut deferred. (1) **String-array form
> ported** — `content` is `SlotWidgetContent = Sequence[str] |
> SlotWidgetFactory | None` (not factory-only). A list of display lines is
> turned into a `Static` **host-side** (joined with newlines, parsed as Rich
> markup with a literal-text fallback via `_custom_markup_to_text`, mirroring
> the custom-message renderer guard), so a simple extension never imports
> Textual. The host normalizes strings into a factory inside
> `_set_extension_slot_widget` — it checks `callable()` first so a `Sequence`
> test can't swallow a factory, and treats a bare `str` as one line — leaving
> the reconcile/quarantine/last-writer-wins machinery untouched. (2)
> **`placement` default is now `"above_prompt"`** (pi's `aboveEditor`), not
> `"below_prompt"`.

[译文]
> **实现说明(已落地):** `set_slot_widget` 现在在两处与 pi 的 `setWidget` 对齐,而这两处是初版推迟的。(1)**字符串数组形式已移植** —— `content` 为 `SlotWidgetContent = Sequence[str] | SlotWidgetFactory | None`(不再只接受工厂)。显示行列表会在**宿主侧**被转换为 `Static`(以换行连接,按 Rich 标记解析,并通过 `_custom_markup_to_text` 提供纯文本回退,与自定义消息渲染器的守卫一致),因此简单扩展永远不需要导入 Textual。宿主在 `_set_extension_slot_widget` 内部把字符串规范化为工厂 —— 它先检查 `callable()`,这样 `Sequence` 判断不会吞掉工厂;并把裸 `str` 视为一行 —— 从而不触碰 reconcile/quarantine/最后写入者胜的机制。(2)**`placement` 默认值现在是 `"above_prompt"`**(即 pi 的 `aboveEditor`),而不是 `"below_prompt"`。

[原文]
**Removed from `api.py`:** `TranscriptSource`, `TranscriptSourceStatus`,
`TranscriptSourceProvider`, `TranscriptSourcesChangedCallback`,
`UiBridge.view_transcript`, `ExtensionUi.view_transcript`,
`ExtensionAPI.set_transcript_source_provider`,
`ExtensionAPI.notify_transcript_sources_changed` (and the same names from
`extensions/__init__.py` exports).

[译文]
**从 `api.py` 中移除:** `TranscriptSource`、`TranscriptSourceStatus`、`TranscriptSourceProvider`、`TranscriptSourcesChangedCallback`、`UiBridge.view_transcript`、`ExtensionUi.view_transcript`、`ExtensionAPI.set_transcript_source_provider`、`ExtensionAPI.notify_transcript_sources_changed`(以及 `extensions/__init__.py` 导出中的同名项)。

### 2c. `runtime.py` 的变更(2c. `runtime.py` changes)

[原文]
Pure subtraction. Remove `_transcript_source_providers`,
`_transcript_sources_changed`, `set_transcript_source_provider`,
`set_transcript_sources_changed_callback`, `notify_transcript_sources_changed`,
`transcript_sources`, and their `reset_for_reload`/`_remove_registrations`
clean-up lines. The component bridge needs **no** runtime aggregation: it is a
straight pass-through capability on the already-installed `self._ui`
(`set_ui_bridge`). `ExtensionUi.components` returns `self._runtime.ui` narrowed to
`ComponentBridge`. So runtime shrinks and gains nothing.

[译文]
纯粹的减法。移除 `_transcript_source_providers`、`_transcript_sources_changed`、`set_transcript_source_provider`、`set_transcript_sources_changed_callback`、`notify_transcript_sources_changed`、`transcript_sources`,以及它们在 `reset_for_reload`/`_remove_registrations` 中的清理行。组件桥**不需要**任何运行时聚合:它只是已在 `self._ui`(`set_ui_bridge`)之上的一层直通能力。`ExtensionUi.components` 返回收窄为 `ComponentBridge` 的 `self._runtime.ui`。因此运行时只会缩小,不会新增任何东西。

### 2d. Compose 树挂载(2d. Compose-tree mounting)

[原文]
Current tree (compose, L2250–2280):

[译文]
当前的树(compose,L2250–2280):

```
main-pane
├── #transcript            (main conversation)
├── #agent-transcript-pane (display-toggled sibling; agent view)   ← REMOVE
├── #queued-messages
├── #prompt-row
├── #compact-session-info
├── #autocomplete
└── #agent-strip           (below prompt)                          ← REMOVE
```
[原文]
Replaced generically:

[译文]
以通用方式替换为:

```
main-pane
├── #transcript
├── #above-prompt-slot     (empty Container; host-managed mount point)  ← NEW
├── #queued-messages
├── #prompt-row
├── #compact-session-info
├── #autocomplete
└── #below-prompt-slot     (empty Container; host-managed mount point)  ← NEW
```

[原文]
- `set_slot_widget(key, factory, placement="below_prompt")` mounts
  `factory(theme)` into the matching slot container under a host wrapper (see
  guards); `factory=None` unmounts and forgets that key. Multiple keys per slot
  mount in call order. `refresh_slot`/`request_render` triggers a re-render
  (Textual `widget.refresh()`), the analog of `tui.requestRender()`.
- The overlay **replaces the `#agent-transcript-pane` display-toggle** with a
  pushed screen: `open_overlay(factory)` pushes a host `ComponentOverlayScreen`
  (a `ModalScreen`) that mounts `factory(handle, theme)` and focuses it.
  `handle.close()` pops the screen (the `done()` analog). A pushed screen gives
  correct focus capture and Esc scoping for free, and removes the manual
  `display=False`/`display=True` transcript-swap dance from core. Sizing/anchor
  (pi's `OverlayOptions`) is left to the extension's own Textual CSS on its
  widget — core does not re-expose `OverlayOptions` (smaller contract; the
  extension already imports Textual and can size itself).

[译文]
- `set_slot_widget(key, factory, placement="below_prompt")` 把 `factory(theme)` 挂载到匹配的槽位容器中,外面套一层宿主包装(见守卫);`factory=None` 会卸载并忘记该键。同一个槽位的多个键按调用顺序挂载。`refresh_slot`/`request_render` 触发重新渲染(Textual 的 `widget.refresh()`),即 `tui.requestRender()` 的对应物。
- overlay **用被推入的 screen 替换 `#agent-transcript-pane` 的显示开关**:`open_overlay(factory)` 推入宿主的 `ComponentOverlayScreen`(一个 `ModalScreen`),它挂载 `factory(handle, theme)` 并聚焦它。`handle.close()` 弹出该 screen(即 `done()` 的对应物)。被推入的 screen 免费提供了正确的焦点捕获与 Esc 作用域,并从内核中去掉了手动的 `display=False`/`display=True` 会话记录切换动作。尺寸/锚点(pi 的 `OverlayOptions`)留给扩展在自己控件上的 Textual CSS —— 内核不再重新暴露 `OverlayOptions`(更小的契约;扩展已经导入 Textual,可以自行设定尺寸)。

[原文]
**Ruling (experiment):** overlay = pushed `ModalScreen`, not an in-tree toggled
pane. Textual screens already own focus/Esc/return semantics that the old
`_activate_source`/`_activate_main` pair hand-rolled; reusing them shrinks core.

[译文]
**Ruling(实验):** overlay = 被推入的 `ModalScreen`,而不是树内切换的 pane。Textual 的 screen 本就持有旧 `_activate_source`/`_activate_main` 手工实现的那套焦点/Esc/返回语义;复用它们可以缩小内核。

[原文]
> **Design revision (major — behavioral regression to reconcile):**
> a `ModalScreen` is not behaviorally equivalent to today's in-place view, and the
> divergence is larger than "steer composer feel" (risk §7.4). Today `_activate_
> source` only swaps `#transcript` → `#agent-transcript-pane` (app.py L2929–2930);
> the **agents strip, prompt row, and sidebar stay mounted and interactive**. That
> is load-bearing: the viewed source stays listed in the strip (L2833), so the
> user can left-arrow back into the strip and ↑↓ to *switch to another agent
> without leaving the view*, and can watch other agents' status dots while
> reading one. A full-screen `ModalScreen` covers the strip — switching agents now
> requires Esc → re-enter strip → Enter, and you lose peripheral fleet awareness.
> Also today steering is done in the **same main prompt** (`_submit_prompt_from_
> editor` routes to `_steer_viewed_agent`, L2376–2383) with the prompt prefix
> flipping to `▸` and placeholder "Steer …" (`_sync_prompt_identity`, L2986–3003);
> the modal replaces this with a separate embedded `Input`. Either (a) explicitly
> accept these as intended UX changes and say so (the old multi-agent-switch-from-
> view affordance is dropped), or (b) reconsider open-question 2 and use an
> in-tree toggled container that keeps the strip visible — which also makes the
> push-refresh trivially on-loop and avoids the modal focus-restoration risk.
> Right now the doc presents ModalScreen as a pure simplification; it is a UX
> trade the reviewer should decide deliberately.

[译文]
> **设计修订(重大 —— 需要处理的行为回归):**
> `ModalScreen` 与今天的就地视图在行为上并不等价,而且这种差异比「插话输入框的手感」更大(风险 §7.4)。今天 `_activate_source` 只是把 `#transcript` 换成 `#agent-transcript-pane`(app.py L2929–2930);**agents 状态条、提示行与侧边栏保持挂载且可交互**。这一点是承重的:被查看的来源仍列在状态条中(L2833),因此用户可以左箭头回到状态条并用 ↑↓ *在不离开视图的情况下切换到另一个 agent*,还能在读某个 agent 时观察其他 agent 的状态点。全屏 `ModalScreen` 会盖住状态条 —— 切换 agent 现在需要 Esc → 重新进入状态条 → Enter,而且你会失去对整体状态的周边感知。此外,今天的插话是在**同一个主提示输入**中完成的(`_submit_prompt_from_editor` 路由到 `_steer_viewed_agent`,L2376–2383),提示前缀会翻转为 `▸`,占位符变为 "Steer …"(`_sync_prompt_identity`,L2986–3003);而模态框用单独的内嵌 `Input` 取代了这一点。要么 (a) 明确接受这些是有意的 UX 变更并写明(旧的「从视图中切换多 agent」能力被放弃),要么 (b) 重新考虑未决问题 2,使用树内切换容器以保持状态条可见 —— 这也会让推送刷新轻易地保持在事件循环上,并避免模态框的焦点恢复风险。目前文档把 ModalScreen 描述为纯粹的简化;这是一个应由评审者有意识地决定的 UX 取舍。

[原文]
> **Decision (final): option (b) — in-tree main-area slot, not a
> ModalScreen.** The seam gains a third placement, `placement="main"`: the host
> mounts the widget as a display-toggled sibling of `#transcript` inside a
> generic `#main-slot` container (exactly the mechanics `#agent-transcript-pane`
> uses today, made generic), and `open_main_view(key)` / `close_main_view()`
> (or `set_slot_widget(key, factory, placement="main")` plus a show/hide call —
> implementer picks the cleaner shape and documents it) toggle
> `#transcript`/slot visibility. Rationale: preserves the two load-bearing
> affordances the review identified (strip stays visible → switch-agents-from-
> view and peripheral fleet awareness) and makes push-refresh trivially
> on-loop. Steering follows PI parity, not old-tau parity: the viewer widget
> embeds its own composer (pi-subagents' `ConversationViewer` model); the main
> prompt no longer routes to a viewed agent, and `_steer_viewed_agent` /
> prompt-identity swapping leave core entirely. Esc handling: the extension's
> key interceptor (2e) closes the view — no core special case. This drops the
> ModalScreen focus-restoration and live-refresh-into-modal risks.

[译文]
> **决定(最终):选项 (b) —— 树内的主区域槽位,而不是 `ModalScreen`。** 该接缝新增第三种放置方式 `placement="main"`:宿主把控件挂载为 `#transcript` 的、显示开关控制的兄弟节点,位于一个通用的 `#main-slot` 容器内(正是 `#agent-transcript-pane` 今天所用机制的通用化),并由 `open_main_view(key)` / `close_main_view()`(或 `set_slot_widget(key, factory, placement="main")` 加一次 show/hide 调用 —— 由实现者选择更干净的形态并记录它)切换 `#transcript`/槽位的可见性。理由:保留评审指出的两项承重能力(状态条保持可见 → 从视图中切换 agent,以及对整体状态的周边感知),并让推送刷新轻易地保持在事件循环上。插话遵循 **PI 对等**,而不是旧 tau 对等:查看器控件内嵌自己的输入框(pi-subagents 的 `ConversationViewer` 模型);主提示输入不再路由到被查看的 agent,`_steer_viewed_agent` / 提示身份切换完全离开内核。Esc 处理:由扩展的按键拦截器(2e)关闭视图 —— 内核没有特例。这去掉了 ModalScreen 的焦点恢复与「实时刷新进模态框」风险。

[原文]
> **Implementation note (Step 1 — API shape as landed):** Step 1 is purely
> additive; the new seam sits *alongside* the still-present `#agent-transcript-
> pane` / `#agent-strip` and the transcript-source seam (removals are Step 3).
> Concrete choices:
> - **Main view, not overlay.** `open_overlay`/`OverlayHandle` (the ModalScreen
>   shape in §2b) landed instead as `open_main_view(factory) -> MainViewHandle`
>   (renamed to reflect the in-tree reality). The factory is
>   `(handle, theme) -> Widget`; the host mounts it into a generic `#main-slot`
>   container (display-toggled sibling of `#transcript`, the generic form of
>   `#agent-transcript-pane`), hides `#transcript`, and `handle.close()` reverses
>   it and refocuses the prompt. This is the "explicit method" arm of the
>   orchestrator's option (b), chosen over `placement="main"` because the viewer
>   is per-open and needs a handle + theme at open time (mirrors Pi's
>   `custom({overlay:true})`), which a slot key + separate show/hide call could
>   not carry cleanly. Consequently **`Placement` is only `above_prompt` /
>   `below_prompt`** — there is no `"main"` placement.
> - **Focus stays on the prompt** when a main view opens (the host does not steal
>   it), so a registered key interceptor keeps firing and can `handle.close()` on
>   Esc. Step 2's viewer must `focus()` its own embedded composer if it wants
>   typing, and wire that composer's Esc/close back to `handle.close()` (the
>   interceptor only fires while the *prompt* is focused).
> - **`runtime.py` was not touched.** `ExtensionUi.components` is a pure
>   pass-through returning the installed `UiBridge` narrowed to `ComponentBridge`
>   (the bridge already reaches extensions via `runtime.ui`), so no runtime
>   aggregation/registration was needed.

[译文]
> **实现说明(Step 1 —— 落地时的 API 形态):** Step 1 纯粹是增量式的;新接缝与仍然存在的 `#agent-transcript-pane` / `#agent-strip` 以及 transcript-source 接缝*并存*(移除发生在 Step 3)。具体选择:
> - **主视图,而不是 overlay。** `open_overlay`/`OverlayHandle`(§2b 中的 ModalScreen 形态)最终落地为 `open_main_view(factory) -> MainViewHandle`(改名以反映树内现实)。工厂是 `(handle, theme) -> Widget`;宿主把它挂载进通用的 `#main-slot` 容器(`#transcript` 的显示开关兄弟节点,即 `#agent-transcript-pane` 的通用形式),隐藏 `#transcript`,而 `handle.close()` 反转该操作并重新聚焦提示输入。这是编排者选项 (b) 中「显式方法」的一支,之所以选择它而不是 `placement="main"`,是因为查看器是「每次打开」的,需要在打开时拿到 handle + theme(镜像 Pi 的 `custom({overlay:true})`),而「槽位键 + 单独 show/hide 调用」无法干净地承载这一点。因此 **`Placement` 只有 `above_prompt` / `below_prompt`** —— 不存在 `"main"` 放置。
> - **主视图打开时焦点留在提示输入上**(宿主不去抢它),因此已注册的按键拦截器会持续触发,并能在 Esc 时 `handle.close()`。Step 2 的查看器如果希望接受键入,必须 `focus()` 它自己内嵌的输入框,并把该输入框的 Esc/关闭接回 `handle.close()`(拦截器只在*提示输入*获得焦点时才触发)。
> - **`runtime.py` 未被触碰。** `ExtensionUi.components` 是纯粹的直通,返回收窄为 `ComponentBridge` 的已安装 `UiBridge`(该桥已经经由 `runtime.ui` 到达扩展),因此不需要任何运行时聚合/注册。

[原文]
> **Implementation note (result resolution — Pi's `done`):** `MainViewHandle`
> now carries the result-resolution half of Pi's `ctx.ui.custom<T>`. `close()`
> gained an optional `close(result=None)` and the handle gained
> `async def wait() -> object | None`, so an extension can "show a view, get an
> answer": the factory (or a key interceptor) calls `close(result)`, and the
> opener awaits `handle.wait()` for that value. We kept the **synchronous
> open/handle** model rather than porting `custom` as an async call — `wait()` is
> the awaitable, not `open_main_view`. Mechanics: the host creates an
> `asyncio.Future` on its event loop at open time; `close(result)` resolves it
> (first close wins, later closes no-op) and `wait()` awaits it (returning at once
> if already closed). Every *host-driven* teardown resolves the future with
> `None` via `_release_main_view_handle` — session rebind
> (`_clear_extension_components`), quarantine of the view's widget, mount failure,
> and being superseded by a later `open_main_view` (last writer wins) — so an
> awaiting extension task can never hang. The dead handles
> (`NullUiBridge`/`StderrUiBridge`, print mode) return `None` from `wait()`
> immediately and ignore `close(result)`.

[译文]
> **实现说明(结果解析 —— Pi 的 `done`):** `MainViewHandle` 现在承载 Pi `ctx.ui.custom<T>` 中「结果解析」的那一半。`close()` 增加了可选的 `close(result=None)`,handle 也增加了 `async def wait() -> object | None`,因此扩展可以「展示一个视图,拿到一个答案」:工厂(或某个按键拦截器)调用 `close(result)`,打开方则 await `handle.wait()` 取得该值。我们保留了**同步的 open/handle** 模型,而没有把 `custom` 移植为异步调用 —— 可 await 的是 `wait()`,不是 `open_main_view`。机制:宿主在打开时于其事件循环上创建一个 `asyncio.Future`;`close(result)` 解决它(先关闭者胜,之后的关闭为无操作),`wait()` await 它(若已关闭则立即返回)。每一次*宿主驱动*的拆卸都会通过 `_release_main_view_handle` 用 `None` 解决该 future —— 会话重新绑定(`_clear_extension_components`)、视图控件被隔离、挂载失败,以及被后续的 `open_main_view` 取代(最后写入者胜)—— 因此处于 await 中的扩展任务永远不会挂起。失效句柄(`NullUiBridge`/`StderrUiBridge`、print 模式)会立即从 `wait()` 返回 `None`,并忽略 `close(result)`。

### 2e. 编辑器前的输入钩子与 Esc 优先级(2e. The pre-editor input hook and Esc precedence)

[原文]
Pi's `onTerminalInput` fires before the focused editor. Textual delivers keys to
the focused widget first, then bubbles to ancestors/bindings. The faithful,
minimal splice point is the **top of `PromptInput.on_key`** (app.py L509–536) —
exactly where the hardcoded `focus_agent_strip()` call sits today (L528–533).

[译文]
Pi 的 `onTerminalInput` 在获得焦点的编辑器之前触发。Textual 先把按键投递给获得焦点的组件,然后才向祖先/绑定冒泡。最忠实、最小的接入点是 **`PromptInput.on_key` 的顶部**(app.py L509–536)—— 正是今天硬编码的 `focus_agent_strip()` 调用所在之处(L528–533)。

[原文]
Replace that special case with a generic consult:

[译文]
把该特例替换为一次通用查询:

```python
# PromptInput.on_key, before any built-in handling:
for interceptor in self.app._extension_key_interceptors():
    if interceptor(event, self.text):        # host guards each call (2f)
        event.stop(); event.prevent_default()
        return
```

[原文]
- Because this runs *inside* the focused editor before it consumes the key and
  before app-level bindings resolve, an interceptor that returns `True` for
  `escape` preempts `action_cancel` — this is how the strip's "Esc deactivates
  the list" wins over "Esc cancels the turn" **without** any strip branch in
  `action_cancel`. When no interceptor consumes Esc, it falls through to core's
  existing cancel binding unchanged.
- Interceptors see completions naturally: the extension gates on
  `prompt_text == ""` (pi parity), so a non-empty prompt or an open completion
  menu leaves normal typing/nav untouched. Core keeps its completion handling as
  is; only the removed `_strip_focused` branches in
  `action_completion_next/previous`, `on_text_area_changed`,
  `action_submit_prompt/follow_up`, and `action_cancel` go away.
- While the overlay screen is open the prompt is not focused, so interceptors do
  not fire — the overlay handles its own keys as a Textual screen (matches pi's
  "yield to the overlay while open").

[译文]
- 由于这段逻辑运行在获得焦点的编辑器*内部*,在它消费该按键之前、并且在应用级绑定解析之前,一个对 `escape` 返回 `True` 的拦截器会抢占 `action_cancel` —— 这就是状态条的「Esc 取消激活列表」胜过「Esc 取消本轮」的方式,而且 `action_cancel` 中**不需要**任何状态条分支。当没有拦截器消费 Esc 时,它会原样落到内核既有的取消绑定。
- 拦截器会自然地看到补全:扩展以 `prompt_text == ""` 门控(与 pi 对等),因此非空提示或打开的补全菜单会让正常输入/导航不受影响。内核的补全处理保持不变;只有被移除的 `_strip_focused` 分支会消失,它们位于 `action_completion_next/previous`、`on_text_area_changed`、`action_submit_prompt/follow_up` 与 `action_cancel`。
- overlay screen 打开时,提示输入没有焦点,因此拦截器不会触发 —— overlay 作为 Textual screen 处理自己的按键(与 pi 的「打开时让位给 overlay」一致)。

[原文]
**Theme handoff:** the host passes `self.tui_settings.resolved_theme` into every
factory and exposes it via `ComponentBridge.theme`. On theme change the host
re-invokes slot factories (drop + remount, or call an optional
`widget.on_theme_change(theme)` if present) — the analog of pi's `invalidate()`.

[译文]
**主题交接:** 宿主把 `self.tui_settings.resolved_theme` 传入每个工厂,并通过 `ComponentBridge.theme` 暴露它。主题变化时,宿主会重新调用槽位工厂(丢弃 + 重新挂载,或在存在可选的 `widget.on_theme_change(theme)` 时调用它)—— 即 pi `invalidate()` 的对应物。

[原文]
**Lifecycle (reload / unbind / shutdown):**
- Primary: the extension subscribes to `session_shutdown` and clears its own
  widgets (`set_slot_widget(key, None)`, close overlays) — pi parity (its widgets
  `dispose()` on shutdown).
- Safety net: the host tracks every slot key and overlay it mounted for
  extensions and force-clears them when `set_ui_bridge` is re-installed or the
  runtime is reset (`reset_for_reload`). A leaked extension widget must never
  survive a reload.

[译文]
**生命周期(reload / 解绑 / 关闭):**
- 主要路径:扩展订阅 `session_shutdown` 并清理自己的控件(`set_slot_widget(key, None)`、关闭 overlay)—— 与 pi 对等(它的控件在关闭时 `dispose()`)。
- 安全网:宿主跟踪它为扩展挂载的每一个槽位键与 overlay,并在 `set_ui_bridge` 被重新安装或运行时被重置(`reset_for_reload`)时强制清理它们。泄漏的扩展控件绝不能活过一次 reload。

[原文]
> **Design revision (major — /resume path under-specified):**
> `_connect_extension_runtime` (app.py L2559) — which calls `set_ui_bridge` — runs
> on **every** session bind, including `/resume` session switches (it is invoked
> from `__init__` L2196 and per bound session, each `CodingSession` carrying its
> *own* `extension_runtime`). So "force-clear on `set_ui_bridge` re-install" fires
> against the *new* runtime's bridge, while the stale strip/overlay widgets were
> mounted by the *previous* session's extension instance into host-owned slot
> containers that persist across the switch. The design must state concretely:
> on each `_connect_extension_runtime`, the host first force-clears **all**
> tracked slot keys and overlays (regardless of which runtime registered them),
> *then* installs the new bridge — otherwise a `/resume` leaves the old agents
> strip mounted while the new session's extension re-registers key
> `"subagents-fleet"` (same key → replace saves the strip, but any **open overlay**
> from the old session, which has no stable key, would leak). Add: open overlays
> are closed on bridge re-install and on `session_shutdown`, not only on runtime
> reset.

[译文]
> **设计修订(重大 —— /resume 路径说明不足):**
> `_connect_extension_runtime`(app.py L2559)—— 它调用 `set_ui_bridge` —— 会在**每一次**会话绑定时运行,包括 `/resume` 的会话切换(它从 `__init__` L2196 以及每个被绑定会话调用,而每个 `CodingSession` 都携带*自己的* `extension_runtime`)。因此「在 `set_ui_bridge` 重新安装时强制清理」实际作用于*新*运行时的桥,而过期的状态条/overlay 控件是由*上一个*会话的扩展实例挂载进跨切换仍存在的宿主槽位容器的。设计必须具体说明:在每次 `_connect_extension_runtime` 中,宿主先强制清理**所有**已跟踪的槽位键与 overlay(无论它们由哪个运行时注册),*然后*才安装新桥 —— 否则一次 `/resume` 会留下旧的 agents 状态条,而新会话的扩展重新注册键 `"subagents-fleet"`(同键 → 替换保存了状态条,但旧会话中任何**已打开的 overlay** 没有稳定键,就会泄漏)。补充:已打开的 overlay 应在桥重新安装时、以及 `session_shutdown` 时关闭,而不仅仅是在运行时重置时。

[原文]
> Note on the interceptor's focus scope (concern #1): a `PromptInput.on_key` hook
> only fires while the prompt has real Textual focus — but so does today's entire
> strip UX (left-arrow entry at L528 and arrow-nav via `action_completion_*`/
> `action_scroll_*` all require prompt focus; `_strip_focused` is a flag, the
> prompt never loses focus). So the parity is preserved for keyboard. The one
> capability today that works *without* prompt focus is the mouse click
> (`AgentStrip.on_click` → `_strip_click`, L1082–1090); the design's §4a omits
> click handling. Because the new strip is a real Textual `Widget`, it should
> implement its own `on_click`/`on_mouse_down` (strictly better than the
> app-routed click today) — add that to §4a so click-to-switch does not silently
> regress.

[译文]
> **关于拦截器焦点范围的说明(关切 #1):** `PromptInput.on_key` 钩子只在提示输入真正拥有 Textual 焦点时触发 —— 但今天整套状态条 UX 也是如此(L528 的左箭头进入,以及经由 `action_completion_*`/`action_scroll_*` 的方向导航,都要求提示输入获得焦点;`_strip_focused` 只是一个标志,提示输入从不失去焦点)。因此键盘层面的对等得以保留。今天唯一*不*需要提示输入焦点就能工作的能力是鼠标点击(`AgentStrip.on_click` → `_strip_click`,L1082–1090);设计的 §4a 遗漏了点击处理。由于新状态条是真正的 Textual `Widget`,它应当实现自己的 `on_click`/`on_mouse_down`(严格优于今天由应用路由的点击)—— 请把它补进 §4a,以免「点击切换」悄悄回归。

[原文]
> **Implementation note (post-experiment bug fix):** the `PromptInput.on_key`
> splice point above turned out to be **too late and too narrow**. tau binds
> `down`/`up`/`tab`/`alt+enter` on the *App* with `priority=True`
> (`_app_bindings`), and Textual's `App.on_event` runs
> `_check_bindings(key, priority=True)` **before** forwarding a `Key` to the
> focused widget. So `PromptInput.on_key` never even sees those nav keys —
> completion_next/previous/accept fire first. A widget-owned nav model (the
> strip taking focus and handling its own `on_key`) is therefore impossible
> under tau's app-priority bindings.
>
> The fix ports pi's `onTerminalInput` as a *true* pre-dispatch hook: the
> interceptor consult moved to an override of `async def on_event` on
> `TauTuiApp`, which for a non-forwarded `events.Key` consults
> `_run_extension_key_interceptors(event, prompt_text)` **before** calling
> `super().on_event` (hence before the priority bindings and before the focused
> widget). Consequences, all deliberate:
> - Interceptors now fire for **every** key regardless of which widget has
>   focus. They are consulted **only** on the main screen (`len(screen_stack)
>   <= 1`) — a modal dialog/picker/command-palette on top is never intercepted,
>   so overlays keep owning their keys. Interceptors must self-gate (on prompt
>   text and their own state); documented on `register_key_interceptor`.
> - The Esc-precedence story is unchanged (an interceptor that consumes
>   `escape` still preempts `action_cancel`), just relocated upstream.
> - The extension's strip no longer takes Textual focus at all: the prompt
>   keeps focus throughout and the controller's interceptor owns the whole nav
>   state machine (pi's fleet-list model), now viable because the interceptor is
>   pre-dispatch.

[译文]
> **实现说明(实验后缺陷修复):** 上面的 `PromptInput.on_key` 接入点被发现**太晚也太窄**。tau 在 *App* 上以 `priority=True` 绑定 `down`/`up`/`tab`/`alt+enter`(`_app_bindings`),而 Textual 的 `App.on_event` 会在把 `Key` 转发给获得焦点的组件**之前**先运行 `_check_bindings(key, priority=True)`。因此 `PromptInput.on_key` 根本看不到这些导航键 —— completion_next/previous/accept 会先触发。所以在 tau 的「应用优先级绑定」之下,由控件自持的导航模型(状态条取得焦点并处理自己的 `on_key`)是不可能的。
>
> 修复把 pi 的 `onTerminalInput` 移植为*真正的*分发前钩子:拦截器查询被移动到 `TauTuiApp` 上对 `async def on_event` 的重写,对于未被转发的 `events.Key`,它会在调用 `super().on_event` **之前**(因而在优先级绑定之前、在获得焦点的组件之前)查询 `_run_extension_key_interceptors(event, prompt_text)`。其后果都是有意为之:
> - 拦截器现在会为**每一个**按键触发,无论哪个组件获得焦点。它们**只**在主 screen 上被查询(`len(screen_stack) <= 1`)——上层若有模态对话框/选择器/命令面板,就绝不会被拦截,因此 overlay 仍拥有自己的按键。拦截器必须自我门控(基于提示文本与自身状态);这一点记录在 `register_key_interceptor` 上。
> - Esc 优先级的故事不变(消费 `escape` 的拦截器仍抢占 `action_cancel`),只是把位置移到了更上游。
> - 扩展的状态条完全不再取得 Textual 焦点:提示输入始终保有焦点,控制器的拦截器拥有整个导航状态机(pi 的 fleet-list 模型);由于拦截器现在是分发前的,这变得可行。
>
[原文]
> **Ruling (experiment) — reserved keys the interceptor never sees:** because
> the consult is now *pre-dispatch and the only key hook*, an interceptor that
> returns `True` too broadly could swallow the session's hard interrupt/exit
> keys and brick the TUI (no way out). The host therefore skips the consult
> entirely for a minimal `RESERVED_EXTENSION_INTERCEPTOR_KEYS` frozenset —
> `{"ctrl+c", "ctrl+d"}` — so those keys always flow to normal dispatch
> untouched. These are the app's actual escape hatches: `ctrl+d` is bound to
> the `quit` action (exits the app) and `ctrl+c` to `clear_prompt` but is the
> terminal-standard SIGINT/interrupt reflex; `ctrl+q` is deliberately *not*
> included because tau's `_bindings` (`_app_bindings`) does not actually bind
> it. **Deviation from Pi (deliberate):** Pi's
> `RESERVED_KEYBINDINGS_FOR_EXTENSION_CONFLICTS` (`runner.ts:69` — `app.interrupt`,
> `app.exit`, `app.model.*`, `tui.input.submit`) guards its *`registerShortcut`*
> API, while Pi's raw `onTerminalInput` is unrestricted. Tau's interceptor *is*
> the `onTerminalInput` port, but unlike Pi's it fires pre-dispatch and is the
> only key hook, so it gets a reserved subset — and only the two hard
> interrupt/exit keys, not Pi's fuller list. Explicitly **not** reserved:
> `escape`, `enter`, arrows, `tab`, `left`/`right` — all load-bearing for the
> tau-subagents extension (Esc deactivates strip nav / closes the viewer, Enter
> opens/switches the viewer, arrows navigate the strip, each gated on an empty
> prompt), so they must stay interceptable.

[译文]
> **Ruling(实验)—— 拦截器永远看不到的保留键:** 由于该查询现在是*分发前且唯一的按键钩子*,一个返回 `True` 过于宽泛的拦截器可能吞掉会话的硬中断/退出键,把 TUI 锁死(无法退出)。因此宿主为一个最小集合 `RESERVED_EXTENSION_INTERCEPTOR_KEYS` frozenset —— `{"ctrl+c", "ctrl+d"}` —— 完全跳过查询,使这些键始终未经触碰地流入正常分发。它们是应用真正的逃生舱:`ctrl+d` 绑定到 `quit` 动作(退出应用),`ctrl+c` 绑定到 `clear_prompt`,但它是终端标准的 SIGINT/中断反射;`ctrl+q` 有意*不*包含,因为 tau 的 `_bindings`(`_app_bindings`)实际上并未绑定它。**与 Pi 的偏离(有意):** Pi 的 `RESERVED_KEYBINDINGS_FOR_EXTENSION_CONFLICTS`(`runner.ts:69` —— `app.interrupt`、`app.exit`、`app.model.*`、`tui.input.submit`)守护的是它的 *`registerShortcut`* API,而 Pi 的原始 `onTerminalInput` 不受限制。Tau 的拦截器*就是* `onTerminalInput` 的移植,但与 Pi 不同,它在分发前触发,并且是唯一的按键钩子,因此它得到一个保留子集 —— 而且只有两个硬中断/退出键,不是 Pi 那份更长的清单。明确**不**保留的:`escape`、`enter`、方向键、`tab`、`left`/`right` —— 它们对 tau-subagents 扩展都是承重的(Esc 取消激活状态条导航/关闭查看器,Enter 打开/切换查看器,方向键导航状态条,每项都以空提示为门控),因此必须保持可拦截。

### 2f. 错误隔离守卫点(2f. Error-isolation guard points)

[原文]
A throwing extension component must never crash the TUI. Guards, mirroring
runtime's existing "swallow + diagnose once" discipline (runtime.py
`_record_runtime_failure`):

[译文]
会抛异常的扩展组件绝不能弄崩 TUI。守卫遵循运行时既有的「吞掉 + 只诊断一次」纪律(runtime.py 的 `_record_runtime_failure`):

[原文]
1. **Mount / factory call** — `set_slot_widget` and `open_overlay` invoke the
   factory inside `try/except`; on failure the slot stays empty / no screen is
   pushed, a diagnostic is recorded once, and a `notify(..., "error")` fires.
2. **Render** — the extension widget is mounted inside a host wrapper
   (`_GuardedSlot`, a thin `Container`). Textual cannot fully sandbox a child's
   render/reactive/message-handler exception (see risks §7); the wrapper catches
   what it can (mount, explicit `refresh` calls the host drives) and the app gets
   a top-level `on_exception`/error hook that unmounts the offending extension
   widget and notifies rather than letting the app die.

[译文]
1. **挂载/工厂调用** —— `set_slot_widget` 与 `open_overlay` 在 `try/except` 内调用工厂;失败时槽位保持为空/不推入 screen,只记录一次诊断,并触发一次 `notify(..., "error")`。
2. **渲染** —— 扩展控件被挂载在宿主包装器(`_GuardedSlot`,一个轻量 `Container`)内。Textual 无法完全沙箱化子组件的 render/reactive/消息处理器异常(见风险 §7);包装器尽其所能在能捕获处捕获(挂载、宿主驱动的显式 `refresh` 调用),并由应用获得一个顶层 `on_exception`/错误钩子,用来卸载出问题的扩展控件并通知,而不是让应用死掉。

[原文]
> **Design revision (blocker, resolved with a concrete fix):** the guard as written
> is partly false. A spike (Textual 8.2.7, the pinned version) mounted
> widgets whose `render()`, `compose()`, and `on_mount()` raise. **All three kill
> the app**, and the `try/except` around the host's `mount()`/`refresh()` call
> does *not* save it: `render()` is invoked by the compositor's own reflow loop
> (`screen._refresh_layout` → `_compositor.reflow`), not synchronously inside the
> host's `refresh()` call, so the exception surfaces in `App._handle_exception`
> and the app tears down (`run_test` re-raises; `return_code`/panic). The "wrapper
> catches mount/explicit-refresh" clause therefore covers only the *least*
> dangerous case.
>
> Two concrete corrections are mandatory:
> 1. **There is no public `on_exception`.** `hasattr(App, "on_exception")` is
>    `False`; the only hook is the private `App._handle_exception(self, error)`.
>    The guard must override *that* (accepting the private-API coupling, which is
>    itself a contract-weight cost worth recording).
> 2. **Overriding `_handle_exception` to NOT call `super()` and instead remove the
>    offending widget DOES keep the app alive and responsive** — the spike verified a
>    recovered app stays `is_running=True`, `_exit=False`, and can mount new
>    widgets afterward. But `_handle_exception` receives only `error`, not the
>    culprit widget, so the host must either (a) walk the incoming traceback for a
>    frame owned by a tracked extension widget and remove that subtree, or (b)
>    on any exception whose traceback touches the slot/overlay registry, tear down
>    *all* extension-mounted widgets and notify. It must re-raise (call `super()`)
>    for exceptions with no extension frame, so core's own bugs still surface.
>    Guard #2's "wrapper catches" wording should be deleted and replaced by this
>    app-level `_handle_exception` policy; without it the experiment's headline
>    "a throwing extension component never crashes the TUI" is unmet.

[译文]
> **设计修订(阻塞项,已用具体修复解决):** 如上写成的守卫有一部分是不成立的。一次 spike(Textual 8.2.7,即固定版本)挂载了 `render()`、`compose()` 与 `on_mount()` 会抛异常的控件。**三者都会杀死应用**,而宿主 `mount()`/`refresh()` 调用外层的 `try/except` *救不了*它:`render()` 是由合成器自己的重排循环(`screen._refresh_layout` → `_compositor.reflow`)调用的,而不是在宿主 `refresh()` 调用中同步调用,因此异常在 `App._handle_exception` 处浮现,应用随之拆卸(`run_test` 会重新抛出;`return_code`/panic)。因此「包装器捕获挂载/显式刷新」这条只覆盖*最不*危险的情况。
>
> 必须做两处具体修正:
> 1. **不存在公开的 `on_exception`。** `hasattr(App, "on_exception")` 为 `False`;唯一的钩子是私有的 `App._handle_exception(self, error)`。守卫必须重写*那个*(接受对私有 API 的耦合 —— 这本身就是一项值得记录的契约重量成本)。
> 2. **重写 `_handle_exception` 使其不调用 `super()`、转而移除出问题的控件,确实能让应用存活并保持响应** —— spike 验证了恢复后的应用仍然 `is_running=True`、`_exit=False`,且之后仍能挂载新控件。但 `_handle_exception` 只收到 `error`,拿不到肇事的控件,因此宿主必须要么 (a) 在传入的回溯中查找由某个被跟踪扩展控件拥有的栈帧,并移除该子树;要么 (b) 对任何回溯触及槽位/overlay 注册表的异常,拆掉*所有*由扩展挂载的控件并通知。对于没有扩展栈帧的异常,它必须重新抛出(调用 `super()`),使内核自身的 bug 仍能浮现。守卫 #2 中「包装器捕获」的措辞应被删除,代之以这套应用级 `_handle_exception` 策略;没有它,本实验的核心承诺「会抛异常的扩展组件绝不让 TUI 崩溃」并未达成。
[原文]
> **Implementation note (Step 1 — quarantine as landed):** `TauTuiApp.
> _handle_exception` is overridden (private-API coupling recorded in a code
> comment there). It walks the incoming traceback for a frame whose
> `f_locals["self"]` is — or is a descendant of — a tracked extension widget
> (slot widgets + the open main view). Found → that tracked root is quarantined
> and the exception swallowed; not found → `super()._handle_exception(error)` so
> core bugs still surface. Verified against Textual 8.2.7: a **render** crash
> quarantines cleanly (widget fully removed). An **on_mount** crash cannot be
> fully pruned (the widget never finished mounting, so `remove()`'s prune never
> drains — a bare `pilot.pause()` after one will time out), so the quarantine
> additionally sets `display=False`/`disabled=True` to make the ghost inert; the
> app stays `is_running` and can still mount new widgets. The headline
> guarantee ("a throwing extension component never crashes the TUI") holds for
> render/mount/interceptor crashes.

[译文]
> **实现说明(Step 1 —— 落地时的隔离):** `TauTuiApp._handle_exception` 被重写(对私有 API 的耦合记录在该处的代码注释中)。它遍历传入的回溯,查找某个栈帧的 `f_locals["self"]` 是——或其后代是——被跟踪的扩展控件(槽位控件 + 打开的主视图)。找到 → 该被跟踪的根被隔离,异常被吞掉;未找到 → 调用 `super()._handle_exception(error)`,使内核 bug 仍能浮现。已针对 Textual 8.2.7 验证:**render** 崩溃可被干净隔离(控件被完全移除)。**on_mount** 崩溃无法被完全修剪(控件从未完成挂载,因此 `remove()` 的修剪永远不会排空 —— 之后再 `pilot.pause()` 会超时),因此隔离还会设置 `display=False`/`disabled=True` 使这个幽灵失效;应用保持 `is_running`,且仍能挂载新控件。核心承诺(「会抛异常的扩展组件绝不让 TUI 崩溃」)对渲染/挂载/拦截器崩溃成立。

[原文]
3. **Key interception** — each interceptor is called inside `try/except` in
   `PromptInput.on_key`; an exception is treated as "not consumed" and diagnosed
   once (so a broken interceptor degrades to normal typing, never a dead prompt).
4. **Dispose / unmount** — all teardown runs under `contextlib.suppress` +
   diagnostic, so a throwing `dispose` cannot block reload.

[译文]
3. **按键拦截** —— 每个拦截器都在 `PromptInput.on_key` 的 `try/except` 内调用;异常被视为「未消费」并只诊断一次(因此损坏的拦截器会降级为正常输入,而绝不会让提示输入死掉)。
4. **Dispose / 卸载** —— 所有拆卸都在 `contextlib.suppress` + 诊断之下运行,因此抛异常的 `dispose` 无法阻塞 reload。

[原文]
> **Implementation note (post-experiment bug fix 2):** two user-reported crashes
> traced to the same seam race — a slot/main-view *replacement* mounted the new
> widget synchronously while the old widget's `Widget.remove()` was still
> deferred (`AwaitableRemove` had not drained). For a beat the DOM held two
> widgets sharing one id (`subagents-conversation-viewer` / the strip's id) →
> `DuplicateIds` at mount → the swap was recorded as a component failure and the
> handle/strip was lost. It fired when opening a second agent's viewer while one
> was open, and on a same-tick extension teardown+reinstall (session rebind:
> `/reload`, `/new`, `/resume` — `session_shutdown` always precedes the next
> `session_start`, so the extension tears its strip down then remounts a same-id
> strip in one turn). Fix: `_set_extension_slot_widget` and
> `_open_extension_main_view` now record the *intended* widget synchronously
> (`_extension_slot_widgets` / `_extension_main_view` are the target, so mid-swap
> reads by clear/quarantine/refresh stay coherent, and `handle.is_open` reports
> the intended state the instant it is returned) and hand the actual mount to a
> serialized async continuation (`_reconcile_slot` / `_reconcile_main_view`, each
> under a lock) that first `await`s the outgoing widget's removal, then re-reads
> the live target and mounts only if it is still the winner. A burst (rapid
> A→B→C) collapses to last-writer-wins with no orphaned widgets, and a widget
> quarantined between schedule and continuation is dropped from both the target
> and mounted trackers so the continuation no-ops. `_record_extension_component_
> failure` also now carries a truncated `Type: message` summary in the
> notification and logs the full traceback via `self.log.error` (that trail is
> what pinned the race).
>
> The same fix unblocked the extension's interceptor-while-viewer-open model
> (bug 2): the controller's key interceptor used to yield entirely while a viewer
> was open, so once a viewer was up the fleet strip was unreachable (the only
> exit was Esc *with the viewer focused*). It now stays active while a viewer is
> open — except while the steer composer owns the keyboard (a new
> `ConversationViewer.composer_active` property gates it) — with `left`
> re-activating strip nav (not `down`, which the focused viewer uses to scroll),
> `enter` on `main` closing the viewer via its handle, and `enter` on another
> agent switching the viewer (now race-safe thanks to the sequenced swap above).

[译文]
> **实现说明(实验后缺陷修复 2):** 两次用户报告的崩溃被追溯到同一个接缝竞态 —— 槽位/主视图的*替换*在新控件被同步挂载时,旧控件的 `Widget.remove()` 仍处于延迟状态(`AwaitableRemove` 尚未排空)。有一瞬间,DOM 里同时存在两个共享同一 id 的控件(`subagents-conversation-viewer` / 状态条的 id)→ 挂载时 `DuplicateIds` → 该交换被记录为组件失败,handle/状态条随之丢失。它在以下情况触发:在一个查看器已打开时打开第二个 agent 的查看器;以及同一 tick 内的扩展「拆卸 + 重装」(会话重新绑定:`/reload`、`/new`、`/resume` —— `session_shutdown` 总是先于下一个 `session_start`,因此扩展会在同一轮内先拆掉自己的状态条、再重新挂载一个同 id 的状态条)。修复:`_set_extension_slot_widget` 与 `_open_extension_main_view` 现在会同步记录*意图中的*控件(`_extension_slot_widgets` / `_extension_main_view` 是目标,因此交换中途由清理/隔离/刷新发起的读取仍保持一致,而 `handle.is_open` 在被返回的那一刻就报告意图状态),并把实际挂载交给一个串行化的异步延续(`_reconcile_slot` / `_reconcile_main_view`,各自在锁之下):它先 `await` 外出控件的移除,再重新读取实时目标,只有它仍是胜者时才执行挂载。一次突发(快速 A→B→C)会收敛为「最后写入者胜」,且不留下孤儿控件;在调度与延续之间被隔离的控件会同时从目标与已挂载跟踪器中移除,使该延续成为无操作。`_record_extension_component_failure` 现在还会在通知中携带截断的 `Type: message` 摘要,并通过 `self.log.error` 记录完整回溯(正是这条线索定位了该竞态)。
>
> 同一修复也解除了扩展「查看器打开期间仍保留拦截器」模型的阻塞(缺陷 2):控制器的按键拦截器过去在查看器打开时完全让出,因此一旦查看器打开,fleet 状态条就不可达(唯一的出口是在*查看器获得焦点时*按 Esc)。现在它在查看器打开期间保持活动 —— 除非插话输入框拥有键盘(由新的 `ConversationViewer.composer_active` 属性门控)—— `left` 会重新激活状态条导航(而不是 `down`,因为获得焦点的查看器用 `down` 滚动),`main` 上的 `enter` 通过 handle 关闭查看器,而另一个 agent 上的 `enter` 会切换查看器(由于上面的有序列交换,现在是竞态安全的)。

---

## 3. 核心移除清单(3. Core removal list)

[原文]
Line references are against this repo as of the pre-experiment baseline
(`subagents-integration`); they drifted as the steps landed.

[译文]
行号引用基于实验前基线(`subagents-integration`)下的本仓库;随着各步骤落地它们已经漂移。

[原文]
**`src/tau_coding/tui/app.py`**
- `class AgentStrip(Static)` + its `on_click` (L1082–1090).
- `_render_agent_strip(...)` helper (L4296–~4372).
- Constants `AGENT_STRIP_MAX_ROWS`, `AGENT_VIEW_POLL_SECONDS`,
  `AGENT_STRIP_STATUS_GLYPHS` (L128–131+).
- State fields (L2204–2211): `_agent_strip_sources`, `_strip_focused`,
  `_strip_index`, `_active_source_id`, `_agent_view_state`,
  `_agent_view_revision`, `_agent_view_status`, `_agent_view_timer`.
- Methods (L2790–3024): `_on_transcript_sources_changed`, `_transcript_sources`,
  `_current_source`, `_refresh_agent_strip`, `focus_agent_strip`, `_strip_move`,
  `_strip_exit`, `_strip_select`, `_strip_click`, `_activate_source_by_id`,
  `_activate_source`, `_activate_main`, `_tick_agent_view`, `_steer_viewed_agent`
  (and `_sync_prompt_identity`'s agent-view branches — the main-prompt reset
  stays).
- Strip/view branches inside shared methods: `action_cancel` (L3028–3033),
  `action_completion_next` (L3121–3123), `action_completion_previous`
  (L3148–3150), `on_text_area_changed` (L2332–2334), `action_submit_prompt`
  (L2342–2344), `action_submit_follow_up` (L2349–2351), the steer-viewed branch
  in `_submit_prompt_from_editor` (L2376–2383), the `focus_agent_strip` call in
  `PromptInput.on_key` (L528–533), and `CompletionActionTarget.focus_agent_strip`
  (L305).
- `_TuiExtensionUiBridge.view_transcript` (L235–237); the
  `set_transcript_sources_changed_callback` wiring in
  `_connect_extension_runtime` (L2566–2570); `_activate_source_by_id` call site.

[译文]
**`src/tau_coding/tui/app.py`**
- `class AgentStrip(Static)` 及其 `on_click`(L1082–1090)。
- `_render_agent_strip(...)` 辅助函数(L4296–约 4372)。
- 常量 `AGENT_STRIP_MAX_ROWS`、`AGENT_VIEW_POLL_SECONDS`、`AGENT_STRIP_STATUS_GLYPHS`(L128–131+)。
- 状态字段(L2204–2211):`_agent_strip_sources`、`_strip_focused`、`_strip_index`、`_active_source_id`、`_agent_view_state`、`_agent_view_revision`、`_agent_view_status`、`_agent_view_timer`。
- 方法(L2790–3024):`_on_transcript_sources_changed`、`_transcript_sources`、`_current_source`、`_refresh_agent_strip`、`focus_agent_strip`、`_strip_move`、`_strip_exit`、`_strip_select`、`_strip_click`、`_activate_source_by_id`、`_activate_source`、`_activate_main`、`_tick_agent_view`、`_steer_viewed_agent`(以及 `_sync_prompt_identity` 中的 agent-view 分支 —— 主提示输入的重置保留)。
- 共享方法内部的状态条/视图分支:`action_cancel`(L3028–3033)、`action_completion_next`(L3121–3123)、`action_completion_previous`(L3148–3150)、`on_text_area_changed`(L2332–2334)、`action_submit_prompt`(L2342–2344)、`action_submit_follow_up`(L2349–2351)、`_submit_prompt_from_editor` 中的 steer-viewed 分支(L2376–2383)、`PromptInput.on_key` 中的 `focus_agent_strip` 调用(L528–533),以及 `CompletionActionTarget.focus_agent_strip`(L305)。
- `_TuiExtensionUiBridge.view_transcript`(L235–237);`_connect_extension_runtime` 中 `set_transcript_sources_changed_callback` 的接线(L2566–2570);`_activate_source_by_id` 的调用点。

[原文]
> **Design revision (minor, but required before Step 3 can pass):** the call-site list for
> `_refresh_agent_strip` is incomplete. It is also called from `_refresh_chrome`
> (L3676, the theme/chrome refresh path) — removing the method without deleting
> that call leaves an `AttributeError` on every chrome refresh. Separately,
> `_build_completion_state` has an `_active_source_id` branch (L3836, "while an
> agent view is open the input steers that agent, so main completions don't
> apply") that is not enumerated among the shared-method branches; it must be
> removed with the others. Note also: a naive grep for `_strip_` false-positives
> on `tools.py` `_strip_bom`/`_strip_bom` (L356/L961) — that is unrelated BOM
> handling and must NOT be touched; the removal list correctly omits `tools.py`,
> but the grep discipline should be spelled out so the implementer doesn't chase
> it.

[译文]
> **设计修订(较小,但在 Step 3 通过之前必须处理):** `_refresh_agent_strip` 的调用点清单不完整。它还会从 `_refresh_chrome`(L3676,主题/外壳刷新路径)被调用 —— 若只删除该方法而不删除那处调用,每次外壳刷新都会留下 `AttributeError`。另外,`_build_completion_state` 有一个 `_active_source_id` 分支(L3836,「当 agent 视图打开时,输入用于给该 agent 插话,因此主补全不适用」),它没有被列入共享方法分支清单;必须与其他分支一起移除。还要注意:对 `_strip_` 的朴素 grep 会在 `tools.py` 的 `_strip_bom`/`_strip_bom`(L356/L961)上产生误报 —— 那是无关的 BOM 处理,绝不能触碰;移除清单正确地省略了 `tools.py`,但应把 grep 纪律写清楚,以免实现者去追它。

[原文]
- Compose: the `#agent-transcript-pane` `TranscriptView` (L2262–2268) and the
  `AgentStrip(..., id="agent-strip")` (L2279).
- CSS: `#agent-transcript-pane` (L1818–1827) and `#agent-strip` (L1829–1837)
  blocks; add `#above-prompt-slot` / `#below-prompt-slot`.
- Import of `TranscriptSource` (L60).

[译文]
- Compose:`#agent-transcript-pane` 的 `TranscriptView`(L2262–2268)与 `AgentStrip(..., id="agent-strip")`(L2279)。
- CSS:`#agent-transcript-pane`(L1818–1827)与 `#agent-strip`(L1829–1837)区块;新增 `#above-prompt-slot` / `#below-prompt-slot`。
- 对 `TranscriptSource` 的导入(L60)。

[原文]
**`src/tau_coding/extensions/api.py`** — `TranscriptSource`,
`TranscriptSourceStatus`, `TranscriptSourceProvider`,
`TranscriptSourcesChangedCallback`, `UiBridge.view_transcript` (+ Null/Stderr),
`ExtensionUi.view_transcript`, `ExtensionAPI.set_transcript_source_provider`,
`ExtensionAPI.notify_transcript_sources_changed`.

[译文]
**`src/tau_coding/extensions/api.py`** —— `TranscriptSource`、`TranscriptSourceStatus`、`TranscriptSourceProvider`、`TranscriptSourcesChangedCallback`、`UiBridge.view_transcript`(+ Null/Stderr)、`ExtensionUi.view_transcript`、`ExtensionAPI.set_transcript_source_provider`、`ExtensionAPI.notify_transcript_sources_changed`。

[原文]
**`src/tau_coding/extensions/runtime.py`** — everything listed in §2c.

[译文]
**`src/tau_coding/extensions/runtime.py`** —— §2c 中列出的所有内容。

[原文]
**`src/tau_coding/extensions/__init__.py`** — the four `TranscriptSource*`
imports (L28–31) and `__all__` entries (L79–82).

[译文]
**`src/tau_coding/extensions/__init__.py`** —— 四个 `TranscriptSource*` 导入(L28–31)与 `__all__` 条目(L79–82)。

[原文]
**`tests/test_tui_app.py`** (delete or relocate to extension): `test_agent_strip_
opens_in_place_view_and_steers`, `test_agent_view_rejects_steering_finished_
agents`, `test_agent_view_rerenders_on_revision_change`, `test_agent_strip_fills_
only_the_viewed_dot`, `test_agent_strip_drops_finished_agents`, `test_agent_strip_
click_switches_view`, `test_agent_view_activation_degrades_when_messages_gone`,
`test_escape_returns_to_main_before_cancelling_a_running_turn`, `test_agent_view_
returns_to_main_when_source_vanishes` (L2496–2740). **Keep** the
compaction/running-turn escape tests (L2947, L4030, L4084) — core still owns
those — and the extension-dialog tests.

[译文]
**`tests/test_tui_app.py`**(删除或迁移到扩展):`test_agent_strip_opens_in_place_view_and_steers`、`test_agent_view_rejects_steering_finished_agents`、`test_agent_view_rerenders_on_revision_change`、`test_agent_strip_fills_only_the_viewed_dot`、`test_agent_strip_drops_finished_agents`、`test_agent_strip_click_switches_view`、`test_agent_view_activation_degrades_when_messages_gone`、`test_escape_returns_to_main_before_cancelling_a_running_turn`、`test_agent_view_returns_to_main_when_source_vanishes`(L2496–2740)。**保留**压缩/运行中轮次的 Escape 测试(L2947、L4030、L4084)—— 那些仍由内核持有 —— 以及扩展对话框测试。

---

## 第 4 节:扩展架构(4. Extension architecture)

[原文]
New package `src/tau_subagents/ui/` (Textual). The extension already depends on
`textual>=1.0` transitively via tau; make it a direct dependency.

[译文]
新增包 `src/tau_subagents/ui/`(Textual)。该扩展已经经由 tau 间接依赖 `textual>=1.0`;把它变成直接依赖。

### 4a. `strip_widget.py`:`AgentStripWidget(Widget)`,移植 `fleet-list.ts` / 4a. `strip_widget.py` — `AgentStripWidget(Widget)` (ports `fleet-list.ts`)

[原文]
- Mounted into `below_prompt` via `context.ui.components.set_slot_widget(
  "subagents-fleet", build, placement="below_prompt")`.
- Registers one `KeyInterceptor` via `register_key_interceptor`; self-gates on
  the passed `prompt_text == ""`. `↓`/`←` activate, `↑↓` move, Enter opens the
  viewer overlay, Esc/up-past-top deactivate, any other key deactivates and lets
  the key through (returns `False`). Press-only (ignore Textual key-repeat/
  release equivalents).
- Roster = `main` + running/queued + currently-viewed + recently-finished
  (linger), earliest-first — identical policy to `fleet-list.ts` `agentRecords()`,
  reading `manager.runs`.
- Renders with the tau `Tuitheme` handed to the factory (Rich `Text`/markup, as
  the old `_render_agent_strip` did).

[译文]
- 通过 `context.ui.components.set_slot_widget("subagents-fleet", build, placement="below_prompt")` 挂载到 `below_prompt`。
- 通过 `register_key_interceptor` 注册一个 `KeyInterceptor`;以传入的 `prompt_text == ""` 自我门控。`↓`/`←` 激活,`↑↓` 移动,Enter 打开查看器 overlay,Esc/在顶部继续向上取消激活,任何其他按键取消激活并放行该键(返回 `False`)。只处理按下(忽略 Textual 的按键重复/释放等价物)。
- 名册 = `main` + 运行中/排队中 + 当前查看的 + 最近完成的(短暂停留),最早的在前 —— 与 `fleet-list.ts` 的 `agentRecords()` 策略完全一致,读取 `manager.runs`。
- 用传给工厂的 tau `Tuitheme` 渲染(与旧的 `_render_agent_strip` 一样使用 Rich `Text`/标记)。

### 4b. `conversation_viewer.py`:`ConversationViewerScreen(ModalScreen)`,移植 `conversation-viewer.ts` / 4b. `conversation_viewer.py` — `ConversationViewerScreen(ModalScreen)` (ports `conversation-viewer.ts`)

[原文]
- Opened by the strip via `context.ui.components.open_overlay(build)`; `build`
  closes over the selected `AgentRun` and returns the viewer widget bound to the
  `OverlayHandle`.
- Live transcript of the run, scroll + auto-scroll stickiness, header stats.
- Embedded steer composer: a Textual `Input`; Enter → `steer_run(run, text)`
  (from `agents_menu.py`), Esc cancels the composer (not the overlay).
- Two-press stop guard on `x` → `stop_run(run)`; any other key disarms.
- Esc/`q` closes the overlay (`handle.close()`).

[译文]
- 由状态条通过 `context.ui.components.open_overlay(build)` 打开;`build` 闭包捕获所选 `AgentRun`,并返回绑定到 `OverlayHandle` 的查看器控件。
- 该运行的实时会话记录、滚动 + 自动滚动粘性、头部统计。
- 内嵌插话输入框:一个 Textual `Input`;Enter → `steer_run(run, text)`(来自 `agents_menu.py`),Esc 取消输入框(而不是 overlay)。
- 在 `x` 上的双击停止守卫 → `stop_run(run)`;任何其他按键解除。
- Esc/`q` 关闭 overlay(`handle.close()`)。

### 4c. 事件推送接线,取代 revision 轮询 / 4c. Event-push wiring (replaces revision polling)

[原文]
The extension owns its child `CodingSession`s, so it can subscribe directly
instead of the host polling `run.revision` every 0.5 s (`_tick_agent_view`, now
deleted). Design:

[译文]
扩展持有其子 `CodingSession`,因此可以直接订阅,而不必让宿主每 0.5 秒轮询 `run.revision`(`_tick_agent_view`,现已删除)。设计:

[原文]
- `SubagentManager` keeps a single change signal but re-points it at the
  extension's own widgets: rename `sources_changed` → `on_change`, wired in
  `setup()` to a controller that calls `strip_widget.refresh()` and any open
  viewer's `refresh()`. `_notify_sources()` → `_notify_change()`.
- Per-run push for the viewer: `AgentRun` gains `listeners: list[Callable[[],
  None]]`; the manager's `_on_agent_event`/`_apply_message` path (which already
  bumps `run.revision` and appends messages) also calls each listener. The open
  viewer registers a listener on mount and removes it on close — the direct
  analog of pi's `session.subscribe(() => tui.requestRender())`. `run.revision`
  is retained only as a cheap "did content change" dirty-check inside the
  viewer's refresh; it is no longer a host polling key.

[译文]
- `SubagentManager` 保留单一变更信号,但把它重新指向扩展自己的控件:把 `sources_changed` 改名为 `on_change`,在 `setup()` 中连接到一个控制器,由它调用 `strip_widget.refresh()` 以及任何已打开查看器的 `refresh()`。`_notify_sources()` → `_notify_change()`。
- 查看器的按运行推送:`AgentRun` 新增 `listeners: list[Callable[], None]]`;管理器的 `_on_agent_event`/`_apply_message` 路径(它本就会递增 `run.revision` 并追加消息)还会调用每个监听器。已打开的查看器在挂载时注册监听器、在关闭时移除 —— 这是 pi `session.subscribe(() => tui.requestRender())` 的直接对应物。`run.revision` 仅作为查看器刷新内部一个廉价的「内容是否变化」脏检查保留;它不再是宿主轮询键。

[原文]
> **Design revision (verified safe; the invariant must be stated):** deleting the poll
> in favour of push is only safe because subagent runs execute as `asyncio` tasks
> on the *same* event loop as the TUI — `_run_agent` is launched via
> `asyncio.get_running_loop().create_task` (extension.py L299) and
> `run.revision += 1` / `_notify_sources` fire synchronously inside that loop
> (L614, L185–258). So a listener calling `widget.refresh()` runs on the UI
> thread and is safe. The old poll used the host's `set_interval` (UI-loop) and
> the change callback marshalled via `self.call_later` (app.py L2792) precisely to
> stay on-loop. **This invariant must be recorded as a hard constraint:** if any
> subagent work is ever moved to a thread (`asyncio.to_thread`, an executor), the
> listener must marshal via `app.call_from_thread`/`post_message` or the direct
> `refresh()` becomes a data race. There are no such threads today (grep: none),
> so the migration is safe as designed.

[译文]
> **设计修订(已验证安全;必须写明该不变量):** 删除轮询、改用推送之所以安全,只是因为子代理运行作为 `asyncio` 任务执行在与 TUI *同一个*事件循环上 —— `_run_agent` 通过 `asyncio.get_running_loop().create_task` 启动(extension.py L299),`run.revision += 1` / `_notify_sources` 在该循环内同步触发(L614、L185–258)。因此调用 `widget.refresh()` 的监听器运行在 UI 线程上,是安全的。旧轮询使用宿主的 `set_interval`(UI 循环),并让变更回调经由 `self.call_later` 编组(app.py L2792),正是为了保持在事件循环上。**必须把这一不变量记录为硬约束:** 如果任何子代理工作被移到线程(`asyncio.to_thread`、执行器),监听器就必须通过 `app.call_from_thread`/`post_message` 编组,否则直接调用 `refresh()` 会变成数据竞态。今天不存在这样的线程(grep:无),因此按设计的迁移是安全的。

### 4d. `/agents` 菜单 + `agents_menu.view_run_conversation`(4d. `/agents` menu + `agents_menu.view_run_conversation`)

[原文]
- `view_run_conversation` no longer calls a host `view_transcript` seam (removed).
  It calls the extension's own `open_conversation(run)`, which uses
  `context.ui.components.open_overlay(...)`. On success it returns `"exit"` (menu
  loop closes; user lands in the overlay) — same control flow as today.
- Degrade path unchanged in spirit: when `context.ui.components.supports_
  components` is `False` (print mode / no TUI), `open_conversation` returns
  falsy and the menu falls to the action submenu (`"actions"`) exactly as the
  current `view_transcript`-missing branch does. The capability check moves from
  `getattr(ui, "view_transcript")` to `components.supports_components`.

[译文]
- `view_run_conversation` 不再调用宿主的 `view_transcript` 接缝(已移除)。它调用扩展自己的 `open_conversation(run)`,后者使用 `context.ui.components.open_overlay(...)`。成功时返回 `"exit"`(菜单循环关闭;用户落在 overlay 中)—— 与今天相同的控制流。
- 降级路径在精神上不变:当 `context.ui.components.supports_components` 为 `False`(print 模式/无 TUI)时,`open_conversation` 返回假值,菜单落到动作子菜单(`"actions"`),与当前「缺少 `view_transcript`」分支完全一致。能力检查从 `getattr(ui, "view_transcript")` 移到 `components.supports_components`。

[原文]
> **Design revision (major):** the plumbing does not exist as written.
> `view_run_conversation(ui, run)` (agents_menu.py L115) receives `ui: DialogUi` —
> a Protocol (L30–45) exposing *only* `select`/`confirm`/`input`/`notify`. It has
> no `.components`, no manager, no theme. Today it calls
> `getattr(ui, "view_transcript")(run.agent_id)` and the *host* resolves the id,
> builds the view, and steers. In this design the extension must build the viewer
> widget itself, which needs (a) the component bridge, (b) the `SubagentManager`
> (for `steer_run`/`stop_run`/listener registration), and (c) the theme — none of
> which reach the menu through `DialogUi`. Fix: either widen `DialogUi` to carry a
> `components` member *and* thread the manager into `view_run_conversation`
> (change its signature — `show_agents_menu` already holds `manager`), or move
> `open_conversation` out of `agents_menu.py` into `extension.py`/the controller
> where the manager + bridge are in scope and have the menu call back into it.
> The one-line `getattr(ui, "view_transcript")` swap in §4d hides a real
> refactor of the menu's dependency surface.

[译文]
> **设计修订(重大):** 所写的管线并不存在。`view_run_conversation(ui, run)`(agents_menu.py L115)接收 `ui: DialogUi` —— 一个*只*暴露 `select`/`confirm`/`input`/`notify` 的 Protocol(L30–45)。它没有 `.components`、没有 manager、没有 theme。今天它调用 `getattr(ui, "view_transcript")(run.agent_id)`,由*宿主*解析 id、构建视图并插话。在本设计中,扩展必须自己构建查看器控件,而这需要 (a) 组件桥,(b) `SubagentManager`(用于 `steer_run`/`stop_run`/监听器注册),以及 (c) theme —— 这些都无法经由 `DialogUi` 到达菜单。修复方式:要么拓宽 `DialogUi`,让它携带一个 `components` 成员,*并*把 manager 传入 `view_run_conversation`(修改其签名 —— `show_agents_menu` 本就持有 `manager`),要么把 `open_conversation` 从 `agents_menu.py` 移到 `extension.py`/控制器中(那里 manager + bridge 在作用域内),让菜单回调进去。§4d 中那行 `getattr(ui, "view_transcript")` 的替换,掩盖了对菜单依赖面的真实重构。

### 4e. `extension.py` 的 `setup()` 变更 / 4e. `extension.py` `setup()` changes

[原文]
- Delete `run_transcript_source`, `SOURCE_STATUS`, the `set_transcript_source_
  provider`/`notify_transcript_sources_changed` block (L1452–1461).
- In `setup()`, when `context.ui.components.supports_components`: build the
  controller, `set_slot_widget` the strip, `register_key_interceptor`, and wire
  `manager.on_change`. Guard the whole block so a core **without** the component
  seam (old tau) does not crash at import/setup — a `getattr(context.ui,
  "components", None)` check keeps the extension loadable (constraint 8), even
  though on this branch the UI path drops the older-tau *behavioral* compat
  (no fallback strip).
- Keep `render_call` lines, dialogs, tools, scheduler, message renderer — all
  unchanged (constraint 3).

[译文]
- 删除 `run_transcript_source`、`SOURCE_STATUS`,以及 `set_transcript_source_provider`/`notify_transcript_sources_changed` 代码块(L1452–1461)。
- 在 `setup()` 中,当 `context.ui.components.supports_components` 为真时:构建控制器、`set_slot_widget` 状态条、`register_key_interceptor`,并连接 `manager.on_change`。为整个代码块加守卫,使**没有**组件接缝的内核(旧 tau)不会在导入/setup 时崩溃 —— 一次 `getattr(context.ui, "components", None)` 检查保持扩展可加载(约束 8),尽管在本分支上 UI 路径放弃了与旧 tau 的*行为*兼容(没有回退状态条)。
- 保留 `render_call` 行、对话框、工具、调度器、消息渲染器 —— 全部不变(约束 3)。

---

## 第 5 节:迁移顺序(5. Migration order)

[原文]
Both suites must be green after each **repo-step boundary**; a red window is
tolerated only *within* one step in one repo. The naive "remove core first" is
wrong (it reds core strip tests and leaves a no-UI gap). "Seam-first → consume →
remove-last" is correct **because the old and new seams coexist without
conflict**: once the extension stops publishing transcript sources, the old
host strip simply has zero rows (hidden), and the old `focus_agent_strip`
left-arrow returns `False` and falls through, so it never fights the new
interceptor.

[译文]
两套测试在每个**仓库-步骤边界**之后都必须为绿色;红色窗口只允许出现在单个仓库单一步骤*内部*。朴素的「先删内核」是错误的(它会让内核的状态条测试变红,并留下一个无 UI 的空档)。「接缝优先 → 消费 → 最后移除」是正确的,**因为新旧接缝可以无冲突地共存**:一旦扩展停止发布 transcript source,旧宿主状态条就只是零行(隐藏),而旧 `focus_agent_strip` 的左箭头返回 `False` 并向下落,因此它永远不会与新拦截器打架。

[原文]
**Step 1 — core adds the seam (core green).** Add `ComponentBridge` + slot
containers + `ComponentOverlayScreen` + interceptor registry + guards +
`NullUiBridge`/`StderrUiBridge` no-ops, *alongside* the still-present
transcript-source seam and `AgentStrip`. Add new core pilot tests for the seam
(§6). Old strip tests still pass; extension untouched and still on the old seam,
its tests still pass (it builds against the now-superset core).

[译文]
**Step 1 —— 内核新增接缝(内核绿色)。** 新增 `ComponentBridge` + 槽位容器 + `ComponentOverlayScreen` + 拦截器注册表 + 守卫 + `NullUiBridge`/`StderrUiBridge` 无操作实现,*与*仍然存在的 transcript-source 接缝和 `AgentStrip` 并存。为接缝新增内核试点测试(§6)。旧状态条测试仍通过;扩展未受触碰、仍使用旧接缝,其测试仍通过(它针对现在是超集的内核构建)。

[原文]
**Step 2 — extension consumes the seam (extension green).** Build `ui/`, switch
`setup()` from `set_transcript_source_provider` to slot+interceptor+overlay,
repoint `manager.on_change`, add the Textual test harness (§6). Core untouched,
core tests still green. The old host strip is now dead-but-passing (its pilot
tests drive it with synthetic providers, not the extension).

[译文]
**Step 2 —— 扩展消费该接缝(扩展绿色)。** 构建 `ui/`,把 `setup()` 从 `set_transcript_source_provider` 切换到 slot+interceptor+overlay,重新指向 `manager.on_change`,添加 Textual 测试装置(§6)。内核未受触碰,内核测试仍绿色。旧宿主状态条现在是「已死但通过」(它的试点测试用合成 provider 驱动它,而不是扩展)。

[原文]
**Step 3 — core removes the old seam (both green).** Delete everything in §3 and
its pilot tests. Extension is already off the old seam, so nothing breaks; core
keeps only the generic seam and its new tests. Extension tests unaffected.

[译文]
**Step 3 —— 内核移除旧接缝(两者都绿色)。** 删除 §3 中的所有内容及其试点测试。扩展已经脱离旧接缝,因此不会破坏任何东西;内核只保留通用接缝及其新测试。扩展测试不受影响。

[原文]
This is genuinely "removal last," justified by conflict-free coexistence rather
than by ignoring the ordering hazard.

[译文]
这是真正的「最后移除」,其正当性来自无冲突共存,而不是无视顺序风险。

---

## 第 6 节:测试计划,约束 7 / 6. Test plan (constraint 7)

[原文]
**Core (`tests/`), new pilot tests for the generic seam** — drive the real
`TauTuiApp` via `Pilot` with a tiny in-test fake extension/bridge caller (no
subagents vocabulary):
- mounts a dummy `Static` into `#below-prompt-slot` and asserts it renders; then
  `set_slot_widget(key, None)` unmounts it.

[译文]
**内核(`tests/`)针对通用接缝的新试点测试** —— 通过 `Pilot` 驱动真实的 `TauTuiApp`,使用一个极小的测试内假扩展/桥调用方(不含 subagents 词汇):
- 把一个哑 `Static` 挂载进 `#below-prompt-slot` 并断言它能渲染;然后 `set_slot_widget(key, None)` 卸载它。

[原文]
- `open_overlay` pushes a screen, it captures focus, `handle.close()` pops it and
  restores prompt focus.
- a registered interceptor consumes a key when `prompt_text == ""` and is
  bypassed when the prompt is non-empty; a consumed `escape` does **not** trigger
  `action_cancel`.
- a factory that raises → app survives, slot empty, diagnostic recorded, notify
  fired (error isolation).
- reload / `set_ui_bridge` re-install force-clears mounted widgets and overlays.

[译文]
- `open_overlay` 推入一个 screen,它捕获焦点,`handle.close()` 弹出它并恢复提示输入的焦点。
- 已注册的拦截器在 `prompt_text == ""` 时消费某个键,并在提示非空时被绕过;被消费的 `escape` **不会**触发 `action_cancel`。
- 抛异常的工厂 → 应用存活,槽位为空,诊断被记录,通知被触发(错误隔离)。
- reload / `set_ui_bridge` 重新安装会强制清理已挂载的控件与 overlay。

[原文]
**Extension (`tests/`), new Textual harness.** The repo currently has no Textual
test setup. Add: dev-dependency `textual>=1.0` (direct), reuse the existing
`pytest.mark.anyio` + `asyncio` backend already configured in
`tests/test_extension.py` (no new async plugin needed). Two layers:

[译文]
**扩展(`tests/`)的新 Textual 测试装置。** 该仓库目前没有 Textual 测试设置。需要添加:开发依赖 `textual>=1.0`(直接依赖),复用 `tests/test_extension.py` 中已配置好的 `pytest.mark.anyio` + `asyncio` 后端(无需新的异步插件)。分两层:

[原文]
- **Unit** (fast, no full app): a `FakeComponentBridge` implementing
  `ComponentBridge` (records `set_slot_widget`/`open_overlay` calls, feeds
  synthetic `events.Key` to the interceptor, exposes settable `prompt_text`).
  Test the strip roster/selection/activation, the viewer's steer/stop-guard/
  scroll, and push-refresh on a fake run listener — this is where the deleted
  core UX tests are re-homed (fills-only-viewed-dot, drops-finished, click-
  switches, opens+steers, rejects-finished-steer, rerenders-on-change, degrades-
  when-messages-gone).
- **Integration** (one test): construct a real `TauTuiApp` with the extension
  loaded and drive it via `Pilot` — assert the strip mounts in
  `#below-prompt-slot`, `←` at an empty prompt activates it, Enter opens the
  viewer overlay, and a steer reaches the run. This proves the actual seam wiring
  against real core, which the fake-bridge unit tests cannot.

[译文]
- **单元层**(快,不启动完整应用):一个实现 `ComponentBridge` 的 `FakeComponentBridge`(记录 `set_slot_widget`/`open_overlay` 调用,向拦截器喂入合成的 `events.Key`,暴露可设置的 `prompt_text`)。测试状态条名册/选择/激活、查看器的插话/停止守卫/滚动,以及针对假运行监听器的推送刷新 —— 被删除的内核 UX 测试就重新安置在这里(fills-only-viewed-dot、drops-finished、click-switches、opens+steers、rejects-finished-steer、rerenders-on-change、degrades-when-messages-gone)。
- **集成层**(一个测试):加载扩展并构造真实的 `TauTuiApp`,通过 `Pilot` 驱动它 —— 断言状态条挂载进 `#below-prompt-slot`,空提示下 `←` 激活它,Enter 打开查看器 overlay,并且一次插话能到达该运行。这证明真实的接缝接线与真实内核协同工作,而假桥单元测试做不到这一点。

[原文]
**Both:** `uv run pytest` green in each repo at every step boundary; `uv run ruff
check src tests` clean in core.

[译文]
**两者:** 在每个步骤边界,两个仓库中 `uv run pytest` 均为绿色;内核中 `uv run ruff check src tests` 干净。

---

## 第 7 节:诚实的契约核算(7. Honest contract accounting)

[原文]
**LoC deltas (estimates).**
- *Core removed:* `AgentStrip` (~10), `_render_agent_strip` (~75), strip/view
  state + methods (L2790–3024, ~235), scattered branches (~40), CSS (~20),
  `api.py`/`runtime.py`/`__init__.py` transcript-source machinery (~120), deleted
  pilot tests (~250). ≈ **−500 non-test / −250 test**.
- *Core added:* `ComponentBridge` + slots + overlay screen + interceptor registry
  + guards + Null/Stderr no-ops (~280), new seam pilot tests (~180). ≈ **+280
  non-test / +180 test**.
- *Net core:* roughly **−200 non-test LoC** — core does get smaller.
- *Extension added:* strip (~360) + viewer (~360) + keys/glue + controller +
  harness/fakes (~250 test). ≈ **+900 non-test / +250 test**, plus a direct
  `textual` dependency.

[译文]
**LoC 变化(估算)。**
- *内核移除:* `AgentStrip`(约 10)、`_render_agent_strip`(约 75)、状态条/视图的状态 + 方法(L2790–3024,约 235)、零散分支(约 40)、CSS(约 20)、`api.py`/`runtime.py`/`__init__.py` 中的 transcript-source 机制(约 120)、被删除的试点测试(约 250)。≈ **非测试 −500 / 测试 −250**。
- *内核新增:* `ComponentBridge` + 槽位 + overlay screen + 拦截器注册表 + 守卫 + Null/Stderr 无操作(约 280)、新接缝试点测试(约 180)。≈ **非测试 +280 / 测试 +180**。
- *内核净变化:* 大约 **非测试 LoC −200** —— 内核确实变小了。
- *扩展新增:* 状态条(约 360)+ 查看器(约 360)+ 按键/胶水 + 控制器 + 测试装置/假件(测试约 250)。≈ **非测试 +900 / 测试 +250**,外加一个直接的 `textual` 依赖。

[原文]
**Public-API-surface delta — the honest part.** Per-feature the contract
*shrinks to zero*: core no longer speaks any agent vocabulary, and "show agent
UI" is now entirely the extension's business. But the *generic* extension
contract **grows** and hardens exactly as the phase-21 Ruling predicted: core now
publicly exposes a widget-hosting layer — `set_slot_widget`, `open_overlay`,
`register_key_interceptor`, `OverlayHandle`, `Placement`, the factory types, and
(transitively) **Textual's `Widget`/`events.Key`/screen model** as tau's public
extension API. We trade four small, data-only, frontend-portable symbols
(`TranscriptSource` + 3) for a larger, Textual-coupled, TUI-only surface. The
"removes code from core" claim is real in LoC and false in contract weight — the
seam is fewer lines but a much heavier and less portable promise.

[译文]
**公开 API 界面的变化 —— 诚实的那部分。** 按特性看,契约*缩小为零*:内核不再讲任何 agent 词汇,而「展示 agent UI」现在完全是扩展的事。但*通用*扩展契约**变大**并加重,正如阶段 21 裁定所预测:内核现在公开暴露一个控件托管层 —— `set_slot_widget`、`open_overlay`、`register_key_interceptor`、`OverlayHandle`、`Placement`、各种工厂类型,以及(传递性地)**Textual 的 `Widget`/`events.Key`/screen 模型**作为 tau 的公开扩展 API。我们用四个小的、仅数据的、可跨前端移植的符号(`TranscriptSource` + 3 个)换来一个更大、与 Textual 耦合、仅限 TUI 的界面。「从内核移除代码」的说法在 LoC 上为真,在契约重量上为假 —— 这条接缝行数更少,但承诺更重、可移植性更差。

[原文]
**Risks / Textual coupling points the extension (and core) now touch.**
1. **Render sandboxing is imperfect.** Textual bubbles a child widget's
   exception (in reactive watchers, message handlers, or `render`) up toward the
   app; the host wrapper can catch mount/explicit-refresh failures but not every
   in-widget crash. A truly robust guard needs a spike on Textual's
   `on_exception`/error boundary behavior — **open question.**
2. **Key-dispatch ordering.** The interceptor must beat both the focused
   `TextArea` and app-level bindings. Splicing at the top of `PromptInput.on_key`
   works on today's Textual, but it is load-bearing on Textual's
   focused-widget-first + `event.stop()`-preempts-binding semantics; a Textual
   upgrade could shift this.
3. **Version lockstep.** Core and extension now share a pinned Textual across a
   public seam — the precise ecosystem-break-on-upgrade the Ruling flagged. A
   Textual major bump now risks both repos at once.
4. **Overlay focus/return semantics** via `ModalScreen` (steer `Input` focus,
   Esc scoping, focus restoration to the prompt on close) must match the old
   in-place view's feel — behavioral, needs the integration test to pin.
5. **Theme-object stability** across reload/theme-change: factories capture a
   `TuiTheme`; the host must re-invoke them on change or expose a refresh hook,
   or extension widgets render stale colors.
6. **Slot vs responsive layout:** the new slot containers interact with
   `_update_responsive_layout`; an extension widget with unbounded height could
   crowd the transcript. Core should cap slot height (as `#agent-strip` did with
   `max-height: 8`).

[译文]
**扩展(以及内核)现在触及的风险 / Textual 耦合点。**
1. **渲染沙箱化并不完美。** Textual 会把子控件的异常(在 reactive watcher、消息处理器或 `render` 中)向应用冒泡;宿主包装器可以捕获挂载/显式刷新失败,但无法捕获控件内的每一次崩溃。真正健壮的守卫需要对 Textual 的 `on_exception`/错误边界行为做一次 spike —— **未决问题。**
2. **按键分发顺序。** 拦截器必须同时胜过获得焦点的 `TextArea` 与应用级绑定。在 `PromptInput.on_key` 顶部接入在今天的 Textual 上有效,但它承重于 Textual「焦点控件优先 + `event.stop()` 抢占绑定」的语义;一次 Textual 升级可能改变这一点。
3. **版本锁定。** 内核与扩展现在经由一条公开接缝共享固定的 Textual —— 正是该裁定所指出的「升级即生态破坏」。一次 Textual 大版本升级现在会同时危及两个仓库。
4. **Overlay 的焦点/返回语义** 经由 `ModalScreen`(插话 `Input` 的焦点、Esc 作用域、关闭时把焦点还给提示输入)必须匹配旧就地视图的手感 —— 属于行为层面,需要集成测试来钉住。
5. **主题对象的稳定性** 跨 reload/主题变化:工厂捕获一个 `TuiTheme`;宿主必须在变化时重新调用它们,或暴露一个刷新钩子,否则扩展控件会渲染出过时的颜色。
6. **槽位 vs 响应式布局:** 新的槽位容器会与 `_update_responsive_layout` 交互;高度无界的扩展控件可能挤压会话记录。内核应当限制槽位高度(正如 `#agent-strip` 用 `max-height: 8` 所做的那样)。

[原文]
**Open questions not resolvable from the source alone:** (1) whether a child
widget render crash can be fully contained in Textual without a per-widget
subprocess/boundary — needs a runtime spike; (2) whether the overlay should be a
`ModalScreen` (chosen here for focus/Esc correctness) or an in-tree toggled
container (closer to the removed `#agent-transcript-pane`, easier live-refresh) —
`ModalScreen` was recommended but both were not prototyped; (3) whether `run.revision`
should be dropped entirely in favor of pure listener push or retained as a dirty
check (retained here, but it is redundant once listeners exist).

[译文]
**仅靠源码无法解决的未决问题:**(1)子控件的渲染崩溃能否在 Textual 中被完全隔离,而无需每控件一个子进程/边界 —— 需要一次运行时 spike;(2)overlay 应当用 `ModalScreen`(此处因其焦点/Esc 正确性而选择),还是树内切换容器(更接近被移除的 `#agent-transcript-pane`,实时刷新更容易)—— 推荐了 `ModalScreen`,但两者都没有做原型;(3)`run.revision` 应当彻底删掉、改用纯监听器推送,还是保留为脏检查(此处保留,但一旦存在监听器它就是冗余的)。

---

## 第 8 节:实测结果(8. Measured outcome)

[原文]
The §7 LoC deltas were estimates. Here are the real numbers, measured against
the pre-experiment baseline (`subagents-integration`) — first as of Step 3,
then updated after the post-experiment fix commits.

[译文]
第 7 节的 LoC 变化是估算。以下是真实数字,基于实验前基线(`subagents-integration`)测量 —— 先给出 Step 3 时的结果,再给出实验后修复提交之后的更新。

[原文]
**Core source (`src/` only), as of Step 3 (`c291557`)** —
`git diff --stat subagents-integration..c291557 -- src/`:

[译文]
**内核源码(仅 `src/`),截至 Step 3(`c291557`)** —— `git diff --stat subagents-integration..c291557 -- src/`:

```
 src/tau_coding/extensions/__init__.py |  20 +-
 src/tau_coding/extensions/api.py      | 251 ++++++++---
 src/tau_coding/extensions/runtime.py  |  53 ---
 src/tau_coding/tui/app.py             | 773 ++++++++++++++++------------------
 4 files changed, 568 insertions(+), 529 deletions(-)
```

[原文]
- **Net core src at Step 3: +39 lines** (568 inserted, 529 deleted).
- Of that, **Step 3 alone removed a net 585 src lines** (6 inserted, 591
  deleted) — the old transcript-source seam plus the entire host-side agents
  strip / in-place view / steer machinery in `app.py`.
- So Steps 1–2 (adding the component seam) added ~624 net src lines, and Step 3
  (removing the old seam) gave ~585 back.

[译文]
- **Step 3 时的内核 src 净变化:+39 行**(新增 568,删除 529)。
- 其中,**仅 Step 3 就净删除 585 行 src**(新增 6,删除 591)—— 旧 transcript-source 接缝,加上 `app.py` 中整个宿主侧 agents 状态条 / 就地视图 / 插话机制。
- 因此 Step 1–2(新增组件接缝)净新增约 624 行 src,而 Step 3(移除旧接缝)收回约 585 行。

[原文]
**Updated after the post-experiment fixes** (`5f8a78f` pre-dispatch
interceptors, `ff55f54` sequenced swaps) —
`git diff --stat subagents-integration..HEAD -- src/`:

[译文]
**实验后修复之后的更新**(`5f8a78f` 分发前拦截器,`ff55f54` 有序列交换)—— `git diff --stat subagents-integration..HEAD -- src/`:

```
 src/tau_coding/extensions/__init__.py |  20 +-
 src/tau_coding/extensions/api.py      | 264 +++++++--
 src/tau_coding/extensions/runtime.py  |  53 --
 src/tau_coding/tui/app.py             | 972 +++++++++++++++++++---------------
 4 files changed, 778 insertions(+), 531 deletions(-)
```

[原文]
- **Net core src now: +247 lines** (778 inserted, 531 deleted). The two fix
  commits — moving the interceptor consult to a true pre-dispatch
  `TauTuiApp.on_event` hook, and serializing slot/main-view swaps behind locks
  so a deferred remove drains before the same-id replacement mounts — cost a
  further ~208 net src lines. Both were bugs the experiment had to fix to be
  usable, so they belong in the honest total.

[译文]
- **内核 src 现在的净变化:+247 行**(新增 778,删除 531)。两个修复提交 —— 把拦截器查询移动到真正的分发前 `TauTuiApp.on_event` 钩子,以及把槽位/主视图交换在锁之后串行化,使延迟的移除在同 id 替换挂载之前排空 —— 又花费了约 208 行净 src。两者都是实验为可用而必须修复的缺陷,因此它们属于诚实的总账。

[原文]
**The estimate was wrong in sign.** §7 predicted "roughly **−200 non-test
LoC** — core does get smaller." Measured, core src grew by **+39 lines** net at
Step 3 and **+247 lines** with the correctness fixes in. The component seam
(`ComponentBridge` + slot/main-view mounting + the in-tree main view +
interceptor registry + the `_handle_exception` quarantine guard + the sequenced
swap machinery + Null/Stderr no-ops) is *larger* than the transcript-source
seam it replaced — the guard/quarantine, main-view plumbing, and swap
sequencing in particular cost more than the estimate allowed. The honest
headline stands but flips: core did **not** get smaller in LoC. It traded a
small, data-only, frontend-portable seam for a larger, Textual-coupled one —
heavier in both contract weight (§7) *and* line count.

[译文]
**估算连正负号都错了。** 第 7 节预测「大约 **非测试 LoC −200** —— 内核确实变小了」。实测:Step 3 时内核 src 净**增加 39 行**,计入正确性修复后净**增加 247 行**。组件接缝(`ComponentBridge` + 槽位/主视图挂载 + 树内主视图 + 拦截器注册表 + `_handle_exception` 隔离守卫 + 有序列交换机制 + Null/Stderr 无操作)比它所取代的 transcript-source 接缝*更大* —— 尤其是守卫/隔离、主视图管线和交换串行化,花费都超过了估算所允许的范围。诚实的标题仍然成立,但方向反转:内核在 LoC 上**并没有**变小。它用一个小的、仅数据的、可跨前端移植的接缝,换来了一个更大、与 Textual 耦合的接缝 —— 无论契约重量(§7)*还是*行数都更重。

[原文]
**Test counts (current, both repos green):**
- Core: **802 passing** (796 at Step 3 — Step 3 deleted 9 strip/view pilot
  tests from `test_tui_app.py`, 3 transcript-source runtime tests from
  `test_extensions.py`, and replaced the legacy-coexistence component test with
  a plain open→close restore-`#transcript` test, net −12 from the pre-Step-3
  808; the fix commits then added 6 interceptor/swap pilot tests).
- Extension (`tau-subagents`): **116 passing** (103 at Step 3; the fix-commit
  batches added the nav-while-viewer-open, rapid-switch, rebind, and
  quiet-rows tests).

[译文]
**测试数量(当前,两个仓库绿色):**
- 内核:**802 通过**(Step 3 时为 796 —— Step 3 从 `test_tui_app.py` 删除了 9 个状态条/视图试点测试,从 `test_extensions.py` 删除了 3 个 transcript-source 运行时测试,并把遗留共存组件测试替换为一个普通的 open→close 恢复 `#transcript` 测试,相对 Step 3 之前的 808 净减少 12;随后修复提交又新增了 6 个拦截器/交换试点测试)。
- 扩展(`tau-subagents`):**116 通过**(Step 3 时为 103;修复提交批次新增了「查看器打开期间导航」「快速切换」「重新绑定」与「静默行」测试)。
