---
title: "Providers & models / Provider 与模型"
description: "Connect OAuth subscriptions, API-key providers, or a local model — and switch models any time. / 连接 OAuth 订阅、API 密钥 provider 或本地模型,并随时切换模型。"
---

[原文]
A **provider** is the service hosting AI models; a **model** is the specific one
you talk to. Tau ships with several built-in providers and lets you add your own
OpenAI-compatible endpoints (including local models).

[译文]
**Provider** 是托管 AI 模型的服务;**Model** 是你具体与之交谈的那个模型。Tau 随包提供若干内置 provider,并允许你添加自己的 OpenAI 兼容端点(包括本地模型)。

## 最快的上手方式:`/login`(The fastest setup: `/login`)

[原文]
Start Tau and use `/login` to connect a provider. The provider picker includes
a search field, which is especially useful for the longer API-key provider list:

```bash
tau
```

```text
/login              # choose a login method
/login openai       # save an OpenAI API key
/login openai-codex # authenticate a Codex/ChatGPT subscription via OAuth
/login anthropic-subscription # authenticate Claude Pro/Max via OAuth
/login anthropic-api # save an Anthropic API key
/login github-copilot # authenticate GitHub Copilot with a device code
/login opencode-go  # save an OpenCode Go API key
/login nvidia       # save an NVIDIA NIM API key
/login custom       # add an OpenAI-compatible custom provider
```

[译文]
启动 Tau,用 `/login` 连接一个 provider。provider 选择器带有搜索框,这对较长的 API 密钥 provider 列表尤其有用:

```bash
tau
```

```text
/login              # 选择一种登录方式
/login openai       # 保存 OpenAI API 密钥
/login openai-codex # 通过 OAuth 认证 Codex/ChatGPT 订阅
/login anthropic-subscription # 通过 OAuth 认证 Claude Pro/Max
/login anthropic-api # 保存 Anthropic API 密钥
/login github-copilot # 用设备码认证 GitHub Copilot
/login opencode-go  # 保存 OpenCode Go API 密钥
/login nvidia       # 保存 NVIDIA NIM API 密钥
/login custom       # 添加一个 OpenAI 兼容的自定义 provider
```

[原文]
Built-in providers include **OpenAI**, **Anthropic**, **OpenAI Codex**
(subscription), **GitHub Copilot**, **OpenCode Go**, **OpenCode Zen**,
**Moonshot AI (Kimi)**, **Kimi Code** (subscription), **OpenRouter**, **Hugging Face**,
and **NVIDIA NIM**.

[译文]
内置 provider 包括 **OpenAI**、**Anthropic**、**OpenAI Codex**(订阅)、**GitHub Copilot**、**OpenCode Go**、**OpenCode Zen**、**Moonshot AI (Kimi)**、**Kimi Code**(订阅)、**OpenRouter**、**Hugging Face** 与 **NVIDIA NIM**。

### OAuth 订阅(OAuth subscriptions)

[原文]
Choose **Subscription / OAuth** in `/login` for:

[译文]
在 `/login` 中选择 **Subscription / OAuth** 可用于:

[原文]
| Tau provider | Login flow | Prerequisite |
| --- | --- | --- |
| `openai-codex` | Browser callback with pasted-code fallback | A supported ChatGPT/Codex subscription |
| `anthropic` | Browser callback with PKCE and pasted-code fallback | Claude Pro/Max with Anthropic extra usage available |
| `github-copilot` | GitHub device code | An active Copilot plan; organization policy must allow the selected model |

[译文]
| Tau provider | 登录流程 | 前置条件 |
| --- | --- | --- |
| `openai-codex` | 浏览器回调,可回退到粘贴代码 | 一个受支持的 ChatGPT/Codex 订阅 |
| `anthropic` | 带 PKCE 的浏览器回调,可回退到粘贴代码 | Claude Pro/Max,且账号有可用的 Anthropic 额外用量 |
| `github-copilot` | GitHub 设备码 | 有效的 Copilot 计划;组织策略必须允许所选模型 |

[原文]
GitHub Copilot asks for a GitHub Enterprise Server URL/domain. Leave it blank
for `github.com`. Device login also works in SSH/headless sessions: open the
shown verification URL on any device and enter the displayed code.

[译文]
GitHub Copilot 会询问 GitHub Enterprise Server 的 URL/域名。使用 `github.com` 时留空即可。设备登录在 SSH/无头会话中同样可用:在任意设备上打开所显示的验证 URL,并输入显示出的代码。

[原文]
Anthropic uses distinct direct-login aliases so the authentication method is
unambiguous: `/login anthropic-subscription` starts OAuth, while
`/login anthropic-api` saves an API key. The top-level `/login` picker still
lists Anthropic under both **Subscription / OAuth** and **API key**. OAuth
subscription requests use Anthropic's required
Claude Code identity and may be billed as extra usage rather than consuming
ordinary Claude plan limits. Check Anthropic's current account terms before
using it.

[译文]
Anthropic 使用彼此区分的直接登录别名,使认证方式毫不含糊:`/login anthropic-subscription` 启动 OAuth,而 `/login anthropic-api` 保存 API 密钥。顶层 `/login` 选择器仍会在 **Subscription / OAuth** 与 **API key** 两处都列出 Anthropic。OAuth 订阅请求使用 Anthropic 要求的 Claude Code 身份,可能会按额外用量计费,而不是消耗普通的 Claude 计划额度。使用前请查看 Anthropic 当前的账户条款。

[原文]
OAuth tokens refresh automatically. `/logout` removes Tau's local credential,
but does not revoke the grant remotely; use the provider's account settings for
remote revocation.

[译文]
OAuth token 会自动刷新。`/logout` 会移除 Tau 的本地凭据,但不会在远端撤销授权;需要远端撤销时请使用该 provider 的账户设置。

#### OpenAI 提示词缓存(OpenAI prompt caching)

[原文]
For direct OpenAI API and Codex OAuth sessions, Tau sends a stable session-derived
prompt-cache key with every model request, including continuations after tool
calls. OpenAI can use that key to keep successive append-only requests on the same
cache path, improving reuse of the system prompt, tool schemas, and conversation
prefix. Resuming a Tau session reuses its key; starting or branching a session
creates a new one.

[译文]
对于直连 OpenAI API 与 Codex OAuth 会话,Tau 会在每次模型请求中发送一个由会话派生、保持稳定的提示词缓存键,包括工具调用之后的续接请求。OpenAI 可以用该键让连续的只追加请求落在同一条缓存路径上,从而提高系统提示词、工具 schema 与会话前缀的复用率。恢复一个 Tau 会话会复用它的键;新建或分支出一个会话则会生成新键。

