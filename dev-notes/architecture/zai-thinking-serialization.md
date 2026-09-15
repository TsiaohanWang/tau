# Z.AI thinking 序列化 / Z.AI thinking serialization

## 变更内容(What changed)

[原文]
OpenAI-compatible requests for Z.AI now preserve Tau's logical thinking state
when `supportsReasoningEffort` is false. The request uses Z.AI's documented
`thinking` object:

[译文]
当 `supportsReasoningEffort` 为 false 时,发往 Z.AI 的 OpenAI 兼容请求现在会保留 Tau 的逻辑 thinking 状态。请求使用 Z.AI 文档记载的 `thinking` 对象:

```json
{"thinking": {"type": "enabled"}}
```

[原文]
and sends `type: "disabled"` for Tau's `off` mode. It no longer sends the
unrecognized `enable_thinking` field.

[译文]
并在 Tau 的 `off` 模式下发送 `type: "disabled"`。它不再发送不被识别的 `enable_thinking` 字段。

[原文]
Z.AI documents `reasoning_effort` as a separate field supported only by
GLM-5.2 and newer, with model-dependent values. Tau emits that field only when
compatibility metadata says the selected model supports it. This keeps the
provider-wide guard for models such as GLM-5.1 while allowing an explicit
model-level opt-in when catalog evidence supports it.

[译文]
Z.AI 把 `reasoning_effort` 记录为一个独立字段,仅由 GLM-5.2 及更新版本支持,且取值取决于模型。只有当兼容性元数据表明所选模型支持它时,Tau 才会发出该字段。这为 GLM-5.1 之类的模型保留了 provider 级别的守卫,同时在目录证据支持时允许显式的模型级启用。

## 为什么(Why)

[原文]
The old request builder filtered the logical effort to `None` before provider
serialization whenever `supportsReasoningEffort` was false. Z.AI's serializer
then saw thinking as disabled, even when the user selected `high`. Separating
logical toggle handling from raw effort-field support fixes the state loss
without enabling unsupported fields for other providers.

[译文]
旧的请求构建器只要遇到 `supportsReasoningEffort` 为 false,就会在 provider 序列化之前把逻辑 effort 过滤成 `None`。于是 Z.AI 的序列化器把 thinking 视为已禁用,即使用户选择的是 `high`。把「逻辑开关的处理」与「原始 effort 字段的支持」分开,修复了状态丢失,同时没有为其他 provider 启用不受支持的字段。

## 验证(Validation)

[原文]
Offline `httpx.MockTransport` tests cover:

[译文]
离线的 `httpx.MockTransport` 测试覆盖:

[原文]
- Z.AI enabled and disabled thinking payloads;
- Z.AI models with and without the separately supported effort field; and
- the existing guard that omits unsupported OpenAI `reasoning_effort` fields.

[译文]
- Z.AI 启用与禁用 thinking 的载荷;
- 带与不带「单独支持的 effort 字段」的 Z.AI 模型;以及
- 既有的、会省略不受支持的 OpenAI `reasoning_effort` 字段的守卫。

[原文]
Protocol evidence:

[译文]
协议依据:

[原文]
- <https://docs.z.ai/guides/capabilities/thinking>
- <https://docs.z.ai/api-reference/llm/chat-completion>

[译文]
- <https://docs.z.ai/guides/capabilities/thinking>
- <https://docs.z.ai/api-reference/llm/chat-completion>
