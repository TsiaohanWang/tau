# Codex 实时模型目录 / Codex live model catalog

## 变更内容(What changed)

[原文]
Tau now uses the authenticated ChatGPT Codex `/models` response as both a model
inventory and a source of runtime model limits. Previously Tau parsed context
and compaction values from this response but kept the selectable
`openai-codex` inventory entirely in `src/tau_coding/data/catalog.toml`.
Consequently, a newly rolled-out subscription model could be usable by an
account but remain unselectable until Tau released a static catalog update.

[译文]
Tau 现在把经过认证的 ChatGPT Codex `/models` 响应用作模型清单,同时作为运行时模型上限的来源。此前 Tau 会从该响应解析上下文与压缩值,但可选的 `openai-codex` 清单完全保存在 `src/tau_coding/data/catalog.toml` 中。因此,一个新推送的订阅模型可能对某个账号已经可用,却要等到 Tau 发布静态目录更新后才能被选中。

[原文]
`tau_ai` now exposes an optional `ModelCatalogProvider` capability. The Codex
adapter implements it and defensively parses rows that the official schema
marks with `visibility = "list"`. Before discovery, `tau_coding` resolves the
current stable `@openai/codex` version from npm because the backend suppresses
models newer than the supplied `client_version`. The safe version string is
cached for four hours with ETag revalidation; stale cache and the bundled known
version are fallbacks, so newly client-gated models need no Tau release.

[译文]
`tau_ai` 现在暴露一个可选的 `ModelCatalogProvider` 能力。Codex 适配器实现了它,并以防御方式解析官方 schema 标记为 `visibility = "list"` 的行。在发现之前,`tau_coding` 会从 npm 解析当前稳定的 `@openai/codex` 版本,因为后端会抑制比所提供的 `client_version` 更新的模型。该安全版本字符串缓存四小时,并用 ETag 重新校验;过期缓存与随包的已知版本是回退方案,因此新被客户端门控的模型无需 Tau 发版。

[原文]
The adapter intentionally does not filter on
`supported_in_api`: the official client applies that field to API-key mode but
keeps subscription-visible rows in ChatGPT mode. Tau preserves provider priority
order and reads verified names, text/image modalities,
reasoning efforts, defaults, and limits. One in-memory fetch serves both model
inventory and limit discovery.

[译文]
适配器有意不按 `supported_in_api` 过滤:官方客户端把该字段用于 API-key 模式,而在 ChatGPT 模式下保留订阅可见的行。Tau 保留 provider 优先级顺序,并读取经过核验的名称、文本/图片模态、推理 effort、默认值与各类上限。一次内存抓取同时服务模型清单与上限发现。

[原文]
`tau_coding` publishes a successful snapshot as an overlay on the durable
`openai-codex` configuration. Successful snapshots are persisted in the
account-scoped `~/.tau/codex-models-store.json` cache, so a later session can
render the discovered inventory immediately. Opening `/model` or
`/scoped-models` discovers Codex while another provider is active by creating and
closing a model-less provider. The pickers initially render their cached/static
snapshot and update after background refresh, preserving their existing
non-blocking behavior.

[译文]
`tau_coding` 把成功的快照作为叠加层发布到持久化的 `openai-codex` 配置上。成功快照会持久化到按账号隔离的 `~/.tau/codex-models-store.json` 缓存,因此后续会话可以立即渲染所发现的清单。当另一个 provider 处于活动状态时,打开 `/model` 或 `/scoped-models` 会通过创建并关闭一个无模型 provider 来发现 Codex。选择器先渲染其缓存/静态快照,并在后台刷新之后更新,从而保持其既有的非阻塞行为。

## 安全与持久化(Safety and persistence)

[原文]
The authenticated catalog is account- and rollout-specific. Tau persists only
parsed model metadata and the account ID in `codex-models-store.json`; it does
not write the snapshot into `catalog.toml`, `providers.json`, session JSONL, or
the models.dev cache. A snapshot for another account is ignored. The last
account-matched snapshot remains the fallback after a refresh failure, with the
checked-in Codex rows used when no cache exists. Empty, malformed, unauthorized,
or unavailable responses do not erase the fallback. `TAU_OFFLINE=1` skips
authenticated discovery and uses the cache/static fallback.

[译文]
经过认证的目录与账号及推送批次相关。Tau 只在 `codex-models-store.json` 中持久化解析后的模型元数据与账号 ID;它不会把快照写入 `catalog.toml`、`providers.json`、会话 JSONL 或 models.dev 缓存。属于其他账号的快照会被忽略。刷新失败之后,最近一次与账号匹配的快照仍是回退;当不存在缓存时,使用已提交的 Codex 行。空响应、畸形响应、未授权或不可用响应都不会抹掉回退。`TAU_OFFLINE=1` 会跳过认证发现,并使用缓存/静态回退。

[原文]
A live inventory is authoritative for picker visibility after successful
discovery. The active session model is not silently changed when absent from a
new snapshot. Scoped references may store only their provider/model pair; they
do not persist discovered metadata. `~/.tau/codex-version-store.json` contains
only public npm release metadata, never account-specific model data or secrets.

[译文]
在成功发现之后,实时清单对选择器的可见性是权威的。当活动会话模型不在新快照中时,它不会被静默更换。Scoped 引用只能保存其 provider/model 配对;它们不会持久化发现到的元数据。`~/.tau/codex-version-store.json` 只包含公开的 npm 发布元数据,绝不包含账号特有的模型数据或密钥。