[原文]
Requests remain stateless: Tau keeps provider storage disabled and resends the
complete transcript. The key improves cache affinity but cannot preserve a hit if
the prefix changes or the provider cache expires. OpenAI-compatible gateways do
not receive these fields unless their catalog compatibility settings explicitly
opt in. The TUI sidebar's latest-request cache rate shows whether the most recent
request actually hit.

[译文]
请求保持无状态:Tau 保持 provider 侧存储关闭,并重新发送完整会话记录。该键能提高缓存亲和性,但如果前缀发生变化或 provider 缓存过期,它无法保住命中。OpenAI 兼容网关不会收到这些字段,除非其目录的兼容性设置显式选择加入。TUI 侧边栏的「最近一次请求缓存率」会显示最新一次请求是否真的命中了缓存。

#### Anthropic 提示词缓存(Anthropic prompt caching)

[原文]
Tau marks cache breakpoints on Anthropic requests so the system prompt, tool
schemas, and conversation history are reused between turns instead of being
reprocessed. Which retention Tau asks for depends on how you authenticated:

[译文]
Tau 会在 Anthropic 请求上标记缓存断点,使系统提示词、工具 schema 与会话历史在轮次之间被复用,而不是被重新处理。Tau 请求哪种保留时长取决于你的认证方式:

[原文]
- **Claude Pro/Max via OAuth** requests the one-hour cache. Subscription auth is
  not billed per token, and the five-minute default is shorter than a build, a
  test run, or the time it takes to read a diff — any of which would otherwise
  expire the cache mid-session.
- **An Anthropic API key** uses the five-minute default, because one-hour cache
  writes cost more per token and that should be a deliberate choice.

[译文]
- **通过 OAuth 的 Claude Pro/Max** 请求一小时缓存。订阅制认证不按 token 计费,而默认的五分钟比一次构建、一次测试运行,或读一个 diff 所需的时间都短 —— 这些活动中的任何一项都可能让缓存在会话中途过期。
- **Anthropic API 密钥**使用默认的五分钟,因为一小时缓存的写入单价更高,这应当是一个有意为之的选择。

[原文]
Providers that speak the Anthropic protocol through a gateway rather than being
Anthropic itself — `minimax`, `minimax-cn`, `fireworks`, and `vercel-ai-gateway` —
send no cache breakpoints, since not every gateway accepts them. Watch the
sidebar's cache hit rate to see caching working; see
[The interactive session]({{< relref "./tui.md" >}}) for how to read it.

[译文]
那些并非 Anthropic 本身、而是通过网关使用 Anthropic 协议的 provider —— `minimax`、`minimax-cn`、`fireworks` 与 `vercel-ai-gateway` —— 不发送缓存断点,因为并非每个网关都接受它们。观察侧边栏的缓存命中率即可看到缓存生效;如何解读见[交互式会话]({{< relref "./tui.md" >}})。

[原文]
Anthropic reports `input_tokens` as the fresh, uncached portion after the last
cache breakpoint. Tau preserves that value as fresh input, retains the separate
cache-read and cache-write counters, and reports total input as their sum. This
keeps usage and cost displays aligned with Anthropic's response contract.

[译文]
Anthropic 把 `input_tokens` 报告为最后一个缓存断点之后的、未缓存的新增部分。Tau 会把这个值保留为新增输入,同时保留单独的缓存读取与缓存写入计数,并把总输入报告为它们的和。这使用量与费用显示与 Anthropic 的响应契约保持一致。

#### Codex 订阅的上下文上限(Codex subscription context limits)

[原文]
OpenAI's public API and the ChatGPT/Codex subscription are separate serving
surfaces. A model with the same ID can have a smaller, rollout-specific context
window through Codex OAuth than through an API key. For example, the public
GPT-5.6 Sol API advertises a 1.05M-token window, while Codex has advertised
substantially smaller limits through its authenticated model catalog.

[译文]
OpenAI 的公开 API 与 ChatGPT/Codex 订阅是两个彼此独立的服务面。同一个 ID 的模型,通过 Codex OAuth 获得的上下文窗口可能比通过 API 密钥更小,且随灰度发布而异。例如,公开的 GPT-5.6 Sol API 宣称 1.05M token 的窗口,而 Codex 通过其需要认证的模型目录宣称的上限要小得多。

[原文]
Tau loads the last successful account-specific snapshot from
`~/.tau/codex-models-store.json` when a session starts, so models discovered in a
previous session are immediately available without opening a picker. It refreshes
the authenticated catalog in the background when `/model` or `/scoped-models`
opens. Since OpenAI filters the response by official-client version, Tau resolves
the current stable `@openai/codex` release from the npm registry and caches that
safe, non-secret version for four hours at `~/.tau/codex-version-store.json`.
Failed lookups use the stale cached version or Tau's bundled fallback. A
successful refresh replaces the Codex model picker inventory, so newly enabled
and newly client-gated models appear without a Tau release. Models unavailable to
the account are not copied from the separate public API catalog. Tau also uses
reported context windows, compaction thresholds, input modalities, and reasoning
efforts when present.

[译文]
会话启动时,Tau 会从 `~/.tau/codex-models-store.json` 加载上一次成功、与账户匹配的快照,因此在先前会话中发现过的模型无需打开选择器就立即可用。当 `/model` 或 `/scoped-models` 打开时,它会在后台刷新那个需要认证的目录。由于 OpenAI 会按官方客户端版本过滤响应,Tau 会从 npm registry 解析当前稳定版的 `@openai/codex`,并把这一安全、非机密的版本号缓存四小时于 `~/.tau/codex-version-store.json`。查询失败时使用过期的缓存版本或 Tau 随包的回退值。一次成功的刷新会替换 Codex 模型选择器的清单,因此新启用、以及新近受客户端门控的模型无需发布新版 Tau 就会出现。账户不可用的模型不会从那份独立的公开 API 目录复制过来。只要存在上报值,Tau 也会使用上下文窗口、压缩阈值、输入模态与推理力度。

[原文]
If discovery is unavailable or invalid, Tau retains the last account-matched
snapshot, or the checked-in Codex model list when no snapshot is available; it
does not reuse the public API inventory or limits. `/session` reports whether the
active context value came from the live provider catalog or Tau's configured
fallback. The model cache contains only parsed account/model metadata (no OAuth
tokens), is scoped to the saved Codex account ID, and is never written to
`catalog.toml`, `providers.json`, or the models.dev cache.

