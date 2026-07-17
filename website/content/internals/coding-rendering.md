---
title: tau_coding · 渲染层
description: rendering/ 包全貌
code_files:
  - tau_coding/rendering/__init__.py
  - tau_coding/rendering/base.py
  - tau_coding/rendering/json.py
  - tau_coding/rendering/plain.py
  - tau_coding/rendering/transcript.py
---

## `tau_coding/rendering/base.py` — 共享的渲染原语

渲染层是 Tau 把 agent 内部事件转化为终端输出的桥梁。每种输出格式——无论是人类可读的终端文字、机器可解析的 JSON、还是用于归档的结构化记录——都遵循同一套接口约定，这让 agent 核心循环完全不必关心"当前输出给谁看"。

Agent 运行过程中会产生大量事件（用户输入、模型回复、工具调用进度、错误信息等）。这些事件最终需要以某种形式呈现给用户或下游程序。**Event renderer**（事件渲染器）就是做这件事的组件：它接收事件，决定如何输出。把"渲染"从 agent 循环中独立出来，好处在于可以随时切换输出格式，而不用改动 agent 的任何逻辑——就像换一个显示器不影响电脑的运行一样。

- **`PrintOutputMode(StrEnum)`** — 非交互式 print 模式的输出模式：
  - `text = "text"` — 流式、人类可读的助手文本 + 工具活动。
  - `json = "json"` — 每个 agent 事件一个 JSON 对象（机器可读）。
  - `transcript = "transcript"` — 用于归档/重放的结构化转录（事件 + 会话框定）。
- **`EventRenderer(Protocol)`** — 每个模式都满足的渲染器接口：
  - `render(self, event: CodingSessionEvent) -> None` — 消费并发送一个事件（`CodingSessionEvent = AgentEvent | SessionOwnEvent`，涵盖可移植 agent 事件和会话层事件）。
  - `finish(self) -> bool` — 收尾并报告本次运行是否*成功*（以便 CLI 选择进程退出码）。

> 设计说明（Design note）：通过把渲染器定义为恰好两个方法的 Protocol，Tau 可以在不触碰 agent 循环或 `CodingSession` 的情况下切换输出格式（text / json / transcript）。循环只是对每个事件调用 `render(event)`；由渲染器决定要打印什么。这与 TUI 所使用的事件消费者边界（3d 部分）相同，只是落在 stdout/stderr 而非 widget 上。该设计直接实现了 Tau README 的两项原则："事件即契约（Events are the contract）"——`AgentEvent` 联合类型是每个前端所依赖的稳定接口——以及"薄层胜过魔法（Small layers beat magic）"——渲染器是一个窄的、单一目的的层，对 harness 内部一无所知。因为 agent 循环从不导入一个具体的渲染器，可移植核心得以摆脱 stdout/JSON 格式化的关注点。

---

## `tau_coding/rendering/transcript.py` — 流式转录渲染器

`TranscriptRenderer` 是 `PrintOutputMode.transcript` 的具体 `EventRenderer`。它把助手文本流式写入 **stdout**，把工具/状态活动写入 **stderr**，从而让模型的原始输出与 Tau 自身的杂项输出干净地分离（你可以把 stdout 管道到文件，同时在 stderr 上仍能观察进度）。

- **构造函数：** `custom_message_renderer: CustomMessageMarkup | None` — 一个可选钩子（来自 `extensions/api.py`），让扩展渲染它们自己的自定义消息；`Console(stderr=True, highlight=False)` 用于状态行；标志位 `_assistant_started` / `_assistant_ended` / `_failed` 追踪流状态。
- **`render(event)`** — 对 `CodingSessionEvent` 继承体系的 `isinstance` 分发：
  - `MessageUpdateEvent` — 检查内嵌的 `assistant_message_event`；若是 `TextDeltaEvent`，设置 `_assistant_started` 并用 `typer.echo(nested.delta, nl=False)` 写到 stdout（无尾随换行，以便 token 拼接）。
  - `ToolExecutionStartEvent` — `_newline()` 然后以青色打印 `format_tool_call_block(call)`（从 `event.tool_call_id`/`event.tool_name`/`event.args` 构造 `ToolCall`；`format_tool_call_block` 是 `tui/state.py` 的辅助函数，因此 print 模式复用了 TUI 的工具调用格式化）。
  - `ToolExecutionUpdateEvent` — `_newline()` 后，若 `event.partial_result.text` 非空，以 `bright_black` 打印 `… <message>`。
  - `AutoRetryStartEvent` — `_newline()` 后以 `bright_black` 打印 `… {event.error_message}`（agent 层重试提示）。
  - `ToolExecutionEndEvent` — 根据 `event.is_error` 选状态符（`✓`/`✗`）与颜色（`green`/`red`），打印工具名；若 `event.result.text` 非空，逐行缩进打印。
  - `MessageEndEvent`（`CustomMessage`）— 渲染扩展自定义消息（`_render_custom_message`）。
  - `MessageEndEvent`（`AssistantMessage`）— 若 `stop_reason == "error"` 则设置 `_failed = True` 并以红色打印错误；然后 `_newline(final=True)` 收尾。
  - `AgentEndEvent` — `_newline(final=True)` 收尾。
