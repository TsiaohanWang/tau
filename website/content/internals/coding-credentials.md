---
title: tau_coding · 凭证存储
description: credentials.py
code_files:
  - tau_coding/credentials.py
---

## 1. `credentials.py` — 凭证存储

本模块是关于 *Tau 如何持久化认证资料* 的唯一事实来源。它定义了两个冻结的凭证 dataclass 以及一个基于 JSON 的小型存储。密钥存放在 `<Tau home>/credentials.json` 中,绝不放在 `providers.json`。

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

## 逐方法深度剖析（credentials / oauth 全部）

> 以下为 `credentials.py` 与所有 `oauth*.py` 各顶层类型与方法的逐方法展开，是对上方概述的细化补充。

## 文件:credentials.py

本文件实现 Tau 在本地家目录下基于 JSON 文件的凭证存储。它定义了两类凭证的 dataclass(`OAuthCredential`、`ApiKeyCredential`)、一个可注入的存储抽象(`CredentialStore` 的对应实现 `FileCredentialStore`)、内存型实现,以及一批模块级序列化/校验辅助函数。凭证统一持久化到 `credentials.json`(由 `credentials_path()` 决定),而不是 provider 配置所用的 `providers.json`。(`providers.json` 仅含可共享、可版本化的静态配置,如 base URL、模型列表、client id;`credentials.json` 含访问/刷新令牌与 API key 这类机密,按 `0o600` 权限落盘且不随配置同步——这是"配置"与"密钥"两个安全边界的拆分,合并为单一文件会把每次编辑配置都变成一次密钥处理操作,扩大泄漏面。)

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

---

## 文件:oauth_types.py

本文件定义 provider 无关的 OAuth 契约:若干传递数据的 dataclass、回调类型别名、`OAuthLoginCallbacks` 聚合、描述 provider 行为的 `OAuthProvider` Protocol,以及一个 metadata 取值辅助函数。它是 `oauth_registry` 与具体 flow 类之间的公共接口层。

### OAuthFlowKind

类型别名 `Literal["browser", "device_code"]`,表示两种交互式登录家族:浏览器授权码流、设备码流。

### OAuthAuthInfo

#### 类字段说明(dataclass, frozen=True, slots=True)
浏览器流返回给前端的授权信息。
- `url: str` —— 需要用户在浏览器中打开的授权 URL。
- `instructions: str | None = None` —— 可选提示文案(例如"浏览器应自动打开")。

### OAuthDeviceCodeInfo

#### 类字段说明(dataclass, frozen=True, slots=True)
设备授权请求返回给用户的展示值(RFC 8628)。
- `user_code: str` —— 用户需在设备上输入的验证码。
- `verification_uri: str` —— 用户访问以输入验证码的 URI。
- `interval_seconds: float | None = None` —— 建议轮询间隔(秒)。
- `expires_in_seconds: float | None = None` —— 设备码过期时长(秒)。

### OAuthPrompt

#### 类字段说明(dataclass, frozen=True, slots=True)
provider 在登录前/中向用户请求文本输入。
- `message: str` —— 提示语。
- `placeholder: str | None = None` —— 可选输入占位符。
- `allow_empty: bool = False` —— 是否允许空输入。

### OAuthSelectOption

#### 类字段说明(dataclass, frozen=True, slots=True)
选择提示中的一项。
- `id: str` —— 选项标识。
- `label: str` —— 用户可见标签。

### OAuthSelectPrompt

#### 类字段说明(dataclass, frozen=True, slots=True)
provider 请求用户做选择的输入。
- `message: str` —— 提示语。
- `options: tuple[OAuthSelectOption, ...]` —— 可选项目元组。

### OAuthRuntimeAuth

#### 类字段说明(dataclass, frozen=True, slots=True)
由已存储 OAuth 凭证派生出的运行时请求鉴权信息,供 `provider_runtime.py` 的 `runtime_auth` 衔接使用。
- `api_key: str` —— 实际用作承载令牌的字符串(通常是 access token)。
- `base_url: str | None = None` —— 可选 API base URL(如 GitHub Copilot 由 token 解析出的代理地址)。
- `headers: Mapping[str, str] | None = None` —— 可选附加请求头(如 Anthropic 的 `anthropic-beta`)。

### 回调类型别名

- `AuthCallback = Callable[[OAuthAuthInfo], None]` —— 收到授权 URL 时调用。
- `DeviceCodeCallback = Callable[[OAuthDeviceCodeInfo], None]` —— 收到设备码时调用。
- `PromptCallback = Callable[[OAuthPrompt], Awaitable[str]]` —— 向用户请求文本输入,异步返回字符串。
- `SelectCallback = Callable[[OAuthSelectPrompt], Awaitable[str | None]]` —— 向用户请求选择,异步返回选项 id 或 None。
- `ManualCodeCallback = Callable[[], Awaitable[str]]` —— 请求用户手动粘贴授权码/重定向 URL。
- `ProgressCallback = Callable[[str], None]` —— 进度消息回调。

### OAuthLoginCallbacks

