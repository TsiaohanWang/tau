---
title: "Built-in tools / 内置工具"
description: "The read, write, edit, and bash tools the agent uses to work in your project. / agent 在你的项目中工作时使用的 read、write、edit 与 bash 工具。"
---

[原文]
Tools are the actions the agent can take in your working directory. The model
decides when to call them; Tau executes them and streams the results back. Tau
ships four built-in coding tools: `read`, `write`, `edit`, and `bash`.

[译文]
工具是 agent 在你的工作目录中可以执行的动作。模型决定何时调用它们;Tau 负责执行并把结果流式返回。Tau 随包提供四个内置编码工具:`read`、`write`、`edit` 与 `bash`。

[原文]
All paths are resolved against the session's working directory (`--cwd`, or the
directory you launched Tau from).

[译文]
所有路径都相对于会话的工作目录解析(`--cwd`,或你启动 Tau 时所在的目录)。

[原文]
{{% note %}}
This page documents tool *behavior* — what the model can do on your machine. To
build a frontend or register your own tools, see
[Building a custom frontend]({{< relref "../internals/custom-frontend.md" >}}).
{{% /note %}}

[译文]
{{% note %}}
本页记录的是工具的*行为* —— 即模型可以在你的机器上做什么。若要构建前端或注册你自己的工具,见[构建自定义前端]({{< relref "../internals/custom-frontend.md" >}})。
{{% /note %}}

## `read`(`read`)

[原文]
Reads a file from disk.

```json
{ "path": "README.md", "offset": 1, "limit": 40 }
```

[译文]
从磁盘读取一个文件。

[原文]
| Argument | Required | Type | Description |
| --- | --- | --- | --- |
| `path` | yes | string | File to read (relative to `cwd`). |
| `offset` | no | integer | 1-indexed start line (`0` = start of file). |
| `limit` | no | integer | Maximum number of lines to return. |

[译文]
| 参数 | 必填 | 类型 | 说明 |
| --- | --- | --- | --- |
| `path` | 是 | string | 要读取的文件(相对于 `cwd`)。 |
| `offset` | 否 | integer | 从 1 开始的起始行(`0` = 文件开头)。 |
| `limit` | 否 | integer | 最多返回的行数。 |

[原文]
For text files, `read` returns UTF-8 content, applies `offset`/`limit`, and
truncates to at most 2,000 lines or 50 KB (whichever comes first), appending a
hint like `[42 more lines in file. Use offset=101 to continue.]`. Supported
images (JPEG, static PNG, GIF, WebP, and BMP) are detected from their file
content and sent to vision-capable models as image attachments. BMP files are
converted to PNG. Tau validates images and, when necessary, resizes them without
upscaling or changing their aspect ratio. The processed attachment is limited to
2,000 pixels on either side and 5 MB. Processing also rejects source files above
50 MB or 40 million pixels. Animated PNG and JPEG XL inputs receive explicit
unsupported-format notices. If decoding, conversion, or resizing cannot produce
a safe attachment, Tau returns a clear omission notice.

[译文]
对于文本文件,`read` 返回 UTF-8 内容,应用 `offset`/`limit`,并截断到最多 2,000 行或 50 KB(以先到者为准),同时追加一条类似 `[42 more lines in file. Use offset=101 to continue.]` 的提示。受支持的图像(JPEG、静态 PNG、GIF、WebP 与 BMP)会依据文件内容被识别,并作为图像附件发送给具备视觉能力的模型。BMP 文件会被转换为 PNG。Tau 会校验图像,并在必要时缩放它们,既不放大也不改变宽高比。处理后的附件限制为每边最多 2,000 像素、大小 5 MB。处理过程还会拒绝超过 50 MB 或 4,000 万像素的源文件。动态 PNG 与 JPEG XL 输入会收到明确的「格式不受支持」提示。如果解码、转换或缩放无法产出安全的附件,Tau 会返回一条清晰的「已省略」提示。

[原文]
When the active model does not accept images, `read` returns an explicit
text-only notice that says the image contents are unavailable and recommends
switching to a vision-capable model. It does not attach or process the image.
Provider serialization applies the same defensive downgrade to image blocks from
older sessions or other tools. This avoids invalid requests and reduces pressure
on text-only models to invent a visual description.

[译文]
当活动模型不接受图像时,`read` 会返回一条明确的纯文本提示,说明图像内容不可用,并建议切换到具备视觉能力的模型。它不会附带或处理该图像。Provider 序列化对来自较旧会话或其他工具的图像块应用同样的防御性降级。这避免了无效请求,也减轻了纯文本模型「编造」视觉描述的压力。

[原文]
The Textual TUI shows this notice, but does not render images inline; native
terminal-image rendering remains outside the `read` tool's provider-neutral
contract.

