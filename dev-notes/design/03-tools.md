---
title: "03 — Tools / 03 —— 工具"
---

[原文]
Tools let the assistant inspect and modify the user's environment through structured calls.

[译文]
工具(tool)让 assistant 通过结构化调用检查并修改用户的环境。

[原文]
This page is the user-facing source of truth for built-in tool behavior. The
Python factory functions also have docstrings for contributors, but generated
API reference docs are intentionally deferred; see
[ADR 0002](./adr/0002-keep-tool-docs-hand-written.md).

[译文]
本页是内置工具行为的、面向用户的事实来源。Python 工厂函数也为贡献者提供了 docstring,但自动生成的 API 参考文档被有意推迟;见 [ADR 0002](./adr/0002-keep-tool-docs-hand-written.md)。

[原文]
Tau separates the idea of a tool from any specific frontend:

- `tau_agent` defines provider-neutral tool types and executes requested tool calls.
- `tau_coding` provides concrete local coding tools for files and shell commands.
- CLIs, TUIs, and other frontends decide which tools to expose to a session.

[译文]
Tau 把「工具」这个概念与任何具体前端解耦:

- `tau_agent` 定义与 provider 无关的工具类型,并执行被请求的工具调用。
- `tau_coding` 提供面向文件和 shell 命令的具体本地编码工具。
- CLI、TUI 以及其他前端决定向一个会话暴露哪些工具。

## 核心模型(Core model)

[原文]
An `AgentTool` has:

- a `name`, such as `read` or `bash`
- a human-readable `description`
- an `input_schema` describing accepted JSON arguments
- an async `executor`
- optional prompt metadata used by clients that assemble tool guidance

[译文]
一个 `AgentTool` 包含:

- `name`,例如 `read` 或 `bash`
- 人类可读的 `description`
- 描述可接受 JSON 参数的 `input_schema`
- 一个异步 `executor`
- 可选的提示词元数据,供组装工具指引的客户端使用

[原文]
A tool returns an `AgentToolResult` with:

- `ok`: whether the tool completed successfully
- `content`: text that can be sent back to the model
- optional `data`: structured metadata for UIs, logs, or future integrations
- optional `error`: a machine-readable or user-readable error message

[译文]
工具返回的 `AgentToolResult` 包含:

- `ok`:工具是否成功完成
- `content`:可以回传给模型的文本
- 可选的 `data`:供 UI、日志或未来集成使用的结构化元数据
- 可选的 `error`:机器可读或人可读的错误信息

[原文]
The agent loop executes tool calls and converts results into `ToolResultMessage` entries in the transcript.

[译文]
Agent 循环执行工具调用,并把结果转换成会话记录中的 `ToolResultMessage` 条目。

## 内置编码工具(Built-in coding tools)

[原文]
`tau_coding` provides four built-in local coding tools:

- `read`
- `write`
- `edit`
- `bash`

[译文]
`tau_coding` 提供四个内置本地编码工具:

- `read`
- `write`
- `edit`
- `bash`

[原文]
Use `create_coding_tools()` to register all of them:

[译文]
使用 `create_coding_tools()` 一次注册全部工具:

```python
from tau_coding import create_coding_tools

tools = create_coding_tools(cwd="/path/to/project")
```

[原文]
Or create individual tools:

[译文]
也可以单独创建工具:

```python
from tau_coding import (
    create_bash_tool,
    create_edit_tool,
    create_read_tool,
    create_write_tool,
)
```

[原文]
Relative paths passed to the tools are resolved against `cwd`. If `cwd` is omitted, Tau uses the process current working directory at the time the factory is called.

[译文]
传给工具的相对路径会基于 `cwd` 解析。如果省略 `cwd`,Tau 使用调用工厂函数时进程的当前工作目录。

## `read`

[原文]
Reads a file from disk.

[译文]
从磁盘读取文件。

[原文]
Factory functions:

- `create_read_tool_definition()`
- `create_read_tool()`

[译文]
工厂函数:

- `create_read_tool_definition()`
- `create_read_tool()`

### 参数(Arguments)

```json
{
  "path": "README.md",
  "offset": 1,
  "limit": 40
}
```

