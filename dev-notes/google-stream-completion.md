# Google 流式完成的校验 / Google stream completion validation

## 变更内容(What changed)

[原文]
Tau's native Google Generative AI adapter now requires the stream to contain a
Google `finishReason` before it emits a successful response-end event. A clean
HTTP close without that field produces a provider error while preserving any
partial text, thinking, or tool-call content.

[译文]
Tau 原生的 Google Generative AI 适配器现在要求流中包含 Google 的 `finishReason`,才会发出成功的响应结束事件。没有该字段的干净 HTTP 关闭会产生一个 provider 错误,同时保留任何部分文本、thinking 或工具调用内容。

[原文]
An empty stream that closes cleanly is retried using the provider's configured
retry policy. Tau does not retry after model output starts because replaying the
request could duplicate visible output or tool calls. Malformed JSON stream
chunks are terminal provider errors rather than ignored input.

[译文]
干净关闭的空流会按该 provider 配置的重试策略重试。模型输出开始之后 Tau 不再重试,因为重放请求可能产生重复的可见输出或工具调用。畸形的 JSON 流分块是终态 provider 错误,而不是被忽略的输入。

## 为什么(Why)

[原文]
Google normally supplies `finishReason` in its final streamed candidate. The old
parser converted a missing value to `stop`, so a response interrupted during a
thinking block looked successfully complete. Agent sessions—and in-process
subagents—could consequently end with no final text and no visible provider
failure.

[译文]
Google 通常会在其最后一个流式候选中提供 `finishReason`。旧解析器会把缺失值转换成 `stop`,因此在 thinking 块期间被中断的响应看起来像成功完成。Agent 会话 —— 以及进程内子代理 —— 因此可能在没有最终文本、也没有可见 provider 失败的情况下结束。

[原文]
The provider-neutral stream bridge already preserves partial output on an error.
The Google adapter now reports the missing terminal marker instead of masking it,
allowing the agent loop to stop before executing a tool call from an incomplete
response.

[译文]
Provider 无关的流桥接层本就会在出错时保留部分输出。Google 适配器现在报告缺失的终止标记,而不是掩盖它,从而使 agent 循环能在执行来自不完整响应的工具调用之前停下来。

## 与 Tau 架构的对应关系(How this maps to Tau's architecture)

[原文]
The Google-specific terminal-marker rule stays in `tau_ai.google`. It emits the
existing provider-neutral error event, and `tau_ai.stream` converts that into the
canonical assistant error consumed by `tau_agent`. No Google protocol knowledge
is added to the reusable agent loop or coding UI.

[译文]
Google 特有的终止标记规则留在 `tau_ai.google`。它发出既有的 provider 无关错误事件,`tau_ai.stream` 再把它转换为 `tau_agent` 消费的规范 assistant 错误。可复用的 agent 循环或编码 UI 中没有加入任何 Google 协议知识。

## 验证(Validation)

[原文]
Focused regressions in `tests/test_tau_ai.py` cover:

[译文]
`tests/test_tau_ai.py` 中的聚焦回归覆盖:

[原文]
- clean close during thinking, preserving partial thinking;
- incomplete text/tool output, including preventing tool execution;
- retry and exhaustion for an empty clean close;
- valid `STOP` and `MAX_TOKENS` completion reasons; and
- malformed/truncated JSON chunks.

[译文]
- thinking 过程中的干净关闭,并保留部分 thinking;
- 不完整的文本/工具输出,包括阻止工具执行;
- 空流干净关闭时的重试与耗尽;
- 合法的 `STOP` 与 `MAX_TOKENS` 完成原因;以及
- 畸形/截断的 JSON 分块。

[原文]
Run them with:

[译文]
运行方式:

```bash
uv run pytest tests/test_tau_ai.py -k google_provider
```
