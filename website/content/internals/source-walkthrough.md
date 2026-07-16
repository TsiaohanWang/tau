---
title: Source code walkthrough (源码剖析)
description: A bottom-up, file-by-file dissection of the Tau source — derived from reading the code, not official documentation.
---

> **衍生解读声明 / Derived-work notice.**
> 本文档是基于 `huggingface/tau` 源码逐文件阅读得到的**个人/社区级源码剖析**，
> 并非官方文档。它解释"代码里每个设计是如何实现的"，可能与官方教程的视角、措辞不同。
> 官方文档请参见本站的 Guides / Reference / Internals 其他页面。
> *This is a source-level walkthrough derived from reading the Tau source code.
> It is not official documentation. For the official perspective, see the other
> Guides / Reference / Internals pages on this site.*

## 这份剖析的结构

 Tau 分三层,依赖方向单向:`tau_coding → tau_agent → tau_ai`。
 本剖析从最底层往上,逐文件拆解每个模块的设计。建议按下列顺序阅读:

 > **与本站其他文档的关系。** 上方的 `Architecture overview` / `Design principles` /
 > `Build your own frontend` / `The agent loop` 等是官方视角的**概念性**介绍;
 > 本页及其下链接的 24 个剖析页则是**逐文件、逐方法**的源码级拆解(衍生解读)。
 > 概念页讲"为什么这样设计",剖析页讲"代码里具体怎么实现",二者互补、不重复。

### `tau_ai` — 与模型对话

- [Provider 契约与事件流]({{< relref "./ai-provider-events.md" >}}) — `provider.py` / `events.py` / `retry.py` / `http.py` / `http_errors.py`
- [环境配置]({{< relref "./ai-env-config.md" >}}) — `env.py`
- [各 Provider 实现]({{< relref "./ai-providers.md" >}}) — `openai_compatible` / `anthropic` / `google` / `mistral` / `openai_codex` / `fake`

### `tau_agent` — 可移植的 agent 内核

- [数据模型]({{< relref "./agent-models.md" >}}) — `types` / `messages` / `tools` / `events`
- [执行核心]({{< relref "./agent-loop-harness.md" >}}) — `loop.py` / `harness.py`
- [会话持久化树]({{< relref "./agent-session-tree.md" >}}) — `session/` 包
- [公共导出与边界]({{< relref "./agent-init-boundary.md" >}}) — `__init__.py` 与 `tau_ai` 的边界

### `tau_coding` — coding agent 应用

- [工具与提示组装]({{< relref "./coding-tools-prompt.md" >}}) — `tools` / `system_prompt` / `context` / `context_window` / `skills` / `resources`
- [`CodingSession`]({{< relref "./coding-session.md" >}}) — `session.py`
- [Slash 命令]({{< relref "./coding-commands.md" >}}) — `commands.py`
- [会话索引]({{< relref "./coding-session-manager.md" >}}) — `session_manager.py`
- [Provider 配置]({{< relref "./coding-provider-config.md" >}}) — `provider_catalog` / `provider_config` / `provider_runtime`
- [TUI:状态与适配]({{< relref "./coding-tui-state.md" >}}) — `tui/state` / `adapter` / `config` / `autocomplete`
- [TUI:界面与控件]({{< relref "./coding-tui-app.md" >}}) — `tui/app` / `widgets` / `terminal_title`
- [凭证存储]({{< relref "./coding-credentials.md" >}}) — `credentials.py`
- [OAuth 登录流程]({{< relref "./coding-oauth.md" >}}) — `oauth*` 系列
- [CLI 入口]({{< relref "./coding-cli.md" >}}) — `cli.py`
- [扩展系统]({{< relref "./coding-extensions.md" >}}) — `extensions/` 包
- [支撑模块(一)]({{< relref "./coding-support-1.md" >}}) — `thinking` / `catalog_loader` / `branch_summary` / `diagnostics`
- [支撑模块(二)]({{< relref "./coding-support-2.md" >}}) — `prompt_templates` / `reload` / `session_export` / `shell_config` / `update_check` / `version`
- [渲染层]({{< relref "./coding-rendering.md" >}}) — `rendering/` 包

 ## 一致性校对记录

本剖析已对全部 27 个 `internals/` 页面完成一次一致性 / 交叉引用校对：

- **链接完整性**：所有 `relref` 内部链接目标均存在，无悬空引用（含 `../guides/*` 与 `../reference/*`）。
- **符号准确性**：抽样核验的关键符号与源码一致，包括 `CodingSession.prompt` / `handle_command` / `set_model` / `emit_pending_session_start` / `set_thinking_level`、`ExtensionAPI.register_tool` / `register_command` / `send_user_message`、`TuiEventAdapter.apply`、`CommandRegistry.get`(→`SlashCommand | None`) / `list_commands`、`OAuthProvider.runtime_auth`、`LOGIN_PROVIDER_ALIASES`（`dict[str, tuple[str, str]]`，`anthropic-api`→`("anthropic","api-key")`、`anthropic-subscription`→`("anthropic","subscription")`）、`provider_runtime.create_model_provider`。
- **结构约定**：每页保持「概述 + 逐方法深度剖析」双轨结构，frontmatter 与 prev/next 导航不变；衍生解读声明置于本页顶部。
- **构建校验**：Hugo 全量构建 0 错误，54 个页面正常生成。

 <!-- NAV -->
 [↑ 总览]({{< relref "./source-walkthrough.md" >}})
[→ tau_ai · Provider 契约与事件流]({{< relref "./ai-provider-events.md" >}})
