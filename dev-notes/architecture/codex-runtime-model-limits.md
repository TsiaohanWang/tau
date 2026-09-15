# Codex 运行时模型上限 / Codex runtime model limits

[原文]
Issue: [#389](https://github.com/huggingface/tau/issues/389)

[译文]
Issue:[#389](https://github.com/huggingface/tau/issues/389)

## 生产事故(Production incident)

[原文]
A long-running Tau session used `gpt-5.6-sol` through the `openai-codex` OAuth
provider. Its last successful request reported roughly 371,440 cached plus
uncached input tokens. The next request failed with
`context_length_exceeded`.

[译文]
一个长时间运行的 Tau 会话通过 `openai-codex` OAuth provider 使用 `gpt-5.6-sol`。它最后一次成功的请求报告了大约 371,440 个缓存加非缓存输入 token。下一次请求则以 `context_length_exceeded` 失败。

[原文]
Tau had copied the direct OpenAI API's 1.05M context metadata into the Codex
subscription catalog, so its default compaction threshold was 1,033,616 tokens.
The request actually went to `https://chatgpt.com/backend-api/codex/responses`,
where Codex subscription limits are independently configured. Reports from the
server-delivered Codex catalog showed profiles around 372K and, in later
rollouts, 272K. Tau therefore never compacted before the real backend ceiling.

[译文]
Tau 把直连 OpenAI API 的 1.05M 上下文元数据复制进了 Codex 订阅目录,因此其默认压缩阈值是 1,033,616 个 token。而请求实际发往 `https://chatgpt.com/backend-api/codex/responses`,在那里 Codex 订阅上限是独立配置的。来自服务端下发的 Codex 目录报告显示,配置档大约为 372K,在后续发布中则是 272K。因此 Tau 从未在真实后端上限之前触发压缩。

[原文]
This is a serving-surface problem, not a contradiction in the public API model
page: direct API access and ChatGPT/Codex OAuth can use different limits for the
same model ID.

[译文]
这是一个「服务面(serving surface)」问题,而不是公开 API 模型页面自相矛盾:对于同一个模型 ID,直连 API 与 ChatGPT/Codex OAuth 可以使用不同的上限。

## 考虑过的方向(Directions considered)

### 硬编码 500K 的 Codex 窗口(Hard-code a 500K Codex window)

[原文]
This is deterministic and avoids another startup request, but 500K is a total
budget often described as 372K input plus 128K output. Tau's old compaction
formula treated `context_window` as the usable input budget and subtracted only
16,384 tokens. A 500K entry would therefore compact around 483K, after the
reported 372K input ceiling, and would not fix the incident.

[译文]
这具有确定性,且避免了额外的启动请求;但 500K 是一个总预算,通常被描述为 372K 输入加 128K 输出。Tau 旧的压缩公式把 `context_window` 当作可用的输入预算,并且只减去 16,384 个 token。因此一个 500K 的条目会在约 483K 时才压缩 —— 已经超过了报告的 372K 输入上限,并不能修复这次事故。

[原文]
A lower hard-coded value is useful as a safe fallback. This change uses 272K for
GPT-5.6 Codex variants, matching the most conservative recently observed Codex
catalog profile. Direct OpenAI API entries remain 1.05M. Static values alone are
not the long-term answer because Codex has changed them during rollouts and can
vary them by account.

[译文]
一个更低的硬编码值是很有用的安全回退。本次变更对 GPT-5.6 Codex 变体使用 272K,与近期观察到的最保守的 Codex 目录配置档一致。直连 OpenAI API 的条目仍保持 1.05M。仅靠静态值不是长久之计,因为 Codex 在发布过程中修改过它们,而且可能按账号变化。

### 发现已认证的 Codex 目录(Discover the authenticated Codex catalog)

[原文]
The official Codex client requests:

[译文]
官方 Codex 客户端请求:

```text
GET <codex-base>/models?client_version=<version>
```

[原文]
For Tau's default base URL, that resolves to:

[译文]
对于 Tau 的默认 base URL,它解析为:

```text
https://chatgpt.com/backend-api/codex/models
```

[原文]
The request uses the same refreshed OAuth token, ChatGPT account ID, and
originator headers as response requests. Model entries can include:

[译文]
该请求使用与响应请求相同的、已刷新的 OAuth token、ChatGPT 账号 ID 以及 originator 头。模型条目可以包含:

```text
slug
context_window
max_context_window
effective_context_window_percent
auto_compact_token_limit
```

[原文]
Dynamic discovery reflects the actual serving surface and account. Its drawback
is that this is a Codex product endpoint rather than the public OpenAI API model
contract, so its schema or availability can change.

[译文]
动态发现反映的是真实的服务面与账号。它的缺点是:这是 Codex 产品端点,而不是公开的 OpenAI API 模型契约,因此其 schema 或可用性都可能变化。

## 决策(Decision)

[原文]
Use **dynamic discovery with a conservative static fallback**.

[译文]
采用**动态发现 + 保守的静态回退**。

[原文]
`tau_ai` owns the authenticated request and defensive parsing. It implements the
optional provider-neutral `ModelLimitsProvider` capability and returns a typed
`RuntimeModelLimits` value. It ignores malformed entries and caches one catalog
per provider instance.

[译文]
`tau_ai` 持有已认证的请求与防御式解析。它实现可选的、provider 无关的 `ModelLimitsProvider` 能力,并返回带类型的 `RuntimeModelLimits` 值。它会忽略畸形条目,并按 provider 实例缓存一份目录。

[原文]
`tau_coding` asks for limits when a session loads and again after a provider or
model switch, before sending the next prompt. It applies the live raw context
window and either the provider's explicit compaction limit or Codex's 90% raw
window default. Discovery failures are non-fatal: the configured provider
catalog remains active and `/session` reports the source and error.

[译文]
`tau_coding` 会在会话加载时、以及 provider 或模型切换之后、发送下一次提示之前请求上限。它采用实时的原始上下文窗口,并采用 provider 显式的压缩上限,或 Codex 默认的「原始窗口 90%」。发现失败不是致命的:已配置的 provider 目录继续生效,`/session` 会报告来源与错误。

[原文]
`tau_agent` is unchanged. It receives a ready provider and remains independent
of OAuth, model catalogs, Tau home paths, and compaction policy.

[译文]
`tau_agent` 不变。它接收一个就绪的 provider,并保持独立于 OAuth、模型目录、Tau 主目录路径与压缩策略。

[原文]
This first implementation deliberately avoids a persistent live-catalog cache.
An in-memory cache prevents duplicate requests within one runtime provider;
every new session gets a fresh account-specific value. A disk cache would need
an expiry policy, ETag handling, credential/account partitioning, atomic writes,
and a clear rule for whether stale values are safer than conservative built-in
fallbacks. Those concerns can be added later without changing the discovery
protocol.

[译文]
这第一版实现有意不引入持久化的实时目录缓存。内存缓存可以避免同一个运行时 provider 内的重复请求;每个新会话都会拿到一份新的、与账号相关的值。磁盘缓存则需要过期策略、ETag 处理、凭据/账号分区、原子写入,以及一条明确的规则来判断陈旧值是否比保守的内置回退更安全。这些问题可以在不改变发现协议的前提下日后补充。

## 上限语义(Limit semantics)

[原文]
`RuntimeModelLimits` keeps four concepts separate:

[译文]
`RuntimeModelLimits` 把四个概念分开保存:

[原文]
- raw context window
- maximum output tokens, when advertised
- effective context percentage
- explicit auto-compaction threshold, when advertised

[译文]
- 原始上下文窗口
- 最大输出 token(当对方声明时)
- 有效上下文百分比
- 显式的自动压缩阈值(当对方声明时)

[原文]
When no threshold is returned, Tau uses 90% of the raw context window and clamps
it to the effective window. This mirrors the official Codex client's default and
leaves headroom for provider framing, tools, instructions, and output.

[译文]
当没有返回阈值时,Tau 使用原始上下文窗口的 90%,并把结果夹紧到有效窗口范围内。这镜像了官方 Codex 客户端的默认行为,为 provider 的框架开销、工具、指令与输出留出余量。

[原文]
Tau's character-based usage estimator remains approximate. Earlier compaction
is intentional near a hard remote limit.

[译文]
Tau 基于字符的用量估算仍然是近似的。在逼近远程硬上限时,提前压缩是有意为之。

## 失败行为(Failure behavior)

[原文]
Catalog discovery cannot prevent every overflow: the backend can change between
discovery and a response, or token estimation can undercount provider framing.
Tau's existing overflow path remains the second line of defense: recognize a
context overflow, compact older messages, and retry once. Dynamic discovery
makes the proactive path accurate enough that emergency recovery should be
rare.

[译文]
目录发现无法阻止所有溢出:后端可能在发现与响应之间发生变化,或者 token 估算可能低估 provider 的框架开销。Tau 既有的溢出路径仍是第二道防线:识别上下文溢出、压缩较旧消息,并重试一次。动态发现让主动路径足够准确,因此紧急恢复应当很少发生。

## 测试(Testing)

[原文]
Deterministic tests use `httpx.MockTransport` and a fake model-limit provider.
They cover:

[译文]
确定性测试使用 `httpx.MockTransport` 与一个假的模型上限 provider。它们覆盖:

[原文]
- authenticated Codex model-catalog URL and headers
- defensive parsing and in-memory caching
- live context/compaction values in a coding session
- non-fatal fallback when discovery fails
- separation between direct API and Codex built-in metadata

[译文]
- 已认证的 Codex 模型目录 URL 与请求头
- 防御式解析与内存缓存
- 编码会话中的实时上下文/压缩值
- 发现失败时的非致命回退
- 直连 API 与 Codex 内置元数据之间的分离

[原文]
Run:

[译文]
运行:

```bash
uv run pytest tests/test_tau_ai.py tests/test_coding_session.py \
  tests/test_provider_catalog.py tests/test_provider_runtime.py
uv run pytest
uv run ruff check .
uv run ruff format --check .
uv run mypy
cd website && hugo --minify && npx --yes pagefind@latest --site public
```

## 手动验证(Manual validation)

[原文]
1. Log in with `/login openai-codex`.
2. Select a GPT-5.6 model.
3. Start or resume a session.
4. Run `/session`.
5. Confirm that `Context window source` is `provider live catalog` and that the
   displayed limit/compaction threshold match `codex debug models` for the same
   account.
6. Block the models request or use invalid discovery data and confirm Tau starts
   with `configured catalog`, reports the non-fatal discovery failure, and can
   still send a normal model request.

[译文]
1. 用 `/login openai-codex` 登录。
2. 选择一个 GPT-5.6 模型。
3. 启动或恢复一个会话。
4. 运行 `/session`。
5. 确认 `Context window source` 为 `provider live catalog`,并且显示的限额/压缩阈值与同一账号下 `codex debug models` 的输出一致。
6. 屏蔽 models 请求或使用无效的发现数据,确认 Tau 以 `configured catalog` 启动、报告非致命的发现失败,并且仍能发送正常的模型请求。
