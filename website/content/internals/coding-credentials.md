---
title: tau_coding · 凭证存储
description: credentials.py — API 密钥与 OAuth 令牌的本地持久化
code_files:
  - tau_coding/credentials.py
---

## 1. `credentials.py` — 凭证存储

凭证（credentials）就是 API 密钥、访问令牌这些"能证明你是谁"的敏感信息。Tau 需要存储它们，这样用户就不必每次启动都重新登录。本模块是关于 *Tau 如何持久化认证资料* 的唯一事实来源。它定义了两个冻结的凭证 dataclass 以及一个基于 JSON 的小型存储。密钥存放在 `<Tau home>/credentials.json` 中，绝不放在 `providers.json`。

> **为何要将 `credentials.json` 与 `providers.json` 分离?** `providers.json`
> 保存的是静态 *配置*(base URL、模型列表、client id、超时时间),这些可以安全地提交、
> 跨机器同步以及手动编辑。`credentials.json` 保存的是 *密钥*(access/refresh 令牌、
> API key),绝不能随配置一起传播。将二者分离可强制划出清晰的安全边界:配置文件可以纳入
> 版本控制或共享,而凭证文件保持私有(`0o600`)、可被 git 忽略,并且是唯一一旦泄露即构成
> 安全事件的产物。若合并为单一文件,会迫使用户把每次配置编辑都当作密钥处理操作。

### 1.1 凭证类型

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

- `OAuthCredential`(OAuth 凭证)是每种 OAuth 流程产出的结果,也是刷新返回的对象。
  注意字段命名:`access`/`refresh`(而非 `access_token`/`refresh_token`),且
  `expires` 是 **毫秒精度的 int**(不是浮点 epoch 秒的 `expires_at`)。`account_id`
  为可选,以便旧的 Codex 凭证与设备码类 provider 都能被存储;provider 专属的非机密值
  (如 GitHub Enterprise 域名)存放在 `metadata` 中。
- `ApiKeyCredential`(API key 凭证)是最简单的情况:仅一个 `key` 字符串。(此外还有一种
  原始字符串形式的凭证,用于直接按名称存储的纯 API key —— 见下方的 `FileCredentialStore`。)

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

- 构造函数默认路径为 `credentials_path()`,它会解析为 `<TauPaths().home>/credentials.json`。
  (`TauPaths` 位于 `paths.py`;较旧的 `TauResourcePaths` 来自 `resources.py`,是供
  sessions/skills/extensions 使用的更丰富的资源布局 —— 凭证使用更简单的 `TauPaths`。)
- 存储是一个以 **provider/凭证名** 为键的 JSON 对象。其值要么是原始字符串(纯 API key),
  要么是带 `"type": "api_key"` / `"oauth"` 标记的 object。`_credential_from_json` 在加载时
  进行校验;格式错误的 JSON、类型错误、空令牌或 `expires` 非正数都会抛出
  `CredentialStoreError`(一个 `ValueError` 子类)。
- `set`/`set_api_key` 存储原始字符串;`set_oauth`/`get_oauth` 存储并取回一个
  `OAuthCredential`(由 `_validate_oauth_credential` 强制要求非空令牌、可选 `account_id`
  以及 JSON 安全的 `metadata`)。
- 写入是 **原子的且私有的**:存储先以 `0o600` 权限写入同目录下的临时文件,然后 `rename` 到位,
  并将最终文件 chmod 为 `0o600`。这将凭证暴露面限制为属主用户。
- **没有加密**:与 Pi 一样,Tau 依赖操作系统文件权限。`0o600` 的 chmod 是唯一保密机制。这是
  一个刻意的决策:对本地凭证文件做静态加密需要密钥库或口令提示,在用户家目录的 OS 级保护之上
  并不会显著提升安全门槛,却增加了摩擦。威胁模型是"非属主读取该文件",而这已被 `0o600` 挫败。

### 1.3 How it connects

`provider_config.py`(3c)与 `provider_runtime.py`(3c)是 *消费方*:`/login` 通过 `set_oauth`
在此写入一个 `OAuthCredential`,而 `create_model_provider` 在构建活动的 `ModelProvider` 时
(经由 `CredentialReader` 协议)将其读回。刷新流程(`oauth*.py`)返回一个新的 `OAuthCredential`,
由运行时通过 `set_oauth` 持久化回去。

