---
title: tau_coding · OAuth 登录流程
description: oauth_types / oauth_registry / oauth_anthropic / oauth_github_copilot / oauth_device
---

## 2. OAuth: the types and the registry

### 2.1 `oauth_types.py` — the protocol surface

This module defines the *shape* of an OAuth provider and the data passed through
the login callbacks. It is provider-neutral.

```python
OAuthFlowKind = Literal["browser", "device_code"]
```

Core payload dataclasses:

- `OAuthAuthInfo(url: str, instructions: str | None = None)` — the
  browser-flow URL plus optional human instructions.
- `OAuthDeviceCodeInfo(user_code, verification_uri, interval_seconds,
  expires_in_seconds)` — what the user types into another device, plus polling
  cadence/timeout.
- `OAuthPrompt(message, placeholder=None, allow_empty=False)` — a text prompt the
  provider shows the user (e.g. "paste the redirect URL", or a GitHub Enterprise
  domain).
- `OAuthSelectOption(id, label)` / `OAuthSelectPrompt(message, options)` —
  a provider-defined choice prompt.
- `OAuthRuntimeAuth(api_key: str, base_url: str | None = None,
  headers: Mapping[str, str] | None = None)` — the **result** of turning a stored
  credential into concrete request auth (API key + optional base URL override +
  extra headers). This is what `ModelProvider` actually consumes at request time.
- Callback type aliases: `AuthCallback`, `DeviceCodeCallback`, `PromptCallback`
  (async, returns the typed string), `SelectCallback` (async, returns option id),
  `ManualCodeCallback` (async, returns pasted code), `ProgressCallback`.
- `OAuthLoginCallbacks` bundles them: `on_auth`, `on_device_code`, `on_prompt`,
  `on_select`, `on_progress`, `on_manual_code_input`, and `method`
  (`OAuthFlowKind | None`). The host (TUI or print-mode) supplies these so a flow
  can surface progress and collect input without knowing which frontend is active.

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

- `login` returns an `OAuthCredential` directly (to be persisted) — **not** an
  intermediate `OAuthRuntimeAuth`.
- `runtime_auth` is the pure function that converts a stored credential into the
  `OAuthRuntimeAuth` used at request time; it never touches the network.
- `oauth_metadata_string(metadata, name)` is a small helper to pull one
  non-empty string out of a credential's `metadata`.

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

- The registry is keyed by **`provider.id`** (a string like `"anthropic"`),
  not by the `name`. Built-ins register in the order Anthropic, GitHub Copilot,
  OpenAI Codex.
- `register_oauth_provider(provider)` takes the *provider object* (using its
  `.id`) and rejects an empty id. `unregister_oauth_provider` removes a custom
  provider, but **restores the built-in** if the id matches a built-in — so you
  can undo a replacement. `reset_oauth_providers` is mainly for deterministic
  extension tests.
- This is what lets `/login <id>` resolve an id to a concrete login
  implementation, and what `provider_config.py`'s `provider_has_usable_credentials`
  consults to decide whether an OAuth provider can log in.

### 2.3 `oauth_device.py` — the generic device-code poller

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

