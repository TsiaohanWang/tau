---
title: "Phase 4: AgentHarness / 阶段 4:AgentHarness"
---

[原文]
Phase 4 adds `AgentHarness`, the reusable stateful brain built on top of the pure agent loop.

[译文]
阶段 4 加入了 `AgentHarness` —— 建立在纯 agent 循环之上的、可复用的有状态大脑。

[原文]
The previous phase introduced `run_agent_loop()`, which coordinates a provider, tools, messages, and events. That loop is intentionally mostly stateless: callers pass in a transcript list, and the loop appends assistant and tool result messages.

[译文]
上一阶段引入了 `run_agent_loop()`,它协调 provider、工具、消息与事件。该循环刻意保持基本无状态:调用方传入一个会话记录列表,循环负责追加 assistant 消息与工具结果消息。

[原文]
`AgentHarness` owns that transcript for callers.

[译文]
`AgentHarness` 则为调用方持有这份会话记录。

## 新增了什么(What was added)

[原文]
Phase 4 added:

[译文]
阶段 4 新增了:

```text
src/tau_agent/harness.py
```

[原文]
with:

- `AgentHarnessConfig`
- `AgentHarness`
- `SimpleCancellationToken`
- `EventListener`

[译文]
其中包括:

- `AgentHarnessConfig`
- `AgentHarness`
- `SimpleCancellationToken`
- `EventListener`

## 为什么需要 harness(Why the harness exists)

[原文]
Tau's architecture separates three layers:

[译文]
Tau 的架构区分三层:

```text
AgentHarness = reusable brain
AgentSession = coding-agent environment
TUI = one possible frontend
```

[原文]
The harness is the reusable stateful layer. It is still not the full coding-agent app.

[译文]
Harness 是可复用的有状态层,但它仍然不是完整的编码 agent 应用。

[原文]
That means it can own conversation state and run the loop, but it should not know about:

- where session files are stored
- how slash commands work
- how project instructions are discovered
- how Rich or Textual render events
- which built-in coding tools are registered by default

[译文]
这意味着它可以持有对话状态并运行循环,但不应该知道:

- 会话文件存放在哪里
- 斜杠命令如何工作
- 项目指令如何被发现
- Rich 或 Textual 如何渲染事件
- 默认注册了哪些内置编码工具

[原文]
Those responsibilities belong to later `tau_coding` phases.

[译文]
这些职责属于后续的 `tau_coding` 阶段。

## Harness 配置(Harness configuration)

[原文]
`AgentHarnessConfig` stores the stable inputs needed to run the loop:

- provider
- model name
- system prompt
- tools
- optional max turn count

[译文]
`AgentHarnessConfig` 保存运行循环所需的稳定输入:

- provider
- 模型名
- 系统提示词
- 工具集
- 可选的最大轮次数

[原文]
Conceptually:

[译文]
概念上:

```python
config = AgentHarnessConfig(
    provider=provider,
    model="gpt-4.1-mini",
    system="You are Tau.",
    tools=[...],
)
```

[原文]
The harness receives this config and uses it for every prompt or continuation.

[译文]
Harness 接收这份配置,并在每次提示或继续运行时使用它。

## Prompt 流程(Prompt flow)

[原文]
Calling `prompt()` appends a user message and starts the loop.

[译文]
调用 `prompt()` 会追加一条用户消息并启动循环。

```python
async for event in harness.prompt("Read README.md"):
    ...
```

[原文]
The transcript changes like this:

[译文]
会话记录会这样变化:

```text
before prompt:
  []

after prompt appends user message:
  UserMessage("Read README.md")

after loop runs:
  UserMessage("Read README.md")
  AssistantMessage(...)
  ToolResultMessage(...)   # if tools were used
  AssistantMessage(...)
```

[原文]
The harness does not render those events. It simply yields them.

[译文]
Harness 不渲染这些事件,只是把它们产出。

## Continue 流程(Continue flow)

[原文]
Calling `continue_()` runs the loop without appending a new user message.

[译文]
调用 `continue_()` 会在不追加新用户消息的情况下运行循环。

[原文]
This is useful for future features such as:

- resuming after restoring a session
- continuing after an interrupted run
- letting a coding-session wrapper decide when the next model turn should happen

[译文]
这对未来这些功能很有用:

- 恢复会话之后继续运行
- 在运行被中断之后继续
- 让编码会话包装层决定下一次模型调用何时发生

```python
async for event in harness.continue_():
    ...
```

