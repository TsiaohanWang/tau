# Kimi K3 模型目录支持 / Kimi K3 model catalog support

[原文]
Tau exposes Kimi K3 through both the built-in `kimi-code` provider and Hugging
Face Inference Providers. Kimi Code uses the model ID `k3` and its existing
subscription endpoint and credential:

[译文]
Tau 通过内置的 `kimi-code` provider 与 Hugging Face Inference Providers 双重暴露 Kimi K3。Kimi Code 使用模型 ID `k3`,以及它既有的订阅端点与凭据:

[原文]
- endpoint: `https://api.kimi.com/coding/v1`
- environment variable: `KIMI_CODE_API_KEY`
- saved credential name: `kimi-code`

[译文]
- 端点:`https://api.kimi.com/coding/v1`
- 环境变量:`KIMI_CODE_API_KEY`
- 已保存凭据名:`kimi-code`

[原文]
Kimi documents native visual understanding and a context window of up to
1,048,576 tokens for eligible plans. The catalog therefore marks K3 as accepting
text and image input and records that maximum so Tau's context budgeting can use
it; the API may reject requests beyond the user's plan entitlement.

[译文]
Kimi 文档说明 K3 具备原生视觉理解能力,并且在符合条件的套餐下上下文窗口最高可达 1,048,576 token。因此目录把 K3 标记为接受文本与图片输入,并记录该最大值,以便 Tau 的上下文预算使用;超出用户套餐权益的请求可能被 API 拒绝。

[原文]
K3 accepts `low`, `high`, and `max` reasoning effort. Tau maps these to `low`,
`high`, and `xhigh` respectively for both catalog entries. `kimi-for-coding`
remains the Kimi Code default, and `moonshotai/Kimi-K2.6` remains the Hugging
Face default, to avoid silently changing existing users' selections.

[译文]
K3 接受 `low`、`high` 与 `max` 三档推理 effort。Tau 在两个目录条目中都把它们分别映射为 `low`、`high` 与 `xhigh`。`kimi-for-coding` 仍是 Kimi Code 的默认模型,`moonshotai/Kimi-K2.6` 仍是 Hugging Face 的默认模型,以避免静默改变既有用户的选择。

[原文]
The Hugging Face catalog uses the official `moonshotai/Kimi-K3` repository ID.
Hugging Face currently advertises live routes through Together AI, Fireworks
AI, Featherless AI, Baseten, and DeepInfra. The catalog records the official
1,048,576-token context and the highest advertised route price of $3 input and
$15 output per million tokens; actual routing and price can vary.

[译文]
Hugging Face 目录使用官方仓库 ID `moonshotai/Kimi-K3`。Hugging Face 目前声明可经 Together AI、Fireworks AI、Featherless AI、Baseten 与 DeepInfra 实时路由。目录记录官方 1,048,576 token 上下文,以及所公布路由中的最高价格:输入 $3、输出 $15 每百万 token;实际路由与价格可能变化。

## 验证(Verify)

```bash
uv run pytest tests/test_provider_catalog.py tests/test_provider_config.py
uv run ruff check .
uv run ruff format --check .
uv run mypy
```

[原文]
After `/login kimi-code`, choose `kimi-code:k3` from `/model` or start Tau with
`--provider kimi-code --model k3`. For Hugging Face, use `/login huggingface`
and choose `huggingface:moonshotai/Kimi-K3`. Kimi recommends beginning a new
session when switching models because the old model's context cache cannot be
reused.

[译文]
执行 `/login kimi-code` 之后,从 `/model` 中选择 `kimi-code:k3`,或以 `--provider kimi-code --model k3` 启动 Tau。对于 Hugging Face,使用 `/login huggingface` 并选择 `huggingface:moonshotai/Kimi-K3`。Kimi 建议切换模型时开始新会话,因为旧模型的上下文缓存无法复用。
