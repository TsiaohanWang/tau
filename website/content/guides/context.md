---
title: "Managing context / 管理上下文"
description: "Keep long sessions working with automatic and manual compaction, and control model effort with thinking modes. / 用自动与手动压缩让长会话继续可用,并用 thinking 模式控制模型的投入程度。"
---

[原文]
A model can only read so much text at once — its **context window**. Long coding
sessions fill it up. Tau handles this with **compaction** (summarizing older
history) and lets you tune how hard the model works with **thinking modes**.

[译文]
模型一次只能读入有限的文本量 —— 这就是它的**上下文窗口**。长时间的编码会话会把它填满。Tau 用**压缩(compaction)**(把较旧的历史总结掉)来处理这个问题,并让你通过 **thinking 模式**调整模型的投入程度。

## 查看上下文用量(Seeing context usage)

[原文]
The compact status below the TUI prompt shows provider-anchored active context as
`used/limit`. When no valid provider usage exists yet, it shows `?/limit` instead
of presenting the fallback estimate as provider-confirmed usage. Run `/session`
to see the detailed provider basis or fallback estimate:

[译文]
TUI 提示输入下方的紧凑状态行会以 `used/limit` 展示「锚定 provider 的」活动上下文。当尚不存在有效的 provider 用量时,它显示 `?/limit`,而不是把回退估算冒充成 provider 确认过的用量。运行 `/session` 可以看到详细的 provider 基数或回退估算:

```text
Estimated context tokens: <count>
Context window: <count>
Context window source: configured catalog | provider live catalog
Context token breakdown: system=<count>, messages=<count>, tools=<count>
Thinking mode: <mode>
```

[原文]
After a successful model response, Tau uses the provider-reported token usage as
the authoritative size of the context processed by that response, then estimates
only messages added afterward. Before the first response, immediately after
compaction, or when no valid usage is available, Tau falls back to a deterministic
estimate (roughly `characters / 4` plus small per-message and per-tool overhead).
The fallback covers the system prompt, project context (`AGENTS.md`), skill
metadata, active message history, and tool schemas.

[译文]
在一次成功的模型响应之后,Tau 会用 provider 上报的 token 用量作为「该响应所处理上下文」的权威大小,然后只估算此后新增的消息。在第一次响应之前、压缩刚完成之后,或没有可用合法用量时,Tau 回退到一种确定性估算(大致是 `字符数 / 4`,再加上少量按消息与按工具的开销)。该回退覆盖系统提示词、项目上下文(`AGENTS.md`)、技能元数据、活动消息历史与工具 schema。

[原文]
`/session` reports `Context token basis: provider=<count>, estimated
trailing=<count>` when provider usage anchors the active count. Otherwise it shows
the fallback system/message/tool breakdown. Provider usage from errored or aborted
responses is not trusted.

[译文]
当 provider 用量为活动计数提供锚点时,`/session` 会报告 `Context token basis: provider=<count>, estimated trailing=<count>`。否则它展示回退的系统/消息/工具明细。来自出错或被中止响应的 provider 用量不被信任。

[原文]
This is different from the cumulative token totals in the sidebar's **usage**
section. Cumulative usage adds the provider-reported input and output tokens from every request on the active
branch, including history later replaced by compaction. Repeatedly sending the
same context therefore increases cumulative input usage, while active context
consumption describes only what Tau expects to send next. The two figures are
not expected to match.

[译文]
这与侧边栏 **usage** 区块中的累计 token 总量不同。累计用量会把活动分支上每一次请求的 provider 上报输入与输出 token 相加,包括后来被压缩替换掉的历史。因此反复发送同一份上下文会推高累计输入用量,而活动上下文消耗只描述 Tau 接下来预计要发送的内容。这两个数字本就不应相等。

## 自动压缩(Automatic compaction)

[原文]
By default, Tau compacts automatically when the estimate gets close to the
model's context window. It checks three moments:

[译文]
默认情况下,当估算值接近模型的上下文窗口时,Tau 会自动压缩。它检查三个时机:

[原文]
- before a new prompt (to catch context added out-of-band),
- after a successful turn (to compact before your next turn), and
- after a context-overflow error (force compaction regardless of the local estimate,
  then retry once).

[译文]
- 新提示之前(以捕获带外新增的上下文);
- 一次成功轮次之后(在你下一轮之前先压缩);以及
- 出现上下文溢出错误之后(不管本地估算如何都强制压缩,然后重试一次)。

[原文]
When it compacts, Tau asks the model to summarize older messages, keeps a recent
suffix of the conversation, and continues. The original session file is never
edited — only the *active context* sent to the provider changes.

[译文]
压缩时,Tau 会让模型总结较旧的消息,保留对话最近的一段后缀,然后继续。原始会话文件永远不会被改写 —— 改变的只是发送给 provider 的*活动上下文*。

[原文]
The default threshold follows the model's context window minus a reserve. Providers
that advertise an explicit runtime threshold can override that default. In particular,
Codex subscription sessions discover account/rollout-specific limits from Codex's
authenticated model catalog because those limits can differ from the public OpenAI API.
You can override the resulting threshold for a run:

[译文]
默认阈值是「模型上下文窗口减去一段预留」。声明了显式运行时阈值的 provider 可以覆盖该默认值。尤其是 Codex 订阅会话:它会从 Codex 经认证的模型目录中发现按账号/推送批次而定的上限,因为这些上限可能与公开的 OpenAI API 不同。你可以为某次运行覆盖最终阈值:

```bash
tau --auto-compact-threshold 100000
```

[原文]
Automatic compaction is best-effort: if summarization fails, Tau logs it and keeps
the original context. During successful overflow recovery, the TUI shows compaction
and retry progress instead of presenting the intermediate provider rejection as a
terminal error. The error becomes visible only if recovery cannot complete.

[译文]
自动压缩是尽力而为的:如果摘要生成失败,Tau 会记录下来并保留原始上下文。在溢出恢复成功的过程中,TUI 会展示压缩与重试进度,而不是把中间的 provider 拒绝当作终态错误。只有当恢复无法完成时,该错误才会显现。

## 手动压缩(Manual compaction)

[原文]
Compact on demand any time:

[译文]
随时按需压缩:

```text
/compact
/compact focus on the database migration work
```

[原文]
Optional text after `/compact` is added as extra focus for the summary. Like automatic
compaction, manual compaction summarizes an older prefix and keeps a recent suffix. If
there is not enough older context to summarize while retaining a real entry, Tau reports
that the context is too short to compact. Summary generation failures remain visible.

[译文]
`/compact` 之后的可选文本会作为额外的关注点加入摘要。与自动压缩一样,手动压缩会总结较旧的前缀并保留最近的后缀。如果在保留一个真实条目的前提下没有足够的旧上下文可供总结,Tau 会报告上下文太短、无法压缩。摘要生成失败会保持可见。

[原文]
In the TUI, a manual compaction looks like a normal working turn: the prompt
activity indicator and terminal tab title animate while it runs, and a
turn-finished notification fires when it completes while the app is unfocused.
Press `Esc` to cancel a running compaction.

[译文]
在 TUI 中,手动压缩看起来就像一次正常的工作轮次:运行期间提示输入的活动指示器与终端标签页标题会有动画;当它在应用未获得焦点时完成,会触发一次轮次结束通知。按 `Esc` 可以取消正在运行的压缩。

## Thinking 模式(Thinking modes)

[原文]
Some models can spend extra effort reasoning before answering. Tau exposes a
thinking level you can cycle:

[译文]
有些模型会在回答之前投入额外的推理力气。Tau 暴露一个可以循环切换的 thinking 等级:

```text
off → minimal → low → medium → high → xhigh → max
```

[原文]
- **Shift+Tab** cycles the thinking level (default is `medium`).
- **Ctrl+T** toggles whether reasoning tokens are shown (hidden by default).
  Reasoning blocks are saved with the assistant response, so their original
  positions and visibility toggle are restored when you resume a session.

[译文]
- **Shift+Tab** 循环切换 thinking 等级(默认是 `medium`)。
- **Ctrl+T** 切换是否显示推理 token(默认隐藏)。推理块会随 assistant 响应一起保存,因此恢复会话时,它们的原始位置与可见性开关都会被还原。

[原文]
Thinking is model-aware: Tau enables it only when the active provider declares
supported levels for the active model. When it's unavailable, `/session` shows
the reason (e.g. the provider doesn't declare `thinking_levels`, or the model
isn't listed). Custom providers can opt in via `thinking_levels` in their config
— see [Configuration]({{< relref "../reference/configuration.md#providers" >}}).

[译文]
Thinking 是感知模型的:Tau 只在活动 provider 为活动模型声明了受支持等级时才启用它。不可用时,`/session` 会显示原因(例如该 provider 没有声明 `thinking_levels`,或该模型未被列出)。自定义 provider 可以在配置中通过 `thinking_levels` 选择启用 —— 见[配置]({{< relref "../reference/configuration.md#providers" >}})。

[原文]
At startup Tau picks a valid level for the selected model automatically: a
remembered per-model choice wins, then `medium`, then the provider's own
default, then the first level the model supports. For example, `kimi-code:k3`
supports `low`, `high`, and `xhigh`; because `medium` is unavailable, it opens
at its `xhigh` catalog default instead of failing with "Thinking mode medium is
not available". Picking an unsupported level explicitly (via `/think` or the
thinking picker) still shows an error listing the available modes.

[译文]
启动时,Tau 会自动为所选模型挑选一个合法等级:优先是记住的按模型选择,然后是 `medium`,再是该 provider 自己的默认值,最后是该模型支持的第一个等级。例如 `kimi-code:k3` 支持 `low`、`high` 与 `xhigh`;由于 `medium` 不可用,它会以目录默认的 `xhigh` 打开,而不是报出 "Thinking mode medium is not available" 而失败。显式选择不受支持的等级(通过 `/think` 或 thinking 选择器)仍会给出错误并列出可用模式。

[原文]
You can also set the startup level from the command line with `--thinking`
(`-t`), for example `tau -t high` or `tau -t max -p "explain this"`. The flag
takes precedence over remembered and catalog defaults for that run but is not
saved as a new default; requesting a level the selected model does not support
exits with an error listing the available modes. Levels chosen interactively
afterwards (via `/think` or Shift+Tab) persist as usual.

[译文]
你也可以用命令行参数 `--thinking`(`-t`)设置启动等级,例如 `tau -t high` 或 `tau -t max -p "explain this"`。该参数在该次运行中优先于记住的默认值与目录默认值,但不会被保存为新的默认值;请求所选模型不支持的等级会以错误退出,并列出可用模式。此后通过交互方式选择的等级(经由 `/think` 或 Shift+Tab)照常持久化。
