---
title: tau_coding · Provider 配置
description: provider_catalog / provider_config / provider_runtime
---

## `tau_coding/provider_catalog.py` — 内建 provider 目录

本文件定义了 Tau 开箱即知（out of the box）的 provider 的*静态*描述（名称、base URL、
鉴权环境变量、模型、思考级别、成本档位）。它是数据，而非行为。

### 类型别名

- `ProviderKind` — `"openai-compatible" | "anthropic" | "openai-codex" |
  "google-generative-ai" | "mistral-conversations"`。
- `ProviderApi` — 线协议（wire protocol）：`"openai-completions"`、
  `"openai-responses"`、`"anthropic-messages"`、`"openai-codex-responses"`、
  `"google-generative-ai"`、`"mistral-conversations"`。
- `ModelInput` — `"text" | "image"`。
- `ThinkingLevelMap` — `dict[ThinkingLevel, str | None]`：把思考级别映射到
  provider 特定的线值（不支持时为 `None`）。
- `AuthMethod` — `"api_key" | "oauth"`。

### `ModelCostTier` (frozen)

一条成本行，适用于可选的 `max_input_tokens` 上限内。序列中最后一层必须省略
`max_input_tokens`（一个表示 “以及以上” 的哨兵值）。用于与 token 数量相关的计价。

### `ModelCatalogMetadata` (frozen)

逐模型的目录数据：`name`、`api`、`base_url`、`reasoning`、`input`、
`cost`、`cost_tiers`、`context_window`、`max_tokens`、`headers`、`compat`、
`thinking_level_map`。它是 `provider_config.py` 中运行时 `ProviderModelMetadata`
的*目录*对应物。

### `model_cost_for_input_tokens(metadata, input_tokens)`

返回给定输入规模对应的费率字典。它按顺序遍历 `cost_tiers`；第一个
`max_input_tokens` 为 `None` 或 `>= input_tokens` 的层胜出。回退到扁平的 `cost`。
token 数量非法时抛 `ValueError`。

### `ProviderCatalogEntry` (frozen)

Tau 在登录/设置时可呈现的一个内建 provider：

- `name`、`display_name`、`kind`、`base_url`、`api_key_env`、
  `credential_name`、`models`、`default_model`、`docs_url`。
- 可选：`api`、`context_windows`、`headers`、`compat`、
  `model_metadata`、`thinking_levels`、`thinking_models`、
  `thinking_default`、`thinking_parameter`、`auth_methods`。

这是 `provider_config.py` 中持久化 `ProviderConfig` 数据类的*目录*对应物。

### `BUILTIN_PROVIDER_CATALOG` and `_load_builtin_catalog()`

`_load_builtin_catalog()` 惰性地从 `tau_coding.catalog_loader` 导入 `builtin_catalog`
（以避免循环导入，因为 `catalog_loader` 会从本模块导入 `ProviderCatalogEntry`）。
结果在导入时即冻结进 `BUILTIN_PROVIDER_CATALOG`。

### `builtin_provider_entry(name)`

按 provider 名称做线性查找，返回一个目录条目。

> **为什么目录和配置是两个独立文件且只有单向依赖。** *目录*(本文件)是静态参考数据——Tau 自带的 provider 列表。*配置*(下一个文件)是用户持久化的、可能经过自定义的副本。配置模块导入目录;目录绝不导入配置。这条单向边是有意为之:参考数据不能依赖用户状态,这样新增一个内置 provider 只需加入目录,所有已安装的 Tau 都能自动获取,无须触碰任何人的 `providers.json`。将二者分开正是"小层胜于魔法"原则在配置领域的体现——出厂默认值与用户覆盖永远不会纠缠在一起。

---

## `tau_coding/provider_config.py` — 持久化的 provider 配置

这是本教程中最大的文件。它把目录数据 + 用户偏好 + 环境，转化为持久的 `ProviderConfig`
对象，随后由 `provider_runtime.py` 将其转换为真正可用的 `tau_ai` provider。

### 常量与错误类型

- `DEFAULT_PROVIDER_NAME = "openai"`, `DEFAULT_MODEL = "gpt-5.4"`.
- `ProviderConfigError(ValueError)` — 任何无效 provider 配置时抛出的异常。
- `CredentialReader` (Protocol) — 任何具有 `get(name) -> str | None` 方法的对象,
  用于在构建运行时配置时读取凭据。

