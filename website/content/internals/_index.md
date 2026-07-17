---
title: How Tau works
description: 源码剖析：从底层到上层，逐文件解读 Tau 的每一处设计。
build:
  list: false
cascade:
  type: doc
---

本节是 Tau 源码的**逐文件剖析**，基于对 `huggingface/tau` Python 仓库的实际阅读，
而非官方文档的复述。每一章对应一个或一组源文件，解释"这段代码做了什么、为什么这样设计"。

## 与 Pi 的关系

Tau 的架构直接借鉴了 [Pi](https://pi.dev)——一个由 [Earendil Inc.](https://earendil.com) 开发的 TypeScript 编码智能体。Pi 以其极简的三层分离著称：

```text
AgentHarness = 可复用的大脑（纯 agent 逻辑，不依赖 UI）
AgentSession = 编码会话环境（工具、持久化、资源）
TUI          = 一个可能的前端（终端界面只是消费事件的消费者之一）
```

Tau 用 Python 重新实现了这套架构，保留了相同的核心边界：`tau_agent` 对应 Pi 的 AgentHarness，`tau_coding` 对应 AgentSession + TUI。项目 README 明确标注"inspired by [Pi](https://pi.dev)"，`AGENTS.md` 也写道"Tau is a Python implementation of Pi's minimalist coding-agent harness architecture"。教程中多次提及"Pi 兼容"即指沿用 Pi 定义的事件语义与分层约定。

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

## Python typing 速查

Tau 源码大量使用 Python 类型注解。以下是你会在教程中反复遇到的几个 `typing` 构造：

| 构造 | 示例 | 含义 |
|---|---|---|
| **`Literal["a", "b"]`** | `stop_reason: Literal["stop", "tool_use"]` | 值**必须**是引号内的某一个精确字符串，不能是其他值 |
| **`X \| Y`**（联合类型） | `content: str \| list[TextContent]` | 值要么是 `str`，要么是 `list[TextContent]`，二选一 |
| **`list[T]` / `dict[K, V]`** | `tools: list[AgentTool]` | Python 内置容器的泛型写法，`list[AgentTool]` 即"元素全是 AgentTool 的列表" |
| **`T \| None`**（可选） | `model: str \| None` | 值可以是 `str`，也可以是 `None`（空），等价于 `Optional[str]` |
| **`Protocol`** | `class ModelProvider(Protocol)` | 结构化接口：一个类只要实现了 Protocol 声明的方法，就自动满足该接口，无需显式继承 |
| **`AsyncIterator[T]`** | `-> AsyncIterator[AgentEvent]` | 异步迭代器：函数返回一个可以 `async for` 循环逐个获取 `T` 值的对象 |
| **`Annotated[T, ...]`** | `Annotated[str, Field(...)]` | 在类型 `T` 上附加元数据（如 Pydantic 字段约束），运行时可读取 |
| **`Sequence[T]`** | `messages: Sequence[AgentMessage]` | 只读的有序集合（list 或 tuple 均可），比 `list` 更严格——调用方不能 `.append()` |
| **`cast(T, value)`** | `cast(AgentMessage, raw)` | 告诉类型检查器"我确信这个值是 T 类型"，运行时不做任何转换 |

> **`typing` 是什么？** Python 的标准库模块，提供类型注解工具。类型注解不影响运行行为，但能帮助 IDE 提示和静态检查（如 `mypy`）。

---

## Pydantic 速查

Tau 的消息、事件、条目等数据结构全部基于 [Pydantic](https://docs.pydantic.dev/) 构建。Pydantic 是一个 Python 数据验证库——你声明字段的类型，它在创建实例时自动校验、序列化为 JSON 时自动转换。

| 概念 | 示例 | 含义 |
|---|---|---|
| **`BaseModel`** | `class UserMessage(BaseModel)` | Pydantic 数据模型的基类。声明字段类型后，Pydantic 自动处理校验、序列化、反序列化 |
| **`WireModel`** | `class UserMessage(WireModel)` | Tau 自定义的 BaseModel 子类，统一设置了 `extra="forbid"`（禁止未知字段）和 `populate_by_name=True`（允许用别名构造） |
| **`Field(...)`** | `role: Literal["user"] = Field(default="user")` | 字段配置器：设置默认值、别名、描述、校验规则等 |
| **`Field(discriminator="type")`** | `Annotated[A \| B, Field(discriminator="type")]` | 联合类型判别器：根据 `type` 字段的值自动决定反序列化为 A 还是 B |
| **`model_validator`** | `@model_validator(mode="before")` | 模型级校验器：在实例创建前/后对整个模型做自定义校验或转换 |
| **`model_copy()`** | `msg.model_copy(deep=True)` | 深拷贝一个 Pydantic 实例，得到完全独立的副本 |
| **`model_dump()`** | `msg.model_dump()` | 将模型转换为 Python 字典（可直接 `json.dumps()`） |
| **`model_validate()`** | `Model.model_validate(dict)` | 从字典/JSON 反序列化为模型实例，自动校验字段类型 |
| **`extra="forbid"`** | `model_config = ConfigDict(extra="forbid")` | 禁止传入未声明的字段——多一个字段就报错，防止拼写错误或协议变更导致静默失败 |
| **`@dataclass`** | `@dataclass(slots=True)` | Python 原生数据类（非 Pydantic），用于纯内存结构（如 `AgentTool`），不需要 JSON 序列化 |

> **Pydantic vs dataclass？** 需要 JSON 序列化/反序列化的结构用 Pydantic（如消息、事件、条目）；纯内存的轻量结构用 `@dataclass`（如工具定义、配置）。

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
