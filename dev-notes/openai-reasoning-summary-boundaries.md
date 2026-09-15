# OpenAI 推理摘要边界 / OpenAI reasoning summary boundaries

[原文]
OpenAI Responses models can stream several `reasoning_summary_text` parts during
one assistant turn. Each part is followed by a
`response.reasoning_summary_part.done` event. Tau previously forwarded only the
text deltas, so Markdown summaries such as `**First step**` and `**Second step**`
were concatenated into `**First step****Second step**` in live display, persisted
messages, and replay.

[译文]
OpenAI Responses 模型可以在一个 assistant 轮次中流式输出多个 `reasoning_summary_text` 片段。每个片段之后都跟着一个 `response.reasoning_summary_part.done` 事件。Tau 此前只转发文本增量,因此像 `**First step**` 与 `**Second step**` 这样的 Markdown 摘要会在实时显示、持久化消息与重放中被拼接成 `**First step****Second step**`。

[原文]
Both Responses parsers now translate each completed summary-part boundary into a
blank-line thinking delta. The canonical stream therefore retains separate
Markdown paragraphs without inventing or exposing private reasoning content.
This applies to the OpenAI-compatible Responses transport and the ChatGPT Codex
subscription transport.

[译文]
两个 Responses 解析器现在都会把每个已完成的摘要片段边界转换为一个空行 thinking 增量。因此规范流会保留彼此分离的 Markdown 段落,同时不会虚构或暴露私有的推理内容。这同时适用于 OpenAI 兼容的 Responses 传输与 ChatGPT Codex 订阅传输。

[原文]
The fix belongs in `tau_ai` rather than the TUI: canonical `ThinkingContent` must
already contain the correct boundaries so every frontend, session file, export,
and replay observes the same text. Existing sessions remain unchanged because
Tau does not rewrite durable history; newly streamed responses preserve the
boundaries.

[译文]
该修复属于 `tau_ai`,而不是 TUI:规范的 `ThinkingContent` 必须已经包含正确的边界,这样每个前端、会话文件、导出与重放观察到的文本才会一致。既有会话保持不变,因为 Tau 不会重写持久化历史;新流式输出的响应会保留边界。

[原文]
Tests in `tests/test_tau_ai.py` cover both transports and assert the individual
thinking deltas plus the final canonical message.

[译文]
`tests/test_tau_ai.py` 中的测试覆盖两种传输,并断言各个 thinking 增量以及最终的规范消息。

[原文]
Run:

[译文]
运行:

```bash
uv run pytest tests/test_tau_ai.py -k reasoning_summary
```