[译文]
如果发现不可用或结果无效,Tau 会保留上一份与账户匹配的快照;若连快照也没有,则使用仓库内置的 Codex 模型列表;它不会复用公开 API 的清单或上限。`/session` 会报告活动上下文值来自实时 provider 目录,还是来自 Tau 配置的回退。模型缓存只包含解析后的账户/模型元数据(不含 OAuth token),其作用域限定为已保存的 Codex 账户 ID,并且永远不会写入 `catalog.toml`、`providers.json` 或 models.dev 缓存。

[原文]
Starting or resuming a live-only Codex model discovers the account inventory
before validating the selection. This requires successful discovery; offline
startup remains available for static models. If a later refresh omits the active
model, Tau preserves its runtime metadata without adding it back to the picker.
Resume restores the transcript's saved model selection. If an older session
restores a stale selection, resume it and explicitly choose the intended model
in `/model` once to record the correction.

[译文]
启动或恢复一个仅存在于实时目录中的 Codex 模型时,会先发现账户清单,再校验该选择。这要求发现成功;静态模型仍可离线启动。如果之后的刷新遗漏了当前活动模型,Tau 会保留其运行时元数据,但不把它加回选择器。恢复会话会还原会话记录中保存的模型选择。如果某个较旧的会话恢复出一个陈旧的选择,请恢复它,并在 `/model` 中显式选择你想要的模型一次,以记录这次纠正。

[原文]
Live limits can vary by account or rollout and may change independently of Tau.
A discovery failure is non-fatal: Tau reports it in `/session` and continues with
the fallback. Direct OpenAI API sessions retain the context limits documented on
the API model page. Vision-capable Codex models retain their image-input
metadata separately from these runtime context limits, allowing image files read
by Tau to reach the model. The `gpt-5.6` alias, which routes to GPT-5.6 Sol, is only
available through the direct OpenAI API; Codex subscription users should select
the explicit `gpt-5.6-sol` model instead. Tau tombstones the API-only alias for
the Codex provider, so older user catalog overlays and saved preferences cannot
restore it after an upgrade.

[译文]
实时上限可能因账户或灰度发布而异,也可能独立于 Tau 发生变化。发现失败不是致命错误:Tau 会在 `/session` 中报告它,并继续使用回退值。直连 OpenAI API 的会话保留 API 模型页面上记录的上下文上限。具备视觉能力的 Codex 模型会把这些运行时上下文上限与图像输入元数据分开保留,使 Tau 读取的图像文件能够送达模型。`gpt-5.6` 别名路由到 GPT-5.6 Sol,仅能通过直连 OpenAI API 使用;Codex 订阅用户应改选显式的 `gpt-5.6-sol` 模型。Tau 会为 Codex provider 把该 API 专属别名「墓碑化」,因此较旧的用户目录叠加层与已保存偏好无法在升级后把它恢复回来。

### OpenCode Go 与 Zen(OpenCode Go and Zen)

[原文]
OpenCode Go and OpenCode Zen are **API-key providers**, not OAuth providers.
Sign in at the OpenCode console, subscribe to Go or fund Zen, copy the API key,
and then run:

```text
/login opencode-go  # subscription limits; https://opencode.ai/zen/go/v1
/login opencode     # Zen pay-as-you-go; https://opencode.ai/zen/v1
```

[译文]
OpenCode Go 与 OpenCode Zen 是 **API 密钥 provider**,不是 OAuth provider。在 OpenCode 控制台登录,订阅 Go 或为 Zen 充值,复制 API 密钥,然后运行:

```text
/login opencode-go  # 订阅制,有额度上限;https://opencode.ai/zen/go/v1
/login opencode     # Zen 按量付费;https://opencode.ai/zen/v1
```

