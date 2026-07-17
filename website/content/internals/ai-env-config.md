---
title: tau_ai · 环境配置
description: env.py —— 基于环境变量的 provider 配置
code_files:
  - tau_ai/env.py
---

本页介绍 `tau_ai` 层的配置与错误处理：环境变量配置（通过环境变量而非配置文件来设置 provider 参数，这样在本地开发、CI、容器部署等不同环境下无需修改代码即可切换配置）和 HTTP 错误提取（从 provider 返回的错误信息中安全地提取可读的错误描述，同时确保 API 密钥等敏感信息不会泄露）。

## `tau_ai/http_errors.py` — 安全的 HTTP 错误细节提取

从 provider（模型服务商）的错误响应体里提取**不含密钥**的可读错误细节。LLM 服务的错误响应可能包含 `api_key`、`Authorization` 等敏感字段，这个模块只从 `message`/`code`/`detail` 等"错误描述"字段取值，确保脱敏在单一处被强制执行。

- `_MAX_ERROR_DETAIL_LENGTH = 1000`：错误体截断上限。
- **`provider_http_error_message(*, provider_name, status_code, body, model)`**：
  组装前缀（"X 请求失败，状态码 N，模型 M"）+ 提取到的细节。
- **`provider_http_error_detail(body)`**：先尝试按 JSON 解析，命中则走
  mapping 提取；否则截取原始 body 前 1000 字符。
- **`provider_error_detail_from_mapping(value)`**：递归从 `{"error": {...}}`
  或顶层 `message`/`detail`/`error` 字段里挑出最有用的信息（message 优先，其次
  code，再其次嵌套 mapping）。
- **`_loads_object(value)`**：安全 `loads`，非 JSON 或非 mapping 返回 `None`。

> **为什么这样设计**：把所有"为什么会失败"的细节收敛到一处，且**绝不把原始 body 里的密钥
> 直接吐给用户**——只取结构化信息或截断的原文。错误体可能来自任意 provider，其中包含
> `api_key`、`Authorization` 等敏感字段的概率极高；集中、白名单式的字段提取（仅取
> `message`/`code`/`detail`/`error`）可保证脱敏在单一处被强制执行，而非分散在各 provider
> 中各自拼错。截断至 1000 字符则防止超大 body 污染日志与 UI。

---

## `tau_ai/env.py` — 基于环境变量的 provider 配置

用 `@dataclass(frozen=True, slots=True)` 定义配置与认证数据结构（`@dataclass` 是 Python 自动生成 `__init__`、`__repr__` 等方法的装饰器；`frozen=True` 使实例不可变，类似 Go 的 struct 值语义，创建后字段不可修改；`slots=True` 启用 `__slots__`，每个实例只允许声明的字段名存在，节省内存且加速属性访问，类似 Java 的 fields-only class），并提供从环境变量（environment variables，即操作系统进程级别的键值对，如 `OPENAI_API_KEY=sk-xxx`）构建配置的函数。选择环境变量而非配置文件来传递 API 密钥和连接参数，是因为环境变量天然适合容器化部署和 CI/CD 场景——不需要在镜像中放入配置文件，也不需要担心配置文件被意外提交到代码仓库。

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

这组模块建立了 `tau_ai` 的全部"规则"：

- `provider.py` 从 `tau_agent.provider` 重新导出两个 Protocol（`CancellationToken` 与 `ModelProvider`），定义了 provider 的最小接口；这两个 Protocol 的**真正定义**位于 `tau_agent/provider.py`，即 Pi 可移植 agent 层，`tau_ai` 只是做了一次"二次导出"（re-export），这样下游代码仍可写 `from tau_ai.provider import ModelProvider` 而无需感知分层细节；
- `events.py` 从 `tau_agent.provider_events` 重新导出 Pi 兼容的流式事件（`AssistantStartEvent`、`TextDeltaEvent`、`ThinkingDeltaEvent`、`ToolCallStartEvent`、`AssistantDoneEvent` 等 15 种），是所有 provider 的**统一输出格式**；同样，事件的真正定义也在 `tau_agent` 层，`tau_ai.events` 只做 re-export；
- `retry.py` / `http.py` / `http_errors.py` 是共享的退避重试、HTTP 客户端、错误提取基建；
- `env.py` 给出 frozen dataclass（不可变数据类）配置与从环境变量构建配置的方式。

