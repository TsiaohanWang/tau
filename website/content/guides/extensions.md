---
title: "Extensions / 扩展"
description: "Extend Tau with plain Python — custom tools, slash commands, hooks, dialogs, and message rendering. / 用纯 Python 扩展 Tau —— 自定义工具、斜杠命令、钩子、对话框与消息渲染。"
---

[原文]
Extensions are Python modules that customize a Tau session: they add tools,
slash commands, and process-local provider definitions; observe the agent event
stream; and intercept tool calls, tool results, and user input. The design
follows Pi's extension system, adapted to Python.

[译文]
扩展是用于定制 Tau 会话的 Python 模块:它们添加工具、斜杠命令与进程本地的 provider 定义;观察 agent 事件流;并拦截工具调用、工具结果与用户输入。这套设计沿用了 Pi 的扩展系统,并适配到 Python。

## 快速开始(Quick start)

[原文]
Create `~/.tau/extensions/greet.py`:

[译文]
创建 `~/.tau/extensions/greet.py`:

```python
from tau_agent.messages import TextContent
from tau_agent.tools import AgentTool, AgentToolResult


async def run_greet(tool_call_id, arguments, signal=None, on_update=None):
    return AgentToolResult(
        content=[TextContent(text=f"Hello, {arguments.get('who', 'world')}!")],
    )


def setup(tau):
    tau.register_tool(
        AgentTool(
            name="greet",
            label="Greet",
            description="Greet someone.",
            parameters={
                "type": "object",
                "properties": {"who": {"type": "string"}},
            },
            execute_fn=run_greet,
            prompt_snippet="Greet someone by name.",
        )
    )
```

[原文]
Start `tau` and the model can call `greet`. Every extension is a module
defining `setup(tau)`, which runs once at startup with the extension API.

[译文]
启动 `tau`,模型就可以调用 `greet` 了。每个扩展都是一个定义了 `setup(tau)` 的模块;该函数在启动时用扩展 API 运行一次。

## 安装扩展(Install an extension)

[原文]
Install a trusted extension from Git with the same command shape as Pi:

[译文]
用与 Pi 相同形态的命令从 Git 安装一个受信扩展:

```bash
tau install git:github.com/owner/repository
tau install git:github.com/owner/repository@v1.2.0
tau install https://github.com/owner/repository.git
```

[原文]
Tau clones the repository into `~/.tau/extensions/<repository>` and loads it on
the next Tau startup. A pinned ref may be a tag, branch, or commit. Replacing an
existing install requires an explicit opt-in:

[译文]
Tau 会把仓库克隆到 `~/.tau/extensions/<repository>`,并在下次启动 Tau 时加载它。固定的 ref 可以是 tag、分支或提交。替换已存在的安装需要显式选择启用:

```bash
tau install git:github.com/owner/repository@v1.3.0 --force
```

[原文]
Local files and package directories work too:

[译文]
本地文件与包目录也可以:

```bash
tau install ./my_extension.py
tau install ./my-extension
```

[原文]
A local file is copied into `~/.tau/extensions/`. A directory is copied and must
contain `extension.py` or declare `[tool.tau].extensions` in `pyproject.toml`, so
it remains discoverable without `-e`. Local virtual environments, VCS metadata,
and Python cache directories are not copied.

[译文]
本地文件会被复制到 `~/.tau/extensions/`。目录会被复制,并且必须包含 `extension.py`,或在 `pyproject.toml` 中声明 `[tool.tau].extensions`,这样无需 `-e` 也能被发现。本地的虚拟环境、VCS 元数据与 Python 缓存目录不会被复制。

[原文]
The installer validates discovery metadata without importing the extension.
It does not install Python dependencies, maintain a package registry, or provide
remove/update commands yet. Install dependencies into Tau's Python environment
separately when an extension requires them. Extensions execute arbitrary Python
with your user permissions, so review the source before installation.

[译文]
安装器会校验发现元数据,但不会导入该扩展。它目前不安装 Python 依赖、不维护包注册表,也不提供移除/更新命令。当扩展需要依赖时,请单独把它们装进 Tau 的 Python 环境。扩展会以你的用户权限执行任意 Python,因此安装前请审查源码。

## 扩展住在哪里(Where extensions live)

[原文]
| Location | Loaded |
|---|---|
| `~/.tau/extensions/` | by default |
| `<project>/.tau/extensions/` | only after project approval **and** `--project-extensions` |
| any file or directory | with `tau -e PATH` (repeatable) |

[译文]
| 位置 | 加载条件 |
|---|---|
| `~/.tau/extensions/` | 默认加载 |
| `<project>/.tau/extensions/` | 只在项目被批准**并且**传入 `--project-extensions` 之后 |
| 任意文件或目录 | 使用 `tau -e PATH`(可重复) |

### 受信的内置扩展(Trusted built-in extensions)

[原文]
Tau may bundle product capabilities as `BuiltInExtension` declarations. A
built-in is not a special provider or command branch: its synchronous
`setup(tau)` receives the normal extension API and registers tools, commands,
process-local providers, hooks, or later extension capabilities through the
same runtime.

[译文]
Tau 可以把产品能力以 `BuiltInExtension` 声明的形式随包分发。内置扩展不是特殊的 provider 或命令分支:它同步的 `setup(tau)` 接收普通的扩展 API,并通过同一个运行时注册工具、命令、进程本地 provider、钩子或后续的扩展能力。

[原文]
Built-ins load once per staged runtime, before user, explicit, and trusted
project sources. They still load with `--no-extensions`, because that flag turns
off filesystem discovery rather than capabilities shipped in Tau itself. Their
code is trusted as installed package code and never counts as ambient project
input, so a built-in alone cannot trigger project trust.

[译文]
内置扩展在每个暂存运行时中加载一次,顺序在用户、显式与受信项目来源之前。它们在 `--no-extensions` 下仍然加载,因为该参数关闭的是文件系统发现,而不是 Tau 自身随包交付的能力。它们的代码按「已安装的包代码」受信,绝不会被算作环境中的项目输入,因此仅凭一个内置扩展无法触发项目信任。

[原文]
Declarations are hidden by default. Hidden means omitted from ordinary
extension-name counts, not inactive: detailed runtime metadata retains the
`built-in` source, stable `built-in:<name>` source ID, and hidden flag. Setup
exceptions are isolated diagnostics and all partial registrations from that
source are removed. Reload, resume, new-session, and cwd replacement use fresh
generations; retiring an old generation invalidates captured APIs, removes its
registrations, and cancels generation-owned provider refresh work. Generic core
loading never checks a built-in capability's name.

[译文]
这些声明默认是隐藏的。「隐藏」意味着不进入普通的扩展名计数,而不是不生效:详细的运行时元数据仍保留 `built-in` 来源、稳定的 `built-in:<name>` 来源 ID 与隐藏标志。setup 异常会被隔离为诊断,该来源的所有部分注册都会被移除。Reload、恢复、新建会话与 cwd 替换都会使用新的代际;退役旧代际会使已捕获的 API 失效、移除其注册,并取消该代际持有的 provider 刷新工作。通用内核的加载过程从不检查某个内置能力的名称。

[原文]
Within a directory, `*.py` files are extensions, and a subdirectory
containing `extension.py` is a package-style extension — its sibling
modules are imported with relative imports (`from . import helper`).
Names starting with `_` are skipped.

[译文]
在一个目录内,`*.py` 文件是扩展;包含 `extension.py` 的子目录是包式扩展 —— 它的同级模块通过相对导入(`from . import helper`)导入。以 `_` 开头的名称会被跳过。

[原文]
Larger extensions that keep their code in a package (e.g. a `src/`
layout) can declare their entry files in `pyproject.toml` instead of
placing `extension.py` at the directory root:

[译文]
代码放在包里(例如采用 `src/` 布局)的较大扩展,可以在 `pyproject.toml` 中声明入口文件,而不必把 `extension.py` 放在目录根部:

```toml
[tool.tau]
extensions = ["src/my_ext/extension.py"]
```

[原文]
The manifest takes precedence over an `extension.py` in the same
directory; each declared file loads as a package rooted at its parent
directory, so sibling modules stay importable with relative imports. The
extension is named after the entry's parent directory (or after the file
itself when it isn't named `extension.py`).

[译文]
清单优先于同一目录下的 `extension.py`;每个声明的文件都作为一个「以其父目录为根」的包加载,因此同级模块仍可用相对导入访问。扩展以入口的父目录命名(当入口文件不叫 `extension.py` 时,则以该文件本身命名)。

[原文]
One caveat: `tau -e` on an entry **file** loads it standalone — no
package, so relative imports fail. Once an extension has sibling
modules, always pass a directory: the package directory itself, or the
repo root when a manifest declares the entry.

