# 启动时的更新检查 / Startup update check

[原文]
Tau now performs a small, best-effort update check in CLI startup paths that launch the product experience: the Textual TUI and text print mode.

[译文]
Tau 现在会在启动产品体验的 CLI 路径中执行一次小巧、尽力而为的更新检查:即 Textual TUI 与文本 print 模式。

## 新增了什么(What was added)

[原文]
- `tau_coding.update_check` fetches PyPI metadata for the published package (`tau-ai`).
- Versions are compared with `packaging.version.Version` so PEP 440 releases sort correctly.
- The result is cached under `~/.tau/cache/update-check.json` and refreshed at most once per day.
- Failures are quiet no-ops: network errors, malformed JSON, missing fields, and invalid versions do not stop startup.
- `TAU_NO_UPDATE_CHECK=1` disables the check, and the check is skipped automatically when `CI` is set.
- `tau update` upgrades `tau-ai` with the package manager that owns the active Tau environment.

[译文]
- `tau_coding.update_check` 会抓取已发布包(`tau-ai`)的 PyPI 元数据。
- 版本使用 `packaging.version.Version` 比较,因此 PEP 440 版本的排序是正确的。
- 结果缓存在 `~/.tau/cache/update-check.json`,最多每天刷新一次。
- 失败是静默的无操作:网络错误、畸形 JSON、缺失字段与非法版本都不会中断启动。
- `TAU_NO_UPDATE_CHECK=1` 可禁用该检查,设置 `CI` 时会自动跳过。
- `tau update` 用「拥有当前 Tau 环境」的包管理器升级 `tau-ai`。

## 它属于哪里(Where it belongs)

[原文]
This lives in `tau_coding`, not `tau_agent`, because update notification is CLI application behavior. The reusable agent harness remains independent of PyPI, Rich/Textual UI concerns, and Tau's home-directory layout.

[译文]
它位于 `tau_coding` 而不是 `tau_agent`,因为更新通知属于 CLI 应用行为。可复用 agent harness 仍然独立于 PyPI、Rich/Textual UI 关注点以及 Tau 的主目录布局。

## 输出策略(Output policy)

[原文]
- TUI startup renders the update notice as the first transcript item in fixed bright-yellow, bold styling, before release notes, provider errors, theme diagnostics, or session history.
- Print mode writes the notice to stderr for normal text output.
- Structured print output (`--mode json`) suppresses the notice to avoid corrupting scripted output.
- Utility commands (`tau --version`, `tau update`, `tau sessions`, `tau export`, `tau providers`, `tau setup`) do not run the update check.

[译文]
- TUI 启动时会把更新提示作为第一条会话记录条目渲染,采用固定的亮黄色加粗样式,并排在发布说明、provider 错误、主题诊断或会话历史之前。
- Print 模式在正常文本输出时把提示写到 stderr。
- 结构化 print 输出(`--mode json`)会抑制该提示,以免破坏脚本化输出。
- 工具类命令(`tau --version`、`tau update`、`tau sessions`、`tau export`、`tau providers`、`tau setup`)不运行更新检查。

## 更新命令(Update command)

[原文]
`tau update` inspects the active environment before running anything:

[译文]
`tau update` 在运行任何东西之前先检查当前环境:

[原文]
- `uv-receipt.toml` means uv owns the tool. Tau fetches the latest stable PyPI
  version and runs `uv tool install tau-ai@<latest-version>`, explicitly replacing
  any version pin recorded when the tool was installed. On Windows, Tau hands
  this command to a detached PowerShell process. The helper waits for the
  original Tau PID to exit before invoking uv, preventing Windows from partially
  replacing the still-running tool environment. Tau reports that the update was
  scheduled—not completed—and gives the path to a log containing the eventual
  command output and exit code. The helper treats process inspection or waiting
  errors as fatal: uv never starts unless the original Tau process is confirmed
  absent or its observed process object exits. The update executable and a
  Microsoft-runtime-quoted argument line are staged as base64-encoded JSON. The
  helper launches them with non-shell `ProcessStartInfo`, preserving spaces,
  metacharacters, embedded quotes, empty arguments, and trailing backslashes on
  Windows PowerShell 5.1 and PowerShell 7 without interpolated shell execution.
