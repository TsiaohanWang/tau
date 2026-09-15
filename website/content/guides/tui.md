---
title: "The interactive session / 交互式会话"
description: "Get fluent in Tau's terminal UI — prompting, steering, the command palette, tool output, and pickers. / 熟练使用 Tau 的终端 UI —— 提示输入、插话引导、命令面板、工具输出与各类选择器。"
---

[原文]
Running `tau` with no arguments opens the interactive terminal UI (TUI). This is
where most work happens. This guide covers the moving parts; for the exact keys
see [Keyboard shortcuts]({{< relref "../reference/keybindings.md" >}}).

[译文]
不带参数运行 `tau` 会打开交互式终端 UI(TUI)。大部分工作都在这里发生。本指南介绍各个环节;确切的按键见[键盘快捷键]({{< relref "../reference/keybindings.md" >}})。

## 发送提示词(Sending a prompt)

[原文]
Type into the prompt box at the bottom and press **Enter** to submit. The editor
keeps its padded block size and background, while a single left border changes
color to reflect focus, shell mode, and active runs without boxing it in.
**Shift+Enter** inserts a newline for multi-line prompts. If your terminal cannot
distinguish it from Enter, remap `insert_newline` in `~/.tau/tui.json`; see
[Keyboard shortcuts]({{< relref "../reference/keybindings.md#prompting" >}}). Tau streams the
assistant's reply above the prompt, showing tool calls as they run. When OpenAI
returns several reasoning-summary parts, Tau keeps them as separate Markdown
paragraphs rather than joining their headings together. In supported terminal
emulators, Tau also updates the tab title: named sessions show as
`τ | <name>`, and active runs add an animated running indicator so you can see
work continuing from another tab. When a run fully settles while Tau's terminal
surface is unfocused, Tau emits a desktop notification by default on supported
terminals: OSC 9 for Ghostty, iTerm2, and MinTTY, and OSC 99 for Kitty. Unknown
terminals are left untouched. Set `turn_notification` to `"bell"` to let the
terminal mark the tab or apply its configured bell behavior instead, or `"off"`
to disable notifications. BEL and operating-system desktop notifications may
produce sounds according to the user's terminal and system settings; see
[Configuration]({{< relref "../reference/configuration.md#tui-settings" >}}).

[译文]
在底部的提示框中输入,按 **Enter** 提交。编辑器保持其带内边距的块状尺寸与背景,只由一条左边框变色来反映焦点、shell 模式与正在进行的运行,而不把它框住。**Shift+Enter** 插入换行,用于多行提示词。如果你的终端无法把它与 Enter 区分开,请在 `~/.tau/tui.json` 中重新映射 `insert_newline`;见[键盘快捷键]({{< relref "../reference/keybindings.md#prompting" >}})。Tau 会在提示框上方流式显示助手回复,并在工具运行时展示这些调用。当 OpenAI 返回多个推理摘要片段时,Tau 会把它们保留为彼此独立的 Markdown 段落,而不是把它们的标题拼接在一起。在受支持的终端模拟器中,Tau 还会更新标签页标题:已命名会话显示为 `τ | <name>`,而正在运行的会话会加上一个动态的运行指示,让你能从另一个标签页看到工作仍在继续。当一次运行完全结束、而 Tau 的终端界面并未处于焦点时,Tau 默认会在受支持的终端上发出桌面通知:Ghostty、iTerm2 与 MinTTY 使用 OSC 9,Kitty 使用 OSC 99。未知终端不会被触碰。把 `turn_notification` 设为 `"bell"` 可改为让终端标记标签页或应用其配置好的响铃行为,设为 `"off"` 则禁用通知。BEL 与操作系统桌面通知是否发出声音取决于用户的终端与系统设置;见[配置]({{< relref "../reference/configuration.md#tui-settings" >}})。

[原文]
Chat Completions providers can interleave reasoning and answer fragments (for
example, DeepSeek through Hugging Face). Tau keeps each channel in one continuous
block while streaming and saving the reply, rather than splitting sentences at
channel switches. Previously saved replies retain their original block layout.

[译文]
Chat Completions 类 provider 可能把推理与回答的片段交错返回(例如经 Hugging Face 访问的 DeepSeek)。在流式传输并保存回复时,Tau 会把每个通道保持为一个连续的块,而不是在通道切换处把句子拆开。此前已保存的回复保留它们原有的块布局。

[原文]
Clicking anywhere in the window returns focus to the prompt, so you can scroll
the transcript and keep typing without tabbing back.

[译文]
点击窗口内任意位置都会把焦点交还给提示框,因此你可以一边滚动会话记录一边继续输入,无需再按 Tab 切回来。