[译文]
一个注意点:对入口**文件**使用 `tau -e` 会以独立方式加载它 —— 没有包结构,因此相对导入会失败。一旦扩展拥有同级模块,就始终传目录:可以是包目录本身,也可以是清单声明入口时所在的仓库根目录。

[原文]
Before a project decision, built-in, user-global, and explicit `-e` extensions
may handle the `project_trust` event. The event contains canonical cwd, mode,
UI availability, and bounded category counts—never protected contents. Return
`ExtensionTrustResult("approve" | "decline" | "defer", remember=...)`; the
first decisive result wins, errors safely defer, and remembered results save
only the exact cwd before project loading. Project extensions cannot approve
themselves.

[译文]
在项目决策之前,内置、用户全局与显式 `-e` 扩展可以处理 `project_trust` 事件。该事件包含规范 cwd、模式、UI 可用性与有界的类别计数 —— 绝不包含受保护内容。返回 `ExtensionTrustResult("approve" | "decline" | "defer", remember=...)`;第一个决定性结果获胜,错误会安全地转为 `defer`,带 remember 的结果只会在项目加载之前保存精确 cwd。项目扩展不能批准自己。

[原文]
After built-ins, filesystem extensions keep their existing precedence; on name
conflicts (extension names, tool names, command names) the first registration
wins. `--no-extensions` disables directory discovery (explicit `-e` paths and
trusted built-ins still load).
`/reload` awaits `session_shutdown(reason="reload")` on the outgoing
extension generation, clears its UI, re-imports every extension and re-runs
`setup`, then awaits `session_start(reason="reload")` on the new generation.
Use those lifecycle hooks to stop and restart background work and to remount UI.

[译文]
在内置扩展之后,文件系统扩展保持其既有优先级;出现名称冲突(扩展名、工具名、命令名)时先注册者胜。`--no-extensions` 会禁用目录发现(显式 `-e` 路径与受信内置扩展仍会加载)。
`/reload` 会先在旧扩展代际上 await `session_shutdown(reason="reload")`,清空其 UI,重新导入每个扩展并重跑 `setup`,然后在新代际上 await `session_start(reason="reload")`。用这些生命周期钩子停止并重启后台工作、重新挂载 UI。

[原文]
> **Security.** Extensions execute arbitrary Python inside your session.
> Project extensions are therefore off by default. Trust approval and
> `--project-extensions` are both required. Project trust is not a process,
> filesystem, network, credential, tool, model, or prompt-injection sandbox.

[译文]
> **安全。** 扩展会在你的会话中执行任意 Python。因此项目扩展默认关闭。信任批准与 `--project-extensions` 两者都必须具备。项目信任不是进程、文件系统、网络、凭据、工具、模型或提示词注入的沙箱。

## 扩展 API(The extension API)

[原文]
```python
def setup(tau):
    # registration
    tau.register_tool(agent_tool)            # tau_agent.tools.AgentTool
    tau.register_provider(dynamic_provider)  # process-local
    tau.register_command("name", handler, description="...")
    tau.add_prompt_guideline("Never commit directly to main")
    tau.add_prompt_section("Review procedure", "Read the diff, then run tests.")
    tau.on("event_name", handler)            # or @tau.on("event_name")

    # message rendering (register in setup; send once running)
    tau.register_message_renderer("my-ext:status", render_status)

    # actions — valid once the session is bound, not during setup
    tau.send_user_message("text", deliver_as="follow_up")  # or "steer"
    tau.send_custom_message("text", custom_type="my-ext:status", details={...})
    await tau.append_entry("my-ext:records", {"key": "value"})
    await tau.set_label(entry_id, "checkpoint")  # None or empty clears
    tau.notify("message", "info")            # "info" | "warning" | "error"
    tau.set_inference_provider("deepinfra")   # Hugging Face route; None resets

    # read-only context
    tau.context.cwd, tau.context.model, tau.context.provider_name
    tau.context.inference_provider             # current Hugging Face route, or None
    tau.context.inference_provider_mode        # "automatic" or "fixed"
    tau.context.session_id, tau.context.session_name
    tau.context.thinking_level, tau.context.system_prompt
    tau.context.paths                 # resolved TauPaths snapshot
    tau.context.is_running, tau.context.has_ui
    tau.context.transcript   # parent conversation, deep-copied AgentMessages

    # host-framed sidebar sections (see "Sidebar sections" below)
    sidebar = getattr(tau.context.ui, "sidebar", None)
    if sidebar is not None and sidebar.supported:
        sidebar.set_section("status", title="Status", content=["[green]ready[/green]"])

    # interactive UI dialogs (async; see "UI dialogs" below)
    await tau.context.ui.select("Title", ["a", "b"])   # -> str | None
    await tau.context.ui.confirm("Title", "message")   # -> bool
    await tau.context.ui.input("Title", "placeholder") # -> str | None
    tau.context.ui.notify("message", "info")           # same as tau.notify
```

[译文]
```python
def setup(tau):
    # 注册
    tau.register_tool(agent_tool)            # tau_agent.tools.AgentTool
    tau.register_provider(dynamic_provider)  # 进程本地
    tau.register_command("name", handler, description="...")
    tau.add_prompt_guideline("Never commit directly to main")
    tau.add_prompt_section("Review procedure", "Read the diff, then run tests.")
    tau.on("event_name", handler)            # 或 @tau.on("event_name")

    # 消息渲染(在 setup 中注册;会话运行后发送)
    tau.register_message_renderer("my-ext:status", render_status)

    # 动作 —— 会话绑定后才可用,setup 期间不可用
    tau.send_user_message("text", deliver_as="follow_up")  # 或 "steer"
    tau.send_custom_message("text", custom_type="my-ext:status", details={...})
    await tau.append_entry("my-ext:records", {"key": "value"})
    await tau.set_label(entry_id, "checkpoint")  # None 或空值表示清除
    tau.notify("message", "info")            # "info" | "warning" | "error"
    tau.set_inference_provider("deepinfra")   # Hugging Face 路由;None 表示重置

    # 只读上下文
    tau.context.cwd, tau.context.model, tau.context.provider_name
    tau.context.inference_provider             # 当前 Hugging Face 路由,或 None
    tau.context.inference_provider_mode        # "automatic" 或 "fixed"
    tau.context.session_id, tau.context.session_name
    tau.context.thinking_level, tau.context.system_prompt
    tau.context.paths                 # 解析后的 TauPaths 快照
    tau.context.is_running, tau.context.has_ui
    tau.context.transcript   # 父对话,深拷贝的 AgentMessage

    # 宿主框定的侧边栏区块(见下文「侧边栏区块」)
    sidebar = getattr(tau.context.ui, "sidebar", None)
    if sidebar is not None and sidebar.supported:
        sidebar.set_section("status", title="Status", content=["[green]ready[/green]"])

    # 交互式 UI 对话框(异步;见下文「UI 对话框」)
    await tau.context.ui.select("Title", ["a", "b"])   # -> str | None
    await tau.context.ui.confirm("Title", "message")   # -> bool
    await tau.context.ui.input("Title", "placeholder") # -> str | None
    tau.context.ui.notify("message", "info")           # same as tau.notify
```

[原文]
`set_inference_provider(route)` lets provider-specific extensions select a
Hugging Face inference-provider route for the active session. A provider name
sets `context.inference_provider_mode` to `"fixed"`, so Tau honors the explicit
selection and does not automatically fail over. Passing `None` selects
`"automatic"` mode: the next successful response becomes a sticky route that
Tau may replace after an exhausted retryable pre-output failure. Other providers
reject the operation. The current resolved route is available as
`context.inference_provider`.

[译文]
`set_inference_provider(route)` 让 provider 特有的扩展为活动会话选择一个 Hugging Face 推理 provider 路由。传入 provider 名会把 `context.inference_provider_mode` 设为 `"fixed"`,于是 Tau 尊重该显式选择,不会自动故障转移。传入 `None` 则选择 `"automatic"` 模式:下一次成功响应会成为一条粘性路由,Tau 可能在一次「输出前」的可重试失败耗尽重试后替换它。其他 provider 会拒绝该操作。当前已解析的路由可通过 `context.inference_provider` 获取。

[原文]
`setup` must be a plain `def` (not `async def`). Event handlers may be sync
or async and always receive `(event, context)`; the context is freshly created
for each dispatch. Action methods raise `ExtensionError` if called before the session
is bound — register handlers in `setup` and act on events instead.

