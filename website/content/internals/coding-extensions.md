---
title: tau_coding · 扩展系统
description: extensions/ 包与 __init__
---

## 5. `extensions/` — the extension system

This is the most architecturally interesting part of `tau_coding`. It lets
third-party code hook into the agent at runtime without forking Tau. It is split
into three files mirroring "API contract", "discovery/loading", and
"runtime dispatch".

### 5.1 `extensions/__init__.py`

Pure re-exports so callers can do `from tau_coding.extensions import ExtensionAPI,
ExtensionRuntime, load_extensions, StderrUiBridge, ...`. It ties the three
submodules together at the package boundary.

### 5.2 `extensions/api.py` — the contract

`ExtensionAPI` is the object passed to every extension's `setup(tau)` function.
It exposes the *safe* surface: `register_tool`, `register_command`,
`register_message_renderer`, `register_prompt_guideline`, `subscribe`, and
actions like `send_user_message` / `send_custom_message` / `append_custom_entry`.
Every method validates against the active `ExtensionGeneration`; an API object
from a reloaded generation raises `ExtensionError`.

Supporting types: `ExtensionHandler`, `ExtensionCommandHandler`,
`ExtensionCommandContext`, `MessageRenderer`, `MessageRenderOptions`,
`CustomMessageView`, `InputEvent`, `InputHookResult`, `ToolCallHookEvent`/
`ToolCallHookResult`, `ToolResultHookEvent`/`ToolResultHookResult`,
`SessionStartEvent`/`SessionShutdownEvent`, `RegisteredExtension`,
`ExtensionGeneration`, `ExtensionError`, `UiBridge`/`NullUiBridge`, plus the
`AGENT_EVENT_TYPES` / `LIFECYCLE_EVENT_TYPES` / `AGENT_EVENT_WILDCARD` constants.

#### 逐方法深度剖析（`api.py`）

> 以下为 `extensions/api.py` 中各顶层类型与 `ExtensionAPI` 全部方法的逐方法展开。
> 其中 `UiBridge`/`NullUiBridge`/`StderrUiBridge`/`ExtensionContext` 等运行期类型在 `api.py` 中定义契约,实现分布在 `runtime.py`;此处一并列出其接口与默认实现。

# `tau_coding/extensions/api.py` 逐方法源码剖析

本文件是扩展(extension)面向宿主(host)的能力面定义,包含类型、事件载荷、钩子结果、UI 桥接协议以及核心的 `ExtensionAPI` 类。它刻意不依赖 Textual,只在 `TYPE_CHECKING` 与运行时延迟导入里引用 TUI,从而让"打印模式"(print mode)扩展在无需 TUI 依赖图的情况下保持可用。下文严格依据源码逐方法展开。

---

## 模块级常量与类型别名

### `AGENT_EVENT_TYPES`
模块级 `frozenset[str]`,列出 agent 运行期产生的事件类型集合:`"agent_start"`、`"agent_end"`、`"turn_start"`、`"turn_end"`、`"retry"`、`"queue_update"`、`"message_start"`、`"message_delta"`、`"thinking_delta"`、`"message_end"`、`"tool_execution_start"`、`"tool_execution_update"`、`"tool_execution_end"`、`"error"`。它是不可变集合,用作订阅分发时对"agent 事件"分类的依据以及白名单校验。

### `AGENT_EVENT_WILDCARD`
字符串常量,值为 `"agent_event"`。作为订阅 agent 类事件的统配符(event 名),让扩展可以用一个订阅覆盖所有 `AGENT_EVENT_TYPES` 中的事件,而不必逐个注册。

### `LIFECYCLE_EVENT_TYPES`
模块级 `frozenset[str]`,列出会话生命周期事件类型集合:`"session_start"`、`"session_shutdown"`、`"input"`、`"tool_call"`、`"tool_result"`。这些事件驱动扩展的钩子(hooks)与生命周期回调,与 agent 运行期事件相区分。

### `SessionLifecycleReason`
`Literal["startup", "reload", "new", "resume", "branch", "quit"]` 类型别名,描述 `session_start`/`session_shutdown` 的触发原因。

### `DeliverAs`
`Literal["steer", "follow_up"]` 类型别名,用于 `send_user_message`/`send_custom_message`,描述当 agent 正在运行时消息如何排队:`"steer"`(转向/插队当前运行)或 `"follow_up"`(作为后续回合)。空闲提示路径下为 `None`。

### `NotifyLevel`
`Literal["info", "warning", "error"]` 类型别名,用于通知级别。

### `CustomMessageView` 类型(见下)相关:`MessageRenderer`
`MessageRenderer = Callable[[CustomMessageView, MessageRenderOptions], str]`。一个渲染器类型别名:接收自定义消息视图与选项,返回 Rich 标记(或纯文本)字符串。**注意它返回字符串而非 Textual widget**,因此扩展永不导入 TUI 工具包(这是与 Pi 的 `Component` 返回形式的偏离,见 phase-21 自定义渲染器 Ruling)。

### `CustomMessageMarkup`
`Callable[[str, str, "Mapping[str, JSONValue] | None", bool], "str | None"]`。宿主侧解析器,装入渲染路径:给定自定义消息的字段与是否展开,返回渲染标记或 `None`(回退到原始 content)。错误被解析器吞掉,绝不抛到前端。

### `ToolCallMarkup`
`Callable[[str, "Mapping[str, JSONValue]"], "str | None"]`。宿主侧解析器:给定工具调用名与参数,返回工具 `render_call` 产出的友好调用行,或 `None` 回退到通用格式。错误被吞掉。

### `ToolResultMarkup`
`Callable[[AgentToolResult, bool], "str | None"]`。宿主侧解析器:给定工具结果与行是否展开,返回 `render_result` 的显示标记,或 `None` 回退到通用结果块。错误被吞掉。

### `Placement`
`Literal["above_prompt", "below_prompt"]` 类型别名,决定槽位(slot) widget 挂载在提示框上方还是下方。

### `SlotWidgetFactory`
`Callable[["TuiTheme"], "Widget"]`。在 UI 线程运行的工厂,接收实时主题返回 Textual Widget(镜像 Pi 的 `(tui, theme) => Component`)。