- **`_render_custom_message(event)`** — 仅作用于 `isinstance(event.message, CustomMessage)` 且 `event.message.display` 为真的消息；
  向已注册的 `CustomMessageMarkup` 索取 markup 并渲染，若 markup 格式有误则回退到纯文本（一段坏的扩展字符串绝不能让 print 模式崩溃）。
- **`finish() -> bool`** — 返回 `not self._failed`；CLI 用它决定退出码。
- **`_newline(*, final)`** — 换行簿记：若助手文本已被流式输出但尚未结束，则发出一个换行并标记为已结束；在 `final` 且尚无文本开始时，仅标记为已结束，以便后续的工具/错误行从新行开始。

> 设计说明（Design note）：stdout（模型文本）与 stderr（Tau 的工具状态）之间的分离是一个刻意的、对 Unix 友好的选择——`tau … > out.txt` 只捕获助手的文字，而进度仍出现在终端上。复用来自 `tui/state.py` 的 `format_tool_call_block` 意味着 print 模式与 TUI 从同一个真相源展示*完全一致*的工具格式化，因此两个前端在"如何标注一次工具调用"上不会分叉。该渲染器不持有任何 UI 框架依赖（只用 `typer`/`rich`），这使它处于"核心保持可移植"的边界之内，并让相同的格式化原语同时服务于交互式与非交互式路径。

---

## `tau_coding/rendering/json.py` — JSONL 事件渲染器

`JsonEventRenderer` 是 `PrintOutputMode.json` 的渲染器：用于管道/自动化的机器可读路径。

- **`render(event)`** — 把 `event.model_dump_json(by_alias=True, exclude_none=True)` 作为每行一个 JSON 对象（JSONL）发出。在遇到 `MessageEndEvent` 且 `isinstance(event.message, AssistantMessage)` 且 `stop_reason == "error"` 时设置 `_failed = True`（但仍会打印该错误事件，从而流保持完整）。
- **`finish() -> bool`** — `not self._failed`。

> 设计说明（Design note）：因为每个 `AgentEvent` 都是 pydantic 模型，dump 成 JSON 只需一行——JSON 模式免费获得完整的事件保真度，无需自定义序列化。这也让 JSONL 流成为 TUI 所消费的同一个 `AgentEvent` 联合类型的忠实、无损记录，从而下游工具和交互式前端观察到的是相同的事件（"事件即契约"）。该渲染器从不重塑事件，端到端保留了线格式（wire format）。

## `tau_coding/rendering/plain.py` — Pi 风格的最终文本渲染器

`FinalTextRenderer` 是 `PrintOutputMode.text` 的渲染器，匹配 Pi 的行为：它丢弃流式噪声，在运行结束后只打印**最后的助手消息**（或错误）。

- **`render(event)`** — 仅处理 `MessageEndEvent` 且 `isinstance(event.message, AssistantMessage)` 的事件：记录 `event.message.text` 为 `_last_assistant_text`（覆盖式，最后一轮胜出）；若 `stop_reason in {"error", "aborted"}` 则设置 `_failed` 并收集 `error_message`。其他事件一律忽略。
- **`finish() -> bool`** — 若失败，把每条 `Error: <message>` 回显到 **stderr** 并返回 `False`；否则把最后的助手文本回显到 stdout 并返回 `True`。

> 设计说明（Design note）：这是最"安静"的渲染器——没有工具调用，没有进度。它服务于只想要 agent 最终答案（Pi 风格）、把 agent 当作文本生成函数来用的用户（用于管道或捕获）。该渲染器在运行期间缓冲状态，并在 `finish()` 中恰好发出一次写入，满足与流式渲染器相同的 `EventRenderer` 契约，同时丢弃所有中间事件。

