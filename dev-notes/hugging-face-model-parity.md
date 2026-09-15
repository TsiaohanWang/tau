# Hugging Face 模型目录对齐 / Hugging Face model catalog parity

## 变更内容(What changed)

[原文]
Tau's built-in Hugging Face Inference Providers catalog now contains 46 models. This adds 28 live-routable models from Pi's generated Hugging Face catalog across DeepSeek, Gemma, GLM, GPT OSS, Kimi, Llama, MiniMax, MiMo, Qwen, and Step families. Live testing excluded three Pi entries that no enabled Hugging Face inference provider could serve: `Qwen/Qwen3-Next-80B-A3B-Thinking`, `XiaomiMiMo/MiMo-V2-Flash`, and `moonshotai/Kimi-K2-Thinking`.

[译文]
Tau 内置的 Hugging Face Inference Providers 目录现在包含 46 个模型。本次从 Pi 生成的 Hugging Face 目录中新增了 28 个可实时路由的模型,覆盖 DeepSeek、Gemma、GLM、GPT OSS、Kimi、Llama、MiniMax、MiMo、Qwen 与 Step 等家族。实时测试排除了 Pi 中三个没有任何已启用 Hugging Face 推理 provider 能提供服务的条目:`Qwen/Qwen3-Next-80B-A3B-Thinking`、`XiaomiMiMo/MiMo-V2-Flash` 与 `moonshotai/Kimi-K2-Thinking`。

[原文]
Each addition includes the provider model ID, display name, reasoning and input capabilities, context window, output limit, compatibility metadata, and token pricing. The existing `moonshotai/Kimi-K2.6` default remains unchanged.

[译文]
每个新增条目都包含 provider 模型 ID、显示名、推理与输入能力、上下文窗口、输出上限、兼容性元数据与 token 定价。既有的默认值 `moonshotai/Kimi-K2.6` 保持不变。

## 为什么需要它(Why it exists)

[原文]
Tau and Pi use the same Hugging Face OpenAI-compatible router. Keeping their built-in model choices aligned means Tau users can select the broader set directly through `/model` instead of maintaining a personal catalog overlay.

[译文]
Tau 与 Pi 使用同一个 Hugging Face OpenAI 兼容路由器。让双方的内置模型选择保持一致,意味着 Tau 用户可以直接通过 `/model` 选择更广的模型集合,而不必自己维护一份个人目录叠加层。

[原文]
This remains application configuration in `tau_coding`; no Hugging Face assumptions were added to the portable `tau_agent` harness.

[译文]
这仍然属于 `tau_coding` 中的应用配置;可移植的 `tau_agent` harness 没有新增任何 Hugging Face 相关假设。

## 如何测试(How to test)

[原文]
Run the catalog and provider configuration tests:

[译文]
运行目录与 provider 配置测试:

```bash
uv run pytest tests/test_provider_catalog.py tests/test_provider_config.py -q
```

[原文]
With a saved Hugging Face credential, validate the packaged catalog against the live router:

[译文]
在已保存 Hugging Face 凭据的情况下,用实时路由器验证打包目录:

```bash
uv run python ~/.tau/provider-validation/validate_provider_catalog.py run \
  --builtins-only \
  --provider huggingface \
  --concurrency 2 \
  --provider-concurrency 1 \
  --timeout-seconds 30 \
  --max-retries 0
```

[原文]
The helper stops at `response_start` by default to verify model and payload acceptance while minimizing token usage. Keep detailed live-validation artifacts outside the repository.

[译文]
该辅助脚本默认在 `response_start` 处停止,以在验证模型与载荷接受情况的同时尽量少消耗 token。请把详细的实时校验产物保存在仓库之外。
