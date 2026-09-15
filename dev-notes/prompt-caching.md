# 提示词缓存 / Prompt caching

## OpenAI 缓存亲和性(OpenAI cache affinity)

[原文]
OpenAI automatically caches matching prompt prefixes, but successive requests are
more likely to reuse the same cache when the client supplies one stable affinity
key. Tau carries its durable coding-session id through `AgentHarness` into every
model request, including tool continuations, and clamps it to OpenAI's 64-character
`prompt_cache_key` limit.

[译文]
OpenAI 会自动缓存匹配的提示词前缀,但当客户端提供一个稳定的亲和键时,连续请求更可能复用同一个缓存。Tau 会把持久化的编码会话 id 经由 `AgentHarness` 带入每一次模型请求(包括工具续跑),并把它裁剪到 OpenAI `prompt_cache_key` 的 64 字符上限。

[原文]
Direct OpenAI Responses requests send the same value as `prompt_cache_key` in
the request body and `session_id` in the request headers. Codex OAuth uses the
same body field, but its subscription backend spells the header `session-id`.
Direct Chat Completions sends only `prompt_cache_key`.

[译文]
直连 OpenAI Responses 请求会把同一个值作为 `prompt_cache_key` 放进请求体,并作为 `session_id` 放进请求头。Codex OAuth 使用相同的请求体字段,但其订阅制后端把该头拼写为 `session-id`。直连 Chat Completions 只发送 `prompt_cache_key`。

[原文]
Tau deliberately omits the optional `x-client-request-id` header. OpenAI defines
it as a unique per-request diagnostic identifier, not a stable cache-affinity key;
reusing the session id there would make individual requests ambiguous in provider
logs. This remains stateless operation: Tau keeps `store: false` and
resends the complete transcript. The id helps routing and grouping; it cannot make
a changed system prompt, tool schema, or transcript prefix cacheable.

[译文]
Tau 有意省略可选的 `x-client-request-id` 头。OpenAI 把它定义为每次请求唯一的诊断标识符,而不是稳定的缓存亲和键;在那里复用会话 id 会让 provider 日志中的单个请求变得难以区分。这仍然是无状态操作:Tau 保持 `store: false`,并重发完整会话记录。该 id 有助于路由与分组;它无法让已变化的系统提示词、工具 schema 或会话记录前缀变得可缓存。

[原文]
Compatible gateways default to the old payload and header shape because support is
not universal. `supportsPromptCacheKey`, `sendSessionAffinityHeaders`, and
`sessionAffinityFormat` catalog compat values can opt a known route in. New and
branched sessions receive a new key; resumed sessions retain theirs. Summary and
compaction calls intentionally omit the id because their one-off prompts do not
share the conversation prefix.

[译文]
兼容网关默认使用旧的载荷与请求头形态,因为支持并不普遍。目录中的 `supportsPromptCacheKey`、`sendSessionAffinityHeaders` 与 `sessionAffinityFormat` 兼容性取值可以让已知路由选择启用。新会话与分支会话会获得新键;恢复的会话保留原来的键。摘要与压缩调用有意省略该 id,因为它们的一次性提示并不共享对话前缀。

## Anthropic 断点缓存(Anthropic breakpoint caching)

[原文]
Tau's Anthropic provider parsed and priced cache usage from the very first
release — `Usage.cache_read`, `Usage.cache_write`, and `cache_write_1h` are all
read out of `message_start` — but it never placed a single `cache_control`
breakpoint in a request. The reporting half was wired up and the requesting half
was not, so those counters read zero on every real turn and each request re-billed
the system prompt, the whole tool schema block, and the entire conversation as
fresh input. In a coding session that is expensive: the tool schemas alone run to
tens of thousands of tokens and are resent on every tool call.

[译文]
Tau 的 Anthropic provider 从第一个版本起就能解析并计价缓存用量 —— `Usage.cache_read`、`Usage.cache_write` 与 `cache_write_1h` 都会从 `message_start` 中读出 —— 但它从未在请求中放置过哪怕一个 `cache_control` 断点。上报的那一半接好了,请求的那一半却没有,因此这些计数器在每个真实轮次中都读数为零,每次请求都把系统提示词、整个工具 schema 块以及全部对话重新按全新输入计费。在编码会话中这很昂贵:仅工具 schema 就有数万 token,并且在每次工具调用时都被重发。

