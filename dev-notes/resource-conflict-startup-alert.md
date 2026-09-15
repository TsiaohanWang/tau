# 资源冲突启动提示 / Resource conflict startup alert

## 变更内容(What changed)

[原文]
The TUI now turns existing skill and prompt-template override diagnostics into one red startup alert in the transcript. Each entry names the resource and shows the winning and shadowed paths. The sidebar also groups loaded skills and prompt templates by their user or project resource directory, shows every loaded resource, and scrolls its content independently when the groups overflow while keeping the Tau brand pinned.

[译文]
TUI 现在会把既有的技能与提示词模板覆盖诊断,转换成会话记录中的一条红色启动提示。每个条目都会指明资源,并显示胜出路径与被遮蔽路径。侧边栏还会按用户或项目资源目录对已加载技能与提示词模板分组,展示每一个已加载资源,并在各组溢出时让其内容独立滚动,同时保持 Tau 品牌标识固定。

## 为什么(Why)

[原文]
Tau supports user and project resources under both `.tau` and `.agents`. Precedence keeps duplicate names non-fatal, but the prior diagnostics were easy to miss. Surfacing conflicts at startup makes accidental shadowing visible without changing loading behavior.

[译文]
Tau 同时支持 `.tau` 与 `.agents` 下的用户与项目资源。优先级机制让重名不致命,但此前的诊断很容易被忽略。在启动时呈现冲突,可以让意外的遮蔽变得可见,同时不改变加载行为。

## 架构(Architecture)

[原文]
Resource discovery and precedence remain in `tau_coding.skills` and `tau_coding.prompt_templates`. The Textual adapter formats relevant `ResourceDiagnostic` values and adds display-only alert items. No TUI behavior enters `tau_agent`.

[译文]
资源发现与优先级仍留在 `tau_coding.skills` 与 `tau_coding.prompt_templates`。Textual 适配器格式化相关的 `ResourceDiagnostic` 值,并加入仅供显示的提示条目。没有 TUI 行为进入 `tau_agent`。

## 验证(Verification)

```bash
uv run pytest
uv run ruff check .
uv run ruff format --check .
uv run mypy
```
