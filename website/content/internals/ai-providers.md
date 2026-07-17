---
title: tau_ai · 各 Provider 实现
description: openai_compatible / anthropic / google / mistral / openai_codex / fake
code_files:
  - tau_ai/stream.py
  - tau_ai/openai_compatible.py
  - tau_ai/anthropic.py
  - tau_ai/google.py
  - tau_ai/mistral.py
  - tau_ai/openai_codex.py
  - tau_ai/fake.py
---

本页介绍 `tau_ai` 层的六个具体 provider 实现：它们是 `ModelProvider` 接口的具体实现，负责与各家 LLM 服务通信。每个 provider 内部处理了不同的 API 格式、鉴权方式、工具调用编码和思考（thinking，即模型在回答前的内部推理过程，如 o1、Claude 的扩展思考）格式差异，但对外暴露的接口完全一致——`stream_response` 返回 `AsyncIterator[AssistantMessageEvent]`，即 Pi 规范的助手消息事件流。

## 双层事件架构：`ProviderEvent` → Pi 事件

所有 provider 内部的 parser（解析器）仍产出一套**过渡性**事件类型：`ProviderTextDeltaEvent`、`ProviderThinkingDeltaEvent`、`ProviderToolCallEvent`、`ProviderResponseStartEvent`、`ProviderResponseEndEvent`、`ProviderErrorEvent`、`ProviderRetryEvent`。这些事件是 parser 与 HTTP 信封之间的契约——parser 只管"把原生 SSE 块转成什么"，不关心上层如何消费。

`stream.py` 中的 `canonicalize_provider_stream` 负责**桥接**：消费上述 `ProviderEvent` 流，产出 Pi 规范的 `AssistantMessageEvent` 子类型：

| ProviderEvent（过渡层） | Pi 事件（公开层） | 说明 |
|---|---|---|
| `ProviderRetryEvent` | *(跳过)* | 重试是 provider 内部行为，不暴露给上层 |
| `ProviderResponseStartEvent` | `AssistantStartEvent` | 标记一次助手响应的开始 |
| `ProviderTextDeltaEvent` | `TextStartEvent` → `TextDeltaEvent` (×N) | 首次出现文本时发 `TextStart`，后续每个片段发 `TextDelta` |
| `ProviderThinkingDeltaEvent` | `ThinkingStartEvent` → `ThinkingDeltaEvent` (×N) | 同上，思考内容 |
| `ProviderToolCallEvent` | `ToolCallStartEvent` → `ToolCallEndEvent` | 工具调用在 finalize 阶段一次性发出 |
| `ProviderResponseEndEvent` | `TextEndEvent` / `ThinkingEndEvent` + `AssistantDoneEvent` | 收尾所有活跃块，发最终消息 |
| `ProviderErrorEvent` | `AssistantErrorEvent` | 错误转为 Pi 错误事件 |

每个 Pi 事件都携带 `partial`（当前 `AssistantMessage` 的深拷贝快照），让上层可以增量构建完整消息。`stream.py` 还负责统一 `api`/`provider`/`model` 元数据，以及把 finish_reason 映射成 Pi 的 `"stop"`/`"length"`/`"toolUse"` 三值枚举。

## `tau_ai/openai_compatible.py` — OpenAI 系"总管"

最大的 provider（约 1000 行），因为它要同时支持 **两个 API 形态**（`/chat/completions` 和 `/v1/responses`）与多种"思考格式"（不同厂商对推理过程的编码方式各不相同）。这里所说的"OpenAI 兼容"指的是那些遵循 OpenAI API 格式规范的第三方服务——它们的请求/响应结构与 OpenAI 类似，但在推理字段名、工具调用格式、token（LLM 处理文本的最小单位）用量上报等细节上各有差异。

- 模块常量 `_RESPONSES_ONLY_PREFIXES = ("gpt-5.5", "gpt-5.4")`。
- **`_use_responses_api(model)`**：路由判断——`"codex"` 出现在模型名里，或模型名
  以 `gpt-5.5`/`gpt-5.4` 开头，则走 `/v1/responses`；否则走 `/chat/completions`。
  原因注释写得很清楚：新版推理模型在 `/chat/completions` 上不接受
  "function tools + reasoning_effort" 的组合，必须换 Responses API。

### `OpenAICompatibleProvider`

- **`__init__(config, *, client=None)`**：持有 `OpenAICompatibleConfig`；若外部没
  传 `client`，则自己创建并在 `aclose()` 时关闭（`_owns_client` 标志）。
- **`stream_response(...)`**：返回 Pi 事件流。内部先调 `_stream_provider_events(...)` 拿到过渡性 `ProviderEvent` 流，再经 `canonicalize_provider_stream` 桥接为 `AssistantMessageEvent`。
- **`_stream_provider_events(...)`**：按模型名/配置判断走 `_stream_responses` 还是
  `_stream_chat_completions`，二者都调用统一的 `_stream(...)`，产出过渡性 `ProviderEvent`。
- **`_stream_chat_completions` / `_stream_responses`**：各自用
  `_build_chat_payload` / `_build_responses_payload` 构造请求体，再交给 `_stream`
  并以不同的 parser 工厂（`_ChatStreamParser` / `_ResponsesStreamParser`）解析。
- **`_stream(model, url, payload, parser_factory, signal)`**：真正的共享"流式
  POST + 重试外壳"。HTTP、状态码/网络重试、取消、开头的 `response_start` 事件
  **对所有端点完全一致**；端点差异（SSE 分块解析、最终消息组装）全塞进
  `_StreamParser` 协议里。关键细节：
  - 支持 `credential_resolver`：调用前异步解析出 `api_key`/`headers`/`base_url`，
    动态改写请求地址（按 URL 结尾决定拼 `/responses` 还是 `/chat/completions`）。
  - 重试包在 `while True` 里，`_should_retry` 基于 `max_retries` 与瞬态状态码；
    每次重试先 `yield ProviderRetryEvent` 再 `wait_for_retry`（可被取消）。
  - 逐行 `aiter_lines()`，每行用 `_parse_sse_line` 取 `data:` 后内容，喂给
    `parser.feed(event)`；parser 返回 `(events, stop)`，遇到 `[DONE]`/`completed`
    就 `break`。
  - parser 若 `fatal`（如非法 JSON chunk），外壳直接 `return` 不再 `finalize()`。

### 两个 parser（解析器）

每个 API 形态有独立的 SSE（Server-Sent Events，服务端向客户端推送的事件流）解析器，负责把流式返回的原始 JSON 块转换成 `ProviderEvent`：

- **`_ChatStreamParser`**：处理 `/chat/completions` 的 `choices[0].delta` 分块。累积文本片段、工具调用构建器（按 `index` 分桶）；思考内容依次尝试 `reasoning_content`/`reasoning`/`thinking` 三个字段名（因为不同厂商用不同的字段名传递思考过程）。`finalize()` 把所有工具调用拼成 `ProviderToolCallEvent`，再发 `ProviderResponseEndEvent`（内含完整 `AssistantMessage`）。token 用量优先从 chunk 顶层 `usage` 取，否则从 choice 的 `usage` 取（兼容 Moonshot 等厂商的不同上报位置）。
- **`_ResponsesStreamParser`**：处理 `/v1/responses`（没有 `[DONE]` 哨兵行，靠 `response.completed/incomplete/failed` 终态事件收尾）。按事件类型累积文本、思考和工具调用；`finalize()` 类似。

两个 `_ToolCallBuilder` / `_ResponsesToolCallBuilder`：把流式到达的零散
`id`/`name`/参数片段拼接成完整 `ToolCall`；参数文本 `loads` 失败则回落到
`{"_raw_arguments": 原文}`，保证事件永远可构造。

### payload（请求体）构造与各家兼容

不同厂商虽然"兼容" OpenAI 格式，但在推理字段名、`max_tokens` 字段名、thinking 格式、token 用量上报位置等细节上各不相同。这个文件通过 `compat` 配置参数来处理这些差异：

- **`_build_chat_payload`**：组装请求体，按 `compat` 配置决定是否带 `stream_options.include_usage`、`store`、`max_tokens` 字段名（有的厂商用 `max_tokens`，有的用 `max_completion_tokens`）；`_apply_chat_reasoning` 针对 `zai`/`qwen`/`deepseek`/`openrouter`/`together`/原生等**不同"思考格式"**写入不同的 reasoning 字段；最后带 `tools`。
- **`_build_responses_payload`**：用 `instructions` 当 system，把消息转成 Responses 的 `input`（function_call / function_call_output），`store: false` 保持无状态（每轮重发整段对话历史），带 `reasoning.summary: auto` 让思考过程对用户可见。
- 大量辅助函数：`_message_to_openai`、`_tool_to_openai`、`_tool_call_to_openai`、
  `_messages_to_responses_input`、`_tool_to_responses`、`_normalize_responses_effort`、
  `_normalize_finish_reason`（把 Responses 状态映射成 chat 风格的
  `stop`/`length`/`tool_calls`）、`_parse_chunk_usage` / `_usage_from_responses_event`
  （把各家 usage 解析进 `Usage`，并遵守"None=未上报"约定，cost 一律留空）。

> **为什么这样设计**：这个文件的复杂之处在于"一套代码适配很多 OpenAI 兼容后端"。其根源是 OpenAI 的 chat/completions 协议虽被各厂商"兼容"，但推理字段、`max_tokens` 的字段名、thinking 格式、token 用量上报位置在 Mistral/DeepSeek/Qwen/OpenRouter/Together 等实现间各不相同。统一信封（即 `_stream` 方法）只承载真正不变的 HTTP/重试/取消逻辑，而把所有"兼容差异"压进 `_apply_chat_reasoning` 等 `compat` 分支，使新增后端只改一处而非重写整条流。

---

## `tau_ai/anthropic.py` — Anthropic Messages API

Anthropic（Claude 的开发商）有自己独特的 API 格式，与 OpenAI 差异较大：

- **`ANTHROPIC_VERSION = "2023-06-01"`、`DEFAULT_MAX_TOKENS = 4096`**。
- **`AnthropicProvider`**：结构与 OpenAI 系一致（`__init__`/`aclose`/`stream_response`/`_get_client`/`_should_retry`），但**没有拆出共享 `_stream`**——它把流式外壳直接写进 `iterator()`。这套差异并非随意，而是 Anthropic Messages API 的硬性约束（见官方文档 https://docs.anthropic.com）：
  - 鉴权默认用 `x-api-key`（Anthropic 的专属请求头，而非 OpenAI 的 Bearer 体系），
    `bearer_auth=True` 时改用 `Authorization: Bearer`；`anthropic-version` 头是
    Anthropic API 强制要求的协议版本标识，必须随每个请求发送。
  - `credential_resolver` 解析后，若 `base_url` 不以 `/v1` 结尾会补上，以匹配
    Anthropic 端点约定。
  - 逐事件处理 Anthropic 的 SSE 类型：`message_start`（取初始 usage）、
    `content_block_start`（tool_use 块起）、`content_block_delta`
    （`text_delta`/`thinking_delta`/`input_json_delta`）、`message_delta`
    （`stop_reason` + usage）、`error`。思考内容走 `thinking_delta`——这是 Anthropic
    扩展思考（extended thinking）原生的事件通道。