[原文]
| Argument | Required | Type | Description |
| --- | --- | --- | --- |
| `path` | yes | string | File path to read. Relative paths are resolved against `cwd`. |
| `offset` | no | integer | 1-indexed line number to start reading from. `0` is accepted as an alias for the start of the file. |
| `limit` | no | integer | Maximum number of lines to return. |

[译文]
| 参数 | 必填 | 类型 | 说明 |
| --- | --- | --- | --- |
| `path` | 是 | string | 要读取的文件路径。相对路径基于 `cwd` 解析。 |
| `offset` | 否 | integer | 起始行号,从 1 开始计数。`0` 可作为「文件开头」的别名被接受。 |
| `limit` | 否 | integer | 最多返回的行数。 |

[原文]
`offset` must be a non-negative integer when supplied. `limit` must be a positive integer.

[译文]
提供 `offset` 时必须是非负整数;`limit` 必须是正整数。

### 文本处理行为(Text behavior)

[原文]
For text files, `read`:

1. opens the file as UTF-8 text
2. applies `offset` and `limit` if provided
3. truncates large output to at most 2,000 lines or 50 KB, whichever limit is reached first
4. appends a continuation hint when more lines remain

[译文]
对文本文件,`read` 会:

1. 以 UTF-8 文本打开文件
2. 如果提供了 `offset` 和 `limit`,则据此切片
3. 把大输出截断到最多 2,000 行或 50 KB(以先达到的限制为准)
4. 当还有更多行时,追加一条续读提示

[原文]
Example continuation hint:

[译文]
续读提示示例:

```text
[42 more lines in file. Use offset=101 to continue.]
```

### 图片处理行为(Image behavior)

[原文]
Supported image files are detected by MIME type:

- JPEG
- PNG
- GIF
- WebP

[译文]
支持的图片文件按 MIME 类型识别:

- JPEG
- PNG
- GIF
- WebP

[原文]
For supported images, `read` returns a short text message and stores image metadata in `data`, including:

- resolved path
- MIME type
- byte size
- base64-encoded image bytes

[译文]
对于受支持的图片,`read` 返回一条简短文本消息,并把图片元数据存入 `data`,其中包括:

- 解析后的路径
- MIME 类型
- 字节大小
- base64 编码的图片字节

### 错误(Errors)

[原文]
`read` fails when:

- `path` is missing or is not a string
- `offset` is negative, or `limit` is not a positive integer
- the file does not exist
- the path is a directory
- `offset` is beyond the end of the file
- the file cannot be decoded as UTF-8 text and is not a supported image

[译文]
`read` 会在以下情况失败:

- `path` 缺失或不是字符串
- `offset` 为负数,或 `limit` 不是正整数
- 文件不存在
- 路径是一个目录
- `offset` 超出文件末尾
- 文件无法按 UTF-8 文本解码,且不是受支持的图片

## `write`

[原文]
Creates or overwrites a complete UTF-8 text file.

[译文]
创建或覆盖一个完整的 UTF-8 文本文件。

[原文]
Factory functions:

- `create_write_tool_definition()`
- `create_write_tool()`

[译文]
工厂函数:

- `create_write_tool_definition()`
- `create_write_tool()`

### 参数(Arguments)

```json
{
  "path": "src/example.py",
  "content": "print('hello')\n"
}
```

[原文]
| Argument | Required | Type | Description |
| --- | --- | --- | --- |
| `path` | yes | string | File path to write. Relative paths are resolved against `cwd`. |
| `content` | yes | string | Complete file contents to write. |

[译文]
| 参数 | 必填 | 类型 | 说明 |
| --- | --- | --- | --- |
| `path` | 是 | string | 要写入的文件路径。相对路径基于 `cwd` 解析。 |
| `content` | 是 | string | 要写入的完整文件内容。 |

### 行为(Behavior)

[原文]
`write`:

1. resolves the target path
2. creates missing parent directories
3. writes `content` using UTF-8 encoding
4. overwrites any existing file at that path

[译文]
`write` 会:

1. 解析目标路径
2. 创建缺失的父目录
3. 以 UTF-8 编码写入 `content`
4. 覆盖该路径上已存在的任何文件

[原文]
Writes are serialized per resolved path inside the current process. That means concurrent `write` or `edit` operations targeting the same file do not interleave.

