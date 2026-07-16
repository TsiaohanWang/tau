---
title: tau_coding · 渲染层
description: rendering/ 包全貌
---

## `tau_coding/rendering/base.py` — shared rendering primitives

The contract shared by every non-interactive output renderer. It is tiny on
purpose: print mode, JSON mode, and transcript mode all implement the same two
methods.

- **`PrintOutputMode(StrEnum)`** — the output modes for non-interactive print
  mode:
  - `text = "text"` — streamed human-readable assistant text + tool activity.
  - `json = "json"` — one JSON object per agent event (machine-readable).
  - `transcript = "transcript"` — a structured transcript (events + session
    framing) for archival/replay.
- **`EventRenderer(Protocol)`** — the renderer interface every mode satisfies:
  - `render(self, event: AgentEvent) -> None` — consume and emit one event.
  - `finish(self) -> bool` — finalize and report whether the run *succeeded*
    (so the CLI can choose the process exit code).

> Design note: by defining the renderer as a Protocol with exactly two methods,
> Tau can swap output formats (text / json / transcript) without touching the
> agent loop or `CodingSession`. The loop just calls `render(event)` for each
> event; the renderer decides what to print. This is the same event-consumer
> boundary the TUI uses (Part 3d), just on stdout/stderr instead of widgets.

---

## `tau_coding/rendering/transcript.py` — streaming transcript renderer

`TranscriptRenderer` is the concrete `EventRenderer` for `PrintOutputMode.text`.
It streams assistant text to **stdout** and tool/status activity to **stderr**,
so the model's raw output stays cleanly separable from Tau's own chatter (you can
pipe stdout to a file and still watch progress on stderr).

- **Constructor:** `custom_message_renderer: CustomMessageMarkup | None` — an
  optional hook (from `extensions/api.py`) letting extensions render their own
  custom messages; `Console(stderr=True, highlight=False)` for status lines;
  flags `_assistant_started` / `_assistant_ended` / `_failed` track stream state.
