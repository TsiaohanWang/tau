# ADR:会话准备与动态 Provider 生命周期 / ADR: session preparation and dynamic-provider lifecycle

[原文]
- **Status:** accepted for issue #602 Phase 0
- **Date:** 2026-08-18
- **Scope:** architecture and current-behavior characterization only
- **Implementation:** later phases; this ADR adds no dynamic provider, built-in extension, `/local`, or llama.cpp runtime code

[译文]
- **状态:** 已接受,对应 issue #602 Phase 0
- **日期:** 2026-08-18
- **范围:** 仅限架构与当前行为的特征化描述
- **实现:** 后续阶段;本 ADR 不添加动态 provider、内置扩展、`/local` 或 llama.cpp 运行时代码

## 为什么需要这个决策(Why this decision exists)

[原文]
Tau currently asks both frontends to choose and construct a model provider before
`CodingSession.load()`. Extensions load inside `CodingSession.load()`, after that
provider already exists. An extension therefore cannot supply a provider selected
on the command line or restored from a session.

[译文]
Tau 目前要求两个前端都在 `CodingSession.load()` 之前选择并构建模型 provider。扩展则在 `CodingSession.load()` 内部加载,此时该 provider 已经存在。因此,扩展无法提供一个由命令行选出、或从会话恢复出来的 provider。

[原文]
Fixing only that ordering would be unsafe. Startup, reload, resume, new-session,
branching, trust, model switching, transcript persistence, extension generations,
and provider cleanup meet at the same boundary. This ADR defines that boundary
before production behavior changes.

[译文]
只修复这个顺序是不安全的。启动、reload、恢复、新建会话、分支、信任、模型切换、会话记录持久化、扩展代际与 provider 清理都在同一个边界相遇。本 ADR 在生产行为改变之前先把该边界定义清楚。

[原文]
Historical PRs #352 and #417 were consulted only as evidence. No code or branch
from either PR is reused. In particular, this design rejects PR #417's
process-long provider/extension registry assumption.

[译文]
历史 PR #352 与 #417 只作为证据被参考。没有复用任何一个 PR 的代码或分支。特别地,本设计拒绝了 PR #417 中「provider/扩展注册表与进程同生命周期」的假设。

## 与 Pi 的兼容性检查(Pi compatibility check)

[原文]
Pi was rechecked at the accepted-plan pin
`eb1f87fa9a29e27e0c63dcb40dbed9a3624c82b1` (2026-08-17). The upstream remote
HEAD observed during the audit was `2509b5c037d366979f2febfce4174b88aeaadc6a`;
the pin remains the reproducible architectural reference for this phase.

[译文]
Pi 在已采纳计划的固定提交 `eb1f87fa9a29e27e0c63dcb40dbed9a3624c82b1`(2026-08-17)上被重新检查。审计期间观察到的上游远端 HEAD 为 `2509b5c037d366979f2febfce4174b88aeaadc6a`;该固定提交仍是本阶段可复现的架构参照。

[原文]
The pinned implementation confirms the patterns Tau should follow:

[译文]
被固定的实现确认了 Tau 应当遵循的模式:

[原文]
- extension provider registrations reach a model runtime before normal model
  use;
- extension contexts are invalidated after replacement/reload;
- `session_shutdown` precedes generation teardown and `session_start` follows
  replacement;
- interactive reload refuses to run while a response is active;
- llama.cpp protocol and management behavior live in the bundled extension.

[译文]
- 扩展的 provider 注册会在正常的模型使用之前到达模型运行时;
- 扩展上下文在替换/reload 之后失效;
- `session_shutdown` 先于代际拆卸,`session_start` 在替换之后;
- 交互式 reload 在响应处于活动状态时拒绝运行;
- llama.cpp 的协议与管理行为位于随包扩展中。

[原文]
Tau deliberately differs where its architecture requires it: fresh cwd/trust-
bound registries, `/local` rather than `/llama`, no fake auth, single-model
server support, no guessed metadata, no silent unload, and the durable
commit/no-fail publication protocol below.

[译文]
在自身架构要求之处,Tau 有意做出差异:新的、受 cwd/信任约束的注册表;用 `/local` 而不是 `/llama`;不伪造认证;支持单模型服务器;不猜测元数据;不静默卸载;以及下文所述的持久化提交/无失败发布协议。