[原文]
Both can also read `OPENCODE_API_KEY`. Tau stores their saved credentials under
separate `opencode-go` and `opencode` names, allowing different keys when
needed. Available models and plan limits change over time; consult the
[OpenCode Go](https://opencode.ai/docs/go) and
[OpenCode Zen](https://opencode.ai/docs/zen) pages for the current list.

[译文]
两者也都能读取 `OPENCODE_API_KEY`。Tau 把它们保存的凭据分别存放在 `opencode-go` 与 `opencode` 两个名称之下,需要时可以使用不同的密钥。可用模型与计划上限会随时间变化;当前列表请查阅 [OpenCode Go](https://opencode.ai/docs/go) 与 [OpenCode Zen](https://opencode.ai/docs/zen) 页面。

### Z.AI(Z.AI)

[原文]
Log in with `/login zai` or set `ZAI_API_KEY`. Tau sends Z.AI's provider-specific
thinking object rather than an OpenAI `reasoning_effort` field:
`{"thinking": {"type": "enabled"}}` for an enabled logical mode and
`{"thinking": {"type": "disabled"}}` for `off`. This keeps configured
thinking enabled for GLM models whose endpoint does not accept the raw effort
field.

[译文]
用 `/login zai` 登录,或设置 `ZAI_API_KEY`。Tau 发送的是 Z.AI 特有的 thinking 对象,而不是 OpenAI 的 `reasoning_effort` 字段:逻辑模式启用时发送 `{"thinking": {"type": "enabled"}}`,`off` 时发送 `{"thinking": {"type": "disabled"}}`。对于端点不接受原始 effort 字段的 GLM 模型,这能让已配置的 thinking 保持启用。

[原文]
Z.AI documents `reasoning_effort` only for GLM-5.2 and newer, with model-specific
values. Tau therefore emits that additional field only when the selected model's
compatibility metadata explicitly supports it; unsupported providers and models
continue to omit it. See the [Z.AI deep-thinking
reference](https://docs.z.ai/guides/capabilities/thinking) and [chat-completion
schema](https://docs.z.ai/api-reference/llm/chat-completion) for the authoritative
wire contract.

[译文]
Z.AI 只为 GLM-5.2 及更新版本记录 `reasoning_effort`,且取值因模型而异。因此,Tau 只在所选模型的兼容性元数据显式支持时才发送这个附加字段;不支持的 provider 与模型仍然省略它。权威的线上契约见 [Z.AI 深度思考参考](https://docs.z.ai/guides/capabilities/thinking)与[对话补全 schema](https://docs.z.ai/api-reference/llm/chat-completion)。

### Hugging Face Inference Providers(Hugging Face Inference Providers)

[原文]
Log in with `/login huggingface` or set `HF_TOKEN`. Tau's Hugging Face model
list is generated at build time from [models.dev](https://models.dev) and routed
through `https://router.huggingface.co/v1`. It includes tool-capable models from
DeepSeek, Gemma, GLM, GPT OSS, Kimi, Llama, MiniMax, MiMo, Qwen, Step, and other
families. Use `/model` to search the generated list; availability and the backing
inference provider can vary over time and by account.

[译文]
用 `/login huggingface` 登录,或设置 `HF_TOKEN`。Tau 的 Hugging Face 模型列表在构建时由 [models.dev](https://models.dev) 生成,并经 `https://router.huggingface.co/v1` 路由。它包含来自 DeepSeek、Gemma、GLM、GPT OSS、Kimi、Llama、MiniMax、MiMo、Qwen、Step 及其他模型家族中具备工具能力的模型。用 `/model` 搜索这份生成的列表;可用性与背后的推理 provider 会随时间及账户而变化。

[原文]
Like Pi, Tau's released snapshot includes model names, limits, costs, modalities,
reasoning support, and verified effort values. Thinking levels are `off`,
`minimal`, `low`, `medium`, `high`, `xhigh`, and `max`; `max` is distinct from
`xhigh`. Empty or toggle-only reasoning options do not replace provider/manual
behavior. Hugging Face `zai-org/GLM-5.2` currently uses a narrow verified
correction exposing `off`, `high`, and `max`, so Tau never sends its unsupported
`medium` value. A bundled snapshot keeps startup offline. Opening `/model`
refreshes catalogs in the background and caches them in
`~/.tau/models-store.json`; run `tau update --models` to force revalidation.
New models and capability changes can therefore arrive without upgrading Tau.
Set `TAU_OFFLINE=1` to use cached/bundled data without catalog network access.

[译文]
与 Pi 一样,Tau 随版本发布的快照包含模型名称、上限、费用、模态、推理支持与经过验证的 effort 取值。Thinking 等级有 `off`、`minimal`、`low`、`medium`、`high`、`xhigh` 与 `max`;`max` 与 `xhigh` 不同。空的或仅有开关的推理选项不会取代 provider/手动行为。Hugging Face 的 `zai-org/GLM-5.2` 目前使用一条范围很窄、经过验证的修正规则,只暴露 `off`、`high` 与 `max`,因此 Tau 绝不会发送它不支持的 `medium` 值。随包快照让启动保持离线。打开 `/model` 会在后台刷新目录,并缓存到 `~/.tau/models-store.json`;运行 `tau update --models` 可强制重新校验。因此新模型与能力变化无需升级 Tau 就能到来。设置 `TAU_OFFLINE=1` 可在不访问目录网络的情况下使用缓存/随包数据。

[原文]
For a new session without an explicit preference, Hugging Face initially routes
the model automatically. After the first successful response, Tau reads Hugging
Face's `x-inference-provider` response header and keeps that backing provider as
a sticky automatic route. If that route later exhausts its normal retries with a
retryable HTTP failure before producing output, Tau retries the interrupted turn
once through unsuffixed automatic routing and makes the successful replacement
the new sticky route. To choose a fixed provider instead, add a per-model
`inference_providers` preference to `~/.tau/providers.json`:

[译文]
对于没有显式偏好的新会话,Hugging Face 最初会自动路由该模型。第一次成功响应之后,Tau 会读取 Hugging Face 的 `x-inference-provider` 响应头,并把那个背后的 provider 保留为一条粘性自动路由。如果该路由之后在产出任何输出之前,以可重试的 HTTP 失败耗尽了常规重试次数,Tau 会通过不带后缀的自动路由把被中断的这一轮重试一次,并把成功的替换路由变成新的粘性路由。若想改为固定的 provider,请在 `~/.tau/providers.json` 中为单个模型添加 `inference_providers` 偏好:

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
Use the exact provider suffix advertised for that model by Hugging Face. Tau
sends `zai-org/GLM-5.2:deepinfra` on the wire and continues to display and store
the logical `zai-org/GLM-5.2` model. The pin survives resume; changing the
preference does not rewrite existing sessions. `/session` shows the active pin.
Route selection is available through the external
[`alejandro-ao/tau-huggingface`](https://github.com/alejandro-ao/tau-huggingface)
extension rather than a built-in command. It requires Tau 0.3.10 or newer. Clone
and load it explicitly:

[译文]
请使用 Hugging Face 为该模型公布的确切 provider 后缀。Tau 在线上发送 `zai-org/GLM-5.2:deepinfra`,同时继续显示并存储逻辑模型 `zai-org/GLM-5.2`。该固定选择能在恢复会话后保留;更改偏好不会改写既有会话。`/session` 会显示当前生效的固定选择。路由选择不是内置命令,而是通过外部扩展 [`alejandro-ao/tau-huggingface`](https://github.com/alejandro-ao/tau-huggingface) 提供,要求 Tau 0.3.10 或更新版本。克隆并显式加载它:

```bash
git clone https://github.com/alejandro-ao/tau-huggingface.git
tau -e ./tau-huggingface
```

[原文]
Then use `/hf route` to pick from the model's currently live routes,
`/hf route <provider>` to select a fixed route, or `/hf route automatic` to
return to recoverable automatic routing. Switching models uses that model's
configured fixed route or starts automatic resolution again. `/session` reports
`automatic (currently <provider>)` for a sticky automatic route and
`<provider> (fixed)` for an explicit route.

[译文]
然后用 `/hf route` 从该模型当前可用的路由中挑选,用 `/hf route <provider>` 选择固定路由,或用 `/hf route automatic` 回到可恢复的自动路由。切换模型时会使用该模型已配置的固定路由,或重新开始自动解析。对于粘性自动路由,`/session` 报告 `automatic (currently <provider>)`;对于显式路由,报告 `<provider> (fixed)`。

[原文]
Transient failures first retry on the same wire model, and stream failures are
not retried or rerouted after model output has started. After those retries are
exhausted, only sticky routes selected in automatic mode fail over; routes chosen
through `/hf route <provider>` or the `inference_providers` preference remain
fixed so Tau never overrides explicit user intent. Automatic failover emits
visible retry progress and durable provider diagnostics. Pinning can reduce cold
prefix-cache misses caused by cross-provider routing, but cannot prevent eviction,
TTL expiry, or load balancing among workers within the chosen provider. A reroute
may require a cold prefix prefill, and account-wide rate limits may still fail on
the automatic retry. See
[Configuration]({{< relref "../reference/configuration.md#provider-preferences" >}}).

[译文]
瞬时故障首先在同一个线上模型上重试;模型输出一旦开始,流式故障就不再重试或改路由。这些重试耗尽之后,只有自动模式下选出的粘性路由才会故障转移;通过 `/hf route <provider>` 或 `inference_providers` 偏好选定的路由保持固定,因此 Tau 绝不覆盖用户的显式意图。自动故障转移会发出可见的重试进度与持久的 provider 诊断。固定选择可以减少跨 provider 路由带来的冷前缀缓存未命中,但无法避免淘汰、TTL 过期,或所选 provider 内部各 worker 之间的负载均衡。改路由可能需要一次冷前缀预填充,而账号级的速率限制在自动重试时仍可能失败。见[配置]({{< relref "../reference/configuration.md#provider-preferences" >}})。

### Moonshot AI API 与 Kimi Code 的对比(Moonshot AI API vs. Kimi Code)

[原文]
Both Kimi providers authenticate requests with Bearer API keys; neither uses
OAuth. They are separate because the keys come from different consoles, use
different endpoints, and charge against different billing plans:

[译文]
两个 Kimi provider 都用 Bearer API 密钥认证请求;都不用 OAuth。它们彼此独立,是因为密钥来自不同的控制台、使用不同的端点,并且计入不同的计费方案:

[原文]
| Tau provider | Access and billing | Model | Endpoint | Environment variable |
| --- | --- | --- | --- | --- |
| `moonshotai` | Pay-as-you-go key from the [Kimi Open Platform](https://platform.kimi.ai/console/api-keys) | `kimi-k2.7-code` | `https://api.moonshot.ai/v1` | `MOONSHOT_API_KEY` |
| `kimi-code` | Subscription key from the [Kimi Code console](https://www.kimi.com/code/console) | `k3` or rolling `kimi-for-coding` alias | `https://api.kimi.com/coding/v1` | `KIMI_CODE_API_KEY` |

[译文]
| Tau provider | 获取方式与计费 | 模型 | 端点 | 环境变量 |
| --- | --- | --- | --- | --- |
| `moonshotai` | 按量付费密钥,来自 [Kimi 开放平台](https://platform.kimi.ai/console/api-keys) | `kimi-k2.7-code` | `https://api.moonshot.ai/v1` | `MOONSHOT_API_KEY` |
| `kimi-code` | 订阅密钥,来自 [Kimi Code 控制台](https://www.kimi.com/code/console) | `k3` 或滚动的 `kimi-for-coding` 别名 | `https://api.kimi.com/coding/v1` | `KIMI_CODE_API_KEY` |

[原文]
Kimi K3 uses the `k3` model ID, accepts text and image input, and supports up to
a 1,048,576-token context window on eligible plans. It supports three
reasoning-effort levels via the `reasoning_effort` field: `low`, `high`, and
`max` (default). Tau exposes these as the distinct `low`, `high`, and `max`
thinking levels, and starts new K3 sessions at `max` unless a remembered
per-model choice exists. Start a new session when switching to K3 so the
previous model's context cache is not re-prefilled. See
[Kimi's model documentation](https://www.kimi.com/code/docs/en/kimi-code/models)
for current plan availability and context limits.

[译文]
Kimi K3 使用 `k3` 模型 ID,接受文本与图像输入,并在符合条件的计划上支持最高 1,048,576 token 的上下文窗口。它通过 `reasoning_effort` 字段支持三个推理力度等级:`low`、`high` 与 `max`(默认)。Tau 把它们暴露为彼此区分的 `low`、`high` 与 `max` thinking 等级,并且新的 K3 会话从 `max` 开始,除非存在已记住的单模型选择。切换到 K3 时请新建会话,以免前一个模型的上下文缓存被重新预填充。当前计划可用性与上下文上限见 [Kimi 的模型文档](https://www.kimi.com/code/docs/en/kimi-code/models)。

[原文]
A key for one service should not be treated as interchangeable with a key for
the other. Tau stores them independently under the `moonshotai` and `kimi-code`
credential names, so `/login moonshotai` and `/login kimi-code` can configure
both at once. The distinct environment variable names provide the same
separation when credentials are supplied through the shell.

[译文]
不应把一个服务的密钥与另一个服务的密钥视为可互换。Tau 把它们分别存放在 `moonshotai` 与 `kimi-code` 两个凭据名称之下,因此 `/login moonshotai` 与 `/login kimi-code` 可以同时配置两者。通过 shell 提供凭据时,不同的环境变量名提供了同样的隔离。

[原文]
Credentials saved through `/login` live in `~/.tau/credentials.json` with
private `0600` permissions and atomic file replacement. The file is not
encrypted; protect your Tau home directory and do not share its contents. The custom-provider
flow asks for the provider name, display name, base URL, API-key environment
variable, default model, and API key; it writes the provider definition to
`~/.tau/catalog.toml` and runtime preferences to `~/.tau/providers.json`.

[译文]
通过 `/login` 保存的凭据存放在 `~/.tau/credentials.json`,权限为私有的 `0600`,并采用原子文件替换。该文件**没有**加密;请保护好你的 Tau 主目录,不要分享其内容。自定义 provider 流程会询问 provider 名称、显示名、base URL、API 密钥环境变量、默认模型与 API 密钥;它把 provider 定义写入 `~/.tau/catalog.toml`,把运行时偏好写入 `~/.tau/providers.json`。

[原文]
Check what's configured and how each provider will authenticate:

[译文]
检查已配置了什么,以及每个 provider 将如何认证:

```bash
tau providers
```

## 管理已保存的凭据(Managing saved credentials)

[原文]
Use these slash commands inside Tau:

```text
/login [provider]   # add or refresh a saved credential
/logout [provider]  # remove a saved credential
```

[译文]
在 Tau 内使用这些斜杠命令:

```text
/login [provider]   # 添加或刷新一条已保存凭据
/logout [provider]  # 移除一条已保存凭据
```

[原文]
Saved credentials take precedence over environment variables. `/logout` only
edits saved credentials — it never touches your environment or `providers.json`.

[译文]
已保存的凭据优先于环境变量。`/logout` 只编辑已保存的凭据 —— 它绝不触碰你的环境或 `providers.json`。

[原文]
{{% note title="OAuth troubleshooting" %}}
Browser login can fall back to a pasted redirect URL/code when the callback
port is unavailable or the browser runs on another machine. In that flow the
login screen copies the authorization URL to your clipboard and renders it as
a link, so paste or click it rather than selecting the wrapped text — a URL
reassembled by hand loses characters at the line breaks and the provider
rejects it. Copilot uses a device code instead: open the short verification
URL and enter the code shown beneath it. A denied or expired code requires a
new `/login`. If a Copilot model reports that it is unsupported, enable it in
Copilot Chat's model selector or ask your organization administrator;
provider/model access varies by plan and policy.
{{% /note %}}

[译文]
{{% note title="OAuth 排障" %}}
当回调端口不可用,或浏览器运行在另一台机器上时,浏览器登录可以回退为粘贴重定向 URL/代码。在该流程中,登录界面会把授权 URL 复制到你的剪贴板,并把它渲染为一个链接,因此请粘贴或点击它,而不是手动选中折行后的文本 —— 手工重新拼接的 URL 会在换行处丢失字符,provider 会拒绝它。Copilot 改用设备码:打开那个较短的验证 URL,并输入其下方显示的代码。代码被拒绝或过期都需要重新 `/login`。如果某个 Copilot 模型报告不受支持,请在 Copilot Chat 的模型选择器中启用它,或询问你的组织管理员;provider/模型的访问权限因计划与策略而异。
{{% /note %}}

## 选择与切换模型(Choosing and switching models)

[原文]
- **`/model`** — open the picker (lists models across configured providers;
  choosing one can switch the active provider too).
- **`tau -m <model>`** or **`tau --provider <name> -m <model>`** — choose at
  launch.
- **Ctrl+P** / **Shift+Ctrl+P** — cycle your *scoped* (favorite) models
  forward / backward without opening the picker.
  Build the list with `/scoped-models`, or press `Space` on a model in the
  `/model` picker. In the `/scoped-models` modal, press `Tab` to switch to a
  scoped-only view where `Enter` removes models from the list.

[译文]
- **`/model`** —— 打开选择器(列出所有已配置 provider 的模型;选择某个模型时也可能同时切换活动 provider)。
- **`tau -m <model>`** 或 **`tau --provider <name> -m <model>`** —— 在启动时选择。
- **Ctrl+P** / **Shift+Ctrl+P** —— 不打开选择器,向后 / 向前轮换你的*scoped*(收藏)模型。用 `/scoped-models` 构建该列表,或在 `/model` 选择器中对某个模型按 `Space`。在 `/scoped-models` 模态框中,按 `Tab` 切换到仅显示 scoped 模型的视图,在那里按 `Enter` 会把模型从列表中移除。

[原文]
Tau validates the selected model against the active provider's configured model
list before creating or refreshing a runtime provider. This prevents accidental
provider/model mismatches, such as trying to send an API-only OpenAI model to the
separate `openai-codex` subscription provider.

[译文]
在创建或刷新运行时 provider 之前,Tau 会用活动 provider 已配置的模型列表校验所选模型。这可以防止意外的 provider/模型不匹配,例如试图把一个 API 专属的 OpenAI 模型发给彼此独立的 `openai-codex` 订阅 provider。

[原文]
When a switch crosses provider APIs, Tau compiles existing tool history for the
target provider. Provider-specific tool-call IDs are deterministically translated
to a portable format, with the same translated ID used for each call and result.
When compiling history for Anthropic, Tau also omits opaque reasoning signatures
created by other APIs. This lets a session continue after tools have run without
exposing users to provider validation errors or rewriting the saved JSONL history.

[译文]
当切换跨越了不同的 provider API 时,Tau 会为目标 provider 重新编译既有的工具历史。provider 特有的工具调用 ID 会被确定性地转换为可移植格式,且每个调用与其结果使用同一个转换后的 ID。为 Anthropic 编译历史时,Tau 还会省略由其他 API 生成的不透明 reasoning 签名。这让会话可以在工具运行之后继续,而不会让用户遭遇 provider 校验错误,也不会重写已保存的 JSONL 历史。

### Claude Opus 5(Claude Opus 5)

[原文]
Tau supports Anthropic's `claude-opus-5` through the direct `anthropic`
provider. The model has a 1M-token context window, accepts text and images,
generates up to 128k tokens, and costs $5 / $25 per million input/output tokens.
Anthropic enables adaptive thinking by default. Tau exposes models.dev's
verified `low`, `medium`, `high`, `xhigh`, and `max` efforts as distinct modes.

[译文]
Tau 通过直连的 `anthropic` provider 支持 Anthropic 的 `claude-opus-5`。该模型有 1M token 的上下文窗口,接受文本与图像,最多生成 128k token,价格为每百万输入/输出 token $5 / $25。Anthropic 默认启用自适应思考。Tau 把 models.dev 验证过的 `low`、`medium`、`high`、`xhigh` 与 `max` effort 暴露为彼此区分的模式。

[原文]
Use `/login anthropic-api` or `/login anthropic-subscription`, then select
**Claude Opus 5** in `/model`. See Anthropic's
[Claude Opus 5 guide](https://platform.claude.com/docs/en/about-claude/models/whats-new-opus-5)
for current behavior and availability.

[译文]
使用 `/login anthropic-api` 或 `/login anthropic-subscription`,然后在 `/model` 中选择 **Claude Opus 5**。当前行为与可用性见 Anthropic 的 [Claude Opus 5 指南](https://platform.claude.com/docs/en/about-claude/models/whats-new-opus-5)。

## 动态扩展 Provider(Dynamic extension providers)

[原文]
Tau's extension API has a process-local `DynamicProvider` contract validated
by a permanent second fake backend and a test-only Ollama adapter. Unlike
providers created by `/login custom` or `tau setup`, these definitions are
source/generation-owned overlays and are never copied into `catalog.toml`,
`providers.json`, sessions, or generic disk storage. Source ownership is a stable
host identity derived from the canonical extension entry path—not the display
name. Tau freezes every discovered identity before importing extension code, so
symlink retargeting cannot change registration or cleanup ownership; separate
same-name extension files cannot remove one another's providers. They support
dormant model sets, deeply immutable compatibility metadata, atomic
model-snapshot refresh, per-caller refresh deadlines, retry-safe coalescing, and
required/optional/no authentication without fake keys or exposed auth provenance.
Custom auth-resolution exceptions are reduced to a categorical host error during
runtime creation; Tau's required-key guidance remains actionable.

[译文]
Tau 的扩展 API 有一份进程内的 `DynamicProvider` 契约,由一个常驻的第二假后端与一个仅用于测试的 Ollama 适配器验证。与 `/login custom` 或 `tau setup` 创建的 provider 不同,这些定义是归属来源/代际的叠加层,绝不会复制进 `catalog.toml`、`providers.json`、会话或通用磁盘存储。来源所有权是一个稳定的宿主身份,由规范的扩展入口路径推导而来 —— 而不是显示名。Tau 会在导入扩展代码之前冻结每一个发现到的身份,因此重定向符号链接无法改变注册或清理的所有权;彼此独立、同名的扩展文件也无法移除对方的 provider。它们支持休眠的模型集合、深度不可变的兼容性元数据、原子的模型快照刷新、按调用方设定的刷新期限、重试安全的合并,以及 required/optional/no 三种认证,既不伪造密钥,也不暴露认证来源信息。自定义认证解析异常在运行时创建期间会被归约为一个分类性的宿主错误;Tau 的 required-key 指引仍然可操作。

[原文]
Phase 1 established the contracts and registry mechanics. The `/local` host now
provides the generic TUI flow for registered dynamic local backends. Dynamic
providers still do not become durable catalog entries or automatic startup
fallbacks: configure a backend, then choose its provider/model explicitly. The
trusted built-in llama.cpp provider is the narrow scoped-model exception: Tau
may persist only its stable provider ID plus exact model ID. An unloaded/stale
reference remains visible as unavailable and cannot trigger load or download.
User and project dynamic providers cannot opt into durable references. See
the [local backends guide]({{< relref "./local-inference.md" >}}) and
[Extensions]({{< relref "./extensions.md#dynamic-providers" >}}).

[译文]
Phase 1 确立了这些契约与注册表机制。`/local` 宿主现在为已注册的动态本地后端提供通用的 TUI 流程。动态 provider 仍然不会变成持久化的目录条目或自动启动回退项:先配置一个后端,再显式选择它的 provider/模型。受信的内置 llama.cpp provider 是范围很窄的 scoped 模型例外:Tau 只能持久化它稳定的 provider ID 加上确切的模型 ID。未加载/陈旧的引用会保持可见但标记为不可用,并且不能触发加载或下载。用户级与项目级的动态 provider 不能选择加入持久引用。见[本地后端指南]({{< relref "./local-inference.md" >}})与[扩展]({{< relref "./extensions.md#dynamic-providers" >}})。

## 添加自定义 / 本地 Provider(Adding a custom / local provider)

[原文]
Any OpenAI-compatible endpoint works — including local servers like llama.cpp or
Ollama. The easiest interactive path is:

[译文]
任何 OpenAI 兼容端点都可以 —— 包括 llama.cpp 或 Ollama 之类的本地服务器。最便捷的交互式路径是:

```text
/login custom
```

[原文]
Tau prompts for the provider details, saves the API key, writes the provider
metadata to `~/.tau/catalog.toml`, and makes the provider available immediately.

[译文]
Tau 会提示你输入 provider 的详细信息,保存 API 密钥,把 provider 元数据写入 `~/.tau/catalog.toml`,并立即使该 provider 可用。

### 内置 llama.cpp 后端(Built-in llama.cpp backend)

[原文]
Tau's first-class llama.cpp integration is configured through the provider-neutral
`/local` command. For download/load/unload management, start llama.cpp
independently in router mode without a model argument:

[译文]
Tau 的一等 llama.cpp 集成通过 provider 无关的 `/local` 命令配置。若要使用下载/加载/卸载管理,请不带模型参数、以 router 模式独立启动 llama.cpp:

```bash
llama-server --models-max 1 --parallel 1 --flash-attn auto
```

[原文]
See the [official router guide](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md#using-multiple-models)
and Tau's complete guide below before adding hardware- or model-specific flags.

[译文]
在添加针对特定硬件或模型的 flag 之前,请先阅读[官方 router 指南](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md#using-multiple-models)以及下文中 Tau 的完整指南。

[原文]
Then open Tau and run:

[译文]
然后打开 Tau 并运行:

```text
/local
```

[原文]
Choose and confirm the recommended `llama.cpp` backend. Tau automatically
checks the saved, environment, or default endpoint; use **Configure** for a
server elsewhere and an optional API key. Tau discovers exact loaded model IDs
through OpenAI-compatible or compatible router discovery; it does not use a
fake key or fake model. Compatible b9688–b10595 routers show arrow-key
navigable model states plus explicitly confirmed load, unload, Hugging Face GGUF
search, and server-side download actions. Load/download confirmations preselect
Cancel as an unlabelled safety default. Closing `/local` leaves an active
server-side download running; reopen it to cancel explicitly. No key means no
`Authorization` header. A saved key takes precedence over `LLAMA_API_KEY`.

[译文]
选择并确认推荐的 `llama.cpp` 后端。Tau 会自动检查已保存的、环境中的或默认的端点;若服务器在别处,请用 **Configure** 指定,并可选择性地配置 API 密钥。Tau 通过 OpenAI 兼容发现或兼容的 router 发现来获知确切的已加载模型 ID;它不会使用假密钥或假模型。兼容的 b9688–b10595 router 会显示可用方向键导航的模型状态,以及需要显式确认的加载、卸载、Hugging Face GGUF 搜索与服务端下载操作。加载/下载确认框把 Cancel 预选为无标签的安全默认项。关闭 `/local` 会留下仍在运行的服务端下载;重新打开它以显式取消。没有密钥就不发送 `Authorization` 头。已保存的密钥优先于 `LLAMA_API_KEY`。

[原文]
Use the discovered ID explicitly from the TUI or print mode:

[译文]
在 TUI 或 print 模式中显式使用发现到的 ID:

```bash
tau --provider llama.cpp --model <model-id>
tau --provider llama.cpp --model <model-id> --print "summarize this project"
```

[原文]
The configured endpoint and safe model snapshot are stored under
`~/.tau/state/extensions/llama.cpp.json`; secrets stay in the credential store.
A cached snapshot allows explicit startup during temporary server downtime.
`/local` never scans ports or processes, stops the external server, or deletes
model files. See the [complete llama.cpp guide]({{< relref "./local-inference.md" >}})
for endpoint precedence, Doctor, reset, and troubleshooting.

[译文]
已配置的端点与安全模型快照存放在 `~/.tau/state/extensions/llama.cpp.json`;密钥留在凭据存储中。缓存的快照允许在服务器临时停机期间进行显式启动。`/local` 绝不扫描端口或进程,不停止外部服务器,也不删除模型文件。端点优先级、Doctor、reset 与排障见[完整的 llama.cpp 指南]({{< relref "./local-inference.md" >}})。

[原文]
An older manually configured provider named `llama-cpp` remains separate and is
not migrated. Configure the built-in `llama.cpp` layer through `/local`, and use
the custom-provider flow below for Ollama and other OpenAI-compatible servers.
Tau does not ship an Ollama backend.

[译文]
名为 `llama-cpp` 的旧式手动配置 provider 仍然独立存在,不会被迁移。请通过 `/local` 配置内置的 `llama.cpp` 层;Ollama 及其他 OpenAI 兼容服务器请使用下文的自定义 provider 流程。Tau 不随包提供 Ollama 后端。

[原文]
For scripted or one-off setup with another OpenAI-compatible server, use the
same `tau setup` flow. For example, Ollama's OpenAI-compatible endpoint usually
runs at `http://localhost:11434/v1`:

[译文]
若要用脚本或一次性配置另一个 OpenAI 兼容服务器,请使用同样的 `tau setup` 流程。例如,Ollama 的 OpenAI 兼容端点通常运行在 `http://localhost:11434/v1`:

```bash
tau --provider local \
  --base-url http://localhost:11434/v1 \
  --api-key-env LOCAL_API_KEY \
  --model qwen \
  setup
```

[原文]
This writes the provider definition to `~/.tau/catalog.toml`, writes runtime
preferences to `~/.tau/providers.json`, and (by default) makes it the default
provider.

[译文]
这会把 provider 定义写入 `~/.tau/catalog.toml`,把运行时偏好写入 `~/.tau/providers.json`,并且(默认情况下)把它设为默认 provider。

[原文]
For reusable provider definitions, add a user-level catalog overlay at
`~/.tau/catalog.toml`:

[译文]
若要可复用的 provider 定义,请在 `~/.tau/catalog.toml` 添加一份用户级目录叠加层:

```toml
schema_version = 1

[[providers]]
name = "local-gateway"
display_name = "Local Gateway"
kind = "openai-compatible"
base_url = "http://localhost:11434/v1"
api_key_env = "LOCAL_GATEWAY_API_KEY"
credential_name = "local-gateway"
models = ["qwen-coder"]
default_model = "qwen-coder"
docs_url = "https://example.test/local-gateway"

[providers.context_windows]
qwen-coder = 64000
```

[原文]
Tau loads its bundled `src/tau_coding/data/catalog.toml` first, then overlays
`~/.tau/catalog.toml`. A user entry with the same `name` can extend or override a
built-in provider: scalar fields replace built-in values, `models` are merged
with your models first, and `context_windows` are merged.

[译文]
Tau 先加载随包提供的 `src/tau_coding/data/catalog.toml`,再叠加 `~/.tau/catalog.toml`。`name` 相同的用户条目可以扩展或覆盖内置 provider:标量字段替换内置值,`models` 合并时把你的模型放在前面,`context_windows` 则合并。

[原文]
There is intentionally **no project-level** `.tau/catalog.toml`. Only the
user-level `~/.tau/catalog.toml` is loaded, so cloning a repository cannot
silently redirect a provider's `base_url` or credentials to an unexpected
service.

[译文]
这里有意**不提供项目级**的 `.tau/catalog.toml`。只有用户级的 `~/.tau/catalog.toml` 会被加载,因此克隆一个仓库无法悄悄地把某个 provider 的 `base_url` 或凭据重定向到意料之外的服务。

[原文]
Run the custom provider with:

```bash
tau --provider local-gateway
tau --provider local-gateway "summarize this project"    # TUI with an initial prompt
tau --provider local-gateway -p "summarize this project" # one-shot print mode
```

[译文]
使用该自定义 provider 运行:

```bash
tau --provider local-gateway
tau --provider local-gateway "summarize this project"    # 带初始提示词的 TUI
tau --provider local-gateway -p "summarize this project" # 一次性 print 模式
```

[原文]
Catalog TOML is for provider and model metadata. It does **not** accept runtime
request options such as custom HTTP headers, timeouts, or retry settings. Put
those in `~/.tau/providers.json` instead. Saved `providers.json` entries support
`headers`, `timeout_seconds`, `max_retries`, and `max_retry_delay_seconds`. For
the full JSON shape, the catalog TOML shape, and `thinking_levels` for custom
models, see [Configuration]({{< relref "../reference/configuration.md#providers" >}}).

[译文]
目录 TOML 用于 provider 与模型的元数据。它**不**接受运行时请求选项,例如自定义 HTTP 头、超时或重试设置。请把它们放进 `~/.tau/providers.json`。已保存的 `providers.json` 条目支持 `headers`、`timeout_seconds`、`max_retries` 与 `max_retry_delay_seconds`。完整的 JSON 形态、目录 TOML 形态,以及自定义模型的 `thinking_levels`,见[配置]({{< relref "../reference/configuration.md#providers" >}})。

[原文]
{{% tip title="Hugging Face org billing" %}}
To send a Hugging Face billing header, keep the provider definition in the
catalog, then add the header to the matching provider preference in
`~/.tau/providers.json`:

```json
{
  "default_provider": "huggingface",
  "provider_preferences": {
    "huggingface": {
      "default_model": "openai/gpt-oss-120b",
      "headers": { "X-HF-Bill-To": "my-org" },
      "thinking_defaults": { "openai/gpt-oss-120b": "low" },
      "timeout_seconds": 60,
      "max_retries": 2,
      "max_retry_delay_seconds": 1
    }
  },
  "scoped_models": []
}
```
{{% /tip %}}

[译文]
{{% tip title="Hugging Face 组织计费" %}}
要发送 Hugging Face 计费头,请把 provider 定义保留在目录中,然后把该头加到 `~/.tau/providers.json` 里匹配的 provider 偏好上:

```json
{
  "default_provider": "huggingface",
  "provider_preferences": {
    "huggingface": {
      "default_model": "openai/gpt-oss-120b",
      "headers": { "X-HF-Bill-To": "my-org" },
      "thinking_defaults": { "openai/gpt-oss-120b": "low" },
      "timeout_seconds": 60,
      "max_retries": 2,
      "max_retry_delay_seconds": 1
    }
  },
  "scoped_models": []
}
```
{{% /tip %}}

## 凭据是如何解析的(How credentials are resolved)

[原文]
For a given provider, Tau uses, in order: a stored credential in
`~/.tau/credentials.json`, then the environment variable named by the provider's
`api_key_env`. OAuth credentials are refreshed immediately before a request and
the replacement is saved atomically. Use `/login` for built-in providers or
`/login custom` for OpenAI-compatible custom providers.

[译文]
对于给定的 provider,Tau 依次使用:`~/.tau/credentials.json` 中已存储的凭据,然后是 provider 的 `api_key_env` 所指定的环境变量。OAuth 凭据会在请求之前立即刷新,替换结果以原子方式保存。内置 provider 用 `/login`,OpenAI 兼容的自定义 provider 用 `/login custom`。
