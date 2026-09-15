---
title: "Configuration & files / 配置与文件"
description: "Where Tau stores state, and the shape of its config files. / Tau 把状态存在哪里,以及它的配置文件长什么样。"
---

[原文]
Tau keeps durable state in your home directory (`~/.tau/`) and reads
project-local resources from your working directory. This page is a reference for
those locations and file formats.

[译文]
Tau 把持久化状态保存在你的主目录(`~/.tau/`)中,并从你的工作目录读取项目本地资源。本页是这些位置与文件格式的参考。

## Tau 主目录(Tau home)

[原文]
```text
~/.tau/
├── catalog.toml        # optional provider/model catalog overlay
├── providers.json      # provider/model preferences
├── models-store.json   # refreshed models.dev catalog cache
├── codex-models-store.json # account-scoped Codex model snapshot
├── credentials.json    # saved API keys / OAuth tokens (0600, atomic writes)
├── state/extensions/    # built-in integration state, including llama.cpp
├── settings.json       # general settings (trust default, shell prefix)
├── trust.json          # versioned project-input trust decisions
├── tui.json            # TUI theme, keybindings, and layout
├── sessions/           # saved sessions, per project
├── skills/             # user-level skills
├── prompts/            # user-level prompt templates
├── themes/             # user-level TUI themes
├── SYSTEM.md           # optional replacement system-prompt base
├── APPEND_SYSTEM.md    # optional appended system-prompt instructions
├── AGENTS.md           # global project instructions
└── logs/               # diagnostics
```

[译文]
```text
~/.tau/
├── catalog.toml        # 可选的 provider/模型目录叠加层
├── providers.json      # provider/模型偏好
├── models-store.json   # 刷新后的 models.dev 目录缓存
├── codex-models-store.json # 按账号隔离的 Codex 模型快照
├── credentials.json    # 已保存的 API key / OAuth token(0600,原子写入)
├── state/extensions/    # 内置集成状态,包括 llama.cpp
├── settings.json       # 通用设置(信任默认值、shell 前缀)
├── trust.json          # 带版本的项目输入信任决策
├── tui.json            # TUI 主题、键位与布局
├── sessions/           # 已保存会话(按项目)
├── skills/             # 用户级技能
├── prompts/            # 用户级提示词模板
├── themes/             # 用户级 TUI 主题
├── SYSTEM.md           # 可选的系统提示词基础替换
├── APPEND_SYSTEM.md    # 可选追加的系统提示词指令
├── AGENTS.md           # 全局项目指令
└── logs/               # 诊断
```

[原文]
Tau also reads user-level `.agents` resources: `~/.agents/skills/`,
`~/.agents/prompts/`, `~/.agents/AGENTS.md`.

[译文]
Tau 还会读取用户级 `.agents` 资源:`~/.agents/skills/`、`~/.agents/prompts/`、`~/.agents/AGENTS.md`。

[原文]
`settings.json` may contain `"defaultProjectTrust": "ask" | "always" |
"never"`. It is user-global only; a project cannot choose its own trust
policy. The default is `ask`. Interactive `ask` opens the trust modal; headless
`ask` safely declines. `trust.json` is managed atomically by Tau; do not add
relative paths or unknown fields. See [Project trust]({{< relref
"../guides/project-trust.md" >}}).

[译文]
`settings.json` 可以包含 `"defaultProjectTrust": "ask" | "always" | "never"`。它只对用户全局生效;项目不能自行选择信任策略。默认值是 `ask`。交互模式下 `ask` 会打开信任模态框;无头模式下 `ask` 会安全拒绝。`trust.json` 由 Tau 原子管理;不要添加相对路径或未知字段。见[项目信任]({{< relref "../guides/project-trust.md" >}})。

[原文]
Startup update checks cache their latest PyPI result in
`~/.tau/cache/update-check.json` and refresh at most once per day. Set
`TAU_NO_UPDATE_CHECK=1` to disable the check; Tau also skips it when `CI` is set.

[译文]
启动时的更新检查会把最新的 PyPI 结果缓存在 `~/.tau/cache/update-check.json`,每天最多刷新一次。设置 `TAU_NO_UPDATE_CHECK=1` 可禁用该检查;当设置了 `CI` 时 Tau 也会跳过它。

[原文]
`models-store.json` caches an ETag-revalidated models.dev catalog newer than the
bundled snapshot. `/model` refreshes it in the background at most every four
hours; `tau update --models` forces revalidation. Set `TAU_OFFLINE=1` to disable
catalog network access. User `catalog.toml` overrides still apply after the cache.

[译文]
`models-store.json` 缓存一份经过 ETag 重新校验、且比随包快照更新的 models.dev 目录。`/model` 最多每四小时在后台刷新一次;`tau update --models` 会强制重新校验。设置 `TAU_OFFLINE=1` 可禁用目录的网络访问。用户 `catalog.toml` 的覆盖在缓存之后仍然生效。

[原文]
`codex-models-store.json` contains only parsed model metadata and the active
Codex account ID. Tau loads it at startup, then refreshes it when `/model` or
`/scoped-models` opens; a snapshot from a different account is ignored. It never
contains OAuth tokens.