---

## 逐方法深度剖析（credentials.py）

> 以下为 `credentials.py` 各顶层类型与方法的逐方法展开，是对上方概述的细化补充。OAuth 相关文件的逐方法剖析请参阅 [OAuth 登录流程]({{< relref "./coding-oauth.md" >}})。

## 文件:credentials.py

本文件实现 Tau 在本地家目录下基于 JSON 文件的凭证存储。它定义了两类凭证的 dataclass（`OAuthCredential`、`ApiKeyCredential`）、一个可注入的存储抽象（`CredentialStore` 的对应实现 `FileCredentialStore`）、内存型实现，以及一批模块级序列化/校验辅助函数。凭证统一持久化到 `credentials.json`（由 `credentials_path()` 决定），而不是 provider 配置所用的 `providers.json`。为什么要把这两者分开？`providers.json` 存放的是可共享的静态配置（如 base URL、模型列表），可以放心提交到版本控制；而 `credentials.json` 存放的是密钥，一旦泄漏就是安全事件。分离让配置可以安全同步，而密钥保持私有。

### CredentialStoreError

#### CredentialStoreError(ValueError)
异常类,继承 `ValueError`,用于表示凭证的读取或写入失败(空值、类型错误、JSON 结构异常等)。本身无额外字段或方法,仅作为语义化异常类型。

### OAuthCredential

#### 类字段说明(dataclass, frozen=True, slots=True)
可刷新的 OAuth 凭证,持久化在 Tau 家目录下。
- `access: str` —— OAuth 访问令牌(access token),实际请求 API 时使用。
- `refresh: str` —— 刷新令牌(refresh token),用于在无交互情况下续期。
- `expires: int` —— 访问令牌的过期时间戳,毫秒精度(与 `oauth.py` 中 `TOKEN_REFRESH_SKEW_MS` 配合使用)。
- `account_id: str | None = None` —— 账户标识,可选。保持可选是为了让旧的 OpenAI Codex 凭证无需改动即可加载;device-code 类 provider 只持久化其真实收到的元数据。
- `metadata: dict[str, JSONValue] = field(default_factory=dict)` —— provider 专属的非机密值(如 GitHub 的 enterprise domain)。

#### to_json(self) -> dict[str, JSONValue]
将本 OAuth 凭证序列化为 JSON 兼容 dict。先放入固定字段 `type="oauth"`、`access`、`refresh`、`expires`;当 `account_id` 非 None 时追加;当 `metadata` 非空时追加(拷贝一份)。返回结果被 `_save` 写入磁盘。

### ApiKeyCredential

#### 类字段说明(dataclass, frozen=True, slots=True)
基于 API key 的凭证。
- `key: str` —— 明文 API key 字符串。

#### to_json(self) -> dict[str, JSONValue]
返回 `{"type": "api_key", "key": self.key}`,供 `_save` 持久化。

### 类型别名

- `StoredCredential = str | ApiKeyCredential | OAuthCredential` —— 存储层允许的三类值:历史遗留的纯字符串 key、API key 对象、OAuth 对象。
- `StoredCredentialKind = Literal["api_key", "oauth"]` —— 凭证种类的字面量类型,用于校验函数。

### FileCredentialStore

#### __init__(self, path: Path | None = None) -> None
构造方法。`path` 若提供则直接使用,否则调用 `credentials_path()`(默认 `TauPaths().home / "credentials.json"`)作为存储文件位置。

#### get(self, name: str) -> str | None
按名字返回已存储的 API-key 凭证值。从 `_load()` 取数据;若是 `str` 直接返回;若是 `ApiKeyCredential` 返回其 `.key`;否则(如 OAuth 对象)返回 `None`。注意:此方法只面向 API key,不返回 OAuth 内容。

#### set(self, name: str, value: str) -> None
按名字存储一个 API-key 凭证(纯字符串形式)。先用 `_validate_credential_name` 校验并归一化名字;`value.strip()` 后若为空则抛 `CredentialStoreError`;随后 `_load()` 当前数据、放入 `data[name] = value`、调用 `_save` 写盘。