### `ProviderModelMetadata` (frozen)

`ModelCatalogMetadata` 的*运行时*镜像:驻留在持久化 provider 配置上的每模型元数据。
具有 `to_json()` 序列化方法。

### `OpenAICompatibleProviderConfig` / `AnthropicProviderConfig` / `OpenAICodexProviderConfig`

三个 frozen 数据类，每种 provider 类型各一个。它们共享以下字段：

- identity: `name`, `base_url`, `api`, `api_key_env`, `credential_name`.
- `models`, `default_model`, `context_windows`, `headers`, `compat`,
  `model_metadata`.
- timeouts/retries: `timeout_seconds`, `max_retries`, `max_retry_delay_seconds`.
- thinking: `thinking_levels`, `thinking_models`, `thinking_default`,
  `thinking_parameter`, `thinking_defaults` (per-model remembered level).

每个类都有 `__post_init__` 来校验数值、上下文窗口、模型元数据、compat JSON 与 thinking 配置,
以及一个用于持久化的 `to_json()` 方法。`OpenAICodexProviderConfig` 省略了
`model_metadata`/`compat`,因为 Codex 仅通过 OAuth 认证,其元数据不可由用户编辑。

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

### 从目录构建配置

- `builtin_provider_configs()` — one `ProviderConfig` per built-in catalog entry.
- `provider_config_from_catalog_entry(name)` / `provider_config_from_entry(entry)`
  — translate a `ProviderCatalogEntry` into the correct `ProviderConfig`
  subclass based on `entry.kind`. `_default_api_for_kind` maps a kind to its
  default wire API.

```python
def provider_config_from_entry(entry: ProviderCatalogEntry) -> ProviderConfig:
    """Create a durable provider config from a catalog entry."""
    context_windows = dict(entry.context_windows or {})
    model_metadata = _provider_model_metadata_from_catalog(entry.model_metadata)
    if entry.kind == "anthropic":
        return AnthropicProviderConfig(
            name=entry.name, base_url=entry.base_url,
            api=_default_api_for_kind(entry.kind), ... thinking_defaults={},
        )
    if entry.kind == "openai-codex":
        return OpenAICodexProviderConfig(  # no compat/headers/model_metadata
            name=entry.name, base_url=entry.base_url, ... thinking_defaults={},
        )
    return OpenAICompatibleProviderConfig(
        name=entry.name, base_url=entry.base_url,
        api=entry.api or _default_api_for_kind(entry.kind), ... thinking_defaults={},
    )

def _default_api_for_kind(kind: str) -> ProviderApi:
    if kind == "anthropic":
        return "anthropic-messages"
    if kind == "openai-codex":
        return "openai-codex-responses"
    if kind == "google-generative-ai":
        return "google-generative-ai"
    if kind == "mistral-conversations":
        return "mistral-conversations"
    return "openai-completions"
```
> 上面的代码展示了 catalog → config 的单向翻译：依据 `entry.kind` 分派到对应 frozen 子类，`thinking_defaults` 始终初始化为空（用户偏好是后来叠加的）。

### 加载与保存 `providers.json`

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

```python
def load_provider_settings(paths: TauPaths | None = None) -> ProviderSettings:
    resolved_paths = paths or TauPaths()
    path = provider_settings_path(resolved_paths)
    if not path.exists():
        return ProviderSettings(providers=_effective_provider_configs(resolved_paths))
    raw = loads(path.read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        raise ProviderConfigError("Provider settings must be a JSON object")
    settings = provider_settings_from_json(raw, paths=resolved_paths)
    return _with_builtin_catalog_models(settings, paths=resolved_paths)

def save_provider_settings(settings: ProviderSettings, paths=None) -> Path:
    resolved_paths = paths or TauPaths()
    _save_provider_definitions_to_catalog(settings, paths=resolved_paths)
    path = provider_settings_path(resolved_paths)
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        with suppress(OSError):
            copy2(path, path.with_suffix(path.suffix + ".bak"))
    _atomic_write_text(path, dumps(settings.to_json(), indent=2, sort_keys=True) + "\n")
    return path
```
> `load` 在文件缺失时只回退到 effective catalog 配置；存在则解析后把最新 catalog 合并进来。`save` 先落盘自定义 provider 定义，再经临时文件原子替换，写前备份 `.bak`。