[译文]
Textual TUI 会显示这条提示,但不会在行内渲染图像;原生终端图像渲染不属于 `read` 工具与 provider 无关的契约范围。

[原文]
Fails when `path` is missing/invalid, the file doesn't exist, the path is a
directory, `offset` is past the end, or the file is neither UTF-8 text nor a
supported image.

[译文]
当 `path` 缺失/无效、文件不存在、路径是一个目录、`offset` 超出文件末尾,或文件既不是 UTF-8 文本也不是受支持的图像时会失败。

## `write`(`write`)

[原文]
Creates or overwrites a complete UTF-8 text file.

```json
{ "path": "src/example.py", "content": "print('hello')\n" }
```

[译文]
创建或覆盖一个完整的 UTF-8 文本文件。

[原文]
| Argument | Required | Type | Description |
| --- | --- | --- | --- |
| `path` | yes | string | File to write (relative to `cwd`). |
| `content` | yes | string | Complete file contents. |

[译文]
| 参数 | 必填 | 类型 | 说明 |
| --- | --- | --- | --- |
| `path` | 是 | string | 要写入的文件(相对于 `cwd`)。 |
| `content` | 是 | string | 完整的文件内容。 |

[原文]
Creates missing parent directories and overwrites any existing file. Writes to
the same path are serialized within a process, so concurrent `write`/`edit` calls
on one file don't interleave.

[译文]
会创建缺失的父目录,并覆盖任何已存在的文件。对同一路径的写入在一个进程内被串行化,因此针对同一个文件的并发 `write`/`edit` 调用不会交错。

## `edit`(`edit`)

[原文]
Applies exact text replacements to one file.

```json
{
  "path": "src/example.py",
  "edits": [
    { "oldText": "print('hello')", "newText": "print('hello, Tau')" }
  ]
}
```

[译文]
对一个文件应用精确的文本替换。

[原文]
| Argument | Required | Type | Description |
| --- | --- | --- | --- |
| `path` | yes | string | File to edit (relative to `cwd`). |
| `edits` | yes | array | One or more `{oldText, newText}` replacements. |

[译文]
| 参数 | 必填 | 类型 | 说明 |
| --- | --- | --- | --- |
| `path` | 是 | string | 要编辑的文件(相对于 `cwd`)。 |
| `edits` | 是 | array | 一个或多个 `{oldText, newText}` 替换。 |

[原文]
Each `oldText` must be non-empty, match exactly (whitespace included), appear
**exactly once**, and not overlap another edit. All edits validate before
anything is written — if any fails, the file is left unchanged. Line endings are
normalized for matching and the original dominant ending is restored. Successful
results include a diff, a unified patch, and the first changed line number.

[译文]
每个 `oldText` 都必须非空、精确匹配(包括空白)、**恰好出现一次**,并且不与其他编辑重叠。所有编辑都会在任何写入发生之前完成校验 —— 只要有一个失败,文件就保持原样。匹配时行尾会被规范化,之后恢复原有占主导的行尾。成功的结果包含 diff、统一 patch,以及第一个发生变化的行号。

## `bash`(`bash`)

[原文]
Runs a shell command in the working directory.

```json
{ "command": "pytest -q", "timeout": 30 }
```

[译文]
在工作目录中运行一条 shell 命令。

[原文]
| Argument | Required | Type | Description |
| --- | --- | --- | --- |
| `command` | yes | string | Shell command to run. |
| `timeout` | no | number | Max runtime in seconds (> 0). No default. |

[译文]
| 参数 | 必填 | 类型 | 说明 |
| --- | --- | --- | --- |
| `command` | 是 | string | 要运行的 shell 命令。 |
| `timeout` | 否 | number | 最长运行时间,单位秒(> 0)。没有默认值。 |

[原文]
Combines stdout and stderr, succeeds on exit code `0`, and returns the **tail**
of large output (truncated to 2,000 lines / 50 KB; the full output is written to
a temp `.log` file whose path is included in the result). On POSIX, a timeout
kills the whole process group.

[译文]
合并 stdout 与 stderr,退出码为 `0` 时视为成功,并返回大段输出的**尾部**(截断到 2,000 行 / 50 KB;完整输出会写入一个临时 `.log` 文件,其路径包含在结果中)。在 POSIX 上,超时会杀掉整个进程组。

## 选择合适的工具(Choosing the right tool)

[原文]
- **`read`** — inspect files (instead of `cat`/`sed`).
- **`write`** — new files or complete rewrites.
- **`edit`** — precise changes to an existing file.
- **`bash`** — tests, linters, searches, project inspection.

[译文]
- **`read`** —— 查看文件(代替 `cat`/`sed`)。
- **`write`** —— 新建文件或完整重写。
- **`edit`** —— 对既有文件做精确修改。
- **`bash`** —— 测试、linter、搜索、项目检查。