### `SlotWidgetContent`
`Sequence[str] | SlotWidgetFactory`。槽位 widget 可为工厂,或为简单情形下的"显示行"序列——宿主将字符串转成 widget,让简单扩展无需导入 Textual(镜像 Pi 的 `string[]` 形式的 `setWidget`)。字符串按 Rich 标记渲染,标记畸形时回退为纯文本。

### `MainViewFactory`
`Callable[["MainViewHandle", "TuiTheme"], "Widget"]`。主视图工厂,额外接收 handle 以便 widget 自行关闭。

### `KeyInterceptor`
`Callable[["events.Key", str], bool]`。派发前(pre-dispatch)按键钩子(镜像 Pi 的 `onTerminalInput`)。返回 `True` 即消费按键。对每个主屏按键触发,不论焦点;宿主传入 Textual `Key` 事件与当前提示文本,使处理者可自判定(如 Pi 在 `getEditorText() === ""` 时判定)。

### `_DEFAULT_THEME`
模块级 `_DEFAULT_THEME: TuiTheme | None = None`,缓存默认主题的哨兵变量,初始为 `None`。

### `ExtensionHandler`
`Callable[[object], object | Awaitable[object]]` 类型别名:扩展事件处理器的通用签名,接收任意事件载荷对象,返回对象或 awaitable 对象。

### `ExtensionCommandHandler`
`Callable[["str", "ExtensionCommandContext"], "str | None"]` 类型别名:斜杠命令处理器,**仅同步**。因命令路径(CommandRegistry -> CodingSession.handle_command -> TUI submit)端到端同步。接收参数字符串与命令上下文,返回字符串(回复)或 `None`。

### `StderrUiBridge`(见下)与 `NullUiBridge`(见下)相关:`ComponentBridge`、`UiBridge`
见各自协议/类小节。

---

## CustomMessageView

### 类定义
`@dataclass(frozen=True, slots=True) class CustomMessageView` — 传给消息渲染器的只读视图。移植 Pi 的 `CustomMessage`:`custom_type` 选择渲染器,`content` 是进入 LLM 上下文的文本,`details` 携带渲染器格式化的任意结构化数据。

### `custom_type: str`
字段:自定义消息类型字符串,用于选择注册过的渲染器。

### `content: str`
字段:进入 LLM 上下文的文本内容。

### `details: Mapping[str, JSONValue] | None = None`
字段:可选的结构化数据,渲染器据此格式化。默认 `None`。

---

## MessageRenderOptions

### 类定义
`@dataclass(frozen=True, slots=True) class MessageRenderOptions` — 传给消息渲染器的选项(移植 Pi 的同名类)。

### `expanded: bool = False`
字段:消息是否处于展开状态,默认 `False`。渲染器据此决定展示详细/简略版。

---

## `_default_theme`

### `def _default_theme() -> TuiTheme`
作用:返回共享默认主题,且不在模块加载时导入 TUI,保持扩展 API 的导入清洁。
关键实现步骤:
- 声明为 `global _DEFAULT_THEME`。
- 若 `_DEFAULT_THEME is None`,则延迟导入 `from tau_coding.tui.config import TAU_DARK_THEME` 并赋值。
- 返回 `_DEFAULT_THEME`。
涉及字段:`_DEFAULT_THEME`(模块级缓存)。仅在扩展实际读取主题时付出导入代价,且绝不抛出(print mode 也安全)。

---

## MainViewHandle

### 类定义
`class MainViewHandle(Protocol)` — 打开的主区域视图的句柄(移植 Pi 的 `OverlayHandle`,经裁剪)。承载 Pi 的 `done(result)` 语义:工厂或按键拦截器调用 `close(result)` 拆掉视图并把值交回开启者,开启者 `await wait()` 拿该值。是 Pi `ctx.ui.custom<T>` 中"结果解析"的一半,保留在同步 open/handle 模型而非 async open。
`close()` 卸载视图并恢复主 transcript;可安全多次调用,首次调用生效,后续为 no-op。

### `def close(self, result: object | None = None) -> None`
作用:关闭视图,用 `result` 解析 `wait()`(Pi 的 `done`)。首次关闭生效(其 `result` 即 `wait` 的返回),后续 `close(...)` 为 no-op。可多次调用。

### `async def wait(self) -> object | None`
作用:等待视图拆除并返回传给 `close` 的结果(`None` 表示无结果)。在会话重绑被强制清空、widget 崩溃被隔离、或被后续 `open_main_view` 取代时同样以 `None` 解析——永不挂起;若 `wait` 前已关闭则立即返回。

### `@property def is_open(self) -> bool`
作用:返回视图是否仍打开。

---

## ComponentBridge

### 类定义
`class ComponentBridge(Protocol)` — 宿主 widget 托管能力,经 `context.ui.components` 暴露。属于 `UiBridge` 在 TUI 附着时提供的一部分;`NullUiBridge`/`StderrUiBridge` 将其实现为 no-op,使扩展在 print mode 下无需 widget 也完全可用。构建 widget 前应检查 `supports_components`。

### `@property def supports_components(self) -> bool`
作用:返回前端是否能托管扩展 widget。

### `@property def theme(self) -> TuiTheme`
作用:返回交给 widget 工厂的实时 TUI 主题。

### `def get_prompt_text(self) -> str`
作用:返回当前提示编辑器文本(Pi 的 getEditorText)。按键拦截器把提示文本作第二参数;此方法用于按键路径之外的读取。

### `def request_render(self) -> None`
作用:请求宿主重渲染已挂载的扩展 widget(Pi 的 requestRender)。

### `def set_slot_widget(self, key, content, *, placement="above_prompt") -> None`
作用:把扩展 widget 挂载到 `key` 指定的提示相邻槽位。`content` 为工厂 `factory(theme) -> Widget` 或纯显示行序列 `Sequence[str]`(宿主按 Rich 标记渲染,字符串形式让简单扩展免导入 Textual)。`content=None` 卸载并遗忘该 key。重设 key 替换内容;同一 placement 下多个 key 按调用顺序挂载。默认 `above_prompt`(Pi 的 aboveEditor)。

### `def open_main_view(self, factory: MainViewFactory) -> MainViewHandle`
作用:把 `factory(handle, theme)` 作为完整主区域视图挂载。widget 就地替换主 transcript(显示切换的兄弟节点,而非模态屏),提示相邻 widget 仍可见。`handle.close(result)` 恢复 transcript 并解析 `await handle.wait()` 为 `result`(Pi 的 done),使开启者可展示视图并取回答案。