## 会话记录快照(Transcript snapshots)

[原文]
The `messages` property returns an immutable tuple snapshot.

[译文]
`messages` 属性返回一个不可变的元组快照。

[原文]
This protects the harness transcript from accidental external mutation:

[译文]
这可以保护 harness 的会话记录,避免被外部意外修改:

```python
snapshot = harness.messages
```

[原文]
A future session layer can use this snapshot for persistence. For controlled restoration, `append_message()` can append existing messages.

[译文]
未来的会话层可以用这个快照做持久化。若需要有控制地恢复,`append_message()` 可以追加已有消息。

## 事件监听器(Event listeners)

[原文]
The harness supports event subscriptions:

[译文]
Harness 支持事件订阅:

```python
unsubscribe = harness.subscribe(listener)
```

[原文]
Listeners receive the same `AgentEvent` objects yielded by `prompt()` and `continue_()`.

[译文]
监听器接收到的 `AgentEvent` 对象,与 `prompt()`、`continue_()` 产出的完全相同。

[原文]
This lets future code observe runs without becoming the main event consumer. For example:

- logging
- metrics
- session persistence hooks
- UI bridges

[译文]
这使后续代码无需成为主事件消费者,也能观察运行过程。例如:

- 日志
- 指标
- 会话持久化钩子
- UI 桥接

[原文]
The primary API remains async iteration over events.

[译文]
主要 API 仍然是对事件的异步迭代。

## 取消(Cancellation)

[原文]
Phase 4 adds a minimal cancellation token.

[译文]
阶段 4 增加了一个最小化的取消令牌。

```python
harness.cancel()
```

[原文]
When cancellation is requested, the current loop can stop and emit a recoverable cancellation error.

[译文]
当请求取消时,当前循环可以停止,并发出一个可恢复的取消错误。

[原文]
This is intentionally simple. Later UI layers can connect it to keybindings, buttons, or command handlers.

[译文]
这是有意保持简单的。后续 UI 层可以把它接到快捷键、按钮或命令处理器上。

## 与循环的关系(Relationship to the loop)

[原文]
The harness delegates to `run_agent_loop()`:

[译文]
Harness 把工作委托给 `run_agent_loop()`:

```text
AgentHarness.prompt()
        ↓
append UserMessage
        ↓
run_agent_loop(...)
        ↓
yield AgentEvent objects
        ↓
transcript grows
```

[原文]
The loop still owns the turn-by-turn mechanics. The harness owns durable in-memory conversation state.

[译文]
循环仍然负责逐轮运行的机制;Harness 负责持久存在于内存中的对话状态。

## 阶段 4 如何支撑后续阶段(How Phase 4 supports later phases)

### 阶段 5:内置编码工具(Phase 5: built-in coding tools)

[原文]
The harness already accepts `AgentTool` instances. Once coding tools exist, the coding app can pass them into the harness config.

[译文]
Harness 已经可以接收 `AgentTool` 实例。编码工具就绪之后,编码应用就可以把它们传入 harness 配置。

### 阶段 6:print 模式 CLI(Phase 6: print-mode CLI)

[原文]
The CLI can create an `AgentHarness`, call `prompt()`, and print streamed events.

[译文]
CLI 可以创建一个 `AgentHarness`,调用 `prompt()`,并打印流式事件。

### 阶段 7:会话(Phase 7: sessions)

[原文]
Session persistence can restore messages into a harness and save snapshots after events.

[译文]
会话持久化可以把消息恢复到 harness 中,并在事件之后保存快照。

### 阶段 8:编码会话包装层(Phase 8: coding session wrapper)

[原文]
The coding session wrapper can compose higher-level behavior around the harness: slash commands, direct bash commands, prompt expansion, resources, and persistence.

[译文]
编码会话包装层可以围绕 harness 组合更高层的行为:斜杠命令、直接 bash 命令、提示词展开、资源与持久化。

## 设计规则(Design rule)

[原文]
`AgentHarness` can own agent state, but it must remain frontend-agnostic and coding-app-agnostic.

[译文]
`AgentHarness` 可以持有 agent 状态,但必须保持与前端无关、与编码应用无关。

[原文]
If a behavior depends on terminal rendering, project files, user config directories, or slash commands, it belongs outside `tau_agent`.

[译文]
如果某种行为依赖终端渲染、项目文件、用户配置目录或斜杠命令,它就应该放在 `tau_agent` 之外。
