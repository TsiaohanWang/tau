# 受信的内置隐藏扩展 / Trusted hidden built-in extensions

## Phase 2 新增了什么(What Phase 2 adds)

[原文]
Issue #606 adds a generic way for Tau to run extension code bundled in the
installed package. It does not add llama.cpp, startup provider preparation,
`/local`, a local-backend API, or network work.

[译文]
Issue #606 为 Tau 加入了一种通用方式,用来运行随安装包分发的扩展代码。它不添加 llama.cpp、启动时的 provider 准备、`/local`、本地后端 API 或网络工作。

[原文]
The declaration is intentionally small:

[译文]
声明被有意保持得很小:

```python
BuiltInExtension(name="capability", setup=setup, hidden=True)
```

[原文]
Declarations live in `tau_coding.built_in_extensions.BUILT_IN_EXTENSIONS`.
Later phases can add product capabilities to that tuple without teaching the
loader their names. The Phase 2 production tuple is empty; deterministic tests
inject a minimal fake declaration.

[译文]
声明位于 `tau_coding.built_in_extensions.BUILT_IN_EXTENSIONS`。后续阶段可以向该元组添加产品能力,而无需让加载器认识它们的名字。Phase 2 的生产元组是空的;确定性测试会注入一个最小的假声明。

## 为什么内置能力也走扩展机制(Why built-ins use extensions)

[原文]
A bundled capability still needs normal lifecycle and failure boundaries. If it
registered a tool, command, or provider through private host branches, reload and
source cleanup would differ from user extensions and each capability would make
core more provider-specific.

[译文]
随包分发的能力同样需要正常的生命周期与失败边界。如果它通过宿主的私有分支来注册工具、命令或 provider,那么 reload 与来源清理就会与用户扩展不同,而且每项能力都会让内核更加依赖具体 provider。

[原文]
Instead, a built-in receives the ordinary `ExtensionAPI`. The Phase 2 fake proves
that one setup function can register:

[译文]
相反,内置扩展拿到的是普通的 `ExtensionAPI`。Phase 2 的假扩展证明:一个 setup 函数就可以注册:

[原文]
- an `AgentTool`;
- a slash command;
- a Phase 1 `DynamicProvider` layer.

[译文]
- 一个 `AgentTool`;
- 一条斜杠命令;
- 一个 Phase 1 的 `DynamicProvider` 层。

[原文]
The real `ExtensionRuntime` composes all three. No test-only loader bypass is
used.

[译文]
真正的 `ExtensionRuntime` 会把三者组合起来,没有使用任何仅供测试的加载器旁路。

## 加载顺序(Load order)

[原文]
`ExtensionRuntime.load()` first calls its once-per-generation built-in loader,
then performs normal filesystem discovery:

```text
trusted built-in declarations
→ user extension directory
→ explicit -e paths
→ trusted, opted-in project extension directory (later staged call)
```

[译文]
`ExtensionRuntime.load()` 会先调用「每个代际只执行一次」的内置加载器,然后执行常规的文件系统发现:

```text
受信的内置声明
→ 用户扩展目录
→ 显式的 -e 路径
→ 已受信、已选择启用的项目扩展目录(稍后的暂存调用)
```

[原文]
`include_resource_dirs=False`, which implements `--no-extensions`, skips user
and project directory discovery but not built-ins or explicit paths. A session
now always calls `ExtensionRuntime.load()`, even when discovery is disabled, so
built-ins cannot accidentally disappear in that mode.

[译文]
实现 `--no-extensions` 的 `include_resource_dirs=False` 会跳过用户与项目目录的发现,但不跳过内置扩展与显式路径。会话现在即使禁用了发现也总会调用 `ExtensionRuntime.load()`,因此内置扩展不会在该模式下意外消失。

[原文]
Project extensions remain a separate post-trust load. Built-ins are direct
installed-package callables, not filesystem candidates, so they neither add a
protected-input category nor cause a trust prompt. They may use the existing
pre-trust hook only when a project already has protected inputs; this phase's
fake does not.

