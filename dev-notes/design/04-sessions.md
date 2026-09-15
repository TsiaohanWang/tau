---
title: "04 — Sessions / 04 —— 会话"
---

[原文]
Sessions preserve conversations and agent state across runs.

[译文]
会话(session)让对话与 agent 状态可以跨多次运行保留下来。

## 设计(Design)

[原文]
Tau uses an append-only session tree. Instead of mutating old state, Tau appends entries and reconstructs state by replaying them.

[译文]
Tau 使用只追加(append-only)的会话树。它不改写旧状态,而是追加条目(entry),再通过重放(replay)这些条目重建状态。

[原文]
The low-level implementation lives in:

[译文]
底层实现位于:

```text
src/tau_agent/session/
```

## 条目类型(Entry types)

[原文]
- `message`
- `model_change`
- `thinking_level_change`
- `compaction`
- `branch_summary`
- `label`
- `leaf` (legacy read compatibility only; never written)
- `session_info`
- `custom`

[译文]
- `message`
- `model_change`
- `thinking_level_change`
- `compaction`
- `branch_summary`
- `label`
- `leaf`(仅为兼容旧数据而读取;永远不会写入)
- `session_info`
- `custom`

## 当前能力(Current capabilities)

[原文]
Tau can now:

- serialize and deserialize session entries as JSONL
- append entries to local session files
- read session files in order
- reconstruct linear session state
- reconstruct a root-to-leaf branch path
- load a `tau_coding.CodingSession` that restores messages and persists new runs

[译文]
Tau 目前可以:

- 以 JSONL 序列化和反序列化会话条目
- 把条目追加到本地会话文件
- 按顺序读取会话文件
- 重建线性的会话状态
- 重建从根到叶(root-to-leaf)的分支路径
- 加载 `tau_coding.CodingSession`,恢复消息并持久化新的运行

## 持久化消息边界(Durable message boundary)

[原文]
`CodingSession` treats `MessageEndEvent` as the durable-message boundary. Persistence is push-based: the coding session subscribes a listener to the harness, and every `message_end` notification appends that message to storage before the event reaches the consuming frontend. Persistence does not run in the event consumer, so a frontend that stops consuming (the TUI cancels its worker on Esc) cannot lose writes — including the synthetic "Tool call interrupted by user" results the harness appends and pushes to subscribers during cancelled cleanup.

[译文]
`CodingSession` 把 `MessageEndEvent` 视为持久化消息的边界。持久化是推送式(push-based)的:编码会话向 harness 订阅一个监听器,每次 `message_end` 通知都会在事件到达消费它的前端之前,先把该消息追加到存储中。持久化不在事件消费者里运行,因此即使前端停止消费(例如在 TUI 中按 Esc 取消 worker),也不会丢失写入——包括 harness 在取消清理期间追加并推送给订阅者的、合成的「Tool call interrupted by user」结果。

[原文]
This mirrors Pi's session model and matters for interactive UIs:

- the first user prompt is branchable while the assistant is still responding
- queued steering and follow-up messages become durable when they are injected
- cancellation or process failure preserves completed messages
- the TUI can read tree state that matches the active run

[译文]
这与 Pi 的会话模型一致,对交互式 UI 尤其重要:

- 在 assistant 仍在响应时,第一条用户提示就已经可以作为分支起点
- 排队的插话与追加消息在被注入时即完成持久化
- 取消或进程崩溃仍能保留已完成的消息
- TUI 读取到的树状态始终与当前活动运行一致

[原文]
A message whose `message_end` never fired is deliberately not persisted: abandoning a run before the first completed message leaves no durable trace, so an aborted first prompt does not index a new session.

[译文]
`message_end` 从未触发的消息会被刻意地不持久化:如果在第一条消息完成之前就放弃本次运行,就不会留下任何持久痕迹,因此一次被中止的首个提示不会为该会话建立索引。

[原文]
The active tip is the last non-`leaf` entry in file order. Every new entry points to the current in-memory tip, so an append both records the operation and makes its branch active. Historical `leaf` entries still deserialize but are ignored for tip selection.

[译文]
活动顶点(active tip)是文件顺序中最后一个非 `leaf` 条目。每个新条目都指向当前内存中的顶点,因此一次追加既记录了操作,也让其所在分支成为活动分支。历史遗留的 `leaf` 条目仍可反序列化,但在选择顶点时会被忽略。

[原文]
Empty sessions are still deferred: loading a new session prepares initial metadata in memory, but Tau does not create the transcript file until the first durable session entry is appended. The first append materializes the pending `session_info`, model, and thinking-level entries before writing the message.

