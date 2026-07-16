---
title: tau_coding · Provider 配置
description: provider_catalog / provider_config / provider_runtime
---

## `tau_coding/provider_catalog.py` — the built-in provider catalog

This file defines the *static* description of providers Tau knows about out of
the box (their names, base URLs, auth env vars, models, thinking levels,
cost tiers). It is data, not behavior.

### Type aliases

- `ProviderKind` — `"openai-compatible" | "anthropic" | "openai-codex" |
  "google-generative-ai" | "mistral-conversations"`.
- `ProviderApi` — the wire protocol: `"openai-completions"`,
  `"openai-responses"`, `"anthropic-messages"`, `"openai-codex-responses"`,
  `"google-generative-ai"`, `"mistral-conversations"`.
- `ModelInput` — `"text" | "image"`.
- `ThinkingLevelMap` — `dict[ThinkingLevel, str | None]`: maps a thinking level
  to the provider-specific wire value (or `None` if unsupported).
- `AuthMethod` — `"api_key" | "oauth"`.

### `ModelCostTier` (frozen)

A cost row that applies up to an optional `max_input_tokens` limit. The last
tier in a sequence must omit `max_input_tokens` (a sentinel meaning "and
above"). Used for token-count-dependent pricing.

### `ModelCatalogMetadata` (frozen)

Per-model catalog data: `name`, `api`, `base_url`, `reasoning`, `input`,
`cost`, `cost_tiers`, `context_window`, `max_tokens`, `headers`, `compat`, and
`thinking_level_map`. This is the *catalog* counterpart to the runtime
`ProviderModelMetadata` in `provider_config.py`.

### `model_cost_for_input_tokens(metadata, input_tokens)`

Returns the rate dict for a given input size. It walks `cost_tiers` in order;
the first tier whose `max_input_tokens` is `None` or `>= input_tokens` wins.
Falls back to the flat `cost`. Raises `ValueError` on a bad token count.

### `ProviderCatalogEntry` (frozen)

One built-in provider Tau can present during login/setup:

- `name`, `display_name`, `kind`, `base_url`, `api_key_env`,
  `credential_name`, `models`, `default_model`, `docs_url`.
- Optional: `api`, `context_windows`, `headers`, `compat`,
  `model_metadata`, `thinking_levels`, `thinking_models`,
  `thinking_default`, `thinking_parameter`, `auth_methods`.

This is the *catalog* counterpart to the durable `ProviderConfig` dataclasses
in `provider_config.py`.

### `BUILTIN_PROVIDER_CATALOG` and `_load_builtin_catalog()`

`_load_builtin_catalog()` lazily imports `builtin_catalog` from
`tau_coding.catalog_loader` (avoiding a circular import, since
`catalog_loader` imports `ProviderCatalogEntry` from this module). The result
is frozen into `BUILTIN_PROVIDER_CATALOG` at import time.

### `builtin_provider_entry(name)`

Linear lookup of a catalog entry by provider name.

> Separation: the *catalog* (this file) is static reference data. The
> *config* (next file) is the user's durable, possibly-customized copy. The
> config module imports the catalog; the catalog never imports the config.

---

## `tau_coding/provider_config.py` — durable provider configuration

This is the largest file in the tutorial. It turns catalog data + user
preferences + environment into the durable `ProviderConfig` objects that
`provider_runtime.py` later turns into live `tau_ai` providers.

### Constants & error type

- `DEFAULT_PROVIDER_NAME = "openai"`, `DEFAULT_MODEL = "gpt-5.4"`.
- `ProviderConfigError(ValueError)` — raised for any invalid provider config.
- `CredentialReader` (Protocol) — anything with `get(name) -> str | None`,
  used to read credentials while building runtime config.

### `ProviderModelMetadata` (frozen)

The *runtime* mirror of `ModelCatalogMetadata`: per-model metadata that lives
on a durable provider config. Has a `to_json()` method for serialization.

### `OpenAICompatibleProviderConfig` / `AnthropicProviderConfig` / `OpenAICodexProviderConfig`

Three frozen dataclasses, one per provider kind. They share fields:

- identity: `name`, `base_url`, `api`, `api_key_env`, `credential_name`.
- `models`, `default_model`, `context_windows`, `headers`, `compat`,
  `model_metadata`.
- timeouts/retries: `timeout_seconds`, `max_retries`, `max_retry_delay_seconds`.
- thinking: `thinking_levels`, `thinking_models`, `thinking_default`,
  `thinking_parameter`, `thinking_defaults` (per-model remembered level).

Each has a `__post_init__` that validates numerics, context windows, model
metadata, compat JSON, and thinking configuration, and a `to_json()` for
persistence. `OpenAICodexProviderConfig` omits `model_metadata`/`compat`
because Codex is OAuth-only and its metadata is not user-editable.

### `ProviderConfig` (type alias)

`OpenAICompatibleProviderConfig | AnthropicProviderConfig | OpenAICodexProviderConfig`.

### `ScopedModelConfig` (frozen)

A `provider`+`model` pair you can pin for quick model-cycling during a session.
Stored in `ProviderSettings.scoped_models`.

### `ProviderSettings` (frozen)

The top-level durable provider preferences loaded from Tau home:

- `default_provider: str` (defaults `"openai"`).
- `providers: tuple[ProviderConfig, ...]` (defaults to all built-in configs).
- `scoped_models: tuple[ScopedModelConfig, ...]`.

- `get_provider(name=None)` — looks up by name or default; raises
  `ProviderConfigError` on unknown.
- `to_json()` — serializes preferences (default provider, per-provider
  preference overrides, scoped models).

### `ProviderSelection` (frozen)

A resolved `provider` + `model` pair for one run.

### Building configs from the catalog

- `builtin_provider_configs()` — one `ProviderConfig` per built-in catalog entry.
- `provider_config_from_catalog_entry(name)` / `provider_config_from_entry(entry)`
  — translate a `ProviderCatalogEntry` into the correct `ProviderConfig`
  subclass based on `entry.kind`. `_default_api_for_kind` maps a kind to its
  default wire API.

### Loading & saving `providers.json`

- `provider_settings_path(paths)` — `paths.home / "providers.json"`.
- `load_provider_settings(paths)` — if the file is absent, fall back to
  effective provider configs; otherwise parse JSON and then merge in the
  current catalog (`_with_builtin_catalog_models`) so newly-added catalog
  providers appear without the user editing the file.
- `save_provider_settings(settings, paths)` — atomically writes preferences,
  first persisting any custom provider *definitions* to `catalog.toml` via
  `_save_provider_definitions_to_catalog`.
- `save_default_provider_model`, `save_provider_thinking_level`,
  `toggle_saved_scoped_model`, `upsert_saved_provider` — convenience writers
  that load, mutate, and save.

### Merging & preference application

- `set_default_provider_model` / `set_provider_thinking_level` — immutable
  updates returning new `ProviderSettings`, validating the model exists and the
  thinking level is available.
- `upsert_provider` — add/replace a provider, keeping entries sorted by name;
  if replacing a built-in, it *merges* (`_merge_provider_config`) so the user's
  local customizations survive a catalog refresh.
- `_merge_provider_config` and the per-kind helpers (`_merge_openai_compatible_provider`,
  `_merge_anthropic_provider`) — keep user values (timeouts, headers,
  thinking defaults) when the incoming catalog definition would otherwise
  clobber them.
- `_with_builtin_catalog_models` / `_effective_provider_configs` /
  `_append_catalog_providers` — combine built-in and user-catalog providers;
  user-catalog providers are always appended, built-ins only when they have
  usable credentials (`provider_has_usable_credentials`).

### Parsing JSON (`provider_settings_from_json` and friends)

The file supports two on-disk shapes:

1. **New shape** — `default_provider` + `provider_preferences` (a map of
   provider name → runtime overrides like `default_model`, `headers`,
   `timeout_seconds`, `thinking_defaults`). Orphaned preferences (whose catalog
   entry was removed) are silently dropped so one stale entry can't block
   startup.
2. **Legacy shape** — a flat `providers[]` list; still parsed for migration.

`_apply_provider_preference` applies the allowed override fields onto a catalog
config via `replace`. A large family of private `_string` / `_string_tuple` /
`_optional_*` / `_validate_*` helpers enforce types and ranges at parse time so
a malformed `providers.json` fails loudly with a clear `ProviderConfigError`.

### Thinking-level resolution

A cluster of helpers decides what thinking modes a provider/model pair
supports and how a `ThinkingLevel` maps to a wire value:

- `provider_thinking_levels(provider, model=None)` — the available levels,
  honoring `reasoning`, `thinking_levels`, `thinking_models`, and the model's
  `thinking_level_map`.
- `provider_thinking_unavailable_reason(...)` — human-readable reason when no
  thinking modes exist (e.g. "not a reasoning model").
- `provider_default_thinking_level(...)` — the preferred default level.
- `_levels_from_thinking_map`, `_metadata_supports_thinking_level`,
  `_thinking_level_map_supports` — map/level math.

### Building runtime config (the `tau_ai` glue)

These are the functions `provider_runtime.py` calls:

- `openai_compatible_config_from_provider(provider, *, credential_reader,
  model, thinking_level) -> OpenAICompatibleConfig` — assembles the live
  `tau_ai.OpenAICompatibleConfig`: resolves the API key, picks the model's base
  URL (honoring `OPENAI_BASE_URL` for the default provider), computes
  `reasoning_effort` from the thinking level, derives `compat` (including
  provider-specific quirks via `_detected_compat`), and sets
  `thinking_format` / `include_reasoning_effort_none`.
- `anthropic_config_from_provider(...)` — same idea for Anthropic, computing a
  thinking budget and effort.
- `_detected_compat(provider, model)` — encodes per-vendor quirks (Together,
  Z.ai, Moonshot, Grok, DeepSeek, Cerebras, OpenRouter) as `compat` flags:
  `supportsStore`, `supportsReasoningEffort`, `maxTokensField`,
  `thinkingFormat`, `supportsStrictMode`, etc.
- `provider_kind`, `provider_has_usable_credentials`, `_api_key_from_provider`,
  `_provider_api`, `_model_base_url`, `_model_headers`, `_model_compat`,
  `_model_max_tokens` — small accessors that consult both provider-level and
  model-level metadata, with sensible fallbacks.

> The takeaway: `provider_config.py` is a *translation layer*. It never talks
> to a model; it only produces the typed `tau_ai` config objects that
> `provider_runtime.py` hands to `tau_ai`'s providers.

---

## `tau_coding/provider_runtime.py` — live provider construction

This file turns a durable `ProviderConfig` into an actual `tau_ai`
`ModelProvider` instance, wiring up credentials and OAuth refresh.

### `ClosableModelProvider` (Protocol)

`ModelProvider` plus an async `aclose()` — Tau owns the provider and must be
able to release its resources at the end of a run.

### `create_model_provider(provider, *, credential_store, model, thinking_level)`

The main factory. It:

1. Validates the model against the provider.
2. Loads `FileCredentialStore` (or a default).
3. Branches on provider type:
   - **Anthropic** — builds an `AnthropicConfig`. If an OAuth credential exists,
     it calls the OAuth provider's `runtime_auth` to inject the live API key,
     bearer auth, extra headers, a system prompt, and a
     `OAuthRuntimeCredentialResolver` that refreshes the token per request.
     Returns `AnthropicProvider`.
   - **OpenAI Codex** — returns `OpenAICodexProvider` with an
     `OpenAICodexCredentialResolver` and an optional `reasoning_effort`.
   - **OpenAI-compatible** — builds an `OpenAICompatibleConfig`. If the selected
     `api` is `anthropic-messages`/`google-generative-ai`/`mistral-conversations`,
     it returns the matching specialized provider; otherwise a plain
     `OpenAICompatibleProvider`. OAuth credentials are injected the same way as
     Anthropic.
4. Raises `ProviderConfigError` for unsupported configs / missing OAuth.

### `OpenAICodexCredentialResolver`

Callable that returns `OpenAICodexCredentials` (access token + account id) for
each request:

- Reads the OAuth credential by name; refreshes it if expired.
- Falls back to the `api_key_env` env var (which must be a Codex access JWT; it
  extracts `account_id` from the JWT).
- Raises a clear "run /login" error if neither is present.

### `OAuthRuntimeCredentialResolver`

Provider-neutral resolver used for Anthropic-style OAuth providers. On each
call it reads the OAuth credential, refreshes it (persisting the refreshed
copy), asks the OAuth provider for runtime auth, and returns
`RuntimeProviderAuth(api_key, base_url, headers)`.

### Helpers

- `_codex_reasoning_effort(...)` — maps a `ThinkingLevel` to a Codex
  reasoning-effort string (`off` → `None`, `minimal` → `"low"`, else the
  normalized effort).
- `_oauth_credential(provider, store)` — fetches the OAuth credential if the
  provider has one registered.
- `_required_oauth_provider(name)` — returns the registered `OAuthProvider`,
  raising if none.

> This file is where Tau *finally* calls into `tau_ai`. Everything above it is
> data translation; this file produces the object the agent loop actually
> streams from.

---

---

## 逐方法深层剖析（provider_config.py）

> 以下对 provider 配置的数据模型、磁盘持久化、合并与解析逻辑做逐方法展开。

## ProviderSettings / ProviderSelection

### class ProviderSettings
`ProviderSettings` 是持久化 provider 设置的核心数据类(`@dataclass(frozen=True, slots=True)`),从 Tau home 加载。字段:`default_provider: str = DEFAULT_PROVIDER_NAME`(默认 `"openai"`)、`providers: tuple[ProviderConfig, ...]`(默认工厂 `lambda: builtin_provider_configs()`)、`scoped_models: tuple[ScopedModelConfig, ...] = ()`(用于快速模型切换的 provider/model 对)。它是不可变快照,任何修改都通过 `dataclasses.replace` 产生新实例。

### get_provider(self, name: str | None = None) -> ProviderConfig
按名称返回已配置的 provider。作用:从 `providers` 元组中找到 `provider.name == (name or self.default_provider)` 的实例;若遍历完未命中,抛 `ProviderConfigError(f"Unknown provider: {target}")`。注意它只匹配内置/已注册名称,不在此处做 overlay 合并。

### to_json(self) -> dict[str, Any]
将运行时偏好序列化为 JSON 兼容 dict。结构:`default_provider` 原样输出;`provider_preferences` 是一个 `{provider.name: _provider_preference_to_json(provider)}` 的映射(只含运行时可覆盖字段,不含 provider 定义);`scoped_models` 是 `[model.to_json() for model in self.scoped_models]` 列表。`to_json` 仅写出偏好,provider 定义本身由 save 流程写入 catalog.toml。

### class ProviderSelection
`@dataclass(frozen=True, slots=True)`,表示一次 Tau 运行解析出的 provider/model 选择。仅两个字段:`provider: ProviderConfig`(完整的 provider 配置)与 `model: str`(被选中的模型名)。由 `resolve_provider_selection` 构造,是编码/运行阶段的输入。

---

## ProviderConfigError / CredentialReader / ProviderModelMetadata

### class ProviderConfigError(ValueError)
配置非法时抛出的异常,继承 `ValueError`。用于所有 provider 配置校验失败(文件读取、字段校验、thinking 不可用等)。

### class CredentialReader(Protocol)
凭据读取协议,定义构建运行时 provider 配置时的凭据查找接口。仅声明一个方法 `def get(self, name: str) -> str | None: ...`,由 `FileCredentialStore` 等实现;代码还会用 `getattr(credential_reader, "get_oauth", None)` 探测可选的 OAuth 读取能力。

### class ProviderModelMetadata
`@dataclass(frozen=True, slots=True)`,描述单个已配置模型的运行时元数据。字段:`name: str | None`、`api: ProviderApi | None`、`base_url: str | None`、`reasoning: bool | None`、`input: tuple[str, ...] = ()`、`cost: dict[str, float]`(默认工厂)、`cost_tiers: tuple[ModelCostTier, ...] = ()`、`context_window: int | None`、`max_tokens: int | None`、`headers: dict[str, str]`(默认工厂)、`compat: dict[str, Any]`(默认工厂)、`thinking_level_map: dict[ThinkingLevel, str | None]`(默认工厂,key 为 thinking 级别、value 为 wire 字符串或 None 表示该级别不可用)。这是 per-model 覆盖的基础单元。

### to_json(self) -> dict[str, Any]
将模型元数据序列化为 JSON 兼容 dict。逐字段输出;`input` 转 `list(self.input)`;`cost` 转 `dict`;`cost_tiers` 转列表,每个 tier 展开为 `max_input_tokens`(若非 None)与 `tier.cost` 合并的 dict;`thinking_level_map` 转 `dict`。用于 `OpenAICompatibleProviderConfig.to_json` / `AnthropicProviderConfig.to_json` 的 `model_metadata` 子对象。

### type ProviderConfig
类型别名:`OpenAICompatibleProviderConfig | AnthropicProviderConfig | OpenAICodexProviderConfig`,贯穿全模块的类型标注。

---

## OpenAICompatibleProviderConfig

### class OpenAICompatibleProviderConfig
`@dataclass(frozen=True, slots=True)`,表示一个 OpenAI 兼容 provider 的持久化设置。字段:`name: str`(必填)、`base_url: str = DEFAULT_OPENAI_COMPATIBLE_BASE_URL`、`api: ProviderApi = "openai-completions"`、`api_key_env: str = "OPENAI_API_KEY"`、`credential_name: str | None = None`、`models: tuple[str, ...] = (DEFAULT_MODEL,)`、`default_model: str = DEFAULT_MODEL`、`context_windows: dict[str, int]`(默认工厂)、`headers: dict[str, str]`(默认工厂)、`compat: dict[str, Any]`(默认工厂)、`model_metadata: dict[str, ProviderModelMetadata]`(默认工厂)、超时/重试三组 `timeout_seconds`/`max_retries`/`max_retry_delay_seconds`(带默认值)、thinking 相关 `thinking_levels: tuple[ThinkingLevel, ...] | None`、`thinking_models: tuple[str, ...] = ()`、`thinking_default: ThinkingLevel | None`、`thinking_parameter: ThinkingParameter | None`、`thinking_defaults: dict[str, ThinkingLevel]`(默认工厂)。

### __post_init__(self) -> None
构造后立即校验。依次调用 `_validate_provider_numbers(...)`(超时/重试必须合法)、`_validate_context_windows(self.context_windows)`、`_validate_model_metadata(self.models, self.model_metadata)`、`_validate_json_object(self.compat, "Provider compat")`、`_validate_thinking_config(thinking_levels=..., thinking_models=..., thinking_default=..., thinking_parameter=...)`、`_validate_thinking_defaults(self.thinking_defaults)`。任何失败抛 `ProviderConfigError`。

### to_json(self) -> dict[str, Any]
序列化为带 `"type": "openai-compatible"` 的 dict。包含 name/base_url/api/api_key_env/credential_name/models(list)/default_model/context_windows/headers/compat,`model_metadata` 为 `{model: metadata.to_json()}`;`timeout_seconds`/`max_retries`/`max_retry_delay_seconds` 原样;`thinking_levels` 为 `list` 或 None;`thinking_models` 转 list;其余 thinking 字段原样;`thinking_defaults` 转 dict。

---

## AnthropicProviderConfig

### class AnthropicProviderConfig
`@dataclass(frozen=True, slots=True)`,表示 Anthropic Messages API provider 的持久化设置。默认字段:`name="anthropic"`、`base_url=DEFAULT_ANTHROPIC_BASE_URL`、`api="anthropic-messages"`、`api_key_env="ANTHROPIC_API_KEY"`、`credential_name="anthropic"`、`models=("claude-sonnet-4-6",)`、`default_model="claude-sonnet-4-6"`、context_windows/headers/compat/model_metadata(默认工厂)、超时重试三组、`thinking_levels | None`/`thinking_models`/`thinking_default`/`thinking_parameter`/`thinking_defaults`。与 OpenAI 兼容类的差别:无 `api` 可选(固定 messages),to_json 的 type 为 `"anthropic"`。

### __post_init__(self) -> None
同 OpenAI 兼容类,依次校验 `_validate_provider_numbers`、`_validate_context_windows`、`_validate_model_metadata`、`_validate_json_object(self.compat, "Provider compat")`、`_validate_thinking_config`、`_validate_thinking_defaults`。注意无 extra 字段差别。

### to_json(self) -> dict[str, Any]
与 `OpenAICompatibleProviderConfig.to_json` 几乎一致,仅 `"type": "anthropic"` 且包含 `api` 字段(固定 `"anthropic-messages"`)。所有字段同样序列化,`model_metadata` 走 `metadata.to_json()`。

---

## OpenAICodexProviderConfig

### class OpenAICodexProviderConfig
`@dataclass(frozen=True, slots=True)`,表示 OpenAI Codex 订阅 OAuth provider 的持久化设置。默认字段:`name="openai-codex"`、`base_url=DEFAULT_OPENAI_CODEX_BASE_URL`、`api_key_env="OPENAI_CODEX_ACCESS_TOKEN"`、`credential_name="openai-codex"`、`models`(gpt-5.5/gpt-5.4/gpt-5.4-mini/gpt-5.3-codex/gpt-5.3-codex-spark/gpt-5.2)、`default_model="gpt-5.5"`、context_windows/headers(默认工厂)、超时重试三组、thinking 相关五项。关键差异:**无 `api`/`compat`/`model_metadata` 字段**,因为 Codex 是 OAuth 订阅通道。

### __post_init__(self) -> None
校验 `_validate_provider_numbers`、`_validate_context_windows`、`_validate_thinking_config`、`_validate_thinking_defaults`。注意**不调用** `_validate_model_metadata` 与 `_validate_json_object`(因为没有 model_metadata/compat 字段)。

### to_json(self) -> dict[str, Any]
序列化为 `"type": "openai-codex"` 的 dict。字段:name/base_url/api_key_env/credential_name/models(list)/default_model/context_windows/headers/超时重试三组/thinking 五项。与另两类不同:**没有 compat、model_metadata、api 字段**。

---

## ScopedModelConfig

### class ScopedModelConfig
`@dataclass(frozen=True, slots=True)`,表示一个被启用以供快速模型循环的 provider/model 对。字段:`provider: str`、`model: str`。

### to_json(self) -> dict[str, str]
序列化为 `{"provider": self.provider, "model": self.model}`。

---

## 模块级函数

### builtin_provider_configs() -> tuple[ProviderConfig, ...]
返回 Tau 内建 provider 配置。遍历 `BUILTIN_PROVIDER_CATALOG`,对每个 entry 调用 `provider_config_from_catalog_entry(entry.name)`,结果转 tuple 返回。这是 `ProviderSettings.providers` 的默认来源。

### provider_config_from_catalog_entry(name: str) -> ProviderConfig
按名称从内建 catalog 构造 provider 配置。遍历 `BUILTIN_PROVIDER_CATALOG` 找 `entry.name == name`,找到则 `provider_config_from_entry(entry)`;否则抛 `ProviderConfigError(f"Unknown built-in provider: {name}")`。

### provider_config_from_entry(entry: ProviderCatalogEntry) -> ProviderConfig
从单个 catalog entry 构造对应的持久化 provider 配置。先 `context_windows = dict(entry.context_windows or {})`、`model_metadata = _provider_model_metadata_from_catalog(entry.model_metadata)`。按 `entry.kind` 分支:`"anthropic"` → `AnthropicProviderConfig`(api 用 `_default_api_for_kind`);`"openai-codex"` → `OpenAICodexProviderConfig`(无 compat/headers/model_metadata);其余 → `OpenAICompatibleProviderConfig`(api 用 `entry.api or _default_api_for_kind`)。所有 thinking 字段来自 entry,`thinking_defaults={}`。

### _default_api_for_kind(kind: str) -> ProviderApi
将 catalog kind 映射为默认 `ProviderApi`。分支:`anthropic`→`"anthropic-messages"`、`openai-codex`→`"openai-codex-responses"`、`google-generative-ai`→`"google-generative-ai"`、`mistral-conversations`→`"mistral-conversations"`、其他→`"openai-completions"`。

### _provider_model_metadata_from_catalog(model_metadata: dict[str, ModelCatalogMetadata]) -> dict[str, ProviderModelMetadata]
将 catalog 的 `ModelCatalogMetadata` 映射为 `ProviderModelMetadata`。对每个 model 逐字段拷贝(name/api/base_url/reasoning/input/cost/cost_tiers/context_window/max_tokens/headers/compat/thinking_level_map),`input` 转 tuple,`cost`/`headers`/`compat` 转 dict。

### default_openai_provider_config() -> OpenAICompatibleProviderConfig
返回默认 OpenAI 兼容 provider。调用 `provider_config_from_catalog_entry(DEFAULT_PROVIDER_NAME)`,并 `isinstance` 断言必须是 `OpenAICompatibleProviderConfig`,否则抛 `AssertionError`。

### provider_settings_path(paths: TauPaths | None = None) -> Path
返回持久化设置文件路径:`(paths or TauPaths()).home / "providers.json"`。

### load_provider_settings(paths: TauPaths | None = None) -> ProviderSettings
加载持久化 provider 设置,文件缺失则回退到 env 兼容的默认。流程:解析 `paths`;若 `provider_settings_path` 不存在,返回 `ProviderSettings(providers=_effective_provider_configs(resolved_paths))`(仅内建+catalog overlay,无偏好);否则 `loads(path.read_text())`,非 dict 则抛 `ProviderConfigError`;用 `provider_settings_from_json(raw, paths=...)` 解析;最后 `_with_builtin_catalog_models(settings, paths=...)` 把最新 catalog 合并进去。

### save_provider_settings(settings: ProviderSettings, paths: TauPaths | None = None) -> Path
写入持久化偏好并返回路径。流程:解析 paths;先 `_save_provider_definitions_to_catalog(settings, paths=...)`(把非 catalog 的 provider 定义写入 catalog.toml);建目录;若文件存在则 `copy2` 备份为 `.bak`;用 `_atomic_write_text` 写入 `dumps(settings.to_json(), indent=2, sort_keys=True) + "\n"`;返回 path。

### save_default_provider_model(*, provider_name, model, paths=None, fallback_settings=None) -> ProviderSettings
重载设置、持久化一个默认 provider/model 变更并返回。先 `_load_provider_settings_for_write` 载入最新;再 `set_default_provider_model(settings, provider_name=..., model=...)`;然后 `save_provider_settings` 落盘;返回更新后的 settings。

### save_provider_thinking_level(*, provider_name, model, thinking_level, paths=None, fallback_settings=None) -> ProviderSettings
重载设置、持久化一个 provider/model 的 thinking 偏好并返回。流程同 `save_default_provider_model`,中间调用 `set_provider_thinking_level(...)`。

### toggle_saved_scoped_model(*, provider_name, model, paths=None, fallback_settings=None) -> ProviderSettings
重载设置、切换一个 scoped model 的开关并持久化返回。流程:`_load_provider_settings_for_write` 载入;`settings.get_provider(provider_name)`;若 `model not in provider.models` 抛 `ProviderConfigError`;构造 `ScopedModelConfig(provider_name, model)`,若已在 `scoped_models` 中则移除否则追加;用 `replace` 生成新 settings;`save_provider_settings` 落盘;返回。

### upsert_saved_provider(provider, *, set_default=False, paths=None, fallback_settings=None) -> ProviderSettings
重载设置、upsert 一个 provider 条目、持久化并返回。先 `_load_provider_settings_for_write` 载入;再 `upsert_provider(settings, provider, set_default=...)`;然后 `save_provider_settings`;返回。

### _load_provider_settings_for_write(paths, *, fallback_settings=None) -> ProviderSettings
为写入而加载最新磁盘设置。解析 paths;若 `provider_settings_path` 存在则 `load_provider_settings`;否则若有 `fallback_settings` 用它;再否则仍调 `load_provider_settings`(走默认回退)。

### set_default_provider_model(settings, *, provider_name, model) -> ProviderSettings
返回更新了默认 provider/model 偏好的新 settings。先 `settings.get_provider(provider_name)` 取 provider;再 `validate_provider_model(provider, model)`;用 `replace(provider, default_model=model)` 替换该 provider;重组 `providers` 元组(同名项替换);构造 `ProviderSettings(default_provider=provider_name, providers=..., scoped_models=...)`。

### set_provider_thinking_level(settings, *, provider_name, model, thinking_level) -> ProviderSettings
返回为某 provider/model 记住 thinking 级别的新 settings。取 provider、`validate_provider_model`;`normalize_thinking_level` 归一化;`provider_thinking_levels(provider, model=...)` 取可用级别,若归一化值不在其中则抛 `ProviderConfigError`(列出可用模式);用 `replace` 把 `thinking_defaults={**provider.thinking_defaults, model: normalized}` 写回;重组 providers 与构造新 `ProviderSettings`(保留原 default_provider)。

### upsert_openai_compatible_provider(settings, provider, *, set_default=False) -> ProviderSettings
薄封装:直接 `return upsert_provider(settings, provider, set_default=set_default)`,用于 OpenAI 兼容 provider 的 upsert。

### upsert_provider(settings, provider, *, set_default=False) -> ProviderSettings
返回添加或替换一个 provider 的新 settings。先 `providers_by_name = {item.name: item for item in settings.providers}`、`builtin_names = {entry.name for entry in BUILTIN_PROVIDER_CATALOG}`。若 `provider.name` 同时存在于已有与内建集合,则用 `_merge_provider_config(providers_by_name[provider.name], provider)` 合并(保留本地自定义);否则直接覆盖。更新 `providers_by_name[name]`;`default_provider = provider.name if set_default else settings.default_provider`;按名称排序重建 providers 元组;构造 `ProviderSettings`(保留 scoped_models)并调用 `updated.get_provider(default_provider)` 触发未知校验。

### _with_builtin_catalog_models(settings, *, paths=None) -> ProviderSettings
把当前 provider catalog 合并进 settings(用于 load 后吸收 catalog 变更)。`catalog_configs = {config.name: config for config in _effective_provider_configs(paths)}`;对每个已有 provider,若其名在 catalog 中则 `_merge_provider_config(provider, catalog_configs[provider.name])`(catalog 为 incoming,本地为 existing,保留本地覆盖);然后 `_append_catalog_providers` 追加 catalog 中有但 settings 没有的 provider;若 `default_provider` 不在最终 providers 中则回退到 `providers[0].name` 或 `DEFAULT_PROVIDER_NAME`;构造新 `ProviderSettings`。

### _effective_provider_configs(paths: TauPaths | None = None) -> tuple[ProviderConfig, ...]
返回 effective catalog(builtin + 用户 overlay)对应的 provider 配置。即对 `effective_catalog(paths)` 中每个 entry 调 `provider_config_from_entry(entry)`,转 tuple。这是"catalog → 持久化配置"的枢纽。

### _append_catalog_providers(providers, catalog_configs, *, paths) -> tuple[ProviderConfig, ...]
把 catalog 中缺失的 provider 追加到已有列表。规则:用户 catalog 来源的 provider 总是追加;内建 provider 仅当 `provider_has_usable_credentials(provider, credential_reader=credential_store)` 为真才追加(凭据可用才显示)。用 `FileCredentialStore(credentials_path(paths))` 作凭据读取器;已存在名跳过;返回追加后的 tuple。

### _merge_provider_config(existing, incoming) -> ProviderConfig
合并替换配置而不丢失本地自定义。若 `type(existing) is not type(incoming)` 直接返回 incoming(类型不同不合并)。按类型分派:`OpenAICodexProviderConfig` 用内联 `replace` 合并;`OpenAICompatibleProviderConfig` 调 `_merge_openai_compatible_provider`;`AnthropicProviderConfig` 调 `_merge_anthropic_provider`;都不匹配返回 incoming。注意语义:**incoming 为"新/catalog 侧",existing 为"本地/旧侧",本地优先**。

### _merge_openai_compatible_provider(existing, incoming) -> OpenAICompatibleProviderConfig
具体合并 OpenAI 兼容 provider。模型列表 `models = _unique_strings((*incoming.models, *existing.models))`(incoming 在前,保序去重)。用 `replace(incoming, ...)`:`models` 如上;`default_model` 取 `existing.default_model`(若在 models 内)否则 incoming 的;`headers={**incoming.headers, **existing.headers}`(本地覆盖);`compat` 本地覆盖;`model_metadata` 用 `_merge_provider_model_metadata(incoming, existing)`;超时/重试/最大延迟**全部取 existing 的本地值**;`context_windows` 本地覆盖;`thinking_levels/models/default/parameter` 仅在 `existing.thinking_levels is not None`(即本地显式配置过)时取 existing,否则用 incoming;`thinking_defaults` 取 existing 本地。

### _merge_anthropic_provider(existing, incoming) -> AnthropicProviderConfig
与 `_merge_openai_compatible_provider` 逻辑完全一致(模型合并、default_model 选择、headers/compat/model_metadata 本地覆盖、超时重试取本地、context_windows 本地覆盖、thinking 系列仅在本地显式配置时保留、`thinking_defaults` 取本地),仅针对 `AnthropicProviderConfig` 类型。

### _merge_provider_model_metadata(incoming, existing) -> dict[str, ProviderModelMetadata]
逐模型合并 `ProviderModelMetadata`。以 incoming 为基础 dict;对每个 existing 模型:若不在 merged 中直接加入;否则对同名模型用 `replace(base, ...)` 合并,规则是**本地(existing)优先补全**:`name/api/base_url` 取 existing 非空否则 base(空字符串/None 用 base);`reasoning` 取 existing 非 None;`input` 取 existing 非空;`cost={**base.cost, **metadata.cost}`(本地覆盖);`cost_tiers` 取 existing 非空;`context_window`/`max_tokens` 取 existing 非空;`headers`/`compat` 本地覆盖;`thinking_level_map` 本地覆盖。

### _unique_strings(values: tuple[str, ...]) -> tuple[str, ...]
去重并保序:`tuple(dict.fromkeys(values))`。

### _atomic_write_text(path: Path, text: str) -> None
通过同目录临时文件原子替换目标。用 `NamedTemporaryFile` 在 `path.parent` 下创建带 `.{name}.` 前缀、`.tmp` 后缀的临时文件,写入并 flush;然后 `temp_path.replace(path)` 原子移动;任何异常时 `suppress(OSError)` 删除临时文件再 re-raise。

### _provider_preference_to_json(provider) -> dict[str, Any]
仅序列化单个 provider 的运行时偏好(用于 `ProviderSettings.to_json` 的 `provider_preferences`)。只输出:`default_model`、`headers`、`timeout_seconds`、`max_retries`、`max_retry_delay_seconds`、`thinking_defaults`。不含 provider 定义字段(那些由 catalog 承载)。

### _save_provider_definitions_to_catalog(settings, *, paths) -> None
把未由 catalog 代表的 provider 定义持久化到 catalog.toml。`catalog_by_name = {entry.name: entry for entry in effective_catalog(paths)}`;对每个 provider,若 `entry is None`(catalog 无此名)或 `_provider_definition_differs_from_catalog(provider, entry)` 为真,则 `_catalog_entry_from_provider(provider, existing=entry)` 生成 catalog entry,收集到 `entries_to_save`;若有则 `save_user_catalog_entries(entries_to_save, paths=...)`。这样用户自定义 provider 会进入用户 catalog 层。

### _provider_definition_differs_from_catalog(provider, entry) -> bool
判断 provider 元数据是否偏离 catalog 到需写入 catalog.toml。逐项比较:`provider_kind(provider) != entry.kind`、`base_url`、`api_key_env`、`credential_name`、`models`、`api`(仅当 entry.api 非 None)、`context_windows`、`headers`、`compat`、`_catalog_model_metadata_from_provider(provider) != entry.model_metadata`、`thinking_levels`、`thinking_models`、`thinking_default`、`thinking_parameter`。任一不等返回 True。

### _catalog_entry_from_provider(provider, *, existing=None) -> ProviderCatalogEntry
从运行时 provider 造 catalog 元数据。`display_name` 取 `existing.display_name` 否则 provider.name;`kind` 用 `provider_kind(provider)`;`default_model` 取 existing 的(若存在且仍在 provider.models 内)否则 provider.default_model;`docs_url` 取 existing.docs_url 否则 provider.base_url;`api` 用 `getattr(provider, "api", None)`,`compat` 用 `getattr(provider, "compat", {})`,`model_metadata` 用 `_catalog_model_metadata_from_provider(provider)`;其余字段直接拷贝。

### _catalog_model_metadata_from_provider(provider) -> dict[str, ModelCatalogMetadata]
把 provider 的 `model_metadata` 转回 catalog 的 `ModelCatalogMetadata`。仅包含 provider 上 `getattr(provider, "model_metadata", {})`;对每个模型构造 `ModelCatalogMetadata`,其中 `input` 过滤为只保留 `{"text","image"}` 成员,`cost`/`context_window` 为空/None 时存为 None,其余字段逐拷。

### provider_settings_from_json(data, *, paths=None) -> ProviderSettings
从 JSON 兼容 dict 解析 provider 偏好(兼容新旧两种 shape)。先 `_string(data.get("default_provider"), "default_provider")` 与 `_scoped_models_from_json(data.get("scoped_models"))`。若存在 `provider_preferences` 键,则 `_providers_with_preferences(data.get("provider_preferences"), paths=...)` 生成 providers 并返回 `ProviderSettings`。否则要求 `providers` 为列表且非空(否则抛 `ProviderConfigError`),每个元素 `_provider_from_json(item)`,校验名称唯一(`len(set(names)) != len(names)` 抛错),返回 `ProviderSettings`。新格式只存偏好+引用 catalog;旧格式直接存完整 provider 定义。

### _providers_with_preferences(value, *, paths) -> tuple[ProviderConfig, ...]
从 `provider_preferences` 对象解析 providers。要求 value 为 dict(否则抛错)。`catalog_configs = {provider.name: provider for provider in _effective_provider_configs(paths)}`。遍历每个 `name → preference_data`:name 必须非空字符串、去空白、不能重复;若 `provider_name not in catalog_configs`(**orphaned 偏好**)则跳过(避免陈旧条目阻止启动);否则 `_apply_provider_preference(catalog_configs[provider_name], preference_data)` 应用偏好。返回生成的 providers 元组。

### _apply_provider_preference(provider, value) -> ProviderConfig
把单个 provider 的偏好对象应用到 catalog 配置上。value 必须 dict(否则抛错)。允许字段白名单 `{default_model, headers, timeout_seconds, max_retries, max_retry_delay_seconds, thinking_defaults}`;出现未知字段抛 `ProviderConfigError`。各字段若缺失则保留 provider 原值,若提供则经校验函数转换(`_string`/`_string_dict`/`_positive_float`/`_non_negative_int`/`_non_negative_float`/`_thinking_defaults_dict`)。`default_model` 若不在 `provider.models` 中则把其追加进 models;`thinking_defaults` 经 `_thinking_defaults_dict` 校验可用级别。最后 `replace` 生成更新后的 provider。

### _thinking_defaults_dict(value, provider, field_name) -> dict[str, ThinkingLevel]
解析并校验 `thinking_defaults` 偏好。先用 `_raw_thinking_defaults_dict` 得到 `{model: level}`;再对每个 (model, level):`validate_provider_model(provider, model)` 校验模型存在;`provider_thinking_levels(provider, model=model)` 取可用级别,若 level 不在其中抛 `ProviderConfigError`(列出可用)。返回校验通过的 dict。

### _raw_thinking_defaults_dict(value, field_name) -> dict[str, ThinkingLevel]
底层解析 `thinking_defaults` 为 dict。要求 value 为 dict(否则抛错);遍历 key→item:key 经 `_string` 校验、item 经 `_optional_thinking_level` 归一化,若 level 为 None 抛错;收集 `defaults[model] = thinking_level`。

### _scoped_models_from_json(value) -> tuple[ScopedModelConfig, ...]
解析 `scoped_models`。value 为 None 返回 `()`;必须 list(否则抛错);每个元素必须 dict,提取 `provider`/`model`(均 `_string` 校验);用 `seen` 集合去重后生成 `ScopedModelConfig` 元组。

### resolve_provider_selection(settings, *, provider_name=None, model=None) -> ProviderSelection
解析一次运行的 provider/model 选择。先 `settings.get_provider(provider_name)` 取 provider;`selected_model = model or provider.default_model`;若空抛 `ProviderConfigError`;再 `validate_provider_model(provider, selected_model)`;返回 `ProviderSelection(provider=provider, model=selected_model)`。

### validate_provider_model(provider: ProviderConfig, model: str) -> None
校验 model 是否由 provider 声明。若 `model in provider.models` 直接返回;否则抛 `ProviderConfigError`,列出 `", ".join(sorted(provider.models))`(空则 "none")。

### provider_thinking_levels(provider, *, model=None) -> tuple[ThinkingLevel, ...]
返回某 provider/model 支持的 thinking 级别。先 `selected_model = model or provider.default_model`、`metadata = _metadata_for_model(...)`。若 metadata 且 `metadata.reasoning is False` → 返回 `()`(明确非推理模型)。若 `provider.thinking_levels is None`:仅当 metadata 且 `reasoning is True` 时返回 `_levels_from_thinking_map(metadata.thinking_level_map)`,否则 `()`。若 provider 声明了 `thinking_models` 且 selected_model 不在其中 → `()`。否则返回 `provider.thinking_levels` 中"metadata 为 None 或 `_metadata_supports_thinking_level` 为真"的级别过滤结果。

### provider_thinking_unavailable_reason(provider, *, model=None) -> str | None
解释某 provider/model 为何没有可配置 thinking 模式(无原因返回 None)。流程:`selected_model` 与 metadata 同前;若 metadata.reasoning is False → 返回 "is not a reasoning model"。若 `provider.thinking_levels is None`:metadata.reasoning 为 True 则返回 None;若是 `OpenAICodexProviderConfig` → 返回 Codex 订阅暂未实现 effort 映射的说明;否则返回 "does not declare thinking_levels"。若 `provider.thinking_models` 存在且 selected_model 不在其中 → 返回 "is not declared in thinking_models"。否则返回 None(可用)。

### _levels_from_thinking_map(thinking_level_map) -> tuple[ThinkingLevel, ...]
从 thinking_level_map 推导可用级别。固定级别顺序 `("off","minimal","low","medium","high","xhigh")`,过滤出 `_thinking_level_map_supports` 为真的级别。

### _metadata_supports_thinking_level(metadata, level) -> bool
委托 `_thinking_level_map_supports(metadata.thinking_level_map, level)`,判断单模型元数据是否支持某级别。

### _thinking_level_map_supports(thinking_level_map, level) -> bool
判定级别是否受支持。若 `level in thinking_level_map` 则返回 `thinking_level_map[level] is not None`(显式 None 表示禁用);否则仅 `"xhigh"` 不被默认支持,其余级别默认 True。

### _metadata_for_model(provider, model) -> ProviderModelMetadata | None
取某模型的 per-model 元数据:`getattr(provider, "model_metadata", {}).get(model)`。

### _provider_api(provider, model=None) -> ProviderApi | str
解析实际使用的 API 标识。`selected_model` 后取 metadata;若 metadata.api 非 None 返回之;若为 `OpenAICodexProviderConfig` 返回固定 `"openai-codex-responses"`;否则 `getattr(provider, "api", "openai-completions")`(OpenAI 兼容默认)。

### _model_base_url(provider, model=None) -> str
解析实际 base URL。取 metadata;优先 `metadata.base_url`(若存在非空)否则 `provider.base_url`。

### _model_headers(provider, model=None) -> dict[str, str]
解析实际请求头:`{**provider.headers, **(metadata.headers if metadata else {})}`,即 provider 级头 + 模型级头(模型级覆盖)。

### _model_compat(provider, model=None) -> dict[str, Any]
解析实际兼容标志。合并三来源:`_detected_compat(provider, selected_model)`(按 URL/名称探测)、`getattr(provider, "compat", {})`(provider 级)、`metadata.compat`(模型级),后者覆盖前者。

### _detected_compat(provider, model) -> dict[str, Any]
基于 provider 名称/base URL 探测各厂商特性标志。识别 together/zai/moonshot/grok/deepseek/cerebras/openrouter 等;计算 `is_nonstandard`、`use_max_tokens`(moonshot/together);返回 dict:`supportsStore`、`supportsReasoningEffort`、`supportsUsageInStreaming=True`、`maxTokensField`(use_max_tokens 时为 "max_tokens" 否则 "max_completion_tokens")、`thinkingFormat`(deepseek/zai/together/openrouter/openai 之一)、`supportsStrictMode`、`supportsLongCacheRetention`(均对某些厂商取反)。

### _model_max_tokens(provider, model=None) -> int | None
取模型级 `max_tokens`(来自 metadata,无则 None)。

### provider_default_thinking_level(provider, *, model=None) -> ThinkingLevel | None
返回偏好的 thinking 级别。`levels = provider_thinking_levels(...)`;空则返回 None;若 `provider.thinking_default in levels` 用它;否则若 `DEFAULT_THINKING_LEVEL in levels` 用默认;否则取 `levels[0]`。

### openai_compatible_config_from_provider(provider, *, credential_reader=None, model=None, thinking_level=None) -> OpenAICompatibleConfig
由持久化设置构造 OpenAI 兼容运行时 `OpenAICompatibleConfig`。流程:`api_key = _api_key_from_provider(...)`;`selected_model = model or provider.default_model`;`base_url = _model_base_url(...)`,且当 provider 是默认 OpenAI(`name==DEFAULT_PROVIDER_NAME and api_key_env=="OPENAI_API_KEY"`)时用 `environ.get("OPENAI_BASE_URL", base_url)` 覆盖;`reasoning_effort = _reasoning_effort_from_provider(...)`;`compat = _model_compat(...)`;最后构造 `OpenAICompatibleConfig`,含 `api=str(_provider_api(...))`、`base_url.rstrip("/")`、`headers=_model_headers`、`timeout/retries/delay`、`reasoning_effort`、`reasoning_effort_parameter=provider.thinking_parameter or "reasoning_effort"`、`thinking_format=_thinking_format(...)`、`compat`、`include_reasoning_effort_none=_include_reasoning_effort_none(...)`。

### anthropic_config_from_provider(provider, *, credential_reader=None, model=None, thinking_level=None) -> AnthropicConfig
由持久化设置构造 Anthropic 运行时 `AnthropicConfig`。`api_key = _api_key_from_provider(...)`;`selected_model`;`thinking_budget_tokens = _anthropic_thinking_budget_from_provider(...)`;构造 `AnthropicConfig`,含 `base_url=_normalize_anthropic_base_url(_model_base_url(...))`(确保以 /v1 结尾)、`headers=_model_headers`、`timeout/retries/delay`、`thinking_budget_tokens`、`thinking_effort=_reasoning_effort_from_anthropic_provider(...)`、`thinking_mode=_anthropic_thinking_mode(...)`。

### provider_kind(provider) -> ProviderKind
返回 provider 的 catalog kind。Anthropic→`"anthropic"`;OpenAICodex→`"openai-codex"`;OpenAICompatible:若 `api=="google-generative-ai"`→该 kind,若 `api=="mistral-conversations"`→该 kind;否则 `""` 返回 `"openai-compatible"`。

### provider_has_usable_credentials(provider, *, credential_reader=None) -> bool
判断 Tau 能否无需提示 setup 就调用该 provider。若 `provider.credential_name` 且 `credential_reader` 存在:先探测 `get_oauth_provider(provider.name)` 且该 reader 有 `get_oauth` 且 `get_oauth(credential_name)` 非 None → True;或 `credential_reader.get(credential_name)` 非空 → True。最后回退到 `bool(environ.get(provider.api_key_env))`(环境变量可用即 True)。

### _reasoning_effort_from_provider(provider, *, model, thinking_level) -> str | None
映射 OpenAI 兼容 provider 的 reasoning_effort wire 值。若 `thinking_level is None` 或 `provider.thinking_parameter not in {"reasoning_effort","reasoning.effort"}` → None。取可用 `levels`,空返回 None;`selected_model` 后 `normalized = normalize_thinking_level(thinking_level)`,若不在 levels 抛 `ProviderConfigError`;`mapped = _metadata_thinking_value(provider, selected_model, normalized)`,非 None 直接返回;特例:`provider.name=="huggingface" and normalized=="minimal"` 返回 `"low"`(绕开 HF router 拒绝 minimal 标签);否则 `reasoning_effort_for_level(normalized)`。

### _anthropic_thinking_budget_from_provider(provider, *, model, thinking_level) -> int | None
映射 Anthropic 的 thinking budget token 数。若 `thinking_level is None` 或 `provider.thinking_parameter != "anthropic.thinking"` → None。`selected_model`;若 `_anthropic_thinking_mode(...) == "adaptive"` → None(自适应模式无固定预算)。取可用 levels,空返回 None;`normalized` 不在 levels 抛错;否则 `anthropic_thinking_budget_for_level(normalized)`。

### _metadata_thinking_value(provider, model, level) -> str | None
从模型元数据取某级别的 wire 字符串:`metadata.thinking_level_map.get(level)`,若值非 str 返回 None。

### _thinking_format(provider, model) -> str
解析 thinking 输出格式字符串。先查 `_model_compat(provider, model).get("thinkingFormat")`(str 非空即用);否则按 provider 名称/base URL 探测 deepseek/zai/together/openrouter,均不中返回 `"openai"`。

### _include_reasoning_effort_none(provider, *, model, thinking_level) -> bool
决定是否在请求中包含 `reasoning_effort: "none"`。若 `thinking_level is None` → False;`normalize_thinking_level` 失败 → False;若归一化非 `"off"` → False;最后仅当 `_metadata_thinking_value(provider, model, "off") == "none"`(即 off 明确映射为 "none")时返回 True。

### _reasoning_effort_from_anthropic_provider(provider, *, model, thinking_level) -> str | None
映射 Anthropic 的 thinking_effort 字符串。若 `thinking_level is None` → None;`normalized = normalize_thinking_level(thinking_level)`;若 `"off"` → None;否则 `mapped = _metadata_thinking_value(...)`,有映射用映射否则返回 `normalized`(直接作为 effort 字符串)。

### _anthropic_thinking_mode(provider, model) -> str
返回 Anthropic thinking 模式。若 `_model_compat(provider, model).get("forceAdaptiveThinking") is True` → `"adaptive"`,否则 `"budget"`。

### _normalize_anthropic_base_url(base_url: str) -> str
规范化 Anthropic base URL:先 `rstrip("/")`;若以 `/v1` 结尾则原样返回,否则补 `/v1`。

### _provider_from_json(data: object) -> ProviderConfig
从 JSON 对象解析为具体 provider 配置(旧 `providers[]` shape)。要求 data 为 dict;`provider_type = _string(data.get("type"), ...)` 必须在白名单(否则抛 `ProviderConfigError`);逐个字段经校验函数解析(name/base_url `rstrip("/")`/api 可选/api_key_env/credential_name 可选/models `default_model` 追加/context_windows/headers/compat/model_metadata/timeout/retries/delay/thinking 五项)。按 type 分支:`anthropic`→`AnthropicProviderConfig`(api 默认 `"anthropic-messages"`);`openai-codex`→ 先 `_reject_catalog_only_legacy_metadata` 再 `OpenAICodexProviderConfig`(无 compat/model_metadata);其余→`OpenAICompatibleProviderConfig`(api 默认 `_default_api_for_kind`)。

### _api_key_from_provider(provider, *, credential_reader) -> str
解析实际 API key。优先级:若 `provider.credential_name` 且 reader 存在,先 `credential_reader.get(credential_name)` 非空即用;再探测 `get_oauth_provider(provider.name)` + reader 的 `get_oauth`,取 OAuth 凭据的 `access` 字符串;再回退 `environ.get(provider.api_key_env)`;都失败则抛 `RuntimeError`(提示设置环境变量或 `/login`)。

### _validate_provider_numbers(*, timeout_seconds, max_retries, max_retry_delay_seconds) -> None
校验三个数值字段。`timeout_seconds`:bool 或 `<=0` 抛错;`max_retries`:非 int 或 bool 或 `<0` 抛错;`max_retry_delay_seconds`:非 int/float 或 bool 或 `<0` 抛错。

### _validate_context_windows(context_windows: dict[str, int]) -> None
校验 context window 字典。每个 key 必须非空字符串;value 必须为正 int(排除 bool),否则抛 `ProviderConfigError`。

### _validate_model_metadata(models, model_metadata) -> None
校验 model_metadata 与 models 一致且合法。每个 metadata key 必须在 `models` 中(否则抛错);`context_window`/`max_tokens` 非 None 时必须为正;`input` 每项须为 `"text"`/`"image"`;`cost` 值非负;`cost_tiers` 经 `_validate_runtime_cost_tiers`;compat 经 `_validate_json_object`;headers 经 `_validate_string_dict`;thinking_level_map 每个 level 经 `normalize_thinking_level`,value 为 None 或非空字符串。

### _validate_runtime_cost_tiers(tiers: tuple[ModelCostTier, ...]) -> None
校验成本分层。若 tiers 非空且最后一个 `max_input_tokens is not None` → 抛错(末层必须无限)。遍历每层:cost 值非负;若 `max_input_tokens` 非 None 必须严格大于 `previous_limit`,否则抛"严格递增"错误并更新 `previous_limit`。

### _validate_string_dict(value: dict[str, str], field_name: str) -> None
校验 string→string 字典。key/value 均须为非空字符串,否则带 `field_name` 抛 `ProviderConfigError`。

### _validate_json_object(value: dict[str, Any], field_name: str) -> None
校验 JSON 对象(键为字符串,值递归 JSON 兼容)。每个 key 非空字符串;值经 `_validate_json_value(item, ...)`。

### _validate_json_value(value: object, field_name: str) -> None
递归校验 JSON 兼容值。None/str/int/float/bool 通过;list 逐项递归;dict 键须为 str 且值递归;其他类型抛 "must be JSON-compatible"。

### _reject_catalog_only_legacy_metadata(compat, model_metadata) -> None
拒绝 OpenAI Codex 的 legacy 元数据。若 `compat or model_metadata` 任一非空,抛 `ProviderConfigError("OpenAI Codex legacy provider metadata is not supported")`。

### _validate_thinking_defaults(thinking_defaults: dict[str, ThinkingLevel]) -> None
校验 thinking_defaults。每个 key 非空字符串;每个 level 经 `normalize_thinking_level`(失败抛 `ProviderConfigError`,透传原始消息)。

### _validate_thinking_config(*, thinking_levels, thinking_models, thinking_default, thinking_parameter) -> None
校验 thinking 配置一致性。若 `thinking_levels is None`:要求 thinking_models/default/parameter 全为空,否则抛"thinking_levels must be set before thinking metadata";返回。否则 `normalize_thinking_levels` 必须成功且等于原值(未归一化则抛"must be normalized");thinking_models 须全为非空字符串;若 `thinking_default` 非 None 必须在 thinking_levels 内;thinking_parameter 必须在白名单 {None,"reasoning_effort","reasoning.effort","anthropic.thinking"}。

### _reject_unimplemented_thinking_config(*, provider_type, thinking_levels) -> None
若 `thinking_levels is not None` 抛 `ProviderConfigError(f"{provider_type} thinking controls are not implemented yet")`。(注:本模块中未见到调用点,属预留守卫。)

### _optional_provider_api(value, field_name) -> ProviderApi | None
可选 API 标识校验。None → None;值必须在已知 API 集合(否则抛错),返回 cast 后的 `ProviderApi`。

### _optional_string(value, field_name) -> str | None
可选非空字符串。None → None;否则必须非空字符串,返回 `strip()`;否则抛错。

### _string(value, field_name) -> str
必填非空字符串。必须非空字符串,否则抛错,返回 `strip()`。

### _string_tuple(value, field_name) -> tuple[str, ...]
必填非空字符串列表。必须为非空 list(否则抛错);`strip` 过滤出非空项;若过滤后数量与原 list 不等(含非字符串或空串)抛错;返回 items。

### _optional_string_tuple(value, field_name) -> tuple[str, ...]
可选字符串列表。None → `()`;否则须为 list,过滤空串,若数量不等抛错,返回去空后的 items。

### _optional_thinking_levels(value, field_name) -> tuple[ThinkingLevel, ...] | None
可选 thinking 级别列表。None → None;须为 list,经 `normalize_thinking_levels` 归一化(失败抛错),返回 tuple。

### _optional_thinking_level(value, field_name) -> ThinkingLevel | None
可选单 thinking 级别。None → None;须为 str,经 `normalize_thinking_level`(失败抛错),返回归一化级别。

### _optional_thinking_parameter(value, field_name) -> ThinkingParameter | None
可选 thinking 参数。None → None;值须为 `"reasoning_effort"`/`"reasoning.effort"`/`"anthropic.thinking"` 之一(否则抛错),返回对应字面量。

### _string_dict(value, field_name) -> dict[str, str]
必填 string→string 对象。须为 dict;每个 key/value 非空字符串,返回 `.strip()` 后的 dict。

### _json_dict(value, field_name) -> dict[str, Any]
必填 JSON 对象。须为 dict;key 非空字符串;值经 `_validate_json_value` 递归校验,返回 strip key 后的 dict。

### _model_metadata_dict(value, models, field_name) -> dict[str, ProviderModelMetadata]
解析 model_metadata 对象。须为 dict;`model_names = set(models)`;每个 key 经 `_string`,必须属于 models(否则抛错);每个 item 须 dict,构造 `ProviderModelMetadata`,子字段分别经 `_optional_string`(name/base_url)、`_optional_provider_api`(api)、`_optional_bool`(reasoning)、`_optional_string_tuple`(input)、`_float_dict`(cost)、`_cost_tiers`(cost_tiers)、`_optional_positive_int`(context_window/max_tokens)、`_string_dict`(headers)、`_json_dict`(compat)、`_thinking_level_map_dict`(thinking_level_map)。返回 items。

### _cost_tiers(value, field_name) -> tuple[ModelCostTier, ...]
解析成本分层数组。须为 list;每项须 dict,允许字段 `{max_input_tokens,input,output,cacheRead,cacheWrite}`,未知字段抛错;cost 四项经 `_non_negative_float`;构造 `ModelCostTier(max_input_tokens=可选正int, cost=...)`;结果经 `_validate_runtime_cost_tiers` 后返回。

### _thinking_level_map_dict(value, field_name) -> dict[ThinkingLevel, str | None]
解析 thinking_level_map 对象。须为 dict;每个 key 经 `_optional_thinking_level`(必须可归一化为级别,否则抛错);value 为 None 或非空字符串;返回 `{level: 原值.strip() if str else None}`。

### _float_dict(value, field_name) -> dict[str, float]
必填 number→float 对象。须为 dict;key 非空字符串;value 须为非负非 bool 的 int/float,转 float;返回 strip key 后的 dict。

### _optional_bool(value, field_name) -> bool | None
可选布尔。None → None;须为 bool(排除 int),否则抛错,返回原值。

### _optional_positive_int(value, field_name) -> int | None
可选正整数。None → None;须为正非 bool 的 int,否则抛错,返回值。

### _context_window_dict(value, field_name) -> dict[str, int]
必填 string→int 对象。须为 dict;key 非空字符串;value 须为正非 bool 的 int;返回 strip key 后的 dict。

### _positive_float(value, field_name) -> float
必填正浮点。须为 int/float(排除 bool),转 float 且 `>0`,否则抛错,返回值。

### _non_negative_int(value, field_name) -> int
必填非负整数。须为 int(排除 bool)且 `>=0`,否则抛错,返回值。

### _non_negative_float(value, field_name) -> float
必填非负浮点。须为 int/float(排除 bool),转 float 且 `>=0`,否则抛错,返回值。

<!-- NAV -->
[← tau_coding · 会话索引]({{< relref "./coding-session-manager.md" >}})
[↑ 总览]({{< relref "./source-walkthrough.md" >}})
[→ tau_coding · 渲染层(print/json)]({{< relref "./coding-rendering-print.md" >}})
