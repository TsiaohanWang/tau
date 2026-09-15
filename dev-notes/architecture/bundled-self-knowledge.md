# 随包分发的 Tau 自我知识 / Bundled Tau self-knowledge

[原文]
Tau follows Pi's progressive-disclosure approach to product knowledge. The default system prompt identifies installed documentation and examples, then routes Tau-specific requests to those files without loading them into every conversation.

[译文]
Tau 沿用 Pi 对产品知识的「渐进式披露」方式。默认系统提示词会指出已安装的文档与示例,然后把 Tau 相关的请求路由到这些文件,而不把它们加载进每一次对话。

## 打包资源(Packaged resources)

[原文]
Self-knowledge lives under `src/tau_coding/data/`:

```text
docs/       concise routing references and contributor workflows
examples/   readable extension examples
```

[译文]
自我知识位于 `src/tau_coding/data/` 之下:

```text
docs/       简洁的路由参考与贡献者工作流
examples/   可读的扩展示例
```

[原文]
The prompt points directly to extension creation, skills, custom and built-in providers/models, CLI commands, TUI behavior, and architecture. It tells the agent to read relevant documents and examples completely and follow their cross-references before implementing.

[译文]
提示词会直接指向扩展创建、技能、自定义与内置 provider/模型、CLI 命令、TUI 行为以及架构。它要求 agent 在动手实现之前,完整阅读相关文档与示例,并顺着它们的交叉引用继续查阅。

[原文]
Tau does not expose its own maintenance workflows as Agent Skills. Skills are user and project resources, so Tau's product documentation does not appear in the skills sidebar, compete with user skill names, or disappear when skill loading is disabled.

[译文]
Tau 不会把自己的维护工作流暴露为 Agent Skills。技能是用户与项目资源,因此 Tau 的产品文档不会出现在技能侧边栏、不会与用户技能名竞争,也不会在技能加载被禁用时消失。

## 为什么(Why)

[原文]
Repository `AGENTS.md` helps only when Tau is running inside its source checkout. Packaged documentation lets an installed Tau retain product knowledge without bloating the base prompt. Keeping that documentation separate from skills also preserves a clean user-owned skill namespace and matches Pi's design.

[译文]
仓库里的 `AGENTS.md` 只有在 Tau 运行于其源码检出目录时才起作用。随包分发的文档让已安装的 Tau 也能保有产品知识,而不会让基础提示词膨胀。把这份文档与技能分开,还能保持用户自有的技能命名空间干净,并与 Pi 的设计一致。

[原文]
The extension and model/provider documents contain the detailed workflows previously carried by the bundled `create-tau-extension` and `tau-model-catalog` skills. The packaged extension example remains available as a concrete starting point.

[译文]
扩展文档与模型/provider 文档包含了此前由随包技能 `create-tau-extension` 与 `tau-model-catalog` 承载的详细工作流。随包的扩展示例仍作为具体的起点保留。

## 架构(Architecture)

[原文]
Self-documentation belongs to `tau_coding`, not the portable `tau_agent` harness. `self_docs.py` resolves installed documentation and example paths, while `system_prompt.py` emits the routing hints. `TauResourcePaths` discovers only user and project skills. Hatch packages the documentation and examples as part of `tau_coding`.

[译文]
自我文档属于 `tau_coding`,而不是可移植的 `tau_agent` harness。`self_docs.py` 解析已安装文档与示例的路径,`system_prompt.py` 则发出路由提示。`TauResourcePaths` 只发现用户与项目技能。Hatch 会把文档与示例作为 `tau_coding` 的一部分打包。

## 验证(Verification)

```bash
uv run pytest tests/test_system_prompt.py tests/test_skills.py tests/test_resources.py tests/test_package_metadata.py
uv run pytest
uv run ruff check .
uv run ruff format --check .
uv run mypy
cd website && hugo --minify && npx --yes pagefind@latest --site public
```
