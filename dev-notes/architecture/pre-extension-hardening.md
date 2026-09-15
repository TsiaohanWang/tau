---
title: "Pre-extension Hardening Summary / 扩展系统之前的加固总结"
---

[原文]
This note summarizes the production hardening work completed before Phase 21
extensions. Phase 21 remains intentionally deferred.

[译文]
本文总结 Phase 21 扩展系统之前完成的生产级加固工作。Phase 21 仍被有意推迟。

## Agent 与 Provider 运行时(Agent And Provider Runtime)

[原文]
Tau now has provider-neutral progress events for retries, thinking/reasoning
deltas, and queued prompt state:

[译文]
Tau 现在有了 provider 无关的进度事件,覆盖重试、thinking/推理增量与排队提示状态:

[原文]
- `RetryEvent` reports provider retry attempts without exposing provider-specific
  HTTP details to frontends.
- `ThinkingDeltaEvent` carries optional streamed provider reasoning text without
  recording it as a durable assistant message.
- `QueueUpdateEvent` carries pending steering and follow-up prompt text for
  frontend status displays.

[译文]
- `RetryEvent` 报告 provider 重试尝试,而不向前端暴露 provider 特有的 HTTP 细节。
- `ThinkingDeltaEvent` 携带可选的流式 provider 推理文本,但不把它记录为持久化的 assistant 消息。
- `QueueUpdateEvent` 携带待处理的插话与追加提示文本,供前端状态展示使用。

[原文]
OpenAI-compatible, Anthropic, and OpenAI Codex subscription providers retry
transient transport failures before emitting a final provider error. The retry
policy is configurable through provider settings and environment variables.

[译文]
OpenAI 兼容、Anthropic 与 OpenAI Codex 订阅 provider 会在发出最终 provider 错误之前重试瞬时的传输故障。重试策略可通过 provider 设置与环境变量配置。

[原文]
Credential resolution is explicit: stored Tau credentials from
`~/.tau/credentials.json` take precedence over environment-variable fallbacks for
providers with a `credential_name`.

[译文]
凭据解析是显式的:对于带有 `credential_name` 的 provider,来自 `~/.tau/credentials.json` 的已存储 Tau 凭据优先于环境变量回退。

## 上下文、技能与会话(Context, Skills, And Sessions)

[原文]
Context accounting now returns a structured `ContextUsageEstimate` with total,
system, message, and tool token estimates. The TUI refreshes from the event
stream, so sidebar and compact-session context numbers update after user
messages, assistant responses, tool results, compaction, and resume/new-session
flows.

[译文]
上下文计量现在返回结构化的 `ContextUsageEstimate`,包含总量、系统、消息与工具四类 token 估算。TUI 从事件流刷新,因此侧边栏与紧凑会话行的上下文数字会在用户消息、assistant 响应、工具结果、压缩以及恢复/新建会话流程之后更新。

[原文]
Loaded skills are available through two paths:

[译文]
已加载的技能通过两条路径可用:

[原文]
- the system prompt lists skill names, descriptions, and file locations so the
  model can read relevant skill files with the normal `read` tool
- `/skill:<name> [request]` expands the full skill markdown into the next prompt

[译文]
- 系统提示词列出技能名称、描述与文件位置,使模型可以用普通的 `read` 工具读取相关技能文件
- `/skill:<name> [request]` 把完整的技能 Markdown 展开进下一条提示

[原文]
Session export is available through `tau export`. It writes a self-contained
HTML view for an indexed session id or JSONL session path and preserves both the
session tree structure and storage-order transcript.

[译文]
会话导出通过 `tau export` 提供。它会为已索引的会话 id 或 JSONL 会话路径写出一个自包含的 HTML 视图,同时保留会话树结构与按存储顺序排列的会话记录。

## TUI 行为(TUI Behavior)

[原文]
The Textual frontend remains behind the adapter boundary:

```text
CodingSession emits AgentEvent values
        ↓
TuiEventAdapter updates TuiState
        ↓
Textual widgets render transcript, status, and controls
```