- **`_AnthropicToolBuilder`**：同 OpenAI 的 builder，拼接 tool call。
- **`_build_messages_payload`**：`system` 可为纯字符串或（带 oauth 前缀时）两段
  text 列表；`thinking` 支持两种模式——`adaptive`（发 `{"type": "adaptive",
  "display": "summarized"}` 并配 `output_config: {effort: ...}`）与 `budget`
  （当 `thinking_mode == "budget"` 且 `thinking_budget_tokens` 非空时发
  `{"type": "enabled", "budget_tokens": ...}`）；带 `tools`。`_anthropic_message`/
  `_anthropic_tool` 做消息/工具转换，ToolResult 转成 `tool_result` 块，
  `is_error = not message.ok`。
- **`_usage_from_message_start` / `_apply_message_delta_usage`**：把 Anthropic 的
  `input_tokens`/`output_tokens`/`cache_read_input_tokens`/
  `cache_creation_input_tokens` 映射到 `Usage`，并支持 `cache_creation.ephemeral_1h`
  的 1 小时缓存写入；只覆盖 provider 实际上报的字段，再重算 total。

---

## `tau_ai/google.py` — Google Generative AI

Google 的 Gemini API 有完全不同于 OpenAI/Anthropic 的端点和请求格式：

- **`GoogleGenerativeAIProvider`**：URL 形如 `{base_url}/models/{model}:streamGenerateContent?alt=sse&key={api_key}`。这是 Gemini Generative Language API 的固有形态（见官方文档 https://ai.google.dev）：API key 通过 query 参数 `key=` 而非 `Authorization` 头传递，且流式通过 `alt=sse` 触发。provider 严格按此约定拼接，不引入自定义鉴权头。
- **`_GoogleStreamParser`**：按 `candidates[0].content.parts` 解析；`text` 部分若
  `part.thought is True` 当作思考（`ProviderThinkingDeltaEvent`），否则正文；
  `functionCall` 部分直接构造 `ToolCall`（支持 `thoughtSignature`）。
- **`_build_google_payload`**：用 `systemInstruction` 承载 system；按模型族
  （Gemini 3 Pro/Flash、Gemma 4、2.5 系列）通过 `_google_thinking_config` 写入
  不同的 `thinkingConfig`（`thinkingLevel`/`thinkingBudget`/`includeThoughts`）。
  `_sanitize_google_schema` 会**剔除 Gemini 的 OpenAPI 子集解析器不支持的
  JSON Schema 关键字**（`additionalProperties`、`$schema`）。
- `_message_to_google` 把 ToolResult 转成 `functionResponse` 角色为 `user`；
  `_normalize_finish_reason` 把 `MAX_TOKENS`/`MODEL_ARMOR`/`RECITATION` 映射成
  `length`。

---

## `tau_ai/mistral.py` — Mistral Conversations

Mistral 的 API 最接近 OpenAI 的 chat-completions 格式，但有自己的扩展：

- **`MistralConversationsProvider`**：拆出了自己的 `_stream(...)` 外壳（与 OpenAI 的类似），URL 为 `{base_url}/chat/completions`（自动补 `/v1`）。Mistral 的 Conversations API 在兼容 OpenAI chat-completions 形态的基础上，额外支持 `content` 为列表的混合 text / thinking 分块（见官方文档 https://docs.mistral.ai），因此解析器需扩展 `_content_deltas` / `_thinking_deltas` 以兼容列表形式的 delta。
- **`_MistralStreamParser`**：与 chat-completions 解析几乎一致；额外支持
  `content` 为 list（混合 text / `type: "thinking"` 块）的情况
  （`_content_deltas` / `_thinking_deltas`），以及 `tool_calls` 或 `toolCalls`
  两种键名。
- **`_build_mistral_payload`**：reasoning 通过 `reasoning_effort: "high"` 或
  `prompt_mode: "reasoning"` 开启（按 `_uses_reasoning_effort` 模型名单选择）；
  工具带 `strict: False`；`tool` 的 `ToolCall` builder 在 `arguments` 是 dict 时
  会 `dumps` 成字符串再拼接。

---

## `tau_ai/openai_codex.py` — ChatGPT 订阅版 Codex

OpenAI Codex 是面向 ChatGPT Plus/Pro 订阅用户的编码助手，它走的是 ChatGPT 的后端接口而非标准的 OpenAI API：

- **`DEFAULT_OPENAI_CODEX_BASE_URL = "https://chatgpt.com/backend-api"`**。
- **`OpenAICodexCredentials`**（frozen dataclass）：`access_token` + `account_id` —— Codex 不走普通 API key，而是 ChatGPT 订阅会话令牌。其根因是 Codex 后端面向 ChatGPT 登录用户而非独立 API 使用者，鉴权依赖浏览器/设备 OAuth 流程换发的会话令牌，故 `credential_resolver`（凭证解析器）必填、且每次请求都重新解析以处理令牌刷新；终端限流还需靠 `_is_terminal_rate_limit` 识别"余额不足/额度耗尽"等不可重试文案（普通 HTTP 429 可重试，但计费耗尽不应无限重试）。
- **`OpenAICodexCredentialResolver`**：`Callable[[], Awaitable[OpenAICodexCredentials]]`。
- **`OpenAICodexConfig`**（frozen dataclass）：`credential_resolver` 必填，
  另含 `base_url`（默认 `DEFAULT_OPENAI_CODEX_BASE_URL`）、`headers`、
  `timeout_seconds`、`max_retries`、`max_retry_delay_seconds`、
  `provider_name`（默认 `"OpenAI Codex"`）、`originator`、`reasoning_effort`、
  `reasoning_summary`（默认 `"auto"`）等。
- **`OpenAICodexProvider`**：每次请求都通过 `credential_resolver()` 取令牌，构造
  带 `chatgpt-account-id` / `originator` / `OpenAI-Beta: responses=experimental`
  等专有头。重试时 `_should_retry` 会调用 `_is_retryable_status`，其中
  `_is_terminal_rate_limit` 识别"余额不足/额度耗尽"等**不可重试**的 429 文案。
- **`_ToolCallBuilder`**：Codex 的 tool call id 是复合的 `call_id|item_id`，
  `build()` 拼成 `f"{call_id}|{item_id}"`；由 `update_from_item` 用完成的 item
  补全元数据。
- **`_codex_provider_events(response, signal)`**：核心解析器，用三个索引表
  （`by_item_id`/`by_call_id`/`by_output_index`）+ `active_tools` 跟踪进行中的
  tool builder，处理 `response.output_item.added`、各类 `delta`、
  `response.output_item.done` 等事件，最后发 `ProviderResponseEndEvent`。
  `_iter_sse_objects` 支持多行 `data:` 拼接（Codex 偶尔分多行发送 JSON）。
- payload 用 Responses 风格 `input`：本模块**自带**一份 `_messages_to_responses_input`
  （与 `openai_compatible.py` 中的同名函数独立实现，而非复用），专门处理复合 id
  拆分 `_split_tool_call_id`；其余字段 `store: false`、带 `reasoning`、
  `parallel_tool_calls: true`。

---

## `tau_ai/fake.py` — 确定性测试 provider

用于单元测试的假 provider，不发起任何网络请求：

- **`FakeProvider`**：构造时吃一组"脚本化事件流"。每次 `stream_response` **消费下一条脚本流**，原样 yield 出去（`yield` 是 Python 的生成器语法，函数每次 yield 一个值并暂停，调用方可以用 `for` 循环逐个消费，类似 Go 的 channel 发送或 JavaScript 的 generator `yield`）；同时把入参 `(model, system, messages, tools)` 记进 `self.calls` 供测试断言。**无任何网络调用**。这是 agent-loop 测试的关键——让模型行为完全确定，测试可以可靠地验证 agent 的行为逻辑。

---

## 本部分小结

六个 provider 殊途同归：无论后端是 OpenAI、Anthropic、Google、Mistral、Codex，还是测试用的 Fake，它们的 `stream_response` 都返回 `AsyncIterator[AssistantMessageEvent]`——即 Pi 规范的助手消息事件流。内部 parser 产出的过渡性 `ProviderEvent` 经 `stream.py` 的 `canonicalize_provider_stream` 统一桥接为 `AssistantStartEvent` / `TextDeltaEvent` / `ThinkingDeltaEvent` / `ToolCallStartEvent` / `AssistantDoneEvent` 等 Pi 事件。差异被彻底吸收在各文件的 parser（解析器）与 payload（请求体）构造里。这正是契约设计的价值：上层 `tau_agent` 永远不必关心"现在用的是哪家模型"——它只依赖一份稳定、可枚举的事件词汇表，新增或替换模型后端时无需触动上层逻辑。

## 逐方法深度剖析（各 provider 实现）

> 以下是各 provider 实现的逐方法展开。如果你已经理解了上面的概述，可以跳过本节；如果你需要知道每个函数的具体实现细节，请继续阅读。

## 文件:openai_compatible.py

该文件是覆盖绝大多数 OpenAI 兼容端点的"总适配器"。核心策略：通过 `stream_response` 在请求时按模型名路由到两种底层协议——标准 `/chat/completions` 或 `/v1/responses`——二者共用同一个 HTTP/重试/取消信封（由 `OpenAICompatibleProvider._stream` 实现），只是各自提供不同的 `_StreamParser` 解析器。其余 provider（anthropic/google/mistral/codex）都偏离了这一基类：它们没有这种端点路由，且各自有独立的请求体构造、工具 schema 格式和流式事件映射。

模块级常量与函数:

#### `_RESPONSES_ONLY_PREFIXES: tuple[str, ...]`
模块级常量,值为 `("gpt-5.5", "gpt-5.4")`,记录那些在 `/chat/completions` 上拒绝“函数工具 + reasoning_effort”组合、必须在 `/v1/responses` 上服务的模型前缀。

#### `_use_responses_api(model: str) -> bool`
判断给定 `model` 是否必须走 Responses API。把模型名 `strip().lower()` 后,若包含子串 `"codex"` 直接返回 `True`(所有 codex 家族模型强制走 responses);否则若以小写化后与前缀元组任一成员 `startswith` 匹配也返回 `True`,其余返回 `False`。

### OpenAICompatibleProvider

`OpenAICompatibleConfig` 驱动的通用适配器,支持 chat-completions 与 responses 双协议。

#### `__init__(self, config: OpenAICompatibleConfig, *, client: httpx.AsyncClient | None = None) -> None`
保存 `config`,若调用方未传入 `client` 则置 `None` 并记 `self._owns_client = True`(之后由 `_get_client` 惰性创建、由 `aclose` 负责关闭);传入则 `_owns_client = False`。

```python
def __init__(self, config, *, client=None):
    self._config = config
    self._client = client
    self._owns_client = client is None
```

这段代码说明了 client 的"拥有权"约定:只有自己创建的 client 才在 `aclose` 时关闭,外部注入的不会被动关掉。

#### `async def aclose(self) -> None`
若该 provider 自己创建了 client(`_owns_client`)且尚未关闭,则 `await self._client.aclose()` 并置 `None`。

#### `def stream_response(self, *, model: str, system: str, messages: list[AgentMessage], tools: list[AgentTool], signal: CancellationToken | None = None) -> AsyncIterator[AssistantMessageEvent]`
公共入口，返回 **Pi 规范的事件流**。内部先调 `_stream_provider_events(...)` 拿到过渡性 `ProviderEvent` 流，再经 `canonicalize_provider_stream` 桥接为 Pi 事件：

