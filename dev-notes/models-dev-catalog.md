# 生成式 models.dev 目录 / Generated models.dev catalog

## 变更内容(What changed)

[原文]
Tau now follows Pi's build-time model-generation design. The application-owned
`src/tau_coding/data/catalog.toml` remains the provider transport/auth/default
configuration and offline fallback. A generator fetches
`https://models.dev/api.json` and writes the complete checked-in model snapshot
to `src/tau_coding/data/models-dev-catalog.json`.

[译文]
Tau 现在遵循 Pi 的构建期模型生成设计。应用自有的 `src/tau_coding/data/catalog.toml` 仍是 provider 传输/认证/默认配置与离线回退。一个生成器会抓取 `https://models.dev/api.json`,并把完整的已提交模型快照写入 `src/tau_coding/data/models-dev-catalog.json`。

[原文]
For each Tau provider with a models.dev counterpart, generation:

[译文]
对于每个在 models.dev 中有对应项的 Tau provider,生成过程会:

[原文]
- includes every non-deprecated model that advertises tool calling and text I/O;
- retains catalog-only rows as explicit Tau/provider corrections;
- copies names, reasoning support, text/image input, cost, context limits, and
  output limits;
- converts verified reasoning effort options with Pi's semantics;
- keeps explicit provider-name aliases, such as `together` to `togetherai` and
  `kimi-code` to `kimi-for-coding`.

[译文]
- 纳入每个未弃用、且声明支持工具调用与文本 I/O 的模型;
- 保留仅存在于目录中的行,作为显式的 Tau/provider 修正;
- 复制名称、推理支持、文本/图片输入、成本、上下文上限与输出上限;
- 按 Pi 的语义转换经过核验的推理 effort 选项;
- 保留显式的 provider 名称别名,例如 `together` 对应 `togetherai`、`kimi-code` 对应 `kimi-for-coding`。

[原文]
The generated inventory replaces the fallback inventory for covered providers.
Provider endpoints, API transports, authentication, defaults, compatibility
flags, and manual model corrections still come from `catalog.toml`. User
`~/.tau/catalog.toml` overlays are applied after both and therefore remain the
last word.

[译文]
对于被覆盖的 provider,生成的清单会替换回退清单。Provider 端点、API 传输、认证、默认值、兼容性 flag 与手工模型修正仍来自 `catalog.toml`。用户 `~/.tau/catalog.toml` 叠加层在两者之后应用,因此仍然是最终决定者。

## Thinking 等级(Thinking levels)

[原文]
Tau now matches Pi's thinking-level vocabulary: `off`, `minimal`, `low`,
`medium`, `high`, `xhigh`, and `max`. `none` maps to `off`; `max` remains a
distinct selectable level rather than being translated to `xhigh`. Unsupported
levels are represented by null mappings.

[译文]
Tau 现在匹配 Pi 的 thinking 等级词汇:`off`、`minimal`、`low`、`medium`、`high`、`xhigh` 与 `max`。`none` 映射为 `off`;`max` 仍是一个独立的可选等级,而不会被翻译成 `xhigh`。不受支持的等级用空映射表示。

[原文]
Pi emits no generated map when `reasoning_options` is empty, toggle-only, or has
no usable effort values. In that case Tau retains its provider/manual behavior.
The current models.dev Hugging Face GLM-5.2 row has an empty list, so Tau keeps a
narrow provider-validated catalog correction for its accepted `none`, `high`,
and `max` values. This prevents the unsafe provider-wide `medium` default.

[译文]
当 `reasoning_options` 为空、只有开关、或没有可用的 effort 取值时,Pi 不生成映射。在这种情况下,Tau 保留其 provider/手工行为。当前 models.dev 中 Hugging Face 的 GLM-5.2 行是空列表,因此 Tau 为其接受的 `none`、`high` 与 `max` 值保留一条经过 provider 验证的窄范围目录修正。这防止了不安全的 provider 级 `medium` 默认值。

[原文]
If generated constraints make a remembered `providers.json` thinking default
unavailable, Tau ignores that stale preference and resolves a safe current
default instead of failing startup.