[原文]
If a provider request fails after retries, Tau shows the failure as an explicit
error block in the transcript, using the provider's own error message (for
example `server_is_overloaded` details instead of a generic failure). The block
includes a diagnostic log path and a reminder that the run ended. You can submit
another prompt without starting a new session; empty failed provider turns are
retained for diagnostics but are not replayed to the model as invalid
conversation history.

[译文]
如果 provider 请求在重试之后仍然失败,Tau 会在会话记录中把该失败显示为一个显式的错误块,并使用 provider 自己的错误消息(例如给出 `server_is_overloaded` 的细节,而不是泛泛的失败提示)。该块包含诊断日志路径,并提示该次运行已经结束。你可以直接提交新的提示词,无需新建会话;失败的 provider 空轮次会被保留用于诊断,但不会作为无效的对话历史回放给模型。

## 取消与插话引导(Cancelling and steering a run)

[原文]
While the agent is working you don't have to wait:

[译文]
agent 工作时,你不必干等:

[原文]
- **Esc** cancels the active run. Cancellation is treated as an intentional stop,
  not an error.
- **Enter** (while running) queues your text as **steering** — extra guidance
  applied to the current run.
- **Alt+Enter** queues a **follow-up** — a prompt that waits until the current
  run would otherwise finish.
- Press **Up** on an empty prompt while running to pull the most recently queued
  follow-up back into the prompt for editing.

[译文]
- **Esc** 取消当前运行。取消被视为一次有意的停止,而不是错误。
- 运行中按 **Enter** 会把你的文本作为**插话(steering)**排队 —— 即应用于当前运行的额外指引。
- **Alt+Enter** 排队一条**追加消息(follow-up)** —— 它会等到当前运行本来要结束时再执行。
- 运行中在空提示框上按 **Up**,可以把最近排队的那条追加消息取回提示框进行编辑。

## 命令面板与斜杠命令(The command palette and slash commands)

[原文]
In-session commands start with `/`. Open the **command palette** with **Ctrl+K**
to search and run them. Common ones:

[译文]
会话内命令以 `/` 开头。按 **Ctrl+K** 打开**命令面板**即可搜索并运行它们。常用命令:

[原文]
- `/session` — show model, tools, skills, and context usage for the session. Text selected in this modal is copied to the clipboard automatically.
- `/system` — show the active system prompt grouped by source in the transcript without adding it to context or session history
- `/model` — pick the active model
- `/tools` — search active tools by origin and open their full descriptions
- `/compact` — summarize and shrink the context
- `/resume`, `/tree` — open previous sessions or branch from history
- `/prompts` — search prompt templates, insert an invocation, or edit the template file with **Ctrl+E**
- `/hotkeys` — show the keyboard shortcuts
- `/local` — choose and manage a registered local backend
- `/sidebar` — show or hide the sidebar for this session

[译文]
- `/session` —— 显示该会话的模型、工具、技能与上下文用量。在此模态框中选中的文本会自动复制到剪贴板。
- `/system` —— 在会话记录中按来源分组显示当前生效的系统提示词,且不把它加入上下文或会话历史
- `/model` —— 选择当前活动模型
- `/tools` —— 按来源搜索活动工具,并打开它们的完整说明
- `/compact` —— 总结并压缩上下文
- `/resume`、`/tree` —— 打开先前的会话,或从历史中分支
- `/prompts` —— 搜索提示词模板、插入一次调用,或用 **Ctrl+E** 编辑模板文件
- `/hotkeys` —— 显示键盘快捷键
- `/local` —— 选择并管理一个已注册的本地后端
- `/sidebar` —— 显示或隐藏本会话的侧边栏

[原文]
When slash-command autocomplete is open, **Enter** applies the highlighted
suggestion without submitting it; use the arrow keys first to choose a different
suggestion. **Tab** also applies the highlighted suggestion.

[译文]
斜杠命令自动补全打开时,**Enter** 会应用高亮的建议而不会提交它;先按方向键可以改选其他建议。**Tab** 同样会应用高亮的建议。

[原文]
The full list is in the [Slash commands reference]({{< relref "../reference/slash-commands.md" >}}). For local inference, see the [local backends guide]({{< relref "./local-inference.md" >}}).

[译文]
完整列表见[斜杠命令参考]({{< relref "../reference/slash-commands.md" >}})。本地推理见[本地后端指南]({{< relref "./local-inference.md" >}})。

### 本地后端(Local backends)