[译文]
项目扩展仍然是在信任判定之后单独加载的。内置扩展是安装包内可直接调用的对象,而不是文件系统候选,因此它们既不新增受保护输入类别,也不会触发信任提示。只有当项目已经存在受保护输入时,它们才可能使用既有的「信任前(pre-trust)」钩子;本阶段的假扩展不会这样做。

## 来源与隐藏元数据(Provenance and hidden metadata)

[原文]
Filesystem discovery now labels every source as `user`, `explicit`, or
`project`. Built-ins use:

[译文]
文件系统发现现在为每个来源打上 `user`、`explicit` 或 `project` 标签。内置扩展使用:

```text
source      = built-in
source_id   = built-in:<declaration name>
path        = None
hidden      = declaration.hidden
```

[原文]
The runtime retains this in immutable `ExtensionSourceMetadata`. The host-owned
source ID, rather than the display name, owns tools, commands, handlers, and
provider layers.

[译文]
运行时把这份信息保留在不可变的 `ExtensionSourceMetadata` 中。工具、命令、处理器与 provider 层的所有权归宿主所持有的来源 ID,而不是显示名。

[原文]
`extension_names` remains the ordinary visible listing and omits hidden
built-ins. `extension_metadata` is the detailed diagnostic view and includes
both visible and hidden sources. Hidden therefore means “not advertised as an
installed/discovered extension,” never “not loaded.”

[译文]
`extension_names` 仍是普通的可见列表,会省略隐藏的内置扩展。`extension_metadata` 是详细的诊断视图,同时包含可见与隐藏来源。因此,「隐藏」意味着「不被宣传为已安装/已发现的扩展」,而绝不意味着「未加载」。

## 失败隔离(Failure isolation)

[原文]
Built-in setup runs through the same `_setup_extension()` boundary as imported
extensions. The runtime creates one source-scoped API, records the source, and
then calls setup synchronously. If setup raises:

[译文]
内置 setup 与导入扩展一样,经过同一个 `_setup_extension()` 边界。运行时创建一个以来源为作用域的 API,记录来源,然后同步调用 setup。如果 setup 抛出异常:

[原文]
1. the failed source is removed from active extension metadata;
2. its tools, commands, guidelines, renderers, and handlers are removed;
3. all of its dynamic provider layers and refresh work are unregistered;
4. a `built-in setup failed` extension diagnostic is retained;
5. the next declaration and normal startup continue.

[译文]
1. 失败的来源会从活动扩展元数据中移除;
2. 它的工具、命令、准则、渲染器与处理器都会被移除;
3. 它所有的动态 provider 层与刷新工作都会被注销;
4. 保留一条 `built-in setup failed` 扩展诊断;
5. 继续处理下一条声明与正常启动。

[原文]
This keeps built-in failures visible without turning them into host startup
failures.

[译文]
这使内置扩展的失败保持可见,同时不会把它们变成宿主启动失败。

## 代际与清理生命周期(Generation and cleanup lifecycle)

[原文]
Every staged `ExtensionRuntime` snapshots the declaration tuple and creates a
fresh `ExtensionGeneration` plus Phase 1 provider registry. Repeated `load()`
calls on one runtime do not rerun built-in setup; this matters because project
extensions load in a second post-trust call.

[译文]
每个暂存的 `ExtensionRuntime` 都会对声明元组做快照,并创建一个新的 `ExtensionGeneration` 与 Phase 1 provider 注册表。在同一个运行时上重复调用 `load()` 不会重跑内置 setup;这一点很重要,因为项目扩展是在信任判定之后的第二次调用中加载的。

[原文]
Reload, resume, new-session, and cwd replacement already stage fresh runtimes.
Each therefore reruns built-in setup with a fresh API and provider generation.
When the old runtime retires, it:

[译文]
Reload、resume、新建会话与 cwd 替换本来就会暂存新的运行时。因此每一种都会用新的 API 与 provider 代际重跑内置 setup。旧运行时退役时,它会:

[原文]
- retires and detaches every dynamic provider layer;
- requests cancellation of owned provider refresh/discovery work;
- invalidates every captured API/context/UI facade;
- unsubscribes the harness listener;
- removes extension handlers, tools, commands, guidelines, and renderers;
- drops bound-session and turn-request callbacks.

