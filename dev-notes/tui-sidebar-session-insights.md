---
title: "TUI sidebar session insights / TUI 侧边栏的会话洞察"
---

## 变更内容(What changed)

[原文]
Tau's interactive TUI now uses the sidebar as the detailed session summary and
removes Textual's top header and shortcut footer. The terminal tab title still
follows the generated or user-assigned session name, so removing the chrome
recovers two rows without losing session identity or keyboard functionality.

[译文]
Tau 的交互式 TUI 现在把侧边栏用作详细的会话摘要,并移除了 Textual 的顶部页头与快捷键页脚。终端标签页标题仍跟随自动生成或用户指定的会话名,因此移除这些外壳回收了两行空间,同时没有丢失会话身份或键盘功能。

[原文]
The sidebar now shows:

[译文]
侧边栏现在显示:

[原文]
- the session name
- user turns and assistant tool calls on the active branch
- cumulative provider-reported input and output tokens
- latest-request and cumulative-session prompt-cache hit rates
- estimated cost when complete pricing is available
- automatic-compaction status and threshold
- context files, tools, skills, prompt templates, and loaded extensions

[译文]
- 会话名
- 活动分支上的用户轮次与 assistant 工具调用
- 累计的 provider 上报输入与输出 token
- 最近一次请求与累计会话的提示词缓存命中率
- 当完整定价可用时的估算成本
- 自动压缩状态与阈值
- 上下文文件、工具、技能、提示词模板与已加载扩展

[原文]
Provider, model, thinking level, and duplicate resource counts were removed from
the sidebar because the compact line below the prompt already presents the active
model state.

[译文]
Provider、模型、thinking 等级与重复资源计数已从侧边栏移除,因为提示输入下方的紧凑状态行已经展示了活动模型状态。

## 显示取舍(Display choices)

[原文]
Tools, prompts, and extensions are short names, so they render as wrapping
comma-separated lists. Skills and context files remain bullets so each loaded
instruction source has a clear row. Paths inside the working directory are
project-relative; paths outside it are absolute so user-level instructions are
unambiguous.

[译文]
工具、提示词与扩展都是短名称,因此渲染为可折行的逗号分隔列表。技能与上下文文件仍保留项目符号,让每个已加载指令来源都有清晰的一行。工作目录内的路径使用项目相对路径;目录之外的路径使用绝对路径,使用户级指令没有歧义。

[原文]
Spaced dividers separate each section. Section headings use the bright prompt
text color while values use the quieter metadata gray. The sidebar is wider and
borderless, uses a comfortable left content inset and the same theme variable as
the prompt field for its background, and hides on shorter terminals rather than
clipping the expanded content. The
versioned `τ = 2π` brand is a separate bottom-aligned widget, so it stays at the
lower edge regardless of content height.

[译文]
各区块之间用带间距的分隔线隔开。区块标题使用明亮的提示词文本色,而值使用更安静的中性灰。侧边栏更宽、无边框,使用舒适的左侧内容内缩,并与提示输入字段共用同一个主题变量作为背景;在较矮的终端上它会隐藏,而不是裁切已展开的内容。带版本号的 `τ = 2π` 品牌标识是独立的底部对齐组件,因此无论内容多高,它都保持在下边缘。

## 活动与用量语义(Activity and usage semantics)

[原文]
Statistics come from original message entries on the active root-to-leaf branch,
not only from the compacted model context. Consequently, compaction does not erase
activity or billed usage. A turn is a user or extension-authored custom message.
A tool call is each tool-call block requested by an assistant message.

[译文]
统计数据来自活动「根到叶」分支上的原始消息条目,而不仅仅是压缩后的模型上下文。因此,压缩不会抹去活动记录或计费用量。一个轮次是一条用户消息或扩展编写的自定义消息。一次工具调用是 assistant 消息请求的每个工具调用块。

[原文]
Input totals include fresh input, cache reads, and cache writes. The cache line
shows the latest assistant request separately from the cumulative active-branch
rate; after tool use, latest refers to the most recent model continuation.
Output totals use the provider's reported output count. Cost is calculated per
assistant response from that response's provider/model metadata, including tiered rates and separate
input, output, cache-read, and cache-write prices. If any billed response lacks
pricing, Tau displays `$N/A` rather than showing a misleading partial estimate.

[译文]
输入总量包含全新输入、缓存读取与缓存写入。缓存行会分别展示最近一次 assistant 请求与活动分支的累计命中率;在工具使用之后,「最近一次」指的是最新的模型续跑。输出总量使用 provider 上报的输出计数。成本按每条 assistant 响应、基于该响应的 provider/模型元数据计算,包括分层费率以及彼此分离的输入、输出、缓存读取与缓存写入价格。如果任何计费响应缺少定价,Tau 会显示 `$N/A`,而不是给出一个误导性的部分估算。

