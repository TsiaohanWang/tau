---
title: tau_coding · OAuth 登录流程
description: oauth_types / oauth_registry / oauth_anthropic / oauth_github_copilot / oauth_device
code_files:
  - tau_coding/oauth.py
  - tau_coding/oauth_types.py
  - tau_coding/oauth_registry.py
  - tau_coding/oauth_anthropic.py
  - tau_coding/oauth_github_copilot.py
  - tau_coding/oauth_device.py
---

## 2. OAuth: the types and the registry

Tau 需要通过 OAuth（Open Authorization，一种行业标准授权协议）来安全地访问 AI 模型的 API。OAuth 允许用户在浏览器中完成登录，然后 Tau 获得一个访问令牌来调用 API——整个过程用户不需要把密码交给 Tau。本节介绍 OAuth 的类型定义和 provider 注册表。

### 2.1 `oauth_types.py` — the protocol surface

本模块定义了 OAuth provider 的 *形态* 以及通过登录回调传递的数据。它与具体 provider 无关。

```python
OAuthFlowKind = Literal["browser", "device_code"]
```

核心载荷 dataclass:

- `OAuthAuthInfo(url: str, instructions: str | None = None)` —— 浏览器流的 URL 加上
  可选的人工提示。
- `OAuthDeviceCodeInfo(user_code, verification_uri, interval_seconds,
  expires_in_seconds)` —— 用户需要在另一台设备上输入的内容,以及轮询节奏/超时。
- `OAuthPrompt(message, placeholder=None, allow_empty=False)` —— provider 向用户展示的
  文本提示(例如"粘贴重定向 URL",或 GitHub Enterprise 域名)。
- `OAuthSelectOption(id, label)` / `OAuthSelectPrompt(message, options)` ——
  provider 定义的选项提示。
- `OAuthRuntimeAuth(api_key: str, base_url: str | None = None,
  headers: Mapping[str, str] | None = None)` —— 把已存储凭证转换为具体请求鉴权的 **结果**
  (API key + 可选的 base URL 覆盖 + 附加 headers)。这是 `ModelProvider` 在请求时实际消费的内容。
- 回调类型别名:`AuthCallback`、`DeviceCodeCallback`、`PromptCallback`(异步,返回类型化字符串)、
  `SelectCallback`(异步,返回选项 id)、`ManualCodeCallback`(异步,返回粘贴的代码)、
  `ProgressCallback`。
- `OAuthLoginCallbacks` 将它们打包:`on_auth`、`on_device_code`、`on_prompt`、`on_select`、
  `on_progress`、`on_manual_code_input`,以及 `method`(`OAuthFlowKind | None`)。宿主(TUI 或
  打印模式)提供这些回调,使得流程能够展示进度并收集输入,而无需知晓当前是哪一个前端。

The `OAuthProvider` Protocol each concrete flow implements:

```python
class OAuthProvider(Protocol):
    @property
    def id(self) -> str: ...            # stable credential/provider id
    @property
    def name(self) -> str: ...          # user-facing name
    @property
    def flow_kinds(self) -> Sequence[OAuthFlowKind]: ...

    async def login(self, callbacks: OAuthLoginCallbacks) -> OAuthCredential: ...
    async def refresh(self, credential: OAuthCredential) -> OAuthCredential: ...
    def runtime_auth(self, credential: OAuthCredential) -> OAuthRuntimeAuth: ...
```

- `login` 直接返回 `OAuthCredential`(以供持久化)——**而非**中间的 `OAuthRuntimeAuth`。
- `runtime_auth` 是一个纯函数,把已存储凭证转换为请求时使用的 `OAuthRuntimeAuth`;它从不触碰网络。
- `oauth_metadata_string(metadata, name)` 是一个小辅助函数,从凭证的 `metadata` 中取出一个
  非空字符串。

### 2.2 `oauth_registry.py` — wiring ids to flows

