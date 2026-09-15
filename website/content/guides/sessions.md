---
title: "Sessions / 会话"
description: "Resume past conversations, branch from any point in history, rename sessions, and export them. / 恢复过往对话、从历史的任意位置分支、重命名会话并导出它们。"
---

[原文]
Every Tau conversation is a **session**, saved to disk so you can come back to
it. Sessions are stored as append-only JSONL under `~/.tau/sessions/`, organized
per working directory, so resume flows focus on the project you're in.

[译文]
每一次 Tau 对话都是一个**会话(session)**,保存到磁盘,以便你随时回来。会话以只追加的 JSONL 形式存放在 `~/.tau/sessions/` 下,并按工作目录组织,因此恢复流程会聚焦于你当前所在的项目。

## 列出会话(Listing sessions)

```bash
tau sessions
```

[原文]
Each row shows the session id, title, model, and working directory.

[译文]
每一行显示会话 id、标题、模型与工作目录。

## 恢复会话(Resuming)

[原文]
From the shell:

[译文]
在 shell 中:

```bash
tau --session <session-id>
```

[原文]
From inside the TUI:

```text
/resume            # open a picker of past sessions
/resume <id>       # resume a specific session
```

[译文]
在 TUI 内部:

```text
/resume            # 打开过往会话的选择器
/resume <id>       # 恢复某个特定会话
```

[原文]
The `/resume` picker separates projects and recent sessions into two columns.
The project column uses compact folder names; the selected project's full path
appears above the session column. Its shell opens immediately, then the current
project and other project indexes load in the background. Press
**Left** to move to the project column, use **Up/Down** to choose another
project, then press **Right** to return to its sessions. Press **Enter** (or
click) to resume one.

[译文]
`/resume` 选择器把项目与最近会话分成两列。项目列使用紧凑的文件夹名;所选项目的完整路径显示在会话列上方。它的框架会立即打开,随后当前项目与其他项目的索引在后台加载。按 **Left** 移动到项目列,用 **Up/Down** 选择另一个项目,再按 **Right** 回到该项目的会话。按 **Enter**(或点击)即可恢复其中一个。

[原文]
The search field filters session names and models within the selected project.

[译文]
搜索框会在所选项目内过滤会话名与模型。

[原文]
To deliberately start fresh instead of resuming, use `tau --new-session` (or
`/new` in the TUI).

[译文]
若要刻意从零开始而不是恢复,请使用 `tau --new-session`(或 TUI 中的 `/new`)。

[原文]
When you quit the TUI and the session was persisted, Tau prints a reminder of
the exact command to resume it:

[译文]
当你退出 TUI 且该会话已持久化时,Tau 会打印一条提醒,给出恢复它的确切命令:

```text
To resume this session: tau --session <session-id>
```

## 从历史中分支 / Branching from history (`/tree`)

[原文]
A session is a *tree*, not just a line — so you can go back and try a different
path without losing what you had.

[译文]
一个会话是一棵*树*,而不只是一条线 —— 因此你可以回退并尝试另一条路径,而不会丢掉已有的内容。

[原文]
Run `/tree` to open the session tree, then select an earlier entry:

[译文]
运行 `/tree` 打开会话树,然后选择一个较早的条目:

[原文]
- **Enter** — continue from that point, preserving the existing branch.
- **S** — ask the active model for a structured summary of the messages you're
  leaving behind before moving the active point.
- **C** — provide custom focus instructions for that one summary.
- **L** — create or edit a bookmark label on the highlighted entry. Submit an
  empty label to clear it.
- **Ctrl+F** — toggle a view containing only labeled entries.
- **Ctrl+L** — show or hide when each visible label was last changed.
- **Ctrl+T** — show or hide tool-call rows.