[译文]
Textual 前端仍然位于适配器边界之后:

```text
CodingSession 发出 AgentEvent
        ↓
TuiEventAdapter 更新 TuiState
        ↓
Textual 组件渲染会话记录、状态与控件
```

[原文]
Recent TUI hardening added:

[译文]
近期的 TUI 加固加入了:

[原文]
- responsive sidebar behavior with provider/model, thinking mode, tools, skills,
  prompt templates, and context files
- context-size refresh after streamed user, assistant, tool, compaction, and
  resume events
- Textual transcript text selection for visible transcript output
- message selection with `Alt-Up` / `Alt-Down`
- selected-message copy with `Ctrl-C`
- inline tool result expansion with `Ctrl-O`
- animated activity status while an agent run is active
- thinking-mode cycling with `Shift-Tab`
- optional thinking-token display with `Ctrl-T`, hidden by default
- queued steering with `Enter` while running
- queued follow-ups with `Alt-Enter` while running

[译文]
- 响应式侧边栏,包含 provider/模型、thinking 模式、工具、技能、提示词模板与上下文文件
- 在流式的用户、assistant、工具、压缩与恢复事件之后刷新上下文大小
- 对可见会话记录输出进行 Textual 文本选择
- 用 `Alt-Up` / `Alt-Down` 选择消息
- 用 `Ctrl-C` 复制选中的消息
- 用 `Ctrl-O` 就地展开工具结果
- agent 运行期间的动画活动状态
- 用 `Shift-Tab` 循环切换 thinking 模式
- 用 `Ctrl-T` 可选显示 thinking token,默认隐藏
- 运行时用 `Enter` 加入插话队列
- 运行时用 `Alt-Enter` 加入追加队列

[原文]
Queued prompts are not persisted when first queued. They become durable session
messages only when `AgentHarness` injects them into the active run and emits the
normal user-message events.

[译文]
排队提示在首次入队时不会持久化。只有当 `AgentHarness` 把它们注入活动运行并发出普通的用户消息事件时,它们才成为持久化的会话消息。

## 架构边界(Architecture Boundary)

[原文]
The added behavior preserves Tau's package split:

[译文]
新增行为保持了 Tau 的包分层:

[原文]
- `tau_ai` owns provider-specific retry, token, and stream parsing.
- `tau_agent` owns portable messages, events, loop coordination, harness state,
  queue semantics, tools, and session primitives.
- `tau_coding` owns provider configuration, credentials, resources, commands,
  persistence workflows, docs, and Textual UI policy.

[译文]
- `tau_ai` 持有 provider 特有的重试、token 与流解析。
- `tau_agent` 持有可移植的消息、事件、循环协调、harness 状态、队列语义、工具与会话原语。
- `tau_coding` 持有 provider 配置、凭据、资源、命令、持久化工作流、文档与 Textual UI 策略。

[原文]
The reusable agent package still does not import Textual, Rich rendering, Typer,
local config paths, slash-command registries, or project resource loading.

[译文]
可复用的 agent 包仍然不导入 Textual、Rich 渲染、Typer、本地配置路径、斜杠命令注册表或项目资源加载。

## 验证(Verification)

[原文]
The hardening slices are covered by focused tests across:

[译文]
这些加固切片的聚焦测试覆盖:

```text
tests/test_agent_harness.py
tests/test_agent_loop.py
tests/test_coding_session.py
tests/test_context_window.py
tests/test_provider_config.py
tests/test_rendering.py
tests/test_session_export.py
tests/test_skills.py
tests/test_tau_ai.py
tests/test_tui_adapter.py
tests/test_tui_app.py
tests/test_tui_config.py
```

[原文]
Before merging the final pre-extension changes, the full gate passed:

[译文]
在合并最后一批扩展系统之前的改动时,完整关卡已通过:

```bash
uv run pytest
uv run ruff check .
uv run mypy
```
