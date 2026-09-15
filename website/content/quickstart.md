---
title: "Quickstart / 快速上手"
description: "Install Tau, connect a model, and run your first coding session. / 安装 Tau、接入模型,并跑完你的第一个编码会话。"
type: doc
---

[原文]
This page takes you from nothing to your first Tau session. It should take a few
minutes.

[译文]
本页带你从零走到第一个 Tau 会话,大概只需要几分钟。

## 1. 安装 Tau / 1. Install Tau

[原文]
Tau is a Python tool requiring Python 3.12 or newer. Its installer uses
[`uv`](https://docs.astral.sh/uv/) to create an isolated environment and installs
`uv` first when it is not already available.

[译文]
Tau 是一个需要 Python 3.12 或更新版本的 Python 工具。它的安装脚本使用 [`uv`](https://docs.astral.sh/uv/) 创建隔离环境;如果 `uv` 尚不存在,会先安装它。

[原文]
On macOS or Linux, run:

[译文]
在 macOS 或 Linux 上运行:

```bash
curl -LsSf https://twotimespi.dev/install.sh | sh
```

[原文]
On Windows, run in PowerShell:

[译文]
在 Windows 上,于 PowerShell 中运行:

```powershell
irm https://twotimespi.dev/install.ps1 | iex
```

[原文]
The installer announces before installing `uv`, never uses `sudo`, verifies the
installed `tau` command, and tells you if you need to restart your shell for a
`PATH` update. To review code before executing it, download and inspect
[`install.sh`](/install.sh) or [`install.ps1`](/install.ps1) first.

[译文]
该安装脚本会在安装 `uv` 之前先明确告知,绝不使用 `sudo`,会验证安装后的 `tau` 命令,并告诉你是否因为 `PATH` 更新而需要重启 shell。若想在执行前先审查代码,可先下载并检查 [`install.sh`](/install.sh) 或 [`install.ps1`](/install.ps1)。

[原文]
Check it worked:

[译文]
确认安装成功:

```bash
tau --version
```

[原文]
{{% tip title="Already have a package manager?" %}}
Install Tau directly with `uv tool install tau-ai`, `pipx install tau-ai`, or
`python -m pip install tau-ai`.
{{% /tip %}}

[译文]
{{% tip title="已经有包管理器了?" %}}
可以直接用 `uv tool install tau-ai`、`pipx install tau-ai` 或 `python -m pip install tau-ai` 安装 Tau。
{{% /tip %}}

### 升级 Tau(Upgrade Tau)

[原文]
For a normal install, let Tau detect and reuse the installer that owns its environment:

[译文]
对于常规安装,让 Tau 自己检测并复用「拥有其环境」的那个安装器:

```bash
tau update
```

[原文]
Tau reuses uv or pipx when their environment receipt is present. For uv tools,
it installs the latest stable version explicitly so an older version pin cannot
block the update. For ordinary Python installs, standard package metadata tells
Tau whether to use uv or pip, and Tau targets the exact Python environment
running it. It stops instead of
switching installers for editable, direct-URL, Conda/Pixi, or unrecognized
installations.

[译文]
当 uv 或 pipx 的环境凭据(receipt)存在时,Tau 会复用它们。对 uv 工具,Tau 会显式安装最新稳定版,使较旧的版本锁定无法阻止更新。对普通的 Python 安装,标准包元数据会告诉 Tau 该用 uv 还是 pip,并且 Tau 会精确指向正在运行它的那个 Python 环境。对于可编辑安装、直接 URL 安装、Conda/Pixi 以及无法识别的安装,Tau 会停下,而不是切换到另一个安装器。

[原文]
If you installed a local checkout with `uv tool install --editable .`, run the
install command again after pulling changes:

[译文]
如果你用 `uv tool install --editable .` 安装了本地检出,那么在拉取更新之后要再运行一次安装命令:

```bash
uv tool install --editable --force .
```

[原文]
Editable installs expose source changes immediately, but installed package
metadata (including the version), dependencies, and entry points are refreshed
only when uv reinstalls the tool.

[译文]
可编辑安装会立即暴露源码改动,但已安装的包元数据(包括版本)、依赖与入口点,只有在 uv 重新安装该工具时才会刷新。

## 2. 接入模型 / 2. Connect a model

[原文]
Tau needs an AI model to talk to. A **provider** is the service that hosts the
model (OpenAI, Anthropic, …). Start Tau and use `/login` to connect one:

[译文]
Tau 需要一个可对话的 AI 模型。**provider** 是托管该模型的服务(OpenAI、Anthropic……)。启动 Tau,用 `/login` 接入一个:

```bash
tau
```

[原文]
Then run one of these inside Tau:

```text
/login              # choose a provider
/login openai       # save an OpenAI API key
/login openai-codex # authenticate a Codex/ChatGPT subscription
```

[译文]
然后在 Tau 内运行以下命令之一:

```text
/login              # 选择 provider
/login openai       # 保存 OpenAI API key
/login openai-codex # 认证 Codex/ChatGPT 订阅
```

[原文]
Tau ships with built-in entries for OpenAI, Anthropic, OpenAI Codex,
OpenRouter, and Hugging Face. See [Providers & models]({{< relref "./guides/providers-and-models.md" >}})
for switching models or adding a custom/local OpenAI-compatible endpoint.

[译文]
Tau 随包内置了 OpenAI、Anthropic、OpenAI Codex、OpenRouter 与 Hugging Face 的条目。切换模型或添加自定义/本地 OpenAI 兼容端点,见 [Provider 与模型]({{< relref "./guides/providers-and-models.md" >}})。

## 3. 开始一个会话 / 3. Start a session

[原文]
Run Tau from inside the project you want to work on:

[译文]
在你想要处理的项目目录内运行 Tau:

```bash
cd my-project
tau
```

[原文]
This opens the interactive terminal UI. Type a request and press **Enter**:

[译文]
这会打开交互式终端 UI。输入一条请求,按 **Enter**:

```text
explain what this project does
```

[原文]
Tau streams its response, and when it needs to, it reads files and runs commands
to answer you. Try something that changes code:

[译文]
Tau 会流式给出回答;需要时它会读文件、跑命令来回答你。试试让它改代码:

```text
add a docstring to every function in src/utils.py
```

[原文]
You'll see each tool call (read, edit, bash) as it happens.

[译文]
你会看到每一次工具调用(read、edit、bash)实时发生。

[原文]
{{% tip title="Useful first keys" %}}
**Enter** submits · **Esc** cancels the current run · **Ctrl+K** opens the
command palette · **Ctrl+D** quits. Full list in
[Keyboard shortcuts]({{< relref "./reference/keybindings.md" >}}).
{{% /tip %}}

[译文]
{{% tip title="几个值得先记住的按键" %}}
**Enter** 提交 · **Esc** 取消当前运行 · **Ctrl+K** 打开命令面板 · **Ctrl+D** 退出。完整列表见
[键盘快捷键]({{< relref "./reference/keybindings.md" >}})。
{{% /tip %}}

## 4. 之后再回来 / 4. Come back later

[原文]
Tau saves every session. List them:

[译文]
Tau 会保存每一个会话。列出它们:

```bash
tau sessions
```

[原文]
Resume the most recent one for this directory, or pick from a list:

[译文]
恢复本目录最近的会话,或从列表中挑选:

```bash
tau --session <session-id>
```

[原文]
…or open the picker inside the TUI with `/resume`. See
[Sessions]({{< relref "./guides/sessions.md" >}}) for resuming, branching, and exporting.

[译文]
……或者在 TUI 内用 `/resume` 打开选择器。恢复、分支与导出的详情见[会话]({{< relref "./guides/sessions.md" >}})。

## 一次性模式(One-shot mode)

[原文]
Don't need the UI? Run a single prompt and get the result on stdout — handy for
scripts and pipes:

[译文]
不需要 UI?运行单条提示并把结果输出到 stdout —— 很适合脚本与管道:

```bash
tau -p "summarize the changes in the last commit"
```

[原文]
More in [Print mode & scripting]({{< relref "./guides/print-mode.md" >}}).

[译文]
更多内容见 [Print 模式与脚本化]({{< relref "./guides/print-mode.md" >}})。

## 接下来去哪里(Where to go next)

[原文]
- **[Core concepts]({{< relref "./concepts.md" >}})** — understand what's actually happening.
- **[The interactive session]({{< relref "./guides/tui.md" >}})** — get fluent in the TUI.
- **[Providers & models]({{< relref "./guides/providers-and-models.md" >}})** — switch models,
  add providers, use local models.

[译文]
- **[核心概念]({{< relref "./concepts.md" >}})** —— 理解实际发生了什么。
- **[交互式会话]({{< relref "./guides/tui.md" >}})** —— 熟练使用 TUI。
- **[Provider 与模型]({{< relref "./guides/providers-and-models.md" >}})** —— 切换模型、添加 provider、使用本地模型。