### `def register_key_interceptor(self, handler: KeyInterceptor) -> Callable[[], None]`
作用:注册派发前按键钩子,返回退订 callable(移植 Pi 的 `onTerminalInput`)。处理者在宿主 app 级优先绑定与焦点 widget 之前看到按键,可独占导航键。对**每个**主屏按键触发(模态屏置顶时从不触发),处理者必须自判定且仅对消费的键返回 `True`。宿主保留硬中断/退出键(`ctrl+c`、`ctrl+d`)——拦截器绝不被咨询、不可消费,以免 handler bug 吞掉会话逃生口。其余键(escape、enter、方向键、tab)仍可拦截。

---

## ExtensionError

### 类定义
`class ExtensionError(RuntimeError)` — 当扩展误用 API(如在绑定前执行动作)时抛出。仅作语义化异常子类,无额外逻辑。

---

## `_STALE_MESSAGE`

### 模块级常量
`_STALE_MESSAGE` 字符串,内容为:"extension instance is stale after reload: state captured before /reload (a saved `tau` API object, context, or ui handle) must not be reused; the reloaded extension received a fresh API in its new setup()"。作为 `ExtensionGeneration.invalidate` 的默认失效消息。

---

## ExtensionGeneration

### 类定义
`class ExtensionGeneration` — 一次扩展加载代(generation)的存活令牌。移植 Pi 的 `assertActive`/`invalidate` 失活性守卫:每个 `ExtensionAPI` 方法、每个 `ExtensionContext`/`ExtensionUi` 读取都在触碰 runtime 前检查此令牌,使 `/reload` 前捕获的状态响亮失败,而非静默作用于新注册集。**仅 reload 使其失效**;会话重绑(resume/new/branch)按设计保持代存活(见 phase-21 生命周期 Ruling)。

### `__slots__ = ("_stale_message",)`
限制实例仅含 `_stale_message` 属性,节省内存并防止随意添加属性。

### `def __init__(self) -> None`
作用:初始化令牌。设置 `self._stale_message: str | None = None`,即默认激活状态。

### `@property def active(self) -> bool`
作用:返回此代是否仍为存活代。实现:`return self._stale_message is None`。

### `def invalidate(self, message: str | None = None) -> None`
作用:标记此代失效;首条消息生效(Pi 对等)。实现:若 `self._stale_message is None`,则赋值为 `message or _STALE_MESSAGE`。

### `def assert_active(self) -> None`
作用:当代失效时抛出 `ExtensionError`。实现:若 `self._stale_message is not None`,则 `raise ExtensionError(self._stale_message)`。

---

## SessionStartEvent

### 类定义
`@dataclass(frozen=True, slots=True) class SessionStartEvent` — `session_start` 生命周期事件载荷。

### `reason: SessionLifecycleReason`
字段:会话启动原因(`startup`/`reload`/`new`/`resume`/`branch`/`quit`)。

---

## SessionShutdownEvent

### 类定义
`@dataclass(frozen=True, slots=True) class SessionShutdownEvent` — `session_shutdown` 生命周期事件载荷。

### `reason: SessionLifecycleReason`
字段:会话关闭原因。

---

## InputEvent

### 类定义
`@dataclass(frozen=True, slots=True) class InputEvent` — `input` 钩子载荷:展开前的原始用户提示文本。镜像 Pi 的 `InputEvent`。
`source` 说明来源:`"interactive"`(TUI/print 模式用户输入)或 `"extension"`(由 `send_user_message`/`send_custom_message` 启动的回合)。`streaming_behavior` 说明 agent 运行中输入如何排队(`"steer"`/`"follow_up"`),空闲提示路径为 `None`。省略了 Pi 的 `images`(Tau 暂不支持图像输入)与 `"rpc"` 来源(Tau 无 RPC 模式),以保持只读取 `.text` 的既有 handler 行为不变。

### `text: str`
字段:原始提示文本。

### `source: Literal["interactive", "extension"] = "interactive"`
字段:输入来源,默认交互式。

### `streaming_behavior: Literal["steer", "follow_up"] | None = None`
字段:流式排队行为,默认 `None`。

---

## InputHookResult

### 类定义
`@dataclass(frozen=True, slots=True) class InputHookResult` — `input` 钩子处理器的返回结果。
`action="continue"` 保持文本不变;`"transform"` 用 `text` 替换(变换跨 handler 链式传递);`"handled"` 完全消费输入,可选地用 `message` 向用户展示。

### `action: Literal["continue", "transform", "handled"] = "continue"`
字段:钩子动作,默认 `continue`。

### `text: str | None = None`
字段:`transform` 模式下替换用的新文本,默认 `None`。

### `message: str | None = None`
字段:`handled` 模式下向用户展示的消息,默认 `None`。

---

## ToolCallHookEvent

### 类定义
`@dataclass(frozen=True, slots=True) class ToolCallHookEvent` — `tool_call` 钩子载荷,工具执行之前。不含工具调用 id:钩子在 tool executor 接缝内运行,agent 循环无 id 调用它。用观察事件(`tool_execution_start`/`tool_execution_end`)做 id 关联。

### `tool_name: str`
字段:被调用工具名。

### `arguments: Mapping[str, JSONValue]`
字段:调用参数。

---

## ToolCallHookResult

### 类定义
`@dataclass(frozen=True, slots=True) class ToolCallHookResult` — `tool_call` 钩子返回结果。
设 `block=True`(可选 `reason`)阻止执行,或返回替换 `arguments` 改写调用。阻止优先于参数改写,并短路剩余 handler。

### `block: bool = False`
字段:是否阻止执行,默认 `False`。

### `reason: str | None = None`
字段:阻止原因,默认 `None`。

### `arguments: Mapping[str, JSONValue] | None = None`
字段:替换用参数,默认 `None`。

---

## ToolResultHookEvent

### 类定义
`@dataclass(frozen=True, slots=True) class ToolResultHookEvent` — `tool_result` 钩子载荷,工具执行之后。

### `tool_name: str`
字段:工具名。

### `arguments: Mapping[str, JSONValue]`
字段:调用参数。

