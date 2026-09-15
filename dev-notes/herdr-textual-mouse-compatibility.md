# Herdr/Textual 鼠标兼容性 / Herdr/Textual mouse compatibility

## 问题(Problem)

[原文]
Tau's Textual TUI received unusable mouse coordinates on Herdr 0.9.0. In a
161-by-53-cell pane, a click near the bottom-right arrived at Textual near
`(11, 1)`. Clicking, hovering, selecting text, following links, and scrolling
therefore targeted the top-left of the application.

[译文]
Tau 的 Textual TUI 在 Herdr 0.9.0 上收到了不可用的鼠标坐标。在一个 161×53 单元格的面板中,靠近右下角的点击到达 Textual 时却接近 `(11, 1)`。因此点击、悬停、选择文本、跟随链接与滚动都指向应用的左上角。

[原文]
A standalone Textual probe reproduced the coordinate collapse. Herdr forwarded
mouse events, and the pane size reported by `stty` remained correct, ruling out
Tau widget dispatch and PTY sizing.

[译文]
一个独立的 Textual 探针复现了坐标塌缩。Herdr 确实转发了鼠标事件,而 `stty` 报告的面板尺寸仍然正确,从而排除了 Tau 组件分发与 PTY 尺寸问题。

## 原因(Cause)

[原文]
Textual's in-band resize negotiation enables SGR pixel mouse mode. Affected
Herdr versions report that mode as enabled but can forward cell coordinates
unless the pane has graphics demand. Textual correctly interprets the negotiated
input as pixels and converts it to cells a second time.

[译文]
Textual 的带内(in-band)尺寸协商会启用 SGR 像素鼠标模式。受影响的 Herdr 版本会报告该模式已启用,但除非面板有图形需求,否则可能转发的是单元格坐标。Textual 按照协商结果正确地把它解释为像素,于是又转换了一次单元格。

[原文]
Opening and closing any affected Textual app can mask the problem for a later
run because its terminal-mode cleanup changes the negotiation state. This is why
Toad appeared to repair Tau despite having no custom outer-terminal mouse setup.

[译文]
打开并关闭任意受影响的 Textual 应用,都可能掩盖后续运行中的问题,因为它的终端模式清理改变了协商状态。这就是为什么 Toad 看起来「修好」了 Tau,尽管它并没有自定义的外层终端鼠标配置。

## Tau 的绕行方案(Tau workaround)

[原文]
Before starting the TUI under `HERDR_ENV=1`, Tau defaults
`TEXTUAL_SMOOTH_SCROLL` to `0` and updates Textual's loaded setting. In Textual
8.2.8 this disables the in-band resize/pixel-mouse path, retaining SIGWINCH-based
resizing and cell-coordinate mouse events. Tau does not need sub-cell pointer
precision.

[译文]
在 `HERDR_ENV=1` 下启动 TUI 之前,Tau 会把 `TEXTUAL_SMOOTH_SCROLL` 默认设为 `0`,并更新 Textual 已加载的设置。在 Textual 8.2.8 中,这会禁用带内尺寸/像素鼠标路径,保留基于 SIGWINCH 的尺寸调整与单元格坐标鼠标事件。Tau 不需要亚单元格的指针精度。

[原文]
The workaround:

[译文]
该绕行方案:

[原文]
- applies only inside Herdr;
- preserves an explicit `TEXTUAL_SMOOTH_SCROLL` value;
- leaves print mode and the reusable `tau_agent` harness unchanged;
- remains compatible with a future Herdr fix because cell mouse input is still
  valid.

[译文]
- 只在 Herdr 内生效;
- 保留显式设置的 `TEXTUAL_SMOOTH_SCROLL` 值;
- 不改变 print 模式与可复用的 `tau_agent` harness;
- 由于单元格鼠标输入仍然有效,它与未来的 Herdr 修复保持兼容。

## 验证(Validation)

[原文]
Automated tests cover the Herdr default, explicit user override, and non-Herdr
behavior. Manual validation uses a fresh Herdr 0.9.0 pane: start Tau once, then
verify prompt focus, transcript scrolling, text selection, link hover/click, and
mouse movement without first priming the pane with another Textual application.

[译文]
自动化测试覆盖 Herdr 下的默认行为、用户的显式覆盖以及非 Herdr 行为。手动验证使用一个全新的 Herdr 0.9.0 面板:启动一次 Tau,然后在没有先用其他 Textual 应用「预热」该面板的情况下,验证提示输入焦点、会话记录滚动、文本选择、链接悬停/点击与鼠标移动。