[译文]
- **Enter** —— 从该点继续,保留既有分支。
- **S** —— 在移动活动点之前,请求当前活动模型为你即将留下的消息生成一份结构化摘要。
- **C** —— 为这一次摘要提供自定义的关注指令。
- **L** —— 在高亮的条目上创建或编辑书签标签。提交空标签即可清除它。
- **Ctrl+F** —— 切换为只显示带标签条目的视图。
- **Ctrl+L** —— 显示或隐藏每个可见标签的最后修改时间。
- **Ctrl+T** —— 显示或隐藏工具调用行。

[原文]
Labels render as `[label]` before the entry. They are per-entry bookmarks and
remain attached to their entry across branches; they do not rename the session.
Use `/name` for the separate session display title.

[译文]
标签渲染为条目之前的 `[label]`。它们是逐条目的书签,跨分支仍附着于其条目;它们不会重命名会话。会话的显示标题请用 `/name` 单独设置。

[原文]
If a summary request fails, Tau falls back to a deterministic summary.

[译文]
如果摘要请求失败,Tau 会回退到一个确定性的摘要。

[原文]
The active branch tip is the last session entry written. Plain **Enter**
navigation is in-memory only: quitting before another action and reopening will
return to the last non-legacy-leaf entry in file order. Your next message or
state change uses the selected point as its parent, making the new branch the
active persisted tip. **S** writes its branch summary immediately, so summarized
navigation survives a restart even before another message.

[译文]
活动分支的末端是最后写入的那条会话条目。单纯的 **Enter** 导航只存在于内存中:若在采取其他动作之前就退出并重新打开,会回到文件顺序中最后一条非 legacy leaf 的条目。你的下一条消息或状态变更会以所选点作为父节点,从而让新分支成为活动且已持久化的末端。**S** 会立即写入它的分支摘要,因此带摘要的导航即使在写下一条消息之前也能在重启后保留。

## 修复较旧的会话(Recovering older sessions)

[原文]
Older Tau versions could leave malformed tool-call history when a run was
interrupted. Providers reject that history, so every prompt in the resumed
session could fail with a 400 error about a missing tool call or tool output.

[译文]
较旧的 Tau 版本在一次运行被中断时,可能留下畸形的工具调用历史。provider 会拒绝这种历史,因此被恢复会话中的每一次提示词都可能失败,报出关于缺少工具调用或工具输出的 400 错误。

[原文]
Tau validates the active branch during resume and after `/tree` navigation. It
repairs missing, misplaced, duplicate, or orphaned tool results by appending a
provider-safe branch while preserving the original JSONL entries. A durable
session diagnostic records what changed. Repeating resume is idempotent and does
not append another repair when history is already valid.

[译文]
Tau 会在恢复期间以及 `/tree` 导航之后校验活动分支。它通过追加一条 provider 安全的分支来修复缺失、错位、重复或孤立的工具结果,同时保留原有的 JSONL 条目。一条持久的会话诊断会记录发生了什么变化。重复恢复是幂等的:当历史已经有效时,不会再追加一次修复。

## 重命名(Renaming)

[原文]
New sessions are automatically given a short name from the first message when
Tau can generate one. Tau shows the confirmed message first—including the
expanded text from a prompt-template slash command—then performs naming without
holding up that transcript update. The name appears anywhere session names are
already shown, including the `/resume` picker and id completions.

[译文]
当 Tau 能够生成名称时,新会话会根据第一条消息自动获得一个简短名称。Tau 先显示已确认的消息 —— 包括来自提示词模板斜杠命令展开后的文本 —— 然后执行命名,而不阻塞那次会话记录更新。该名称会出现在所有原本就显示会话名的地方,包括 `/resume` 选择器与 id 补全。

[原文]
Auto-naming makes one high-level provider request. The provider adapter may retry
transient failures according to its configured `max_retries`. If those attempts
are exhausted, or the response is not a usable title, Tau does not start another
naming request: the session continues normally and uses a short local fallback
when possible.

