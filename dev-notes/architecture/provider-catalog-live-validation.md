# Provider 目录实时校验 Runbook / Provider catalog live-validation runbook

[原文]
This runbook explains how we validated the Pi-derived API provider catalog and how to
repeat the process when adding or changing providers/models.

[译文]
本 Runbook 说明我们如何验证源自 Pi 的 API provider 目录,以及在新增或修改 provider/模型时如何重复这一流程。

[原文]
The goal is not to benchmark answer quality. The goal is to prove that every model and
every thinking/reasoning level shown by Tau can be accepted by the provider API with the
payload Tau sends.

[译文]
目标不是基准测试回答质量,而是证明 Tau 展示的每一个模型、每一个 thinking/推理等级,都能被 provider API 接受 —— 且使用的是 Tau 实际发送的载荷。

## 何时使用本 Runbook(When to use this runbook)

[原文]
Run live validation when:

[译文]
在以下情况运行实时校验:

[原文]
- importing or regenerating provider catalog metadata
- adding a provider runtime adapter
- changing reasoning/thinking payloads
- changing model lists or default models
- seeing provider errors such as deprecated model IDs or unsupported reasoning levels

[译文]
- 导入或重新生成 provider 目录元数据
- 新增 provider 运行时适配器
- 修改推理/thinking 载荷
- 修改模型列表或默认模型
- 遇到诸如「模型 ID 已弃用」或「不支持的推理等级」之类的 provider 错误

[原文]
Do **not** run it casually against large catalogs. Even tiny prompts can consume credits
when repeated across hundreds of models and reasoning levels.

[译文]
**不要**随意对大型目录运行它。当成百上千个模型与推理等级叠加时,即使极小的提示也可能消耗额度。

## 什么算作已验证(What counts as validated)

[原文]
For this pass we used a tiny prompt:

[译文]
本次校验使用了一条极小的提示:

```text
Reply with exactly: OK
```

[原文]
A request counted as valid once Tau received a provider `response_start` event. That means:

[译文]
只要 Tau 收到了 provider 的 `response_start` 事件,该请求就算验证通过。这意味着:

[原文]
1. Tau built the runtime provider successfully.
2. Credentials were accepted well enough to make the request.
3. The provider accepted the model ID.
4. The provider accepted the reasoning/thinking payload for that level.
5. The endpoint started a streaming response.

[译文]
1. Tau 成功构建了运行时 provider。
2. 凭据被接受,足以发起请求。
3. Provider 接受了该模型 ID。
4. Provider 接受了该等级对应的推理/thinking 载荷。
5. 端点开始了流式响应。

[原文]
This intentionally stops early. Waiting for full text output validates more of the stream,
but costs more tokens. Use full-response validation only for a small sample or when testing
stream parsing behavior.

[译文]
这里有意提前停止。等待完整文本输出可以验证更多流式环节,但会消耗更多 token。只应针对小样本、或测试流解析行为时,才使用全响应校验。

## 校验矩阵(Validation matrix)

[原文]
The matrix is:

[译文]
矩阵为:

```text
credentialed providers
  × provider.models
  × provider_thinking_levels(provider, model)
```

[原文]
For non-reasoning models, validate one request with no thinking level.

[译文]
对于非推理模型,验证一次不带 thinking 等级的请求。

[原文]
Tau has two useful catalog scopes:

[译文]
Tau 有两个有用的目录范围:

[原文]
- **Effective catalog**: built-in catalog plus `~/.tau/catalog.toml` user overlays. This
  matches what the UI shows on a specific machine.
- **Packaged catalog**: built-in catalog only. Use this for PR verification so local user
  overlays do not mask or reintroduce stale models.

[译文]
- **有效目录(Effective catalog)**:内置目录加上 `~/.tau/catalog.toml` 用户叠加层。这与特定机器上 UI 展示的内容一致。
- **打包目录(Packaged catalog)**:仅内置目录。用于 PR 验证,这样本地用户叠加层既不会掩盖陈旧模型,也不会把它们重新引入。

[原文]
In this pass, we first validated the effective catalog to catch what the UI showed locally,
then reran summaries and retries with `--builtins-only` to verify the PR catalog itself.