## `tau_coding/rendering/__init__.py` — 包边界

把各渲染器绑定在一起并提供工厂：

- 重新导出 `EventRenderer`、`PrintOutputMode`、`TranscriptRenderer`、
  `JsonEventRenderer`、`FinalTextRenderer`。
- **`create_event_renderer(mode, *, custom_message_renderer=None)`** — 唯一的开关：`PrintOutputMode.text` → `FinalTextRenderer()`、
  `PrintOutputMode.json` → `JsonEventRenderer()`，以及其他任何模式
  （`transcript`）→ `TranscriptRenderer(custom_message_renderer=…)`。CLI 调用它按 flag 选择输出路径。

> 设计说明（Design note）：`create_event_renderer` 是唯一硬编码 模式→渲染器 映射的地方。增加第四种输出模式意味着只需修改这一个工厂加一个新的 `EventRenderer`，调用链中其他任何东西都不变。把映射集中在一个工厂之后，保持了"薄层胜过魔法"原则：调用方只依赖 `EventRenderer` Protocol，绝不依赖某个具体渲染器，从而接线面保持最小，agent 循环也始终不知道当前激活的是哪种输出模式。

## 3g 部分如何契合整体

- `rendering/base.py` — `EventRenderer` Protocol + `PrintOutputMode` 枚举，
  让输出格式成为运行时选择，而非代码改动。
- `rendering/transcript.py` — 具体的文本渲染器：把助手 token 流式写入 stdout，工具/状态写入 stderr，并尊重扩展自定义消息。

到 3g 部分为止，本教程已自底向上、逐文件地剖析了 `tau_ai → tau_agent → tau_coding` 中的**每一个**模块，包括此前未被覆盖的模块：provider 目录加载器、分支摘要、诊断、提示模板、重载摘要、会话导出、shell 配置、思考原语、更新检查、版本辅助，以及渲染层。最初缺口审计中唯一在源码里*不存在*的路径是 `extensions/base.py`（扩展系统位于 `extensions/{api,loader,runtime,__init__}.py`，在 3e 部分讲解）。

## 逐方法深度剖析（rendering/*）

> 以下为 `rendering/` 各文件的逐方法展开。

## 文件: rendering/__init__.py

本文件是 `tau_coding.rendering` 包的公开入口,负责把三种 renderer 的实现类与基类、枚举统一导出,并提供一个工厂函数根据打印输出模式创建对应的 renderer 实例。它把 `rendering/` 子目录下各模块的实现细节隐藏起来,只暴露高层 API 给 `cli.run_print_mode` 等调用方。

### create_event_renderer

#### create_event_renderer(mode: PrintOutputMode, *, custom_message_renderer: CustomMessageMarkup | None = None) -> EventRenderer

- 作用:根据传入的 `PrintOutputMode` 枚举值,构造并返回对应输出模式的事件渲染器实例,是 `cli.run_print_mode` 选择渲染后端的唯一入口。
- 关键实现步骤与分支:
  1. 若 `mode is PrintOutputMode.text`,返回 `FinalTextRenderer()`(Pi 风格、仅打印最终纯文本)。
  2. 若 `mode is PrintOutputMode.json`,返回 `JsonEventRenderer()`(逐事件输出 JSONL)。
  3. 其余情况(默认 `transcript`)返回 `TranscriptRenderer(custom_message_renderer=custom_message_renderer)`,并把可选扩展消息渲染器透传进去。
- 数据流:输入是打印模式枚举与可选扩展渲染回调,输出是一个符合 `EventRenderer` 协议的实例;三个分支覆盖了 `PrintOutputMode` 的全部取值,保证返回类型稳定。

```python
def create_event_renderer(
    mode: PrintOutputMode,
    *,
    custom_message_renderer: CustomMessageMarkup | None = None,
) -> EventRenderer:
    if mode is PrintOutputMode.text:
        return FinalTextRenderer()
    if mode is PrintOutputMode.json:
        return JsonEventRenderer()
    return TranscriptRenderer(custom_message_renderer=custom_message_renderer)
```

关键点:工厂把 模式→渲染器 的映射集中在一处,调用方只依赖 `EventRenderer` 协议,不感知具体实现。

