# 退出时的恢复提示 / Exit resume hint

## 内容(What)

[原文]
When the interactive TUI exits and the session was persisted, Tau now prints
a one-line reminder of how to resume it:

[译文]
当交互式 TUI 退出且会话已持久化时,Tau 现在会打印一行提醒,说明如何恢复它:

```text
To resume this session: tau --session <session-id>
```

[原文]
This mirrors Pi's exit-time hint (`To resume this session: pi --session
[session id]`) using Tau's `--session` flag, which was renamed from
`--resume` in [issue #439](https://github.com/huggingface/tau/issues/439)
to match Pi's naming (see `dev-notes/cli-mirror-pi-flags.md`).

[译文]
这镜像了 Pi 的退出提示(`To resume this session: pi --session [session id]`),使用 Tau 的 `--session` 参数 —— 该参数在 [issue #439](https://github.com/huggingface/tau/issues/439) 中从 `--resume` 重命名而来,以匹配 Pi 的命名(见 `dev-notes/cli-mirror-pi-flags.md`)。

## 为什么(Why)

[原文]
Closing the TUI previously gave no indication of how to pick the
conversation back up. New users in particular had to already know about
`tau --session <id>` or `tau sessions`. A short, low-friction hint at exit
closes that gap without adding new UI surface.

[译文]
此前关闭 TUI 不会给出任何如何接回这段对话的提示。尤其是新用户,必须先知道 `tau --session <id>` 或 `tau sessions`。退出时给出一句简短、低摩擦的提示,在不新增 UI 界面的情况下填补了这个空白。

[原文]
See [issue #438](https://github.com/huggingface/tau/issues/438) for the
original request and discussion.

[译文]
最初的请求与讨论见 [issue #438](https://github.com/huggingface/tau/issues/438)。

## 与架构的对应关系(How it maps to the architecture)

[原文]
Per `AGENTS.md`, `tau_agent` stays UI-agnostic; this hint is purely a
`tau_coding` (CLI/TUI) concern:

[译文]
按照 `AGENTS.md`,`tau_agent` 保持与 UI 无关;这条提示纯粹是 `tau_coding`(CLI/TUI)的关注点:

[原文]
- `src/tau_coding/tui/app.py`: `run_tui_app` now returns `str | None` — the
  active session id, but only if that session is actually persisted/indexed
  (`manager.get_session(active_session_id) is not None`). Ephemeral or
  never-persisted sessions return `None`, and the hint is suppressed.
- `src/tau_coding/cli.py`: `run_openai_tui` forwards that return value.
  `main()` captures it from `anyio.run(...)` as `resumable_session_id` and,
  after the TUI has fully exited (session/provider cleanup complete), prints
  the hint via `typer.echo` before raising `typer.Exit()`.

[译文]
- `src/tau_coding/tui/app.py`:`run_tui_app` 现在返回 `str | None` —— 活动会话 id,但仅当该会话确实已持久化/建立索引时(`manager.get_session(active_session_id) is not None`)。短暂存在或从未持久化的会话返回 `None`,提示被抑制。
- `src/tau_coding/cli.py`:`run_openai_tui` 转发该返回值。`main()` 从 `anyio.run(...)` 捕获它作为 `resumable_session_id`,并在 TUI 完全退出(会话/provider 清理完成)之后,于抛出 `typer.Exit()` 之前通过 `typer.echo` 打印该提示。

[原文]
No new state or side channel was introduced — the resumable session id is
threaded back through existing return values.

[译文]
没有引入新的状态或旁路通道 —— 可恢复的会话 id 是经由既有返回值一路传回的。

## 范围(Scope)

[原文]
This only covers the interactive TUI exit path. Print mode
(`tau -p`/`run_openai_print_mode`) is a single-shot, already-scripted
invocation and was left out of scope — see the issue for that discussion.

[译文]
这只覆盖交互式 TUI 的退出路径。Print 模式(`tau -p`/`run_openai_print_mode`)是一次性的、已在脚本中的调用,被排除在范围之外 —— 相关讨论见该 issue。

## 如何测试/使用(How to test/use it)

[原文]
- Automated: `tests/test_cli.py::test_cli_prints_resume_hint_after_tui_exit`
  and `test_cli_suppresses_resume_hint_without_persisted_session` exercise
  the CLI-level behavior with a fake `run_openai_tui`.
- Manual: run `tau`, send at least one message (so the session persists),
  then quit (`Ctrl+C` / `/quit`). The shell should print the resume hint
  with the real session id. Starting `tau` and exiting immediately, before
  any session-worthy activity, should print nothing.

[译文]
- 自动化:`tests/test_cli.py::test_cli_prints_resume_hint_after_tui_exit` 与 `test_cli_suppresses_resume_hint_without_persisted_session` 用假的 `run_openai_tui` 演练 CLI 层行为。
- 手动:运行 `tau`,发送至少一条消息(使会话持久化),然后退出(`Ctrl+C` / `/quit`)。Shell 应打印带有真实会话 id 的恢复提示。启动 `tau` 后立即退出(在任何值得持久化的活动之前)不应打印任何内容。