### 合并与偏好应用

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

```python
def _merge_openai_compatible_provider(existing, incoming) -> OpenAICompatibleProviderConfig:
    models = _unique_strings((*incoming.models, *existing.models))
    return replace(
        incoming,
        models=models,
        default_model=existing.default_model if existing.default_model in models else incoming.default_model,
        headers={**incoming.headers, **existing.headers},   # 本地覆盖
        compat={**incoming.compat, **existing.compat},
        model_metadata=_merge_provider_model_metadata(incoming.model_metadata, existing.model_metadata),
        timeout_seconds=existing.timeout_seconds,           # 超时/重试全取本地
        max_retries=existing.max_retries,
        max_retry_delay_seconds=existing.max_retry_delay_seconds,
        context_windows={**incoming.context_windows, **existing.context_windows},
        thinking_levels=existing.thinking_levels if existing.thinking_levels is not None else incoming.thinking_levels,
        thinking_defaults=existing.thinking_defaults,        # 本地优先
    )

def _append_catalog_providers(providers, catalog_configs, *, paths):
    credential_store = FileCredentialStore(credentials_path(paths) if paths else None)
    builtin_names = {entry.name for entry in BUILTIN_PROVIDER_CATALOG}
    appended = list(providers)
    for provider in catalog_configs.values():
        if provider.name in {p.name for p in providers}:
            continue
        # 用户 catalog 来源的总是追加；内建者须有可用凭据才追加
        if provider.name not in builtin_names or provider_has_usable_credentials(
            provider, credential_reader=credential_store
        ):
            appended.append(provider)
    return tuple(appended)
```
> 合并语义是"本地优先"：本地配置的值（头、compat、超时、thinking_defaults）覆盖 catalog 的 incoming 值，避免 catalog 刷新抹掉用户自定义。

### 解析 JSON（`provider_settings_from_json` 及相关函数）

本文件支持两种磁盘形态：

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

### Thinking 级别解析

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

```python
def provider_thinking_levels(provider, *, model=None) -> tuple[ThinkingLevel, ...]:
    selected_model = model or provider.default_model
    metadata = _metadata_for_model(provider, selected_model)
    if metadata is not None and metadata.reasoning is False:
        return ()
    if provider.thinking_levels is None:
        if metadata is None or metadata.reasoning is not True:
            return ()
        return _levels_from_thinking_map(metadata.thinking_level_map)
    if provider.thinking_models and selected_model not in provider.thinking_models:
        return ()
    return tuple(
        level for level in provider.thinking_levels
        if metadata is None or _metadata_supports_thinking_level(metadata, level)
    )

def _thinking_level_map_supports(thinking_level_map, level) -> bool:
    if level in thinking_level_map:
        return thinking_level_map[level] is not None   # 显式 None 表示禁用
    return level != "xhigh"                             # 默认除 xhigh 外都支持
```
> 思考级别的可用性由两层决定：provider 是否声明了 `thinking_levels`，以及 per-model 的 `thinking_level_map` 是否把该级别映射到非空 wire 值。

### 构建运行时配置（`tau_ai` 胶水层）

以下是 `provider_runtime.py` 所调用的函数：

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

