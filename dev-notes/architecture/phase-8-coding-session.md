---
title: "Phase 8: Coding Session Wrapper / 阶段 8:编码会话包装层"
---

[原文]
Phase 8 adds Tau's first coding-session environment wrapper.

[译文]
阶段 8 加入了 Tau 的第一层编码会话环境包装。

[原文]
The implementation lives in:

[译文]
实现位于:

```text
src/tau_coding/session.py
```

## 新增了什么(What was added)

[原文]
Tau now has a `CodingSession` that combines:

- `AgentHarness`
- append-only session storage
- restored transcript messages
- built-in coding tools
- model/session metadata
- a minimal slash-command seam

[译文]
Tau 现在有了 `CodingSession`,它组合了:

- `AgentHarness`
- 只追加的会话存储
- 恢复出的会话记录消息
- 内置编码工具
- 模型/会话元数据
- 一个最小的斜杠命令接缝

[原文]
This is the first layer that starts to resemble Pi's `AgentSession`, but it remains intentionally small.

[译文]
这是第一层开始接近 Pi `AgentSession` 的结构,但它仍被有意保持得很小。

## 为什么它位于 `tau_coding`(Why this lives in `tau_coding`)

[原文]
`tau_agent` owns reusable primitives:

- messages
- events
- tools as an abstraction
- the pure loop
- `AgentHarness`
- low-level session entries/storage/replay

[译文]
`tau_agent` 持有可复用的原语:

- 消息
- 事件
- 作为抽象的工具
- 纯循环
- `AgentHarness`
- 底层会话条目/存储/重放

[原文]
`tau_coding` owns the coding-agent environment around those primitives:

- local cwd
- built-in coding tools
- storage choices
- slash commands
- prompt/resource loading later
- print and interactive frontends later

[译文]
`tau_coding` 持有围绕这些原语的编码 agent 环境:

- 本地 cwd
- 内置编码工具
- 存储选择
- 斜杠命令
- 之后的提示词/资源加载
- 之后的 print 与交互式前端

[原文]
So `CodingSession` belongs in `tau_coding`.

[译文]
因此 `CodingSession` 属于 `tau_coding`。

## 加载会话(Loading a session)

[原文]
A session is loaded from a `SessionStorage` implementation:

[译文]
会话从一个 `SessionStorage` 实现加载:

```python
from pathlib import Path
from tau_coding import CodingSession, CodingSessionConfig
from tau_agent.session import JsonlSessionStorage

session = await CodingSession.load(
    CodingSessionConfig(
        provider=provider,
        model="gpt-4.1-mini",
        system=system_prompt,
        storage=JsonlSessionStorage("session.jsonl"),
        cwd=Path.cwd(),
    )
)
```

[原文]
Loading performs these steps:

1. read all session entries
2. initialize metadata for an empty session
3. replay entries into `SessionState`
4. create an `AgentHarness` with restored messages
5. register built-in coding tools unless custom tools are supplied

[译文]
加载过程执行以下步骤:

1. 读取全部会话条目
2. 为空会话初始化元数据
3. 把条目重放为 `SessionState`
4. 用恢复出的消息创建一个 `AgentHarness`
5. 在没有提供自定义工具时注册内置编码工具

[原文]
For a new empty session, Tau appends:

- `SessionInfoEntry`
- `ModelChangeEntry`

[译文]
对于新的空会话,Tau 会追加:

- `SessionInfoEntry`
- `ModelChangeEntry`

## Prompt 与 Continue(Prompt and continue)

[原文]
`CodingSession.prompt()` runs a new user prompt through the harness:

[译文]
`CodingSession.prompt()` 让一条新的用户提示经过 harness 运行:

```python
async for event in session.prompt("Read README.md"):
    ...
```

[原文]
After the run completes, all new harness messages are appended as `MessageEntry` records. Each entry becomes the active tip by being the last non-legacy-leaf line in the file; Tau no longer writes a separate pointer.

[译文]
运行完成后,harness 中所有新消息都会以 `MessageEntry` 记录的形式追加。每个条目只要成为文件中最后一个非遗留 leaf 的行,就同时成为活动顶点;Tau 不再单独写入指针。

[原文]
`CodingSession.continue_()` resumes from restored state without appending a new user message first.

[译文]
`CodingSession.continue_()` 从已恢复的状态继续运行,不会先追加新的用户消息。

## 持久化模型(Persistence model)

[原文]
Phase 8 persists messages after a run completes. This keeps the implementation simple and avoids double-saving messages while `AgentHarness` mutates its in-memory transcript.

[译文]
阶段 8 在一次运行完成后持久化消息。这使实现保持简单,也避免了在 `AgentHarness` 修改其内存会话记录期间重复保存消息。

[原文]
Later phases can make persistence more incremental if Tau needs crash recovery during a streaming response.

[译文]
如果 Tau 需要在流式响应期间具备崩溃恢复能力,后续阶段可以把持久化做得更增量。

## 最小命令集(Minimal commands)

[原文]
`CodingSession.handle_command()` currently supports only:

- `/help`
- `/exit`

[译文]
`CodingSession.handle_command()` 目前只支持:

- `/help`
- `/exit`

[原文]
Unknown slash commands are handled with an explanatory message. Normal prompts return `handled=False`.

[译文]
未知的斜杠命令会得到一条解释性消息。普通提示返回 `handled=False`。

[原文]
This is a small seam for a future command registry. Full commands such as `/model`, `/sessions`, `/fork`, and `/compact` are intentionally deferred.

[译文]
这是为未来的命令注册表预留的一个小接缝。`/model`、`/sessions`、`/fork`、`/compact` 等完整命令被有意推迟。

## 非目标(Non-goals)

[原文]
Phase 8 does not add:

- automatic print-mode session persistence
- session directory discovery
- model switching commands
- direct bash command prefixes
- project instruction loading
- skills or prompt templates
- Rich rendering
- Textual UI
- compaction

[译文]
阶段 8 不包含:

- print 模式的自动会话持久化
- 会话目录发现
- 模型切换命令
- 直接的 bash 命令前缀
- 项目指令加载
- 技能或提示词模板
- Rich 渲染
- Textual UI
- 压缩(compaction)

[原文]
Those belong to later phases.

[译文]
这些都属于后续阶段。

## 测试(Tests)

[原文]
The phase is covered by:

[译文]
本阶段的测试覆盖为:

```text
tests/test_coding_session.py
```

[原文]
The tests verify:

- empty session metadata initialization
- prompt persistence
- transcript restore
- continuation persistence
- tool result persistence
- minimal command handling

[译文]
测试验证:

- 空会话的元数据初始化
- 提示的持久化
- 会话记录恢复
- 继续运行时的持久化
- 工具结果的持久化
- 最小命令的处理

## 下一阶段(Next phase)

[原文]
The next roadmap phase is skills, prompt templates, and system prompt assembly groundwork. The coding-session wrapper created here gives those later systems a stable place to plug in.

[译文]
路线图上的下一阶段是技能、提示词模板以及系统提示词组装的基础工作。这里创建的编码会话包装层,为这些后续系统提供了稳定的接入点。
