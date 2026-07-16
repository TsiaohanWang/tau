---
title: tau_agent · 公共导出与边界
description: __init__.py 与 tau_ai 的边界
---

## `tau_agent/__init__.py` — 公共导出面

这个文件把 `tau_agent` 所有公开符号集中 re-export，并写进 `__all__`。分组看：

- **事件**（`events.py`）：14 个 `AgentEvent` 子类 + `AgentEvent` 联合类型。
- **harness**（`harness.py`）：`AgentHarness`、`AgentHarnessConfig`、
  `SimpleCancellationToken`、`QueuedMessages`、`EventListener`。
- **循环**（`loop.py`）：`run_agent_loop`。
- **消息**（`messages.py`）：`AgentMessage`、`UserMessage`、`AssistantMessage`、
  `ToolResultMessage`、`Usage`、`UsageCost`。
- **会话树**（`session/*`）：`SessionEntry` 及各具体节点（`MessageEntry`、
  `ModelChangeEntry`、`ThinkingLevelChangeEntry`、`CompactionEntry`、
  `BranchSummaryEntry`、`LabelEntry`、`LeafEntry`、`SessionInfoEntry`、
  `CustomEntry`）、`SessionState`、`JsonlSessionStorage`。
- **工具**（`tools.py`）：`AgentTool`、`AgentToolResult`、`ToolCall`、`ToolExecutor`、
  `ToolUpdateCallback`、`ToolCallRenderer`、`ToolResultRenderer`。
- **类型**（`types.py`）：`JSONValue`、`JSONPrimitive`、`JSONObject`。

外部（尤其是 `tau_coding`）几乎永远只 `from tau_agent import ...`，不直接 import
子模块——这让 `tau_agent` 的包边界清晰、稳定。

---

## `tau_agent` 与 `tau_ai` 的边界

把前面读过的代码串起来，依赖关系如下：

```
tau_coding  ──►  tau_agent  ──►  tau_ai
 (CLI/TUI)      (大脑/状态)      (provider)
```

关键事实（已在源码中确认）：

1. **`tau_ai` 反向 import `tau_agent`**：`tau_ai/provider.py` 的
   `ModelProvider.stream_response` 的签名里直接用了 `tau_agent.messages.AgentMessage`
   和 `tau_agent.tools.AgentTool`；`tau_ai/events.py` 的 `ProviderToolCallEvent` 携带
   `tau_agent.tools.ToolCall`；各 provider 文件的 import 顶部都 `from tau_agent.messages
   import ...`、`from tau_agent.tools import ...`。
   —— 即 `tau_ai` 把"消息/工具"当作**纯数据结构**来接收，不依赖 agent 的行为。

2. **`tau_agent` 向上只依赖 `tau_ai` 的协议与事件**：`tau_agent/loop.py` 只 import
   `tau_ai.provider` 的 `ModelProvider`/`CancellationToken`（两个 Protocol）和
   `tau_ai.events` 的 `ProviderEvent` 子类；`tau_agent/harness.py` 同样只 import
   `tau_ai.provider.ModelProvider`。它**从不** import 任何具体 provider 类
   （`OpenAICompatibleProvider` 等），也从不碰 HTTP。

3. **所以真正的单向数据流是**：
   - `tau_ai` 提供"把模型响应变成 `ProviderEvent` 流"的能力（依赖 `tau_agent` 的数据类型）；
   - `tau_agent` 消费 `ProviderEvent`、产出 `AgentEvent`、维护 transcript 与持久化
     （只认 `tau_ai` 的 Protocol，不认具体实现）；
   - `tau_coding` 把具体 provider 实例（实现 `ModelProvider`）注入 `AgentHarness`，并
     把 `AgentEvent` 接到 CLI/TUI/工具上。

这种"**下层 import 上层的数据类型，但上层只认下层的 Protocol**"的安排，让 `tau_agent`
在单元测试里能用 `FakeProvider`（Part 1b）完全替代真实网络，也让 `tau_ai` 可以独立
演进各家 API 而不波及 agent 逻辑。正是 AGENTS.md 里强调的"保持核心 agent 包独立于
CLI、Textual、Rich、会话文件位置、应用特定资源加载"。

---

## 本部分小结

- `tau_agent/__init__.py` 是 `tau_agent` 的"门面"，集中导出事件、harness、循环、
  消息、会话树、工具、类型七类符号。
- 依赖边界的核心：**`tau_ai` import `tau_agent` 的数据类型；`tau_agent` import
  `tau_ai` 的 Protocol + 事件**。二者通过"数据类型下沉、行为用 Protocol 抽象"解耦。

至此整个 `tau_agent` 讲解完毕。下一任务（Part 3a）进入最上层 `tau_coding`，先看它
的"工具与提示"子集：`tools.py`（read/write/edit/bash）、`system_prompt.py`、
`context*.py`、`skills.py`、`resources.py`。

<!-- NAV -->
[← tau_agent · 会话持久化树]({{< relref "./agent-session-tree.md" >}})
[↑ 总览]({{< relref "./source-walkthrough.md" >}})
[→ tau_coding · 工具与提示组装]({{< relref "./coding-tools-prompt.md" >}})
