# 编码 Agent 层上的 TUI:开发足迹 / TUI on the Coding Agent Layer: Development Footprint

[原文]
This report records what Tau learned while building the Textual TUI on top of the
coding-agent layer (`tau_coding`) and the reusable harness layer (`tau_agent`). It
is intended for future agents or contributors who build another TUI, so they can
start with the architectural constraints and known failure modes instead of
rediscovering them one bug at a time.

[译文]
本文记录 Tau 在编码 agent 层(`tau_coding`)与可复用 harness 层(`tau_agent`)之上构建 Textual TUI 过程中学到的东西。它面向未来要构建另一个 TUI 的 agent 或贡献者,让他们能从架构约束与已知失败模式出发,而不是一个 bug 一个 bug 地重新发现它们。

[原文]
The focus is not visual polish alone. The important lessons are about the
frontend contract: where UI code may depend on `tau_coding`, where it must not
reach into `tau_agent`, how streamed events relate to durable session state, and
which concurrency/session/scrolling traps have already appeared in production
work.

[译文]
重点不只是视觉打磨。重要的经验在于前端契约:UI 代码可以在哪里依赖 `tau_coding`,在哪里不得深入 `tau_agent`,流式事件与持久化会话状态如何关联,以及哪些并发/会话/滚动陷阱已经在生产工作中出现过。

## 审阅的来源(Sources reviewed)

[原文]
This report was written from the current source tree plus project history:

[译文]
本文基于当前源码树与项目历史撰写:

[原文]
- `git log --all` for TUI, session, harness, event, compaction, command, and
  rendering commits.
- Merged PRs, issue bodies, and PR/issue comments via GitHub CLI for the TUI
  build path and follow-up fixes.
- Current implementation files:
  - `src/tau_agent/events.py`
  - `src/tau_agent/loop.py`
  - `src/tau_agent/harness.py`
  - `src/tau_coding/session.py`
  - `src/tau_coding/tui/adapter.py`
  - `src/tau_coding/tui/state.py`
  - `src/tau_coding/tui/app.py`
  - `src/tau_coding/tui/widgets.py`
  - `src/tau_coding/tui/autocomplete.py`
- Existing dev notes under `dev-notes/architecture/`, especially phases 11, 12,
  17, 20.x, 22, 23, 24, `queued-steering-follow-ups.md`, and
  `provider-retries.md`.

[译文]
- `git log --all` 中与 TUI、会话、harness、事件、压缩、命令与渲染相关的提交。
- 通过 GitHub CLI 获取的已合并 PR、issue 正文,以及针对 TUI 构建路径与后续修复的 PR/issue 评论。
- 当前实现文件:
  - `src/tau_agent/events.py`
  - `src/tau_agent/loop.py`
  - `src/tau_agent/harness.py`
  - `src/tau_coding/session.py`
  - `src/tau_coding/tui/adapter.py`
  - `src/tau_coding/tui/state.py`
  - `src/tau_coding/tui/app.py`
  - `src/tau_coding/tui/widgets.py`
  - `src/tau_coding/tui/autocomplete.py`
- `dev-notes/architecture/` 下的既有开发笔记,尤其是 phases 11、12、17、20.x、22、23、24,以及 `queued-steering-follow-ups.md` 与 `provider-retries.md`。

[原文]
Useful history anchors:

[译文]
有用的历史锚点:

[原文]
- PR #11: print/event rendering modes.
- PR #12: first Textual TUI behind `TuiState`/`TuiEventAdapter`.
- PR #14: early TUI worker/transcript restoration fixes.
- PR #15: session manager/resume support.
- PRs #25, #26, #39, #40, #67, #154, #177, #190: transcript, selection,
  streaming, tool display, and scrolling lessons.
- PRs #43, #45, #46, #47, #99, #169: retry/thinking/queue/cancellation/tool
  interruption event semantics.
- PRs #101, #107, #142, #144, #161, #168, #180: session tree, compaction,
  persistence, and empty-session invariants.
- PRs #98, #100, #140, #147, #148, #149, #152, #153, #174, #198: commands,
  pickers, prompt expansion, terminal commands, and local-only output.
- Open issue #166: prompt-display latency versus durability ordering.
- Open issue #205: future custom TUI support.

[译文]
- PR #11:print/事件渲染模式。
- PR #12:第一个位于 `TuiState`/`TuiEventAdapter` 之后的 Textual TUI。
- PR #14:早期 TUI worker/会话记录恢复修复。
- PR #15:会话管理器/恢复支持。
- PR #25、#26、#39、#40、#67、#154、#177、#190:会话记录、选择、流式、工具显示与滚动方面的经验。
- PR #43、#45、#46、#47、#99、#169:重试/thinking/队列/取消/工具中断的事件语义。
- PR #101、#107、#142、#144、#161、#168、#180:会话树、压缩、持久化与空会话不变量。
- PR #98、#100、#140、#147、#148、#149、#152、#153、#174、#198:命令、选择器、提示词展开、终端命令与仅本地输出。
- 未关闭 issue #166:提示显示延迟与持久化顺序。
- 未关闭 issue #205:未来的自定义 TUI 支持。

## 执行摘要(Executive summary)

[原文]
A Tau TUI should be built on this boundary:

```text
CodingSession emits AgentEvent values
        ↓
frontend adapter/state translates events into UI state
        ↓
frontend widgets render that state
```

[译文]
Tau TUI 应建立在这样的边界上:

```text
CodingSession 发出 AgentEvent
        ↓
前端适配器/状态把事件翻译成 UI 状态
        ↓
前端组件渲染该状态
```

[原文]
The TUI should use `tau_coding.session.CodingSession`, not raw provider streams
and usually not raw `AgentHarness`. `CodingSession` is the application/session
environment: it owns provider/model selection, tools, persistence, resources,
skills, prompt templates, commands, compaction, diagnostics, and session-manager
integration. `AgentHarness` is the reusable brain: it owns the active transcript,
queues, cancellation token, event stream, and loop delegation. `tau_agent` must
stay portable and independent of Textual/Rich/keybindings/config paths/slash
commands.

[译文]
TUI 应使用 `tau_coding.session.CodingSession`,而不是原始 provider 流,通常也不直接使用裸 `AgentHarness`。`CodingSession` 是应用/会话环境:它持有 provider/模型选择、工具、持久化、资源、技能、提示词模板、命令、压缩、诊断与会话管理器集成。`AgentHarness` 是可复用大脑:它持有活动会话记录、队列、取消令牌、事件流与循环委托。`tau_agent` 必须保持可移植,并独立于 Textual/Rich/键位绑定/配置路径/斜杠命令。

[原文]
The biggest lesson from the development history is that the event stream is the
contract, but it is not the entire product. A frontend must also respect the
coding-session control surface for:

[译文]
开发历史带来的最大经验是:事件流是契约,但它不是产品的全部。前端还必须尊重编码会话的控制面,包括:

[原文]
- slash commands and local-only command output;
- active-run queueing (`steer` and `follow_up`);
- cancellation and stale worker protection;
- session switching and transcript rebuilds;
- compaction, tree branching, model/provider/thinking controls;
- durable persistence timing.

[译文]
- 斜杠命令与仅本地命令输出;
- 活动运行期间的排队(`steer` 与 `follow_up`);
- 取消与陈旧 worker 防护;
- 会话切换与会话记录重建;
- 压缩、树分支、模型/provider/thinking 控件;
- 持久化时机。

[原文]
Future custom TUIs should not copy `TauTuiApp` wholesale. Treat it as a reference
implementation. Reuse or mirror the stable seams: `CodingSession`, `AgentEvent`,
`TuiEventAdapter`, `TuiState`, pure autocomplete helpers, and session-manager
methods.

[译文]
未来的自定义 TUI 不应整体照抄 `TauTuiApp`。把它当作参考实现。复用或模仿那些稳定的接缝:`CodingSession`、`AgentEvent`、`TuiEventAdapter`、`TuiState`、纯粹的自动补全辅助函数,以及会话管理器方法。

## 分层职责(Layer responsibilities)

### `tau_ai`:provider 流式层(`tau_ai`: provider streaming layer)

[原文]
`tau_ai` adapts provider-specific APIs into provider-neutral provider events.
Those provider events are internal to the agent loop. A TUI should not render
OpenAI/Anthropic/Codex chunks directly.

[译文]
`tau_ai` 把各 provider 特有的 API 适配成 provider 无关的 provider 事件。这些 provider 事件是 agent 循环内部的。TUI 不应直接渲染 OpenAI/Anthropic/Codex 的分片。

[原文]
Important provider-level behaviors surfaced upward:

[译文]
向上暴露的重要 provider 级行为:

[原文]
- text deltas;
- thinking/reasoning deltas;
- response start/end;
- provider retry events;
- provider error events with optional structured diagnostic data.

[译文]
- 文本增量;
- thinking/推理增量;
- 响应开始/结束;
- provider 重试事件;
- 带可选结构化诊断数据的 provider 错误事件。

### `tau_agent`:可移植 harness、循环、事件、会话记录大脑(`tau_agent`: portable harness, loop, events, transcript brain)

[原文]
`tau_agent` owns the reusable agent brain and the frontend event contract.

[译文]
`tau_agent` 持有可复用的 agent 大脑与前端事件契约。

[原文]
It must not depend on:

[译文]
它不得依赖:

[原文]
- Textual;
- Rich rendering policy;
- Typer/CLI mode;
- Tau home/session file locations;
- slash-command UX;
- provider credential UI;
- app-specific resources such as `.agents` discovery.

[译文]
- Textual;
- Rich 渲染策略;
- Typer/CLI 模式;
- Tau 主目录/会话文件位置;
- 斜杠命令交互;
- provider 凭据 UI;
- `.agents` 发现之类的应用特有资源。

[原文]
Key objects:

[译文]
关键对象:

[原文]
- `AgentEvent` variants in `tau_agent.events`.
- `AgentHarness` in `tau_agent.harness`.
- `run_agent_loop()` in `tau_agent.loop`.
- provider-neutral messages and tools.

[译文]
- `tau_agent.events` 中的各种 `AgentEvent`。
- `tau_agent.harness` 中的 `AgentHarness`。
- `tau_agent.loop` 中的 `run_agent_loop()`。
- provider 无关的消息与工具。

[原文]
`AgentHarness` responsibilities:

[译文]
`AgentHarness` 的职责:

[原文]
- own the in-memory transcript for a run/session;
- append user messages for prompts;
- reject overlapping prompt/continue runs;
- expose `continue_()`;
- expose event listeners;
- support cancellation;
- own steering/follow-up queues;
- repair interrupted tool-call transcripts before the next provider request.

[译文]
- 持有某次运行/会话的内存会话记录;
- 为提示追加用户消息;
- 拒绝重叠的 prompt/continue 运行;
- 暴露 `continue_()`;
- 暴露事件监听器;
- 支持取消;
- 持有插话/追加队列;
- 在下一次 provider 请求之前修复被中断的工具调用会话记录。

[原文]
The harness still does not know what a Textual worker, TUI prompt input, command
palette, session picker, or modal is.

