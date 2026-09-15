---
title: "Extension installer / 扩展安装器"
---

# 扩展安装器 / Extension installer

[原文]
Tau now has a small `tau install <source>` command for making an extension
available on future runs. It intentionally implements the useful first slice of
Pi's package installer without introducing a settings/package-management system.

[译文]
Tau 现在有一条小巧的 `tau install <source>` 命令,用于让某个扩展在未来的运行中可用。它有意只实现 Pi 包安装器中真正有用的第一小片,而不引入设置/包管理系统。

## 新增了什么(What was added)

[原文]
The command accepts:

[译文]
该命令接受:

```text
tau install ./extension.py
tau install ./extension-directory
tau install git:github.com/owner/repository
tau install git:github.com/owner/repository@ref
tau install https://github.com/owner/repository.git
```

[原文]
Local sources are copied and Git sources are cloned into
`~/.tau/extensions/`. Existing destinations are preserved unless the caller
passes `--force`.

[译文]
本地来源会被复制,Git 来源会被克隆到 `~/.tau/extensions/`。除非调用方传入 `--force`,否则已存在的目标会被保留。

## 为什么是这个形态(Why this shape)

[原文]
Before this change, users had to know Tau's resource directory and manually
copy or clone into it, or repeat `tau -e PATH` on every run. Pi solves that
problem with `pi install`. Tau now mirrors that command's source-oriented UX and
Pi-style `git:` spelling while reusing Tau's existing extension discovery.

[译文]
在这次变更之前,用户必须知道 Tau 的资源目录并手动复制或克隆进去,或者在每次运行时重复 `tau -e PATH`。Pi 用 `pi install` 解决了这个问题。Tau 现在镜像该命令「以来源为中心」的交互方式与 Pi 风格的 `git:` 写法,同时复用 Tau 既有的扩展发现机制。

[原文]
The first version is deliberately narrower than Pi's package manager:

[译文]
第一版有意比 Pi 的包管理器更窄:

[原文]
- it installs extensions only, not skills, prompts, or themes;
- it supports local paths and Git, not npm/PyPI packages;
- it does not install Python dependencies;
- it has no package registry, remove command, or update command.

[译文]
- 只安装扩展,不安装技能、提示词或主题;
- 支持本地路径与 Git,不支持 npm/PyPI 包;
- 不安装 Python 依赖;
- 没有包注册表、移除命令或更新命令。

[原文]
This keeps package policy in `tau_coding` and avoids changing the portable
`tau_agent` harness.

[译文]
这使包管理策略留在 `tau_coding`,并避免改动可移植的 `tau_agent` harness。

## 安装流程(Installation flow)

[原文]
```text
source argument
      ↓
resolve local path or normalize Git source/ref
      ↓
copy or clone into a temporary root/extensions/<name> layout
      ↓
validate that normal user-directory discovery can see it
      ↓
atomically rename into ~/.tau/extensions
      ↓
load through the existing runtime on the next Tau startup
```

[译文]
```text
source 参数
      ↓
解析本地路径,或归一化 Git 来源/ref
      ↓
复制或克隆到一个临时的 root/extensions/<name> 布局
      ↓
校验常规的用户目录发现能否看到它
      ↓
原子重命名进 ~/.tau/extensions
      ↓
在下次 Tau 启动时通过既有运行时加载
```

[原文]
Validation does not import or execute extension code. A single local file must
end in `.py`. A directory must contain `extension.py` or declare entries in
`[tool.tau].extensions`; a loose directory of Python files is rejected because
`-e` could discover it but user-directory discovery would not.

[译文]
校验不会导入或执行扩展代码。单个本地文件必须以 `.py` 结尾。目录必须包含 `extension.py`,或在 `[tool.tau].extensions` 中声明条目;一个松散存放 Python 文件的目录会被拒绝,因为 `-e` 能发现它,而用户目录发现不能。

[原文]
Staging happens inside the destination directory so publication is a
same-filesystem rename. The temporary tree reproduces the exact
`root/extensions/<name>` discovery layout, preventing nested-only packages from
passing explicit-path validation and then disappearing after installation.
Failed copies, clones, checkouts, validation, and filesystem operations remove
their staging artifacts and surface as `ExtensionInstallError`. Forced
replacement keeps the previous destination as a temporary backup and restores
it if publication fails.

[译文]
暂存发生在目标目录内部,因此发布只是一次同文件系统的重命名。临时目录树会复现精确的 `root/extensions/<name>` 发现布局,防止「只能通过嵌套路径工作」的包通过显式路径校验、却在安装后消失。失败的复制、克隆、检出、校验与文件系统操作都会清理其暂存产物,并以 `ExtensionInstallError` 暴露出来。强制替换会把先前的目标保留为临时备份,并在发布失败时恢复它。

## 安全边界(Security boundary)

[原文]
Installation is not sandboxing. The command prints a warning, but the user is
responsible for reviewing the source. Installed modules execute in the Tau
process with the user's filesystem, network, credentials, and process access.

[译文]
安装不是沙箱。该命令会打印警告,但审查来源是用户的责任。已安装的模块会在 Tau 进程中执行,拥有用户的文件系统、网络、凭据与进程访问权限。

## 主要文件(Main files)

[原文]
| File | Responsibility |
| --- | --- |
| `src/tau_coding/extension_installer.py` | Source parsing, staging, validation, and publication |
| `src/tau_coding/cli.py` | `tau install` command dispatch and user-facing output |
| `src/tau_coding/paths.py` | Canonical user extension directory |
| `tests/test_extension_installer.py` | Local/Git installs, validation, replacement, cleanup |
| `tests/test_cli.py` | CLI dispatch and errors |

[译文]
| 文件 | 职责 |
| --- | --- |
| `src/tau_coding/extension_installer.py` | 来源解析、暂存、校验与发布 |
| `src/tau_coding/cli.py` | `tau install` 命令分派与面向用户的输出 |
| `src/tau_coding/paths.py` | 规范化的用户扩展目录 |
| `tests/test_extension_installer.py` | 本地/Git 安装、校验、替换、清理 |
| `tests/test_cli.py` | CLI 分派与错误 |

## 验证(Verification)

[原文]
Run:

[译文]
运行:

```bash
uv run pytest tests/test_extension_installer.py tests/test_cli.py
uv run pytest
uv run ruff check .
uv run ruff format --check .
uv run mypy
```