## 架构(Architecture)

[原文]
Lifetime aggregation lives in `tau_coding.session_stats`; it consumes durable
session entries and remains independent of Textual. `CodingSession` supplies the
active branch and resolves configured pricing. The TUI widget only formats the
result. This preserves Tau's boundary between session behavior and frontend
rendering.

[译文]
生命周期聚合位于 `tau_coding.session_stats`;它消费持久化会话条目,并保持独立于 Textual。`CodingSession` 提供活动分支并解析已配置的定价。TUI 组件只负责格式化结果。这保持了 Tau 在会话行为与前端渲染之间的边界。

## 验证(Verification)

[原文]
Run:

[译文]
运行:

```bash
uv run pytest
uv run ruff check .
uv run ruff format --check .
uv run mypy
```

[原文]
For manual verification, open a named TUI session in a wide terminal, run several
prompts that call tools, and confirm that activity, usage, and cost update. Run
`/compact` and verify that lifetime totals remain unchanged while the current
context indicator shrinks. Resize the terminal until the sidebar disappears and
confirm there is no top header or shortcut footer and the terminal tab retains
the session name. In a tall window, confirm the versioned Tau mark stays at the
bottom of the wider sidebar. The session name uses bold accent styling without a
redundant `session` section heading, so it stands apart from other values.

[译文]
手动验证:在宽终端中打开一个已命名的 TUI 会话,运行若干会调用工具的提示,确认活动、用量与成本都在更新。运行 `/compact`,验证生命周期总量保持不变,而当前上下文指示器变小。调整终端尺寸直到侧边栏消失,确认没有顶部页头与快捷键页脚,且终端标签页仍保留会话名。在较高的窗口中,确认带版本号的 Tau 标识仍位于更宽侧边栏的底部。会话名使用加粗的强调样式,且没有多余的 `session` 区块标题,因此与其他值区分开来。

[原文]
The compact status block below the prompt places `provider:model (thinking)` on
its first line and context consumption as only `used/limit` on its second. It
styles the parent portion of the working-directory path and Git branch as metadata
while keeping the directory basename prominent.
The prompt editor keeps only its left border; focus, shell-mode, and activity
colors update that edge without surrounding the input on all four sides. Vertical
padding replaces the removed top and bottom border space, preserving the original
block height and full background area. User transcript blocks share that prompt
background in every built-in theme, matching both the composer and sidebar. A
small vertical inset gives each submitted message a block silhouette instead of
making only its text line appear highlighted. Markdown blocks disable the default
resting underline and apply underline as a link-hover style; clickable spans remain
bounded to their exact link text so the decoration cannot run across the row.

[译文]
提示输入下方的紧凑状态块把 `provider:model (thinking)` 放在第一行,把上下文消耗仅以 `used/limit` 放在第二行。它把工作目录路径的父级部分与 Git 分支样式化为元数据,同时让目录的基本名保持醒目。
提示编辑器的边框只保留左侧;焦点、shell 模式与活动状态的颜色只更新这条边,而不会在四周围住输入区域。垂直内边距替代了被移除的上下边框空间,保留原有的块高度与完整背景区域。用户会话记录块在所有内置主题中都共享该提示输入背景,与输入框和侧边栏一致。一个小的垂直内缩让每条已提交消息呈现块状轮廓,而不是只有其文本行显得高亮。Markdown 块禁用了默认的静止下划线,并把下划线作为链接悬停样式应用;可点击的 span 仍限定在其确切的链接文本范围内,因此装饰不会横贯整行。

[原文]
Theme selection colors now have one source of truth: autocomplete derives its
selected-row foreground and background from the same `highlight_text` and
`highlight_background` values used by picker `ListView`s such as `/resume`. The
dark theme promotes its existing aqua highlight (`#a7f3f0`) to the global accent,
replacing the previous orange across headings, bullets, prompt activity, and other
accent-driven UI.

[译文]
主题选择颜色现在只有一个事实来源:自动补全的选中行前景色与背景色,派生自 `/resume` 等选择器 `ListView` 所使用的同一组 `highlight_text` 与 `highlight_background` 值。深色主题把它既有的 aqua 高亮(`#a7f3f0`)提升为全局强调色,在标题、项目符号、提示输入活动状态以及其他由强调色驱动的 UI 中取代了此前的橙色。
