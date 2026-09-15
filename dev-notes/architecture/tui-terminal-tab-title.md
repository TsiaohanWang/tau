# TUI 终端标签页标题 / TUI terminal tab titles

[原文]
Issue: #260

[译文]
Issue:#260

## 变更内容(What changed)

[原文]
The Textual TUI now updates the terminal emulator's window/tab title with the
active Tau session name and running state:

[译文]
Textual TUI 现在会用活动的 Tau 会话名与运行状态更新终端模拟器的窗口/标签页标题:

[原文]
- idle unnamed session: `τ`
- idle named session: `τ | <session name>`
- running session: an animated Braille spinner prefix plus the idle title

[译文]
- 空闲且未命名会话:`τ`
- 空闲且已命名会话:`τ | <session name>`
- 运行中会话:动画的盲文(Braille)spinner 前缀加上空闲标题

[原文]
On TUI shutdown Tau writes a neutral `τ` title so the terminal is not left with
a stale running frame.

[译文]
TUI 关闭时,Tau 会写回中性的 `τ` 标题,这样终端不会残留一个过时的运行帧。

## 为什么它位于 `tau_coding`(Why it lives in `tau_coding`)

[原文]
Terminal title updates are a frontend concern. The implementation uses state the
TUI already owns:

[译文]
终端标题更新属于前端关注点。实现使用的是 TUI 本就持有的状态:

[原文]
- `TuiState.running`, populated from `AgentStartEvent`, `AgentEndEvent`, and
  non-recoverable `ErrorEvent` by the adapter;
- `CodingSession.session_title`, which is updated by `/name` and automatic
  session naming.

[译文]
- `TuiState.running`:由适配器根据 `AgentStartEvent`、`AgentEndEvent` 与不可恢复的 `ErrorEvent` 填充;
- `CodingSession.session_title`:由 `/name` 与自动会话命名更新。

[原文]
No terminal or Textual dependencies were added to `tau_agent` or `tau_ai`.

[译文]
`tau_agent` 与 `tau_ai` 都没有新增终端或 Textual 依赖。

## 机制(Mechanism)

[原文]
`src/tau_coding/tui/terminal_title.py` emits OSC 0 sequences:

[译文]
`src/tau_coding/tui/terminal_title.py` 发出 OSC 0 序列:

```text
ESC ] 0 ; <title> BEL
```

[原文]
OSC 0 is broadly supported by common terminal emulators and sets the terminal
window/tab title. The `TerminalTitleController` writes only when the computed
title changes, so idle refreshes do not spam stdout. While running, the existing
activity timer drives both the in-app prompt animation and the tab-title spinner.

[译文]
常见终端模拟器普遍支持 OSC 0,用于设置终端窗口/标签页标题。`TerminalTitleController` 只在计算出的标题发生变化时才写入,因此空闲刷新不会刷屏 stdout。运行期间,既有的活动计时器同时驱动应用内的提示输入动画与标签页标题的 spinner。

## 能力检测与安全(Capability detection and safety)

[原文]
Title writing is enabled only when stdout is a TTY, `TERM` is not `dumb`, and CI
is not detected. Users can opt out with `TAU_TERMINAL_TITLE=0`; CI/no-TTY cases
can opt in explicitly with `TAU_TERMINAL_TITLE=1` only where supported by the
helper's rules. Title writes are best-effort: if the terminal stream raises while
Tau is writing an OSC sequence, Tau disables further title writes for that TUI
process instead of interrupting the session.

[译文]
只有当 stdout 是 TTY、`TERM` 不是 `dumb` 且未检测到 CI 时,才会启用标题写入。用户可以用 `TAU_TERMINAL_TITLE=0` 选择退出;CI/无 TTY 的场景可以显式设置 `TAU_TERMINAL_TITLE=1` 选择启用,但仅限该辅助函数规则允许的情况。标题写入是尽力而为的:如果 Tau 在写 OSC 序列时终端流抛出异常,Tau 会为该 TUI 进程禁用后续标题写入,而不是打断会话。

[原文]
Session names are sanitized before they enter an OSC payload: C0/C1 control
characters, including BEL and ESC, are stripped and the title is capped to 120
characters.

[译文]
会话名在进入 OSC 载荷之前会被清洗:C0/C1 控制字符(包括 BEL 与 ESC)会被剥离,标题长度上限为 120 个字符。

## 测试与手动验证(Testing and manual verification)

[原文]
Automated tests cover title construction, sanitization, capability detection,
deduplicated writes, and TUI running/name/idle transitions.

[译文]
自动化测试覆盖标题构建、清洗、能力检测、去重写入,以及 TUI 的运行/命名/空闲状态转换。

[原文]
Manual verification:

[译文]
手动验证:

[原文]
1. Open `tau` in a real terminal tab.
2. Confirm an unnamed idle TUI shows `τ` in the tab title.
3. Run `/name build notes` and confirm the tab changes to `τ | build notes`.
4. Submit a prompt that runs long enough to observe the animated spinner prefix.
5. Cancel or let the run finish; confirm the spinner stops.
6. Quit the TUI and confirm the tab is reset to `τ`.
7. Repeat once with `TAU_TERMINAL_TITLE=0 tau` and confirm Tau does not manage
   the tab title.

[译文]
1. 在真实终端标签页中打开 `tau`。
2. 确认未命名且空闲的 TUI 在标签页标题中显示 `τ`。
3. 运行 `/name build notes`,确认标签页变为 `τ | build notes`。
4. 提交一个运行时间足够长的提示,以观察到动画 spinner 前缀。
5. 取消或让运行结束;确认 spinner 停止。
6. 退出 TUI,确认标签页重置为 `τ`。
7. 用 `TAU_TERMINAL_TITLE=0 tau` 再重复一次,确认 Tau 不再管理标签页标题。