```python
def openai_compatible_config_from_provider(provider, *, credential_reader=None,
        model=None, thinking_level=None) -> OpenAICompatibleConfig:
    api_key = _api_key_from_provider(provider, credential_reader=credential_reader)
    selected_model = model or provider.default_model
    base_url = _model_base_url(provider, selected_model)
    if provider.name == DEFAULT_PROVIDER_NAME and provider.api_key_env == "OPENAI_API_KEY":
        base_url = environ.get("OPENAI_BASE_URL", base_url)   # 默认 provider 支持 OPENAI_BASE_URL 覆盖
    reasoning_effort = _reasoning_effort_from_provider(
        provider, model=selected_model, thinking_level=thinking_level)
    compat = _model_compat(provider, selected_model)
    return OpenAICompatibleConfig(
        api_key=api_key,
        api=str(_provider_api(provider, selected_model)),
        base_url=base_url.rstrip("/"),
        headers=_model_headers(provider, selected_model),
        reasoning_effort=reasoning_effort,
        reasoning_effort_parameter=provider.thinking_parameter or "reasoning_effort",
        thinking_format=_thinking_format(provider, selected_model),
        compat=compat,
        include_reasoning_effort_none=_include_reasoning_effort_none(
            provider, model=selected_model, thinking_level=thinking_level),
    )

def _detected_compat(provider, model) -> dict[str, Any]:
    base_url = _model_base_url(provider, model)
    is_deepseek = provider.name == "deepseek" or "deepseek.com" in base_url
    is_zai = provider.name == "zai" or "api.z.ai" in base_url
    is_moonshot = provider.name in {"moonshotai", "moonshotai-cn"} or "moonshot." in base_url
    use_max_tokens = is_moonshot or provider.name == "together" or "api.together.ai" in base_url
    return {
        "supportsStore": not (is_cerebras or is_grok or is_together or is_deepseek or is_zai or is_moonshot),
        "supportsReasoningEffort": not (is_grok or is_zai or is_moonshot or is_together),
        "maxTokensField": "max_tokens" if use_max_tokens else "max_completion_tokens",
        "thinkingFormat": "deepseek" if is_deepseek else "zai" if is_zai else "openai",
        # ...supportsStrictMode / supportsLongCacheRetention 等亦按厂商翻转
    }
```
> `openai_compatible_config_from_provider` 是"纯翻译"的收口：把持久化设置 + 环境（`OPENAI_BASE_URL`、凭据、thinking 映射）拼成 `tau_ai.OpenAICompatibleConfig`，全程不触网。

> **为什么本模块从不触碰模型。** `provider_config.py` 是一个纯粹的翻译层:
> 目录数据 + 用户偏好 + 环境进去,类型化的 `tau_ai` 配置对象出来。它从不打开连接或
> 流式传输响应;那是 `provider_runtime.py` 的职责。将翻译与 I/O 隔离意味着整个配置
> 表面——合并、偏好应用、thinking 级别解析——都可以用纯值和无网络的方式测试,
> 格式错误的 `providers.json` 会在解析时就大声报错(明确的 `ProviderConfigError`),
> 而不是在请求中途失败。这就是"小层胜于魔法":每层只做一件事,把类型化的值交给下一层。

---

## `tau_coding/provider_runtime.py` — 实时 provider 构造

本文件把一个持久的 `ProviderConfig` 转换为一个真正的 `tau_ai`
`ModelProvider` 实例，并接好凭据与 OAuth 刷新。

### `ClosableModelProvider`（Protocol）

`ModelProvider` 外加一个异步 `aclose()` —— Tau 拥有这个 provider，并且必须能在
一次运行结束时释放其资源。

### `create_model_provider(provider, *, credential_store, model, thinking_level)`

主工厂函数。它：

1. 针对 provider 校验该模型。
2. 加载 `FileCredentialStore`（或默认实现）。
3. 按 provider 类型分派：
    - **Anthropic** — 构造一个 `AnthropicConfig`。若存在 OAuth 凭据，它会调用该
      OAuth provider 的 `runtime_auth` 来注入实时的 API key、bearer 鉴权、
      额外请求头、一个 system prompt，以及一个每次请求都刷新 token 的
      `OAuthRuntimeCredentialResolver`。返回 `AnthropicProvider`。
    - **OpenAI Codex** — 返回带 `OpenAICodexCredentialResolver` 与可选
      `reasoning_effort` 的 `OpenAICodexProvider`。
    - **OpenAI 兼容** — 构造一个 `OpenAICompatibleConfig`。若所选 `api` 为
      `anthropic-messages`/`google-generative-ai`/`mistral-conversations`，
      则返回对应的专用 provider；否则返回普通的 `OpenAICompatibleProvider`。
      OAuth 凭据的注入方式与 Anthropic 相同。
 4. 对于不支持的配置 / 缺失的 OAuth，抛 `ProviderConfigError`。