[译文]
`setup` 必须是普通的 `def`(不能是 `async def`)。事件处理器可以是同步或异步,并且总是接收 `(event, context)`;每次分发都会新建上下文。在会话绑定之前调用动作方法会抛出 `ExtensionError` —— 请在 `setup` 中注册处理器,并改为在事件中执行动作。

#### 解析后的文件系统路径(Resolved filesystem paths)

[原文]
`tau.context.paths` is a read-only `TauPaths` snapshot for the active session.
If the host supplies `TauResourcePaths.paths`, that object is authoritative and
preserves custom `TauPaths.home` and `TauPaths.agents_home` locations. Otherwise
Tau derives one as
`TauPaths(home=resource_paths.root, agents_home=resource_paths.agents_root or ~/.agents)`.
In other words, `root`/`home` controls Tau's user data and extension directory,
while `agents_root`/`agents_home` controls `.agents` resources; the project
`cwd` remains separate. `ExtensionRuntime(paths=custom_paths)` exposes its
constructor paths immediately, before `load`; a later `load` makes its
`TauResourcePaths` snapshot authoritative.

[译文]
`tau.context.paths` 是活动会话的只读 `TauPaths` 快照。如果宿主提供了 `TauResourcePaths.paths`,该对象就是权威来源,并保留自定义的 `TauPaths.home` 与 `TauPaths.agents_home` 位置。否则 Tau 会这样推导:
`TauPaths(home=resource_paths.root, agents_home=resource_paths.agents_root or ~/.agents)`。
换句话说,`root`/`home` 控制 Tau 的用户数据与扩展目录,而 `agents_root`/`agents_home` 控制 `.agents` 资源;项目的 `cwd` 保持独立。`ExtensionRuntime(paths=custom_paths)` 会在 `load` 之前立即暴露其构造参数中的路径;之后的一次 `load` 会使其 `TauResourcePaths` 快照成为权威。

[原文]
The snapshot belongs to the extension generation. After `/reload` (and other
fresh-generation replacement flows), a context captured from the outgoing
generation is stale: even reading `context.paths` raises `ExtensionError`. Read
`context.paths` again from the new generation's context.

[译文]
该快照属于扩展代际。`/reload`(以及其他切换到新代际的替换流程)之后,从旧代际捕获的上下文已经陈旧:即使只是读取 `context.paths` 也会抛出 `ExtensionError`。请从新代际的上下文中重新读取 `context.paths`。

### 本地后端注册(Local-backend registrations)

[原文]
An extension can pair a provider layer with a provider-neutral local backend:

[译文]
扩展可以把一个 provider 层与一个 provider 无关的本地后端配对:

```python
def setup(tau):
    tau.register_provider(provider)
    tau.register_local_backend(backend)
```

[原文]
A backend declares structured text, secret, and choice fields plus asynchronous
configuration, refresh, status, and optional doctor/reset/model-management
operations. The host renders the values and owns confirmation, cancellation, and
idle checks; backend code never receives Textual widgets. Configuration is one
transaction, so validation or safe-state failure does not replace the prior
configuration. Secrets stay out of representations and host diagnostics.

[译文]
后端声明结构化的文本、密钥与选择字段,以及异步的配置、刷新、状态,和可选的 doctor/reset/模型管理操作。宿主负责渲染这些值,并持有确认、取消与空闲检查;后端代码永远不会拿到 Textual 组件。配置是一个事务,因此校验或安全状态失败不会替换先前的配置。密钥不会进入各种表示与宿主诊断。

[原文]
The backend and provider must be registered by the same source and generation.
If another source shadows the provider, the backend can remain inspectable but
cannot use, reset, or manage models through the shadowed layer. Retired or
reloaded generations cancel their backend work and ignore late results. See the
[local backends guide]({{< relref "./local-inference.md" >}}).

[译文]
后端与 provider 必须由同一来源、同一代际注册。如果另一个来源遮蔽了该 provider,后端仍可被检查,但不能通过被遮蔽的层来使用、重置或管理模型。已退役或已 reload 的代际会取消其后端工作并忽略迟到结果。见[本地后端指南]({{< relref "./local-inference.md" >}})。

### 动态 Provider(Dynamic providers)

[原文]
`register_provider` installs a complete `DynamicProvider` layer owned by the
calling extension source and current runtime generation. A provider may start
dormant with no models, and supplies exactly one runtime mechanism: an
`OpenAICompatibleTransport` descriptor or a custom runtime factory. Use
`ProviderModel` values for known metadata; leave unknown fields as `None`.

[译文]
`register_provider` 会安装一个完整的 `DynamicProvider` 层,其所有权归调用它的扩展来源与当前运行时代际。Provider 可以以没有任何模型的休眠状态启动,并且只提供一种运行时机制:`OpenAICompatibleTransport` 描述符,或自定义运行时工厂。已知元数据用 `ProviderModel` 值填写;未知字段留为 `None`。

[原文]
Authentication is explicit: `RequiredApiKey`, `OptionalApiKey`, or `NoAuth`.
Stored credentials win over the configured environment variable. Optional or
absent keys omit `Authorization`; Tau never synthesizes a local key. Static
transport/model headers cannot provide `Authorization`; custom schemes must be
resolved by an auth strategy at runtime. Resolved keys, headers, and arbitrary
auth provenance stay out of provider representations and diagnostics. Runtime
creation replaces custom auth exceptions with a categorical host error; Tau's exact
required-key strategy still reports its actionable missing-credential guidance.
Nested JSON compatibility metadata is deeply frozen while registered and copied to ordinary
JSON containers only when a runtime transport is created.

[译文]
认证是显式的:`RequiredApiKey`、`OptionalApiKey` 或 `NoAuth`。已存储凭据优先于已配置的环境变量。可选或缺失的密钥会省略 `Authorization`;Tau 绝不合成一个本地密钥。静态的传输/模型 headers 不能提供 `Authorization`;自定义方案必须在运行时由认证策略解析。已解析的密钥、headers 与任意认证来源信息都不会进入 provider 的表示与诊断。运行时构建会把自定义认证异常替换为一个分类性的宿主错误;Tau 精确的 required-key 策略仍会给出可操作的「缺少凭据」指引。嵌套的 JSON 兼容性元数据在注册期间被深度冻结,只有在创建运行时传输时才复制到普通 JSON 容器。

[原文]
Discovery is snapshot-oriented. A `refresh_models` callback returns a complete
`ProviderModelSnapshot`; the registry validates and publishes it atomically.
Concurrent callers share work only when their layer and `allow_network` policy
match, and each caller keeps its own timeout. Opposite network policies never
alias. The last timeout and explicit cancellation leave the coalescing table before
returning, so an immediate retry invokes fresh discovery. Tau requests task
cancellation once, then waits up to 0.25 seconds from that request without
re-cancelling a callback's `finally` cleanup. Reload, session replacement, and final
close await this cooperative drain. Once reload/replacement publishes its new state,
caller cancellation is contained until outgoing cleanup finishes and the operation
returns the adopted result; it never reports cancellation as though publication
rolled back. Before publication, the replacement remains the explicit owner of its
candidate providers. Cancellation or failure during outgoing shutdown or incoming
start closes those candidates exactly once without closing the active provider;
success transfers ownership once. Final close uses one durable close task and
propagates cancellation only after the extension registry and every session-owned
runtime provider have each been closed once. A callback still running at the bound is reported as contained—not
drained—and a process-owned supervisor keeps its task and generation registry
reachable until it actually finishes; it cannot publish after source replacement or
retirement. Timeout, malformed output, and other failures retain the current
snapshot.

[译文]
发现是面向快照的。`refresh_models` 回调返回一个完整的 `ProviderModelSnapshot`;注册表会校验它并原子发布。并发调用方只有在层与 `allow_network` 策略都匹配时才共享工作,且每个调用方保有自己的超时。相反的网络策略绝不会共用同一份工作。最后一个等待方超时以及显式取消,都会在返回之前离开合并表,因此立即重试会发起新的发现。Tau 只请求一次任务取消,然后从该请求起最多等待 0.25 秒,不会对回调的 `finally` 清理再次取消。Reload、会话替换与最终 close 都会 await 这次协作式排空。一旦 reload/替换发布了新状态,调用方取消就会被受控处理,直到外出清理结束、且操作返回已采纳的结果;它绝不会把取消报告成「发布已回滚」。在发布之前,替换会话仍是其候选 provider 的明确所有者。外出关闭或进入启动期间的取消或失败,会把这些候选恰好关闭一次,而不关闭活动 provider;成功则把所有权转移一次。最终 close 使用一个持久化的关闭任务,并且只有在扩展注册表与每个会话自有的运行时 provider 都各自被关闭一次之后,才传播取消。到达上限时仍在运行的回调会被报告为「受控(contained)」而非「已排空」,而一个由进程持有的监督者会保持其任务与代际注册表可达,直到它真正结束;它无法在来源替换或退役之后发布。超时、畸形输出与其他失败都会保留当前快照。

