# Provider/模型安全与 HTTP 错误详情 / Provider/model safety and HTTP error details

[原文]
Issue #226 overlaps with the provider/model mismatch fixed by PR #249: `/tree`
navigation now preserves the active runtime model instead of replaying only the
historical model from the selected branch. This note documents the additional
hardening added afterward.

[译文]
Issue #226 与 PR #249 修复的 provider/模型不匹配问题有所重叠:`/tree` 导航现在会保留活动的运行时模型,而不再只重放所选分支上的历史模型。本文记录此后追加的额外加固。

## 变更内容(What changed)

[原文]
- Provider/model selection now validates that the selected model is declared by
  the chosen provider before print mode, TUI startup, model switching, provider
  refresh, or runtime provider construction proceeds.
- Sessions with older persisted `model_change` entries that no longer match the
  active provider fall back to the current provider's configured default instead
  of creating a mismatched runtime provider.
- TUI resume heuristics only infer a provider from a saved model when that
  provider is currently usable, so an unavailable provider with the same model
  name cannot win accidentally.
- OpenAI-compatible, OpenAI Codex, and Anthropic HTTP errors now share a helper
  that extracts useful provider error details from JSON bodies and includes the
  HTTP status and selected model in the user-visible provider error message.

[译文]
- Provider/模型选择现在会在 print 模式、TUI 启动、模型切换、provider 刷新或运行时 provider 构建之前,校验所选模型确实由所选 provider 声明。
- 对于持久化了旧 `model_change` 条目、且该条目已不再匹配活动 provider 的会话,现在会回退到当前 provider 配置的默认值,而不是创建一个不匹配的运行时 provider。
- TUI 的恢复启发式只在某个 provider 当前可用时,才根据已保存的模型推断该 provider;因此一个名字相同但不可用的 provider 不会意外胜出。
- OpenAI 兼容、OpenAI Codex 与 Anthropic 的 HTTP 错误现在共享一个辅助函数:从 JSON 响应体中提取有用的 provider 错误详情,并在用户可见的 provider 错误消息中包含 HTTP 状态与所选模型。

## 为什么需要它(Why it exists)

[原文]
Tau's provider catalog is intentionally provider-specific: the `openai` API key
provider and the `openai-codex` subscription provider are separate transports and
may not support the same models. Validating the model against the active provider
turns invalid combinations into immediate, actionable configuration errors.

[译文]
Tau 的 provider 目录有意按 provider 区分:`openai` API key provider 与 `openai-codex` 订阅 provider 是两条不同的传输通道,可能不支持相同的模型。针对活动 provider 校验模型,可以把无效组合立刻变成可操作的配置错误。

[原文]
The shared HTTP error formatter keeps production failures debuggable when a
provider rejects a request for account, model availability, request shape, or
other validation reasons. The coding-session diagnostic log already records the
provider name, model, status, and safe response body for non-recoverable provider
errors.

[译文]
当 provider 因账号、模型可用性、请求形态或其他校验原因拒绝请求时,共享的 HTTP 错误格式化器让生产环境中的失败保持可调试。编码会话的诊断日志已经会为不可恢复的 provider 错误记录 provider 名称、模型、状态码与安全的响应体。

## 如何测试(How to test)

```bash
uv run pytest tests/test_provider_config.py tests/test_provider_runtime.py \
  tests/test_tau_ai.py tests/test_coding_session.py tests/test_tui_app.py
```

[原文]
Run the full suite before merging:

[译文]
合并前运行完整测试套件:

```bash
uv run ruff check
uv run pytest
```