### `result: AgentToolResult`
字段:工具执行结果。

---

## ToolResultHookResult

### 类定义
`@dataclass(frozen=True, slots=True) class ToolResultHookResult` — `tool_result` 钩子返回结果;设字段以覆盖。

### `content: str | None = None`
字段:覆盖结果内容,默认 `None`。

### `ok: bool | None = None`
字段:覆盖 ok 标志,默认 `None`。

### `details: dict[str, JSONValue] | None = None`
字段:覆盖细节字典,默认 `None`。

---

## ExtensionRuntimeDiagnostic

### 类定义
`@dataclass(frozen=True, slots=True) class ExtensionRuntimeDiagnostic` — 由扩展 handler 引发的运行时失败诊断。

### `extension: str`
字段:出错的扩展名。

### `event: str`
字段:出错事件名。

### `message: str`
字段:错误消息。

---

## UiBridge

### 类定义
`class UiBridge(Protocol)` — 宿主提供给扩展的 UI 能力。对话框方法(`select`/`confirm`/`input`)为 async,镜像 Pi 的 `ctx.ui`。无交互前端时返回 Pi 的 no-op 默认值(`None`/`False`/`None`)。`timeout`(秒)超时自动以 no-op 默认值解散;`None` 无限等待。

### `@property def has_ui(self) -> bool`
作用:返回是否附着交互式 UI。

### `def notify(self, message, level="info") -> None`
作用:向用户显示通知(无 UI 时为 no-op)。

### `async def select(self, title, options, *, timeout=None) -> str | None`
作用:显示选择器;返回选中项,取消返回 `None`。

### `async def confirm(self, title, message, *, timeout=None) -> bool`
作用:显示确认;仅确认时返回 `True`。

### `async def input(self, title, placeholder="", *, timeout=None) -> str | None`
作用:显示文本提示;返回输入文本,取消返回 `None`。

### `@property def supports_components(self) -> bool`
作用:返回前端是否能托管扩展 widget。

### `@property def theme(self) -> TuiTheme`
作用:返回交给 widget 工厂的实时 TUI 主题。

### `def get_prompt_text(self) -> str`
作用:返回当前提示编辑器文本。

### `def request_render(self) -> None`
作用:请求宿主重渲染已挂载扩展 widget。

### `def set_slot_widget(self, key, content, *, placement="above_prompt") -> None`
作用:挂载或移除扩展槽位 widget(工厂或字符串行)。

### `def open_main_view(self, factory: MainViewFactory) -> MainViewHandle`
作用:打开完整主区域扩展视图。

### `def register_key_interceptor(self, handler: KeyInterceptor) -> Callable[[], None]`
作用:注册派发前按键钩子,返回退订 callable(详见 ComponentBridge 说明:先于宿主优先绑定与焦点 widget、对每个主屏按键触发、须自判定;`ctrl+c`/`ctrl+d` 保留不抵达拦截器)。

### `def clear_components(self) -> None`
作用:拆掉所有扩展自有 UI(宿主驱动,非扩展调用)。runtime 在 `/reload`(失效代的 widget 与拦截器不得比其注册集更长寿)与会话重绑(resume/new,在 `session_start` 触发前,使 handler 可重新挂载)时驱动。槽位 widget 与任何主视图被卸载(挂起的 `wait()` 以 `None` 解析),按键拦截器被丢弃。

---

## `_DeadMainViewHandle`

### 类定义
`class _DeadMainViewHandle` — 当无 UI 可托管视图时返回的 no-op 主视图句柄。

### `def close(self, result=None) -> None`
作用:什么都不做(无视图可关,`result` 被忽略)。

### `async def wait(self) -> object | None`
作用:立即返回 `None`(死句柄永不打开视图)。

### `@property def is_open(self) -> bool`
作用:返回 `False`(死句柄永不打开)。

---

## NullUiBridge

### 类定义
`class NullUiBridge` — 未附着交互式前端时使用的 UI 桥(print mode)。

### `@property def has_ui(self) -> bool`
作用:返回 `False`(print mode 无交互 UI)。

### `def notify(self, message, level="info") -> None`
作用:无 UI 时忽略通知。

### `async def select(self, title, options, *, timeout=None) -> str | None`
作用:返回 `None`(无 UI 可选,Pi no-op 默认)。

### `async def confirm(self, title, message, *, timeout=None) -> bool`
作用:返回 `False`(无 UI 可确认,Pi no-op 默认)。

### `async def input(self, title, placeholder="", *, timeout=None) -> str | None`
作用:返回 `None`(无 UI 可输入,Pi no-op 默认)。

### `@property def supports_components(self) -> bool`
作用:返回 `False`(print mode 无法托管 widget)。

### `@property def theme(self) -> TuiTheme`
作用:返回可用的默认主题(绝不抛出;print mode 可能读取)。实现:`return _default_theme()`。

### `def get_prompt_text(self) -> str`
作用:返回空字符串(print mode 无编辑器)。

### `def request_render(self) -> None`
作用:什么都不做(无前端可重渲染)。

### `def set_slot_widget(self, key, content, *, placement="above_prompt") -> None`
作用:什么都不做(无槽位可挂载)。

### `def open_main_view(self, factory: MainViewFactory) -> MainViewHandle`
作用:返回死句柄(无主区域可托管视图)。实现:`return _DeadMainViewHandle()`。

### `def register_key_interceptor(self, handler: KeyInterceptor) -> Callable[[], None]`
作用:返回 no-op 退订 callable(无按键流可拦截)。实现:`return lambda: None`。

### `def clear_components(self) -> None`
作用:什么都不做(从未挂载过组件)。

---

## StderrUiBridge

### 类定义
`class StderrUiBridge(NullUiBridge)` — 把扩展通知写到 stderr 的 UI 桥(print mode)。继承 `NullUiBridge` 的 Pi no-op 对话框默认;仅 `notify` 在 print mode 可见。

### `def notify(self, message, level="info") -> None`
作用:把通知打印到 stderr。实现:`print(f"[extension:{level}] {message}", file=sys.stderr)`。

---

## ExtensionCommandContext

### 类定义
`@dataclass(frozen=True, slots=True) class ExtensionCommandContext` — 传给扩展斜杠命令处理器的上下文。

### `name: str`
字段:命令名。

