---
title: "Phase 20: Installation and Configuration Docs / 阶段 20:安装与配置文档"
---

[原文]
This phase starts Tau's packaging and installation polish.

[译文]
本阶段启动了 Tau 的打包与安装体验打磨。

[原文]
The project already exposes the user-facing console command through:

[译文]
项目已经通过以下配置暴露面向用户的控制台命令:

```toml
[project.scripts]
tau = "tau_coding.cli:app"
```

[原文]
This slice documents how to install and operate that command as a normal tool.

[译文]
本切片记录了如何把这个命令作为常规工具来安装与使用。

## 新增了什么(What was added)

[原文]
New user-facing docs:

[译文]
新增的面向用户文档:

```text
docs/installation.md
docs/configuration.md
```

[原文]
Updated docs:

[译文]
更新的文档:

```text
README.md
docs/getting-started.md
docs/index.md
docs/providers.md
mkdocs.yml
```

## 覆盖的工作流(Covered Workflows)

[原文]
The docs now cover:

- installing Tau with `uv tool install`
- installing Tau with `pipx`
- verifying the installed `tau` command
- first-run provider setup
- opening the TUI with `tau`
- running one prompt in print mode
- provider config under `~/.tau/providers.json`
- session storage under `~/.tau/sessions`
- skills and prompt template locations
- project context file discovery
- currently disabled shell completion

[译文]
文档现在覆盖:

- 用 `uv tool install` 安装 Tau
- 用 `pipx` 安装 Tau
- 验证安装后的 `tau` 命令
- 首次运行时的 provider setup
- 用 `tau` 打开 TUI
- 在 print 模式下运行单条提示
- `~/.tau/providers.json` 下的 provider 配置
- `~/.tau/sessions` 下的会话存储
- 技能与提示词模板位置
- 项目上下文文件发现
- 当前已禁用的 shell 补全

## 边界(Boundary)

[原文]
This phase does not change `tau_agent` or provider/runtime behavior. It makes
the current user-facing application install and configuration paths explicit.

[译文]
本阶段不改变 `tau_agent` 或 provider/运行时行为。它只是把当前面向用户的应用安装与配置路径明确写成文档。

## 测试(Tests)

[原文]
The docs slice is verified by:

[译文]
本文档切片的验证方式为:

```text
uv run tau --version
uv build
uv run --group docs mkdocs build --strict
```
