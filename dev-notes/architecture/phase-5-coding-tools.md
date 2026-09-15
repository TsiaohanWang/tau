---
title: "Phase 5: Built-in Coding Tools / 阶段 5:内置编码工具"
---

[原文]
Phase 5 adds Tau's first built-in coding tools in `tau_coding`.

[译文]
阶段 5 在 `tau_coding` 中加入了 Tau 最初的内置编码工具。

[原文]
The tools live in:

[译文]
工具位于:

```text
src/tau_coding/tools.py
```

## 新增了什么(What was added)

[原文]
Tau now provides factory functions for these initial tools:

- `create_read_tool()`
- `create_write_tool()`
- `create_edit_tool()`
- `create_bash_tool()`
- `create_coding_tools()` for the default tool set

[译文]
Tau 现在为这些初始工具提供工厂函数:

- `create_read_tool()`
- `create_write_tool()`
- `create_edit_tool()`
- `create_bash_tool()`
- `create_coding_tools()`,用于创建默认工具集

[原文]
Each factory has a Pi-like `ToolDefinition` counterpart with a description, prompt snippet, prompt guidelines, JSON schema, and executor. The public factory returns a provider-neutral `AgentTool` from `tau_agent.tools`.

[译文]
每个工厂函数都有一个类似 Pi 的 `ToolDefinition` 对应物,包含描述、提示词片段(prompt snippet)、提示词准则(prompt guidelines)、JSON schema 与执行器。公开的工厂函数返回一个来自 `tau_agent.tools` 的、provider 无关的 `AgentTool`。

## 为什么工具位于 `tau_coding`(Why the tools live in `tau_coding`)

[原文]
`tau_agent` owns the portable agent brain: messages, events, tools as an abstraction, the loop, and the harness.

[译文]
`tau_agent` 持有可移植的 agent 大脑:消息、事件、作为抽象的工具、循环与 harness。

[原文]
Filesystem and shell access are coding-agent environment features, so the concrete implementations live in `tau_coding`.

```text
tau_agent:
  knows how to execute an AgentTool

tau_coding:
  provides read/write/edit/bash tools for local coding work
```

[译文]
文件系统与 shell 访问属于编码 agent 环境的特性,因此具体实现位于 `tau_coding`。

```text
tau_agent:
  知道如何执行一个 AgentTool

tau_coding:
  为本地编码工作提供 read/write/edit/bash 工具
```

[原文]
This keeps the core loop reusable and independent of local machine behavior.

[译文]
这使核心循环保持可复用,并与本机行为解耦。

## 工具行为(Tool behavior)

### `read`

[原文]
Reads a UTF-8 text file.

[译文]
读取一个 UTF-8 文本文件。

[原文]
Arguments:

- `path`: file path
- `offset`: optional 1-indexed starting line; `0` is accepted as an alias for the start of the file
- `limit`: optional number of lines to return

[译文]
参数:

- `path`:文件路径
- `offset`:可选的起始行,从 1 开始计数;`0` 可作为「文件开头」的别名被接受
- `limit`:可选,返回的行数

[原文]
Large output is truncated with Pi-style truncation metadata and continuation hints. Supported image files (`jpg`, `png`, `gif`, `webp`) are detected and returned as base64 metadata for later UI/provider integration.

[译文]
大输出会按 Pi 风格截断,并附带截断元数据与续读提示。受支持的图片文件(`jpg`、`png`、`gif`、`webp`)会被识别,并以 base64 元数据形式返回,供后续 UI/provider 集成使用。

### `write`

[原文]
Writes a complete UTF-8 text file and creates parent directories when needed. Writes are serialized per path with a file mutation queue so concurrent mutations to the same file do not interleave.

[译文]
写入一个完整的 UTF-8 文本文件,并在需要时创建父目录。写入按路径通过一个文件修改队列串行化,因此针对同一文件的并发修改不会交错。

[原文]
Arguments:

- `path`: file path
- `content`: complete file content

[译文]
参数:

- `path`:文件路径
- `content`:完整文件内容

### `edit`

[原文]
Applies exact text replacements to a UTF-8 file.

[译文]
对单个 UTF-8 文件应用精确文本替换。

[原文]
Arguments:

- `path`: file path
- `edits`: array of `{ oldText, newText }` objects

[译文]
参数:

- `path`:文件路径
- `edits`:`{ oldText, newText }` 对象数组

[原文]
Important Pi-inspired behavior:

- every `oldText` must match exactly once
- edits must not overlap
- validation happens before writing
- if any edit fails, the file is left unchanged
- UTF-8 BOMs are preserved
- existing line endings are preserved
- results include diff, unified patch, and first-changed-line metadata
- legacy `oldText`/`newText` arguments and JSON-string `edits` are normalized

[译文]
受 Pi 启发的重要行为:

- 每个 `oldText` 必须恰好匹配一次
- 编辑之间不得重叠
- 写入之前先校验
- 任一编辑失败,文件保持原样
- 保留 UTF-8 BOM
- 保留既有换行符
- 结果包含 diff、unified patch 以及「首个变更行」元数据
- 兼容旧式 `oldText`/`newText` 参数,并归一化 JSON 字符串形式的 `edits`

### `bash`

[原文]
Executes a shell command in the configured working directory.

[译文]
在配置好的工作目录中执行 shell 命令。

[原文]
Arguments:

- `command`: command string
- `timeout`: optional timeout in seconds, with no default timeout

[译文]
参数:

- `command`:命令字符串
- `timeout`:可选超时(秒),没有默认超时

[原文]
The result includes combined stdout/stderr output, exit code, timeout state, duration, truncation metadata, and a full-output temp file path when output is truncated.

[译文]
结果包含合并后的 stdout/stderr 输出、退出码、超时状态、耗时、截断元数据;当输出被截断时,还包含完整输出的临时文件路径。

## 如何使用这些工具(How to use the tools)

```python
from tau_coding import create_coding_tools

tools = create_coding_tools(cwd="/path/to/project")
```

[原文]
Pass those tools into `AgentHarnessConfig` or directly into `run_agent_loop()`.

[译文]
把这些工具传入 `AgentHarnessConfig`,或直接传给 `run_agent_loop()`。

## 测试(Tests)

[原文]
The phase is covered by:

[译文]
本阶段的测试覆盖为:

```text
tests/test_coding_tools.py
```

[原文]
The tests verify:

- default tool registration
- file reading with line slicing
- parent directory creation for writes
- multi-edit exact replacement
- rollback on failed edits
- unique-match validation
- bash stdout capture
- bash timeout reporting

[译文]
测试验证:

- 默认工具注册
- 带行切片的文件读取
- 写入时创建父目录
- 多编辑精确替换
- 编辑失败时回滚
- 唯一匹配校验
- bash stdout 捕获
- bash 超时上报

## 下一阶段(Next phase)

[原文]
The next phase can wire these tools into a non-interactive print-mode CLI so a user can run Tau against a real project from the terminal.

[译文]
下一阶段把这些工具接入非交互式的 print 模式 CLI,让用户可以从终端对真实项目运行 Tau。
