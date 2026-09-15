---
title: "Phase 14: Session Manager and Resume / 阶段 14:会话管理器与恢复"
---

[原文]
Phase 14 makes Tau sessions first-class records stored under Tau home.

[译文]
阶段 14 让 Tau 会话成为存放在 Tau 主目录下的一等记录。

[原文]
The implementation lives in:

[译文]
实现位于:

```text
src/tau_coding/session_manager.py
```

## 新增了什么(What was added)

[原文]
Tau now has a `SessionManager` that can:

- create new sessions
- index sessions in user-home metadata
- list sessions newest-first
- look up sessions by id
- touch sessions after new messages are persisted
- return a default project session for existing TUI behavior

[译文]
Tau 现在有了 `SessionManager`,它可以:

- 创建新会话
- 在用户主目录的元数据中为会话建立索引
- 按从新到旧列出会话
- 按 id 查找会话
- 在新消息持久化后 touch 对应会话
- 为既有 TUI 行为返回默认项目会话

[原文]
Session metadata is represented by:

[译文]
会话元数据由以下类型表示:

```python
CodingSessionRecord
```

[原文]
with:

- `id`
- `path`
- `cwd`
- `model`
- `title`
- `created_at`
- `updated_at`

[译文]
它包含:

- `id`
- `path`
- `cwd`
- `model`
- `title`
- `created_at`
- `updated_at`

## 存储布局(Storage layout)

[原文]
Session transcripts remain append-only JSONL files.

[译文]
会话记录仍然是只追加的 JSONL 文件。

[原文]
Session metadata was originally stored in a global compatibility index:

[译文]
会话元数据最初存放在一个全局的兼容索引中:

```text
~/.tau/sessions/index.jsonl
```

[原文]
Current session metadata and transcript files live under a project-specific
directory:

[译文]
当前的会话元数据与记录文件存放在按项目区分的目录下:

```text
~/.tau/sessions/<cleaned-path-suffix>-<short-hash>/
```

[原文]
The default project session remains:

[译文]
默认项目会话仍然是:

```text
~/.tau/sessions/<cleaned-path-suffix>-<short-hash>/default.jsonl
```

[原文]
but it is now indexed with a stable id:

[译文]
但它现在使用一个稳定的 id 建立索引:

```text
default-<cleaned-path-suffix>-<short-hash>
```

[原文]
New sessions are stored as:

[译文]
新会话的存储形式为:

```text
~/.tau/sessions/<cleaned-path-suffix>-<short-hash>/<session-id>.jsonl
```

## CodingSession 集成(CodingSession integration)

[原文]
`CodingSessionConfig` now accepts:

[译文]
`CodingSessionConfig` 现在接受:

```python
session_id: str | None
session_manager: SessionManager | None
```

[原文]
When a session persists new messages, it touches the session manager record so `updated_at` stays current.

[译文]
当会话持久化新消息时,它会 touch 会话管理器中的记录,使 `updated_at` 保持最新。

[原文]
This keeps the session transcript and session index loosely coupled: `tau_agent` still only knows about append-only session storage, while `tau_coding` owns user-facing session metadata.

[译文]
这让会话记录与会话索引保持松耦合:`tau_agent` 仍然只了解只追加的会话存储,而面向用户的会话元数据由 `tau_coding` 持有。

## TUI 集成(TUI integration)

[原文]
The TUI now creates sessions through `SessionManager`.

[译文]
TUI 现在通过 `SessionManager` 创建会话。

[原文]
Default behavior:

[译文]
默认行为:

```bash
tau
```

[原文]
creates a new session.

[译文]
会创建一个新会话。

[原文]
The explicit new-session flag is also accepted for clarity:

[译文]
为了语义清晰,也接受显式的新会话参数:

```bash
tau --new-session
```

[原文]
Resume an indexed session:

[译文]
恢复一个已建立索引的会话:

```bash
tau --resume <session-id>
```

[原文]
If the session id is unknown, Tau exits with a clear error.

[译文]
如果会话 id 未知,Tau 会带着明确的错误退出。