[原文]
`/local` first opens an explicit backend chooser. One backend is preselected but
still requires confirmation; a recommended backend is only a marker. Tau's
built-in `llama.cpp` backend automatically probes its one effective
saved/environment/default endpoint; **Configure** accepts another URL and an
optional secret key. It renders models and backend actions as separate
arrow-key navigable sections. Only the focused section shows a `focused` marker,
accent border, and highlighted row; Tab switches sections directly. Enter
selects from the focused section and Escape closes. Expensive
load/download operations require a separate confirmation with model details,
and active downloads show a full-width block bar with router-reported byte
progress, including after reopening `/local`. The actions section exposes
Hugging Face search/download, explicit active-download
cancellation, status, refresh, Doctor, and reset; the model section owns load,
use, and unload.

[译文]
`/local` 会先打开一个显式的后端选择器。其中一个后端会被预选,但仍需确认;被标记为推荐的后端只是一个标记。Tau 内置的 `llama.cpp` 后端会自动探测它唯一生效的「已保存/环境/默认」端点;**Configure** 接受另一个 URL 以及可选的密钥。它把模型与后端操作渲染为两个彼此独立、可用方向键导航的区块。只有获得焦点的区块会显示 `focused` 标记、强调边框与高亮行;Tab 直接切换区块。Enter 从获得焦点的区块中选择,Escape 关闭。开销较大的加载/下载操作需要一次单独的确认,其中包含模型详情;进行中的下载会显示一条全宽的块状进度条,展示 router 上报的字节进度,重新打开 `/local` 之后也是如此。操作区块提供 Hugging Face 搜索/下载、显式取消进行中的下载、状态、刷新、Doctor 与 reset;模型区块负责加载、使用与卸载。

[原文]
Configure, refresh, status, Doctor, and reset work asynchronously, show
structured progress/diagnostics, and are cancelled when the screen closes. A
server-side download instead continues in llama.cpp when `/local` closes.
Cached model snapshots remain visible as stale during server downtime.
State-changing actions require an idle agent. Reset does not stop llama.cpp or
delete model files; credential deletion is separately confirmed. For explicit
startup and troubleshooting, see the [local inference guide]({{< relref
"./local-inference.md" >}}).

[译文]
Configure、refresh、status、Doctor 与 reset 都是异步执行的,会显示结构化的进度/诊断,并在界面关闭时被取消。而服务端下载在 `/local` 关闭后会继续在 llama.cpp 中进行。缓存的模型快照在服务器停机期间会保持可见,但标记为陈旧。改变状态的操作要求 agent 处于空闲。Reset 不会停止 llama.cpp,也不会删除模型文件;删除凭据需要单独确认。显式启动与排障见[本地推理指南]({{< relref
"./local-inference.md" >}})。

## 直接运行 shell 命令(Running shell commands directly)

[原文]
You can run a shell command yourself without asking the model:

[译文]
你可以自己运行 shell 命令,无需请求模型:

[原文]
- `!<command>` runs it in the session's working directory **and** records the
  command and output in the conversation context.
- `!!<command>` runs it and shows the output **without** adding it to context.

[译文]
- `!<command>` 会在会话的工作目录中运行它,**并且**把命令与输出记录进对话上下文。
- `!!<command>` 会运行它并显示输出,**但不**把它加入上下文。

[原文]
Shell commands are non-interactive: their stdin is disconnected from the TUI.
Programs that require an interactive terminal should be run in a separate terminal.

[译文]
Shell 命令是非交互式的:它们的 stdin 与 TUI 断开。需要交互式终端的程序应当在单独的终端中运行。

[原文]
As soon as the input starts with `!`, the whole input and its left border turn
the same amber/orange color as a tool while it is running, and the `τ` prompt
prefix becomes a matching `$`, so you can tell at a glance that submitting will
execute a shell command instead of messaging the model.

[译文]
输入一旦以 `!` 开头,整个输入及其左边框就会变成与运行中工具相同的琥珀/橙色,`τ` 提示前缀也会变成与之匹配的 `$`,因此你一眼就能看出:提交将执行一条 shell 命令,而不是给模型发消息。

[原文]
While typing a path after `!`/`!!`, press **Tab** to complete filenames from the
working directory. Dot-prefixed paths such as `.env` and `.agents/` are included.

[译文]
在 `!`/`!!` 之后输入路径时,按 **Tab** 可以从工作目录补全文件名。诸如 `.env` 与 `.agents/` 这类以点开头的路径也会包含在内。