#### 类字段说明(dataclass, frozen=True, slots=True)
登录流可用的、与前端无关的回调集合。
- `on_auth: AuthCallback` —— 授权信息回调(必需)。
- `on_device_code: DeviceCodeCallback` —— 设备码回调(必需)。
- `on_prompt: PromptCallback` —— 文本输入回调(必需)。
- `on_select: SelectCallback` —— 选择回调(必需)。
- `on_progress: ProgressCallback | None = None` —— 进度回调(可选)。
- `on_manual_code_input: ManualCodeCallback | None = None` —— 手动输入回调(可选)。
- `method: OAuthFlowKind | None = None` —— 当前使用的登录流种类(可选)。

### OAuthProvider(Protocol)

描述注册到 Tau 的 provider 专属 OAuth 行为(结构化子协议)。实现类须提供:
- `id` property —— 稳定的 provider/credential 标识。
- `name` property —— 用户可见 provider 名。
- `flow_kinds` property —— 该 provider 支持的 `OAuthFlowKind` 序列。
- `async login(callbacks: OAuthLoginCallbacks) -> OAuthCredential` —— 完成登录并返回待持久化的凭证。
- `async refresh(credential: OAuthCredential) -> OAuthCredential` —— 刷新过期凭证。
- `runtime_auth(credential: OAuthCredential) -> OAuthRuntimeAuth` —— 把存储的凭证转换为请求鉴权信息(衔接 `provider_runtime.py`)。

### oauth_metadata_string(metadata: Mapping[str, JSONValue], name: str) -> str | None

模块级函数,从 provider 专属 metadata 中取一个非空字符串值:`metadata.get(name)`,若是去空白后非空的字符串则返回该字符串,否则返回 None。

---

## 文件:oauth_registry.py

本文件是内置与可扩展的 OAuth provider 注册表。它把稳定的 provider id(如 `"anthropic"`、`"github-copilot"`、`"openai-codex"`)映射到实现了 `OAuthProvider` Protocol 的具体 flow 类实例,从而让 `provider_runtime.py` 能通过 id 取到对应 provider 并执行 `runtime_auth`/`refresh`。

### _BUILTIN_PROVIDERS

模块级常量,按注册顺序的内置 provider 元组:`(AnthropicOAuthProvider(), GitHubCopilotOAuthProvider(), OpenAICodexOAuthProvider())`。在导入时即实例化。

### _registry

模块级 dict,`{provider.id: provider for provider in _BUILTIN_PROVIDERS}`,即以 id 为键的注册表。导入时构建。

### get_oauth_provider(provider_id: str) -> OAuthProvider | None

按稳定 provider id 返回已注册的 provider 实现;不存在返回 None。是 `provider_runtime.py` 取 flow 的主入口。

### get_oauth_providers() -> tuple[OAuthProvider, ...]

返回所有已注册 provider,保持注册顺序(`tuple(_registry.values())`)。

### oauth_provider_ids() -> frozenset[str]

返回 Tau 订阅登录流所接受的 id 集合(`frozenset(_registry)`),用于校验用户输入的 provider id 是否合法。

### register_oauth_provider(provider: OAuthProvider) -> None

注册或替换一个 provider 实现。若 `provider.id.strip()` 为空则抛 `ValueError`;否则 `_registry[provider.id] = provider`(覆盖同名项)。

### unregister_oauth_provider(provider_id: str) -> None

移除自定义 provider,或恢复被替换的内置 provider:在该 id 能在 `_BUILTIN_PROVIDERS` 中找到时,恢复为内置实例;否则从 `_registry` 中弹出。

### reset_oauth_providers(providers: Iterable[OAuthProvider] = _BUILTIN_PROVIDERS) -> None

清空并重建注册表(默认恢复为内置集合),主要用于确定性扩展测试。

---

## 文件:oauth_device.py

本文件实现 RFC 8628 风格的设备授权轮询助手。核心是一个泛型轮询函数 `poll_oauth_device_code`,配合超时、退避(`slow_down`)、取消事件等机制。GitHub Copilot 的 `_poll_github_access_token` 通过构造 `poll` 闭包使用它。

### DevicePollStatus

字面量类型 `Literal["complete", "pending", "slow_down", "failed"]`,表示单次设备轮询结果状态。

### DevicePollResult[T]

#### 类字段说明(dataclass, frozen=True, slots=True, 泛型 T)
一次设备令牌轮询请求的结果。
- `status: DevicePollStatus` —— 状态。
- `value: T | None = None` —— complete 时承载取得的值(如 access token)。
- `message: str | None = None` —— failed 时的错误消息。
- `interval_seconds: float | None = None` —— slow_down 时服务器建议的新间隔。

### poll_oauth_device_code[T]

