---
title: How Tau works
description: 源码剖析：从底层到上层，逐文件解读 Tau 的每一处设计。
build:
  list: false
  render: false
cascade:
  type: doc
---

本节是 Tau 源码的**逐文件剖析**，基于对 `huggingface/tau` Python 仓库的实际阅读，
而非官方文档的复述。每一章对应一个或一组源文件，解释"这段代码做了什么、为什么这样设计"。

## 建议阅读顺序

Tau 分为三层，阅读顺序**从底层到上层**：

### 先决条件

| 页 | 内容 |
|---|---|
| [Architecture overview]({{< relref "./architecture.md" >}}) | 三层拆分与依赖方向 |
| [Design principles]({{< relref "./design-principles.md" >}}) | "Small layers beat magic"等核心原则 |

### tau_ai — 与模型对话

| 页 | 内容 |
|---|---|
| [Provider contract & events]({{< relref "./ai-provider-events.md" >}}) | `ModelProvider` Protocol、`AssistantMessageEvent` 流、token 计费 |
| [Env configuration]({{< relref "./ai-env-config.md" >}}) | `providers.json`、环境变量、`OpenAICompatibleConfig` |
| [Provider implementations]({{< relref "./ai-providers.md" >}}) | OpenAI/Anthropic/Gemini/Copilot/OpenCode 各 provider 实现 |

### tau_agent — agent 内核

| 页 | 内容 |
|---|---|
| [Data models]({{< relref "./agent-models.md" >}}) | `AgentMessage` 联合类型、`AssistantMessage`、`ToolCall`、`Usage` |
| [Loop & harness]({{< relref "./agent-loop-harness.md" >}}) | `run_agent_loop` 循环、`AgentHarness` 状态管理、事件广播 |
| [Session tree]({{< relref "./agent-session-tree.md" >}}) | 追加式条目、`SessionState` 重放、JSONL 持久化 |
| [Init & boundary]({{< relref "./agent-init-boundary.md" >}}) | `__init__.py` 公共导出、`tau_agent` 与 `tau_ai` 的单向依赖 |
| [The agent loop (概念)]({{< relref "./agent-loop.md" >}}) | 概念层总结 |

### tau_coding — coding agent 应用

| 页 | 内容 |
|---|---|
| [Tools & prompt]({{< relref "./coding-tools-prompt.md" >}}) | read/write/edit/bash 工具、system prompt 组装 |
| [CodingSession]({{< relref "./coding-session.md" >}}) | 会话核心：`prompt()`/`continue_()`/`apply_diff()` |
| [Slash commands]({{< relref "./coding-commands.md" >}}) | `/login`、`/model`、`/help` 等命令实现 |
| [Session manager]({{< relref "./coding-session-manager.md" >}}) | 多会话切换、JSONL 存储 |
| [Provider config]({{< relref "./coding-provider-config.md" >}}) | 运行时 provider 构建、凭证读取 |
| [TUI state & adapter]({{< relref "./coding-tui-state.md" >}}) | Textual 状态管理、事件→UI 适配 |
| [TUI app & widgets]({{< relref "./coding-tui-app.md" >}}) | Textual App、侧边栏、消息组件 |
| [Credentials]({{< relref "./coding-credentials.md" >}}) | `credentials.json`、`FileCredentialStore` |
| [OAuth flows]({{< relref "./coding-oauth.md" >}}) | Codex/Anthropic/Copilot 三种 OAuth 流 |
| [CLI]({{< relref "./coding-cli.md" >}}) | Click CLI 入口、print/json/TUI 三种模式 |
| [Extensions]({{< relref "./coding-extensions.md" >}}) | 扩展发现、加载、生命周期 |
| [Rendering layer]({{< relref "./coding-rendering.md" >}}) | `EventRenderer`、Rich 渲染、终端输出 |
| [Rendering (print/json)]({{< relref "./coding-rendering-print.md" >}}) | `FinalTextRenderer`、`JsonEventRenderer` |
| [Support modules (1)]({{< relref "./coding-support-1.md" >}}) | 路径、资源、日志、异常 |
| [Support modules (2)]({{< relref "./coding-support-2.md" >}}) | TUI 资源、技能、上下文管理 |

### 其他

| 页 | 内容 |
|---|---|
| [Build your own frontend]({{< relref "./custom-frontend.md" >}}) | 用 `CodingSession` API 构建自定义前端 |
| [Source code walkthrough]({{< relref "./source-walkthrough.md" >}}) | 总览导航页 |

---

## 术语表（Glossary）

| 术语 | 含义 |
|---|---|
| **AgentEvent** | `tau_agent` 定义的事件联合类型，agent 循环通过 `yield` 逐个产出，UI 层消费 |
| **AgentHarness** | 可复用的有状态 agent "大脑"，持有 transcript，独立于 CLI/TUI |
| **AgentMessage** | transcript 中一条消息的联合类型：`UserMessage \| AssistantMessage \| ToolResultMessage \| ...` |
| **AssistantMessage** | 模型回复，包含 `content`（文本/思考/工具调用块）、`usage`、`stop_reason` |
| **CodingSession** | `tau_coding` 的会话核心，封装 harness + session manager + 工具注册 |
| **CodingSessionEvent** | 会话层事件联合类型，包含 `AgentEvent` + 会话层事件（如 `agent_settled`） |
| **ModelProvider** | `tau_agent` 定义的 Protocol，声明 `stream_response` 方法签名 |
| **OAuthCredential** | 可刷新的 OAuth 凭证 dataclass（`access`/`refresh`/`expires`） |
| **SessionState** | 不可变会话快照，由 `SessionEntry` 列表重放得到 |
| **ToolCall** | 模型发起的工具调用请求，出现在 `AssistantMessage.content` 中 |
| **WireModel** | Pydantic BaseModel 的严格版本（`extra="forbid"`），用于序列化/反序列化 |
| **stop_reason** | `AssistantMessage` 的结束原因：`"stop"` / `"tool_use"` / `"error"` / `"max_turns"` |
| **PKCE** | Proof Key for Code Exchange，OAuth 安全增强机制，防止授权码拦截 |
| **JSONL** | 每行一个 JSON 对象的文件格式，用于会话持久化 |
