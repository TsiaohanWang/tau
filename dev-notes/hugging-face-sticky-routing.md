# Hugging Face 会话级 provider 路由 / Hugging Face session-scoped provider routing

[原文]
Issue: <https://github.com/huggingface/tau/issues/559>

[译文]
Issue:<https://github.com/huggingface/tau/issues/559>

## 变更内容(What changed)

[原文]
Tau pins a logical model from its built-in `huggingface` provider to one
explicit Hugging Face Inference Provider. Users can configure a per-model
`inference_providers` map in `~/.tau/providers.json`. Without a preference, the
first request uses automatic routing; after it succeeds, Tau reads the
`x-inference-provider` response header and rebuilds the runtime with that explicit
suffix. The session index records the route for resume.

[译文]
Tau 可以把内置 `huggingface` provider 下的某个逻辑模型固定到一个明确的 Hugging Face Inference Provider。用户可以在 `~/.tau/providers.json` 中按模型配置 `inference_providers` 映射。没有偏好时,第一个请求使用自动路由;在其成功之后,Tau 读取 `x-inference-provider` 响应头,并用那个显式后缀重建运行时。会话索引会记录该路由,以供恢复使用。

[原文]
The OpenAI-compatible runtime now supports an internal logical-to-wire model alias.
For example, the harness and persisted assistant messages continue to use
`zai-org/GLM-5.2`, while the request payload uses
`zai-org/GLM-5.2:deepinfra`. This avoids duplicating every suffixed route in the
catalog and keeps context windows, capabilities, pricing, thinking controls, and
model selection keyed by the logical model.

[译文]
OpenAI 兼容运行时现在支持一个内部的「逻辑模型 → 线上模型」别名。例如,harness 与持久化的 assistant 消息继续使用 `zai-org/GLM-5.2`,而请求载荷使用 `zai-org/GLM-5.2:deepinfra`。这避免了在目录中为每条带后缀的路由重复条目,并使上下文窗口、能力、定价、thinking 控件与模型选择都以逻辑模型为键。

[原文]
`/session` reports the pin. Route changes belong to the external Hugging Face
extension, which uses the public extension API. Switching logical models selects the new
model's configured pin or returns to automatic Hugging Face routing when none
exists. Existing records without the optional field remain compatible and pin
after their next successful automatic response.

[译文]
`/session` 会报告该固定路由。路由变更由外部的 Hugging Face 扩展负责,它使用公开的扩展 API。切换逻辑模型时,会选择新模型配置的固定路由;若不存在,则回到 Hugging Face 的自动路由。没有这个可选字段的既有记录保持兼容,并会在下一次成功的自动响应之后完成固定。

## 为什么需要它(Why it exists)

[原文]
Hugging Face Router automatically chooses a backing provider for unsuffixed model
IDs. Real Tau sessions showed working automatic prefix caching, but occasional
full misses only seconds after large cache reads, followed immediately by another
large hit. That pattern is consistent with requests moving between provider or
worker cache domains rather than normal TTL expiry.

[译文]
对于不带后缀的模型 ID,Hugging Face Router 会自动选择背后的 provider。真实的 Tau 会话显示自动前缀缓存总体有效,但偶尔会出现:在大规模缓存读取仅仅几秒之后就完全未命中,紧接着又出现另一次大规模命中。这种模式与「请求在 provider 或 worker 的缓存域之间迁移」一致,而不是正常的 TTL 过期。

[原文]
An explicit `:<provider>` suffix narrows one source of routing changes. It does
not guarantee a cache hit: the selected provider can still evict entries,
load-balance across workers, or expire them.

[译文]
显式的 `:<provider>` 后缀收窄了路由变化的一个来源。它并不保证缓存命中:所选 provider 仍可能淘汰条目、在多个 worker 之间做负载均衡,或让条目过期。

## 架构(Architecture)

[原文]
Provider preferences, session metadata, and model-route selection remain in
`tau_coding`. The reusable `tau_agent` harness receives the logical model and has
no Hugging Face-specific behavior. `tau_ai` only gains a provider-neutral
`model_aliases` transport option, used to put a different model ID in the wire
payload while preserving the logical model in normalized events.

[译文]
Provider 偏好、会话元数据与模型路由选择都留在 `tau_coding`。可复用的 `tau_agent` harness 接收逻辑模型,不含任何 Hugging Face 特有行为。`tau_ai` 只新增了一个 provider 无关的 `model_aliases` 传输选项,用于在线上载荷中放入不同的模型 ID,同时在归一化事件中保留逻辑模型。

[原文]
[Hugging Face's own Chat UI](https://github.com/huggingface/chat-ui/blob/main/src/lib/server/endpoints/openai/endpointOai.ts)
consumes `x-inference-provider` from OpenAI-compatible responses, so Tau uses
that header rather than guessing which mapping is fastest.
The pin is committed only after a successful stream. Existing OpenAI-compatible
retries keep the same wire model and stop retrying after streamed model output.

[译文]
[Hugging Face 自家的 Chat UI](https://github.com/huggingface/chat-ui/blob/main/src/lib/server/endpoints/openai/endpointOai.ts) 会消费 OpenAI 兼容响应中的 `x-inference-provider`,因此 Tau 使用这个头,而不是猜测哪种映射最快。
固定路由只在一次成功流之后才提交。既有的 OpenAI 兼容重试保持同一个线上模型,并且在模型已输出流式内容之后不再重试。

[原文]
The first version deliberately does not automatically fail over a stale explicit
pin or send provider-specific cache-affinity fields. Safe failover also needs a
user-visible reroute event plus durable retry/reroute telemetry; silently falling
back would hide temporary cache-locality loss. Users can explicitly reset with
the Hugging Face extension. Backing providers differ in accepted affinity fields, so no
unknown field is enabled for the entire gateway.

[译文]
第一版有意不对过期的显式固定做自动故障转移,也不发送 provider 特有的缓存亲和性字段。安全故障转移还需要用户可见的重新路由事件,以及持久化的重试/重路由遥测;静默回退会掩盖临时的缓存局部性丢失。用户可以用 Hugging Face 扩展显式重置。不同后端 provider 接受的亲和性字段各不相同,因此不会为整个网关启用某个未知字段。

## 配置与验证(Configure and validate)

```json
{
  "schema_version": 2,
  "default_provider": "huggingface",
  "provider_preferences": {
    "huggingface": {
      "default_model": "zai-org/GLM-5.2",
      "inference_providers": { "zai-org/GLM-5.2": "deepinfra" }
    }
  },
  "scoped_models": []
}
```

[原文]
Use `/session` to confirm the selected route. For opt-in live
validation, start a new session, issue repeated requests that append to the same
long prefix, and compare cache-read counts before and after automatic resolution.
Do not commit credentials or generated session artifacts.

[译文]
用 `/session` 确认所选路由。若要做选择启用的实时验证,启动一个新会话,反复发出追加到同一长前缀的请求,并比较自动解析前后的缓存读取计数。不要提交凭据或生成的会话产物。

[原文]
Project checks:

[译文]
项目检查:

```bash
uv run pytest
uv run ruff check .
uv run ruff format --check .
uv run mypy
```