```python
def stream_response(self, *, model, system, messages, tools, signal=None):
    raw = self._stream_provider_events(
        model=model, system=system, messages=messages, tools=tools, signal=signal
    )
    return canonicalize_provider_stream(
        raw,
        api=self._config.api,
        provider=getattr(self._config, "provider_name", "openai-compatible"),
        model=model,
    )
```

这段代码说明了双层设计：`_stream_provider_events` 处理所有协议路由（chat vs responses）与 HTTP 重试，产出过渡性 `ProviderEvent`；`canonicalize_provider_stream` 把它们翻译成 Pi 的 `AssistantStartEvent` / `TextDeltaEvent` / `AssistantDoneEvent` 等，上层只需消费 Pi 事件。

#### `def _stream_provider_events(self, *, model, system, messages, tools, signal=None) -> AsyncIterator[ProviderEvent]`
内部路由：若 `config.api == "openai-responses"` 或 `_use_responses_api(model)` 为真，调 `_stream_responses(...)`，否则调 `_stream_chat_completions(...)`。返回过渡性 `ProviderEvent` 流，供 `stream_response` 桥接。

#### `def _stream_chat_completions(self, *, model, system, messages, tools, signal=None) -> AsyncIterator[ProviderEvent]`
构造 chat-completions payload(`_build_chat_payload`,传入 `reasoning_effort`/`reasoning_effort_parameter`/`thinking_format`/`compat`/`max_tokens`/`include_reasoning_effort_none`),再调用 `_stream`,URL 为 `{base_url}/chat/completions`,`parser_factory=_ChatStreamParser`。

#### `def _stream_responses(self, *, model, system, messages, tools, signal=None) -> AsyncIterator[ProviderEvent]`
构造 responses payload(`_build_responses_payload`),调用 `_stream`,URL 为 `{base_url}/responses`,`parser_factory=_ResponsesStreamParser`。

#### `def _stream(self, *, model, url, payload, parser_factory, signal=None) -> AsyncIterator[ProviderEvent]`
共享流式信封(核心)。内部定义 `async def iterator()`:

```python
def _stream(self, *, model, url, payload, parser_factory, signal=None):
    async def iterator() -> AsyncIterator[ProviderEvent]:
        client = self._get_client()
        api_key = self._config.api_key
        headers = dict(self._config.headers or {})
        if self._config.credential_resolver is not None:
            auth = await self._config.credential_resolver()
            api_key = auth.api_key
            headers.update(auth.headers or {})
            if auth.base_url is not None:
                endpoint = "/responses" if url.rstrip("/").endswith("/responses") else "/chat/completions"
                request_url = f"{auth.base_url.rstrip('/')}{endpoint}"
        if not self._config.omit_authorization_header:
            has_authorization = any(key.casefold() == "authorization" for key in headers)
            if not has_authorization:
                headers["Authorization"] = f"Bearer {api_key}"
        attempt = 0
        while True:
            parser = parser_factory()
            try:
                async with client.stream("POST", request_url, json=payload, headers=headers) as response:
                    if response.status_code >= 400:
                        # ... read body, retry or yield ProviderErrorEvent ...
                        yield ProviderResponseStartEvent(model=model)
                        async for line in response.aiter_lines():
                            if signal is not None and signal.is_cancelled():
                                return
                            event = _parse_sse_line(line)
                            if event is None:
                                continue
                            events, stop = parser.feed(event)
                            for parser_event in events:
                                yield parser_event
                            if stop:
                                break
                        if parser.fatal:
                            return
                        for parser_event in parser.finalize():
                            yield parser_event
                        return
            except httpx.HTTPError as exc:
                # ... retry if not emitted_content else ProviderErrorEvent ...
    return iterator()
```

这段代码说明了共享信封真正干的事:统一拼鉴权头、`credential_resolver` 改写 base_url、重试循环、把每行 SSE 交给 parser,而 HTTP/重试/取消逻辑对所有端点完全相同。
1. 取 client;准备 `api_key` 与 `headers`(基于 `config.headers`)。
2. 若 `config.credential_resolver` 非空,`await` 解析出 `auth`,覆盖 `api_key`、合并 `auth.headers`;若 `auth.base_url` 非空,则按当前 url 末尾是 `/responses` 还是 `/chat/completions` 重建 `request_url`。
3. 若 `config.omit_authorization_header` 为假且 headers 中没有(大小写不敏感)`authorization`,则补 `Authorization: Bearer {api_key}`。
4. `attempt = 0` 进入重试循环,每轮先 `parser = parser_factory()`。
5. `async with client.stream("POST", request_url, json=payload, headers=headers)`（Python 的 `with` 语句是资源管理模式，确保代码块结束后自动释放资源，类似 Go 的 `defer` 或 Java 的 try-with-resources；`async with` 是其异步版本）:若 `status_code >= 400`,`aread` 读 body,`decode(errors="replace")`;若 `_should_retry(attempt, status_code=...)` 则发 `provider_retry_event` 并 `wait_for_retry`,失败则返回、超时则 `continue`;否则发 `ProviderErrorEvent`(由 `provider_http_error_message` 生成)后 `return`。
6. 成功则先发 `ProviderResponseStartEvent(model)`,随后 `async for line in response.aiter_lines()`(每轮先检查 `signal.is_cancelled()`),用 `_parse_sse_line` 解析,非 None 则 `events, stop = parser.feed(event)`,逐个 `yield`,若 `stop` 跳出。
7. 循环后若 `parser.fatal` 为真直接 `return`(解析器已发出终态错误事件,不再 `finalize`),否则 `yield from parser.finalize()`,再 `return`。
8. `except httpx.HTTPError`:若 `not parser.emitted_content and _should_retry(attempt)` 则重试(发 retry event + `wait_for_retry`),否则发 `ProviderErrorEvent` 返回。

#### `def _get_client(self) -> httpx.AsyncClient`
惰性创建:若 `self._client is None` 则 `create_async_client(timeout=config.timeout_seconds)`。

#### `def _should_retry(self, attempt: int, *, status_code: int | None = None) -> bool`
超出 `config.max_retries` 返回 False;否则 `status_code is None` 或 `_is_transient_status(status_code)` 为真时返回 True。

### _StreamParser (Protocol)

解析器的协议类型,定义 `emitted_content: bool`(已发内容则中途断流可重试)、`fatal: bool`(解析器已发终态错误则信封不调 finalize)、`feed(event) -> tuple[list[ProviderEvent], bool]`、`finalize() -> list[ProviderEvent]`。

### _ChatStreamParser

`/chat/completions` 的 SSE 块解析器。

#### `__init__(self) -> None`
初始化 `emitted_content=False`、`fatal=False`、`_content_parts=[]`、`_tool_call_builders: dict[int,_ToolCallBuilder]={}`、`_finish_reason=None`、`_usage=None`。

#### `def feed(self, event: str) -> tuple[list[ProviderEvent], bool]`
1. 若 `event == "[DONE]"` 返回 `([], True)`(停止)。
2. `_loads_object(event)` 失败则置 `self.fatal=True` 并返回 `[ProviderErrorEvent("Provider returned invalid JSON chunk")], True`。
3. 顶层 `chunk["usage"]` 为 Mapping 则 `_parse_chunk_usage` 写入 `self._usage`(处理带 stream_options 的 usage 块)。
4. `_first_choice(chunk)` 取首个 choice;为空返回 `([], False)`。
5. 回退:若顶层无 usage 且 `choice["usage"]` 是 Mapping,也解析它(Moonshot 等把 usage 放到 choice 上)。
6. 更新 `self._finish_reason = choice.get("finish_reason") or self._finish_reason`。
7. `delta = choice["delta"]` 非 Mapping 返回 `([], False)`。
8. `delta["content"]` 是字符串且非空:记 `emitted_content`,追加 `_content_parts`,发 `ProviderTextDeltaEvent`。
9. `_thinking_delta_text(delta)` 若非空:记 emitted_content,发 `ProviderThinkingDeltaEvent`(兼容 reasoning_content/reasoning/thinking 三字段)。
10. 对每个 `_tool_call_deltas(delta)`:记 emitted_content,按 `index` 取/建 `_ToolCallBuilder` 并 `add_delta`。
11. 返回 `(events, False)`。

```python
def feed(self, event):
    if event == "[DONE]":
        return [], True
    chunk = _loads_object(event)
    if chunk is None:
        self.fatal = True
        return [ProviderErrorEvent(message="Provider returned invalid JSON chunk")], True
    chunk_usage = chunk.get("usage")
    if isinstance(chunk_usage, Mapping):
        self._usage = _parse_chunk_usage(chunk_usage)
    choice = _first_choice(chunk)
    if choice is None:
        return [], False
    choice_usage = choice.get("usage")
    if not isinstance(chunk_usage, Mapping) and isinstance(choice_usage, Mapping):
        self._usage = _parse_chunk_usage(choice_usage)  # Moonshot 等回退
    self._finish_reason = choice.get("finish_reason") or self._finish_reason
    delta = choice.get("delta")
    if not isinstance(delta, Mapping):
        return [], False
    events = []
    content = delta.get("content")
    if isinstance(content, str) and content:
        self.emitted_content = True
        self._content_parts.append(content)
        events.append(ProviderTextDeltaEvent(delta=content))
    thinking = _thinking_delta_text(delta)
    if thinking:
        self.emitted_content = True
        events.append(ProviderThinkingDeltaEvent(delta=thinking))
    for tool_call_delta in _tool_call_deltas(delta):
        self.emitted_content = True
        index = int(tool_call_delta.get("index", 0))
        builder = self._tool_call_builders.setdefault(index, _ToolCallBuilder())
        builder.add_delta(tool_call_delta)
    return events, False
```

这段代码说明了 chat 解析器如何从 `choices[0].delta` 抽取文本/thinking/tool call,以及 usage 的双重来源(顶层或 choice 级)。

#### `def finalize(self) -> list[ProviderEvent]`
按 index 排序用 `_ToolCallBuilder.build` 生成 `tool_calls`;先 `yield` 每个 `ProviderToolCallEvent`,再发 `ProviderResponseEndEvent(AssistantMessage(content, tool_calls, usage=self._usage), finish_reason=self._finish_reason)`。

### _ResponsesStreamParser

`/v1/responses` 的 SSE 事件解析器(无 `[DONE]`,以终态事件收尾)。

#### `__init__(self) -> None`
`emitted_content=False`、`fatal=False`、`_content_parts=[]`、`_tool_call_builders: dict[str,_ResponsesToolCallBuilder]={}`、`_status=None`、`_usage=None`。

#### `def feed(self, event: str) -> tuple[list[ProviderEvent], bool]`
1. `event == "[DONE]"` 返回 `([], False)`(responses 无此哨兵)。
2. `_loads_object` 失败返回 `([], False)`。
3. `chunk_type = chunk["type"]` 非字符串返回 `([], False)`。
4. `response.output_text.delta` / `response.refusal.delta`:`delta` 字符串非空则记 emitted_content、追加 `_content_parts`、发 `ProviderTextDeltaEvent`。
5. `response.reasoning_summary_text.delta` / `response.reasoning_text.delta`:`delta` 非空发 `ProviderThinkingDeltaEvent`。
6. `response.output_item.added`:`item` 为 function_call 时调用 `_register_responses_item` 登记 builder。
7. `response.function_call_arguments.delta`:用 `item_id` 取/建 builder,`add_arguments_delta`。
8. `response.function_call_arguments.done`:用 `item_id` 取/建 builder,`set_final(arguments=...)`。
9. `response.output_item.done`:`_finalize_responses_item` 填充最终 arguments/name/call_id。
10. `response.completed` / `response.incomplete`:存 `_status=_responses_finish_reason(chunk)`、`_usage=_usage_from_responses_event(chunk)`,返回 `([], True)`(停止)。
11. `response.failed`:置 `fatal=True`,返回 `[_responses_failure_event(chunk)], True`。
12. `error`:置 `fatal=True`,返回 `[ProviderErrorEvent(message=_responses_error_message(chunk), data={"event":chunk})], True`。
13. 其它返回 `([], False)`。

