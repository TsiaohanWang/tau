# Phase 5:内置 llama.cpp 连接与推理 / Phase 5: built-in llama.cpp connection and inference

[原文]
Phase 5 adds a useful first local-inference path without adding llama.cpp
branches to the agent harness or implementing router mutations.

[译文]
Phase 5 加入了一条真正可用的首条本地推理路径,同时没有向 agent harness 添加 llama.cpp 分支,也没有实现 router 变更。

## 变更内容(What changed)

[原文]
- `llama.cpp` is declared as a trusted, hidden built-in extension.
- The extension registers a dormant dynamic provider and a generic `/local`
  backend through the normal extension contracts.
- `/local` configures a normalized server endpoint, optional API key, status,
  refresh, Doctor, and safe reset.
- `/v1/models` discovery publishes exact server model IDs and only allowlisted
  metadata. Unknown context, output, reasoning, modality, pricing, and tool
  compatibility remain unknown.
- The existing OpenAI-compatible streaming provider is reused with an explicit
  local API choice, so IDs resembling `gpt-*` or `codex-*` do not select a
  first-party endpoint.
- Print and TUI explicit startup use the shared staged preparation path. A
  cached snapshot can keep an explicit local startup usable while the server is
  down; local inference is never an implicit ordinary-provider fallback.
- State is stored in the locked, private,
  `~/.tau/state/extensions/llama.cpp.json` integration file. Keys remain in the
  credential store or `LLAMA_API_KEY`, and no fake key is synthesized.
- Existing user `llama-cpp` catalog providers remain separate from built-in
  `llama.cpp`.

[译文]
- `llama.cpp` 被声明为一个受信、隐藏的内置扩展。
- 该扩展通过常规扩展契约注册一个休眠的动态 provider 与一个通用的 `/local` 后端。
- `/local` 可配置归一化服务器端点、可选 API key、状态、刷新、Doctor 与安全重置。
- `/v1/models` 发现会公布服务器上确切的模型 ID,且只公布白名单内的元数据。未知的上下文、输出、推理、模态、定价与工具兼容性仍保持未知。
- 复用既有的 OpenAI 兼容流式 provider,并显式选择本地 API,因此形似 `gpt-*` 或 `codex-*` 的 ID 不会选中第一方端点。
- Print 与 TUI 的显式启动使用共享的暂存式准备路径。服务器宕机时,缓存快照可以让一次显式的本地启动仍然可用;本地推理永远不会成为隐式的普通 provider 回退。
- 状态存放在加锁、私有的 `~/.tau/state/extensions/llama.cpp.json` 集成文件中。密钥仍留在凭据存储或 `LLAMA_API_KEY` 中,不会合成假密钥。
- 既有的用户 `llama-cpp` 目录 provider 仍与内置 `llama.cpp` 分离。

## 为什么这与 Pi 对应(Why this maps to Pi)

[原文]
Pi treats built-in integrations as product extensions that register provider
objects and own protocol-specific behavior. Tau follows that separation while
keeping its reusable layers independent:

```text
tau_ai       OpenAI-compatible transport and streaming
tau_agent    portable harness, tools, events, sessions
tau_coding   trusted extension, provider overlays, /local, state, TUI/CLI
```

[译文]
Pi 把内置集成视为产品扩展:它们注册 provider 对象并持有协议特有行为。Tau 遵循这种分离,同时保持其可复用层独立:

```text
tau_ai       OpenAI 兼容传输与流式处理
tau_agent    可移植 harness、工具、事件、会话
tau_coding   受信扩展、provider 叠加层、/local、状态、TUI/CLI
```

[原文]
The extension owns URL parsing, `/health`, `/v1/models`, authentication
precedence, safe snapshot conversion, diagnostics, Doctor probes, and reset.
The generic registry owns source/generation lifetime and snapshot publication.
The TUI owns field rendering, confirmation, cancellation, and idle checks.

[译文]
扩展持有 URL 解析、`/health`、`/v1/models`、认证优先级、安全快照转换、诊断、Doctor 探测与重置。通用注册表持有来源/代际生命周期与快照发布。TUI 持有字段渲染、确认、取消与空闲检查。

[原文]
The accepted plan's later router phase is intentionally not included here:
there are no load, unload, Hugging Face search/download, or implicit model-file
mutations in this implementation.

[译文]
已采纳计划中更靠后的 router 阶段有意不包含在这里:本次实现没有加载、卸载、Hugging Face 搜索/下载,也没有隐式的模型文件变更。

## 失败安全(Failure safety)

[原文]
Configuration writes a generation-specific credential before committing the safe
state reference. If state commit fails, the old configuration stays active and
the new credential is deleted or reported as an integration-owned orphan. After
a successful commit, failure to delete the old credential reports cleanup while
leaving the new configuration usable. Reset removes safe state first and treats
credential deletion as a separate confirmation.

[译文]
配置会先写入一个代际特有的凭据,再提交安全状态引用。如果状态提交失败,旧配置保持活动,新凭据会被删除或报告为集成拥有的孤儿。提交成功之后,若旧凭据删除失败,则报告清理问题,同时让新配置保持可用。Reset 先移除安全状态,并把凭据删除当作单独的确认步骤。

[原文]
Refresh publishes a complete snapshot only after defensive parsing. Timeout,
HTTP failure, cancellation, malformed data, and endpoint downtime retain the
last safe snapshot and produce bounded diagnostics. If a refreshed catalog loses
the active model, the current runtime remains usable and the local status is
stale; Tau does not silently select the remaining model.

[译文]
刷新只在防御式解析之后发布完整快照。超时、HTTP 失败、取消、畸形数据与端点宕机都会保留最后的安全快照,并产生有界诊断。如果刷新后的目录不再包含活动模型,当前运行时保持可用,本地状态被标记为陈旧;Tau 不会静默选择剩下的那个模型。

## 如何测试(How to test)

[原文]
The deterministic suite uses `httpx.MockTransport` and fake credential/state
stores. It covers endpoint safety, auth headers, cache/offline behavior,
malformed discovery, metadata allowlisting, stale model handling, atomic state
writes, orphan cleanup, reset, Doctor, real runtime registration, generation
retirement, and explicit print/TUI startup:

[译文]
确定性套件使用 `httpx.MockTransport` 与假的凭据/状态存储。它覆盖端点安全、认证头、缓存/离线行为、畸形发现、元数据白名单、陈旧模型处理、原子状态写入、孤儿清理、重置、Doctor、真实运行时注册、代际退役,以及显式的 print/TUI 启动:

```bash
uv run pytest tests/test_llama_cpp_extension.py -q
uv run pytest tests/test_local_backends.py tests/test_tui_local_backends.py -q
```

[原文]
For a manual smoke test, start a tool-capable llama.cpp server, configure
`/local`, choose the discovered ID in `/model`, run Doctor, and then try:

[译文]
手动冒烟测试:启动一个支持工具的 llama.cpp 服务器,配置 `/local`,在 `/model` 中选择发现到的 ID,运行 Doctor,然后尝试:

```bash
tau --provider llama.cpp --model <model-id> --print "summarize this project"
```

[原文]
Stop the server after setup and repeat the explicit startup to verify the safe
snapshot path. Never put real API keys or private model endpoints in tests,
session exports, or documentation.

[译文]
setup 之后停止服务器,并重复该显式启动,以验证安全快照路径。绝不要把真实 API key 或私有模型端点放进测试、会话导出或文档中。
