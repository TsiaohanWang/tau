---
title: "Phase 20.4: Session Export and Visualization / 阶段 20.4:会话导出与可视化"
---

[原文]
Phase 20.4 adds a durable way to inspect Tau sessions outside the TUI.

[译文]
阶段 20.4 增加了在 TUI 之外检查 Tau 会话的持久化方式。

## 新增了什么(What was added)

[原文]
Tau can export any indexed session id or JSONL session file to a standalone
HTML document:

[译文]
Tau 可以把任意已索引的会话 id 或 JSONL 会话文件导出为一个独立的 HTML 文档:

```bash
tau export <session-id>
tau export <session-id> session.html
tau export <session-id> --format jsonl
tau export ~/.tau/sessions/<project>/<session-id>.jsonl
```

[原文]
When no destination is provided, `tau export` writes to the current working
directory instead of Tau's internal session storage directory. Interactive
sessions expose the same export flow through:

[译文]
未提供目标位置时,`tau export` 会写入当前工作目录,而不是 Tau 内部的会话存储目录。交互式会话通过以下命令暴露同一条导出流程:

```text
/export [--format html|jsonl] [destination]
```

[原文]
The export contains two coordinated views:

- a session tree that preserves parent-child relationships, branches, leaf
  pointers, and the active branch path
- a storage-order transcript/details view for messages, tool calls, tool
  results, compactions, labels, model changes, thinking changes, and custom
  entries

[译文]
导出内容包含两个相互联动的视图:

- 会话树:保留父子关系、分支、叶节点指针以及活动分支路径
- 按存储顺序排列的会话记录/详情视图:涵盖消息、工具调用、工具结果、压缩、标签、模型变更、thinking 变更与自定义条目

[原文]
The generated file is self-contained HTML, CSS, and JavaScript, so it can be
opened without running Tau or the Textual app. Transcript entries render as
compact, collapsed accordion rows (icon, title, one-line preview, timestamp),
with thinking blocks, tool-call arguments, and result details nested as inner
accordions. Tool rows are titled `Tool: <name>`, and the session tree labels
tool entries with just the tool name for readability. Chip-style header
filters—with entry counts—can hide tool calls/results in both views or drop
non-message session events for a user/assistant-focused transcript, and a
single button expands or collapses every accordion at once. A download button
reproduces the JSONL export from the entry data embedded (base64-encoded) in
the page, so the HTML file alone round-trips the full session. The filters
change only the exported view; the complete session remains embedded in the
document.

[译文]
生成的文件是自包含的 HTML、CSS 与 JavaScript,因此无需运行 Tau 或 Textual 应用即可打开。会话记录条目以紧凑的、默认折叠的手风琴行呈现(图标、标题、单行预览、时间戳),其中的 thinking 块、工具调用参数与结果详情嵌套为内层手风琴。工具行标题为 `Tool: <name>`,而会话树里的工具条目标签只使用工具名,以便阅读。页头的芯片式过滤器带有条目计数,可以在两个视图中隐藏工具调用/结果,或丢弃非消息类的会话事件,从而得到聚焦于用户/assistant 的会话记录;另有一个按钮可一次性展开或折叠所有手风琴。下载按钮会利用页面中内嵌(base64 编码)的条目数据重新生成 JSONL 导出,因此仅凭这个 HTML 文件就能完整往返整个会话。过滤器只改变导出的视图;完整会话仍嵌在文档中。

## 为什么需要它(Why it exists)

[原文]
Tau sessions are append-only trees, not a single flat chat log. That matters for
future fork and branch workflows because multiple candidate branches can share
the same root. A plain transcript would hide that shape and make it hard to
debug replay, compaction, or branch selection.

[译文]
Tau 会话是只追加的树,而不是一份扁平的聊天日志。这对未来的分叉与分支工作流很重要,因为多个候选分支可以共享同一个根。普通的一维会话记录会掩盖这种形态,使重放、压缩或分支选择的调试变得困难。

[原文]
The exporter keeps the visualization in `tau_coding` because it is an
application workflow over persisted session data. The reusable `tau_agent`
session models remain provider-neutral and frontend-neutral.

[译文]
导出器把可视化留在 `tau_coding`,因为这是建立在持久化会话数据之上的应用工作流。可复用的 `tau_agent` 会话模型仍保持 provider 无关、前端无关。

## 与 Pi 的对应关系(How it maps to Pi)

[原文]
Pi has an HTML session export flow for inspecting conversation state outside the
interactive interface. Tau mirrors the core product behavior while keeping the
implementation smaller: the exporter renders static HTML from the existing
`SessionEntry` JSONL records instead of adding a separate client-side app.

[译文]
Pi 有一条 HTML 会话导出流程,用于在交互界面之外检查对话状态。Tau 镜像了这一核心产品行为,同时把实现保持得更小:导出器直接从既有的 `SessionEntry` JSONL 记录渲染静态 HTML,而不是引入一个独立的客户端应用。

## 如何测试(How to test it)

[原文]
Run the focused tests:

[译文]
运行聚焦测试:

```bash
uv run pytest tests/test_session_export.py tests/test_cli.py -k export
```

[原文]
Run the full gate before shipping:

[译文]
发布前运行完整关卡:

```bash
uv run pytest
uv run ruff check src tests
uv run mypy
uv run --group docs mkdocs build --strict
```
