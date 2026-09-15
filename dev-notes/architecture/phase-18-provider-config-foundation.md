---
title: "Phase 18: Provider Configuration Foundation / 阶段 18:Provider 配置基础"
---

[原文]
This phase starts Tau's durable provider configuration work without adding an
extension system.

[译文]
本阶段启动了 Tau 的持久化 provider 配置工作,但没有引入扩展系统。

[原文]
The implementation lives in:

[译文]
实现位于:

```text
src/tau_coding/provider_config.py
src/tau_coding/cli.py
src/tau_coding/tui/app.py
src/tau_coding/commands.py
src/tau_coding/session.py
```

## 新增了什么(What was added)

[原文]
Tau now has a provider settings model under `tau_coding`:

[译文]
Tau 现在在 `tau_coding` 下有了 provider 设置模型:

```python
ProviderSettings
OpenAICompatibleProviderConfig
ProviderSelection
```

[原文]
Settings are stored at:

[译文]
设置存放在:

```text
~/.tau/providers.json
```

[原文]
If that file does not exist, Tau uses an OpenAI-compatible default:

[译文]
如果该文件不存在,Tau 使用一个 OpenAI 兼容的默认值:

```text
provider: openai
model: gpt-4.1-mini
api key env var: OPENAI_API_KEY
base URL env var: OPENAI_BASE_URL
timeout env var: OPENAI_TIMEOUT_SECONDS
retry env vars: OPENAI_MAX_RETRIES, OPENAI_MAX_RETRY_DELAY_SECONDS
```

[原文]
API keys are not stored in the config file. Built-in providers use
`credential_name` to read keys from `~/.tau/credentials.json`; custom providers
without a credential name read the environment variable named by `api_key_env`.

[译文]
API key 不存放在配置文件中。内置 provider 使用 `credential_name` 从 `~/.tau/credentials.json` 读取密钥;没有 credential name 的自定义 provider 则读取由 `api_key_env` 指定的环境变量。

## 配置示例(Example config)

```json
{
  "default_provider": "local",
  "providers": [
    {
      "name": "local",
      "type": "openai-compatible",
      "base_url": "http://localhost:11434/v1",
      "api_key_env": "LOCAL_API_KEY",
      "models": ["qwen", "llama"],
      "default_model": "qwen",
      "timeout_seconds": 120,
      "max_retries": 2,
      "max_retry_delay_seconds": 0.5
    }
  ]
}
```

## 运行时解析(Runtime resolution)

[原文]
Print mode and TUI startup now resolve provider/model selection from durable
settings:

[译文]
Print 模式与 TUI 启动现在从持久化设置中解析 provider/模型选择:

```text
tau --provider local --model qwen
tau -p "review this" --provider local
```

[原文]
When `--model` is omitted, Tau uses the configured provider's default model.
When `--provider` is omitted, Tau uses `default_provider`.

[译文]
省略 `--model` 时,Tau 使用已配置 provider 的默认模型。省略 `--provider` 时,Tau 使用 `default_provider`。

## CLI 命令(CLI commands)

[原文]
Tau can list configured providers:

[译文]
Tau 可以列出已配置的 provider:

```text
tau providers
```

[原文]
Tau can also create or update an OpenAI-compatible provider entry:

[译文]
Tau 也可以创建或更新一个 OpenAI 兼容 provider 条目:

```text
tau --provider local \
  --base-url http://localhost:11434/v1 \
  --api-key-env LOCAL_API_KEY \
  --timeout-seconds 120 \
  --max-retries 2 \
  --max-retry-delay-seconds 0.5 \
  --model qwen \
  setup
```

[原文]
The setup options are top-level options before the `setup` command word. This
preserves the Pi-style `tau "prompt"` form for starting the TUI with an initial
prompt while still adding a lightweight setup flow. Setup writes provider
metadata only; for custom providers it warns if the named API key environment
variable is not currently set.

[译文]
这些 setup 选项是位于 `setup` 命令词之前的顶层选项。这既保留了 Pi 风格的 `tau "prompt"` 形式(用初始提示启动 TUI),又加入了一条轻量的 setup 流程。Setup 只写入 provider 元数据;对于自定义 provider,如果其指定的 API key 环境变量当前未设置,它会给出警告。

[原文]
Provider HTTP timeouts are configurable through `timeout_seconds` in
`~/.tau/providers.json`. The default OpenAI-compatible provider can also read
`OPENAI_TIMEOUT_SECONDS`. The configured value is passed to the HTTPX streaming
client instead of keeping timeout behavior hardcoded in the provider adapter.

[译文]
Provider 的 HTTP 超时可通过 `~/.tau/providers.json` 中的 `timeout_seconds` 配置。默认的 OpenAI 兼容 provider 还可以读取 `OPENAI_TIMEOUT_SECONDS`。配置的值会传给 HTTPX 流式客户端,而不是把超时行为硬编码在 provider 适配器里。