签名:
```python
async def poll_oauth_device_code[T](
    poll: Callable[[], Awaitable[DevicePollResult[T]]],
    *,
    interval_seconds: float | None = None,
    expires_in_seconds: float | None = None,
    wait_before_first_poll: bool = False,
    cancel_event: asyncio.Event | None = None,
    sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
    monotonic: Callable[[], float] = time.monotonic,
) -> T:
```
按 RFC 8628 时序轮询设备流,返回最终值 T。流程:
1. `interval = _poll_interval(interval_seconds)` 得到规范间隔。
2. `deadline = monotonic() + expires_in_seconds`(若提供,否则 `math.inf`)。
3. 若 `wait_before_first_poll` 为真,先 `_wait(min(interval, 剩余时长), cancel_event)` 再开始轮询。
4. `saw_slow_down = False` 标记是否经历过退避。
5. 循环 `while monotonic() < deadline`:每次先 `_raise_if_cancelled`;调用 `poll()`;
   - `complete`:若 `value` 为 None 抛 `OAuthError("Device flow returned no credential")`,否则返回 `value`。
   - `failed`:抛 `OAuthError(result.message or "Device authorization failed")`。
   - `slow_down`:置 `saw_slow_down=True`,并将 `interval` 更新为 `_poll_interval(result.interval_seconds)`(若服务器给了新间隔)或 `interval + 5`。
   - 计算 `remaining = deadline - monotonic()`,若 `<=0` 跳出;否则 `_wait(min(interval, remaining), cancel_event)` 等待下一轮。
6. 循环结束仍未 complete,抛 `OAuthError(f"Device flow timed out{suffix}")`,`suffix` 在曾 slow_down 时附加说明。

### _poll_interval(value: float | None) -> float

规范化轮询间隔:若 `value` 为 None、非有限值或 `<=0`,返回默认 `5`;否则返回 `max(value, 1)`(间隔下限 1 秒)。

### _wait(seconds, cancel_event, *, sleep)

异步等待 `seconds`,但可被 `cancel_event` 中断:
1. 先 `_raise_if_cancelled`。
2. `seconds <= 0` 直接返回。
3. 若无 `cancel_event`,直接 `await sleep(seconds)`。
4. 否则用 `asyncio.wait` 同时等待 `sleep_task` 与 `cancel_task`(`cancel_event.wait()`),`FIRST_COMPLETED` 返回即唤醒;取消未完成的任务。若取消事件先触发且已 set,取消 sleep 任务并抛 `OAuthError("Login cancelled")`;否则取消 `cancel_task` 并 `await sleep_task` 收尾。

### _raise_if_cancelled(cancel_event: asyncio.Event | None) -> None

若 `cancel_event` 非 None 且已 set,抛 `OAuthError("Login cancelled")`。

---

## 文件:oauth.py

本文件实现 OpenAI Codex 的授权码 + PKCE 浏览器登录流,并提供被其他 provider(Anthropic、GitHub Copilot)复用的通用工具:PKCE 生成、本地回调服务器、授权码解析、token 交换/刷新、JWT 解析、过期判断等。注意其中包含 `CodexOAuthProvider` 实际类名为 `OpenAICodexOAuthProvider`。

### 模块常量

- `OPENAI_CODEX_OAUTH_PROVIDER = "openai-codex"` —— provider id。
- `OPENAI_CODEX_CLIENT_ID` —— 固定客户端 id。
- `OPENAI_CODEX_AUTHORIZE_URL` / `OPENAI_CODEX_TOKEN_URL` —— 授权/令牌端点。
- `OPENAI_CODEX_REDIRECT_URI = "http://localhost:1455/auth/callback"` —— 本地回调地址。
- `OPENAI_CODEX_SCOPE = "openid profile email offline_access"` —— 请求 scope(含 `offline_access` 以拿到 refresh token)。
- `OPENAI_CODEX_ACCOUNT_CLAIM = "https://api.openai.com/auth"` —— access JWT 中存放账户信息的 claim。
- `OPENAI_CODEX_CALLBACK_PORT = 1455` —— 回调端口。
- `TOKEN_REFRESH_SKEW_MS = 60_000` —— 刷新提前量(提前 60 秒判定过期)。
- 类型别名 `AuthCallback`/`PromptCallback`/`ManualCodeCallback`/`ProgressCallback`(模块内局部,功能与 `oauth_types` 一致)。

### AuthorizationCode

#### 类字段说明(dataclass, frozen=True, slots=True)
解析后的授权回调数据。
- `code: str | None = None` —— 授权码。
- `state: str | None = None` —— 回调携带的 state(用于防 CSRF)。

### AuthorizationFlow

#### 类字段说明(dataclass, frozen=True, slots=True)
OpenAI Codex 授权流状态。
- `verifier: str` —— PKCE code_verifier。
- `state: str` —— 随机 state。
- `url: str` —— 完整授权 URL。

### TokenResponse

#### 类字段说明(dataclass, frozen=True, slots=True)
成功的 token 响应。
- `access: str` —— 访问令牌。
- `refresh: str` —— 刷新令牌。
- `expires: int` —— 过期时间戳(毫秒)。

### OAuthError(RuntimeError)

OAuth 流程无法完成时的异常,继承 `RuntimeError`。

### OpenAICodexOAuthProvider

