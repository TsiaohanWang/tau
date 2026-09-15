# TUI 中的紧凑 bash 调用 / Compact bash invocations in the TUI

[原文]
Long shell commands used to wrap across many transcript lines before their output
was even shown. This was especially noisy for heredocs and interpreter commands
that embed source code directly in `python -c`, `node -e`, or similar arguments.

[译文]
冗长的 shell 命令过去在输出尚未显示之前就会折行占据多行会话记录。对于 heredoc 以及把源码直接嵌进 `python -c`、`node -e` 之类参数的解释器命令,这种噪音尤其明显。

## 变更内容(What changed)

[原文]
The bash tool requires the model to provide a brief present-participle
`description` in the same tool call. The TUI normalizes whitespace but shows the
complete summary and no command text while collapsed. `Ctrl+O` keeps the
description as the first line and reveals the exact command and result beneath it.
The running/success/failure color applies to the description. This
adds no second provider request. Calls that still omit the field because of
malformed provider output, custom integrations, or older session history show the
generic `Running shell command` label without exposing command text.

[译文]
bash 工具要求模型在同一次工具调用中提供一个简短的、现在分词形式的 `description`。折叠状态下,TUI 会归一化空白,显示完整摘要,且不显示任何命令文本。`Ctrl+O` 保留描述作为第一行,并在其下显示确切的命令与结果。运行中/成功/失败颜色作用于描述。这不会新增第二次 provider 请求。若因 provider 输出畸形、自定义集成或较旧的会话历史而仍然缺少该字段,调用会显示通用的 `Running shell command` 标签,且不暴露命令文本。

[原文]
`Ctrl+O` expands both sides of a tool interaction beneath the retained
description: the exact bash command and the full result. Collapsing restores the
description-only row.

[译文]
`Ctrl+O` 会在保留的描述之下展开工具交互的两侧:确切的 bash 命令与完整结果。再次折叠会恢复仅显示描述的行。

## 架构(Architecture)

[原文]
The provider-visible bash schema and tool prompt guideline live in
`src/tau_coding/tools.py`. The schema requires `description` to make compliant
models return the display metadata consistently. The executor remains tolerant
of omissions and ignores the value, so malformed provider output, custom
integrations, and older history cannot prevent command execution. The value is
display metadata carried inside the existing `ToolCall.arguments` mapping.

[译文]
对 provider 可见的 bash schema 与工具提示准则位于 `src/tau_coding/tools.py`。schema 要求 `description`,以便合规模型稳定地返回该显示元数据。执行器则对缺失保持宽容并忽略该值,因此 provider 输出畸形、自定义集成与较旧历史都不会阻止命令执行。该值是携带在既有 `ToolCall.arguments` 映射内部的显示元数据。

[原文]
Formatting lives in `src/tau_coding/tui/state.py`. The state shows supplied
descriptions without command text and uses a generic label when no description
exists.
It resolves the exact invocation lazily when tool results are expanded. Existing
custom tool `render_call` output still takes precedence. The print-mode transcript renderer
explicitly requests the unabridged invocation because it has no interactive
expansion control. Session JSONL serialization remains independent of these
display formatters and retains the complete `command`. No TUI concerns enter
`tau_agent`, and command execution is unchanged.

[译文]
格式化逻辑位于 `src/tau_coding/tui/state.py`。状态层显示所提供的描述而不显示命令文本,并在没有描述时使用通用标签。
在工具结果被展开时,它会惰性地解析出确切的调用。既有的自定义工具 `render_call` 输出仍然优先。Print 模式的会话记录渲染器会显式请求未经删减的调用,因为它没有交互式展开控件。会话 JSONL 序列化仍独立于这些显示格式化器,并保留完整的 `command`。没有 TUI 关注点进入 `tau_agent`,命令执行也不变。

## 测试(Tests)

[原文]
- `tests/test_coding_tools.py` and `tests/test_system_prompt.py` cover the required
  schema field, omission-tolerant execution, and model instruction.
- `tests/test_tui_adapter.py` covers semantic descriptions, generic omission
  fallback, command-shape privacy, complete descriptions, and exact expansion.
- `tests/test_tui_app.py` uses a Textual pilot to confirm `Ctrl+O` replaces a
  compact heredoc row with the exact command and full result.
- `tests/test_rendering.py` confirms print-mode transcripts always show the exact
  command instead of the display description.

[译文]
- `tests/test_coding_tools.py` 与 `tests/test_system_prompt.py` 覆盖必需的 schema 字段、容忍缺失的执行,以及模型指令。
- `tests/test_tui_adapter.py` 覆盖语义描述、缺失时的通用回退、命令形态隐私、完整描述与精确展开。
- `tests/test_tui_app.py` 使用 Textual 试点确认 `Ctrl+O` 会把紧凑的 heredoc 行替换为确切的命令与完整结果。
- `tests/test_rendering.py` 确认 print 模式的会话记录始终显示确切的命令,而不是显示用的描述。

[原文]
Run:

[译文]
运行:

```bash
uv run pytest tests/test_tui_adapter.py tests/test_tui_app.py
```

[原文]
For manual validation, ask Tau to run a multiline heredoc. Confirm the collapsed
row occupies one line, press `Ctrl+O` to see the complete command, then press it
again to restore the preview.

[译文]
手动验证时,让 Tau 运行一个多行 heredoc。确认折叠后的行只占一行,按 `Ctrl+O` 查看完整命令,再按一次恢复预览。
