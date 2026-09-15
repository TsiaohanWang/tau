# 启动时的 thinking 等级回退 / Startup thinking-level fallback

## 问题(Problem)

[原文]
Launching `tau` with a remembered default model that does not support the
global default thinking level crashed before the TUI could open:

[译文]
当记住的默认模型不支持全局默认 thinking 等级时,启动 `tau` 会在 TUI 打开之前崩溃:

```text
Invalid value: Thinking mode medium is not available for kimi-code:k3.
Available modes: xhigh
```

[原文]
Root cause: both startup paths — `run_tui_app` (`tui/app.py`) and
`run_openai_print_mode` (`cli.py`) — hardcoded
`thinking_level=DEFAULT_THINKING_LEVEL` (`"medium"`) when constructing the
runtime provider. `create_model_provider` treats that value as an explicit user
choice and raises `ProviderConfigError` when the model does not support it. The
session layer's existing coercion (`_coerced_thinking_level`, used when
switching models mid-session) never got a chance to run because startup died
first.

[译文]
根因:两条启动路径 —— `run_tui_app`(`tui/app.py`)与 `run_openai_print_mode`(`cli.py`)—— 在构建运行时 provider 时都硬编码了 `thinking_level=DEFAULT_THINKING_LEVEL`(`"medium"`)。`create_model_provider` 把该值视为显式的用户选择,并在模型不支持它时抛出 `ProviderConfigError`。会话层既有的强制转换(`_coerced_thinking_level`,在会话中途切换模型时使用)根本没机会运行,因为启动先一步挂掉了。

## 修复(Fix)

[原文]
New helper `resolve_startup_thinking_level(provider, model, *, preferred)` in
`provider_config.py` picks a valid level for the selected model with the same
precedence as mid-session model switches:

[译文]
`provider_config.py` 中新增的辅助函数 `resolve_startup_thinking_level(provider, model, *, preferred)` 会为所选模型挑选一个合法等级,优先级与会话中途切换模型相同:

[原文]
1. remembered per-model preference (`provider.thinking_defaults[model]`)
2. the global preferred level (`medium`)
3. the provider/catalog default (`provider.thinking_default`)
4. the first available level

[译文]
1. 记住的按模型偏好(`provider.thinking_defaults[model]`)
2. 全局偏好等级(`medium`)
3. provider/目录默认值(`provider.thinking_default`)
4. 第一个可用等级

[原文]
It returns `None` when the model has no configurable thinking levels (which
disables the thinking parameter entirely).

[译文]
当模型没有可配置的 thinking 等级时,它返回 `None`(这会完全禁用 thinking 参数)。

[原文]
Both startup call sites now pass the resolved level instead of the raw global
default. Explicit in-session choices (`/think xhigh`, the thinking picker, or
cycling with Shift+Tab) still validate strictly and show an error listing the
available modes — the fallback only applies to the implicit startup default.

[译文]
两个启动调用点现在都传入解析后的等级,而不是原始的全局默认值。会话内的显式选择(`/think xhigh`、thinking 选择器,或用 Shift+Tab 循环)仍然严格校验,并给出列出可用模式的错误 —— 回退只适用于隐式的启动默认值。

## 与 Pi 设计的对应(Mapping to Pi's design)

[原文]
Pi treats thinking-level capability as model-scoped data and never lets an
unsupported implicit default abort the session; Tau now follows the same rule
at startup by resolving the level from the model metadata
(`thinking_level_map` / `unsupported_thinking_levels`) instead of assuming the
global default fits every model.

[译文]
Pi 把 thinking 等级能力视为按模型限定的数据,绝不让不受支持的隐式默认值中止会话;Tau 现在在启动时遵循同样的规则:从模型元数据(`thinking_level_map` / `unsupported_thinking_levels`)解析等级,而不是假定全局默认值适合每个模型。

## 验证(Verify)

```bash
uv run pytest tests/test_provider_config.py tests/test_provider_runtime.py
uv run ruff check src/tau_coding tests
```

[原文]
Manual check with a remembered `kimi-code:k3` default: `tau` and
`tau --print '...'` both open with thinking level `xhigh` (sent to the API as
`max`) instead of erroring out.

[译文]
用记住的 `kimi-code:k3` 默认值做手动检查:`tau` 与 `tau --print '...'` 都应以 thinking 等级 `xhigh` 打开(发送给 API 时是 `max`),而不是报错退出。