[译文]
自动命名会发出一次高层级的 provider 请求。provider 适配器可能按配置的 `max_retries` 重试瞬时故障。如果这些尝试都耗尽,或响应不是一个可用的标题,Tau 不会再次发起命名请求:会话照常继续,并在可能时使用一个简短的本地回退名。

```text
/name My refactor session
```

[原文]
Use `/name` at any time to manually override the automatic name. Tau will not
replace a name you set yourself.

[译文]
随时用 `/name` 手动覆盖自动名称。Tau 不会替换你自己设置的名称。

## 导出(Exporting)

[原文]
Export a session to a shareable file:

```text
/export                              # HTML, into the current directory
/export --format jsonl               # raw JSONL
/export --format html report.html    # explicit destination
```

[译文]
把会话导出为可分享的文件:

```text
/export                              # HTML,输出到当前目录
/export --format jsonl               # 原始 JSONL
/export --format html report.html    # 显式指定目标路径
```

[原文]
Or from the shell:

[译文]
或在 shell 中:

```bash
tau export <session-id>                     # HTML (default)
tau export <session-id> session.html
tau export <session-id> --format jsonl
```

[原文]
The source can be an indexed session id **or** a path to a JSONL session file.
After a successful `/export`, Tau shows the destination in the TUI transcript.
This status is display-only: it is not saved to session history or sent to the
model as context.

[译文]
来源可以是一个已索引的会话 id,**也可以**是指向某个 JSONL 会话文件的路径。`/export` 成功之后,Tau 会在 TUI 会话记录中显示目标位置。这条状态仅用于显示:它不会保存进会话历史,也不会作为上下文发送给模型。

[原文]
HTML exports are self-contained and include two tabs: **Transcript** preserves
the session tree and entries in storage order, while **Cache** summarizes the
active branch's model requests, including the requests that generate compaction
and branch summaries, prompt caching, output and reasoning tokens, estimated
API-rate cost, tool calls, and compactions. Summary-generation requests are
labeled separately in the request table rather than blended into assistant turns.
Cache charts are
interactive—hover for exact values and select a legend item to hide a
series—and can be downloaded as static PNG images with white backgrounds. The
export follows Tau's themes: tau-light in light mode and tau-dark in dark mode,
with charts recoloring live when you toggle the theme. When `/export` creates
HTML from the live session, it also includes the current
system prompt in a separate, collapsed **System Prompt** section. Review that
section before sharing: the prompt may expose project instructions, skill
guidance, paths, or other local context. Offline
`tau export` of an indexed session or arbitrary JSONL file omits this section
because session JSONL does not persist the prompt.

[译文]
HTML 导出是自包含的,包含两个标签页:**Transcript** 按存储顺序保留会话树与各条目,而 **Cache** 汇总活动分支的模型请求,包括用于生成压缩摘要与分支摘要的请求、提示词缓存、输出与推理 token、按 API 费率估算的费用、工具调用与压缩。摘要生成请求在请求表中单独标注,而不会混入助手轮次。缓存图表是交互式的 —— 悬停可查看确切数值,选择图例项可隐藏某个系列 —— 并且可以下载为白底静态 PNG 图片。导出会跟随 Tau 的主题:浅色模式下为 tau-light,深色模式下为 tau-dark,切换主题时图表会实时重新着色。当 `/export` 从活动会话生成 HTML 时,它还会在一个单独的、默认折叠的 **System Prompt** 区块中包含当前的系统提示词。分享之前请先检查该区块:提示词可能暴露项目指令、技能指引、路径或其他本地上下文。对已索引会话或任意 JSONL 文件执行的离线 `tau export` 会省略该区块,因为会话 JSONL 并不持久化提示词。

[原文]
The system prompt is display-only export metadata, not a transcript entry.
Direct JSONL exports and JSONL downloaded from the HTML remain entry-only and do
not contain it.

[译文]
系统提示词是仅供显示的导出元数据,而不是一条会话记录条目。直接进行的 JSONL 导出,以及从 HTML 中下载的 JSONL,都只包含条目,不含它。