### __all__

- 作用:声明包的公开导出符号列表,约束 `from tau_coding.rendering import *` 的行为。
- 导出内容:`EventRenderer`、`FinalTextRenderer`、`JsonEventRenderer`、`PrintOutputMode`、`TranscriptRenderer`、`create_event_renderer`。
- 注意:实际源文件中的导出名与下方各实现模块类名保持一致——`text` 模式对应 `plain.py` 中的 `FinalTextRenderer`,`json` 对应 `json.py` 的 `JsonEventRenderer`,`transcript` 对应 `transcript.py` 的 `TranscriptRenderer`;基础协议 `EventRenderer` 与枚举 `PrintOutputMode` 来自 `base.py`。

---

## 文件: rendering/base.py

本文件定义了所有渲染器共享的抽象契约(`EventRenderer` 协议)与打印输出模式枚举(`PrintOutputMode`),以及约定事件来源(`tau_coding.events.CodingSessionEvent`)。它本身不含任何具体渲染逻辑,只负责确立"消费事件、输出渲染结果、并能判断运行成败"的统一接口,让 `transcript.py`、`json.py`、`plain.py` 三套实现可以互换使用。

### PrintOutputMode

#### PrintOutputMode(StrEnum)

- 作用:枚举非交互式打印模式支持的三种输出形态,字符串枚举(`StrEnum`)使其既可比较又可直接当字符串使用(如命令行参数解析)。
- 取值:
  - `text = "text"`:Pi 风格最终纯文本模式,只回显助手最后一段文本。
  - `json = "json"`:逐事件 JSONL 流式模式。
  - `transcript = "transcript"`:人类可读的流式转写模式(默认)。

```python
class PrintOutputMode(StrEnum):
    text = "text"
    json = "json"
    transcript = "transcript"
```

关键点:`StrEnum` 让枚举值既可比又可直接当字符串用(如命令行参数解析)。

### EventRenderer

#### EventRenderer(Protocol)

- 作用:定义"消费 agent 事件并为其前端/输出模式渲染"的鸭子类型协议。任何实现了 `render` 与 `finish` 两个方法的对象都被视为合规渲染器,`create_event_renderer` 的返回类型标注即指向它。
- 接口约束(Protocol 成员,均为签名占位,无实现体):
  - `def render(self, event: CodingSessionEvent) -> None`:渲染单个事件。`CodingSessionEvent = AgentEvent | SessionOwnEvent`,涵盖可移植 agent 事件与会话层事件(如 `CompactionStartEvent`、`AutoRetryStartEvent` 等)。
  - `def finish(self) -> bool`:结束渲染,并返回本次运行是否成功(`True` 表示成功)。
- 实现说明:由于是 `Protocol`,它仅作结构子类型检查用途,不提供共享原语。三种具体 renderer(`TranscriptRenderer`、`JsonEventRenderer`、`FinalTextRenderer`)各自独立实现了 `render`/`finish`,在失败语义上统一通过 `MessageEndEvent` 中 `AssistantMessage.stop_reason` 判断(而非独立的 `ErrorEvent` 类型)。

```python
class EventRenderer(Protocol):
    def render(self, event: CodingSessionEvent) -> None:
        """Render one event."""

    def finish(self) -> bool:
        """Finish rendering and return whether the run succeeded."""
```

关键点:`Protocol` 只规定两个方法签名,任何实现了 `render`/`finish` 的对象都算合规渲染器,便于在不改动 harness 的情况下切换输出格式。

---

## 文件: rendering/transcript.py

本文件实现人类可读的流式转写渲染器 `TranscriptRenderer`。它在 print 模式下把助手文本增量地写到 stdout,把工具调用、工具更新、重试、错误等"侧信道"信息以带颜色的 Rich `Text` 写到 stderr,从而实现"主对话流与工具活动流分离"的可读布局。它是 `EventRenderer` 协议在 `transcript` 模式下的具体实现,与 TUI 中的 `TranscriptView` widget 职责不同:本类服务于非交互 print 模式,`TranscriptView` 服务于交互式 Textual 界面。

### TranscriptRenderer

#### __init__(self, *, custom_message_renderer: CustomMessageMarkup | None = None) -> None