```python
def create_model_provider(provider, *, credential_store=None,
        model=None, thinking_level=None) -> ClosableModelProvider:
    if model is not None:
        validate_provider_model(provider, model)
    credentials = credential_store or FileCredentialStore()
    if isinstance(provider, AnthropicProviderConfig):
        credential = _oauth_credential(provider, credentials)
        config = anthropic_config_from_provider(
            provider, credential_reader=credentials, model=model, thinking_level=thinking_level)
        if credential is not None:
            runtime_auth = _required_oauth_provider(provider.name).runtime_auth(credential)
            config = replace(config, api_key=runtime_auth.api_key, bearer_auth=True,
                headers={**dict(config.headers or {}), **dict(runtime_auth.headers or {})},
                oauth_system_prompt="You are Claude Code, Anthropic's official CLI for Claude.",
                credential_resolver=OAuthRuntimeCredentialResolver(provider, credential_store=credentials))
        return AnthropicProvider(config)
    if isinstance(provider, OpenAICodexProviderConfig):
        return OpenAICodexProvider(OpenAICodexConfig(
            credential_resolver=OpenAICodexCredentialResolver(provider, credential_store=credentials),
            base_url=provider.base_url, ...))
    if isinstance(provider, OpenAICompatibleProviderConfig):
        compatible_config = openai_compatible_config_from_provider(provider, ...)
        selected_api = compatible_config.api
        if selected_api == "anthropic-messages":
            return AnthropicProvider(AnthropicConfig(...))   # 须有 OAuth
        if selected_api == "google-generative-ai":
            return GoogleGenerativeAIProvider(compatible_config)
        if selected_api == "mistral-conversations":
            return MistralConversationsProvider(compatible_config)
        return OpenAICompatibleProvider(compatible_config)
    raise ProviderConfigError(f"Unsupported provider config: {provider.name}")
```
> `create_model_provider` 是真正"触网边界"：它把 `provider_config` 翻译出的 `tau_ai` config 包进 `ModelProvider`，并按 `api` 身份分派到专用 provider；OAuth 凭据通过 `OAuthRuntimeCredentialResolver` 在每次请求前刷新。

### `OpenAICodexCredentialResolver`

每次请求都返回 `OpenAICodexCredentials`（访问令牌 + 账户 id）的可调用对象：

- 按名称读取 OAuth 凭据；若已过期则刷新。
- 回退到 `api_key_env` 环境变量（必须为 Codex 访问 JWT；它会从 JWT 中提取
  `account_id`）。
- 若两者皆无，则抛出清晰的 “运行 /login” 错误。

### `OAuthRuntimeCredentialResolver`

用于 Anthropic 风格 OAuth provider 的中立解析器。每次调用时它会读取 OAuth 凭据，
刷新之（并持久化刷新后的副本），向 OAuth provider 请求运行时鉴权，并返回
`RuntimeProviderAuth(api_key, base_url, headers)`。

```python
class OAuthRuntimeCredentialResolver:
    """Refresh provider-neutral OAuth credentials immediately before a request."""
    async def __call__(self) -> RuntimeProviderAuth:
        credential_name = self._provider.credential_name
        if credential_name is None:
            raise RuntimeError(f"Provider {self._provider.name} has no credential name")
        credential = self._credential_store.get_oauth(credential_name)
        if credential is None:
            raise RuntimeError(f"Missing OAuth credentials for {self._provider.name}. Run /login {self._provider.name}.")
        oauth_provider = _required_oauth_provider(self._provider.name)
        refreshed = await oauth_provider.refresh(credential)          # 每次请求前刷新
        if refreshed != credential:
            self._credential_store.set_oauth(credential_name, refreshed)
        auth = oauth_provider.runtime_auth(refreshed)
        return RuntimeProviderAuth(api_key=auth.api_key, base_url=auth.base_url, headers=auth.headers)
```
> 该中立解析器与具体 provider 解耦：只负责"取 OAuth 凭据 → 刷新 → 向 OAuth provider 请求运行时鉴权"，返回的 `RuntimeProviderAuth` 注入到 `tau_ai` 的 provider config 中。

### 辅助函数

- `_codex_reasoning_effort(...)` — 把 `ThinkingLevel` 映射为 Codex 的
  reasoning-effort 字符串（`off` → `None`、`minimal` → `"low"`，其余为归一化的力度）。
- `_oauth_credential(provider, store)` — 若 provider 注册了 OAuth 凭据则取之。
- `_required_oauth_provider(name)` — 返回已注册的 `OAuthProvider`，没有则抛错。

