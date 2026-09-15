---
title: "CLI reference / CLI 参考"
description: "Every Tau command-line command and flag. / Tau 全部命令行子命令与 flag。"
---

[原文]
The `tau` command launches the interactive TUI by default; subcommands and flags
cover everything else.

[译文]
`tau` 命令默认启动交互式 TUI;其余功能由子命令与 flag 覆盖。

```text
tau [OPTIONS] [PROMPT] [COMMAND] [ARGS]
```

[原文]
- With no arguments, `tau` opens the interactive [TUI]({{< relref "../guides/tui.md" >}}).
- A positional `PROMPT` opens the TUI and submits it as the first turn.
- `/local` is available in the TUI for registered local backends; print mode reports that setup is interactive-only.
- `-p/--print` (or `--mode`) runs that same positional prompt in [print mode]({{< relref "../guides/print-mode.md" >}}) instead of the TUI.
- Put flags before the prompt — Tau treats everything after the last recognized flag as prompt text, including tokens that look like flags.

[译文]
- 不带参数时,`tau` 打开交互式 [TUI]({{< relref "../guides/tui.md" >}})。
- 位置参数 `PROMPT` 会打开 TUI,并把它作为第一轮提交。
- TUI 中可用 `/local` 管理已注册的本地后端;print 模式会提示该配置只能在交互模式下进行。
- `-p/--print`(或 `--mode`)会把同一个位置提示词放在 [print 模式]({{< relref "../guides/print-mode.md" >}})中运行,而不是 TUI。
- 请把 flag 放在提示词之前 —— Tau 把最后一个被识别的 flag 之后的所有内容都当作提示词文本,包括看起来像 flag 的 token。

[原文]
On TUI and text print-mode startup, Tau may show a non-blocking notice when a
newer `tau-ai` release is available on PyPI. In the TUI, this notice is the first
transcript item and appears in bright yellow. Run `tau update` to upgrade. Disable
the check with `TAU_NO_UPDATE_CHECK=1`; utility commands such as `tau --version`,
`tau update`, `tau sessions`, and `tau export` do not run it. After an upgrade,
the TUI also adds a one-time release-notes message to the transcript with the new
features and fixes.

[译文]
在 TUI 与文本 print 模式启动时,如果 PyPI 上有更新的 `tau-ai` 版本,Tau 可能显示一条非阻塞提示。在 TUI 中,该提示是会话记录的第一项,并以亮黄色显示。运行 `tau update` 进行升级。用 `TAU_NO_UPDATE_CHECK=1` 关闭该检查;`tau --version`、`tau update`、`tau sessions` 与 `tau export` 这类实用命令不会执行它。升级之后,TUI 还会在会话记录中加入一条一次性的发布说明消息,列出新功能与修复。

## 子命令(Commands)

[原文]
| Command | What it does |
| --- | --- |
| `tau` | Open the interactive TUI |
| `tau "<prompt>"` | Open the TUI with an initial prompt |
| `tau update` | Upgrade Tau with the installer that owns its environment. Windows uv-tool updates are handed off and begin after Tau exits; follow the printed log path for the final result. |
| `tau update --models` | Force-refresh models.dev catalogs and cache them in `~/.tau/models-store.json` without upgrading Tau. |
| `tau install <source> [--force]` | Install a trusted local or Git extension under `~/.tau/extensions/`; `--force` replaces an existing install. |
| `tau sessions` | List indexed sessions (id, title, model, cwd) |
| `tau export <ref> [dest] [--format html\|jsonl]` | Export a session id or JSONL path (HTML default) |
| `tau --export <ref> [dest]` | Same as `tau export`, as a top-level flag |
| `tau providers` | List configured providers and how each authenticates |
| `tau [setup options] setup` | Create/update an OpenAI-compatible provider |

[译文]
| 子命令 | 作用 |
| --- | --- |
| `tau` | 打开交互式 TUI |
| `tau "<prompt>"` | 打开 TUI 并带上一条初始提示词 |
| `tau update` | 用拥有其环境的安装器升级 Tau。Windows 上的 uv-tool 升级会被交接,并在 Tau 退出后开始;最终结果请查看打印出的日志路径。 |
| `tau update --models` | 强制刷新 models.dev 目录并缓存到 `~/.tau/models-store.json`,而不升级 Tau。 |
| `tau install <source> [--force]` | 把一个受信的本地扩展或 Git 扩展安装到 `~/.tau/extensions/` 下;`--force` 会替换已有安装。 |
| `tau sessions` | 列出已索引的会话(id、标题、模型、cwd) |
| `tau export <ref> [dest] [--format html\|jsonl]` | 导出会话 id 或 JSONL 路径(默认 HTML) |
| `tau --export <ref> [dest]` | 与 `tau export` 相同,但作为顶层 flag |
| `tau providers` | 列出已配置的 provider 以及各自的认证方式 |
| `tau [setup options] setup` | 创建/更新一个 OpenAI 兼容的 provider |