- 作用:初始化流式转写渲染器,建立 stdout 增量输出与 stderr 富文本输出的基础设施,并缓存可选的扩展消息渲染器。
- 关键实现步骤:
  1. `self._assistant_started = False`:标记助手消息是否已经出现增量(用于控制换行)。
  2. `self._assistant_ended = False`:标记助手消息段是否已结束(避免重复换行)。
  3. `self._failed = False`:运行失败标志,`finish()` 据此返回。
  4. `self._console = Console(stderr=True, highlight=False)`:专用 stderr 控制台,关闭 Rich 自动语法高亮,用于打印工具/错误/自定义块。
  5. `self._custom_message_renderer = custom_message_renderer`:保存扩展 `CustomMessageMarkup` 回调,供自定义用户消息渲染。

```python
def __init__(self, *, custom_message_renderer: CustomMessageMarkup | None = None) -> None:
    self._assistant_started = False
    self._assistant_ended = False
    self._failed = False
    self._console = Console(stderr=True, highlight=False)
    self._custom_message_renderer = custom_message_renderer
```

关键点:`Console(stderr=True, highlight=False)` 是专用 stderr 控制台,关闭 Rich 自动高亮,用于工具/错误/自定义块的输出。

#### render(self, event: CodingSessionEvent) -> None

- 作用:事件分派中枢,按事件类型 `isinstance` 逐类处理一个 `CodingSessionEvent`,实现流式增量渲染。
- 关键实现步骤与分支(按接收顺序):
  1. `MessageUpdateEvent`:检查内嵌的 `event.assistant_message_event`;若是 `TextDeltaEvent`,置 `_assistant_started = True`,用 `typer.echo(nested.delta, nl=False)` 把增量文本无换行地追加到 stdout(实时流式输出助手回答)。
  2. `ToolExecutionStartEvent`:先 `_newline()` 确保助手段收尾,再从 `event.tool_call_id`/`event.tool_name`/`event.args` 构造 `ToolCall`,用 `self._console.print(Text(format_tool_call_block(call), style="cyan"))` 以青色把工具调用块打印到 stderr。
  3. `ToolExecutionUpdateEvent`:确保换行后,若 `event.partial_result.text` 非空,以暗灰色 `bright_black` 打印 `… {text}` 进度提示到 stderr。
  4. `AutoRetryStartEvent`:确保换行后以 `bright_black` 打印 `… {event.error_message}`(重试提示)。
  5. `ToolExecutionEndEvent`:根据 `event.is_error` 选状态符(`✓` 成功 / `✗` 失败)与颜色(`green`/`red`),打印工具名;若 `event.result.text` 非空,逐行缩进打印工具返回内容。
  6. `MessageEndEvent` + `CustomMessage`:调用 `_render_custom_message(event)` 渲染可能的扩展自定义消息块。
  7. `MessageEndEvent` + `AssistantMessage`:若 `event.message.stop_reason == "error"` 则置 `_failed = True`,确保换行后以红色打印 `Error: {event.message.error_message or 'Error'}` 到 stderr;然后 `_newline(final=True)` 收尾助手段。
  8. `AgentEndEvent`:仅做 `_newline(final=True)` 收尾,无额外输出。
- 数据流:文本增量→stdout;所有工具/错误/提示→stderr(带样式);失败态通过 `_failed` 累积,最终由 `finish()` 报告。

```python
def render(self, event: CodingSessionEvent) -> None:
    if isinstance(event, MessageUpdateEvent):
        nested = event.assistant_message_event
        if isinstance(nested, TextDeltaEvent):
            self._assistant_started = True
            typer.echo(nested.delta, nl=False)
        return
    if isinstance(event, ToolExecutionStartEvent):
        self._newline()
        call = ToolCall(id=event.tool_call_id, name=event.tool_name, arguments=event.args)
        self._console.print(Text(format_tool_call_block(call), style="cyan"))
        return
    if isinstance(event, ToolExecutionUpdateEvent):
        self._newline()
        if event.partial_result.text:
            self._console.print(Text(f"… {event.partial_result.text}", style="bright_black"))
        return
    if isinstance(event, AutoRetryStartEvent):
        self._newline()
        self._console.print(Text(f"… {event.error_message}", style="bright_black"))
        return
    if isinstance(event, ToolExecutionEndEvent):
        status = "✗" if event.is_error else "✓"
        style = "red" if event.is_error else "green"
        self._console.print(Text(f"{status} {event.tool_name}", style=style))
        if event.result.text:
            for line in event.result.text.splitlines():
                self._console.print(Text(f"  {line}"))
        return
    if isinstance(event, MessageEndEvent) and isinstance(event.message, CustomMessage):
        if self._custom_message_renderer is None or not event.message.display:
            return
        rendered = self._custom_message_renderer(
            event.message.custom_type,
            event.message.text,
            event.message.details if isinstance(event.message.details, dict) else None,
            False,
        )
        if rendered:
            self._newline()
            self._console.print(rendered)
        return
    if isinstance(event, MessageEndEvent) and isinstance(event.message, AssistantMessage):
        if event.message.stop_reason == "error":
            self._failed = True
            self._newline()
            self._console.print(
                Text(f"Error: {event.message.error_message or 'Error'}", style="red")
            )
        self._newline(final=True)
        return
    if isinstance(event, AgentEndEvent):
        self._newline(final=True)
```