[原文]
{{% note title="Aliases" %}}
These commands (and the agent's `bash` tool) run in a non-interactive shell, so
your `~/.zshrc`/`~/.bashrc` aliases aren't loaded automatically. To use your own
aliases, set a `shellCommandPrefix` — see
[Shell settings]({{< relref "../reference/configuration.md#shell-settings" >}}).
{{% /note %}}

[译文]
{{% note title="别名" %}}
这些命令(以及 agent 的 `bash` 工具)在非交互式 shell 中运行,因此你的 `~/.zshrc`/`~/.bashrc` 别名不会被自动加载。若要使用你自己的别名,请设置 `shellCommandPrefix` —— 见 [Shell 设置]({{< relref "../reference/configuration.md#shell-settings" >}})。
{{% /note %}}

## 用 `@` 引用文件(Referencing files with `@`)

[原文]
Type `@` in the prompt to open file suggestions from the project tree, and insert
a path like `@src/app.py`. Use an explicit parent-relative path such as `@../` to
complete files and directories outside the project root. External completion
follows only the path you type instead of scanning the surrounding filesystem.
Dot-prefixed content such as `.env` and `.agents/` is included. Tau still skips
known metadata and generated directories such as `.git`, `.venv`, `node_modules`,
`__pycache__`, `build`, and `dist`. Press **Tab** to insert the highlighted file;
press **Enter** to submit exactly what you typed without inserting it. The same
rule applies to `@` suggestions in skill and custom-prompt argument text.

[译文]
在提示框中输入 `@` 会打开来自项目树的文件建议,并插入形如 `@src/app.py` 的路径。使用显式的父级相对路径(例如 `@../`)可以补全项目根目录之外的文件与目录。外部补全只沿着你输入的路径前进,而不会扫描周边的文件系统。`.env` 与 `.agents/` 这类以点开头的内容也会包含在内。Tau 仍会跳过已知的元数据与生成目录,例如 `.git`、`.venv`、`node_modules`、`__pycache__`、`build` 与 `dist`。按 **Tab** 插入高亮的文件;按 **Enter** 则按你输入的原文提交,而不插入它。技能与自定义提示词参数文本中的 `@` 建议遵循同样的规则。

## 把文件拖入提示框(Dropping files into the prompt)

[原文]
Drag one or more files from your file manager onto the terminal window and Tau
inserts their filesystem paths into the prompt at the cursor, separated by
spaces. Paths that contain spaces are quoted automatically, and any text you
already typed is preserved. This works anywhere over the TUI, not just above
the input box, because the terminal delivers the drop as text input.

[译文]
从文件管理器把一个或多个文件拖到终端窗口上,Tau 就会把它们在文件系统中的路径插入提示框的光标处,以空格分隔。包含空格的路径会自动加引号,你已经输入的任何文本都会保留。这一操作在 TUI 的任意位置都有效,而不只是在输入框上方,因为终端把拖放当作文本输入投递。

[原文]
Drops are also accepted from sources that do not give the terminal keyboard focus
first, such as the macOS Dock's Downloads stack.

[译文]
来自那些不会先给终端键盘焦点的来源(例如 macOS Dock 的「下载」堆栈)的拖放同样会被接受。

## 工具输出(Tool output)

[原文]
Tool calls keep a static marker in the transcript while they run: orange means
in progress, green means success, and red means failure. That status color applies
to the semantic description, such as `Running tests` or `Read 5 files`; command
snippets, arguments, and file lists stay neutral gray. The prompt-area activity
indicator provides the run-wide animation without adding a second spinner to each
tool row.

[译文]
工具调用在运行期间会在会话记录中保留一个静态标记:橙色表示进行中,绿色表示成功,红色表示失败。该状态色作用于语义描述,例如 `Running tests` 或 `Read 5 files`;命令片段、参数与文件列表保持中性的灰色。提示框区域的活动指示器提供贯穿整次运行的动画,而不会给每个工具行再加一个 spinner。

[原文]
Adjacent built-in tool calls from one model response share one transcript block,
with one compact line per logical action. Each line retains its own status color,
and adjacent reads, edits, or writes remain clustered under one headline with
every file path listed beneath it. Expanded edit and write groups retain each
invocation and result; expanded read groups omit repeated file contents. The
complete block remains one selectable text surface,
including across line boundaries.
Batches never cross assistant text, thinking, or unrelated responses. Consecutive
same-tool edit or write continuations are grouped so providers that serialize
file mutations one at a time still produce one file list. Extension tools, custom
rendered call cards, and skill loads remain separate.

[译文]
来自同一次模型响应的相邻内置工具调用会共用一个会话记录块,每个逻辑动作一行紧凑的条目。每一行保留自己的状态色,相邻的读取、编辑或写入会聚拢在同一个标题之下,所有文件路径列在它下方。展开后的编辑与写入分组保留每一次调用及其结果;展开后的读取分组会省略重复的文件内容。整个块仍然是一个可整体选中的文本区域,包括跨行的范围。批次绝不会跨越助手文本、思考内容或无关响应。连续的同种工具编辑或写入续接会被归为一组,因此那些一次只序列化一个文件变更的 provider 也能产出一份文件列表。扩展工具、自定义渲染的调用卡片与技能加载保持独立。

[原文]
Tool results (like long `read` or `bash` output) render as compact previews so
the transcript stays readable. Tau requires the model to give each `bash` call a
brief description such as `Running tests`. Tau shows that description in full;
collapsed rows never show command text. Press **Ctrl+O** to keep the description
visible and reveal the exact command
and result beneath it. Malformed provider output,
custom integrations, and older sessions can still lack a description; those calls
show the generic `Running shell command` label until expanded.

[译文]
工具结果(例如很长的 `read` 或 `bash` 输出)会渲染为紧凑的预览,让会话记录保持可读。Tau 要求模型为每次 `bash` 调用给出一句简短描述,例如 `Running tests`。Tau 会完整显示该描述;折叠的行绝不显示命令文本。按 **Ctrl+O** 可以保持描述可见,并在其下方展示确切的命令与结果。畸形的 provider 输出、自定义集成与较旧的会话仍可能缺少描述;这些调用在展开之前会显示通用的 `Running shell command` 标签。

[原文]
When one model response reads or edits several files, adjacent calls of the same
type share one group. The group lists every path, reports progress as results
arrive, and shows an aggregate failure count when needed. Calls from different
model responses are never combined; shell calls and extension tools remain
separate.

[译文]
当一次模型响应读取或编辑多个文件时,同类型的相邻调用共用一个分组。该分组列出每一条路径,在结果到达时报告进度,并在需要时显示聚合的失败计数。来自不同模型响应的调用绝不合并;shell 调用与扩展工具保持独立。

[原文]
Toggle grouped reads into their individual call list with **Ctrl+O**. Grouped read
rows omit file-content previews even when expanded, keeping the transcript focused
on which files were read. The same toggle reveals exact shell commands and full
output for other tools. Compaction and grouping affect only the TUI display;
execution, session history, and print-mode transcripts retain every complete call
and result.

[译文]
用 **Ctrl+O** 可以在分组读取与逐条调用列表之间切换。分组读取行即使在展开时也省略文件内容预览,使会话记录聚焦于「读了哪些文件」。同一个切换键对其他工具会展示确切的 shell 命令与完整输出。压缩与分组只影响 TUI 显示;执行过程、会话历史与 print 模式会话记录都保留每一次完整调用及其结果。

[原文]
Markdown link hover styling underlines only the linked text, never the rest of its
row. User message blocks use the same theme background as the prompt field and sidebar,
with light vertical padding so they read as blocks rather than highlighted lines.
This visually ties submitted prompts to the composer.

[译文]
Markdown 链接的悬停样式只给链接文本加下划线,绝不会给同一行的其他内容加。用户消息块使用与提示输入区和侧边栏相同的主题背景,并带有轻微的纵向内边距,使它们读起来像一个个块,而不是高亮行。这在视觉上把已提交的提示词与输入框联系起来。

## 长会话(Long sessions)

[原文]
Tau keeps long transcripts responsive by mounting only a window of messages in
the terminal at once. Your complete session remains in display state and durable
history. When older or newer messages are outside the current window, a small
boundary row appears; keep scrolling toward it to page through the rest of the
conversation.

[译文]
Tau 通过在终端中一次只挂载一个消息窗口,让很长的会话记录保持流畅。你的完整会话仍保留在显示状态与持久历史中。当更旧或更新的消息落在当前窗口之外时,会出现一条小小的边界行;继续朝它滚动,就能翻过对话的其余部分。

[原文]
Paging does not summarize, delete, or compact context. Use `/compact` separately
when you want to reduce what is sent to the model.

[译文]
翻页不会总结、删除或压缩上下文。若想减少发送给模型的内容,请另行使用 `/compact`。

## 选择模型与主题(Picking models and themes)

[原文]
- **`/model`** opens the model picker. It shows cached/bundled models immediately,
  refreshes catalogs in the background, and updates the open list. The
  account-scoped Codex snapshot is also reused across sessions, and `/model`
  refreshes it.
- **`/scoped-models`** opens the favorite-model picker and refreshes provider
  catalogs in the background too, so newly discovered Codex models can be
  scoped without opening `/model` first. Use `tau update --models` to force
  public-catalog refresh or `TAU_OFFLINE=1` to disable catalog network access.
- **Ctrl+P** quickly cycles forward through your *scoped* (favorite) models;
  **Shift+Ctrl+P** cycles backward. Neither opens the picker. Manage that list
  with `/scoped-models` or by pressing `Space` on a model in the `/model` picker.
- **`/theme`** switches between `tau-dark`, `tau-light`, `high-contrast`, and
  any custom themes you have installed. Each theme uses one shared selection
  palette for prompt autocomplete and modal lists such as `/resume`. In
  `tau-dark`, the aqua selection color is also the global accent used for
  headings, prompt activity, and other emphasized UI. `tau-light` uses a deep
  teal accent for headings and list markers against its white background. See
  [Themes]({{< relref "./themes.md" >}}).

[译文]
- **`/model`** 打开模型选择器。它会立即显示缓存/随包的模型,在后台刷新目录,并更新已打开的列表。与账户绑定的 Codex 快照也会跨会话复用,`/model` 会刷新它。
- **`/scoped-models`** 打开收藏模型选择器,同样会在后台刷新 provider 目录,因此新发现到的 Codex 模型无需先打开 `/model` 就能被纳入 scoped 列表。用 `tau update --models` 强制刷新公开目录,或用 `TAU_OFFLINE=1` 禁用目录网络访问。
- **Ctrl+P** 快速向后轮换你的 *scoped*(收藏)模型;**Shift+Ctrl+P** 向前轮换。两者都不会打开选择器。用 `/scoped-models` 管理该列表,或在 `/model` 选择器中对某个模型按 `Space`。
- **`/theme`** 在 `tau-dark`、`tau-light`、`high-contrast` 以及你安装的任何自定义主题之间切换。每个主题对提示词自动补全与 `/resume` 之类的模态列表使用同一套选中配色。在 `tau-dark` 中,水色的选中颜色同时也是用于标题、提示框活动与其他强调 UI 的全局强调色。`tau-light` 在其白色背景上用深青色作为标题与列表标记的强调色。见[主题]({{< relref "./themes.md" >}})。

## 侧边栏(The sidebar)

[原文]
On wide-enough terminals Tau shows the session name prominently without a
redundant section label, followed by active-branch
turn and tool-call totals, provider-reported token usage, average effective
output speed and TTFT, latest-request and session prompt-cache hit rates, estimated cost,
automatic-compaction threshold,
and loaded tools, skills, prompt templates, extensions, and context files such as
`AGENTS.md`. Tool and extension names use compact comma-separated lists limited
to three rendered lines. Skills and prompt templates are grouped under their
resource origins (for example, `./.tau/skills`, `~/.agents/skills`, or
`./.tau/prompts`). These two sections start collapsed and show their loaded-item
counts in the headings. The skills heading also shows the estimated token cost of
the loaded skill index in the system prompt; full skill instructions enter context
only when that skill is invoked. Click either heading (or focus it and press
**Enter**) to expand or collapse that section independently, so both lists can
remain open when needed. Every loaded skill or prompt is shown while its section
is expanded. Click a skill, prompt template, or context-file row to replace the
transcript with a main-area editor. Use the **arrow keys** to move the editing
cursor. **Ctrl+S** writes the edited contents to disk and reports success or
failure without closing the editor. Tau refuses to overwrite a file changed on
disk after it was opened, and blocks switching to another sidebar file while
the current editor has unsaved changes. Save or close that file first.
**Escape** closes the editor and restores the transcript. Run **`/reload`**
after saving when you want the active session to use the changed resource.
Skill rows open only that skill's
main `SKILL.md`; supporting files in the skill directory are not exposed in the
sidebar yet. Editable rows highlight and underline on hover. Model-visible skills
use a solid bullet (`•`), while user-only skills with
`disable-model-invocation: true` use a hollow bullet (`◦`). If
the sidebar content is
taller than the available space, scroll it to see the remaining resource groups;
the Tau version mark stays pinned at the bottom. Context files
use a bullet list with one path per line, limited to five entries. When Tau loads a
`SYSTEM.md` replacement or `APPEND_SYSTEM.md` addition from a user or project
`.tau` directory, a separate **system prompt** section lists each active file.
Tau omits that section when no system-prompt files are active. Truncated sections
end with `...(X more)` showing how many entries are hidden. Project resource paths
are relative to the working directory; resources loaded from the home directory
start with `~/`, while other resources loaded from outside the project use their
full path.

[译文]
在足够宽的终端上,Tau 会醒目地显示会话名而不带多余的区块标签,其后依次是活动分支的轮次与工具调用总数、provider 上报的 token 用量、平均有效输出速度与 TTFT、最近一次请求与会话整体的提示词缓存命中率、预估费用、自动压缩阈值,以及已加载的工具、技能、提示词模板、扩展与 `AGENTS.md` 之类的上下文文件。工具与扩展名使用紧凑的逗号分隔列表,最多渲染三行。技能与提示词模板按其资源来源分组(例如 `./.tau/skills`、`~/.agents/skills` 或 `./.tau/prompts`)。这两个区块初始为折叠状态,并在标题中显示各自已加载的条目数。技能标题还会显示系统提示词中已加载技能索引的预估 token 开销;完整的技能说明只在该技能被调用时才进入上下文。点击任一标题(或聚焦它并按 **Enter**)即可独立展开或折叠该区块,因此需要时两个列表可以同时保持展开。区块展开时,每个已加载的技能或提示词都会显示出来。点击某个技能、提示词模板或上下文文件行,会用主区域编辑器取代会话记录。用**方向键**移动编辑光标。**Ctrl+S** 把编辑后的内容写入磁盘并报告成功或失败,但不关闭编辑器。如果文件在打开之后于磁盘上发生了变化,Tau 会拒绝覆盖它;当前编辑器有未保存改动时,Tau 也会阻止切换到侧边栏中的另一个文件。请先保存或关闭该文件。**Escape** 关闭编辑器并恢复会话记录。保存之后,若想让当前会话使用改动后的资源,请运行 **`/reload`**。技能行只打开该技能的主 `SKILL.md`;技能目录中的辅助文件目前尚未在侧边栏中暴露。可编辑的行在悬停时会高亮并加下划线。对模型可见的技能使用实心圆点(`•`),而带有 `disable-model-invocation: true` 的仅用户技能使用空心圆点(`◦`)。如果侧边栏内容高于可用空间,请滚动它以查看其余资源分组;Tau 版本标记始终固定在底部。上下文文件使用圆点列表,每行一个路径,最多五条。当 Tau 从用户或项目的 `.tau` 目录加载 `SYSTEM.md` 替换或 `APPEND_SYSTEM.md` 追加内容时,会有一个单独的 **system prompt** 区块列出每个生效的文件。没有系统提示词文件生效时,Tau 会省略该区块。被截断的区块以 `...(X more)` 结尾,显示隐藏了多少条目。项目资源路径相对于工作目录;从主目录加载的资源以 `~/` 开头,而其他从项目之外加载的资源则使用完整路径。

[原文]
The wider, borderless sidebar uses the prompt field's background color, bright
section headings, quieter gray values, and keeps Tau's versioned `τ = 2π` mark
pinned to its bottom edge. Tau does not render separate
top-header or shortcut-footer rows. Named sessions remain visible in the sidebar
and terminal tab title; `/hotkeys` lists shortcuts when needed. The sidebar hides
automatically when the terminal is small, while the tab title continues to
identify the session.

[译文]
更宽、无边框的侧边栏使用提示输入区的背景色、明亮的区块标题、更安静的灰色数值,并把 Tau 带版本的 `τ = 2π` 标记固定在它的底边。Tau 不再单独渲染顶部标题行或底部快捷键行。已命名会话在侧边栏与终端标签页标题中都保持可见;需要时用 `/hotkeys` 列出快捷键。终端较小时侧边栏会自动隐藏,而标签页标题仍继续标识该会话。

[原文]
`avg TPS` divides provider-reported output tokens by the accumulated time Tau
spends awaiting provider stream events. That includes provider queueing, network
waits, prefill, and time to first output, but excludes Tau's rendering and
persistence work between stream pulls. TPS is token-weighted across timed
responses rather than an average of per-response rates. `avg TTFT` is the
arithmetic mean of provider-wait time through Tau's first text, thinking, or
tool-call output event. Timing is persisted on new assistant messages. Older
history still counts toward cumulative token usage and cost but is omitted from
both performance metrics.

[译文]
`avg TPS` 用 provider 上报的输出 token 数除以 Tau 等待 provider 流式事件所累积的时间。这包含 provider 排队、网络等待、预填充以及到首次输出为止的时间,但不含 Tau 在各次流式拉取之间的渲染与持久化工作。TPS 是对各次计时的响应按 token 加权的结果,而不是各响应速率的平均。`avg TTFT` 是从开始等待 provider 到 Tau 收到首个文本、思考或工具调用输出事件这段时间的算术平均值。计时信息会持久化在新的助手消息上。较旧的历史仍计入累计 token 用量与费用,但不纳入这两项性能指标。

[原文]
Cumulative usage and cost cover the active branch, including history replaced by
compaction and the model requests used to generate compaction or branch summaries.
Heuristic summary fallbacks have no provider usage and add nothing. Input usage
counts tokens processed on every provider request, so it can be much larger than
the context used by the next request. Cost is an estimate based on provider-reported usage and configured
catalog rates; the sidebar shows `$N/A` when Tau lacks complete pricing data.

[译文]
累计用量与费用覆盖活动分支,包括被压缩替换掉的历史,以及用于生成压缩摘要或分支摘要的模型请求。启发式摘要回退不产生 provider 用量,因此不计入任何数值。输入用量统计的是每次 provider 请求所处理的 token,因此它可能远大于下一次请求实际使用的上下文。费用是基于 provider 上报用量与所配置目录费率得出的估算值;当 Tau 缺少完整定价数据时,侧边栏会显示 `$N/A`。

[原文]
The cache line separates the latest model request from the cumulative session.
Both rates are the share of prompt tokens the provider served from its cache
instead of processing again. The latest rate makes a cache miss immediately visible and,
after tool use, describes the most recent model continuation. The session rate
includes every request on the active branch, including the initial cold request.
A low latest rate usually means something early in the request changed, such as
a reloaded tool list or thinking level, or that a pause outlived the provider's
cache.
Tau hides both figures for providers that do not report cache usage.

[译文]
缓存行把最近一次模型请求与会话累计分开显示。两个比率都是 provider 直接从其缓存提供、而非重新处理的提示词 token 占比。最近一次的比率让缓存未命中立即可见,并在工具使用之后描述最近一次模型续接。会话比率包含活动分支上的每一次请求,包括最初那次冷请求。最近一次比率偏低,通常意味着请求前部有东西变了,例如工具列表或 thinking 等级被重新加载,或者停顿时间超过了 provider 的缓存有效期。对于不上报缓存用量的 provider,Tau 会隐藏这两个数字。

[原文]
The compact status block below the prompt puts `provider:model (thinking)` on its
first line and provider-anchored active context as `used/limit` on the second. When
no valid provider usage exists yet, such as immediately after compaction, it shows
`?/limit` until a fresh response reports usage. Unlike cumulative usage, this
active count describes the system prompt, tools,
and active messages Tau expects to send on the next request. It can decrease
after compaction while cumulative usage continues to increase. The
working-directory name and model are emphasized while the parent path, Git
branch, and provider use the quieter metadata color.

[译文]
提示框下方的紧凑状态块第一行是 `provider:model (thinking)`,第二行是以 provider 为锚点的活动上下文,形如 `used/limit`。当尚不存在有效的 provider 用量时(例如刚压缩完),它会显示 `?/limit`,直到一次新的响应上报用量为止。与累计用量不同,这个活动计数描述的是 Tau 预期在下一次请求中发送的系统提示词、工具与活动消息。压缩之后它可能下降,而累计用量继续增长。工作目录名与模型被强调显示,而父级路径、Git 分支与 provider 使用更安静的元数据颜色。

[原文]
The sidebar appears on the **right** by default. It can be moved to the **left**
or turned **off** entirely by setting `sidebar_position` in `~/.tau/tui.json` —
see [Configuration]({{< relref "../reference/configuration.md#tui-settings" >}}).
Use `/sidebar` to toggle visibility during a session. This is temporary: it
preserves a configured left/right position, does not change `tui.json`, and is
forgotten when Tau restarts. A configured `off` sidebar can be shown temporarily
on the default right side.

[译文]
侧边栏默认出现在**右侧**。通过在 `~/.tau/tui.json` 中设置 `sidebar_position`,可以把它移到**左侧**或完全**关闭** —— 见[配置]({{< relref "../reference/configuration.md#tui-settings" >}})。在会话中用 `/sidebar` 切换可见性。这是临时的:它会保留已配置的左右位置,不修改 `tui.json`,并在 Tau 重启后被遗忘。若配置为 `off`,也可以在默认的右侧临时显示侧边栏。

## Herdr 兼容性(Herdr compatibility)

[原文]
When Tau detects that its TUI is running inside Herdr, it defaults Textual to
cell-coordinate mouse input and standard terminal resize signals. This avoids a
Herdr 0.9.0 interoperability bug that can collapse clicks, hover, selection, and
scrolling into the top-left corner of the pane. Other terminals keep Textual's
normal in-band resize and pixel-mouse behavior. An explicitly configured
`TEXTUAL_SMOOTH_SCROLL` environment variable takes precedence over Tau's
compatibility default.

[译文]
当 Tau 检测到其 TUI 运行在 Herdr 中时,它会让 Textual 默认使用单元格坐标的鼠标输入与标准终端 resize 信号。这避免了 Herdr 0.9.0 的一个互操作性 bug,该 bug 会把点击、悬停、选择与滚动都塌缩到窗格的左上角。其他终端保持 Textual 常规的带内 resize 与像素级鼠标行为。显式配置的 `TEXTUAL_SMOOTH_SCROLL` 环境变量优先于 Tau 的兼容性默认值。

## 下一步(Next)

[原文]
- [Sessions]({{< relref "./sessions.md" >}}) — resume, branch, rename, export.
- [Providers & models]({{< relref "./providers-and-models.md" >}}) — switch and add models.
- [Managing context]({{< relref "./context.md" >}}) — compaction and thinking modes.

[译文]
- [会话]({{< relref "./sessions.md" >}}) —— 恢复、分支、重命名、导出。
- [Provider 与模型]({{< relref "./providers-and-models.md" >}}) —— 切换与添加模型。
- [管理上下文]({{< relref "./context.md" >}}) —— 压缩与 thinking 模式。
