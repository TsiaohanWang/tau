# Tau 发布流程 / Tau release process

[原文]
Tau is published to PyPI as `tau-ai`. Publishing is intentionally tied to a
release decision, not to every commit that lands on `main`.

[译文]
Tau 以 `tau-ai` 发布到 PyPI。发布被有意绑定到一次发布决策,而不是每一个落到 `main` 的提交。

## 普通 `main` 提交会运行什么(What runs on ordinary `main` commits)

[原文]
Ordinary commits merged to `main` run validation workflows, documentation
builds, and other checks, but they do not create a PyPI release.

[译文]
合并到 `main` 的普通提交会运行校验工作流、文档构建与其他检查,但不会创建 PyPI 发布。

[原文]
The PyPI workflow publishes only when a maintainer publishes a GitHub Release.
This keeps package uploads tied to an explicit release action instead of a
routine merge to `main`.

[译文]
只有维护者发布 GitHub Release 时,PyPI 工作流才会发布。这使包上传绑定到显式的发布动作,而不是例行合并到 `main`。

## 版本的唯一事实来源(Version source of truth)

[原文]
The package version lives in `pyproject.toml`:

[译文]
包版本位于 `pyproject.toml`:

```toml
[project]
version = "0.1.0"
```

[原文]
A production release starts by intentionally changing that value.

[译文]
一次生产发布从有意修改该值开始。

## 如何发布一个版本(How to publish a release)

[原文]
1. Choose the next version number.
2. Update `[project].version` in `pyproject.toml` and any checked-in version
   constants that back `tau --version`.
3. Run the release checks locally, for example:

   ```bash
   uv run pytest
   uv run ruff check .
   uv run mypy
   ```

4. Open a PR with the version bump and release notes.
5. Merge the PR to `main` after checks pass.
6. Create and publish a GitHub Release from `main` using a tag that matches the
   package version, for example `v0.1.1`.
7. The `Publish Python package` workflow runs from the published GitHub Release
   and uploads the package to PyPI.
8. Verify the release at <https://pypi.org/project/tau-ai/>.

[译文]
1. 选择下一个版本号。
2. 更新 `pyproject.toml` 中的 `[project].version`,以及任何为 `tau --version` 提供支撑的、已提交的版本常量。
3. 在本地运行发布检查,例如:

   ```bash
   uv run pytest
   uv run ruff check .
   uv run mypy
   ```

4. 提交包含版本升级与发布说明的 PR。
5. 检查通过后把该 PR 合并到 `main`。
6. 从 `main` 创建并发布一个 GitHub Release,使用的 tag 与包版本一致,例如 `v0.1.1`。
7. `Publish Python package` 工作流由已发布的 GitHub Release 触发,把包上传到 PyPI。
8. 在 <https://pypi.org/project/tau-ai/> 验证该发布。

[原文]
Do not rely on the version-bump PR merge alone to publish the package. The
release is intentionally triggered by publishing the GitHub Release.

[译文]
不要仅依靠合并版本升级 PR 来发布包。发布是被「发布 GitHub Release」这个动作有意触发的。

## 重复版本保护(Duplicate-version protection)

[原文]
Before publishing, confirm that the package name and version do not already
exist on PyPI. PyPI does not allow replacing an existing file for the same
version, so a duplicate upload must be fixed with a new version number.

[译文]
发布之前,确认该包名与版本尚未存在于 PyPI。PyPI 不允许替换同一版本下已存在的文件,因此重复上传必须用一个新的版本号来修正。

## 安全的失败行为(Safe failure behavior)

[原文]
If `pyproject.toml` changes without a GitHub Release, or a normal `main` commit
lands without a release being published, the workflow does not publish. This
keeps package versions meaningful and makes the production release process easy
to audit.

[译文]
如果 `pyproject.toml` 发生了变化但没有 GitHub Release,或者普通 `main` 提交落地而没有发布 Release,工作流都不会发布。这让包版本保持有意义,并让生产发布流程易于审计。
