---
title: "Print mode & scripting / Print 模式与脚本化"
description: "Run Tau non-interactively for a single prompt — ideal for scripts, pipes, and CI. / 以非交互方式运行 Tau 处理单条提示词 —— 非常适合脚本、管道与 CI。"
---

[原文]
Print mode runs a single prompt without the interactive UI and writes the result
to the terminal. It's the right choice for scripts, pipelines, and one-off
questions.

[译文]
Print 模式在不启动交互式 UI 的情况下运行单条提示词,并把结果写到终端。它是脚本、流水线与一次性提问的正确选择。

## 基本用法(Basic use)

```bash
tau -p "summarize the changes in the last commit"
```

[原文]
The `-p` / `--print` flag switches Tau into print mode; the prompt itself is a
plain positional argument, the same as an initial prompt for the TUI. Print
mode still uses the full coding-session environment — the same tools, project
context, and session storage as the TUI — so its turns are saved under
`~/.tau/sessions/` too.

[译文]
`-p` / `--print` flag 会把 Tau 切换到 print 模式;提示词本身是一个普通的位置参数,与 TUI 的初始提示词相同。Print 模式仍使用完整的编码会话环境 —— 与 TUI 相同的工具、项目上下文与会话存储 —— 因此它的轮次同样会保存在 `~/.tau/sessions/` 下。

[原文]
Put flags **before** the prompt. Tau accepts multi-word prompts without
quoting, so anything after the last recognized flag — including tokens that
look like other flags — is treated as prompt text:

```bash
tau -p --mode json "list the public functions in src/app.py"
```

[译文]
请把 flag 放在提示词**之前**。Tau 接受不加引号的多词提示词,因此最后一个被识别的 flag 之后的所有内容 —— 包括看起来像其他 flag 的 token —— 都会被当作提示词文本:

## 输出格式(Output formats)

[原文]
Choose how results are written with `--mode`. Passing `--mode` on its own also
switches Tau into non-interactive mode, so `-p` is optional once `--mode` is set:

```bash
tau -p --mode text "list the public functions in src/app.py"        # default, human-readable
tau --mode json "list the public functions in src/app.py"           # JSON, for parsing
tau -p --mode transcript "list the public functions in src/app.py"  # structured transcript
```

[译文]
用 `--mode` 选择结果的写出方式。单独传入 `--mode` 也会把 Tau 切换到非交互模式,因此一旦设置了 `--mode`,`-p` 就是可选的:

```bash
tau -p --mode text "list the public functions in src/app.py"        # 默认,人类可读
tau --mode json "list the public functions in src/app.py"           # JSON,便于解析
tau -p --mode transcript "list the public functions in src/app.py"  # 结构化会话记录
```

[原文]
- **text** — plain text with ANSI styling, for reading.
- **json** — machine-readable, for piping into other tools.
- **transcript** — a structured record of the turn.

[译文]
- **text** —— 带 ANSI 样式的纯文本,供人阅读。
- **json** —— 机器可读,便于管道传给其他工具。
- **transcript** —— 该轮次的结构化记录。

[原文]
Piped stdin is merged into the prompt, so you can feed file contents in:

```bash
cat README.md | tau -p "Summarize this text"
```

[译文]
通过管道传入的 stdin 会并入提示词,因此你可以把文件内容喂进去:

[原文]
A piped body can also be the entire prompt — `tau -p` with no positional text
and piped stdin is valid:

```bash
cat README.md | tau -p
```

[译文]
管道传入的内容也可以就是整个提示词 —— 不带位置文本、只接管道 stdin 的 `tau -p` 是合法的:

## 选择 provider、模型与目录(Choosing provider, model, and directory)

[原文]
The same selection flags work in print mode:

```bash
tau -m gpt-5.5 -p "explain this module"
tau --provider local -p "explain this module"
tau --cwd ./services/api -p "audit for secrets"
```

[译文]
同一套选择 flag 在 print 模式中同样有效:

## 恢复对话(Resume a conversation)

[原文]
Pass an existing session id to run a follow-up turn non-interactively:

```bash
tau --print --session <session-id> "Follow-up message"
```

[译文]
传入一个已存在的会话 id,即可非交互地运行一次后续轮次:

[原文]
Tau appends the turn to the existing transcript and sends its active conversation
history to the model. It also uses the session's saved working directory,
provider, and model unless explicit selection flags override them. This works
with every output mode and keeps stdout dedicated to that mode. Unknown ids fail
without creating a session. `--session` cannot be combined with `--new-session`
or `--session-id`.

[译文]
Tau 会把该轮次追加到既有会话记录,并把它的活动对话历史发送给模型。除非显式选择 flag 覆盖,否则它还会使用该会话保存的工作目录、provider 与模型。这在所有输出模式下都有效,并让 stdout 专属于该模式。未知 id 会直接失败,不会创建会话。`--session` 不能与 `--new-session` 或 `--session-id` 组合使用。

[原文]
Use `tau sessions` to find session ids.

[译文]
用 `tau sessions` 查找会话 id。

## 记录会话 id(Recording the session id)

[原文]
Automation can choose the exact id of a new print-mode session with
`--session-id`. This keeps stdout dedicated to the selected output format and
avoids scanning `~/.tau/sessions/`:

```bash
worker_session_id="$(python -c 'import uuid; print(uuid.uuid4().hex)')"
tau --print --new-session \
  --session-id "$worker_session_id" \
  --cwd /path/to/project \
  "review the current changes"
printf 'Tau session: %s\n' "$worker_session_id"
```

[译文]
自动化可以用 `--session-id` 为新 print 模式会话指定确切的 id。这让 stdout 专属于所选输出格式,并免去扫描 `~/.tau/sessions/`:

[原文]
Ids may contain letters, numbers, `.`, `_`, and `-`, must start and end with a
letter or number, and may be at most 128 bytes. `default` and `index` are
reserved. Use a unique id for each worker. Tau atomically reserves the transcript
and exits with an error rather than opening or overwriting an existing session,
even if an unindexed transcript already uses that id or two workers start at the
same time. The option applies to text, JSON, and transcript modes without adding
metadata to their stdout output.

[译文]
id 可以包含字母、数字、`.`、`_` 与 `-`,必须以字母或数字开头和结尾,最长 128 字节。`default` 与 `index` 为保留值。请为每个 worker 使用唯一的 id。Tau 会原子地预留会话记录,若已存在会话就报错退出,而不是打开或覆盖它 —— 即使某个未建立索引的会话记录已经使用了该 id,或两个 worker 同时启动也是如此。该选项适用于 text、JSON 与 transcript 模式,且不会给它们的 stdout 输出添加任何元数据。

## 退出状态(Exit status)

[原文]
Print mode exits non-zero if the run fails, so you can use it in scripts:

```bash
if tau --mode text -p "do the tests pass? answer yes or no" | grep -qi yes; then
  echo "looks good"
fi
```

[译文]
如果运行失败,print 模式会以非零状态退出,因此可以在脚本中使用:

[原文]
{{% tip %}}
For interactive work, start the [TUI]({{< relref "./tui.md" >}}) instead — you get streaming,
steering, pickers, and session branching.
{{% /tip %}}

[译文]
{{% tip %}}
若要进行交互式工作,请改启动 [TUI]({{< relref "./tui.md" >}}) —— 你能获得流式显示、插话引导、各类选择器与会话分支。
{{% /tip %}}