```python
def feed(self, event):
    if event == "[DONE]":
        return [], False  # responses 无此哨兵
    chunk = _loads_object(event)
    if chunk is None:
        return [], False
    chunk_type = chunk.get("type")
    if not isinstance(chunk_type, str):
        return [], False
    if chunk_type in ("response.output_text.delta", "response.refusal.delta"):
        delta = chunk.get("delta")
        if isinstance(delta, str) and delta:
            self.emitted_content = True
            self._content_parts.append(delta)
            return [ProviderTextDeltaEvent(delta=delta)], False
    elif chunk_type in ("response.reasoning_summary_text.delta", "response.reasoning_text.delta"):
        delta = chunk.get("delta")
        if isinstance(delta, str) and delta:
            self.emitted_content = True
            return [ProviderThinkingDeltaEvent(delta=delta)], False
    elif chunk_type == "response.output_item.added":
        _register_responses_item(self._tool_call_builders, chunk.get("item"), output_index=chunk.get("output_index"))
    elif chunk_type == "response.function_call_arguments.delta":
        item_id = chunk.get("item_id")
        if isinstance(item_id, str):
            builder = self._tool_call_builders.setdefault(item_id, _ResponsesToolCallBuilder())
            builder.add_arguments_delta(chunk.get("delta"))
            self.emitted_content = True
    elif chunk_type == "response.function_call_arguments.done":
        item_id = chunk.get("item_id")
        if isinstance(item_id, str):
            builder = self._tool_call_builders.setdefault(item_id, _ResponsesToolCallBuilder())
            builder.set_final(arguments=chunk.get("arguments"))
    elif chunk_type == "response.output_item.done":
        _finalize_responses_item(self._tool_call_builders, chunk.get("item"), output_index=chunk.get("output_index"))
    elif chunk_type in ("response.completed", "response.incomplete"):
        self._status = _responses_finish_reason(chunk)
        self._usage = _usage_from_responses_event(chunk) or self._usage
        return [], True
    elif chunk_type == "response.failed":
        self.fatal = True
        return [_responses_failure_event(chunk)], True
    elif chunk_type == "error":
        self.fatal = True
        return [ProviderErrorEvent(message=_responses_error_message(chunk), data={"event": chunk})], True
    return [], False
```

这段代码说明了 responses 解析器如何按事件类型分流——没有 `[DONE]`,而是靠 `response.completed/failed/error` 等终态事件收尾。

#### `def finalize(self) -> list[ProviderEvent]`
`[_ordered_builders(...)]` 按 output_index 排序生成 `tool_calls`,`yield` 每个 `ProviderToolCallEvent`,末尾 `ProviderResponseEndEvent` 的 `finish_reason` 经 `_normalize_finish_reason(self._status, has_tool_calls=...)` 归一化。

### _ToolCallBuilder

chat-completions 路径的工具调用累积器(按整数 index 索引)。

#### `__init__(self) -> None`
`id=""`、`name=""`、`arguments_parts=[]`。

#### `def add_delta(self, delta: Mapping[str, Any]) -> None`
若 `delta["id"]` 是字符串则赋 `self.id`;`function = delta["function"]` 非 Mapping 返回;若 `function["name"]` 是字符串赋 `self.name`;若 `function["arguments"]` 是字符串则 `arguments_parts.append`。

#### `def build(self, index: int) -> ToolCall`
拼 `arguments_parts` 为文本,`_loads_object` 解析(空则 `{}`,解析失败则 `{"_raw_arguments": 文本}`);返回 `ToolCall(id=self.id or f"tool-call-{index}", name=self.name, arguments=arguments)`。

### _ResponsesToolCallBuilder

responses 路径的工具调用累积器(按字符串 item_id 索引,带 output_index 排序)。

#### `__init__(self, *, call_id="", name="", output_index=0) -> None`
初始化 `call_id`、`name`、`output_index`、`arguments_parts=[]`、`arguments_final=None`。

#### `def add_arguments_delta(self, delta: object) -> None`
`delta` 为字符串则 `arguments_parts.append`。

#### `def set_final(self, *, call_id=None, name=None, arguments=None, output_index=None) -> None`
各字段若为真则覆盖;字符串 `arguments` 写入 `arguments_final`;`output_index` 若非 None 覆盖。

#### `def build(self, index: int) -> ToolCall`
优先用 `arguments_final`,否则拼 `arguments_parts`;解析规则同上;返回 `ToolCall(id=self.call_id or f"tool-call-{index}", name=self.name, arguments=arguments)`。

### 模块级构造/解析辅助函数

#### `def _build_chat_payload(...) -> dict[str, JSONValue]`
构造 chat-completions 请求体:
- `resolved_compat = dict(compat or {})`,读取 `supportsStore`/`supportsUsageInStreaming`/`supportsReasoningEffort`(默认 True)与 `maxTokensField`(默认 `max_completion_tokens`)。
- 基础体含 `model`、`stream=True`、`messages=[_system_message(system), *[_message_to_openai(m) for m in messages]]`。
- `supports_usage` 则加 `stream_options={"include_usage": True}`。
- `supports_store` 则加 `store=False`。
- `max_tokens` 非 None 则按 `maxTokensField` 写 `max_tokens` 或 `max_completion_tokens`。
- `compat["openrouterProvider"]` 为 dict 时写 `provider`。
- 调 `_apply_chat_reasoning` 注入推理参数。
- `tools` 非空前加 `tools=[_tool_to_openai(t) for t]`,若 `compat["zaiToolStream"] is True` 加 `tool_stream=True`。

```python
def _build_chat_payload(*, model, system, messages, tools, reasoning_effort, reasoning_effort_parameter, thinking_format, compat, max_tokens, include_reasoning_effort_none):
    resolved_compat = dict(compat or {})
    supports_usage = bool(resolved_compat.get("supportsUsageInStreaming", True))
    max_tokens_field = _string_compat(resolved_compat.get("maxTokensField"), default="max_completion_tokens")
    payload = {
        "model": model,
        "stream": True,
        "messages": [_system_message(system), *[_message_to_openai(m) for m in messages]],
    }
    if supports_usage:
        payload["stream_options"] = {"include_usage": True}
    if bool(resolved_compat.get("supportsStore", True)):
        payload["store"] = False
    if max_tokens is not None:
        payload["max_tokens" if max_tokens_field == "max_tokens" else "max_completion_tokens"] = max_tokens
    _apply_chat_reasoning(payload, reasoning_effort=reasoning_effort, reasoning_effort_parameter=reasoning_effort_parameter, thinking_format=thinking_format, include_reasoning_effort_none=include_reasoning_effort_none)
    if tools:
        payload["tools"] = [_tool_to_openai(t) for t in tools]
    return payload
```

这段代码说明了 chat payload 如何把 `compat` 开关逐一翻译成字段名差异(如 `max_tokens` vs `max_completion_tokens`)与 usage 开关。

#### `def _apply_chat_reasoning(payload, *, reasoning_effort, reasoning_effort_parameter, thinking_format, include_reasoning_effort_none) -> None`
按 `thinking_format` 注入不同的推理字段:
- `zai`/`qwen`:`payload["enable_thinking"] = reasoning_enabled`。
- `qwen-chat-template`:`payload["chat_template_kwargs"]={"enable_thinking":..., "preserve_thinking": True}`。
- `deepseek`:`payload["thinking"]={"type":"enabled"/"disabled"}`,启用时另加 `reasoning_effort`。
- `openrouter` 或 `reasoning_effort_parameter=="reasoning.effort"`:启用则 `payload["reasoning"]={"effort":...}`,否则 `include_reasoning_effort_none` 时写 `{"effort":"none"}`。
- `together`:`payload["reasoning"]={"enabled":...}`,启用时另加 `reasoning_effort`。
- 默认(含 `openai` 等):`reasoning_enabled or include_reasoning_effort_none` 时写 `payload["reasoning_effort"] = reasoning_effort or "none"`。
所有分支在 `reasoning_effort` 为 None 或 `"none"` 时视为未启用(除非显式 `include_reasoning_effort_none`)。

#### `def _string_compat(value: object, *, default: str) -> str`
`value` 为字符串且非空返回它,否则 `default`。

#### `def _build_responses_payload(...) -> dict[str, JSONValue]`
构造 responses 请求体:`model`、`stream=True`、`store=False`、`instructions=system`、`input=_messages_to_responses_input(messages)`;`max_tokens` 非 None 时 `max_output_tokens=...`;`_normalize_responses_effort` 返回非 None 则加 `reasoning={"effort":..., "summary":"auto"}`;`tools` 非空前 `tools=[_tool_to_responses(t) for t]`。

```python
def _build_responses_payload(*, model, system, messages, tools, reasoning_effort, max_tokens):
    payload = {
        "model": model,
        "stream": True,
        "store": False,                       # 无状态：每轮重发整段 transcript
        "instructions": system,
        "input": _messages_to_responses_input(messages),
    }
    if max_tokens is not None:
        payload["max_output_tokens"] = max_tokens
    effort = _normalize_responses_effort(reasoning_effort)
    if effort is not None:
        # summary:auto 让思考以 response.reasoning_summary_text.delta 可见
        payload["reasoning"] = {"effort": effort, "summary": "auto"}
    if tools:
        payload["tools"] = [_tool_to_responses(t) for t in tools]
    return payload
```

这段代码说明了 responses payload 用 `instructions` 当 system、`input` 承载消息,并显式 `store: false` 保持无状态。

#### `def _normalize_responses_effort(reasoning_effort: str | None) -> str | None`
None 或 `strip().lower()` 为 `""`/`"none"` 返回 None,否则返回小写化值。

#### `def _messages_to_responses_input(messages) -> list[JSONValue]`
Responses 输入格式:`UserMessage`→`{"role":"user","content":...}`;`AssistantMessage` 有 content 则 `{"role":"assistant","content":...}`,每个 tool_call 另加 `{"type":"function_call","call_id":...,"name":...,"arguments":dumps(...)}`;`ToolResultMessage`→`{"type":"function_call_output","call_id":...,"output":...}`。(注意此处 user/assistant 内容用纯字符串,与 codex 的细粒度 items 不同。)

#### `def _tool_to_responses(tool: AgentTool) -> dict[str, JSONValue]`
`{"type":"function","name":...,"description":...,"parameters":dict(input_schema)}`(无 strict)。

#### `def _register_responses_item(builders, item, *, output_index) -> None`
仅处理 `item["type"]=="function_call"` 且 `item["id"]` 为字符串:用 `item_id` 取/建 builder,`set_final(call_id=..., name=..., arguments=..., output_index=_int_or_none(output_index))`。

#### `def _finalize_responses_item(builders, item, *, output_index) -> None`
同 `_register_responses_item` 逻辑,用于 `output_item.done` 时填充最终结果。