关键点:以 `isinstance` 对事件继承体系做分派,文本增量走 stdout(`nl=False` 拼接),工具/错误/提示等侧信道走带样式的 stderr。注意没有独立的 `ErrorEvent` 类型——错误通过 `AssistantMessage.stop_reason == "error"` 在 `MessageEndEvent` 中检测。

#### _render_custom_message(self, event: MessageEndEvent) -> None

- 作用:在消息结束时,针对扩展自定义消息(`CustomMessage`)调用注册的渲染器生成 markup,并安全落屏;若无可渲染内容则跳过。
- 关键实现步骤与分支:
  1. 取 `event.message`;若不是 `CustomMessage` 实例或 `event.message.display` 为假,直接 `return`。
  2. `markup = None` 初始化;若 `self._custom_message_renderer` 非空,调用它 `(message.custom_type, message.text, message.details if isinstance(message.details, dict) else None, False)` 得到 markup 字符串。
  3. `_newline()` 确保助手段已收尾。
  4. 若 `markup` 非空:尝试 `self._console.print(rendered)` 渲染;用 `try/except` 兜底——若 markup 格式非法则退化为原样输出,保证 print 模式绝因渲染错误崩溃。

```python
if isinstance(event, MessageEndEvent) and isinstance(event.message, CustomMessage):
    if self._custom_message_renderer is None or not event.message.display:
        return
    rendered = self._custom_message_renderer(
        event.message.custom_type,
        event.message.text,
        event.message.details if isinstance(event.message.details, dict) else None,
        False,
    )
    if rendered:
        self._newline()
        self._console.print(rendered)
```

关键点:只处理 `CustomMessage` 实例且 `display=True` 的消息;渲染失败不会让 print 模式崩溃。

#### finish(self) -> bool

- 作用:结束渲染并报告运行成败。
- 实现:`return not self._failed`,与 `EventRenderer.finish` 契约一致。

```python
def finish(self) -> bool:
    return not self._failed
```

关键点:`finish()` 统一返回 `not self._failed`,CLI 据此选择进程退出码。

#### _newline(self, *, final: bool = False) -> None

- 作用:在需要输出"非助手文本"内容(工具/错误/自定义块)或最终收尾前,保证助手增量段已正确换行,避免把工具信息追加到半截助手句子后面。
- 关键实现步骤与分支:
  1. 若 `_assistant_started and not _assistant_ended`:`typer.echo()` 输出一个换行,并把 `_assistant_ended = True`(标记助手段结束)。
  2. 否则 `elif final and not _assistant_started`:仅把 `_assistant_ended = True`(处理"全程无助手输出却需要收尾"的边界,如直接出错)。
  3. 其余情况(已结束或无需收尾)不动作。

```python
def _newline(self, *, final: bool = False) -> None:
    if self._assistant_started and not self._assistant_ended:
        typer.echo()
        self._assistant_ended = True
    elif final and not self._assistant_started:
        self._assistant_ended = True
```

关键点:换行簿记确保工具/错误行不会追加到半截助手句子之后,同时处理"全程无助手输出却需收尾"的边界。

---

## 文件: rendering/json.py

本文件实现 `JsonEventRenderer`,把 agent 产生的每一个事件原样序列化为 JSON 并逐行(`JSONL`)输出到 stdout。它是最"透传"的渲染器:不做任何美化,只依赖 Pydantic 模型自带的 `model_dump_json()`,主要用于机器消费、管道处理与测试断言。同样遵循 `EventRenderer` 协议的 `render`/`finish` 形状。