[译文]
本次校验先验证有效目录,以捕获本地 UI 展示的内容;随后用 `--builtins-only` 重新运行汇总与重试,以验证 PR 中的目录本身。

## 本地校验辅助脚本(Local validation helper)

[原文]
We used a temporary helper script at:

[译文]
我们使用了一个临时辅助脚本,位于:

```text
~/.tau/provider-validation/validate_provider_catalog.py
```

[原文]
The script is intentionally resumable. Each attempt appends one JSON object to:

[译文]
该脚本被有意设计为可断点续跑。每次尝试都会向以下文件追加一个 JSON 对象:

```text
~/.tau/provider-validation/pi-api-provider-catalog/results.jsonl
```

[原文]
The key fields are:

[译文]
关键字段有:

[原文]
| Field | Meaning |
|---|---|
| `provider` | Tau provider name |
| `model` | Model ID sent to the provider |
| `thinking_level` | Tau thinking level, or `null` for non-reasoning validation |
| `status` | `ok` or `error` |
| `message` | Provider/runtime error message for failed attempts |
| `data.status_code` | HTTP status when available |
| `data.body` | Truncated provider error body when available |

[译文]
| 字段 | 含义 |
|---|---|
| `provider` | Tau 的 provider 名称 |
| `model` | 发送给 provider 的模型 ID |
| `thinking_level` | Tau 的 thinking 等级;非推理校验时为 `null` |
| `status` | `ok` 或 `error` |
| `message` | 失败尝试的 provider/运行时错误消息 |
| `data.status_code` | 可用时的 HTTP 状态码 |
| `data.body` | 可用时截断后的 provider 错误响应体 |

[原文]
The script supports three operations:

[译文]
该脚本支持三种操作:

```bash
# Show credentialed providers, missing credentials, and total attempt counts.
uv run python ~/.tau/provider-validation/validate_provider_catalog.py plan

# Run live validation.
uv run python ~/.tau/provider-validation/validate_provider_catalog.py run \
  --builtins-only \
  --concurrency 4 \
  --provider-concurrency 2 \
  --timeout-seconds 30 \
  --max-retries 0

# Summarize recorded results.
uv run python ~/.tau/provider-validation/validate_provider_catalog.py summarize \
  --builtins-only \
  --top-errors 12
```

[原文]
Important flags:

[译文]
重要参数:

[原文]
| Flag | Use |
|---|---|
| `--builtins-only` | Ignore `~/.tau/catalog.toml`; validate the packaged PR catalog only. |
| `--provider NAME` | Limit the run to one provider; repeatable. |
| `--limit N` | Run only the next N pending attempts. Useful for sampling. |
| `--retry-errors` | Retry attempts that already have error rows. Use after fixes. |
| `--concurrency N` | Global maximum concurrent calls. |
| `--provider-concurrency N` | Maximum concurrent calls per provider. |
| `--wait-for response_start` | Cheapest success condition; validates request acceptance. |
| `--wait-for text` | More expensive; validates that text actually streams. |

[译文]
| 参数 | 用途 |
|---|---|
| `--builtins-only` | 忽略 `~/.tau/catalog.toml`;只验证打包进 PR 的目录。 |
| `--provider NAME` | 把运行限制在单个 provider;可重复。 |
| `--limit N` | 只运行接下来 N 个待处理尝试。适合抽样。 |
| `--retry-errors` | 重试已有错误记录的尝试。修复之后使用。 |
| `--concurrency N` | 全局最大并发调用数。 |
| `--provider-concurrency N` | 每个 provider 的最大并发调用数。 |
| `--wait-for response_start` | 最省的成功条件;验证请求是否被接受。 |
| `--wait-for text` | 更昂贵;验证文本是否真的流式输出。 |

[原文]
The script skips attempts that already have a result unless `--retry-errors` is set.

[译文]
除非设置了 `--retry-errors`,脚本会跳过已有结果的尝试。

## 安全的并发默认值(Safe concurrency defaults)

[原文]
Start conservative:

[译文]
从保守配置开始:

```bash
--concurrency 4 --provider-concurrency 2 --max-retries 0
```

[原文]
For expensive providers or accounts with low limits, use:

[译文]
对于昂贵的 provider 或限额较低的账号,使用:

```bash
--concurrency 1 --provider-concurrency 1
```

[原文]
For OpenRouter, we used low per-provider concurrency because the catalog is large and many
routes are free/shared upstreams:

[译文]
对 OpenRouter,我们使用了较低的按 provider 并发,因为它的目录很大,而且许多路由是免费的/共享的上游:

```bash
uv run python ~/.tau/provider-validation/validate_provider_catalog.py run \
  --builtins-only \
  --provider openrouter \
  --concurrency 2 \
  --provider-concurrency 1 \
  --timeout-seconds 35 \
  --max-retries 0
```

[原文]
Avoid automatic retries during the first pass. Retries can hide deterministic payload/model
failures and consume extra credits. Retry only after classifying errors.

[译文]
第一轮应避免自动重试。重试会掩盖确定性的载荷/模型故障,并额外消耗额度。只有在完成错误分类之后才重试。

## 故障分类(Failure classification)

[原文]
Classify errors before fixing anything.

[译文]
在修复任何东西之前,先对错误分类。

### 若在整个 provider 范围内复现,立即修复(Fix immediately if recurring provider-wide)

[原文]
If every model for a provider fails with the same payload/schema error, pause validation,
fix the adapter, then rerun that provider with `--retry-errors`.

[译文]
如果某个 provider 的所有模型都以相同的载荷/schema 错误失败,暂停校验,修复适配器,然后用 `--retry-errors` 重跑该 provider。

[原文]
Example from this pass:

[译文]
本次校验中的例子:

[原文]
- Google rejected every model because `systemInstruction` was nested under
  `generationConfig`.
- Fix: move `systemInstruction` to the top-level Google request payload.
- Rerun: Google models then passed except for real model/level issues.

[译文]
- Google 拒绝了所有模型,因为 `systemInstruction` 被嵌套在 `generationConfig` 之下。
- 修复:把 `systemInstruction` 移到 Google 请求载荷的顶层。
- 重跑:此后除真实的模型/等级问题外,Google 模型全部通过。

### 在目录/运行时中修复(Fix in catalog/runtime)

[原文]
These are real Tau catalog/runtime issues:

[译文]
这些是真正的 Tau 目录/运行时问题:

[原文]
| Error pattern | Typical fix |
|---|---|
| `model ... does not exist`, `No endpoints found`, `deprecated` | Remove the model from the packaged catalog. |
| `not a chat model`, requires audio/tools/search/file/MCP | Remove from coding-chat API catalog for now. |
| `Unsupported value: 'minimal'`, expected `low/medium/high` | Add per-model `unsupported_thinking_levels`. |
| Provider expects a different reasoning value | Add `thinking_level_map`. |
| Provider needs special routing/header/compat option | Add provider/model `compat` metadata and runtime support. |
| Provider-wide invalid JSON/payload | Fix the adapter and add a regression test. |

[译文]
| 错误模式 | 典型修复 |
|---|---|
| `model ... does not exist`、`No endpoints found`、`deprecated` | 从打包目录中移除该模型。 |
| `not a chat model`,或要求 audio/tools/search/file/MCP | 暂时从编码聊天 API 目录中移除。 |
| `Unsupported value: 'minimal'`,期望 `low/medium/high` | 添加按模型的 `unsupported_thinking_levels`。 |
| Provider 期望不同的推理取值 | 添加 `thinking_level_map`。 |
| Provider 需要特殊路由/header/compat 选项 | 添加 provider/模型的 `compat` 元数据与运行时支持。 |
| 在整个 provider 范围内出现非法 JSON/载荷 | 修复适配器并添加回归测试。 |

### 记录,但不要做全局修复(Document, do not globally fix)

[原文]
These are account/runtime conditions, not necessarily catalog truth:

[译文]
这些是账号/运行时的状况,未必代表目录本身的事实:

[原文]
| Error pattern | Treatment |
|---|---|
| `401`, `403`, missing credential | Report as not validated or account-specific. |
| `402 Insufficient Balance` | Report as credentialed but not validated due balance. |
| Account entitlement errors | Report separately; do not remove globally unless provider docs confirm. |
| `429` rate limit | Retry later or report as rate-limited. Do not remove by default. |
| `500`, `502`, `503` transient/high demand | Retry once; if persistent, report as transient/upstream. |

