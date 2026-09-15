# TUI 中的批量工具调用 / Batched tool calls in the TUI

[原文]
Assistant responses frequently contain several adjacent tool calls. Even after
read calls gained their own compact grouping, rendering each remaining call as a
separate transcript message repeated the same border, padding, and vertical
spacing for one logical burst of work.

[译文]
Assistant 响应经常包含多个相邻的工具调用。即使在 read 调用获得自己的紧凑分组之后,把剩余每个调用都渲染成单独的会话记录消息,仍会为同一段逻辑工作重复相同的边框、内边距与垂直间距。

## 变更内容(What changed)

[原文]
Adjacent built-in tool calls from one assistant response now share one transcript
message. Each logical action remains one line:

[译文]
来自同一条 assistant 响应的相邻内置工具调用现在共享一条会话记录消息。每个逻辑动作仍占一行:

```text
Doing thing one
Doing thing two
Read 2 files
  - a.py
  - b.py
Doing something else
```

[原文]
Each line keeps its own running, success, or failure color on the semantic
description. Commands, arguments, and paths remain neutral. Adjacent reads still
collapse into file-list rows inside the larger batch, as do adjacent edits and
writes.

[译文]
每一行都在其语义描述上保留各自的运行中、成功或失败颜色。命令、参数与路径保持中性色。相邻的 read 仍会在更大的批次内折叠为文件列表行,相邻的 edit 与 write 也是如此。

[原文]
`Ctrl+O` expands every row using its tool-specific behavior. Bash rows retain
their description and show the exact command and result beneath it. Grouped reads
expand to individual read invocations without repeating file-content previews;
grouped edits and writes retain each invocation and result. Batch invocations and
results remain one selectable plain-text surface.

[译文]
`Ctrl+O` 会按各工具特有的行为展开每一行。Bash 行保留其描述,并在其下显示确切的命令与结果。分组 read 会展开为逐个 read 调用,但不重复文件内容预览;分组 edit 与 write 会保留每个调用与结果。批量的调用与结果仍是同一个可选择的纯文本界面。

[原文]
Batches never cross assistant text, thinking blocks, skill loads, or unrelated
assistant responses. A narrow exception joins consecutive completed `edit` or
`write` calls from same-tool model continuations, matching providers that
serialize file mutations one at a time. Only the known `bash`, `read`, `edit`,
and `write` tools are eligible; extension tools remain separate so custom call or
result cards are never
flattened into generic text rows.

[译文]
批次永远不会跨越 assistant 文本、thinking 块、技能加载或不相关的 assistant 响应。一个窄例外会把来自「同工具模型续跑」的连续已完成 `edit` 或 `write` 调用合并,以匹配那些逐次串行化文件修改的 provider。只有已知的 `bash`、`read`、`edit` 与 `write` 工具有资格;扩展工具保持独立,因此自定义的调用或结果卡片永远不会被压平成通用文本行。

## 架构(Architecture)

[原文]
This remains a TUI-only projection. `TuiEventAdapter` assigns one presentation
batch identifier to each contiguous tool-call run in an assistant message.
`TuiState` stores one parent `ChatItem` with structured child rows, while every
underlying tool-call ID continues to map to the parent for O(1) live updates. A
child row may itself own a grouped-read call list.

[译文]
这仍然是仅限 TUI 的投射。`TuiEventAdapter` 为 assistant 消息中的每一段连续工具调用分配一个呈现批次标识。`TuiState` 存储一个父 `ChatItem` 以及结构化的子行,而每个底层工具调用 ID 仍映射到父项,以便 O(1) 实时更新。一个子行自身还可以拥有一个分组 read 的调用列表。

[原文]
The transcript widget renders child rows as one Rich `Text` value with status
spans per child rather than a `Group` of separate renderables. This preserves
Textual's drag selection across lines while retaining independent colors.
Expansion and selection text are derived from the same structured children.
Provider payloads,
agent events, execution order, canonical messages, and session JSONL are
unchanged.

[译文]
会话记录组件把子行渲染为单个 Rich `Text` 值,并按子行设置状态 span,而不是使用由多个独立渲染对象组成的 `Group`。这既保留了 Textual 跨行的拖拽选择,又保留了各自独立的颜色。展开文本与选择文本都派生自同一份结构化子行。Provider 载荷、agent 事件、执行顺序、规范消息与会话 JSONL 均不变。

## 测试(Tests)

[原文]
- `tests/test_tui_adapter.py` covers restored mixed-tool batches, nested read
  groups, and call-ID lookup.
- `tests/test_tui_app.py` covers one-widget rendering, expansion, bash results,
  and suppressed grouped-read content.

[译文]
- `tests/test_tui_adapter.py` 覆盖恢复后的混合工具批次、嵌套 read 分组与调用 ID 查找。
- `tests/test_tui_app.py` 覆盖单组件渲染、展开、bash 结果与被抑制的分组 read 内容。

[原文]
Run:

[译文]
运行:

```bash
uv run pytest tests/test_tui_adapter.py tests/test_tui_app.py
```