## 断点预算(The breakpoint budget)

[原文]
Anthropic rejects a request carrying more than four `cache_control` markers, and
the cache prefix is evaluated in `tools` → `system` → `messages` order. Tau spends
all four, in `_build_messages_payload`:

[译文]
Anthropic 会拒绝携带超过四个 `cache_control` 标记的请求,而缓存前缀按 `tools` → `system` → `messages` 的顺序求值。Tau 在 `_build_messages_payload` 中用满了全部四个:

[原文]
1. The **last tool** in the array, which caches the whole schema block.
2. The **final system block only**. When OAuth is active the system field holds a
   Claude Code identity block followed by Tau's prompt; a breakpoint on the
   identity block would cache a ~15-token prefix that the block after it already
   covers, so it would waste a slot.
3. and 4. **Two message positions** — this request's tail, and the previous
   request's tail.

[译文]
1. 数组中的**最后一个工具**,它缓存整个 schema 块。
2. **仅最后一个 system 块**。当 OAuth 活动时,system 字段包含一个 Claude Code 身份块,其后跟着 Tau 的提示词;在身份块上打断点只会缓存一个约 15 token 的前缀,而紧随其后的块已经覆盖了它,因此会浪费一个名额。
3. 与 4. **两个消息位置** —— 本次请求的尾部,以及上一次请求的尾部。

[原文]
Note that "request" is not "user turn". One prompt from the user drives as many
requests as the agent needs tool-call round trips, and all four markers are
recomputed on every one of them. Positions 3 and 4 therefore roll forward several
times within a single user turn, not once per thing the user types.

[译文]
注意「请求」不等于「用户轮次」。用户的一条提示会驱动 agent 所需的任意多次工具调用往返请求,而四个标记在每一次请求上都会被重新计算。因此位置 3 与 4 在单个用户轮次内会向前滚动多次,而不是用户每输入一次才滚动一次。

[原文]
It also matters that Anthropic's wire format sends tool results with
`role: "user"`. The two message positions are the tails of *requests*, and a
mid-turn request ends with the batch of tool results the agent just collected — so
in practice these breakpoints land on `tool_result` blocks far more often than on
anything a human wrote. A prompt from the user is position 4 only on the first
request of a turn, and position 3 only on the second.

[译文]
同样重要的是,Anthropic 的线上格式以 `role: "user"` 发送工具结果。这两个消息位置是*请求*的尾部,而轮次中途的请求以 agent 刚收集到的一批工具结果结尾 —— 因此实践中这些断点落在 `tool_result` 块上的次数远多于落在人类写下的内容上。用户的提示只在一个轮次的第一次请求中处于位置 4,只在第二次请求中处于位置 3。

[原文]
Two message breakpoints rather than one because Anthropic checks at most 20 block
positions back from a breakpoint before giving up. One Tau turn appends `2N+2`
blocks for `N` tool calls (one text block, `N` `tool_use` blocks, and `N`
single-block `tool_result` user messages), so a turn with nine or more parallel
tool calls pushes the previous cache entry outside that window and misses. Marking
where the previous request ended opens a second lookback window there. Breakpoints
are not themselves billed, so a marker that already hits costs nothing.

[译文]
之所以用两个消息断点而不是一个,是因为 Anthropic 从断点向前回看时最多检查 20 个块位置,超过即放弃。一次 Tau 轮次会为 `N` 次工具调用追加 `2N+2` 个块(一个文本块、`N` 个 `tool_use` 块,以及 `N` 条单块的 `tool_result` user 消息),因此当一轮有九个或更多并行工具调用时,会把先前的缓存条目推到该窗口之外而错失命中。标记上一次请求结束的位置,就在那里打开了第二个回看窗口。断点本身不计费,因此一个已经命中的标记不产生任何成本。

[原文]
That second position is *reconstructed from the payload* rather than remembered
across requests, and it is not a fixed distance back. Tau's transcript is
append-only and every request stops immediately before the assistant message it
produces, so the last user-role message preceding the final assistant message is
exactly where the previous request's tail breakpoint sat — again, usually a
`tool_result`. `_previous_request_boundary` walks back to find it. Two cases
return an older position than the literal previous request — a turn whose
assistant message was empty and errored or aborted is filtered out of provider
context by `_provider_context`, and consecutive assistant messages leave no user
message at the true boundary — but both only shorten the reusable prefix rather
than corrupting anything.

