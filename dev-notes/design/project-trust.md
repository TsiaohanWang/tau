# 项目信任:兼容性调研与 Tau 设计 / Project trust: compatibility research and Tau design

[原文]
Status: **design only**. Tau does not implement this policy yet.

[译文]
状态:**仅设计**。Tau 尚未实现该策略。

[原文]
This note is the implementation plan for the documentation-first phase of
[issue #535](https://github.com/huggingface/tau/issues/535). It explains the
problem from first principles, records Pi's production behavior, audits Tau's
current behavior, and fixes the intended Tau design before runtime code changes.

[译文]
本文是 [issue #535](https://github.com/huggingface/tau/issues/535)「文档先行」阶段的实施方案。它从第一性原理出发解释该问题,记录 Pi 的生产行为,审计 Tau 的当前行为,并在改动运行时代码之前把 Tau 预期设计固定下来。

[原文]
A repository can currently influence Tau merely because Tau starts in that
repository. Project trust will put a decision in front of that implicit input
loading. It is not a judgment that every file in the repository is safe.

[译文]
目前,一个仓库仅仅因为 Tau 在其中启动就能影响 Tau。项目信任将在这类隐式输入加载之前加上一道决策。它并不是对「仓库中每个文件都安全」的判断。

## 兼容性基线与研究方法(Compatibility baseline and research method)

[原文]
Pi was inspected at the exact revision below on **2026-08-03**:

[译文]
Pi 于 **2026-08-03** 在以下确切修订上被检查:

[原文]
- repository: [`earendil-works/pi`](https://github.com/earendil-works/pi)
- commit: [`fa07e7bd92c90a0210a269354733c274e9fc11e6`](https://github.com/earendil-works/pi/commit/fa07e7bd92c90a0210a269354733c274e9fc11e6)
- commit date: 2026-08-03 19:57:44 UTC

[译文]
- 仓库:[`earendil-works/pi`](https://github.com/earendil-works/pi)
- 提交:[`fa07e7bd92c90a0210a269354733c274e9fc11e6`](https://github.com/earendil-works/pi/commit/fa07e7bd92c90a0210a269354733c274e9fc11e6)
- 提交日期:2026-08-03 19:57:44 UTC

[原文]
The references below are commit-pinned and inspectable:

[译文]
下面的引用都固定到具体提交且可检查:

[原文]
- [`docs/security.md`](https://github.com/earendil-works/pi/blob/fa07e7bd92c90a0210a269354733c274e9fc11e6/packages/coding-agent/docs/security.md)
  is Pi's concise user-facing contract.
- [`core/trust-manager.ts`](https://github.com/earendil-works/pi/blob/fa07e7bd92c90a0210a269354733c274e9fc11e6/packages/coding-agent/src/core/trust-manager.ts)
  detects resources, canonicalizes keys, searches ancestors, and reads/writes
  `trust.json`.
- [`core/project-trust.ts`](https://github.com/earendil-works/pi/blob/fa07e7bd92c90a0210a269354733c274e9fc11e6/packages/coding-agent/src/core/project-trust.ts)
  defines decision ordering, defaults, extension participation, and the startup
  choices.
- [`core/resource-loader.ts`](https://github.com/earendil-works/pi/blob/fa07e7bd92c90a0210a269354733c274e9fc11e6/packages/coding-agent/src/core/resource-loader.ts)
  implements pre-trust and final resource-loading passes.
- [`core/settings-manager.ts`](https://github.com/earendil-works/pi/blob/fa07e7bd92c90a0210a269354733c274e9fc11e6/packages/coding-agent/src/core/settings-manager.ts)
  prevents project settings from loading while untrusted.
- [`src/main.ts`](https://github.com/earendil-works/pi/blob/fa07e7bd92c90a0210a269354733c274e9fc11e6/packages/coding-agent/src/main.ts)
  establishes bootstrap and session-cwd ordering.
- [`cli/project-trust.ts`](https://github.com/earendil-works/pi/blob/fa07e7bd92c90a0210a269354733c274e9fc11e6/packages/coding-agent/src/cli/project-trust.ts)
  limits trust UI exposed to extensions to interactive startup.
- [`interactive-mode.ts`](https://github.com/earendil-works/pi/blob/fa07e7bd92c90a0210a269354733c274e9fc11e6/packages/coding-agent/src/modes/interactive/interactive-mode.ts)
  contains `/trust`, reload, and resume integration.
- [`core/agent-session-runtime.ts`](https://github.com/earendil-works/pi/blob/fa07e7bd92c90a0210a269354733c274e9fc11e6/packages/coding-agent/src/core/agent-session-runtime.ts)
  recreates cwd-bound services when replacing a session.
- [`examples/extensions/project-trust.ts`](https://github.com/earendil-works/pi/blob/fa07e7bd92c90a0210a269354733c274e9fc11e6/packages/coding-agent/examples/extensions/project-trust.ts)
  demonstrates extension decisions and session-only results.
- [`test/trust-manager.test.ts`](https://github.com/earendil-works/pi/blob/fa07e7bd92c90a0210a269354733c274e9fc11e6/packages/coding-agent/test/trust-manager.test.ts)
  verifies persistence inheritance and trigger detection.

[译文]
- [`docs/security.md`](https://github.com/earendil-works/pi/blob/fa07e7bd92c90a0210a269354733c274e9fc11e6/packages/coding-agent/docs/security.md) 是 Pi 简洁的面向用户契约。
- [`core/trust-manager.ts`](https://github.com/earendil-works/pi/blob/fa07e7bd92c90a0210a269354733c274e9fc11e6/packages/coding-agent/src/core/trust-manager.ts) 负责资源检测、键的规范化、祖先查找,以及 `trust.json` 的读写。
- [`core/project-trust.ts`](https://github.com/earendil-works/pi/blob/fa07e7bd92c90a0210a269354733c274e9fc11e6/packages/coding-agent/src/core/project-trust.ts) 定义决策顺序、默认值、扩展参与方式与启动选项。
- [`core/resource-loader.ts`](https://github.com/earendil-works/pi/blob/fa07e7bd92c90a0210a269354733c274e9fc11e6/packages/coding-agent/src/core/resource-loader.ts) 实现「信任前」与「最终」两轮资源加载。
- [`core/settings-manager.ts`](https://github.com/earendil-works/pi/blob/fa07e7bd92c90a0210a269354733c274e9fc11e6/packages/coding-agent/src/core/settings-manager.ts) 在未受信时阻止项目设置加载。
- [`src/main.ts`](https://github.com/earendil-works/pi/blob/fa07e7bd92c90a0210a269354733c274e9fc11e6/packages/coding-agent/src/main.ts) 确立引导与「会话 cwd」的顺序。
- [`cli/project-trust.ts`](https://github.com/earendil-works/pi/blob/fa07e7bd92c90a0210a269354733c274e9fc11e6/packages/coding-agent/src/cli/project-trust.ts) 把暴露给扩展的信任 UI 限制在交互式启动中。
- [`interactive-mode.ts`](https://github.com/earendil-works/pi/blob/fa07e7bd92c90a0210a269354733c274e9fc11e6/packages/coding-agent/src/modes/interactive/interactive-mode.ts) 包含 `/trust`、reload 与 resume 的集成。
- [`core/agent-session-runtime.ts`](https://github.com/earendil-works/pi/blob/fa07e7bd92c90a0210a269354733c274e9fc11e6/packages/coding-agent/src/core/agent-session-runtime.ts) 在替换会话时重建绑定 cwd 的服务。
- [`examples/extensions/project-trust.ts`](https://github.com/earendil-works/pi/blob/fa07e7bd92c90a0210a269354733c274e9fc11e6/packages/coding-agent/examples/extensions/project-trust.ts) 演示扩展决策与会话级结果。
- [`test/trust-manager.test.ts`](https://github.com/earendil-works/pi/blob/fa07e7bd92c90a0210a269354733c274e9fc11e6/packages/coding-agent/test/trust-manager.test.ts) 验证持久化继承与触发检测。

[原文]
These references describe that revision, not an assumed timeless Pi contract.

[译文]
这些引用描述的是那个具体修订,而不是一个假定永恒不变的 Pi 契约。

## Pi 的生产行为(Pi's production behavior)

### 什么会触发决策(What triggers a decision)

[原文]
Pi first asks whether the cwd has a resource that needs trust. A bare `.pi`
directory does not trigger anything. At the inspected revision, these entries do:

[译文]
Pi 首先判断 cwd 是否存在需要信任的资源。一个空的 `.pi` 目录不会触发任何东西。在被检查的修订上,以下条目会触发:

[原文]
- `<cwd>/.pi/settings.json`
- `<cwd>/.pi/extensions`
- `<cwd>/.pi/skills`
- `<cwd>/.pi/prompts`
- `<cwd>/.pi/themes`
- `<cwd>/.pi/SYSTEM.md`
- `<cwd>/.pi/APPEND_SYSTEM.md`
- `.agents/skills` in the cwd or any ancestor, except the user's own
  `~/.agents/skills`

[译文]
- `<cwd>/.pi/settings.json`
- `<cwd>/.pi/extensions`
- `<cwd>/.pi/skills`
- `<cwd>/.pi/prompts`
- `<cwd>/.pi/themes`
- `<cwd>/.pi/SYSTEM.md`
- `<cwd>/.pi/APPEND_SYSTEM.md`
- cwd 或任意祖先目录中的 `.agents/skills`,但用户自己的 `~/.agents/skills` 除外

[原文]
For the `.pi` directories, existence is enough; they need not contain a valid
resource. This is why only a bare `.pi` directory is explicitly ignored.

[译文]
对于 `.pi` 下的这些目录,存在本身就足够;它们不必包含有效资源。这就是为什么只有「空的 `.pi` 目录」被明确忽略。

[原文]
If no trigger exists, `resolveProjectTrusted()` returns true without consulting
the store or prompting. Pi remembers this process-local outcome for that cwd.
Its interactive reload has special handling: if a previously empty project gains
a protected resource, Pi saves an implicit trusted decision after reload. Tau
will deliberately differ here; see [Reload](#reload).

[译文]
如果不存在触发项,`resolveProjectTrusted()` 会直接返回 true,既不查询存储也不提示。Pi 会为该 cwd 记住这个进程内的结果。它的交互式 reload 有特殊处理:如果此前为空的项目新增了受保护资源,Pi 会在 reload 之后保存一个隐式的「已信任」决策。Tau 在此有意做出区别;见 [Reload](#reload)。

### 受门控与不受门控的输入(Gated and ungated inputs)

[原文]
When trusted, Pi may load project settings, project `.pi` extensions, skills,
prompts, themes, `SYSTEM.md`, `APPEND_SYSTEM.md`, project package resources, and
install missing project packages. Project extensions and package extensions can
therefore execute only after approval.

[译文]
在受信状态下,Pi 可以加载项目设置、项目 `.pi` 扩展、技能、提示词、主题、`SYSTEM.md`、`APPEND_SYSTEM.md`、项目包资源,并安装缺失的项目包。因此,项目扩展与包扩展只能在批准之后执行。

[原文]
Before the decision, Pi loads only:

[译文]
在决策之前,Pi 只加载:

[原文]
- global `AGENTS.md`/`CLAUDE.md` and ancestor context files;
- user/global extensions;
- extensions passed explicitly with CLI `-e`;
- inline application extensions.

[译文]
- 全局 `AGENTS.md`/`CLAUDE.md` 与祖先上下文文件;
- 用户/全局扩展;
- 通过 CLI `-e` 显式传入的扩展;
- 内联的应用扩展。

[原文]
Those pre-trust extensions can participate in the decision. Project extensions
cannot decide whether they themselves should run.

[译文]
这些「信任前」扩展可以参与决策。项目扩展不能决定自己是否应当运行。

[原文]
Pi deliberately leaves `AGENTS.md` and `CLAUDE.md` context ungated unless
context loading is disabled. Explicit CLI resource paths also remain eligible;
they represent a direct user instruction rather than ambient discovery.

[译文]
Pi 有意让 `AGENTS.md` 与 `CLAUDE.md` 上下文不受门控,除非上下文加载被禁用。显式的 CLI 资源路径也仍然可用;它们代表用户的直接指令,而不是环境中的自动发现。

### 规范化路径、祖先与持久化(Canonical paths, ancestors, and persistence)

[原文]
Pi stores decisions in `~/.pi/agent/trust.json`. Keys are canonical absolute cwd
paths. `resolvePath()` makes a path absolute and normalized; `canonicalizePath()`
uses `realpathSync()` to follow symlinks, falling back to the normalized raw path
if realpath fails.

[译文]
Pi 把决策存放在 `~/.pi/agent/trust.json`。键是规范化的绝对 cwd 路径。`resolvePath()` 把路径变为绝对且规范化;`canonicalizePath()` 使用 `realpathSync()` 跟随符号链接,若 realpath 失败则回退到规范化后的原始路径。

[原文]
Lookup starts at the canonical cwd and walks to the filesystem root. The nearest
entry whose value is `true` or `false` wins. Thus a child decision overrides a
parent decision. Choosing “Trust parent folder” writes trust for the immediate
canonical parent and removes an exact child decision so inheritance can apply.

[译文]
查找从规范化 cwd 开始,一路走到文件系统根。最近的、取值为 `true` 或 `false` 的条目获胜。因此子目录决策会覆盖父目录决策。选择「Trust parent folder」会为直接规范父目录写入信任,并移除精确的子目录决策,使继承得以生效。

[原文]
The file is a sorted JSON object whose values may be `true`, `false`, or `null`;
lookup ignores `null` (normal removal deletes the key). Pi validates the whole
object and uses a lock file for concurrent access. The inspected version writes
the destination directly rather than by atomic replacement and has no
schema-version field. Read/parse/validation/lock/write failures are errors; they
are not converted into approval.

[译文]
该文件是一个排序后的 JSON 对象,取值可以是 `true`、`false` 或 `null`;查找会忽略 `null`(正常的移除操作会删除该键)。Pi 会校验整个对象,并使用锁文件处理并发访问。被检查的版本直接写入目标文件,而不是做原子替换,也没有 schema 版本字段。读/解析/校验/加锁/写入失败都是错误;它们不会被转换为批准。

### 决策顺序、作用域与无头行为(Decision order, scopes, and headless behavior)

[原文]
Pi resolves in this order:

[译文]
Pi 按以下顺序解析:

[原文]
1. one-run `--approve`/`-a` or `--no-approve`/`-na` override;
2. no trigger means trusted;
3. first decisive pre-trust extension result;
4. nearest saved cwd/ancestor decision;
5. global `defaultProjectTrust`, defaulting to `ask`;
6. if still `ask`, prompt when UI exists, otherwise decline.

[译文]
1. 单次运行的 `--approve`/`-a` 或 `--no-approve`/`-na` 覆盖;
2. 没有触发项即视为受信;
3. 第一个决定性的「信任前」扩展结果;
4. 最近的已保存 cwd/祖先决策;
5. 全局 `defaultProjectTrust`,默认为 `ask`;
6. 若仍为 `ask`,存在 UI 时提示,否则拒绝。

[原文]
The startup prompt offers:

[译文]
启动提示提供:

[原文]
- trust this exact folder and save it;
- trust the immediate parent and save it;
- trust for this session only;
- do not trust this exact folder and save it;
- do not trust for this session only.

[译文]
- 信任这个确切的文件夹并保存;
- 信任直接父目录并保存;
- 仅本次会话信任;
- 不信任这个确切的文件夹并保存;
- 仅本次会话不信任。

[原文]
Cancellation is a safe decline. The interactive `/trust` selector later edits
saved exact/parent decisions, but says a restart is required; it does not mutate
the current session's loaded set.

[译文]
取消等同于安全地拒绝。交互式 `/trust` 选择器之后可以编辑已保存的精确/父目录决策,但会提示需要重启;它不会修改当前会话已加载的集合。

[原文]
Print, JSON, and RPC modes never prompt. With no extension or saved decision,
`ask` and `never` decline, while `always` approves. The CLI overrides apply for
one invocation and are not persisted. The argument parser rejects simultaneous
approve and no-approve flags.

[译文]
Print、JSON 与 RPC 模式从不提示。在没有扩展或已保存决策时,`ask` 与 `never` 都表示拒绝,而 `always` 表示批准。CLI 覆盖只对一次调用生效,不会持久化。参数解析器会拒绝同时传入 approve 与 no-approve。

### 引导、扩展与 cwd 变更(Bootstrap, extensions, and cwd changes)

[原文]
Pi initially creates a settings manager with `projectTrusted: false`, so its
first proxy bootstrap comes only from global settings. There is an important
implementation caveat at this revision: after migrations, `main.ts` creates a
second startup-cwd settings manager with the default `projectTrusted: true` and
uses it for startup session-directory lookup before final trust resolution.
Final cwd-bound runtime loading does enforce the trust split described below,
but this early startup-settings read is not a pattern Tau should copy.

[译文]
Pi 最初以 `projectTrusted: false` 创建一个设置管理器,因此它的第一次代理引导只来自全局设置。该修订上有一个重要的实现注意点:在迁移之后,`main.ts` 会以默认的 `projectTrusted: true` 创建第二个「启动 cwd」设置管理器,并在最终信任解析之前用它做启动时的会话目录查找。最终绑定 cwd 的运行时加载确实会执行下文所述的信任拆分,但这个早期启动设置的读取不是 Tau 应当照搬的模式。

[原文]
Pi chooses a session—including a session from another project—before creating
final cwd-bound runtime services. Final trust is therefore resolved against the
session's actual cwd, not blindly against the process's startup directory.

[译文]
Pi 在创建最终的、绑定 cwd 的运行时服务之前就先选定会话 —— 包括来自其他项目的会话。因此最终信任是针对会话实际的 cwd 解析的,而不是盲目针对进程的启动目录。

[原文]
The resource loader's first pass forces project settings off and loads global,
CLI, and inline extensions. It emits `project_trust`; the first extension to
return yes/no wins, while `undecided` falls through. `remember: true` saves the
exact cwd decision. Handler errors are diagnostics and do not approve. The
second pass applies the decision, reloads settings, resolves packages, loads the
final extension set, then loads skills, prompts, themes, context, and system
prompt files.

[译文]
资源加载器的第一轮强制关闭项目设置,并加载全局、CLI 与内联扩展。它发出 `project_trust`;第一个返回 yes/no 的扩展获胜,而 `undecided` 则继续向下。`remember: true` 会保存精确的 cwd 决策。处理器错误视为诊断,不构成批准。第二轮应用该决策、重载设置、解析包、加载最终扩展集,然后加载技能、提示词、主题、上下文与系统提示词文件。

[原文]
Session replacement recreates cwd-bound services. A TUI resume supplies an
interactive trust context for the destination cwd. Pi also caches outcomes by
cwd within the process, avoiding an unrelated cwd's decision while avoiding
repeat prompts for one cwd.

[译文]
会话替换会重建绑定 cwd 的服务。TUI 恢复会为目标 cwd 提供交互式信任上下文。Pi 还在进程内按 cwd 缓存结果,既避免误用无关 cwd 的决策,也避免对同一个 cwd 重复提示。

### 安全边界(Security boundary)

[原文]
Pi's own security document is explicit: project trust is only an input-loading
guard. Pi still runs with the user's permissions. It is not a filesystem,
process, shell, tool, network, package-manager, extension, credential, model, or
prompt-injection sandbox. Real isolation requires an OS, container, VM, or
similar boundary.

[译文]
Pi 自己的安全文档写得很明确:项目信任只是一道输入加载守卫。Pi 仍以用户的权限运行。它不是文件系统、进程、shell、工具、网络、包管理器、扩展、凭据、模型或提示词注入的沙箱。真正的隔离需要操作系统、容器、虚拟机或类似边界。

## `main` 上 Tau 的当前行为(Current Tau behavior on `main`)

[原文]
This section describes what exists **now**, separately from the proposal.
It was audited on 2026-08-03 at current Tau `main` commit
[`9fffc6938e1873e5430b66117b7ade078d779030`](https://github.com/huggingface/tau/commit/9fffc6938e1873e5430b66117b7ade078d779030).
The behavior-bearing source links below use its parent `cc179435`, before the
release-only version commit.

[译文]
本节描述**当前**已存在的东西,与提案分开。审计时间为 2026-08-03,基于当时 Tau `main` 的提交 [`9fffc6938e1873e5430b66117b7ade078d779030`](https://github.com/huggingface/tau/commit/9fffc6938e1873e5430b66117b7ade078d779030)。下面承载行为的源码链接使用其父提交 `cc179435`,即在仅改版本的发布提交之前。

[原文]
Tau has no unified project-trust decision or trust store. It does not expose
`--approve`, `--no-approve`, or `defaultProjectTrust`. Starting, reloading, or
resuming can load project Markdown without a trust prompt.

[译文]
Tau 没有统一的项目信任决策或信任存储。它不暴露 `--approve`、`--no-approve` 或 `defaultProjectTrust`。启动、reload 或恢复都可能在没有任何信任提示的情况下加载项目 Markdown。

[原文]
The current sources are inspectable at:

[译文]
当前源码可在以下位置查看:

[原文]
- [`resources.py`](https://github.com/huggingface/tau/blob/cc179435a4e4fb934d51c0032c36f8d46fcd811c/src/tau_coding/resources.py)
- [`context.py`](https://github.com/huggingface/tau/blob/cc179435a4e4fb934d51c0032c36f8d46fcd811c/src/tau_coding/context.py)
- [`session.py`](https://github.com/huggingface/tau/blob/cc179435a4e4fb934d51c0032c36f8d46fcd811c/src/tau_coding/session.py)
- [`paths.py`](https://github.com/huggingface/tau/blob/cc179435a4e4fb934d51c0032c36f8d46fcd811c/src/tau_coding/paths.py)
- [`extensions/loader.py`](https://github.com/huggingface/tau/blob/cc179435a4e4fb934d51c0032c36f8d46fcd811c/src/tau_coding/extensions/loader.py)
- [`shell_config.py`](https://github.com/huggingface/tau/blob/cc179435a4e4fb934d51c0032c36f8d46fcd811c/src/tau_coding/shell_config.py)
- [`cli.py`](https://github.com/huggingface/tau/blob/cc179435a4e4fb934d51c0032c36f8d46fcd811c/src/tau_coding/cli.py)

[译文]
- [`resources.py`](https://github.com/huggingface/tau/blob/cc179435a4e4fb934d51c0032c36f8d46fcd811c/src/tau_coding/resources.py)
- [`context.py`](https://github.com/huggingface/tau/blob/cc179435a4e4fb934d51c0032c36f8d46fcd811c/src/tau_coding/context.py)
- [`session.py`](https://github.com/huggingface/tau/blob/cc179435a4e4fb934d51c0032c36f8d46fcd811c/src/tau_coding/session.py)
- [`paths.py`](https://github.com/huggingface/tau/blob/cc179435a4e4fb934d51c0032c36f8d46fcd811c/src/tau_coding/paths.py)
- [`extensions/loader.py`](https://github.com/huggingface/tau/blob/cc179435a4e4fb934d51c0032c36f8d46fcd811c/src/tau_coding/extensions/loader.py)
- [`shell_config.py`](https://github.com/huggingface/tau/blob/cc179435a4e4fb934d51c0032c36f8d46fcd811c/src/tau_coding/shell_config.py)
- [`cli.py`](https://github.com/huggingface/tau/blob/cc179435a4e4fb934d51c0032c36f8d46fcd811c/src/tau_coding/cli.py)

### 当前资源矩阵(Current resource matrix)

[原文]
| Input on current `main` | Current behavior |
|---|---|
| `~/.tau/settings.json` | User-only shell settings such as `shellCommandPrefix`; there is no project `.tau/settings.json` loader. |
| `.agents` settings | Tau has no user or project `.agents` settings loader. |
| Other user provider/TUI settings | Read from user `~/.tau` files; no project equivalents. |
| `<cwd>/.tau/skills/*/SKILL.md` | Automatically discovered and loaded. |
| `<cwd>/.agents/skills/*/SKILL.md` | Automatically discovered and loaded. Tau checks the cwd location, not every ancestor `.agents/skills` as Pi does. |
| `<cwd>/.tau/prompts/*.md` | Automatically discovered and loaded. |
| `<cwd>/.agents/prompts/*.md` | Automatically discovered and loaded. This is broader `.agents` support than Pi's trust trigger. |
| `<cwd>/.tau/themes/*.json` | Loaded by the TUI and takes precedence over user themes. `.agents/themes` is not supported. |
| `<cwd>/.tau/SYSTEM.md` | Automatically read and replaces the default prompt unless an explicit CLI system prompt wins. |
| `<cwd>/.tau/APPEND_SYSTEM.md` | Automatically read and appended unless an explicit CLI append value wins. `.agents` system-prompt files are not supported. |
| Plain `AGENTS.md` | Loaded from the detected project root through the cwd. |
| `<cwd>/.tau/AGENTS.md` | Loaded as project context. |
| `<cwd>/.agents/AGENTS.md` | Loaded as project context. |
| `CLAUDE.md` | Not currently discovered by Tau. |
| `<cwd>/.tau/extensions` | Python code, disabled by default and loaded only with `--project-extensions`. |
| `~/.tau/extensions` | Python code, discovered by default unless `--no-extensions`. |
| `-e/--extension PATH` | Loaded explicitly even with `--no-extensions`; not trust-gated. |
| Extension `pyproject.toml` | `[tool.tau].extensions` is parsed only inside an extension directory being discovered; it is an extension manifest, not a general project package manager. |
| Project packages | Tau has no Pi-style project package resource/install system today. |

[译文]
| 当前 `main` 上的输入 | 当前行为 |
|---|---|
| `~/.tau/settings.json` | 仅限用户的 shell 设置,例如 `shellCommandPrefix`;不存在项目级 `.tau/settings.json` 加载器。 |
| `.agents` 设置 | Tau 没有用户级或项目级的 `.agents` 设置加载器。 |
| 其他用户 provider/TUI 设置 | 从用户 `~/.tau` 文件读取;没有对应的项目级版本。 |
| `<cwd>/.tau/skills/*/SKILL.md` | 自动发现并加载。 |
| `<cwd>/.agents/skills/*/SKILL.md` | 自动发现并加载。Tau 只检查 cwd 位置,而不像 Pi 那样检查每个祖先的 `.agents/skills`。 |
| `<cwd>/.tau/prompts/*.md` | 自动发现并加载。 |
| `<cwd>/.agents/prompts/*.md` | 自动发现并加载。这比 Pi 的信任触发范围支持更广的 `.agents`。 |
| `<cwd>/.tau/themes/*.json` | 由 TUI 加载,并优先于用户主题。不支持 `.agents/themes`。 |
| `<cwd>/.tau/SYSTEM.md` | 自动读取并替换默认提示词,除非显式的 CLI 系统提示词胜出。 |
| `<cwd>/.tau/APPEND_SYSTEM.md` | 自动读取并追加,除非显式的 CLI append 值胜出。不支持 `.agents` 系统提示词文件。 |
| 普通 `AGENTS.md` | 从检测到的项目根目录一路加载到 cwd。 |
| `<cwd>/.tau/AGENTS.md` | 作为项目上下文加载。 |
| `<cwd>/.agents/AGENTS.md` | 作为项目上下文加载。 |
| `CLAUDE.md` | Tau 目前不发现它。 |
| `<cwd>/.tau/extensions` | Python 代码,默认禁用,仅在 `--project-extensions` 时加载。 |
| `~/.tau/extensions` | Python 代码,默认发现,除非 `--no-extensions`。 |
| `-e/--extension PATH` | 即使带 `--no-extensions` 也显式加载;不受信任门控。 |
| 扩展的 `pyproject.toml` | `[tool.tau].extensions` 只在被发现的扩展目录内部解析;它是扩展清单,不是通用的项目包管理器。 |
| 项目包 | Tau 目前没有 Pi 风格的项目包资源/安装系统。 |

[原文]
User `~/.tau` and `~/.agents` skills, prompts, and `AGENTS.md` are loaded as
user-owned resources. Skills and prompts use increasing precedence: user
`.tau`, user `.agents`, project `.tau`, project `.agents`. Project context layers
root-to-cwd plain `AGENTS.md`, then cwd `.tau/AGENTS.md` and
`.agents/AGENTS.md`. Project system prompt files take precedence over user files.

[译文]
用户 `~/.tau` 与 `~/.agents` 下的技能、提示词与 `AGENTS.md` 作为用户自有资源加载。技能与提示词按优先级递增:用户 `.tau`、用户 `.agents`、项目 `.tau`、项目 `.agents`。项目上下文按「根 → cwd」依次叠加普通 `AGENTS.md`,然后是 cwd 的 `.tau/AGENTS.md` 与 `.agents/AGENTS.md`。项目系统提示词文件优先于用户文件。

[原文]
`/reload` re-discovers resources and can execute opted-in project extensions
without a trust check. `CodingSession.resume()` creates a replacement for the
record's cwd and loads its resources before adopting it; there is no destination
trust step. Explicit startup system-prompt text/path and explicit extension paths
already express user intent and override or augment ambient discovery.

[译文]
`/reload` 会重新发现资源,并且可以在没有信任检查的情况下执行已选择启用的项目扩展。`CodingSession.resume()` 会为记录的 cwd 创建替代会话,并在采纳它之前加载其资源;没有目标信任步骤。显式的启动系统提示词文本/路径与显式扩展路径本就表达了用户意图,会覆盖或增强环境自动发现。

[原文]
The existing `--project-extensions` switch is a narrow safety opt-in, not a
persisted project-trust system. Published docs correctly warn about project
resources but must not claim enforcement exists until runtime phases land.

[译文]
既有的 `--project-extensions` 开关是一个窄范围的安全选择启用,而不是持久化的项目信任系统。已发布文档正确地警告了项目资源的风险,但在运行时阶段落地之前,不得声称已有强制执行。

## 提议的 Tau 策略(Proposed Tau policy)

[原文]
Everything below is a future contract. Implementation PRs may stage it, but
must not silently weaken it.

[译文]
以下所有内容都是未来契约。实现 PR 可以分阶段落地,但不得静默削弱它。

### 目标与不变量(Goals and invariants)

[原文]
1. No protected project file is read for content, parsed, imported, installed,
   or executed before the decision for its canonical cwd.
2. Detection may inspect file type/name/existence only. It must not parse a
   project manifest merely to decide whether to ask.
3. Decline yields one coherent unprotected resource snapshot, never a mixture
   produced by a failed partial load.
4. Global policy cannot come from project settings; a project cannot approve
   itself.
5. A trust outcome is scoped to a canonical cwd and may inherit only from the
   nearest canonical ancestor decision.
6. `tau_agent` remains unaware of trust, local paths, CLI, and Textual.
7. Textual renders a Tau-owned decision request through the existing adapter
   boundary; it does not own trust policy.

[译文]
1. 在针对某个规范 cwd 做出决策之前,不得为了读取内容而读取、解析、导入、安装或执行任何受保护的项目文件。
2. 检测只可以查看文件类型/名称/是否存在。它不得仅仅为了决定是否询问而解析项目清单。
3. 拒绝会产生一份一致的无保护资源快照,绝不会是失败的部分加载所产生的混合体。
4. 全局策略不能来自项目设置;项目不能批准自己。
5. 信任结果的作用域是某个规范 cwd,并且只可以从最近的规范祖先决策继承。
6. `tau_agent` 仍然不了解信任、本地路径、CLI 与 Textual。
7. Textual 通过既有的适配器边界渲染 Tau 自有的决策请求;它不持有信任策略。

### 受保护资源矩阵(Protected-resource matrix)

[原文]
“Project” means ambient resources discovered because of the active cwd, not a
path the user explicitly supplied on this invocation.

[译文]
「项目」指的是因为活动 cwd 而被自动发现的资源,而不是用户本次调用显式提供的路径。

[原文]
| Resource | Proposed policy | Trigger rule |
|---|---|---|
| Built-in packaged resources | Ungated | Never. |
| User `~/.tau` and `~/.agents` resources | Ungated | Never; they are user-managed inputs. |
| Explicit CLI system/append prompt, extension, and future explicit skill/prompt/theme paths | Ungated | Never; direct invocation is consent. Existing type/read/load errors still apply. |
| `<cwd>/.tau/settings.json` if project settings are added | **Protected** | File exists. Only global settings can choose trust defaults. |
| `<cwd>/.tau/skills` and `.agents/skills` | **Protected** | At least one candidate `*/SKILL.md` exists. |
| `<cwd>/.tau/prompts` and `.agents/prompts` | **Protected** | At least one candidate non-reserved `*.md` exists. |
| `<cwd>/.tau/themes` | **Protected** | At least one `*.json` candidate exists. |
| `<cwd>/.tau/SYSTEM.md` and `APPEND_SYSTEM.md` | **Protected** | File exists. |
| Plain ancestor-to-cwd `AGENTS.md`, cwd `.tau/AGENTS.md`, and cwd `.agents/AGENTS.md` | **Protected** | Any file Tau would include exists. |
| `CLAUDE.md` | Not currently supported; if later discovered, **protected** like `AGENTS.md`. | File exists in the future discovery set. |
| `<cwd>/.tau/extensions` | **Protected and still opt-in initially** | At least one candidate `.py`, `*/extension.py`, or extension-package manifest exists. |
| Future project package declarations, package-managed resources, or auto-install metadata | **Protected** | The declaration/manifest exists; no resolution, download, or install before approval. |

[译文]
| 资源 | 提议策略 | 触发规则 |
|---|---|---|
| 随包内置资源 | 不受门控 | 从不触发。 |
| 用户 `~/.tau` 与 `~/.agents` 资源 | 不受门控 | 从不触发;它们是由用户管理的输入。 |
| 显式的 CLI system/append 提示词、扩展,以及未来显式的技能/提示词/主题路径 | 不受门控 | 从不触发;直接调用即同意。既有的类型/读取/加载错误仍然适用。 |
| 若未来加入项目设置,则为 `<cwd>/.tau/settings.json` | **受保护** | 文件存在。只有全局设置可以选择信任默认值。 |
| `<cwd>/.tau/skills` 与 `.agents/skills` | **受保护** | 至少存在一个候选 `*/SKILL.md`。 |
| `<cwd>/.tau/prompts` 与 `.agents/prompts` | **受保护** | 至少存在一个候选的非保留 `*.md`。 |
| `<cwd>/.tau/themes` | **受保护** | 至少存在一个 `*.json` 候选。 |
| `<cwd>/.tau/SYSTEM.md` 与 `APPEND_SYSTEM.md` | **受保护** | 文件存在。 |
| 「祖先 → cwd」的普通 `AGENTS.md`、cwd 的 `.tau/AGENTS.md` 与 cwd 的 `.agents/AGENTS.md` | **受保护** | Tau 会纳入的任何文件存在时触发。 |
| `CLAUDE.md` | 目前不支持;若日后被发现,则像 `AGENTS.md` 一样**受保护**。 | 文件存在于未来的发现集合中。 |
| `<cwd>/.tau/extensions` | **受保护,且在初期仍需显式选择启用** | 至少存在一个候选 `.py`、`*/extension.py` 或扩展包清单。 |
| 未来的项目包声明、包管理的资源或自动安装元数据 | **受保护** | 声明/清单存在;批准之前不进行解析、下载或安装。 |

[原文]
Empty `.tau`, `.agents`, and empty protected subdirectories do not trigger a
decision. A broken or unreadable candidate that could otherwise load **does**
trigger; detection must not treat inspection failure as proof that no protected
input exists. Symlink candidates trigger based on the directory entry, while
content access waits for approval.

[译文]
空的 `.tau`、`.agents`,以及空的受保护子目录不会触发决策。一个损坏或不可读、但本来可能被加载的候选**确实**会触发;检测不得把「检查失败」当作「不存在受保护输入」的证据。符号链接候选按目录条目触发,而内容访问则等到批准之后。

[原文]
Directory scanners should share candidate predicates with the actual loaders so
the trigger matrix cannot drift. Detection returns typed resource categories and
paths for internal policy/diagnostics, but UI reports category/count—not file
content. It must cap detailed paths to avoid startup floods.

[译文]
目录扫描器应与实际加载器共享同一套候选判定谓词,这样触发矩阵就不会漂移。检测会返回带类型的资源类别与路径,供内部策略/诊断使用,而 UI 只报告类别/数量 —— 不报告文件内容。它必须限制详细路径的数量,以避免启动时信息泛滥。

### 与 Pi 的有意差异(Deliberate differences from Pi)

[原文]
Tau should not copy Pi blindly:

[译文]
Tau 不应盲目照搬 Pi:

[原文]
- **Protect all project `AGENTS.md`-style context.** Pi leaves `AGENTS.md` and
  `CLAUDE.md` ungated. Tau will gate project plain, `.tau`, and `.agents`
  instruction files because they become high-priority model input and can cause
  actions indirectly. User-level context remains ungated. This is an
  input-loading guard, not a claim that trusted context is safe.
- **Protect `.agents/prompts` and `.agents/AGENTS.md` as well as
  `.agents/skills`.** Tau intentionally supports more `.agents` locations than
  Pi. Treating only skills as protected would leave equivalent project prompt
  inputs outside the boundary.
- **Do not broaden ancestor resource discovery as a side effect.** Initial trust
  enforcement covers exactly what Tau loaders discover today: cwd `.tau` and
  `.agents` resources plus existing root-to-cwd plain `AGENTS.md`. Adding Pi's
  ancestor `.agents/skills` discovery is a separate compatibility change. If
  added later, those ancestor resources are protected and become triggers.
- **Keep `--project-extensions` during migration.** Initially a project
  extension loads only when the project is trusted *and* the existing opt-in is
  present. Trust must never make currently disabled executable code start
  automatically. A later, separately documented release may reconsider this.
- **Version and atomically replace Tau's store.** Pi's inspected store is an
  unversioned object written directly. Tau should make migration explicit and
  prevent torn writes.
- **Never implicitly save trust on reload.** If a project had no protected
  inputs and gains one, Tau asks (interactive) or follows deterministic
  headless policy. Merely having started in an empty project is not durable
  consent to future inputs.

[译文]
- **保护所有项目级 `AGENTS.md` 风格上下文。** Pi 让 `AGENTS.md` 与 `CLAUDE.md` 不受门控。Tau 将对项目级的普通、`.tau` 与 `.agents` 指令文件设门控,因为它们会成为高优先级模型输入,并可能间接导致行动。用户级上下文仍不受门控。这是一道输入加载守卫,而不是「受信上下文就安全」的声明。
- **除 `.agents/skills` 外,也保护 `.agents/prompts` 与 `.agents/AGENTS.md`。** Tau 有意比 Pi 支持更多 `.agents` 位置。只把技能视为受保护,会让等价的项目提示输入留在边界之外。
- **不要顺带扩大祖先资源发现。** 初期的信任强制执行范围恰好覆盖 Tau 加载器今天所发现的内容:cwd 的 `.tau` 与 `.agents` 资源,加上既有的「根 → cwd」普通 `AGENTS.md`。加入 Pi 的祖先 `.agents/skills` 发现是一项独立的兼容性变更。若日后加入,那些祖先资源也受保护并成为触发项。
- **迁移期间保留 `--project-extensions`。** 初期,项目扩展只有在项目受信**并且**存在既有的显式启用时才加载。信任绝不能使当前被禁用的可执行代码自动启动。之后某个单独记录文档的版本可以重新考虑这一点。
- **为 Tau 的存储加版本并做原子替换。** Pi 被检查的存储是一个无版本、直接写入的对象。Tau 应当让迁移显式化,并防止撕裂写入。
- **绝不在 reload 时隐式保存信任。** 如果某个项目原本没有受保护输入、之后新增了一个,Tau 会(在交互模式下)询问,或遵循确定性的无头策略。仅仅曾在空项目中启动,并不构成对未来输入的持久同意。

### `tau_coding` 类型与所有权(`tau_coding` types and ownership)

[原文]
Add a small `tau_coding.project_trust` policy layer. Suggested typed values:

[译文]
添加一个小型 `tau_coding.project_trust` 策略层。建议的类型化取值:

```python
TrustDefault = Literal["ask", "always", "never"]
TrustDecision = Literal["trusted", "untrusted"]
TrustOverride = Literal["approve", "decline"]
TrustScope = Literal["exact", "parent", "run"]

@dataclass(frozen=True, slots=True)
class CanonicalProjectPath:
    value: Path

@dataclass(frozen=True, slots=True)
class ProtectedResourceSummary:
    cwd: CanonicalProjectPath
    categories: tuple[str, ...]
    counts: Mapping[str, int]

@dataclass(frozen=True, slots=True)
class SavedTrustEntry:
    path: CanonicalProjectPath
    decision: TrustDecision

@dataclass(frozen=True, slots=True)
class ProjectTrustRequest:
    cwd: CanonicalProjectPath
    resources: ProtectedResourceSummary
    inherited_entry: SavedTrustEntry | None
    choices: tuple[TrustChoice, ...]

@dataclass(frozen=True, slots=True)
class ProjectTrustResolution:
    trusted: bool
    source: Literal["override", "empty", "extension", "saved", "default", "ui"]
    saved_path: CanonicalProjectPath | None
```

[原文]
Exact names may change, but keep these separations:

[译文]
具体名称可以变化,但请保持以下分离:

[原文]
- `ProjectTrustStore`: validate, lock, read, nearest lookup, and atomic update;
- `ProtectedResourceDetector`: metadata-only trigger detection;
- `ProjectTrustPolicy`: pure precedence/default resolution;
- an async coordinator in `tau_coding` for extension/UI requests;
- a resource plan/snapshot that filters project inputs before existing loaders.

[译文]
- `ProjectTrustStore`:校验、加锁、读取、最近查找与原子更新;
- `ProtectedResourceDetector`:仅基于元数据的触发检测;
- `ProjectTrustPolicy`:纯粹的优先级/默认值解析;
- `tau_coding` 中的一个异步协调器,处理扩展/UI 请求;
- 一份资源计划/快照,在进入既有加载器之前过滤项目输入。

[原文]
The coordinator receives abstract callbacks/protocols for decisions. TUI code
maps `ProjectTrustRequest` to a Textual modal and returns a choice. No Textual
imports enter the policy module. `tau_agent` receives only the already-built
system prompt, tools, and resources as it does now.

[译文]
协调器接收抽象的决策回调/协议。TUI 代码把 `ProjectTrustRequest` 映射为一个 Textual 模态框并返回所选选项。策略模块中不引入任何 Textual 导入。`tau_agent` 只像现在一样接收已经构建好的系统提示词、工具与资源。

### 规范化路径规则(Canonical path rules)

[原文]
A trust key is not a repository root. It is the active cwd after session
selection/replacement. Canonicalization must:

[译文]
信任键不是仓库根目录,而是会话选择/替换之后的活动 cwd。规范化必须:

[原文]
1. expand `~`, make the path absolute against an explicitly supplied base, and
   normalize `.`/`..`;
2. require the active cwd to exist and be a directory;
3. resolve all symlinks (`Path.resolve(strict=True)`);
4. apply the platform's case normalization for comparison/storage where the
   platform is case-insensitive, while retaining a display path separately if
   useful;
5. serialize one normalized native absolute path string.

[译文]
1. 展开 `~`,基于显式提供的基准把路径变为绝对路径,并规范化 `.`/`..`;
2. 要求活动 cwd 存在且是目录;
3. 解析全部符号链接(`Path.resolve(strict=True)`);
4. 在大小写不敏感的平台,对比较/存储应用平台的大小写规范化,同时在有用时单独保留一个显示路径;
5. 序列化一个规范化后的原生绝对路径字符串。

[原文]
Do not use raw string-prefix tests: `/work/app2` is not a child of `/work/app`.
Walk `Path.parent` from canonical cwd through the root. The first exact store
entry wins. A child explicit decline therefore overrides trusted parent scope.
Different symlink spellings resolve to one decision. A moved project has a new
key; stale entries remain inspectable and harmless until an explicit cleanup
feature exists.

[译文]
不要使用原始字符串前缀判断:`/work/app2` 并不是 `/work/app` 的子路径。请从规范 cwd 出发,经由 `Path.parent` 一直走到根。第一个精确匹配的存储条目获胜。因此,子目录的显式拒绝会覆盖受信的父目录范围。不同符号链接拼写会解析为同一个决策。被移动的项目会得到新键;在出现显式清理功能之前,陈旧条目仍可检查且无害。

[原文]
If canonicalization of the live cwd fails, protected resources are untrusted and
startup emits an actionable error. Do not fall back to a noncanonical key as Pi
does. Saved entries must be absolute and normalized; invalid entries make the
store malformed rather than being silently skipped.

[译文]
如果活动 cwd 的规范化失败,受保护资源即视为不受信,启动会给出可操作的错误。不要像 Pi 那样回退到非规范键。已保存条目必须是绝对且规范化的;非法条目会让存储变为畸形,而不是被静默跳过。

### 带版本、可检查的持久化(Versioned, inspectable persistence)

[原文]
Use `~/.tau/trust.json` (equivalently `TauPaths.home / "trust.json"`) with this
initial shape:

[译文]
使用 `~/.tau/trust.json`(等价于 `TauPaths.home / "trust.json"`),初始形态如下:

```json
{
  "version": 1,
  "decisions": [
    {"path": "/home/alex/src", "decision": "trusted"},
    {"path": "/home/alex/src/example", "decision": "untrusted"}
  ]
}
```

[原文]
Requirements:

[译文]
要求:

[原文]
- reject unknown versions, duplicate canonical paths, unknown fields, relative
  paths, and unknown decisions;
- sort decisions by path for stable diffs;
- lock across read-modify-write so concurrent Tau processes cannot lose updates;
- create the Tau home with user-only permissions where supported;
- durably install a restrictive same-directory undo journal before replacing
  the destination; readers fail closed whenever that journal remains;
- write a same-directory temporary file, flush and `fsync` it, set restrictive
  permissions, `os.replace()` it over the destination, then `fsync` the parent
  directory where supported;
- remove the journal only after that commit point; on a reported failure restore
  the prior store, and retain the fail-closed journal if any recovery operation
  fails, so newly granting bytes can never become an effective saved decision;
- clean up unrelated failed temporary files without replacing the last valid
  store.

[译文]
- 拒绝未知版本、重复的规范路径、未知字段、相对路径与未知决策;
- 为获得稳定的 diff,按路径排序决策;
- 在「读-改-写」期间加锁,使并发的 Tau 进程不会丢失更新;
- 在平台支持时,以仅限用户的权限创建 Tau 主目录;
- 在替换目标之前,持久化地安装一个受限的同目录撤销日志;只要该日志仍然存在,读取方就按「失败关闭」处理;
- 写入一个同目录临时文件,flush 并 `fsync` 它,设置受限权限,用 `os.replace()` 替换目标,然后在支持时 `fsync` 父目录;
- 只在该提交点之后移除日志;若报告失败,则恢复先前的存储;若任何恢复操作失败,则保留「失败关闭」的日志,使新授予的字节永远不会成为有效的已保存决策;
- 清理无关的失败临时文件,同时不替换最后一个有效存储。

[原文]
Malformed/unreadable store means no saved decision can grant trust. Emit one
clear diagnostic and fail closed for protected resources unless the user gives
an explicit run-only approval through UI or `--approve`. A saved UI choice must
be written successfully **before** it grants trust; if persistence is
unwritable, report failure and remain untrusted, while offering the separate
“this run only” choice. An extension result with `remember=True` follows the
same rule. Explicit one-run approval never writes and remains usable, with a
store-error diagnostic, because it is direct consent rather than inferred
state.

[译文]
存储畸形/不可读意味着任何已保存决策都不能授予信任。给出一条清晰的诊断,并对受保护资源按「失败关闭」处理,除非用户通过 UI 或 `--approve` 给出显式的「仅本次运行」批准。保存的 UI 选择必须在授予信任**之前**成功写入;如果持久化不可写,则报告失败并保持不受信,同时提供单独的「仅本次运行」选项。带 `remember=True` 的扩展结果遵循同一条规则。显式的单次运行批准从不写入,并且仍然可用(伴随一条存储错误诊断),因为它是直接同意,而不是推断出的状态。

[原文]
Do not rename a malformed store automatically or silently reset it; that hides
why decisions disappeared. Future schema migration must parse the old complete
document, write v1 atomically, preserve a backup, and report what changed.

[译文]
不要自动重命名畸形的存储,也不要静默重置它;那会掩盖决策消失的原因。未来的 schema 迁移必须解析旧的完整文档、原子写入 v1、保留备份,并报告变更了什么。

### 解析优先级(Resolution precedence)

[原文]
For each canonical destination cwd:

[译文]
对于每个规范目标 cwd:

[原文]
1. explicit one-run CLI override;
2. no protected resource candidates: allow ambient loading because there is
   nothing protected, but record no durable decision;
3. first decisive eligible pre-trust extension;
4. nearest saved exact/ancestor decision;
5. user-global `defaultProjectTrust` (`ask` when absent);
6. interactive built-in choice for `ask`; otherwise safe decline.

[译文]
1. 显式的单次运行 CLI 覆盖;
2. 没有受保护资源候选:因为没有任何受保护内容,允许环境加载,但不记录持久化决策;
3. 第一个决定性的、符合条件的「信任前」扩展;
4. 最近的已保存精确/祖先决策;
5. 用户全局 `defaultProjectTrust`(缺省时为 `ask`);
6. `ask` 时的交互式内置选择;否则安全拒绝。

[原文]
This matches Pi's meaningful order. A project setting can neither set
`defaultProjectTrust` nor alter earlier steps. Cache a completed run resolution
by canonical cwd, including declines, so one cwd does not repeatedly prompt.
Never reuse it for another cwd. Re-run metadata detection on reload so an
“empty” outcome does not become consent after new files appear.

[译文]
这与 Pi 的有效顺序一致。项目设置既不能设置 `defaultProjectTrust`,也不能改变更靠前的步骤。按规范 cwd 缓存一次已完成的运行解析(包括拒绝),这样一个 cwd 不会反复提示。绝不把它复用于另一个 cwd。reload 时重新做元数据检测,使「空」的结果不会在新文件出现后变成同意。

### 启动序列(Startup sequence)

[原文]
The future bootstrap should be explicit and testable:

[译文]
未来的引导过程应当显式且可测试:

[原文]
1. Parse CLI arguments. Reject `--approve` with `--no-approve` before filesystem
   resource loading.
2. Load built-ins and user-global settings only. Read `defaultProjectTrust` only
   here. Do not read `<cwd>/.tau/settings.json`.
3. Resolve the final session target and canonical destination cwd using only
   user-global session configuration. A resumed record's cwd wins after missing
   cwd handling.
4. Detect protected candidates by metadata only.
5. Load a pre-trust extension runtime containing built-ins, user
   `~/.tau/extensions`, and explicit `-e` paths. Never import project extensions
   or resolve project packages in this pass.
6. Resolve trust using the precedence above. Interactive startup asks through
   the adapter; headless startup does not.
7. Build a complete resource plan: global and explicit inputs always; project
   inputs only if trusted; project extensions additionally require the existing
   opt-in during migration.
8. Only now parse project settings/manifests, resolve/install future project
   packages, import project extensions, read project Markdown/JSON, create the
   provider/runtime, and assemble the system prompt.
9. Publish the new coding session only after the complete plan succeeds. Emit
   bounded diagnostics for skipped categories or failures.

[译文]
1. 解析 CLI 参数。在加载文件系统资源之前,拒绝同时出现 `--approve` 与 `--no-approve`。
2. 只加载内置与用户全局设置。只在这里读取 `defaultProjectTrust`。不要读取 `<cwd>/.tau/settings.json`。
3. 仅使用用户全局会话配置解析最终会话目标与规范目标 cwd。在处理完 cwd 缺失情况之后,恢复记录的 cwd 获胜。
4. 仅通过元数据检测受保护候选。
5. 加载一个「信任前」扩展运行时,其中包含内置扩展、用户 `~/.tau/extensions` 与显式 `-e` 路径。在这一轮中绝不导入项目扩展或解析项目包。
6. 按上述优先级解析信任。交互式启动通过适配器询问;无头启动不询问。
7. 构建一份完整资源计划:全局与显式输入总是包含;项目输入仅在受信时包含;迁移期间,项目扩展还额外需要既有的显式启用。
8. 只有到这时,才解析项目设置/清单、解析/安装未来的项目包、导入项目扩展、读取项目 Markdown/JSON、创建 provider/运行时,并组装系统提示词。
9. 只有完整计划成功之后,才发布新的编码会话。对跳过的类别或失败,发出有界诊断。

[原文]
Provider construction matters: a protected project setting must not influence
provider, proxy, credentials, shell prefix, model, session directory, extension
flags, or tool configuration before step 8.

[译文]
Provider 构建顺序很重要:在第 8 步之前,受保护的项目设置不得影响 provider、代理、凭据、shell 前缀、模型、会话目录、扩展 flag 或工具配置。

### 交互式 TUI 选项(Interactive TUI choices)

[原文]
The built-in modal should state the canonical folder, explain the categories it
would load, and say “This controls project inputs; it is not a sandbox.” Choices:

[译文]
内置模态框应说明规范文件夹、解释它将要加载的类别,并声明「这控制的是项目输入;它不是沙箱」。选项:

[原文]
- **Trust this folder** — atomically save exact trusted, then continue;
- **Trust parent folder (`…`)** — save immediate parent trusted and remove an
  exact child entry in one transaction, then continue;
- **Trust for this run only** — continue without writing;
- **Do not trust this folder** — atomically save exact untrusted, then continue
  with protected resources skipped;
- **Do not trust for this run only** — skip without writing.

[译文]
- **信任此文件夹** —— 原子保存「精确受信」,然后继续;
- **信任父文件夹(`…`)** —— 在一个事务中保存「直接父目录受信」并移除精确的子目录条目,然后继续;
- **仅本次运行信任** —— 直接继续,不写入;
- **不信任此文件夹** —— 原子保存「精确不受信」,然后跳过受保护资源继续;
- **仅本次运行不信任** —— 跳过,不写入。

[原文]
Escape/cancel exits Tau during initial startup; users must explicitly select a
run-only decline to continue without project inputs. During reload or session
replacement, cancellation preserves the active snapshot. Parent scope must never default to `$HOME`
or filesystem root without displaying the exact broad scope and requiring the
same explicit selection. Accessibility, focus, and key handling belong to the
Textual adapter/modal; available choices and semantics belong to `tau_coding`.

[译文]
在初次启动期间,Escape/取消会退出 Tau;用户必须显式选择「仅本次运行不信任」才能在没有项目输入的情况下继续。在 reload 或会话替换期间,取消会保留活动快照。父目录范围绝不能默认成 `$HOME` 或文件系统根,除非明确展示其宽泛范围并要求同样显式的选择。可访问性、焦点与按键处理属于 Textual 适配器/模态框;可用选项与语义属于 `tau_coding`。

[原文]
A future `/trust` command may inspect/edit decisions. Like Pi, edits should not
quietly mutate already loaded resources. It should say restart or `/reload` is
required. It must display inherited source and current run outcome separately.

[译文]
未来的 `/trust` 命令可以检查/编辑决策。与 Pi 一样,编辑不应静默改变已加载的资源。它应说明需要重启或 `/reload`。它必须分别展示继承来源与本次运行结果。

### 无头模式与显式覆盖(Headless modes and explicit overrides)

[原文]
Add `--approve`/`-a` and `--no-approve`/`-na` as mutually exclusive, invocation-
only overrides. They do not write `trust.json`. They apply to every destination
cwd entered by that invocation, including a resumed/replaced session, but each
cwd still receives its own diagnostic and resource plan.

[译文]
将 `--approve`/`-a` 与 `--no-approve`/`-na` 作为互斥的、仅对本次调用生效的覆盖加入。它们不写入 `trust.json`。它们适用于该次调用进入的每个目标 cwd,包括被恢复/替换的会话,但每个 cwd 仍会得到自己的诊断与资源计划。

[原文]
Print, JSON, transcript, export-related runtime modes, and automation must never
wait for UI. With no earlier decisive result:

[译文]
Print、JSON、transcript、与导出相关的运行时模式以及自动化,绝不能等待 UI。在没有更早的决定性结果时:

[原文]
| Global default | Headless result |
|---|---|
| `ask` | untrusted |
| `always` | trusted |
| `never` | untrusted |

[译文]
| 全局默认值 | 无头结果 |
|---|---|
| `ask` | 不受信 |
| `always` | 受信 |
| `never` | 不受信 |

[原文]
Structured modes must send diagnostics to their established diagnostic channel,
not corrupt stdout protocols. Extension participation is allowed in headless
mode, but `has_ui` is false and UI methods cannot prompt. A handler that tries
to prompt gets a deterministic error/undecided result, not stdin access.

[译文]
结构化模式必须把诊断发送到各自既定的诊断通道,而不是破坏 stdout 协议。无头模式允许扩展参与,但 `has_ui` 为 false,UI 方法不能提示。试图提示的处理器会得到一个确定性的错误/未决结果,而不是 stdin 访问权。

### 扩展参与(Extension participation)

[原文]
Add a Tau-owned `project_trust` event only after its result and ordering are
tested. The event exposes canonical cwd, mode, `has_ui`, and category/count
summary—never protected contents. Results are `approve`, `decline`, or `defer`,
plus `remember: bool`.

[译文]
只有在结果与顺序经过测试之后,才添加 Tau 自有的 `project_trust` 事件。该事件暴露规范 cwd、模式、`has_ui` 以及类别/数量摘要 —— 绝不包含受保护内容。结果取值为 `approve`、`decline` 或 `defer`,外加 `remember: bool`。

[原文]
Only built-in, user-global, and explicit CLI extensions may receive it. First
decisive result wins. Errors become diagnostics and resolution continues.
Project extensions, project package extensions, and resources registered by
them cannot load or participate before approval. Final loading should reuse
already imported eligible extensions where practical so setup does not run
twice.

[译文]
只有内置、用户全局与显式 CLI 扩展可以接收它。第一个决定性结果获胜。错误会变为诊断,解析继续进行。项目扩展、项目包扩展,以及由它们注册的资源,都不能在批准之前加载或参与。最终加载在可行时应复用已导入的合格扩展,以免 setup 运行两次。

[原文]
An extension cannot invent broader parent persistence: `remember` saves only the
exact cwd. Built-in UI owns parent-scope selection. On malformed/unwritable
storage, remembered extension approval fails closed as described above.

[译文]
扩展不能凭空制造更宽泛的父目录持久化:`remember` 只保存精确 cwd。父目录范围的选择由内置 UI 持有。在存储畸形/不可写时,带 remember 的扩展批准按上文所述「失败关闭」。

### Reload(Reload)

[原文]
`/reload` must be transactional:

[译文]
`/reload` 必须是事务性的:

[原文]
1. detect candidates again;
2. if protected candidates now exist and this cwd has no cached non-empty
   resolution, resolve trust before reading them;
3. prepare all permitted resources and extensions in a replacement snapshot;
4. swap only after preparation succeeds;
5. emit reload/session lifecycle events from the accepted runtime.

[译文]
1. 再次检测候选;
2. 如果现在存在受保护候选,而该 cwd 没有缓存的「非空」解析结果,则在读取它们之前先解析信任;
3. 在一个替换快照中准备所有被允许的资源与扩展;
4. 只有准备成功之后才进行替换;
5. 从被接受的运行时发出 reload/会话生命周期事件。

[原文]
If the user cancels or a trust/storage/load error occurs, keep the previous valid
resource/runtime snapshot. A deliberate decline may successfully replace it
with the global/explicit-only snapshot, after confirmation. Never implicitly
save trust because an empty project gained files. A saved decision changed by a
future `/trust` command takes effect only on an explicit reload/restart.

[译文]
如果用户取消,或发生信任/存储/加载错误,则保留先前的有效资源/运行时快照。一次有意的拒绝可以在确认之后成功地把快照替换为「仅全局/显式」的快照。绝不因为空项目新增了文件就隐式保存信任。未来 `/trust` 命令所修改的已保存决策,只在显式 reload/重启时才生效。

### 恢复、替换与 cwd 变更(Resume, replacement, and cwd changes)

[原文]
Current Tau replacement loads before adoption but has no trust phase. Future
resume/new-session/fork flows must derive and canonicalize the destination cwd,
then run the same coordinator before any destination project resource is read.
Do not carry source-cwd trust to the destination.

[译文]
当前 Tau 的替换会在采纳之前加载,但没有信任阶段。未来的恢复/新建会话/分叉流程必须推导并规范化目标 cwd,然后在读取任何目标项目资源之前运行同一个协调器。不要把源 cwd 的信任带到目标。

[原文]
For an interactive cross-cwd resume, stage destination selection and trust while
the current session remains valid. Cancel leaves the existing session active.
Only after destination resources and provider/runtime are ready should Tau tear
down/adopt. Headless replacement uses the deterministic table and fails/skips
without prompting. Cache keys are canonical cwd, not session id.

[译文]
对于交互式的跨 cwd 恢复,在当前会话仍有效时暂存目标选择与信任。取消会让现有会话保持活动。只有当目标资源与 provider/运行时都就绪之后,Tau 才应拆卸/采纳。无头替换使用确定性的表,失败/跳过而不提示。缓存键是规范 cwd,而不是会话 id。

### 诊断与可观测性(Diagnostics and observability)

[原文]
Diagnostics should answer:

[译文]
诊断应当回答:

[原文]
- canonical cwd and whether a decision was exact or inherited;
- outcome source (`override`, `extension`, `saved`, `default`, or `ui`);
- protected categories skipped, with counts;
- malformed/unreadable/unwritable store and remediation path;
- pre-trust extension errors;
- why project extensions remained disabled despite trust (missing existing
  `--project-extensions` opt-in).

[译文]
- 规范 cwd,以及决策是精确的还是继承的;
- 结果来源(`override`、`extension`、`saved`、`default` 或 `ui`);
- 被跳过的受保护类别及数量;
- 畸形/不可读/不可写的存储与修复路径;
- 「信任前」扩展错误;
- 为什么在已受信的情况下项目扩展仍被禁用(缺少既有的 `--project-extensions` 显式启用)。

[原文]
Do not print trust-store contents, resource contents, credentials, or every path
by default. Interactive status may summarize once. Text/JSON/transcript modes
must preserve their output contracts. A debug view may expose bounded paths
only after normal redaction rules.

[译文]
默认不要打印信任存储内容、资源内容、凭据或每一条路径。交互式状态可以汇总一次。Text/JSON/transcript 模式必须保持各自的输出契约。调试视图只有在常规脱敏规则之后,才可以暴露有界的路径。

### 迁移与兼容性上线(Migration and compatibility rollout)

[原文]
Enforcement changes existing behavior, so do not hide it in a refactor.
Recommended first runtime release:

[译文]
强制执行会改变现有行为,因此不要把它藏在一个重构里。建议的第一个运行时版本:

[原文]
- default global policy is `ask`;
- interactive sessions ask when meaningful protected candidates exist;
- headless unresolved `ask` declines and emits a concise migration diagnostic
  suggesting a saved interactive decision or explicit `--approve`;
- no existing repository is auto-trusted and no decision is inferred from
  `--project-extensions` history;
- user/global and explicit CLI resources continue working;
- `--project-extensions` remains an additional requirement;
- release notes and published security/configuration/CLI docs are updated only
  when enforcement and flags actually ship.

[译文]
- 全局默认策略为 `ask`;
- 交互式会话在存在有意义的受保护候选时询问;
- 无头模式下未决的 `ask` 会拒绝,并发出一条简洁的迁移诊断,建议保存一次交互式决策或显式使用 `--approve`;
- 不自动信任任何既有仓库,也不从 `--project-extensions` 的历史推断任何决策;
- 用户/全局与显式 CLI 资源继续可用;
- `--project-extensions` 仍是额外要求;
- 发布说明与已发布的安全/配置/CLI 文档,只在强制执行与 flag 真正上线时才更新。

[原文]
There is no legacy Tau trust store to import. If a prototype/unversioned file is
ever released before v1, migration must be explicit, tested, and backed up.

[译文]
没有需要导入的遗留 Tau 信任存储。如果在 v1 之前曾发布过原型/无版本文件,迁移必须是显式的、经过测试并带有备份。

## 分阶段未来实现(Staged future implementation)

[原文]
This design PR adds no runtime code. Follow-up changes should stay reviewable:

[译文]
本设计 PR 不添加任何运行时代码。后续变更应保持可评审:

[原文]
1. **Pure policy and persistence.** Add types, strict canonicalization, detector,
   versioned locked atomic store, nearest-ancestor lookup, and pure resolution.
   No CLI/TUI integration yet.
2. **Resource planning.** Introduce trusted/untrusted resource snapshots and gate
   project settings, skills, prompts, themes, context, and system-prompt files.
   Preserve existing precedence among permitted inputs.
3. **CLI/headless integration.** Add mutually exclusive overrides, global default,
   deterministic modes, structured diagnostics, startup/session-cwd ordering.
4. **TUI adapter integration.** Add the accessible startup modal and scopes
   without moving Textual into policy or `tau_agent`.
5. **Extensions and replacement.** Add pre-trust extension event, two-pass reuse,
   transactional reload, and cross-cwd resume/replacement.
6. **Packages, only when Tau has them.** Gate project package declarations,
   resolution, installs, and package resources before exposing the feature.
7. **Published documentation/release notes.** Describe only behavior that has
   landed, include migration guidance, and repeat the non-sandbox boundary.

[译文]
1. **纯策略与持久化。** 添加类型、严格规范化、检测器、带版本且加锁的原子存储、最近祖先查找与纯解析。暂不集成 CLI/TUI。
2. **资源计划。** 引入可信/不可信资源快照,并对项目设置、技能、提示词、主题、上下文与系统提示词文件设门控。在被允许的输入之间保持既有优先级。
3. **CLI/无头集成。** 添加互斥覆盖、全局默认值、确定性模式、结构化诊断,以及启动/会话 cwd 的顺序。
4. **TUI 适配器集成。** 加入可访问的启动模态框与各种范围,同时不把 Textual 搬进策略或 `tau_agent`。
5. **扩展与替换。** 添加「信任前」扩展事件、两轮复用、事务性 reload,以及跨 cwd 的恢复/替换。
6. **包,仅在 Tau 拥有它们之后。** 在暴露该功能之前,对项目包声明、解析、安装与包资源设门控。
7. **已发布文档/发布说明。** 只描述已落地的行为,包含迁移指引,并重申「非沙箱」边界。

[原文]
Each stage should update this note if implementation discovers an invalid
assumption; deliberate policy changes need rationale, not accidental drift.

[译文]
如果实现过程发现某个假设不成立,每个阶段都应更新本文;有意的策略变更需要理由,而不是意外漂移。

## 确定性测试计划(Deterministic test plan)

[原文]
All tests must use temporary homes and projects; no test reads or writes the
operator's real home or calls a live provider.

[译文]
所有测试都必须使用临时的 home 与项目;任何测试都不得读写操作者真实的 home,也不得调用真实 provider。

### 策略与存储(Policy and store)

[原文]
- canonical aliases/symlinks map to one key; missing/non-directory cwd fails
  closed;
- exact beats nearest parent; parent beats global default; siblings do not
  inherit;
- broad parent trust plus exact child decline; removing child restores
  inheritance;
- v1 round trip is sorted and inspectable;
- malformed JSON, wrong version/schema, duplicate/noncanonical paths, read
  failure, lock failure, and write/replace/fsync failure do not grant trust;
- interrupted atomic writes preserve the prior valid file;
- concurrent fake writers do not lose decisions.

[译文]
- 规范别名/符号链接映射到同一个键;cwd 缺失/不是目录时按「失败关闭」处理;
- 精确条目胜过来自最近父目录的条目;父目录胜过来自全局默认值的条目;兄弟目录之间不继承;
- 宽泛的父目录信任与精确的子目录拒绝并存;移除子条目会恢复继承;
- v1 的双向读写是排序的且可检查;
- 畸形 JSON、错误的版本/schema、重复/非规范路径、读取失败、加锁失败,以及写入/替换/fsync 失败都不授予信任;
- 被中断的原子写入保留先前有效文件;
- 并发的假写入方不会丢失决策。

### 检测与矩阵(Detection and matrix)

[原文]
Using temporary directories, cover every matrix row, both `.tau` and `.agents`,
plain root-to-cwd `AGENTS.md`, empty directories, reserved/nonmatching files,
unreadable entries, and symlinks. Assert detection reads no protected content.
Assert current unsupported `CLAUDE.md` and package metadata do not accidentally
load, while future package fixtures trigger once that feature exists.

[译文]
使用临时目录覆盖矩阵中的每一行、`.tau` 与 `.agents` 两者、「根 → cwd」的普通 `AGENTS.md`、空目录、保留/不匹配文件、不可读条目与符号链接。断言检测不会读取任何受保护内容。断言当前不支持的 `CLAUDE.md` 与包元数据不会被意外加载,而未来的包 fixture 在该功能存在后会触发。

### 解析与启动(Resolution and startup)

[原文]
Table-test override, no-resource, extension, exact/ancestor saved decision, each
default, UI choice, cancellation, and store-error precedence. Validate
conflicting CLI flags before resource reads. Use a fake provider that records
construction and calls; assert it sees no protected project setting/prompt
before approval and receives no call on failed startup.

[译文]
以表驱动方式测试覆盖、无资源、扩展、精确/祖先已保存决策、各个默认值、UI 选择、取消与存储错误的优先级。在读取资源之前校验冲突的 CLI flag。使用一个记录构建与调用情况的假 provider;断言在批准之前它看不到任何受保护的项目设置/提示词,并且在启动失败时不收到任何调用。

### 资源与扩展顺序(Resource and extension ordering)

[原文]
Use fake extensions that record import/setup/events:

[译文]
使用记录导入/setup/事件的假扩展:

[原文]
- global and explicit extensions may handle trust;
- project extensions never import before approval;
- first decisive handler wins, defer continues, errors diagnose and continue;
- remembered approval must persist before loading project code;
- decline produces only global/explicit resources;
- protected categories load as one final snapshot with existing precedence;
- `--project-extensions` remains required in addition to trust.

[译文]
- 全局与显式扩展可以处理信任;
- 项目扩展在批准之前绝不导入;
- 第一个决定性处理器获胜,`defer` 继续,错误给出诊断并继续;
- 带 remember 的批准必须在加载项目代码之前完成持久化;
- 拒绝只会产生全局/显式资源;
- 受保护类别作为一份最终快照、按既有优先级加载;
- 除信任之外,`--project-extensions` 仍然是必需的。

### 前端、reload 与会话(Frontends, reload, and sessions)

[原文]
- Textual pilot tests cover every scope, parent label, escape-as-decline, focus,
  keyboard operation, persistence error, and non-sandbox copy;
- print/JSON/transcript tests prove `ask` never prompts and stdout remains clean;
- reload after an initially empty project asks/declines rather than auto-saving;
- cancelled/failed reload preserves the old snapshot; accepted decline swaps to
  global/explicit-only;
- resume/replacement to a second cwd resolves independently before adoption;
  cancellation retains the first session;
- same canonical cwd uses its process cache, while symlink aliases and unrelated
  cwd behavior are deterministic;
- fake providers and fake extensions prove no live model, network, package
  install, process, or real credential is needed.

[译文]
- Textual 试点测试覆盖每个范围、父目录标签、Escape 即拒绝、焦点、键盘操作、持久化错误与非沙箱文案;
- print/JSON/transcript 测试证明 `ask` 从不提示,且 stdout 保持整洁;
- 在最初为空的项目中,reload 会询问/拒绝,而不是自动保存;
- 被取消/失败的 reload 保留旧快照;被接受的拒绝会切换到「仅全局/显式」;
- 恢复/替换到第二个 cwd 时,会在采纳之前独立解析;取消会保留第一个会话;
- 同一个规范 cwd 使用其进程缓存,而符号链接别名与无关 cwd 的行为具有确定性;
- 假 provider 与假扩展证明不需要真实模型、网络、包安装、进程或真实凭据。

[原文]
Run the repository's complete Python and website checks for every integration
stage.

[译文]
每个集成阶段都运行仓库完整的 Python 与网站检查。

## 非沙箱边界(Non-sandbox boundary)

[原文]
**Project trust is only an input-loading guard.** It does not restrict what Tau,
the model, extensions, packages, or tools can do after loading. It is not a
filesystem, write, process, shell, subprocess, network, tool, credential,
provider, model, package-install, prompt-injection, or data-exfiltration
boundary. A trusted project may still be malicious, and an untrusted repository
may still influence the model through content the user explicitly asks Tau to
read or through tool output.

[译文]
**项目信任只是一道输入加载守卫。** 它不限制 Tau、模型、扩展、包或工具在加载之后能做什么。它不是文件系统、写入、进程、shell、子进程、网络、工具、凭据、provider、模型、包安装、提示词注入或数据外泄的边界。一个受信项目仍可能是恶意的,而一个不受信仓库仍可能通过用户明确要求 Tau 读取的内容、或通过工具输出影响模型。

[原文]
Users needing isolation must run Tau inside an appropriate OS sandbox,
container, VM, micro-VM, remote environment, or policy-controlled tool boundary
with limited files, credentials, and network access. This project-trust design
must never be marketed as a substitute.

[译文]
需要隔离的用户必须在合适的操作系统沙箱、容器、虚拟机、micro-VM、远程环境,或在文件、凭据与网络访问都受限的策略控制工具边界内运行 Tau。本项目的信任设计绝不能被宣传为这些手段的替代品。