[原文]
Dynamic definitions are runtime overlays—not durable configuration. Tau never
copies them into `catalog.toml`, `providers.json`, sessions, or generic extension
storage. Provider source ownership comes from the canonical entry path assigned by
the host, not the display name. The loader freezes all discovered source IDs before
importing any extension, so import/setup code cannot change ownership by retargeting
an entry or parent symlink. The stored ID is used for duplicate checks, every API
registration, and complete failed-setup cleanup. Separately loaded same-name
extensions therefore form independent provider layers; repeating the exact entry
source in one runtime is ignored with first-loaded precedence. Tools and commands
still use their first-registration-wins name registries. Removing a source reveals
the preceding complete layer, including the exact durable provider baseline. The contracts are
frontend-free and callbacks must not return Rich/Textual values.

[译文]
动态定义是运行时叠加层 —— 不是持久化配置。Tau 绝不把它们复制进 `catalog.toml`、`providers.json`、会话或通用扩展存储。Provider 的来源所有权来自宿主编排的规范入口路径,而不是显示名。加载器会在导入任何扩展之前冻结所有发现到的来源 ID,因此导入/setup 代码无法通过重定向入口或父级符号链接改变所有权。存储的 ID 用于重复检查、每一次 API 注册,以及完整的 setup 失败清理。因此,分别加载的同名扩展会形成彼此独立的 provider 层;在同一个运行时中重复同一入口来源会被忽略,遵循「先加载者优先」。工具与命令仍然使用各自的「先注册者胜」名称注册表。移除一个来源会重新暴露出前一个完整层,包括精确的持久化 provider 基线。这些契约与前端无关,回调不得返回 Rich/Textual 值。

[原文]
Phase 6 validates these contracts with a permanent second fake backend and a
small test-only Ollama adapter. The trusted built-in `llama.cpp` provider uses
the same seams; no production Ollama backend is shipped. Provider discovery and
backend status may use different protocol endpoints, and `NoAuth` is a first-
class option. Its connection, cache, and troubleshooting behavior are covered
in the [local inference guide]({{< relref "./local-inference.md" >}}). Router
management and Hugging Face model mutations remain outside this phase.

[译文]
Phase 6 用一个常驻的第二假后端与一个仅用于测试的小型 Ollama 适配器验证了这些契约。受信的内置 `llama.cpp` provider 使用同一批接缝;不随包交付任何生产级 Ollama 后端。Provider 发现与后端状态可以使用不同的协议端点,而 `NoAuth` 是一等选项。它的连接、缓存与排障行为见[本地推理指南]({{< relref "./local-inference.md" >}})。Router 管理与 Hugging Face 模型变更不在本阶段范围内。

### 工具(Tools)

[原文]
`register_tool` takes a plain `tau_agent.tools.AgentTool`: a name, label,
description, a hand-written JSON-schema `parameters` mapping, and an async
`execute_fn(tool_call_id, arguments, signal=None, on_update=None)`. Give the tool a
`prompt_snippet` to list it in the system prompt's "Available tools"
section, and `prompt_guidelines` for usage guidance tied to the tool.
Registering a tool with a built-in's name (`read`, `write`, `edit`,
`bash`) replaces the built-in.

[译文]
`register_tool` 接收一个普通的 `tau_agent.tools.AgentTool`:名称、标签、描述、手写的 JSON schema `parameters` 映射,以及异步的 `execute_fn(tool_call_id, arguments, signal=None, on_update=None)`。给工具一个 `prompt_snippet`,它就会出现在系统提示词的 "Available tools" 区块;再给 `prompt_guidelines` 提供与该工具绑定的使用指引。用内置工具的名字(`read`、`write`、`edit`、`bash`)注册工具会替换该内置工具。

[原文]
A long-running tool can stream progress: an executor that additionally
uses `on_update` receives a callback accepting an `AgentToolResult`; each call becomes a
`tool_execution_update` event and drives the TUI's live progress line.
Executors without the parameter are unaffected.

[译文]
长时间运行的工具可以流式上报进度:额外使用 `on_update` 的执行器会收到一个接受 `AgentToolResult` 的回调;每次调用都会变成一个 `tool_execution_update` 事件,并驱动 TUI 的实时进度行。没有该参数的执行器不受影响。

[原文]
By default the TUI shows an unrecognized tool call as `name {arguments}`
(truncated). Give the tool a `render_call` — `(arguments) -> str | None` —
to render a friendly one-line invocation instead (Pi's `renderCall`): for
example a subagent tool showing its `description` argument rather than the
raw JSON. Return `None` to fall back to the generic line. Renderer errors
are swallowed (diagnosed once per tool) and never crash the UI.

[译文]
默认情况下,TUI 把无法识别的工具调用显示为 `name {arguments}`(截断后)。给工具一个 `render_call` —— `(arguments) -> str | None` —— 即可改为渲染一行友好的调用(即 Pi 的 `renderCall`):例如子代理工具显示它的 `description` 参数,而不是原始 JSON。返回 `None` 则回退到通用行。渲染器错误会被吞掉(按工具只诊断一次),绝不会让 UI 崩溃。

[原文]
While a tool is executing, the TUI animates its row: a braille spinner
stands in for the line's leading marker (`→ ` / `▸ `) and, after the first
second, a live elapsed time is appended (`… (1m 23s)`). Keep `render_call`
output to a single line starting with a marker like `▸ ` so the spinner has
something to replace.

[译文]
工具执行期间,TUI 会让该行动起来:用盲文 spinner 替代行首标记(`→ ` / `▸ `),并在超过一秒后追加实时耗时(`… (1m 23s)`)。请把 `render_call` 的输出保持为以 `▸ ` 之类标记开头的单行,这样 spinner 才有东西可替换。

[原文]
For behavioral guidance not tied to any tool, `add_prompt_guideline(text)`
adds a line to the system prompt's Guidelines section (de-duplicated at
build time; `/reload` rebuilds the prompt when guidelines change).

[译文]
对于不绑定任何工具的行为指引,`add_prompt_guideline(text)` 会向系统提示词的 Guidelines 区块添加一行(构建时去重;当这些准则变化时,`/reload` 会重建提示词)。

[原文]
For structured, always-on context, `add_prompt_section(title, body)` appends a
free-form section after cumulative user and project `APPEND_SYSTEM.md` files and
`--append-system-prompt` content. The title may be `None`; a title is rendered
as a level-two Markdown heading. Bodies may contain paragraphs, lists, and code
blocks without being forced into a guideline bullet:

[译文]
对于结构化的常驻上下文,`add_prompt_section(title, body)` 会在累积的用户与项目 `APPEND_SYSTEM.md` 文件以及 `--append-system-prompt` 内容之后追加一个自由格式区块。title 可以为 `None`;有 title 时会渲染为二级 Markdown 标题。body 可以包含段落、列表与代码块,而不必被塞进一条 guideline 要点:

````python
def setup(tau):
    tau.add_prompt_section(
        "Review procedure",
        """Read the complete diff before editing.

```bash
uv run pytest
```
""",
    )
````

[原文]
Sections compose in extension load and registration order. Empty bodies and
multi-line titles are ignored with a resource diagnostic. Registrations are
source-owned, so failed setup, `/reload`, and generation retirement remove them
along with the extension's other contributions.

[译文]
各区块按扩展加载与注册顺序组合。空的 body 与多行 title 会被忽略,并给出资源诊断。注册由来源持有,因此 setup 失败、`/reload` 与代际退役都会把它们连同该扩展的其他贡献一起移除。

### 命令(Commands)

[原文]
`register_command(name, handler, *, description, usage, aliases)` adds a
slash command. Handlers are sync, receive `(args: str, context)`, and may
return a `str` shown to the user. Built-in commands cannot be overridden.
Extension commands appear in the TUI autocomplete automatically.

[译文]
`register_command(name, handler, *, description, usage, aliases)` 添加一条斜杠命令。处理器是同步的,接收 `(args: str, context)`,并可以返回一个展示给用户的 `str`。内置命令不能被覆盖。扩展命令会自动出现在 TUI 自动补全中。

### UI 对话框(UI dialogs)

[原文]
`tau.context.ui` gives extensions host-provided interactive dialogs (Pi's
`ctx.ui`). All three dialog methods are `async`:

[译文]
`tau.context.ui` 为扩展提供由宿主提供的交互式对话框(即 Pi 的 `ctx.ui`)。三个对话框方法都是 `async`:

