---
title: tau_coding · CodingSession
description: session.py —— coding agent 的环境核心
---

## 公开数据类（`CodingSession` 之前的类型）

- **`ModelChoice`**（frozen）：`provider_name` + `model`，一次可选的"provider/模型"组合。
- **`TerminalCommandResult`**（frozen）：输入栏终端命令的结果（命令/输出/exit_code/ok/
  `added_to_context`）。
- **`SessionTreeChoice`**（frozen）：树选择器里一个可分支的节点（`entry_id`/`label`/
  `active`/`is_tool_call`）。
- **`SessionTreeBranchResult`**（frozen）：移动叶指针后的结果（`message`/`input_prefill`）。
- **`TerminalCommandRequest`**（frozen）：解析后的输入栏命令请求。
- **`SessionResources`**（frozen）：会话周边资源（skills/prompt_templates/context_files/
  diagnostics）。
- **`CompactionPlan`**（frozen）：一次压缩的筹备——`replace_entry_ids`（要被替换的节点）
  + `messages_to_summarize`（要总结的消息）。
- **`CodingSessionConfig`**（frozen dataclass）：构造会话所需的全部配置——`provider`/
  `model`/`storage`/`cwd`/`system`/`custom_system_prompt`/`append_system_prompt`/
  `context_files`/`tools`/`resource_paths`/`session_id`/`session_manager`/
  `command_registry`/`provider_name`/`provider_settings`/`runtime_provider_config`/
  `auto_compact_token_threshold`/`auto_compact_enabled`/`thinking_level`/
  `index_on_first_persist`/`shell_command_prefix`/`skills_enabled`/`extension_paths`/
  `extensions_enabled`/`project_extensions_enabled`/`extension_runtime`。

## 运行时入口：`prompt` / `continue_`

（已详读，核心逻辑）

- **`prompt(content, *, streaming_behavior, source, custom_type, details)`**：
  1. 跑扩展 `input_hooks`（可被扩展拦截/改写/短路）；
  2. `expand_prompt_text`（展开 `/skill:` 与 prompt 模板）；
  3. 若 harness 正在运行：按 `streaming_behavior` 决定 `steer`/`follow_up` 或报错；
  4. 可能 `_try_auto_compact`（prompt 前）；
  5. 驱动 `harness.prompt(...)`，对每个 `MessageEndEvent` 调 `_persist_messages_since`
     落盘，对每个用户消息尝试自动命名；对 `ToolExecutionEndEvent` 失效上下文缓存；
  6. 遇到不可恢复**上下文溢出** `ErrorEvent` → `_try_overflow_compact` + `continue_()`
     自动重试一次；
  7. 最后 `_try_auto_compact`（prompt 后）。
- **`continue_()`**：恢复后继续跑 harness，同样在每个 `MessageEndEvent` 落盘。

> 这就是与 Rust `tau-rs` 的 `session.rs` 行为对应的地方：`/new` 的 guard（`is_running`
> 时拒绝 steer/follow_up）、每次消息后写 `LeafEntry`、溢出压缩后重试。

---

## 持久化核心：`_persist_messages_since` 与辅助

（已详读）

- **`_persist_messages_since(persisted_count)`**：把 harness 里"自 `persisted_count`
  **之后**"的新消息逐个写成 `MessageEntry`（父节点为 `_last_parent_id`），并紧跟一个
  `LeafEntry` 指向它——这样运行途中树导航也能看到当前分支 tip。然后
  `_refresh_persisted_state(leaf_id=last_parent_id)` 重建 `_state`。
- `_append_session_entry`：先 `_ensure_session_initialized`（刷掉 pending 初始 entries，
  必要时索引），再 `storage.append`。
- `_refresh_persisted_state`：`SessionState.from_entries(read_all(), leaf_id=...)` 重建，
  并 `touch_session`（更新 manager 里的 model/provider）。
- `_invalidate_context_usage_cache`：标记上下文用量脏，下次重算。

---

## 模型 / 思考级别切换

- **`set_model(model)`**：校验后改 `harness.config.model`，同步思考级别、刷新运行时
  provider、持久化默认选择、`touch_session`。
- **`set_model_choice(choice)`**：provider 不变则 `set_model`，否则 `_set_provider_model`。
- **`toggle_scoped_model` / `cycle_scoped_model`**：维护"快速切换模型列表"（scoped models）。
- **`_set_provider_model(provider_name, model)`**：用 `create_model_provider` 构造新
  provider（记入 `_owned_providers`），替换 `harness.config.provider`、model、思考级别，
  持久化默认。
- **`set_thinking_level(level)`**：归一化→校验可用→改 `_thinking_level`→刷新运行时
  provider→**追加 `ThinkingLevelChangeEntry` + `LeafEntry`** 并刷新状态（把"思考级别切换
  "也写成可持久化的树节点）。
- `_sync_thinking_level_to_active_model` / `_persist_thinking_level_choice` /
  `_refresh_runtime_provider`：在模型/级别变化时保持一致性。

---

## 分支（branching）

- **`tree_choices()`**：读出所有 entries，过滤出`_is_branchable_tree_entry`，返回带缩进
  标签的 `SessionTreeChoice` 列表（标记 active / 是否 tool call）。
- **`branch_to_entry(entry_id, *, summarize, custom_instructions, replace_instructions)`**：
  把活跃叶指针移到历史某个节点，**保留既有历史**（不删除）。
  - 若 `summarize` 且被放弃的消息非空 → 用 `_summarize_branch_messages` 生成
    `BranchSummaryEntry`（回溯分支摘要）作为新父节点；
  - 若该节点是 user `MessageEntry` → 把叶指到其父，并把原消息内容作为 `input_prefill`
    返回（让 UI 预填"从这里重新开始"）；
  - 写 `LeafEntry`、刷新 `_state`、`harness.replace_messages`、`_refresh_runtime_provider`、
    同步思考级别。

