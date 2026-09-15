# TUI 文件拖放(把路径拖进提示输入) / TUI file drop (drag-and-drop paths into the prompt)

[原文]
Tracks issue #170: users can drag files onto the terminal window and Tau inserts
the filesystem paths into the prompt.

[译文]
跟踪 issue #170:用户可以把文件拖到终端窗口上,Tau 会把文件系统路径插入提示输入。

## 工作原理(How it works)

[原文]
Terminals do not send OS drag-and-drop as a dedicated event. When a file is
dropped onto the terminal window, the emulator *types* the file's path into the
running program. Because Textual enables bracketed-paste mode, that typed path
arrives as a single `textual.events.Paste` message — so file-drop support is
implemented as a special case of paste handling.

[译文]
终端不会把操作系统的拖放作为专门事件发送。当文件被拖到终端窗口上时,模拟器会把该文件的路径*键入*正在运行的程序。由于 Textual 启用了括号粘贴(bracketed-paste)模式,键入的路径会作为单条 `textual.events.Paste` 消息到达 —— 因此文件拖放支持被实现为粘贴处理的一个特例。

[原文]
The exact dropped text varies by terminal:

[译文]
实际丢弃的文本因终端而异:

[原文]
- most shell-escape paths (`/tmp/my\ file.png`) and space-separate multiple
  files;
- some quote paths that contain spaces (`"/tmp/my file.png"`);
- some VTE-based terminals emit `file://` URIs;
- a few emit the bare path, even with spaces.

[译文]
- 大多数会做 shell 转义(`/tmp/my\ file.png`),并以空格分隔多个文件;
- 有些会为包含空格的路径加引号(`"/tmp/my file.png"`);
- 一些基于 VTE 的终端会发出 `file://` URI;
- 少数终端即使路径含空格也直接发出裸路径。

## 组成部分(Pieces)

[原文]
- `src/tau_coding/tui/file_drop.py` — `normalize_dropped_paths(text)` decides
  whether pasted text is *only* one or more absolute paths that exist on disk
  (parsing escaped/quoted forms with `shlex`, and converting `file://` URIs).
  If so it returns clean, space-separated paths, double-quoting any path with
  whitespace. Anything else returns `None`. Requiring absolute, existing paths
  keeps false positives (ordinary pasted prose) effectively impossible.
- `PromptInput.on_paste` in `src/tau_coding/tui/app.py` — tries
  `normalize_dropped_paths` first; on a match it inserts the normalized text at
  the cursor with smart spacing (a separating space is added before/after only
  when the neighboring character is not whitespace). Otherwise paste handling
  falls through to the existing large-paste placeholder logic untouched. The
  rules live in `PromptInput.handle_pasted_text(text)` so other entry points can
  reuse them; `PromptInput.insert_pasted_text(text)` adds verbatim insertion for
  callers that bypass Textual's default paste handler.
- `TauTuiApp.on_paste` in `src/tau_coding/tui/app.py` — app-level fallback for
  drops that arrive while no widget holds focus (see below).

[译文]
- `src/tau_coding/tui/file_drop.py` —— `normalize_dropped_paths(text)` 判断粘贴文本是否*只*由一个或多个磁盘上真实存在的绝对路径组成(用 `shlex` 解析转义/引号形式,并转换 `file://` URI)。若是,则返回干净的、以空格分隔的路径,并对任何含空白的路径加双引号。其他任何情况都返回 `None`。要求「绝对且存在」使误判(普通粘贴的散文)几乎不可能发生。
- `src/tau_coding/tui/app.py` 中的 `PromptInput.on_paste` —— 先尝试 `normalize_dropped_paths`;命中时把规范化文本按智能间距插入光标处(只有在相邻字符不是空白时,才在前/后添加一个分隔空格)。否则粘贴处理原样落回既有的大段粘贴占位符逻辑。这些规则位于 `PromptInput.handle_pasted_text(text)`,以便其他入口复用;`PromptInput.insert_pasted_text(text)` 为绕过 Textual 默认粘贴处理器的调用方提供原样插入。
- `src/tau_coding/tui/app.py` 中的 `TauTuiApp.on_paste` —— 针对「没有任何组件持有焦点时到达的拖放」的应用级回退(见下文)。

## 终端未获焦点时到达的拖放(Drops that arrive while the terminal is unfocused)

[原文]
Some drag sources never hand keyboard focus back to the terminal before the drop
lands — most visibly the **macOS Dock** (e.g. the Downloads stack). Those drops
silently disappeared while Finder drops worked, because of this chain in Textual:

[译文]
有些拖拽来源在拖放落地之前从不把键盘焦点交还给终端 —— 最明显的是 **macOS Dock**(例如「下载」堆栈)。这些拖放会静默消失,而 Finder 的拖放却正常,原因在于 Textual 中的这条链路:

[原文]
1. Textual enables focus reporting (`CSI ? 1004 h`), so the terminal reports
   `FocusOut` when the drag source takes over.
2. `App._watch_app_focus` calls `screen.set_focus(None)` on blur, so the prompt
   is no longer the focused widget.
3. `App.on_event` forwards `events.Paste` to `self.focused`, or to the screen
   when nothing is focused; `Screen` has no paste handler, so the text is lost.