任何具体 provider（下一篇将介绍）都只需：实现 `ModelProvider.stream_response` 方法，把模型服务商的原生响应流翻译成 Pi 兼容的 `AssistantMessageEvent`（即 `AssistantStartEvent` → `TextDeltaEvent` → … → `AssistantDoneEvent` 序列），复用 `retry`/`http` 共享助手，并读取 `env.py` 里的配置类。

## 逐方法深度剖析（env / http_errors / __init__）

> 以下是环境变量配置、HTTP 错误提取与包导出面的逐方法展开。如果你已经理解了上面的概述，可以跳过本节；如果你需要知道每个函数的具体实现细节，请继续阅读。

## 文件:env.py

本文件提供一组"从环境变量读取 provider 配置"的辅助函数与数据类。它让 Tau 在不写任何配置文件的情况下,仅凭进程环境变量即可构造出各 LLM provider 的连接配置,是整个 `tau_ai` 层"无配置即可运行"的入口之一。文件开头从 `os.environ` 直接导入,因此所有配置读取都实时反映进程环境——这正是 Tau **"The core stays portable"** 原则的体现：核心不绑定具体部署形态，配置完全由运行环境注入，从而可在本地、CI、容器间无缝迁移。

### 模块级常量

以下是各 provider 的默认值,被各 `from_env` 函数复用:

- `DEFAULT_OPENAI_COMPATIBLE_BASE_URL = "https://api.openai.com/v1"`:OpenAI 兼容端点的默认 base URL。
- `DEFAULT_ANTHROPIC_BASE_URL = "https://api.anthropic.com/v1"`:Anthropic Messages API 的默认 base URL。
- `DEFAULT_OPENAI_COMPATIBLE_TIMEOUT_SECONDS = 60.0`:默认请求超时(秒)。
- `DEFAULT_OPENAI_COMPATIBLE_MAX_RETRIES = 2`:默认最大重试次数。
- `DEFAULT_OPENAI_COMPATIBLE_MAX_RETRY_DELAY_SECONDS = 1.0`:默认最大重试延迟(秒)。

### RuntimeProviderAuth

```python
@dataclass(frozen=True, slots=True)
class RuntimeProviderAuth:
```

请求发起前"立即解析"出的运行时鉴权信息，用于支持动态凭证（例如 OAuth token 刷新）。`frozen=True` 表示不可变（创建后字段值不能修改），`slots=True` 节省内存。

字段逐一:
- `api_key: str`:必填的 API key(或 bearer token)。
- `base_url: str | None = None`:可选的覆盖 base URL;为 `None` 时使用配置中的默认。
- `headers: Mapping[str, str] | None = None`:额外的静态请求头(如自定义鉴权头)。

### RuntimeProviderAuthResolver

```python
type RuntimeProviderAuthResolver = Callable[[], Awaitable[RuntimeProviderAuth]]
```

类型别名（`type X = ...` 是 Python 3.10+ 的类型别名语法，类似 TypeScript 的 `type X = ...`）：一个无参、返回 `Awaitable[RuntimeProviderAuth]` 的可调用对象（`Callable` 是函数类型注解，`Callable[[参数类型], 返回类型]`，类似 Go 的 `func(参数类型) 返回类型` 或 TypeScript 的 `(参数类型) => 返回类型`；`Awaitable` 表示可以通过 `await` 等待结果的异步对象）。它代表"按需异步解析运行时凭证"的回调，供 `OpenAICompatibleConfig` / `AnthropicConfig` 的 `credential_resolver` 字段使用。

### OpenAICompatibleConfig

```python
@dataclass(frozen=True, slots=True)
class OpenAICompatibleConfig:
```

描述一个 OpenAI 兼容（即遵循 OpenAI API 格式规范的第三方端点，如 DeepSeek、Qwen、OpenRouter 等）chat completions 端点的完整配置。`frozen=True, slots=True`。