[译文]
如果生成的约束使某个已记住的 `providers.json` thinking 默认值不再可用,Tau 会忽略该陈旧偏好,并解析出一个安全的当前默认值,而不是让启动失败。

## 运行时刷新与失败行为(Runtime refresh and failure behavior)

[原文]
Tau also mirrors Pi's refreshable-catalog behavior. Opening `/model` renders the
last-known snapshot immediately and refreshes models.dev in the background.
Refreshes are throttled to four hours, use ETag revalidation, apply the same live
NVIDIA filter as generation, and atomically cache the transformed catalog in
`~/.tau/models-store.json`. `tau update --models` bypasses the freshness window
and forces immediate revalidation.

[译文]
Tau 还镜像了 Pi 的可刷新目录行为。打开 `/model` 会立即渲染最近已知快照,并在后台刷新 models.dev。刷新被限流为四小时一次,使用 ETag 重新校验,应用与生成时相同的实时 NVIDIA 过滤,并把转换后的目录原子缓存到 `~/.tau/models-store.json`。`tau update --models` 会绕过新鲜度窗口,强制立即重新校验。

[原文]
Unlike Pi, which serves transformed provider catalogs from `pi.dev`, Tau has no
catalog service, so it fetches models.dev and NVIDIA directly and performs the
same deterministic transformation locally. A cached catalog is applied only
when newer than the bundled snapshot. User `~/.tau/catalog.toml` overrides are
still applied last.

[译文]
Pi 从 `pi.dev` 提供转换后的 provider 目录;Tau 没有目录服务,因此它直接抓取 models.dev 与 NVIDIA,并在本地执行同样的确定性转换。缓存目录只有在比随包快照更新时才会被应用。用户 `~/.tau/catalog.toml` 覆盖仍在最后应用。

[原文]
Network, parsing, persistence, and validation failures preserve the previous
cache and bundled catalog. Startup restores cache only and never requires
network. Setting `TAU_OFFLINE` disables catalog network access while retaining
cached/bundled reads. Missing, malformed, or incompatible generated/cache data falls
back silently to `catalog.toml`. `providers.json` remains preference-only.

[译文]
网络、解析、持久化与校验失败都会保留先前的缓存与随包目录。启动只恢复缓存,绝不需要网络。设置 `TAU_OFFLINE` 会禁用目录网络访问,同时保留缓存/随包读取。缺失、畸形或不兼容的生成/缓存数据会静默回退到 `catalog.toml`。`providers.json` 仍只含偏好。

[原文]
A new model or capability can therefore arrive through `/model` or
`tau update --models` without a Tau release. Patch releases still refresh the
bundled offline baseline.

[译文]
因此,新模型或新能力可以不经 Tau 发版,而通过 `/model` 或 `tau update --models` 到达。补丁版本仍会刷新随包的离线基线。

## 刷新快照(Refreshing the snapshot)

[原文]
From the repository root:

[译文]
在仓库根目录执行:

```bash
uv run python scripts/generate_models.py
```

[原文]
For deterministic tests or an audited download:

[译文]
用于确定性测试或可审计的下载:

```bash
uv run python scripts/generate_models.py \
  --source /path/to/api.json \
  --output /tmp/models-dev-catalog.json
```

[原文]
Review the generated diff before committing it. Source changes alter user-facing
model lists, limits, costs, modalities, and thinking controls.

[译文]
提交之前先审查生成的 diff。来源变化会改变面向用户的模型列表、上限、成本、模态与 thinking 控件。

## 验证(Validation)

[原文]
Focused coverage lives in `tests/test_models_dev.py` and the provider catalog,
configuration, runtime, and thinking suites. It covers Pi-compatible effort
conversion, distinct `max`, full model generation, new-model discovery,
provider aliases, malformed-resource fallback, user preference fallback, and
GLM-5.2 wire behavior.

[译文]
聚焦覆盖位于 `tests/test_models_dev.py` 以及 provider 目录、配置、运行时与 thinking 测试套件中。它覆盖 Pi 兼容的 effort 转换、独立的 `max`、完整模型生成、新模型发现、provider 别名、畸形资源回退、用户偏好回退,以及 GLM-5.2 的线上行为。
