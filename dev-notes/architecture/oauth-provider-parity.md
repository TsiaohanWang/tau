# OAuth Provider 对齐与登录上线日志 / OAuth provider parity and login production journal

[原文]
Issue: [#370](https://github.com/huggingface/tau/issues/370)

[译文]
Issue:[#370](https://github.com/huggingface/tau/issues/370)

## 本阶段新增了什么(What this phase adds)

[原文]
Tau's original OAuth code was tied directly to OpenAI Codex. This phase adds a
small provider-neutral registry in `tau_coding`, ports the two broadly useful Pi
subscription providers that Tau was missing, and adds the current OpenCode
products using their supported API-key mechanism:

[译文]
Tau 最初的 OAuth 代码与 OpenAI Codex 直接绑定。本阶段在 `tau_coding` 中加入了一个小巧的、provider 无关的注册表,移植了 Tau 原先缺失的两个广泛使用的 Pi 订阅 provider,并用各自支持的 API key 机制接入了当前的 OpenCode 产品:

[原文]
- Anthropic Claude Pro/Max OAuth (authorization code + PKCE)
- GitHub Copilot OAuth (device authorization, including GitHub Enterprise
  domain input)
- existing OpenAI Codex OAuth through the same registry
- OpenCode Go and OpenCode Zen catalog entries (`OPENCODE_API_KEY`, not OAuth)

[译文]
- Anthropic Claude Pro/Max OAuth(授权码 + PKCE)
- GitHub Copilot OAuth(设备授权,包含 GitHub Enterprise 域名的输入)
- 既有的 OpenAI Codex OAuth,经由同一个注册表
- OpenCode Go 与 OpenCode Zen 目录条目(`OPENCODE_API_KEY`,不是 OAuth)

[原文]
The registry can also be extended by application extensions without adding
provider policy to `tau_agent`.

[译文]
该注册表也可以被应用扩展扩展,而无需把 provider 策略加入 `tau_agent`。

## 已审计的上游快照(Audited upstream snapshot)

[原文]
The parity audit is pinned to Pi commit
[`dcfe36c79702ec240b146c45f167ab75ecddd205`](https://github.com/earendil-works/pi/commit/dcfe36c79702ec240b146c45f167ab75ecddd205),
committed 2026-07-14. The relevant source is under
`packages/ai/src/utils/oauth/`, while Pi's provider guide is
[`packages/coding-agent/docs/providers.md`](https://github.com/earendil-works/pi/blob/dcfe36c79702ec240b146c45f167ab75ecddd205/packages/coding-agent/docs/providers.md).

[译文]
本次对齐审计固定到 Pi 提交 [`dcfe36c79702ec240b146c45f167ab75ecddd205`](https://github.com/earendil-works/pi/commit/dcfe36c79702ec240b146c45f167ab75ecddd205),提交日期为 2026-07-14。相关源码位于 `packages/ai/src/utils/oauth/`,而 Pi 的 provider 指南为 [`packages/coding-agent/docs/providers.md`](https://github.com/earendil-works/pi/blob/dcfe36c79702ec240b146c45f167ab75ecddd205/packages/coding-agent/docs/providers.md)。

[原文]
| Provider/product | Upstream auth | Tau decision | Notes |
| --- | --- | --- | --- |
| OpenAI Codex | OAuth browser callback; Pi also has device code | Ship existing browser flow through registry | Existing Tau credentials remain compatible. Device code remains a follow-up. |
| Anthropic Claude Pro/Max | OAuth authorization code + PKCE | Ship | OAuth requests use Bearer auth, Claude Code identity headers/betas, and the required identity system block. Anthropic currently describes third-party harness use as extra usage billed per token. |
| GitHub Copilot | GitHub device authorization followed by Copilot token exchange | Ship | Supports github.com and a prompted GitHub Enterprise Server domain. Model availability is account policy dependent. |
| Radius | Gateway-discovered browser/device OAuth | Exclude from Tau core | Radius is Pi's first-party `pi-messages` gateway, not a general provider. Tau should not bind a reusable harness to another product's gateway. |
| OpenCode Go | API key | Ship as API-key provider | Official setup asks users to subscribe in the OpenCode console and copy an API key. |
| OpenCode Zen | API key | Ship as API-key provider | This is pay-as-you-go gateway access; it is not OAuth login. |
| Google Gemini API | API key | Keep existing API-key provider | Gemini CLI's consumer OAuth is a first-party-client login. This phase does not reuse undocumented consumer credentials in a third-party harness. Vertex ADC remains a possible separate ambient-auth feature. |

[译文]
| Provider/产品 | 上游认证方式 | Tau 决策 | 说明 |
| --- | --- | --- | --- |
| OpenAI Codex | OAuth 浏览器回调;Pi 还有 device code | 通过注册表上线既有浏览器流程 | 既有 Tau 凭据保持兼容。Device code 仍作为后续项。 |
| Anthropic Claude Pro/Max | OAuth 授权码 + PKCE | 上线 | OAuth 请求使用 Bearer 认证、Claude Code 身份 headers/betas,以及必需的 identity system block。Anthropic 目前把第三方 harness 的使用描述为按 token 计费的额外用量。 |
| GitHub Copilot | GitHub 设备授权,随后做 Copilot token 交换 | 上线 | 支持 github.com,以及提示输入的 GitHub Enterprise Server 域名。模型可用性取决于账号策略。 |
| Radius | 网关发现的浏览器/设备 OAuth | 排除在 Tau 核心之外 | Radius 是 Pi 的第一方 `pi-messages` 网关,不是通用 provider。Tau 不应把可复用 harness 绑定到另一个产品的网关上。 |
| OpenCode Go | API key | 作为 API-key provider 上线 | 官方安装说明要求用户在 OpenCode 控制台订阅并复制 API key。 |
| OpenCode Zen | API key | 作为 API-key provider 上线 | 这是按量付费的网关访问,不是 OAuth 登录。 |
| Google Gemini API | API key | 保留既有 API-key provider | Gemini CLI 的消费者 OAuth 属于第一方客户端登录。本阶段不会在第三方 harness 中复用未公开文档的消费者凭据。Vertex ADC 仍可能作为独立的 ambient-auth 特性。 |

[原文]
The OpenCode decisions were checked against the OpenCode `dev` documentation:
[`go.mdx`](https://github.com/sst/opencode/blob/dev/packages/web/src/content/docs/go.mdx)
and
[`zen.mdx`](https://github.com/sst/opencode/blob/dev/packages/web/src/content/docs/zen.mdx).
OpenCode's newer console account OAuth dynamically returns workspace provider
configuration, but OpenCode Go/Zen's documented portable provider credential is
still an API key. Tau therefore does not mislabel either product as OAuth.

[译文]
OpenCode 相关决策已对照 OpenCode `dev` 文档核对:[`go.mdx`](https://github.com/sst/opencode/blob/dev/packages/web/src/content/docs/go.mdx) 与 [`zen.mdx`](https://github.com/sst/opencode/blob/dev/packages/web/src/content/docs/zen.mdx)。OpenCode 较新的控制台账号 OAuth 会动态返回 workspace 的 provider 配置,但 OpenCode Go/Zen 有文档记载的可移植 provider 凭据仍然是 API key。因此 Tau 不会把这两个产品误标为 OAuth。

## 架构(Architecture)

```text
Textual OAuthLoginScreen
        │ OAuthLoginCallbacks (URL, device code, prompts, progress)
        ▼
tau_coding.oauth_registry
        │ OAuthProvider protocol
        ├── OpenAI Codex
        ├── Anthropic
        └── GitHub Copilot
        │
        ▼
FileCredentialStore ── OAuthRuntimeCredentialResolver ── tau_ai adapter
```

[原文]
Responsibilities remain aligned with Tau's package boundaries:

[译文]
各项职责仍与 Tau 的包边界保持一致:

[原文]
- `tau_coding` owns login UX contracts, provider registry, token refresh, local
  credential storage, and provider setup policy.
- `tau_ai` only knows request-time auth material and protocol-specific header or
  payload behavior.
- `tau_agent` is unchanged and knows nothing about providers, OAuth, Textual, or
  local paths.

[译文]
- `tau_coding` 持有登录交互契约、provider 注册表、token 刷新、本地凭据存储与 provider setup 策略。
- `tau_ai` 只知道请求时的认证材料,以及协议特有的 header 或载荷行为。
- `tau_agent` 不变,它不了解 provider、OAuth、Textual 或本地路径。

[原文]
`OAuthCredential` now allows an optional `account_id` and JSON-compatible
provider metadata. Existing Codex JSON objects load unchanged. GitHub Enterprise
stores only its normalized domain. Writes use a private temporary file and an
atomic replace, avoiding partially written JSON.

[译文]
`OAuthCredential` 现在允许可选的 `account_id` 与 JSON 兼容的 provider 元数据。既有的 Codex JSON 对象可以原样加载。GitHub Enterprise 只保存归一化后的域名。写入使用私有临时文件与原子替换,避免写出部分写入的 JSON。

[原文]
Request-time resolvers refresh expired credentials and save replacements before
the request. This also allows Copilot to derive a per-account API base URL from
the short-lived token.

[译文]
请求时的 resolver 会刷新已过期的凭据,并在请求之前保存替换后的凭据。这也让 Copilot 可以从短生命周期 token 推导出按账号的 API base URL。

## 安全取舍与限制(Security choices and limitations)

[原文]
- PKCE and state validation are retained for browser callbacks.
- Device verification URLs are accepted only with `http` or `https` schemes.
- Device polling follows RFC 8628 defaults, `slow_down`, expiry, and
  cancellation.
- Provider HTTP failures do not include token response bodies, tokens, or
  authorization codes in user-facing exceptions.
- Credentials remain in `~/.tau/credentials.json` with mode `0600`. OS keyring
  or encrypted-at-rest storage is intentionally deferred; users with a stronger
  local threat model should prefer environment variables or protect their Tau
  home directory.
- `/logout` removes local credentials but does not remotely revoke a provider
  grant. Users can revoke Tau/CLI access in their provider account settings.
- Copilot model support varies by plan, organization policy, and model opt-in.
  The bundled catalog is a candidate list; provider errors should be interpreted
  with those account restrictions in mind.

[译文]
- 浏览器回调保留 PKCE 与 state 校验。
- 设备验证 URL 只接受 `http` 或 `https` 方案。
- 设备轮询遵循 RFC 8628 的默认值、`slow_down`、过期与取消语义。
- Provider 的 HTTP 失败不会在面向用户的异常中包含 token 响应体、token 或授权码。
- 凭据保存在 `~/.tau/credentials.json`,权限模式为 `0600`。操作系统钥匙串或静态加密存储被有意推迟;本地威胁模型更严格的用户应优先使用环境变量,或保护好自己的 Tau 主目录。
- `/logout` 只删除本地凭据,不会远程撤销 provider 授权。用户可以在各自 provider 的账号设置中撤销 Tau/CLI 的访问。
- Copilot 的模型支持因套餐、组织策略与模型 opt-in 而异。随包目录只是一个候选列表;解读 provider 错误时应把这些账号限制考虑在内。

## 验证与发布流程(Validation and release process)

[原文]
Deterministic tests use `httpx.MockTransport` and fake credentials. They cover:

[译文]
确定性测试使用 `httpx.MockTransport` 与假凭据。它们覆盖:

[原文]
- Anthropic refresh success and error redaction
- Copilot device login, token exchange, Enterprise routing, untrusted URL
  rejection, and refresh metadata
- RFC 8628 `slow_down` and cancellation
- registry replacement/restoration
- legacy Codex credential loading, extensible metadata, permissions, and atomic
  writes
- login picker separation between OAuth and API-key methods

[译文]
- Anthropic 刷新成功与错误信息脱敏
- Copilot 设备登录、token 交换、Enterprise 路由、不受信 URL 拒绝,以及刷新元数据
- RFC 8628 的 `slow_down` 与取消
- 注册表的替换/恢复
- 旧版 Codex 凭据加载、可扩展元数据、权限与原子写入
- 登录选择器中 OAuth 与 API-key 方法的区分

[原文]
Run the production checks with:

[译文]
运行生产检查:

```bash
uv run pytest
uv run ruff check .
uv run ruff format --check .
uv run mypy
```

[原文]
Live OAuth smoke tests are deliberately not automated because they require paid
personal subscriptions and external browsers. Before a release, maintainers
should manually verify each enabled flow using test accounts, including one
headless Copilot device flow and one pasted browser callback. Sanitized results
belong in the release PR; no token, code, callback query, JWT, or credential
file content should be copied into GitHub.

[译文]
真实 OAuth 的冒烟测试被有意不自动化,因为它们需要付费的个人订阅与外部浏览器。发布之前,维护者应使用测试账号手动验证每条已启用的流程,其中包括一次无头的 Copilot 设备流程与一次手动粘贴的浏览器回调。经脱敏的结果应写进发布 PR;任何 token、授权码、回调查询参数、JWT 或凭据文件内容都不应被复制到 GitHub。

## 回滚(Rollback)

[原文]
The registry and provider catalog additions can be reverted without changing
session files. Existing API-key credentials and old Codex OAuth objects retain
their previous format. If a provider changes an endpoint or terms, remove it
from `auth_methods`/the built-in registry while retaining credential parsing so
users can update or delete old local entries safely.

[译文]
注册表与 provider 目录的新增内容可以回滚,而无需修改会话文件。既有的 API-key 凭据与旧的 Codex OAuth 对象保持原有格式。如果某个 provider 更改了端点或条款,可以从 `auth_methods`/内置注册表中移除它,同时保留凭据解析,以便用户安全地更新或删除旧的本地条目。

## 后续项(Follow-ups)

[原文]
- Add OpenAI Codex device-code login and an explicit browser/device selector.
- Add a frontend-neutral non-TUI login command for SSH-only use.
- Consider process-level refresh locking if Tau introduces concurrent processes
  sharing one credentials file; atomic replacement protects file integrity but
  does not serialize competing read-modify-write operations across processes.
- Evaluate OS keyring integration and remote revocation links.
- Consider live Copilot model discovery/filtering after login.

[译文]
- 增加 OpenAI Codex 的 device-code 登录,以及显式的浏览器/设备选择器。
- 增加一条前端无关、非 TUI 的登录命令,用于仅有 SSH 的场景。
- 如果 Tau 将来引入共享同一凭据文件的并发进程,考虑进程级刷新锁;原子替换保护了文件完整性,但不会跨进程串行化相互竞争的「读-改-写」操作。
- 评估操作系统钥匙串集成与远程撤销链接。
- 考虑在登录后做 Copilot 模型的实时发现/过滤。