字段逐一:
- `api_key: str`:必填 API key。
- `base_url: str = DEFAULT_OPENAI_COMPATIBLE_BASE_URL`:端点地址,默认官方 OpenAI v1。
- `headers: Mapping[str, str] | None = None`:附加请求头。
- `timeout_seconds: float = DEFAULT_OPENAI_COMPATIBLE_TIMEOUT_SECONDS`:单次请求超时(默认 60s)。
- `max_retries: int = DEFAULT_OPENAI_COMPATIBLE_MAX_RETRIES`:最大重试次数(默认 2)。
- `max_retry_delay_seconds: float = DEFAULT_OPENAI_COMPATIBLE_MAX_RETRY_DELAY_SECONDS`:重试间最大延迟(默认 1s)。
- `api: str = "openai-completions"`:API 风格标识,用于区分不同的兼容实现。
- `max_tokens: int | None = None`:可选生成长度上限。
- `reasoning_effort: str | None = None`:可选推理强度(如 "low"/"high")。
- `reasoning_effort_parameter: str = "reasoning_effort"`:发送到 API 的推理强度参数名。
- `thinking_format: str = "openai"`:思考内容(chain-of-thought)的格式化方式。
- `compat: Mapping[str, JSONValue] = field(default_factory=dict)`:传给底层 SDK 的额外兼容参数，默认为空 dict（`default_factory` 避免多个实例共享同一个可变对象）。
- `include_reasoning_effort_none: bool = False`:是否显式发送 `reasoning_effort=null`。
- `provider_name: str = "OpenAI-compatible provider"`:用于日志/错误的可读名称。
- `omit_authorization_header: bool = False`:某些兼容端点不需要 `Authorization` 头时为 `True`。
- `credential_resolver: RuntimeProviderAuthResolver | None = None`:可选的运行时凭证解析回调。

### AnthropicConfig

```python
@dataclass(frozen=True, slots=True)
class AnthropicConfig:
```

描述 Anthropic Messages API 的配置。`frozen=True, slots=True`。

字段逐一:
- `api_key: str`:必填 API key。
- `bearer_auth: bool = False`:是否使用 Bearer 鉴权(否则使用 Anthropic 的 `x-api-key` 头风格)。
- `base_url: str = DEFAULT_ANTHROPIC_BASE_URL`:默认 `https://api.anthropic.com/v1`。
- `headers: Mapping[str, str] | None = None`:附加请求头。
- `timeout_seconds: float = DEFAULT_OPENAI_COMPATIBLE_TIMEOUT_SECONDS`:默认 60s。
- `max_retries: int = DEFAULT_OPENAI_COMPATIBLE_MAX_RETRIES`:默认 2。
- `max_retry_delay_seconds: float = DEFAULT_OPENAI_COMPATIBLE_MAX_RETRY_DELAY_SECONDS`:默认 1s。
- `max_tokens: int | None = None`:生成长度上限。
- `thinking_budget_tokens: int | None = None`:扩展思考(token budget)的预算。
- `thinking_effort: str | None = None`:思考强度档位。
- `thinking_mode: str = "budget"`:思考模式(默认基于预算)。
- `provider_name: str = "Anthropic"`:可读名称。
- `oauth_system_prompt: str | None = None`:OAuth 场景下的系统提示覆盖。
- `credential_resolver: RuntimeProviderAuthResolver | None = None`:运行时凭证解析回调。

### openai_compatible_config_from_env

```python
def openai_compatible_config_from_env(
    *,
    api_key_var: str = "OPENAI_API_KEY",
    base_url_var: str = "OPENAI_BASE_URL",
    timeout_seconds_var: str = "OPENAI_TIMEOUT_SECONDS",
    max_retries_var: str = "OPENAI_MAX_RETRIES",
    max_retry_delay_seconds_var: str = "OPENAI_MAX_RETRY_DELAY_SECONDS",
    default_timeout_seconds: float = DEFAULT_OPENAI_COMPATIBLE_TIMEOUT_SECONDS,
    default_max_retries: int = DEFAULT_OPENAI_COMPATIBLE_MAX_RETRIES,
    default_max_retry_delay_seconds: float = DEFAULT_OPENAI_COMPATIBLE_MAX_RETRY_DELAY_SECONDS,
) -> OpenAICompatibleConfig:
```