### `args: str`
字段:命令参数(原始字符串)。

### `api: ExtensionAPI`
字段:该扩展的 `ExtensionAPI` 实例,使命令 handler 可调用 `tau` 能力。

---

## ExtensionUi

### 类定义
`class ExtensionUi` — 暴露给扩展、作为 `context.ui` 的交互式 UI 门面。镜像 Pi 的 `ctx.ui`:异步 `select`/`confirm`/`input` 对话框加同步 `notify`。每次调用都委托给宿主 UI 桥(无交互前端时返回 Pi no-op 默认)。每个成员(含平凡的读取,与 Pi 一致)都断言所属加载代仍存活,在门面于 `/reload` 前捕获时抛出 `ExtensionError`。

### `def __init__(self, runtime, generation=None) -> None`
作用:构造门面。保存 `self._runtime`;若 `generation` 为 `None` 则新建 `ExtensionGeneration()`,否则用传入的。

### `@property def has_ui(self) -> bool`
作用:返回是否附着交互式 UI。先 `self._generation.assert_active()`,再 `return self._runtime.ui.has_ui`。

### `async def select(self, title, options, *, timeout=None) -> str | None`
作用:提示用户选择;取消/无 UI 返回 `None`。先断言存活,再 `return await self._runtime.ui.select(title, options, timeout=timeout)`。

### `async def confirm(self, title, message, *, timeout=None) -> bool`
作用:询问确认;仅确认时返回 `True`。先断言存活,再委托 `self._runtime.ui.confirm(...)`。

### `async def input(self, title, placeholder="", *, timeout=None) -> str | None`
作用:提示用户输入;取消/无 UI 返回 `None`。先断言存活,再委托 `self._runtime.ui.input(...)`。

### `@property def components(self) -> ComponentBridge`
作用:返回宿主 widget 托管能力,直通已安装的 UI 桥(其实现 `ComponentBridge` 成员;TUI 托管真实 widget,print-mode 桥为 `supports_components == False` 的 no-op)。应在 `context.ui.components.supports_components` 上判定后再做 widget 工作。失效门面在此处(桥可达之前)抛出。

### `def notify(self, message, level="info") -> None`
作用:若有 UI 则显示通知。先断言存活,再 `self._runtime.ui.notify(message, level)`。

---

## ExtensionContext

### 类定义
`class ExtensionContext` — 暴露给扩展的只读会话上下文。每个属性(含平凡读取,与 Pi 的 context getters 一致)都断言所属加载代仍存活,使 `/reload` 前捕获的上下文抛出 `ExtensionError`,而非读取重载后的世界。

### `def __init__(self, runtime, generation=None) -> None`
作用:构造上下文。保存 `self._runtime`;若 `generation` 为 `None` 新建 `ExtensionGeneration()`;并实例化 `self._ui = ExtensionUi(runtime, self._generation)`。

### `@property def cwd(self) -> Path`
作用:返回会话工作目录。断言存活后返回 `self._runtime.session_view.cwd`。

### `@property def model(self) -> str`
作用:返回活动模型名。断言存活后返回 `self._runtime.session_view.model`。

### `@property def provider_name(self) -> str`
作用:返回活动 provider 名。断言存活后返回 `self._runtime.session_view.provider_name`。

### `@property def session_id(self) -> str | None`
作用:返回当前会话 id(若会话被索引)。断言存活后返回 `self._runtime.session_view.session_id`。

### `@property def system_prompt(self) -> str`
作用:返回活动系统提示。断言存活后返回 `self._runtime.session_view.system_prompt`。

### `@property def is_running(self) -> bool`
作用:返回 agent 运行当前是否活动。断言存活后返回 `self._runtime.session_view.is_running`。

### `@property def transcript(self) -> tuple[AgentMessage, ...]`
作用:返回活动路径的父对话(只读副本),镜像 Pi 的 `ctx.sessionManager.getBranch()` 只读访问:当前分支上的 user/assistant/tool 消息,compaction 与分支摘要已折叠为 `UserMessage` 条目(Tau 无独立摘要类型)。每条消息深拷贝,使扩展修改返回对象不会破坏实时会话 transcript。实现:断言存活,取 `self._runtime.session_view.messages`,`return tuple(message.model_copy(deep=True) for message in messages)`。

### `@property def has_ui(self) -> bool`
作用:返回是否附着交互式 UI。断言存活后返回 `self._runtime.ui.has_ui`。

### `@property def ui(self) -> ExtensionUi`
作用:返回交互式 UI 门面(Pi 的 `ctx.ui`)。可用 `await context.ui.select/confirm/input(...)` 驱动对话框。因命令 handler 同步,需要对话框的 `/command` 应 spawn 一个 loop 任务 await `context.ui`。断言存活后返回 `self._ui`。

---

## ExtensionAPI

### 类定义
`class ExtensionAPI` — 交给每个扩展 `setup(tau)` 入口的对象。每个方法与属性都先断言加载代(与 Pi 的 `assertActive` 对等):`/reload` 替换注册集后,上一实例捕获的 `tau` 对象在任何使用上都会抛出 `ExtensionError`,而非静默作用于新世界。它是扩展的"安全能力面",所有写入 runtime 注册表、订阅、发消息、跑钩子的操作都经此校验后委托给 `ExtensionRuntime`。

### `def __init__(self, runtime, extension_name, generation=None) -> None`
作用:构造 API 实例。保存 `self._runtime`、`self._extension_name`;若 `generation` 为 `None` 新建 `ExtensionGeneration()`;并构建 `self._context = ExtensionContext(runtime, self._generation)`。注意 generation 实例与 runtime、context 共享,从而统一失活性守卫。

### `@property def name(self) -> str`
作用:返回本扩展名。先 `self._generation.assert_active()`,再 `return self._extension_name`。

### `@property def context(self) -> ExtensionContext`
作用:返回只读会话上下文。断言存活后返回 `self._context`。

### `def register_tool(self, tool: AgentTool) -> None`
作用:注册一个 agent 工具(**同名首次注册生效**,first registration wins)。实现:断言存活后调用 `self._runtime.register_tool(self._extension_name, tool)`。