#### `def _ordered_builders(builders) -> list[_ResponsesToolCallBuilder]`
按 `builder.output_index` 排序返回。

#### `def _responses_finish_reason(chunk) -> str | None`
从 `chunk["response"]["status"]` 取字符串状态。

#### `def _normalize_finish_reason(status, *, has_tool_calls) -> str`
有 tool_calls 返回 `"tool_calls"`;`status=="incomplete"` 返回 `"length"`;否则 `"stop"`。

#### `def _responses_failure_event(chunk) -> ProviderErrorEvent`
从 `chunk["response"]["error"]["message"]` 取消息,缺省 `"Provider response failed"`,带 `data={"event": dict(chunk)}`。

#### `def _responses_error_message(chunk) -> str`
依次取 `chunk["message"]`、`chunk["error"]["message"]`,均缺省返回 `"Provider stream error"`。

#### `def _str_or_none(value: object) -> str | None`
字符串且非空返回它,否则 None。

#### `def _system_message(system: str) -> dict[str, JSONValue]`
`{"role":"system","content":system}`。

#### `def _message_to_openai(message: AgentMessage) -> dict[str, JSONValue]`
`UserMessage`→`{"role":"user","content":...}`;`AssistantMessage`→`{"role":"assistant","content":...}`,有 tool_calls 则附 `tool_calls=[_tool_call_to_openai(...)]`;`ToolResultMessage`→`{"role":"tool","tool_call_id":...,"name":...,"content":...}`。

#### `def _tool_to_openai(tool: AgentTool) -> dict[str, JSONValue]`
`{"type":"function","function":{"name":...,"description":...,"parameters":dict(input_schema)}}`。

#### `def _tool_call_to_openai(tool_call: ToolCall) -> dict[str, JSONValue]`
`{"id":...,"type":"function","function":{"name":...,"arguments":dumps(arguments)}}`。

#### `def _parse_sse_line(line: str) -> str | None`
`strip` 后,空或非 `data:` 开头返回 None,否则 `removeprefix("data:").strip()`。

#### `def _loads_object(value: str) -> dict[str, JSONValue] | None`
`loads` 失败或非 dict 返回 None,否则返回 dict。

#### `def _first_choice(chunk) -> Mapping[str, Any] | None`
取 `chunk["choices"][0]`,类型校验后返回。

#### `def _int_or_zero(value: object) -> int`
整数(非 bool)返回它,否则 0。

#### `def _int_or_none(value: object) -> int | None`
整数(非 bool)返回它,否则 None。

#### `def _parse_chunk_usage(raw: Mapping[str, Any]) -> Usage`
解析 chat-completions usage:由 `prompt_tokens` 减 `cached_tokens`(`prompt_tokens_details.cached_tokens`,回退 `prompt_cache_hit_tokens`,即 DeepSeek)/`cache_write_tokens` 得 fresh input;`output=completion_tokens`;`reasoning=completion_tokens_details.reasoning_tokens`;组装 `Usage`。cost 留 None。

#### `def _usage_from_responses_event(chunk) -> Usage | None`
从 `chunk["response"]["usage"]` 解析:cache_read=`input_tokens_details.cached_tokens`,input=`input_tokens - cache_read`(最小 0),`cache_write=0`,`reasoning=output_tokens_details.reasoning_tokens`(None 表示未报),`total_tokens`。

#### `def _tool_call_deltas(delta) -> list[Mapping[str, Any]]`
取 `delta["tool_calls"]` 中全部 Mapping 元素。

#### `def _thinking_delta_text(delta: Mapping[str, Any]) -> str`
依次检查 `delta["reasoning_content"]`、`delta["reasoning"]`、`delta["thinking"]`,首个非空字符串返回,否则 `""`(兼容各厂商扩展字段)。

#### `def _is_transient_status(status_code: int) -> bool`
`status_code in {408,409,425,429} or status_code >= 500`。

---

## 文件:anthropic.py

Anthropic Messages API 适配器，完全独立于 openai_compatible 基类：使用 `anthropic-version` 头、`x-api-key`（或 bearer）鉴权、`/messages` 端点、Anthropic 自有消息格式与 SSE 事件类型（如 `message_start`/`content_block_*`/`message_delta`），思考（thinking）用 `thinking.budget_tokens` 或 `adaptive`+`output_config.effort` 控制。

### AnthropicProvider

#### `__init__(self, config: AnthropicConfig, *, client: httpx.AsyncClient | None = None) -> None`
保存 config、`client`、`_owns_client`。

#### `async def aclose(self) -> None`
同通用关闭逻辑。

#### `def stream_response(self, *, model, system, messages, tools, signal=None) -> AsyncIterator[AssistantMessageEvent]`
公共入口，返回 **Pi 规范的事件流**。内部先调 `_stream_provider_events(...)` 拿到过渡性 `ProviderEvent` 流，再经 `canonicalize_provider_stream` 桥接为 Pi 事件（与 OpenAI 系同一套桥接机制）。

#### `_stream_provider_events` 内部流程（产出过渡性 ProviderEvent）：
1. 取 client;准备 `api_key`、`base_url`、`auth_headers`;`credential_resolver` 存在则解析并可能改写 `base_url`(确保带 `/v1`)、合并 headers。

```python
headers = {
    "anthropic-version": ANTHROPIC_VERSION,
    "content-type": "application/json",
    **(dict(self._config.headers or {})),
    **auth_headers,
}
if self._config.bearer_auth:
    headers.setdefault("Authorization", f"Bearer {api_key}")
else:
    headers["x-api-key"] = api_key          # Anthropic 专属鉴权头
url = f"{base_url.rstrip('/')}/messages"
```

这段代码说明了 Anthropic 与 OpenAI 系的关键差异:它用 `x-api-key`(或 bearer)鉴权并强制带 `anthropic-version` 协议头,端点是 `/messages` 而非 `/chat/completions`。
2. `_build_messages_payload(...)` 构造请求体。
3. headers:`anthropic-version`、`content-type`、`config.headers`、`auth_headers`;若 `config.bearer_auth` 则 `Authorization: Bearer`,否则 `x-api-key`。URL=`{base_url}/messages`。
4. 重试循环:`async with client.stream("POST", url, json=payload, headers=headers)`。
5. `status>=400`:读 body,`_should_retry(attempt, status_code)` 则发 `provider_retry_event` 并重试,否则发 `ProviderErrorEvent`(由 `provider_http_error_message` 生成,含 `status_code`/`body`/`attempts`)。
6. 发 `ProviderResponseStartEvent`;逐行 `_parse_sse_line`→`_loads_object`,按 `chunk["type"]` 分支:
   - `message_start`:从 `message.usage` 建 `usage = _usage_from_message_start`。
   - `content_block_start`:`block.type=="tool_use"` 时按 `index` 取/建 `_AnthropicToolBuilder`,填 `id`/`name`。
   - `content_block_delta`:`text_delta`→`ProviderTextDeltaEvent`;`thinking_delta`→`ProviderThinkingDeltaEvent`;`input_json_delta`→向 builder 追加 `partial_json`。
   - `message_delta`:更新 `finish_reason=stop_reason`、`usage=_apply_message_delta_usage`。
   - `error`:发 `ProviderErrorEvent` 并 return。
7. 收尾:排序 builders `build` 出 tool_calls,逐个发 `ProviderToolCallEvent`,最后发 `ProviderResponseEndEvent(AssistantMessage("".join(content_parts), tool_calls, usage), finish_reason)`。
8. `except httpx.HTTPError`:未发内容且可重试则重试,否则发 `ProviderErrorEvent`。

#### `def _get_client(self) -> httpx.AsyncClient`
惰性创建 client。

#### `def _should_retry(self, attempt: int, *, status_code: int | None = None) -> bool`
超 `max_retries` 返回 False;否则 `status_code is None` 或 `status_code in {408,409,425,429} or >=500`。

### _AnthropicToolBuilder

#### `__init__(self) -> None`
`id=""`、`name=""`、`arguments_parts=[]`。

#### `def build(self, index: int) -> ToolCall`
拼 `arguments_parts` 解析(`_loads_object`,空则 `{}`,失败则 `{"_raw_arguments":文本}`);返回 `ToolCall(id=self.id or f"tool-call-{index}", name=self.name, arguments=arguments)`。

### 模块级辅助函数

#### `def _build_messages_payload(...) -> dict[str, JSONValue]`
构造 Anthropic 请求体:`resolved_max_tokens = max_tokens or 4096`,若 `thinking_budget_tokens` 非空则 `max(resolved, budget+1024)`;含 `model`、`max_tokens`、`stream=True`、`system`(有 `oauth_system_prompt` 时拼成 `[{type:text,...},{type:text,...}]` 列表,否则纯字符串)、`messages=[_anthropic_message(m) for m]`;thinking:`thinking_mode=="adaptive"` 且 `thinking_effort` 非空→`thinking={"type":"adaptive","display":"summarized"}` 且 `output_config={"effort":...}`,否则 `thinking_budget_tokens` 非空→`thinking={"type":"enabled","budget_tokens":...}`;`tools` 非空→`tools=[_anthropic_tool(t) for t]`。

```python
payload = {
    "model": model,
    "max_tokens": resolved_max_tokens,
    "stream": True,
    "system": ([{"type": "text", "text": oauth_system_prompt}, {"type": "text", "text": system}]
               if oauth_system_prompt else system),
    "messages": [_anthropic_message(message) for message in messages],
}
if thinking_mode == "adaptive" and thinking_effort is not None:
    payload["thinking"] = {"type": "adaptive", "display": "summarized"}
    payload["output_config"] = {"effort": thinking_effort}
elif thinking_budget_tokens is not None:
    payload["thinking"] = {"type": "enabled", "budget_tokens": thinking_budget_tokens}
```

这段代码说明了 Anthropic 思考的两种形态:adaptive 模式带 `output_config.effort`,budget 模式带 `thinking.budget_tokens`;`system` 还可前置一段 oauth 提示。

#### `def _anthropic_message(message: AgentMessage) -> dict[str, JSONValue]`
`UserMessage`→`{"role":"user","content":message.content}`;`AssistantMessage`→`{"role":"assistant","content":[...]}`,有 content 加 `{"type":"text","text":...}`,每个 tool_call 加 `{"type":"tool_use","id":...,"name":...,"input":arguments}`;`ToolResultMessage`→`{"role":"user","content":[{"type":"tool_result","tool_use_id":...,"content":...,"is_error":not ok}]}`;否则 `TypeError`。

#### `def _anthropic_tool(tool: AgentTool) -> dict[str, JSONValue]`
`{"name":...,"description":...,"input_schema":dict(input_schema)}`(注意键是 `input_schema`,非 OpenAI 的 `parameters`)。

#### `def _parse_sse_line(line: str) -> str | None`
`data:` 前缀去掉。

#### `def _loads_object(text: str) -> dict[str, Any] | None`
`loads`,非 dict 返回 None。

#### `def _string_or_empty(value: object) -> str`
字符串返回,否则 `""`。

#### `def _int_or_none(value: object) -> int | None`
整数(非 bool)返回,否则 None。

#### `def _usage_from_message_start(raw: object) -> Usage`
从 `message_start.message.usage` 构造 Usage:`input=input_tokens`、`output=output_tokens`、`cache_read=cache_read_input_tokens`、`cache_write=cache_creation_input_tokens`、`cache_write_1h=cache_creation.ephemeral_1h_input_tokens`、`total_tokens` 求和。