#### 类属性
- `id = OPENAI_CODEX_OAUTH_PROVIDER`
- `name = "OpenAI Codex (ChatGPT subscription)"`
- `flow_kinds: tuple[OAuthFlowKind, ...] = ("browser",)`

#### async login(self, callbacks: OAuthLoginCallbacks) -> OAuthCredential
若 `callbacks.method == "device_code"` 直接抛 `OAuthError`(Codex 未实现设备码);否则委托 `login_openai_codex`,传入 `on_auth`/`on_prompt`/`on_manual_code_input`/`on_progress`。

#### async refresh(self, credential: OAuthCredential) -> OAuthCredential
若 `oauth_credential_is_expired(credential)` 为假则原样返回(未过期无需刷新);否则 `await refresh_openai_codex_token(credential.refresh)` 用 refresh token 续期。实现"无缝续期"。

#### runtime_auth(self, credential: OAuthCredential) -> OAuthRuntimeAuth
返回 `OAuthRuntimeAuth(api_key=credential.access)`(Codex 仅用 access 作为 api_key,无额外 base_url/headers)。

### _LocalOAuthServer

本地回调服务器封装(以 `ThreadingHTTPServer` + 守护线程运行,通过 `asyncio.Future` 把回调码传回异步世界)。

#### __init__(self, server, thread, future)
保存 `ThreadingHTTPServer`、工作线程、承载授权码的 `asyncio.Future[str | None]`。

#### async wait_for_code(self) -> str | None
`await self._future`,等待本地服务器收到授权码(或取消后得 None)。

#### cancel_wait(self) -> None
若 future 未完成,`set_result(None)` 解除等待而不提供 code。

#### close(self) -> None
`server.shutdown()` + `server_close()` + `thread.join(timeout=1)` 停止服务器线程。

### create_pkce_pair() -> tuple[str, str]

生成 PKCE 对:用 `secrets.token_urlsafe(64)` 生成 `verifier`;对 `verifier` 的 ASCII 编码做 SHA256,经 `_base64url` 得到 `challenge`(S256)。返回 `(verifier, challenge)`。

### create_openai_codex_authorization_flow(*, originator: str = "tau") -> AuthorizationFlow

构造 Codex 授权 URL:
1. `create_pkce_pair()` 得 verifier/challenge;`secrets.token_hex(16)` 得 state。
2. 组装参数:`response_type=code`、`client_id`、`redirect_uri`、`scope`、`code_challenge`/`code_challenge_method=S256`、`state`、以及业务参数 `id_token_add_organizations=true`、`codex_cli_simplified_flow=true`、`originator`。
3. 返回 `AuthorizationFlow(verifier, state, f"{AUTHORIZE_URL}?{urlencode(params)}")`。

### parse_authorization_input(value: str) -> AuthorizationCode

把用户粘贴/重定向的内容解析为 `AuthorizationCode`,支持四种格式:
1. 空字符串 → 返回空 `AuthorizationCode()`。
2. 含 scheme+netloc 的完整 URL → `parse_qs(query)` 取 `code`/`state`。
3. 含 `#` → 按 `#` 拆成 `code#state`。
4. 含 `code=` → 当作 query string `parse_qs` 取。
5. 其余当作原始 code 返回 `AuthorizationCode(code=stripped)`。

### oauth_credential_is_expired(credential: OAuthCredential) -> bool

返回是否应刷新:`int(time.time()*1000) >= credential.expires - TOKEN_REFRESH_SKEW_MS`。即到达过期时间前 60 秒即视为过期(提前刷新,避免用到临界点失效令牌)。

### login_openai_codex(*, on_auth, on_prompt, on_manual_code_input=None, on_progress=None, open_browser=True, originator="tau", client=None) -> OAuthCredential

运行 Codex 授权码登录:
1. 构造 `flow`;`_start_local_oauth_server(flow.state)` 起本地回调服务器。
2. 调 `on_auth(OAuthAuthInfo(url=flow.url, instructions=...))`;若 `open_browser` 则 `webbrowser.open(flow.url)`。
3. `try`:`_wait_for_authorization_code(flow, server, on_manual_code_input)` 取 code;
   - 若 `code is None`(服务器没收到,如浏览器在别机),`on_prompt` 请求用户粘贴,`parse_authorization_input` 解析并 `_validate_state` 校验 state,得 code。
   - 若仍无 code 抛 `OAuthError("Missing authorization code")`。
   - `on_progress("Exchanging authorization code...")`,`exchange_openai_codex_authorization_code(code, flow.verifier, client=client)` 换 token。
   - `account_id_from_access_token(token.access)` 取账户 id;为空则抛错。
   - 返回 `OAuthCredential(access, refresh, expires, account_id)`。
4. `finally`:`server.close()`。

### exchange_openai_codex_authorization_code(code, verifier, *, client=None) -> TokenResponse

用授权码换 token。调用 `_post_openai_codex_token`(body 含 `grant_type=authorization_code`、`client_id`、`code`、`code_verifier`、`redirect_uri`,`action="exchange"`);取必需字段 `access_token`/`refresh_token`(`_required_token_field`),构造 `TokenResponse(access, refresh, _token_expiry(raw, access_token, action="exchange"))`。

