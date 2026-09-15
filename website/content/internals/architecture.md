---
title: "Architecture overview / 架构总览"
description: "How Tau is split into three layers — and why that boundary is the whole point. / Tau 如何被拆成三层 —— 以及为什么这条边界就是全部意义所在。"
---

[原文]
Tau is deliberately small and layered. The most important design idea is a
**boundary**: the reusable agent "brain" knows nothing about terminals, file
paths, or rendering. Everything app-specific wraps around it.

[译文]
Tau 有意保持小巧与分层。最重要的设计思想是一条**边界**:可复用的 agent「大脑」不了解终端、文件路径或渲染。所有应用特有的东西都从外部包裹它。

## 三个包(Three packages)

[原文]
```text
tau_coding  →  tau_agent  →  tau_ai
```

[译文]
```text
tau_coding  →  tau_agent  →  tau_ai
```

### 与模型对话 / `tau_ai` — talking to models

[原文]
Owns provider-specific model streaming. It translates each provider's API
(OpenAI, Anthropic, …) into Tau's **provider-neutral event stream**, so nothing
above it has to care which model vendor is in use.

[译文]
持有与具体 provider 相关的模型流式处理。它把各 provider 的 API(OpenAI、Anthropic……)翻译成 Tau 的 **provider 无关事件流**,因此它之上的任何代码都不必关心正在使用哪家模型厂商。

### 可移植的大脑 / `tau_agent` — the portable brain

[原文]
Owns the reusable agent core: messages, tools, events, the
[agent loop]({{< relref "./agent-loop.md" >}}), the harness, and session primitives. This package
must **not** import CLI, Rich, Textual, or resource-loading code. That's what
keeps it portable.

[译文]
持有可复用的 agent 内核:消息、工具、事件、[agent 循环]({{< relref "./agent-loop.md" >}})、harness 以及会话原语。这个包**不得**导入 CLI、Rich、Textual 或资源加载代码。正是这一点让它保持可移植。

### 编码应用 / `tau_coding` — the coding application

[原文]
Owns everything that makes Tau a *coding agent you run*: the CLI, the built-in
[tools]({{< relref "../reference/tools.md" >}}), [project instructions]({{< relref "../guides/project-instructions.md" >}}),
[skills and prompts]({{< relref "../guides/skills-and-prompts.md" >}}),
[sessions on disk]({{< relref "../guides/sessions.md" >}}), provider configuration, and the
Textual TUI.

[译文]
持有让 Tau 成为「你能运行的编码 agent」的一切:CLI、内置[工具]({{< relref "../reference/tools.md" >}})、[项目指令]({{< relref "../guides/project-instructions.md" >}})、[技能与提示词]({{< relref "../guides/skills-and-prompts.md" >}})、[磁盘上的会话]({{< relref "../guides/sessions.md" >}})、provider 配置以及 Textual TUI。

### 本地后端边界(Local-backend boundary)

[原文]
Local inference belongs to `tau_coding`, not the portable agent core. A staged
extension runtime owns a source- and generation-aware local-backend registry
beside its provider registry. Backends return typed configuration, status,
progress, diagnostics, and capability values; the Textual adapter renders them
and owns cancellation, confirmation, and idle checks. Pairing each backend with
its exact source-owned provider layer prevents a shadowing extension from using
or resetting another source's integration. See the [local backends
guide]({{< relref "../guides/local-inference.md" >}}).

[译文]
本地推理属于 `tau_coding`,而不属于可移植的 agent 内核。暂存式扩展运行时在它的 provider 注册表旁边持有一个「感知来源与代际」的本地后端注册表。后端返回带类型的配置、状态、进度、诊断与能力值;Textual 适配器负责渲染它们,并持有取消、确认与空闲检查。把每个后端与它确切的、来源自有的 provider 层配对,可以防止某个遮蔽性扩展使用或重置另一个来源的集成。见[本地后端指南]({{< relref "../guides/local-inference.md" >}})。

[原文]
Phase 6 validates the boundary with a permanent second fake backend and a
test-only Ollama adapter. Provider discovery and backend status may use
separate endpoints, installed/running state fits generic model state, and
`NoAuth` needs no special-case backend API. Refresh cancellation is bounded and
generation-safe; late work cannot publish after retirement. Router mutations
remain a later phase.

[译文]
Phase 6 用一个常驻的第二假后端与一个仅用于测试的 Ollama 适配器验证了这条边界。Provider 发现与后端状态可以使用不同的端点;「已安装/运行中」状态契合通用的模型状态;`NoAuth` 不需要任何特例化的后端 API。刷新取消是有界的,并且对代际安全;退役之后迟到的任务无法再发布结果。Router 变更仍属于更靠后的阶段。

[原文]
TUI and print startup share the same trust-aware preparation boundary: load the
trusted built-ins and eligible extensions, restore safe dynamic snapshots,
resolve an explicit provider/model, then construct the candidate runtime. A
saved llama.cpp snapshot can therefore support explicit startup during server
downtime without making the local backend an implicit fallback.

[译文]
TUI 与 print 启动共享同一条「感知信任」的准备边界:加载受信内置项与符合条件的扩展、恢复安全的动态快照、解析显式的 provider/model,然后构建候选运行时。因此,在服务器停机期间,一份已保存的 llama.cpp 快照可以支撑一次显式启动,同时不会让本地后端成为隐式回退。

## 依赖方向(Dependency direction)

[原文]
Dependencies only point one way: `tau_coding → tau_agent → tau_ai`. UI code
*consumes* events; the core never reaches up to render anything. In one line:

[译文]
依赖只朝一个方向:`tau_coding → tau_agent → tau_ai`。UI 代码*消费*事件;内核永远不会向上伸手去渲染任何东西。一句话:

[原文]
```text
AgentHarness = reusable brain
CodingSession = coding-agent environment
TUI = one possible frontend
```

[译文]
```text
AgentHarness = reusable brain
CodingSession = coding-agent environment
TUI = one possible frontend
```

## 为什么这条边界重要(Why the boundary matters)

[原文]
Because the core is UI-free, the same agent can drive print mode, the Textual
TUI, or a frontend you build yourself — all by consuming the same event stream.
That's also what makes Tau readable: each layer answers one question, and you can
study it without untangling the others.

[译文]
因为内核不含 UI,同一个 agent 可以驱动 print 模式、Textual TUI,或你自己构建的前端 —— 全都通过消费同一条事件流。这也正是 Tau 可读的原因:每一层只回答一个问题,你可以单独研究它,而不必先把其他层解开。

[原文]
→ Next: [The agent loop & events]({{< relref "./agent-loop.md" >}}) ·
[Design principles]({{< relref "./design-principles.md" >}}) ·
[Build your own frontend]({{< relref "./custom-frontend.md" >}})

[译文]
→ 下一步:[Agent 循环与事件]({{< relref "./agent-loop.md" >}}) ·
[设计原则]({{< relref "./design-principles.md" >}}) ·
[构建你自己的前端]({{< relref "./custom-frontend.md" >}})

[原文]
{{% note title="Going deeper" %}}
The phase-by-phase build journals, design docs, and ADRs live in the repo under
`dev-notes/` (not on this site). See [Contributing]({{< relref "../contributing.md" >}}).
{{% /note %}}

[译文]
{{% note title="想更深入" %}}
按阶段记录的构建日志、设计文档与 ADR 位于仓库的 `dev-notes/` 下(不在本站点)。见[参与贡献]({{< relref "../contributing.md" >}})。
{{% /note %}}
