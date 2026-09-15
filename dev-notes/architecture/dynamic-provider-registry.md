# 动态 Provider 契约与分层注册表 / Dynamic provider contracts and layered registry

## Phase 1 新增了什么(What Phase 1 adds)

[原文]
Issue #605 implements the provider-neutral foundation from #602 Phase 1. It
does **not** add a built-in provider, startup selection, `/local`, a TUI, or any
llama.cpp behavior.

[译文]
Issue #605 实现了 #602 Phase 1 中 provider 无关的基础设施。它**不**添加内置 provider、启动选择、`/local`、TUI 或任何 llama.cpp 行为。

[原文]
The new pieces are:

[译文]
新增的部分包括:

[原文]
- `extensions/providers.py`: immutable provider/model/auth/transport/refresh
  contracts;
- `extensions/provider_registry.py`: process-local durable/dynamic composition
  and refresh coordination;
- `ExtensionAPI.register_provider(...)`: extension registration routed through
  the owning `ExtensionRuntime`;
- `create_dynamic_model_provider(...)`: candidate runtime construction using
  Tau's existing OpenAI-compatible transport or an extension factory;
- an explicit OpenAI transport switch that prevents dynamic model names from
  selecting `/responses` heuristically.

[译文]
- `extensions/providers.py`:不可变的 provider/模型/认证/传输/刷新契约;
- `extensions/provider_registry.py`:进程本地的持久化/动态组合与刷新协调;
- `ExtensionAPI.register_provider(...)`:经由持有它的 `ExtensionRuntime` 路由的扩展注册;
- `create_dynamic_model_provider(...)`:使用 Tau 既有的 OpenAI 兼容传输或扩展工厂来构建候选运行时;
- 一个显式的 OpenAI 传输开关,防止动态模型名以启发式方式选中 `/responses`。

[原文]
Phase 6 validates these APIs with a permanent second fake backend and a
small test-only Ollama adapter. The adapter uses separate provider and local
status endpoints without adding provider-specific concepts to the contract.

[译文]
Phase 6 用一个常驻的第二假后端和一个仅用于测试的小型 Ollama 适配器来验证这些 API。该适配器使用彼此分离的 provider 端点与本地状态端点,而没有向契约中引入 provider 特有的概念。

## 为什么动态 provider 不是持久化设置(Why dynamic providers are not durable settings)

[原文]
Tau's existing `ProviderConfig` objects describe user/application configuration
loaded from the bundled catalog, `~/.tau/catalog.toml`, and
`~/.tau/providers.json`. An extension registration has different ownership:
its code source and trust decision exist only in one staged runtime generation.
Persisting that definition would let a later process use provider behavior after
the source disappeared or before it was trusted.

[译文]
Tau 既有的 `ProviderConfig` 对象描述的是从随包目录、`~/.tau/catalog.toml` 与 `~/.tau/providers.json` 加载的用户/应用配置。扩展注册的所有权不同:它的代码来源与信任决策只存在于一个暂存的运行时代际中。若把该定义持久化,后续进程就可能在来源已经消失、或尚未被信任时使用该 provider 行为。

[原文]
The registry therefore receives complete durable `ProviderConfig` objects as an
immutable baseline and never serializes dynamic data. Each dynamic layer stores:

[译文]
因此,注册表接收完整的持久化 `ProviderConfig` 对象作为不可变基线,并且从不序列化动态数据。每个动态层保存:

```text
provider id + source id + runtime generation id + layer id
```

[原文]
Latest active registration wins. For loaded extensions the host derives a stable
source ID from the canonical entry-file path; the extension display name is never
used as provider ownership. The loader freezes every discovered ID before importing
any extension and stores it on `LoadedExtension`. Import/setup code can therefore
retarget the entry symlink or an ancestor without changing duplicate detection, API
registration, or failed-setup cleanup ownership. Separate paths named `shared.py`
receive different layers even when loaded in separate trust stages. Repeating the
same canonical entry within one runtime is ignored with first-loaded precedence; a
fresh runtime generation can load that stable source again. Registering the same
provider from the same source atomically replaces that source's old layer. Removing
it reveals the previous complete dynamic layer; removing the final layer returns the
exact original
durable object, including headers, model metadata, compatibility, timeouts, retries,
thinking configuration, and every other field. Tools and commands remain separate,
first-registration-wins name registries.