## 当前 main 分支审计(Current-main audit)

[原文]
The audit baseline is Tau `9c1285d68f41059105bd8a834d309a4d601a3b07` plus
the accepted #602 plan commit. Relevant code is in:

[译文]
审计基线是 Tau `9c1285d68f41059105bd8a834d309a4d601a3b07` 加上已采纳的 #602 计划提交。相关代码位于:

[原文]
- `src/tau_coding/cli.py`
- `src/tau_coding/tui/app.py`
- `src/tau_coding/session.py`
- `src/tau_coding/project_trust.py`
- `src/tau_coding/extensions/runtime.py`
- `src/tau_coding/provider_config.py`
- `src/tau_coding/provider_runtime.py`
- `src/tau_agent/session/`

[译文]
- `src/tau_coding/cli.py`
- `src/tau_coding/tui/app.py`
- `src/tau_coding/session.py`
- `src/tau_coding/project_trust.py`
- `src/tau_coding/extensions/runtime.py`
- `src/tau_coding/provider_config.py`
- `src/tau_coding/provider_runtime.py`
- `src/tau_agent/session/`

### 当前的启动(Startup today)

[原文]
Print startup currently does this:

[译文]
Print 启动目前这样做:

```text
load durable ProviderSettings
→ resolve record and provider/model
→ create provider
→ CodingSession.load(provider=...)
→ install stderr extension UI
→ emit pending session_start
→ run prompt
→ close CodingSession-owned replacement providers
→ frontend closes the original provider
```

[原文]
TUI startup follows the same provider-first ordering. If provider construction
fails, only the TUI substitutes `LoginRequiredProvider`; print mode fails. The
TUI then creates or resolves its session record and calls `CodingSession.load()`.
Explicit TUI and print resume use the record's provider/model anchor when one is
available.

[译文]
TUI 启动遵循同样的「provider 优先」顺序。如果 provider 构建失败,只有 TUI 会用 `LoginRequiredProvider` 替代;print 模式直接失败。随后 TUI 创建或解析其会话记录,并调用 `CodingSession.load()`。显式的 TUI 与 print 恢复,在有可用锚点时使用记录的 provider/model。

[原文]
`CodingSession.load()` already has useful staging behavior:

[译文]
`CodingSession.load()` 已经具备有用的暂存行为:

[原文]
1. Read the transcript and derive the active leaf.
2. Create a fresh, cwd-bound `ExtensionRuntime`.
3. Load user and explicit extensions, excluding project extensions.
4. Resolve project trust.
5. Build a coherent trusted or untrusted resource plan.
6. Load opted-in project extensions only after approval.
7. Compose tools, commands, guidelines, and system prompt.
8. Build and bind the harness.
9. Defer `session_start` until the host installs its UI bridge.

[译文]
1. 读取会话记录并推导出活动叶节点。
2. 创建一个新的、绑定 cwd 的 `ExtensionRuntime`。
3. 加载用户与显式扩展,排除项目扩展。
4. 解析项目信任。
5. 构建一份一致的、可信或不可信的资源计划。
6. 只在批准之后加载已选择启用的项目扩展。
7. 组合工具、命令、准则与系统提示词。
8. 构建并绑定 harness。
9. 把 `session_start` 推迟到宿主安装其 UI 桥之后。

[原文]
There is no known path in this sequence that imports project extension code
before the destination trust decision. This invariant must survive extraction.

[译文]
该序列中没有任何已知路径会在目标信任决策之前导入项目扩展代码。这一不变量必须在抽取过程中得到保留。

[原文]
However, `load()` is not a complete preparation transaction. It can persist tool
history repairs and discover runtime model limits. It also receives an already
constructed provider and may replace it from durable settings. Initial provider
ownership is consequently split between frontend and session.

[译文]
然而,`load()` 并不是一个完整的准备事务。它可以持久化工具历史修复,并发现运行时模型上限。它还接收一个已经构建好的 provider,并可能用持久化设置替换它。因此,初始 provider 的所有权被拆分在前端与会话之间。

### 当前的替换与 reload(Replacement and reload today)

[原文]
Reload and destination replacement stage a fresh extension runtime. Cancellation
or preparation failure generally keeps the outgoing session. Project trust cache
publication is delayed until adoption, although a saved UI choice is currently
written to `trust.json` during resolution rather than staged with adoption.