#### set_api_key(self, name: str, value: str) -> None
与 `set` 等价,只是语义更清晰的别名,内部直接委托给 `self.set(name, value)`。

#### get_oauth(self, name: str) -> OAuthCredential | None
按名字返回已存储的 OAuth 凭证。从 `_load()` 取数据,若该项为 `OAuthCredential` 则返回,否则返回 `None`。

#### set_oauth(self, name: str, credential: OAuthCredential) -> None
存储可刷新的 OAuth 凭证。先 `_validate_credential_name` 归一化名字;`_validate_oauth_credential` 校验凭证完整性;然后 `_load()`、`data[name] = credential`、`_save` 写盘。

#### delete(self, name: str) -> None
删除指定名字的凭证。`_load()` 后 `data.pop(name, None)`(不存在也不报错),再 `_save` 写盘。

#### _load(self) -> dict[str, StoredCredential]
私有方法,加载并解析整个凭证文件。若文件不存在返回空 dict;否则读取文本 `loads` 成 JSON,若非 dict 抛 `CredentialStoreError("Tau credentials must be a JSON object")`;逐键校验 key 必须为 str,再对每值调用 `_credential_from_json` 反序列化成 `StoredCredential`,最终得到 `dict[str, StoredCredential]`。

#### _save(self, data: dict[str, StoredCredential]) -> None
私有方法,原子写盘。步骤:
1. `self.path.parent.mkdir(parents=True, exist_ok=True)` 确保父目录存在。
2. 把所有值通过 `_credential_to_json` 转成可序列化形式,`dumps(raw, indent=2, sort_keys=True) + "\n"` 生成带缩进、按 key 排序的内容。
3. 用 `NamedTemporaryFile`(同目录、前缀 `.{name}.`、不自动删除)写临时文件,写入后立即 `chmod(0o600)`(仅属主可读写)。
4. `temporary_path.replace(self.path)` 原子替换目标文件,替换后再 `self.path.chmod(0o600)` 确保权限。
5. `finally` 中若临时文件残留则 `unlink` 清理(替换成功后该文件已不存在,此步幂等)。
该实现保证了写盘要么成功要么旧文件保留(无半写状态),且文件权限限定为 600——属于明文存储策略(本文件不做加密,仅依赖文件权限保护)。

### credentials_path(paths: TauPaths | None = None) -> Path

模块级函数,返回 Tau 的本地 provider 凭证路径:`(paths or TauPaths()).home / "credentials.json"`。这是 `FileCredentialStore` 默认落盘位置,也是凭证与 `providers.json` 分离的关键。

### _validate_credential_name(name: str) -> str

模块级函数,归一化并校验凭证名:`name.strip()`,若为空抛 `CredentialStoreError("Credential name must not be empty")`,否则返回归一化后的名字。

### _validate_oauth_credential(credential: OAuthCredential) -> None

模块级函数,校验 OAuth 凭证:
- `access` 去空白后非空,否则报错。
- `refresh` 去空白后非空,否则报错。
- 若 `account_id` 非 None 则必须非空字符串,否则报错。
- `expires <= 0` 报错(必须为正)。
- 最后调用 `_validate_oauth_metadata` 校验 `metadata`。

### _credential_from_json(value: object) -> StoredCredential

模块级函数,把 JSON 值反序列化成 `StoredCredential`:
- 若为 `str`,直接作为遗留字符串 key 返回。
- 若非 dict,抛错(凭证值必须是字符串或对象)。
- 读取 `type` 字段,不在 `{"api_key","oauth"}` 中则抛错。
- `api_key`:取 `key` 字段(`_string_field`),返回 `ApiKeyCredential(key=key)`。
- `oauth`:校验 `expires` 为正整数(拒绝 bool 与 <=0);校验 `account_id`(若非 None 须非空字符串);`metadata` 须为 dict(默认 `{}`),并 `_validate_oauth_metadata`;最后用 `_string_field` 取 `access`/`refresh`,构造 `OAuthCredential`(metadata 拷贝一份)。

### _credential_to_json(value: StoredCredential) -> str | dict[str, JSONValue]

模块级函数,序列化:若为 `str` 原样返回;否则调用 `value.to_json()`(即 `ApiKeyCredential`/`OAuthCredential` 的方法)。

