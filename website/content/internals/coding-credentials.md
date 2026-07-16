---
title: tau_coding · 凭证存储
description: credentials.py
---

## 1. `credentials.py` — the credential store

This module is the single source of truth for *how Tau persists authentication
material*. It defines two frozen credential dataclasses plus a small JSON-backed
store. Secrets live in `<Tau home>/credentials.json`, never in `providers.json`.

### 1.1 The credential types

```python
@dataclass(frozen=True, slots=True)
class OAuthCredential:
    access: str                       # access token (used as the API key at runtime)
    refresh: str                      # refresh token
    expires: int                      # expiry as epoch **milliseconds**
    account_id: str | None = None     # e.g. ChatGPT account id (optional)
    metadata: dict[str, JSONValue] = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class ApiKeyCredential:
    key: str
```

- `OAuthCredential` is what every OAuth flow produces and what refresh returns.
  Note the field names: `access`/`refresh` (not `access_token`/`refresh_token`),
  and `expires` is an **int in milliseconds** (not a float epoch-seconds
  `expires_at`). `account_id` is optional so legacy Codex credentials and
  device-code providers alike can be stored; provider-specific non-secret values
  (e.g. a GitHub Enterprise domain) live in `metadata`.
- `ApiKeyCredential` is the trivial case: a single `key` string. (There is also
  a raw-string form of credential, used for plain API keys stored directly by
  name — see `FileCredentialStore` below.)

### 1.2 `FileCredentialStore`

```python
class FileCredentialStore:
    def __init__(self, path: Path | None = None) -> None:
        self.path = path or credentials_path()

    def get(self, name: str) -> str | None: ...
    def set(self, name: str, value: str) -> None: ...
    def set_api_key(self, name: str, value: str) -> None: ...
    def get_oauth(self, name: str) -> OAuthCredential | None: ...
    def set_oauth(self, name: str, credential: OAuthCredential) -> None: ...
    def delete(self, name: str) -> None: ...
```

- The constructor defaults its path to `credentials_path()`, which resolves
  `<TauPaths().home>/credentials.json`. (`TauPaths` lives in `paths.py`; the
  older `TauResourcePaths` from `resources.py` is the richer resource layout
  used by sessions/skills/extensions — credentials use the simpler `TauPaths`.)
- Storage is a JSON object keyed by **provider/credential name**. A value is
  either a raw string (a plain API key) or an object tagged `"type": "api_key"`
  / `"oauth"`. `_credential_from_json` validates on load; malformed JSON, wrong
  types, empty tokens, or non-positive `expires` all raise `CredentialStoreError`
  (a `ValueError` subclass).
- `set`/`set_api_key` store a raw string; `set_oauth`/`get_oauth` store and
  retrieve an `OAuthCredential` (with `_validate_oauth_credential` enforcing
  non-empty tokens, optional `account_id`, and JSON-safe `metadata`).
- Writes are **atomic and private**: the store writes to a temp file in the same
  directory with `0o600`, then `rename`s into place and chmods the final file
  `0o600`. This limits credential exposure to the owning user.
- There is **no encryption**: like Pi, Tau relies on OS file permissions. The
  `0o600` chmod is the only confidentiality mechanism.

### 1.3 How it connects

`provider_config.py` (3c) and `provider_runtime.py` (3c) are the *consumers*:
`/login` writes an `OAuthCredential` here via `set_oauth`, and
`create_model_provider` reads it back (via the `CredentialReader` protocol) when
building a live `ModelProvider`. Refresh flows (`oauth*.py`) return a fresh
`OAuthCredential` that the runtime persists back through `set_oauth`.

---

<!-- NAV -->
[← tau_coding · TUI 界面与控件]({{< relref "./coding-tui-app.md" >}})
[↑ 总览]({{< relref "./source-walkthrough.md" >}})
[→ tau_coding · OAuth 登录流程]({{< relref "./coding-oauth.md" >}})
