# 启动时的发布说明 / Startup release notes

[原文]
Tau now stores structured release notes in `src/tau_coding/data/release-notes/releases.json`.

[译文]
Tau 现在把结构化的发布说明存放在 `src/tau_coding/data/release-notes/releases.json`。

[原文]
The same file is used by:

[译文]
同一个文件被以下三处使用:

[原文]
- the TUI startup notice shown after an upgrade
- the website release-notes page at `/releases/`
- package metadata tests that ensure the current package version has release notes

[译文]
- 升级后在 TUI 启动时展示的提示
- 网站 `/releases/` 下的发布说明页面
- 确保当前包版本拥有发布说明的包元数据测试

[原文]
Tau records the last installed version seen at startup in `~/.tau/cache/release-notes-state.json`.

[译文]
Tau 会把启动时看到的最后安装版本记录在 `~/.tau/cache/release-notes-state.json`。

[原文]
On the first run it only writes the current version. On later runs, if the installed version is newer than the recorded version, the TUI prepends a status-style transcript item with release highlights for versions between the old and new versions.

[译文]
首次运行时,它只写入当前版本。之后的运行中,如果已安装版本比记录的版本更新,TUI 会在会话记录最前面插入一条状态风格的条目,包含旧版本到新版本之间各版本的发布要点。

[原文]
This keeps the reusable agent harness unchanged: release-note detection lives in `tau_coding.update_check`, and the TUI consumes the resulting startup notice as display state.

[译文]
这使可复用的 agent harness 保持不变:发布说明检测位于 `tau_coding.update_check`,而 TUI 把由此产生的启动提示作为显示状态消费。

[原文]
Test with:

[译文]
测试方式:

```bash
uv run pytest tests/test_update_check.py tests/test_cli.py tests/test_tui_app.py
```
