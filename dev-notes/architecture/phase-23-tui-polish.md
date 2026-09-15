---
title: "Phase 23: Advanced TUI and Product Polish / 阶段 23:高级 TUI 与产品化打磨"
---

[原文]
Phase 23 improves the Textual frontend while keeping the reusable agent harness
independent of UI concerns.

[译文]
阶段 23 改进了 Textual 前端,同时让可复用的 agent harness 保持独立于 UI 关注点。

[原文]
The boundary remains:

```text
CodingSession emits AgentEvent values
        ↓
TuiEventAdapter updates TuiState
        ↓
Textual widgets render the transcript and controls
```

[译文]
边界仍然是:

```text
CodingSession 发出 AgentEvent
        ↓
TuiEventAdapter 更新 TuiState
        ↓
Textual 组件渲染会话记录与控件
```

## 当前打磨切片(Current polish slices)

[原文]
Live tool results now render successful output previews in the transcript,
matching restored session history. The TUI shows the first few lines and a
preview hint when additional content is hidden, so large `read` or `bash`
results do not flood the conversation while the durable session still keeps the
complete tool result for model context and replay.

[译文]
实时工具结果现在会在会话记录中渲染成功输出的预览,与恢复出的历史会话保持一致。当还有更多内容被隐藏时,TUI 会显示前几行以及一条预览提示,因此庞大的 `read` 或 `bash` 结果不会淹没对话,同时持久化会话仍保留完整工具结果,供模型上下文与重放使用。

[原文]
Transcript blocks now render fenced code and persisted edit patches with Rich
syntax renderables inside the same Pi-style stacked message blocks. The
transcript state still stores plain role/text items; this is renderer-only
polish in the Textual frontend.

[译文]
会话记录块现在会在同样是 Pi 风格堆叠消息块的结构内,用 Rich 语法渲染对象来渲染围栏代码块与持久化的 edit patch。会话记录状态仍然只存储「角色 + 文本」这样的简单条目;这纯粹是 Textual 前端的渲染层打磨。

[原文]
The transcript surface is a scroll container of selectable message widgets, not
one large `RichLog`. Each message widget owns selected-text extraction for its
rendered block, so partial mouse selection stays scoped to the intended message
and adjacent-message copies do not accidentally expand to the full
conversation.

[译文]
会话记录界面是一个由可选中消息组件构成的滚动容器,而不是一个巨大的 `RichLog`。每个消息组件负责从其渲染块中提取选中文本,因此局部的鼠标选择会限定在目标消息内,复制相邻消息时也不会意外扩展到整段对话。

[原文]
Assistant transcript blocks now also render common Markdown constructs such as
headings, bullets, blockquotes, links, inline code, and emphasis through Rich
Markdown. User, tool, status, and error blocks stay literal unless they are
handled by the explicit code or patch renderers, which keeps pasted prompts and
tool output predictable.

[译文]
Assistant 的会话记录块现在还会通过 Rich Markdown 渲染常见 Markdown 结构,如标题、项目符号、引用块、链接、行内代码与强调。用户、工具、状态与错误块则保持字面呈现,除非它们由显式的代码或 patch 渲染器处理;这使粘贴的提示与工具输出保持可预期。

[原文]
Live `edit` tool results now include their unified patch in the tool block. This
provides an inline diff view for file edits while keeping the event adapter and
Textual widgets decoupled. Tool-result metadata is now preserved in
`ToolResultMessage`, so restored session history can render the same edit patch
blocks from persisted JSONL entries.

[译文]
实时的 `edit` 工具结果现在会在工具块中包含其 unified patch。这为文件编辑提供了内联 diff 视图,同时让事件适配器与 Textual 组件保持解耦。工具结果元数据现在保存在 `ToolResultMessage` 中,因此恢复的历史会话可以从持久化 JSONL 条目渲染出相同的 edit patch 块。

[原文]
The TUI also has a command-palette entry point. Pressing `Ctrl+K` focuses the
prompt, inserts `/`, and shows all slash-command completions using the existing
completion engine. Selection uses the same `Tab`, `Up`, and `Down` bindings as
ordinary slash-command autocomplete. Pressing `Enter` while a highlighted
completion would change the prompt now applies that completion without
submitting the prompt, matching common terminal picker behavior.