```python
choice = await tau.context.ui.select("Deploy to", ["staging", "prod"])
ok     = await tau.context.ui.confirm("Deploy?", "This ships to production.")
name   = await tau.context.ui.input("Release name", "e.g. v1.2.0")
```

[原文]
- `select(title, options, *, timeout=None) -> str | None` — a picker;
  returns the chosen option, or `None` if cancelled.
- `confirm(title, message, *, timeout=None) -> bool` — a yes/no dialog;
  returns `True` only if confirmed.
- `input(title, placeholder="", *, timeout=None) -> str | None` — a text
  prompt; returns the text (empty string on an empty submit), or `None` if
  cancelled.
- `timeout` is in **seconds**; when it elapses the dialog auto-dismisses and
  returns the cancel default (`None`/`False`/`None`).

[译文]
- `select(title, options, *, timeout=None) -> str | None` —— 选择器;返回所选项,取消时返回 `None`。
- `confirm(title, message, *, timeout=None) -> bool` —— 是/否对话框;只有确认时才返回 `True`。
- `input(title, placeholder="", *, timeout=None) -> str | None` —— 文本提示;返回输入的文本(空提交返回空字符串),取消时返回 `None`。
- `timeout` 的单位是**秒**;超时后对话框会自动关闭,并返回取消默认值(`None`/`False`/`None`)。

[原文]
Without an interactive frontend (print mode, `-p`, tests) every dialog
returns its cancel default immediately, so extensions can call them
unconditionally. Check `tau.context.ui.has_ui` (or `tau.context.has_ui`) if
you want to branch on whether a real UI is attached.

[译文]
在没有交互式前端时(print 模式、`-p`、测试),每个对话框都会立即返回取消默认值,因此扩展可以无条件调用它们。如果你想根据「是否挂载了真实 UI」分支,请检查 `tau.context.ui.has_ui`(或 `tau.context.has_ui`)。

[原文]
**Driving a dialog from a slash command.** Command handlers are synchronous,
so they cannot `await` a dialog directly. Instead, spawn a task on the
running event loop and return immediately:

[译文]
**从斜杠命令驱动对话框。** 命令处理器是同步的,因此不能直接 `await` 对话框。改为在运行中的事件循环上派生一个任务并立即返回:

```python
import asyncio

def _handler(args, context):
    async def _menu():
        choice = await context.api.context.ui.select("Action", ["deploy", "cancel"])
        if choice and choice != "cancel":
            context.api.send_user_message(f"run {choice}")
    asyncio.get_running_loop().create_task(_menu())
    return None  # any returned text opens a modal the user must dismiss first

def setup(tau):
    tau.register_command("menu", _handler)
```

[原文]
The task runs on the same event loop as the session, so awaiting the dialog
there is safe. (A tool executor, which is already `async`, can `await
tau.context.ui...` directly.)

[译文]
该任务与会话运行在同一个事件循环上,因此在那里 await 对话框是安全的。(工具执行器本身已是 `async`,可以直接 `await tau.context.ui...`。)

### 侧边栏区块(Sidebar sections)

[原文]
`tau.context.ui.sidebar` lets an extension contribute a section to Tau's
interactive session sidebar without querying private widget IDs or importing
`TauTuiApp`. Register sections from `session_start`, after the frontend bridge
is attached:

[译文]
`tau.context.ui.sidebar` 让扩展可以向 Tau 的交互式会话侧边栏贡献一个区块,而无需查询私有组件 ID 或导入 `TauTuiApp`。请在前端桥挂载之后、于 `session_start` 中注册区块:

```python
def setup(tau):
    turn_count = 0

    def show(context):
        sidebar = getattr(context.ui, "sidebar", None)
        if sidebar is not None and sidebar.supported:
            sidebar.set_section(
                "turns",
                title="extension status",
                content=[f"[green]{turn_count}[/green] completed turns"],
            )

    @tau.on("session_start")
    def started(event, context):
        show(context)

    @tau.on("turn_end")
    def finished(event, context):
        nonlocal turn_count
        turn_count += 1
        show(context)  # replacing the same key updates it in place

    @tau.on("session_shutdown")
    def stopped(event, context):
        sidebar = getattr(context.ui, "sidebar", None)
        if sidebar is not None:
            sidebar.remove_section("turns")
```

[原文]
- Feature-detect the `sidebar` attribute with `getattr` when supporting older
  Tau versions. On current Tau, `sidebar.supported` is `False` in
  print/headless mode and when `sidebar_position` is `"off"`; calls are safe
  no-ops without a visible sidebar.
- `set_section(key, *, title, content)` adds or replaces this extension's key.
  Keys are isolated by extension, so two extensions may both use `"status"`.
  Updating a key preserves its position; removing and re-adding it places it
  after existing extension sections.
- `content` is either a sequence of Rich-markup display lines or a
  `factory(theme) -> textual.widget.Widget`. Prefer lines when possible: they
  need no Textual import and the host owns wrapping, width, scrolling, heading,
  separator, and left/right placement. Factories are rebuilt with the live
  theme and use the same crash isolation as other extension widgets.
- `remove_section(key)` removes the section. The host also clears every
  extension section on reload, session replacement, and shutdown. Responsive
  hiding preserves sections so they return when the terminal grows.

[译文]
- 在需要兼容旧版 Tau 时,用 `getattr` 对 `sidebar` 属性做特性探测。在当前 Tau 上,print/无头模式以及 `sidebar_position` 为 `"off"` 时 `sidebar.supported` 为 `False`;没有可见侧边栏时这些调用是安全的无操作。
- `set_section(key, *, title, content)` 添加或替换该扩展的键。键按扩展隔离,因此两个扩展都可以使用 `"status"`。更新某个键会保持其位置;先移除再加入会把它放到既有扩展区块之后。
- `content` 要么是 Rich 标记显示行的序列,要么是 `factory(theme) -> textual.widget.Widget`。尽可能优先使用显示行:它们不需要导入 Textual,且由宿主负责折行、宽度、滚动、标题、分隔符与左右放置。工厂会用实时主题重建,并使用与其他扩展控件相同的崩溃隔离。
- `remove_section(key)` 移除该区块。宿主还会在 reload、会话替换与关闭时清空所有扩展区块。响应式隐藏会保留区块,使它们在终端变大时重新出现。

[原文]
See `examples/extensions/sidebar_status.py` for a complete example.

[译文]
完整示例见 `examples/extensions/sidebar_status.py`。

### 组件控件(Component widgets)

[原文]
> This seam lets an extension mount its own **Textual widgets** into the TUI
> instead of publishing string data. It deliberately makes Textual part of the
> public extension contract (the "component" type *is*
> `textual.widget.Widget`): extensions build against the Textual version tau
> pins, and a Textual major bump is a coordinated break for core and
> extensions together. An extension that runs its own conversations (e.g.
> subagents) builds its own agents strip and in-place conversation view with
> this seam. Prefer strings/data (message renderers, tool renderers, string
> slot widgets) when they are enough — they work in every frontend, including
> print mode; reach for widgets when the extension needs live, interactive UI.

[译文]
> 这条接缝让扩展可以把自有的 **Textual 控件**挂载进 TUI,而不是只发布字符串数据。它有意把 Textual 纳入公开扩展契约(「组件」类型*就是* `textual.widget.Widget`):扩展针对 tau 固定的 Textual 版本构建,而 Textual 的大版本升级是内核与扩展共同承担的协同破坏性变更。需要自行运行对话的扩展(例如子代理)就用这条接缝构建自己的 agents 状态条与就地对话视图。在字符串/数据已足够时优先使用它们(消息渲染器、工具渲染器、字符串槽位控件)—— 它们在包括 print 模式在内的每个前端都能工作;只有当扩展需要实时、可交互的 UI 时才动用控件。

[原文]
`tau.context.ui.components` (a `ComponentBridge`) hosts extension widgets.
Always gate on `supports_components` first — it is `False` in print mode and on
any host without this seam, where every call below is a safe no-op:

[译文]
`tau.context.ui.components`(一个 `ComponentBridge`)负责托管扩展控件。请始终先以 `supports_components` 门控 —— 在 print 模式以及任何没有这条接缝的宿主上它为 `False`,此时下面的每个调用都是安全的无操作:

