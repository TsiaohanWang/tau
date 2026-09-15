# 对齐 Pi 的非交互式 CLI 参数 / Mirroring Pi's non-interactive CLI flags

[原文]
Issue: https://github.com/huggingface/tau/issues/439

[译文]
Issue:https://github.com/huggingface/tau/issues/439

[原文]
This PR started as a single-flag rename (`--resume` -> `--session`) and grew,
in place, into a full mirror of Pi's non-interactive CLI flag surface. The
version bump `0.2.4` -> `0.3.0` covers all of the breaking renames below, not
just the original one.

[译文]
这个 PR 最初只是一个参数重命名(`--resume` → `--session`),后来在原地扩展为对 Pi 非交互式 CLI 参数面的完整镜像。版本号从 `0.2.4` 升到 `0.3.0`,覆盖的是下面所有破坏性重命名,而不只是最初那一个。

## 变更内容(What changed)

[原文]
| Tau (before) | Tau (now) | Notes |
|---|---|---|
| `--resume <id>` | `--session <id>` | Matches Pi's `--session <path\|id>`. Id only for now; JSONL path support is a possible follow-up. |
| `-p, --prompt <text>` | `-p, --print` (boolean) + positional prompt | Matches Pi's `-p, --print`. The prompt is the same positional argument the TUI already uses for an initial prompt. |
| `-o, --output <text\|json\|transcript>` | `--mode <text\|json\|transcript>` | Matches Pi's `--mode` flag name. Tau keeps its own value set (no RPC mode; Pi has no `transcript` mode) — see the audit table below. Passing `--mode` on its own also triggers non-interactive mode, mirroring `pi --mode json "prompt"` needing no separate `-p`. |
| `-x, --extension <path>` | `-e, --extension <path>` | Matches Pi's `-e, --extension`. |
| `tau export <id> [out]` (subcommand only) | `tau export <id> [out]` **and** `tau --export <id> [out]` | Added `--export` as a top-level flag alias, matching Pi's `--export <in> [out]`, while keeping the subcommand for backward compatibility (it isn't deprecated — it fits Tau's other subcommands). |
| `--version` | `--version`, `-v` | Added the `-v` short flag, matching Pi's `-v, --version`. |
| (none) | piped stdin merges into the print-mode prompt | Mirrors Pi's `cat file \| pi -p "..."` behavior: when stdin is not a TTY, its contents are prepended to the prompt. A piped body can also be the *entire* prompt (`tau -p` with no positional text). |

[译文]
| Tau(变更前) | Tau(现在) | 说明 |
|---|---|---|
| `--resume <id>` | `--session <id>` | 与 Pi 的 `--session <path\|id>` 一致。目前只支持 id;JSONL 路径支持可能作为后续项。 |
| `-p, --prompt <text>` | `-p, --print`(布尔)+ 位置参数提示 | 与 Pi 的 `-p, --print` 一致。提示就是 TUI 已经用于初始提示的同一个位置参数。 |
| `-o, --output <text\|json\|transcript>` | `--mode <text\|json\|transcript>` | 与 Pi 的 `--mode` 参数名一致。Tau 保留自己的取值集合(没有 RPC 模式;Pi 没有 `transcript` 模式)—— 见下面的审计表。单独传 `--mode` 也会触发非交互模式,对应 `pi --mode json "prompt"` 无需另加 `-p`。 |
| `-x, --extension <path>` | `-e, --extension <path>` | 与 Pi 的 `-e, --extension` 一致。 |
| `tau export <id> [out]`(仅子命令) | `tau export <id> [out]` **以及** `tau --export <id> [out]` | 新增顶层 flag 别名 `--export`,与 Pi 的 `--export <in> [out]` 一致,同时保留子命令形式以向后兼容(它并未被弃用 —— 它契合 Tau 的其他子命令)。 |
| `--version` | `--version`、`-v` | 新增短参数 `-v`,与 Pi 的 `-v, --version` 一致。 |
| (无) | 管道传入的 stdin 合并进 print 模式提示 | 镜像 Pi 的 `cat file \| pi -p "..."` 行为:当 stdin 不是 TTY 时,其内容会被前置到提示之前。管道内容也可以作为*完整*提示(不带位置文本的 `tau -p`)。 |