[译文]
`codex-models-store.json` 只包含解析后的模型元数据与活动 Codex 账号 ID。Tau 在启动时加载它,并在 `/model` 或 `/scoped-models` 打开时刷新;来自其他账号的快照会被忽略。它绝不包含 OAuth token。

## 系统提示词文件(System prompt files)

[原文]
Tau can replace or extend its generated system prompt with Tau-native Markdown
files:

```text
~/.tau/SYSTEM.md                 # user replacement
~/.tau/APPEND_SYSTEM.md          # user append
<project>/.tau/SYSTEM.md         # project replacement
<project>/.tau/APPEND_SYSTEM.md  # project append
```

[译文]
Tau 可以用 Tau 原生的 Markdown 文件替换或扩展它生成的系统提示词:

```text
~/.tau/SYSTEM.md                 # 用户级替换
~/.tau/APPEND_SYSTEM.md          # 用户级追加
<project>/.tau/SYSTEM.md         # 项目级替换
<project>/.tau/APPEND_SYSTEM.md  # 项目级追加
```

[原文]
Replacement inputs use precedence: explicit CLI input, then the project
`SYSTEM.md`, then the user `SYSTEM.md`. Append inputs compose instead of
shadowing one another: Tau adds the user `APPEND_SYSTEM.md`, then the project
`APPEND_SYSTEM.md`, then every explicit `--append-system-prompt` value in CLI
order. Replacement content still receives all append text, project instructions,
eligible skills, the current date, and the working directory. Empty files are
valid contributions.

[译文]
替换类输入按优先级使用:显式 CLI 输入,然后是项目 `SYSTEM.md`,再是用户 `SYSTEM.md`。追加类输入是彼此叠加而不是相互遮蔽:Tau 会先加入用户 `APPEND_SYSTEM.md`,再加入项目 `APPEND_SYSTEM.md`,最后按 CLI 顺序加入每一个显式的 `--append-system-prompt` 值。替换内容仍会接收全部追加文本、项目指令、符合条件的技能、当前日期与工作目录。空文件也是合法的贡献。

[原文]
Run `/reload` after adding, changing, or removing a file. Tau rebuilds the prompt
for the next model request without adding it to session history. `/session`
resource diagnostics identify selected append files and selected, shadowed, or
CLI-overridden replacement files. A selected file that cannot be inspected or
decoded as UTF-8 stops startup or reload rather than silently falling back.

[译文]
新增、修改或删除文件之后请运行 `/reload`。Tau 会为下一次模型请求重建提示词,而不把它加入会话历史。`/session` 的资源诊断会指出被选中的追加文件,以及被选中、被遮蔽或被 CLI 覆盖的替换文件。某个被选中的文件若无法检查或无法按 UTF-8 解码,会让启动或 reload 停下,而不是静默回退。

[原文]
System prompt files are Tau-specific and are not discovered from `.agents`.
Project files load only after the destination cwd is trusted. User files and
explicit CLI values remain available when project inputs are declined. Trust is
an input-loading guard, not a sandbox; inspect trusted prompt files because they
can replace or extend the model's highest-priority instructions.

[译文]
系统提示词文件是 Tau 特有的,不会从 `.agents` 中发现。项目文件只在目标 cwd 被信任之后才加载。当项目输入被拒绝时,用户级文件与显式 CLI 值仍然可用。信任是一道输入加载守卫,不是沙箱;请检查受信的提示词文件,因为它们可以替换或扩展模型最高优先级的指令。

## 网络代理(Network proxies)

[原文]
Tau uses `httpx` for provider requests, OAuth token refreshes, and startup update
checks, so it honors standard proxy environment variables such as `HTTP_PROXY`,
`HTTPS_PROXY`, `ALL_PROXY`, and `NO_PROXY`.

[译文]
Tau 使用 `httpx` 处理 provider 请求、OAuth token 刷新与启动更新检查,因此它遵循标准的代理环境变量,例如 `HTTP_PROXY`、`HTTPS_PROXY`、`ALL_PROXY` 与 `NO_PROXY`。

[原文]
SOCKS proxies are supported by the base installation. Use explicit schemes when
you can:

```bash
export ALL_PROXY=socks5://127.0.0.1:1080
# or, when proxy-side DNS resolution is required:
export ALL_PROXY=socks5h://127.0.0.1:1080
```

[译文]
基础安装即支持 SOCKS 代理。尽量使用显式方案:

```bash
export ALL_PROXY=socks5://127.0.0.1:1080
# 或者,当需要由代理侧做 DNS 解析时:
export ALL_PROXY=socks5h://127.0.0.1:1080
```

[原文]
Tau also accepts the generic `socks://` form that some systems and tools set in
the environment. Before creating its own HTTP clients, Tau normalizes
`socks://...` to `socks5://...` because `httpx` does not recognize the generic
scheme directly.

[译文]
Tau 也接受某些系统与工具会写进环境的通用 `socks://` 形式。在创建自己的 HTTP 客户端之前,Tau 会把 `socks://...` 归一化为 `socks5://...`,因为 `httpx` 不直接识别该通用方案。

[原文]
This matters for users behind corporate proxies, VPNs, local tunnels, or
privacy/network-routing setups: without SOCKS support and normalization, Tau can
fail before making a model API request with an error like
`Unknown scheme for proxy URL URL('socks://...')`.