[译文]
TUI 还有一个命令面板入口。按 `Ctrl+K` 会聚焦提示输入、插入 `/`,并复用现有的补全引擎展示全部斜杠命令补全。选择使用与普通斜杠命令自动补全相同的 `Tab`、`Up`、`Down` 绑定。当高亮补全会改变提示内容时,按 `Enter` 现在只应用该补全而不提交提示,这与常见的终端选择器行为一致。

[原文]
Slash-command output is now transient UI instead of transcript content. Short
command results use Textual notifications, and multi-line output such as
`/help`, `/skills`, `/resume`, `/status`, `/resources`, and `/context` opens a
dismissible modal. This keeps command reference material out of the agent
conversation while preserving access to the information.

[译文]
斜杠命令的输出现在是临时 UI,而不再进入会话记录内容。较短的命令结果使用 Textual 通知;`/help`、`/skills`、`/resume`、`/status`、`/resources`、`/context` 等多行输出则打开一个可关闭的模态框。这使命令参考资料不进入 agent 对话,同时仍能访问这些信息。

[原文]
The same completion engine now suggests available values for `/model` and
`/login` arguments. `/model` can also open a modal picker for configured
provider/model choices, while `/login` remains the path for adding providers.

[译文]
同一个补全引擎现在会为 `/model` 与 `/login` 的参数建议可用取值。`/model` 还可以为已配置的 provider/模型选项打开模态选择器,而 `/login` 仍然是添加 provider 的入口。

[原文]
The prompt also suggests indexed session ids for `/resume <session-id>`, and
plain `/resume` opens the same modal session picker as the session-picker
keybinding. Those rows include session metadata such as title, model, and
working directory while preserving newest-first order for the current project
from `SessionManager`. Submitting the command reloads the selected session
through `CodingSession` and rebuilds the visible transcript in place.

[译文]
提示输入还会为 `/resume <session-id>` 建议已索引的会话 id,而单纯的 `/resume` 会打开与「会话选择器」快捷键相同的模态选择器。这些行包含标题、模型、工作目录等会话元数据,同时保持 `SessionManager` 为当前项目提供的「从新到旧」顺序。提交该命令会通过 `CodingSession` 重新加载所选会话,并原地重建可见会话记录。

[原文]
The TUI also has a small modal session picker bound to `Ctrl+R` by default.
It lists indexed sessions with the same metadata used by resume completions,
then resumes the selected session through `CodingSession.resume()`. The picker
lives entirely in the Textual frontend; the portable harness still has no
session-selection policy.

[译文]
TUI 还有一个默认绑定到 `Ctrl+R` 的小型模态会话选择器。它列出已索引会话,并使用与 resume 补全相同的元数据,然后通过 `CodingSession.resume()` 恢复所选会话。该选择器完全位于 Textual 前端;可移植 harness 仍然没有会话选择策略。

[原文]
The built-in Textual frontend now reads optional keybinding settings from
`~/.tau/tui.json`. This lets users remap the command palette, completion
navigation, session picker, cancellation, and quit keys while keeping the
configuration in `tau_coding.tui` instead of the reusable agent harness.

[译文]
内置的 Textual 前端现在从 `~/.tau/tui.json` 读取可选的键位设置。这允许用户重新映射命令面板、补全导航、会话选择器、取消与退出按键,同时把配置留在 `tau_coding.tui` 而不是可复用的 agent harness。

[原文]
The same TUI settings file now supports named built-in themes. `tau-dark`
remains the default, and `high-contrast` provides a brighter dark palette. The
default theme is inspired by Toad's Textual UI: a darker surface, transparent
chrome, muted separators, a focused bottom prompt, and stacked conversation rows
with slim left accents instead of boxed cards. Theme selection feeds Textual CSS
variables plus Rich transcript/sidebar renderers, so the app chrome and message
blocks stay visually consistent without adding UI policy to `tau_agent`.

