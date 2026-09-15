---
title: "Phase 24: Session Tree Branching / 阶段 24:会话树分支"
---

[原文]
This phase exposes Tau's existing append-only session tree in the Textual TUI.
It follows Pi's core behavior: moving through the tree is a structural session
mutation, not a transcript edit.

[译文]
本阶段在 Textual TUI 中把 Tau 既有的只追加会话树暴露出来。它遵循 Pi 的核心行为:在树中移动是一种结构性的会话变更,而不是对会话记录的编辑。

## 变更内容(What Changed)

[原文]
`/tree` opens a modal tree picker for the active session. The picker lists
branchable conversation entries near their parent branch point, with small
indentation only where the session history has diverged into alternate branches,
marks the active leaf, and supports two actions:

[译文]
`/tree` 会为活动会话打开一个模态树选择器。选择器列出可分支的对话条目,并把它们显示在各自父分支点附近;只有在会话历史确实分叉出其他分支的地方才使用少量缩进;它会标记活动叶节点,并支持两个操作:

[原文]
- `Enter` moves the active leaf to the selected entry.
- `S` moves the active leaf through a new `branch_summary` entry.
- `Ctrl+T` toggles tool-call entries on or off for easier navigation in
  tool-heavy histories.

[译文]
- `Enter` 把活动叶节点移动到所选条目。
- `S` 通过一条新的 `branch_summary` 条目移动活动叶节点。
- `Ctrl+T` 打开/关闭工具调用条目,以便在工具密集的历史中更容易导航。

[原文]
Both actions preserve all existing JSONL entries. Plain navigation is in-memory
only. If the user quits immediately, reopening selects the last non-legacy-leaf
entry in file order rather than restoring that uncommitted selection. The next
message or state change is appended with the selected target as its parent and
therefore makes the new branch durable. Summary navigation appends its
`branch_summary` immediately, so that summary becomes the durable tip. The
picker intentionally hides metadata entries such as model changes,
thinking-level changes, historical leaf pointers, and session info; it only
shows user messages, assistant messages, tool calls, compaction summaries, and
branch summaries.

[译文]
两种操作都会保留所有既有 JSONL 条目。单纯导航只存在于内存中。如果用户立即退出,重新打开时会按文件顺序选择最后一个非遗留 leaf 条目,而不会恢复那次尚未提交的选择。下一条消息或状态变更会以所选目标为父条目追加,从而使新分支变为持久化。摘要导航会立即追加它的 `branch_summary`,因此该摘要成为持久化顶点。选择器有意隐藏元数据条目,例如模型变更、thinking 等级变更、历史 leaf 指针与会话信息;它只显示用户消息、assistant 消息、工具调用、压缩摘要与分支摘要。

## 分支摘要(Branch Summaries)

[原文]
Tau already had a `BranchSummaryEntry` type. This phase makes it replay-aware:
when the active root-to-leaf path contains a branch summary, `SessionState`
converts it into a user-context summary message.

[译文]
Tau 原本已有 `BranchSummaryEntry` 类型。本阶段让它具备重放感知:当活动的「根到叶」路径中包含分支摘要时,`SessionState` 会把它转换成一条用户上下文摘要消息。

[原文]
Branch summaries now use the active provider and model to summarize active-path
messages after the selected entry. `CodingSession` sends a one-off summarization
request outside the main `AgentHarness` transcript, using a Pi-style structured
summary prompt with sections for goal, constraints, progress, decisions, and
next steps. The TUI supports both the default prompt and per-branch custom
focus instructions. Tau stores the resulting text in the existing
`BranchSummaryEntry` shape. If the provider returns no usable text, reports an
error, or raises, Tau falls back to the same deterministic summary helper used
by automatic compaction.

[译文]
分支摘要现在会使用活动 provider 与模型,对所选条目之后的活动路径消息进行摘要。`CodingSession` 会在主 `AgentHarness` 会话记录之外发起一次性的摘要请求,使用 Pi 风格的结构化摘要提示词,其中包含目标、约束、进展、决策与后续步骤等小节。TUI 同时支持默认提示词与按分支自定义的关注点指令。Tau 把生成的文本存入既有的 `BranchSummaryEntry` 形态。如果 provider 没有返回可用文本、报告错误或抛出异常,Tau 会回退到自动压缩所使用的同一个确定性摘要辅助函数。

## 边界(Boundaries)

[原文]
`tau_agent.session` owns generic replay semantics for `branch_summary` entries.
`tau_coding.CodingSession` owns branch navigation, model summary creation,
fallback summary creation, storage mutation, and harness message replacement.
The Textual TUI only displays choices and calls the session method selected by
the user.

[译文]
`tau_agent.session` 持有 `branch_summary` 条目的通用重放语义。`tau_coding.CodingSession` 持有分支导航、模型摘要生成、回退摘要生成、存储变更以及 harness 消息替换。Textual TUI 只负责展示选项,并调用用户所选的会话方法。

## 验证(Validation)

[原文]
Useful checks:

[译文]
有用的检查:

```bash
uv run pytest tests/test_session.py tests/test_coding_session.py tests/test_commands.py tests/test_tui_app.py -q
uv run ruff check src/tau_agent/session/memory.py src/tau_coding/session.py src/tau_coding/commands.py src/tau_coding/tui/app.py tests/test_session.py tests/test_coding_session.py tests/test_commands.py tests/test_tui_app.py
```
