# TUI 轮次通知 / TUI turn notifications

## 变更内容(What changed)

[原文]
Tau's Textual frontend can now request terminal attention after an agent run fully
settles while its terminal surface is unfocused. The `turn_notification` setting
in `~/.tau/tui.json` accepts:

[译文]
Tau 的 Textual 前端现在可以在 agent 运行完全结束、而其终端界面未获得焦点时请求终端提示。`~/.tau/tui.json` 中的 `turn_notification` 设置接受:

[原文]
- `"desktop"` (default): write OSC 9 for detected Ghostty, iTerm2, or MinTTY
  sessions, and OSC 99 for detected Kitty sessions;
- `"bell"`: write the standard BEL control character;
- `"off"`: write nothing.

[译文]
- `"desktop"`(默认):对检测到的 Ghostty、iTerm2 或 MinTTY 会话写入 OSC 9,对检测到的 Kitty 会话写入 OSC 99;
- `"bell"`:写入标准的 BEL 控制字符;
- `"off"`:不写任何内容。

[原文]
Terminal emulators decide how these sequences appear. For example, a bell may
mark an inactive tab, request application attention, or play a sound according
to terminal settings. Desktop notifications may also use the operating system's
configured notification sound. Tau detects supported desktop protocols from
terminal environment variables: Kitty takes precedence and receives OSC 99;
Ghostty, iTerm2, and MinTTY receive OSC 9. Unknown terminals receive no desktop
sequence rather than an incompatible escape sequence.

[译文]
这些序列如何呈现由终端模拟器决定。例如,铃声可能根据终端设置标记一个非活动标签页、请求应用注意,或播放声音。桌面通知也可能使用操作系统配置的通知音。Tau 从终端环境变量检测受支持的桌面协议:Kitty 优先并获得 OSC 99;Ghostty、iTerm2 与 MinTTY 获得 OSC 9。未知终端不会收到任何桌面序列,而不是收到一个不兼容的转义序列。

## 为什么它属于 TUI(Why it belongs in the TUI)

[原文]
Completion remains a provider-neutral session event. Focus reporting, terminal
control sequences, and user notification preferences are frontend policy, so the
implementation stays under `tau_coding.tui`; neither `tau_agent` nor the coding
session knows about Textual or terminal capabilities.

[译文]
完成仍然是一个 provider 无关的会话事件。焦点上报、终端控制序列与用户通知偏好都属于前端策略,因此实现留在 `tau_coding.tui`;`tau_agent` 与编码会话都不了解 Textual 或终端能力。

[原文]
Textual's `AppBlur` and `AppFocus` events maintain the active-surface state. Tau
notifies on `AgentSettledEvent`, rather than `agent_end` or `turn_end`, because a
retry, automatic compaction, queued steering message, or follow-up may still run
after those lower-level boundaries. This produces one notification when Tau
actually becomes idle.

[译文]
Textual 的 `AppBlur` 与 `AppFocus` 事件维护活动界面状态。Tau 在 `AgentSettledEvent` 上通知,而不是在 `agent_end` 或 `turn_end` 上,因为在那些更底层的边界之后,重试、自动压缩、排队的插话消息或追加仍可能继续运行。这保证只在 Tau 真正进入空闲时产生一次通知。

[原文]
Writes use `sys.__stdout__`, matching terminal-title updates, and are skipped for
non-TTY streams, `TERM=dumb`, and CI. Payload control bytes are stripped before
building OSC 9 or OSC 99, and write failures disable later attempts instead of
crashing the TUI.

[译文]
写入使用 `sys.__stdout__`,与终端标题更新保持一致,并且对非 TTY 流、`TERM=dumb` 与 CI 会跳过。构建 OSC 9 或 OSC 99 之前会剥离载荷中的控制字节;写入失败会禁用后续尝试,而不是让 TUI 崩溃。

## 如何测试(How to test)

[原文]
Automated coverage verifies configuration parsing, control-sequence generation,
write failure handling, and focused versus unfocused completion behavior.

[译文]
自动化覆盖验证配置解析、控制序列生成、写入失败处理,以及「有焦点 vs 无焦点」的完成行为。

[原文]
For manual validation in a terminal with two tabs:

[译文]
在带两个标签页的终端中做手动验证:

[原文]
1. Start Tau and submit a prompt that runs for several seconds.
2. Switch to another tab before it completes.
3. Confirm a desktop notification appears on Ghostty/iTerm2/MinTTY (OSC 9) or
   Kitty (OSC 99) when Tau settles.
4. Set `"turn_notification": "bell"` in `~/.tau/tui.json`, repeat, and confirm the
   terminal's configured bell attention appears.
5. Keep Tau focused for a completed prompt and confirm no notification appears.
6. Set the value to `"off"` and confirm inactive completion stays silent.

[译文]
1. 启动 Tau,提交一个运行数秒的提示。
2. 在它完成之前切换到另一个标签页。
3. 确认 Tau 结束时,Ghostty/iTerm2/MinTTY(OSC 9)或 Kitty(OSC 99)出现桌面通知。
4. 在 `~/.tau/tui.json` 中设置 `"turn_notification": "bell"` 后重复,确认出现终端配置的铃声提示。
5. 让 Tau 保持焦点并完成一个提示,确认不出现通知。
6. 把该值设为 `"off"`,确认非活动完成保持静默。