[译文]
最新一次活动注册获胜。对于已加载的扩展,宿主会从规范化的入口文件路径推导出稳定的来源 ID;扩展的显示名永远不会被用作 provider 的所有权标识。加载器会在导入任何扩展之前冻结每个被发现到的 ID,并把它存储在 `LoadedExtension` 上。因此,导入/setup 代码即使重定向入口符号链接或其祖先目录,也不会改变重复检测、API 注册或 setup 失败时的清理归属。不同路径下名为 `shared.py` 的文件会获得不同的层,即使在不同的信任阶段加载也是如此。在同一个运行时内重复同一个规范入口会被忽略,遵循「先加载者优先」;新的运行时代际可以再次加载这个稳定来源。从同一来源注册同一个 provider,会原子地替换该来源的旧层。移除它会重新暴露出上一个完整的动态层;移除最后一层则返回与原始持久化对象完全一致的结果,包括 headers、模型元数据、兼容性、超时、重试、thinking 配置以及所有其他字段。工具与命令则保持各自独立、遵循「先注册者胜」的名称注册表。

[原文]
There is intentionally no generic snapshot disk store in this phase. A future
trusted built-in may own a versioned, allowlisted safe cache, but public extension
storage needs a separate source-identity and trust design.

[译文]
本阶段有意不提供通用的快照磁盘存储。未来的受信内置扩展可以拥有一个带版本、经白名单允许的安全缓存;但面向公开扩展的存储需要一套独立的「来源身份 + 信任」设计。

## Provider 与模型校验(Provider and model validation)

[原文]
A `DynamicProvider` has a non-empty exact ID/display name, zero or more unique
`ProviderModel` IDs, an optional default that must belong to the current complete
snapshot, and exactly one runtime mechanism:

[译文]
一个 `DynamicProvider` 拥有:非空的精确 ID/显示名、零个或多个唯一的 `ProviderModel` ID、一个可选且必须属于当前完整快照的默认模型,以及恰好一种运行时机制:

[原文]
1. `OpenAICompatibleTransport`, or
2. a custom runtime factory.

[译文]
1. `OpenAICompatibleTransport`,或
2. 一个自定义运行时工厂。

[原文]
Zero models is valid: it represents a dormant provider without inventing a fake
model. Unknown model metadata remains `None`; empty tuples mean “known none.”
Compatibility data is copied, JSON-validated, and deeply frozen: nested objects
become read-only mappings and arrays become tuples. Registry views, refresh results,
and callback `cached_models` can therefore share one validated model value without
letting consumers mutate active state. Runtime construction converts compatibility
data back to fresh ordinary JSON dictionaries/lists at the transport boundary.
Runtime headers are copied but excluded from representations and have no persistence
helper.

[译文]
零个模型是合法的:它表示一个休眠 provider,而不必虚构一个假模型。未知的模型元数据保持为 `None`;空元组表示「已知为空」。兼容性数据会被复制、做 JSON 校验并深度冻结:嵌套对象变成只读映射,数组变成元组。因此注册表视图、刷新结果与回调的 `cached_models` 可以共享同一个已校验的模型值,而不会让消费方修改活动状态。运行时构建会在传输边界处把兼容性数据转换回全新的普通 JSON 字典/列表。运行时 headers 会被复制,但从各类表示中排除,并且没有持久化辅助。

[原文]
Construction validates the whole candidate before registry mutation. An invalid
same-source replacement or refresh therefore leaves the prior layer/snapshot
unchanged.

[译文]
构建过程会在修改注册表之前校验整个候选对象。因此,一次非法的同来源替换或刷新,会让先前的层/快照保持不变。

## 认证与密钥处理(Authentication and secret handling)

[原文]
Dynamic auth is resolved only before refresh or candidate runtime creation:

```text
RequiredApiKey / OptionalApiKey
  → Tau credential reader
  → configured environment variable
  → missing result

NoAuth
  → consult neither source
```

[译文]
动态认证只在刷新之前、或候选运行时构建之前解析:

```text
RequiredApiKey / OptionalApiKey
  → Tau 凭据读取器
  → 已配置的环境变量
  → 缺失结果

NoAuth
  → 两个来源都不查询
```

[原文]
Required auth fails with setup guidance. Missing optional auth and `NoAuth`
produce `omit_authorization_header=True`; no fake `Bearer local` value is used.
Resolved keys, auth headers, and extension-provided auth provenance are runtime-only
fields excluded from `repr`. Transport/model headers are excluded too. Static
transport/model headers cannot supply `Authorization`; bearer or custom authorization
must come from the auth strategy at resolution time. This prevents credentials from
becoming part of a registered definition while still allowing non-Bearer schemes
through resolved auth headers. Refresh diagnostics never include an extension
exception string or resolved auth data because either may contain request data or a
secret; diagnostics report only a bounded category and source token. Runtime creation
likewise converts custom auth-resolution exceptions to a categorical host error.
Only Tau's exact `RequiredApiKey` strategy preserves its host-authored missing-key
setup guidance.