[译文]
Reload 与目标替换会暂存一个新的扩展运行时。取消或准备失败通常会保留外出会话。项目信任缓存的发布被推迟到采纳时;不过,保存的 UI 选择目前在解析期间就写入了 `trust.json`,而不是随采纳一起暂存。

[原文]
The current publication sequence still has gaps:

[译文]
当前的发布序列仍存在缺口:

[原文]
- lifecycle callbacks run before a synchronous field swap but are not yet a
  formally contained no-fail region;
- destination transcript repair may write during preparation;
- transcript initialization/model/leaf writes are not one atomic batch;
- session index writes are not explicitly classified as repairable cache writes;
- replacement provider ownership is split;
- `new_session()` and `resume()` do not themselves enforce an idle harness;
  the TUI currently cancels an active run before invoking some replacements;
- branch replacement does reject an active run.

[译文]
- 生命周期回调在同步字段交换之前运行,但还不是一个正式受控的无失败区域;
- 目标会话记录修复可能在准备期间写入;
- 会话记录初始化/模型/叶节点的写入不是一个原子批次;
- 会话索引写入没有被明确归类为「可修复的缓存写入」;
- 替换 provider 的所有权被拆分;
- `new_session()` 与 `resume()` 本身并不强制 harness 处于空闲;
  TUI 目前在调用某些替换之前取消活动运行;
- 分支替换确实会拒绝活动运行。

### 当前的模型选择与恢复(Model selection and recovery today)

[原文]
`ModelChangeEntry` stores only `model`. Provider identity lives in the rebuildable
session index record. Replay therefore recovers the model on the selected branch
but cannot recover a cross-provider branch unambiguously. Current branch tests
show the consequence: state can replay an earlier model while the configured
runtime remains anchored to the record's provider/current model.

[译文]
`ModelChangeEntry` 只存储 `model`。Provider 身份位于可重建的会话索引记录中。因此重放可以恢复所选分支上的模型,但无法明确恢复跨 provider 的分支。当前的分支测试展示了其后果:状态可以重放出更早的模型,而配置的运行时仍锚定在记录的 provider/当前模型上。

[原文]
Cross-provider selection creates a candidate before mutating the active provider,
so runtime-construction failure preserves the old pair. Same-provider selection
is mutation-first. Selection writes durable defaults and index metadata, but
ordinary picker switches do not atomically append provider/model history plus a
leaf.

[译文]
跨 provider 选择会先创建候选,再修改活动 provider,因此运行时构建失败会保留旧组合。同 provider 选择则是「先修改」。选择会写入持久化默认值与索引元数据,但普通的选择器切换不会原子地追加 provider/model 历史加一个叶节点。

### 当前的清理(Cleanup today)

[原文]
Providers created by a session switch are kept in `CodingSession._owned_providers`
and closed on final session close. The provider constructed by print/TUI startup
is frontend-owned and closed by the frontend. This split explains duplicate
cleanup responsibilities and must not survive the shared preparation service.

[译文]
会话切换所创建的 provider 保存在 `CodingSession._owned_providers` 中,并在最终会话关闭时关闭。print/TUI 启动所构建的 provider 由前端拥有,并由前端关闭。这种拆分解释了重复的清理职责,并且绝不能延续到共享的准备服务中。

## 决策(Decision)

### 三个显式的准备阶段(1. Three explicit preparation stages)

[原文]
Create `src/tau_coding/session_preparation.py` in Phase 3. It owns one request and
returns a `PreparedCodingSession` with idempotent `adopt()` and `abort()`.

[译文]
在 Phase 3 创建 `src/tau_coding/session_preparation.py`。它持有一个请求,并返回一个带幂等 `adopt()` 与 `abort()` 的 `PreparedCodingSession`。

#### 状态阶段(State stage)

[原文]
- Resolve a new or existing session record and canonical destination cwd.
- Read transcript/session state under the session lock.
- Determine the active leaf, legacy provider anchor, and staged repair/initial
  entries.
- Do not create a provider, load project content, or write authoritative JSONL.

[译文]
- 解析新建或既有的会话记录,以及规范目标 cwd。
- 在会话锁之下读取会话记录/会话状态。
- 确定活动叶节点、遗留 provider 锚点,以及暂存的修复/初始条目。
- 不创建 provider、不加载项目内容、不写入权威 JSONL。

