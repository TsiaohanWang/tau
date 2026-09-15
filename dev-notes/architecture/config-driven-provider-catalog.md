---
title: "Config-driven provider catalog / 配置驱动的 Provider 目录"
---

[原文]
Issue: https://github.com/huggingface/tau/issues/238

[译文]
Issue:https://github.com/huggingface/tau/issues/238

## 变更内容(What changed)

[原文]
Tau's built-in provider catalog is now data-driven. Provider and model metadata
lives in:

[译文]
Tau 的内置 provider 目录现在是数据驱动的。Provider 与模型元数据位于:

```text
src/tau_coding/data/catalog.toml
```

[原文]
At runtime, Tau can also overlay a user catalog:

[译文]
运行时,Tau 还可以叠加一份用户目录:

```text
~/.tau/catalog.toml
```

[原文]
The overlay is optional. It can add a new provider or partially override a
built-in provider.

[译文]
这份叠加层是可选的。它可以新增一个 provider,或部分覆盖某个内置 provider。

[原文]
Provider runtime preferences remain separate in:

[译文]
Provider 的运行时偏好则单独保存在:

```text
~/.tau/providers.json
```

[原文]
That file now stores references/preferences such as the default provider,
per-provider default model, headers, timeout/retry settings, and scoped models.
It does not need to duplicate provider definitions.

[译文]
该文件现在存放引用/偏好,例如默认 provider、按 provider 的默认模型、headers、超时/重试设置与 scoped 模型。它不必重复 provider 定义。

## 为什么需要它(Why it exists)

[原文]
Before this change, adding a provider or updating a model list required editing
Python source. That made provider support PR-driven even when the change was only
metadata. Moving the catalog to TOML keeps the source code focused on validation
and runtime behavior while making provider additions small and reviewable.

[译文]
在这次变更之前,新增一个 provider 或更新模型列表都需要修改 Python 源码。即使改动只是元数据,provider 支持也被迫走 PR 流程。把目录迁移到 TOML 之后,源码可以专注于校验与运行时行为,而 provider 的新增变得小而易于评审。

## 架构边界(Architecture boundary)

[原文]
The implementation stays in `tau_coding` because catalog loading uses Tau home
paths and application-specific provider preferences. The reusable `tau_agent`
harness still receives only a ready model provider and model name. The `tau_ai`
layer remains focused on provider-neutral runtime adapters.

[译文]
实现留在 `tau_coding`,因为目录加载会使用 Tau 主目录路径与应用特有的 provider 偏好。可复用的 `tau_agent` harness 仍然只接收一个就绪的模型 provider 与模型名。`tau_ai` 层继续专注于 provider 无关的运行时适配器。

[原文]
The public compatibility surface remains `ProviderCatalogEntry` in
`tau_coding.provider_catalog`. TOML parsing, validation, and overlay behavior
live in `tau_coding.catalog_loader`.

[译文]
公开的兼容接口仍是 `tau_coding.provider_catalog` 中的 `ProviderCatalogEntry`。TOML 解析、校验与叠加行为位于 `tau_coding.catalog_loader`。

## 目录形态(Catalog shape)

```toml
schema_version = 1

[[providers]]
name = "local-gateway"
display_name = "Local Gateway"
kind = "openai-compatible"
base_url = "http://localhost:11434/v1"
api_key_env = "LOCAL_GATEWAY_API_KEY"
credential_name = "local-gateway"
models = ["qwen-coder"]
default_model = "qwen-coder"
docs_url = "https://example.test/local-gateway"

[providers.context_windows]
qwen-coder = 64000
```

[原文]
Supported `kind` values are `openai-compatible`, `anthropic`, and
`openai-codex`. For user-defined providers, `openai-compatible` is the intended
first path.

[译文]
受支持的 `kind` 取值有 `openai-compatible`、`anthropic` 与 `openai-codex`。对于用户自定义 provider,`openai-compatible` 是推荐的首选路径。

## 叠加行为(Overlay behavior)

[原文]
When `~/.tau/catalog.toml` defines a provider with the same `name` as a built-in
provider:

[译文]
当 `~/.tau/catalog.toml` 定义的 provider 与某个内置 provider 同名时:

[原文]
- scalar fields replace built-in values
- `models` are merged with user models first
- `context_windows` are merged
- thinking fields replace as a group when `thinking_levels` is present

[译文]
- 标量字段替换内置值
- `models` 合并,且用户模型排在前面
- `context_windows` 合并
- 当 `thinking_levels` 存在时,thinking 相关字段作为一组整体替换

[原文]
Tau intentionally supports only a user-level catalog overlay in this phase. It
does not read project-local catalog files, so cloning a repository cannot
silently redirect a built-in provider's `base_url`.

[译文]
本阶段 Tau 有意只支持用户级目录叠加。它不读取项目本地的目录文件,因此克隆一个仓库不会悄悄把内置 provider 的 `base_url` 重定向到别处。

## 运行时偏好(Runtime preferences)

[原文]
`~/.tau/providers.json` intentionally stores runtime preferences, not provider
metadata:

[译文]
`~/.tau/providers.json` 有意只存放运行时偏好,而不是 provider 元数据:

```json
{
  "default_provider": "local-gateway",
  "provider_preferences": {
    "local-gateway": {
      "default_model": "qwen-coder",
      "headers": {},
      "timeout_seconds": 60,
      "max_retries": 2,
      "max_retry_delay_seconds": 1
    }
  },
  "scoped_models": []
}
```

[原文]
Older `providers.json` files with full `providers` entries are still accepted.
When Tau saves settings again, custom provider definitions are written to
`~/.tau/catalog.toml` and `providers.json` is rewritten to the preference-only
shape.

[译文]
带有完整 `providers` 条目的旧版 `providers.json` 仍然被接受。当 Tau 再次保存设置时,自定义 provider 定义会被写入 `~/.tau/catalog.toml`,而 `providers.json` 会被重写为仅含偏好的形态。

## 校验(Validation)

[原文]
Catalog files fail early with `CatalogError`. Tau rejects unknown keys, empty
required strings, empty model names, unsupported provider kinds, default models
that are not listed in `models`, `thinking_models` or `context_windows` entries
for unknown models, and non-positive or non-integer context-window values.

[译文]
目录文件会以 `CatalogError` 尽早失败。Tau 会拒绝:未知键、必填字符串为空、模型名为空、不受支持的 provider kind、未列入 `models` 的默认模型、为未知模型指定 `thinking_models` 或 `context_windows` 条目,以及非正数或非整数的上下文窗口值。

## 如何测试(How to test)

```bash
uv run pytest tests/test_provider_catalog.py
uv run pytest tests/test_provider_config.py
uv run ruff check .
uv run mypy
```

[原文]
The catalog tests cover built-in loading, packaged-resource access, user-defined
providers, built-in overlays, invalid catalogs, and integration with
`ProviderSettings` when `providers.json` already exists.

[译文]
目录测试覆盖:内置加载、打包资源访问、用户自定义 provider、内置覆盖、非法目录,以及在 `providers.json` 已存在时与 `ProviderSettings` 的集成。
