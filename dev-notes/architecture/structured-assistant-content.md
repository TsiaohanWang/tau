# 结构化的 assistant 内容与持久化的 thinking / Structured assistant content and persisted thinking

## 变更内容(What changed)

[原文]
Tau now keeps a provider response as ordered assistant content blocks:

[译文]
Tau 现在把 provider 的响应保存为有序的 assistant 内容块:

[原文]
- text
- thinking/reasoning
- tool calls

[译文]
- 文本
- thinking/推理
- 工具调用

[原文]
The finalized Pi-shaped `AssistantMessage.content` array is persisted in session
JSONL. Its `text`, `thinking_text`, and `tool_calls` properties provide convenient
views for current application and extension consumers.

[译文]
最终定稿的、Pi 形态的 `AssistantMessage.content` 数组会持久化到会话 JSONL 中。它的 `text`、`thinking_text` 与 `tool_calls` 属性为当前的应用与扩展消费方提供了便捷视图。

[原文]
Legacy Tau session rows that used string `content` and separate `tool_calls` are
migrated at the JSONL storage boundary into the canonical Pi message shape.

[译文]
使用字符串 `content` 与独立 `tool_calls` 的旧式 Tau 会话行,会在 JSONL 存储边界处迁移为规范的 Pi 消息形态。

## 为什么(Why)

[原文]
Thinking used to exist only as transient `ThinkingDeltaEvent` values. It could be
shown during a live response, but was lost at `message_end`. That made resumed
transcripts incomplete, prevented faithful export and provider replay, and forced the
TUI to infer where thinking belonged.

[译文]
过去,thinking 只以瞬时的 `ThinkingDeltaEvent` 形式存在。它可以在实时响应期间展示,但在 `message_end` 时丢失。这使恢复后的会话记录不完整,阻碍了忠实的导出与 provider 重放,还迫使 TUI 去推断 thinking 应当归位于何处。

[原文]
Pi keeps thinking, text, and tool calls in one ordered assistant content array. Tau
now follows the same core invariant while retaining compatibility properties for its
existing Python API and extension system.

[译文]
Pi 把 thinking、文本与工具调用保存在同一个有序的 assistant 内容数组中。Tau 现在遵循同样的核心不变量,同时为其既有的 Python API 与扩展系统保留兼容属性。

## Provider 行为(Provider behavior)

[原文]
Provider adapters expose Pi-compatible `AssistantMessageEvent` streams. Nested
text/thinking updates support responsive frontends; the final response is authoritative
and includes ordered blocks and opaque replay metadata where available:

[译文]
Provider 适配器暴露与 Pi 兼容的 `AssistantMessageEvent` 流。嵌套的文本/thinking 更新支撑响应式前端;最终响应是权威的,并包含有序内容块,以及在可获得时的不透明重放元数据:

[原文]
- OpenAI-compatible chat preserves the reasoning field name.
- Responses/Codex preserve serialized reasoning items when the transport supplies
  them.
- Anthropic preserves thinking signatures.
- Google preserves thought signatures.
- Mistral preserves reasoning text.

[译文]
- OpenAI 兼容 chat 保留 reasoning 字段名。
- 当传输层提供时,Responses/Codex 保留序列化的 reasoning 条目。
- Anthropic 保留 thinking 签名。
- Google 保留 thought 签名。
- Mistral 保留推理文本。

[原文]
History serializers replay supported metadata on later tool-loop requests.

[译文]
历史序列化器会在后续的工具循环请求中重放受支持的元数据。

## 前端与扩展行为(Frontend and extension behavior)

[原文]
The Textual state loader projects persisted blocks in order, so resumed thinking is
available to Ctrl+T. Live provisional rows are replaced by final structured blocks at
`message_end` through the normal transcript redraw path. That path still resolves
extension custom-message, tool-call, and tool-result renderers.

[译文]
Textual 状态加载器会按顺序投射持久化的内容块,因此恢复后的 thinking 可供 Ctrl+T 使用。实时的临时行会在 `message_end` 时通过常规的会话记录重绘路径,被最终的结构化内容块替换。该路径仍会解析扩展的自定义消息、工具调用与工具结果渲染器。

[原文]
Extensions receive the same Pi-shaped messages and nested event protocol as the rest
of Tau. Extension-driven custom messages and TUI render hooks remain separate from
assistant content and continue through the normal redraw path.

[译文]
扩展接收与 Tau 其他部分相同的 Pi 形态消息与嵌套事件协议。扩展驱动的自定义消息与 TUI 渲染钩子仍与 assistant 内容分离,并继续走常规的重绘路径。

## 验证(Validation)

[原文]
Run:

[译文]
运行:

```bash
uv run pytest
uv run ruff check .
uv run ruff format --check .
uv run mypy
```