### `def register_command(self, name, handler, *, description="", usage=None, aliases=()) -> None`
作用:注册由本扩展支撑的斜杠命令。实现:断言存活后调用 `self._runtime.register_command(self._extension_name, name, handler, description=description, usage=usage, aliases=aliases)`。命令 handler 为同步(`ExtensionCommandHandler`)。

### `def add_prompt_guideline(self, guideline: str) -> None`
作用:向系统提示添加独立的指导行(guideline)。与工具相关指导(`prompt_snippet`/`prompt_guidelines` 挂在工具上)区分,这是不与任何工具绑定的行为指导。重复行在 prompt 构建时去重。实现:`self._generation.assert_active()` 后 `self._runtime.register_prompt_guideline(self._extension_name, guideline)`。

### `def on(self, event, handler=None) -> Callable[[ExtensionHandler], ExtensionHandler] | ExtensionHandler`
作用:订阅事件,既可直接调用,也可作装饰器使用。实现:
- 断言存活。
- 若 `handler is not None`:直接 `self._runtime.subscribe(self._extension_name, event, handler)` 并返回 `handler`(直接订阅模式)。
- 否则返回闭包 `decorator(decorated)`,该闭包内部再次 `assert_active()`(确保装饰器在失效代上也被守卫)并 `self._runtime.subscribe(...)`,返回被装饰函数(装饰器模式)。

### `def send_user_message(self, content, *, deliver_as="follow_up") -> None`
作用:为活动或下一个 agent 运行排队一条用户消息。实现:断言存活后 `self._runtime.send_user_message(content, deliver_as=deliver_as)`。

### `def register_message_renderer(self, custom_type, renderer: MessageRenderer) -> None`
作用:为本 `custom_type` 注册自定义消息渲染器(移植 Pi 的 `registerMessageRenderer`,**同名首次注册生效**)。渲染器接收 `CustomMessageView` 与 `MessageRenderOptions`,返回 Rich 标记字符串;**不可返回 Textual widget**(保持扩展免 TUI)。实现:断言存活后 `self._runtime.register_message_renderer(self._extension_name, custom_type, renderer)`。

### `def send_custom_message(self, content, *, custom_type, details=None, deliver_as="follow_up", trigger_turn=True) -> None`
作用:发送经注册渲染器渲染的自定义消息(移植 Pi 的 `sendMessage`)。`content` 仍进入 LLM 上下文,`custom_type`/`details` 让注册渲染器格式化 transcript 块。`trigger_turn`(默认)在空闲时启动一个回合(镜像 `send_user_message`);设为 `False` 则仅排队到下一次运行。实现:断言存活后 `self._runtime.send_custom_message(content, custom_type=custom_type, details=details, deliver_as=deliver_as, trigger_turn=trigger_turn)`。

### `async def append_entry(self, namespace: str, data: dict[str, JSONValue]) -> None`
作用:把扩展自有数据作为自定义条目持久化到会话。实现:断言存活后 `await self._runtime.append_custom_entry(namespace, data)`(异步,经 runtime 落库)。

### `def notify(self, message, level="info") -> None`
作用:若有 UI 则显示通知。实现:断言存活后 `self._runtime.ui.notify(message, level)`。

#### 关于 `ExtensionAPI` 的"能力面 / 校验 / 注册表 / 钩子"小结
- **代校验**:每个方法首行几乎都是 `self._generation.assert_active()`,因此 reload 后旧 `tau` 对象、旧 `context`、旧 `ui` 句柄再用即抛 `ExtensionError`。这是它作为"安全能力面"的核心:扩展无法拿旧世界状态作用于新注册集。
- **注册表写入**:`register_tool`/`register_command`/`add_prompt_guideline`/`register_message_renderer` 全部以 `self._extension_name` 为命名空间调用 `self._runtime` 对应 `register_*` 方法,由 runtime 维护按扩展名分组的注册表,并施加"首次注册生效"或"去重"策略。
- **订阅分发**:`on` 把 `(extension_name, event, handler)` 写入 runtime 订阅表;runtime 在事件发生时按事件名(含 `AGENT_EVENT_WILDCARD`/`LIFECYCLE_EVENT_TYPES` 分类)分发到各扩展 handler。`on` 同时支持直调与装饰器两种形态,装饰器闭包内再次 `assert_active` 保证失效代上的装饰也安全。
- **输入/工具钩子拦截**:虽然 `run_input_hooks`/`run_tool_call_hooks`/`run_tool_result_hooks` 本身不在此文件的 `ExtensionAPI` 上实现(其为 runtime 方法),但扩展通过 `on("input", ...)` 等订阅间接参与:`input` 钩子经 `InputHookResult`(`continue`/`transform`/`handled`,transform 链式传递、handled 短路)改写或吞掉用户提示;`tool_call` 钩子经 `ToolCallHookResult`(`block`/`reason`/`arguments`,block 优先且短路)阻止或改写工具调用;`tool_result` 钩子经 `ToolResultHookResult`(`content`/`ok`/`details` 覆盖)改写工具结果。这些入口的注册走 runtime 的订阅/钩子表,本文件提供的是事件类型常量与载荷/结果数据类。
- **消息与通知**:`send_user_message`/`send_custom_message`/`append_entry`/`notify` 经 runtime/ui 桥发出,触发 agent 回路或 UI 展示。

---

## RegisteredExtension

### 类定义
`@dataclass(slots=True) class RegisteredExtension` — runtime 内部对一个已加载扩展的记账(book-keeping)。注意此处未用 `frozen`(可随运行修改)。

### `name: str`
字段:扩展名。

### `path: Path`
字段:扩展源文件路径。

### `api: ExtensionAPI`
字段:该扩展对应的 `ExtensionAPI` 实例(每次加载/代更新都会换新实例,从而旧实例失效)。

### `handlers: dict[str, list[ExtensionHandler]] = field(default_factory=dict)`
字段:事件名到处理器列表的映射,默认空字典。runtime 在 `subscribe` 时按事件名把 handler 追加到对应列表,分发时遍历执行(支持多 handler;某些事件如 input 钩子的 `handled`/`block` 会短路后续)。

---

## 关键协议与契约补充