- This is a **generic RFC 8628 polling loop**, not GitHub-specific. The caller
  supplies a `poll` coroutine that returns a `DevicePollResult[T]`; the helper
  drives the timing: starts after `interval` (or waits first if
  `wait_before_first_poll`), loops until `complete`/`failed`/timeout, handles
  `slow_down` (bumps the interval by 5s or to the server's suggested value), and
  honors a `cancel_event` (raising `OAuthError("Login cancelled")`).
- Injectable `sleep`/`monotonic` make it unit-testable without real time.
- `GitHubCopilotOAuthProvider` is the only built-in that uses it today; it passes
  a `poll` closure that POSTs to GitHub's token endpoint and maps the response to
  a `DevicePollResult`.

---

## 3. The three concrete OAuth flows

All three implement `OAuthProvider` and are registered at import time. Each
`login` takes the `OAuthLoginCallbacks` bundle; each `runtime_auth` produces an
`OAuthRuntimeAuth`.

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

- `OpenAICodexOAuthProvider` declares `flow_kinds=("browser",)`. Its `login`
  raises if `callbacks.method == "device_code"` (not implemented yet) and
  otherwise runs `login_openai_codex`.
- `login_openai_codex` builds a PKCE authorization URL
  (`create_pkce_pair()` → S256 `code_challenge`), starts a tiny
  `ThreadingHTTPServer` on `127.0.0.1:1455` (`_start_local_oauth_server`), fires
  `on_auth` with the URL, and opens the browser. It waits for the local callback
  to capture the `code` (validating `state`), with a **manual-code fallback**:
  if the server can't bind or the user prefers, `on_prompt` collects a pasted
  redirect URL/code (`parse_authorization_input` handles URL, `code#state`,
  `code=...` query, or raw code). It then exchanges the code for tokens and
  extracts `account_id` from the access JWT's
  `https://api.openai.com/auth` → `chatgpt_account_id` claim
  (`account_id_from_access_token`).
- `refresh` is a no-op if `oauth_credential_is_expired` is false (skew 60s);
  otherwise `refresh_openai_codex_token` POSTs `grant_type=refresh_token` and
  re-extracts `account_id`.
- `runtime_auth` returns `OAuthRuntimeAuth(api_key=credential.access)` — Codex
  just uses the access token as a bearer API key.
- `OAuthError` (a `RuntimeError`) is the shared failure type; it is also imported
  by `oauth_device.py` and the other two flow modules.

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

- `AnthropicOAuthProvider` also declares `flow_kinds=("browser",)`. It reuses
  `create_pkce_pair` and `_start_local_oauth_server` from `oauth.py` (on port
  53692), opens the browser, and supports the same manual-code paste fallback.
- Distinct touches: it uses `state=verifier` (the PKCE verifier doubles as the
  OAuth state), and the token request is a **JSON** POST (not form-encoded).
- `runtime_auth` is richer than Codex: it returns the access token as the API
  key **plus** headers that Anthropic requires for the Claude Code OAuth surface:
  `Authorization: Bearer …`, `anthropic-beta: claude-code-20250219,oauth-2025-04-20`,
  `user-agent: claude-cli/tau`, `x-app: cli`.
- `refresh_anthropic_token` rotates the refresh token and subtracts
  `ANTHROPIC_TOKEN_SKEW_MS` from the computed expiry.

### 3.3 `oauth_github_copilot.py` — GitHub Copilot (device code)

```python
GITHUB_COPILOT_OAUTH_PROVIDER = "github-copilot"
GITHUB_COPILOT_CLIENT_ID = "Iv1.b507a08c87ecfe98"
GITHUB_COPILOT_API_VERSION = "2026-06-01"
GITHUB_COPILOT_TOKEN_SKEW_MS = 5 * 60 * 1000
GITHUB_COPILOT_HEADERS = {"User-Agent": "GitHubCopilotChat/0.35.0", ...}
```

- `GitHubCopilotOAuthProvider` declares `flow_kinds=("device_code",)`.
- `login_github_copilot` first `on_prompt`s for a GitHub Enterprise domain
  (`normalize_github_domain`), then starts GitHub's device flow
  (`_start_device_flow` POSTs to `/login/device/code`, validates the returned
  `verification_uri` is http(s), captures `user_code`/`interval`/`expires_in`),
  fires `on_device_code`, and polls with the shared `poll_oauth_device_code`
  (via `_poll_github_access_token`). The user approves on another device; the
  poll returns the GitHub access token.
- Crucially, the GitHub token is then **exchanged** for a short-lived Copilot
  token via `refresh_github_copilot_token`, which GETs
  `https://api.<domain>/copilot_internal/v2/token` with the GitHub token and
  `GITHUB_COPILOT_HEADERS`. The Copilot token's `expires_at` (epoch seconds)
  becomes the credential `expires` (minus skew). The Enterprise domain is kept in
  `metadata["enterprise_domain"]`.
- `runtime_auth` derives the Copilot API base URL from the token's `proxy-ep`
  claim (`github_copilot_base_url`) or the enterprise domain, and attaches
  `GITHUB_COPILOT_HEADERS`. So at request time the provider points at the
  Copilot gateway, not raw GitHub.
- This provider's `refresh` re-runs the Copilot token exchange using the stored
  GitHub token (kept as `refresh`), re-applying expiry skew.

### 3.4 Registration summary

| id                | flow           | module                       | callback port / style        |
|-------------------|----------------|------------------------------|------------------------------|
| `anthropic`       | browser + PKCE | `oauth_anthropic.py`         | localhost:53692              |
| `github-copilot`  | device_code    | `oauth_github_copilot.py`    | device flow + Copilot swap   |
| `openai-codex`    | browser + PKCE | `oauth.py`                   | localhost:1455               |

`/login <id>` (in `commands.py`, 3c) resolves the id through
`get_oauth_provider`, runs `login`, and persists the returned `OAuthCredential`
via `FileCredentialStore.set_oauth`.

---

<!-- NAV -->
[← tau_coding · 凭证存储]({{< relref "./coding-credentials.md" >}})
[↑ 总览]({{< relref "./source-walkthrough.md" >}})
[→ tau_coding · CLI 入口]({{< relref "./coding-cli.md" >}})