[译文]
在当前进程内,针对同一个解析后路径的写入是串行化的。这意味着并发指向同一文件的 `write` 或 `edit` 操作不会交错执行。

### 结果元数据(Result metadata)

[原文]
Successful results include:

- resolved path
- number of characters written

[译文]
成功的结果包含:

- 解析后的路径
- 写入的字符数

### 错误(Errors)

[原文]
`write` fails when:

- `path` is missing or is not a string
- `content` is missing or is not a string
- the filesystem rejects the write operation

[译文]
`write` 会在以下情况失败:

- `path` 缺失或不是字符串
- `content` 缺失或不是字符串
- 文件系统拒绝写入操作

## `edit`

[原文]
Applies exact text replacements to one UTF-8 file.

[译文]
对单个 UTF-8 文件应用精确文本替换。

[原文]
Factory functions:

- `create_edit_tool_definition()`
- `create_edit_tool()`

[译文]
工厂函数:

- `create_edit_tool_definition()`
- `create_edit_tool()`

### 参数(Arguments)

```json
{
  "path": "src/example.py",
  "edits": [
    {
      "oldText": "print('hello')",
      "newText": "print('hello, Tau')"
    }
  ]
}
```

[原文]
| Argument | Required | Type | Description |
| --- | --- | --- | --- |
| `path` | yes | string | File path to edit. Relative paths are resolved against `cwd`. |
| `edits` | yes | array | One or more replacement objects. |
| `edits[].oldText` | yes | string | Exact text to replace. Must be non-empty and unique in the original file. |
| `edits[].newText` | yes | string | Replacement text. |

[译文]
| 参数 | 必填 | 类型 | 说明 |
| --- | --- | --- | --- |
| `path` | 是 | string | 要编辑的文件路径。相对路径基于 `cwd` 解析。 |
| `edits` | 是 | array | 一个或多个替换对象。 |
| `edits[].oldText` | 是 | string | 要替换的精确文本。必须非空,且在原始文件中唯一出现。 |
| `edits[].newText` | 是 | string | 替换后的文本。 |

### 匹配规则(Matching rules)

[原文]
Every `oldText` must:

- be non-empty
- match exactly, including whitespace and newlines
- appear exactly once in the original file
- not overlap another edit's matched range

[译文]
每个 `oldText` 必须:

- 非空
- 精确匹配,包括空白字符与换行
- 在原始文件中恰好出现一次
- 不与其他编辑的匹配区间重叠

[原文]
All `oldText` entries are matched against the original file content, not against the result of earlier edits.

[译文]
所有 `oldText` 都基于原始文件内容匹配,而不是基于先前编辑后的结果。

### 回滚行为(Rollback behavior)

[原文]
`edit` validates every replacement before writing. If any edit fails validation, the file is left unchanged.

[译文]
`edit` 会在写入之前校验每一处替换。任何一处编辑未通过校验,文件都保持原样。

### 换行符与 BOM(Line endings and BOMs)

[原文]
For matching, Tau normalizes file content and edit text to LF line endings. After applying edits, Tau restores the file's original dominant line ending. UTF-8 byte-order marks are preserved.

[译文]
为了匹配,Tau 会把文件内容与编辑文本统一规范化为 LF 换行。应用编辑之后,Tau 会恢复文件原本占主导地位的换行符。UTF-8 字节序标记(BOM)会被保留。

### 结果元数据(Result metadata)

[原文]
Successful results include:

- resolved path
- number of edits applied
- an `ndiff`-style diff
- a unified patch
- first changed line number

[译文]
成功的结果包含:

- 解析后的路径
- 应用的编辑数量
- 一份 `ndiff` 风格的差异
- 一份 unified patch
- 第一处变更的行号

### 错误(Errors)

[原文]
`edit` fails when:

- `path` is missing or is not a string
- the file does not exist
- the path is a directory
- `edits` is missing, empty, or malformed
- any `oldText` is empty
- any `oldText` is not found
- any `oldText` appears more than once
- edit ranges overlap
- all replacements would leave the file unchanged

[译文]
`edit` 会在以下情况失败:

- `path` 缺失或不是字符串
- 文件不存在
- 路径是一个目录
- `edits` 缺失、为空或格式不合法
- 任意 `oldText` 为空
- 任意 `oldText` 找不到
- 任意 `oldText` 出现多次
- 编辑区间相互重叠
- 所有替换都不会改变文件内容