### `UiBridge` 抽象与其 Textual 实现(在 runtime/loader 中)的契约
- `UiBridge`(本文件)是 `Protocol`,规定了宿主必须提供的对话框(`select`/`confirm`/`input`,均 async + `timeout` 默认 no-op)、通知(`notify`)、组件接缝(`supports_components`/`theme`/`get_prompt_text`/`request_render`/`set_slot_widget`/`open_main_view`/`register_key_interceptor`/`clear_components`)。
- `NullUiBridge` 与 `StderrUiBridge` 是 print-mode 的两种落地实现:前者全 no-op,后者仅 `notify` 打印到 stderr。二者使扩展在"无 TUI"下仍完全可用(只是无 widget)。
- 真正的 Textual 实现位于 `tau_coding/extensions/runtime`(loader/TUI 集成),它须实现同一 `UiBridge`(并因此实现 `ComponentBridge`):对话框弹出真实 TUI 弹窗、`theme` 返回实时 TUI 主题、`set_slot_widget` 把 widget 挂到提示相邻槽、`open_main_view` 用 `MainViewHandle` 管理主区域视图、`register_key_interceptor` 在派发前(pre-dispatch)把按键交给扩展且保留 `ctrl+c`/`ctrl+d` 逃生键、`clear_components` 在 reload/重绑时由 runtime 调用来拆掉失效代的 UI。
- 契约要点:**TUI 是扩展公共契约的一部分**——扩展按 tau 固定的 Textual 版本构建;Textual 大版本升级对 core 与扩展是协同破坏性变更。print-mode 桥以 `supports_components == False` 与死句柄保证退化路径安全且不抛异常。

---

### 5.3 `extensions/loader.py` — discovery and import

This file answers "what extensions exist and how do I import them safely?"

**Data types:** `DiscoveredExtension` (name, path, optional package_dir) — a
candidate before import; `LoadedExtension` (name, path, `setup` callable) — after
a successful import; `ExtensionLoadResult` (loaded extensions + non-fatal
diagnostics).

**Discovery rules (`discover_extensions`):**

- `extension_dirs(...)` returns load directories **project-first, then user**
  (`<cwd>/.tau/extensions`, then `<root>/extensions`). Earlier dirs win name
  conflicts (project extensions shadow user ones). Project dirs are opt-in
  (`--project-extensions`) because they execute at session startup (a trust
  concern).
- A directory is scanned for `*.py` files (skipping `_`/`.` prefixed) or a
  subdirectory containing `extension.py`, or a `pyproject.toml` manifest under
  `[tool.tau] extensions = [...]`.
- Explicit `--extension <path>` entries always load, even with `--no-extensions`
  (the escape hatch that disables resource-dir discovery).
- Duplicate names are reported as diagnostics; first-seen wins.

**Loading (`load_extensions` → `_load_extension`):**

- Each entry gets a unique synthetic module name
  (`tau_extension_<slug>_<counter>`) so two extensions can't collide in
  `sys.modules`.
- Directory extensions load as **real packages** (`submodule_search_locations`)
  so their sibling modules are reachable via relative imports.
- Import errors, missing `setup`, or an **async** `setup` are all caught and
  turned into `ResourceDiagnostic`s — one bad extension never kills the others
  (the "extensions are an isolation boundary" principle).
- `unload_extension_modules()` removes the synthetic modules so a `/reload`
  re-imports fresh objects.

### 5.4 `extensions/runtime.py` — the orchestration core

`ExtensionRuntime` is the long-lived owner of all extensions. It outlives any
single `CodingSession` (resume/new re-bind it; `/reload` replaces the
registration set).

**Construction & lifecycle:**

- `__init__` initializes empty registries for extensions, tools, commands,
  prompt guidelines, message renderers, diagnostics, plus a `BoundSession` slot
  and a `UiBridge`.
- `load(...)` discovers+imports, then calls `_setup_extension` for each, handing
  it a fresh `ExtensionAPI` bound to the current `ExtensionGeneration`.
- `reset_for_reload()` tears down host UI, **invalidates** the current
  generation (so stale API objects raise), clears all registrations, and
  unloads modules — then a fresh `load` rebuilds everything.
- `bind(session)` attaches a `BoundSession` (the protocol slice of
  `CodingSession` the runtime needs: `cwd`, `model`, `provider_name`,
  `session_id`, `system_prompt`, `is_running`, `messages`, plus
  `queue_steering_message` / `queue_follow_up_message` / `append_custom_entry`).

**Registration (called via `ExtensionAPI`):**

- `register_tool` / `register_command` / `register_message_renderer` /
  `register_prompt_guideline` — all "first registration per name wins";
  duplicates are diagnosed, not fatal.
- `subscribe(event, handler)` validates the event name against the known agent
  and lifecycle event sets, then appends the handler.

**Tool wrapping (`compose_tools` / `_wrap_tool`):**

- `compose_tools(builtin_tools)` merges built-in + extension tools; an extension
  tool with a built-in's name **overrides in place**.
- Each tool is wrapped so that, on every call, `tool_call` hooks run first
  (they can **block** the call or rewrite `arguments`), then the real executor
  runs, then `tool_result` hooks can rewrite `content`/`ok`/`details`. This is
  the "hook seam" around every tool — the central extension power feature.

**Event dispatch:**

- `attach_harness_listener(subscribe)` wires `_on_agent_event` into the harness's
  event stream. `_on_agent_event` fans out to handlers subscribed to the event
  type **and** to the `AGENT_EVENT_WILDCARD` subscribers.
- `run_input_hooks(text, ...)` runs `input` hooks over prompt text; transforms
  chain, and a `handled` result short-circuits submission.
- `emit_session_start` / `emit_session_shutdown` dispatch the lifecycle events.
- Every handler invocation is wrapped in try/except; failures are recorded as
  runtime diagnostics (via `_record_runtime_failure` / `_record_bad_result`)
  rather than crashing the host.

**Rendering integration:**

- `render_custom_message` / `render_tool_call` / `render_tool_result` are
  installed into the frontends. Missing or failing renderers yield `None` so the
  UI falls back to generic formatting. Failures are tracked once per
  type/tool to avoid diagnostic blow-up on every redraw.

**Message delivery (`send_user_message` / `send_custom_message`):**

- If the session is running, the message is queued as a steering or follow-up
  message. If idle and a `turn_requested` callback is installed (the TUI's
  exclusive worker), it triggers a new turn through the same serialized path as
  user input — so extension turns can't race user runs. Otherwise it queues for
  the next run.