[译文]
Harness 仍然不知道 Textual worker、TUI 提示输入、命令面板、会话选择器或模态框是什么。

### `tau_coding`:编码 agent 环境与前端集成层(`tau_coding`: coding-agent environment and frontend integration layer)

[原文]
`CodingSession` wraps `AgentHarness` with the app-specific environment:

[译文]
`CodingSession` 用应用特有的环境包装 `AgentHarness`:

[原文]
- durable JSONL/session tree persistence;
- session manager/index/resume/new-session behavior;
- default coding tools;
- system prompt/resource loading;
- skill and prompt-template expansion;
- provider settings, credentials, model choices, thinking levels;
- slash-command dispatch;
- compaction and context accounting;
- diagnostic logging;
- terminal command helpers;
- session export.

[译文]
- 持久化的 JSONL/会话树持久化;
- 会话管理器/索引/恢复/新建会话行为;
- 默认编码工具;
- 系统提示词/资源加载;
- 技能与提示词模板展开;
- provider 设置、凭据、模型选择、thinking 等级;
- 斜杠命令分派;
- 压缩与上下文计量;
- 诊断日志;
- 终端命令辅助;
- 会话导出。

[原文]
A new TUI should depend on `CodingSession` because this is the layer where the
coding-agent product behavior lives.

[译文]
新的 TUI 应当依赖 `CodingSession`,因为编码 agent 的产品行为就位于这一层。

### `tau_coding.tui`:一个前端,而不是架构(`tau_coding.tui`: one frontend, not the architecture)

[原文]
The built-in Textual TUI is one consumer of the contract. Its reusable pieces are:

[译文]
内置的 Textual TUI 是该契约的一个消费者。它可复用的部分:

[原文]
- `TuiEventAdapter`: pure event-to-state adapter.
- `TuiState`: frontend display state for transcript items, buffers, queues,
  thinking visibility, tool result visibility, loaded skill metadata.
- `autocomplete.py`: pure completion-state builder.

[译文]
- `TuiEventAdapter`:纯粹的事件到状态适配器。
- `TuiState`:与会话记录条目、缓冲区、队列、thinking 可见性、工具结果可见性、已加载技能元数据相关的前端显示状态。
- `autocomplete.py`:纯粹的补全状态构建器。

[原文]
Its Textual-specific pieces are not part of the portable architecture:

[译文]
它那些 Textual 特有的部分不属于可移植架构:

[原文]
- widgets;
- CSS/theme variables;
- keybindings;
- modals/pickers;
- scroll/selection mechanics;
- Textual worker management.

[译文]
- 组件;
- CSS/主题变量;
- 键位绑定;
- 模态框/选择器;
- 滚动/选择机制;
- Textual worker 管理。

## TUI 必须处理的 `AgentEvent` 契约(The `AgentEvent` contract a TUI must handle)

[原文]
The current event union is defined in `src/tau_agent/events.py`.

[译文]
当前的事件联合定义在 `src/tau_agent/events.py`。

### 生命周期事件(Lifecycle events)

[原文]
| Event | `type` | TUI meaning |
|---|---|---|
| `AgentStartEvent` | `agent_start` | Mark the run as active; clear prior run error state. |
| `AgentEndEvent` | `agent_end` | Flush any assistant stream buffer; mark the run idle. |
| `TurnStartEvent` | `turn_start` | A model/tool turn has started. Mostly useful for diagnostics/future UI. |
| `TurnEndEvent` | `turn_end` | A turn has ended. Mostly useful for diagnostics/future UI. |

[译文]
| 事件 | `type` | TUI 含义 |
|---|---|---|
| `AgentStartEvent` | `agent_start` | 把本次运行标记为活动;清除先前的运行错误状态。 |
| `AgentEndEvent` | `agent_end` | 冲刷任何 assistant 流缓冲;把运行标记为空闲。 |
| `TurnStartEvent` | `turn_start` | 一个模型/工具轮次已开始。主要用于诊断/未来的 UI。 |
| `TurnEndEvent` | `turn_end` | 一个轮次已结束。主要用于诊断/未来的 UI。 |

### 消息事件(Message events)

[原文]
| Event | `type` | TUI meaning |
|---|---|---|
| `MessageStartEvent` | `message_start` | A user/assistant/tool message block is starting. Assistant start usually resets the streaming buffer. |
| `MessageDeltaEvent` | `message_delta` | Append streamed assistant text. |
| `ThinkingDeltaEvent` | `thinking_delta` | Append streamed reasoning/thinking text. Hide by default unless the UI has a thinking display toggle. |
| `MessageEndEvent` | `message_end` | A durable message object is complete. Render user/assistant messages and attach/restore tool messages. |

[译文]
| 事件 | `type` | TUI 含义 |
|---|---|---|
| `MessageStartEvent` | `message_start` | 一个 user/assistant/tool 消息块正在开始。assistant 的 start 通常会重置流缓冲。 |
| `MessageDeltaEvent` | `message_delta` | 追加流式 assistant 文本。 |
| `ThinkingDeltaEvent` | `thinking_delta` | 追加流式推理/thinking 文本。默认隐藏,除非 UI 有 thinking 显示开关。 |
| `MessageEndEvent` | `message_end` | 一个持久化消息对象已完成。渲染 user/assistant 消息,并挂载/恢复工具消息。 |

[原文]
Important: the user prompt echo is emitted by `AgentHarness`, not the provider,
as a normal user `MessageStartEvent`/`MessageEndEvent` pair after the first
`turn_start`. Do not optimistically duplicate it unless you are explicitly
accepting the durability/display tradeoff described in issue #166.

[译文]
重要:用户提示的回显由 `AgentHarness` 发出,而不是 provider,并且是在第一个 `turn_start` 之后作为普通用户 `MessageStartEvent`/`MessageEndEvent` 对发出。不要乐观地重复它,除非你明确接受 issue #166 中描述的「持久化/显示」取舍。

### 工具事件(Tool events)

[原文]
| Event | `type` | TUI meaning |
|---|---|---|
| `ToolExecutionStartEvent` | `tool_execution_start` | Show a tool call row, normally collapsed. Flush active assistant text first. |
| `ToolExecutionUpdateEvent` | `tool_execution_update` | Show progress/status for a tool. This is part of the public event contract even though the core loop currently emits only start/end. |
| `ToolExecutionEndEvent` | `tool_execution_end` | Attach result to the matching tool call; show success/failure and a bounded preview. |

[译文]
| 事件 | `type` | TUI 含义 |
|---|---|---|
| `ToolExecutionStartEvent` | `tool_execution_start` | 显示一行工具调用,通常折叠。先冲刷活动的 assistant 文本。 |
| `ToolExecutionUpdateEvent` | `tool_execution_update` | 显示某个工具的进度/状态。即使核心循环目前只发出 start/end,它仍是公开事件契约的一部分。 |
| `ToolExecutionEndEvent` | `tool_execution_end` | 把结果挂到匹配的工具调用上;显示成功/失败与有界预览。 |

[原文]
Tool results must preserve enough structured metadata for restored session
rendering. In particular, edit patches live in tool-result metadata and are used
by the TUI to render diffs after reload as well as live.

[译文]
工具结果必须保留足够的结构化元数据,以供恢复后的会话渲染。特别地,edit patch 存在于工具结果元数据中,TUI 既在实时状态下、也在 reload 之后用它们渲染 diff。

### 队列、重试与错误事件(Queue, retry, and error events)

[原文]
| Event | `type` | TUI meaning |
|---|---|---|
| `QueueUpdateEvent` | `queue_update` | Update pending steering/follow-up UI. |
| `RetryEvent` | `retry` | Show provider retry progress as status, not as assistant content. |
| `ErrorEvent` | `error` | Show an error/status row. Non-recoverable errors should end the visible run. Recoverable cancellation should be status, not scary error UI. |

[译文]
| 事件 | `type` | TUI 含义 |
|---|---|---|
| `QueueUpdateEvent` | `queue_update` | 更新待处理的插话/追加 UI。 |
| `RetryEvent` | `retry` | 把 provider 重试进度显示为状态,而不是 assistant 内容。 |
| `ErrorEvent` | `error` | 显示一行错误/状态。不可恢复错误应结束可见运行。可恢复的取消应显示为状态,而不是吓人的错误 UI。 |

[原文]
Known cancellation event:

[译文]
已知的取消事件:

```python
ErrorEvent(message="Agent run cancelled", recoverable=True)
```

[原文]
The built-in TUI renders this as status rather than an error row.

[译文]
内置 TUI 把它渲染为状态,而不是错误行。

## 典型事件流(Typical event flows)

### 简单提示(Simple prompt)

```text
agent_start
turn_start
message_start       # user, emitted by AgentHarness
message_end         # user prompt
message_start       # assistant
message_delta*
thinking_delta*     # optional/interleaved depending provider
message_end         # assistant
turn_end
agent_end
```

### 工具使用(Tool use)

```text
agent_start
turn_start
message_start       # user
message_end         # user prompt
message_start       # assistant
message_end         # assistant with tool_calls
tool_execution_start
tool_execution_update*   # possible/future/custom
tool_execution_end
turn_end
turn_start          # provider sees tool result in transcript
message_start       # assistant
message_delta*
message_end         # final assistant
turn_end
agent_end
```

### 活动运行期间的排队(Queueing during an active run)

```text
# user submits while an agent run is active
queue_update        # immediate response from CodingSession.prompt(..., streaming_behavior=...)

# later, when the harness drains the queue
message_start       # queued user message
message_end         # queued user message
queue_update        # queue count changed
turn_start          # next model call with updated transcript
...
```

## 关键架构决策(Crucial architecture decisions)

### 事件渲染器先于 Textual(1. Event renderers came before Textual)

[原文]
PR #11 added print/event rendering modes (`text`, `json`, `transcript`) before
the full TUI. That was important because it forced the portable contract to be
`AgentEvent` values, not Textual widgets. JSONL output also gave a scriptable way
to inspect event streams.

[译文]
PR #11 在完整 TUI 之前先加入了 print/事件渲染模式(`text`、`json`、`transcript`)。这很重要,因为它迫使可移植契约是 `AgentEvent` 值,而不是 Textual 组件。JSONL 输出还提供了以脚本方式检查事件流的手段。

[原文]
Future instruction: if adding a frontend capability requires a new event, add it
to the portable event model and update all event consumers: print renderers,
JSON renderer, transcript renderer, TUI adapter, tests, and docs.

[译文]
给未来的指示:如果新增某项前端能力需要新事件,请把它加入可移植事件模型,并更新所有事件消费方:print 渲染器、JSON 渲染器、会话记录渲染器、TUI 适配器、测试与文档。

### 第一个 TUI 使用 `CodingSession`,而不是裸 `AgentHarness`(2. The first TUI used `CodingSession`, not raw `AgentHarness`)

[原文]
PR #12 intentionally built the Textual TUI on `CodingSession.prompt()` and a pure
`TuiEventAdapter`. This preserved the separation:

```text
tau_agent  -> portable brain/events
tau_coding -> coding-agent environment and UI integration
Textual    -> one rendering frontend
```