```python
def setup(tau):
    components = tau.context.ui.components
    if not components.supports_components:
        return  # print mode / older host: stay widget-less but functional

    # A persistent widget above or below the prompt. The factory runs on the UI
    # thread and receives the live theme.
    def build_strip(theme):
        return MyStripWidget(theme)          # a textual.widget.Widget

    components.set_slot_widget("my-widget", build_strip, placement="below_prompt")
    # set_slot_widget("my-widget", None) removes it again.

    # For plain text you can skip the factory (and the Textual import) entirely
    # by passing a list of display lines — the host renders them as Rich markup:
    #   components.set_slot_widget("status", ["[b]ready[/b]", "2 tasks queued"])

    # A pre-dispatch key hook (ports Pi's onTerminalInput): it is consulted
    # before the host's app-level priority bindings AND before the focused
    # widget, so returning True for "escape" preempts the turn-cancel and
    # returning True for "down" preempts completion nav. It fires for EVERY
    # main-screen key regardless of which widget has focus (never while a
    # modal dialog/picker is on top), so it MUST self-gate — e.g. on the
    # prompt text — and return True only for keys it actually consumes.
    def on_key(event, prompt_text):
        if prompt_text == "" and event.key == "down":
            ...            # activate your widget
            return True     # consume the key
        return False        # let it through
    unsubscribe = components.register_key_interceptor(on_key)
```

[原文]
- `set_slot_widget(key, content, *, placement="above_prompt")` mounts an
  extension widget into a prompt-adjacent slot (`"above_prompt"` — the default —
  or `"below_prompt"`). `content` is either a `factory(theme)` callable or a
  plain list of display lines the host renders as Rich markup (so a text-only
  widget needs no Textual import); passing `content=None` removes that key.
  Multiple keys per placement mount in call order.
- `open_main_view(factory) -> handle` mounts `factory(handle, theme)` as a
  full main-area view *in place of* the transcript (a display-toggled sibling,
  **not** a modal screen), so your slot widgets stay visible and the prompt
  keeps focus — embed your own composer if you want one. `handle.close()`
  restores the transcript; `handle.is_open` reports its state.
- `register_key_interceptor(handler) -> unsubscribe` — `handler(event,
  prompt_text)`; return `True` to consume a key. Pre-dispatch: consulted ahead
  of the host's priority bindings and the focused widget, for every main-screen
  key (never while a modal is on top) — self-gate accordingly. A raising
  interceptor is treated as "not consumed".
- `theme` is the live `TuiTheme`; `get_prompt_text()` reads the prompt editor
  (interceptors already receive it as their second argument);
  `request_render()` re-renders your mounted widgets. Push live updates by
  calling your widget's own `refresh()` (Textual) — the seam does not poll.

[译文]
- `set_slot_widget(key, content, *, placement="above_prompt")` 把一个扩展控件挂载到紧邻提示输入的槽位(`"above_prompt"` —— 默认值 —— 或 `"below_prompt"`)。`content` 要么是可调用的 `factory(theme)`,要么是宿主按 Rich 标记渲染的普通显示行列表(因此纯文本控件无需导入 Textual);传入 `content=None` 会移除该键。同一放置位置上的多个键按调用顺序挂载。
- `open_main_view(factory) -> handle` 把 `factory(handle, theme)` 挂载为一个完整的主区域视图,*取代*会话记录(是显示开关控制的兄弟节点,**不是**模态屏幕),因此你的槽位控件保持可见,提示输入也保有焦点 —— 想要输入框就自行内嵌。`handle.close()` 恢复会话记录;`handle.is_open` 报告其状态。
- `register_key_interceptor(handler) -> unsubscribe` —— `handler(event, prompt_text)`;返回 `True` 表示消费该键。它处于分发前:在宿主的优先级绑定与获得焦点的组件之前被查询,对主屏幕上的每个按键都生效(上层有模态框时除外)—— 请相应地自我门控。抛异常的拦截器会被视为「未消费」。
- `theme` 是实时的 `TuiTheme`;`get_prompt_text()` 读取提示编辑器(拦截器本就把提示文本作为第二个参数收到);`request_render()` 重新渲染你已挂载的控件。推送实时更新请调用你自己控件的 `refresh()`(Textual)—— 这条接缝不做轮询。

[原文]
The host is defensive: a factory that raises, a widget that crashes in
`render`/`on_mount`, or a throwing interceptor is isolated (quarantined and
diagnosed) so a broken component never takes the TUI down. All mounted widgets
are force-cleared on session rebind (`/resume`, `/new`) and teardown; also clear
your own on `session_shutdown`.

[译文]
宿主是防御性的:抛异常的工厂、在 `render`/`on_mount` 中崩溃的控件,或抛异常的拦截器都会被隔离(隔离并诊断),因此损坏的组件绝不会拖垮 TUI。所有已挂载控件会在会话重新绑定(`/resume`、`/new`)与拆卸时被强制清理;也请在 `session_shutdown` 中清理你自己的。

### 事件(Events)

[原文]
Observation events mirror the canonical agent/session stream. Handlers receive
`(event, context)`, run on the session event loop, and may subscribe to one
`type` or use `agent_event` for the complete stream.

[译文]
观察类事件镜像规范的 agent/会话事件流。处理器接收 `(event, context)`,运行在会话事件循环上,可以订阅某一个 `type`,也可以用 `agent_event` 获取完整事件流。

[原文]
| Event | Important payload |
|---|---|
| `agent_start` | — |
| `agent_end` | `messages`, `will_retry` on the session form |
| `agent_settled` | —; the started run has finished teardown and has no automatic retry, compaction, or continuation remaining; dispatched to extensions after interruption even if the cancelling frontend can no longer consume the streamed event |
| `turn_start` | `turn_index`, Unix-millisecond `timestamp` |
| `turn_end` | matching `turn_index`, `message`, `tool_results` |
| `message_start` / `message_end` | `message`; assistant usage is at `message.usage` |
| `message_update` | `message`, nested `assistant_message_event` |
| `tool_execution_start` | `tool_call_id`, `tool_name`, `args` |
| `tool_execution_update` | the call fields plus `partial_result` |
| `tool_execution_end` | the call fields plus `result`, `is_error` |
| `queue_update` | `steering`, `follow_up` |
| `compaction_start` | `reason` (`manual`, `threshold`, or `overflow`) |
| `compaction_end` | `reason`, `result`, `aborted`, `will_retry`, `error_message` |
| `entry_appended` | persisted session `entry` |
| `session_info_changed` | session `name`; emitted after automatic naming or `await session.set_session_name(...)` |
| `thinking_level_changed` | `level`; emitted after an explicit thinking-mode change |
| `auto_retry_start` | `attempt`, `max_attempts`, `delay_ms`, `error_message` |
| `auto_retry_end` | `success`, `attempt`, `final_error` |

[译文]
| 事件 | 重要载荷 |
|---|---|
| `agent_start` | — |
| `agent_end` | `messages`;会话形态下还有 `will_retry` |
| `agent_settled` | —;已启动的运行完成了拆卸,且不再有自动重试、压缩或续跑;即使在取消它的前端已无法继续消费流式事件之后,也会在中断后分发给扩展 |
| `turn_start` | `turn_index`、Unix 毫秒 `timestamp` |
| `turn_end` | 对应的 `turn_index`、`message`、`tool_results` |
| `message_start` / `message_end` | `message`;assistant 的用量在 `message.usage` |
| `message_update` | `message`、嵌套的 `assistant_message_event` |
| `tool_execution_start` | `tool_call_id`、`tool_name`、`args` |
| `tool_execution_update` | 调用字段加上 `partial_result` |
| `tool_execution_end` | 调用字段加上 `result`、`is_error` |
| `queue_update` | `steering`、`follow_up` |
| `compaction_start` | `reason`(`manual`、`threshold` 或 `overflow`) |
| `compaction_end` | `reason`、`result`、`aborted`、`will_retry`、`error_message` |
| `entry_appended` | 已持久化的会话 `entry` |
| `session_info_changed` | 会话 `name`;在自动命名或 `await session.set_session_name(...)` 之后发出 |
| `thinking_level_changed` | `level`;在显式的 thinking 模式变更之后发出 |
| `auto_retry_start` | `attempt`、`max_attempts`、`delay_ms`、`error_message` |
| `auto_retry_end` | `success`、`attempt`、`final_error` |

[原文]
`message_update.assistant_message_event` is the provider-neutral incremental
stream. Its nested `type` is one of `text_start`, `text_delta`, `text_end`,
`thinking_start`, `thinking_delta`, `thinking_end`, `toolcall_start`,
`toolcall_delta`, or `toolcall_end`. Terminal provider events become
`message_end`, rather than another `message_update`.

[译文]
`message_update.assistant_message_event` 是 provider 无关的增量事件流。其嵌套的 `type` 是 `text_start`、`text_delta`、`text_end`、`thinking_start`、`thinking_delta`、`thinking_end`、`toolcall_start`、`toolcall_delta` 或 `toolcall_end` 之一。终态的 provider 事件会变成 `message_end`,而不是再来一个 `message_update`。