#### `def _apply_message_delta_usage(usage: Usage | None, raw: object) -> Usage | None`
把 `message_delta.usage` 覆盖到 running Usage(仅覆盖非 null 字段),`output_tokens_details.thinking_tokens`→`usage.reasoning`,重算 `total_tokens`。

---

## 文件:google.py

Google Generative Language API 适配器，偏离基类最彻底：端点是 `{base_url}/models/{model}:streamGenerateContent?alt=sse&key={api_key}`（API key 在 query 参数中），请求体用 `contents`/`systemInstruction`/`generationConfig`/`tools[].functionDeclarations`，思考由 `thinkingConfig`（`thinkingBudget`/`thinkingLevel`/`includeThoughts`）控制，SSE 对象不是 OpenAI 风格而是 `{candidates:[{content:{parts:[...]}}]}`，思考内容通过 `part.thought==True` 标志与普通文本区分。

### GoogleGenerativeAIProvider

#### `__init__(self, config: OpenAICompatibleConfig, *, client=None) -> None`
保存 config/client/`_owns_client`(复用 `OpenAICompatibleConfig`)。

#### `async def aclose(self) -> None`
标准关闭。

#### `def stream_response(self, *, model, system, messages, tools, signal=None) -> AsyncIterator[AssistantMessageEvent]`
公共入口，返回 **Pi 规范的事件流**。内部先调 `_stream_provider_events(...)` 拿到过渡性 `ProviderEvent` 流，再经 `canonicalize_provider_stream` 桥接为 Pi 事件。

#### `_stream_provider_events` 内部流程（产出过渡性 ProviderEvent）：
1. 取 client;`_build_google_payload(...)` 构造体。

```python
url = (
    f"{self._config.base_url.rstrip('/')}/models/"
    f"{model}:streamGenerateContent?alt=sse&key={self._config.api_key}"
)
headers = {
    **dict(self._config.headers or {}),
    "content-type": "application/json",
}
```

2. URL=`{base_url}/models/{model}:streamGenerateContent?alt=sse&key={api_key}`;headers=`config.headers`+`content-type`。
3. 重试循环,每轮 `parser = _GoogleStreamParser()`(循环内重建,确保每次尝试干净)。
4. `status>=400`:重试/错误逻辑同通用。
5. 发 `ProviderResponseStartEvent`;逐行 `_parse_sse_line`→`parser.feed(event)` 逐个 `yield`,结束 `parser.finalize()` 逐个 `yield`。
6. `except httpx.HTTPError`:`parser.emitted_content` 决定可重试。

#### `def _get_client(self) -> httpx.AsyncClient`
惰性创建。

#### `def _should_retry(self, attempt: int, *, status_code=None) -> bool`
同通用(基于 `config.max_retries` 与 {408,409,425,429}/>=500)。

### _GoogleStreamParser

#### `__init__(self) -> None`
`emitted_content=False`、`_content_parts=[]`、`_thinking_parts=[]`、`_tool_calls=[]`、`_finish_reason=None`。

#### `def feed(self, event: str) -> list[ProviderEvent]`
`_loads_object`;取 `candidates[0]`;`finishReason` 记到 `_finish_reason`;`content.parts` 遍历:
- `part.text` 且 `part.thought==True`→`ProviderThinkingDeltaEvent`,存 `_thinking_parts`。
- 普通 `part.text`→`ProviderTextDeltaEvent`,存 `_content_parts`。
- `part.functionCall`(Mapping)→构造 `ToolCall(id=functionCall.id or f"tool-call-{len}", name=..., arguments=_object_or_empty(args), thought_signature=...)`,发 `ProviderToolCallEvent` 并追加 `_tool_calls`。
返回 events 列表。

#### `def finalize(self) -> list[ProviderEvent]`
返回单个 `ProviderResponseEndEvent(AssistantMessage("".join(_content_parts), tool_calls=_tool_calls), finish_reason=_normalize_finish_reason(_finish_reason, has_tool_calls=bool(_tool_calls)))`。

### 模块级辅助函数

#### `def _build_google_payload(...) -> dict[str, JSONValue]`
`contents=[_message_to_google(m) for m]`;`system` 非空加 `systemInstruction={"parts":[{"text":system}]}`;`max_tokens` 非空加 `generationConfig.maxOutputTokens`;`_google_thinking_config` 非空则 `generationConfig.thinkingConfig`;`tools` 非空则 `tools=[{"functionDeclarations":[_tool_to_google(t) for t]}]`。

```python
payload = {
    "contents": [_message_to_google(message) for message in messages],
}
if system:
    payload["systemInstruction"] = {"parts": [{"text": system}]}
config = {}
if max_tokens is not None:
    config["maxOutputTokens"] = max_tokens
thinking_config = _google_thinking_config(model, reasoning_effort)
if thinking_config is not None:
    config["thinkingConfig"] = thinking_config
if config:
    payload["generationConfig"] = config
if tools:
    payload["tools"] = [{"functionDeclarations": [_tool_to_google(tool) for tool in tools]}]
```

这段代码说明了 Gemini 请求体的形态:`contents`/`systemInstruction`/`generationConfig` 三层结构,thinking 由 `thinkingConfig` 表达,与 OpenAI 的 `messages`/`tools` 完全不同。

#### `def _google_thinking_config(model, reasoning_effort) -> dict[str, JSONValue] | None`
`reasoning_effort is None`→None;`"none"`→按模型族返回 `thinkingLevel`(gemini-3-pro→LOW,gemini-3-flash/gemma-4→MINIMAL,其它→`thinkingBudget:0`);`reasoning_effort in {MINIMAL,LOW,MEDIUM,HIGH}`→`{includeThoughts:True, thinkingLevel:...}`;否则 `_google_budget` 给出预算则 `{includeThoughts:True, thinkingBudget:...}`,否则 `{includeThoughts:True, thinkingLevel:_google_level(...)}`。

#### `def _google_budget(model, effort) -> int | None`
把 minimal/low/medium/high(xhigh 归一为 high)映射到各模型预算:gemini-3 家族与 gemma-4 返回 None(不用预算);2.5-pro/2.5-flash(-lite)/2.5-flash 各有不同预算字典;都不匹配返回 -1。

#### `def _google_level(model, effort) -> str`
按模型族返回 thinkingLevel 字符串(gemini-3-pro: low/high;gemma-4: minimal/high;其余 MINIMAL/LOW/MEDIUM/HIGH 映射)。

#### `def _is_gemini3_pro_model(model) -> bool` / `def _is_gemini3_flash_model(model) -> bool` / `def _is_gemma4_model(model) -> bool`
基于子串的小写匹配。

#### `def _message_to_google(message: AgentMessage) -> dict[str, JSONValue]`
`UserMessage`→`{"role":"user","parts":[{"text":...}]}`;`AssistantMessage`→`{"role":"model","parts":[...]}`,content 加 `{"text":...}`,每个 tool_call 加 `{"functionCall":{"id":...,"name":...,"args":...}}`(有 `thought_signature` 则加),空则 `[{"text":""}]`;`ToolResultMessage`→`{"role":"user","parts":[{"functionResponse":{"output"/"error":content, 带 id}}]}`。

#### `def _tool_to_google(tool: AgentTool) -> dict[str, JSONValue]`
`{"name":...,"description":...,"parameters":_sanitize_google_schema(dict(input_schema))}`(键是 `parameters`,且清理 schema)。

#### `def _sanitize_google_schema(value: JSONValue) -> JSONValue`
递归删除 Gemini OpenAPI 子集不支持的键:`additionalProperties`、`$schema`。

#### `def _parse_sse_line(line: str) -> str | None`
`strip` 后空或非 `data:` 返回 None。

#### `def _loads_object(value: str) -> dict[str, JSONValue] | None`
`loads` 失败或非 dict 返回 None。

#### `def _string_or_default(value: object, default: str) -> str`
字符串且非空返回它,否则 default。

#### `def _object_or_empty(value: object) -> dict[str, JSONValue]`
dict 返回,否则 `{}`。

#### `def _normalize_finish_reason(reason: str | None, *, has_tool_calls: bool) -> str`
有 tool_calls→`"tool_calls"`;`reason in {MAX_TOKENS,MODEL_ARMOR,RECITATION}`→`"length"`;否则 `"stop"`。

---

## 文件:mistral.py

Mistral Conversations 适配器，形态上最接近 openai_compatible 的 chat 分支，但端点 `/chat/completions`、用 `OpenAICompatibleConfig`、消息体用 `system` role 消息、thinking 字段为 `reasoning_effort: "high"` 或 `prompt_mode: "reasoning"`、`tools[].function` 带 `strict: False`。流式解析器 `_MistralStreamParser` 与 `_ChatStreamParser` 同构，但支持 content 为列表且 `type==thinking` 的 thinking 分块。

### MistralConversationsProvider

#### `__init__(self, config: OpenAICompatibleConfig, *, client=None) -> None`
保存 config/client/`_owns_client`。

#### `async def aclose(self) -> None`
标准关闭。

#### `def stream_response(self, *, model, system, messages, tools, signal=None) -> AsyncIterator[AssistantMessageEvent]`
公共入口，返回 **Pi 规范的事件流**。内部先 `_build_mistral_payload(...)` 构造体，再经 `canonicalize_provider_stream` 桥接为 Pi 事件：

```python
def stream_response(self, *, model, system, messages, tools, signal=None):
    payload = _build_mistral_payload(
        model=model, system=system, messages=messages, tools=tools,
        reasoning_effort=self._config.reasoning_effort, max_tokens=self._config.max_tokens)
    raw = self._stream(
        model=model,
        url=f"{_mistral_base_url(self._config.base_url)}/chat/completions",
        payload=payload, signal=signal)
    return canonicalize_provider_stream(
        raw,
        api=self._config.api,
        provider=getattr(self._config, "provider_name", "mistral"),
        model=model,
    )
```

这段代码说明了 Mistral 的双层结构：`_stream` 产出过渡性 `ProviderEvent`，`canonicalize_provider_stream` 桥接为 Pi 事件，与 OpenAI 系同一模式。

#### `def _stream(self, *, model, url, payload, signal) -> AsyncIterator[ProviderEvent]`
内部 `iterator()`(与基类 `_stream` 同构):取 client,headers=`config.headers`+`Authorization: Bearer {api_key}`;重试循环每轮 `parser=_MistralStreamParser()`;`status>=400` 重试/错误;发 `ProviderResponseStartEvent`;逐行 `_parse_sse_line`→`events, stop = parser.feed(event)`,逐个 yield,`stop` 则 break;最后 `parser.finalize()`;HTTP 异常按 `parser.emitted_content` 重试。

#### `def _get_client(self) -> httpx.AsyncClient`
惰性创建。

#### `def _should_retry(self, attempt, *, status_code=None) -> bool`
同通用。

### _StreamParser (Protocol)

同 openai_compatible 的协议:`emitted_content`、`feed(event)->tuple[list[ProviderEvent], bool]`、`finalize()->list[ProviderEvent]`。

### _MistralStreamParser

#### `__init__(self) -> None`
`emitted_content=False`、`_content_parts=[]`、`_tool_call_builders=dict`、`_finish_reason=None`。