作用:从环境变量构造 `OpenAICompatibleConfig`,是"无配置运行"的入口。

关键实现步骤:
1. 调用 `environ.get(api_key_var)` 读取 API key;若为空(缺失或空字符串),直接抛 `RuntimeError("Missing required environment variable: ...")`,API key 为强制项。
2. 调 `_timeout_seconds_from_env(timeout_seconds_var, default_timeout_seconds)` 解析超时。
3. 调 `_non_negative_int_from_env(max_retries_var, default_max_retries)` 解析重试次数。
4. 调 `_non_negative_float_from_env(max_retry_delay_seconds_var, default_max_retry_delay_seconds)` 解析重试延迟。
5. 返回 `OpenAICompatibleConfig`:`base_url` 取自 `environ.get(base_url_var, 默认值)` 并 `.rstrip("/")` 去掉尾部斜杠;其余数值来自上述解析结果。
6. 所有参数均为 keyword-only(`*`),强调显式传参。注意本函数只填了 `api_key/base_url/timeout_seconds/max_retries/max_retry_delay_seconds` 五个字段,其余字段保留 dataclass 默认值。

### _timeout_seconds_from_env

```python
def _timeout_seconds_from_env(name: str, default: float) -> float:
```

作用:把名为 `name` 的环境变量解析为正浮点超时值。

关键实现分支:
1. `raw = environ.get(name)`,若为 `None` 直接返回 `default`。
2. 否则 `float(raw)`,捕获 `ValueError` 抛 `RuntimeError("Environment variable must be a number: {name}")`,并 `from exc` 保留链。
3. 若 `timeout_seconds <= 0`,抛 `RuntimeError("Environment variable must be greater than 0: {name}")`。
4. 否则返回该浮点值。

### _non_negative_int_from_env

```python
def _non_negative_int_from_env(name: str, default: int) -> int:
```

作用:把环境变量解析为非负整数(用于重试次数)。

关键实现分支:
1. `raw = environ.get(name)`,`None` 返回 `default`。
2. `int(raw)`,`ValueError` 抛 `RuntimeError("Environment variable must be an integer: {name}")`。
3. 若 `value < 0`,抛 `RuntimeError("Environment variable must be 0 or greater: {name}")`。
4. 返回整数。

### _non_negative_float_from_env

```python
def _non_negative_float_from_env(name: str, default: float) -> float:
```

作用:把环境变量解析为非负浮点(用于重试延迟)。

关键实现分支:
1. `raw = environ.get(name)`,`None` 返回 `default`。
2. `float(raw)`,`ValueError` 抛 `RuntimeError("Environment variable must be a number: {name}")`。
3. 若 `value < 0`,抛 `RuntimeError("Environment variable must be 0 or greater: {name}")`。
4. 返回浮点。

> **为什么这样设计**：本文件实际只定义了 `openai_compatible_config_from_env` 一个 `from_env` 入口(以及三个私有解析辅助)。源码中**并没有** `anthropic_env_config` / `google_env_config` / `mistral_env_config` / `openai_codex_env_config` 这些独立函数——Anthropic/Google/Mistral/Codex 的环境读取由各 provider 模块自身负责。其原因在于：OpenAI 兼容类 provider 共享同一套 `base_url`/`api_key`/`timeout` 等字段，故可提炼出单一通用入口；而 Anthropic 需 `x-api-key`、Codex 走 OAuth 会话令牌、Google 把 key 放在 query 中，各厂鉴权形态差异显著，其配置构造逻辑与 provider 实现紧耦合，留在各自模块内反而更内聚、更易维护。

## 文件:http_errors.py

本文件负责把 provider 返回的 HTTP 错误响应，转换成"对使用者可读、且不含密钥"的错误信息。核心思路：优先从 JSON 体内提取结构化 message/code，提取不到再回退到原始 body 的截断文本；解析全程不触碰 `api_key` 等敏感字段，因此天然安全脱敏。

### provider_http_error_message

