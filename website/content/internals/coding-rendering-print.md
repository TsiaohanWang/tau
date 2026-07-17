---
title: tau_coding · 渲染层(print/json)
description: rendering/plain.py / rendering/json.py
code_files:
  - tau_coding/rendering/plain.py
  - tau_coding/rendering/json.py
---

## `tau_coding/rendering/plain.py` — print 模式的最终文本

当 Tau 以非交互模式运行（比如通过命令行管道调用 `tau --no-tui`），它需要一种不依赖终端 UI 框架就能输出结果的方式。`FinalTextRenderer` 正是为这种场景设计的——它在整个运行过程中保持沉默，只在最后把模型的最终回答一次性打印出来。

在 TUI 模式下，用户能实时看到模型逐字生成文本、工具调用的进度和结果。但在非交互场景（比如写脚本把 agent 当函数调用），用户只关心最终答案。`FinalTextRenderer` 会安静地忽略所有中间事件（工具调用、进度更新等），只在 `finish()` 时输出最后一轮助手消息——或者在出错时把错误信息写到 stderr。

- 它监听 `MessageEndEvent` 并记住最后的助手文本。
- 它收集 `ErrorEvent`；不可恢复的会把运行标记为失败。
  - `finish()` 打印最终的助手文本（或把每个错误打印到 stderr）并返回运行是否成功。

因此在 print 模式下，终端只显示模型的*最终答案*，而非流式的那些中间事件。

```python
class FinalTextRenderer:
    def __init__(self) -> None:
        self._last_assistant_text = ""
        self._failed = False
        self._error_messages: list[str] = []

    def render(self, event: AgentEvent) -> None:
        if isinstance(event, MessageEndEvent):
            self._last_assistant_text = event.message.content
            return
        if isinstance(event, ErrorEvent):
            if not event.recoverable:
                self._failed = True
            self._error_messages.append(event.message)

    def finish(self) -> bool:
        if self._failed:
            for message in self._error_messages:
                typer.echo(f"Error: {message}", err=True)
            return False
        if self._last_assistant_text:
            typer.echo(self._last_assistant_text)
        return True
```

关键点:`render()` 期间只静默缓冲,过程完全不输出;只有 `finish()` 才会落屏——成功打印最终助手文本,失败则逐条打印错误到 stderr。

## `tau_coding/rendering/json.py` — JSONL 事件流

有些场景下，程序需要消费 agent 的输出而不是人类来阅读——比如 CI/CD 流水线、自动化测试、或者日志分析工具。`JsonEventRenderer` 把每个事件序列化为一行 JSON（这种逐行 JSON 的格式叫 JSONL，全称 JSON Lines），方便下游程序逐行解析。

每个 `AgentEvent`（在 2a 部分定义）都会变成每行一个 JSON 对象，
这正是 TUI 和下游工具可以解析的那条流。

- `render(event)` — 把 `event.model_dump_json()` 写成每行一个事件，
  并把不可恢复的错误标记为失败。
- `finish()` — 返回运行是否成功。

```python
class JsonEventRenderer:
    def __init__(self) -> None:
        self._failed = False

    def render(self, event: AgentEvent) -> None:
        if isinstance(event, ErrorEvent) and not event.recoverable:
            self._failed = True
        typer.echo(event.model_dump_json())

    def finish(self) -> bool:
        return not self._failed
```

关键点:所有事件一律 `model_dump_json()` 原样输出为一行 JSONL,不区分类型;不可恢复错误仅标记 `_failed` 但仍会打印该事件,保证流完整。

> 设计说明（Design note）：这两个渲染器消费的都是 agent 循环发出的*同一个* `AgentEvent` 联合类型。这正是 AGENTS.md 边界在起作用，也是 Tau README 原则"事件即契约（Events are the contract）"的直接体现：harness 发出事件并保持可移植，而每个前端（TUI、plain、json）独立地消费它们。因为事件流是稳定接口，print 和 JSON 后端可以在不修改 `tau_agent` 的情况下被添加或更改；agent 核心对当前挂载的是哪个前端一无所知。

---

## 本部分如何契合整体

- `rendering/base.py` 定义 `EventRenderer` 协议和 `PrintOutputMode` 枚举，是整个渲染层的接口契约。
- `rendering/transcript.py`（Part 3c 已介绍）处理 `PrintOutputMode.transcript`，把助手文本流式写入 stdout、工具活动写入 stderr。
- `rendering/plain.py` 处理 `PrintOutputMode.text`，为非交互环境提供无着色、无装饰的纯文本输出。
- `rendering/json.py` 处理 `PrintOutputMode.json`，把事件逐行序列化为 JSONL，便于管道和机器解析。

plain 和 json 渲染器共享 transcript 的事件分发结构，但各自把 `render()` 中的格式化逻辑替换为自己的目标格式。三者共同覆盖了从人类可读终端输出到机器可消费日志的完整光谱，且都通过同一 `EventRenderer` 接口与 agent 循环解耦。

接下来：**Part 3d** 讲解 Textual TUI（`tui/state.py`、`tui/adapter.py`、
`tui/app.py`、`tui/config.py`、`tui/autocomplete.py`）——最丰富的前端，
也是 **Part 3e** 中 auth/CLI/extensions 层之前的最后一大块。

<!-- NAV -->
[← tau_coding · Provider 配置]({{< relref "./coding-provider-config.md" >}})
[↑ 总览]({{< relref "./source-walkthrough.md" >}})
[→ tau_coding · TUI 状态与适配]({{< relref "./coding-tui-state.md" >}})