[译文]
这对身处企业代理、VPN、本地隧道或隐私/网络路由环境中的用户很重要:如果没有 SOCKS 支持与归一化,Tau 可能在发出模型 API 请求之前就失败,并报出类似 `Unknown scheme for proxy URL URL('socks://...')` 的错误。

## Provider(Providers)

[原文]
Tau separates provider metadata from runtime preferences:

[译文]
Tau 把 provider 元数据与运行时偏好分开:

[原文]
- `src/tau_coding/data/catalog.toml` ships the built-in provider/model catalog.
- `~/.tau/catalog.toml` optionally adds personal providers or overlays built-ins.
- `~/.tau/providers.json` stores runtime preferences such as the default provider,
  default model, scoped models, headers, and timeout/retry settings.

[译文]
- `src/tau_coding/data/catalog.toml` 随包提供内置 provider/模型目录。
- `~/.tau/catalog.toml` 可选地添加个人 provider,或叠加到内置项之上。
- `~/.tau/providers.json` 存储运行时偏好,例如默认 provider、默认模型、scoped 模型、headers 与超时/重试设置。

[原文]
The built-in llama.cpp backend stores only its normalized endpoint and safe
server-reported model snapshot at `~/.tau/state/extensions/llama.cpp.json`.
Optional credentials remain in `credentials.json` or `LLAMA_API_KEY`; dynamic
llama.cpp provider definitions are not written to `catalog.toml` or
`providers.json`. Scoped llama.cpp entries in `providers.json` contain only the
stable `llama.cpp` provider ID and exact model ID; stale entries do not create
availability or router work. For Hugging Face GGUF search, Tau reads `HF_TOKEN`
or standard Hugging Face token files but never stores or forwards that token to
the llama.cpp server. The independent server needs its own `HF_TOKEN` for gated
downloads. See the [local inference guide]({{< relref
"../guides/local-inference.md" >}}).

[译文]
内置 llama.cpp 后端只在 `~/.tau/state/extensions/llama.cpp.json` 存储其归一化端点与安全的、由服务器上报的模型快照。可选凭据留在 `credentials.json` 或 `LLAMA_API_KEY`;动态 llama.cpp provider 定义不会被写入 `catalog.toml` 或 `providers.json`。`providers.json` 中的 scoped llama.cpp 条目只包含稳定的 `llama.cpp` provider ID 与精确模型 ID;陈旧条目不会产生可用性问题,也不会触发 router 工作。对于 Hugging Face GGUF 搜索,Tau 会读取 `HF_TOKEN` 或标准 Hugging Face token 文件,但绝不把该 token 存储或转发给 llama.cpp 服务器。那个独立服务器需要自己的 `HF_TOKEN` 才能下载受门控资源。见[本地推理指南]({{< relref "../guides/local-inference.md" >}})。

[原文]
Tau intentionally reads catalog overlays only from the user-level
`~/.tau/catalog.toml`. There is no project-level `.tau/catalog.toml`, so cloning a
repository cannot silently redirect a provider's `base_url` or credentials to an
unexpected service.

[译文]
Tau 有意只从用户级 `~/.tau/catalog.toml` 读取目录叠加层。不存在项目级 `.tau/catalog.toml`,因此克隆一个仓库无法悄悄把 provider 的 `base_url` 或凭据重定向到意外的服务。

### Provider 目录叠加层(Provider catalog overlays)

[原文]
Add reusable custom provider definitions to `~/.tau/catalog.toml`:

[译文]
把可复用的自定义 provider 定义加入 `~/.tau/catalog.toml`:

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
Catalog entries support `kind` values of `openai-compatible`, `anthropic`, and
`openai-codex`. For most custom services, start with `openai-compatible`.

[译文]
目录条目支持 `kind` 取值:`openai-compatible`、`anthropic` 与 `openai-codex`。对大多数自定义服务,从 `openai-compatible` 开始。

[原文]
User catalog overlays can be partial when they use the same `name` as a built-in
provider. Scalar fields replace built-in values, `models` are merged with user
models first, and `context_windows` are merged. Provider-level `compat` is merged
key by key. Model metadata is merged by model;
its `headers`, `compat`, and `thinking_level_map` mappings are merged, while other
metadata fields—including the complete `cost_tiers` array—replace the built-in
value. A model's `compat` wins over the provider's, so a built-in per-model value
overrides a provider-level overlay — override at the model level to change it.

[译文]
当用户目录叠加层与某个内置 provider 同名时,它可以是部分的。标量字段替换内置值;`models` 合并且用户模型排在前面;`context_windows` 合并。Provider 级 `compat` 按键逐一合并。模型元数据按模型合并;其中的 `headers`、`compat` 与 `thinking_level_map` 映射会合并,而其他元数据字段 —— 包括完整的 `cost_tiers` 数组 —— 会替换内置值。模型的 `compat` 优先于 provider 的,因此内置的按模型取值会覆盖 provider 级的叠加 —— 想改变它,就在模型级别覆盖。

[原文]
`removed_models` is an additive provider-scoped tombstone list. Tau applies it
last and removes matching model-list, metadata, context-window, thinking, and
default references after merging. Bundled tombstones therefore prevent stale
user overlays from restoring models that Tau previously advertised for the wrong
provider. They do not affect the same model ID on another provider.