[译文]
- 退役并摘除每一个动态 provider 层;
- 请求取消其持有的 provider 刷新/发现工作;
- 使所有已捕获的 API/上下文/UI 门面失效;
- 取消订阅 harness 监听器;
- 移除扩展处理器、工具、命令、准则与渲染器;
- 丢弃已绑定的会话与 turn 请求回调。

[原文]
Replacement code clears old host UI before the successor mounts UI on the shared
bridge. Retirement deliberately does not clear that bridge again: doing so after
the successor's `session_start` would erase fresh widgets. Final session close has
no successor, so it clears extension components before retiring the runtime.

[译文]
替换代码会在后继者在共享桥上挂载 UI 之前先清空旧的宿主 UI。退役时刻意不再清空该桥:若在后继者的 `session_start` 之后这么做,会抹掉新挂载的组件。最终会话关闭没有后继者,因此它会在退役运行时之前清空扩展组件。

[原文]
Async close then drains cooperative provider work or reports Phase 1's bounded
containment result. Tests start a fake built-in provider refresh, retire the
runtime, and assert cancellation, stale API rejection, empty source metadata,
and removal of the tool, command, and provider.

[译文]
随后异步 close 会排空协作式的 provider 工作,或报告 Phase 1 的有界受控结果。测试会启动一个假的内置 provider 刷新、让运行时退役,并断言:取消已发生、陈旧 API 被拒绝、来源元数据为空,以及工具、命令与 provider 均已被移除。

## 安全边界(Security boundary)

[原文]
“Trusted” means the code is reviewed and shipped inside Tau. It does not mean a
sandbox. Like every extension, a built-in executes Python in the Tau process.
Hidden status is display metadata only. Project trust remains an ambient
project-input guard and does not sandbox built-ins, providers, tools, network,
filesystem, credentials, or subprocesses.

[译文]
「受信」意味着代码经过评审并随 Tau 一起分发,并不意味着沙箱。与所有扩展一样,内置扩展会在 Tau 进程中执行 Python。隐藏状态只是显示元数据。项目信任仍然只是一道针对项目输入的常驻守卫,它不会对内置扩展、provider、工具、网络、文件系统、凭据或子进程施加沙箱。

## 与 Pi 的对齐及 Tau 的有意选择(Pi alignment and intentional Tau choices)

[原文]
This follows Pi's hidden bundled-extension pattern and source invalidation on
reload. Tau deliberately keeps its own cwd/trust-bound fresh-runtime staging,
source/generation-aware Phase 1 provider registry, and detailed metadata view.
There is no process-global built-in runtime and no capability-name branch in the
loader.

[译文]
这沿用了 Pi 的「隐藏随包扩展」模式以及 reload 时使来源失效的做法。Tau 有意保留自己的、受 cwd/信任约束的新运行时暂存机制、来源/代际感知的 Phase 1 provider 注册表,以及详细的元数据视图。这里没有进程级全局的内置运行时,加载器中也没有按能力名分支的逻辑。

## 如何验证(How to verify)

[原文]
Focused deterministic coverage:

[译文]
聚焦的确定性覆盖:

```bash
uv run pytest tests/test_extensions.py tests/test_extension_providers.py \
  tests/test_project_trust.py
```

[原文]
The tests cover declaration validation, real runtime registration, hidden/source
metadata, load order, `--no-extensions`, setup-once behavior, setup rollback,
no trust prompt, fresh reload/new/resume generations, stale API invalidation,
and provider-task retirement.

[译文]
测试覆盖:声明校验、真实运行时注册、隐藏/来源元数据、加载顺序、`--no-extensions`、setup 只执行一次的行为、setup 回滚、不触发信任提示、reload/新建/resume 的新代际、陈旧 API 失效,以及 provider 任务退役。

[原文]
Full repository gates remain:

[译文]
完整的仓库关卡仍为:

```bash
uv run pytest
uv run ruff check .
uv run ruff format --check .
uv run mypy
hugo --source website --minify
uv build
```