```python
_BUILTIN_PROVIDERS = (AnthropicOAuthProvider(), GitHubCopilotOAuthProvider(),
                      OpenAICodexOAuthProvider())
_registry = {provider.id: provider for provider in _BUILTIN_PROVIDERS}

def get_oauth_provider(provider_id: str) -> OAuthProvider | None: ...
def get_oauth_providers() -> tuple[OAuthProvider, ...]: ...
def oauth_provider_ids() -> frozenset[str]: ...
def register_oauth_provider(provider: OAuthProvider) -> None: ...
def unregister_oauth_provider(provider_id: str) -> None: ...
def reset_oauth_providers(providers=_BUILTIN_PROVIDERS) -> None: ...
```

- 注册表以 **`provider.id`**(类似 `"anthropic"` 的字符串)为键,而非以 `name` 为键。
  内置 provider 按 Anthropic、GitHub Copilot、OpenAI Codex 的顺序注册。
- `register_oauth_provider(provider)` 接收 *provider 对象*(使用其 `.id`)并拒绝空 id。
  `unregister_oauth_provider` 会移除自定义 provider,但如果该 id 与某个内置 provider 匹配,则
  **恢复该内置 provider** —— 这样你可以撤销一次替换。`reset_oauth_providers` 主要用于确定性的
  扩展测试。
- 正是它让 `/login <id>` 能把一个 id 解析为具体的登录实现,并且 `provider_config.py` 中的
  `provider_has_usable_credentials` 会查询它来决定某个 OAuth provider 能否登录。

### 2.3 `oauth_device.py` — the generic device-code poller

**设备码流**（Device Code Flow，RFC 8628）是 OAuth 2.0 的一种扩展，专为无法直接打开浏览器的设备设计。Tau 的 CLI 工具没有图形界面，所以它用设备码流让用户在另一台设备（比如手机）上完成授权。

```python
DevicePollStatus = Literal["complete", "pending", "slow_down", "failed"]

@dataclass(frozen=True, slots=True)
class DevicePollResult[T]:
    status: DevicePollStatus
    value: T | None = None
    message: str | None = None
    interval_seconds: float | None = None

async def poll_oauth_device_code[T](
    poll: Callable[[], Awaitable[DevicePollResult[T]]],
    *,
    interval_seconds: float | None = None,
    expires_in_seconds: float | None = None,
    wait_before_first_poll: bool = False,
    cancel_event: asyncio.Event | None = None,
    sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
    monotonic: Callable[[], float] = time.monotonic,
) -> T: ...
```

- 这是一个 **通用的 RFC 8628 轮询循环**，并非 GitHub 专属。调用方提供一个返回
  `DevicePollResult[T]` 的 `poll` 协程；该辅助函数负责驱动时序：在 `interval` 之后开始（或当
  `wait_before_first_poll` 时先等待），循环直至 `complete`/`failed`/超时，处理 `slow_down`
  （将间隔增加 5 秒或调整为服务器建议值），并响应 `cancel_event`（抛出 `OAuthError("Login cancelled")`）。
  > **为何采用 RFC 8628（OAuth 2.0 设备授权授予）？** 当 agent 宿主没有可用的浏览器或输入界面时
  > —— 这正是无头 CLI 的典型情形 —— 设备码流让用户在 *第二台* 设备（例如手机上的浏览器）上完成认证。
  > 该规范强制规定 `authorization_pending`（继续轮询）、`slow_down`（退避并增大间隔）、
  > `expires_in`（硬性超时）的语义，而 `poll_oauth_device_code` 对其逐字编码，因此该循环对任何
  > 合规的授权服务器都具备互操作性（参见 <https://datatracker.ietf.org/doc/html/rfc8628>）。
- 可注入的 `sleep`/`monotonic` 使其无需真实时间即可进行单元测试。
- `GitHubCopilotOAuthProvider` 是现阶段唯一使用它的内置 provider;它传入一个向 GitHub 令牌端点
  POST 并把响应映射为 `DevicePollResult` 的 `poll` 闭包。

---

## 3. The three concrete OAuth flows

