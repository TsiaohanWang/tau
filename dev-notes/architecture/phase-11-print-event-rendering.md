---
title: "Phase 11: Print and Event Rendering Modes / 阶段 11:Print 与事件渲染模式"
---

[原文]
Phase 11 adds a small rendering boundary for Tau's non-interactive CLI modes.

[译文]
阶段 11 为 Tau 的非交互式 CLI 模式加入了一个小巧的渲染边界。

[原文]
The implementation lives in:

[译文]
实现位于:

```text
src/tau_coding/rendering/
```

## 新增了什么(What was added)

[原文]
Tau now has event renderers that consume `tau_agent` events outside the portable harness layer:

- `FinalTextRenderer` prints only the final assistant answer.
- `JsonEventRenderer` writes every agent event as JSON Lines.
- `TranscriptRenderer` preserves Tau's previous live transcript behavior.
- `PrintOutputMode` selects `text`, `json`, or `transcript` output.

[译文]
Tau 现在有了在可移植 harness 层之外消费 `tau_agent` 事件的事件渲染器:

- `FinalTextRenderer` 只打印最终的 assistant 回答。
- `JsonEventRenderer` 把每个 agent 事件写成 JSON Lines。
- `TranscriptRenderer` 保留 Tau 此前的实时会话记录行为。
- `PrintOutputMode` 选择 `text`、`json` 或 `transcript` 输出。

[原文]
The CLI exposes this with:

[译文]
CLI 通过以下方式暴露它:

```bash
tau --output text "summarize this project"
tau --output json "summarize this project"
tau --output transcript "summarize this project"
```

[原文]
`text` is the default mode.

[译文]
`text` 是默认模式。

## 为什么需要它(Why this exists)

[原文]
Pi keeps terminal output modes outside the reusable agent core:

```text
agent/session emits events
print mode consumes events for final text or JSON output
interactive mode uses a separate TUI layer
```

[译文]
Pi 把终端输出模式放在可复用的 agent 内核之外:

```text
agent/session 发出事件
print 模式消费事件,输出最终文本或 JSON
交互模式使用独立的 TUI 层
```

[原文]
Tau now follows the same architectural boundary:

```text
tau_agent     portable event-producing harness
tau_coding    CLI mode selection and event rendering
future TUI    another consumer of the same event stream
```

[译文]
Tau 现在遵循相同的架构边界:

```text
tau_agent     可移植的、产生事件的 harness
tau_coding    CLI 模式选择与事件渲染
未来的 TUI    同一事件流的另一个消费者
```

[原文]
This keeps `tau_agent` free of Typer, Rich, Textual, terminal behavior, and UI policy.

[译文]
这使 `tau_agent` 不沾染 Typer、Rich、Textual、终端行为与 UI 策略。

## 输出模式(Output modes)

### 文本模式(Text mode)

[原文]
Text mode is Pi-style print mode. It consumes the full event stream and prints only the final assistant message after the run finishes.

[译文]
文本模式是 Pi 风格的 print 模式。它消费完整事件流,并只在运行结束后打印最终的 assistant 消息。

[原文]
It ignores tool events for display purposes and returns failure when a non-recoverable `ErrorEvent` appears.

[译文]
出于展示目的,它忽略工具事件;当出现不可恢复的 `ErrorEvent` 时返回失败。

### JSON 模式(JSON mode)

[原文]
JSON mode writes one serialized event per line:

[译文]
JSON 模式每行写入一个序列化事件:

```json
{"type":"message_start","message_role":"assistant"}
{"type":"message_delta","delta":"Hello"}
```

[原文]
This gives scripts and future integrations a stable event stream without depending on human-oriented terminal formatting.

[译文]
这为脚本与未来集成提供了稳定的事件流,而不依赖面向人类的终端格式。

### 会话记录模式(Transcript mode)

[原文]
Transcript mode preserves Tau's earlier print-mode behavior:

- assistant deltas stream to stdout
- tool starts, progress updates, and tool results render to stderr
- successful and failed tool result content renders to stderr
- errors render to stderr

[译文]
会话记录模式保留 Tau 早前 print 模式的行为:

- assistant 增量流式输出到 stdout
- 工具开始、进度更新与工具结果渲染到 stderr
- 成功与失败的工具结果内容都渲染到 stderr
- 错误渲染到 stderr

[原文]
The transcript renderer uses Rich for human-oriented stderr output while keeping
the default `text` mode script-friendly.

[译文]
会话记录渲染器使用 Rich 生成面向人类的 stderr 输出,同时让默认的 `text` 模式保持对脚本友好。

[原文]
This is useful while Tau does not yet have a full interactive TUI.

[译文]
在 Tau 还没有完整交互式 TUI 的时期,这很有用。

## CLI 集成(CLI integration)

[原文]
`run_print_mode()` now accepts:

[译文]
`run_print_mode()` 现在接受:

```python
output: PrintOutputMode = PrintOutputMode.text
```

[原文]
It creates a renderer with:

[译文]
它通过以下方式创建渲染器:

```python
create_event_renderer(output)
```

[原文]
and sends every event from `CodingSession.prompt()` to the renderer. The session
wrapper persists the one-shot transcript and keeps print mode aligned with the
same prompt, resource, and tool environment used by the TUI.

[译文]
并把 `CodingSession.prompt()` 的每个事件发送给渲染器。会话包装层负责持久化这次一次性运行的会话记录,并让 print 模式与 TUI 使用相同的提示词、资源与工具环境。

## 测试(Tests)

[原文]
The phase is covered by:

[译文]
本阶段的测试覆盖为:

```text
tests/test_rendering.py
tests/test_cli.py
```

[原文]
The tests verify:

- transcript streaming behavior
- final text behavior
- JSON Lines output
- non-recoverable error handling
- CLI output-mode integration

[译文]
测试验证:

- 会话记录的流式行为
- 最终文本行为
- JSON Lines 输出
- 不可恢复错误的处理
- CLI 输出模式集成

## 非目标(Non-goals)

[原文]
This phase does not add:

- Textual UI
- keyboard input
- session picker
- diff viewer
- markdown renderer
- theme system

[译文]
本阶段不包含:

- Textual UI
- 键盘输入
- 会话选择器
- diff 查看器
- Markdown 渲染器
- 主题系统

[原文]
Those belong to later frontend phases.

[译文]
这些属于后续的前端阶段。

## 下一阶段(Next phase)

[原文]
The next phase can build the Textual TUI behind the same event boundary, or first add optional Rich styling inside `tau_coding` without changing `tau_agent`.

[译文]
下一阶段可以在同一事件边界之后构建 Textual TUI,或者先在 `tau_coding` 内部加入可选的 Rich 样式,而不改动 `tau_agent`。
