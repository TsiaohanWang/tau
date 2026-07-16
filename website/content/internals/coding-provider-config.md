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

<!-- NAV -->
[← tau_coding · 会话索引]({{< relref "./coding-session-manager.md" >}})
[↑ 总览]({{< relref "./source-walkthrough.md" >}})
[→ tau_coding · 渲染层(print/json)]({{< relref "./coding-rendering-print.md" >}})