[原文]
Transient retry behavior is configurable through `max_retries` and
`max_retry_delay_seconds`, or through `OPENAI_MAX_RETRIES` and
`OPENAI_MAX_RETRY_DELAY_SECONDS` for the default provider. Tau retries transient
HTTP statuses such as 429 and 5xx responses, plus HTTP transport errors before
any partial stream content has been emitted.

[译文]
瞬时故障的重试行为可通过 `max_retries` 与 `max_retry_delay_seconds` 配置,默认 provider 也可通过 `OPENAI_MAX_RETRIES` 与 `OPENAI_MAX_RETRY_DELAY_SECONDS` 配置。Tau 会重试 429、5xx 等瞬时 HTTP 状态,以及在任何部分流内容发出之前的 HTTP 传输错误。

## 斜杠命令(Slash commands)

[原文]
Slash commands expose the active model configuration:

[译文]
斜杠命令用于查看与调整当前模型配置:

```text
/model
/model <name>
/login
```

[原文]
`/model <name>` switches the active model for future turns in the running
process when the model is known for the active provider.

[译文]
当某个模型在当前 provider 中是已知的,`/model <name>` 会为运行中进程的后续轮次切换活动模型。

[原文]
In the TUI, `/model` opens an interactive picker. The picker can include models
from every configured provider, so selecting a model can switch the active
provider behind the scenes. The model command refreshes provider settings before
validating or showing choices. `/login` is the TUI path for adding or refreshing
a built-in provider, and it refreshes provider settings after credentials are
saved.

[译文]
在 TUI 中,`/model` 会打开一个交互式选择器。该选择器可以包含所有已配置 provider 的模型,因此选择某个模型可能在后台切换活动 provider。model 命令会在校验或展示选项之前刷新 provider 设置。`/login` 是 TUI 中用于添加或刷新内置 provider 的路径,它会在凭据保存后刷新 provider 设置。

[原文]
The same provider settings file can also store scoped models:

[译文]
同一个 provider 设置文件还可以保存「范围模型」(scoped models):

```json
{
  "scoped_models": [
    {"provider": "openai", "model": "gpt-5.5"},
    {"provider": "local", "model": "qwen"}
  ]
}
```

[原文]
Tau treats these as TUI favorites. The coding session filters the stored list
against currently usable providers before exposing it, so stale entries remain
harmless in the JSON file. This mirrors Pi's scoped-model idea while keeping the
durable config in `tau_coding` and the reusable harness unaware of provider
settings.

[译文]
Tau 把它们视为 TUI 收藏项。编码会话在暴露该列表之前,会按当前可用的 provider 过滤存储的列表,因此陈旧的条目留在 JSON 文件里也无害。这既镜像了 Pi 的 scoped-model 思路,又让持久化配置留在 `tau_coding`,并让可复用的 harness 对 provider 设置一无所知。

## 边界(Boundary)

[原文]
Provider settings belong to `tau_coding`, not `tau_agent`.

[译文]
Provider 设置属于 `tau_coding`,而不是 `tau_agent`。

[原文]
The reusable harness still receives only a ready `ModelProvider` and a model
name. It does not know about Tau home, JSON config files, credentials,
environment variables, or CLI/TUI setup behavior.

[译文]
可复用的 harness 仍然只接收一个就绪的 `ModelProvider` 与一个模型名。它不了解 Tau 主目录、JSON 配置文件、凭据、环境变量或 CLI/TUI 的 setup 行为。

## 限制(Limitations)

[原文]
Phase 18 intentionally kept setup minimal. Provider metadata was edited through
the CLI setup command, not an interactive TUI form. Later login work added
`~/.tau/credentials.json` for built-in provider API keys; custom providers still
use environment variables until Tau has a custom-provider credential form.

[译文]
阶段 18 有意把 setup 保持得最小。Provider 元数据通过 CLI 的 setup 命令编辑,而不是交互式 TUI 表单。后续的登录工作为内置 provider 的 API key 增加了 `~/.tau/credentials.json`;在 Tau 提供自定义 provider 凭据表单之前,自定义 provider 仍然使用环境变量。

## 测试(Tests)

[原文]
The phase is covered by:

[译文]
本阶段的测试覆盖为:

```text
tests/test_provider_config.py
tests/test_cli.py
tests/test_commands.py
tests/test_tui_app.py
```

[原文]
The tests verify:

- missing config falls back to OpenAI-compatible defaults
- provider settings round-trip through `~/.tau/providers.json`
- provider setup and listing CLI behavior
- provider HTTP timeout and retry parsing plus runtime config forwarding
- default provider/model selection
- configured API key environment variables and stored credentials
- CLI provider/model forwarding
- TUI startup selection
- `/login` and `/model` command behavior

[译文]
测试验证:

- 缺少配置时回退到 OpenAI 兼容默认值
- provider 设置经由 `~/.tau/providers.json` 的双向读写
- provider setup 与列举的 CLI 行为
- provider HTTP 超时与重试参数的解析,以及运行时配置的转发
- 默认 provider/模型选择
- 已配置的 API key 环境变量与已存储的凭据
- CLI 对 provider/模型的转发
- TUI 启动时的选择
- `/login` 与 `/model` 的命令行为