[译文]
第二个位置是*从载荷重建*的,而不是跨请求记住的,并且它不是固定的回退距离。Tau 的会话记录是只追加的,而每个请求都停在它所产出的 assistant 消息之前,因此最终 assistant 消息之前的最后一条 user 角色消息,恰好就是上一次请求尾部断点所在之处 —— 同样通常是 `tool_result`。`_previous_request_boundary` 会向前回溯找到它。有两种情况会返回比字面上的上一次请求更旧的位置 —— 某轮次的 assistant 消息为空且出错或被中止,会被 `_provider_context` 从 provider 上下文中过滤掉;以及连续的 assistant 消息在真实边界处没有留下 user 消息 —— 但这两种情况都只是缩短可复用前缀,而不会破坏任何东西。

[原文]
`_mark_cache_breakpoint` will only mark `text`, `image`, or `tool_result` blocks,
promotes a string `content` to a one-element text block first, and skips empty
text and empty `tool_result` content, because a breakpoint on an empty block is
rejected outright.

[译文]
`_mark_cache_breakpoint` 只会标记 `text`、`image` 或 `tool_result` 块,会先把字符串形式的 `content` 提升为单元素文本块,并跳过空文本与空的 `tool_result` 内容,因为落在空块上的断点会被直接拒绝。

## 保留期(Retention)

[原文]
`AnthropicConfig.cache_retention` is a `Literal["none", "short", "long"]`:

[译文]
`AnthropicConfig.cache_retention` 是一个 `Literal["none", "short", "long"]`:

[原文]
- `long` emits `ttl: "1h"`. Applied to Anthropic **subscription OAuth** only.
  Subscription auth is not billed per token, and the default five-minute TTL is
  shorter than a test run, a build, or reading a diff — all of which would
  otherwise expire the prefix mid-session. Note that Pi deliberately defaults to
  five minutes, but for a reason that does not apply here: Pi is not a permitted
  subscription harness, so its users pay per-token API prices where the one-hour
  write premium does not pay off. Claude Code itself uses one hour for its own
  subscription users. See "Prompt Caching In Agents" in the sources below.
- `short` is the provider default TTL. This is what **API-key** Anthropic auth
  gets, so nobody silently pays the 2x cache-write premium they did not ask for.
- `none` emits no breakpoints at all and leaves the payload byte-identical to the
  pre-caching shape, plain-string `system` field included.

[译文]
- `long` 会发出 `ttl: "1h"`。只应用于 Anthropic **订阅制 OAuth**。订阅认证不按 token 计费,而默认五分钟 TTL 比一次测试运行、一次构建或读一份 diff 都短 —— 否则这些场景都会让前缀在会话中途过期。注意 Pi 有意默认五分钟,但其理由在这里并不适用:Pi 不是被许可的订阅 harness,因此它的用户按 token 支付 API 价格,一小时的写入溢价并不划算。Claude Code 自己就为其订阅用户使用一小时。见下方来源中的 "Prompt Caching In Agents"。
- `short` 是 provider 默认 TTL。**API-key** 形式的 Anthropic 认证得到的就是它,因此没有人会在没有要求的情况下静默支付 2 倍缓存写入溢价。
- `none` 完全不发出断点,并让载荷与引入缓存之前形态逐字节一致,包括纯字符串的 `system` 字段。

[原文]
`none` exists because several catalog providers speak the Anthropic wire protocol
through a gateway rather than being Anthropic. `minimax`, `minimax-cn`,
`fireworks`, and `vercel-ai-gateway` are all `kind = "anthropic"` and so route
through `anthropic_config_from_provider`, and `vercel-ai-gateway` proxies to
non-Anthropic models entirely. Those backends may reject `cache_control` blocks or
the block-list `system` field.

[译文]
`none` 之所以存在,是因为目录中有几个 provider 是经由网关讲 Anthropic 线上协议,而不是 Anthropic 本身。`minimax`、`minimax-cn`、`fireworks` 与 `vercel-ai-gateway` 都是 `kind = "anthropic"`,因此会走 `anthropic_config_from_provider`,而 `vercel-ai-gateway` 完全代理到非 Anthropic 模型。这些后端可能拒绝 `cache_control` 块或块列表形式的 `system` 字段。