Tau 内置了三个 provider 的 OAuth 实现，它们都遵循统一的 `OAuthProvider` 接口。每个 `login` 接收 `OAuthLoginCallbacks` 包（一组回调函数，让登录流程能在不同 UI 环境中运行）；每个 `runtime_auth` 产出一个 `OAuthRuntimeAuth`（将存储的凭证转换为 API 请求所需的鉴权信息）。

### 3.1 `oauth.py` — OpenAI Codex (browser + PKCE)

```python
OPENAI_CODEX_OAUTH_PROVIDER = "openai-codex"     # the id used by /login
OPENAI_CODEX_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann"
OPENAI_CODEX_AUTHORIZE_URL = "https://auth.openai.com/oauth/authorize"
OPENAI_CODEX_TOKEN_URL = "https://auth.openai.com/oauth/token"
OPENAI_CODEX_REDIRECT_URI = "http://localhost:1455/auth/callback"
OPENAI_CODEX_SCOPE = "openid profile email offline_access"
OPENAI_CODEX_CALLBACK_PORT = 1455
TOKEN_REFRESH_SKEW_MS = 60_000
```

- `OpenAICodexOAuthProvider` 声明 `flow_kinds=("browser",)`。其 `login` 在
  `callbacks.method == "device_code"` 时抛出(尚未实现),否则运行 `login_openai_codex`。
- `login_openai_codex` 构建 PKCE 授权 URL(`create_pkce_pair()` → S256
  `code_challenge`),在 `127.0.0.1:1455` 上启动一个微型 `ThreadingHTTPServer`
  (`_start_local_oauth_server`),通过 `on_auth` 触发 URL 并打开浏览器。它等待本地回调以捕获
  `code`(校验 `state`),并带有 **手动码回退**:若服务器无法绑定或用户更愿意手动操作,则
  `on_prompt` 收集粘贴的重定向 URL/码(`parse_authorization_input` 可处理 URL、`code#state`、
  `code=...` 查询或原始码)。随后它用码换令牌,并从 access JWT 的
  `https://api.openai.com/auth` → `chatgpt_account_id` 声明中提取 `account_id`
  (`account_id_from_access_token`)。
  > **为何采用授权码 + PKCE（RFC 6749）？** OAuth 2.0 授权框架（RFC 6749，
  > <https://datatracker.ietf.org/doc/html/rfc6749>）将授权码授予定义为面向机密与公开客户端的
  > 基于重定向的流。CLI 是一个 *公开* 客户端，没有安全存放客户端密钥之处，因此 Tau 使用 PKCE
  > （S256 的 `code_challenge`/`code_verifier` 对）将令牌交换绑定到发起同一请求的客户端，从而
  > 挫败授权码拦截攻击。随机的 `state` 参数是该框架要求的 CSRF 对抗措施。二者结合，使得基于浏览器的
  > 登录能在 `localhost` 重定向处终止，而无需任何内嵌密钥。
- `refresh` 在 `oauth_credential_is_expired` 为假(提前量 60 秒)时是空操作;否则
  `refresh_openai_codex_token` POST `grant_type=refresh_token` 并重新提取 `account_id`。
- `runtime_auth` 返回 `OAuthRuntimeAuth(api_key=credential.access)` —— Codex 仅将 access 令牌
  作为 bearer API key 使用。
- `OAuthError`(一个 `RuntimeError`)是共享的失败类型;它也被 `oauth_device.py` 与另外两个流模块导入。

### 3.2 `oauth_anthropic.py` — Anthropic (browser + PKCE)

```python
ANTHROPIC_OAUTH_PROVIDER = "anthropic"
ANTHROPIC_CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944a1962f5e"
ANTHROPIC_AUTHORIZE_URL = "https://claude.ai/oauth/authorize"
ANTHROPIC_TOKEN_URL = "https://platform.claude.com/v1/oauth/token"
ANTHROPIC_REDIRECT_URI = "http://localhost:53692/callback"
ANTHROPIC_SCOPE = "org:create_api_key user:profile user:inference ..."
ANTHROPIC_CALLBACK_PORT = 53692
ANTHROPIC_TOKEN_SKEW_MS = 5 * 60 * 1000
```

