---
title: "Phase 17.5: TUI Transcript Wrapping / 阶段 17.5:TUI 会话记录换行"
---

[原文]
Phase 17.5 hardens the Textual transcript surface so it behaves more like a
minimal chat stack.

[译文]
阶段 17.5 加固了 Textual 的会话记录界面,使其行为更接近一个极简聊天栈。

[原文]
The implementation lives in:

[译文]
实现位于:

```text
src/tau_coding/tui/app.py
src/tau_coding/tui/widgets.py
```

## 新增了什么(What was added)

[原文]
Transcript items now render as standalone colored blocks instead of prefixed
lines such as `you:` or `assistant:`.

[译文]
会话记录条目现在渲染为独立的彩色块,而不再是带 `you:` 或 `assistant:` 之类前缀的行。

[原文]
The display state remains simple:

[译文]
显示状态仍然很简单:

```python
ChatItem(role="user", text="...")
```

[原文]
Only the Textual renderer decides how to display that item. This preserves the
core boundary:

```text
CodingSession emits events
TuiEventAdapter builds display state
TranscriptView renders blocks
```

[译文]
只有 Textual 渲染器决定如何展示该条目。这保持了核心边界:

```text
CodingSession 发出事件
TuiEventAdapter 构建显示状态
TranscriptView 渲染块
```

## 换行行为(Wrapping behavior)

[原文]
`TranscriptView` is now a `VerticalScroll` container of individual
`TranscriptMessageWidget` children. The container keeps:

[译文]
`TranscriptView` 现在是一个由独立 `TranscriptMessageWidget` 子组件构成的 `VerticalScroll` 容器。该容器保持:

```python
min_width = 1
```

[原文]
Each message widget owns its Rich renderable and its selected-text extraction.
This keeps normal user and assistant messages reflowing to the available
terminal width while avoiding one large transcript-wide selection surface. Chat
block bodies use Rich `Text` with folded overflow so long unbroken strings are
wrapped inside the block instead of forcing horizontal scrolling.

[译文]
每个消息组件持有自己的 Rich 渲染对象与选中文本提取逻辑。这既让普通的用户与 assistant 消息按可用终端宽度重排,又避免了整份会话记录只有一个巨大的选择面。对话块正文使用带折叠溢出(folded overflow)的 Rich `Text`,因此很长的连续字符串会在块内换行,而不会强制出现横向滚动。

[原文]
Tool output and code-like text preserve line breaks. Very long unbroken chunks
are folded intentionally rather than clipped.

[译文]
工具输出与类代码文本保留换行。极长的连续片段会被有意折叠,而不是被裁掉。

[原文]
Later Phase 23 polish keeps the same display-state shape but renders fenced
code blocks, edit patches, and assistant Markdown with Rich renderables inside
the block. Malformed or inline fences fall back to plain text so transcript
content is not lost.

[译文]
后续 Phase 23 的打磨保持了同样的显示状态形态,但在块内用 Rich 渲染对象渲染围栏代码块、edit patch 与 assistant Markdown。畸形或行内的围栏会回退为纯文本,因此会话记录内容不会丢失。

## 视觉模型(Visual model)

[原文]
Each role gets a distinct dark block style:

[译文]
每种角色都有各自独立的深色块样式:

[原文]
- user
- assistant
- tool
- status
- error

[译文]
- user
- assistant
- tool
- status
- error

[原文]
The role is expressed by color, not by an inline label. This keeps the TUI
minimal while still making transcript structure scannable.

[译文]
角色由颜色表达,而不是行内标签。这既让 TUI 保持极简,又让会话记录的结构依然可扫读。

## 测试(Tests)

[原文]
The phase is covered by:

[译文]
本阶段的测试覆盖为:

```text
tests/test_tui_app.py
```

[原文]
The tests verify:

- chat items render without `you:`, `assistant:`, or `tool:` prefixes
- long unbroken message text folds within a narrow console width
- the mounted transcript uses a narrow `min_width`
- selection extraction is scoped to one message widget or adjacent message widgets

[译文]
测试验证:

- 聊天条目渲染时没有 `you:`、`assistant:` 或 `tool:` 前缀
- 很长的连续消息文本能在窄控制台宽度内折叠
- 已挂载的会话记录使用较窄的 `min_width`
- 选中文本提取被限定在单个消息组件或相邻消息组件范围内
