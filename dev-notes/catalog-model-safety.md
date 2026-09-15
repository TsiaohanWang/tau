# 安全地添加目录模型 / Adding catalog models safely

[原文]
Tau's built-in provider catalog (`src/tau_coding/data/catalog.toml`) is user-facing configuration: it drives `/login`, provider setup, model pickers, context-window checks, cost display, and thinking-mode request payloads. Treat catalog changes like runtime behavior changes, not just data updates.

[译文]
Tau 的内置 provider 目录(`src/tau_coding/data/catalog.toml`)是面向用户的配置:它驱动 `/login`、provider setup、模型选择器、上下文窗口检查、成本显示以及 thinking 模式的请求载荷。请把目录变更当作运行时行为变更来对待,而不只是数据更新。

## 检查清单(Checklist)

[原文]
1. **Use provider-owned identifiers.** Copy model IDs from the provider's API or official docs. Do not infer IDs from another router unless the new provider documents the same ID.
2. **Verify endpoint shape.** Confirm the provider kind and API transport (`openai-completions`, `openai-responses`, Anthropic, Google, etc.) match a request that Tau can actually send.
3. **Keep metadata internally consistent.** Every model in `models` should have matching entries in `context_windows` and, when practical, `model_metadata`. `default_model` must be in `models`.
4. **Be conservative with limits.** Set `context_window` and `max_tokens` from provider docs, live `/models` metadata, or a model card. If sources conflict, prefer the lower safe value and mention the source in the PR.
5. **Do not guess thinking support.** Only add `thinking_levels`, `thinking_parameter`, `reasoning = true`, or `thinking_level_map` when the provider/model accepts those request fields. Mark unsupported levels with `unsupported_thinking_levels` rather than exposing modes that will fail at runtime.
6. **Be explicit about pricing.** Use current provider pricing when billing is metered. Use zero-cost entries only for genuinely free developer endpoints or free-tier router models, and call that out in the PR.
7. **Check model capabilities.** Set `input = ["text"]` or `input = ["text", "image"]` based on the provider's supported payloads for that exact model.
8. **Avoid undocumented compatibility flags.** Add `compat`, `headers`, or per-model `api` overrides only when needed for Tau's transport layer and cover them with tests.
9. **Update user docs for new built-ins.** If a new provider becomes available through `/login`, update the providers guide under `website/content/guides/`.
10. **Add focused tests.** Extend provider-order tests and add or update a golden-entry test that covers the risky fields: `api`, model order, default model, context windows, thinking fields, and representative model metadata.

[译文]
1. **使用 provider 自己拥有的标识符。** 从 provider 的 API 或官方文档复制模型 ID。不要从另一个路由器推断 ID,除非新 provider 文档说明是同一个 ID。
2. **验证端点形态。** 确认 provider kind 与 API 传输(`openai-completions`、`openai-responses`、Anthropic、Google 等)匹配 Tau 实际能够发送的请求。
3. **保持元数据内部一致。** `models` 中的每个模型都应在 `context_windows` 中有对应条目,并在可行时也在 `model_metadata` 中。`default_model` 必须在 `models` 中。
4. **对上限保持保守。** 依据 provider 文档、实时 `/models` 元数据或模型卡来设置 `context_window` 与 `max_tokens`。若来源冲突,优先采用更低的保守值,并在 PR 中注明来源。
5. **不要猜测 thinking 支持。** 只有当 provider/模型接受那些请求字段时,才添加 `thinking_levels`、`thinking_parameter`、`reasoning = true` 或 `thinking_level_map`。用 `unsupported_thinking_levels` 标记不受支持的等级,而不是暴露会在运行时失败的模式。
6. **对定价保持明确。** 计费按量时使用 provider 当前定价。只有在真正免费的开发者端点或免费层路由器模型上才使用零成本条目,并在 PR 中说明。
7. **检查模型能力。** 依据 provider 对该确切模型支持的载荷,设置 `input = ["text"]` 或 `input = ["text", "image"]`。
8. **避免未文档化的兼容性开关。** 只有在 Tau 的传输层需要时才添加 `compat`、`headers` 或按模型的 `api` 覆盖,并为它们补上测试。
9. **为新的内置项更新用户文档。** 如果某个新 provider 可以通过 `/login` 使用,请更新 `website/content/guides/` 下的 provider 指南。
10. **添加聚焦测试。** 扩展 provider 顺序测试,并新增或更新覆盖风险字段的黄金条目测试:`api`、模型顺序、默认模型、上下文窗口、thinking 字段,以及有代表性的模型元数据。

## 验证命令(Validation commands)

[原文]
Run targeted checks through `uv` from the repo root:

[译文]
在仓库根目录通过 `uv` 运行针对性检查:

```bash
uv run pytest tests/test_provider_catalog.py tests/test_provider_config.py -q
uv run ruff check src/tau_coding/data/catalog.toml tests/test_provider_catalog.py tests/test_provider_config.py
```

[原文]
For larger catalog changes, also parse the whole built-in catalog and inspect the changed entry:

[译文]
对于较大的目录变更,还要解析整个内置目录并检查被改动的条目:

```bash
uv run python - <<'PY'
from tau_coding.catalog_loader import builtin_catalog
entry = next(e for e in builtin_catalog() if e.name == "provider-name")
print(entry)
PY
```

[原文]
If the provider offers a safe unauthenticated or credentialed smoke test and credentials are available, note the exact request or command in the PR. Do not commit credentials, generated local config, or live-test artifacts.

[译文]
如果该 provider 提供了安全的免认证或有凭据冒烟测试,并且手边有凭据,请在 PR 中记录确切的请求或命令。不要提交凭据、生成的本地配置或真实测试产物。
