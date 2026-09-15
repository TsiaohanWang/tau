---
title: "Bounded TUI Transcript Rendering / 有界的 TUI 会话记录渲染"
---

[原文]
Tau's Textual transcript now keeps a bounded window of message widgets mounted instead of
letting the Textual DOM grow with every message in a session.

[译文]
Tau 的 Textual 会话记录现在只挂载一个有界的消息组件窗口,而不是让 Textual DOM 随会话中的每条消息无限增长。

## 为什么需要它(Why this exists)

[原文]
The durable conversation and TUI display state were already separate, but the original
`TranscriptView` mounted one Textual widget tree for every `ChatItem`. Long sessions therefore
made unrelated interactions expensive: Textual had to visit thousands of message pumps during
layout and refresh work even when the user was only typing in the prompt.

[译文]
持久化对话与 TUI 显示状态本就分离,但最初的 `TranscriptView` 会为每个 `ChatItem` 挂载一棵 Textual 组件树。因此长会话会让无关交互也变得昂贵:即使用户只是在提示输入里打字,Textual 在布局与刷新期间也不得不遍历成千上万个消息泵(message pump)。

[原文]
A full transcript refresh was more expensive still because it removed and recreated every
message widget. Tool completion, structured thinking responses, result visibility toggles, and
terminal resize could all reach that path.

[译文]
整份会话记录的完全刷新代价更高,因为它会移除并重建每一个消息组件。工具完成、结构化 thinking 响应、结果可见性开关以及终端尺寸变化都可能走到这条路径上。

## 架构(Architecture)

[原文]
The complete display projection remains in `TuiState.items`. `TranscriptView` now mounts only a
contiguous frontend window:

```text
CodingSession / durable messages
              ↓
TuiState.items (complete display history)
              ↓
TranscriptView window (bounded Textual DOM)
```

[译文]
完整的显示投射仍然保存在 `TuiState.items` 中。`TranscriptView` 现在只挂载一个连续的前端窗口:

```text
CodingSession / 持久化消息
              ↓
TuiState.items(完整显示历史)
              ↓
TranscriptView 窗口(有界的 Textual DOM)
```

[原文]
The latest 200 items are mounted initially. Small boundary rows indicate when earlier or later
items are outside the window. Reaching a boundary moves the window by a smaller page while
keeping an existing message as the scroll anchor. The state is never truncated, and session
persistence is unchanged.

[译文]
初始挂载最近 200 个条目。小的边界行会提示窗口之外还有更早或更晚的条目。到达边界时,窗口会按一个更小的页幅移动,同时保留某条既有消息作为滚动锚点。状态永远不会被截断,会话持久化也不变。

[原文]
This is deliberately a Textual adapter optimization. No windowing, rendering, or widget policy
was added to `tau_agent` or `CodingSession`.

[译文]
这是有意作为 Textual 适配器的优化。`tau_agent` 或 `CodingSession` 中都没有加入窗口化、渲染或组件策略。

## 增量热路径(Incremental hot paths)

[原文]
Common event paths no longer rebuild transcript history:

[译文]
常见的事件路径不再重建会话记录历史:

[原文]
- tool completion updates the existing tool row;
- terminal commands append and complete one row;
- final ordered thinking/text blocks replace only the provisional assistant tail;
- thinking and tool-result visibility update only affected mounted rows;
- terminal resize relies on native Textual reflow;
- transcript item and tool-call lookup use frontend indexes rather than repeated scans.

[译文]
- 工具完成只更新既有的工具行;
- 终端命令只追加并完成一行;
- 最终有序的 thinking/文本块只替换临时的 assistant 尾部;
- thinking 与工具结果可见性只更新受影响的已挂载行;
- 终端尺寸变化依赖 Textual 原生重排;
- 会话记录条目与工具调用的查找使用前端索引,而不是反复扫描。

[原文]
The prompt activity animation remains smooth, but fixed-size animation frames skip layout and
tool elapsed-time rows update at most once per second.

[译文]
提示输入的活动动画仍然流畅,但固定尺寸的动画帧会跳过布局,工具耗时行最多每秒更新一次。

## 取舍(Tradeoffs)

[原文]
Native Textual Markdown, selection, streaming, and per-message rendering remain intact for the
mounted window. Moving between windows clears widgets outside the viewport, so a mouse selection
cannot span a paging boundary. The complete transcript remains available by continuing to scroll,
and exports/session replay still use the full durable history.

[译文]
对已挂载窗口而言,Textual 原生的 Markdown、选择、流式与逐消息渲染都保持不变。在窗口之间移动会清除视口之外的组件,因此鼠标选择无法跨越分页边界。继续滚动仍可访问完整会话记录,导出/会话重放也仍然使用完整的持久化历史。

## 验证(Validation)

[原文]
Automated tests cover:

[译文]
自动化测试覆盖:

[原文]
- a bounded mounted-widget count with complete state retained;
- paging in both transcript directions;
- scroll anchoring and streaming behavior;
- incremental tool, structured assistant, result-toggle, and resize updates;
- throttled activity/timer layout work.

[译文]
- 已挂载组件数量有界,同时保留完整状态;
- 向会话记录两个方向的分页;
- 滚动锚定与流式行为;
- 工具、结构化 assistant、结果开关与尺寸变化的增量更新;
- 被限流的活动/计时器布局工作。

[原文]
Run the project checks with:

[译文]
运行项目检查:

```bash
uv run pytest
uv run ruff check .
uv run ruff format --check .
uv run mypy
```
