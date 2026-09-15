---
title: "Phase 6: Local inference hardening and second-backend validation / 阶段 6:本地推理加固与第二后端验证"
---

[原文]
Phase 6 closes the generic local-provider validation loop from issue #602. It
keeps the shipped implementation intentionally small: llama.cpp remains the
only built-in local backend, while a deterministic second fake and a test-only
Ollama adapter exercise the public seams.

[译文]
阶段 6 闭合了 issue #602 中通用本地 provider 的验证闭环。它有意让实际交付的实现保持很小:llama.cpp 仍是唯一的内置本地后端,同时用一个确定性的第二假后端与一个仅用于测试的 Ollama 适配器来演练公开接缝。

## 变更内容(What changed)

[原文]
- A permanent fake second backend covers different normal, secret, and choice
  configuration fields, source-bound provider/backend layers, atomic failed
  configuration, cancellation, stale-result rejection, progress redaction, and
  optional capabilities.
- The Ollama adapter spike lives under `tests/fixtures/`; it is not imported by
  Tau production code and does not register an Ollama backend. It uses the
  official OpenAI-compatible `/v1/models` shape for provider discovery and the
  native `/api/tags` and `/api/ps` shapes for installed/running status.
- Refresh/reload stress tests cover coalescing, generation retirement, hostile
  cancellation, bounded cleanup, and late-result containment. Credential tests
  cover generation references, offline setup, state-file redaction, and
  cleanup-orphan behavior.
- A missing llama.cpp selection remains a stable reference rather than being
  overwritten by a newly discovered model. Status and model selection mark that
  snapshot stale. Explicit Doctor may probe a sole currently reported model for
  diagnostics, but it never changes the active selection.

[译文]
- 一个常驻的假第二后端覆盖:不同的普通/密钥/选择类配置字段、绑定来源的 provider/后端层、原子化的失败配置、取消、陈旧结果拒绝、进度脱敏,以及可选能力。
- Ollama 适配器 spike 位于 `tests/fixtures/` 下;Tau 生产代码不会导入它,它也不会注册 Ollama 后端。它在 provider 发现上使用官方的 OpenAI 兼容 `/v1/models` 形态,在「已安装/运行中」状态上使用原生 `/api/tags` 与 `/api/ps` 形态。
- 刷新/reload 压力测试覆盖合并、代际退役、恶意取消、有界清理与迟到结果受控。凭据测试覆盖代际引用、离线 setup、状态文件脱敏,以及清理孤儿的行为。
- 缺失的 llama.cpp 选择会保持为一个稳定引用,而不会被新发现的模型覆盖。状态与模型选择会把该快照标记为陈旧。显式的 Doctor 可以为了诊断去探测唯一一个当前上报的模型,但绝不会改变活动选择。

## 来自 Ollama 的契约压力测试(Contract pressure from Ollama)

[原文]
The spike did not require llama.cpp vocabulary in the generic APIs. It did
confirm three useful boundaries:

[译文]
这个 spike 没有要求在通用 API 中出现 llama.cpp 的词汇。它确实确认了三条有用的边界:

[原文]
1. Provider discovery and local status can use different protocol endpoints.
   `DynamicProvider.refresh_models` returns one complete provider snapshot,
   while `LocalBackend.status` returns installed/running state through the
   open-ended `LocalModel.state` field.
2. `NoAuth` is a real use case. Ollama's local OpenAI-compatible endpoint does
   not need a synthetic key or an `Authorization` header.
3. Backend capability operations remain optional and host-renderable. The host
   owns fields, confirmation, cancellation, and rendering; protocol adapters
   return structured values and never construct Textual widgets.

[译文]
1. Provider 发现与本地状态可以使用不同的协议端点。`DynamicProvider.refresh_models` 返回一个完整的 provider 快照,而 `LocalBackend.status` 通过开放式的 `LocalModel.state` 字段返回「已安装/运行中」状态。
2. `NoAuth` 是真实存在的用例。Ollama 本地的 OpenAI 兼容端点不需要合成密钥,也不需要 `Authorization` 头。
3. 后端能力操作保持可选且可由宿主渲染。宿主持有字段、确认、取消与渲染;协议适配器只返回结构化值,绝不构建 Textual 组件。

[原文]
The observed official API references are:

[译文]
参考到的官方 API 文档:

[原文]
- <https://docs.ollama.com/api/openai-compatibility>
- <https://docs.ollama.com/api/tags>
- <https://docs.ollama.com/api/ps>

[译文]
- <https://docs.ollama.com/api/openai-compatibility>
- <https://docs.ollama.com/api/tags>
- <https://docs.ollama.com/api/ps>

[原文]
The spike deliberately does not promise native Ollama model management. It
only validates that an adapter with separate discovery/status endpoints fits the
provider-neutral contracts.

[译文]
该 spike 有意不承诺原生的 Ollama 模型管理。它只是验证:一个拥有独立发现/状态端点的适配器能够契合这些 provider 无关的契约。

## 生命周期与安全决策(Lifecycle and security decisions)

[原文]
Registries remain generation-local. Retirement invalidates source/layer tokens,
cancels owned work once, waits only through the documented bounded cancellation
window, and keeps a still-running callback supervised until it finishes. A late
callback cannot publish into a replacement generation. A prepared runtime owns
its provider and backend resources; a failed candidate closes only its own
resources, and final close is idempotent.

[译文]
注册表保持代际本地。退役会使来源/层令牌失效,对持有的工作只取消一次,只等待文档规定的有界取消窗口,并让仍在运行的回调继续处于监督之下直到结束。迟到的回调无法向替代代际发布内容。已准备的运行时持有自己的 provider 与后端资源;失败的候选只关闭自己的资源,且最终 close 是幂等的。

[原文]
Built-in llama.cpp state is user-level, versioned, locked, private, and
atomically replaced. It stores only normalized endpoints, exact model IDs,
allowlisted metadata, a selected reference, and a timestamp. API keys remain in
the credential store or environment. The old `llama-cpp` catalog provider is
not migrated or overwritten, and Ollama remains a documented custom-provider
option rather than a shipped backend.

[译文]
内置 llama.cpp 状态是用户级的、带版本的、加锁的、私有的,并原子替换。它只保存归一化端点、精确模型 ID、白名单内的元数据、所选引用与时间戳。API key 仍留在凭据存储或环境变量中。旧的 `llama-cpp` 目录 provider 不会被迁移或覆盖,而 Ollama 仍然是文档中记载的自定义 provider 选项,而不是随包交付的后端。

[原文]
No Phase 7 router mutations are included. There is no production Ollama
backend, Hugging Face search/download, llama.cpp load/unload implementation, or
implicit model-file operation in this phase.

[译文]
本阶段不包含 Phase 7 的 router 变更。没有生产级 Ollama 后端、Hugging Face 搜索/下载、llama.cpp 加载/卸载实现,也没有隐式的模型文件操作。

## 迁移指引(Migration guidance)

[原文]
Existing manually configured OpenAI-compatible local providers continue to
work. To move a llama.cpp setup to the built-in integration:

[译文]
既有的、手动配置的 OpenAI 兼容本地 provider 继续可用。要把 llama.cpp 配置迁移到内置集成:

[原文]
1. Start the server independently.
2. Open `/local`, choose and confirm the recommended llama.cpp backend, and
   enter the endpoint and optional key.
3. Use the exact model ID returned by `/v1/models` in `/model` or with
   `--provider llama.cpp --model <id>`.
4. Remove an old `llama-cpp` catalog entry only after the new session works.

[译文]
1. 独立启动服务器。
2. 打开 `/local`,选择并确认推荐的 llama.cpp 后端,然后输入端点与可选密钥。
3. 在 `/model` 中使用 `/v1/models` 返回的精确模型 ID,或用 `--provider llama.cpp --model <id>`。
4. 只有在新会话可用之后,才移除旧的 `llama-cpp` 目录条目。

[原文]
Tau does not copy old fake keys, fake model IDs, catalog definitions, project
settings, or environment endpoints into the built-in state. Reset removes only
built-in settings; server processes and model files are never touched.

[译文]
Tau 不会把旧的假密钥、假模型 ID、目录定义、项目设置或环境端点复制进内置状态。Reset 只移除内置设置;服务器进程与模型文件永远不会被触碰。

## 验证(Verification)

```bash
uv run pytest tests/test_local_backends.py tests/test_extension_providers.py \
  tests/test_llama_cpp_extension.py tests/test_phase6_hardening.py \
  tests/test_ollama_adapter_spike.py -q
uv run ruff check .
uv run ruff format --check .
uv run mypy
```
