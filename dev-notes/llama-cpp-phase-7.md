# Phase 7:llama.cpp router 管理与 scoped 模型 / Phase 7: llama.cpp router management and scoped models

[原文]
Phase 7 completes issue #602 without changing the Phase 5 single-model path.

[译文]
Phase 7 完成了 issue #602,同时不改变 Phase 5 的单模型路径。

## 变更内容(What changed)

[原文]
- The llama.cpp package capability-detects router mode through `/props` and
  enables mutations only for the official API contract tested across builds
  **b9688 through b10595**. Unknown, malformed, older, and newer routers degrade
  to standard `/v1/models` discovery.
- Compatible routers expose all server model states through `/local`. Only
  `loaded` and `sleeping` models publish into the dynamic inference provider.
- Load, unload, and server-side `owner/repository[:quantization]` download use
  documented `/models`, `/models/load`, and `/models/unload` requests. Load
  waits for reconciled loaded/sleeping state. Unload and download require
  confirmation; loading with active peers asks whether to keep or unload them.
- Router SSE emits bounded aggregate byte and percentage download progress while
  catalog polling remains authoritative for completion. Cancellation requests the documented
  unload operation for load/download and refreshes state. Timeout or connection loss
  attempts refresh and never replays a mutation.
- Hugging Face search/details use its public API through the injected HTTP
  client. Results include repository gating and GGUF quantization/size data;
  `Q4_K_M` is only a recommended UI option.
- Search discovers `HF_TOKEN` from the environment or standard token files. It
  is never stored or forwarded. Gated diagnostics explain that the independent
  llama.cpp process separately needs authorized server-side credentials.
- The trusted built-in provider opts into stable scoped references. Tau stores
  only `llama.cpp` plus the exact model ID. Unloaded/stale rows remain visible
  as unavailable, cannot be selected/cycled, and cause no discovery or mutation.
- Generic `/local` contracts gained backend-neutral search artifacts and
  structured confirmations. After explicit backend confirmation, the Textual
  host probes its effective endpoint, renders model states and backend actions
  in separate arrow-key navigable sections, and lets users select search variants for download
  without router, Hugging Face, GGUF, or quantization branches in host logic.
  Expensive load/download operations use backend-owned confirmations with Cancel
  preselected.

[译文]
- llama.cpp 包通过 `/props` 对 router 模式做能力探测,并且只为在 **b9688 到 b10595** 各构建上测试过的官方 API 契约启用变更。未知、畸形、更旧与更新的 router 都会降级为标准 `/v1/models` 发现。
- 兼容的 router 会通过 `/local` 暴露所有服务器模型状态。只有 `loaded` 与 `sleeping` 模型会发布进动态推理 provider。
- 加载、卸载以及服务端的 `owner/repository[:quantization]` 下载使用有文档记载的 `/models`、`/models/load` 与 `/models/unload` 请求。加载会等待协调后的 loaded/sleeping 状态。卸载与下载需要确认;当有活动的同级模型时,加载会询问是保留还是卸载它们。
- Router 的 SSE 会发出有界的聚合字节与百分比下载进度,而目录轮询仍是完成判定的权威。取消会为加载/下载请求文档记载的卸载操作,并刷新状态。超时或连接丢失会尝试刷新,绝不重放变更。
- Hugging Face 的搜索/详情通过注入的 HTTP 客户端使用其公开 API。结果包含仓库门控(gating)与 GGUF 量化/大小数据;`Q4_K_M` 只是 UI 中的推荐选项。
- 搜索会从环境变量或标准 token 文件中发现 `HF_TOKEN`。它永远不会被存储或转发。门控诊断会说明:独立的 llama.cpp 进程另外需要经过授权的服务端凭据。
- 受信的内置 provider 选择启用稳定的 scoped 引用。Tau 只存储 `llama.cpp` 加确切的模型 ID。未加载/陈旧的条目仍可见但标记为不可用,不能被选择/循环,也不会引发发现或变更。
- 通用 `/local` 契约新增了后端无关的搜索产物与结构化确认。在显式后端确认之后,Textual 宿主会探测其有效端点,把模型状态与后端动作渲染在各自独立、可用方向键导航的区块中,并允许用户为下载选择搜索到的变体,而宿主逻辑中不含 router、Hugging Face、GGUF 或量化分支。昂贵的加载/下载操作使用由后端持有的确认,且「取消」默认预选。