## Flag(Options)

[原文]
| Flag | Description |
| --- | --- |
| `-p, --print` | Run the positional prompt in non-interactive print mode |
| `-m, --model TEXT` | Model to request from the provider |
| `--provider TEXT` | Configured provider name to use |
| `-t, --thinking LEVEL` | Initial [thinking level]({{< relref "../guides/context.md#thinking-modes" >}}) for this run (`off`…`max`); overrides remembered defaults without persisting, errors if the model doesn't support it |
| `--cwd PATH` | Working directory for the built-in tools |
| `--mode [text\|json\|transcript\|rpc]` | Select headless output; `rpc` starts the JSONL subprocess protocol |
| `--session TEXT` | Resume a session id in the TUI or print mode |
| `--new-session` | Start a new session instead of resuming the default |
| `--session-id TEXT` | Set the exact id for a newly created print-mode session; errors if it already exists |
| `--system-prompt TEXT_OR_PATH` | Replace Tau's default system-prompt base with literal text or an existing UTF-8 file |
| `--append-system-prompt TEXT_OR_PATH` | Append literal text or an existing UTF-8 file (repeatable) |
| `--auto-compact-threshold INT` | Auto-compact above this rough token estimate |
| `-e, --extension PATH` | Load an [extension]({{< relref "../guides/extensions.md" >}}) file or directory (repeatable) |
| `--no-extensions` | Disable extension directory discovery (explicit `-e` paths still load) |
| `--project-extensions` | Also load trusted `<project>/.tau/extensions`; project trust and this code opt-in are both required |
| `-a, --approve` | Trust protected project inputs for this invocation only |
| `-na, --no-approve` | Decline protected project inputs for this invocation only |
| `-v, --version` | Print the version and exit |

[译文]
| Flag | 说明 |
| --- | --- |
| `-p, --print` | 以非交互式 print 模式运行位置提示词 |
| `-m, --model TEXT` | 向 provider 请求使用的模型 |
| `--provider TEXT` | 要使用的已配置 provider 名称 |
| `-t, --thinking LEVEL` | 本次运行的初始 [thinking 等级]({{< relref "../guides/context.md#thinking-modes" >}})(`off`…`max`);会覆盖已记住的默认值但不持久化,模型不支持时报错 |
| `--cwd PATH` | 内置工具的工作目录 |
| `--mode [text\|json\|transcript\|rpc]` | 选择无头输出;`rpc` 启动 JSONL 子进程协议 |
| `--session TEXT` | 在 TUI 或 print 模式中恢复某个会话 id |
| `--new-session` | 新建会话,而不是恢复默认会话 |
| `--session-id TEXT` | 为新建的 print 模式会话指定确切的 id;若已存在则报错 |
| `--system-prompt TEXT_OR_PATH` | 用字面文本或一个已存在的 UTF-8 文件替换 Tau 默认的系统提示词基底 |
| `--append-system-prompt TEXT_OR_PATH` | 追加字面文本或一个已存在的 UTF-8 文件(可重复) |
| `--auto-compact-threshold INT` | 超过这个粗略 token 估算值时自动压缩 |
| `-e, --extension PATH` | 加载一个[扩展]({{< relref "../guides/extensions.md" >}})文件或目录(可重复) |
| `--no-extensions` | 关闭扩展目录发现(显式的 `-e` 路径仍会加载) |
| `--project-extensions` | 同时加载受信的 `<project>/.tau/extensions`;项目信任与此代码级选择加入两者都必须满足 |
| `-a, --approve` | 仅对本次调用信任受保护的项目输入 |
| `-na, --no-approve` | 仅对本次调用拒绝受保护的项目输入 |
| `-v, --version` | 打印版本并退出 |

[原文]
`tau install` accepts local Python files, local package directories, Pi-style
`git:github.com/owner/repository[@ref]` sources, and normal HTTP/SSH Git URLs.
See [Extensions]({{< relref "../guides/extensions.md#install-an-extension" >}})
for package-layout, dependency, and security details.