[原文]
Later TUI polish added in-process session switching through:

[译文]
后续的 TUI 打磨加入了进程内会话切换:

```text
/resume <session-id>
```

[原文]
Plain `/resume` opens the project-scoped session picker. `/resume <session-id>`
reloads the selected indexed session and rebuilds the visible transcript without
restarting Tau.

[译文]
单独使用 `/resume` 会打开限定于当前项目的会话选择器。`/resume <session-id>` 会重新加载所选的已索引会话,并在不重启 Tau 的情况下重建可见的会话记录。

## CLI 会话列表(CLI session listing)

[原文]
Tau can list indexed sessions:

[译文]
Tau 可以列出已建立索引的会话:

```bash
tau sessions
```

[原文]
The first implementation prints tab-separated rows:

[译文]
最初的实现打印以制表符分隔的行:

```text
<id>    <title>    <model>    <cwd>
```

[原文]
The richer modal session picker now uses the same project-scoped session records
as `/resume`.

[译文]
更丰富的模态会话选择器现在使用与 `/resume` 相同的、限定于项目的会话记录。

## 恢复时对中断工具调用的修复(Interrupted tool-call repair on resume)

[原文]
Tau repairs cancelled tool calls by adding a synthetic tool result:

[译文]
Tau 通过添加一个合成的工具结果来修复被取消的工具调用:

```text
Tool call interrupted by user
```

[原文]
This keeps OpenAI-compatible transcripts valid, because those providers reject
any history where an assistant tool call has no matching tool output. A subtle
resume bug existed in older builds: the repair could be added to the in-memory
`AgentHarness`, letting the live session continue, but not written back to the
append-only JSONL file. After `/resume`, Tau rebuilt the branch from disk without
that synthetic tool result, so the next provider request failed with errors like:

[译文]
这保证了 OpenAI 兼容的会话记录仍然有效,因为这些 provider 会拒绝任何「assistant 工具调用没有匹配的工具输出」的历史。旧版本中存在一个隐蔽的恢复 bug:修复可能只被加进内存中的 `AgentHarness`,让当前会话能继续,却没有写回只追加的 JSONL 文件。执行 `/resume` 之后,Tau 从磁盘重建分支时缺少那条合成的工具结果,于是下一次 provider 请求会失败并报出类似错误:

```text
No tool output found for function call call_...
```

[原文]
`CodingSession.load()` now checks the active branch for unmatched assistant tool
calls before returning a resumed session. If it finds one, it appends durable
repair entries and advances the leaf to the repaired branch. This also covers
historical corrupted sessions where a user message was already appended after the
dangling tool call.

[译文]
`CodingSession.load()` 现在会在返回恢复的会话之前,检查活动分支中是否存在未匹配的 assistant 工具调用。若发现,它会追加持久化的修复条目,并把叶节点推进到修复后的分支。这也覆盖了历史上已损坏的会话——即用户消息已经追加在悬空工具调用之后的情况。

## 测试(Tests)

[原文]
The phase is covered by:

[译文]
本阶段的测试覆盖为:

```text
tests/test_session_manager.py
tests/test_coding_session.py
tests/test_cli.py
```

[原文]
The tests verify:

- session creation and indexing
- default session records
- newest-first listing
- metadata updates after prompt persistence
- TUI resume/new-session CLI wiring
- session listing CLI output

[译文]
测试验证:

- 会话创建与索引
- 默认会话记录
- 从新到旧的列举
- 提示持久化后的元数据更新
- TUI 恢复/新建会话的 CLI 接线
- 会话列表 CLI 输出

## 下一阶段(Next phase)

[原文]
The next phase should replace hardcoded slash-command handling with a command registry. That registry can then power TUI autocomplete and session commands such as `/sessions`, `/resume`, and `/new`.

[译文]
下一阶段应当用命令注册表替换硬编码的斜杠命令处理。该注册表之后可以驱动 TUI 自动补全,以及 `/sessions`、`/resume`、`/new` 等会话命令。
