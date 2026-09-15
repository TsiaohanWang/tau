---
title: "Local inference with llama.cpp / 使用 llama.cpp 进行本地推理"
description: "Configure Tau's built-in llama.cpp backend through /local. / 通过 /local 配置 Tau 内置的 llama.cpp 后端。"
---

[原文]
Tau ships llama.cpp as a trusted, hidden built-in local backend. The
provider-neutral entry point is `/local`; there is no `/llama` or `/llama-cpp`
command. The built-in provider ID is `llama.cpp`, distinct from an older
user-created `llama-cpp` catalog provider.

[译文]
Tau 把 llama.cpp 作为受信的、隐藏的内置本地后端随包提供。与 provider 无关的入口是 `/local`;不存在 `/llama` 或 `/llama-cpp` 命令。内置 provider 的 ID 是 `llama.cpp`,与更早的、由用户创建的 `llama-cpp` 目录 provider 相区分。

## 启动 llama.cpp(Start llama.cpp)

[原文]
Install llama.cpp separately using its official
[server quick start](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md#quick-start).
Tau recommends [router mode](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md#using-multiple-models)
for `/local` model download/load/unload management: start the server **without**
a model argument. This conservative single-user baseline keeps one model and
one inference slot resident:

[译文]
请按其官方的[服务器快速开始](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md#quick-start)单独安装 llama.cpp。若要使用 `/local` 的模型下载/加载/卸载管理,Tau 推荐 [router 模式](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md#using-multiple-models):启动服务器时**不带**模型参数。这条保守的单用户基线只常驻一个模型与一个推理槽位:

```bash
llama-server \
  --models-max 1 \
  --parallel 1 \
  --flash-attn auto
```

[原文]
Some installations expose the same entry point as `llama serve`. Bare
`llama-server` also works, but its defaults permit up to four loaded models and
choose the slot count automatically. A single-model server remains supported
for inference but does not expose router management:

[译文]
某些安装方式把同一入口暴露为 `llama serve`。不带参数的 `llama-server` 也可以工作,但它的默认值允许最多四个已加载模型,并自动决定槽位数量。单模型服务器仍受支持,可用于推理,但不提供 router 管理:

```bash
llama-server -hf <tool-capable-gguf>
```

[原文]
There is no universally optimal command. For one interactive Tau user with
enough unified memory/VRAM and a model supporting a 65,536-token context, use a
long-context profile only after confirming it fits:

[译文]
不存在普遍最优的命令。对于单个交互式 Tau 用户,在统一内存/VRAM 充足、且模型支持 65,536 token 上下文的情况下,只有在确认放得下之后才使用长上下文配置:

```bash
llama-server \
  --models-max 1 \
  --parallel 1 \
  --ctx-size 65536 \
  --flash-attn on \
  --cache-type-k q8_0 \
  --cache-type-v q8_0
```

[原文]
- `--models-max 1` limits simultaneously loaded models, not downloaded models.
- `--parallel 1` gives one request the context/KV cache instead of spending
  memory on concurrent slots.
- `q8_0` KV caches use less memory than the `f16` defaults while retaining more
  fidelity than lower-bit cache types.
- `--ctx-size 65536` can still exceed the hardware or model limit; reduce it
  first when loading fails.
- `--flash-attn auto` is portable; force `on` only on a supported backend.

[译文]
- `--models-max 1` 限制的是同时加载的模型数,不是已下载的模型数。
- `--parallel 1` 把上下文/KV 缓存交给单个请求,而不是把内存花在并发槽位上。
- `q8_0` KV 缓存比默认的 `f16` 占用更少内存,同时比更低比特的缓存类型保留更高保真度。
- `--ctx-size 65536` 仍可能超出硬件或模型上限;加载失败时请先减小它。
- `--flash-attn auto` 具有可移植性;只有在受支持的后端上才强制设为 `on`。

[原文]
Sampling and reasoning options are model behavior, not universal performance
settings. `--min-p 0` disables llama.cpp's default min-p sampler.
`--reasoning-effort medium` (or the older template-kwargs equivalent) and
`--reasoning-preserve` should be used only with templates that support them.
Check the model card and run `/local` → Doctor instead of applying those flags
to every model.

[译文]
采样与推理选项属于模型行为,而不是通用的性能设置。`--min-p 0` 会关闭 llama.cpp 默认的 min-p 采样器。`--reasoning-effort medium`(或更早的 template-kwargs 等价写法)与 `--reasoning-preserve` 只应在模板支持它们时使用。请查看模型卡并运行 `/local` → Doctor,而不是把这些 flag 套用到每个模型上。

[原文]
The default endpoint is `http://127.0.0.1:8080`. Tau does not install, start,
stop, or scan for llama.cpp. Keep the server running while Tau uses it. In
compatible router mode, Tau can explicitly ask that independent server to
download a selected Hugging Face model; Tau itself never writes or deletes the
model file.

[译文]
默认端点是 `http://127.0.0.1:8080`。Tau 不安装、不启动、不停止,也不扫描 llama.cpp。Tau 使用它期间请保持服务器运行。在兼容的 router 模式下,Tau 可以显式请求那个独立服务器下载所选的 Hugging Face 模型;Tau 自身从不写入或删除模型文件。

## 配置 `/local`(Configure `/local`)

[原文]
Start Tau and enter:

[译文]
启动 Tau 并输入:

```text
/local
```

[原文]
Choose the recommended `llama.cpp` backend and confirm the choice, even when it
is the only backend. Tau immediately probes the saved endpoint,
`LLAMA_BASE_URL`, or the default `http://127.0.0.1:8080`. Use **Configure** for a
server URL elsewhere (with or without `/v1`) and an optional API key. Tau probes
only that one effective endpoint; it never scans ports, processes, or the local
network.

[译文]
选择推荐的 `llama.cpp` 后端并确认该选择,即使它是唯一的后端。Tau 会立即探测已保存的端点、`LLAMA_BASE_URL`,或默认的 `http://127.0.0.1:8080`。若服务器 URL 在别处(带或不带 `/v1`),请用 **Configure** 指定,并可选择性地配置 API 密钥。Tau 只探测那一个生效的端点;它绝不扫描端口、进程或本地网络。

[原文]
Endpoint precedence is:

[译文]
端点优先级如下:

[原文]
1. a URL submitted through **Configure**;
2. the saved endpoint;
3. `LLAMA_BASE_URL` for the current process;
4. `http://127.0.0.1:8080` as the offered default.

[译文]
1. 通过 **Configure** 提交的 URL;
2. 已保存的端点;
3. 当前进程的 `LLAMA_BASE_URL`;
4. 作为默认提供的 `http://127.0.0.1:8080`。

[原文]
Opening the confirmed backend triggers the probe. Probing the offered default
makes discovered models available for the current Tau process but does not save
the endpoint; use **Configure** to persist it. Successful discovery uses exact
IDs from `/v1/models` and never requires a fake model ID.

[译文]
打开已确认的后端会触发探测。探测那个默认提供的端点会让发现到的模型对当前 Tau 进程可用,但不会保存该端点;要持久化它请使用 **Configure**。成功的发现会使用来自 `/v1/models` 的确切 ID,绝不需要伪造的模型 ID。

### 认证(Authentication)

[原文]
Use the optional key in one of these ways:

[译文]
可选密钥的使用方式有以下几种:

[原文]
- enter it through the secret `/local` field; Tau stores it in
  `~/.tau/credentials.json`;
- set `LLAMA_API_KEY` for an environment-only setup;
- leave both empty for an unauthenticated server.

[译文]
- 通过 `/local` 的密钥输入字段录入;Tau 会把它存到 `~/.tau/credentials.json`;
- 设置 `LLAMA_API_KEY`,用于仅依赖环境的配置;
- 两者都留空,用于不认证的服务器。

[原文]
A stored key wins over `LLAMA_API_KEY`. Without a key Tau sends no
`Authorization` header. Keys never enter the llama.cpp state file, sessions,
exports, or diagnostics. See [Project trust and security]({{< relref
"./project-trust.md#security-boundary" >}}).

[译文]
已存储的密钥优先于 `LLAMA_API_KEY`。没有密钥时 Tau 不发送 `Authorization` 头。密钥绝不会进入 llama.cpp 状态文件、会话、导出或诊断。见[项目信任与安全]({{< relref
"./project-trust.md#security-boundary" >}})。

## 选择模型(Choose a model)

[原文]
After setup, `/model` shows server-reported model IDs and display names. Start
explicitly when using scripts or a new TUI session:

[译文]
配置完成后,`/model` 会显示服务器上报的模型 ID 与显示名。在使用脚本或新建 TUI 会话时,请显式启动:

```bash
tau --provider llama.cpp --model <model-id>
tau --provider llama.cpp --model <model-id> --print "summarize this project"
```

[原文]
Both print mode and the TUI load the built-in provider before validating an
explicit selection. A saved safe snapshot can keep an explicit startup usable
while the server is temporarily down. If several models are available,
headless startup requires the exact `--model`; Tau never silently chooses a
different explicit model. Local inference is not an automatic global-provider
fallback.

[译文]
print 模式与 TUI 都会先加载内置 provider,再校验显式选择。已保存的安全快照可以让显式启动在服务器临时停机期间仍可用。如果有多个模型可用,无头启动必须给出确切的 `--model`;Tau 绝不会悄悄改用另一个显式模型。本地推理不是全局 provider 的自动回退项。

[原文]
The safe integration snapshot is stored at
`~/.tau/state/extensions/llama.cpp.json`. It contains only the normalized
endpoint, selected model reference, allowlisted model metadata, and a timestamp.
The file is versioned, locked, atomically replaced, and private. Dynamic provider
definitions are never copied into `catalog.toml` or `providers.json`.

[译文]
安全集成快照存放在 `~/.tau/state/extensions/llama.cpp.json`。它只包含规范化后的端点、所选模型的引用、经白名单筛选的模型元数据以及一个时间戳。该文件带版本号、加锁、以原子方式替换,并且是私有的。动态 provider 定义绝不会复制进 `catalog.toml` 或 `providers.json`。

## Router 模型管理(Router model management)

[原文]
A current `llama-server` started without a model runs in router mode. Tau enables
management only when `/props` identifies the router and its `build_info` is in
the tested **b9688–b10595** range. Unknown, older, or newer builds safely degrade
to `/v1/models` discovery: inference remains available, but Tau sends no router
mutation. Single-model servers remain fully supported.

[译文]
不带模型启动的当前版本 `llama-server` 会运行在 router 模式。只有当 `/props` 标识出该 router,且其 `build_info` 落在经过测试的 **b9688–b10595** 区间内时,Tau 才会启用管理。未知的、更旧的或更新的构建都会安全地降级为 `/v1/models` 发现:推理仍然可用,但 Tau 不发送任何 router 变更。单模型服务器仍完全受支持。

[原文]
After the automatic probe or Refresh confirms a compatible router, `/local`
lists loaded, sleeping, unloaded, loading, downloading, failed, and unknown
server states in a dedicated model section. A separate actions section contains
Hugging Face search/download, configuration, refresh, Doctor, and reset. Arrow
keys move within and between both sections, while Tab switches sections
directly. Only the focused section shows a `focused` marker, accent border, and
highlighted row, so Enter's target is explicit. Only loaded or sleeping models
enter `/model`. Router models in the `unloaded` state are labelled **available to
load**; press Enter on one to review a loading confirmation. Enter on a
loaded/sleeping row offers use or unload. Actions are always explicit:

[译文]
在自动探测或 Refresh 确认了兼容的 router 之后,`/local` 会在一个专用的模型区块中列出已加载、休眠、未加载、加载中、下载中、失败与未知的服务器状态。一个单独的操作区块包含 Hugging Face 搜索/下载、配置、刷新、Doctor 与 reset。方向键在两个区块内部及之间移动,Tab 则直接切换区块。只有获得焦点的区块会显示 `focused` 标记、强调边框与高亮行,因此 Enter 的作用目标是明确的。只有已加载或休眠的模型会进入 `/model`。处于 `unloaded` 状态的 router 模型标记为 **available to load**;在其上按 Enter 会先查看一个加载确认框。在已加载/休眠的行上按 Enter 会提供「使用」或「卸载」。所有操作始终是显式的:

[原文]
- Confirming an unloaded row waits until refreshed router state reports loaded
  or sleeping. If other models are active, choose whether to keep or unload
  them; Tau never decides for a shared router. Cancel is preselected as a safety
  default but is not labelled as recommended.
- **Unload model** asks for model-specific confirmation.
- **Search Hugging Face models…** accepts a model ID or search text, then opens
  an arrow-key navigable repository/quantization list with gating and reported
  sizes. `Q4_K_M` is marked recommended only as a UI preference, not persisted
  model metadata.
- **Download an exact Hugging Face model…** accepts
  `owner/repository[:quantization]`. Both search and exact-ID paths open a
  separate confirmation showing the selected model and known size before
  requesting the server-side download. During transfer, `/local` shows a
  full-width block progress bar, transferred bytes, and bytes remaining. Closing
  `/local` detaches from the transfer without stopping llama.cpp. Reopening it
  refreshes server status, reattaches to the latest byte progress, and offers
  **Cancel active download…**
  to stop the download explicitly. On completion, stale transfer text and the
  progress bar are cleared and the model immediately appears as **available to
  load**.

[译文]
- 确认一个未加载的行之后,会一直等待到刷新后的 router 状态报告为已加载或休眠。如果有其他模型处于活动状态,你需要选择保留还是卸载它们;Tau 绝不为一个共享的 router 做决定。Cancel 被预选为安全默认项,但不标注为推荐。
- **Unload model** 会要求针对该模型的确认。
- **Search Hugging Face models…** 接受模型 ID 或搜索文本,然后打开一个可用方向键导航的仓库/量化列表,其中包含门控信息与上报的文件大小。`Q4_K_M` 被标记为推荐,这仅是一种 UI 偏好,而不是持久化的模型元数据。
- **Download an exact Hugging Face model…** 接受 `owner/repository[:quantization]`。搜索路径与精确 ID 路径都会先打开一个单独的确认框,显示所选模型与已知大小,然后才请求服务端下载。传输期间,`/local` 会显示一条全宽的块状进度条、已传输字节与剩余字节。关闭 `/local` 会与该传输脱离,但不会停止 llama.cpp。重新打开它会刷新服务器状态、重新接上最新的字节进度,并提供 **Cancel active download…** 以显式停止下载。完成后,陈旧的传输文本与进度条会被清除,该模型立即显示为 **available to load**。

[原文]
Progress is bounded and explicitly cancellable. llama.cpp documents
`/models/unload` as the cancel operation for load/download, so Tau requests it
and then refreshes. On a
timeout or lost connection Tau refreshes if possible and never replays the
interrupted POST; review state before manually retrying. Tau never restores,
unloads, downloads, or deletes a model without a displayed decision.

[译文]
进度是有界的,并且可以显式取消。llama.cpp 把 `/models/unload` 记录为加载/下载的取消操作,因此 Tau 会请求它,然后刷新。遇到超时或连接丢失时,Tau 会尽可能刷新,并且绝不重放被中断的 POST;手动重试之前请先查看状态。没有一次显示出来的决策,Tau 绝不恢复、卸载、下载或删除任何模型。

### Hugging Face token 与门控仓库(Hugging Face tokens and gated repositories)

[原文]
Tau uses `HF_TOKEN`, `$HF_HOME/token`, or the standard Hugging Face token file
only for Hugging Face **search/details** requests. It does not save this token,
copy it into integration state, or forward it to llama.cpp. A gated repository
requires accepting its terms on `huggingface.co`.

[译文]
Tau 只在 Hugging Face 的**搜索/详情**请求中使用 `HF_TOKEN`、`$HF_HOME/token` 或标准的 Hugging Face token 文件。它不会保存该 token,不把它复制进集成状态,也不把它转发给 llama.cpp。门控仓库要求在 `huggingface.co` 上接受其条款。

[原文]
The independently running llama.cpp server performs downloads, so that server
process separately needs an authorized `HF_TOKEN` in its own environment. A Tau
search succeeding does not prove the server can download a gated model.

[译文]
下载由独立运行的 llama.cpp 服务器执行,因此该服务器进程需要在自己的环境中单独配置一个已授权的 `HF_TOKEN`。Tau 的搜索成功并不能证明该服务器能够下载某个门控模型。

## Scoped 的 llama.cpp 模型(Scoped llama.cpp models)

[原文]
Loaded or sleeping llama.cpp models can be added and removed through
`/scoped-models`, then selected from `/model` or cycled like ordinary scoped
models. Tau persists only `{provider: "llama.cpp", model: "<exact-id>"}`; the
dynamic provider definition, endpoint, credentials, and metadata stay out of
`providers.json`.

[译文]
已加载或休眠的 llama.cpp 模型可以通过 `/scoped-models` 添加和移除,然后从 `/model` 中选择,或像普通的 scoped 模型一样轮换。Tau 只持久化 `{provider: "llama.cpp", model: "<exact-id>"}`;动态 provider 定义、端点、凭据与元数据都不会进入 `providers.json`。

[原文]
If another client unloads the model, its scoped row remains visible as
**unavailable**. It is inert: selecting or cycling cannot synthesize a model,
contact Hugging Face, or trigger router load/download. Remove it through
`/scoped-models`, or load the model explicitly through `/local` and Refresh.

[译文]
如果另一个客户端卸载了该模型,它的 scoped 行仍会显示为 **unavailable**。它是惰性的:选择或轮换它不会凭空造出模型、不会联系 Hugging Face,也不会触发 router 加载/下载。请通过 `/scoped-models` 移除它,或通过 `/local` 与 Refresh 显式加载该模型。

## 状态与 Doctor(Status and Doctor)

[原文]
`/local` provides status and refresh. Refresh publishes a complete model
snapshot atomically. Temporary downtime retains the last safe snapshot and marks
it stale; it does not erase the active provider or block unrelated providers. If
the server stops reporting the active model, Tau keeps the current runtime
usable, marks the snapshot stale, and does not offer a replacement model without
an explicit selection after the original model returns.

[译文]
`/local` 提供状态与刷新。Refresh 会原子地发布一份完整的模型快照。临时停机时会保留最后一份安全快照并把它标记为陈旧;这不会抹掉活动 provider,也不会阻塞无关的 provider。如果服务器不再上报当前活动模型,Tau 会让当前运行时保持可用、把快照标记为陈旧,并且在原模型恢复之后,没有显式选择就不会提供替代模型。

[原文]
Doctor is an explicit action. It reports endpoint reachability, model discovery,
streaming, tool-schema acceptance, and observed tool-call emission. A model that
streams but does not emit the probe tool receives a compatibility warning rather
than a connectivity failure. Use a tool-capable instruct model and the server's
required chat-template options when tool calls are unavailable.

[译文]
Doctor 是一个显式操作。它会报告端点可达性、模型发现、流式传输、工具 schema 接受情况,以及实际观察到的工具调用发出情况。能流式输出但不发出探测工具的模型会得到一条兼容性警告,而不是连通性失败。当工具调用不可用时,请使用具备工具能力的 instruct 模型,并采用服务器所要求的 chat-template 选项。

## Reset(Reset)

[原文]
Reset removes only Tau's llama.cpp integration settings and safe snapshot. It
never stops the external server or deletes model files. Settings reset and stored
credential deletion are separate actions; a stored credential remains until its
separate deletion confirmation succeeds.

[译文]
Reset 只移除 Tau 的 llama.cpp 集成设置与安全快照。它绝不停止外部服务器,也不删除模型文件。重置设置与删除已存储凭据是两个彼此独立的操作;在单独的删除确认成功之前,已存储的凭据会一直保留。

## 排障(Troubleshooting)

[原文]
- **Connection refused or timeout:** start `llama-server`, check the exact URL,
  and choose `/local` → Refresh. Tau does not discover another port.
- **HTTP 401/403:** enter the server's configured key in `/local`, or set
  `LLAMA_API_KEY`. A stored key wins over the environment value.
- **Loading:** wait for llama.cpp to finish loading, then refresh.
- **`model limit reached` during download:** the shared router rejected the
  request. Review `/local`; unload another model only if intended, or try again
  later. Tau refreshes state and shows the router's exact rejection message.
- **Malformed or empty `/v1/models`:** inspect the server response and model
  loading state. Tau does not invent an ID or metadata.
- **Print mode reports an unavailable model:** configure `/local` first and pass
  `--provider llama.cpp` plus the exact discovered `--model`. A cached snapshot
  can work offline, but a first-time explicit model needs discovery.
- **Tools are not called:** run Doctor. Streaming can work while a model's GGUF
  chat template does not support tools. Use a tool-capable instruct GGUF and
  check llama.cpp's template/server flags.
- **An old `llama-cpp` provider remains:** it is a separate manually configured
  provider. Use `llama.cpp` for the built-in backend, or retain the old provider
  for its existing catalog setup.

[译文]
- **连接被拒绝或超时:** 启动 `llama-server`,核对确切的 URL,然后选择 `/local` → Refresh。Tau 不会去发现另一个端口。
- **HTTP 401/403:** 在 `/local` 中输入该服务器配置的密钥,或设置 `LLAMA_API_KEY`。已存储的密钥优先于环境变量中的值。
- **正在加载:** 等待 llama.cpp 完成加载,然后刷新。
- **下载时出现 `model limit reached`:** 共享 router 拒绝了该请求。请查看 `/local`;只有在确实需要时才卸载另一个模型,否则稍后重试。Tau 会刷新状态并显示 router 给出的确切拒绝消息。
- **`/v1/models` 畸形或为空:** 检查服务器响应与模型加载状态。Tau 不会凭空编造 ID 或元数据。
- **print 模式报告模型不可用:** 先配置 `/local`,并传入 `--provider llama.cpp` 以及发现到的确切 `--model`。缓存快照可以离线工作,但首次使用的显式模型需要完成发现。
- **工具没有被调用:** 运行 Doctor。流式传输可能正常,而该模型的 GGUF chat template 不支持工具。请使用具备工具能力的 instruct GGUF,并检查 llama.cpp 的 template/server flag。
- **旧的 `llama-cpp` provider 仍然存在:** 它是一个独立的手动配置 provider。内置后端请使用 `llama.cpp`;也可以保留旧 provider 以沿用其现有的目录配置。

## 从手动配置的本地 provider 迁移(Migration from manual local providers)

[原文]
Existing custom OpenAI-compatible providers continue to work. To move a
manually configured llama.cpp server to the built-in integration, open
`/local`, choose and confirm the recommended backend, enter the endpoint and
optional key, then use the exact ID returned by `/v1/models`. The built-in
provider ID is `llama.cpp`; an older `llama-cpp` catalog entry is not migrated,
rewritten, or removed automatically. Remove it only after verifying the new
session. Ollama and other local servers remain on the custom-provider path and
are not shipped Tau backends.

[译文]
现有的自定义 OpenAI 兼容 provider 继续可用。要把手动配置的 llama.cpp 服务器迁移到内置集成,请打开 `/local`,选择并确认推荐的后端,输入端点与可选密钥,然后使用 `/v1/models` 返回的确切 ID。内置 provider 的 ID 是 `llama.cpp`;较旧的 `llama-cpp` 目录条目不会被自动迁移、改写或移除。只有在验证过新会话之后才移除它。Ollama 与其他本地服务器仍走自定义 provider 路径,它们不是 Tau 随包提供的后端。

[原文]
Tau never copies old fake keys, fake model IDs, catalog definitions, project
settings, or environment endpoints into built-in state. Reset removes only
built-in settings and safe snapshots; it never stops a server or deletes model
files. For other OpenAI-compatible endpoints, keep using [`/login custom`]({{<
relref "../guides/providers-and-models.md#adding-a-custom--local-provider" >}})
or `tau setup`.

[译文]
Tau 绝不把旧的伪造密钥、伪造模型 ID、目录定义、项目设置或环境端点复制进内置状态。Reset 只移除内置设置与安全快照;它绝不停止服务器,也不删除模型文件。其他 OpenAI 兼容端点请继续使用 [`/login custom`]({{<
relref "../guides/providers-and-models.md#adding-a-custom--local-provider" >}})
或 `tau setup`。

[原文]
Router management never changes the safety boundary: all mutations are explicit,
model files are never deleted, and standard OpenAI-compatible single-model
inference remains supported.

[译文]
Router 管理绝不改变安全边界:所有变更都是显式的,模型文件绝不被删除,而标准的 OpenAI 兼容单模型推理仍然受支持。
