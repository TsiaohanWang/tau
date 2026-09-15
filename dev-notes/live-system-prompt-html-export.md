# HTML 会话导出中的实时系统提示词 / Live system prompts in HTML session exports

## 变更内容(What changed)

[原文]
HTML created by a live `CodingSession` now contains its current
`CodingSession.system_prompt`. The prompt appears in a labeled, collapsed
**System Prompt** section above the transcript controls. It is escaped as plain
text, keeps indentation and line breaks, and wraps long lines.

[译文]
由活动 `CodingSession` 生成的 HTML 现在包含其当前的 `CodingSession.system_prompt`。该提示词出现在会话记录控件上方一个带标签、默认折叠的 **System Prompt** 区块中。它按纯文本转义,保留缩进与换行,并对长行折行。

[原文]
Stored session JSONL still contains only session entries. Consequently:

[译文]
存储的会话 JSONL 仍然只包含会话条目。因此:

[原文]
- `/export --format jsonl` does not add the prompt.
- the JSONL download embedded in HTML does not add the prompt.
- `tau export <session-id>` and `tau export <path.jsonl>` omit the HTML section,
  because these offline paths only have stored entries and cannot recover the
  live prompt.

[译文]
- `/export --format jsonl` 不会加入该提示词。
- HTML 中内嵌的 JSONL 下载不会加入该提示词。
- `tau export <session-id>` 与 `tau export <path.jsonl>` 会省略该 HTML 区块,因为这些离线路径只有存储的条目,无法恢复出实时提示词。

## 为什么提示词是分离的(Why the prompt is separate)

[原文]
A system prompt configures provider requests; it is not a user, assistant, tool,
or custom transcript event. Passing it as optional rendering context keeps the
append-only session format unchanged and avoids inventing a synthetic entry.

[译文]
系统提示词配置的是 provider 请求;它不是 user、assistant、tool 或自定义会话记录事件。把它作为可选的渲染上下文传入,可以保持只追加会话格式不变,也避免虚构一条合成条目。

[原文]
This behavior belongs in `tau_coding`: `CodingSession.export()` supplies the
live value to the application-level HTML renderer. `tau_agent` remains unaware
of CLI and HTML export policy.

[译文]
该行为属于 `tau_coding`:`CodingSession.export()` 把实时值提供给应用层的 HTML 渲染器。`tau_agent` 仍然不了解 CLI 与 HTML 导出策略。

## 分享与安全(Sharing and safety)

[原文]
System prompts may include project instruction files, skill guidance, working
directory paths, and other local context. The exported section warns about
project instructions, but users should open and review live HTML before sharing
it. HTML escaping prevents prompt text from becoming executable markup.

[译文]
系统提示词可能包含项目指令文件、技能指引、工作目录路径以及其他本地上下文。导出的区块会就项目指令给出警告,但用户在分享之前应先打开并检查实时 HTML。HTML 转义可防止提示词文本变成可执行标记。

## 如何测试(How to test)

[原文]
Focused checks:

[译文]
聚焦检查:

```bash
uv run pytest tests/test_session_export.py tests/test_coding_session.py tests/test_cli.py -k export
```

[原文]
Full project checks:

[译文]
完整项目检查:

```bash
uv run pytest
uv run ruff check .
uv run ruff format --check .
uv run mypy
```
