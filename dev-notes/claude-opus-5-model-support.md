# Claude Opus 5 模型支持 / Claude Opus 5 model support

## 变更内容(What changed)

[原文]
Tau's direct Anthropic catalog now includes `claude-opus-5` with metadata from
Anthropic's July 24, 2026 launch documentation:

[译文]
Tau 的直连 Anthropic 目录现在包含 `claude-opus-5`,元数据来自 Anthropic 2026 年 7 月 24 日的发布文档:

[原文]
- 1,000,000-token context window
- 128,000-token maximum output
- text and image input
- $5 / million input tokens and $25 / million output tokens
- adaptive thinking with `low`, `medium`, `high`, `xhigh`, and `max` effort

[译文]
- 1,000,000 token 上下文窗口
- 128,000 token 最大输出
- 文本与图片输入
- 输入 $5 / 百万 token,输出 $25 / 百万 token
- 自适应 thinking,支持 `low`、`medium`、`high`、`xhigh` 与 `max` effort

[原文]
Tau retains `claude-sonnet-4-6` as Anthropic's default model. Users opt into
Opus 5 through `/model` or `--provider anthropic -m claude-opus-5`.

[译文]
Tau 仍以 `claude-sonnet-4-6` 作为 Anthropic 的默认模型。用户可通过 `/model` 或 `--provider anthropic -m claude-opus-5` 选择启用 Opus 5。

## Thinking 兼容性(Thinking compatibility)

[原文]
Tau has six UI levels while Opus 5 has five enabled-thinking effort levels plus
a disabled mode. `minimal` is unavailable for this model. Tau maps `xhigh` to
Anthropic's `max` wire value because both represent Tau's top reasoning tier.
`off` now sends `thinking: {"type": "disabled"}` explicitly; omitting the field
would not work because Opus 5 enables adaptive thinking by default.

[译文]
Tau 有六个 UI 等级,而 Opus 5 有五个「启用 thinking」的 effort 等级外加一个禁用模式。`minimal` 在该模型上不可用。Tau 把 `xhigh` 映射到 Anthropic 的 `max` 线上取值,因为两者都代表 Tau 的最高推理档位。`off` 现在显式发送 `thinking: {"type": "disabled"}`;省略该字段行不通,因为 Opus 5 默认启用自适应 thinking。

## 架构(Architecture)

[原文]
This remains a catalog and provider-adapter change:

[译文]
这仍然是目录与 provider 适配器层面的变更:

[原文]
- `tau_coding` owns model discovery, metadata, and thinking-level mapping.
- `tau_ai` serializes the resulting Anthropic Messages API request.
- `tau_agent` remains provider-independent.

[译文]
- `tau_coding` 持有模型发现、元数据与 thinking 等级映射。
- `tau_ai` 序列化由此生成的 Anthropic Messages API 请求。
- `tau_agent` 仍与 provider 无关。

## 验证(Verification)

[原文]
Run:

[译文]
运行:

```bash
uv run pytest tests/test_provider_catalog.py tests/test_provider_config.py tests/test_tau_ai.py
uv run ruff check .
uv run ruff format --check .
uv run mypy
```

[原文]
Official sources:

[译文]
官方来源:

[原文]
- https://platform.claude.com/docs/en/about-claude/models/whats-new-opus-5
- https://platform.claude.com/docs/en/about-claude/models/overview
- https://platform.claude.com/docs/en/release-notes/overview

[译文]
- https://platform.claude.com/docs/en/about-claude/models/whats-new-opus-5
- https://platform.claude.com/docs/en/about-claude/models/overview
- https://platform.claude.com/docs/en/release-notes/overview
