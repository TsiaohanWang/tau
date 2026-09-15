# 项目信任运行时 / Project-trust runtime

[原文]
Issue #535 adds a `tau_coding` input-loading guard around ambient project
resources. The accepted policy and Pi compatibility research remain in
`dev-notes/design/project-trust.md`.

[译文]
Issue #535 为环境中的项目资源加入了一道 `tau_coding` 输入加载守卫。已采纳的策略与 Pi 兼容性调研记录在 `dev-notes/design/project-trust.md`。

## 运行时形态(Runtime shape)

[原文]
- `project_trust.py` owns typed requests/resolutions, strict cwd
  canonicalization, metadata-only detection, precedence, per-cwd caching, and
  the locked version-1 atomic store.
- `TauResourcePaths.project_resources_enabled` creates one coherent resource
  plan. Existing skill, prompt, context, system-prompt, theme, and extension
  loaders consume that plan rather than implementing policy.
- `CodingSession.load` imports only user/explicit extensions first, resolves
  trust, then loads protected Markdown/JSON and opted-in project extensions.
- CLI entry points supply the user-global default and invocation override.
  Structured/headless modes use no prompt. The TUI adapts the frontend-neutral
  request to an accessible Textual modal.
- Reload and destination replacement stage fresh cwd-bound extension runtimes,
  resources, tools, commands, prompts, and trust-cache entries before adoption.
  Resource plans are unconditionally rebound to the canonical destination;
  source-project registrations never cross cwd boundaries. Cancellation or any
  preparation failure keeps the current snapshot and prior coordinator cache.

[译文]
- `project_trust.py` 持有带类型的请求/决议、严格的 cwd 规范化、仅元数据的检测、优先级、按 cwd 的缓存,以及加锁的 version-1 原子存储。
- `TauResourcePaths.project_resources_enabled` 会生成一份一致的资源计划。既有的技能、提示词、上下文、系统提示词、主题与扩展加载器消费该计划,而不是各自实现策略。
- `CodingSession.load` 先只导入用户/显式扩展,再解析信任,然后加载受保护的 Markdown/JSON 与已选择启用的项目扩展。
- CLI 入口提供用户全局默认值与本次调用的覆盖值。结构化/无头模式不使用提示。TUI 把前端无关的请求适配为可访问的 Textual 模态框。
- Reload 与目标替换会在采纳之前暂存新的、绑定 cwd 的扩展运行时、资源、工具、命令、提示词与信任缓存条目。资源计划会无条件重新绑定到规范目标;源项目的注册绝不会跨越 cwd 边界。取消或任何准备失败都会保留当前快照与先前的协调器缓存。

[原文]
`tau_agent` has no trust, path, Typer, or Textual dependency. Textual remains in
`tau_coding.tui`.

[译文]
`tau_agent` 不依赖信任、路径、Typer 或 Textual。Textual 仍留在 `tau_coding.tui`。

## 持久化与失败行为(Persistence and failure behavior)

[原文]
`~/.tau/trust.json` has `version` and sorted `decisions`. Reads reject unknown
fields/versions, duplicate or relative/non-normalized paths, and unknown
values. Updates lock the store and first durably install a mode-0600 undo journal,
then write/fsync a same-directory temporary file, replace `trust.json`, and fsync
the directory. Readers reject any store with a pending journal. The journal is
removed only after the destination commit point; failures attempt restoration,
and a failed restoration leaves the journal in place so even combined commit and
recovery failures cannot expose newly granting bytes. Journal-cleanup fsync
failure is safe in either durable outcome: the committed store remains visible,
or the journal reappears and reads fail closed. Errors diagnose and fail closed;
run-only explicit approval does not depend on storage.

[译文]
`~/.tau/trust.json` 包含 `version` 与排好序的 `decisions`。读取会拒绝未知字段/版本、重复或相对/未规范化的路径,以及未知取值。更新会先锁住存储,持久化地安装一个权限为 0600 的撤销日志(undo journal),然后写入并 fsync 一个同目录临时文件,替换 `trust.json`,再 fsync 目录。读取方会拒绝任何存在未完成日志的存储。日志只在目标提交点之后才被移除;失败时会尝试恢复,而恢复失败会把日志留在原处,因此即使「提交 + 恢复」同时失败,也不会暴露新授予的字节。日志清理的 fsync 失败在两种持久化结果下都是安全的:要么已提交的存储仍然可见,要么日志重新出现且读取按「失败关闭」处理。错误会给出诊断并按失败关闭;仅本次运行的显式批准不依赖存储。

## 迁移(Migration)

[原文]
There is no legacy store. Existing projects are not auto-trusted. Interactive
users decide when protected candidates exist; unresolved headless `ask` skips
project inputs. User/global and explicit CLI resources continue to load.
`--project-extensions` remains an additional executable-code opt-in.

[译文]
没有旧式存储。既有项目不会被自动信任。是否存在受保护候选由交互式用户决定;无头模式下未决的 `ask` 会跳过项目输入。用户/全局与显式 CLI 资源继续加载。`--project-extensions` 仍是额外的可执行代码选择启用开关。

## 验证(Verification)

[原文]
Use temporary homes/projects and fake extensions/providers. Run:

[译文]
使用临时的 home/项目以及假扩展/provider。运行:

```bash
uv run pytest
uv run ruff check .
uv run ruff format --check .
uv run mypy
cd website && hugo --minify
cd website && npx --yes pagefind@latest --site public
```

[原文]
Project trust is not a filesystem/process/network/tool/model sandbox.

[译文]
项目信任不是文件系统/进程/网络/工具/模型的沙箱。