[原文]
Capability and intent are resolved separately, in `anthropic_cache_settings`.
Intent comes from the auth mode: OAuth wants `long`, an API key wants `short`.
Capability comes from three `compat` booleans, layered detected default → provider
compat → per-model compat, exactly like `forceAdaptiveThinking`:

[译文]
能力与意图在 `anthropic_cache_settings` 中分开解析。意图来自认证模式:OAuth 想要 `long`,API key 想要 `short`。能力来自三个 `compat` 布尔值,按「探测到的默认值 → provider compat → 按模型 compat」分层,与 `forceAdaptiveThinking` 完全一致:

[原文]
| Key | Effect when `false` |
| --- | --- |
| `supportsCacheControl` | Resolves to `none`. Detected `false` for any host that is not `api.anthropic.com` |
| `supportsLongCacheRetention` | Clamps `long` to `short` |
| `supportsCacheControlOnTools` | Drops only the tools breakpoint |

[译文]
| 键 | 为 `false` 时的效果 |
| --- | --- |
| `supportsCacheControl` | 解析为 `none`。对任何不是 `api.anthropic.com` 的宿主,探测结果都是 `false` |
| `supportsLongCacheRetention` | 把 `long` 夹紧为 `short` |
| `supportsCacheControlOnTools` | 只丢弃 tools 断点 |

[原文]
Capability only ever narrows intent, so the two compose with no precedence rule.
That also makes the failure mode recoverable without a source edit: if Anthropic
ever stops honoring `ttl: "1h"` on subscriptions the request 400s and tau does not
retry 400s, but a three-line catalog overlay setting
`supportsLongCacheRetention = false` clamps it back to five minutes.

[译文]
能力只会收窄意图,因此两者组合时不需要优先级规则。这也让该失败模式无需改动源码即可恢复:如果 Anthropic 哪天不再支持订阅上的 `ttl: "1h"`,请求会返回 400,而 tau 不重试 400;但只要用三行目录叠加层设置 `supportsLongCacheRetention = false`,就能把它夹回五分钟。

[原文]
Two of these keys already existed in the catalog before anything read them —
`_detected_compat` emitted `supportsLongCacheRetention` and the Fireworks model
entries carry both it and `supportsCacheControlOnTools`, mirrored in from Pi. This
wiring makes that data live rather than inventing a parallel vocabulary.

[译文]
其中两个键在有任何代码读取它们之前就已经存在于目录中 —— `_detected_compat` 会发出 `supportsLongCacheRetention`,而 Fireworks 的模型条目同时带有它与 `supportsCacheControlOnTools`(从 Pi 镜像而来)。这次接线让那些数据真正生效,而不是另造一套并行词汇。

## 可观测性(Observability)

[原文]
Without a visible hit rate there is no way to tell caching is working except by
watching a rate limit, so `SessionStats` accumulates `cached_input_tokens` and
`cache_write_tokens` and exposes both cumulative and latest-request cache hit
rates. The sidebar labels both: the latest rate diagnoses the most recent model
request, while the session rate describes lifetime cache efficiency on the active
branch. After tools run, latest means the final model continuation rather than the
user's initial request. Both rates are omitted when no provider in the branch has
reported cache activity, so backends without prompt caching are not shown a
permanent misleading `0%`.

[译文]
如果没有可见的命中率,除了盯着限流之外没有办法判断缓存是否在起作用,因此 `SessionStats` 累计 `cached_input_tokens` 与 `cache_write_tokens`,并同时暴露累计命中率与最近一次请求命中率。侧边栏对两者都做了标注:最近一次命中率用于诊断最近那次模型请求,会话命中率描述活动分支上的生命周期缓存效率。工具运行之后,「最近一次」指的是最终模型续跑,而不是用户最初的请求。当分支上没有任何 provider 报告缓存活动时,两个命中率都会被省略,因此不支持提示词缓存的后端不会永久显示一个误导性的 `0%`。

## 与 Pi 的对比(Comparison with Pi)

[原文]
Tau's Anthropic caching is intentionally more defensive than Pi's default
placement, while Pi remains ahead on the OpenAI-family providers.