[译文]
同一个 TUI 设置文件现在支持具名的内置主题。`tau-dark` 仍是默认主题,`high-contrast` 提供更明亮的深色调色板。默认主题的灵感来自 Toad 的 Textual UI:更深的底色、透明的界面外壳、柔和的 separators、聚焦于底部的提示输入,以及带细窄左侧强调线的堆叠对话行,而不是盒式卡片。主题选择会驱动 Textual CSS 变量以及 Rich 的会话记录/侧边栏渲染器,因此应用外壳与消息块在视觉上保持一致,同时没有把 UI 策略引入 `tau_agent`。

[原文]
The sidebar is now responsive. It remains visible on medium or larger terminal
windows, but hides automatically when the terminal is narrow or short so the
conversation and prompt keep enough room to breathe. The visibility rule lives
in the Textual frontend; session metadata and agent state are unchanged.
When visible, the sidebar includes loaded context files so project instructions
such as `AGENTS.md` are inspectable without opening a separate command modal.

[译文]
侧边栏现在是响应式的。在中等或更大的终端窗口中它保持可见,但当终端过窄或过矮时会自动隐藏,让对话与提示输入保有足够的呼吸空间。可见性规则位于 Textual 前端;会话元数据与 agent 状态不变。侧边栏可见时还会包含已加载的上下文文件,因此无需打开单独的命令模态框就能查看 `AGENTS.md` 等项目指令。

[原文]
The status line now shows a small animated activity indicator while a run is
active and resets to `Ready` when the run completes, is cancelled, or fails. It
also shows pending steering/follow-up queue counts while queued prompts are
waiting to be injected.

[译文]
状态行现在会在运行期间显示一个小型动画活动指示器,并在运行完成、被取消或失败时重置为 `Ready`。当排队的提示等待注入时,它还会显示待处理的插话/追加队列数量。

[原文]
Thinking controls now include two distinct TUI behaviors: `Shift-Tab` cycles the
active thinking mode when the current provider/model supports it, while `Ctrl-T`
toggles display of streamed thinking tokens. Thinking-token transcript blocks
are hidden by default and rendered with their own role style when shown.

[译文]
Thinking 控件现在包含两种不同的 TUI 行为:当前 provider/模型支持时,`Shift-Tab` 循环切换活动 thinking 模式;`Ctrl-T` 则切换流式 thinking token 的显示。Thinking token 的会话记录块默认隐藏,显示时使用自己的角色样式渲染。

[原文]
Model controls now include a Pi-style scoped-model flow. `/model` still opens
the provider/model picker, but `Space` toggles the highlighted model into the
persisted scoped list and `Tab` switches the picker between all models and
scoped models. `Ctrl-P` cycles through the scoped list directly from the prompt.
The TUI asks `CodingSession` to mutate and cycle this list; Textual does not
read or write provider settings itself.

[译文]
模型控件现在包含 Pi 风格的 scoped-model 流程。`/model` 仍会打开 provider/模型选择器,但 `Space` 可以把高亮模型切换进持久化的 scoped 列表,`Tab` 则在「全部模型」与「scoped 模型」之间切换选择器视图。`Ctrl-P` 可以直接从提示输入循环切换 scoped 列表。TUI 请求 `CodingSession` 修改与循环该列表;Textual 自己不读写 provider 设置。

[原文]
The activity indicator now lives in a stable row directly above the prompt
instead of in the top status line. This keeps the bottom input area visually
active while an agent turn is running, and leaves the top status area focused on
provider, model, queue, and session state.

[译文]
活动指示器现在位于紧邻提示输入上方的固定行,而不再位于顶部状态行。这使底部的输入区域在 agent 轮次运行时保持视觉上的活跃,并让顶部状态区域专注于 provider、模型、队列与会话状态。

[原文]
The Textual footer now carries Tau's shortcut hints through ordinary visible
bindings. It describes the active submission, newline, picker, thinking,
follow-up, and prompt clear shortcuts, switches to autocomplete-focused bindings while
completions are open, and switches again while an agent turn is running. Tau
does not add a separate custom hint row; the built-in bottom toolbar remains the
single shortcut surface.