#### 环境阶段(Environment stage)

[原文]
- Create a fresh destination `ExtensionRuntime`.
- Load trusted built-ins first, then user and explicit extensions.
- Detect protected project inputs and resolve trust.
- Only after trust, load project resources and opted-in project extensions.
- Restore safe built-in snapshots and compose the effective durable/dynamic
  provider view.
- Do not perform network refresh for unrelated providers.

[译文]
- 创建一个新的目标 `ExtensionRuntime`。
- 先加载受信内置扩展,然后是用户与显式扩展。
- 检测受保护的项目输入并解析信任。
- 只在信任之后,加载项目资源与已选择启用的项目扩展。
- 恢复安全的内置快照,并组合出有效的持久化/动态 provider 视图。
- 不为无关 provider 执行网络刷新。

#### 运行时阶段(Runtime stage)

[原文]
- Resolve provider/model against the effective view.
- Refresh only an explicitly required dormant provider when no safe snapshot can
  satisfy the request.
- Resolve authentication immediately before constructing the candidate.
- Create provider, harness, coding session, and buffered frontend attachment.
- Return a prepared candidate without authoritative transcript/index writes.

[译文]
- 针对有效视图解析 provider/model。
- 只有在没有任何安全快照能满足请求时,才刷新一个显式要求唤醒的休眠 provider。
- 在构建候选之前立即解析认证。
- 创建 provider、harness、编码会话,以及带缓冲的前端挂载。
- 返回一个已准备的候选,而不进行权威的会话记录/索引写入。

[原文]
The existing direct `CodingSession.load(provider=...)` seam remains as a
compatibility wrapper for tests and embedded static-provider consumers. CLI and
TUI must use the shared preparation service; neither may recreate this ordering.

[译文]
既有的直接 `CodingSession.load(provider=...)` 接缝仍作为兼容包装保留,供测试与嵌入式静态 provider 消费方使用。CLI 与 TUI 必须使用共享的准备服务;两者都不得重新复制这套顺序。

### 信任顺序固定(2. Trust order is fixed)

[原文]
The environment stage preserves this order:

[译文]
环境阶段保持这一顺序:

```text
built-in/user settings
→ built-in, user, and explicit extension setup
→ metadata-only project detection
→ override / eligible extension / saved / default / UI trust resolution
→ trusted project resources
→ opted-in trusted project extension setup
→ provider snapshot restoration and effective composition
→ optional requested-provider refresh
```

[原文]
A project extension cannot approve or register itself before trust. Trust remains
an input-loading guard, not a process, filesystem, credential, network, provider,
or model sandbox.

[译文]
项目扩展不能在信任之前批准或注册自身。信任仍是一道输入加载守卫,而不是进程、文件系统、凭据、网络、provider 或模型沙箱。

### 注册表按代际本地化(3. Registries are generation-local)

[原文]
Every staged `ExtensionRuntime` owns exactly one dynamic-provider registry and
one local-backend registry. Registries are not process-global and are never
shared across destination cwd, reload, resume, or new-session preparation.

[译文]
每个暂存的 `ExtensionRuntime` 恰好拥有一个动态 provider 注册表与一个本地后端注册表。注册表不是进程级全局的,也绝不会跨越目标 cwd、reload、恢复或新建会话的准备过程共享。

[原文]
Each registration carries:

[译文]
每次注册都携带:

[原文]
- stable source identity;
- extension/runtime generation identity;
- provider layer identity.

[译文]
- 稳定的来源身份;
- 扩展/运行时代际身份;
- provider 层身份。

[原文]
Retiring a generation cancels its tasks and removes only its registrations.
Publication from an old source/layer/generation token is rejected. Durable
provider settings are an immutable baseline input, not a dynamic registry.

[译文]
退役一个代际会取消其任务,并且只移除它自己的注册项。来自旧来源/层/代际令牌的发布会被拒绝。持久化 provider 设置是不可变的基线输入,而不是动态注册表。

[原文]
Dynamic provider precedence is deliberate latest-active-layer precedence:

[译文]
动态 provider 的优先级是有意采用的「最新活动层优先」:

[原文]
durable baseline, built-in, user, explicit, trusted project. Removing one layer
reveals the preceding complete definition.

[译文]
持久化基线、内置、用户、显式、受信项目。移除某一层会重新暴露出前一个完整定义。

### 本地后端绑定到来源持有的 provider 层(4. Local backends bind to source-owned provider layers)

[原文]
A local backend is bound to the provider layer registered by the same source and
generation, not merely to a provider ID string. If another source shadows that
provider ID, the backend may show status/configuration but cannot select, reset,
or mutate the shadowing layer. Reset removes only source-owned state,
registration, snapshot, and credential reference.

[译文]
本地后端绑定到由同一来源与同一代际注册的那个 provider 层,而不仅仅绑定到一个 provider ID 字符串。如果另一个来源遮蔽了该 provider ID,该后端可以显示状态/配置,但不能选择、重置或修改那个遮蔽层。Reset 只移除来源自有的状态、注册、快照与凭据引用。

[原文]
This source binding is mandatory before `/local` exists.

[译文]
在 `/local` 存在之前,这种来源绑定是强制要求。

### 准备过程只有一个所有权账本(5. Preparation has one owner ledger)

[原文]
Ownership changes only at explicit transitions:

[译文]
所有权只在显式转换时改变:

[原文]
| Resource | During preparation | After adoption | On abort |
| --- | --- | --- | --- |
| candidate provider | `PreparedCodingSession` | `CodingSession` | close once |
| extension/provider registries | `PreparedCodingSession` | `CodingSession` | retire once |
| refresh/tasks | staged generation | adopted generation | cancel and await |
| outgoing session resources | outgoing `CodingSession` | retired after publication | remain live |
| frontend bridge | buffered candidate attachment | active frontend | discard buffer |

[译文]
| 资源 | 准备期间 | 采纳之后 | 中止时 |
| --- | --- | --- | --- |
| 候选 provider | `PreparedCodingSession` | `CodingSession` | 关闭一次 |
| 扩展/provider 注册表 | `PreparedCodingSession` | `CodingSession` | 退役一次 |
| 刷新/任务 | 暂存代际 | 已采纳代际 | 取消并等待 |
| 外出会话资源 | 外出 `CodingSession` | 发布之后退役 | 保持存活 |
| 前端桥 | 带缓冲的候选挂载 | 活动前端 | 丢弃缓冲 |

[原文]
Frontends do not close adopted providers. `CodingSession.aclose()` is the sole
final owner path and is idempotent. A failed switch closes only its candidate.
A successful switch closes the replaced Tau-owned provider after publication.
External llama.cpp server processes and model files are never Tau-owned.

[译文]
前端不关闭已采纳的 provider。`CodingSession.aclose()` 是唯一的最终所有权路径,并且是幂等的。失败的切换只关闭其候选。成功的切换在发布之后关闭被替换的、Tau 持有的 provider。外部 llama.cpp 服务器进程与模型文件从不属于 Tau 所有。

### 采纳与中止协议(6. Adoption and abort protocol)

[原文]
Preparation is reversible. Before the durable commit, any error/cancellation
calls `abort()`, closes staged resources, commits no trust decision, and leaves
the outgoing session and destination transcript unchanged.

[译文]
准备是可逆的。在持久化提交之前,任何错误/取消都会调用 `abort()`、关闭暂存资源、不提交任何信任决策,并让外出会话与目标会话记录保持不变。

[原文]
Adoption does this:

[译文]
采纳会做这些事:

[原文]
1. Require the outgoing harness to be idle.
2. Attach the candidate frontend bridge in buffered mode.
3. Atomically append the complete staged transcript batch. Its final non-leaf
   entry becomes the active tip and is the durable commit point.
4. Enter a serialized no-fail publication boundary.
5. For replacement, emit outgoing shutdown while its API is valid and clear its
   UI; handler failures become diagnostics.
6. Synchronically swap the active frontend session reference.
7. Attach/flush candidate UI and emit `session_start`; failures diagnose.
8. Commit staged trust for future operations; failure is fail-closed for future
   runs but does not roll back this already approved run.
9. Repair/update the session index; failure diagnoses and is repaired later.
10. Retire outgoing provider, tasks, and extension generation.