[原文]
New compaction entries store a `first_kept_entry_id` boundary: replay inserts the
summary, then keeps that active-path entry and everything after it. This is a fixed-size,
Pi-compatible replacement for older Tau files' `replaces_entry_ids` arrays. Older arrays
remain readable and take precedence during replay, so exporting or resuming a legacy
session does not change its message history. HTML entry details show the first-kept
boundary for modern compactions and identify unavailable legacy boundaries.

[译文]
新的压缩条目会存储一个 `first_kept_entry_id` 边界:重放时先插入摘要,然后保留该活动路径上的条目及其之后的一切。这是一个固定大小、与 Pi 兼容的替代方案,取代了旧版 Tau 文件中的 `replaces_entry_ids` 数组。旧数组仍然可读,并在重放时优先,因此导出或恢复一个 legacy 会话不会改变它的消息历史。HTML 的条目详情会显示现代压缩的 first-kept 边界,并标出不可用的 legacy 边界。

[原文]
Every transcript entry is a compact accordion row
(icon, title, one-line preview, timestamp) that expands to reveal the full
content; thinking blocks, tool-call arguments, and tool-result details are
nested accordions. The export header includes controls to:

[译文]
每一条会话记录条目都是一个紧凑的手风琴行(图标、标题、单行预览、时间戳),展开后显示完整内容;思考块、工具调用参数与工具结果详情则是嵌套的手风琴。导出页的头部包含以下控件:

[原文]
- show or hide tool calls and tool results in both the transcript and session
  tree—the chip filters show how many entries of each kind the session contains
- expand or collapse every accordion in the transcript with one button
- hide session events—such as session info, model and thinking changes,
  compactions, labels, and custom entries—to focus on user and assistant messages
- download the session as a JSONL file—the complete entry data is embedded in
  the page, so the download works offline and includes every entry (including
  historical `leaf` records from older Tau versions)

[译文]
- 在会话记录与会话树中同时显示或隐藏工具调用与工具结果 —— 小标签过滤器会显示该会话包含各类条目多少条
- 用一个按钮展开或折叠会话记录中的所有手风琴
- 隐藏会话事件 —— 例如会话信息、模型与 thinking 变更、压缩、标签与自定义条目 —— 以聚焦用户与助手消息
- 把会话下载为 JSONL 文件 —— 完整的条目数据内嵌在页面中,因此下载可离线进行,并包含每一条条目(包括旧版 Tau 留下的历史 `leaf` 记录)

[原文]
Tool rows are titled `Tool: <name>` (for example, `Tool: read`), and the
session tree labels tool entries with just the tool name for readability.
Resolved bookmark labels also appear as `[label]` prefixes on their target tree
nodes; label change entries remain available in the entry stream for auditing.

[译文]
工具行的标题是 `Tool: <name>`(例如 `Tool: read`),而会话树为了让内容更易读,只用具名标注工具条目。已解析的书签标签也会作为 `[label]` 前缀出现在其目标树节点上;标签变更条目仍保留在条目流中,以供审计。

[原文]
Extension-injected model context is stored as a first-class `custom_message`
entry. Its `custom_type` identifies the extension, while `content`, `details`,
and `display` preserve its payload and presentation choice. `display: false`
keeps the content in model context but hides it from the TUI and the visible
HTML transcript; the complete entry remains in JSONL exports. Older Tau files
that stored these as a generic `message` with `role: "custom"`, or as a Tau-v1
user message with `custom_type`, are normalized when loaded and replay the same
context.

[译文]
扩展注入的模型上下文会存储为一等的 `custom_message` 条目。它的 `custom_type` 标识该扩展,而 `content`、`details` 与 `display` 保留其载荷与呈现方式的选择。`display: false` 让内容保留在模型上下文中,但在 TUI 与可见的 HTML 会话记录中隐藏它;完整条目仍留在 JSONL 导出中。较旧的 Tau 文件若把这些存成带 `role: "custom"` 的通用 `message`,或存成带 `custom_type` 的 Tau-v1 用户消息,加载时会被规范化,并重放出相同的上下文。