[译文]
PR #12 有意把 Textual TUI 构建在 `CodingSession.prompt()` 与纯粹的 `TuiEventAdapter` 之上。这保持了分离:

```text
tau_agent  -> 可移植大脑/事件
tau_coding -> 编码 agent 环境与 UI 集成
Textual    -> 一个渲染前端
```

[原文]
Future instruction: a new TUI should usually construct/load a `CodingSession`
and consume its event stream. Using `AgentHarness` directly bypasses commands,
persistence, resource expansion, diagnostics, compaction, session manager, and
provider settings.

[译文]
给未来的指示:新的 TUI 通常应当构建/加载一个 `CodingSession` 并消费其事件流。直接使用 `AgentHarness` 会绕过命令、持久化、资源展开、诊断、压缩、会话管理器与 provider 设置。

### 适配器/状态必须无需 Textual 即可测试(3. Adapter/state must be testable without Textual)

[原文]
The current `TuiEventAdapter` mutates `TuiState` and has no Textual dependency.
This made it possible to cover event-to-display behavior in `tests/test_tui_adapter.py`.

[译文]
当前的 `TuiEventAdapter` 修改 `TuiState`,且不依赖 Textual。这使得「事件到显示」的行为可以在 `tests/test_tui_adapter.py` 中覆盖。

[原文]
Future instruction: keep frontend state transitions pure where possible. Textual
or another UI framework should only render already-decided state.

[译文]
给未来的指示:尽可能保持前端状态转换是纯的。Textual 或其他 UI 框架应只渲染已经决定好的状态。

### 会话消息是恢复会话记录的事实来源(4. Session messages are the restored transcript source of truth)

[原文]
PR #14 restored previous session messages into the TUI transcript. The stable
pattern is:

[译文]
PR #14 把此前的会话消息恢复到 TUI 会话记录中。稳定的模式是:

```python
state.clear()
state.set_skills(session.skills)
state.load_messages(session.messages)
```

[原文]
Do not read JSONL directly from a TUI. Use `CodingSession` / `SessionManager` so
branching, compaction entries, tool metadata, and active leaf state are respected.

[译文]
不要从 TUI 直接读取 JSONL。使用 `CodingSession` / `SessionManager`,以便尊重分支、压缩条目、工具元数据与活动叶节点状态。

### 斜杠命令属于 `tau_coding`,而不是 `tau_agent`(5. Slash commands belong to `tau_coding`, not `tau_agent`)

[原文]
Command registry and command output live in the coding layer. PR #98 explicitly
reviewed commands against Pi and kept command behavior out of the harness.

[译文]
命令注册表与命令输出位于编码层。PR #98 对照 Pi 明确审阅了各命令,并把命令行为挡在 harness 之外。

[原文]
Future instruction: before sending text to the model, call
`session.handle_command(text)`. If it returns `handled=True`, perform the command
side effect in the frontend and do **not** send it to `session.prompt()` unless
the command semantics say so.

[译文]
给未来的指示:在把文本发送给模型之前,调用 `session.handle_command(text)`。如果它返回 `handled=True`,就在前端执行该命令的副作用,**不要**再把它发送给 `session.prompt()`,除非命令语义要求如此。

[原文]
`/skill:<name>` is the important exception: it is intentionally not handled as a
normal command. It is passed to `CodingSession.prompt()`, where it expands into
provider-visible/persisted skill content.

[译文]
`/skill:<name>` 是重要例外:它有意不作为普通命令处理。它会被传给 `CodingSession.prompt()`,在那里展开为对 provider 可见/持久化的技能内容。

### 仅本地命令输出不得成为模型上下文(6. Local-only command output must not become model context)

[原文]
PR #198 added `/system` as a local-only command. It displays the active system
prompt but does not append a model message and does not persist it as a normal
JSONL message entry.

[译文]
PR #198 加入了 `/system` 这条仅本地命令。它显示活动的系统提示词,但不追加模型消息,也不把它作为普通 JSONL 消息条目持久化。

[原文]
Future instruction: distinguish three outputs:

[译文]
给未来的指示:区分三种输出:

[原文]
1. model-visible and persisted conversation messages;
2. durable session metadata/state entries;
3. local UI-only command output.

[译文]
1. 对模型可见且持久化的对话消息;
2. 持久化的会话元数据/状态条目;
3. 仅本地的 UI 命令输出。

[原文]
Do not fake local command output as assistant/user messages unless it is supposed
to affect future model context.

[译文]
不要把本地命令输出伪装成 assistant/user 消息,除非它本应影响未来的模型上下文。

### 队列所有权在 harness 中(7. Queue ownership lives in the harness)

[原文]
PR #46 moved Pi-style steering/follow-up queues into `AgentHarness`. `CodingSession`
only decides when to call `harness.steer()` or `harness.follow_up()` and expands
prompt text first. The TUI only chooses keybindings and presentation.

[译文]
PR #46 把 Pi 风格的插话/追加队列移入 `AgentHarness`。`CodingSession` 只决定何时调用 `harness.steer()` 或 `harness.follow_up()`,并先展开提示文本。TUI 只选择键位与呈现方式。

[原文]
Future instruction: if a user submits while `session.is_running`/UI running is
true, do not start another prompt. Call:

[译文]
给未来的指示:如果用户在 `session.is_running`/UI 运行中为 true 时提交,不要再启动另一个提示。调用:

```python
session.prompt(text, streaming_behavior="steer")
session.prompt(text, streaming_behavior="follow_up")
```

[原文]
and render the returned `QueueUpdateEvent`.

[译文]
并渲染返回的 `QueueUpdateEvent`。

### 持久化绑定到流式 `MessageEndEvent`(8. Persistence is tied to streamed `MessageEndEvent`)

[原文]
PR #144 moved session message persistence to the streaming message boundary. This
keeps the session tree current while a run is still active and matches Pi's model
more closely.

[译文]
PR #144 把会话消息持久化移动到流式消息边界。这让会话树在运行仍然活动时就保持最新,并更贴近 Pi 的模型。

[原文]
Open issue #166 documents the tradeoff: displaying a message before persistence
would make the TUI feel faster in long sessions, but Pi currently persists before
notifying subscribers. Tau has kept the Pi-like durability guarantee for now.

[译文]
未关闭 issue #166 记录了该取舍:在持久化之前就显示消息会让 TUI 在长会话中感觉更快,但 Pi 目前在通知订阅者之前先持久化。Tau 目前保留了类似 Pi 的持久化保证。

[原文]
Future instruction: do not optimistically insert submitted user rows unless you
also solve duplicate suppression and accept the crash-window durability tradeoff.

[译文]
给未来的指示:不要乐观地插入已提交的用户行,除非你同时解决了重复抑制问题,并接受「崩溃窗口」的持久化取舍。

### 主题、键位与布局是前端策略(9. Themes, keybindings, and layout are frontend policy)

[原文]
PRs #65, #68, #85 and later theme/keybinding work kept visual choices in
`tau_coding.tui`. They must not leak into `tau_agent`.

[译文]
PR #65、#68、#85 以及后续的主题/键位工作把视觉选择保留在 `tau_coding.tui`。它们不得泄漏进 `tau_agent`。

[原文]
Future instruction: a custom TUI can ignore `~/.tau/tui.json` entirely. If it
uses it, that dependency belongs in `tau_coding`/frontend code, not the harness.

[译文]
给未来的指示:自定义 TUI 可以完全忽略 `~/.tau/tui.json`。如果它使用该文件,该依赖属于 `tau_coding`/前端代码,而不是 harness。

## 路障与经验教训(Roadblocks and lessons learned)

### 路障:重叠的提示运行会破坏会话记录或产生竞态(Roadblock: overlapping prompt runs corrupt or race the transcript)

