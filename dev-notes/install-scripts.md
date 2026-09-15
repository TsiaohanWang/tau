# Tau 安装脚本 / Tau install scripts

[原文]
Tau's website now serves small bootstrap installers for macOS/Linux and Windows:

[译文]
Tau 的网站现在为 macOS/Linux 与 Windows 提供小巧的引导安装脚本:

```text
website/static/install.sh
website/static/install.ps1
```

[原文]
They remove the requirement that a new user already knows about or has `uv`.
Each script looks for `uv`, announces and runs Astral's official installer when
it is missing, installs `tau-ai` as an isolated uv tool, verifies the installed
command, and explains when a shell restart may be needed. Neither script uses
administrator privileges.

[译文]
它们免除了「新用户必须已经了解或安装 `uv`」这一要求。每个脚本都会查找 `uv`;若缺失,则先声明并运行 Astral 的官方安装器,再把 `tau-ai` 安装为一个隔离的 uv 工具,验证安装后的命令,并说明何时可能需要重启 shell。两个脚本都不使用管理员权限。

[原文]
The scripts intentionally remain thin wrappers around `uv tool install tau-ai`.
Tau does not gain a second environment manager, and experienced users can still
use uv, pipx, or pip directly. Both scripts are published as readable static
files so users can inspect them before execution.

[译文]
这些脚本有意保持为 `uv tool install tau-ai` 的薄封装。Tau 不会多出第二套环境管理器,有经验的用户仍可直接使用 uv、pipx 或 pip。两个脚本都以可读的静态文件形式发布,便于用户在运行之前检查。

## 验证(Validation)

[原文]
Run the POSIX script syntax check and website build:

[译文]
运行 POSIX 脚本语法检查与网站构建:

```text
sh -n website/static/install.sh
hugo --source website --minify
```

[原文]
The normal Python test, lint, format, type-check, and package-build commands are
also expected to remain green.

[译文]
常规的 Python 测试、lint、格式、类型检查与包构建命令也应保持通过。