### refresh_openai_codex_token(refresh_token, *, client=None) -> OAuthCredential

刷新 Codex 凭证。调用 `_post_openai_codex_token`(body 含 `grant_type=refresh_token`、`client_id`、`refresh_token`,`action="refresh"`);取 `access_token`;新 refresh token 优先用响应里的( `_optional_token_field` 否则沿用旧值);`account_id_from_access_token` 重新解析;返回新 `OAuthCredential`。实现无缝续期,旧 refresh 失效时自动更新。

### account_id_from_access_token(access_token: str) -> str | None

从 Codex access JWT 提取 ChatGPT 账户 id:`_access_token_payload` 取 payload;读 `OPENAI_CODEX_ACCOUNT_CLAIM` 须为 dict;取 `chatgpt_account_id` 须为非空字符串,否则 None。

### _access_token_expiry(access_token: str) -> int | None

从 JWT payload 的 `exp`(秒)返回毫秒时间戳(`int(exp*1000)`),无效返回 None。

### _access_token_payload(access_token: str) -> dict[str, Any] | None

解析 JWT 第二部分:`access_token.split(".")` 须正好 3 段;对第 2 段 `_base64url_decode` 后 `loads` 成 dict;任何异常或结果非 dict 返回 None(容错,不抛异常)。

### _post_openai_codex_token(data, *, client, action) -> dict[str, Any]

POST 到 `OPENAI_CODEX_TOKEN_URL`:自行创建 client(若未传入,用完 `aclose`);`headers={"Content-Type": "application/x-www-form-urlencoded"}`,`data=data`。状态码 `>=400` 抛 `OAuthError`(含状态码与响应文本);`response.json()` 须为 dict,否则抛错;返回 raw dict。

### _required_token_field(raw, field, *, action) -> str

取响应中必需字符串字段,缺失或空抛 `OAuthError`(带 raw dump)。

### _optional_token_field(raw, field) -> str | None

取可选字符串字段,非字符串/空返回 None。

### _token_expiry(raw, access_token, *, action) -> int

计算过期时间戳(毫秒):优先用响应 `expires_in`(秒)→ `now + expires_in*1000`;否则用 `_access_token_expiry(access_token)`(从 JWT 读);都无则抛 `OAuthError`。

### _wait_for_authorization_code(*, flow, server, on_manual_code_input) -> str | None

并发等待本地服务器回调码 或 用户手动输入:
1. 若 `server` 非 None,创建 `server.wait_for_code()` 任务;若 `on_manual_code_input` 非 None,创建 `_await_manual_code` 任务。
2. `asyncio.wait(..., FIRST_COMPLETED)`;取消其余 pending 任务;`result = next(iter(done)).result()`。
3. `finally`:`server.cancel_wait()`。
4. 若 `result is None` 返回 None;否则 `parse_authorization_input(result)` 再 `_validate_state(parsed.state, flow.state)`,返回 `parsed.code`。

### _await_manual_code(callback: ManualCodeCallback) -> str | None

直接 `await callback()`(把手动输入回调包成任务)。

### _validate_state(state: str | None, expected_state: str) -> None

若 `state` 非 None 且 `!= expected_state`,抛 `OAuthError("OAuth state mismatch")`(防 CSRF)。

### _start_local_oauth_server(state, *, callback_port=OPENAI_CODEX_CALLBACK_PORT, callback_path="/auth/callback", success_message=...) -> _LocalOAuthServer | None

启动本地回调服务器:
1. `host = environ.get("TAU_OAUTH_CALLBACK_HOST", "127.0.0.1")`;`loop.create_future()` 作结果载体。
2. 定义内部 `CallbackHandler(BaseHTTPRequestHandler)`:`do_GET` 中解析 path,非 `callback_path` 返回 404;state 不匹配返回 400;缺 code 返回 400;否则返回 200 成功页,并 `loop.call_soon_threadsafe(future.set_result, code)` 把 code 送回事件循环。`log_message` 空实现(静默)。`_finish` 写 HTML 响应。
3. `ThreadingHTTPServer((host, callback_port), CallbackHandler)`;若 `OSError`(端口占用)返回 None(降级为手动输入);否则启守护线程 `serve_forever`,返回 `_LocalOAuthServer(server, thread, future)`。

### _first_query_value(params, key) -> str | None

从 `parse_qs` 结果取第一个值:`params.get(key)` 为空返回 None,否则 `values[0] or None`。

### _base64url(value: bytes) -> str

URL 安全的 base64 编码并去掉填充(`=`)。

### _base64url_decode(value: str) -> bytes

补回 `=` 填充后做 URL-safe base64 解码。

### _oauth_html(message: str) -> str

生成简单 HTML 页面,对 message 做 HTML 转义(防 XSS)后包裹为 `<p>`。

---

## 文件:oauth_anthropic.py