- `AnthropicOAuthProvider` 同样声明 `flow_kinds=("browser",)`。它复用 `oauth.py` 中的
  `create_pkce_pair` 与 `_start_local_oauth_server`(端口 53692),打开浏览器,并支持相同的手动码
  粘贴回退。
- 不同之处:它使用 `state=verifier`(PKCE verifier 同时充当 OAuth state),且令牌请求是一个
  **JSON** POST(而非表单编码)。
- `runtime_auth` 比 Codex 更丰富:它返回 access 令牌作为 API key,**外加** Anthropic 在 Claude Code
  OAuth 界面所需的 headers:`Authorization: Bearer …`、`anthropic-beta: claude-code-20250219,oauth-2025-04-20`、
  `user-agent: claude-cli/tau`、`x-app: cli`。
- `refresh_anthropic_token` 轮换 refresh 令牌,并从计算出的过期时间中减去 `ANTHROPIC_TOKEN_SKEW_MS`。

### 3.3 `oauth_github_copilot.py` — GitHub Copilot (device code)

```python
GITHUB_COPILOT_OAUTH_PROVIDER = "github-copilot"
GITHUB_COPILOT_CLIENT_ID = "Iv1.b507a08c87ecfe98"
GITHUB_COPILOT_API_VERSION = "2026-06-01"
GITHUB_COPILOT_TOKEN_SKEW_MS = 5 * 60 * 1000
GITHUB_COPILOT_HEADERS = {"User-Agent": "GitHubCopilotChat/0.35.0", ...}
```

- `GitHubCopilotOAuthProvider` 声明 `flow_kinds=("device_code",)`。
- `login_github_copilot` 先通过 `on_prompt` 询问 GitHub Enterprise 域名
  (`normalize_github_domain`),然后启动 GitHub 的设备流(`_start_device_flow` 向
  `/login/device/code` POST,校验返回的 `verification_uri` 为 http(s),捕获 `user_code`/
  `interval`/`expires_in`),触发 `on_device_code`,并通过共享的 `poll_oauth_device_code`
  (经由 `_poll_github_access_token`)轮询。用户在另一台设备上批准;轮询返回 GitHub access 令牌。
- 关键一步是,随后通过 `refresh_github_copilot_token` 将 GitHub 令牌 **交换** 为短寿命的 Copilot
  令牌,该过程以 GitHub 令牌与 `GITHUB_COPILOT_HEADERS` 向
  `https://api.<domain>/copilot_internal/v2/token` 发起 GET。Copilot 令牌的 `expires_at`
  (epoch 秒)成为凭证的 `expires`(减去提前量)。Enterprise 域名保留在 `metadata["enterprise_domain"]`。
- `runtime_auth` 从令牌的 `proxy-ep` 声明(`github_copilot_base_url`)或企业域名派生 Copilot API
  base URL,并附上 `GITHUB_COPILOT_HEADERS`。因此在请求时,provider 指向 Copilot 网关,而非原始 GitHub。
- 该 provider 的 `refresh` 使用已存储的 GitHub 令牌(保留为 `refresh`)重新执行 Copilot 令牌交换,
  并再次应用过期提前量。

### 3.4 Registration summary

| id                | flow           | module                       | callback port / style        |
|-------------------|----------------|------------------------------|------------------------------|
| `anthropic`       | browser + PKCE | `oauth_anthropic.py`         | localhost:53692              |
| `github-copilot`  | device_code    | `oauth_github_copilot.py`    | device flow + Copilot swap   |
| `openai-codex`    | browser + PKCE | `oauth.py`                   | localhost:1455               |

`/login <id>`(位于 `commands.py`,3c)通过 `get_oauth_provider` 解析 id,运行 `login`,并通过
`FileCredentialStore.set_oauth` 持久化返回的 `OAuthCredential`。

---

<!-- NAV -->
[← tau_coding · 凭证存储]({{< relref "./coding-credentials.md" >}})
[↑ 总览]({{< relref "./source-walkthrough.md" >}})
[→ tau_coding · Provider 配置]({{< relref "./coding-provider-config.md" >}})