[译文]
Tau 的 Anthropic 缓存有意比 Pi 的默认放置更保守,而 Pi 在 OpenAI 家族 provider 上仍处于领先。

### Tau 更优之处:长且工具密集的 Anthropic 轮次(Where Tau does better: long, tool-heavy Anthropic turns)

[原文]
Both implementations cache the stable prefix: system instructions and the tool
schema. Pi then marks the final conversation message. Tau instead reserves its
remaining two markers for both the current request tail **and** the previous
request boundary.

[译文]
两种实现都会缓存稳定前缀:系统指令与工具 schema。Pi 随后标记最后一条对话消息。Tau 则把剩余两个标记分别留给当前请求尾部**以及**上一次请求边界。

[原文]
That extra marker matters because Anthropic searches only a bounded number of
content blocks backwards from a marker. A single agent turn with many parallel
tool calls appends an assistant text block, one `tool_use` block per call, and one
`tool_result` block per result. By the next request, the previously reusable
prefix can be outside the lookup window of a marker placed only at the current
tail. Tau's boundary marker provides a second, closer lookup position, preserving
a cache read in cases where Pi's one message-tail marker may miss.

[译文]
这个额外标记之所以重要,是因为 Anthropic 从标记向前回看的内容块数量是有界的。单次 agent 轮次若包含许多并行工具调用,会追加一个 assistant 文本块、每次调用一个 `tool_use` 块、每个结果一个 `tool_result` 块。到下一次请求时,原本可复用的前缀可能落在「仅放在当前尾部」的那个标记的查找窗口之外。Tau 的边界标记提供了第二个更近的查找位置,在 Pi 的单一消息尾部标记可能错失的场景中保住了缓存读取。