#### `def feed(self, event: str) -> tuple[list[ProviderEvent], bool]`
1. `event=="[DONE]"`→`([], True)`。
2. `_loads_object` 失败→`([], False)`。
3. `_first_choice(chunk)`;更新 `_finish_reason`(兼容 `finish_reason`/`finishReason`)。
4. `delta = choice["delta"]`;对每个 `_content_deltas(delta)` 发 `ProviderTextDeltaEvent`;对每个 `_thinking_deltas(delta)` 发 `ProviderThinkingDeltaEvent`;对每个 `_tool_call_deltas(delta)` 按 `index` 取/建 `_ToolCallBuilder` 并 `add_delta`。
5. 返回 `(events, False)`。

#### `def finalize(self) -> list[ProviderEvent]`
排序 builders `build` 出 tool_calls,发各 `ProviderToolCallEvent`,末尾 `ProviderResponseEndEvent(finish_reason=self._finish_reason or ("tool_calls" if tool_calls else "stop"))`。

### _ToolCallBuilder

#### `__init__(self) -> None`
`id=""`、`name=""`、`arguments_parts=[]`。

#### `def add_delta(self, delta: Mapping[str, Any]) -> None`
`delta["id"]` 非 `"null"` 字符串则赋 `self.id`;`function` 非 Mapping 返回;`function["name"]` 字符串赋 `self.name`;`function["arguments"]` 字符串追加,若为 Mapping 则 `dumps` 后追加。

#### `def build(self, index: int) -> ToolCall`
拼参、解析规则同 chat builder,返回 `ToolCall(id=self.id or f"tool-call-{index}", name=self.name, arguments=arguments)`。

### 模块级辅助函数

#### `def _build_mistral_payload(...) -> dict[str, JSONValue]`
`model`、`stream=True`、`messages=[*_system_messages(system), *[_message_to_mistral(m) for m]]`;`max_tokens` 非空加 `max_tokens`;`tools` 非空加 `tools=[_tool_to_mistral(t) for t]`;`reasoning_effort` 非 None 且非 `"none"` 时:若 `_uses_reasoning_effort(model)` 加 `reasoning_effort:"high"`,否则加 `prompt_mode:"reasoning"`。

```python
payload = {
    "model": model,
    "stream": True,
    "messages": [*_system_messages(system), *[_message_to_mistral(m) for m in messages]],
}
if max_tokens is not None:
    payload["max_tokens"] = max_tokens
if tools:
    payload["tools"] = [_tool_to_mistral(tool) for tool in tools]
if reasoning_effort is not None and reasoning_effort != "none":
    if _uses_reasoning_effort(model):
        payload["reasoning_effort"] = "high"
    else:
        payload["prompt_mode"] = "reasoning"
```

这段代码说明了 Mistral 推理开关的两路分支:manus 系模型用 `reasoning_effort: "high"`,其余用 `prompt_mode: "reasoning"`(由 `_uses_reasoning_effort` 名单决定)。

#### `def _system_messages(system: str) -> list[dict[str, JSONValue]]`
非空则 `[{"role":"system","content":system}]`。

#### `def _message_to_mistral(message: AgentMessage) -> dict[str, JSONValue]`
`UserMessage`→`{"role":"user","content":...}`;`AssistantMessage`→`{"role":"assistant","content":...}`,有 tool_calls 附 `tool_calls=[_tool_call_to_mistral(...)]`;`ToolResultMessage`→`{"role":"tool","tool_call_id":...,"name":...,"content":...}`。

#### `def _tool_to_mistral(tool: AgentTool) -> dict[str, JSONValue]`
`{"type":"function","function":{"name":...,"description":...,"parameters":dict(input_schema),"strict":False}}`。

#### `def _tool_call_to_mistral(tool_call: ToolCall) -> dict[str, JSONValue]`
`{"id":...,"type":"function","function":{"name":...,"arguments":dumps(arguments)}}`。

#### `def _mistral_base_url(base_url: str) -> str`
去掉末尾 `/`;若以 `/v1` 结尾保持,否则补 `/v1`。

#### `def _uses_reasoning_effort(model: str) -> bool`
`model in {"mistral-small-2603","mistral-small-latest","mistral-medium-3.5"}`。

#### `def _parse_sse_line(line: str) -> str | None`
同通用。

#### `def _loads_object(value: str) -> dict[str, JSONValue] | None`
`loads` 失败或非 dict 返回 None。

#### `def _first_choice(chunk) -> Mapping[str, Any] | None`
取 `chunk["choices"][0]`。

#### `def _content_deltas(delta) -> list[str]`
`delta["content"]` 字符串或非 text 列表,逐一提取文本。

#### `def _thinking_deltas(delta) -> list[str]`
`delta["content"]` 为列表时,取 `type=="thinking"` 的 `thinking`(字符串或 `[{text}]` 列表)。

#### `def _tool_call_deltas(delta) -> list[Mapping[str, Any]]`
取 `delta["tool_calls"]` 或 `delta["toolCalls"]` 中 Mapping。

---

## 文件:openai_codex.py

OpenAI Codex 订阅版 Responses 适配器，完全自包含（不继承 openai_compatible 基类）。端点 `{base_url}/codex/responses`，鉴权为 `Authorization: Bearer {access_token}` + `chatgpt-account-id` + `originator` + `OpenAI-Beta: responses=experimental`，请求体走 Responses 风格但带 `text.verbosity`/`include`/`tool_choice`/`parallel_tool_calls`，工具 id 用 `call_id|item_id` 复合形式。SSE 解析在异步生成器 `_codex_provider_events` 内联完成（而非独立 parser 类）。`reasoning_effort`+`reasoning_summary` 控制思考过程，thinking 映射 `response.reasoning.*` 系列事件。

### 模块级常量/类型

#### `DEFAULT_OPENAI_CODEX_BASE_URL = "https://chatgpt.com/backend-api"`
默认 base url。

#### `@dataclass(frozen=True, slots=True) class OpenAICodexCredentials`
字段 `access_token: str`、`account_id: str`。

#### `type OpenAICodexCredentialResolver = Callable[[], Awaitable[OpenAICodexCredentials]]`
凭证解析器类型。

#### `@dataclass(frozen=True, slots=True) class OpenAICodexConfig`
字段:`credential_resolver`、`base_url=DEFAULT_...`、`headers`、`timeout_seconds`、`max_retries`、`max_retry_delay_seconds`、`originator="tau"`、`reasoning_effort`、`reasoning_summary="auto"`、`provider_name="OpenAI Codex"`。

### OpenAICodexProvider

#### `__init__(self, config: OpenAICodexConfig, *, client=None) -> None`
保存 config/client/`_owns_client`。

#### `async def aclose(self) -> None`
标准关闭。

#### `def stream_response(self, *, model, system, messages, tools, signal=None) -> AsyncIterator[AssistantMessageEvent]`
公共入口，返回 **Pi 规范的事件流**。内部先调 `_stream_provider_events(...)` 拿到过渡性 `ProviderEvent` 流，再经 `canonicalize_provider_stream` 桥接为 Pi 事件。

#### `_stream_provider_events` 内部流程（产出过渡性 ProviderEvent）：
1. 取 client,`_build_codex_payload(...)` 构造体,`_resolve_codex_url(base_url)` 得 URL。

```python
credentials = await self._config.credential_resolver()
headers = _build_codex_headers(
    self._config.headers,
    access_token=credentials.access_token,
    account_id=credentials.account_id,
    originator=self._config.originator,
)
async with client.stream("POST", url, json=payload, headers=headers) as response:
    # ... status>=400 时 _should_retry 带 body 识别终端限流，否则 ProviderErrorEvent ...
    yield ProviderResponseStartEvent(model=model)
    async for event in _codex_provider_events(response, signal=signal):
        if isinstance(event, ProviderTextDeltaEvent | ProviderToolCallEvent):
            emitted_content = True
        yield event
```

这段代码说明了 Codex 与别家的根本差异:每次请求都重新解析 OAuth 凭证(处理刷新),并用内联异步生成器 `_codex_provider_events` 解析 SSE,而非独立的 parser 类。
2. 重试循环:`attempt=0`。每轮先 `await self._config.credential_resolver()` 取凭证,`_build_codex_headers(...)` 构造 headers;`async with client.stream("POST", url, json=payload, headers=headers)`。
3. `status>=400`:读 body,`_should_retry(attempt, status_code=..., body=...)`(带 body 判定终端限流)则重试,否则发 `ProviderErrorEvent`(含 attempts)。
4. 发 `ProviderResponseStartEvent`;`async for event in _codex_provider_events(response, signal=signal)`:若 event 是 `ProviderTextDeltaEvent | ProviderToolCallEvent` 则置 `emitted_content=True`,`yield event`。
5. `except httpx.HTTPError`:未发内容可重试;`except Exception`(裸异常)→直接发 `ProviderErrorEvent` 返回(BLE001 豁免,把 provider 错误转为事件)。

#### `def _get_client(self) -> httpx.AsyncClient`
惰性创建。

#### `def _should_retry(self, attempt, *, status_code=None, body="") -> bool`
超 `max_retries` 返回 False;否则 `status_code is None or _is_retryable_status(status_code, body)`。

### _ToolCallBuilder

#### `__init__(self, *, call_id: str, item_id: str | None, name: str) -> None`
保存 `call_id`、`item_id`、`name`、`arguments_parts=[]`。

#### `def add_delta(self, delta: str) -> None`
追加参数片段。

#### `def set_arguments(self, arguments: str) -> None`
整段替换参数(用最终值)。

#### `def update_from_item(self, item: Mapping[str, Any]) -> None`
从完成的 function-call item 补 `call_id`/`item_id`/`name`。

#### `def build(self) -> ToolCall`
拼参、解析;返回 `ToolCall(id=f"{self.call_id}|{item_id}", name=self.name, arguments=arguments)`(`item_id` 缺省为 `f"fc_{call_id}"`)。

### 模块级辅助函数

#### `def _build_codex_payload(...) -> dict[str, JSONValue]`
`model`、`store=False`、`stream=True`、`instructions=system or "You are a helpful assistant."`、`input=_messages_to_responses_input(messages)`、`text={"verbosity":"low"}`、`include=["reasoning.encrypted_content"]`、`tool_choice="auto"`、`parallel_tool_calls=True`;`reasoning_effort` 非空→`reasoning={"effort":...,"summary":reasoning_summary}`;`tools` 非空→`tools=[_tool_to_codex(t) for t]`。

```python
payload = {
    "model": model,
    "store": False,
    "stream": True,
    "instructions": system or "You are a helpful assistant.",
    "input": _messages_to_responses_input(messages),
    "text": {"verbosity": "low"},
    "include": ["reasoning.encrypted_content"],
    "tool_choice": "auto",
    "parallel_tool_calls": True,
}
if reasoning_effort is not None:
    payload["reasoning"] = {"effort": reasoning_effort, "summary": reasoning_summary}
```

这段代码说明了 Codex 是 Responses 风格的变体:`store: false`、自带 `text.verbosity`/`include`/`parallel_tool_calls`,并用 `reasoning.effort`+`summary` 表达思考。

#### `def _messages_to_responses_input(messages) -> list[JSONValue]`
与基类 responses 输入不同,使用细粒度 items:`UserMessage`→`{"role":"user","content":[{"type":"input_text","text":...}]}`;`AssistantMessage` 有 content→`{"type":"message","role":"assistant","content":[{"type":"output_text","text":...,"annotations":[]}],"status":"completed","id":f"msg_{i}"}`,每个 tool_call→`{"type":"function_call","call_id":...,"name":...,"arguments":dumps(...), ("id":item_id)}`;`ToolResultMessage`→`{"type":"function_call_output","call_id":(拆分后),"output":...}`。

