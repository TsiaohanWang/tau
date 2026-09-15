# Provider 设置 v2 迁移 / Provider settings v2 migration

## 变更内容(What changed)

[原文]
Tau now writes `~/.tau/providers.json` as a versioned, preferences-only document.
The effective provider catalog remains the source of truth for model lists,
context windows, transports, model metadata, and thinking capabilities.

[译文]
Tau 现在把 `~/.tau/providers.json` 写为带版本的、仅含偏好的文档。有效 provider 目录仍是模型列表、上下文窗口、传输方式、模型元数据与 thinking 能力的唯一事实来源。

[原文]
When Tau loads the old `providers` array format, it immediately:

[译文]
当 Tau 加载旧式的 `providers` 数组格式时,它会立即:

[原文]
1. loads the current bundled catalog plus the user's catalog overlay;
2. rebuilds known providers from those current definitions;
3. copies only runtime preferences such as the selected model, headers, retry
   settings, and valid per-model thinking defaults;
4. moves providers absent from the catalog into `~/.tau/catalog.toml`;
5. atomically rewrites `providers.json` with `schema_version: 2`; and
6. retains the original file as `providers.json.bak`.

[译文]
1. 加载当前随包目录与用户的目录叠加层;
2. 用这些当前定义重建已知 provider;
3. 只复制运行时偏好,例如所选模型、headers、重试设置与合法的按模型 thinking 默认值;
4. 把目录中不存在的 provider 移入 `~/.tau/catalog.toml`;
5. 以 `schema_version: 2` 原子重写 `providers.json`;并
6. 把原始文件保留为 `providers.json.bak`。

[原文]
Stale scoped-model and thinking-default references are removed during migration.

[译文]
过期的 scoped-model 与 thinking 默认值引用会在迁移期间被移除。

[原文]
Provider catalogs also support additive `removed_models` tombstones. Tau applies
them after merging built-in and user catalogs, removing matching model,
context-window, metadata, thinking, and default references. This handles stale
user overlays that were written before Tau stopped advertising a model for a
provider. The first tombstone removes the API-only `gpt-5.6` alias from
`openai-codex` without affecting `openai:gpt-5.6`.

[译文]
Provider 目录还支持增量式的 `removed_models` 墓碑标记。Tau 在合并内置目录与用户目录之后应用它们,移除匹配的模型、上下文窗口、元数据、thinking 与默认值引用。这处理了那些在「Tau 停止为某 provider 公布某模型」之前写入的陈旧用户叠加层。第一个墓碑标记从 `openai-codex` 中移除了仅限 API 的 `gpt-5.6` 别名,而不影响 `openai:gpt-5.6`。

## 为什么(Why)

[原文]
Legacy settings stored complete snapshots of built-in providers. A later Tau
release could add a model while the old snapshot still supplied an outdated
`thinking_models` list or other capability metadata. The model would then appear
to have unavailable thinking controls despite the bundled catalog supporting
it.

[译文]
旧式设置保存的是内置 provider 的完整快照。后续的 Tau 版本可能新增了一个模型,而旧快照仍提供过期的 `thinking_models` 列表或其他能力元数据。于是即使随包目录支持该模型,它也会看起来缺少可用的 thinking 控件。

[原文]
Provider definitions and user preferences have different lifecycles. Catalog
metadata should update with Tau, while preferences should survive updates. The
v2 boundary makes that ownership explicit and avoids silently moving stale
built-in snapshots into a user catalog overlay.

[译文]
Provider 定义与用户偏好有不同的生命周期。目录元数据应随 Tau 更新,而偏好应在更新中存活。v2 边界明确了这种所有权,并避免把陈旧的内置快照静默搬进用户目录叠加层。

## 架构(Architecture)

[原文]
This stays in `tau_coding`, the application configuration layer. `tau_ai` and
`tau_agent` remain independent of user file locations and migration policy.
Runtime provider objects are still assembled from catalog definitions plus
preferences before they reach the provider streaming layer.

[译文]
这留在 `tau_coding`,即应用配置层。`tau_ai` 与 `tau_agent` 仍独立于用户文件位置与迁移策略。运行时 provider 对象仍在到达 provider 流式层之前,由目录定义加偏好组装而成。

## 验证(Validation)

[原文]
Run:

[译文]
运行:

```bash
uv run pytest tests/test_provider_config.py
uv run pytest
uv run ruff check .
uv run ruff format --check .
uv run mypy
```

[原文]
For a manual check, start Tau with a legacy `providers.json` containing stale
built-in model or thinking metadata. The current catalog capabilities should be
available, the file should become schema v2, and the untouched legacy document
should remain in `providers.json.bak`.

[译文]
手动检查:用一个包含陈旧内置模型或 thinking 元数据的旧式 `providers.json` 启动 Tau。当前目录能力应当可用,该文件应变为 schema v2,而未被动过的旧文档应保留在 `providers.json.bak` 中。
