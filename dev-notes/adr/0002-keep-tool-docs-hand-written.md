---
title: "ADR 0002 — Keep built-in tool docs hand-written for now / ADR 0002 —— 暂时保持内置工具文档为手写"
---

## 状态(Status)

[原文]
Accepted.

[译文]
已接受。

## 背景(Context)

[原文]
The built-in coding tools in `src/tau_coding/tools.py` have detailed Python
docstrings, and Tau also has beginner-friendly tool documentation in
`docs/03-tools.md`.

[译文]
`src/tau_coding/tools.py` 中的内置编码工具带有详细的 Python docstring,同时 Tau 在 `docs/03-tools.md` 里也有一份面向初学者的工具文档。

[原文]
This creates some duplication. A generated API reference, for example through
`mkdocstrings`, could reduce drift between code and documentation by rendering
factory docstrings such as `create_read_tool_definition()` and
`create_bash_tool_definition()` directly into the docs site.

[译文]
这造成了一定的重复。而通过 `mkdocstrings` 之类的工具生成 API 参考,可以把 `create_read_tool_definition()`、`create_bash_tool_definition()` 等工厂函数的 docstring 直接渲染进文档站点,从而减少代码与文档之间的漂移。

[原文]
Tau's docs currently serve two different audiences:

- users and frontend authors who need to understand tool behavior, arguments,
  results, errors, and examples
- Python contributors who need API-level details about factory functions and
  implementation boundaries

[译文]
Tau 的文档目前服务两类不同读者:

- 需要理解工具行为、参数、结果、错误与示例的用户和前端作者
- 需要了解工厂函数与实现边界的 API 级细节的 Python 贡献者

## 决策(Decision)

[原文]
Keep `docs/03-tools.md` as the source of truth for user-facing built-in tool
behavior for now. Keep the Python docstrings as contributor-facing API
documentation, but do not add generated API pages to the MkDocs build yet.

[译文]
暂时仍以 `docs/03-tools.md` 作为面向用户的内置工具行为的事实来源。Python docstring 继续作为面向贡献者的 API 文档,但暂不把自动生成的 API 页面加入 MkDocs 构建。

[原文]
Generated API documentation can be added later if Tau needs a formal API
reference. When that happens, it should supplement the conceptual docs rather
than replace them.

[译文]
如果 Tau 日后需要正式的 API 参考,可以再引入自动生成的 API 文档。届时它应当作为概念文档的补充,而不是替代品。

## 理由(Rationale)

[原文]
Hand-written tool docs are still the clearest way to explain behavior that is
important to agent users:

- which tool to choose for common coding tasks
- JSON argument shape and validation rules
- truncation behavior and continuation hints
- result metadata that TUI and logging layers may consume
- examples and practical error cases

[译文]
对于 agent 用户关心的行为,手写工具文档仍然是解释得最清楚的方式:

- 常见编码任务该选哪个工具
- JSON 参数形态与校验规则
- 截断行为与续读提示
- TUI 与日志层可能消费的结果元数据
- 示例与真实错误场景

[原文]
Factory docstrings are useful, but they read like API reference material. They
do not replace examples, behavior notes, or the beginner-friendly explanation
that Tau needs while the architecture is still evolving.

[译文]
工厂函数的 docstring 很有用,但它们读起来像 API 参考材料,无法替代示例、行为说明,以及架构仍在演进期间 Tau 所需要的初学者友好解释。

[原文]
Adding `mkdocstrings` now would also expand the documentation build surface:
new dependencies, plugin configuration, import-time behavior during strict docs
builds, and a new failure mode in CI. That tradeoff is not justified while the
public API is still small and the hand-written docs are explicit.

[译文]
现在引入 `mkdocstrings` 还会扩大文档构建面:新增依赖、插件配置、严格文档构建时的导入期行为,以及 CI 中新的失败模式。在公共 API 仍然很小、手写文档也已足够明确的情况下,这个取舍并不划算。

## 未来 API 参考的要求(Future API reference requirements)

[原文]
If Tau later adopts generated docstring documentation, the generated pages
should:

- live under a separate API Reference section
- include `ToolDefinition`, `create_coding_tools()`, and individual factory
  functions such as `create_read_tool_definition()`
- avoid replacing `docs/03-tools.md`
- keep examples and behavior notes in hand-written conceptual pages
- run in `mkdocs build --strict` without importing provider configuration,
  reading user files, or requiring optional runtime setup

[译文]
如果 Tau 日后采用自动生成的 docstring 文档,生成的页面应当:

- 位于独立的 API Reference 板块
- 覆盖 `ToolDefinition`、`create_coding_tools()`,以及 `create_read_tool_definition()` 等各个工厂函数
- 不替代 `docs/03-tools.md`
- 把示例与行为说明保留在手写的概念页面中
- 能在 `mkdocs build --strict` 下运行,且不导入 provider 配置、不读取用户文件、不要求可选的运行时初始化

## 后果(Consequences)

[原文]
- Tool behavior changes must update both relevant docstrings and
  `docs/03-tools.md` when the user-visible contract changes.
- CI stays simple because the docs build remains markdown-only.
- A future generated API reference can be introduced as a separate docs feature
  without changing the current user docs structure.

[译文]
- 当用户可见契约变化时,工具行为变更必须同时更新相关 docstring 与 `docs/03-tools.md`。
- 文档构建仍然只处理 Markdown,因此 CI 保持简单。
- 未来的自动生成 API 参考可以作为独立的文档特性引入,无需改动现有用户文档结构。
