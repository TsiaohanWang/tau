# Markdown 渲染的 `/system` 会话记录输出 / Markdown-rendered `/system` transcript output

## 变更内容(What changed)

[原文]
The TUI keeps `/system` output inside the transcript as a local-only status item. The output is separated from the command label with a blank line so the existing Markdown transcript renderer can provide readable paragraph, heading, list, and inline-code spacing.

[译文]
TUI 把 `/system` 的输出保留在会话记录中,作为仅本地的状态条目。输出与命令标签之间用一个空行分隔,使既有的 Markdown 会话记录渲染器能够提供可读的段落、标题、列表与行内代码间距。

[原文]
Each contiguous prompt section now has a numbered heading and source label.
Tau's deterministic builder attributes the built-in/custom base, each append
file, extension section, project instruction file, skill, date, and working
directory while preserving the exact provider-facing prompt when section
contents are concatenated. Explicit CLI values use their flag as the origin.
An exact `CodingSessionConfig.system` override is labeled directly. In the TUI,
each source is its own block: its name, left border, and faint background share
a stable theme-derived source-kind color. If live prompt text ever differs from
reconstructed inputs, inspection falls back to a single runtime-composed
section rather than showing incorrect provenance.

[译文]
每个连续的提示词区块现在都有编号标题与来源标签。Tau 的确定性构建器会归属内置/自定义基础提示词、每个追加文件、扩展区块、项目指令文件、技能、日期与工作目录,同时在拼接各区块内容时保持与 provider 面对面完全一致的提示词。显式的 CLI 值以其 flag 作为来源。精确的 `CodingSessionConfig.system` 覆盖会被直接标注。在 TUI 中,每个来源都是独立的块:其名称、左侧边框与淡色背景共享一种由主题派生、稳定的「来源种类」颜色。如果实时提示词文本与重建出的输入出现差异,检查视图会回退为单个由运行时组合的区块,而不是展示错误的来源信息。

[原文]
The system prompt is display-only: it is not sent back to the provider, persisted as a session message, or counted as conversation context.

[译文]
系统提示词仅用于显示:它不会被发回 provider,不会作为会话消息持久化,也不会被计入对话上下文。

## 为什么(Why)

[原文]
System prompts can include tool instructions, project context, and loaded-skill metadata. A large unformatted block is difficult to scan. Reusing the transcript's Markdown rendering keeps the command output in the user's normal reading flow while making Markdown structure visible.

[译文]
系统提示词可能包含工具指令、项目上下文与已加载技能的元数据。一大块未格式化的内容很难扫读。复用会话记录的 Markdown 渲染,既让命令输出留在用户正常的阅读流中,又能让 Markdown 结构可见。

[原文]
Markup tags are protected from Markdown's HTML handling and rendered as inline code, using the active theme's code color so the tags stay visible and distinct from prompt prose. More detailed tag-aware syntax highlighting can build on this seam later without changing the prompt sent to the model.

[译文]
标记标签被保护起来,不受 Markdown 的 HTML 处理影响,并渲染为行内代码;使用当前主题的代码颜色,使这些标签保持可见、且与提示词正文区分开来。更细致的、感知标签的语法高亮日后可以在这个接缝之上构建,而无需改变发送给模型的提示词。

## 架构(Architecture)

[原文]
The behavior stays in `tau_coding.tui`: slash-command semantics remain in `tau_coding.commands`, while the Textual frontend chooses how local command output is presented. The prompt itself remains owned by `CodingSession` and is never added to `TuiState` as a model message.

[译文]
该行为留在 `tau_coding.tui`:斜杠命令语义仍在 `tau_coding.commands`,而 Textual 前端决定本地命令输出如何呈现。提示词本身仍由 `CodingSession` 持有,永远不会作为模型消息加入 `TuiState`。

## 测试(Testing)

[原文]
Builder and coding-session tests verify source ordering, paths, exact text
coverage, and conservative fallback behavior. The Textual pilot test for
`/system` verifies that the command remains in the transcript, uses the Markdown
widget, and leaves no modal or model-context entry:

[译文]
构建器与编码会话测试验证来源顺序、路径、精确文本覆盖,以及保守的回退行为。针对 `/system` 的 Textual 试点测试验证:该命令仍留在会话记录中、使用 Markdown 组件,并且不留下模态框或模型上下文条目:

```bash
uv run pytest tests/test_tui_app.py -k system
```