[译文]
必需认证失败时会给出 setup 指引。可选认证缺失以及 `NoAuth` 会产生 `omit_authorization_header=True`;不会使用假的 `Bearer local` 值。解析出的密钥、认证 headers 与扩展提供的认证来源信息都是仅运行时的字段,会从 `repr` 中排除。传输/模型 headers 同样被排除。静态的传输/模型 headers 不能提供 `Authorization`;bearer 或自定义授权必须在解析时来自认证策略。这防止凭据成为已注册定义的一部分,同时仍允许通过解析后的认证 headers 使用非 Bearer 方案。刷新诊断永远不会包含扩展异常字符串或解析后的认证数据,因为二者都可能包含请求数据或密钥;诊断只报告一个有界的类别与来源 token。运行时构建同样会把自定义认证解析异常转换为分类性的宿主错误。只有 Tau 精确的 `RequiredApiKey` 策略会保留其由宿主编写的「缺少密钥」setup 指引。

## 刷新生命周期(Refresh lifecycle)

[原文]
A refresh callback receives:

[译文]
刷新回调接收:

[原文]
- a cancellation token;
- whether network use is allowed;
- the current safe in-memory model tuple;
- already resolved auth.

[译文]
- 一个取消令牌;
- 是否允许使用网络;
- 当前安全的、内存中的模型元组;
- 已经解析好的认证信息。

[原文]
It returns one complete `ProviderModelSnapshot`. The coordinator:

[译文]
它返回一个完整的 `ProviderModelSnapshot`。协调器会:

[原文]
1. identifies the exact effective source/layer/generation token;
2. shares one task only among callers whose token and `allow_network` policy match;
3. applies each caller's own timeout while shielding compatible shared work;
4. validates the whole returned snapshot;
5. rechecks source, layer, generation, and operation revision synchronously;
6. publishes only when all ownership still matches.

[译文]
1. 确定精确生效的来源/层/代际令牌;
2. 只在令牌与 `allow_network` 策略都匹配的调用方之间共享同一个任务;
3. 为每个调用方应用各自的超时,同时保护兼容的共享工作;
4. 校验返回的整个快照;
5. 同步地重新检查来源、层、代际与操作修订号;
6. 只有在所有所有权仍然匹配时才发布结果。

[原文]
Opposite network policies use separate discovery tasks, so a no-network caller never
consumes network-enabled discovery and a later network-enabled caller can still do
network work. A short waiter can time out without ending work for a compatible longer
waiter. When the final waiter times out—or `cancel_refresh` cancels an operation—the
coalescing entry is synchronously detached before that caller returns. An immediate
retry therefore creates a new operation. Each done callback carries the old operation
identity, so it cannot remove a successor created under the same key. Detached work
remains in a separate owned-operation set until actual completion.

[译文]
相反的网络策略使用彼此独立的发现任务,因此无网络调用方永远不会消耗已启用网络的发现结果,而后来的、启用网络的调用方仍然可以进行网络工作。短等待方可以超时,而不会终止某个兼容的长等待方的工作。当最后一个等待方超时 —— 或 `cancel_refresh` 取消某次操作时 —— 合并条目会在该调用方返回之前被同步摘除。因此立即重试会创建一个新操作。每个 done 回调都携带旧操作的身份,因此它无法移除在同一键下创建的继任者。被摘除的工作会留在一个独立的「已持有操作」集合中,直到真正完成。

[原文]
Timeout, explicit cancellation, source replacement, unregister, reload, and runtime
retirement signal and cancel owned work. Caller cancellation is shielded so one
waiter cannot destroy work shared by another waiter. Discovery receives at most one
`Task.cancel()` request. Async close waits until the callback exits or until 0.25
seconds have elapsed from that request; it never injects a second cancellation into
an ordinary `finally` block merely because cleanup exceeded 0.1 seconds. Cleanup
that completes within the containment interval is drained before reload,
replacement, reset close, or final close returns.

[译文]
超时、显式取消、来源替换、注销、重载与运行时退役都会对持有的工作发出信号并取消它。调用方的取消是被屏蔽保护的,因此一个等待方无法摧毁另一个等待方共享的工作。发现过程最多收到一次 `Task.cancel()` 请求。异步 close 会等待回调退出,或等待自该请求起 0.25 秒过去;它绝不会仅仅因为清理超过了 0.1 秒就向普通的 `finally` 块注入第二次取消。在受控区间内完成的清理会在 reload、替换、reset close 或最终 close 返回之前被排空。

