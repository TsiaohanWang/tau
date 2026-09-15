# Kimi K2.7 模型目录支持 / Kimi K2.7 model catalog support

[原文]
Tau's built-in catalog now exposes Kimi's current coding models through their two official API surfaces:

[译文]
Tau 的内置目录现在通过 Kimi 的两个官方 API 界面暴露其当前编码模型:

[原文]
- `moonshotai:kimi-k2.7-code` uses the pay-as-you-go Kimi API at `https://api.moonshot.ai/v1`.
- `kimi-code:kimi-for-coding` uses the Kimi Code subscription endpoint at `https://api.kimi.com/coding/v1`. Kimi documents `kimi-for-coding` as the rolling model ID for the latest coding model.

[译文]
- `moonshotai:kimi-k2.7-code` 使用按量付费的 Kimi API:`https://api.moonshot.ai/v1`。
- `kimi-code:kimi-for-coding` 使用 Kimi Code 订阅端点:`https://api.kimi.com/coding/v1`。Kimi 文档说明 `kimi-for-coding` 是指向最新编码模型的滚动模型 ID。

[原文]
They are separate providers because their API keys, base URLs, and billing plans are separate. Both authenticate HTTP requests with Bearer API keys rather than OAuth. Moonshot AI reads a pay-as-you-go key from `MOONSHOT_API_KEY`; Kimi Code reads a subscription key from `KIMI_CODE_API_KEY`. The distinct names let users configure both services at once and mirror Tau's existing separation between OpenAI API access and an OpenAI Codex subscription.

[译文]
它们是彼此独立的 provider,因为 API key、base URL 与计费方案都不同。两者都用 Bearer API key 而非 OAuth 认证 HTTP 请求。Moonshot AI 从 `MOONSHOT_API_KEY` 读取按量付费 key;Kimi Code 从 `KIMI_CODE_API_KEY` 读取订阅 key。区分开的名字让用户可以同时配置两项服务,也镜像了 Tau 既有的「OpenAI API 访问」与「OpenAI Codex 订阅」的分离。

[原文]
Kimi's documentation says K2.7 Code has a 262,144-token context window, accepts multimodal input, and always uses thinking mode. The catalog therefore marks it as reasoning-capable and does not offer an `off` thinking mode.

[译文]
Kimi 的文档说明 K2.7 Code 具有 262,144 token 的上下文窗口,接受多模态输入,并且始终使用 thinking 模式。因此目录把它标记为具备推理能力,且不提供 `off` thinking 模式。

## 验证(Verify)

```bash
uv run pytest tests/test_provider_catalog.py
uv run ruff check .
uv run ruff format --check .
uv run mypy
```

[原文]
To use either model, save the appropriate credential with `/login`, then select it with `/model` or launch Tau with `--provider` and `--model`.

[译文]
要使用其中任一模型,先用 `/login` 保存相应凭据,再用 `/model` 选择它,或以 `--provider` 与 `--model` 启动 Tau。
