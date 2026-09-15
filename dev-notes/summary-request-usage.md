# 持久化摘要请求的用量 / Persist summary-request usage

## 变更内容(What changed)

[原文]
Compaction and branch-summary entries now have optional `usage`, `provider`,
`model`, and `response_provider` fields. `usage` uses `tau_agent.messages.Usage`,
the same strict token-and-cost model stored on assistant messages. The coding
session captures the final provider event's usage when it generates a summary
and persists it with the exact logical provider, model, and resolved routing
provider used for that request.
Multiple completion events are combined field by field so the entry represents
the total cost of producing the summary.

[译文]
压缩条目与分支摘要条目现在拥有可选的 `usage`、`provider`、`model` 与 `response_provider` 字段。`usage` 使用 `tau_agent.messages.Usage`,即与 assistant 消息上存储的相同的严格 token 与成本模型。编码会话在生成摘要时捕获最终 provider 事件的用量,并把它与该请求所使用的精确逻辑 provider、模型与解析后的路由 provider 一起持久化。
多个完成事件会逐字段合并,因此该条目代表生成该摘要的总成本。

[原文]
Model-assisted branch summaries retain usage. If generation fails or produces
no usable text, Tau's deterministic heuristic remains the fallback and the
entry records `usage=None` because no successful model summary was used.

[译文]
由模型辅助的分支摘要保留用量。如果生成失败或没有产出可用文本,Tau 的确定性启发式仍是回退,且该条目记录 `usage=None`,因为并没有使用成功的模型摘要。

[原文]
The HTML export's usage collector treats persisted summary usage as a real,
separately labeled request. The cumulative session-statistics collector does the
same for the TUI sidebar. Both include those tokens in prompt, cache, output,
hit-rate, and estimated-cost totals. New entries provide the exact persisted
provider/model and, when reported, the resolved provider used by a routing
service; legacy entries fall back to preceding model-change or assistant
metadata. Summary requests are recorded before the compaction or branch event
that they produce, so event markers remain attached to the next context request.
The shared Pi-compatible `Usage` object itself intentionally contains
only tokens and cost. RPC entry projections include `usage` where present, and the
transcript detail panel displays the raw usage object.

[译文]
HTML 导出的用量采集器会把持久化的摘要用量当作一次真实的、单独标记的请求。累计式会话统计采集器对 TUI 侧边栏也这样做。二者都会把这些 token 计入提示词、缓存、输出、命中率与估算成本总量。新条目提供精确的持久化 provider/model,并在有上报时提供路由服务使用的已解析 provider;旧式条目则回退到之前最近的模型变更或 assistant 元数据。摘要请求记录在它们所产生的压缩或分支事件之前,因此事件标记仍附着在下一次上下文请求上。共享的、与 Pi 兼容的 `Usage` 对象本身有意只包含 token 与成本。RPC 条目投射会在存在时包含 `usage`,会话记录详情面板则展示原始 usage 对象。

## 为什么需要它(Why it exists)

[原文]
Summary generation can reread most of a session and may be one of its largest
requests. Previously Tau discarded its final usage event, so session exports
systematically underreported token consumption and estimated cost. Persisting
usage on the session entry follows Pi's separation: the portable session schema
owns durable request facts, while the coding-session layer captures them and UI
analytics consume them.

[译文]
摘要生成可能需要重读会话的大部分内容,可能是其中最大的请求之一。此前 Tau 丢弃了它的最终用量事件,因此会话导出会系统性地低报 token 消耗与估算成本。把用量持久化到会话条目上遵循 Pi 的分离:可移植会话 schema 持有持久化的请求事实,编码会话层负责捕获它们,UI 分析负责消费它们。

## 会话兼容性(Session compatibility)

[原文]
The new fields default to `None` and JSONL serialization excludes null values.
Therefore session files written before this change load unchanged, and newly
written heuristic summaries have the same shape as legacy summaries. Analytics
skip missing usage rather than creating a synthetic zero-token request.

[译文]
新字段默认为 `None`,且 JSONL 序列化会排除空值。因此本次变更之前写入的会话文件可原样加载,新写入的启发式摘要与旧式摘要形态相同。分析逻辑会跳过缺失的用量,而不是虚构一次零 token 请求。

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
uv build
cd website && hugo --minify && npx --yes pagefind@latest --site public
```

[原文]
Tests cover model-event capture for both summary paths, fallback and legacy
`None` behavior, JSONL aliases/round trips, aggregate analytics, RPC projection,
and HTML export rendering.

[译文]
测试覆盖两条摘要路径的模型事件捕获、回退与旧式 `None` 行为、JSONL 别名/双向读写、聚合分析、RPC 投射,以及 HTML 导出渲染。
