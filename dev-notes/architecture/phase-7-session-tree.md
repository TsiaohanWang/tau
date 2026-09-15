---
title: "Phase 7: Session Tree and JSONL Persistence / 阶段 7:会话树与 JSONL 持久化"
---

[原文]
Phase 7 adds Tau's first durable session layer.

[译文]
阶段 7 加入了 Tau 的第一层持久化会话设施。

[原文]
The session primitives live in:

[译文]
会话原语位于:

```text
src/tau_agent/session/
```

## 新增了什么(What was added)

[原文]
Tau now has:

- typed append-only session entries
- JSONL serialization helpers
- local JSONL session storage
- in-memory session replay
- branch path traversal helpers

[译文]
Tau 现在拥有:

- 带类型的只追加会话条目
- JSONL 序列化辅助函数
- 本地 JSONL 会话存储
- 内存中的会话重放
- 分支路径遍历辅助函数

## 为什么会话是只追加的(Why sessions are append-only)

[原文]
Tau follows Pi's core session idea: persisted state is not edited in place. Instead, Tau appends immutable entries and reconstructs the current view by replaying them.

[译文]
Tau 遵循 Pi 的核心会话理念:已持久化的状态不做原地修改。相反,Tau 追加不可变条目,并通过重放它们来重建当前视图。

[原文]
This makes session files:

- easy to inspect
- easy to append to safely
- suitable for branching/forking later
- able to preserve history even after compaction or summaries land

[译文]
这让会话文件:

- 易于检查
- 易于安全地追加
- 适合日后的分支/分叉
- 即使在压缩或摘要落地之后也能保留历史

[原文]
A session file is one JSON object per line:

[译文]
会话文件每行一个 JSON 对象:

```jsonl
{"type":"message","id":"...","message":{"role":"user","content":"Hello"}}
{"type":"message","id":"...","parent_id":"...","message":{"role":"assistant","content":"Hi"}}
{"type":"label","id":"...","parent_id":"...","target_id":"...","label":"Greeting"}
```

## 条目类型(Entry types)

[原文]
Phase 7 defines these entries:

- `message`
- `model_change`
- `thinking_level_change`
- `compaction`
- `branch_summary`
- `label`
- `leaf`
- `session_info`
- `custom`

[译文]
阶段 7 定义了这些条目:

- `message`
- `model_change`
- `thinking_level_change`
- `compaction`
- `branch_summary`
- `label`
- `leaf`
- `session_info`
- `custom`

[原文]
Some entries, such as `compaction` and `branch_summary`, were introduced as
placeholders for later phases. Phase 22 makes `compaction` replay-aware while
preserving the append-only session file.

[译文]
部分条目(如 `compaction` 与 `branch_summary`)是作为后续阶段的占位符引入的。阶段 22 让 `compaction` 具备重放感知能力,同时保持会话文件的只追加特性。

## JSONL 存储(JSONL storage)

[原文]
`JsonlSessionStorage` provides the first local storage backend:

[译文]
`JsonlSessionStorage` 提供第一个本地存储后端:

```python
from tau_agent.session import JsonlSessionStorage, MessageEntry
from tau_agent import UserMessage

storage = JsonlSessionStorage("session.jsonl")
await storage.append(MessageEntry(message=UserMessage(content="Hello")))
entries = await storage.read_all()
```

[原文]
Missing files read as empty sessions. Parent directories are created automatically when appending.

[译文]
文件不存在时会被当作空会话读取。追加时会自动创建父目录。

## 重放(Replay)

[原文]
`SessionState.from_entries()` reconstructs an in-memory state:

[译文]
`SessionState.from_entries()` 重建内存中的状态:

```python
from tau_agent.session import SessionState

state = SessionState.from_entries(entries)
```

[原文]
The reconstructed state includes:

- transcript messages
- active model
- thinking level
- resolved per-entry labels and their latest change timestamps
- active leaf id
- session info
- custom entries

[译文]
重建出的状态包含:

- 会话记录消息
- 当前活动模型
- thinking 等级
- 解析后的逐条目标签及其最近一次变更时间戳
- 活动叶节点(leaf)id
- 会话信息
- 自定义条目

## 树路径(Tree paths)

[原文]
Every entry has:

[译文]
每个条目都有:

```python
id: str
parent_id: str | None
```

[原文]
This gives Tau enough structure for branch reconstruction:

[译文]
这为 Tau 提供了足以重建分支的结构:

```python
state = SessionState.from_entries(entries, leaf_id="entry-id")
```

[原文]
When `leaf_id` is provided, only the root-to-leaf path is replayed. This prevents sibling branches from leaking into the active transcript.

[译文]
提供 `leaf_id` 时,只重放从根到该叶节点的路径。这可以防止兄弟分支泄漏进活动会话记录。

## 边界(Boundary)

[原文]
The session layer lives in `tau_agent` because it is part of the reusable agent brain. It does not know about CLI arguments, Textual widgets, Rich rendering, slash commands, or local Tau resource directories.

[译文]
会话层位于 `tau_agent`,因为它是可复用 agent 大脑的一部分。它不了解 CLI 参数、Textual 组件、Rich 渲染、斜杠命令或本地 Tau 资源目录。

[原文]
A later `tau_coding` session wrapper will decide when to append entries, where to store session files, and how commands like `/sessions` or `/fork` should behave.

[译文]
之后的 `tau_coding` 会话包装层将决定何时追加条目、会话文件存放何处,以及 `/sessions`、`/fork` 这类命令应如何表现。

## 测试(Tests)

[原文]
The phase is covered by:

[译文]
本阶段的测试覆盖为:

```text
tests/test_session.py
```

[原文]
The tests verify:

- entry JSONL round-tripping
- malformed JSONL errors
- append/read storage behavior
- missing-file behavior
- linear state replay
- branch path reconstruction
- missing parent validation

[译文]
测试验证:

- 条目 JSONL 的双向转换
- 畸形 JSONL 的错误处理
- 存储的追加/读取行为
- 文件缺失时的行为
- 线性状态重放
- 分支路径重建
- 缺失父条目的校验

## 下一阶段(Next phase)

[原文]
The next roadmap phase is the Tau coding session wrapper. That layer can combine session persistence, slash commands, prompt expansion, resources, and print/interactive frontends on top of this append-only foundation.

[译文]
路线图上的下一阶段是 Tau 编码会话包装层。该层可以在这个只追加的基础之上,组合会话持久化、斜杠命令、提示词展开、资源以及 print/交互式前端。
