# 响应计时与有效输出速度 / Response timing and effective output speed

## 变更内容(What changed)

[原文]
Tau now measures every provider response at three boundaries in the portable
agent loop:

[译文]
Tau 现在在可移植 agent 循环中的三个边界上测量每一次 provider 响应:

[原文]
1. waiting for provider stream events starts;
2. the first text, thinking, or tool-call output arrives;
3. the response completes or fails.

[译文]
1. 开始等待 provider 流事件;
2. 第一批文本、thinking 或工具调用输出到达;
3. 响应完成或失败。

[原文]
Only time spent awaiting the provider iterator is accumulated. Time spent by an
upstream consumer rendering, persisting, or diagnosing an event before requesting
the next event is excluded.

[译文]
只有等待 provider 迭代器所花的时间会被累计。上游消费者在请求下一个事件之前用于渲染、持久化或诊断该事件的时间不计入。

[原文]
The loop uses a monotonic clock and stores two compact durations on the final
`AssistantMessage`: `timeToFirstOutputMs` and `totalDurationMs`. Because session
persistence already writes final assistant messages, timing is automatically
saved beside provider-reported usage in JSONL. The optional field keeps older
sessions readable; old messages simply have no timing statistics.

[译文]
循环使用单调时钟,并在最终 `AssistantMessage` 上存储两个紧凑的时长:`timeToFirstOutputMs` 与 `totalDurationMs`。由于会话持久化本就会写入最终的 assistant 消息,计时会与 provider 上报的用量一起自动保存到 JSONL。该可选字段让旧会话保持可读;旧消息只是没有计时统计。

## 为什么需要它(Why it exists)

[原文]
The enclosing session-entry timestamp records persistence time, not request
start, so historical JSONL could not reliably calculate response speed. Pairing
monotonic durations with each response's output-token count makes the metric
replayable after resume and robust against wall-clock changes.

[译文]
外层会话条目的时间戳记录的是持久化时间,而不是请求开始时间,因此历史 JSONL 无法可靠地计算响应速度。把单调时长与每次响应的输出 token 数配对,使该指标在恢复之后仍可重放,并且不受墙上时钟变化影响。

[原文]
Tau calls the sidebar metric **effective output speed**:

```text
output tokens / total response duration
```

[译文]
Tau 把侧边栏中的该指标称为**有效输出速度(effective output speed)**:

```text
输出 token / 总响应时长
```

[原文]
It includes provider queueing, network waits, prefill, and time to first output,
but excludes Tau's work between stream pulls. The session value is token-weighted:

```text
sum(timed output tokens) / sum(timed response durations)
```

[译文]
它包含 provider 排队、网络等待、预填充与到首次输出的时间,但排除 Tau 在两次拉取流之间所做的工作。会话级取值按 token 加权:

```text
sum(有计时的输出 token) / sum(有计时的响应时长)
```

[原文]
This avoids over-weighting short responses. Untimed older messages remain in
usage and cost totals but do not enter the speed denominator.

[译文]
这避免给短响应过高的权重。没有计时的旧消息仍留在用量与成本总量中,但不进入速度的分母。

## 架构对应(Architecture mapping)

[原文]
- `tau_agent.messages.ResponseTiming` owns the provider-neutral wire shape.
- `tau_agent.loop` accumulates monotonic provider-await durations and attaches
  timing to the final assistant message.
- `tau_coding.session_stats` aggregates token-weighted TPS and arithmetic-mean TTFT.
- `tau_coding.tui.widgets` renders average TPS and average TTFT.

[译文]
- `tau_agent.messages.ResponseTiming` 持有 provider 无关的线上形态。
- `tau_agent.loop` 累计单调的 provider 等待时长,并把计时附加到最终 assistant 消息上。
- `tau_coding.session_stats` 聚合按 token 加权的 TPS 与算术平均 TTFT。
- `tau_coding.tui.widgets` 渲染平均 TPS 与平均 TTFT。

[原文]
No Textual dependency enters `tau_agent`, and provider adapters need no custom
timing implementation.

[译文]
没有 Textual 依赖进入 `tau_agent`,provider 适配器也不需要自定义计时实现。

## 验证(Validation)

```bash
uv run pytest tests/test_agent_loop.py tests/test_agent_types.py tests/test_session.py \
  tests/test_session_stats.py tests/test_tui_app.py
uv run pytest
uv run ruff check .
uv run ruff format --check .
uv run mypy
```