[原文]
This preserves Tau's package boundary: `tau_ai` owns authenticated transport and
wire parsing, while `tau_coding` owns model selection, the account-scoped
cache, and the runtime catalog overlay. `tau_agent` remains independent of
provider catalogs and OAuth.

[译文]
这保持了 Tau 的包边界:`tau_ai` 持有认证传输与线上解析,`tau_coding` 持有模型选择、按账号隔离的缓存与运行时目录叠加。`tau_agent` 仍独立于 provider 目录与 OAuth。

## 生命周期验证(Lifecycle validation)

[原文]
Explicit startup and transcript resume now discover live-only Codex IDs before
static selection validation, including when a frontend supplied a fallback
provider. Discovery uses a temporary, closed provider and never mutates durable
settings. Failed/offline discovery leaves unknown IDs rejected, rather than
silently substituting a static model. RPC startup also defers live-only validation
to this session boundary.

[译文]
显式启动与会话记录恢复现在会在静态选择校验之前发现「仅实时存在」的 Codex ID,包括前端提供了回退 provider 的情况。发现过程使用一个临时、已关闭的 provider,绝不修改持久化设置。失败/离线的发现会让未知 ID 继续被拒绝,而不是静默替换为某个静态模型。RPC 启动也把「仅实时存在」的校验推迟到这个会话边界。

[原文]
Picker visibility is separate from active-runtime validity: when discovery drops
the active model, runtime rebuilds retain its previously selected Codex metadata.
Repeated settings refresh therefore cannot invalidate an otherwise usable session.
Regression tests cover explicit/resumed startup with and without preconstructed
providers and repeated settings reload after the active model disappears.

[译文]
选择器的可见性与活动运行时的有效性是分开的:当发现结果不再包含活动模型时,运行时重建仍保留其此前选中的 Codex 元数据。因此重复刷新设置不会让一个本来可用的会话失效。回归测试覆盖:带与不带预构建 provider 的显式/恢复启动,以及活动模型消失后重复重载设置。

[原文]
A follow-up exercises full TUI startup, picker highlighting, and indexed `/resume`,
including a source session that has not discovered Astra and a stale session
index. Provider-aware replacement keeps the destination loader's resolved model;
it neither restores the source session's model nor revalidates against the
source's stale catalog. Newly staged model metadata is replayed after discovery
so the active runtime and initial transcript agree.

[译文]
一项后续测试演练完整的 TUI 启动、选择器高亮与已索引的 `/resume`,包括一个尚未发现 Astra 的源会话与一个陈旧的会话索引。感知 provider 的替换会保留目标加载器解析出的模型;它既不恢复源会话的模型,也不会拿源端陈旧目录重新校验。新暂存的模型元数据会在发现之后被重放,使活动运行时与初始会话记录保持一致。

[原文]
Older sessions may already contain a mismatch: the index and assistant metadata
name Astra but the authoritative model-change entry still names Sol. No automatic
migration guesses a selection from assistant metadata (providers can report
routed model aliases). Resume and explicitly select Astra in `/model` to append
the correct model-change entry.

[译文]
较旧的会话可能已经存在不一致:索引与 assistant 元数据写着 Astra,但权威的模型变更条目仍写着 Sol。不会有自动迁移根据 assistant 元数据猜测选择(provider 可能上报被路由后的模型别名)。恢复后在 `/model` 中显式选择 Astra,即可追加正确的模型变更条目。

## 验证(Validation)

[原文]
Automated tests cover:

[译文]
自动化测试覆盖:

[原文]
- latest stable Codex-version lookup, validation, ETag caching, and fallbacks;
- authenticated catalog parsing and one-request caching with runtime limits;
- filtering hidden rows while retaining subscription-visible, non-public-API rows;
- live names, modalities, reasoning levels, and context limits;
- publication while Codex is active;
- account-scoped cache serialization and startup reuse;
- model-less discovery and provider cleanup while another provider is active;
- refresh from both `/model` and `/scoped-models`;
- existing static fallback behavior for discovery failures.

[译文]
- 最新稳定 Codex 版本的查询、校验、ETag 缓存与回退;
- 认证目录解析,以及带运行时上限的单请求缓存;
- 过滤隐藏行,同时保留订阅可见的、非公开 API 的行;
- 实时名称、模态、推理等级与上下文上限;
- Codex 处于活动状态时的发布;
- 按账号隔离的缓存序列化与启动复用;
- 另一个 provider 活动时的无模型发现与 provider 清理;
- 从 `/model` 与 `/scoped-models` 两处刷新;
- 发现失败时既有的静态回退行为。

[原文]
Manual validation:

[译文]
手动验证:

[原文]
1. Authenticate with `/login openai-codex`.
2. Open `/model`; observe the checked-in list immediately.
3. Wait for background refresh and confirm it updates to models visible to the
   authenticated account.
4. Select a live-only model and send a tool-using prompt.
5. Restart and resume that session; confirm the exact live-only model is retained.
6. Run `/session` and confirm live context-limit reporting.
7. Repeat with `TAU_OFFLINE=1` and confirm the static list remains available.

[译文]
1. 用 `/login openai-codex` 认证。
2. 打开 `/model`;立即观察已提交的列表。
3. 等待后台刷新,确认它更新为认证账号可见的模型。
4. 选择一个仅实时存在的模型,并发送一条会使用工具的提示。
5. 重启并恢复该会话;确认那个确切的「仅实时」模型被保留。
6. 运行 `/session`,确认实时上下文上限的报告。
7. 用 `TAU_OFFLINE=1` 重复,确认静态列表仍然可用。