- **`render(event)`** — an `isinstance` dispatch over the `AgentEvent` hierarchy:
  - `MessageStartEvent` — reset the per-message started/ended flags (a fresh
    assistant turn).
  - `MessageDeltaEvent` — set `_assistant_started` and `typer.echo(event.delta,
    nl=False)` to stdout (no trailing newline, so tokens concatenate).
  - `ToolExecutionStartEvent` — `_ensure_assistant_newline()` then print the
    cyan `format_tool_call_block(event.tool_call)` (a `tui/state.py` helper, so
    print mode reuses the TUI's tool-call formatting).
  - `ToolExecutionUpdateEvent` — print `… <message>` in `bright_black` (status
    like "editing file").
  - `RetryEvent` — same `… <message>` dim style (agent-layer retries, e.g. after
    a recoverable provider error).
  - `ToolExecutionEndEvent` — print `✓`/`✗` in green/red plus the tool name; if
    the result has content, `_print_tool_content` indents each line in white.
  - `ErrorEvent` — if `not recoverable`, set `_failed = True`; print
    `Error: <message>` in red.
  - `MessageEndEvent` — render any extension custom message
    (`_render_custom_message`), then ensure a final newline.
  - `AgentEndEvent` — ensure a final newline.
- **`_render_custom_message(event)`** — only acts on `role == "user"` messages
  with a `custom_type`; asks the registered `CustomMessageMarkup` for markup and
  renders it via `Text.from_markup`, falling back to plain `Text(markup)` if the
  markup is malformed (a bad extension string must never crash print mode).
- **`finish() -> bool`** — returns `not self._failed`; the CLI uses this for the
  exit code.
- **`_ensure_assistant_newline(*, final)`** — the newline bookkeeping: if
  assistant text was streamed but not yet terminated, emit one newline and mark
  ended; on `final` with no text started, just mark ended so subsequent
  tool/error lines begin on a fresh line. This keeps stdout/stderr interleaving
  visually correct.
- **`_print_tool_line` / `_print_tool_content`** — low-level styled printers for
  tool status rows.

> Design note: the split between stdout (model text) and stderr (Tau's tool
> status) is a deliberate Unix-friendly choice — `tau … > out.txt` captures only
> the assistant's words, while progress still appears on the terminal. Reusing
> `format_tool_call_block` from `tui/state.py` means print mode and the TUI show
> *identical* tool formatting from a single source of truth.

---

## `tau_coding/rendering/json.py` — JSONL event renderer

`JsonEventRenderer` is the `PrintOutputMode.json` renderer: the machine-readable
path for piping/automation.

- **`render(event)`** — emits `event.model_dump_json()` as one JSON object per
  line (JSONL). On a non-recoverable `ErrorEvent` it sets `_failed = True` (but
  still prints the error event, so the stream stays complete).
- **`finish() -> bool`** — `not self._failed`.

> Design note: because every `AgentEvent` is a pydantic model, dumping to JSON is
> a one-liner — JSON mode gets full event fidelity for free, with no custom
> serialization.

## `tau_coding/rendering/plain.py` — Pi-style final-text renderer

`FinalTextRenderer` is the `PrintOutputMode.text` renderer, matching Pi's
behavior: it discards streaming noise and prints **only the final assistant
message** (or errors) once the run ends.

- **`render(event)`** — records `_last_assistant_text` from each
  `MessageEndEvent` (so the *last* turn wins), and appends non-recoverable error
  messages to `_error_messages` while setting `_failed`.
- **`finish() -> bool`** — if failed, echoes each `Error: <message>` to **stderr**
  and returns `False`; otherwise echoes the last assistant text to stdout and
  returns `True`.

> Design note: this is the most "silent" renderer — no tool calls, no progress.
> It exists for users who want just the agent's answer, Pi-style.

## `tau_coding/rendering/__init__.py` — package boundary

Ties the renderers together and provides the factory:

- Re-exports `EventRenderer`, `PrintOutputMode`, `TranscriptRenderer`,
  `JsonEventRenderer`, `FinalTextRenderer`.
- **`create_event_renderer(mode, *, custom_message_renderer=None)`** — the single
  switch: `PrintOutputMode.text` → `FinalTextRenderer()`,
  `PrintOutputMode.json` → `JsonEventRenderer()`, and any other mode
  (`transcript`) → `TranscriptRenderer(custom_message_renderer=…)`. The CLI calls
  this to pick the output path by flag.

> Design note: `create_event_renderer` is the only place that hard-codes the
> mode→renderer mapping. Adding a fourth output mode means editing this one
> factory plus one new `EventRenderer`, and nothing else in the call chain
> changes.

## How 3g fits the picture

- `rendering/base.py` — the `EventRenderer` Protocol + `PrintOutputMode` enum
  that let output format be a runtime choice, not a code change.
- `rendering/transcript.py` — the concrete text renderer: streams assistant
  tokens to stdout, tool/status to stderr, and honors extension custom messages.

With Part 3g the tutorial has now dissected **every** module across
`tau_ai → tau_agent → tau_coding`, bottom-up and file-by-file, including the
modules that were previously uncovered: the provider catalog loader, branch
summaries, diagnostics, prompt templates, reload summary, session export, shell
config, thinking primitives, the update check, the version helper, and the
rendering layer. The only path from the original gap audit that does *not* exist
in the source is `extensions/base.py` (the extension system lives in
`extensions/{api,loader,runtime,__init__}.py`, covered in Part 3e).

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

### __all__

- 作用:声明包的公开导出符号列表,约束 `from tau_coding.rendering import *` 的行为。
- 导出内容:`EventRenderer`、`FinalTextRenderer`、`JsonEventRenderer`、`PrintOutputMode`、`TranscriptRenderer`、`create_event_renderer`。
- 注意:实际源文件中的导出名与下方各实现模块类名保持一致——`text` 模式对应 `plain.py` 中的 `FinalTextRenderer`,`json` 对应 `json.py` 的 `JsonEventRenderer`,`transcript` 对应 `transcript.py` 的 `TranscriptRenderer`;基础协议 `EventRenderer` 与枚举 `PrintOutputMode` 来自 `base.py`。

---

## 文件: rendering/base.py

本文件定义了所有渲染器共享的抽象契约(`EventRenderer` 协议)与打印输出模式枚举(`PrintOutputMode`),以及约定事件来源(`tau_agent.AgentEvent`)。它本身不含任何具体渲染逻辑与共享原语方法(如 `_render_role`/`_format_tool_call`/颜色常量等在原实现中并不存在),只负责确立"消费事件、输出渲染结果、并能判断运行成败"的统一接口,让 `transcript.py`、`json.py`、`plain.py` 三套实现可以互换使用。

### PrintOutputMode

#### PrintOutputMode(StrEnum)

- 作用:枚举非交互式打印模式支持的三种输出形态,字符串枚举(`StrEnum`)使其既可比较又可直接当字符串使用(如命令行参数解析)。
- 取值:
  - `text = "text"`:Pi 风格最终纯文本模式,只回显助手最后一段文本。
  - `json = "json"`:逐事件 JSONL 流式模式。
  - `transcript = "transcript"`:人类可读的流式转写模式(默认)。

### EventRenderer

#### EventRenderer(Protocol)

- 作用:定义"消费 agent 事件并为其前端/输出模式渲染"的鸭子类型协议。任何实现了 `render` 与 `finish` 两个方法的对象都被视为合规渲染器,`create_event_renderer` 的返回类型标注即指向它。
- 接口约束(Protocol 成员,均为签名占位,无实现体):
  - `def render(self, event: AgentEvent) -> None`:渲染单个事件。
  - `def finish(self) -> bool`:结束渲染,并返回本次运行是否成功(`True` 表示成功)。
- 实现说明:由于是 `Protocol`,它仅作结构子类型检查用途,不提供共享原语。三种具体 renderer(`TranscriptRenderer`、`JsonEventRenderer`、`FinalTextRenderer`)各自独立实现了 `render`/`finish`,在运行成败判断上统一采用 `self._failed` 布尔标志(由各实现自行维护),在失败语义上约定:`ErrorEvent.recoverable == False` 即视为失败。

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

#### render(self, event: AgentEvent) -> None

- 作用:事件分派中枢,按事件类型 `isinstance` 逐类处理一个 `AgentEvent`,实现流式增量渲染。
- 关键实现步骤与分支(按接收顺序):
  1. `MessageStartEvent`:重置 `_assistant_started = False`、`_assistant_ended = False`,不输出任何内容(仅准备新一段助手消息)。
  2. `MessageDeltaEvent`:置 `_assistant_started = True`,用 `typer.echo(event.delta, nl=False)` 把增量文本无换行地追加到 stdout(实时流式输出助手回答)。
  3. `ToolExecutionStartEvent`:先 `_ensure_assistant_newline()` 确保助手段收尾,再用 `self._console.print(Text(format_tool_call_block(event.tool_call), style="cyan"))` 以青色把工具调用块打印到 stderr。
  4. `ToolExecutionUpdateEvent`:确保换行后,以暗灰色 `bright_black` 打印 `… {event.message}` 进度提示到 stderr。
  5. `RetryEvent`:同上,确保换行后以 `bright_black` 打印 `… {event.message}`(重试提示)。
  6. `ToolExecutionEndEvent`:根据 `event.result.ok` 选状态符(`✓` 成功 / `✗` 失败)与颜色(`green`/`red`),调用 `_print_tool_line` 打印结果行;若 `event.result.content` 非空,再调用 `_print_tool_content` 打印工具返回内容。
  7. `ErrorEvent`:若 `not event.recoverable` 则置 `_failed = True`;确保换行后,以红色打印 `Error: {event.message}` 到 stderr。
  8. `MessageEndEvent`:调用 `_render_custom_message(event)` 渲染可能的扩展用户消息块,再 `_ensure_assistant_newline(final=True)` 收尾助手段。
  9. `AgentEndEvent`:仅做 `_ensure_assistant_newline(final=True)` 收尾,无额外输出。
- 数据流:文本增量→stdout;所有工具/错误/提示→stderr(带样式);失败态通过 `_failed` 累积,最终由 `finish()` 报告。

#### _render_custom_message(self, event: MessageEndEvent) -> None

- 作用:在消息结束时,针对扩展自定义消息(如用户侧注入的 markup)调用注册的渲染器生成 Rich markup,并安全落屏;若无可渲染内容则回退为纯文本。
- 关键实现步骤与分支:
  1. 取 `event.message`;若 `message.role != "user"` 或 `message.custom_type is None`,直接 `return`(只处理带自定义类型的用户消息)。
  2. `markup = None` 初始化;若 `self._custom_message_renderer` 非空,调用它 `(message.custom_type, message.content, message.details, False)` 得到 markup 字符串。
  3. `_ensure_assistant_newline()` 确保助手段已收尾。
  4. 若 `markup is None`:`self._console.print(Text(message.content))` 直接打印纯文本内容。
  5. 否则尝试 `Text.from_markup(markup)`;用 `try/except Exception` 兜底——若 markup 格式非法则退化为 `Text(markup)` 原样输出,保证 print 模式绝因渲染错误崩溃(注释 noqa BLE001)。

#### finish(self) -> bool

- 作用:结束渲染并报告运行成败。
- 实现:`return not self._failed`,与 `EventRenderer.finish` 契约一致。

#### _ensure_assistant_newline(self, *, final: bool = False) -> None

- 作用:在需要输出"非助手文本"内容(工具/错误/自定义块)或最终收尾前,保证助手增量段已正确换行,避免把工具信息追加到半截助手句子后面。
- 关键实现步骤与分支:
  1. 若 `_assistant_started and not _assistant_ended`:`typer.echo()` 输出一个换行,并把 `_assistant_ended = True`(标记助手段结束)。
  2. 否则 `elif final and not _assistant_started`:仅把 `_assistant_ended = True`(处理"全程无助手输出却需要收尾"的边界,如直接出错)。
  3. 其余情况(已结束或无需收尾)不动作。

#### _print_tool_line(self, marker: str, name: str, detail: str | None = None, *, style: str) -> None

- 作用:构建并打印一行带状态标记的工具结果行(如 `✓ tool_name detail`),颜色由 `style` 参数决定。
- 关键实现步骤:
  1. 新建空 `Text()`。
  2. `line.append(marker, style=style)`:状态符(✓/✗)。
  3. `line.append(f" {name}", style=style)`:工具名。
  4. 若 `detail` 非空:`line.append(f" {detail}", style="bright_black")` 以暗灰附加细节。
  5. `self._console.print(line)` 落到 stderr。

#### _print_tool_content(self, content: str) -> None

- 作用:把工具返回的多行内容逐行缩进打印,便于阅读。
- 关键实现步骤:
  1. `content.splitlines() or [""]`:按行切分;若结果为空则退化为单行空串,保证至少打印一次。
  2. 对每行 `self._console.print(Text(f"  {line}", style="white"))`:以白色、两空格缩进输出到 stderr。

---

## 文件: rendering/json.py

本文件实现 `JsonEventRenderer`,把 agent 产生的每一个事件原样序列化为 JSON 并逐行(`JSONL`)输出到 stdout。它是最"透传"的渲染器:不做任何美化,只依赖 Pydantic 模型自带的 `model_dump_json()`,主要用于机器消费、管道处理与测试断言。同样遵循 `EventRenderer` 协议的 `render`/`finish` 形状。

### JsonEventRenderer

#### __init__(self) -> None

- 作用:初始化 JSON 事件流渲染器。
- 实现:`self._failed = False`,仅维护一个运行失败标志。

#### render(self, event: AgentEvent) -> None

- 作用:把单个事件写成一行 JSON 并立即输出。
- 关键实现步骤与分支:
  1. 若 `isinstance(event, ErrorEvent) and not event.recoverable`:置 `self._failed = True`(不可恢复错误标记运行失败)。
  2. `typer.echo(event.model_dump_json())`:直接调用 Pydantic 的 `model_dump_json()` 序列化整个事件对象并输出一行,不区分事件类型(所有类型一视同仁)。

#### finish(self) -> bool

- 作用:结束渲染并报告运行成败。
- 实现:`return not self._failed`,与协议一致。

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

#### render(self, event: AgentEvent) -> None

- 作用:在运行过程中静默记录用于最终输出的关键信息,不向终端写任何内容。
- 关键实现步骤与分支:
  1. 若 `isinstance(event, MessageEndEvent)`:把 `self._last_assistant_text = event.message.content` 更新为当前助手完整文本(覆盖式,只保留最后一次)。
  2. 若 `isinstance(event, ErrorEvent)`:若 `not event.recoverable` 则 `_failed = True`;并把 `event.message` 追加进 `_error_messages`。
  3. 其他事件类型(工具事件、增量事件等)一律忽略——本渲染器不关心过程,只看最终文本与错误。

#### finish(self) -> bool

- 作用:在运行结束时打印最终结果并返回成败,是实际产生终端输出的唯一方法。
- 关键实现步骤与分支:
  1. 若 `self._failed`:遍历 `_error_messages`,用 `typer.echo(f"Error: {message}", err=True)` 把每条错误输出到 stderr,然后 `return False`。
  2. 否则若 `self._last_assistant_text` 非空:`typer.echo(self._last_assistant_text)` 把最终助手文本打印到 stdout,`return True`。
  3. 若既未失败也无最终文本(如空运行):不打印任何内容,`return True`。

---

## 三种渲染器如何统一于 EventRenderer 接口

- 统一契约:`base.EventRenderer` 是 `Protocol`,仅规定 `render(event)` 与 `finish() -> bool` 两个方法签名。三个实现类 `TranscriptRenderer`、`JsonEventRenderer`、`FinalTextRenderer` 都提供了这两个方法,因此 `create_event_renderer` 可以统一以 `EventRenderer` 类型返回,供 `cli.run_print_mode` 以相同方式调用(循环 `render(each_event)` 后 `finish()`)。
- 选择机制:`cli.run_print_mode` 通过 `PrintOutputMode` 枚举决定模式,调用 `create_event_renderer(mode, ...)` 取得具体实例;`text`→`FinalTextRenderer`、`json`→`JsonEventRenderer`、`transcript`(默认)→`TranscriptRenderer`。
- 失败语义一致性:三者都以 `self._failed` 累积"不可恢复错误(`ErrorEvent.recoverable == False`)",`finish()` 统一返回 `not self._failed`,使调用方无需关心模式即可判断成败。
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
[← tau_coding · 支撑模块(二)]({{< relref "./coding-support-2.md" >}})
[↑ 总览]({{< relref "./source-walkthrough.md" >}})