[原文]
Every renamed/removed flag keeps a **hidden** option under its old name that
raises a clear migration error instead of Typer's generic "no such option":

[译文]
每个被重命名/移除的参数都会在旧名称下保留一个**隐藏**选项,它抛出清晰的迁移错误,而不是 Typer 那句笼统的 "no such option":

[原文]
- `--resume <id>` -> `--resume was renamed to --session. Use \`tau --session <id>\` instead.`
- `--prompt <text>` -> `--prompt was removed. Pass the prompt positionally and use --print, e.g. \`tau --print "<text>"\`.`
- `-o/--output <mode>` -> `--output was renamed to --mode. Use \`tau --mode <mode>\` instead.`
- `-x <path>` -> `-x was renamed to -e/--extension.`

[译文]
- `--resume <id>` → `--resume was renamed to --session. Use \`tau --session <id>\` instead.`
- `--prompt <text>` → `--prompt was removed. Pass the prompt positionally and use --print, e.g. \`tau --print "<text>"\`.`
- `-o/--output <mode>` → `--output was renamed to --mode. Use \`tau --mode <mode>\` instead.`
- `-x <path>` → `-x was renamed to -e/--extension.`

[原文]
None of these old flags do anything anymore; they only exist to produce a
friendly error.

[译文]
这些旧参数如今不再做任何事;它们的存在只是为了给出友好的错误。

### 参数顺序(Flag ordering)

[原文]
Tau's CLI accepts an unquoted, multi-word prompt as trailing positional
arguments (`tau fix the bug in main.py`, no quotes needed). To support that,
the root command uses Click's `ignore_unknown_options` + a variadic
`prompt_args` argument. One consequence: once positional-argument capture
starts, everything after it — including tokens that look like flags — is
absorbed into the prompt. Put flags **before** the prompt:

[译文]
Tau 的 CLI 接受不带引号的多词提示作为尾部位置参数(`tau fix the bug in main.py`,无需引号)。为支持这一点,根命令使用了 Click 的 `ignore_unknown_options` 加上可变参数 `prompt_args`。一个后果是:一旦位置参数捕获开始,其后的所有内容 —— 包括看起来像 flag 的 token —— 都会被吸收进提示。请把 flag 放在提示**之前**:

```bash
# Works: flags precede the prompt
tau -p --mode json "summarize this"

# Breaks: --mode is swallowed into the prompt text
tau -p "summarize this" --mode json
```

[原文]
This matches Pi's own documented examples, which always place flags before
the trailing message (`pi --model gpt-4o "Help me refactor"`).

[译文]
这与 Pi 自己文档中的示例一致:它们总是把 flag 放在尾部消息之前(`pi --model gpt-4o "Help me refactor"`)。

## Tau 与 Pi 非交互式参数的审计(Audit of Tau vs Pi non-interactive flags)