[译文]
空会话仍然是延迟创建的:加载一个新会话只会在内存中准备初始元数据,Tau 直到第一个持久化会话条目被追加时才创建会话记录文件。第一次追加会先落盘待处理的 `session_info`、模型与 thinking 等级条目,然后再写入消息。

## 系统提示词的持久化(System prompt persistence)

[原文]
Tau does not currently persist the resolved system prompt in the session JSONL file.

[译文]
Tau 目前不会把解析完成的系统提示词持久化到会话 JSONL 文件中。

[原文]
A resumed session restores the saved conversation branch, model changes, thinking-level changes, compactions, branch summaries, labels, and custom entries from the append-only session file. The system prompt is rebuilt at load time from the current coding-agent configuration and resources, including the current cwd, tools, loaded skills, context files such as `AGENTS.md`, and any custom or appended system prompt settings.

[译文]
恢复会话时,会从只追加的会话文件中还原已保存的对话分支、模型变更、thinking 等级变更、压缩记录、分支摘要、标签以及自定义条目。系统提示词则在加载时根据当前的编码 agent 配置与资源重新构建,包括当前 cwd、工具集、已加载的技能、`AGENTS.md` 等上下文文件,以及任何自定义或追加的系统提示词设置。

[原文]
This means `/resume` should be understood as:

```text
saved conversation branch
+
current resolved system prompt
```

[译文]
这意味着 `/resume` 应当理解为:

```text
已保存的对话分支
+
当前重新解析出的系统提示词
```

[原文]
not:

```text
saved conversation branch
+
original system prompt snapshot from session creation
```

[译文]
而不是:

```text
已保存的对话分支
+
会话创建时的原始系统提示词快照
```

[原文]
If system-prompt inputs change after a session was created, future turns in that resumed session may run with a different system prompt than earlier turns. This is useful when sessions should pick up improved Tau instructions, updated project context, changed skills, or changed tool guidance. The tradeoff is that the JSONL file is not a complete audit snapshot of exactly what prompt text was sent on every historical turn.

[译文]
如果会话创建之后系统提示词的输入发生了变化,那么恢复后的会话在后续轮次中可能使用与早前轮次不同的系统提示词。当希望会话能吸收改进后的 Tau 指令、更新的项目上下文、变化后的技能或工具指引时,这是有用的。代价是:JSONL 文件并不是一个完整审计快照,无法精确复原每个历史轮次实际发送的提示词文本。

[原文]
This matches Pi's current behavior. Pi's JSONL session schema stores the conversation tree and session state entries, but it does not store a dedicated resolved-system-prompt entry. Pi rebuilds its base system prompt from the active resource loader when creating or resuming an agent session. Pi can display/export the current runtime system prompt in some UI/export paths, but that prompt comes from live agent state rather than from a persisted JSONL snapshot.

[译文]
这与 Pi 当前的行为一致。Pi 的 JSONL 会话 schema 保存对话树与会话状态条目,但不会保存一条专门的「已解析系统提示词」条目。Pi 在创建或恢复 agent 会话时,从活动的资源加载器重建其基础系统提示词。Pi 可以在某些 UI/导出路径中展示或导出当前运行时的系统提示词,但那份提示词来自活的 agent 状态,而不是持久化的 JSONL 快照。

[原文]
A future Tau enhancement could add an explicit metadata entry for resolved system prompt snapshots or system-prompt revisions. If added, that should likely remain session metadata rather than a normal branchable transcript message, because the harness treats the system prompt separately from user, assistant, and tool messages.

[译文]
未来 Tau 可以增加一种显式的元数据条目,用于保存已解析系统提示词的快照或系统提示词的修订历史。如果实现,它大概应保持为会话元数据,而不是普通的、可分支的会话记录消息,因为 harness 对系统提示词与用户、assistant、工具消息的处理是分开的。

## 边界(Boundary)

[原文]
Low-level session primitives belong in `tau_agent`. File locations, slash commands, and coding-agent workflows belong in `tau_coding`.

[译文]
底层会话原语属于 `tau_agent`。文件位置、斜杠命令与编码 agent 工作流属于 `tau_coding`。

[原文]
`CodingSession` is the first `tau_coding` layer on top of the low-level primitives. It wires storage, `AgentHarness`, cwd, and coding tools together while leaving richer commands and resource loading for later phases.

[译文]
`CodingSession` 是构建在底层原语之上的第一层 `tau_coding`。它把存储、`AgentHarness`、cwd 与编码工具连接起来,而更丰富的命令与资源加载则留给后续阶段。
