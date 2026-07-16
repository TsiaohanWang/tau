---
title: tau_coding · 渲染层(print/json)
description: rendering/plain.py / rendering/json.py
code_files:
  - tau_coding/rendering/plain.py
  - tau_coding/rendering/json.py
---

## `tau_coding/rendering/plain.py` — print 模式的最终文本

`FinalTextRenderer` 是最简单的输出后端，用于 `--no-tui` / print 模式。

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

`JsonEventRenderer` 是机器可读的后端（用于脚本/CI）。

- `render(event)` — 把 `event.model_dump_json()` 写成每行一个事件，
  并把不可恢复的错误标记为失败。
- `finish()` — 返回运行是否成功。

每个 `AgentEvent`（在 2a 部分定义）都会变成每行一个 JSON 对象，
这正是 TUI 和下游工具可以解析的那条流。

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

## 3c 部分如何契合整体

- `commands.py` 把用户输入（`/model`、`/new`、……）适配到 `CodingSession`
  的方法（3b 部分）。
- `session_manager.py` 为每一个 `CodingSession` 建立索引，以便 CLI 能跨运行列出和恢复。
- `provider_catalog.py`（静态参考）→ `provider_config.py`（持久化、
  用户可定制、已校验）→ `provider_runtime.py`（活动的 `tau_ai`
  provider）。这个三步流水线就是 Tau 从"provider 名"走到"流式连接"的方式。
- `rendering/*` 是把 agent 事件转换为文本或 JSONL 的非 TUI 输出后端。

接下来：**Part 3d** 讲解 Textual TUI（`tui/state.py`、`tui/adapter.py`、
`tui/app.py`、`tui/config.py`、`tui/autocomplete.py`）——最丰富的前端，
也是 **Part 3e** 中 auth/CLI/extensions 层之前的最后一大块。

<!-- NAV -->
[← tau_coding · Provider 配置]({{< relref "./coding-provider-config.md" >}})
[↑ 总览]({{< relref "./source-walkthrough.md" >}})
[→ tau_coding · TUI 状态与适配]({{< relref "./coding-tui-state.md" >}})