**Command execution (`build_command_registry` / `_command_handler`):**

- Merges built-in commands with extension commands into a `CommandRegistry`.
  Each extension command is wrapped so its handler receives an
  `ExtensionCommandContext` (with `.args` and `.api`) and its exceptions are
  captured into a `CommandResult`.

---

## 6. `tau_coding/__init__.py` — public exports

The package's top-level `__init__.py` re-exports a broad, stable surface (and
sets `__version__`) so external code, the CLI, and tests can import from
`tau_coding` directly. The exported names fall into these groups:

- **Session / commands:** `CodingSession`, `CodingSessionConfig`, `CommandRegistry`,
  `CommandResult`, `SlashCommand`, `create_default_command_registry`,
  `ModelChoice`, `SessionTreeBranchResult`, `SessionTreeChoice`,
  `jsonl_session_storage`, `default_session_path`.
- **Sessions on disk:** `CodingSessionRecord`, `SessionManager`,
  `SessionExportError`, `default_session_export_path`, `export_session_html`,
  `render_session_html`.
- **Providers:** `ProviderConfig`, `ProviderConfigError`, `ProviderSelection`,
  `ProviderSettings`, `ScopedModelConfig`, `AnthropicProviderConfig`,
  `OpenAICompatibleProviderConfig`, `OpenAICodexProviderConfig`,
  `BUILTIN_PROVIDER_CATALOG`, `ProviderCatalogEntry`, `builtin_provider_entry`,
  `DEFAULT_MODEL`, `DEFAULT_PROVIDER_NAME`, plus the many `load_*`/`upsert_*`/
  `resolve_*`/`provider_*` helpers from `provider_config` and `provider_catalog`.
- **Credentials / OAuth:** `FileCredentialStore`, `OAuthCredential`,
  `CredentialStoreError`, `credentials_path`, and from `oauth_registry`/
  `oauth_types`: `get_oauth_provider`, `get_oauth_providers`,
  `register_oauth_provider`, `unregister_oauth_provider`, `reset_oauth_providers`,
  `OAuthAuthInfo`, `OAuthDeviceCodeInfo`, `OAuthLoginCallbacks`, `OAuthPrompt`,
  `OAuthProvider`, `OAuthRuntimeAuth`.
- **Context / skills / system prompt:** `Skill`, `build_skill_index`,
  `expand_skill_command`, `format_skill_invocation`, `parse_skill_invocation`,
  `load_skills`, `discover_project_context`,
  `BuildSystemPromptOptions`, `ProjectContextFile`, `build_system_prompt`,
  `collect_prompt_guidelines`, `format_*`, `PromptTemplate`, `render_prompt_template`,
  `load_prompt_templates`.
- **Context window / compaction:** `DEFAULT_COMPACTION_*`,
  `DEFAULT_CONTEXT_WINDOW_TOKENS`, `SUMMARIZATION_SYSTEM_PROMPT`,
  `estimate_*_tokens`, `auto_compaction_threshold_for_context_window`,
  `build_compaction_summary_prompt`, `serialize_messages_for_compaction`,
  `summarize_messages_for_compaction`.
- **Tools / thinking / rendering / resources / shell / paths / version:**
  `ToolDefinition`, `create_bash_tool` (+`_definition`), `create_edit_tool`(+),
  `create_read_tool`(+), `create_write_tool`(+), `create_coding_tools`,
  `DEFAULT_THINKING_LEVEL`, `THINKING_LEVELS`, `ThinkingLevel`,
  `ThinkingParameter`, `ReasoningEffort`, `normalize_thinking_levels`,
  `reasoning_effort_for_level`, `EventRenderer`, `FinalTextRenderer`,
  `JsonEventRenderer`, `TranscriptRenderer`, `PrintOutputMode`,
  `create_event_renderer`, `ResourceDiagnostic`, `ResourceError`,
  `TauResourcePaths`, `TauPaths`, `ShellSettings`, `load_shell_settings`,
  `ShellConfigError`, and `current_version`.

This is the stable "front door" of `tau_coding`; `cli.py` and the TUI import
through it. The `extensions` subpackage is imported separately (its surface is
re-exported from `tau_coding.extensions`).

---

## 7. How 3e fits the whole picture

Putting the entire `tau_coding` layer together (parts 3a–3e):

```
                  cli.py (Typer entry point + subcommands)
                        │
        ┌───────────────┼───────────────────────────────┐
        ▼               ▼                                ▼
 resources        provider_* (catalog/config/runtime)   extensions/*
 (3a)             (3c)                                   (3e)
        │               │                                │
        └───────┬───────┴────────────────┬───────────────┘
                ▼                        ▼
          session.py (3b)          commands.py (3c)
          CodingSession             /login, /new, ...
                │
        ┌───────┴────────┐
        ▼                ▼
   tui/* (3d)      rendering/* (3c)
   TauTuiApp       plain / json
```

- **`credentials` + `oauth*`** are the *authentication backbone*: they let a
  provider id in `providers.json` become a live, refreshable `ModelProvider`
  (`provider_runtime.py`, 3c). Credentials persist to `credentials.json` (never
  `providers.json`); each provider turns a stored `OAuthCredential` into request
  auth via `runtime_auth`.
- **`cli.py`** is the *composition root*: it is the only place that knows about
  all the other pieces, handles the `sessions`/`providers`/`setup`/`export`
  subcommands, and decides which frontend (TUI or print mode) to launch.
- **`extensions/*`** is the *extensibility spine*: discovery (`loader`) →
  registration (`api`) → runtime dispatch and hook seams (`runtime`). It lets
  `tau_coding` stay open for third-party behavior without modifying core code.

With this part complete, **every file in `tau_coding` has been dissected**, and
together with `tau_ai` (parts 1a–1b) and `tau_agent` (parts 2a–2d) we now have a
full bottom-up walkthrough of the entire Tau codebase.

---

*Next: merge parts 1a, 1b, 2a, 2b, 2c, 2d, 3a, 3b, 3c, 3d, 3e into a single
tutorial document.*

<!-- NAV -->
[← tau_coding · CLI 入口]({{< relref "./coding-cli.md" >}})
[↑ 总览]({{< relref "./source-walkthrough.md" >}})
[→ tau_coding · 支撑模块(一)]({{< relref "./coding-support-1.md" >}})