[译文]
`removed_models` 是一个增量式、按 provider 限定作用域的墓碑标记列表。Tau 最后应用它,在合并之后移除匹配的模型列表、元数据、上下文窗口、thinking 与默认值引用。因此随包的墓碑标记能防止陈旧的用户叠加层把 Tau 此前为错误 provider 公布过的模型重新带回。它们不会影响另一个 provider 上的同名模型 ID。

### OpenAI 提示词缓存兼容键(OpenAI prompt-cache compat keys)

[原文]
Tau enables OpenAI cache affinity automatically only for `api.openai.com` and the
dedicated Codex OAuth provider. OpenAI-compatible gateways can opt in per provider
or model:

[译文]
Tau 只对 `api.openai.com` 与专用的 Codex OAuth provider 自动启用 OpenAI 缓存亲和性。OpenAI 兼容网关可以按 provider 或按模型选择启用:

[原文]
| Key | Effect |
| --- | --- |
| `supportsPromptCacheKey` | Sends the stable session-derived `prompt_cache_key` body field |
| `sendSessionAffinityHeaders` | Sends headers using `sessionAffinityFormat` |
| `sessionAffinityFormat` | `openai` sends `session_id`; `openrouter` sends `x-session-id` |

[译文]
| 键 | 效果 |
| --- | --- |
| `supportsPromptCacheKey` | 发送由会话推导、稳定的 `prompt_cache_key` 请求体字段 |
| `sendSessionAffinityHeaders` | 按 `sessionAffinityFormat` 发送请求头 |
| `sessionAffinityFormat` | `openai` 发送 `session_id`;`openrouter` 发送 `x-session-id` |

[原文]
Unknown gateways retain their existing request shape by default. Enable only fields
documented by the target service. Codex uses its dedicated `session-id` header
mapping and does not read these OpenAI-compatible settings.

[译文]
未知网关默认保持其现有的请求形态。只启用目标服务有文档记载的字段。Codex 使用它专用的 `session-id` 请求头映射,不读取这些 OpenAI 兼容设置。

### Anthropic 提示词缓存兼容键(Anthropic prompt-cache compat keys)

[原文]
Providers using the `anthropic-messages` API accept three `compat` booleans
controlling prompt caching. All default to enabled, except that `cache_control` is
detected as unsupported for any base URL that is not `api.anthropic.com`, since
several providers speak the Anthropic protocol through a gateway.

[译文]
使用 `anthropic-messages` API 的 provider 接受三个控制提示词缓存的 `compat` 布尔值。它们默认全部启用;例外是:对于任何不是 `api.anthropic.com` 的 base URL,`cache_control` 会被探测为不受支持,因为有若干 provider 是经由网关讲 Anthropic 协议。

[原文]
| Key | Effect when `false` |
| --- | --- |
| `supportsCacheControl` | No cache breakpoints at all; the request is byte-identical to an uncached one |
| `supportsLongCacheRetention` | Clamps the 1 hour TTL to the 5 minute default |
| `supportsCacheControlOnTools` | Drops only the tool-schema breakpoint |

[译文]
| 键 | 为 `false` 时的效果 |
| --- | --- |
| `supportsCacheControl` | 完全不使用缓存断点;请求与未启用缓存时逐字节一致 |
| `supportsLongCacheRetention` | 把 1 小时的 TTL 夹回 5 分钟的默认值 |
| `supportsCacheControlOnTools` | 只丢弃工具 schema 的断点 |

[原文]
Set them per provider or per model. For example, to stop requesting the one-hour
cache on a Claude subscription:

[译文]
可以按 provider 或按模型设置。例如,要停止在 Claude 订阅上请求一小时缓存:

```toml
schema_version = 1
[[providers]]
name = "anthropic"
compat = { supportsLongCacheRetention = false }
```

[原文]
The thinking fields (`thinking_levels`, `thinking_models`,
`thinking_default`, `thinking_parameter`) replace as a group when
`thinking_levels` is present.

[译文]
当 `thinking_levels` 存在时,thinking 相关字段(`thinking_levels`、`thinking_models`、`thinking_default`、`thinking_parameter`)作为一组整体替换。

[原文]
`catalog.toml` does not store runtime request options such as custom HTTP
headers, timeouts, or retry settings. Put those in `~/.tau/providers.json` on the
matching provider entry.

[译文]
`catalog.toml` 不存储运行时请求选项,例如自定义 HTTP 头、超时或重试设置。请把它们放到 `~/.tau/providers.json` 中对应 provider 的条目里。

[原文]
Invalid catalog files fail loudly. Tau rejects unknown keys, empty required
strings, empty model names, unsupported provider kinds, default models that are
not listed in `models`, `thinking_models` or `context_windows` entries for
unknown models, and non-positive or non-integer context-window values.

[译文]
非法的目录文件会明确失败。Tau 会拒绝:未知键、必填字符串为空、模型名为空、不受支持的 provider kind、未列入 `models` 的默认模型、为未知模型指定 `thinking_models` 或 `context_windows` 条目,以及非正数或非整数的上下文窗口值。

[原文]
Model metadata can retain a backward-compatible flat `cost` and optionally
provide ordered `cost_tiers` for rates that depend on input size:

[译文]
模型元数据可以保留向后兼容的扁平 `cost`,并可选地提供有序的 `cost_tiers`,用于随输入规模变化的费率:

```toml
[providers.model_metadata."long-context-model"]
cost = { input = 0.3, output = 1.2, cacheRead = 0.06, cacheWrite = 0 }
cost_tiers = [
  { max_input_tokens = 512000, input = 0.3, output = 1.2, cacheRead = 0.06, cacheWrite = 0 },
  { input = 0.6, output = 2.4, cacheRead = 0.12, cacheWrite = 0 },
]
```

[原文]
Limits are inclusive, must increase strictly, and the final tier must omit
`max_input_tokens` so every valid input size has a rate. Callers that understand
tiers should select the first tier whose limit includes the input-token count;
older callers continue to see `cost` as the base rate.

[译文]
上限是包含式的,必须严格递增,且最后一层必须省略 `max_input_tokens`,使每个合法输入规模都有对应费率。理解分层的调用方应选择第一个上限包含该输入 token 数的层;较旧的调用方仍把 `cost` 视作基础费率。

[原文]
All rates are per million tokens. `cacheWrite` is the 5-minute cache-write
rate; entries may add an optional `cacheWrite1h` rate for Anthropic's 1-hour
TTL cache writes, which Anthropic bills higher. When `cacheWrite1h` is absent,
1-hour writes fall back to the `cacheWrite` rate.

[译文]
所有费率均按每百万 token 计。`cacheWrite` 是 5 分钟缓存写入费率;条目可以额外提供可选的 `cacheWrite1h` 费率,用于 Anthropic 的 1 小时 TTL 缓存写入(Anthropic 对此收费更高)。当 `cacheWrite1h` 缺席时,1 小时写入回退到 `cacheWrite` 费率。

### Provider 偏好(Provider preferences)

[原文]
Provider preferences live in `~/.tau/providers.json`:

[译文]
Provider 偏好位于 `~/.tau/providers.json`:

```json
{
  "schema_version": 2,
  "default_provider": "local-gateway",
  "provider_preferences": {
    "local-gateway": {
      "default_model": "qwen-coder",
      "headers": { "X-Provider-Header": "value" },
      "thinking_defaults": { "qwen-coder": "low" },
      "timeout_seconds": 120,
      "max_retries": 2,
      "max_retry_delay_seconds": 0.5
    }
  },
  "scoped_models": [
    { "provider": "local-gateway", "model": "qwen-coder" }
  ]
}
```

[原文]
- `provider_preferences` keys must refer to providers from the effective catalog
  (`src/tau_coding/data/catalog.toml` plus `~/.tau/catalog.toml`).
