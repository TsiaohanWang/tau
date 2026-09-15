---
title: "Phase 6: Non-interactive Print-mode CLI / 阶段 6:非交互式 Print 模式 CLI"
---

[原文]
Phase 6 wired Tau's provider layer, agent harness, and built-in coding tools into
a usable non-interactive CLI. Later phases moved print mode onto the
`CodingSession` wrapper so it shares the same coding-agent environment as the
TUI.

[译文]
阶段 6 把 Tau 的 provider 层、agent harness 与内置编码工具接通成一个可用的非交互式 CLI。后续阶段把 print 模式迁移到了 `CodingSession` 包装层上,使它和 TUI 共享同一个编码 agent 环境。

[原文]
The CLI entry point lives in:

[译文]
CLI 入口位于:

```text
src/tau_coding/cli.py
```

## 新增了什么(What was added)

[原文]
The `tau` command can run a single prompt in print mode with `-p`/`--prompt`:

[译文]
`tau` 命令可以用 `-p`/`--prompt` 以 print 模式运行单条提示:

```bash
tau -p "write tests for main.py"
tau --prompt "explain this repo"
tau --model gpt-5.5 -p "summarize README.md"
```

[原文]
Without `-p`/`--prompt`, Tau starts the interactive TUI. A positional prompt is
treated as the initial TUI prompt:

[译文]
不带 `-p`/`--prompt` 时,Tau 启动交互式 TUI。位置参数形式的提示会被当作 TUI 的初始提示:

```bash
tau
tau "explain this repo"
```

[原文]
The original Phase 6 command:

1. loads OpenAI-compatible provider settings from the environment
2. creates Tau's built-in coding tools
3. builds a minimal default system prompt
4. creates an `AgentHarness`
5. streams assistant text to stdout
6. prints tool execution summaries to stderr

[译文]
最初的 Phase 6 命令会:

1. 从环境变量加载 OpenAI 兼容的 provider 设置
2. 创建 Tau 的内置编码工具
3. 构建一个最小的默认系统提示词
4. 创建一个 `AgentHarness`
5. 把 assistant 文本流式输出到 stdout
6. 把工具执行摘要打印到 stderr

## Provider 配置(Provider configuration)

[原文]
Print mode uses Tau's configured provider settings.

[译文]
Print 模式使用 Tau 已配置的 provider 设置。

[原文]
If no provider login has been saved, the default OpenAI-compatible provider
expects:

[译文]
如果尚未保存任何 provider 登录信息,默认的 OpenAI 兼容 provider 需要:

```bash
export OPENAI_API_KEY="..."
```

[原文]
Optional environment:

[译文]
可选环境变量:

```bash
export OPENAI_BASE_URL="https://api.openai.com/v1"
```

[原文]
The default model is currently:

[译文]
当前默认模型是:

```text
gpt-5.5
```

[原文]
Use `--model` to choose another model supported by the configured endpoint.

[译文]
使用 `--model` 可以选择已配置端点支持的其他模型。

## 工作目录(Working directory)

[原文]
Tools are rooted at the current working directory by default.

[译文]
工具默认以当前工作目录为根目录。

[原文]
Use `--cwd` to run tools somewhere else:

[译文]
使用 `--cwd` 可以让工具在别处运行:

```bash
tau --cwd /path/to/project -p "inspect the tests"
```

## 当前行为(Current behavior)

[原文]
Print mode now composes the higher-level `CodingSession` environment. A one-shot
run still remains non-interactive and script-friendly, but it now shares:

- full Tau system prompt assembly
- discovered project instructions
- loaded skills and prompt templates
- built-in coding tools
- append-only session persistence under `~/.tau/sessions/`
- the same provider/model resolution used by the TUI
- configured provider timeout and retry settings
- Rich-backed transcript rendering for tool activity

[译文]
Print 模式现在组合了更高层的 `CodingSession` 环境。一次性运行仍然保持非交互、适合脚本调用,但它现在共享:

- 完整的 Tau 系统提示词组装
- 发现到的项目指令
- 已加载的技能与提示词模板
- 内置编码工具
- `~/.tau/sessions/` 下的只追加会话持久化
- 与 TUI 相同的 provider/model 解析逻辑
- 已配置的 provider 超时与重试设置
- 由 Rich 支撑的工具活动会话记录渲染

[原文]
This keeps the user-facing command simple while reducing drift between print
mode and interactive mode.

[译文]
这让面向用户的命令保持简单,同时减少 print 模式与交互模式之间的行为漂移。

## 历史上的最小系统提示词(Historical minimal system prompt)

[原文]
Phase 6 originally built a small prompt containing:

- Tau's identity
- the list of available tools
- each tool's `prompt_snippet`
- each tool's `prompt_guidelines`

[译文]
Phase 6 最初构建的小提示词包含:

- Tau 的身份说明
- 可用工具列表
- 每个工具的 `prompt_snippet`
- 每个工具的 `prompt_guidelines`

[原文]
That was enough for the first CLI slice. The current implementation uses the
shared system prompt builder instead.

[译文]
这对最初的 CLI 切片已经足够。当前实现改用共享的系统提示词构建器。

## 边界(Boundary)

[原文]
The CLI lives in `tau_coding`. It depends on provider settings,
`CodingSession`, and renderers, but the reusable `tau_agent` package still has
no CLI, Rich, Textual, config-file, or session-storage dependency.

[译文]
CLI 位于 `tau_coding`。它依赖 provider 设置、`CodingSession` 与渲染器,但可复用的 `tau_agent` 包仍然不依赖 CLI、Rich、Textual、配置文件或会话存储。

## 测试(Tests)

[原文]
The phase is covered by `tests/test_cli.py`, including:

- `tau --version`
- default TUI launch when no print-mode prompt is provided
- positional prompts launching the TUI as initial prompts
- shared system prompt contents
- print-mode streaming with a fake provider
- print-mode session persistence
- print-mode skill expansion

[译文]
本阶段的测试覆盖为 `tests/test_cli.py`,包括:

- `tau --version`
- 未提供 print 模式提示时默认启动 TUI
- 位置参数提示作为初始提示启动 TUI
- 共享系统提示词的内容
- 使用假 provider 的 print 模式流式输出
- print 模式会话持久化
- print 模式技能展开

## 下一阶段(Next phase)

[原文]
The next roadmap phase is append-only session tree persistence.

[译文]
路线图上的下一阶段是只追加的会话树持久化。