> **为什么运行时构造是独立的一层。** 本文件是 Tau 最终调用 `tau_ai` 的地方:
> 它上面的所有层都是数据翻译,而本文件产出的是 agent loop 真正流式消费的活的
> `ModelProvider`。把凭据解析和 OAuth 刷新集中在这里——包裹在 `ClosableModelProvider`
> 中以便 Tau 在运行结束时 `aclose()` 释放资源——使持久化配置层完全不包含密钥和
> 网络状态。这是"核心保持可移植"原则在边界处的体现:可移植的部分(目录、配置、
> agent harness)保持纯净,所有环境特定的连线都集中在一个命名清晰的边界中。

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

```python
def provider_config_from_entry(entry: ProviderCatalogEntry) -> ProviderConfig:
    context_windows = dict(entry.context_windows or {})
    model_metadata = _provider_model_metadata_from_catalog(entry.model_metadata)
    if entry.kind == "anthropic":
        return AnthropicProviderConfig(
            name=entry.name, base_url=entry.base_url,
            api=_default_api_for_kind(entry.kind), ... thinking_defaults={},
        )
    if entry.kind == "openai-codex":
        return OpenAICodexProviderConfig(  # 无 compat/headers/model_metadata
            name=entry.name, base_url=entry.base_url, ... thinking_defaults={},
        )
    return OpenAICompatibleProviderConfig(
        name=entry.name, base_url=entry.base_url,
        api=entry.api or _default_api_for_kind(entry.kind), ... thinking_defaults={},
    )
```
> 深究：catalog entry 只携带"出厂定义"，`thinking_defaults` 永远是空 dict，用户记住的级别是之后经 `set_provider_thinking_level` 叠加进来的。

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

```python
def upsert_provider(settings, provider, *, set_default=False) -> ProviderSettings:
    providers_by_name = {item.name: item for item in settings.providers}
    builtin_names = {entry.name for entry in BUILTIN_PROVIDER_CATALOG}
    if provider.name in providers_by_name and provider.name in builtin_names:
        # 替换内建时合并，保留用户本地自定义
        provider = _merge_provider_config(providers_by_name[provider.name], provider)
    providers_by_name[provider.name] = provider
    default_provider = provider.name if set_default else settings.default_provider
    providers = tuple(providers_by_name[name] for name in sorted(providers_by_name))
    updated = ProviderSettings(
        default_provider=default_provider,
        providers=providers,
        scoped_models=settings.scoped_models,
    )
    updated.get_provider(default_provider)   # 触发未知校验
    return updated
```
> 深究：合并只在"替换一个内建 provider"时发生（参数 `provider` 是 incoming 的 catalog 侧），本地旧值优先；非内建 provider 则直接覆盖、不合并。

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

```python
def openai_compatible_config_from_provider(provider, *, credential_reader=None,
        model=None, thinking_level=None) -> OpenAICompatibleConfig:
    api_key = _api_key_from_provider(provider, credential_reader=credential_reader)
    selected_model = model or provider.default_model
    base_url = _model_base_url(provider, selected_model)
    if provider.name == DEFAULT_PROVIDER_NAME and provider.api_key_env == "OPENAI_API_KEY":
        base_url = environ.get("OPENAI_BASE_URL", base_url)   # 默认 provider 允许环境变量覆盖 base URL
    reasoning_effort = _reasoning_effort_from_provider(
        provider, model=selected_model, thinking_level=thinking_level)
    compat = _model_compat(provider, selected_model)
    return OpenAICompatibleConfig(
        api_key=api_key,
        api=str(_provider_api(provider, selected_model)),
        base_url=base_url.rstrip("/"),
        headers=_model_headers(provider, selected_model),
        timeout_seconds=provider.timeout_seconds,
        max_retries=provider.max_retries,
        max_retry_delay_seconds=provider.max_retry_delay_seconds,
        reasoning_effort=reasoning_effort,
        reasoning_effort_parameter=provider.thinking_parameter or "reasoning_effort",
        thinking_format=_thinking_format(provider, selected_model),
        compat=compat,
        include_reasoning_effort_none=_include_reasoning_effort_none(
            provider, model=selected_model, thinking_level=thinking_level),
    )
```
> 深究：这是 `provider_config.py` 与 `tau_ai` 的唯一接缝——所有凭据、base URL、thinking 映射都已在此解析成普通值，下游 `OpenAICompatibleConfig` 不再需要任何 Tau 专属逻辑。

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