[原文]
A callback still running at 0.25 seconds is classified as **contained**, not drained.
`ProviderRegistryCloseResult(drained=False, contained_discovery_tasks=...)` reports
that exact state. A process-owned supervisor strongly retains the discovery task, whose done callback
retains its retired generation registry, until actual completion. This explicit root
avoids relying on asyncio's weak task references after a session drops the outgoing
runtime. The callback has no publication path after the outer operation ends, and
source/layer/generation/revision guards remain in force.
Failed work retains the current snapshot and records at most one diagnostic per
layer token; the registry also applies a global bound.

[译文]
在 0.25 秒时仍在运行的回调会被归类为**受控(contained)**,而不是已排空(drained)。`ProviderRegistryCloseResult(drained=False, contained_discovery_tasks=...)` 会如实报告这一状态。一个由进程持有的监督者会强引用该发现任务,而该任务的 done 回调又会强引用其已退役的代际注册表,直到真正完成。这个显式根避免了在会话丢弃外出运行时之后依赖 asyncio 的弱任务引用。在外层操作结束之后,该回调没有任何发布路径,并且来源/层/代际/修订号的守卫仍然生效。
失败的工作会保留当前快照,并且每个层令牌最多记录一条诊断;注册表还会施加一个全局上限。

## 运行时构建与传输路由(Runtime creation and transport routing)

[原文]
OpenAI-compatible dynamic providers reuse `tau_ai.OpenAICompatibleProvider`.
Transport headers, model headers, and resolved auth headers are merged only in
memory. Missing optional auth passes an empty internal key plus
`omit_authorization_header=True`, so the HTTP adapter sends no Authorization
header.

[译文]
OpenAI 兼容的动态 provider 复用 `tau_ai.OpenAICompatibleProvider`。传输 headers、模型 headers 与解析后的认证 headers 只在内存中合并。可选认证缺失时会传入一个空的内部 key,并设置 `omit_authorization_header=True`,因此 HTTP 适配器不会发送 Authorization 头。

[原文]
Custom runtime factories are accepted only when both `stream_response` and `aclose`
are callable. A constructed candidate rejected by validation is closed exactly once
when possible; close errors are contained so they cannot replace the categorical
configuration error.

[译文]
自定义运行时工厂只有在 `stream_response` 与 `aclose` 都可调用时才会被接受。被校验拒绝的已构建候选对象会在可能时恰好关闭一次;关闭错误会被受控处理,因此不会替换掉那个分类性的配置错误。

[原文]
The existing adapter historically inferred `/responses` for some OpenAI/Codex-
shaped model IDs. That remains the compatibility default for durable providers.
Dynamic transport descriptors explicitly own their API choice and set
`infer_api_from_model=False`; a local model named `gpt-5.4-local` or
`my-codex-local` therefore still reaches the configured `/chat/completions`
endpoint when `api="openai-completions"`.

[译文]
既有适配器在历史上会为某些 OpenAI/Codex 形态的模型 ID 推断 `/responses`。这仍然是持久化 provider 的兼容默认行为。动态传输描述符显式持有自己的 API 选择,并设置 `infer_api_from_model=False`;因此当 `api="openai-completions"` 时,名为 `gpt-5.4-local` 或 `my-codex-local` 的本地模型仍会到达配置的 `/chat/completions` 端点。

## ExtensionRuntime 的所有权(ExtensionRuntime ownership)

[原文]
Every `ExtensionRuntime` now creates one provider registry with the same explicit
generation identity as its `ExtensionGeneration`. The loader assigns each discovered
entry a source ID from `Path.resolve().as_uri()` before it imports any extension,
stores that value on
`LoadedExtension`, and uses only the stored ID afterward. `register_provider` uses
that host-owned ID. Display names remain user-facing labels only.

[译文]
每个 `ExtensionRuntime` 现在都会创建一个 provider 注册表,其显式代际身份与它的 `ExtensionGeneration` 相同。加载器在导入任何扩展之前,会为每个被发现到的入口分配一个来自 `Path.resolve().as_uri()` 的来源 ID,把该值存储在 `LoadedExtension` 上,此后只使用这个已存储的 ID。`register_provider` 使用这个由宿主持有的 ID。显示名仍然只是面向用户的标签。

[原文]
If `setup()` raises, the runtime removes only registrations carrying that exact
stored source ID, including providers, tools, commands, guidelines, renderers, and
event handlers. A failed second `shared.py` therefore cannot remove a successful
first `shared.py` from another path; successful same-name providers shadow and
restore as normal independent layers. Duplicate tools and commands are still ignored
by name, so their first-registration semantics are unchanged.