[原文]
Tau's persisted entry wrappers use snake_case names such as `parent_id` and
`custom_type`. The Pi-compatible RPC inspection API projects those fields as
`parentId` and `customType`; see the [RPC reference]({{< relref "../reference/rpc.md" >}}).

[译文]
Tau 持久化的条目包装使用 snake_case 名称,例如 `parent_id` 与 `custom_type`。与 Pi 兼容的 RPC 检查 API 会把这两个字段投影为 `parentId` 与 `customType`;见 [RPC 参考]({{< relref "../reference/rpc.md" >}})。

## 会话存放在哪里(Where sessions live)

```text
~/.tau/sessions/<cleaned-path>-<short-hash>/
```

[原文]
For example, `/Users/you/repos/tau` becomes something like
`repos-tau-a1b2c3`. The original JSONL is append-only. New Tau versions do not
write separate `leaf` pointer records; the last non-`leaf` entry in file order
is the active tip. Older files containing `leaf` records remain readable, but
those records do not override file-order tip selection. Compaction and
branching change the *active* view, never the recorded history. A label change
is stored as `{"type":"label","target_id":"<entry-id>","label":"checkpoint"}`;
`null` or an empty label clears the target's bookmark. Pre-bookmark Tau files
whose label entries lack `target_id` load deterministically as a bookmark on the
earliest branchable entry.

[译文]
例如 `/Users/you/repos/tau` 会变成类似 `repos-tau-a1b2c3` 的名字。原始 JSONL 是只追加的。新版 Tau 不再写入单独的 `leaf` 指针记录;文件顺序中最后一条非 `leaf` 条目就是活动末端。包含 `leaf` 记录的旧文件仍然可读,但这些记录不会覆盖「按文件顺序选末端」的规则。压缩与分支改变的是*活动*视图,而绝不改变已记录的历史。标签变更存储为 `{"type":"label","target_id":"<entry-id>","label":"checkpoint"}`;`null` 或空标签会清除目标的收藏标记。书签功能出现之前的 Tau 文件,其标签条目缺少 `target_id`,加载时会确定性地作为最早可分支条目上的一个书签。

[原文]
New compaction and branch-summary entries include optional `usage`, `provider`,
`model`, and `response_provider` fields for the model call that generated the
summary. `response_provider` identifies the resolved backend when a routing
service reports one. The `usage` field uses the same shape as assistant messages (`input`, `output`,
`cacheRead`, `cacheWrite`, optional `cacheWrite1H` and `reasoning`, `totalTokens`,
and `cost`). If more than one completion contributes to a summary, Tau stores
the field-wise total. Older entries and heuristic branch-summary fallbacks omit
`usage`; they continue to load normally and do not add a zero-cost request to
usage analytics.

[译文]
新的压缩条目与分支摘要条目包含可选的 `usage`、`provider`、`model` 与 `response_provider` 字段,用于描述生成该摘要的那次模型调用。当路由服务上报时,`response_provider` 标识已解析的后端。`usage` 字段与助手消息使用相同的形态(`input`、`output`、`cacheRead`、`cacheWrite`,可选的 `cacheWrite1H` 与 `reasoning`、`totalTokens` 以及 `cost`)。如果有多于一次补全对某份摘要有贡献,Tau 会存储逐字段的合计值。较旧的条目与启发式分支摘要回退会省略 `usage`;它们仍能正常加载,也不会给用量统计增加一次零费用请求。

[原文]
See
[Configuration]({{< relref "../reference/configuration.md#sessions" >}}) for the exact layout.

[译文]
确切的目录布局见[配置]({{< relref "../reference/configuration.md#sessions" >}})。