## `bash`

[原文]
Executes a shell command in the configured working directory.

[译文]
在配置好的工作目录中执行 shell 命令。

[原文]
Factory functions:

- `create_bash_tool_definition()`
- `create_bash_tool()`

[译文]
工厂函数:

- `create_bash_tool_definition()`
- `create_bash_tool()`

### 参数(Arguments)

```json
{
  "command": "pytest -q",
  "timeout": 30
}
```

[原文]
| Argument | Required | Type | Description |
| --- | --- | --- | --- |
| `command` | yes | string | Shell command to execute. |
| `timeout` | no | number | Maximum runtime in seconds. Must be greater than zero when supplied. |

[译文]
| 参数 | 必填 | 类型 | 说明 |
| --- | --- | --- | --- |
| `command` | 是 | string | 要执行的 shell 命令。 |
| `timeout` | 否 | number | 最长运行时间(秒)。提供时必须大于零。 |

[原文]
There is no default timeout. Callers should provide one when they need bounded execution.

[译文]
没有默认超时。调用方在需要有界执行时应自行提供超时。

### 行为(Behavior)

[原文]
`bash`:

1. runs the command with `cwd` as the subprocess working directory
2. combines stdout and stderr into a single output stream
3. decodes output as UTF-8, replacing invalid bytes
4. returns success when the command exits with code `0`
5. returns failure when the command exits non-zero or times out

[译文]
`bash` 会:

1. 以 `cwd` 作为子进程工作目录运行命令
2. 把 stdout 与 stderr 合并为单一输出流
3. 以 UTF-8 解码输出,并替换无效字节
4. 当命令以退出码 `0` 结束时返回成功
5. 当命令以非零码退出或超时时返回失败

[原文]
On POSIX systems, commands are started in a new session. If a timeout occurs, Tau kills the whole process group so child processes from pipelines or compound commands are stopped too. On non-POSIX systems, Tau kills the direct subprocess.

[译文]
在 POSIX 系统上,命令会在新的会话中启动。如果发生超时,Tau 会杀掉整个进程组,因此管道或复合命令产生的子进程也会一并停止。在非 POSIX 系统上,Tau 只杀掉直接子进程。

### 输出截断(Output truncation)

[原文]
`bash` returns the tail of large output. Output is truncated to at most 2,000 lines or 50 KB, whichever limit is reached first.

[译文]
`bash` 对大输出返回其尾部内容。输出被截断到最多 2,000 行或 50 KB(以先达到的限制为准)。

[原文]
When truncation happens, Tau writes the full command output to a temporary `.log` file and includes that path in the result metadata.

[译文]
发生截断时,Tau 会把完整命令输出写入一个临时 `.log` 文件,并把该路径包含在结果元数据中。

### 结果元数据(Result metadata)

[原文]
Results include:

- command string
- exit code
- whether the command timed out
- duration in seconds
- truncation metadata
- full-output temp file path when output was truncated

[译文]
结果包含:

- 命令字符串
- 退出码
- 命令是否超时
- 耗时(秒)
- 截断元数据
- 输出被截断时的完整输出临时文件路径

### 错误(Errors)

[原文]
`bash` fails when:

- `command` is missing or is not a string
- `timeout` is not a number greater than zero
- the command exits with a non-zero status
- the command times out
- the subprocess cannot be started

[译文]
`bash` 会在以下情况失败:

- `command` 缺失或不是字符串
- `timeout` 不是大于零的数字
- 命令以非零状态退出
- 命令超时
- 子进程无法启动

## 选择合适的工具(Choosing the right tool)

[原文]
- Use `read` to inspect file contents instead of shelling out to `cat` or `sed`.
- Use `write` for new files or complete rewrites.
- Use `edit` for precise changes to an existing file.
- Use `bash` for commands such as tests, linters, searches, and project inspection.

[译文]
- 查看文件内容用 `read`,不要调用 `cat` 或 `sed`。
- 新建文件或整体重写用 `write`。
- 对既有文件做精确修改用 `edit`。
- 运行测试、linter、搜索以及查看项目情况等命令用 `bash`。