```python
def provider_http_error_message(
    *,
    provider_name: str,
    status_code: int,
    body: str,
    model: str | None = None,
) -> str:
```

作用:返回一条可操作的、无密钥的 HTTP 错误消息。keyword-only 参数。

关键实现步骤:
1. 构造 `prefix = f"{provider_name} request failed with status {status_code}"`。
2. 若 `model` 非空,把 prefix 扩展为 `... for model {model}`,便于定位是哪个模型报错。
3. 调 `provider_http_error_detail(body)` 取得精简 detail。
4. 若 detail 非空,返回 `f"{prefix}: {detail}"`;否则只返回 prefix(此时 body 为空或无可提取内容)。

### provider_http_error_detail

```python
def provider_http_error_detail(body: str) -> str:
```

作用:从 HTTP 响应体提取精简的、provider 给出的错误细节。

关键实现步骤:
1. 调 `_loads_object(body)` 尝试按 JSON 解析;若结果是 mapping 则进入结构化提取。
2. 若 `parsed is not None`,调 `provider_error_detail_from_mapping(parsed)`;若得到非空字符串则直接返回。
3. 否则回退:`body.strip()[:_MAX_ERROR_DETAIL_LENGTH]`,即去掉首尾空白并截断到 1000 字符,避免把超大/任意 body 直接透出。

### provider_error_detail_from_mapping

```python
def provider_error_detail_from_mapping(value: Mapping[str, Any]) -> str:
```

作用:从一个 provider 错误对象(通常是解析后的 JSON dict)里挑出最有价值的 message 或 code 文本。

关键实现步骤(按优先级):
1. 取 `value.get("error")`;若它是 `Mapping`(嵌套错误对象):
   - 先取 `error.get("message")`,若为非空字符串则返回。
   - 否则取 `error.get("code")`,若为非空字符串则返回(OpenAI/Anthropic 等常以 code 表示错误类型)。
2. 否则遍历顶层键 `("message", "detail", "error")`:
   - 若对应值是非空字符串,直接返回(兼容不同 provider 的字段名)。
   - 若对应值是 `Mapping`,递归调用本函数从嵌套结构中再提一次,非空即返回。
3. 都没找到则返回空字符串 `""`(交由上层回退到原始 body)。

### _loads_object

```python
def _loads_object(value: str) -> Mapping[str, Any] | None:
```

作用:把字符串按 JSON 解析,但只在它是对象(dict)时才返回,否则返回 `None`。

关键实现步骤:
1. `loads(value)` 解析,捕获 `JSONDecodeError` 返回 `None`(非 JSON 文本,如纯文本或 HTML 错误页)。
2. 若解析成功且结果 `isinstance(parsed, Mapping)` 则返回该 dict,否则返回 `None`(拒绝 list/number 等非对象顶层)。

### 安全脱敏说明

本模块不读取、不打印任何 `Authorization`/`api_key`/`x-api-key` 类字段：它只从 `error/message/detail/code` 等"错误描述"字段取值，且对任何提取结果不附加凭证信息；即便回退到原始 body，也只是截断文本透出。其设计依据是"最小暴露面"：调用方传入的 `body` 本就可能包含密钥，模块以白名单字段提取 + 长度截断两道防线确保敏感数据不会经错误路径外泄，从而让上层的错误展示与日志收集默认即安全。

## 文件:__init__.py

本文件是 `tau_ai` 包的公开门面（facade，即统一的对外接口）。它把各 provider 的实现类、环境配置辅助、Pi 兼容的流式事件类型、provider 抽象基类，统一 `import` 到一个命名空间下，并通过 `__all__` 声明导出面，使上层代码只需 `from tau_ai import ...` 即可拿到所有常用符号，无需深入子模块。

### 导入聚合

文件顶部从以下子模块导入并重新导出:

- `tau_ai.anthropic`:`AnthropicProvider`(Anthropic provider 实现类)。
- `tau_ai.env`:`DEFAULT_ANTHROPIC_BASE_URL`、`DEFAULT_OPENAI_COMPATIBLE_MAX_RETRIES`、`DEFAULT_OPENAI_COMPATIBLE_MAX_RETRY_DELAY_SECONDS`、`DEFAULT_OPENAI_COMPATIBLE_TIMEOUT_SECONDS`、`AnthropicConfig`、`OpenAICompatibleConfig`、`RuntimeProviderAuth`、`openai_compatible_config_from_env`(环境配置入口与默认值常量)。
- `tau_ai.events`:`AssistantDoneEvent`、`AssistantErrorEvent`、`AssistantMessageEvent`、`AssistantStartEvent`、`TextDeltaEvent`、`TextEndEvent`、`TextStartEvent`、`ThinkingDeltaEvent`、`ThinkingEndEvent`、`ThinkingStartEvent`、`ToolCallDeltaEvent`、`ToolCallEndEvent`、`ToolCallStartEvent`(Pi 兼容的流式响应事件类型，由 `tau_agent.provider_events` 真正定义，此处为 re-export)。
- `tau_ai.fake`:`FakeProvider`(确定性测试用假 provider)。
- `tau_ai.google`:`GoogleGenerativeAIProvider`(Google 实现类)。
- `tau_ai.mistral`:`MistralConversationsProvider`(Mistral 实现类)。
- `tau_ai.openai_codex`:`DEFAULT_OPENAI_CODEX_BASE_URL`、`OpenAICodexConfig`、`OpenAICodexCredentials`、`OpenAICodexProvider`(Codex provider 的配置、凭证与实现类)。
- `tau_ai.openai_compatible`:`OpenAICompatibleProvider`(OpenAI 兼容端点实现类)。
- `tau_ai.provider`:`CancellationToken`、`ModelProvider`(取消令牌与 provider 抽象基类，由 `tau_agent.provider` 真正定义，此处为 re-export)。

### __all__

`__init__.py` 使用动态推导：`__all__ = [name for name in globals() if not name.startswith("_")]`，即导出所有顶层公开名称，而非硬编码列表。

导出面构成:
- 抽象与基础:`CancellationToken`、`ModelProvider`(来自 `provider`，源头为 `tau_agent.provider`)。
- 配置与默认值:`AnthropicConfig`、`OpenAICompatibleConfig`、`RuntimeProviderAuth`、`openai_compatible_config_from_env`,以及 5 个 `DEFAULT_*` 常量(来自 `env`)。
- 各 provider 实现类:`AnthropicProvider`、`FakeProvider`、`GoogleGenerativeAIProvider`、`MistralConversationsProvider`、`OpenAICodexProvider`、`OpenAICompatibleProvider`。
- Codex 专用配置/凭证:`OpenAICodexConfig`、`OpenAICodexCredentials`、`DEFAULT_OPENAI_CODEX_BASE_URL`。
- 事件类型:Pi 兼容的流式事件（`AssistantStartEvent`、`TextDeltaEvent`、`ThinkingDeltaEvent`、`ToolCallStartEvent`、`AssistantDoneEvent` 等，来自 `events`，源头为 `tau_agent.provider_events`）。

### 与"统一导入面"的串联

值得注意:任务中提到的 `anthropic_provider` / `openai_compatible_provider` / `google_provider` / `mistral_provider` / `openai_codex_provider` / `fake_provider` 这类"工厂函数"命名,在 `__init__.py` 实际源码中**并不存在**。真实导出的是各 provider 的**实现类**(`AnthropicProvider`、`OpenAICompatibleProvider`、`GoogleGenerativeAIProvider`、`MistralConversationsProvider`、`OpenAICodexProvider`、`FakeProvider`)与环境配置入口 `openai_compatible_config_from_env`。也就是说,统一导入面是通过"类名 + 配置 dataclass"而非"工厂函数"来聚合的,使用者一般先由 `env` 模块从环境变量构造配置,再把配置实例传给对应 provider 类的构造器。剖析严格基于源码现状。

---

<!-- NAV -->
[← tau_ai · Provider 契约与事件流]({{< relref "./ai-provider-events.md" >}})
[↑ 总览]({{< relref "./source-walkthrough.md" >}})
[→ tau_ai · 各 Provider 实现]({{< relref "./ai-providers.md" >}})