### _validate_oauth_metadata(metadata: dict[Any, Any]) -> None

模块级函数,校验 metadata:每个 key 必须是非空字符串,每个 value 必须是 JSON 值(通过 `_is_json_value`);否则抛 `CredentialStoreError`。

### _is_json_value(value: object) -> bool

模块级函数,递归判断 value 是否为合法 JSON 值:`None`/`str`/`bool`/`int`/`float` 为 True;list 则要求所有元素为真;dict 则要求所有 key 为 str 且值递归为真;其余返回 False。

### _string_field(value: dict[Any, Any], field_name: str, credential_type: StoredCredentialKind) -> str

模块级函数,从 dict 中取必填字符串字段:`value.get(field_name)`,若非非空字符串则抛 `CredentialStoreError(f"Tau {credential_type} credential field must be a non-empty string: {field_name}")`,否则 `.strip()` 返回。

> **OAuth 文件的逐方法剖析**已移至 [OAuth 登录流程]({{< relref "./coding-oauth.md" >}})，
> 涵盖 `oauth_types.py`、`oauth_registry.py`、`oauth_device.py`、`oauth.py`、
> `oauth_anthropic.py`、`oauth_github_copilot.py` 的全部类型与方法。

---


## 串联：凭证持久化、OAuth 无缝续期、registry 与 provider_runtime 的衔接

1. **持久化到 `credentials.json` 而非 `providers.json`**：所有具体 flow（`AnthropicOAuthProvider`/`GitHubCopilotOAuthProvider`/`OpenAICodexOAuthProvider`）登录成功后返回 `OAuthCredential`，调用方（CLI/TUI）通过 `FileCredentialStore.set_oauth(provider.id, credential)` 写入。默认路径由 `credentials_path()` 决定为 `TauPaths().home / "credentials.json"`，与 provider 静态配置 `providers.json` 完全隔离。为什么这样做？因为 `providers.json` 是"配置"——base URL、模型列表、client id 等可共享、可版本化、可手编的值；而令牌与 API key 是"密钥"，泄漏即等于账户失陷。把两者拆成独立文件，使得配置可以自由提交/同步、被多人引用，而密钥文件保持 `0o600` 私有、可 git-ignore、不会随配置扩散。`_save` 用临时文件 + 原子 `replace` + `chmod 0o600` 保证落盘安全，但内容为明文（仅依赖文件权限）。

2. **OAuth 无缝续期**:每个 provider 的 `refresh(credential)` 都先看 `oauth_credential_is_expired`(带 `TOKEN_REFRESH_SKEW_MS`/`ANTHROPIC_TOKEN_SKEW_MS`/`GITHUB_COPILOT_TOKEN_SKEW_MS` 提前量),未过期直接返回原凭证(零开销);过期时:
   - Codex/Anthropic 用 refresh token 调令牌端点换新 access 且通常在响应中更新 refresh token;
   - GitHub Copilot 则复用长期 GitHub token 反复调 `/copilot_internal/v2/token` 换新短寿命 Copilot access,refresh 字段保持为 GitHub token。
   续期结果同样经 `FileCredentialStore.set_oauth` 写回 `credentials.json`,对上层调用透明。

3. **`oauth_registry` 把 provider id 映射到具体 flow**:`oauth_registry.py` 在导入时构建 `id → provider 实例` 的 `_registry`。`provider_runtime.py` 可用 `get_oauth_provider(provider_id)` 取到实现了 `OAuthProvider` Protocol 的实例,进而调用其 `runtime_auth(credential)` 把磁盘上的 `OAuthCredential` 转换为 `OAuthRuntimeAuth`(api_key / base_url / headers),交给底层 HTTP 客户端使用;在凭证临近过期时调用 `refresh` 续期后再 `runtime_auth`,从而与运行时鉴权(`runtime_auth`)形成闭环衔接。

---

<!-- NAV -->
[← tau_coding · 扩展系统]({{< relref "./coding-extensions.md" >}})
[↑ 总览]({{< relref "./source-walkthrough.md" >}})
[→ tau_coding · OAuth 登录流程]({{< relref "./coding-oauth.md" >}})