本文件实现 Anthropic Claude Pro/Max 的授权码 + PKCE 浏览器登录流,复用 `oauth.py` 的 `create_pkce_pair`、`_start_local_oauth_server`、`parse_authorization_input`、过期判断等。其 `runtime_auth` 会注入 `anthropic-beta` 等专属头。

### 模块常量

- `ANTHROPIC_OAUTH_PROVIDER = "anthropic"` —— provider id。
- `ANTHROPIC_CLIENT_ID` —— 固定客户端 id。
- `ANTHROPIC_AUTHORIZE_URL = "https://claude.ai/oauth/authorize"`、`ANTHROPIC_TOKEN_URL = "https://platform.claude.com/v1/oauth/token"`。
- `ANTHROPIC_REDIRECT_URI = "http://localhost:53692/callback"`(端口 53692)。
- `ANTHROPIC_SCOPE` —— 多 scope 串(含 `org:create_api_key`、`user:inference`、`user:sessions:claude_code` 等)。
- `ANTHROPIC_CALLBACK_PORT = 53692`。
- `ANTHROPIC_TOKEN_SKEW_MS = 5*60*1000` —— 5 分钟刷新提前量。

### login_anthropic(*, on_auth, on_prompt, on_manual_code_input=None, on_progress=None, open_browser=True, client=None) -> OAuthCredential

运行 Anthropic 授权码登录:
1. `create_pkce_pair()`;参数中 `code="true"`、`client_id`、`response_type=code`、`redirect_uri`、`scope`、`code_challenge`/`code_challenge_method=S256`、`state=verifier`(注意:Anthropic 用 verifier 同时作 state)。
2. 拼 URL;`_start_local_oauth_server(verifier, callback_port=53692, callback_path="/callback", success_message=...)` 起本地服务器。
3. `on_auth(OAuthAuthInfo(url, instructions=...))`;若 `open_browser` 则打开。
4. `try`:`_wait_for_input(server, on_manual_code_input)` 取输入;若 None 则 `on_prompt` 粘贴;`parse_authorization_input`;若 `parsed.state` 非 None 且 `!= verifier` 抛 state mismatch;无 code 抛错;`on_progress("Exchanging authorization code for tokens...")`;调 `_anthropic_token_request`(body 含 `grant_type=authorization_code`、`client_id`、`code`、`state`、`redirect_uri`、`code_verifier`,`action="exchange"`)。
5. `finally`:`server.close()`。

### refresh_anthropic_token(refresh_token, *, client=None) -> OAuthCredential

刷新:委托 `_anthropic_token_request`(body 含 `grant_type=refresh_token`、`client_id`、`refresh_token`,`action="refresh"`,`previous_refresh=refresh_token`)。

### _anthropic_token_request(data, *, client, action, previous_refresh=None) -> OAuthCredential

通用 token 请求(交换/刷新共用):
1. 自行创建 client(若未传入,用完关闭);POST 到 `ANTHROPIC_TOKEN_URL`,`json=data`,headers `Accept/Content-Type: application/json`。
2. 状态码 `>=400` 抛 `OAuthError`;响应须为 dict。
3. `access = _required_string(raw, "access_token", action)`;`refresh = _optional_string(raw, "refresh_token") or previous_refresh`(优先用新 refresh,否则沿用旧值);若仍无 refresh 抛错。
4. `expires_in` 须为正整数,否则抛错;构造 `OAuthCredential(access, refresh, expires=int(now*1000 + expires_in*1000 - ANTHROPIC_TOKEN_SKEW_MS))`(提前 5 分钟过期,驱动后续无缝刷新)。

### _wait_for_input(server, manual_callback) -> str | None

与 `oauth.py` 的 `_wait_for_authorization_code` 类似:并发等待 `server.wait_for_code()` 与 `_manual_value(manual_callback)`,`FIRST_COMPLETED` 取结果,`server.cancel_wait()`;与 Codex 不同,这里不显式校验 state(在调用方 `login_anthropic` 中校验)。

### _manual_value(callback) -> str

`await callback()` 包成任务。

### _required_string(raw, name, *, action) -> str

取必需字符串字段,缺失/空抛 `OAuthError`。

### _optional_string(raw, name) -> str | None

取可选字符串字段,非字符串/空返回 None。

### AnthropicOAuthProvider

#### 类属性
- `id = ANTHROPIC_OAUTH_PROVIDER`
- `name = "Anthropic (Claude Pro/Max)"`
- `flow_kinds: tuple[OAuthFlowKind, ...] = ("browser",)`

#### async login(self, callbacks) -> OAuthCredential
委托 `login_anthropic`,传入 `on_auth`/`on_prompt`/`on_manual_code_input`/`on_progress`。

#### async refresh(self, credential) -> OAuthCredential
未过期(`oauth_credential_is_expired`)则原样返回;否则 `await refresh_anthropic_token(credential.refresh)`。