[原文]
Per the [Pi CLI reference](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/README.md#cli-reference),
the full audit and disposition:

[译文]
依据 [Pi CLI 参考](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/README.md#cli-reference),完整审计与处置如下:

[原文]
| Tau (current) | Pi | Disposition |
|---|---|---|
| `--session <id>` | `--session <path\|id>` | **Fixed.** Renamed from `--resume`. Id only for now; path support left as a follow-up. Pi's own `-r/--resume` (no value, opens a picker) is not adopted; Tau's picker already lives in the TUI's `/resume` slash command. |
| `-p, --print` (boolean) | `-p, --print` (boolean) | **Fixed.** Prompt moved to a positional argument, matching Pi. |
| `--mode <text\|json\|transcript>` | `--mode json\|rpc` | **Fixed the flag name; kept Tau's own value set, justified.** Tau's `text`/`json`/`transcript` output modes do not map 1:1 onto Pi's `json`/`rpc` (Tau has no RPC mode; `transcript` has no Pi equivalent). Adding an RPC mode is a much larger effort (a process-integration protocol) and is out of scope here. |
| `-e, --extension <path>` | `-e, --extension <source>` | **Fixed.** |
| `tau export`/`tau --export` | `--export <in> [out]` | **Fixed by addition.** Added the flag form; kept the subcommand form since it fits Tau's other subcommands (`sessions`, `providers`, `setup`, `update`), none of which Pi has an equivalent for either. |
| `-v, --version` | `-v, --version` | **Fixed.** |

[译文]
| Tau(当前) | Pi | 处置 |
|---|---|---|
| `--session <id>` | `--session <path\|id>` | **已修复。** 由 `--resume` 重命名而来。目前只支持 id;路径支持作为后续项。Pi 自己的 `-r/--resume`(不带值,打开选择器)未被采纳;Tau 的选择器已经存在于 TUI 的 `/resume` 斜杠命令中。 |
| `-p, --print`(布尔) | `-p, --print`(布尔) | **已修复。** 提示移动到位置参数,与 Pi 一致。 |
| `--mode <text\|json\|transcript>` | `--mode json\|rpc` | **已修复参数名;保留 Tau 自己的取值集合,并给出理由。** Tau 的 `text`/`json`/`transcript` 输出模式无法与 Pi 的 `json`/`rpc` 一一对应(Tau 没有 RPC 模式;`transcript` 在 Pi 中没有对应物)。新增 RPC 模式是一项大得多的工作(进程集成协议),不在本次范围内。 |
| `-e, --extension <path>` | `-e, --extension <source>` | **已修复。** |
| `tau export`/`tau --export` | `--export <in> [out]` | **通过新增实现修复。** 新增了 flag 形式;保留子命令形式,因为它契合 Tau 的其他子命令(`sessions`、`providers`、`setup`、`update`),而 Pi 对这些也都没有对应物。 |
| `-v, --version` | `-v, --version` | **已修复。** |

## 为未来 Pi 对齐保留的参数名(Flag names reserved for future Pi parity)

[原文]
Tau should not add new flags that squat on names Pi uses for different
things. Known Pi flags Tau does not yet have: `-c/--continue`, `--fork`,
`--no-session`, `--name/-n`, `--session-dir`, `--mode rpc`. If Tau adds
equivalent features later, prefer these names with matching semantics.

[译文]
Tau 不应新增会占用 Pi 用于其他含义的名称的参数。已知 Pi 有而 Tau 尚未具备的参数:`-c/--continue`、`--fork`、`--no-session`、`--name/-n`、`--session-dir`、`--mode rpc`。如果 Tau 日后添加等价功能,应优先使用这些名称并匹配其语义。

## 退出时的恢复提示,issue #438 / Exit resume hint (issue #438)

[原文]
Issue #438 (print a resume hint on exit) landed in #441 while this PR was in
flight, printing `To resume this session: tau --resume <session-id>`. This PR
rebased onto that change and updated the printed hint (and the matching
internal `--resume and --new-session cannot be used together` message in
`src/tau_coding/tui/app.py`) to use `--session`:

[译文]
Issue #438(退出时打印恢复提示)在本 PR 进行期间以 #441 落地,打印的是 `To resume this session: tau --resume <session-id>`。本 PR 变基到该变更之上,并把打印的提示(以及 `src/tau_coding/tui/app.py` 中对应的内部消息 `--resume and --new-session cannot be used together`)更新为使用 `--session`:

```text
To resume this session: tau --session <session-id>
```

## 测试(Testing)

```bash
uv run pytest tests/test_cli.py tests/test_tui_app.py
```

[原文]
Manual smoke test:

[译文]
手动冒烟测试:

```bash
tau -p "hello"                                 # print mode, text output
tau -p --mode json "hello"                     # print mode, JSON output
tau --mode json "hello"                        # --mode alone also triggers print mode
cat README.md | tau -p "summarize this"        # stdin merged into the prompt
cat README.md | tau -p                          # stdin alone as the prompt
tau -e ./my-extension.py "hello"               # load an extension
tau --export <session-id> out.html             # export via the flag form
tau --session <session-id>                     # resume a session
tau -v                                          # short version flag
tau --resume x / --prompt x / --output json / -x . # all error with a migration hint
```
