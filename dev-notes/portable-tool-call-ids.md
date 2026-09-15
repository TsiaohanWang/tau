# 跨 Provider 切换的可移植工具调用 ID / Portable tool-call IDs across provider switches

## 问题(Problem)

[原文]
Provider transcripts contain tool-call identifiers that correlate an assistant's
request with the later tool result. Those identifiers are not portable by
default. OpenAI Codex, for example, needs both a `call_id` and a response item ID,
so Tau's persisted compatibility representation joins them with `|`:

[译文]
Provider 的会话记录包含用于把 assistant 的请求与后续工具结果关联起来的工具调用标识符。这些标识符默认不可移植。例如 OpenAI Codex 同时需要 `call_id` 与响应条目 ID,因此 Tau 持久化的兼容表示用 `|` 把它们连接起来:

```text
call_XwFnGCtoQNIN2ID9ahtpLvsI|fc_0ca1b059695ff22f
```

[原文]
Anthropic only accepts letters, digits, `_`, and `-` in `tool_use.id`. Switching a
session with Codex tool history to Claude therefore produced an HTTP 400 before
Claude could answer.

[译文]
Anthropic 的 `tool_use.id` 只接受字母、数字、`_` 与 `-`。因此,把一个带有 Codex 工具历史的会话切换到 Claude,会在 Claude 能回答之前就产生 HTTP 400。

## 实现(Implementation)

[原文]
`src/tau_ai/tool_call_ids.py` defines the common outbound correlation format.
Already-portable IDs remain unchanged. IDs containing provider-specific syntax,
or exceeding the conservative shared length, become a deterministic ID derived
from SHA-256:

[译文]
`src/tau_ai/tool_call_ids.py` 定义了通用的出站关联格式。已经可移植的 ID 保持不变。包含 provider 特有语法、或超过保守共享长度的 ID,会变成由 SHA-256 派生出的确定性 ID:

```text
tc_<40 lowercase hex characters>
```

[原文]
Hashing rather than replacing punctuation prevents IDs such as `a|b` and `a_b`
from collapsing to the same value. Because conversion is deterministic, each
provider adapter can translate a tool call and its later result independently
and still emit matching IDs. Parallel calls remain distinct.

[译文]
采用哈希而不是替换标点,可以防止 `a|b` 与 `a_b` 这类 ID 塌缩为同一个值。由于转换是确定性的,每个 provider 适配器可以独立地转换某个工具调用及其后续结果,仍然得到互相匹配的 ID。并行调用保持彼此区分。

[原文]
The Anthropic, Google, Mistral, OpenAI Responses, and OpenAI-compatible Chat
serializers apply this conversion at their provider boundary. Persisted JSONL is
not rewritten, so old sessions remain intact and are repaired in memory whenever
they are sent to a target provider. Native IDs that already fit the shared format
retain same-provider replay behavior.

[译文]
Anthropic、Google、Mistral、OpenAI Responses 与 OpenAI 兼容 Chat 的序列化器都在各自的 provider 边界上应用该转换。持久化的 JSONL 不会被改写,因此旧会话保持完整,并在每次发送给目标 provider 时于内存中得到修复。已经符合共享格式的原生 ID 保持同 provider 重放行为。

[原文]
Anthropic compilation also drops thinking blocks from non-Anthropic assistant
messages. Thinking signatures are opaque provider-owned state; forwarding an
OpenAI or Google signature as an Anthropic signature would simply move the
cross-provider validation failure from the tool ID to the thinking block.

[译文]
Anthropic 编译还会丢弃非 Anthropic assistant 消息中的 thinking 块。Thinking 签名是 provider 拥有的不透明状态;把 OpenAI 或 Google 的签名当作 Anthropic 签名转发,只会把跨 provider 校验失败从工具 ID 转移到 thinking 块上。

## 架构(Architecture)

[原文]
The provider-neutral transcript remains in `tau_agent`. Provider constraints and
history translation stay in `tau_ai`, where wire payloads are built. This keeps
the agent loop and session storage independent of any vendor's identifier regex.

[译文]
Provider 无关的会话记录仍留在 `tau_agent`。Provider 约束与历史翻译留在构建线上载荷的 `tau_ai`。这使 agent 循环与会话存储独立于任何厂商的标识符正则表达式。

## 验证(Verification)

[原文]
Focused regression tests build Codex-style history entirely in memory and compile
it for Anthropic. They verify that:

[译文]
聚焦回归测试完全在内存中构建 Codex 风格的历史,并把它编译给 Anthropic。它们验证:

[原文]
- call and result IDs match after conversion;
- parallel calls remain distinct;
- generated IDs satisfy Anthropic's accepted alphabet;
- foreign thinking signatures are omitted;
- native Anthropic thinking and already-safe IDs remain unchanged.

[译文]
- 转换之后调用 ID 与结果 ID 匹配;
- 并行调用保持彼此区分;
- 生成的 ID 满足 Anthropic 接受的字符集;
- 外来的 thinking 签名被省略;
- 原生 Anthropic thinking 与已经安全的 ID 保持不变。

[原文]
Run:

[译文]
运行:

```bash
uv run pytest tests/test_cross_provider_history.py
uv run pytest
uv run ruff check .
uv run ruff format --check .
uv run mypy
```