#### runtime_auth(self, credential) -> OAuthRuntimeAuth
返回 `OAuthRuntimeAuth(api_key=credential.access, headers={ "Authorization": f"Bearer {access}", "anthropic-beta": "claude-code-20250219,oauth-2025-04-20", "user-agent": "claude-cli/tau", "x-app": "cli" })`。即在 api_key 之上注入 Bearer 与 Anthropic 专属 beta/标识头。

---

## 文件:oauth_github_copilot.py

本文件实现 GitHub Copilot 的 **设备码流**(RFC 8628)+ 用长寿命 GitHub token 换取短寿命 Copilot token 的刷新机制。它复用 `oauth_device.py` 的 `poll_oauth_device_code` 与 `oauth.py` 的过期判断。其 `runtime_auth` 会从 Copilot token 解析出代理 base_url。

### 模块常量

- `GITHUB_COPILOT_OAUTH_PROVIDER = "github-copilot"` —— provider id。
- `GITHUB_COPILOT_CLIENT_ID = "Iv1.b507a08c87ecfe98"`。
- `GITHUB_COPILOT_API_VERSION = "2026-06-01"`。
- `GITHUB_COPILOT_TOKEN_SKEW_MS = 5*60*1000` —— 5 分钟提前量。
- `GITHUB_COPILOT_HEADERS` —— 模拟 VS Code Copilot 插件的 UA/Editor 头(用于兼容 GitHub 端点)。

### GitHubDeviceCode

#### 类字段说明(dataclass, frozen=True, slots=True)
校验后的 GitHub 设备授权响应。
- `device_code: str` —— 设备码。
- `user_code: str` —— 用户验证码。
- `verification_uri: str` —— 验证 URI。
- `interval_seconds: float` —— 轮询间隔。
- `expires_in_seconds: float` —— 设备码有效期。

### normalize_github_domain(value: str) -> str | None

把 GitHub Enterprise URL/域名规范化为 hostname:空返回 None;`urlparse`(无 scheme 时补 `https://`);scheme 须 http/https 且有 hostname,否则 None;返回 hostname。

### github_copilot_base_url(token, enterprise_domain=None) -> str

由短寿命 Copilot token(形如 `...;proxy-ep=api.xxx;...`)解析 API 地址:若 token 含 `proxy-ep=值`,则去掉 `proxy.` 前缀得 `api.{值}` → `https://api.{值}`;否则若有 `enterprise_domain` 返回 `https://copilot-api.{domain}`;否则默认 `https://api.individual.githubcopilot.com`。用于 `runtime_auth` 提供 base_url。

### login_github_copilot(callbacks, *, client=None, cancel_event=None) -> OAuthCredential

运行 GitHub 设备流并换 Copilot 鉴权:
1. `callbacks.on_prompt(OAuthPrompt(message="GitHub Enterprise URL/domain (blank for github.com)", allow_empty=True))` 询问企业域名;若已取消抛错;`normalize_github_domain` 规范化,非法则抛错;`domain = enterprise_domain or "github.com"`。
2. 创建 client(若未传入);`_start_device_flow(domain, client)` 发起设备授权;`callbacks.on_device_code(OAuthDeviceCodeInfo(...))` 把验证码/URI/间隔/过期展示给用户。
3. `_poll_github_access_token(domain, device, client, cancel_event=cancel_event)` 轮询得到长寿命 GitHub token。
4. `on_progress("Exchanging GitHub token for Copilot access...")`;用该 GitHub token 构造临时 `OAuthCredential(access=refresh=github_token, expires=1, metadata={enterprise_domain} 或 {})`,调 `refresh_github_copilot_token` 换取 Copilot token 并返回。
5. `finally`:若自建 client 则关闭。

### refresh_github_copilot_token(credential, *, client=None) -> OAuthCredential

用长寿命 GitHub token 换短寿命 Copilot token:
1. 从 `credential.metadata` 取 `enterprise_domain`(`oauth_metadata_string`);`domain = enterprise_domain or "github.com"`。
2. GET `https://api.{domain}/copilot_internal/v2/token`,带 `Authorization: Bearer {credential.refresh}` 与 `GITHUB_COPILOT_HEADERS`。
3. `_response_object` 解析;`_required_string(raw, "token", "Copilot token")` 取 token;`expires_at` 须为数值,否则抛错。
4. 返回 `OAuthCredential(access=token, refresh=credential.refresh(沿用 GitHub token 作为长期刷新凭据), expires=int(expires_at*1000 - SKEW), account_id=credential.account_id, metadata=拷贝)`。
注意:Copilot 的"刷新"实际上是反复用同一个长期 GitHub token 去 `/copilot_internal/v2/token` 换新短寿命 token,所以 refresh 字段不变、access 每次更新——这是其无缝续期方式。

### _start_device_flow(domain, client) -> GitHubDeviceCode

发起设备授权:`POST https://{domain}/login/device/code`(body `client_id`、`scope=read:user`);`_response_object` 解析;`verification_uri` 须 http/https 且有 netloc(防不可信 URI);`interval` 默认 5、`expires_in` 必须数值;返回 `GitHubDeviceCode`。

### _poll_github_access_token(domain, device, client, *, cancel_event=None) -> str