[原文]
`context.session_name` and `context.thinking_level` provide the current values
when an extension attaches or a replacement session starts. Their matching
change events carry snapshots of later updates; no-op assignments do not emit.
Model changes, `/model` and `/local` selections, scoped-model toggles,
provider reloads, and branch/resume can coerce the active thinking level to
what the selected model supports without an explicit `thinking_level_changed`
event, so read the live context when handling other events instead of treating
change events as a complete cache feed.

[译文]
`context.session_name` 与 `context.thinking_level` 在扩展挂载或替换会话启动时提供当前值。它们对应的变更事件携带后续更新的快照;无操作的赋值不会发出事件。模型切换、`/model` 与 `/local` 的选择、scoped 模型开关、provider 重载以及分支/恢复,都可能把活动 thinking 等级强制转换为所选模型支持的值,而不发出显式的 `thinking_level_changed` 事件,因此在处理其他事件时请读取实时上下文,而不要把变更事件当作完整的缓存数据源。

[原文]
Extension turn events are session-enriched like Pi's. `turn_start` and its
matching `turn_end` carry the same zero-based `turn_index`; `turn_start` also
carries a Unix-millisecond `timestamp`. The runtime increments the index after
`turn_end` and resets it on the next `agent_start`:

[译文]
扩展的轮次事件与 Pi 一样带有会话增强信息。`turn_start` 与对应的 `turn_end` 携带同一个从零开始的 `turn_index`;`turn_start` 还携带 Unix 毫秒 `timestamp`。运行时在 `turn_end` 之后递增该索引,并在下一次 `agent_start` 时重置:

```python
from tau_coding.extensions import TurnEndEvent, TurnStartEvent


def setup(tau):
    @tau.on("turn_start")
    def on_turn_start(event: TurnStartEvent, context):
        context.api.notify(
            f"turn {event.turn_index} started at {event.timestamp}", "info"
        )

    @tau.on("turn_end")
    def on_turn_end(event: TurnEndEvent, context):
        assert event.turn_index >= 0
```

[原文]
These enriched payloads are defined in `tau_coding.extensions`. The portable
`tau_agent.events.TurnStartEvent` and `TurnEndEvent` intentionally omit session
metadata, so reusable agent code stays independent of session policy.

[译文]
这些增强载荷定义在 `tau_coding.extensions`。可移植的 `tau_agent.events.TurnStartEvent` 与 `TurnEndEvent` 有意省略会话元数据,使可复用的 agent 代码保持独立于会话策略。

[原文]
Lifecycle and intercepting hooks:

[译文]
生命周期与拦截钩子:

[原文]
| Event | Payload | Handler may return |
|---|---|---|
| `session_start` | `SessionStartEvent(reason)` | — |
| `session_shutdown` | `SessionShutdownEvent(reason)` | — |
| `input` | `InputEvent(text)` | `InputHookResult(action, text, message)` |
| `tool_call` | `ToolCallHookEvent(tool_name, arguments)` | `ToolCallHookResult(block, reason, arguments)` |
| `tool_result` | `ToolResultHookEvent(tool_name, arguments, result)` | `ToolResultHookResult(content, details)` |

[译文]
| 事件 | 载荷 | 处理器可返回 |
|---|---|---|
| `session_start` | `SessionStartEvent(reason)` | — |
| `session_shutdown` | `SessionShutdownEvent(reason)` | — |
| `input` | `InputEvent(text)` | `InputHookResult(action, text, message)` |
| `tool_call` | `ToolCallHookEvent(tool_name, arguments)` | `ToolCallHookResult(block, reason, arguments)` |
| `tool_result` | `ToolResultHookEvent(tool_name, arguments, result)` | `ToolResultHookResult(content, details)` |

[原文]
- `session_start` fires once the host frontend is attached (Pi's ordering:
  the UI starts before extensions initialize), so handlers can call
  `tau.notify(...)` or open dialogs and they will actually be seen.
- `input` runs on the raw prompt text before skill/template expansion.
  `action="transform"` rewrites it (transforms chain), `action="handled"`
  consumes it without an agent run and shows `message` as a notification.
- `tool_call` runs before a tool executes. `block=True` prevents execution
  and reports `reason` to the model; returning `arguments` rewrites the
  call. A crashing `tool_call` handler blocks the tool (fail-safe).
- `tool_result` can rewrite a result's text `content` or `details`; execution
  error state belongs to the host's tool lifecycle rather than the result payload.

[译文]
- `session_start` 在宿主前端挂载之后触发(Pi 的顺序是:UI 先启动,扩展再初始化),因此处理器可以调用 `tau.notify(...)` 或打开对话框,而且确实会被看到。
- `input` 在技能/模板展开之前,对原始提示文本运行。`action="transform"` 会重写它(转换会串联),`action="handled"` 会在不运行 agent 的情况下消费它,并把 `message` 作为通知展示。
- `tool_call` 在工具执行之前运行。`block=True` 阻止执行,并把 `reason` 报告给模型;返回 `arguments` 会重写该调用。崩溃的 `tool_call` 处理器会阻止该工具执行(故障安全)。
- `tool_result` 可以重写结果的文本 `content` 或 `details`;执行错误状态属于宿主的工具生命周期,而不是结果载荷。

[原文]
All other handler failures are contained: they are recorded as diagnostics
(visible in `/session`) and never crash the session.

[译文]
所有其他处理器失败都会被受控处理:记录为诊断(可在 `/session` 中看到),绝不会让会话崩溃。

### 消息与持久化(Messages and persistence)

[原文]
`send_user_message` delivers a user message into the conversation. During a
run it queues as steering or a follow-up; when the session is idle the TUI
starts a new turn with it — this is how background work reports back.
`append_entry(namespace, data)` persists extension-owned data as a durable
session entry replayed on resume. `set_label(entry_id, label)` creates, changes,
or clears (`None`/empty) a bookmark on an existing session entry using the same
validation and append-only storage as the `/tree` label editor. It raises for an
unknown entry ID.

[译文]
`send_user_message` 把一条用户消息投递进对话。当运行进行中时,它会作为插话或追加消息排队;当会话空闲时,TUI 用它开始一个新轮次 —— 后台工作就是这样回报结果的。`append_entry(namespace, data)` 把扩展自有的数据持久化为一条持久会话条目,并在恢复时重放。`set_label(entry_id, label)` 在既有会话条目上创建、修改或清除(`None`/空值)书签,使用与 `/tree` 标签编辑器相同的校验与只追加存储。未知条目 ID 会抛出异常。

### 自定义消息渲染(Custom message rendering)

[原文]
To format an injected message instead of showing it as raw text, register a
renderer in `setup` and send with `send_custom_message`:

[译文]
要把注入的消息格式化显示,而不是按原始文本展示,请在 `setup` 中注册渲染器,并用 `send_custom_message` 发送:

```python
from tau_coding.extensions import CustomMessageView, MessageRenderOptions

def render_status(view: CustomMessageView, options: MessageRenderOptions) -> str:
    icon = "[green]✓[/green]" if view.details and view.details.get("ok") else "[red]✗[/red]"
    line = f"{icon} [bold]{view.content}[/bold]"
    if options.expanded and view.details:
        line += f"\n[dim]{view.details}[/dim]"
    return line  # a Rich-markup string, never a widget

def setup(tau):
    tau.register_message_renderer("my-ext:status", render_status)

# once the session is running:
tau.send_custom_message(
    "build finished",
    custom_type="my-ext:status",
    details={"ok": True, "duration_ms": 1200},
)
```

[原文]
- The renderer receives a `CustomMessageView(custom_type, content, details)`
  and `MessageRenderOptions(expanded)`, and returns a **Rich-markup string**
  (e.g. `"[bold]text[/bold]"`). Returning a Textual widget is not supported —
  this keeps extensions free of any TUI toolkit.