- `pipx_metadata.json` means pipx owns it, so Tau runs `pipx upgrade tau-ai`.
- The distribution's standard `INSTALLER` metadata identifies ordinary uv and pip installs. Tau runs either `uv pip install --python <current-python> --upgrade tau-ai` or `<current-python> -m pip install --upgrade tau-ai`, targeting the environment that is running Tau.

[译文]
- 存在 `uv-receipt.toml` 意味着该工具由 uv 管理。Tau 会抓取 PyPI 上最新的稳定版本,并运行 `uv tool install tau-ai@<latest-version>`,显式替换安装该工具时记录的版本锁定。在 Windows 上,Tau 会把这条命令交给一个分离的 PowerShell 进程。该辅助进程会等待原 Tau PID 退出后再调用 uv,防止 Windows 在工具环境仍在使用时对它做部分替换。Tau 报告的是「更新已排程」—— 而不是已完成 —— 并给出一个日志路径,其中包含最终的命令输出与退出码。辅助进程把「进程检查或等待出错」视为致命错误:除非确认原 Tau 进程已不存在、或它观察到的进程对象已退出,uv 绝不启动。更新可执行文件与一行经 Microsoft 运行时引号规则处理的参数会被暂存为 base64 编码的 JSON。辅助进程用非 shell 的 `ProcessStartInfo` 启动它们,在 Windows PowerShell 5.1 与 PowerShell 7 上都能保留空格、元字符、内嵌引号、空参数与结尾反斜杠,而不做插值式 shell 执行。
- 存在 `pipx_metadata.json` 意味着它由 pipx 管理,因此 Tau 运行 `pipx upgrade tau-ai`。
- 发行版标准的 `INSTALLER` 元数据用于识别普通的 uv 与 pip 安装。Tau 会运行 `uv pip install --python <current-python> --upgrade tau-ai` 或 `<current-python> -m pip install --upgrade tau-ai`,目标正是当前运行 Tau 的那个环境。

[原文]
Tau does not fall through to another installer when the selected command fails. Direct-URL and editable installs are sent back to their original source; Conda/Pixi-managed and unrecognized environments get manual instructions rather than being modified with pip. Editable checkout installs can be refreshed with `uv tool install --editable --force .`.

[译文]
当所选命令失败时,Tau 不会退回到另一个安装器。直接 URL 安装与可编辑安装会被引导回它们最初的来源;Conda/Pixi 管理以及无法识别的环境会得到手动操作说明,而不是被 pip 修改。可编辑的检出安装可以用 `uv tool install --editable --force .` 刷新。

## 测试(Testing)

[原文]
Run:

[译文]
运行:

```bash
uv run pytest tests/test_updater.py tests/test_update_check.py tests/test_cli.py tests/test_tui_app.py
```

[原文]
`tests/test_updater.py` also contains Windows-and-PowerShell-only integration
coverage. On Windows it launches the generated helper against a live fake parent
and fake updater, checking blocking, exact executable and argument delivery,
exit-code logging, and fail-closed wait errors without installing uv or replacing
Tau. Every installed supported engine (`powershell.exe` and `pwsh.exe`) is tested;
individual unavailable engines are omitted, and the runtime tests skip only when
Windows has neither. Cross-platform tests cover the Windows quoting algorithm,
encoded payload, script generation, detached launch options, staging failures,
and cleanup. Current Ubuntu CI cannot execute the Windows runtime cases.

[译文]
`tests/test_updater.py` 还包含仅限 Windows 与 PowerShell 的集成覆盖。在 Windows 上,它会针对一个真实的假父进程与假更新器启动生成的辅助脚本,检查阻塞、可执行文件与参数的精确投递、退出码日志,以及「失败关闭」的等待错误,而不安装 uv 或替换 Tau。每个已安装的受支持引擎(`powershell.exe` 与 `pwsh.exe`)都会被测试;个别不可用的引擎会被跳过,而运行时测试只有在 Windows 上两者都没有时才会跳过。跨平台测试覆盖 Windows 引号算法、编码载荷、脚本生成、分离启动选项、暂存失败与清理。当前的 Ubuntu CI 无法执行 Windows 运行时用例。
