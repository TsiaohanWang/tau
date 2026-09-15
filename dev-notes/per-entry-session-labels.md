# 逐条目的会话标签 / Per-entry session labels

## 变更内容(What changed)

[原文]
Tau now follows Pi's label semantics: a `label` entry is an append-only bookmark
change for one existing session entry, not a second session name.

[译文]
Tau 现在遵循 Pi 的标签语义:`label` 条目是面向某条既有会话条目的、只追加的书签变更,而不是第二个会话名。

```json
{"type":"label","id":"...","parent_id":"...","target_id":"message-id","label":"checkpoint","timestamp":1740000000}
```

[原文]
`target_id` identifies the bookmarked entry. `label` is optional; `null`, an
empty string, or whitespace clears the bookmark. `SessionState.labels_by_id` and
`label_timestamps_by_id` resolve changes in storage order, so relabel, clear, and
relabel sequences have deterministic last-change-wins behavior. A label's
resolved timestamp is the timestamp of the latest label entry, not its target.
Resolution scans the complete append-only tree rather than only the active path,
which keeps bookmarks available while navigating branches.

[译文]
`target_id` 标识被加书签的条目。`label` 是可选的;`null`、空字符串或纯空白都会清除书签。`SessionState.labels_by_id` 与 `label_timestamps_by_id` 按存储顺序解析变更,因此「改标签 → 清除 → 再改标签」这类序列具有确定性的「最后变更者胜」行为。一个标签解析出的时间戳是最新那条 label 条目的时间戳,而不是其目标的时间戳。解析会扫描完整的只追加树,而不是只扫描活动路径,这使书签在分支导航期间仍然可用。

[原文]
`CodingSession.set_label()` validates that the target exists before appending.
The extension API exposes the same operation as `await tau.set_label(...)`.
Labels never enter model context. Session naming remains exclusively
`SessionInfoEntry.title` and `/name`.

[译文]
`CodingSession.set_label()` 会在追加之前校验目标存在。扩展 API 通过 `await tau.set_label(...)` 暴露同一操作。标签永远不会进入模型上下文。会话命名仍专属于 `SessionInfoEntry.title` 与 `/name`。

## TUI 与导出(TUI and export)

[原文]
In `/tree`, labeled branchable entries render a distinct `[label]` prefix:

[译文]
在 `/tree` 中,带标签的可分支条目会渲染一个独特的 `[label]` 前缀:

[原文]
- `L` creates or edits the selected label; submitting empty text clears it.
- `Ctrl+F` toggles labeled-only filtering.
- `Ctrl+L` toggles the latest label-change timestamps.
- Existing branching, summary, and tool-row controls continue to work.

[译文]
- `L` 创建或编辑所选标签;提交空文本会清除它。
- `Ctrl+F` 切换「仅显示带标签项」的过滤。
- `Ctrl+L` 切换最新标签变更时间戳的显示。
- 既有的分支、摘要与工具行控件继续可用。

[原文]
The HTML export resolves labels over the full entry stream and prefixes the
corresponding tree nodes. Individual label-change rows show their target and
whether they set or cleared the bookmark.

[译文]
HTML 导出会在完整条目流上解析标签,并为相应的树节点加前缀。单独的标签变更行会显示其目标,以及该次变更是设置了书签还是清除了书签。

## 向后兼容迁移(Backward-compatible migration)

[原文]
Old Tau label entries have no `target_id` because they named the whole session.
The issue suggested either rewriting that value into the session title or
attaching it to an early entry. Rewriting the title was rejected: it would mix
two concepts, could override a real `SessionInfoEntry.title`, and would require a
synthetic metadata mutation during a read.

[译文]
旧的 Tau 标签条目没有 `target_id`,因为它们命名的是整个会话。issue 中曾建议要么把该值改写进会话标题,要么把它挂到某个早期条目上。改写标题的方案被否决:它会混淆两个概念,可能覆盖真实的 `SessionInfoEntry.title`,并且需要在读取期间做一次合成的元数据修改。

[原文]
Instead, JSONL loading deterministically targets every legacy label at the
file's earliest branchable entry (`message`, `compaction`, or
`branch_summary`). If there is no branchable entry, it uses the earliest
non-label/non-legacy-leaf entry; isolated single-line parsing falls back to the
legacy label's parent and then its own ID. New writes are always strict and
require `target_id`. This migration is read-only: the source file is not
rewritten, and exporting/download preserves a canonical in-memory projection.

[译文]
取而代之,JSONL 加载会确定性地把每个遗留标签指向文件中最早的可分支条目(`message`、`compaction` 或 `branch_summary`)。如果没有可分支条目,则使用最早的「非 label、非遗留 leaf」条目;孤立的单行解析会回退到该遗留标签的父条目,再回退到它自己的 ID。新的写入始终严格,并要求 `target_id`。这次迁移是只读的:源文件不会被改写,导出/下载保留的是规范的内存投射。

[原文]
Tool-history repair no longer snapshots a scalar session label onto its new
branch. Per-entry labels resolve globally and retain their stable target IDs, so
re-emitting them would create redundant change records and alter their
"bookmarked at" timestamps.

[译文]
工具历史修复不再把标量形式的会话标签快照到它的新分支上。逐条目标签会全局解析并保留其稳定的目标 ID,因此重新发出它们会产生冗余的变更记录,并改变其「加书签时间」时间戳。

## 验证(Validation)

[原文]
Targeted coverage includes schema/JSONL migration, file-order resolution,
clear/relabel behavior and timestamps, unknown-target rejection, extension
routing, tree rendering/filter/edit/clear controls, active-row selection after a
label append, and HTML export rendering. Run the complete project checks with:

[译文]
针对性覆盖包括:schema/JSONL 迁移、按文件顺序解析、清除/改标签行为与时间戳、未知目标拒绝、扩展路由、树渲染/过滤/编辑/清除控件、追加标签之后的活动行选择,以及 HTML 导出渲染。运行完整项目检查:

```bash
uv run pytest
uv run ruff check .
uv run ruff format --check .
uv run mypy
```