### JsonEventRenderer

#### __init__(self) -> None

- 作用:初始化 JSON 事件流渲染器。
- 实现:`self._failed = False`,仅维护一个运行失败标志。

```python
def __init__(self) -> None:
    self._failed = False
```

关键点:JSON 渲染器无缓冲,仅用一个布尔标志追踪运行成败。

#### render(self, event: CodingSessionEvent) -> None

- 作用:把单个事件写成一行 JSON 并立即输出。
- 关键实现步骤与分支:
  1. 若 `isinstance(event, MessageEndEvent) and isinstance(event.message, AssistantMessage) and event.message.stop_reason == "error"`:置 `self._failed = True`(错误标记运行失败)。
  2. `typer.echo(event.model_dump_json(by_alias=True, exclude_none=True))`:直接调用 Pydantic 的 `model_dump_json()` 序列化整个事件对象并输出一行,不区分事件类型(所有类型一视同仁)。

```python
def render(self, event: CodingSessionEvent) -> None:
    if (
        isinstance(event, MessageEndEvent)
        and isinstance(event.message, AssistantMessage)
        and event.message.stop_reason == "error"
    ):
        self._failed = True
    typer.echo(event.model_dump_json(by_alias=True, exclude_none=True))
```

关键点:所有事件一律 `model_dump_json(by_alias=True, exclude_none=True)` 原样输出,JSONL 因此获得完整事件保真度。注意错误检测通过 `AssistantMessage.stop_reason` 而非独立的 `ErrorEvent`。

#### finish(self) -> bool

- 作用:结束渲染并报告运行成败。
- 实现:`return not self._failed`,与协议一致。

```python
def finish(self) -> bool:
    return not self._failed
```

关键点:与 `TranscriptRenderer` 等实现一致,统一以 `not self._failed` 报告成败,使调用方无需关心模式。

- Schema 约定说明:本渲染器不自定义 schema,完全依赖 `tau_agent` 中各 `AgentEvent` 子类的 Pydantic 字段定义;`model_dump_json()` 输出的字段名、嵌套结构与事件模型一致,因此"JSONL 的每一行都是一个完整事件对象,其 `type`/字段由对应事件模型决定"。

---

## 文件: rendering/plain.py

本文件实现 `FinalTextRenderer`,即 Pi 风格的"最终纯文本"渲染器。它在运行过程中只默默记录必要信息(最后一次助手完整文本、错误信息),直到 `finish()` 才把结果一次性打印:成功时仅输出助手最终回复,失败时只输出错误。这种模式适合把 agent 当作"文本生成函数"来用(如管道取最终结果),不产生任何中间渲染。同样实现 `EventRenderer` 协议。

### FinalTextRenderer

#### __init__(self) -> None

- 作用:初始化 Pi 风格最终文本渲染器,准备缓冲字段。
- 实现:
  1. `self._last_assistant_text = ""`:保存最后一次助手完整文本。
  2. `self._failed = False`:运行失败标志。
  3. `self._error_messages: list[str] = []`:累积所有错误信息(便于失败时逐条输出)。

```python
def __init__(self) -> None:
    self._last_assistant_text = ""
    self._failed = False
    self._error_messages: list[str] = []
```

关键点:只准备三个缓冲字段——最终文本、失败标志、错误列表,运行期间不写任何终端输出。

#### render(self, event: CodingSessionEvent) -> None

- 作用:在运行过程中静默记录用于最终输出的关键信息,不向终端写任何内容。
- 关键实现步骤与分支:
  1. 若 `isinstance(event, MessageEndEvent) and isinstance(event.message, AssistantMessage)`:把 `self._last_assistant_text = event.message.text` 更新为当前助手完整文本(覆盖式,只保留最后一次);若 `event.message.stop_reason in {"error", "aborted"}` 则设置 `_failed`(仅当 `stop_reason == "error"` 时),并把 `event.message.error_message` 追加进 `_error_messages`。
  2. 其他事件类型(工具事件、增量事件、用户消息等)一律忽略——本渲染器不关心过程,只看最终文本与错误。

```python
def render(self, event: CodingSessionEvent) -> None:
    if not isinstance(event, MessageEndEvent) or not isinstance(
        event.message, AssistantMessage
    ):
        return
    self._last_assistant_text = event.message.text
    if event.message.stop_reason in {"error", "aborted"}:
        self._failed = event.message.stop_reason == "error"
        if event.message.error_message:
            self._error_messages.append(event.message.error_message)
```

