# 移除持久化的 leaf 会话条目(#700) / Drop persisted leaf session entries (#700)

[原文]
Tau now follows Pi's file-order rule for session tips: the active tip is the
last non-`leaf` entry in JSONL order.

[译文]
Tau 现在遵循 Pi 关于会话顶点的文件顺序规则:活动顶点是 JSONL 顺序中最后一个非 `leaf` 条目。

## 变更内容(Changes)

[原文]
- `CodingSession` no longer writes `LeafEntry` after messages, model or thinking
  changes, custom entries, history repairs, compactions, or tree navigation.
- Message persistence retries retain one stable `MessageEntry`. If append writes
  and then raises, retry reads durable ids and does not duplicate it.
- Replay ignores historical leaf pointers when selecting the tip. `LeafEntry`
  remains in the discriminated entry union so old files deserialize safely.
- Plain `/tree` navigation changes only the in-memory tip. A later write parents
  from that selection and makes the branch durable. Navigation with a branch
  summary writes the summary immediately, making it the file-order tip.
- HTML export derives the active path from the last non-leaf entry and can render
  historical leaf records without a special visibility filter.

[译文]
- `CodingSession` 不再在消息、模型或 thinking 变更、自定义条目、历史修复、压缩或树导航之后写入 `LeafEntry`。
- 消息持久化的重试保持同一个稳定的 `MessageEntry`。如果追加已写入随后抛错,重试会读取持久化 id,不会重复写入。
- 重放选择顶点时会忽略历史 leaf 指针。`LeafEntry` 仍留在判别式条目联合中,因此旧文件可以安全反序列化。
- 单纯的 `/tree` 导航只改变内存中的顶点。之后的一次写入会以该选择为父条目,从而使分支持久化。带分支摘要的导航会立即写入摘要,使其成为文件顺序中的顶点。
- HTML 导出从最后一个非 leaf 条目推导活动路径,并且可以在没有特殊可见性过滤的情况下渲染历史 leaf 记录。

## 兼容性与重启行为(Compatibility and restart behavior)

[原文]
Old leaf records are data, not active-pointer commands. Even if a trailing leaf
points to an older branch, resume uses the last non-leaf entry in file order.
This intentionally changes one edge case: selecting an older entry with `/tree`
and quitting before any subsequent write does not preserve that selection.

[译文]
旧 leaf 记录只是数据,不是活动指针指令。即使末尾的 leaf 指向更早的分支,恢复仍使用文件顺序中最后一个非 leaf 条目。这有意改变了一个边界情况:用 `/tree` 选中一个较早的条目、并在任何后续写入之前退出,不会保留该选择。

## 验证(Validation)

```bash
uv run pytest tests/test_session.py tests/test_session_export.py tests/test_coding_session.py -q
uv run pytest
```

[原文]
Coverage includes linear and branched resume, stale historical leaf records,
model/thinking tips, in-memory navigation followed by branch writes, single-entry
retry after before/after-append failures, and export rendering.

[译文]
覆盖内容包括:线性与分支恢复、陈旧的历史 leaf 记录、模型/thinking 顶点、内存导航后跟随分支写入、追加前/追加后失败后的单条目重试,以及导出渲染。