[译文]
| 错误模式 | 处理方式 |
|---|---|
| `401`、`403`、缺少凭据 | 报告为「未验证」或「账号特有」。 |
| `402 Insufficient Balance` | 报告为「已有凭据,但因余额未验证」。 |
| 账号权益(entitlement)错误 | 单独报告;除非 provider 文档证实,否则不做全局移除。 |
| `429` 限流 | 稍后重试,或报告为「被限流」。默认不移除。 |
| `500`、`502`、`503` 瞬时/高负载 | 重试一次;若持续存在,报告为「瞬时的/上游问题」。 |

[原文]
Example from this pass:

[译文]
本次校验中的例子:

[原文]
- DeepSeek returned `402 Insufficient Balance`; we did not remove DeepSeek models.
- OpenAI Codex rejected some models for the logged-in ChatGPT account; we did not remove
  them globally because entitlement can vary.
- OpenRouter free/shared routes returned `429`; we left them in the catalog and reported
  them as upstream rate limits.

[译文]
- DeepSeek 返回 `402 Insufficient Balance`;我们没有移除 DeepSeek 模型。
- OpenAI Codex 对已登录的 ChatGPT 账号拒绝了部分模型;我们没有全局移除它们,因为权益可能因账号而异。
- OpenRouter 的免费/共享路由返回 `429`;我们把它们保留在目录中,并报告为上游限流。

## 修复/重跑循环(Fix/rerun loop)

[原文]
Use this loop until all fixable errors are gone:

[译文]
持续执行这个循环,直到所有可修复的错误都消失:

[原文]
1. Run a plan or dry run.
2. Run a small batch for new providers.
3. If failures are provider-wide, fix the adapter first.
4. Run the full provider/catalog pass.
5. Summarize errors.
6. Apply catalog/runtime fixes.
7. Rerun only failures:

[译文]
1. 运行 plan 或 dry run。
2. 对新 provider 先跑一个小批次。
3. 如果故障是整个 provider 范围的,先修复适配器。
4. 运行完整的 provider/目录校验。
5. 汇总错误。
6. 应用目录/运行时修复。
7. 只重跑失败项:

```bash
uv run python ~/.tau/provider-validation/validate_provider_catalog.py run \
  --builtins-only \
  --provider PROVIDER_NAME \
  --retry-errors \
  --concurrency 2 \
  --provider-concurrency 1
```

[原文]
8. Summarize again.
9. Repeat until remaining errors are only documented account/balance/rate-limit cases.

[译文]
8. 再次汇总。
9. 重复,直到剩余错误都只是已记录的账号/余额/限流情形。

## 校验后更新 Tau(Updating Tau after validation)

[原文]
Common code/catalog changes:

[译文]
常见的代码/目录改动:

[原文]
- Remove stale model IDs from `src/tau_coding/data/catalog.toml`.
- Set validated defaults for providers whose previous default was removed.
- Add `unsupported_thinking_levels` under `providers.model_metadata.<model>`.
- Add `thinking_level_map` for provider-specific value mapping.
- Add model `compat` fields for adapter-specific behavior.
- Add adapter regression tests for any provider-wide payload fixes.
- Update stale tests that hardcoded old defaults or provider lists.

[译文]
- 从 `src/tau_coding/data/catalog.toml` 中移除陈旧的模型 ID。
- 为那些原默认值已被移除的 provider 设置经过验证的默认值。
- 在 `providers.model_metadata.<model>` 下添加 `unsupported_thinking_levels`。
- 为 provider 特有的取值映射添加 `thinking_level_map`。
- 为适配器特有行为添加模型的 `compat` 字段。
- 对任何整个 provider 范围的载荷修复,添加适配器回归测试。
- 更新那些硬编码了旧默认值或 provider 列表的过时测试。

[原文]
For this validation pass, notable fixes were:

[译文]
本次校验中值得注意的修复有:

[原文]
- Google Generative AI: `systemInstruction` now lives at request top level.
- OpenRouter: Tau passes `compat.openrouterProvider` as OpenRouter's `provider` routing
  option.
- Catalog: stale/deprecated/unroutable model IDs were pruned.
- Catalog: unsupported reasoning levels were hidden per model.
- Anthropic: adaptive-thinking metadata was tightened for current adaptive models.

[译文]
- Google Generative AI:`systemInstruction` 现在位于请求顶层。
- OpenRouter:Tau 把 `compat.openrouterProvider` 作为 OpenRouter 的 `provider` 路由选项传入。
- 目录:剪除了陈旧/已弃用/无法路由的模型 ID。
- 目录:按模型隐藏了不受支持的推理等级。
- Anthropic:针对当前的 adaptive 模型收紧了 adaptive-thinking 元数据。

## 最终报告格式(Final report format)

[原文]
End every validation pass with a concise report containing:

[译文]
每次校验结束时,都要给出一份简洁报告,包含:

[原文]
1. Catalog scope: effective or packaged/built-in.
2. Prompt and success condition.
3. Total expected attempts, recorded attempts, pending attempts.
4. Per-provider OK/error counts.
5. Remaining failures grouped by reason.
6. Providers not validated because credentials were missing.
7. Code/catalog fixes made.
8. Final project validation commands and results.

[译文]
1. 目录范围:有效目录,还是打包/内置目录。
2. 提示与成功条件。
3. 预期尝试总数、已记录尝试数、待处理尝试数。
4. 按 provider 的 OK/错误计数。
5. 按原因分组的剩余失败。
6. 因缺少凭据而未验证的 provider。
7. 所做的代码/目录修复。
8. 最终项目验证命令与结果。

[原文]
Store detailed local artifacts outside the repo:

[译文]
把详细的本地产物存放在仓库之外:

```text
~/.tau/provider-validation/<validation-name>/results.jsonl
~/.tau/provider-validation/<validation-name>/validation-summary.md
```

[原文]
Do not commit raw JSONL logs. They should not contain secrets, but they can include account
IDs, provider-specific metadata, rate-limit details, and paid-account availability clues.

[译文]
不要提交原始 JSONL 日志。它们不应包含密钥,但可能包含账号 ID、provider 特有的元数据、限流细节以及付费账号可用性线索。

## Pi API provider 校验的结果(Result from the Pi API provider pass)

[原文]
After fixes, the packaged catalog had 1,193 expected validation attempts for credentialed
providers. All fixable model/reasoning mismatches were cleared.

[译文]
修复之后,打包目录中对有凭据的 provider 共有 1,193 次预期校验尝试。所有可修复的模型/推理不匹配都已清除。

[原文]
Remaining failures were not global catalog/runtime bugs:

[译文]
剩余失败并不是全局的目录/运行时 bug:

[原文]
- DeepSeek returned `402 Insufficient Balance` for the available API key.
- OpenAI Codex returned account-entitlement errors for `gpt-5.3-codex` and `gpt-5.2` with
  the logged-in ChatGPT account, while other Codex models worked.
- Several OpenRouter free/shared upstream routes returned `429` rate limits.

[译文]
- DeepSeek 对可用的 API key 返回 `402 Insufficient Balance`。
- OpenAI Codex 对已登录的 ChatGPT 账号在 `gpt-5.3-codex` 与 `gpt-5.2` 上返回账号权益错误,而其他 Codex 模型正常。
- OpenRouter 的若干免费/共享上游路由返回 `429` 限流。

[原文]
Providers without credentials were not live-validated in this pass: Cerebras, Fireworks,
Mistral, Moonshot, Together, Vercel AI Gateway, xAI, Xiaomi, Z.ai, and regional variants.

[译文]
本次校验未对以下缺少凭据的 provider 做实时验证:Cerebras、Fireworks、Mistral、Moonshot、Together、Vercel AI Gateway、xAI、Xiaomi、Z.ai 以及各区域变体。

[原文]
Final local project validation:

[译文]
最终的本地项目验证:

```bash
uv run pytest -q
uv run ruff check .
uv run mypy
```

```text
677 passed
All checks passed!
Success: no issues found in 64 source files
```
