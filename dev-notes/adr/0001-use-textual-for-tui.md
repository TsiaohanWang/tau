---
title: "ADR 0001 — Use Textual for the interactive TUI / ADR 0001 —— 交互式 TUI 采用 Textual"
---

## 状态(Status)

[原文]
Accepted for future phases.

[译文]
已接受,适用于后续阶段。

## 背景(Context)

[原文]
Tau needs an interactive terminal UI, but the reusable agent harness must stay independent of frontend frameworks.

[译文]
Tau 需要一个交互式终端 UI,但可复用的 agent harness 必须与前端框架保持独立。

## 决策(Decision)

[原文]
Use Textual for the full interactive TUI after the core loop, tools, sessions, and print-mode CLI are stable.
Textual will live behind an adapter boundary that consumes agent events.

```text
AgentHarness emits events
        ↓
UI adapter consumes events
        ↓
Textual app renders chat, tool, and status components
```

[译文]
在核心循环、工具、会话与 print 模式 CLI 稳定之后,使用 Textual 构建完整的交互式 TUI。
Textual 将位于一层消费 agent 事件的适配器边界之后。

```text
AgentHarness 发出事件
        ↓
UI 适配器消费事件
        ↓
Textual 应用渲染对话、工具与状态组件
```

## 后果(Consequences)

[原文]
- `tau_agent` must not depend on Textual.
- Early phases will use simple print mode and Rich renderers first.
- Textual widgets can evolve without changing the core agent loop.

[译文]
- `tau_agent` 不得依赖 Textual。
- 早期阶段会先使用简单的 print 模式与 Rich 渲染器。
- Textual 组件的演进不需要改动核心 agent 循环。
