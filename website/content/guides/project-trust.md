---
title: "Project trust / 项目信任"
description: "Control ambient repository inputs before Tau loads them. / 在 Tau 加载之前,控制来自仓库环境的各种输入。"
---

[原文]
Tau asks before loading protected inputs discovered because of the active working
directory. The decision is keyed to the canonical, existing cwd—not a guessed
repository root. Symlink aliases therefore share a decision, and the nearest
saved parent decision is inherited.

[译文]
对于因为当前工作目录而被发现的受保护输入,Tau 会在加载之前询问。该决策以规范的、实际存在的 cwd 为键 —— 而不是猜测出来的仓库根目录。因此符号链接别名会共享同一个决策,并且会继承最近一次保存的父级决策。

## 受保护的输入(Protected inputs)

[原文]
Tau gates project `.tau` and `.agents` skills and prompts, `.tau` themes,
`SYSTEM.md` and `APPEND_SYSTEM.md`, plain and scoped `AGENTS.md`, project
extension candidates, and project `settings.json` reserved for future support.

[译文]
Tau 会门控项目中的 `.tau` 与 `.agents` 技能和提示词、`.tau` 主题、`SYSTEM.md` 与 `APPEND_SYSTEM.md`、普通的与 scoped 的 `AGENTS.md`、项目扩展候选,以及为将来支持而保留的项目 `settings.json`。

[原文]
Built-in local backends are trusted package code. They load independently of
project trust and do not make an ambient endpoint, model snapshot, or credential
into project input. Their provider/backend registrations remain owned by the
active runtime generation; project extensions cannot reset them without the
normal source and trust rules.
Detection checks names and metadata only; Tau does not read, parse, or import a
candidate before deciding.

[译文]
内置本地后端是受信的包代码。它们的加载与项目信任无关,并且不会把环境中的端点、模型快照或凭据变成项目输入。它们的 provider/后端注册仍归当前活动运行时代际所有;没有遵循常规的来源与信任规则,项目扩展无法重置它们。检测只检查名称与元数据;在做出决策之前,Tau 不读取、不解析、也不导入任何候选。

[原文]
User resources under `~/.tau` and `~/.agents`, built-ins, and paths explicitly
passed on the CLI remain eligible. Trusted built-in extensions are installed Tau
package code rather than cwd discovery: they load before the decision, even with
`--no-extensions`, and their presence alone never creates a trust prompt. Trusted
project extensions still require the additional `--project-extensions` opt-in.

[译文]
`~/.tau` 与 `~/.agents` 下的用户资源、内置资源,以及 CLI 上显式传入的路径仍然符合条件。受信的内置扩展是已安装的 Tau 包代码,而不是通过 cwd 发现的:它们在决策之前就会加载 —— 即使带 `--no-extensions` 也是如此 —— 而且仅凭它们的存在绝不会产生信任提示。受信的项目扩展仍然需要额外的 `--project-extensions` 选择加入。

## 决策(Decisions)

[原文]
Interactive startup offers:

[译文]
交互式启动提供以下选项:

[原文]
- trust this exact folder and save it;
- trust the displayed immediate parent and save it;
- trust for this run only;
- decline this exact folder and save it;
- decline for this run only.

[译文]
- 信任这个确切的文件夹并保存该决策;
- 信任所显示的上一级父目录并保存该决策;
- 仅本次运行信任;
- 拒绝这个确切的文件夹并保存该决策;
- 仅本次运行拒绝。

[原文]
Escape/cancel exits Tau during startup without loading the project. During
`/reload` or cross-project session replacement, cancellation preserves the
current session snapshot and keeps Tau open.
Saved decisions live in `~/.tau/trust.json`, version 1. Tau validates the whole
file and updates it under a lock with restrictive permissions and atomic
replacement. A malformed, unreadable, locked, or unwritable store never grants
saved trust. Run-only approval remains available with `--approve`.

[译文]
在启动阶段按 Escape/取消会退出 Tau,且不加载该项目。在 `/reload` 或跨项目的会话替换期间,取消会保留当前会话快照并让 Tau 保持打开。已保存的决策存放在 `~/.tau/trust.json`,版本 1。Tau 会校验整个文件,并在加锁、限制性权限与原子替换之下更新它。畸形、不可读、被锁定或不可写的存储永远不会授予已保存的信任。仅本次运行的批准仍然可以通过 `--approve` 获得。

[原文]
A child decision overrides an inherited parent decision. Parent trust is broad:
Tau displays the exact parent before selection. There is no automatic cleanup
when a project moves.

[译文]
子级决策会覆盖继承来的父级决策。父级信任范围很宽:Tau 会在选择之前显示确切的父目录。项目被移动时不会自动清理。

## 无头模式与自动化(Headless and automation)

[原文]
`--approve` (`-a`) and `--no-approve` (`-na`) are mutually exclusive, apply only
to the invocation, and never edit the store. Print, JSON, transcript, and other
headless paths never prompt. Their unresolved behavior follows the user-global
`defaultProjectTrust` setting:

[译文]
`--approve`(`-a`)与 `--no-approve`(`-na`)互斥,只对本次调用生效,且绝不编辑存储。print、JSON、transcript 以及其他无头路径绝不弹出提示。它们未获解决时的行为遵循用户全局的 `defaultProjectTrust` 设置:

[原文]
| Value | Headless result |
| --- | --- |
| `ask` (default) | decline |
| `always` | approve |
| `never` | decline |

[译文]
| 取值 | 无头模式下的结果 |
| --- | --- |
| `ask`(默认) | 拒绝 |
| `always` | 批准 |
| `never` | 拒绝 |

[原文]
Trust diagnostics use stderr in structured modes, so stdout remains machine
readable. They report bounded category/count and decision-source information,
not protected contents.

[译文]
在结构化模式下,信任诊断走 stderr,因此 stdout 仍保持机器可读。它们报告有界的类别/数量与决策来源信息,而不是受保护的内容。

## Reload 与会话(Reload and sessions)

[原文]
`/reload` detects again. An initially empty project that gains protected inputs
requires a new decision; Tau never infers durable trust from the earlier empty
state. Resource preparation is coherent: decline builds a global/explicit-only
snapshot. Resume and replacement resolve the destination record's canonical cwd
instead of reusing the source project's outcome.

[译文]
`/reload` 会重新检测。起初为空、后来才获得受保护输入的项目需要重新做出决策;Tau 绝不会从早先的空状态推断出持久信任。资源准备是自洽的:拒绝会构建一份仅含全局/显式资源的快照。恢复与替换会解析目标记录的规范 cwd,而不是复用来源项目的判定结果。

## 内置本地后端的安全(Built-in local-backend security)

[原文]
The bundled `llama.cpp` backend is trusted Tau package code. It loads before the
project-trust decision, including with `--no-extensions`, and never creates a
trust prompt. After backend confirmation, `/local` probes only its entered,
saved, `LLAMA_BASE_URL`, or default endpoint; it does not scan ports, processes,
or the local network. Tau never starts/stops the external server or deletes
model files. Explicit downloads are performed by the independent llama.cpp
router, not Tau's filesystem code.

[译文]
随包提供的 `llama.cpp` 后端是受信的 Tau 包代码。它在项目信任决策之前加载 —— 带 `--no-extensions` 时也是如此 —— 并且绝不产生信任提示。后端确认之后,`/local` 只探测其录入的、已保存的、`LLAMA_BASE_URL` 指定的或默认的端点;它不扫描端口、进程或本地网络。Tau 绝不启动/停止外部服务器,也不删除模型文件。显式下载由独立的 llama.cpp router 执行,而不是 Tau 的文件系统代码。

[原文]
The safe integration snapshot at `~/.tau/state/extensions/llama.cpp.json`
contains only the normalized endpoint, exact model IDs, allowlisted metadata,
and a timestamp. API keys are kept separately in `~/.tau/credentials.json` or
read from `LLAMA_API_KEY`; no key means no `Authorization` header. Secrets do
not enter snapshots, sessions, exports, or diagnostics. Resetting settings and
deleting a stored credential are separate confirmations. See the [local
inference guide]({{< relref "./local-inference.md" >}}) for troubleshooting.

[译文]
位于 `~/.tau/state/extensions/llama.cpp.json` 的安全集成快照只包含规范化后的端点、确切的模型 ID、经白名单筛选的元数据以及一个时间戳。API 密钥单独保存在 `~/.tau/credentials.json`,或从 `LLAMA_API_KEY` 读取;没有密钥就不发送 `Authorization` 头。密钥不会进入快照、会话、导出或诊断。重置设置与删除已存储凭据是两个彼此独立的确认。排障见[本地推理指南]({{< relref "./local-inference.md" >}})。

[原文]
The built-in integration does not import or rewrite an existing `llama-cpp`
catalog entry. Configure `llama.cpp` separately through `/local`; Ollama and
other local servers remain on the manual custom-provider path.

[译文]
内置集成不会导入或改写已存在的 `llama-cpp` 目录条目。请通过 `/local` 单独配置 `llama.cpp`;Ollama 与其他本地服务器仍走手动自定义 provider 路径。

## 安全边界(Security boundary)

[原文]
**Project trust is an input-loading guard, not a sandbox.** It does not restrict
filesystem reads/writes, processes, shell commands, tools, network access,
credentials, providers, models, package installation, prompt injection, or data
exfiltration. A trusted project may still be malicious. Use an OS sandbox,
container, VM, remote environment, and restricted credentials/network when you
need isolation.

[译文]
**项目信任是一道输入加载护栏,而不是沙箱。** 它不限制文件系统读写、进程、shell 命令、工具、网络访问、凭据、provider、模型、包安装、提示词注入或数据外泄。一个受信的项目仍可能是恶意的。当你需要隔离时,请使用操作系统沙箱、容器、虚拟机、远程环境,以及受限的凭据/网络。
