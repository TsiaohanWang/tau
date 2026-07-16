---
title: tau_ai · 环境配置
description: env.py —— 基于环境变量的 provider 配置
---

## `tau_ai/http_errors.py` — 安全的 HTTP 错误细节提取

从 provider 的错误响应体里提取**不含密钥**的可读错误细节。

- `_MAX_ERROR_DETAIL_LENGTH = 1000`：错误体截断上限。
- **`provider_http_error_message(*, provider_name, status_code, body, model)`**：
  组装前缀（"X 请求失败，状态码 N，模型 M"）+ 提取到的细节。
- **`provider_http_error_detail(body)`**：先尝试按 JSON 解析，命中则走
  mapping 提取；否则截取原始 body 前 1000 字符。
- **`provider_error_detail_from_mapping(value)`**：递归从 `{"error": {...}}`
  或顶层 `message`/`detail`/`error` 字段里挑出最有用的信息（message 优先，其次
  code，再其次嵌套 mapping）。
- **`_loads_object(value)`**：安全 `loads`，非 JSON 或非 mapping 返回 `None`。

> 设计意图：把所有"为什么会失败"的细节收敛到一处，且**绝不把原始 body 里的密钥
> 直接吐给用户**——只取结构化信息或截断的原文。

---

## `tau_ai/env.py` — 基于环境变量的 provider 配置

用 `@dataclass(frozen=True, slots=True)` 定义配置与认证数据结构，并提供从
环境变量构建配置的函数。

- 默认常量：`DEFAULT_OPENAI_COMPATIBLE_BASE_URL`、
  `DEFAULT_ANTHROPIC_BASE_URL`、`DEFAULT_OPENAI_COMPATIBLE_TIMEOUT_SECONDS=60.0`、
  `DEFAULT_OPENAI_COMPATIBLE_MAX_RETRIES=2`、
  `DEFAULT_OPENAI_COMPATIBLE_MAX_RETRY_DELAY_SECONDS=1.0`。
- **`RuntimeProviderAuth`**（frozen dataclass）：一次调用前"立即解析"的认证信息
  ——`api_key`、`base_url?`、`headers?`。
- **`RuntimeProviderAuthResolver`**（类型别名）：
  `Callable[[], Awaitable[RuntimeProviderAuth]]`，即"运行时异步解析出认证"的函数。
- **`OpenAICompatibleConfig`**（frozen dataclass）：OpenAI 兼容端点的完整配置，
  字段含 `api_key`、`base_url`、`headers`、`timeout_seconds`、`max_retries`、
  `max_retry_delay_seconds`、`api`（默认 `"openai-completions"`，决定走
  chat/completions 还是 responses）、`max_tokens`、`reasoning_effort`、
  `reasoning_effort_parameter`（默认 `"reasoning_effort"`，发给模型的推理力度字段名）、
  `include_reasoning_effort_none`（默认 `False`，是否允许显式发 `effort:"none"`）、
  `thinking_format`、`compat`（透传额外参数）、`provider_name`、
  `omit_authorization_header`、`credential_resolver` 等。这是
  `openai_compatible.py` 的入参。
- **`AnthropicConfig`**（frozen dataclass）：Anthropic Messages API 配置，字段
  含 `api_key`、`bearer_auth`（默认 `False`，为 `True` 时用 `Authorization: Bearer`
  而非 `x-api-key`）、`base_url`、`headers`、`timeout_seconds`、`max_retries`、
  `max_retry_delay_seconds`、`max_tokens`、`thinking_budget_tokens`、
  `thinking_effort`、`thinking_mode`（默认 `"budget"`）、`provider_name`、
  `oauth_system_prompt`、同样支持 `credential_resolver` 等。
- **`openai_compatible_config_from_env(...)`**：从环境变量
  （`OPENAI_API_KEY`/`OPENAI_BASE_URL`/`OPENAI_TIMEOUT_SECONDS` 等）构建
  `OpenAICompatibleConfig`；缺 `api_key` 抛 `RuntimeError`；数值类变量有专用的
  解析助手 `_timeout_seconds_from_env` / `_non_negative_int_from_env` /
  `_non_negative_float_from_env`，负责类型校验与"必须 > 0 / ≥ 0"的约束。

---

## 本部分小结

Part 1a 建立了 `tau_ai` 的全部"规则"：

- `provider.py` 给出两个 Protocol：`CancellationToken` 与 `ModelProvider`；
- `events.py` 给出 7 种 `ProviderEvent`，是所有 provider 的**统一输出格式**；
- `retry.py` / `http.py` / `http_errors.py` 是共享的退避、HTTP、错误基建；
- `env.py` 给出 frozen 配置类与从环境变量构建配置的方式。

任何具体 provider（下一任务 Part 1b）都只需：实现 `ModelProvider.stream_response`，
把提供方原生流翻译成 `ProviderEvent`，复用 `retry`/`http` 助手，并吃进 `env.py`
里的配置类。

<!-- NAV -->
[← tau_ai · Provider 契约与事件流]({{< relref "./ai-provider-events.md" >}})
[↑ 总览]({{< relref "./source-walkthrough.md" >}})
[→ tau_ai · 各 Provider 实现]({{< relref "./ai-providers.md" >}})