[译文]
Textual 页脚现在通过普通的可见绑定来承载 Tau 的快捷键提示。它会说明当前生效的提交、换行、选择器、thinking、追加与清空提示等快捷操作;补全打开时切换到聚焦自动补全的绑定;agent 轮次运行时再切换一次。Tau 不额外增加自定义提示行;内置的底部工具栏仍是唯一的快捷键展示面。

[原文]
The TUI treats `Esc` as a two-step cancellation flow. The first press requests
graceful cancellation through `CodingSession.cancel()` and leaves the active
worker visible while the provider or tool observes the cancellation token. The
second press interrupts the current Textual worker immediately. This mirrors
Pi's cancellation boundary: UI code requests cancellation, the portable agent
loop carries a cancellation token, and long-running tools such as `bash` honor
that token without making Textual a dependency of `tau_agent`. Because
cancellation is an intentional user action, the built-in TUI renders the final
cancellation event as status text instead of adding an error row to the
transcript.

[译文]
TUI 把 `Esc` 视为两步取消流程。第一次按下通过 `CodingSession.cancel()` 请求优雅取消,并在 provider 或工具响应取消令牌期间保持活动 worker 可见。第二次按下则立即中断当前 Textual worker。这镜像了 Pi 的取消边界:UI 代码请求取消,可移植 agent 循环持有取消令牌,`bash` 等长时间运行的工具响应该令牌,同时不让 Textual 成为 `tau_agent` 的依赖。由于取消是有意的用户操作,内置 TUI 会把最终的取消事件渲染为状态文本,而不是向会话记录添加一行错误。

[原文]
Assistant code block rendering is now more defensive. Known fence languages use
Rich/Pygments syntax highlighting, while unknown or custom fence labels fall
back to plain code rendering instead of producing a broken transcript block.

[译文]
Assistant 代码块的渲染现在更具防御性。已知的围栏语言使用 Rich/Pygments 语法高亮;未知或自定义的围栏标签会回退为纯代码渲染,而不会产生损坏的会话记录块。

[原文]
The built-in theme set now includes `tau-light` alongside `tau-dark` and
`high-contrast`. Theme choice stays in `tau_coding.tui` configuration and feeds
Textual CSS variables plus Rich renderers without leaking UI policy into the
portable harness. Textual's native theme registry is constrained to these same
Tau themes, so Textual's menu/command-palette theme entry changes Tau's durable
`~/.tau/tui.json` setting instead of becoming a second, non-persistent theme
system.

[译文]
内置主题集合现在除了 `tau-dark` 与 `high-contrast` 之外,还包含 `tau-light`。主题选择保留在 `tau_coding.tui` 配置中,并驱动 Textual CSS 变量与 Rich 渲染器,同时不把 UI 策略泄漏进可移植 harness。Textual 原生的主题注册表被约束为同样的这些 Tau 主题,因此 Textual 菜单/命令面板中的主题入口会修改 Tau 持久化的 `~/.tau/tui.json` 设置,而不会变成第二套不持久化的主题系统。

[原文]
Sessions can now be renamed from the TUI with `/name <new name>`. The command
updates the indexed session metadata used by `/resume`, resume completions, and
the session picker; the underlying append-only transcript remains the durable
source of conversation events.

[译文]
现在可以在 TUI 中用 `/name <new name>` 重命名会话。该命令会更新 `/resume`、resume 补全与会话选择器所使用的已索引会话元数据;底层的只追加会话记录仍然是对话事件的持久化来源。

[原文]
The frontend boundary is now documented in [Building a Custom TUI](../custom-tui.md).
That guide describes how another terminal UI can consume `CodingSession`,
`AgentEvent`, `TuiState`, and `TuiEventAdapter` without coupling to Textual
internals.

[译文]
前端边界现在记录在 [Building a Custom TUI](../custom-tui.md) 中。该指南描述了另一个终端 UI 如何消费 `CodingSession`、`AgentEvent`、`TuiState` 与 `TuiEventAdapter`,而不耦合到 Textual 内部实现。

## 手动验证清单(Manual validation checklist)

