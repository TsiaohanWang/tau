# 一等公民的自定义消息会话条目 / First-class custom message session entries

[原文]
GitHub issue #704 aligns Tau's persisted extension messages with Pi's session
entry model without changing what providers receive.

[译文]
GitHub issue #704 让 Tau 持久化的扩展消息与 Pi 的会话条目模型对齐,同时不改变 provider 收到的内容。

## 变更内容(What changed)

[原文]
Runtime extension context is still represented by `CustomMessage(role="custom")`.
Persistence now stores it as a dedicated `CustomMessageEntry`:

[译文]
运行时扩展上下文仍由 `CustomMessage(role="custom")` 表示。持久化现在把它存为专门的 `CustomMessageEntry`:

```json
{"type":"custom_message","custom_type":"extension:status","content":"working","display":true}
```

[原文]
Tau session wrappers use snake_case (`parent_id`, `custom_type`). Nested content
blocks retain their Pi-compatible aliases, such as `mimeType`. RPC is a separate
compatibility boundary and projects the same entry with Pi's `parentId` and
`customType` names.

[译文]
Tau 的会话包装字段使用 snake_case(`parent_id`、`custom_type`)。嵌套内容块保留其与 Pi 兼容的别名,例如 `mimeType`。RPC 是独立的兼容边界,它把同一条目投射为 Pi 的 `parentId` 与 `customType` 名称。

[原文]
`CodingSession` chooses the entry type at the durable `MessageEndEvent`
boundary. Retry state retains that exact entry and ID, so an append that reaches
storage before raising is detected and is not duplicated. Tool-history repair
uses the same entry factory when it copies a custom message onto a repaired
branch.

[译文]
`CodingSession` 在持久化的 `MessageEndEvent` 边界上选择条目类型。重试状态会保留那个确切的条目与 ID,因此「已到达存储、随后才抛错」的追加会被检测到,不会被重复写入。工具历史修复在把自定义消息复制到修复分支上时,使用同一个条目工厂。

## 重放与兼容性(Replay and compatibility)

[原文]
`SessionState` turns `custom_message` entries back into `CustomMessage` values.
Providers continue to receive the same user-role content through
`message_to_user()`; `display` and `details` never enter the provider payload.
The entry timestamp is derived from the runtime message timestamp and converted
back to milliseconds on replay.

[译文]
`SessionState` 会把 `custom_message` 条目还原为 `CustomMessage` 值。Provider 继续通过 `message_to_user()` 收到相同的 user 角色内容;`display` 与 `details` 永远不会进入 provider 载荷。条目时间戳派生自运行时消息时间戳,并在重放时转换回毫秒。

[原文]
The JSONL migration boundary accepts both historical Tau forms:

[译文]
JSONL 迁移边界同时接受两种历史 Tau 形态:

[原文]
- a generic `message` entry whose nested role is `custom`
- Tau-v1 `role="user"` messages carrying `custom_type` or `customType`

[译文]
- 嵌套角色为 `custom` 的通用 `message` 条目
- 带 `custom_type` 或 `customType` 的 Tau-v1 `role="user"` 消息

[原文]
Both normalize in memory to `custom_message`. The migration moves the nested
message timestamp to the entry timestamp so replay preserves the original
runtime message, including content, type, details, display, and timestamp. It
also accepts `customType` on an incoming dedicated entry, but canonical Tau
persistence writes `custom_type`.

[译文]
两者在内存中都会归一化为 `custom_message`。迁移会把嵌套消息的时间戳移到条目时间戳上,从而让重放保留原始运行时消息,包括内容、类型、details、display 与时间戳。它也接受传入的专门条目上使用 `customType`,但 Tau 的规范持久化写出的是 `custom_type`。

## 显示行为(Display behavior)

[原文]
A hidden custom message (`display=false`) remains in replayed model context but
is omitted from live and restored TUI transcripts and from the visible HTML
export. The HTML export's embedded JSONL download still contains every entry.
Visible custom messages render their raw content and details in static exports;
live extension renderers remain responsible for richer TUI/print formatting.

[译文]
隐藏的自定义消息(`display=false`)仍留在重放后的模型上下文中,但会从实时与恢复后的 TUI 会话记录以及可见的 HTML 导出中省略。HTML 导出内嵌的 JSONL 下载仍包含每一条目。可见的自定义消息在静态导出中渲染其原始内容与 details;更丰富的 TUI/print 格式仍由实时扩展渲染器负责。

## 验证(Validation)

[原文]
Focused coverage includes schema round trips, both legacy migrations, replay,
provider conversion through the extension prompt path, retry idempotence, RPC
projection, HTML visibility, and live/restored TUI visibility. Run all project
checks with:

[译文]
聚焦覆盖包括:schema 双向转换、两种旧格式迁移、重放、经由扩展提示路径的 provider 转换、重试幂等性、RPC 投射、HTML 可见性,以及实时/恢复后的 TUI 可见性。运行全部项目检查:

```bash
uv run pytest
uv run ruff check .
uv run ruff format --check .
uv run mypy
```