4. Textual restores `app_focus` on `Key`/`MouseDown` only, never on `Paste`, so
   the blur is still in effect when the dropped path arrives.

[译文]
1. Textual 启用了焦点上报(`CSI ? 1004 h`),因此当拖拽来源接管时,终端会报告 `FocusOut`。
2. `App._watch_app_focus` 在失焦时调用 `screen.set_focus(None)`,于是提示输入不再是获得焦点的组件。
3. `App.on_event` 把 `events.Paste` 转发给 `self.focused`;若没有任何组件获得焦点,则转发给 screen;而 `Screen` 没有粘贴处理器,因此文本丢失。
4. Textual 只在 `Key`/`MouseDown` 时恢复 `app_focus`,从不在 `Paste` 时恢复,因此当被拖放的路径到达时,失焦状态仍然有效。

[原文]
Finder drags activate the terminal (`FocusIn`) before/with the drop, which is why
they always worked: the prompt still had focus.

[译文]
Finder 拖拽会在拖放之前/同时激活终端(`FocusIn`),这就是它一直正常的原因:提示输入仍然持有焦点。

[原文]
The fix keeps focus reporting enabled — Tau uses `AppBlur`/`AppFocus` for turn
notifications — and closes the dispatch hole instead: `TauTuiApp.on_paste`
receives the paste as it bubbles up from the screen and, **only when
`self.focused is None`**, routes the text to `#prompt` via
`insert_pasted_text`. The focus guard prevents double insertion, since
`TextArea._on_paste` does not stop propagation. `query_one("#prompt", ...)` is
scoped to the active screen, so modal screens keep their own paste handling.
Clipboard pastes always require terminal focus, so this path only ever rescues
drops.

[译文]
修复方案保持焦点上报开启(因为 Tau 用 `AppBlur`/`AppFocus` 做轮次通知),转而堵住分发漏洞:`TauTuiApp.on_paste` 在粘贴从 screen 向上冒泡时接收它,并且**只在 `self.focused is None` 时**,通过 `insert_pasted_text` 把文本路由到 `#prompt`。焦点守卫可防止重复插入,因为 `TextArea._on_paste` 不会停止传播。`query_one("#prompt", ...)` 的作用域是活动 screen,因此模态屏幕保有自己的粘贴处理。剪贴板粘贴总是需要终端焦点,所以这条路径只会挽救拖放。

[原文]
Diagnosing this needed raw-input tracing inside the real app: wrapping
`XTermParser.feed` (raw stdin bytes) and `LinuxDriver.process_message` (emitted
messages), plus selectively suppressing individual mode-setting sequences
(`?1004h`, `?1003h`, kitty keyboard flags, `?2048`, `?7l`) to bisect which one
changed the behavior. Suppressing `?1004h` made Dock drops work, which pinned the
cause to focus-driven dispatch rather than to the byte stream or path parsing.

[译文]
诊断这个问题需要在真实应用内部做原始输入追踪:包裹 `XTermParser.feed`(原始 stdin 字节)与 `LinuxDriver.process_message`(发出的消息),并有选择地抑制各个模式设置序列(`?1004h`、`?1003h`、kitty 键盘标志、`?2048`、`?7l`),以二分定位哪一个改变了行为。抑制 `?1004h` 后 Dock 拖放变得可用,这把原因锁定在「焦点驱动的分发」上,而不是字节流或路径解析。

## 测试(Tests)

[原文]
`tests/test_tui_file_drop.py` covers the detection/normalization matrix
(escaped, quoted, bare, URI, multi-file, newline-separated, directories, and
non-drop text) and the prompt insertion behavior (empty prompt, existing text,
mid-text cursor, default paste passthrough). `TestUnfocusedDropRouting` runs a
real `TauTuiApp` under `run_test()`, posts `events.AppBlur()` followed by
`events.Paste(path)`, and asserts the path reaches the prompt; a companion test
posts a paste while the prompt *is* focused to assert the app-level fallback does
not insert the path twice.

[译文]
`tests/test_tui_file_drop.py` 覆盖检测/归一化矩阵(转义、加引号、裸路径、URI、多文件、换行分隔、目录,以及非拖放文本)与提示输入插入行为(空提示、已有文本、文本中部光标、默认粘贴透传)。`TestUnfocusedDropRouting` 在 `run_test()` 下运行真实的 `TauTuiApp`,先投递 `events.AppBlur()` 再投递 `events.Paste(path)`,并断言该路径到达提示输入;一个配套测试在提示输入*确实*获得焦点时投递粘贴,断言应用级回退不会把路径插入两次。

## 手动验证(Manual validation)

[原文]
Run `tau` in a terminal, drag a file from Finder/your file manager onto the
window, and confirm the prompt shows the file's path (quoted if it contains
spaces), preserving anything already typed. On macOS, also drag an item out of
the Dock's Downloads stack — that source keeps the terminal unfocused and
exercises the `TauTuiApp.on_paste` fallback.

[译文]
在终端中运行 `tau`,从 Finder/文件管理器把文件拖到窗口上,确认提示输入显示该文件的路径(含空格时加引号),并保留已经输入的内容。在 macOS 上,还要从 Dock 的「下载」堆栈拖出一个项目 —— 该来源会让终端保持未获焦点,从而实际演练 `TauTuiApp.on_paste` 回退。
