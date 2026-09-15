---
title: "Contributing / 参与贡献"
description: "How Tau is developed, where the build journals live, and how to run the project locally. / Tau 如何开发、构建日志放在哪里,以及如何在本地运行这个项目。"
type: doc
---

[原文]
Tau is built in small, documented phases — partly to ship a usable agent, partly
so the codebase reads as a teaching example of how a coding agent is assembled.

[译文]
Tau 以一个个小而可记录文档的阶段来构建 —— 一半是为了交付一个可用的 agent,一半是为了让这份代码库读起来像「编码 agent 如何组装」的教学示例。

## 构建日志(The build journals)

[原文]
The detailed, phase-by-phase implementation notes, design docs, and architecture
decision records live **in the repository**, under `dev-notes/`:

[译文]
详细的、按阶段记录的实现笔记、设计文档与架构决策记录都**在仓库里**,位于 `dev-notes/` 之下:

[原文]
- `dev-notes/design/` — the high-level design docs (`00-roadmap`, `01-architecture`, …).
- `dev-notes/architecture/` — per-phase build notes (`phase-1` … `phase-24`), each
  answering: what was added, why it exists, how later phases use it.
- `dev-notes/adr/` — architecture decision records.

[译文]
- `dev-notes/design/` —— 高层设计文档(`00-roadmap`、`01-architecture`……)。
- `dev-notes/architecture/` —— 各阶段的构建笔记(`phase-1` … `phase-24`),每篇都回答:新增了什么、为什么需要它、后续阶段如何使用它。
- `dev-notes/adr/` —— 架构决策记录。

[原文]
These are intentionally **not** published on this site — they're contributor
material. The published docs distill the result; see
[How Tau works]({{< relref "./internals/architecture.md" >}}).

[译文]
它们有意**不**发布在本站点上 —— 那是贡献者材料。已发布的文档只提炼结果;见 [Tau 如何工作]({{< relref "./internals/architecture.md" >}})。

## 路线图(Roadmap)

[原文]
The published, phase-by-phase roadmap and status lives on the
[roadmap page]({{< relref "./roadmap.md" >}}). The underlying checklist is
tracked in [GitHub issue #1](https://github.com/huggingface/tau/issues/1).

[译文]
公开发布的、按阶段划分的路线图与状态在[路线图页面]({{< relref "./roadmap.md" >}})。底层的清单追踪于 [GitHub issue #1](https://github.com/huggingface/tau/issues/1)。

## 在本地运行项目(Running the project locally)

```bash
git clone https://github.com/huggingface/tau.git
cd tau
uv sync --dev
uv run tau --version
```

[原文]
Checks:

[译文]
检查:

```bash
uv run pytest
uv run ruff check .
uv run ruff format --check .
uv run mypy
```

## 文档站点(The docs site)

[原文]
The site (this site) is a [Hugo](https://gohugo.io/) project under `website/`:

[译文]
本站点是一个位于 `website/` 下的 [Hugo](https://gohugo.io/) 项目:

```bash
cd website
hugo server -D    # http://localhost:1313/
hugo --minify     # static output in website/public/
```

[原文]
User-facing docs live in `website/content/`; the landing and "Why Tau?" pages
are `website/content/_index.md` and `website/content/why-tau.md`, rendered by
templates in `website/layouts/`. Code blocks on documentation pages include a
keyboard-focusable **Copy** button. Copy success or clipboard failures are also
announced to assistive technology.

[译文]
面向用户的文档位于 `website/content/`;落地页与「Why Tau?」页面分别是 `website/content/_index.md` 与 `website/content/why-tau.md`,由 `website/layouts/` 中的模板渲染。文档页面上的代码块带有一个可键盘聚焦的 **Copy** 按钮。复制成功或剪贴板失败也会向辅助技术播报。

## 文档要求(Documentation expectations)

[原文]
Each substantial phase should leave beginner-friendly notes in `dev-notes/`
explaining what was added, why it exists, how it maps to [Pi](https://pi.dev)'s
design, and how to test or use it. When a feature is user-facing, also update or
add the relevant page under `website/content/`.

[译文]
每个实质性阶段都应在 `dev-notes/` 留下对初学者友好的笔记,解释新增了什么、为什么需要它、它如何对应 [Pi](https://pi.dev) 的设计,以及如何测试或使用它。当某项功能面向用户时,还要更新或新增 `website/content/` 下相应的页面。
