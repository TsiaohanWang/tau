---
title: tau_ai · 各 Provider 实现
description: openai_compatible / anthropic / google / mistral / openai_codex / fake
---

## `tau_ai/openai_compatible.py` — OpenAI 系"总管"

最大的 provider（1044 行），因为它要同时支持 **两个 API 形态** 与多种
"思考格式"。

- 模块常量 `_RESPONSES_ONLY_PREFIXES = ("gpt-5.5", "gpt-5.4")`。
- **`_use_responses_api(model)`**：路由判断——`"codex"` 出现在模型名里，或模型名
  以 `gpt-5.5`/`gpt-5.4` 开头，则走 `/v1/responses`；否则走 `/chat/completions`。
  原因注释写得很清楚：新版推理模型在 `/chat/completions` 上不接受
  "function tools + reasoning_effort" 的组合，必须换 Responses API。

### `OpenAICompatibleProvider`

- **`__init__(config, *, client=None)`**：持有 `OpenAICompatibleConfig`；若外部没
  传 `client`，则自己创建并在 `aclose()` 时关闭（`_owns_client` 标志）。
- **`stream_response(...)`**：先判断走 `_stream_responses` 还是
  `_stream_chat_completions`，二者都调用统一的 `_stream(...)`。
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

### 两个 parser

- **`_ChatStreamParser`**：处理 `/chat/completions` 的 `choices[0].delta`
  分块。累积 `content_parts`、`_tool_call_builders`（按 `index` 分桶）；`_thinking_delta_text`
  依次尝试 `reasoning_content`/`reasoning`/`thinking` 字段；`finalize()` 把所有
  tool call 拼成 `ProviderToolCallEvent`，再发 `ProviderResponseEndEvent`
  （内含完整 `AssistantMessage`）。usage 优先从 chunk 顶层 `usage` 取，否则从
  choice 的 `usage` 取（兼容 Moonshot 等）。
- **`_ResponsesStreamParser`**：处理 `/v1/responses`（无 `[DONE]` 哨兵，靠
  `response.completed/incomplete/failed` 收尾）。按 `response.output_text.delta`、
  `response.reasoning_*.delta`、`response.function_call_arguments.delta/done`、
  `response.output_item.added/done` 等事件类型累积；`finalize()` 类似。

两个 `_ToolCallBuilder` / `_ResponsesToolCallBuilder`：把流式到达的零散
`id`/`name`/参数片段拼接成完整 `ToolCall`；参数文本 `loads` 失败则回落到
`{"_raw_arguments": 原文}`，保证事件永远可构造。

### payload 构造与各家兼容

- **`_build_chat_payload`**：组装 `model`/`stream`/`messages`，按 `compat` 配置
  决定是否带 `stream_options.include_usage`、`store`、`max_tokens` 字段名
  （`max_tokens` vs `max_completion_tokens`）、OpenRouter 的 `provider`；
  `_apply_chat_reasoning` 针对 `zai`/`qwen`/`deepseek`/`openrouter`/`together`/
  原生等**不同"思考格式"**写入不同的 reasoning 字段；最后带 `tools`。
- **`_build_responses_payload`**：用 `instructions` 当 system，把消息转成
  Responses 的 `input`（function_call / function_call_output），`store: false`
  保持无状态（每轮重发整段 transcript），带 `reasoning.summary: auto` 让思考可见。
- 大量辅助函数：`_message_to_openai`、`_tool_to_openai`、`_tool_call_to_openai`、
  `_messages_to_responses_input`、`_tool_to_responses`、`_normalize_responses_effort`、
  `_normalize_finish_reason`（把 Responses 状态映射成 chat 风格的
  `stop`/`length`/`tool_calls`）、`_parse_chunk_usage` / `_usage_from_responses_event`
  （把各家 usage 解析进 `Usage`，并遵守"None=未上报"约定，cost 一律留空）。

> 这个文件的复杂之处在于"一套代码适配很多 OpenAI 兼容后端"。Rust `tau-rs` 的
> `tau-ai/src/openai.rs` 只覆盖了主路径，未做这么多的 `compat` 分支。

---

## `tau_ai/anthropic.py` — Anthropic Messages API

- **`ANTHROPIC_VERSION = "2023-06-01"`、`DEFAULT_MAX_TOKENS = 4096`**。
- **`AnthropicProvider`**：结构与 OpenAI 系一致（`__init__`/`aclose`/
  `stream_response`/`_get_client`/`_should_retry`），但**没有拆出共享 `_stream`**
  ——它把流式外壳直接写进 `iterator()`。值得注意：
  - `credential_resolver` 解析后，若 `base_url` 不以 `/v1` 结尾会补上。
  - 鉴权默认用 `x-api-key`，`bearer_auth=True` 时改用 `Authorization: Bearer`。
  - 逐事件处理 Anthropic 的 SSE 类型：`message_start`（取初始 usage）、
    `content_block_start`（tool_use 块起）、`content_block_delta`
    （`text_delta`/`thinking_delta`/`input_json_delta`）、`message_delta`
    （`stop_reason` + usage）、`error`。思考内容走 `thinking_delta`。
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

- **`GoogleGenerativeAIProvider`**：URL 形如
  `{base_url}/models/{model}:streamGenerateContent?alt=sse&key={api_key}`。
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

- **`MistralConversationsProvider`**：拆出了自己的 `_stream(...)` 外壳（与 OpenAI
  的类似），URL 为 `{base_url}/chat/completions`（自动补 `/v1`）。
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

- **`DEFAULT_OPENAI_CODEX_BASE_URL = "https://chatgpt.com/backend-api"`。
- **`OpenAICodexCredentials`**（frozen dataclass）：`access_token` + `account_id`
  —— Codex 不走普通 API key，而是 ChatGPT 会话令牌。
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

- **`FakeProvider`**：构造时吃一组"脚本化事件流"`streams: Iterable[Iterable[ProviderEvent]]`。
  每次 `stream_response` **消费下一条脚本流**（`self._streams.pop(0)`），原样
  yield 出去；同时把入参 `(model, system, messages, tools)` 记进 `self.calls`
  供测试断言。**无任何网络**。这是 agent-loop 测试的关键——让模型行为完全确定。

---

## 本部分小结

六个 provider 殊途同归：无论后端是 OpenAI / Anthropic / Google / Mistral /
Codex，还是测试用的 Fake，它们的 `stream_response` 都只产出那 7 种
`ProviderEvent`。差异被彻底吸收在各文件的 parser 与 payload 构造里。这正是
Part 1a 契约设计的价值：上层 `tau_agent` 永远不必关心"现在用的是哪家模型"。

下一任务（Part 2a）进入 `tau_agent`，先看它定义的"数据模型"——这些
`AgentMessage` / `ToolCall` / 事件类型正是 provider 的输入与输出所依赖的结构。

<!-- NAV -->
[← tau_ai · 环境配置]({{< relref "./ai-env-config.md" >}})
[↑ 总览]({{< relref "./source-walkthrough.md" >}})
[→ tau_agent · 数据模型]({{< relref "./agent-models.md" >}})