[译文]
如果 `setup()` 抛出异常,运行时只会移除携带那个精确已存储来源 ID 的注册项,包括 provider、工具、命令、准则、渲染器与事件处理器。因此,第二个 `shared.py` 失败不会移除另一个路径下成功加载的第一个 `shared.py`;成功的同名 provider 会像普通独立层一样遮蔽与恢复。重复的工具与命令仍按名称忽略,因此它们「先注册者胜」的语义不变。

[原文]
Reload and retirement cancel registry work and remove layers before invalidating the
outgoing API. `CodingSession.reload()` and destination replacement synchronously
publish the fresh state, then place outgoing runtime close in an independently owned
task. Cancellation at that committed seam is contained until cleanup drains or
reports bounded hostile work, and the operation returns the adopted result rather
than claiming rollback. Final `CodingSession.aclose()` similarly owns one durable
close task, but propagates observed caller cancellation only after the extension
registry and every provider ledger entry have received their one close attempt.
Repeated close observes the same task and cannot close a provider twice. A staged
replacement explicitly owns its candidate provider ledger through outgoing shutdown,
incoming start, and every other pre-publication seam. Cancellation or failure closes
that candidate session before propagating while leaving the active provider open;
success transfers the ledger once to the surviving outer session. `reset_for_reload()`
is synchronous, so it retains each retired registry for the
runtime's later async close. A contained task stays process-supervised with its
retired registry through its done callback; it is not mislabeled as drained. Reload
then creates a fresh generation and empty registry over the same immutable durable
baseline. Provider refresh diagnostics are projected into normal runtime diagnostics
without exposing secrets.

[译文]
Reload 与退役会在使外出 API 失效之前,取消注册表的工作并移除各层。`CodingSession.reload()` 与目标替换会同步发布新状态,随后把外出运行时的关闭放到一个独立持有的任务中。在这个已提交的接缝处发生的取消会被受控处理,直到清理排空、或报告出有界的恶意工作;该操作返回已采纳的结果,而不是声称回滚。最终 `CodingSession.aclose()` 同样持有一个持久化的关闭任务,但只有在扩展注册表与每一个 provider 账本条目都完成一次关闭尝试之后,才会传播观察到的调用方取消。重复 close 会观察到同一个任务,不会把某个 provider 关闭两次。暂存式替换显式持有其候选 provider 账本,贯穿外出关闭、进入启动以及所有其他发布前的接缝。取消或失败会在传播之前关闭该候选会话,同时让活动 provider 保持打开;成功则把账本一次性转移给存活的外层会话。`reset_for_reload()` 是同步的,因此它会为运行时稍后的异步关闭保留每个已退役的注册表。受控任务会通过其 done 回调,与其已退役的注册表一起保持在进程监督之下;它不会被误标为已排空。随后 reload 会在同一个不可变持久化基线之上,创建一个新代际与空注册表。Provider 刷新诊断会被投射进常规运行时诊断,同时不暴露密钥。

## 如何验证(How to verify)

[原文]
Focused tests cover dormant/invalid contracts, auth precedence and omission,
secret-safe representations, exact durable restoration, multi-source precedence,
same-source replacement, same-name/different-path and symlink-retarget isolation,
complete failed-setup cleanup, policy-safe and immediate-retry-safe refresh
coalescing, per-waiter timeouts, single-cancel cooperative cleanup, explicit
hostile-work containment, pre-publication candidate aborts, cancellation-at-publication
lifecycle draining, final close/provider-ledger discharge, malformed output, stale work,
deep immutability, rejected runtime cleanup, auth-exception redaction, no durable writes,
retirement, HTTP auth headers,
and model-name routing:

[译文]
聚焦测试覆盖以下内容:休眠/非法的契约、认证优先级与省略、密钥安全的表示、精确的持久化恢复、多来源优先级、同来源替换、同名/不同路径与符号链接重定向的隔离、setup 失败的完整清理、策略安全且可立即重试的刷新合并、按等待方的超时、单次取消的协作式清理、显式的恶意工作受控、发布前的候选中止、发布时取消的生命周期排空、最终 close/provider 账本结清、畸形输出、陈旧工作、深度不可变性、被拒绝的运行时清理、认证异常脱敏、不产生持久化写入、退役、HTTP 认证头,以及模型名路由:

```bash
uv run pytest tests/test_extension_providers.py tests/test_extensions.py \
  tests/test_provider_config.py tests/test_provider_runtime.py tests/test_http.py
uv run ruff check .
uv run ruff format --check .
uv run mypy
```