关键点:需要同时检查 `MessageEndEvent` 和 `AssistantMessage`(过滤掉用户消息和工具结果);`.text`(而非 `.content`)获取助手文本;错误通过 `stop_reason` 检测而非独立的 `ErrorEvent`。

#### finish(self) -> bool

- 作用:在运行结束时打印最终结果并返回成败,是实际产生终端输出的唯一方法。
- 关键实现步骤与分支:
  1. 若 `self._failed`:遍历 `_error_messages`,用 `typer.echo(f"Error: {message}", err=True)` 把每条错误输出到 stderr,然后 `return False`。
  2. 否则若 `self._last_assistant_text` 非空:`typer.echo(self._last_assistant_text)` 把最终助手文本打印到 stdout,`return True`。
  3. 若既未失败也无最终文本(如空运行):不打印任何内容,`return True`。

```python
def finish(self) -> bool:
    if self._failed:
        for message in self._error_messages:
            typer.echo(f"Error: {message}", err=True)
        return False
    if self._last_assistant_text:
        typer.echo(self._last_assistant_text)
    return True
```

关键点:`finish()` 是实际产生终端输出的唯一方法——失败时把错误逐条写到 stderr,否则只把最终助手文本打印到 stdout。

---

## 三种渲染器如何统一于 EventRenderer 接口

- 统一契约:`base.EventRenderer` 是 `Protocol`,仅规定 `render(event)` 与 `finish() -> bool` 两个方法签名。三个实现类 `TranscriptRenderer`、`JsonEventRenderer`、`FinalTextRenderer` 都提供了这两个方法,因此 `create_event_renderer` 可以统一以 `EventRenderer` 类型返回,供 `cli.run_print_mode` 以相同方式调用(循环 `render(each_event)` 后 `finish()`)。
- 选择机制:`cli.run_print_mode` 通过 `PrintOutputMode` 枚举决定模式,调用 `create_event_renderer(mode, ...)` 取得具体实例;`text`→`FinalTextRenderer`、`json`→`JsonEventRenderer`、`transcript`(默认)→`TranscriptRenderer`。
- 失败语义一致性:三者都以 `self._failed` 累积错误,但错误检测方式不同:`TranscriptRenderer` 和 `JsonEventRenderer` 通过 `AssistantMessage.stop_reason == "error"` 检测,`FinalTextRenderer` 通过 `stop_reason in {"error", "aborted"}` 检测。`finish()` 统一返回 `not self._failed`,使调用方无需关心模式即可判断成败。
- 输出差异:
  - `TranscriptRenderer`:stdout 流式增量助手文本 + stderr 带颜色工具/错误/提示,实时可读。
  - `JsonEventRenderer`:stdout 逐行 `model_dump_json()`(JSONL),机器友好。
  - `FinalTextRenderer`:过程静默,`finish()` 时一次性输出最终文本或错误。

## TranscriptRenderer 与 TUI TranscriptView 的职责边界

- 边界原则(源自 AGENTS.md 的架构约束):agent harness 只负责"发出事件",UI 层只负责"消费事件";Textual 不得成为可复用 agent 核心的依赖。
- `TranscriptRenderer`(本 `rendering/` 包):服务于**非交互 print 模式**,通过 `typer.echo` 与 Rich `Console(stderr=True)` 把事件直接写进终端流,无状态控件、无交互。
- `TranscriptView`(TUI widget,位于 `tau_coding.tui` 中,本包不直接实现):服务于**交互式 Textual 界面**,作为 widget 把同一类 `AgentEvent` 增量地渲染进可滚动的 UI 组件,支持光标、布局、重绘等交互能力。
- 二者共享的事件语义来自 `tau_agent.AgentEvent` 及其子类;`transcript.py` 中工具块格式化复用了 `tau_coding.tui.state.format_tool_call_block`,体现"TUI 与 print 渲染共用底层格式化原语,但渲染落点不同(stdout/stderr vs widget)"的设计。

---

<!-- NAV -->
[← tau_coding · TUI 界面与控件]({{< relref "./coding-tui-app.md" >}})
[↑ 总览]({{< relref "./source-walkthrough.md" >}})
[→ tau_coding · 渲染层(print/json)]({{< relref "./coding-rendering-print.md" >}})