- `headers` is optional (string→string). For example, Hugging Face organization
  billing can be configured with `"headers": { "X-HF-Bill-To": "my-org" }` on
  the `huggingface` provider preference. `thinking_defaults` remembers the
  preferred thinking level per model for new sessions; resumed sessions still use
  their session history. The built-in `huggingface` preference also accepts
  `"inference_providers": { "zai-org/GLM-5.2": "deepinfra" }`. Each key must be
  a configured model and each value an explicit provider suffix advertised by
  Hugging Face—not the `fastest`, `cheapest`, or `preferred` routing policies.
  Tau snapshots the selected suffix into new session metadata as a fixed route,
  retains it on resume, and sends only the suffixed wire model; ordinary model
  identity and catalog metadata remain unsuffixed. Without a preference, Tau
  starts in automatic mode and records the `x-inference-provider` reported by
  the first successful response as a sticky but recoverable route. After a
  retryable pre-output HTTP failure exhausts provider-level retries, Tau clears
  that automatic pin, retries the interrupted turn once through Hugging Face
  automatic routing, and stores the successful replacement. Explicitly configured
  routes never fail over. `/session` reports both mode and current route; changing
  the active session route is available through the external
  [`tau-huggingface`](https://github.com/alejandro-ao/tau-huggingface) extension;
  clone it and launch Tau with `tau -e ./tau-huggingface`, then use `/hf route`.
  `timeout_seconds` defaults to `60` (> 0); `max_retries`
  defaults to `2`; `max_retry_delay_seconds` defaults to `1` (both ≥ 0).
  Retries cover transient HTTP statuses (`408`, `409`, `425`, `429`, `5xx`),
  transport errors, and transient in-stream SSE errors that arrive on an
  otherwise successful HTTP 200 response. Anthropic retries `api_error`,
  `overloaded_error`, and `rate_limit_error`; OpenAI Codex retries transient
  events such as `server_is_overloaded`. In-stream errors remain terminal after
  partial content to prevent duplicate output or tool calls. Existing session
  records that contain a Hugging Face route but predate route-mode metadata are
  treated as fixed, preventing an upgrade from overriding a potentially explicit
  user selection.
- API keys and OAuth credentials are **not** stored here — they live in
  `~/.tau/credentials.json` (private but not encrypted). OAuth objects may contain
  provider metadata such as a GitHub Enterprise domain and are refreshed
  automatically. Resolution order: stored credential, then the env
  var named by `api_key_env`.
- The selected model must be present in that provider's `models` list. Add
  custom or local model names to `models` before using them as defaults,
  CLI/TUI selections, or scoped models.
- `scoped_models` are favorites for the **Ctrl+P** / **Shift+Ctrl+P**
  forward / backward quick-cycle.
- `providers.json` uses `schema_version: 2` and stores preferences only. Provider
  capabilities—model lists, context windows, transports, metadata, and thinking
  support—always come from the current effective catalog.
- Older `providers.json` files that contain full `providers` entries are migrated
  automatically on first load. Tau keeps the original as `providers.json.bak`,
  moves custom provider definitions to `~/.tau/catalog.toml`, and rewrites
  built-in providers from the current catalog while preserving safe preferences.
  This prevents old model or thinking metadata from hiding capabilities added by
  a Tau upgrade.
- Tau ignores unrecognized preference fields for cross-version compatibility,
  but rejects an unsupported `schema_version` rather than risking a destructive
  rewrite with the wrong format.
- Custom models declare thinking support in `catalog.toml` with
  `thinking_levels`, `thinking_default`, `thinking_models`, and
  `thinking_parameter` (`"reasoning_effort"`, `"reasoning.effort"`, or
  `"anthropic.thinking"`).

[译文]
- `provider_preferences` 的键必须指向有效目录(`src/tau_coding/data/catalog.toml` 加上 `~/.tau/catalog.toml`)中的 provider。
- `headers` 是可选的(string→string)。例如,Hugging Face 的组织计费可以在 `huggingface` 的 provider 偏好上用 `"headers": { "X-HF-Bill-To": "my-org" }` 配置。`thinking_defaults` 为新会话记住按模型的首选 thinking 等级;恢复的会话仍使用其会话历史。内置的 `huggingface` 偏好还接受 `"inference_providers": { "zai-org/GLM-5.2": "deepinfra" }`。每个键都必须是已配置的模型,每个取值都必须是 Hugging Face 公布的显式 provider 后缀 —— 而不是 `fastest`、`cheapest` 或 `preferred` 这类路由策略。Tau 会把所选后缀作为固定路由快照进新会话元数据,在恢复时保留它,并且只发送带后缀的线上模型;常规的模型身份与目录元数据保持无后缀。没有偏好时,Tau 以自动模式启动,并把第一次成功响应上报的 `x-inference-provider` 记录为一条粘性但可恢复的路由。当一次「输出前」的可重试 HTTP 失败耗尽了 provider 级重试之后,Tau 会清除该自动固定路由,通过 Hugging Face 的自动路由把被中断的轮次重试一次,并保存成功后的替换路由。显式配置的路由永远不会故障转移。`/session` 会同时报告模式与当前路由;更改活动会话的路由可通过外部扩展 [`tau-huggingface`](https://github.com/alejandro-ao/tau-huggingface) 实现:克隆它,并用 `tau -e ./tau-huggingface` 启动 Tau,然后使用 `/hf route`。`timeout_seconds` 默认 `60`(> 0);`max_retries` 默认 `2`;`max_retry_delay_seconds` 默认 `1`(两者皆 ≥ 0)。重试覆盖瞬时 HTTP 状态(`408`、`409`、`425`、`429`、`5xx`)、传输错误,以及在一个本来成功的 HTTP 200 响应上到达的瞬时流内 SSE 错误。Anthropic 会重试 `api_error`、`overloaded_error` 与 `rate_limit_error`;OpenAI Codex 会重试 `server_is_overloaded` 之类的瞬时事件。在已有部分内容之后,流内错误保持终态,以防止重复输出或重复工具调用。既有的会话记录若包含 Hugging Face 路由、但早于路由模式元数据,会被当作固定路由,从而防止升级覆盖一个可能是用户显式选择的设置。
- API key 与 OAuth 凭据**不**存在这里 —— 它们位于 `~/.tau/credentials.json`(私有但未加密)。OAuth 对象可以包含 GitHub Enterprise 域名之类的 provider 元数据,并会自动刷新。解析顺序:已存储凭据,然后是 `api_key_env` 指定的环境变量。
- 所选模型必须出现在该 provider 的 `models` 列表中。在把自定义或本地模型名用作默认值、CLI/TUI 选择或 scoped 模型之前,先把它们加入 `models`。
- `scoped_models` 是 **Ctrl+P** / **Shift+Ctrl+P** 向前/向后快速循环的收藏项。
- `providers.json` 使用 `schema_version: 2`,且只存储偏好。Provider 能力 —— 模型列表、上下文窗口、传输方式、元数据与 thinking 支持 —— 始终来自当前的有效目录。
- 包含完整 `providers` 条目的旧版 `providers.json` 会在首次加载时自动迁移。Tau 把原始文件保留为 `providers.json.bak`,把自定义 provider 定义移入 `~/.tau/catalog.toml`,并用当前目录重写内置 provider,同时保留安全的偏好。这防止旧的模型或 thinking 元数据掩盖 Tau 升级新增的能力。
- 为跨版本兼容,Tau 会忽略不认识的偏好字段;但对于不受支持的 `schema_version`,它会直接拒绝,而不是冒险用错误格式做破坏性重写。
- 自定义模型在 `catalog.toml` 中用 `thinking_levels`、`thinking_default`、`thinking_models` 与 `thinking_parameter`(`"reasoning_effort"`、`"reasoning.effort"` 或 `"anthropic.thinking"`)声明 thinking 支持。

[原文]
Writes after `/login`, `/model`, or scoped-model changes reload the file first,
apply only the requested change, write atomically, and keep a `.bak` backup.

[译文]
`/login`、`/model` 或 scoped 模型变更之后的写入会先重新读取该文件,只应用所请求的变更,原子写入,并保留一份 `.bak` 备份。

[原文]
See the [Providers & models guide]({{< relref "../guides/providers-and-models.md" >}}) for usage.

[译文]
使用方式见 [Provider 与模型指南]({{< relref "../guides/providers-and-models.md" >}})。

## Shell 设置(Shell settings)

[原文]
Tau runs shell commands in a **non-interactive** shell — both terminal-input
commands (`! gst`, `!! ll`) and the agent's `bash` tool. Non-interactive shells
don't load your aliases from `~/.zshrc` or `~/.bashrc`, and Tau deliberately
never reads those files (they can hold tokens and side effects).

[译文]
Tau 在**非交互式** shell 中运行 shell 命令 —— 既包括终端输入命令(`! gst`、`!! ll`),也包括 agent 的 `bash` 工具。非交互式 shell 不会加载你 `~/.zshrc` 或 `~/.bashrc` 里的别名,而且 Tau 有意从不读取那些文件(它们可能含有 token 与副作用)。

[原文]
To make your own aliases available, opt in with a `shellCommandPrefix` in
`~/.tau/settings.json` that loads a small Tau-specific alias file:

[译文]
要让自己定义的别名可用,可以在 `~/.tau/settings.json` 中显式启用 `shellCommandPrefix`,让它加载一个小的、Tau 专用的别名文件:

```bash
# ~/.tau/shell-aliases.bash
alias gst='git status'
alias ga='git add'
alias gc='git commit'
```

```json
{
  "shellCommandPrefix": "shopt -s expand_aliases\nsource ~/.tau/shell-aliases.bash"
}
```

[原文]
Then start a new session and try `! gst`. Notes:

[译文]
然后开始一个新会话并试试 `! gst`。注意:

[原文]
- Commands run through bash-style non-interactive execution, so keep aliases
  POSIX/bash-compatible (zsh-only syntax, functions, or interactive startup
  logic may not work).
- Changing `settings.json` affects **new** sessions; an already-running session
  keeps the prefix it started with.
- The snake_case key `shell_command_prefix` is also accepted.
- Unrecognized fields are ignored for compatibility with newer Tau versions;
  recognized fields remain strictly validated.

[译文]
- 命令走 bash 风格的非交互式执行,因此别名要保持 POSIX/bash 兼容(仅 zsh 的语法、函数或交互式启动逻辑可能不工作)。
- 修改 `settings.json` 只影响**新**会话;已在运行的会话保持它启动时的前缀。
- 也接受 snake_case 键 `shell_command_prefix`。
- 为兼容更新的 Tau 版本,不认识的字段会被忽略;已识别的字段仍严格校验。

## TUI 设置(TUI settings)

[原文]
The built-in frontend reads optional settings from `~/.tau/tui.json`:

[译文]
内置前端从 `~/.tau/tui.json` 读取可选设置:

```json
{
  "theme": "high-contrast",
  "sidebar_position": "right",
  "turn_notification": "desktop",
  "keybindings": {
    "cancel": "escape",
    "command_palette": "ctrl+k",
    "session_picker": "ctrl+r",
    "queue_follow_up": "alt+enter",
    "insert_newline": "shift+enter",
    "accept_completion": "tab",
    "completion_next": "down",
    "completion_previous": "up",
    "thinking_cycle": "shift+tab",
    "model_cycle": "ctrl+p",
    "model_cycle_reverse": "ctrl+shift+p",
    "toggle_thinking": "ctrl+t",
    "toggle_tool_results": "ctrl+o",
    "copy_message": "ctrl+c",
    "quit": "ctrl+d"
  }
}
```

[原文]
Built-in themes: `tau-dark` (default), `tau-light`, `high-contrast`. Custom
themes are JSON files in `~/.tau/themes/` or a project's `.tau/themes/` — see
[Themes]({{< relref "../guides/themes.md" >}}). Set one with `/theme`.
Textual's native theme picker is mapped to the same Tau themes and persists
the same `theme` setting. A configured theme that cannot be found falls back
to `tau-dark` with a startup notice, without overwriting the setting. Keys use
Textual syntax; omitted keys keep their defaults. Tau ignores unrecognized
settings and keybinding names so a `tui.json` written by a newer Tau version does
not prevent an older version from starting. Recognized settings remain strict:
Tau rejects invalid values, empty keys, and duplicate assignments.

[译文]
内置主题:`tau-dark`(默认)、`tau-light`、`high-contrast`。自定义主题是位于 `~/.tau/themes/` 或项目 `.tau/themes/` 中的 JSON 文件 —— 见[主题]({{< relref "../guides/themes.md" >}})。用 `/theme` 设置主题。Textual 原生的主题选择器被映射到同一批 Tau 主题,并持久化同一个 `theme` 设置。若某个已配置的主题找不到,会回退到 `tau-dark` 并给出启动提示,但不会覆盖该设置。键使用 Textual 语法;省略的键保持默认值。Tau 会忽略不认识的设置与键位名,因此由更新版 Tau 写出的 `tui.json` 不会阻止旧版本启动。已识别的设置仍严格校验:Tau 会拒绝非法取值、空按键与重复赋值。

[原文]
- `sidebar_position`: `"right"` (default), `"left"`, or `"off"`. Controls
  placement of the session metadata sidebar. `"off"` hides the sidebar entirely;
  the compact session info row below the prompt still works. In a running TUI,
  `/sidebar` temporarily toggles visibility without writing this setting; a
  temporarily shown `"off"` sidebar uses the default right position and the
  saved setting is honored again after restart.
- `turn_notification`: `"desktop"` (default), `"bell"`, or `"off"`. When Tau's
  terminal surface is unfocused and the agent becomes fully idle, `"desktop"`
  selects OSC 9 for Ghostty, iTerm2, and MinTTY, or Kitty's OSC 99 protocol for
  Kitty. Unknown terminals receive no sequence rather than an incompatible one.
  `"bell"` explicitly emits the standard terminal bell so the terminal can mark
  the tab or request attention instead; depending on terminal settings, BEL may
  play a sound. Desktop notifications can also use the operating system's
  configured notification sound. No notification is emitted while Tau has focus.

[译文]
- `sidebar_position`:`"right"`(默认)、`"left"` 或 `"off"`。控制会话元数据侧边栏的位置。`"off"` 会完全隐藏侧边栏;提示输入下方的紧凑会话信息行仍然可用。在运行中的 TUI 里,`/sidebar` 可以临时切换可见性而不写入该设置;被临时显示的 `"off"` 侧边栏使用默认的右侧位置,重启后仍遵循已保存的设置。
- `turn_notification`:`"desktop"`(默认)、`"bell"` 或 `"off"`。当 Tau 的终端界面未获得焦点、且 agent 完全进入空闲时,`"desktop"` 会为 Ghostty、iTerm2 与 MinTTY 选择 OSC 9,或为 Kitty 使用 Kitty 的 OSC 99 协议。未知终端不会收到任何序列,而不是收到一个不兼容的序列。`"bell"` 则显式发出标准终端铃声,让终端可以标记标签页或请求注意;视终端设置而定,BEL 可能播放声音。桌面通知也可能使用操作系统配置的通知音。当 Tau 拥有焦点时不会发出任何通知。

[原文]
Full list in [Keyboard shortcuts]({{< relref "./keybindings.md" >}}).

[译文]
完整列表见[键盘快捷键]({{< relref "./keybindings.md" >}})。

## 会话(Sessions)

[原文]
```text
~/.tau/sessions/<cleaned-path>-<short-hash>/
```

[译文]
```text
~/.tau/sessions/<cleaned-path>-<short-hash>/
```

[原文]
Each working directory gets its own subdirectory; transcripts are append-only
JSONL preserving messages and state changes. The last non-legacy-leaf entry in
file order is the active session-tree tip; historical `leaf` records remain
readable but are ignored. Per-entry bookmarks are append-only `label` changes
with `target_id` and an optional `label`; the latest change per target wins and
`null`/empty clears it. Session display names remain `session_info.title`.
Metadata is indexed per project. See the
[Sessions guide]({{< relref "../guides/sessions.md" >}}).

[译文]
每个工作目录都有自己的子目录;会话记录是只追加的 JSONL,保存消息与状态变更。文件顺序中最后一个非遗留 leaf 条目是活动会话树的顶点;历史 `leaf` 记录仍可读,但会被忽略。逐条目的书签是带 `target_id` 与可选 `label` 的只追加 `label` 变更;每个目标以最新一次变更为准,`null`/空值则清除它。会话显示名仍然是 `session_info.title`。元数据按项目建立索引。见[会话指南]({{< relref "../guides/sessions.md" >}})。

## 技能、提示词与项目上下文(Skills, prompts & project context)

[原文]
Resource discovery order (later overrides earlier) is documented in
[Skills & prompt templates]({{< relref "../guides/skills-and-prompts.md" >}}) and
[Project instructions]({{< relref "../guides/project-instructions.md" >}}). In short: user-level
`~/.tau` and `~/.agents`, then project-level `.tau` and `.agents`, with
`AGENTS.md` discovered from the project root down to your current directory.

[译文]
资源发现顺序(后者覆盖前者)记录在[技能与提示词模板]({{< relref "../guides/skills-and-prompts.md" >}})与[项目指令]({{< relref "../guides/project-instructions.md" >}})。简言之:先是用户级 `~/.tau` 与 `~/.agents`,然后是项目级 `.tau` 与 `.agents`;`AGENTS.md` 则从项目根目录一路向下发现到你的当前目录。

## 上下文(Context)

[原文]
`/session` reports a rough context estimate and breakdown. Auto-compaction
triggers near the model's context window minus a reserve; override per run with
`--auto-compact-threshold`. Details in [Managing context]({{< relref "../guides/context.md" >}}).

[译文]
`/session` 会报告粗略的上下文估算与明细。自动压缩在接近「模型上下文窗口减去预留」时触发;可用 `--auto-compact-threshold` 为某次运行覆盖。细节见[管理上下文]({{< relref "../guides/context.md" >}})。
