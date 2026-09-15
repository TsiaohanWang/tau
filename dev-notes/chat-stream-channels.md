# 独立的 Chat Completions 通道 / Independent Chat Completions channels

[原文]
DeepSeek V4 Flash through Hugging Face/DeepInfra can interleave `content` and
`reasoning_content` fragments, including both fields in one SSE chunk. The
Chat Completions parser already accumulated each field correctly, but the
canonical stream bridge treated every field switch as an ordered block boundary.
That split both reasoning and answer sentences in the persisted transcript.

[译文]
经 Hugging Face/DeepInfra 访问的 DeepSeek V4 Flash 会把 `content` 与 `reasoning_content` 片段交错发送,甚至在一个 SSE 分块中同时包含两个字段。Chat Completions 解析器本已正确累积每个字段,但规范流桥接层把每次字段切换都当作有序块的边界。这会把持久化会话记录中的推理句子与回答句子都切断。

[原文]
The OpenAI-compatible adapter now selects independent channel assembly only for
Chat Completions, using the same transport decision as request dispatch. Each
channel keeps a stable content index and emits one start/end pair. Both remain
open until tool calls or response completion; partial/error snapshots retain the
assembled blocks. First-seen channel order is preserved. Responses and other
providers retain sequential ordering; no model-name-specific workaround is used.

[译文]
OpenAI 兼容适配器现在只为 Chat Completions 选择「独立通道组装」,并使用与请求分派相同的传输判定。每个通道保持稳定的 content 索引,并只发出一对 start/end。两者会一直保持打开,直到出现工具调用或响应完成;部分/错误快照会保留已组装的内容块。通道按首次出现的顺序保留。Responses 与其他 provider 仍保持顺序语义;没有使用任何针对具体模型名的临时绕行方案。

[原文]
The TUI keeps an open thinking widget while answer deltas arrive and closes it
on the explicit thinking-end event. This follows Pi's indexed event lifecycle
without adding frontend concerns to the portable harness. Final messages still
use the normal adapter/persistence path. Existing saved sessions are not rewritten.

[译文]
当回答增量到达时,TUI 会让 thinking 组件保持打开,并在显式的 thinking-end 事件上关闭它。这遵循 Pi 的带索引事件生命周期,同时没有把前端关注点加入可移植 harness。最终消息仍走常规的适配器/持久化路径。既有的已保存会话不会被重写。

[原文]
Regression checks use mock SSE chunks matching the reported fragment pattern,
including simultaneous fields, stable indices, signatures, immutable snapshots,
and a Textual test for the live widgets. Run:

[译文]
回归检查使用与所报告片段模式一致的 mock SSE 分块,覆盖:同时到达的字段、稳定索引、签名、不可变快照,以及针对实时组件的 Textual 测试。运行:

```sh
uv run pytest tests/test_chat_channels.py tests/test_tui_chat_channels.py tests/test_tau_ai.py
```