设备令牌轮询,内部定义 `poll()` 闭包:
- `POST https://{domain}/login/oauth/access_token`(body `client_id`、`device_code`、`grant_type=urn:ietf:params:oauth:grant-type:device_code`)。
- `_response_object(..., accept_oauth_error=True)`(允许 OAuth 错误码,不按 HTTP 4xx 抛)。
- 有 `access_token` → `DevicePollResult(status="complete", value=access_token)`。
- `error == "authorization_pending"` → `pending`。
- `error == "slow_down"` → `slow_down`(带服务器给的新 `interval`)。
- 其他 error → `failed`(带 `error_description`)。
最后 `await poll_oauth_device_code(poll, interval_seconds=device.interval_seconds, expires_in_seconds=device.expires_in_seconds, wait_before_first_poll=True, cancel_event=cancel_event)` 返回取得的长寿命 GitHub token。

### _response_object(response, label, *, accept_oauth_error=False) -> dict[str, Any]

解析响应 JSON:状态 `>=400` 且非 `accept_oauth_error` 时抛 `OAuthError`;非 JSON 抛错;非 dict 抛错;返回 dict。

### _required_string(raw, name, label) -> str

取必需字符串字段,缺失/空抛 `OAuthError(f"{label} response missing {name}")`。

### GitHubCopilotOAuthProvider

#### 类属性
- `id = GITHUB_COPILOT_OAUTH_PROVIDER`
- `name = "GitHub Copilot"`
- `flow_kinds: tuple[OAuthFlowKind, ...] = ("device_code",)`

#### async login(self, callbacks) -> OAuthCredential
直接 `await login_github_copilot(callbacks)`。

#### async refresh(self, credential) -> OAuthCredential
未过期则原样返回;否则 `await refresh_github_copilot_token(credential)`。

#### runtime_auth(self, credential) -> OAuthRuntimeAuth
从 metadata 取 `enterprise_domain`;返回 `OAuthRuntimeAuth(api_key=credential.access, base_url=github_copilot_base_url(credential.access, enterprise_domain), headers=GITHUB_COPILOT_HEADERS)`。即提供动态解析的 base_url 与插件模拟头。

---

## 串联:凭证持久化、OAuth 无缝续期、registry 与 provider_runtime 的衔接

1. **持久化到 `credentials.json` 而非 `providers.json`**:所有具体 flow(`AnthropicOAuthProvider`/`GitHubCopilotOAuthProvider`/`OpenAICodexOAuthProvider`)登录成功后返回 `OAuthCredential`,调用方(CLI/TUI)通过 `FileCredentialStore.set_oauth(provider.id, credential)` 写入。默认路径由 `credentials_path()` 决定为 `TauPaths().home / "credentials.json"`,与 provider 静态配置 `providers.json` 完全隔离。**为何如此**:`providers.json` 是"配置"——base URL、模型列表、client id 等可共享、可版本化、可手编的值;而令牌与 API key 是"密钥",泄漏即等于账户失陷。把两者拆成独立文件,使得配置可自由提交/同步、被多人引用,而密钥文件保持 `0o600` 私有、可 git-ignore、不会随配置扩散。`_save` 用临时文件 + 原子 `replace` + `chmod 0o600` 保证落盘安全,但内容为明文(仅依赖文件权限)。

2. **OAuth 无缝续期**:每个 provider 的 `refresh(credential)` 都先看 `oauth_credential_is_expired`(带 `TOKEN_REFRESH_SKEW_MS`/`ANTHROPIC_TOKEN_SKEW_MS`/`GITHUB_COPILOT_TOKEN_SKEW_MS` 提前量),未过期直接返回原凭证(零开销);过期时:
   - Codex/Anthropic 用 refresh token 调令牌端点换新 access 且通常在响应中更新 refresh token;
   - GitHub Copilot 则复用长期 GitHub token 反复调 `/copilot_internal/v2/token` 换新短寿命 Copilot access,refresh 字段保持为 GitHub token。
   续期结果同样经 `FileCredentialStore.set_oauth` 写回 `credentials.json`,对上层调用透明。

3. **`oauth_registry` 把 provider id 映射到具体 flow**:`oauth_registry.py` 在导入时构建 `id → provider 实例` 的 `_registry`。`provider_runtime.py` 可用 `get_oauth_provider(provider_id)` 取到实现了 `OAuthProvider` Protocol 的实例,进而调用其 `runtime_auth(credential)` 把磁盘上的 `OAuthCredential` 转换为 `OAuthRuntimeAuth`(api_key / base_url / headers),交给底层 HTTP 客户端使用;在凭证临近过期时调用 `refresh` 续期后再 `runtime_auth`,从而与运行时鉴权(`runtime_auth`)形成闭环衔接。

---

<!-- NAV -->
[← tau_coding · TUI 界面与控件]({{< relref "./coding-tui-app.md" >}})
[↑ 总览]({{< relref "./source-walkthrough.md" >}})
[→ tau_coding · OAuth 登录流程]({{< relref "./coding-oauth.md" >}})