[原文]
Tau also makes retention depend on the auth economics: subscription OAuth gets
Anthropic's one-hour cache lifetime, while API-key calls retain the cheaper short
default. Capability flags can disable cache control entirely, suppress only the
tools marker, or fall back from one hour to the short lifetime for incompatible
gateways. These choices are described in [Retention](#retention).

[译文]
Tau 还让保留期取决于认证经济学:订阅制 OAuth 获得 Anthropic 一小时的缓存生命周期,而 API-key 调用保留更便宜的短默认值。能力开关可以完全禁用缓存控制、只抑制 tools 标记,或对不兼容网关从一小时回退到短生命周期。这些选择见 [Retention](#retention)。

### Pi 更优之处:OpenAI 兼容缓存亲和性(Where Pi does better: OpenAI-compatible cache affinity)

[原文]
Pi carries the stable session ID into provider requests and translates it into
provider-specific cache controls. Depending on the endpoint, that includes an
OpenAI prompt-cache key, retention hint, and session-affinity headers; Mistral's
prompt-cache key and affinity header; and Anthropic-style cache markers for
compatible OpenRouter routes.

[译文]
Pi 会把稳定的会话 ID 带入 provider 请求,并把它转换为各 provider 特有的缓存控制。视端点而定,这包括 OpenAI 的提示词缓存键、保留期提示与会话亲和头;Mistral 的提示词缓存键与亲和头;以及面向兼容 OpenRouter 路由的 Anthropic 风格缓存标记。

[原文]
Tau currently has a durable session ID, but its OpenAI-compatible and Codex
payload builders do not use it for prompt-cache keys or affinity headers. The
full transcript is therefore still eligible for providers' automatic prefix
caching, but Tau does not give those providers the additional stable-routing hint
that Pi does. This is not a cross-provider cache: caches remain isolated per
provider and model. The improvement is to retain cache affinity across successive
calls in one Tau session.

[译文]
Tau 目前拥有持久化会话 ID,但它的 OpenAI 兼容与 Codex 载荷构建器没有把它用于提示词缓存键或亲和头。因此完整会话记录仍可被 provider 的自动前缀缓存覆盖,但 Tau 没有给这些 provider 提供 Pi 那样的额外稳定路由提示。这不是跨 provider 缓存:缓存仍按 provider 与模型隔离。这项改进的目的是让同一个 Tau 会话中的连续调用保持缓存亲和性。

### 后续方向(Follow-up direction)

[原文]
Port Pi's provider-specific affinity behavior behind Tau catalog compatibility
flags. Start with direct OpenAI Responses, Chat Completions, and Codex routes;
then add Mistral and eligible OpenRouter routes. Keep Tau's Anthropic placement
and retention policy unchanged. Extend `SessionStats` with provider/model-level
cache-read share and estimated savings so a reported cache read can be
distinguished from a high sustained hit rate.

[译文]
把 Pi 的 provider 特有亲和性行为移植到 Tau 目录兼容性开关之后。先做直连 OpenAI Responses、Chat Completions 与 Codex 路由;再加入 Mistral 与符合条件的 OpenRouter 路由。Tau 的 Anthropic 放置与保留策略保持不变。用 provider/模型级别的缓存读取占比与估算节省扩展 `SessionStats`,使「某次上报缓存读取」与「持续高命中率」能够区分开来。

## 验证(Validate)

```bash
uv run pytest tests/test_prompt_caching.py tests/test_provider_runtime.py \
  tests/test_tau_ai.py tests/test_session_stats.py tests/test_tui_app.py
uv run ruff check .
uv run mypy
```

[原文]
`tests/test_prompt_caching.py` covers the awkward transcripts rather than the
happy path: the four-breakpoint ceiling, a twelve-call parallel turn, adjacent
assistant messages, image and `tool_result` tails, empty content, and that the
caller's messages are never mutated.

[译文]
`tests/test_prompt_caching.py` 覆盖的是那些棘手的会话记录而不是顺利路径:四断点上限、一次十二个并行调用的轮次、相邻 assistant 消息、图片与 `tool_result` 尾部、空内容,以及调用方的消息永远不会被修改。

[原文]
To confirm end to end against the live API, drive `_build_messages_payload`
directly with `cache_retention="long"` over successive turns and read
`cache_read_input_tokens` and `cache_creation.ephemeral_1h_input_tokens` off the
response. A cold turn writes, the next turn reads back what it wrote, and a turn
adding more than 20 blocks still reads — that last case is the one the second
message breakpoint exists for.

[译文]
要针对真实 API 做端到端确认,可以在连续轮次中直接用 `cache_retention="long"` 驱动 `_build_messages_payload`,并从响应中读取 `cache_read_input_tokens` 与 `cache_creation.ephemeral_1h_input_tokens`。冷轮次写入,下一轮读回它所写的内容,而一次追加超过 20 个块的轮次仍能读取 —— 最后这种情况正是第二个消息断点存在的理由。

## 来源(Sources)

[原文]
- <https://platform.claude.com/docs/en/build-with-claude/prompt-caching> — the
  four-breakpoint limit, the `tools` → `system` → `messages` prefix order, the
  20-block lookback window (with a worked example matching Tau's wide-turn case),
  and the rule that breakpoints are not themselves billed.
- "Prompt Caching In Agents", Earendil Engineering, 22 July 2026 —
  <https://earendil.com/posts/prompt-caching/>. Why Pi's five-minute default is a
  licensing artifact rather than a recommendation, why idle gaps rather than bad
  breakpoint placement dominate real-world misses, and the break-even argument for
  not pruning tool results to save tokens.
- `packages/ai/src/api/anthropic-messages.ts` in Pi — the reference
  implementation Tau's placement is adapted from. Tau differs in two ways: it does
  not mark the OAuth identity block, and it spends the freed slot on a second
  message breakpoint.

[译文]
- <https://platform.claude.com/docs/en/build-with-claude/prompt-caching> —— 四断点上限、`tools` → `system` → `messages` 前缀顺序、20 块回看窗口(含一个与 Tau 宽轮次场景相符的完整示例),以及断点本身不计费的规则。
- "Prompt Caching In Agents", Earendil Engineering, 2026 年 7 月 22 日 —— <https://earendil.com/posts/prompt-caching/>。解释为什么 Pi 的五分钟默认值是许可(licensing)产物而非推荐值,为什么现实中的未命中主要由空闲间隔而非糟糕的断点放置造成,以及不为了节省 token 而裁剪工具结果的盈亏平衡论证。
- Pi 中的 `packages/ai/src/api/anthropic-messages.ts` —— Tau 放置策略所改编自的参考实现。Tau 有两处不同:它不标记 OAuth 身份块,并把腾出的名额花在第二个消息断点上。