#### `def _tool_to_codex(tool: AgentTool) -> dict[str, JSONValue]`
`{"type":"function","name":...,"description":...,"parameters":dict(input_schema),"strict":None}`。

#### `async def _codex_provider_events(response, *, signal) -> AsyncIterator[ProviderEvent]`
核心流式解析(内联,非 parser 类):维护 `content_parts`、`tool_calls`、`active_tools`、`tools_by_item_id/call_id/output_index`、`finish_reason`、`usage`。`async for event in _iter_sse_objects(response)`:
- `type=="error"`→`ProviderErrorEvent` 返回。
- `type=="response.failed"`→`ProviderErrorEvent` 返回。
- `response.output_item.added` 且 item 为 `function_call`→`_track_tool_builder(_tool_builder_from_item(item), ...)`。
- `response.function_call_arguments.delta`→按事件定位 builder,`add_delta(delta)`。
- `response.function_call_arguments.done`→定位 builder,`set_arguments(arguments)`。
- `response.output_text.delta`→`ProviderTextDeltaEvent` 并记 `content_parts`。
- `response.reasoning.delta`/`reasoning_summary_text.delta`/`reasoning_text.delta`→`ProviderThinkingDeltaEvent`。
- `response.output_item.done`/`completed` 且 item 为 `function_call`→定位(或新建)builder,`update_from_item`,`set_arguments(item.arguments)`,`build` 出 `ToolCall` 并 append+发 `ProviderToolCallEvent`,`_untrack_tool_builder`;若 item 为 `message` 且尚无 content,`_text_from_done_message` 提取并发 `ProviderTextDeltaEvent`。
- `response.done`/`completed`/`incomplete`→存 `finish_reason=_finish_reason_from_response`、`usage=_usage_from_response`,`break`。
收尾 `yield ProviderResponseEndEvent(AssistantMessage("".join(content_parts), tool_calls, usage), finish_reason)`。

#### `async def _iter_sse_objects(response) -> AsyncIterator[dict[str, JSONValue]]`
逐行累积 `data:` 行(支持多行拼接),空行时把累积文本 `_loads_object` 产出;`[DONE]` 终止。

#### `def _tool_builder_from_item(item) -> _ToolCallBuilder`
从 item 取 `call_id`(缺省 `"call_0"`)、`item_id`、`name` 构造 builder。

#### `def _track_tool_builder(builder, event, *, active_tools, by_item_id, by_call_id, by_output_index) -> None`
把 builder 登记进 active 列表与三个索引字典(按 item_id/call_id/output_index)。

#### `def _untrack_tool_builder(builder, *, ...) -> None`
从 active 列表与三个字典移除。

#### `def _tool_builder_for_event(event, *, ...) -> _ToolCallBuilder | None`
按 `item_id`→`call_id`→`output_index` 顺序定位 builder;若都无且 active 仅 1 个则返回它,否则 None。

#### `def _event_item_id(event) -> str | None` / `def _event_call_id(event) -> str | None` / `def _event_output_index(event) -> int | None`
从 event 或 event.item 提取对应标识。

#### `def _text_from_done_message(item) -> str`
遍历 `item.content`,聚合 `output_text` 的 `text` 与 `refusal` 的 `refusal`。

#### `def _finish_reason_from_response(event) -> str | None`
取 `event["response"]["status"]` 字符串。

#### `def _int_or_zero(value) -> int`
整数(非 bool)返回,否则 0。

#### `def _usage_from_response(event) -> Usage | None`
从 `event["response"]["usage"]` 解析:`cache_read=input_tokens_details.cached_tokens`,`input=input_tokens - cache_read`,`cache_write=0`,`reasoning=output_tokens_details.reasoning_tokens`(None 表示未报),`total_tokens`。

#### `def _response_error_message(event) -> str`
`event["response"]["error"]["message"]` 或 code 或默认。

#### `def _error_message(event, *, fallback) -> str`
`event["message"]` 或 `event["code"]` 或 fallback。

#### `def _build_codex_headers(configured_headers, *, access_token, account_id, originator) -> dict[str, str]`
合并 headers + `Authorization: Bearer`、`chatgpt-account-id`、`originator`、`User-Agent`(含系统信息)、`OpenAI-Beta: responses=experimental`、`accept: text/event-stream`、`content-type`。

```python
headers = {
    **dict(configured_headers or {}),
    "Authorization": f"Bearer {access_token}",
    "chatgpt-account-id": account_id,
    "originator": originator,
    "User-Agent": f"tau ({system()} {release()}; {machine()})",
    "OpenAI-Beta": "responses=experimental",
    "accept": "text/event-stream",
    "content-type": "application/json",
}
```

这段代码说明了 Codex 的专有鉴权头组合:除 Bearer 令牌外还需 `chatgpt-account-id` 与 `OpenAI-Beta: responses=experimental`,共同表明这是 ChatGPT 订阅会话。

#### `def _resolve_codex_url(base_url) -> str`
确保以 `/codex/responses` 结尾(已含 `/codex/responses` 保持;`/codex` 补 `/responses`;否则补)。

#### `def _split_tool_call_id(value: str) -> tuple[str, str | None]`
按首个 `|` 拆成 `(call_id, item_id)`。

#### `def _loads_object(value: str) -> dict[str, JSONValue] | None`
`loads` 失败或非 dict 返回 None。

#### `def _is_retryable_status(status_code: int, body: str) -> bool`
`status_code==429` 且 `_is_terminal_rate_limit(body)` 则返回 False;否则 `status_code in {408,409,425,429} or >=500`。

#### `def _is_terminal_rate_limit(body: str) -> bool`
body 小写后若含任一计费相关 marker(`gousagelimiterror`/`freeusagelimiterror`/`monthly usage limit reached`/`available balance`/`insufficient_quota`/`out of budget`/`quota exceeded`/`billing`)返回 True。

---

## 文件:fake.py

确定性测试 provider，不发起任何网络请求，只回放预定义的 Pi 事件流，用于 agent-loop 测试。

### FakeProvider

#### `__init__(self, streams: Iterable[Iterable[AssistantMessageEvent]]) -> None`
把每个传入的 **Pi 事件流** `list(...)` 存入 `self._streams`，并初始化 `self.calls`（记录每次调用的 `(model, system, messages, tools)`）。注意 FakeProvider 直接构造 `AssistantMessageEvent`（Pi 事件），不经过 `ProviderEvent` 中间层。

#### `def stream_response(self, *, model, system, messages, tools, signal=None) -> AsyncIterator[AssistantMessageEvent]`
记录本次调用到 `self.calls`（`model, system, list(messages), list(tools)`）；从 `self._streams` 弹出下一条流（无则空列表）；定义内部 `async def iterator()` 逐 `yield event`，但每轮检查 `signal is not None and signal.is_cancelled()` 可提前 `return`；返回该迭代器。即每次调用消费一个预脚本 Pi 事件流，使测试具备确定性、可断言调用参数。

```python
def stream_response(self, *, model, system, messages, tools, signal=None):
    self.calls.append((model, system, list(messages), list(tools)))
    stream = self._streams.pop(0) if self._streams else []

    async def iterator() -> AsyncIterator[AssistantMessageEvent]:
        for event in stream:
            if signal is not None and signal.is_cancelled():
                return
            yield event

    return iterator()
```

这段代码说明了 FakeProvider 的确定性来源：它不碰网络，只是逐条回放预存的 Pi 事件流，并把入参记进 `self.calls` 供测试断言。与其他 provider 不同，FakeProvider 直接产出 `AssistantStartEvent`/`TextDeltaEvent`/`AssistantDoneEvent` 等 Pi 事件，跳过了 `ProviderEvent` → `canonicalize_provider_stream` 的桥接步骤。

### 对比小结（各 provider 在请求体、工具 schema、思考格式、事件映射 上的异同）

下面从四个维度对比各 provider 的实现差异：

**端点与鉴权**：openai_compatible 子类通用 `/chat/completions` 或 `/v1/responses` + Bearer；anthropic 用 `/messages` + `x-api-key`/`anthropic-version`；google 用 `/models/{model}:streamGenerateContent?key=`（key 在 query 参数中）；mistral 复用 `/chat/completions` + Bearer；codex 用 `{base_url}/codex/responses` + Bearer+`chatgpt-account-id`+`OpenAI-Beta`。

**工具 schema**：`tools` 顶层键名各异——OpenAI 系用 `tools[].function.{name,parameters}`，Anthropic 用 `tools[].{name,input_schema}`，Google 用 `tools[].functionDeclarations[].{name,parameters}`（且清理 `additionalProperties`/`$schema`），Codex 同 OpenAI 但 `strict: None`，Mistral 同 OpenAI 但 `strict: False`。

**thinking（思考/推理）**：OpenAI 系靠 `reasoning_effort`/`reasoning`（按 thinking_format 多变），Anthropic 用 `thinking.budget_tokens` 或 `adaptive`+`output_config.effort`，Google 用 `thinkingConfig`（`thinkingBudget`/`thinkingLevel`/`includeThoughts`），Mistral 用 `reasoning_effort:"high"` 或 `prompt_mode:"reasoning"`，Codex 用 `reasoning.effort`+`summary`。

**流式事件映射**：所有 provider 内部 parser 都把原生块映射为统一的 `ProviderResponseStartEvent`/`ProviderTextDeltaEvent`/`ProviderThinkingDeltaEvent`/`ProviderToolCallEvent`/`ProviderResponseEndEvent`/`ProviderErrorEvent`/`ProviderRetryEvent`，再经 `stream.py` 的 `canonicalize_provider_stream` 桥接为 Pi 事件（`AssistantStartEvent`/`TextDeltaEvent`/`ThinkingDeltaEvent`/`ToolCallStartEvent`/`AssistantDoneEvent`/`AssistantErrorEvent`）。FakeProvider 则直接构造 Pi 事件，跳过过渡层。差异在原生事件名：OpenAI 系看 `choices[].delta`/Responses `response.*`；Anthropic 看 `content_block_*`/`message_delta`；Google 看 `candidates[].content.parts` 且以 `thought` 标志区分 thinking；Codex 内联处理 `response.*` 且 thinking 映射到 `reasoning.*` 系列。错误统一转 `ProviderErrorEvent`（HTTP 用 `provider_http_error_message`，流内错误用各自 `_*_error_message`）。

**偏离基类**：除 mistral/openai_compatible 共享"chat-completions 同构信封"思路外，anthropic、google、codex 均自成一套流式解析（anthropic 在 `_stream_provider_events` 内联分支、google 用 `_GoogleStreamParser`、codex 用异步生成器 `_codex_provider_events`），且各自有独立的消息格式转换与 usage/retry 判定。openai_compatible 通过 `_use_responses_api` 参数化路由覆盖了绝大多数 OpenAI 兼容端点，mistral 与 codex 则是对该范式的变体（前者贴近 chat、后者贴近 responses 但带订阅凭证）。所有 provider（除 Fake 外）共享同一个 `canonicalize_provider_stream` 桥接层，确保对外暴露的事件契约一致。

---

<!-- NAV -->
[← tau_ai · 环境配置]({{< relref "./ai-env-config.md" >}})
[↑ 总览]({{< relref "./source-walkthrough.md" >}})
[→ tau_agent · 数据模型]({{< relref "./agent-models.md" >}})