---

## 压缩（compaction）

- **`compact(instructions)`**：手动压缩——`_manual_compaction_plan()`（压缩全部活跃
  上下文）→ `_generate_compaction_summary` → `_append_compaction`。
- **`_manual_compaction_plan`**：把 `_state` 的 `context_entry_ids` 与 `messages` 打包成
  `CompactionPlan`（全量）。
- **`_recent_preserving_compaction_plan`**：只压缩"保留最近 N token 之外的较早部分"
  （`DEFAULT_COMPACTION_KEEP_RECENT_TOKENS = 20_000`），保留近期工作。
- **`_generate_compaction_summary(messages, *, custom_instructions)`**：用
  `build_compaction_summary_prompt`（Part 3a）构造提示，直接调
  `provider.stream_response`（system = `SUMMARIZATION_SYSTEM_PROMPT`）生成摘要文本。
- **`_append_compaction(summary, *, replace_entry_ids)`**：写 `CompactionEntry`
  （`replaces_entry_ids` 记被替换节点）+ `LeafEntry`，刷新 `_state`，
  `harness.replace_messages`（重放后旧消息已被摘要替换——见 Part 2c 的
  `_apply_compaction`）。
- **`_try_auto_compact(context, phase)`** / **`_maybe_auto_compact`**：当
  `context_token_estimate > auto_compact_token_threshold` 时自动触发
  `_recent_preserving_compaction_plan` 压缩（包了异常保护，压缩失败也不丢 turn）。
- **`_try_overflow_compact(context)`**：上下文溢出时的兜底压缩（对应 `prompt()` 里的
  重试路径）。

---

## 会话生命周期：resume / new_session / adopt

- **`resume(session_id)`**：从 `session_manager` 取记录，用其 `path`/`model`/`provider`
  重新 `load` 一个 `CodingSession`，再 `_adopt_replacement(reason="resume")`。
- **`new_session()`**：让 `session_manager.prepare_session` 准备一个新（未索引）会话，
  `load` 之，`_adopt_replacement(reason="new")`。`index_on_first_persist=True`。
- **`_adopt_replacement(replacement, *, reason)`**：把"外部对象 `self`"的状态整体换成
  `replacement` 的——因为扩展运行时是长生命周期、跨替换共享的，必须重新 `bind(self)` 并
  `attach_harness_listener(self._harness.subscribe)`，先 `emit_session_shutdown` 再
  `emit_session_start`，中间清掉扩展 UI 组件。这就是 Rust `tau-rs` 里 `/new` 拒绝在 turn
  运行时调用、以及 harness 锁逻辑对应的根源：替换的是 `self` 上的 harness 实例。
- **`aclose()`**：发 `session_shutdown`，关闭 `_owned_providers`。

---

## 命令与提示展开

- **`handle_command(text)`**：先试 `expand_prompt_template_command`（prompt 模板类命令是
  展开指令，留到 `prompt()` 处理 → 返回 `handled=False`）；否则交给
  `_command_registry.execute`（见 Part 3c）。
- **`expand_prompt_text(text)`**：依次试 prompt 模板展开、`/skill:` 展开，都不中则返回
  原文。
- **`run_terminal_command(command, *, add_to_context)`**：用 `create_bash_tool` 直接执行
  一条 shell 命令；`add_to_context` 时把"命令+输出"作为 `UserMessage` 追加并落盘。

---

## 命名与上下文属性

- **`_try_auto_name_session` / `_generate_session_name`**：首个用户消息后，用模型生成
  ≤4 词的会话标题（`SESSION_NAME_SYSTEM_PROMPT`），写入 `session_manager`。
- 大量 `@property`：`cwd`/`model`/`provider_name`/`available_providers`/`available_models`/
  `available_model_choices`/`scoped_model_choices`/`tools`/`messages`/`state`/
  `thinking_level`/`available_thinking_levels`/`storage`/`skills`/`prompt_templates`/
  `context_files`/`context_token_estimate`/`context_usage`/`system_prompt`/
  `auto_compact_token_threshold`/`context_window_tokens`/`command_registry`/
  `resource_diagnostics`/`extension_runtime`/`session_id`/`session_title`/
  `session_manager`/`is_running`/`queued_messages`/`last_diagnostic_log_path`。
  - `context_token_estimate` / `context_usage` 走 `context_window.estimate_context_usage`
    （带缓存，tool/消息事件后失效）。

---

## 本部分小结

`CodingSession` 把一切缝在一起：

- 包住 `AgentHarness`，在每次 `MessageEndEvent` 把 transcript 落盘成"消息+叶指针"树；
- 模型/思考级别/分支/压缩，都通过写对应 `SessionEntry` + `LeafEntry` 变成可持久化的
  状态变更；
- 自动/溢出压缩用 Part 3a 的估算与总结提示；
- `resume`/`new_session` 通过"load + adopt"切换活跃状态，同时保全扩展运行时。

下一任务（Part 3c）看支撑它的旁支：`commands.py`（命令注册表）、`session_manager.py`
（多会话索引）、`provider_config.py`/`provider_runtime.py`/`provider_catalog.py`
（provider 选择/解析/目录）、`rendering/`（输出格式）。

<!-- NAV -->
[← tau_coding · 工具与提示组装]({{< relref "./coding-tools-prompt.md" >}})
[↑ 总览]({{< relref "./source-walkthrough.md" >}})
[→ tau_coding · Slash 命令]({{< relref "./coding-commands.md" >}})