[译文]
1. 要求外出 harness 处于空闲。
2. 以缓冲模式挂载候选前端桥。
3. 原子追加完整的暂存会话记录批次。其最后一个非叶条目成为活动顶点,也就是持久化提交点。
4. 进入一个串行化的无失败发布边界。
5. 对于替换:在其 API 仍然有效时发出外出 shutdown 并清空其 UI;处理器失败转为诊断。
6. 同步交换活动前端会话引用。
7. 挂载/冲刷候选 UI 并发出 `session_start`;失败会生成诊断。
8. 为后续操作提交暂存的信任;失败会对未来的运行「失败关闭」,但不会回滚这次已经批准的运行。
9. 修复/更新会话索引;失败会生成诊断,并在之后修复。
10. 退役外出的 provider、任务与扩展代际。

[原文]
After step 3, expected extension, UI, trust-store, and index errors cannot escape
as ordinary rollback failures. A crash after step 3 leaves a complete final
entry that the next resume selects by file order.

[译文]
在第 3 步之后,可预期的扩展、UI、信任存储与索引错误不会作为普通的回滚失败逃逸出去。第 3 步之后发生崩溃,会留下一个完整的最终条目,下次恢复会按文件顺序选中它。

[原文]
`abort()` is idempotent. `adopt()` and `abort()` are mutually exclusive state
transitions.

[译文]
`abort()` 是幂等的。`adopt()` 与 `abort()` 是互斥的状态转换。

### 会话记录是权威;索引可修复(7. Transcript is authoritative; index is repairable)

[原文]
Add optional `provider` to `ModelChangeEntry`. Every new initial selection and
switch writes it. The provider/model change itself becomes the active file-order
tip.

[译文]
为 `ModelChangeEntry` 添加可选的 `provider`。每一次新的初始选择与切换都会写入它。provider/model 变更本身成为文件顺序中的活动顶点。

[原文]
Selection precedence is:

[译文]
选择优先级为:

[原文]
1. explicit CLI provider/model override;
2. latest provider-aware model entry on the active transcript path;
3. session index provider only as a legacy anchor when path history lacks one;
4. durable default for a new session;
5. first usable credentialed durable provider for a new session;
6. TUI-only login-required bootstrap.

[译文]
1. 显式的 CLI provider/model 覆盖;
2. 活动会话记录路径上最新的「感知 provider 的模型条目」;
3. 仅当路径历史缺少时,会话索引 provider 作为遗留锚点;
4. 新会话的持久化默认值;
5. 新会话中第一个可用且持有凭据的持久化 provider;
6. 仅限 TUI 的「需要登录」引导。

[原文]
Dynamic local providers participate only through explicit selection, a stable
session reference, or an in-session action. They never silently enter step 5.

[译文]
动态本地 provider 只通过显式选择、稳定会话引用或会话内操作参与。它们绝不会静默进入第 5 步。

[原文]
The append-only transcript wins over stale index metadata. Index update failure
cannot invalidate a committed switch; later startup repairs the index from the
transcript. Legacy entries remain readable and are not rewritten. Historical
cross-provider branches without provider identity remain inherently ambiguous
and use the record's best legacy provider anchor.

[译文]
只追加会话记录优先于陈旧的索引元数据。索引更新失败不会使已提交的切换失效;之后的启动会从会话记录修复索引。遗留条目保持可读,且不会被改写。没有 provider 身份的历史跨 provider 分支本质上仍有歧义,会使用该记录的最佳遗留 provider 锚点。

### 切换与替换仅限空闲时(8. Switching and replacement are idle-only)

[原文]
Model/provider switching, reset, reload, resume, new-session, cwd replacement,
and branching reject while the harness is running with guidance to cancel first.
They do not close or replace an in-flight provider. Cancellation is not assumed
to mean drained; a future cancel-and-drain API may relax this only after streams
and tools have finished.

[译文]
当 harness 正在运行时,模型/provider 切换、重置、reload、恢复、新建会话、cwd 替换与分支都会被拒绝,并给出「先取消」的指引。它们不会关闭或替换正在使用中的 provider。取消并不被假定为已排空;未来的「取消并排空」API 只有在流与工具都结束之后才可能放宽这一点。

[原文]
A switch transaction is candidate-first:

[译文]
切换事务是「候选优先」的:

```text
validate effective provider/model
→ create candidate provider
→ prepare history/thinking/route/image state
→ append provider-aware ModelChangeEntry as the new file-order tip
→ synchronous no-fail in-memory publication
→ repairable index update
→ close replaced provider
```

[原文]
Any failure before the batch leaves provider, model, thinking, route, index,
transcript, and active runtime unchanged.

[译文]
批次之前的任何失败都会让 provider、模型、thinking、路由、索引、会话记录与活动运行时保持不变。

### 内置 provider 标识符与共存(9. Built-in provider identifier and coexistence)

[原文]
The canonical built-in provider ID and display name are **`llama.cpp`**.
Existing user catalog providers named **`llama-cpp`** remain distinct and are
not migrated, rewritten, hidden, or shadowed by name normalization. CLI/session
IDs are exact strings; punctuation is not canonicalized.

[译文]
规范的内置 provider ID 与显示名是 **`llama.cpp`**。既有的、名为 **`llama-cpp`** 的用户目录 provider 保持独立,不会被迁移、改写、隐藏,也不会被名称归一化所遮蔽。CLI/会话 ID 是精确字符串;标点不做规范化。

[原文]
A user may also define a durable `llama.cpp` layer. Normal layer precedence
applies and diagnostics identify the effective source. Removing a dynamic layer
reveals the complete durable definition. Generic core code must not branch on
llama.cpp identifiers.

[译文]
用户也可以定义一个持久化的 `llama.cpp` 层。正常的层优先级适用,诊断会指出有效来源。移除某个动态层会重新暴露出完整的持久化定义。通用核心代码不得按 llama.cpp 标识符分支。

### 稳定的 scoped 引用(10. Stable scoped references)

[原文]
A built-in llama.cpp scoped reference uses the existing exact pair:

[译文]
内置 llama.cpp 的 scoped 引用使用既有的精确配对:

```json
{"provider": "llama.cpp", "model": "<server-reported-id>"}
```

[原文]
It stores no endpoint, provider definition, headers, credentials, discovered
metadata, router state, or file path. Only trusted built-ins may opt into this
host-defined durable-reference scheme initially; user/project dynamic providers
cannot.

[译文]
它不存储端点、provider 定义、headers、凭据、发现到的元数据、router 状态或文件路径。最初只有受信内置扩展可以选择启用这个由宿主定义的持久化引用方案;用户/项目动态 provider 不能。

[原文]
Resolution occurs only after the trusted built-in source and its endpoint-keyed
safe snapshot/live catalog are available. An absent, stale, sleeping, or unloaded
model remains visible as unavailable/inert where scoped references are managed.
It does not synthesize a model, probe the network, download, load, or switch.

[译文]
解析只在受信内置来源及其以端点为键的安全快照/实时目录可用之后发生。在管理 scoped 引用之处,缺失、陈旧、休眠或未加载的模型仍可见,但标记为不可用/惰性。它不会合成模型、探测网络、下载、加载或切换。

### 其余有界的选择(11. Remaining bounded choices)

[原文]
These choices are fixed for later phases:

[译文]
以下选择为后续阶段固定:

[原文]
- module names: `session_preparation.py`, `extensions/provider_registry.py`, and
  `local_backends.py`;
- built-in state path: `TauPaths.home / "state/extensions/llama.cpp.json"`;
- named refresh timeout defaults: 5 seconds for startup resolution, 10 seconds
  for explicit `/model` refresh, and 15 seconds for `/local` operations;
- explicit resumed llama.cpp session with neither safe snapshot nor successful
  refresh: fail with actionable setup/retry guidance; never fall back or erase
  its stable reference;
- Phase 6 real adapter spike: Ollama, because its API/capabilities differ from
  llama.cpp while remaining easy to fake locally;
- hidden built-ins: included in detailed `/session` diagnostics with source
  `built-in`, omitted from ordinary install/discovery counts;
- safe state schema: unsupported versions are read-only errors, never
  destructively rewritten.

