# Hugging Face 响应方 provider 元数据 / Hugging Face response-provider metadata

[原文]
Tau's built-in `huggingface` provider uses Hugging Face's OpenAI-compatible
router. An unsuffixed model leaves provider selection automatic, so the backing
Inference Provider can differ between requests and can change after a failure.

[译文]
Tau 内置的 `huggingface` provider 使用 Hugging Face 的 OpenAI 兼容路由器。不带后缀的模型会让 provider 选择保持自动,因此背后的 Inference Provider 可能在不同请求之间不同,也可能在失败之后发生变化。

[原文]
Hugging Face reports the provider that handled an HTTP response in the
`x-inference-provider` header. Tau now preserves that value on the resulting
`AssistantMessage` as `response_provider` (`responseProvider` in serialized
messages). The existing `provider` field remains the logical Tau provider,
`huggingface`.

[译文]
Hugging Face 会在 `x-inference-provider` 头中报告处理该 HTTP 响应的 provider。Tau 现在把这个值保留在结果 `AssistantMessage` 的 `response_provider` 上(序列化消息中为 `responseProvider`)。既有的 `provider` 字段仍是逻辑上的 Tau provider,即 `huggingface`。

[原文]
This is intentionally per-response metadata rather than session metadata. The
OpenAI-compatible adapter reads the header only when the runtime configuration
enables it, and the built-in Hugging Face configuration is the only configuration
that does so. The provider-neutral stream bridge copies the resolved value to
streaming partials and the final persisted assistant message. Failed responses
also retain the value when the header is present.

[译文]
这有意是「按响应」的元数据,而不是会话元数据。OpenAI 兼容适配器只在运行时配置启用时才读取该头,而内置的 Hugging Face 配置是唯一这样做的一个。Provider 无关的流桥接层把解析出的值复制到流式部分消息与最终持久化的 assistant 消息上。当该头存在时,失败的响应也会保留该值。

[原文]
Because the value comes from each successful HTTP response, a retry or future
session-level failover records the replacement provider on the response it
actually served. Tau does not infer a provider from the requested model and does
not expose provider selection or pinning controls in this change.

[译文]
由于该值来自每一次成功的 HTTP 响应,重试或未来的会话级故障转移会在实际服务的那个响应上记录替换后的 provider。Tau 不会从请求的模型推断 provider,本次变更也不暴露 provider 选择或固定(pinning)控件。

## 验证(Validation)

[原文]
Focused tests use an `httpx.MockTransport` to simulate one failed response from
one Inference Provider followed by a successful response from another. They
verify that only the provider from the successful request becomes the final
message's `response_provider`, while `provider` remains `huggingface`.

[译文]
聚焦测试使用 `httpx.MockTransport` 模拟「某个 Inference Provider 返回一次失败响应,随后另一个 provider 返回成功响应」。它们验证:只有成功请求的 provider 会成为最终消息的 `response_provider`,而 `provider` 仍为 `huggingface`。

[原文]
Run:

[译文]
运行:

```bash
uv run pytest tests/test_tau_ai.py tests/test_provider_config.py tests/test_agent_types.py
uv run ruff check .
uv run ruff format --check .
uv run mypy
```