[原文]
These checks exercise the Phase 23 polish in the Textual TUI. Use a clean
worktree at `origin/main` so local experimental branches do not affect the
result:

[译文]
以下检查用于在 Textual TUI 中实际演练阶段 23 的打磨成果。请使用基于 `origin/main` 的干净 worktree,以免本地实验分支影响结果:

```bash
git fetch origin
git worktree add /tmp/tau-tui-validate origin/main
cd /tmp/tau-tui-validate
uv run tau
```

[原文]
1. Check `/name` by starting a session, running `/name Manual validation`, then
   opening `/resume`. The renamed session should appear in the resume picker and
   in `/resume <session-id>` completions.
2. Check the working indicator by submitting a prompt that takes a few seconds.
   The prompt border should slowly fade between activity colors while the turn
   runs, without a separate spinner row above the prompt.
3. Check shortcut hints in the built-in bottom footer. It should show prompt
   actions such as submit, newline, commands, sessions, thinking, clear, and
   quit. Open slash-command autocomplete and confirm the same footer switches to
   complete, choose, and close actions. Submit a prompt that takes a few seconds
   and confirm the footer switches to steer, follow-up, cancel, thinking, and
   tools actions. There should not be a second custom shortcut row above the
   footer.
4. Check code block rendering by asking the model for one fenced `python` block
   and one fenced block with an unknown language such as
   `not-a-real-language`. The Python block should be highlighted, and the
   unknown-language block should render as plain code without breaking the
   transcript.
5. Check the light theme by writing this file:

   ```json
   {
     "theme": "tau-light"
   }
   ```

   to `~/.tau/tui.json`, restarting `uv run tau`, and confirming the app uses a
   light palette with readable transcript, sidebar, footer, and prompt colors.
   Restore your preferred theme after the check.

[译文]
1. 检查 `/name`:启动一个会话,运行 `/name Manual validation`,然后打开 `/resume`。被重命名的会话应出现在 resume 选择器以及 `/resume <session-id>` 的补全中。
2. 检查活动指示器:提交一个需要几秒钟的提示。轮次运行期间,提示输入的边框应在几种活动色之间缓慢渐变,且提示输入上方没有额外的 spinner 行。
3. 检查内置底部页脚中的快捷键提示。它应展示提交、换行、命令、会话、thinking、清空与退出等提示操作。打开斜杠命令自动补全,确认同一页脚切换为「补全、选择、关闭」操作。提交一个需要几秒钟的提示,确认页脚切换为「插话、追加、取消、thinking、工具」操作。页脚上方不应出现第二条自定义快捷键行。
4. 检查代码块渲染:让模型输出一个 `python` 围栏代码块,以及一个使用未知语言(例如 `not-a-real-language`)的围栏块。Python 块应高亮显示,未知语言块应作为纯代码渲染,且不破坏会话记录。
5. 检查浅色主题:把下面这个文件写入 `~/.tau/tui.json`,重启 `uv run tau`,确认应用使用浅色调色板,且会话记录、侧边栏、页脚与提示输入的颜色可读。检查完成后恢复你偏好的主题。

```json
{
  "theme": "tau-light"
}
```

## 边界(Boundaries)

[原文]
These changes live in `tau_coding.tui`. The command registry still owns command
metadata, and `tau_agent` remains unaware of Textual, keybindings, slash
commands, and rendering.

[译文]
这些改动位于 `tau_coding.tui`。命令注册表仍持有命令元数据,而 `tau_agent` 仍然不了解 Textual、键位绑定、斜杠命令与渲染。

## 仍然推迟(Still deferred)

[原文]
Phase 21 extensions remain intentionally unimplemented. Future polish may add
more advanced picker surfaces, but the current Phase 23 checklist items now have
foundational implementations.

[译文]
阶段 21 的扩展系统当时仍被有意推迟实现。未来的打磨可能加入更高级的选择器界面,但当前阶段 23 的清单项都已有了基础实现。

## 测试(Tests)

[原文]
Coverage lives in:

[译文]
测试覆盖位于:

```text
tests/test_tui_adapter.py
tests/test_tui_app.py
tests/test_tui_config.py
```
