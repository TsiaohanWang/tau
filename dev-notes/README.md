<!-- 组织方式:逻辑块按「[原文] → 空行 → [译文]」成对交替;纯代码/结构图仅保留原文一份 -->

# Tau 开发笔记 / Tau dev notes (contributor build-log)

[原文]
These are the internal, phase-by-phase build journals and design records for Tau.
They are **not** published on the docs site — they live here for contributors who
want to trace how the system was assembled.

[译文]
这些是 Tau 的内部资料:按阶段记录的构建日志与设计文档。它们**不会**发布到文档站点,而是留在仓库里,供希望追溯系统如何一步步组装起来的贡献者阅读。

[原文]
User-facing documentation lives in `website/content/` and is published at
<https://twotimespi.dev/>.

[译文]
面向用户的文档位于 `website/content/`,发布在 <https://twotimespi.dev/>。

## 目录(Contents)

[原文]
- `design/` — high-level design docs written alongside the build:
  - `00-roadmap.md` — phased roadmap
  - `01-architecture.md` — the three-layer split
  - `02-agent-loop.md` — agent loop responsibilities
  - `03-tools.md` — built-in tool design
  - `04-sessions.md` — session tree / persistence design
  - `05-core-types-and-events.md` — provider-neutral types and events
  - `project-trust.md` — researched, implementation-ready project-trust design
    (design only; enforcement is not implemented)
  - `agent-loop.md`, `harness.md` — harness/loop reference notes
- `architecture/` — per-phase implementation notes (`phase-1` … `phase-24`, plus
  hardening and feature notes). Each answers: what was added, why it exists, how
  later phases use it.
- `adr/` — architecture decision records.
- `catalog-model-safety.md` — checklist for adding providers and models to the built-in catalog safely.
- `google-stream-completion.md` — why native Google streams require an explicit
  `finishReason` before Tau reports successful completion.
- `startup-thinking-level-fallback.md` — why startup resolves a valid thinking
  level per model instead of assuming the global `medium` default.
- `models-dev-catalog.md` — Pi-compatible build-time models.dev catalog
  generation, offline fallback, and snapshot refresh workflow.
- `llama-cpp-phase-5.md` — built-in llama.cpp connection, safe state, `/local`,
  failure handling, and Phase 5 validation.
- `architecture/phase-6-local-inference-hardening.md` — second-backend contract
  validation, lifecycle hardening, migration, and security decisions.

[译文]
- `design/` —— 与构建过程同步编写的高层设计文档:
  - `00-roadmap.md` —— 分阶段路线图
  - `01-architecture.md` —— 三层拆分
  - `02-agent-loop.md` —— agent 循环的职责
  - `03-tools.md` —— 内置工具设计
  - `04-sessions.md` —— 会话树 / 持久化设计
  - `05-core-types-and-events.md` —— 与 provider 无关的类型和事件
  - `project-trust.md` —— 经过调研、可直接实施的项目信任(project trust)设计(仅设计;尚未实现强制执行)
  - `agent-loop.md`、`harness.md` —— harness / loop 参考笔记
- `architecture/` —— 各阶段的实现笔记(`phase-1` … `phase-24`,外加加固与功能说明)。每篇都回答三个问题:新增了什么、为什么需要它、后续阶段如何使用它。
- `adr/` —— 架构决策记录(ADR)。
- `catalog-model-safety.md` —— 安全地向内置目录(catalog)添加 provider 与模型的检查清单。
- `google-stream-completion.md` —— 为什么原生 Google 流式响应必须显式给出 `finishReason`,Tau 才会报告成功完成。
- `startup-thinking-level-fallback.md` —— 为什么启动时要为每个模型解析出有效的 thinking 等级,而不是假定全局默认值 `medium`。
- `models-dev-catalog.md` —— 与 Pi 兼容的构建期 models.dev 目录生成、离线回退与快照刷新流程。
- `llama-cpp-phase-5.md` —— 内置 llama.cpp 连接、安全状态、`/local`、失败处理以及 Phase 5 验证。
- `architecture/phase-6-local-inference-hardening.md` —— 第二后端(second backend)契约验证、生命周期加固、迁移与安全决策。

[原文]
The roadmap is tracked in [GitHub issue #1](https://github.com/huggingface/tau/issues/1).

[译文]
路线图追踪于 [GitHub issue #1](https://github.com/huggingface/tau/issues/1)。
