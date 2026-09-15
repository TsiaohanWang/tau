# 与 Pi 兼容的「首保留」压缩 / Pi-Compatible First-Kept Compaction

## 变更内容(What changed)

[原文]
Tau compactions now persist `first_kept_entry_id`, the id of the first active-path
entry retained after the summarized prefix. The boundary may be a metadata entry that does
not itself produce a message. Fresh JSONL records omit the empty legacy `replaces_entry_ids`
field. The persisted cost is therefore constant instead of growing by one id for every
summarized entry.

[译文]
Tau 的压缩现在持久化 `first_kept_entry_id`,即摘要前缀之后保留下来的活动路径上第一个条目的 id。该边界可以是自身不产生消息的元数据条目。新的 JSONL 记录会省略空的旧式 `replaces_entry_ids` 字段。因此持久化开销是恒定的,而不会随着每个被摘要条目增加一个 id。

[原文]
`CompactionPlan` carries the boundary and a transient replaced-entry count. The count keeps
manual status text accurate without storing all replaced ids. Manual, threshold, and
overflow compaction all use the same recent-preserving plan, record the pre-compaction token
estimate, and do not write a compaction unless it has a real retained boundary.

[译文]
`CompactionPlan` 携带该边界以及一个瞬时的「被替换条目计数」。这个计数让手动状态文案保持准确,又无需存储全部被替换 id。手动、阈值触发与溢出触发的压缩都使用同一份保留近期内容的计划,记录压缩前的 token 估算,并且除非存在真实的保留边界,否则不写入压缩。

## 重放语义(Replay semantics)

[原文]
Replay follows the active root-to-leaf path. At a modern compaction it produces:

```text
[summary] + [first kept message ... messages before compaction] + [successor messages]
```

[译文]
重放沿着活动的「根到叶」路径进行。遇到现代格式的压缩时,它产生:

```text
[摘要] + [首个保留消息……压缩之前的消息] + [后继消息]
```

[原文]
The boundary is inclusive and is resolved against every entry on the active path, including
metadata and earlier compaction entries; only context-producing entries become messages. If
a hand-edited or boundary-less entry has no resolvable kept id, the pre-compaction result is
only the summary; normal path replay still adds successors written after that compaction.
This matches Pi's historical `firstKeptEntryId` behavior.

[译文]
该边界是包含式的,并且是在活动路径上的**每一个**条目上解析的,包括元数据与更早的压缩条目;只有会生产上下文的条目才会变成消息。如果某条手工编辑的、或无边界信息的条目没有可解析的保留 id,压缩前的结果就只有摘要;正常的路径重放仍会加上那次压缩之后写入的后继条目。这与 Pi 历史上 `firstKeptEntryId` 的行为一致。

[原文]
Tau applies compactions while walking the selected path, so branches not on that path never
influence the boundary lookup. A boundary at the first, middle, or final active message is
covered deterministically.

[译文]
Tau 在遍历所选路径时应用压缩,因此不在该路径上的分支永远不会影响边界查找。边界位于活动消息的第一个、中间或最后一个位置时,都有确定性的覆盖。

## 旧格式兼容性(Legacy compatibility)

[原文]
Older Tau versions persisted `replaces_entry_ids`, including records that also have a
`first_kept_entry_id`. An explicitly stored legacy list deliberately takes precedence, even
when it is empty. That preserves the old set-based behavior, including arbitrary non-prefix
replacement sets and summaries inserted at the first replaced position. The field remains
accepted by the strict Pydantic discriminated union and is omitted from fresh records when
it was not supplied.

[译文]
较旧的 Tau 版本持久化的是 `replaces_entry_ids`,包括同时带有 `first_kept_entry_id` 的记录。显式存储的旧式列表有意优先,即使它是空的。这保留了旧的「基于集合」的行为,包括任意非前缀的替换集合,以及摘要插入到第一个被替换位置的做法。该字段仍被严格的 Pydantic 判别式联合接受,并且在未被提供时不会出现在新记录中。

[原文]
RPC session inspection no longer emits `replacesEntryIds` or
`details.tauReplacedEntryIds`. Modern entries map directly to Pi's compaction shape. Legacy
entries without the complete Pi boundary/token pair remain `tau.compaction` custom records
with their summary, while local replay continues to honor the private compatibility field.
HTML export displays the first-kept boundary rather than the replaced-id list; raw JSONL
exports retain legacy data.

[译文]
RPC 会话检查不再发出 `replacesEntryIds` 或 `details.tauReplacedEntryIds`。现代条目直接映射到 Pi 的压缩形态。缺少完整 Pi 边界/token 配对的旧式条目,仍以 `tau.compaction` 自定义记录的形式保留其摘要,而本地重放继续遵守那个私有的兼容字段。HTML 导出展示「首保留边界」而不是被替换 id 列表;原始 JSONL 导出保留旧式数据。

## 为什么它属于这些层次(Why this belongs at these layers)

[原文]
- `tau_agent` owns entry compatibility and deterministic replay.
- `tau_coding` owns compaction planning, status text, RPC projection, and HTML presentation.

[译文]
- `tau_agent` 持有条目兼容性与确定性重放。
- `tau_coding` 持有压缩计划、状态文案、RPC 投射与 HTML 呈现。

[原文]
This keeps the portable harness independent of CLI and rendering policy while preserving
Tau's append-only session history.

[译文]
这既让可移植 harness 独立于 CLI 与渲染策略,又保留了 Tau 的只追加会话历史。

## 验证(Validation)

[原文]
Focused coverage lives in `tests/test_session.py`, `tests/test_coding_session.py`,
`tests/test_rpc.py`, and `tests/test_session_export.py`. The legacy fixture is
`tests/fixtures/legacy_compaction.jsonl`.

[译文]
聚焦覆盖位于 `tests/test_session.py`、`tests/test_coding_session.py`、`tests/test_rpc.py` 与 `tests/test_session_export.py`。旧格式 fixture 为 `tests/fixtures/legacy_compaction.jsonl`。

[原文]
Run the CI-equivalent suite with:

[译文]
运行与 CI 等价的套件:

```bash
uv run pytest
uv run ruff check .
uv run ruff format --check .
uv run mypy
```
