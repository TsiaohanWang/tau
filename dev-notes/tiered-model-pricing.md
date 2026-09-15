# 分层模型定价 / Tiered model pricing

[原文]
Tau's catalog originally stored one flat `cost` mapping per model. That works for most providers, but MiniMax-M3 doubles its standard rates when input grows beyond 512,000 tokens while supporting a one-million-token context window.

[译文]
Tau 的目录最初为每个模型只存一份扁平的 `cost` 映射。这对大多数 provider 都够用,但 MiniMax-M3 在输入超过 512,000 token 时会把标准费率翻倍,同时支持一百万 token 的上下文窗口。

[原文]
Issue #364 adds optional ordered `cost_tiers` to `ModelCatalogMetadata`. Each tier contains the same per-million-token rate fields as `cost` and may set an inclusive `max_input_tokens`. Limits must increase, and the final tier is unbounded. The existing flat `cost` remains the base rate for backward compatibility.

[译文]
Issue #364 为 `ModelCatalogMetadata` 增加了可选的有序 `cost_tiers`。每一层包含与 `cost` 相同的「每百万 token」费率字段,并可以设置一个包含式的 `max_input_tokens`。上限必须递增,且最后一层无上限。既有的扁平 `cost` 作为向后兼容的基础费率保留。

[原文]
`model_cost_for_input_tokens()` resolves the first tier that includes a given input-token count. Catalog loading, user overlays, TOML serialization, and runtime provider metadata preserve the tiers. MiniMax-M3 now records both its `<=512k` and `>512k` standard rates.

[译文]
`model_cost_for_input_tokens()` 会解析出第一个包含给定输入 token 数的层。目录加载、用户叠加、TOML 序列化与运行时 provider 元数据都会保留这些层。MiniMax-M3 现在同时记录其 `<=512k` 与 `>512k` 两档标准费率。

[原文]
Validate with:

[译文]
验证方式:

```bash
uv run pytest tests/test_provider_catalog.py tests/test_provider_config.py
uv run ruff check .
uv run mypy
```