[译文]
`tau install` 接受本地 Python 文件、本地包目录、Pi 风格的 `git:github.com/owner/repository[@ref]` 来源,以及常规的 HTTP/SSH Git URL。包布局、依赖与安全细节见[扩展]({{< relref "../guides/extensions.md#install-an-extension" >}})。

[原文]
`--approve` and `--no-approve` are mutually exclusive and never write the
trust store. See [Project trust]({{< relref "../guides/project-trust.md" >}})
for interactive scopes, headless defaults, protected resources, and the
non-sandbox boundary.

[译文]
`--approve` 与 `--no-approve` 互斥,且绝不会写入信任存储。交互式作用域、无头默认值、受保护资源与非沙箱边界见[项目信任]({{< relref "../guides/project-trust.md" >}})。

### 系统提示词输入(System prompt input)

[原文]
`--system-prompt` replaces Tau's default base prompt. Repeat
`--append-system-prompt` to add sections in command-line order; Tau separates each
resolved value with exactly one blank line. Put these flags before the positional
prompt, like other recognized options:

```bash
tau --system-prompt "You are a focused reviewer." \
  --append-system-prompt ./team-rules.md \
  --append-system-prompt "Report risky changes first." \
  -p "review this repository"
```

[译文]
`--system-prompt` 替换 Tau 默认的基底提示词。重复使用 `--append-system-prompt` 可按命令行顺序追加区块;Tau 会用恰好一个空行分隔每个已解析的值。与其他被识别的选项一样,请把这些 flag 放在位置提示词之前:

[原文]
For either option, Tau reads the value as a UTF-8 file when that path exists.
Otherwise it uses the value verbatim, so a nonexistent path is literal prompt
text. Existing directories, unreadable files, and invalid UTF-8 files stop
startup with an error naming the option and path. `~` is expanded when checking
for a file.

[译文]
对这两个选项,Tau 在该路径存在时会把值作为 UTF-8 文件读取。否则就按字面使用该值,因此不存在的路径会被当作字面的提示词文本。已存在的目录、不可读的文件以及无效的 UTF-8 文件会让启动中止,并报出指明该选项与路径的错误。检查文件是否存在时会展开 `~`。

[原文]
A custom base still receives appended text, discovered project instructions,
eligible skills when the `read` tool is enabled, the current date, and the
working directory. The options apply to print mode and interactive startup;
when used with `--session`, they configure the resumed session's next provider
request. They are startup controls and are not stored in session history, so
pass them again on a later resume when needed.

[译文]
自定义基底仍然会接收追加文本、发现到的项目指令、`read` 工具启用时符合条件的技能、当前日期与工作目录。这些选项作用于 print 模式与交互式启动;与 `--session` 一起使用时,它们配置的是被恢复会话的下一次 provider 请求。它们是启动控制项,不存储在会话历史中,因此需要时请在之后的恢复中再次传入。

[原文]
Tau also discovers `SYSTEM.md` and `APPEND_SYSTEM.md` under the project or user
`.tau` directory. A CLI replacement wins over trusted project and user
`SYSTEM.md` files. Append content is cumulative: user `APPEND_SYSTEM.md`, then
trusted project `APPEND_SYSTEM.md`, then repeated CLI values. Use `/reload` after
changing a file. These are Tau-specific configuration files, not `.agents`
resources. See
[Configuration & files]({{< relref "./configuration.md#system-prompt-files" >}})
for paths, precedence, diagnostics, and the project-resource security warning.

[译文]
Tau 还会在项目或用户的 `.tau` 目录下发现 `SYSTEM.md` 与 `APPEND_SYSTEM.md`。CLI 替换优先于受信项目与用户的 `SYSTEM.md` 文件。追加内容是累积的:先用户 `APPEND_SYSTEM.md`,再受信项目 `APPEND_SYSTEM.md`,最后是重复传入的 CLI 值。修改文件后请使用 `/reload`。这些是 Tau 特有的配置文件,不是 `.agents` 资源。路径、优先级、诊断与项目资源安全警告见[配置与文件]({{< relref "./configuration.md#system-prompt-files" >}})。

### 在 print 模式中恢复会话(Resume in print mode)

[原文]
Use `--print` and `--session` together to append a non-interactive follow-up to
an existing conversation. Tau loads the session's saved working directory,
provider, model, and conversation history:

```bash
tau --print --session <session-id> "Follow-up message"
```

[译文]
把 `--print` 与 `--session` 一起使用,可以向既有对话追加一条非交互式的后续消息。Tau 会加载该会话保存的工作目录、provider、模型与对话历史:

[原文]
Explicit `--provider`, `--model`, and system-prompt options override the saved
startup choices for this invocation. After configuring a local backend in the
TUI, pass its provider and exact discovered model explicitly in print mode:

```bash
tau --provider llama.cpp --model <model-id> --print "summarize this project"
```

[译文]
显式的 `--provider`、`--model` 与系统提示词选项会为本次调用覆盖已保存的启动选择。在 TUI 中配置好本地后端之后,请在 print 模式中显式传入它的 provider 与发现到的确切模型:

[原文]
Tau does not run `/local` setup or select a model implicitly headlessly. An
endpoint-keyed safe snapshot can let an explicit local startup continue while
llama.cpp is temporarily down; a first-time explicit model still needs discovery.
`--session` cannot be combined with
`--new-session` or `--session-id`. An unknown session id exits with an error.

[译文]
Tau 不会在无头模式下运行 `/local` 配置,也不会隐式选择模型。以端点作为键的安全快照可以让显式的本地启动在 llama.cpp 临时停机期间继续;首次使用的显式模型仍需完成发现。`--session` 不能与 `--new-session` 或 `--session-id` 组合使用。未知的会话 id 会以错误退出。

[原文]
`--resume`, `--prompt`, `-o/--output`, and `-x` are removed; each now exits
with an error naming its replacement (`--session`, `--print`, `--mode`, and
`-e/--extension`, respectively).

[译文]
`--resume`、`--prompt`、`-o/--output` 与 `-x` 已被移除;现在使用它们会以错误退出,并指出各自的替代项(依次为 `--session`、`--print`、`--mode` 与 `-e/--extension`)。

### Provider 配置选项(Provider setup options)

[原文]
Tau's setup mode registers an OpenAI-compatible provider. Put these flags before the final `setup` argument:

[译文]
Tau 的 setup 模式会注册一个 OpenAI 兼容的 provider。请把这些 flag 放在最后的 `setup` 参数之前:

[原文]
| Flag | Default | Description |
| --- | --- | --- |
| `--provider TEXT` | `openai` | Provider name to create/update |
| `--model TEXT` | default model | Default model for the provider |
| `--base-url TEXT` | OpenAI URL | OpenAI-compatible base URL |
| `--api-key-env TEXT` | `OPENAI_API_KEY` | Env var holding the API key |
| `--timeout-seconds FLOAT` | `60.0` | HTTP timeout |
| `--max-retries INT` | `2` | Retry count for transient failures |
| `--max-retry-delay-seconds FLOAT` | `1.0` | Delay between retries |
| `--set-default / --no-set-default` | set-default | Make this the default provider |

[译文]
| Flag | 默认值 | 说明 |
| --- | --- | --- |
| `--provider TEXT` | `openai` | 要创建/更新的 provider 名称 |
| `--model TEXT` | 默认模型 | 该 provider 的默认模型 |
| `--base-url TEXT` | OpenAI URL | OpenAI 兼容的 base URL |
| `--api-key-env TEXT` | `OPENAI_API_KEY` | 存放 API 密钥的环境变量 |
| `--timeout-seconds FLOAT` | `60.0` | HTTP 超时 |
| `--max-retries INT` | `2` | 瞬时故障的重试次数 |
| `--max-retry-delay-seconds FLOAT` | `1.0` | 重试之间的延迟 |
| `--set-default / --no-set-default` | set-default | 把它设为默认 provider |

[原文]
Example:

```bash
tau --provider local \
  --base-url http://localhost:11434/v1 \
  --api-key-env LOCAL_API_KEY \
  --model qwen \
  setup
```

[译文]
示例:

[原文]
See also: [RPC protocol]({{< relref "./rpc.md" >}}), [Slash commands]({{< relref "./slash-commands.md" >}}) (in-session), and
[Keyboard shortcuts]({{< relref "./keybindings.md" >}}).

[译文]
另见:[RPC 协议]({{< relref "./rpc.md" >}})、[斜杠命令]({{< relref "./slash-commands.md" >}})(会话内)与[键盘快捷键]({{< relref "./keybindings.md" >}})。