- `send_custom_message(content, *, custom_type, details=None,
  deliver_as="follow_up", trigger_turn=True)` behaves like
  `send_user_message` (the `content` still enters the model's context), but the
  transcript renders it through the matching renderer. `trigger_turn=False`
  queues it **in-memory** for the next run instead of starting one when idle —
  the message is not shown or persisted until that run happens, and is lost if
  the session exits first. Use `append_entry` alongside if you need a durable
  record without triggering a turn.
- First registration per `custom_type` wins. If no renderer is registered, or a
  renderer raises or returns a non-string, the message falls back to its raw
  `content` — a broken renderer never crashes the UI.
- Custom rendering works in the interactive TUI and the `-p` print transcript,
  and survives `/resume`. Tau persists it as a first-class `custom_message`
  session entry whose `custom_type` and `details` can be inspected without
  parsing a generic message payload. In the TUI, a custom message appears once its user event is
  confirmed by the run (a moment after delivery), rather than instantly like a
  typed prompt's optimistic echo.

[译文]
- 渲染器接收 `CustomMessageView(custom_type, content, details)` 与 `MessageRenderOptions(expanded)`,并返回一个 **Rich 标记字符串**(例如 `"[bold]text[/bold]"`)。不支持返回 Textual 控件 —— 这使扩展不依赖任何 TUI 工具箱。
- `send_custom_message(content, *, custom_type, details=None, deliver_as="follow_up", trigger_turn=True)` 的行为类似 `send_user_message`(`content` 仍会进入模型上下文),但会话记录会通过匹配的渲染器渲染它。`trigger_turn=False` 会把它**在内存中**排入下一次运行,而不是在空闲时启动一次运行 —— 在该次运行发生之前,消息既不显示也不持久化,如果会话先退出则会丢失。若需要不触发轮次的持久记录,请同时使用 `append_entry`。
- 每个 `custom_type` 以先注册者胜。如果没有注册渲染器,或渲染器抛异常、返回非字符串,消息会回退到原始 `content` —— 损坏的渲染器绝不会让 UI 崩溃。
- 自定义渲染在交互式 TUI 与 `-p` print 会话记录中都有效,并能在 `/resume` 之后保留。Tau 把它持久化为一等的 `custom_message` 会话条目,其 `custom_type` 与 `details` 无需解析通用消息载荷即可检查。在 TUI 中,自定义消息会在其用户事件被该次运行确认之后出现(投递后片刻),而不像手动输入的提示那样有即时的乐观回显。

## 扩展的成长与维护(Growing and maintaining an extension)

[原文]
Extensions have three natural sizes; each step is optional and none
requires packaging:

[译文]
扩展有三种自然的规模;每一步都是可选的,都不需要打包:

[原文]
1. **A single file** (`greet.py`) — the quick start above. No config.
2. **A folder with `extension.py`** — split helpers into sibling modules
   and import them relatively (`from . import helper`). No config.
3. **A repo with a `src/` layout** — declare the entry in
   `pyproject.toml` under `[tool.tau]` (see above). Tau reads only the
   `[tool.tau]` table; whether the repo is also an installable Python
   package is entirely your business (it helps IDEs resolve imports and
   lets tests import modules directly, but Tau never installs or
   `pip`-imports your extension).

[译文]
1. **单个文件**(`greet.py`)—— 即上面的快速开始。无需配置。
2. **带 `extension.py` 的文件夹** —— 把辅助代码拆到同级模块,并用相对导入(`from . import helper`)。无需配置。
3. **采用 `src/` 布局的仓库** —— 在 `pyproject.toml` 的 `[tool.tau]` 下声明入口(见上文)。Tau 只读取 `[tool.tau]` 表;该仓库是否同时是可安装的 Python 包完全由你决定(它有助于 IDE 解析导入、也让测试能直接导入模块,但 Tau 绝不安装或 `pip` 导入你的扩展)。

[原文]
Two rules keep all three shapes loadable:

[译文]
两条规则让这三种形态都能加载:

[原文]
- **Use relative imports between your own modules.** The loader imports
  your extension under a synthetic package name (and never touches
  `sys.path`), so `import helper` won't resolve — `from . import helper`
  will, in every load mode.
- **Feature-detect optional Tau APIs** (`getattr`/`try: import`) if you
  want the extension to load on older Tau versions rather than fail at
  import time.

[译文]
- **在自己的模块之间使用相对导入。** 加载器会在一个合成包名之下导入你的扩展(并且从不触碰 `sys.path`),因此 `import helper` 无法解析 —— 而 `from . import helper` 在所有加载模式下都可以。
- **对可选的 Tau API 做特性探测**(`getattr`/`try: import`),如果你希望扩展能在旧版 Tau 上加载,而不是在导入时报错。

[原文]
**Testing an extension.** Load it through the real runtime rather than
importing your modules directly — that exercises discovery, the synthetic
package import, and `setup` registration exactly as a session does:

[译文]
**测试扩展。** 通过真实的运行时加载它,而不是直接导入你的模块 —— 这样会像会话一样完整演练发现、合成包导入与 `setup` 注册:

```python
from tau_coding import TauResourcePaths
from tau_coding.extensions import ExtensionRuntime

def test_loads(tmp_path):
    paths = TauResourcePaths(
        root=tmp_path / "tau", cwd=tmp_path / "project",
        agents_root=tmp_path / "agents",
    )
    runtime = ExtensionRuntime()
    runtime.load(paths, extra_paths=(EXTENSION_DIR,), include_resource_dirs=False)
    assert runtime.extension_names == ("my_ext",)
```

[原文]
`extra_paths` takes your extension directory (or repo root with a
manifest); `include_resource_dirs=False` keeps the test hermetic —
nothing from `~/.tau/extensions` leaks in. To monkeypatch module globals
in tests, patch the loaded synthetic module (find it in `sys.modules` by
the `tau_extension_` prefix), not your package's import identity — the
runtime only sees the former.

[译文]
`extra_paths` 接收你的扩展目录(或带清单的仓库根目录);`include_resource_dirs=False` 让测试保持封闭 —— `~/.tau/extensions` 里的任何东西都不会渗入。若要在测试中 monkeypatch 模块全局量,请 patch 加载后的合成模块(在 `sys.modules` 中按 `tau_extension_` 前缀查找),而不是你包的导入标识 —— 运行时只看到前者。

## 扩展示例(Example extensions)

[原文]
See [`examples/extensions/`](https://github.com/huggingface/tau/tree/main/examples/extensions):

[译文]
见 [`examples/extensions/`](https://github.com/huggingface/tau/tree/main/examples/extensions):

[原文]
- **`hello_tool.py`** — minimal custom tool.
- **`permission_gate.py`** — blocks dangerous bash commands with the
  `tool_call` hook.
- **`sidebar_status.py`** — adds and updates a host-framed sidebar section.
- **`prompt_section.py`** — appends a labeled multi-line system-prompt section.

[译文]
- **`hello_tool.py`** —— 最小的自定义工具。
- **`permission_gate.py`** —— 用 `tool_call` 钩子拦截危险的 bash 命令。
- **`sidebar_status.py`** —— 添加并更新一个由宿主框定的侧边栏区块。
- **`prompt_section.py`** —— 追加一个带标签的多行系统提示词区块。

[原文]
A larger, real-world extension lives in its own repository:
[rian-dolphin/tau-subagents](https://github.com/rian-dolphin/tau-subagents)
ports [pi-subagents](https://github.com/tintinweb/pi-subagents) — an `agent`
tool that spawns autonomous subagents in-process with their own tools and
system prompts, foreground and background modes, agent types defined in
`.tau/agents/*.md`, `get_subagent_result` and `steer_subagent` tools, an
`/agents` command, and a custom renderer for completion notifications. It is
also the reference for the `[tool.tau]` manifest shape above (a `src/` layout
package that feature-detects newer API seams).

[译文]
一个更大、更贴近真实场景的扩展位于它自己的仓库:[rian-dolphin/tau-subagents](https://github.com/rian-dolphin/tau-subagents) 移植了 [pi-subagents](https://github.com/tintinweb/pi-subagents) —— 它提供一个 `agent` 工具,可在进程内派生自主子代理,并给它们各自的工具与系统提示词;支持前台与后台模式;agent 类型定义在 `.tau/agents/*.md`;还有 `get_subagent_result` 与 `steer_subagent` 工具、`/agents` 命令,以及用于完成通知的自定义渲染器。它同时也是上文 `[tool.tau]` 清单形态的参考(一个会特性探测较新 API 接缝的 `src/` 布局包)。

```bash
git clone git@github.com:rian-dolphin/tau-subagents.git
tau -e ./tau-subagents
# then: "Use a subagent to summarize this repository's architecture."
```

## 尚未支持(Not yet supported)

[原文]
Compared to Pi's extension system, Tau does not yet include a complete package
manager (the installer has no registry, dependency installation, remove, or
package-update commands), custom entry renderers (non-context cards),
declarative keyboard-shortcut registration, CLI flag registration,
system-prompt replacement, or context rewriting. The architecture document
(`dev-notes/architecture/phase-21-extensions.md`) tracks the extension design.

[译文]
与 Pi 的扩展系统相比,Tau 尚未包含完整的包管理器(安装器没有注册表、依赖安装、移除或包更新命令)、自定义条目渲染器(不进入上下文的卡片)、声明式快捷键注册、CLI flag 注册、系统提示词替换或上下文重写。扩展设计的跟踪文档是 `dev-notes/architecture/phase-21-extensions.md`。