[译文]
- 模块名:`session_preparation.py`、`extensions/provider_registry.py` 与 `local_backends.py`;
- 内置状态路径:`TauPaths.home / "state/extensions/llama.cpp.json"`;
- 具名刷新超时默认值:启动解析 5 秒;显式 `/model` 刷新 10 秒;`/local` 操作 15 秒;
- 显式恢复的 llama.cpp 会话既无安全快照、刷新也未成功时:以可操作的 setup/重试指引失败;绝不回退或抹掉其稳定引用;
- Phase 6 的真实适配器 spike:选择 Ollama,因为它的 API/能力与 llama.cpp 不同,同时在本地又容易伪造;
- 隐藏的内置扩展:包含在详细的 `/session` 诊断中,来源标为 `built-in`,但在普通的安装/发现计数中省略;
- 安全状态 schema:不支持的版本是只读错误,绝不破坏性地重写。

[原文]
Timeout retains the previous safe snapshot and records one bounded diagnostic.
The numbers are defaults, not protocol claims.

[译文]
超时会保留先前的安全快照,并记录一条有界诊断。这些数字是默认值,不是协议承诺。

## 后果(Consequences)

### 正面(Positive)

[原文]
- TUI and print can select extension providers without trust-order duplication.
- Project code still cannot execute before trust.
- Provider/task cleanup has one owner.
- Resume and branching become provider-aware.
- Durable transcript commit and in-memory publication have a testable boundary.
- Existing `llama-cpp` custom providers remain compatible.
- `/local` stays provider-neutral and source-safe.

[译文]
- TUI 与 print 可以选择扩展 provider,而无需重复信任顺序。
- 项目代码仍然不能在信任之前执行。
- Provider/任务清理只有一个所有者。
- 恢复与分支变为「感知 provider」。
- 持久化会话记录提交与内存发布有了可测试的边界。
- 既有的 `llama-cpp` 自定义 provider 保持兼容。
- `/local` 保持 provider 无关且来源安全。

### 代价(Cost)

[原文]
- Session storage needs atomic batch append and cross-process locking.
- Frontend attachment needs buffering and contained diagnostics.
- `CodingSession.load()` must be split without losing its static-provider seam.
- Legacy cross-provider branches cannot be made unambiguous without rewriting
  history, which this design forbids.

[译文]
- 会话存储需要原子批量追加与跨进程加锁。
- 前端挂载需要缓冲与受控诊断。
- `CodingSession.load()` 必须被拆分,同时不能丢失其静态 provider 接缝。
- 若不重写历史(本设计禁止),遗留的跨 provider 分支无法变得无歧义。

## 特征化基线(Characterization baseline)

[原文]
Phase 0 tests intentionally describe current behavior before refactoring:

[译文]
Phase 0 的测试有意描述重构之前的行为:

[原文]
- print startup and resume selection;
- TUI startup, explicit resume, and login-required bootstrap;
- project-trust cancellation during startup, reload, new, and destination
  adoption;
- fresh-runtime reload/new/resume behavior;
- branch model recovery and active-run rejection;
- provider construction failure preserving an active cross-provider selection;
- frontend/session cleanup at current ownership seams;
- exact coexistence of `llama.cpp` and `llama-cpp` identifiers.

[译文]
- print 启动与恢复选择;
- TUI 启动、显式恢复,以及需要登录的引导;
- 启动、reload、新建与目标采纳期间的项目信任取消;
- 新运行时的 reload/新建/恢复行为;
- 分支模型恢复与活动运行拒绝;
- provider 构建失败时保留活动的跨 provider 选择;
- 当前所有权接缝处的前端/会话清理;
- `llama.cpp` 与 `llama-cpp` 标识符的精确共存。

[原文]
Some tests expose behavior this ADR replaces, notably provider-before-extension
startup, split initial-provider ownership, model-only history, and TUI
cancel-before-replacement. Later phases must update those tests when the new
transaction lands rather than preserve obsolete behavior accidentally.

[译文]
有些测试暴露的正是本 ADR 将替换的行为,尤其是「provider 先于扩展」的启动、初始 provider 所有权拆分、仅含模型的变更历史,以及 TUI 的「替换前取消」。当新事务落地时,后续阶段必须更新这些测试,而不是意外保留过时行为。

## 验证(Verification)

[原文]
Phase 0 runs the handoff's focused lifecycle pytest files, Ruff check, Ruff
format check, and mypy. No live provider, local server, historical branch, or
secret is required.

[译文]
Phase 0 运行交接中指定的聚焦生命周期 pytest 文件、Ruff check、Ruff format check 与 mypy。不需要真实 provider、本地服务器、历史分支或密钥。