[原文]
**Seen in:** queued-message work (#28/#46), cancellation fixes (#47), session and
compaction race fixes.

[译文]
**出现于:** 排队消息工作(#28/#46)、取消修复(#47)、会话与压缩竞态修复。

[原文]
**Symptom:** two UI workers can mutate one transcript/session at the same time,
or late events from an old run can appear after `/new` or resume.

[译文]
**症状:** 两个 UI worker 可能同时修改同一份会话记录/会话,或者旧运行的迟到事件可能在 `/new` 或恢复之后出现。

[原文]
**Root cause:** the transcript is a single ordered conversation. Starting another
run while one is active violates that invariant.

[译文]
**根因:** 会话记录是一段单一有序的对话。在已有运行活动时启动另一个运行,违反了这一不变量。

[原文]
**Resolution:**

[译文]
**解决:**

[原文]
- `AgentHarness` rejects overlapping `prompt()`/`continue_()` calls.
- Active user submissions become steering/follow-up queue entries.
- The Textual app tracks `_prompt_run_id` and ignores stale events from old
  workers.
- `/new` cancels active prompt work before swapping session state.

[译文]
- `AgentHarness` 拒绝重叠的 `prompt()`/`continue_()` 调用。
- 活动期间的用户提交会变成插话/追加队列条目。
- Textual 应用跟踪 `_prompt_run_id`,并忽略来自旧 worker 的陈旧事件。
- `/new` 在交换会话状态之前取消活动的提示工作。

[原文]
**Future instruction:** maintain a generation/run id in any frontend that can
cancel or replace active workers. Check it before applying streamed events.

[译文]
**给未来的指示:** 任何能够取消或替换活动 worker 的前端都应维护一个代际/运行 id。在应用流式事件之前检查它。

### 路障:仅靠优雅取消无法停止阻塞性工作(Roadblock: graceful cancellation alone does not stop blocking work)

[原文]
**Seen in:** issue #96, PR #99.

[译文]
**出现于:** issue #96、PR #99。

[原文]
**Symptom:** pressing Escape could request cancellation, but a blocking bash/tool
operation could continue and leave the UI stuck.

[译文]
**症状:** 按 Escape 可以请求取消,但一个阻塞的 bash/工具操作可能继续运行,让 UI 卡住。

[原文]
**Root cause:** cancellation was initially a UI/session request, not a signal
threaded through provider and tool execution.

[译文]
**根因:** 取消最初只是 UI/会话层的请求,而不是贯穿 provider 与工具执行的信号。

[原文]
**Resolution:**

[译文]
**解决:**

[原文]
- Textual requests cancellation.
- `tau_agent` carries a cancellation token through the loop.
- tool execution receives the token.
- the bash tool kills the shell process group when interrupted.
- the TUI uses a two-step mental model: graceful stop first, hard interrupt if
  needed.

[译文]
- Textual 请求取消。
- `tau_agent` 在循环中携带取消令牌。
- 工具执行接收该令牌。
- bash 工具在被中断时杀掉 shell 进程组。
- TUI 采用两步式心智模型:先优雅停止,必要时硬中断。

[原文]
**Future instruction:** cancellation must cross all async boundaries. A custom TUI
should call `session.cancel()` and should also be able to cancel its own UI worker
if it provides a hard interrupt.

[译文]
**给未来的指示:** 取消必须跨越所有异步边界。自定义 TUI 应调用 `session.cancel()`,并且如果它提供硬中断,还应能取消自己的 UI worker。

### 路障:取消或 `/new` 之后的陈旧事件(Roadblock: stale events after cancellation or `/new`)

[原文]
**Seen in:** PR #47.

[译文]
**出现于:** PR #47。

[原文]
**Symptom:** an old worker could still yield events after the visible session had
changed, adding late assistant text to the wrong transcript.

[译文]
**症状:** 在可见会话已经改变之后,旧 worker 仍可能产出事件,把迟到的 assistant 文本加到错误的会话记录里。

[原文]
**Root cause:** cancelling a worker/session is not enough; async generators and
background tasks may still deliver final events.

[译文]
**根因:** 取消一个 worker/会话并不够;异步生成器与后台任务仍可能投递最终事件。

[原文]
**Resolution:** `_prompt_run_id` increments for each new prompt/cancel/session
reset. `_run_prompt()` checks the id before applying every event and during
cleanup.

[译文]
**解决:** `_prompt_run_id` 在每次新提示/取消/会话重置时递增。`_run_prompt()` 在应用每个事件之前、以及清理期间都会检查该 id。

[原文]
**Future instruction:** a new TUI must guard against late events whenever it can:

[译文]
**给未来的指示:** 新的 TUI 必须在以下任何情况下防止迟到事件:

[原文]
- cancel a prompt;
- switch sessions;
- start a new session;
- resume a different session;
- replace frontend state.

[译文]
- 取消一个提示;
- 切换会话;
- 开始新会话;
- 恢复另一个会话;
- 替换前端状态。

### 路障:被中断的工具调用会让下一次 provider 请求非法(Roadblock: interrupted tool calls can make the next provider request invalid)

[原文]
**Seen in:** issue #116 comments, PR #169.

[译文]
**出现于:** issue #116 评论、PR #169。

[原文]
**Symptom:** OpenAI/Codex returned errors like "No tool output found for function
call ..." after a run was interrupted between assistant tool-call emission and
matching tool-result persistence.

[译文]
**症状:** 当一次运行在「assistant 发出工具调用」与「对应的工具结果持久化」之间被中断之后,OpenAI/Codex 会返回类似 "No tool output found for function call ..." 的错误。

[原文]
**Root cause:** OpenAI-compatible transcripts require every assistant tool call to
be followed by a matching tool result. Cancellation could leave the transcript
with a dangling assistant tool call.

[译文]
**根因:** OpenAI 兼容的会话记录要求每个 assistant 工具调用之后都跟着一个匹配的工具结果。取消可能让会话记录留下一个悬空的 assistant 工具调用。

[原文]
**Resolution:** `AgentHarness` repairs interrupted tool-call transcripts by
appending synthetic failed `ToolResultMessage` objects such as:

[译文]
**解决:** `AgentHarness` 通过追加合成的失败 `ToolResultMessage` 对象来修复被中断的工具调用会话记录,例如:

```text
Tool call interrupted by user
```

[原文]
The repair runs on cancelled cleanup and before the next prompt/continue. Older
builds kept the cancelled-cleanup repair only in memory: the TUI cancels the
worker consuming `session.prompt()`, so consumer-side persistence never saw it,
and session files could retain a dangling tool call that later replays (`/tree`)
sent to providers as-is.

[译文]
该修复在取消清理时、以及下一次 prompt/continue 之前运行。较旧的构建只把取消清理时的修复留在内存里:TUI 取消了消费 `session.prompt()` 的 worker,因此消费侧的持久化从未看到它,而会话文件可能保留一个悬空的工具调用,之后的重放(`/tree`)会把它原样发送给 provider。

[原文]
**Update (PR #526):** persistence is now a harness event subscriber, and the
cleanup repair is pushed to subscribers, so the synthetic result reaches the
session file at cancellation time. Load-time repair remains the backstop for
active branches damaged by older builds; historical malformed branches are a
deliberate non-goal.

[译文]
**更新(PR #526):** 持久化现在是 harness 事件的订阅者,清理修复会被推送给订阅者,因此合成的结果在取消发生时就会写入会话文件。加载时修复仍是针对「被旧构建损坏的活动分支」的兜底;历史畸形分支是有意的非目标。

[原文]
**Future instruction:** do not delete or skip tool results in UI/session code. If
a run is interrupted mid-tool, the transcript still needs matching tool-result
messages for provider validity. Persistence must stay push-based (subscribed to
the harness); do not move it back into an event-consuming loop that a frontend
can tear down.

[译文]
**给未来的指示:** 不要在 UI/会话代码中删除或跳过工具结果。如果一次运行在工具执行中途被中断,会话记录仍然需要匹配的工具结果消息,以保证 provider 侧的合法性。持久化必须保持推送式(订阅 harness);不要把它移回一个会被前端拆卸的事件消费循环。

### 路障:provider 错误过于笼统,难以调试(Roadblock: provider errors were too generic to debug)

[原文]
**Seen in:** issue #20, issue #116, PR #31, PR #169.

[译文]
**出现于:** issue #20、issue #116、PR #31、PR #169。

[原文]
**Symptom:** the transcript showed only "Provider request failed with status 400"
with no raw provider body, making model/capability/request-shape failures hard to
understand.

[译文]
**症状:** 会话记录只显示 "Provider request failed with status 400",没有原始 provider 响应体,使模型/能力/请求形态方面的失败难以理解。

[原文]
**Root cause:** user-facing errors were also the diagnostic payload.

[译文]
**根因:** 面向用户的错误同时承担了诊断载荷的角色。

[原文]
**Resolution:**

[译文]
**解决:**

[原文]
- `ErrorEvent` can carry structured `data`.
- `CodingSession` logs non-recoverable `ErrorEvent.data` to agent-call logs.
- the TUI can show the diagnostic log path while keeping transcript errors
  concise.

[译文]
- `ErrorEvent` 可以携带结构化的 `data`。
- `CodingSession` 把不可恢复的 `ErrorEvent.data` 记录到 agent-call 日志。
- TUI 可以在保持会话记录错误简洁的同时,显示诊断日志路径。

[原文]
**Future instruction:** keep user-facing errors short, but preserve structured
provider diagnostic data outside the transcript. Never log prompts or secrets
unless explicitly designed and reviewed.

[译文]
**给未来的指示:** 保持面向用户的错误简短,但把结构化的 provider 诊断数据保存在会话记录之外。绝不要记录提示词或密钥,除非经过明确设计与评审。

### 路障:排队提示需要两种不同的语义(Roadblock: queued prompts needed two different semantics)

[原文]
**Seen in:** issue #28, PR #46, issue #53/PR #92, issue #127/PR #136.

[译文]
**出现于:** issue #28、PR #46、issue #53/PR #92、issue #127/PR #136。

[原文]
**Symptom:** submitting while the agent is running could mean either "steer the
current work as soon as possible" or "do this next after the current work stops".
One queue was not enough.

[译文]
**症状:** 在 agent 运行期间提交,可能意味着「尽快改变当前工作的方向」,也可能意味着「当前工作停下之后再做这个」。一个队列不够用。

[原文]
**Resolution:**

[译文]
**解决:**

[原文]
- steering queue: drains after the current assistant turn and tool batch;
- follow-up queue: drains only when the run would otherwise stop;
- `QueueUpdateEvent` reports both queues;
- the TUI maps Enter-while-running to steering and Alt-Enter to follow-up;
- Up on an empty prompt while running can pull back the latest follow-up for
  editing.

[译文]
- 插话队列:在当前 assistant 轮次与工具批次之后排空;
- 追加队列:只在运行本应停止时才排空;
- `QueueUpdateEvent` 报告两个队列;
- TUI 把运行时按 Enter 映射为插话,把 Alt-Enter 映射为追加;
- 运行时在空提示上按 Up,可以把最近的追加拉回来编辑。

[原文]
**Future instruction:** expose both concepts in a custom TUI. Do not collapse
follow-up into steering unless intentionally changing product behavior.

[译文]
**给未来的指示:** 在自定义 TUI 中同时暴露这两个概念。除非有意改变产品行为,不要把追加折叠进插话。

### 路障:排队消息 UI 可能占用过多提示空间(Roadblock: queued-message UI could consume too much prompt space)

[原文]
**Seen in:** issue #127, PR #136.

[译文]
**出现于:** issue #127、PR #136。

[原文]
**Symptom:** multiline queued prompts rendered too many lines above the input.

[译文]
**症状:** 多行排队提示在输入框上方渲染出过多行。

[原文]
**Resolution:** queue display uses concise labels and first-line previews only.
The full queued content remains in the harness.

[译文]
**解决:** 队列显示只使用简洁标签与首行预览。完整的排队内容仍留在 harness 中。

[原文]
**Future instruction:** queue previews are display-only; never truncate the stored
queued message.

[译文]
**给未来的指示:** 队列预览仅用于显示;绝不要截断已存储的排队消息。

### 路障:长会话中提示显示感觉延迟(Roadblock: prompt display felt delayed in long sessions)

[原文]
**Seen in:** issue #166, branch `tui-yield-before-persist` commit
`a4ff9fa Improve prompt event immediacy`.

[译文]
**出现于:** issue #166、分支 `tui-yield-before-persist` 的提交 `a4ff9fa Improve prompt event immediacy`。

[原文]
**Symptom:** pressing Enter could feel slow because the TUI waited for
`MessageEndEvent`, and `CodingSession.prompt()` persisted the message before
yielding it.

[译文]
**症状:** 按 Enter 可能感觉缓慢,因为 TUI 要等待 `MessageEndEvent`,而 `CodingSession.prompt()` 会在产出该消息之前先持久化它。

[原文]
**Root cause:** event-authoritative display plus synchronous persistence side
effects in long JSONL sessions.

[译文]
**根因:** 以事件为权威的显示,加上长 JSONL 会话中的同步持久化副作用。

[原文]
**Decision so far:** keep Pi-like behavior: persist before UI notification for
completed messages. The issue remains open as a documented tradeoff.

[译文]
**目前决定:** 保留类似 Pi 的行为:对于已完成消息,先持久化再通知 UI。该 issue 仍作为已记录的取舍保持开放。

[原文]
**Future instruction:** if changing this, document the durability timing change,
add duplicate-prevention tests, and consider crash behavior between display and
write.

[译文]
**给未来的指示:** 如果改变这一点,请记录持久化时机变更、增加防重复测试,并考虑显示与写入之间的崩溃行为。

### 路障:空会话污染了 `/resume`(Roadblock: empty sessions polluted `/resume`)

[原文]
**Seen in:** issue #119/PR #142, issue #179/PR #180.

[译文]
**出现于:** issue #119/PR #142、issue #179/PR #180。

[原文]
**Symptom:** opening Tau or running `/new` without sending a message created empty
transcripts or empty indexed sessions that appeared in `/resume`.

[译文]
**症状:** 打开 Tau 或运行 `/new` 而不发送任何消息,会创建空的会话记录或已索引的空会话,并出现在 `/resume` 中。

[原文]
**Root cause:** startup/new-session initialization wrote synthetic session entries
or indexed records before the first durable user-visible mutation.

[译文]
**根因:** 启动/新建会话的初始化在第一次持久化的、用户可见的变更之前,就写入了合成的会话条目或索引记录。

[原文]
**Resolution:**

[译文]
**解决:**

[原文]
- `CodingSession` defers writing initial session-info/model/thinking entries
  until the first durable mutation.
- `SessionManager` has a prepared/unindexed session path.
- TUI startup and `/new` use pending records and index them only when initial
  durable entries flush.

[译文]
- `CodingSession` 把初始的 session-info/model/thinking 条目推迟到第一次持久化变更时才写入。
- `SessionManager` 有一条「已准备/未索引」的会话路径。
- TUI 启动与 `/new` 使用待处理记录,并且只在初始持久化条目被冲刷时才为它们建立索引。

[原文]
**Future instruction:** new frontends should not eagerly create/index sessions
just by opening a UI. First durable mutation is the correct activation point.

[译文]
**给未来的指示:** 新的前端不应仅仅因为打开 UI 就急切地创建/索引会话。第一次持久化变更是正确的激活点。

### 路障:会话管理器必须保留 provider 身份(Roadblock: session manager must preserve provider identity)

[原文]
**Seen in:** issue #117, PR #129.

[译文]
**出现于:** issue #117、PR #129。

[原文]
**Symptom:** new sessions could start on an unexpected model, especially when
same-name models existed across providers or scoped models were configured.

[译文]
**症状:** 新会话可能以意料之外的模型启动,尤其是当不同 provider 存在同名模型、或配置了 scoped 模型时。

[原文]
**Root cause:** session metadata did not always carry provider names and startup
selection did not consistently respect scoped/default/latest-directory rules.

[译文]
**根因:** 会话元数据并不总是携带 provider 名称,启动选择也没有始终遵循 scoped/默认/最近目录的规则。

[原文]
**Resolution:** session records persist provider names; startup chooses the latest
usable directory provider/model or falls back through scoped model constraints.

[译文]
**解决:** 会话记录持久化 provider 名称;启动时选择最近的可用目录 provider/模型,或沿 scoped 模型约束回退。

[原文]
**Future instruction:** model strings are not enough. Store/use provider+model
pairs in UI pickers, session records, and scoped-model logic.

[译文]
**给未来的指示:** 仅靠模型字符串不够。在 UI 选择器、会话记录与 scoped-model 逻辑中存储/使用 provider+model 配对。

### 路障:模型选择器展示了会话实际无法使用的 provider(Roadblock: model picker showed providers the session could not actually use)

[原文]
**Seen in:** issue #21, PR #33 and review comment.

[译文]
**出现于:** issue #21、PR #33 及评审评论。

[原文]
**Symptom:** model picker considered a provider usable because credentials existed
in the session Tau home, but switching provider could fail if provider creation
used the default credential store.

[译文]
**症状:** 模型选择器会因为会话 Tau 主目录中存在凭据而认为某 provider 可用,但如果 provider 构建使用的是默认凭据存储,切换 provider 仍可能失败。

[原文]
**Root cause:** availability checks and provider construction used different
credential-store scopes.

[译文]
**根因:** 可用性检查与 provider 构建使用了不同作用域的凭据存储。

[原文]
**Resolution:** provider/model choices are filtered by usable credentials and
session-scoped credential stores are used when switching providers.

[译文]
**解决:** provider/模型选项按可用凭据过滤,并在切换 provider 时使用会话作用域的凭据存储。

[原文]
**Future instruction:** any custom picker must ask `CodingSession` for available
choices. Do not independently inspect environment variables or credential files.

[译文]
**给未来的指示:** 任何自定义选择器都必须向 `CodingSession` 询问可用选项。不要独立检查环境变量或凭据文件。

### 路障:thinking 控件因 provider/模型而异(Roadblock: thinking controls are provider/model-specific)

[原文]
**Seen in:** issue #22/PR #42, issue #55/PR #113, issue #120, issue #125/PR #147.

[译文]
**出现于:** issue #22/PR #42、issue #55/PR #113、issue #120、issue #125/PR #147。

[原文]
**Symptom:** a generic thinking toggle could send unsupported request fields or
hide available reasoning streams.

[译文]
**症状:** 一个通用的 thinking 开关可能发送不受支持的请求字段,或者隐藏可用的推理流。

[原文]
**Root cause:** providers expose reasoning controls differently:

[译文]
**根因:** 各 provider 暴露推理控制的方式不同:

[原文]
- OpenAI-compatible chat completions may use top-level `reasoning_effort`;
- Responses/Codex-style transports may use `reasoning: { effort: ... }`;
- Anthropic thinking may involve model-specific budgets/adaptive behavior;
- some models stream reasoning but do not support configurable effort.

[译文]
- OpenAI 兼容 chat completions 可能使用顶层 `reasoning_effort`;
- Responses/Codex 风格传输可能使用 `reasoning: { effort: ... }`;
- Anthropic 的 thinking 可能涉及模型特有的预算/自适应行为;
- 有些模型会流式输出推理,但不支持可配置的 effort。

[原文]
**Resolution:** capability metadata lives in `tau_coding`; providers receive only
validated provider-specific runtime parameters; the TUI shows unavailable reasons.
Thinking deltas flow through `ThinkingDeltaEvent` and display is hidden by
default. Thinking level can be changed while a run is active, but it applies to
future turns.

[译文]
**解决:** 能力元数据位于 `tau_coding`;provider 只接收经过校验的 provider 特有运行时参数;TUI 展示不可用的原因。Thinking 增量经由 `ThinkingDeltaEvent` 流动,默认隐藏显示。运行期间可以修改 thinking 等级,但它作用于后续轮次。

[原文]
**Future instruction:** never assume a model supports configurable thinking just
because it streams reasoning tokens. Add live-provider validation before adding a
model to `thinking_models`.

[译文]
**给未来的指示:** 绝不要仅因为某个模型会流式输出推理 token 就假定它支持可配置 thinking。把模型加入 `thinking_models` 之前,先做真实 provider 验证。

### 路障:重试需要可见,但不能成为内容(Roadblock: retries needed to be visible without becoming content)

[原文]
**Seen in:** issue #34, PR #43.

[译文]
**出现于:** issue #34、PR #43。

[原文]
**Symptom:** transient provider failures should be retried, and users need to know
why the UI is waiting, but retry notices are not assistant messages.

[译文]
**症状:** 瞬时的 provider 失败应当重试,用户需要知道 UI 为什么在等待,但重试提示并不是 assistant 消息。

[原文]
**Resolution:** provider retries become agent-level `RetryEvent` values and render
as status rows.

[译文]
**解决:** provider 重试变成 agent 级的 `RetryEvent`,渲染为状态行。

[原文]
**Future instruction:** render retries as status/diagnostic UI. Do not append them
as user or assistant messages.

[译文]
**给未来的指示:** 把重试渲染为状态/诊断 UI。不要把它们追加为用户或 assistant 消息。

### 路障:工具结果要么不透明,要么太啰嗦(Roadblock: tool results were either opaque or too verbose)

[原文]
**Seen in:** issue #18/PR #26, issue #102, issue #157/PR #154, Phase 23 notes.

[译文]
**出现于:** issue #18/PR #26、issue #102、issue #157/PR #154、Phase 23 笔记。

[原文]
**Symptom:** hiding tool output made the agent feel opaque; showing full tool
output flooded the transcript.

[译文]
**症状:** 隐藏工具输出让 agent 显得不透明;展示完整工具输出又会淹没会话记录。

[原文]
**Resolution:** the TUI renders tool calls collapsed by default with bounded
previews and an expansion toggle. Edit tool results preserve patch metadata and
can render colored diffs. A broad configurable tool-output preview feature was
closed as too complex for minimalist Tau (#102), but the rendering-focused
preview pattern remained.

[译文]
**解决:** TUI 默认折叠渲染工具调用,提供有界预览与展开开关。Edit 工具结果保留 patch 元数据,并可渲染彩色 diff。一个宽泛的「可配置工具输出预览」特性因对极简的 Tau 过于复杂而被关闭(#102),但以渲染为中心的预览模式保留了下来。

[原文]
**Future instruction:** tool output visibility is frontend policy. Preserve full
tool result data in messages/session state; render bounded previews by default.

[译文]
**给未来的指示:** 工具输出可见性是前端策略。在消息/会话状态中保留完整工具结果数据;默认渲染有界预览。

### 路障:显式与 agent 发起的技能使用需要紧凑显示(Roadblock: explicit and agent-initiated skill use needed compact display)

[原文]
**Seen in:** issue #51/PR #94, issue #123/PR #148.

[译文]
**出现于:** issue #51/PR #94、issue #123/PR #148。

[原文]
**Symptom:** expanded skill prompts and skill-file reads looked like ordinary
messages/tool calls, obscuring when a skill was used.

[译文]
**症状:** 展开后的技能提示与技能文件读取看起来像普通消息/工具调用,掩盖了技能被使用的事实。

[原文]
**Root cause:** skill invocation is model context, but the full skill content is
not a pleasant transcript display.

[译文]
**根因:** 技能调用属于模型上下文,但完整的技能内容并不适合直接作为会话记录展示。

[原文]
**Resolution:**

[译文]
**解决:**

[原文]
- explicit `/skill:<name>` expansion remains in `CodingSession`, provider-visible
  and persisted;
- the TUI parses structured skill blocks and renders compact `Using skill: ...`;
- agent-initiated reads of known skill files are detected using loaded skill
  metadata in `TuiState` and rendered with skill styling;
- `tau_agent` events/tool calls remain unchanged.

[译文]
- 显式的 `/skill:<name>` 展开仍留在 `CodingSession`,对 provider 可见且被持久化;
- TUI 解析结构化技能块,并渲染紧凑的 `Using skill: ...`;
- agent 发起的、对已知技能文件的读取,会利用 `TuiState` 中已加载的技能元数据被识别,并以技能样式渲染;
- `tau_agent` 的事件/工具调用保持不变。

[原文]
**Future instruction:** do not add skill-specific UI policy to `tau_agent`. Keep
skill interpretation in `tau_coding` or frontend state.

[译文]
**给未来的指示:** 不要把技能特有的 UI 策略加入 `tau_agent`。把技能解释留在 `tau_coding` 或前端状态。

### 路障:斜杠命令自动补全排序有误导性(Roadblock: slash-command autocomplete ranking was misleading)

[原文]
**Seen in:** issue #114, PR #140.

[译文]
**出现于:** issue #114、PR #140。

[原文]
**Symptom:** typing `/resume` could select `/new` first because search-term
matches were not ranked below direct command/alias prefix matches.

[译文]
**症状:** 输入 `/resume` 可能首先选中 `/new`,因为搜索词匹配没有排到直接命令/别名前缀匹配之后。

[原文]
**Resolution:** command completions rank direct command/alias matches before
fallback search terms.

[译文]
**解决:** 命令补全把直接命令/别名匹配排在兜底搜索词之前。

[原文]
**Future instruction:** command autocomplete needs scoring, not only filtering.
Aliases and search terms have different intent.

[译文]
**给未来的指示:** 命令自动补全需要打分,而不仅仅是过滤。别名与搜索词的意图不同。

### 路障:已完成的命令 token 仍显示自动补全(Roadblock: completed command tokens kept showing autocomplete)

[原文]
**Seen in:** issue #173, PR #174 and PR comments.

[译文]
**出现于:** issue #173、PR #174 及 PR 评论。

[原文]
**Symptom:** after selecting `/skill:review ` or a custom prompt command and
starting arguments, generic command suggestions stayed open and became visual
noise.

[译文]
**症状:** 在选择 `/skill:review ` 或某个自定义提示命令并开始输入参数之后,通用命令建议仍然打开,成为视觉噪音。

[原文]
**Complication:** custom prompt names can collide with built-in commands such as
`/model`, and some built-in commands have argument completions.

[译文]
**复杂之处:** 自定义提示名可能与 `/model` 等内置命令冲突,而且部分内置命令带有参数补全。

[原文]
**Resolution:** hide generic command-name autocomplete after an exact completed
command token plus space, but preserve argument-specific completions for commands
like `/model`, `/theme`, `/resume`, `/login`, etc. Registered command argument
completions take precedence over prompt-template hiding.

[译文]
**解决:** 在「精确完成的命令 token + 空格」之后隐藏通用命令名补全,但为 `/model`、`/theme`、`/resume`、`/login` 等命令保留参数级补全。已注册命令的参数补全优先于提示词模板的隐藏。

[原文]
**Future instruction:** implement autocomplete as a pure state builder and test
collisions. Do not bury this logic inside widget key handlers.

[译文]
**给未来的指示:** 把自动补全实现为纯状态构建器,并测试冲突。不要把这段逻辑埋进组件的按键处理器里。

### 路障:自定义提示词模板是动态斜杠命令(Roadblock: custom prompt templates are dynamic slash commands)

[原文]
**Seen in:** issue #151, PR #152, PR #171.

[译文]
**出现于:** issue #151、PR #152、PR #171。

[原文]
**Symptom:** `.agents/prompts/example.md` did not work as `/example`.

[译文]
**症状:** `.agents/prompts/example.md` 不能作为 `/example` 使用。

[原文]
**Resolution:** loaded prompt templates are exposed as dynamic slash commands and
expanded by `CodingSession` before provider submission. Missing template variables
render as blank text, and invocation arguments are appended unless the template
explicitly references `{{ arguments }}` / `{{ args }}`.

[译文]
**解决:** 已加载的提示词模板作为动态斜杠命令暴露,并在提交给 provider 之前由 `CodingSession` 展开。缺失的模板变量渲染为空文本,而调用参数会被追加,除非模板显式引用了 `{{ arguments }}` / `{{ args }}`。

[原文]
**Future instruction:** prompt-template expansion belongs in `CodingSession`, not
in the TUI. The TUI should only offer completions and submit the resulting text.

[译文]
**给未来的指示:** 提示词模板展开属于 `CodingSession`,不属于 TUI。TUI 只应提供补全并提交生成的文本。

### 路障:终端命令需要独立的上下文语义(Roadblock: terminal commands needed separate context semantics)

[原文]
**Seen in:** issue #49/PR #93, issue #146/PR #153, issue #103/PR #108.

[译文]
**出现于:** issue #49/PR #93、issue #146/PR #153、issue #103/PR #108。

[原文]
**Behavior:**

[译文]
**行为:**

[原文]
- `! command` runs in the session cwd, displays output, and adds output to model
  context.
- `!! command` runs and displays output without adding it to context/history.

[译文]
- `! command` 在会话 cwd 中运行、显示输出,并把输出加入模型上下文。
- `!! command` 运行并显示输出,但不把它加入上下文/历史。

[原文]
**Roadblock:** these commands initially felt detached from agent tool-call UI.

[译文]
**路障:** 这些命令最初与 agent 工具调用 UI 感觉割裂。

[原文]
**Resolution:** the TUI renders terminal commands immediately as tool-like rows,
updates the same row on completion, styles success/failure, and limits output
previews. Shell-mode path autocomplete preserves the `!`/`!!` prefix.

[译文]
**解决:** TUI 立即把终端命令渲染为类工具行,在完成时更新同一行,为成功/失败设置样式,并限制输出预览。Shell 模式的路径补全保留 `!`/`!!` 前缀。

[原文]
**Future instruction:** terminal commands are `tau_coding` features. A frontend
may render them like tools, but should preserve `!` versus `!!` context semantics.

[译文]
**给未来的指示:** 终端命令是 `tau_coding` 的特性。前端可以把它们渲染得像工具,但应保留 `!` 与 `!!` 的上下文语义差异。

### 路障:压缩与输入、提示、队列及会话变更竞态(Roadblock: compaction races with typing, prompts, queues, and session changes)

[原文]
**Seen in:** issue #52/PR #107, issue #164/PR #168 and review comments.

[译文]
**出现于:** issue #52/PR #107、issue #164/PR #168 及评审评论。

[原文]
**Symptoms:**

[译文]
**症状:**

[原文]
- input was disabled during compaction, preventing users from drafting;
- making compaction non-exclusive let `/new`/`/resume` run while compaction was
  still mutating the old session;
- compaction could start during an active agent turn or queued follow-up;
- a long/stuck compaction needed cancellation.

[译文]
- 压缩期间输入被禁用,用户无法起草;
- 让压缩变为非独占之后,`/new`/`/resume` 可能在压缩仍在修改旧会话时运行;
- 压缩可能在活动 agent 轮次或已排队的追加期间开始;
- 长时间/卡住的压缩需要可取消。

[原文]
**Resolution:**

[译文]
**解决:**

[原文]
- manual compaction runs in a non-exclusive worker so the prompt editor stays
  usable;
- prompt submission remains blocked until compaction finishes;
- session-changing commands are blocked while compaction is active;
- manual compaction cannot start while an agent run or queued messages are active;
- Escape cancels active compaction before prompt cancellation;
- on cancellation, visible state reloads from the current session.

[译文]
- 手动压缩运行在非独占 worker 中,使提示编辑器保持可用;
- 提示提交仍被阻塞,直到压缩完成;
- 压缩活动期间,改变会话的命令被阻塞;
- 当 agent 运行或排队消息活动时,手动压缩不能开始;
- Escape 在取消提示之前先取消活动压缩;
- 取消时,可见状态从当前会话重新加载。

[原文]
**Future instruction:** separate "can type" from "can submit/mutate session".
Do not let compaction overlap session switching or active agent turns.

[译文]
**给未来的指示:** 把「可以输入」与「可以提交/修改会话」分开。不要让压缩与会话切换或活动 agent 轮次重叠。

### 路障:用户消息之后的会话树分支不一致(Roadblock: session tree branching after user messages was inconsistent)

[原文]
**Seen in:** issue #57/PR #101, issue #143/PR #161 and review comment.

[译文]
**出现于:** issue #57/PR #101、issue #143/PR #161 及评审评论。

[原文]
**Symptom:** selecting a user message in `/tree` could continue from after that
message or from an incomplete turn, instead of letting the user edit/resubmit it.
The root/first-user-message case also needed special empty-branch replay on load.

[译文]
**症状:** 在 `/tree` 中选中某条用户消息,可能从该消息之后继续,或从一个不完整的轮次继续,而不是让用户编辑/重新提交它。根/首条用户消息的情况还需要在加载时做特殊的空分支重放。

[原文]
**Resolution:** selecting a user message branches to that message's parent entry
and returns an `input_prefill` for the TUI. The prompt is populated, but the
message is not sent until the user presses Enter. Explicit empty leaf replay is
supported for branching before the first user message.

[译文]
**解决:** 选中某条用户消息会分支到该消息的父条目,并为 TUI 返回一个 `input_prefill`。提示输入会被填充,但只有用户按下 Enter 才会发送该消息。对于在首条用户消息之前分支的情况,支持显式的空叶节点重放。

[原文]
**Future instruction:** branch navigation changes active history; it should not
implicitly replay selected user input. Rebuild transcript from `session.messages`
and prefill the editor if the branch result asks for it.

[译文]
**给未来的指示:** 分支导航会改变活动历史;它不应隐式重放所选的用户输入。从 `session.messages` 重建会话记录,并在分支结果要求时预填充编辑器。

### 路障:分支摘要与压缩摘要是上下文,但 UI 上很吵(Roadblock: branch summaries and compaction summaries are context, but noisy UI)

[原文]
**Seen in:** PR #101, PR #107, `TuiState.add_user_message()`.

[译文]
**出现于:** PR #101、PR #107、`TuiState.add_user_message()`。

[原文]
**Symptom:** branch/compaction summaries are represented as user-context messages
for replay, but showing the full summary inline can overwhelm the transcript.

[译文]
**症状:** 分支/压缩摘要为了重放而以用户上下文消息表示,但把完整摘要内联展示会淹没会话记录。

[原文]
**Resolution:** `TuiState` detects known summary message formats and renders
compact `branch_summary` / `compaction_summary` items with expansion text.

[译文]
**解决:** `TuiState` 检测已知的摘要消息格式,并渲染紧凑的 `branch_summary` / `compaction_summary` 条目,附带展开文本。

[原文]
**Future instruction:** some user-role messages are system-generated context.
Frontend state may render them specially, but must preserve them in the session
messages for provider context.

[译文]
**给未来的指示:** 有些 user 角色消息是系统生成的上下文。前端状态可以特殊渲染它们,但必须把它们保留在会话消息中,以构成 provider 上下文。

### 路障:自定义渲染下会话记录的选择与复制很困难(Roadblock: transcript selection and copy were hard with custom rendering)

[原文]
**Seen in:** issue #19/PR #39, issue #32/PR #40, issue #58/PR #67, issue #150,
issue #156, PR #154.

[译文]
**出现于:** issue #19/PR #39、issue #32/PR #40、issue #58/PR #67、issue #150、issue #156、PR #154。

[原文]
**Symptoms:**

[译文]
**症状:**

[原文]
- selecting/copying text worked only on some lines;
- wrapped lines broke coordinate mapping;
- custom selection painting caused flicker/corruption;
- decorative gutters could pollute selected text.

[译文]
- 选择/复制文本只在部分行上有效;
- 折行会破坏坐标映射;
- 自定义的选择绘制导致闪烁/损坏;
- 装饰性的边栏可能污染选中文本。

[原文]
**Root cause:** Tau initially tried to own too much of the rendering and selection
model.

[译文]
**根因:** Tau 最初试图自己掌控过多的渲染与选择模型。

[原文]
**Resolution:** move toward Toad-style native Textual widgets:

[译文]
**解决:** 转向 Toad 风格的原生 Textual 组件:

[原文]
- streaming assistant/thinking messages use Textual Markdown directly;
- Textual owns native selection for Markdown blocks;
- decorative gutters are non-selectable;
- custom selection is reserved for truly virtual renderers;
- selected-message copy remains as a keyboard fallback.

[译文]
- 流式的 assistant/thinking 消息直接使用 Textual Markdown;
- Textual 持有 Markdown 块的原生选择;
- 装饰性边栏不可选择;
- 自定义选择只留给真正的虚拟渲染器;
- 选中消息的复制保留为键盘兜底。

[原文]
**Future instruction:** prefer the UI toolkit's native text/Markdown selection
when possible. Avoid coordinate-mapped copy extraction for soft-wrapped content.

[译文]
**给未来的指示:** 尽可能优先使用 UI 工具箱的原生文本/Markdown 选择。对于软折行内容,避免按坐标映射提取复制文本。

### 路障:流式会话记录更新破坏了滚动回看(Roadblock: streaming transcript updates broke scrollback)

[原文]
**Seen in:** issue #175, PR #177, earlier PR #154.

[译文]
**出现于:** issue #175、PR #177,以及更早的 PR #154。

[原文]
**Symptom:** while assistant tokens streamed, trying to scroll up snapped the
viewport back to the bottom.

[译文]
**症状:** 当 assistant token 流式输出时,试图向上滚动会让视口弹回底部。

[原文]
**Root causes:**

[译文]
**根因:**

[原文]
- full transcript refreshes/remounts on each token can reset scroll state;
- unconditional `scroll_end()` pulls users back down;
- Textual's deferred `scroll_end()` can execute after the user scrolls up;
- fractional smooth-scroll values near bottom made bottom detection too eager.

[译文]
- 每个 token 都做整份会话记录的刷新/重挂载,会重置滚动状态;
- 无条件的 `scroll_end()` 会把用户拉回底部;
- Textual 延迟执行的 `scroll_end()` 可能在用户向上滚动之后才执行;
- 接近底部的小数平滑滚动值让底部检测过于急切。

[原文]
**Resolution:**

[译文]
**解决:**

[原文]
- update active streaming widgets incrementally;
- refresh chrome separately from transcript;
- follow output only if the transcript was already pinned to bottom;
- track explicit upward scrollback;
- replace direct deferred `scroll_end()` calls with a helper that re-checks
  follow mode after layout before scrolling immediately;
- upward scroll motion wins over the bottom check.

[译文]
- 增量更新活动的流式组件;
- 把界面外壳的刷新与会话记录分开;
- 只有在会话记录本来就固定在底部时才跟随输出;
- 跟踪显式的向上回看;
- 把直接的延迟 `scroll_end()` 调用替换为一个辅助函数:它在布局之后重新检查跟随模式,然后才立即滚动;
- 向上的滚动手势优先于底部判定。

[原文]
**Future instruction:** streaming UIs must distinguish "follow mode" from "always
scroll to end". Never remount the whole transcript for every token.

[译文]
**给未来的指示:** 流式 UI 必须区分「跟随模式」与「总是滚到底部」。绝不要为每个 token 重挂载整份会话记录。

### 路障:代码块渲染有多个边界情况(Roadblock: code block rendering had multiple edge cases)

[原文]
**Seen in:** issue #59/PR #66, PR #190.

[译文]
**出现于:** issue #59/PR #66、PR #190。

[原文]
**Symptoms:**

[译文]
**症状:**

[原文]
- unknown fenced-code languages could break syntax rendering;
- long code lines were clipped with no horizontal scrollbar;
- showing a scrollbar when not needed was noisy.

[译文]
- 未知的围栏代码语言可能破坏语法渲染;
- 很长的代码行被裁切,且没有横向滚动条;
- 不需要滚动条时显示它也很吵。

[原文]
**Resolution:**

[译文]
**解决:**

[原文]
- validate lexer names and fall back unknown languages to plain text;
- use horizontal overflow scrolling for Markdown fences;
- show the scrollbar only on overflow.

[译文]
- 校验 lexer 名称,未知语言回退为纯文本;
- 对 Markdown 围栏使用横向溢出滚动;
- 只在溢出时显示滚动条。

[原文]
**Future instruction:** model-generated fence labels are untrusted. Treat syntax
highlighting as best-effort and always provide a plain fallback.

[译文]
**给未来的指示:** 模型生成的围栏标签是不可信的。把语法高亮当作尽力而为,并始终提供纯文本回退。

### 路障:视觉通知变得嘈杂(Roadblock: visual notifications became noisy)

[原文]
**Seen in:** issue #81/PR #88, issue #121/PR #137, issue #122/PR #138, issue
#124/PR #135, issue #127/PR #136.

[译文]
**出现于:** issue #81/PR #88、issue #121/PR #137、issue #122/PR #138、issue #124/PR #135、issue #127/PR #136。

[原文]
**Symptoms:** repeated toasts stacked, session-start notifications were noisy,
thinking toggle notifications were unnecessary, and long queue labels used too
much space.

[译文]
**症状:** 重复的 toast 会堆叠、会话开始通知很吵、thinking 开关通知没有必要,而冗长的队列标签占用过多空间。

[原文]
**Resolution:**

[译文]
**解决:**

[原文]
- dedupe active notifications by message/severity;
- use notifications for short confirmations like successful `/name`;
- use modals for longer command information;
- use transcript/status rows for local outputs that should remain visible;
- remove noisy notifications for purely local toggles.

[译文]
- 按消息/严重程度对活动通知去重;
- 用通知承载 `/name` 成功之类的短确认;
- 用模态框承载较长的命令信息;
- 用会话记录/状态行承载应保持可见的本地输出;
- 移除纯本地开关产生的吵闹通知。

[原文]
**Future instruction:** choose output surface deliberately:

[译文]
**给未来的指示:** 有意识地选择输出界面:

[原文]
- transient toast: short confirmation;
- modal/picker: reference or multi-line command output;
- status row: run/retry/cancel/tool progress;
- transcript item: only if the user should see it in conversation history;
- durable message: only if the model should see it later.

[译文]
- 瞬时 toast:短确认;
- 模态框/选择器:参考资料或多行命令输出;
- 状态行:运行/重试/取消/工具进度;
- 会话记录条目:仅当用户应在对话历史中看到它时;
- 持久化消息:仅当模型之后应看到它时。

### 路障:登录/模型/provider UI 不得持有 provider 逻辑(Roadblock: login/model/provider UI must not own provider logic)

[原文]
**Seen in:** PRs #33, #90, #100, #129, #149.

[译文]
**出现于:** PR #33、#90、#100、#129、#149。

[原文]
**Lessons:**

[译文]
**经验:**

[原文]
- model/provider choices come from `CodingSession`, already filtered for usable
  credentials and scoped settings;
- provider+model pairs matter;
- login/logout mutate credential stores and refresh provider settings;
- environment variables and provider config are distinct from stored Tau
  credentials.

[译文]
- 模型/provider 选项来自 `CodingSession`,已经按可用凭据与 scoped 设置过滤;
- provider+model 配对很重要;
- 登录/登出会修改凭据存储并刷新 provider 设置;
- 环境变量与 provider 配置不同于已存储的 Tau 凭据。

[原文]
**Future instruction:** custom pickers should be thin selectors over
`CodingSession` methods. They should not reimplement provider configuration.

[译文]
**给未来的指示:** 自定义选择器应当是 `CodingSession` 方法之上的薄选择层。它们不应重新实现 provider 配置。

### 路障:测试对本地凭据与 UI 框架细节变得敏感(Roadblock: tests became sensitive to local credentials and UI framework details)

[原文]
**Seen in:** several PR notes, especially #152 and #153.

[译文]
**出现于:** 若干 PR 笔记,尤其是 #152 与 #153。

[原文]
**Symptoms:** full test runs could fail locally because stored credentials changed
default provider availability; Textual rendering tests were sensitive to theme,
formatting, and terminal behavior.

[译文]
**症状:** 完整测试在本地可能失败,因为已存储凭据改变了默认 provider 的可用性;Textual 渲染测试对主题、格式与终端行为敏感。

[原文]
**Resolution pattern:**

[译文]
**解决模式:**

[原文]
- use fake sessions/providers for deterministic event-stream tests;
- test pure helpers (`TuiEventAdapter`, `build_completion_state`) separately from
  Textual widgets;
- add focused regression tests for each roadblock;
- reserve manual validation for terminal behaviors that are hard to simulate,
  such as scrolling and selection.

[译文]
- 用假会话/provider 做确定性事件流测试;
- 把纯辅助函数(`TuiEventAdapter`、`build_completion_state`)与 Textual 组件分开测试;
- 为每个路障添加聚焦回归测试;
- 把难以模拟的终端行为(例如滚动与选择)留给手动验证。

[原文]
**Future instruction:** for new TUI work, write tests at the lowest possible
layer first, then add one or two integration tests for the Textual/custom UI
surface.

[译文]
**给未来的指示:** 对于新的 TUI 工作,先在尽可能低的层写测试,然后为 Textual/自定义 UI 界面加一两个集成测试。

## 未来自定义 TUI 的推荐构建计划(Recommended build plan for a future custom TUI)

[原文]
1. **Start from `CodingSession`, not Textual internals.**
   Load/create a session the same way the CLI does. Use session properties and
   methods as your API.

[译文]
1. **从 `CodingSession` 出发,而不是 Textual 内部实现。**
   像 CLI 那样加载/创建会话。把会话的属性与方法当作你的 API。

[原文]
2. **Implement an event consumer for every `AgentEvent`.**
   It can reuse `TuiEventAdapter` or define a new pure adapter. Handle unknown
   future events defensively if your code sees a `type` string it does not know.

[译文]
2. **为每一种 `AgentEvent` 实现事件消费。**
   可以复用 `TuiEventAdapter`,也可以定义新的纯适配器。如果你的代码遇到不认识的 `type` 字符串,要对未来未知事件做防御式处理。

[原文]
3. **Restore transcript from `session.messages`.**
   Do this on startup, resume, `/new`, tree branch, compaction completion, model
   provider changes that reload state, and cancellation recovery.

[译文]
3. **从 `session.messages` 恢复会话记录。**
   在启动、恢复、`/new`、树分支、压缩完成、会重载状态的模型 provider 变更,以及取消恢复时都这样做。

[原文]
4. **Handle commands before prompts.**
   Use `session.handle_command(text)`. Keep command output local unless the
   command explicitly adds context.

[译文]
4. **在提示之前处理命令。**
   使用 `session.handle_command(text)`。除非命令显式添加上下文,否则保持命令输出为本地。

[原文]
5. **Queue while running.**
   Do not start overlapping runs. Use `streaming_behavior="steer"` or
   `"follow_up"` and render `QueueUpdateEvent`.

[译文]
5. **运行期间排队。**
   不要启动重叠运行。使用 `streaming_behavior="steer"` 或 `"follow_up"`,并渲染 `QueueUpdateEvent`。

[原文]
6. **Guard stale workers.**
   Maintain a run/session generation id. Ignore late events after cancellation,
   `/new`, resume, or tree branch.

[译文]
6. **守护陈旧 worker。**
   维护运行/会话代际 id。在取消、`/new`、恢复或树分支之后,忽略迟到事件。

[原文]
7. **Use cancellation in layers.**
   Call `session.cancel()` for graceful cancellation and cancel your UI worker for
   hard interruption. Continue to expect recoverable cancellation events.

[译文]
7. **分层使用取消。**
   调用 `session.cancel()` 做优雅取消,取消你的 UI worker 做硬中断。继续预期可恢复的取消事件。

[原文]
8. **Separate display state from durable state.**
   A UI transcript row is not automatically a model message. Local command output,
   retry status, notifications, and hidden thinking text have different
   persistence semantics.

[译文]
8. **把显示状态与持久化状态分开。**
   UI 会话记录中的一行并不自动等于模型消息。本地命令输出、重试状态、通知与隐藏的 thinking 文本各有不同的持久化语义。

[原文]
9. **Stream incrementally.**
   Do not rebuild/remount the entire transcript on every token. Track scroll
   follow mode explicitly.

[译文]
9. **增量流式。**
   不要为每个 token 重建/重挂载整份会话记录。显式跟踪滚动跟随模式。

[原文]
10. **Keep autocomplete pure.**
    Build a completion state from text+session metadata, then let the UI apply a
    selected replacement. Test command/prompt/skill collisions.

[译文]
10. **保持自动补全纯粹。**
    从文本 + 会话元数据构建补全状态,再让 UI 应用所选替换。测试命令/提示词/技能之间的冲突。

[原文]
11. **Block dangerous concurrent mutations.**
    Do not allow compaction, session switching, model switching, or tree branching
    to race an active prompt unless the session API explicitly supports it.

[译文]
11. **阻止危险的并发变更。**
    除非会话 API 显式支持,不要让压缩、会话切换、模型切换或树分支与活动提示竞态。

[原文]
12. **Render tools compactly by default.**
    Preserve full results in session state, but show bounded previews and provide
    an expansion path.

[译文]
12. **默认紧凑渲染工具。**
    在会话状态中保留完整结果,但展示有界预览,并提供展开路径。

[原文]
13. **Respect provider/model capabilities.**
    Ask `CodingSession` what is available. Do not infer thinking/model support in
    the frontend.

[译文]
13. **尊重 provider/模型能力。**
    向 `CodingSession` 询问可用项。不要在前端推断 thinking/模型支持。

[原文]
14. **Document any new frontend-only behavior.**
    If it affects user-visible behavior, add a dev note and user docs. If it
    affects the event contract, update all renderers and tests.

[译文]
14. **为任何新的仅前端行为写文档。**
    如果它影响用户可见行为,添加开发笔记与用户文档。如果它影响事件契约,更新所有渲染器与测试。

## 最小自定义前端伪代码(Minimal custom frontend pseudocode)

```python
async def submit(text: str) -> None:
    command = session.handle_command(text)
    if command.handled:
        await apply_command_result(command)
        return

    if ui_state.running:
        async for event in session.prompt(text, streaming_behavior="steer"):
            adapter.apply(event)
            redraw()
        return

    run_id = next_run_id()
    async for event in session.prompt(text):
        if run_id != current_run_id:
            return
        adapter.apply(event)
        redraw_event_incrementally_if_possible(event)
```

[原文]
For cancellation:

[译文]
取消:

```python
def cancel() -> None:
    invalidate_current_run_id()
    session.cancel()
    cancel_ui_worker_if_needed()
```

[原文]
For session changes:

[译文]
会话变更:

```python
async def resume(session_id: str) -> None:
    invalidate_current_run_id()
    session.cancel()
    await session.resume(session_id)
    state.clear()
    state.set_skills(session.skills)
    state.load_messages(session.messages)
    redraw()
```

## 未来 TUI 工作的测试清单(Testing checklist for future TUI work)

[原文]
Add or update tests in the closest layer:

[译文]
在最近的层中添加或更新测试:

[原文]
- `tests/test_agent_loop.py` for raw event emission rules.
- `tests/test_agent_harness.py` for transcript, queues, cancellation, and repair.
- `tests/test_coding_session.py` for persistence, commands, resources,
  compaction, provider settings, and session manager behavior.
- `tests/test_tui_adapter.py` for event-to-display state behavior.
- `tests/test_tui_autocomplete.py` for completions.
- `tests/test_tui_app.py` or equivalent for UI worker/keybinding/picker behavior.

[译文]
- `tests/test_agent_loop.py`:原始事件产出规则。
- `tests/test_agent_harness.py`:会话记录、队列、取消与修复。
- `tests/test_coding_session.py`:持久化、命令、资源、压缩、provider 设置与会话管理器行为。
- `tests/test_tui_adapter.py`:事件到显示状态的行为。
- `tests/test_tui_autocomplete.py`:补全。
- `tests/test_tui_app.py` 或等价文件:UI worker/键位/选择器行为。

[原文]
Regression cases that should exist for any serious new TUI:

[译文]
任何认真的新 TUI 都应具备的回归用例:

[原文]
- user prompt echo appears once;
- assistant deltas stream and final message flushes correctly;
- tool start/end attaches result to the right row;
- non-recoverable provider error stops running UI and shows diagnostic path if
  available;
- recoverable cancellation is status, not fatal error;
- stale events after cancellation/session switch are ignored;
- active-run submit queues instead of overlapping;
- queued follow-up can be edited without losing full content;
- session resume/new/tree/compaction rebuilds transcript from `session.messages`;
- `/system`-style local output is not persisted or sent to provider;
- compaction cannot race active prompts/queues/session switches;
- scrollback is preserved during streaming;
- unknown code fence languages do not break rendering;
- argument completions survive command/prompt name collisions.

[译文]
- 用户提示回显只出现一次;
- assistant 增量正确流式输出,最终消息正确冲刷;
- 工具 start/end 把结果挂到正确的行上;
- 不可恢复的 provider 错误会停止运行中的 UI,并在可用时显示诊断路径;
- 可恢复的取消显示为状态,而不是致命错误;
- 取消/会话切换之后的陈旧事件被忽略;
- 活动运行期间的提交会排队,而不是重叠;
- 排队的追加消息可以被编辑,且完整内容不丢失;
- 会话恢复/新建/树/压缩都从 `session.messages` 重建会话记录;
- `/system` 风格的本地输出不被持久化,也不发送给 provider;
- 压缩不能与活动提示/队列/会话切换竞态;
- 流式输出期间保留滚动回看;
- 未知的代码围栏语言不会破坏渲染;
- 参数补全能在命令/提示词重名冲突下存活。

## 未决问题与未来工作(Open questions and future work)

### 自定义 TUI 的加载/发现(Custom TUI loading/discovery)

[原文]
Issue #205 tracks explicit support for custom TUI selection/discovery, e.g.
`tau --tui my-custom-tui`. The likely architecture is:

[译文]
Issue #205 跟踪对自定义 TUI 选择/发现的显式支持,例如 `tau --tui my-custom-tui`。可能的架构是:

[原文]
- `tau_agent` exposes only generic events/session primitives;
- `tau_coding` owns CLI discovery, resource loading, and concrete frontend
  selection;
- Textual-specific code remains optional and isolated;
- custom TUIs consume `CodingSession`/`AgentEvent` rather than private internals.

[译文]
- `tau_agent` 只暴露通用事件/会话原语;
- `tau_coding` 持有 CLI 发现、资源加载与具体前端选择;
- Textual 特有代码保持可选且隔离;
- 自定义 TUI 消费 `CodingSession`/`AgentEvent`,而不是私有内部实现。

[原文]
The unresolved design question is distribution/discovery: Python entry points,
Tau-managed TUI directories, extension-provided adapters, or a combination.

[译文]
未解决的设计问题是分发/发现方式:Python 入口点、Tau 管理的 TUI 目录、扩展提供的适配器,还是它们的组合。

### 提示延迟与持久化的权衡(Prompt latency versus durability)

[原文]
Issue #166 remains open. The current Pi-like invariant is: completed messages are
persisted before the UI sees the `MessageEndEvent`. Future work may choose a
faster display-before-persist strategy, but that must be documented as a
durability tradeoff.

[译文]
Issue #166 仍然开放。当前类似 Pi 的不变量是:已完成消息在 UI 看到 `MessageEndEvent` 之前就被持久化。未来工作可以选择更快的「先显示后持久化」策略,但必须把它记录为一项持久化取舍。

### 事件契约的新增项(Event contract additions)

[原文]
`ToolExecutionUpdateEvent` exists in the contract but is not currently emitted by
the core loop. Future streaming/progress-aware tools may use it. New frontends
should still implement it now.

[译文]
`ToolExecutionUpdateEvent` 已存在于契约中,但核心循环目前不发出它。未来的流式/进度感知工具可能使用它。新的前端现在仍应实现它。

### Textual 应用规模(Textual app size)

[原文]
`src/tau_coding/tui/app.py` has grown into a large reference implementation with
many product workflows. Future custom TUI work may benefit from extracting a
smaller frontend protocol or controller object from `tau_coding` so new UIs can
reuse session/command/picker orchestration without importing Textual widgets.

[译文]
`src/tau_coding/tui/app.py` 已成长为一个包含许多产品工作流的大型参考实现。未来的自定义 TUI 工作可能受益于从 `tau_coding` 中抽取一个更小的前端协议或控制器对象,使新 UI 能复用会话/命令/选择器编排,而无需导入 Textual 组件。

## 给未来 agent 的简短指示块(Short instruction block for future agents)

[原文]
If you are an agent building a new Tau TUI, follow these rules before coding:

[译文]
如果你是要构建新 Tau TUI 的 agent,请在写代码之前遵循这些规则:

[原文]
1. Build on `CodingSession`, not provider chunks and not raw JSONL.
2. Treat `AgentEvent` as the streaming contract; handle every event type.
3. Keep `tau_agent` free of UI, command, theme, keybinding, and path policy.
4. Use `session.handle_command()` before `session.prompt()`.
5. Queue active-run input with `streaming_behavior`, never overlap prompts.
6. Use a run/session generation id to ignore late events.
7. Call `session.cancel()` and be prepared to cancel your own UI worker.
8. Rebuild visible transcript from `session.messages` after session mutations.
9. Separate local UI output from model-visible/persisted messages.
10. Do not remount the whole transcript on every token; preserve scrollback.
11. Do not let compaction/session switching/model switching race an active run.
12. Ask `CodingSession` for provider/model/thinking capabilities; do not infer
    them in the frontend.
13. Keep autocomplete and event adaptation pure/testable.
14. Add focused regression tests for every roadblock listed above.

[译文]
1. 构建在 `CodingSession` 之上,而不是 provider 分片,也不是原始 JSONL。
2. 把 `AgentEvent` 当作流式契约;处理每一种事件类型。
3. 让 `tau_agent` 不涉及 UI、命令、主题、键位与路径策略。
4. 在 `session.prompt()` 之前使用 `session.handle_command()`。
5. 用 `streaming_behavior` 排队活动运行期间的输入,绝不让提示重叠。
6. 用运行/会话代际 id 忽略迟到事件。
7. 调用 `session.cancel()`,并准备取消你自己的 UI worker。
8. 会话变更之后,从 `session.messages` 重建可见会话记录。
9. 把本地 UI 输出与对模型可见/持久化的消息分开。
10. 不要为每个 token 重挂载整份会话记录;保留滚动回看。
11. 不要让压缩/会话切换/模型切换与活动运行竞态。
12. 向 `CodingSession` 询问 provider/模型/thinking 能力;不要在前端推断它们。
13. 保持自动补全与事件适配纯粹/可测试。
14. 为上面列出的每一个路障添加聚焦回归测试。