[原文]
Tau never calls llama.cpp's delete endpoint.

[译文]
Tau 永远不会调用 llama.cpp 的删除端点。

## 为什么这与 Pi 对应(Why this maps to Pi)

[原文]
Pi keeps protocol-specific model management in its llama extension while its
host renders extension-owned actions. Tau preserves the same boundary:

```text
tau_ai       unchanged OpenAI-compatible inference transport
tau_agent    unchanged provider-neutral harness
tau_coding   generic local actions, confirmations, progress, scoped references
llama_cpp    router/Hugging Face URLs, parsing, policy, reconciliation
```

[译文]
Pi 把协议特有的模型管理保留在其 llama 扩展中,而宿主渲染由扩展持有的动作。Tau 保持同样的边界:

```text
tau_ai       不变的 OpenAI 兼容推理传输
tau_agent    不变的 provider 无关 harness
tau_coding   通用本地动作、确认、进度、scoped 引用
llama_cpp    router/Hugging Face URL、解析、策略、协调
```

[原文]
Tau deliberately differs by supporting ordinary single-model servers, using a
provider-neutral `/local`, version-gating mutations, and never silently
unloading a shared router. Dynamic definitions remain process-local.

[译文]
Tau 有意做出差异:支持普通的单模型服务器、使用 provider 无关的 `/local`、对变更做版本门控,并且绝不静默卸载共享的 router。动态定义仍保持进程本地。

## 失败与安全行为(Failure and security behavior)

[原文]
A mutation is sent at most once per explicit operation. Retry means refresh and
then a new user decision, not replay. Provider snapshots publish after observed
state transitions. If reconciliation also loses the connection, cached state is
marked stale and the user is told to refresh before retrying.

[译文]
每次显式操作最多发送一次变更。重试意味着刷新,然后由用户做出新的决定,而不是重放。Provider 快照在观察到状态转换之后发布。如果协调过程也丢失连接,缓存状态会被标记为陈旧,并告知用户在重试之前先刷新。

[原文]
The llama.cpp API key and Hugging Face token are independent. Neither enters
safe state, sessions, exports, diagnostics, or search results. Hugging Face
gating terms and server-side token responsibility are shown without printing a
token.

[译文]
llama.cpp 的 API key 与 Hugging Face token 彼此独立。两者都不会进入安全状态、会话、导出、诊断或搜索结果。Hugging Face 的门控条款与服务端 token 责任会被展示,但不会打印 token。

[原文]
Server-side downloads outlive the `/local` modal: Escape detaches the observer
rather than sending `/models/unload`. The registry keeps supervising the task,
retains its latest determinate progress, and lets a reopened modal subscribe to
updates and expose an explicit cancel action. Known Hugging Face artifact sizes
are carried into confirmation without persisting
search metadata.

[译文]
服务端下载的生命周期长于 `/local` 模态框:Escape 只是摘除观察者,而不会发送 `/models/unload`。注册表继续监督该任务,保留其最新的确定性进度,并让重新打开的模态框能够订阅更新、暴露显式的取消操作。已知的 Hugging Face 产物大小会被带入确认过程,而不持久化搜索元数据。

## 如何测试(How to test)

[原文]
All HTTP behavior is deterministic through `httpx.MockTransport`:

[译文]
所有 HTTP 行为都通过 `httpx.MockTransport` 保持确定性:

```bash
uv run pytest tests/test_llama_cpp_extension.py -q
uv run pytest tests/test_local_backends.py tests/test_tui_local_backends.py -q
uv run ruff check .
uv run ruff format --check .
uv run mypy
uv run pytest -q
```

[原文]
The fake router covers version fallback, state parsing, confirmation, load,
unload, download, cancellation, connection loss, non-replay, provider refresh,
and stale scoped references. The fake Hugging Face API covers gating,
quantizations, sizes, recommendation, and search-only token use. No test makes a
real network request.

[译文]
假 router 覆盖版本回退、状态解析、确认、加载、卸载、下载、取消、连接丢失、不重放、provider 刷新与陈旧 scoped 引用。假 Hugging Face API 覆盖门控、量化、大小、推荐与「仅搜索使用 token」。没有任何测试会发起真实网络请求。
