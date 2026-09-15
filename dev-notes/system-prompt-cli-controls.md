# 显式的系统提示词 CLI 控件 / Explicit system-prompt CLI controls

[原文]
Issue: https://github.com/huggingface/tau/issues/530

[译文]
Issue:https://github.com/huggingface/tau/issues/530

## 变更内容(What changed)

[原文]
Tau now exposes Pi-compatible startup controls:

[译文]
Tau 现在暴露与 Pi 兼容的启动控件:

```bash
tau --system-prompt "Custom base" \
  --append-system-prompt ./shared-rules.md \
  --append-system-prompt "Local rule" \
  -p "review this"
```

[原文]
`--system-prompt TEXT_OR_PATH` replaces the generated base. The repeatable
`--append-system-prompt TEXT_OR_PATH` values retain command-line order and are
joined with `\n\n` (exactly one blank line). As with Tau's other options, these
recognized flags must precede positional prompt text.

[译文]
`--system-prompt TEXT_OR_PATH` 替换生成的基础提示词。可重复的 `--append-system-prompt TEXT_OR_PATH` 值保持命令行顺序,并以 `\n\n`(恰好一个空行)连接。与 Tau 的其他选项一样,这些被识别的 flag 必须位于位置参数形式的提示文本之前。

## 解析与错误(Resolution and errors)

[原文]
Each option value is resolved independently. Tau expands `~`; if the resulting
path exists, Tau reads it as UTF-8. If it does not exist, the original value is
literal prompt text. Existing directories, unreadable files, and invalid UTF-8
files fail startup with a concise diagnostic containing both the option and
path. This matches Pi's file-when-existing, literal-otherwise policy without
adding automatic prompt-file discovery.

[译文]
每个选项值都独立解析。Tau 会展开 `~`;如果得到的路径存在,Tau 就按 UTF-8 读取它。如果不存在,则原始值就是字面提示文本。已存在的目录、不可读的文件与非法 UTF-8 文件会让启动失败,并给出一条简洁诊断,其中同时包含该选项与路径。这与 Pi 的「存在则当文件、否则当字面文本」策略一致,同时没有引入自动的提示词文件发现。

## 架构与恢复行为(Architecture and resume behavior)

[原文]
Resolution belongs to `tau_coding.cli`. The resolved values flow through print
mode or the Textual adapter into `CodingSessionConfig.custom_system_prompt` and
`append_system_prompt`. They deliberately do not use `CodingSessionConfig.system`,
which is an exact low-level override. Therefore a custom base still receives
append text, project context, eligible skills when `read` is available, date,
and cwd from the existing prompt builder.

[译文]
解析属于 `tau_coding.cli`。解析后的值经由 print 模式或 Textual 适配器流入 `CodingSessionConfig.custom_system_prompt` 与 `append_system_prompt`。它们有意不使用 `CodingSessionConfig.system`,后者是精确的底层覆盖。因此自定义基础提示词仍会从既有提示词构建器接收追加文本、项目上下文、`read` 可用时的符合条件技能、日期与 cwd。

[原文]
The same values are supplied when `--session` resumes a TUI session, so its next
provider request uses the startup override. Prompt controls are not written into
session JSONL; callers must supply them again on a later resume.

[译文]
当 `--session` 恢复一个 TUI 会话时,会提供相同的值,因此其下一次 provider 请求会使用启动时的覆盖。提示词控件不会被写入会话 JSONL;调用方在之后的恢复中必须再次提供它们。

[原文]
Out of scope: automatic `SYSTEM.md` discovery, extension runtime overrides, and
export behavior.

[译文]
不在范围内:自动的 `SYSTEM.md` 发现、扩展运行时覆盖,以及导出行为。

## 验证(Verification)

```bash
uv run pytest tests/test_cli.py tests/test_tui_app.py tests/test_system_prompt.py
uv run ruff check .
uv run ruff format --check .
uv run mypy
```
