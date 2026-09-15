# TUI 中的分组文件调用 / Grouped file calls in the TUI

[原文]
Models often request several files in one assistant response. Rendering every
batched `read` as a separate collapsed row made exploration-heavy turns noisy,
even though the calls formed one logical batch.

[译文]
模型经常在一次 assistant 响应中请求多个文件。把每个批量 `read` 都渲染成独立的折叠行,会让以探索为主的轮次变得嘈杂,尽管这些调用本属于同一逻辑批次。

## 变更内容(What changed)

[原文]
The TUI now combines adjacent `read` calls from the same assistant message into
one presentation group with every path listed below its headline:

[译文]
TUI 现在把来自同一条 assistant 消息的相邻 `read` 调用合并为一个呈现分组,并在其标题之下列出所有路径:

```text
→ Reading 4 files
  - tools.py
  - state.py
  - widgets.py
  - adapter.py
```

[原文]
As results arrive, the row reports aggregate progress such as `2/4 complete`.
Once all calls finish it changes to `Read 4 files`; if any call failed, the row
also reports the failure count and uses the existing error styling. The aggregate
description and progress carry the running/success/failure color, while every
file path stays in the neutral tool-body color.

[译文]
随着结果到达,该行会报告聚合进度,例如 `2/4 complete`。当所有调用结束,它会变为 `Read 4 files`;如果有调用失败,该行还会报告失败数量,并使用既有的错误样式。聚合描述与进度带有运行中/成功/失败颜色,而每个文件路径保持中性的工具正文字色。

[原文]
`Ctrl+O` expands the group into every exact read invocation without repeating
previews of the file contents. The model already receives each complete result;
the expanded TUI stays focused on which files were read. A single read keeps its
existing row and result behavior. Reads separated by another tool, text block,
or assistant response are not grouped. Skill-file reads retain their special
skill presentation.

[译文]
`Ctrl+O` 会把分组展开为每一个确切的 read 调用,但不重复文件内容预览。模型本就收到了每个完整结果;展开后的 TUI 只聚焦于读取了哪些文件。单次 read 保持其既有的行与结果行为。被其他工具、文本块或 assistant 响应隔开的 read 不会被分组。技能文件的 read 保留其特殊的技能呈现。

[原文]
Adjacent built-in `edit` and `write` calls use the same presentation: `Editing N
files` becomes `Edited N files`, while `Writing N files` becomes `Written N files`.
Every affected path is listed below. Expanding edit and write groups preserves
each invocation and result, unlike read groups whose file-content results stay
suppressed. Consecutive edit-only or write-only model continuations also join the
same group; this covers providers that emit one mutation, wait for its result,
then emit the next. Assistant text or thinking still ends the group.

[译文]
相邻的内置 `edit` 与 `write` 调用使用同样的呈现:`Editing N files` 会变为 `Edited N files`,而 `Writing N files` 会变为 `Written N files`。所有受影响的路径都会列在下方。展开 edit 与 write 分组会保留每个调用与结果,这与 read 分组不同 —— 后者的文件内容结果保持被抑制。仅含 edit 或仅含 write 的连续模型续跑也会并入同一分组;这覆盖了那些「发出一次修改、等待其结果、再发出下一次」的 provider。Assistant 文本或 thinking 仍会结束该分组。

## 架构(Architecture)

[原文]
Grouping is display-only in `src/tau_coding/tui/`. `TuiEventAdapter` assigns a
presentation batch identifier to tool calls from one completed assistant message.
`TuiState` keeps each grouped call's ID, arguments, progress, result, and timing,
while exposing one aggregate file row. That row can stand alone or live inside a
larger mixed-tool batch. Every call ID maps back to its top-level item, so live
updates continue to use O(1) lookup and refresh the existing Textual widget in
place. Results still determine aggregate progress and error styling. Read-result
contents stay suppressed, while edit and write results remain available on
expansion.

[译文]
分组在 `src/tau_coding/tui/` 中是仅显示的。`TuiEventAdapter` 为来自同一条已完成 assistant 消息的工具调用分配一个呈现批次标识。`TuiState` 保存每个分组调用的 ID、参数、进度、结果与计时,同时暴露一个聚合文件行。该行可以独立存在,也可以位于更大的混合工具批次之中。每个调用 ID 都映射回其顶层条目,因此实时更新继续使用 O(1) 查找,并就地刷新既有的 Textual 组件。结果仍决定聚合进度与错误样式。Read 的结果内容保持被抑制,而 edit 与 write 的结果在展开时仍可查看。

[原文]
Restored canonical messages rebuild groups deterministically. Read groups retain
assistant-message boundaries. Edit and write groups may additionally span
consecutive same-tool model continuations when each preceding mutation completed;
assistant text, thinking, or another tool ends the group. Eligibility comes from
the canonical assistant block sequence rather than transient display adjacency,
so live and restored sessions make the same grouping decision. Agent events, tool
execution, provider payloads, and session JSONL remain unchanged. Existing custom
call renderers are applied to each invocation when a group is expanded.

[译文]
恢复的规范消息会确定性地重建分组。Read 分组保持 assistant 消息边界。当此前的每次修改都已完成时,edit 与 write 分组还可以跨越连续的同工具模型续跑;assistant 文本、thinking 或另一个工具会结束分组。分组资格来自规范的 assistant 内容块序列,而不是临时的显示相邻性,因此实时会话与恢复会话会做出相同的分组决策。Agent 事件、工具执行、provider 载荷与会话 JSONL 均不变。展开分组时,既有的自定义调用渲染器会应用到每个调用上。

[原文]
Only built-in `read`, `edit`, and `write` calls use file grouping. Shell commands
and extension tools retain their own presentation semantics.

[译文]
只有内置的 `read`、`edit` 与 `write` 调用使用文件分组。Shell 命令与扩展工具保留各自的呈现语义。

## 测试(Tests)

[原文]
- `tests/test_tui_adapter.py` covers restored read/edit/write groups, serialized
  edit/write continuations, text boundaries, path lists, call-ID lookup, and
  expansion.
- `tests/test_tui_app.py` covers live grouping, in-place progress updates,
  completion, and `Ctrl+O` expansion in Textual.

[译文]
- `tests/test_tui_adapter.py` 覆盖恢复后的 read/edit/write 分组、串行化的 edit/write 续跑、文本边界、路径列表、调用 ID 查找与展开。
- `tests/test_tui_app.py` 覆盖实时分组、就地进度更新、完成,以及 Textual 中的 `Ctrl+O` 展开。

[原文]
Run:

[译文]
运行:

```bash
uv run pytest tests/test_tui_adapter.py tests/test_tui_app.py
```
