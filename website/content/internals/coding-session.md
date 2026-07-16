---
title: tau_coding · CodingSession
description: session.py —— coding agent 的环境核心
code_files:
  - tau_coding/session.py
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

**为什么 `prompt` / `continue_` 是这样的结构**：Tau 官方设计原则 "Sessions are durable
and inspectable" 要求每一步交互都可落盘、可回放。因此 `prompt` 在每个 `MessageEndEvent`
处即调 `_persist_messages_since` 落盘，而不是等整个回合结束——即使进程中途崩溃，已完成
的消息也已写入 append-only JSONL。`is_running` 时拒绝新 prompt（要求显式 `steer`/
`follow_up`）保证同一时刻只有一条活跃的 harness 驱动链，避免并发写树导致父指针错乱。
溢出后 `_try_overflow_compact` + `continue_()` 自动重试一次,是把"上下文超限"从不可恢复
错误降级为可自愈事件。此结构与 Rust `tau-rs` 的 `session.rs` 一一对应:`/new` 的 guard、
每次消息后写 `LeafEntry`、溢出压缩后重试。

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
  - **为什么分支只移动叶指针、不删除节点**：会话存储是 append-only JSONL,遵循 Tau 原则
    "Sessions are durable and inspectable"。分支不是"回退删除",而是在树上追加一个新的
    `LeafEntry` 把活跃 tip 指向历史节点;被放弃的分支仍完整保留在文件里,可再次导航或审查。
    这使得任意一次分支都是可逆、可追溯的操作,而非破坏性编辑。
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
  - **为什么压缩追加 `CompactionEntry` 而不改写旧记录**：压缩若原地删改被摘要的消息,
    历史就不再可回放,违反 "Sessions are durable and inspectable"。Tau 的做法是追加一个
    `CompactionEntry`,用 `replaces_entry_ids` 声明"重放时这些节点由本摘要替代"。原始消息
    仍留在 JSONL 中,压缩只影响重放视图(`harness.replace_messages` 看到的是摘要),而底层
    记录完整无损——既节省了上下文窗口,又保留了完整审计与分支能力。
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
- **`_adopt_replacement(replacement, *, reason)`**：把外部持有的 `self` 的内部状态整体
  替换为 `replacement` 的状态。**为什么 resume/new 用"替换 `self`"而非返回新对象**:调用方
  （TUI、扩展）持有的是同一个 `CodingSession` 引用,且扩展运行时是长生命周期、跨会话切换
  共享的;若返回新对象,所有外部引用都需重新接线。改为原地替换 `self` 的字段后重新
  `bind(self)` 并 `attach_harness_listener(self._harness.subscribe)`,即可让既有引用继续
  有效。先 `emit_session_shutdown` 再 `emit_session_start`、中间清掉扩展 UI 组件,保证扩展
  生命周期事件成对触发。这也是 `/new` 拒绝在回合运行时调用的根源:被替换的正是 `self` 上
  的 harness 实例,运行中替换会破坏正在进行的驱动链。
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

`CodingSession` 是 coding-agent 环境层的集成点(对照 Tau README 的 `CodingSession =
coding-agent environment`——它属于应用层,而非 `AgentHarness` 那个可移植内核)：

- 包住 `AgentHarness`，在每次 `MessageEndEvent` 把 transcript 落盘成"消息+叶指针"树；
- 模型/思考级别/分支/压缩，都通过写对应 `SessionEntry` + `LeafEntry` 变成可持久化的
  状态变更；
- 自动/溢出压缩用 Part 3a 的估算与总结提示；
- `resume`/`new_session` 通过"load + adopt"切换活跃状态，同时保全扩展运行时。

下一任务（Part 3c）看支撑它的旁支：`commands.py`（命令注册表）、`session_manager.py`
（多会话索引）、`provider_config.py`/`provider_runtime.py`/`provider_catalog.py`
（provider 选择/解析/目录）、`rendering/`（输出格式）。

---

## 逐方法深层剖析（session.py）

> 以下对 `CodingSession` 及本文件所有辅助类/函数做逐方法展开，基于源码逐行阅读。

# session.py 逐方法剖析

本文件是 Tau 持久化编码会话环境的核心封装,建立在 `AgentHarness`(可复用 agent 大脑)之上。按 Tau 的分层原则(对照 README `CodingSession = coding-agent environment`),可移植内核 `AgentHarness` 只负责与模型对话的循环,不感知磁盘、CLI 或资源路径;`CodingSession` 则拥有 harness 之外的全部"环境":持久化的会话条目、默认编码工具、命令接缝、扩展运行时,以及自动压缩、分支、命名、导出等围绕会话生命周期的逻辑。这一分工正是官方原则 "The core stays portable" 与 "Small layers beat magic" 的落地。

---

## 顶层数据类

### ModelChoice

`frozen=True, slots=True` 的数据类,表示一个可选择的模型及其所属 provider。

- `provider_name: str` —— 提供该模型的 provider 名称(如 `"openai"`、`"anthropic"`)。
- `model: str` —— 模型标识(如 `"gpt-4o"`)。

它仅用于模型选择 UI 与配置传递,本身不含行为。

### TerminalCommandResult

`frozen=True, slots=True`,表示输入框终端命令的执行结果。

- `command: str` —— 规范化后的命令文本。
- `output: str` —— 命令的标准输出/错误信息。
- `exit_code: int | None` —— 退出码;若工具未返回整型则取 `None`。
- `ok: bool` —— 命令是否成功(`bash_tool.result.ok`)。
- `added_to_context: bool` —— 输出是否被追加到了会话上下文。

### SessionTreeChoice

`frozen=True, slots=True`,表示会话树中一个可分支的条目(供 `/tree` 选择器使用)。

- `entry_id: str` —— 该条目的唯一 id。
- `label: str` —— 树中展示的标题(含缩进前缀)。
- `active: bool = False` —— 是否为当前活动叶子。
- `is_tool_call: bool = False` —— 是否为工具调用型条目(仅 AssistantMessage 带 `tool_calls`)。

### SessionTreeBranchResult

`frozen=True, slots=True`,表示移动活动叶子后的结果。

- `message: str` —— 成功消息(如 `"Branched session at ..."`)。
- `input_prefill: str | None = None` —— 当分支落在一个用户消息上时可回填到输入框的内容。

### TerminalCommandRequest

`frozen=True, slots=True`,表示输入框中解析出的终端命令请求(`parse_terminal_command` 的产出)。

- `command: str` —— 命令文本。
- `add_to_context: bool` —— 是否把输出加入上下文(`!` 为 True,`!!` 为 False)。

### SessionResources

`frozen=True, slots=True`,表示围绕一次会话加载的 Tau 自有资源。

- `skills: tuple[Skill, ...]` —— 加载的 skills。
- `prompt_templates: tuple[PromptTemplate, ...]` —— 提示词模板。
- `context_files: tuple[ProjectContextFile, ...]` —— 项目上下文文件(如 AGENTS.md)。
- `diagnostics: tuple[ResourceDiagnostic, ...]` —— 加载过程中的非致命诊断。

### CompactionPlan

`frozen=True, slots=True`,表示一次压缩运行所准备的“活动上下文条目”。

- `replace_entry_ids: tuple[str, ...]` —— 将被压缩摘要替换掉的条目 id 列表。
- `messages_to_summarize: tuple[AgentMessage, ...]` —— 需要被摘要的消息(与上面一一对应)。

### CodingSessionConfig

持久化编码会话的配置数据类,字段含义如下:

- `provider: ModelProvider` —— 当前模型 provider 实例。
- `model: str` —— 当前模型名。
- `storage: SessionStorage` —— 追加式会话存储后端(默认 JSONL)。
- `cwd: Path` —— 会话工作目录。
- `system: str | None = None` —— 若提供则作为固定 system prompt,绕过自动构建。
- `custom_system_prompt: str | None = None` —— 注入到 system prompt 的自定义段落。
- `append_system_prompt: str | None = None` —— 追加到 system prompt 末尾的段落。
- `context_files: tuple[ProjectContextFile, ...] = ()` —— 显式提供的上下文文件。
- `tools: list[AgentTool] | None = None` —— 显式工具列表,`None` 时自动创建编码工具。
- `resource_paths: TauResourcePaths | None = None` —— 资源搜索路径。
- `session_id: str | None = None` —— 会话管理器索引 id,`None` 表示尚未索引。
- `session_manager: SessionManager | None = None` —— 会话管理器,用于 resume/命名/索引。
- `command_registry: CommandRegistry | None = None` —— 斜杠命令注册表,`None` 时用默认或扩展构建。
- `provider_name: str = "openai"` —— 当前 provider 名。
- `provider_settings: ProviderSettings | None = None` —— 全局 provider 设置(用于模型/provider 选择)。
- `runtime_provider_config: ProviderConfig | None = None` —— 当前运行时生效的 provider 配置。
- `auto_compact_token_threshold: int | None = None` —— 自动压缩阈值;`None` 时按上下文窗口推导。
- `auto_compact_enabled: bool = True` —— 是否启用自动压缩。
- `thinking_level: ThinkingLevel = DEFAULT_THINKING_LEVEL` —— 初始思考级别。
- `index_on_first_persist: bool = False` —— 首次持久化时是否索引到会话管理器。
- `shell_command_prefix: str | None = None` —— 注入到 shell 命令的前缀。
- `skills_enabled: bool = True` —— 是否启用 skill 发现(对应 Pi 的 `noSkills`)。
- `extension_paths: tuple[Path, ...] = ()` —— 额外扩展路径。
- `extensions_enabled: bool = True` —— 是否加载资源目录下的扩展。
- `project_extensions_enabled: bool = False` —— 是否加载项目目录下的扩展。
- `extension_runtime: ExtensionRuntime | None = None` —— 扩展运行时,`None` 时 `load` 内部创建。

---

## CodingSession

### `__init__`

```python
def __init__(self, config, *, state, harness, last_parent_id, skills=(), prompt_templates=(), context_files=(), resource_diagnostics=(), command_registry=None, pending_initial_entries=(), extension_runtime=None) -> None
```

构造一个会话实例。关键行为:

- 保存 `config`、`state`、`harness`,并 `extension_runtime or ExtensionRuntime()`。
- `_session_start_pending = False`(load 时再置位),`_last_parent_id` 记录当前分支链末端,`_pending_initial_entries` 用于延迟写入首个会话的初始条目(新会话的 info/model/thinking 三段)。
- 存下 `skills / prompt_templates / context_files / resource_diagnostics`,命令注册表为空时用 `create_default_command_registry()`。
- 复制 provider 相关字段:`_provider_name`、`_provider_settings`、`_runtime_provider_config`。
- 用 `resource_paths_with_cwd` 计算实际资源路径。
- 计算思考级别:`_thinking_level = _state_thinking_level(state, default=_default_thinking_level_for_active_model(self))`,即从持久状态取,否则按当前模型推导默认级别。
- `_context_usage_cache = None`(惰性估算),`_owned_providers = []`(本会话创建的 provider,`aclose` 时统一关闭)。
- 构建 `_diagnostic_logger`(基于资源路径)与 `_credential_store`(基于 credentials 路径),并初始化 `_last_diagnostic_log_path = None`。

注意:`__init__` 是“被 `load` 调用”的低层构造器,不会触发任何异步 I/O 或扩展生命周期事件。

### `load` (classmethod async)

```python
async def load(cls, config: CodingSessionConfig) -> CodingSession
```

从追加式存储中重建会话。流程:

1. `entries = await config.storage.read_all()`。若为空,则构造初始三段:`SessionInfoEntry(cwd=...)` → `ModelChangeEntry(parent=info.id, model=_initial_model_for_config(config))` → `ThinkingLevelChangeEntry(parent=model.id, thinking_level=_initial_thinking_level_for_config(config, model=...))`,存入 `pending_initial_entries`。
2. 若非空,调用 `_detach_missing_parents(entries)` 断开指向外部(缺失)父节点的悬挂指针。
3. 构建线性状态 `SessionState.from_entries(entries)`,并对最新叶子 `_latest_leaf_entry` 用 `leaf_id` 重建“活动分支”状态。
4. 计算资源路径,调用 `_load_session_resources(...)` 加载 skills/模板/上下文文件。
5. 处理扩展运行时:若 `config.extension_runtime` 为 `None`(`fresh_extension_runtime=True`),新建并用 `load(...)` 加载(依据 `extensions_enabled / extension_paths / project_extensions_enabled`)。
6. 计算工具:显式 `config.tools` 或 `create_coding_tools(...)`,再经 `extension_runtime.compose_tools(base_tools)` 叠加扩展工具。
7. 计算 system prompt:显式 `config.system` 或 `build_system_prompt(...)`(含 skills、上下文文件、扩展指南)。
8. 构造 `AgentHarness`(provider=`config.provider`,model=`_runtime_model_for_state(config, state)`,system、tools、`messages=state.messages`)。
9. 调用 `cls(...)` 创建实例,然后:
   - `_persist_loaded_interrupted_tool_repairs()`:修复载入时悬挂的 tool call,可能替换 harness。
   - `_sync_thinking_level_to_active_model()`、`_refresh_runtime_provider()`。
   - 若 `fresh_extension_runtime`:`bind(session)`、`attach_harness_listener(session._harness.subscribe)`,并置 `_session_start_pending = True`(推迟到 `emit_pending_session_start` 再发 `session_start`)。
10. 返回 session。

要点:`session_start` 被刻意推迟,以便宿主先装好 UI 桥接(扩展的 `session_start` 处理器可能需要通知/对话框)。

### `cwd`

```python
@property
def cwd(self) -> Path
```

返回 `self._config.cwd`。

### `model`

```python
@property
def model(self) -> str
```

返回 `self._harness.config.model`(当前活动模型)。

### `provider_name`

```python
@property
def provider_name(self) -> str
```

返回 `self._provider_name`。

### `available_providers`

```python
@property
def available_providers(self) -> tuple[str, ...]
```

返回有可用凭据的 provider 名称集合。无 `provider_settings` 时只返回当前 `_provider_name`;否则遍历 `_usable_provider_configs()` 取名字。

### `available_models`

```python
@property
def available_models(self) -> tuple[str, ...]
```

返回当前 provider 在可用状态下的模型名。无设置时返回 `(self.model,)`;取不到 provider 或无凭据时返回空元组 `()`;否则返回 `provider.models`。

### `available_model_choices`

```python
@property
def available_model_choices(self) -> tuple[ModelChoice, ...]
```

返回所有“provider+model”可用组合。无设置时返回单个 `ModelChoice(provider_name, self.model)`;否则对每个可用 provider 的每个 model 生成 `ModelChoice`。

### `scoped_model_choices`

```python
@property
def scoped_model_choices(self) -> tuple[ModelChoice, ...]
```

返回已配置(`provider_settings.scoped_models`)且当前可用的快捷切换模型。用 `available_model_choices` 的集合过滤。

### `tools`

```python
@property
def tools(self) -> tuple[AgentTool, ...]
```

返回 `tuple(self._harness.config.tools)`。

### `messages`

```python
@property
def messages(self) -> tuple[AgentMessage, ...]
```

返回 harness 的当前/恢复后的完整对话记录。

### `state`

```python
@property
def state(self) -> SessionState
```

返回最后一次重放的持久会话状态。

### `tree_choices`

```python
async def tree_choices(self) -> tuple[SessionTreeChoice, ...]
```

为树选择器返回可分支条目。读取全部条目,计算 `_tree_branch_indents`,对 `_ordered_tree_entries` 中每个 `_is_branchable_tree_entry` 为真的条目生成 `SessionTreeChoice`(含 label、是否 active、是否 tool call)。

### `branch_to_entry`

```python
async def branch_to_entry(self, entry_id, *, summarize=False, custom_instructions=None, replace_instructions=False) -> SessionTreeBranchResult
```

将活动叶子移动到历史某条目,保留已有历史(分支)。逻辑:

1. 若 harness 正在运行,抛 `RuntimeError(TREE_RUNNING_MESSAGE)`。
2. 读取条目,`by_id` 索引;未知 id 或不可分支则抛 `ValueError`。
3. `summarize=True` 时:收集 `_messages_after_entry_on_active_path(entries, entry_id, self._last_parent_id)` 中将被遗弃的消息,调用 `_summarize_branch_messages` 生成摘要,写 `BranchSummaryEntry(parent=entry_id)`,再 `target_id = summary_entry.id`。
4. 否则若目标是用户消息条目:回退到其父节点,并把该用户消息内容作为 `input_prefill`。
5. 追加 `LeafEntry(parent=target_id, entry_id=target_id)`,更新 `_last_parent_id`。
6. `_refresh_persisted_state(leaf_id=target_id)`,用 `self._state.messages` 替换 harness 消息,失效上下文缓存。
7. 重算 `_thinking_level` 并 `_sync_thinking_level_to_active_model()`、`_refresh_runtime_provider()`。
8. 返回结果:若有 `input_prefill` 则带上回填内容,否则返回 `"Branched session at {target_id}{suffix}."`。

### `thinking_level`

```python
@property
def thinking_level(self) -> ThinkingLevel
```

返回 `_thinking_level`(未来回合的思考模式)。

### `available_thinking_levels`

```python
@property
def available_thinking_levels(self) -> tuple[ThinkingLevel, ...]
```

返回当前 provider/model 支持的思考模式。无设置时返回全部 `THINKING_LEVELS`;否则 `_active_provider_config()` 决定,取 `provider_thinking_levels(...)`。

### `thinking_unavailable_reason`

```python
@property
def thinking_unavailable_reason(self) -> str | None
```

若 `available_thinking_levels` 非空返回 `None`;否则解释原因(`_active_provider_config()` 为 None 时返回文案,否则 `provider_thinking_unavailable_reason(...)`)。

### `storage`

```python
@property
def storage(self) -> SessionStorage
```

返回 `self._config.storage`。

### `export`

```python
async def export(self, destination=None, *, format=None) -> Path
```

导出当前会话为面向用户的产物。读取条目,解析存储路径 `_storage_path`,规范化 `format`(默认按 destination 后缀或 `"html"`),用 `_resolve_export_destination` 算输出路径,再调 `export_session_artifact(..., title=_session_export_title(self), ...)` 写文件并返回路径。

### `skills`

```python
@property
def skills(self) -> tuple[Skill, ...]
```

返回 `self._skills`。

### `prompt_templates`

```python
@property
def prompt_templates(self) -> tuple[PromptTemplate, ...]
```

返回 `self._prompt_templates`。

### `context_files`

```python
@property
def context_files(self) -> tuple[ProjectContextFile, ...]
```

返回 `self._context_files`。

### `context_token_estimate`

```python
@property
def context_token_estimate(self) -> int
```

返回 `self.context_usage.total_tokens`(活动 provider 上下文的粗略 token 估算)。

### `context_usage`

```python
@property
def context_usage(self) -> ContextUsageEstimate
```

结构化上下文核算。若 `_context_usage_cache is None`,用 `estimate_context_usage(system, messages, tools)` 计算并缓存。

### `system_prompt`

```python
@property
def system_prompt(self) -> str
```

返回 `self._harness.config.system`(实际发给模型的 system prompt)。

### `auto_compact_token_threshold`

```python
@property
def auto_compact_token_threshold(self) -> int | None
```

有效自动压缩阈值。禁用时返回 `None`;显式设置则用之;否则用 `auto_compaction_threshold_for_context_window(self.context_window_tokens)` 推导。

### `context_window_tokens`

```python
@property
def context_window_tokens(self) -> int
```

当前模型的上下文窗口大小。无 provider 配置时取 `DEFAULT_CONTEXT_WINDOW_TOKENS`,否则 `provider.context_windows.get(self.model, 默认值)`。

### `command_registry`

```python
@property
def command_registry(self) -> CommandRegistry
```

返回 `self._command_registry`。

### `resource_diagnostics`

```python
@property
def resource_diagnostics(self) -> tuple[ResourceDiagnostic, ...]
```

返回 `self._resource_diagnostics + self._extension_runtime.diagnostics`(资源 + 扩展诊断)。

### `extension_runtime`

```python
@property
def extension_runtime(self) -> ExtensionRuntime
```

返回绑定的扩展运行时。

### `emit_pending_session_start`

```python
async def emit_pending_session_start(self) -> None
```

发出 `load` 推迟的 `session_start`,每会话一次。若 `_session_start_pending` 为 False 直接返回;否则置 False 并 `await self._extension_runtime.emit_session_start("startup")`。对“接管已启动扩展运行时”的会话是空操作。

### `queue_steering_message`

```python
def queue_steering_message(self, content, *, custom_type=None, details=None) -> None
```

通过 harness 队列一条 steering 用户消息(扩展运行时接缝),包装为 `UserMessage(...)` 调用 `self._harness.steer_message(...)`。

### `queue_follow_up_message`

```python
def queue_follow_up_message(self, content, *, custom_type=None, details=None) -> None
```

队列一条 follow-up 用户消息,调用 `self._harness.follow_up_message(...)`。

### `append_custom_entry`

```python
async def append_custom_entry(self, namespace, data) -> None
```

持久化一条扩展自有的 `CustomEntry`,并推进追加式树的父链(使其停留在重放后的 root-to-leaf 路径上,否则 resume 后不可见)。步骤:写 `CustomEntry(parent=last_parent)` → 更新 `_last_parent_id` → 写 `LeafEntry` → `_refresh_persisted_state(leaf_id=entry.id)`。

### `session_id`

```python
@property
def session_id(self) -> str | None
```

返回 `self._config.session_id`(若已索引)。

### `session_title`

```python
@property
def session_title(self) -> str | None
```

返回会话管理器中记录的标题。无 `session_id`/manager 或记录缺失时返回 `None`。

### `session_manager`

```python
@property
def session_manager(self) -> SessionManager | None
```

返回 `self._config.session_manager`。

### `is_running`

```python
@property
def is_running(self) -> bool
```

返回 `self._harness.is_running`。

### `queued_messages`

```python
@property
def queued_messages(self) -> QueuedMessages
```

返回 harness 的队列 steering/follow-up 消息(`QueuedMessages`)。

### `queued_steering_messages`

```python
@property
def queued_steering_messages(self) -> tuple[str, ...]
```

返回排队中的 steering 消息文本。

### `queued_follow_up_messages`

```python
@property
def queued_follow_up_messages(self) -> tuple[str, ...]
```

返回排队中的 follow-up 消息文本。

### `last_diagnostic_log_path`

```python
@property
def last_diagnostic_log_path(self) -> Path | None
```

返回 `self._last_diagnostic_log_path`(最近一次诊断日志路径)。

### `cancel`

```python
def cancel(self) -> None
```

取消当前正在运行的 agent 回合:`self._harness.cancel()`。

### `queue_update_event`

```python
def queue_update_event(self) -> QueueUpdateEvent
```

把当前队列状态封装为事件:`self._harness.queue_update_event()`。

### `clear_queued_messages`

```python
def clear_queued_messages(self) -> QueuedMessages
```

清空 steering/follow-up 队列:`self._harness.clear_queues()`。

### `pop_latest_follow_up_message`

```python
def pop_latest_follow_up_message(self) -> str | None
```

弹出最近一条 follow-up 消息并返回其文本(无则 `None`)。

### `pop_latest_steering_message`

```python
def pop_latest_steering_message(self) -> str | None
```

弹出最近一条 steering 消息并返回其文本(无则 `None`)。

### `set_model`

```python
def set_model(self, model: str) -> None
```

切换未来回合的模型并设为默认。`_active_provider_config()` 存在时先 `validate_provider_model`;改 `harness.config.model` → `_sync_thinking_level_to_active_model()` → `_refresh_runtime_provider()` → `_persist_default_model_choice()`;若有 manager 则 `touch_session(model=..., provider_name=...)`。

### `set_model_choice`

```python
def set_model_choice(self, choice: ModelChoice) -> None
```

作为单一操作切换 provider/model。若 provider 与当前一致则调 `set_model`;否则调 `_set_provider_model(choice.provider_name, choice.model)`。

### `is_scoped_model`

```python
def is_scoped_model(self, choice: ModelChoice) -> bool
```

返回该 provider/model 是否在 `scoped_model_choices` 中。

### `toggle_scoped_model`

```python
def toggle_scoped_model(self, choice) -> tuple[ModelChoice, ...]
```

把模型加入或移出持久化的 scoped 列表。无设置则抛 `ProviderConfigError`;模型不可用时抛错;否则 `toggle_saved_scoped_model(...)` 更新设置后 `_sync_thinking_level_to_active_model()`,返回新的 scoped 列表。

### `cycle_scoped_model`

```python
def cycle_scoped_model(self, *, reverse=False) -> ModelChoice
```

在已配置的 scoped 模型中切换到下一个(支持反向)。无 scoped 时报错;从当前 `ModelChoice` 索引算偏移,取模后调 `set_model_choice` 并 `return choice`。

### `set_provider`

```python
def set_provider(self, provider_name, *, persist_default=True) -> None
```

切换 provider 并重置为该 provider 的默认模型。取 `provider_config.default_model` 后调 `_set_provider_model(provider_name, default_model, persist_default=...)`。

### `_set_provider_model`

```python
def _set_provider_model(self, provider_name, model, *, persist_default=True) -> None
```

不构造中间 provider 直接切换。校验模型在 `provider_config.models` 内;用 `_coerced_thinking_level(...)` 算思考级别;`create_model_provider(...)` 建 provider(失败转 `ProviderConfigError`);追加到 `_owned_providers`,替换 `harness.config.provider/model`、`_provider_name`、`_runtime_provider_config`、`_thinking_level`;按 `persist_default` 持久化默认选择;有 manager 则 `touch_session`。

### `set_thinking_level`

```python
async def set_thinking_level(self, level: str) -> str
```

持久化并激活一个思考模式。流程:`normalize_thinking_level` → 校验 `available_thinking_levels`(无则抛 `_unavailable_thinking_message` 文案;不在其中则明确报错)。若未变化直接返回文案。否则备份 `previous`,改 `_thinking_level` 并 `_refresh_runtime_provider()`(失败回滚);写 `ThinkingLevelChangeEntry(parent=last_parent)` + `LeafEntry` 并刷新 `_last_parent_id`/`_refresh_persisted_state`;`_persist_thinking_level_choice()`;返回 `"Thinking mode: {normalized}"`。

### `cycle_thinking_level`

```python
async def cycle_thinking_level(self) -> str
```

调到下一个受支持的思考模式并持久化:`next_thinking_level(self._thinking_level, available=...)` 传入 `set_thinking_level`。

### `_active_provider_config`

```python
def _active_provider_config(self) -> ProviderConfig | None
```

返回当前 `_provider_name` 对应的 `ProviderConfig`;`provider_settings` 为 None 或取不到时返回 `None`。

### `_sync_thinking_level_to_active_model`

```python
def _sync_thinking_level_to_active_model(self) -> None
```

把思考级别同步到当前模型的可用集合。`_active_provider_config()` 为 None 时返回;否则 `_coerced_thinking_level(provider, model, current, preferred=provider.thinking_defaults.get(model))` 重算 `_thinking_level`。

### `_persist_default_model_choice`

```python
def _persist_default_model_choice(self) -> None
```

无设置则空返回;用 `save_default_provider_model(...)` 更新 `_provider_settings`,随后 `_sync_thinking_level_to_active_model()`。

### `_persist_thinking_level_choice`

```python
def _persist_thinking_level_choice(self) -> None
```

无设置、或当前级别不在该模型受支持集合时返回;否则 `save_provider_thinking_level(...)`(失败吞 `ProviderConfigError`)。

### `_refresh_runtime_provider`

```python
def _refresh_runtime_provider(self) -> None
```

`_runtime_provider_config` 为 None 时返回。取当前活动或运行时 provider 配置校验模型,`create_model_provider(...)`(失败转 `ProviderConfigError`)并追加到 `_owned_providers`,替换 `harness.config.provider`,更新 `_runtime_provider_config`。

### `reload`

```python
async def reload(self) -> CodingReloadSummary
```

在异步生命周期边界上重载资源与扩展。流程:

1. `emit_session_shutdown("reload")`(让外部 handler 在 API 生成仍活跃时收尾)。
2. 记录 before 快照:skills/模板/上下文文件/诊断/系统提示输入/扩展/工具名/指南 的签名。
3. `_load_session_resources(...)` 重新加载资源;`_reload_extensions()` 重新加载扩展。
4. 记录 after 快照;若 `config.system is None` 且(系统提示输入/工具名/指南)发生变化,则 `build_system_prompt(...)` 重建系统提示。
5. 更新 `self._skills/_prompt_templates/_context_files/_resource_diagnostics`;若有新系统提示则赋值 `harness.config.system` 并失效缓存。
6. `emit_session_start("reload")`。
7. 返回 `CodingReloadSummary`,各项用 `_category_summary(before, after)` 描述。

### `_reload_extensions`

```python
def _reload_extensions(self) -> None
```

重新发现扩展并重建依赖的工具与命令。`_extension_runtime.reset_for_reload()` 后按条件 `load(...)`;重建 base_tools 并用 `compose_tools` 覆盖 `harness.config.tools`;若调用者未提供命令注册表则用 `build_command_registry()` 重建;重新 `attach_harness_listener`。

### `reload_provider_settings`

```python
def reload_provider_settings(self) -> None
```

为登录/模型选择流程重载 provider 设置。保存 `previous_settings/_thinking_level`,`load_provider_settings(...)`;随后 `_sync_thinking_level_to_active_model()` + `_refresh_runtime_provider()`;任何 `ProviderConfigError` 都回滚并重新抛出。

### `resume`

```python
async def resume(self, session_id: str) -> str
```

用另一个已索引会话替换本会话的活动状态。取 `manager.get_session`,未知则报错;若记录含 `provider_name` 且设置可用,则取出对应 `runtime_provider_config`、切换 `provider_name`/`model`(`restore_record_model=True`)并校验;否则沿用本会话的 provider/model。`type(self).load(...)` 以新 config(含目标 storage、session_id、本次共享的 `extension_runtime`)构造 replacement;若 `restore_record_model` 则校验 replacement 模型,否则把 replacement 的 harness 模型改回本会话模型并同步思考/provider;最后 `_adopt_replacement(replacement, reason="resume")`。

### `new_session`

```python
async def new_session(self) -> str
```

用一个新的未索引(待索引)会话替换活动状态。`manager.prepare_session(...)` 生成记录;若有 provider 设置则用 `resolve_provider_selection` 决定 provider/model/配置/思考级别;以 `replace(self._config, ...)` 构造新 config(`session_id=record.id`、`storage=jsonl_session_storage(record.path)`、`index_on_first_persist=True`、`extension_runtime=self._extension_runtime`);`load` 出 replacement;`_adopt_replacement(replacement, reason="new")`。

### `_adopt_replacement`

```python
async def _adopt_replacement(self, replacement, reason: Literal["new","resume","branch"]) -> None
```

接管 replacement 的状态并重新绑定扩展运行时(扩展运行时是长生命周期、与 replacement 共享的,必须重新绑定到外层 session,因为后续的消息持久化、parent id 变更都发生在此实例)。

1. `emit_session_shutdown(reason)`,再 `clear_ui_components()`(在 start 之前清理前端)。
2. 把 `replacement` 的几乎全部内部状态逐一复制到 `self`(`_config/_state/_harness/_last_parent_id/skills/.../thinking_level/_pending_initial_entries/extension_runtime`)。
3. `self._extension_runtime.bind(self)` 重新绑定并 `attach_harness_listener(self._harness.subscribe)`。
4. `emit_session_start(reason)`。

### `compact`

```python
async def compact(self, instructions=None) -> str
```

手动压缩:用 `_manual_compaction_plan()` 取全部活动上下文;`_generate_compaction_summary(...)` 生成摘要;`_append_compaction(...)` 写压缩条目。返回 `"Compacted {N} context entries."`。

### `aclose`

```python
async def aclose(self) -> None
```

关闭本会话创建的运行时 provider。`emit_session_shutdown("quit")` 后遍历 `_owned_providers` 调 `await provider.aclose()` 并清空列表。

### `handle_command`

```python
def handle_command(self, text: str) -> CommandResult
```

处理 coding-session 斜杠命令。若是 prompt-template 扩展指令(`expand_prompt_template_command` 非空)则 `CommandResult(handled=False)`(留待 `prompt()` 处理);否则 `self._command_registry.execute(self, text)`。

### `ensure_session_indexed`

```python
def ensure_session_indexed(self) -> None
```

持久化待定的会话元数据并把会话加入 resume 索引。无 id/manager 时返回;若 manager 中无该记录则 `create_session(...)`;随后 `replace(config, index_on_first_persist=False)` 并 `_ensure_session_file_initialized()`。

### `expand_prompt_text`

```python
def expand_prompt_text(self, text: str) -> str
```

用加载的 markdown 资源展开提示词。先试 `expand_prompt_template_command`,再试 `expand_skill_command`;都失败则原样返回。

### `run_terminal_command`

```python
async def run_terminal_command(self, command, *, add_to_context) -> TerminalCommandResult
```

在会话 `cwd` 运行 shell 命令,可选把输出加入上下文。

1. 规范化命令(去空白),空则报错。
2. `create_bash_tool(cwd=..., ...)` 执行;从 `result.data` 取整型 `exit_code`(否则 `None`)。
3. 若 `add_to_context`:记录 `before_count = len(messages)`,把 `_terminal_command_context_message(...)` 包成 `UserMessage` 追加到 harness,失效缓存,`_persist_messages_since(before_count)` 持久化。
4. 返回 `TerminalCommandResult(...)`。

### `prompt`

```python
async def prompt(self, content, *, streaming_behavior=None, source="interactive", custom_type=None, details=None) -> AsyncIterator[AgentEvent]
```

追加用户提示、运行 agent、持久化新消息。这是核心交互入口。

1. `context = self._diagnostic_context()`;运行扩展 `run_input_hooks(...)`,若被处理且带消息则 `ui.notify` 并返回。
2. `content = input_outcome.text`;尝试 `expand_prompt_text(content)`(`ResourceError` 透传,其它异常写诊断日志后抛出)。
3. 若 harness 正在运行:
   - `streaming_behavior == "steer"` → `yield self._harness.steer(...)` 并 return;
   - `== "follow_up"` → `yield self._harness.follow_up(...)` 并 return;
   - 否则抛 `RuntimeError`(要求传 streaming_behavior)。
4. `_try_auto_compact(context, phase="auto_compact_before_prompt")`。
5. `persisted_count = len(messages)`;`auto_name_attempted = False`;`overflow_event = None`。
6. `events = self._harness.prompt(...)`,失效缓存,逐事件:
   - `MessageEndEvent`:`persisted_count = await _persist_messages_since(persisted_count)`;若是 `UserMessage` 且未尝试过命名,则 `_try_auto_name_session(content, context)`。
   - `ToolExecutionEndEvent`:失效缓存。
   - 不可恢复 `ErrorEvent`:写诊断日志;若 `_is_context_overflow_error` 则记 `overflow_event`。
   - 始终 `yield event`。
7. 循环结束后 `_persist_messages_since(persisted_count)`。
8. 若 `overflow_event` 非空:`_try_overflow_compact(context)`,成功则 `retry_persisted_count = len(messages)`,`self._harness.continue_()` 重试,逐事件持久化(与上面同构:MessageEnd/ToolEnd/Error 处理),最后持久化并返回。
9. 无溢出则 `_try_auto_compact(context, phase="auto_compact_after_prompt")`。
10. 任何异常写诊断日志后抛出。

### `continue_`

```python
async def continue_(self) -> AsyncIterator[AgentEvent]
```

从恢复状态继续 agent 并持久化。`context = _diagnostic_context()`;`persisted_count = len(messages)`;跑 `harness.continue_()`,逐事件:`MessageEnd` → 持久化;`ToolExecutionEnd` → 失效缓存;不可恢复 `ErrorEvent` → 写日志;`yield event`;结束后 `_persist_messages_since` + `_try_auto_compact(context, "auto_compact_after_continue")`。异常写日志后抛出。

### `_diagnostic_context`

```python
def _diagnostic_context(self) -> AgentCallDiagnosticContext
```

构造诊断上下文(`provider_name/model/cwd/session_id/run_id=new_agent_call_run_id()`)。

### `_persist_loaded_interrupted_tool_repairs`

```python
async def _persist_loaded_interrupted_tool_repairs(self) -> None
```

为载入时悬挂 tool call 的会话持久化修复(旧版只在内存中修复,resume 后缺合成 tool result,provider 会拒绝整段对话)。用 `_interrupted_tool_repair_plan(state.messages, context_entry_ids=...)` 得到 `(parent_id, suffix)`;为空则返回。否则把 suffix 每一条写成 `MessageEntry`,推进 `_last_parent_id`,追加 `LeafEntry`,刷新 `_last_parent_id` 与持久状态;最后用新 `state.messages` **重建** `AgentHarness`(丢弃旧的,避免监听挂到废弃实例)。

### `_persist_messages_since`

```python
async def _persist_messages_since(self, persisted_count: int) -> int
```

持久化 `persisted_count` 之后的已完成 harness 消息。取 `harness.messages[persisted_count:]`;为空直接返回;否则逐条写 `MessageEntry(parent=last_parent)` + `LeafEntry(parent=entry.id)`,推进 `_last_parent_id`;最后 `_refresh_persisted_state(leaf_id=last_parent)`、失效缓存;返回新 `persisted_count + len(new_messages)`。

### `_invalidate_context_usage_cache`

```python
def _invalidate_context_usage_cache(self) -> None
```

置 `_context_usage_cache = None`(transcript/system/tool 变更后标记脏)。

### `_refresh_persisted_state`

```python
async def _refresh_persisted_state(self, *, leaf_id: str | None) -> None
```

重读全部条目 → `SessionState.from_entries(entries, leaf_id=...)` 更新 `_state`;若有 manager 则 `touch_session(...)`。

### `_read_session_entries`

```python
async def _read_session_entries(self) -> list[SessionEntry]
```

读取存储条目并 `_detach_missing_parents(...)`(断开外部导入的悬挂父节点)。

### `_append_session_entry`

```python
async def _append_session_entry(self, entry: SessionEntry) -> None
```

追加一条持久条目:先 `_ensure_session_initialized()`(落盘延迟的初始条目/索引),再 `storage.append(entry)`。

### `_ensure_session_initialized`

```python
async def _ensure_session_initialized(self) -> None
```

若无 `_pending_initial_entries` 则空返回;否则 `_write_pending_initial_entries()`,若 `index_on_first_persist` 则 `_index_current_session()`。

### `_write_pending_initial_entries`

```python
async def _write_pending_initial_entries(self) -> None
```

把 `_pending_initial_entries` 逐条 `storage.append`,随后置为 `()`。

### `_ensure_session_file_initialized`

```python
def _ensure_session_file_initialized(self) -> None
```

同步版本:若无待定条目则返回;否则逐条 `_append_session_entry_sync(storage, entry)` 并清空待定列表(供无法 await 的斜杠命令使用)。

### `_index_current_session`

```python
def _index_current_session(self) -> None
```

若已有记录则空返回;否则 `manager.create_session(cwd, model, provider_name, session_id=...)` 索引当前会话。

### `_try_auto_compact`

```python
async def _try_auto_compact(self, *, context, phase) -> bool
```

自动压缩的安全包装:调 `_maybe_auto_compact()`;任何异常都写诊断日志(不丢失回合)并返回 `False`。

### `_try_overflow_compact`

```python
async def _try_overflow_compact(self, *, context) -> bool
```

上下文溢出压缩:用 `_recent_preserving_compaction_plan()`;为 `None` 返回 `False`;否则 `_generate_compaction_summary(...)` + `_append_compaction(...)` 返回 `True`;异常写日志并返回 `False`(让原始溢出可见)。

### `_try_auto_name_session`

```python
async def _try_auto_name_session(self, first_message, *, context) -> None
```

若 `_should_auto_name_session()` 为 False 则返回;否则 `_generate_session_name(first_message)`(异常或 `None` 时退化为 `_fallback_session_name`);得到标题后 `_set_auto_session_title(title)`。

### `_should_auto_name_session`

```python
def _should_auto_name_session(self) -> bool
```

无 id/manager 或已有标题则返回 False;否则要求 harness 中 `UserMessage` 数量恰好为 1(即首个用户消息)。

### `_generate_session_name`

```python
async def _generate_session_name(self, first_message: str) -> str | None
```

用 provider 的 `stream_response`(system=`SESSION_NAME_SYSTEM_PROMPT`,无工具)生成至多 4 词的会话名,拼装 `final_text` 或 delta 片段,经 `_sanitize_session_name` 清洗;`ProviderErrorEvent` 时抛 `RuntimeError`。

### `_set_auto_session_title`

```python
def _set_auto_session_title(self, title: str) -> None
```

无 id/manager 或已有标题则空返回;否则 `touch_session(..., title=title)` 记录标题。

### `_provider_is_usable`

```python
def _provider_is_usable(self, provider: ProviderConfig) -> bool
```

`provider_has_usable_credentials(provider, credential_reader=self._credential_store)`。

### `_usable_provider_configs`

```python
def _usable_provider_configs(self) -> tuple[ProviderConfig, ...]
```

无设置则返回 `()`;否则返回所有 `_provider_is_usable` 为真的 provider。

### `_maybe_auto_compact`

```python
async def _maybe_auto_compact(self) -> bool
```

真正的自动压缩决策:`threshold = auto_compact_token_threshold`(`None`/≤0 返回 False);`context_entry_ids` 少于 2 返回 False;`context_token_estimate <= threshold` 返回 False;`_recent_preserving_compaction_plan()` 为 `None` 返回 False;否则生成摘要并 `_append_compaction(...)` 返回 `True`。

### `_generate_compaction_summary`

```python
async def _generate_compaction_summary(self, messages, *, custom_instructions=None) -> str
```

用 `build_compaction_summary_prompt` 构造提示词,经 provider `stream_response`(system=`SUMMARIZATION_SYSTEM_PROMPT`,无工具)流式收集文本;`ProviderErrorEvent` 抛 `RuntimeError`;空摘要抛错;返回 `strip()` 后的摘要。

### `_summarize_branch_messages`

```python
async def _summarize_branch_messages(self, messages, *, custom_instructions=None, replace_instructions=False) -> str
```

尝试 `summarize_branch_messages_with_model(...)`;失败(抛异常)则 `summary = None`,最终回退到 `summarize_messages_for_compaction(messages)`。

### `_manual_compaction_plan`

```python
def _manual_compaction_plan(self) -> CompactionPlan
```

`_active_context_rows()`;为空则抛 `ValueError`;返回覆盖全部行的 `CompactionPlan(replace_entry_ids=..., messages_to_summarize=...)`。

### `_recent_preserving_compaction_plan`

```python
def _recent_preserving_compaction_plan(self) -> CompactionPlan | None
```

保留最近的压缩方案。`_active_context_rows()`;行数 <2 返回 `None`;用 `_first_recent_context_index(rows, keep_recent_tokens=DEFAULT_COMPACTION_KEEP_RECENT_TOKENS)` 找起点,`<=0` 返回 `None`;取前 `first_kept_index` 行作为 replaced,返回对应 `CompactionPlan`(否则 `None`)。

### `_active_context_rows`

```python
def _active_context_rows(self) -> tuple[tuple[str, AgentMessage], ...]
```

`tuple(zip(self._state.context_entry_ids, self._state.messages, strict=True))`。

### `_append_compaction`

```python
async def _append_compaction(self, summary, *, replace_entry_ids) -> CompactionEntry
```

无 `replace_entry_ids` 则抛错;写 `CompactionEntry(parent=last_parent, summary=..., replaces_entry_ids=list(...))` + `LeafEntry`;更新 `_last_parent_id`;`_refresh_persisted_state(leaf_id=compaction.id)`;用 `self._state.messages` 替换 harness 消息、失效缓存;返回 `compaction`。

---

## 模块级函数

### `_first_recent_context_index`

```python
def _first_recent_context_index(rows, *, keep_recent_tokens: int) -> int
```

从末尾向前累加 `estimate_message_tokens`,直到达到 `keep_recent_tokens`,得到 `candidate_index`。随后做“对齐到用户消息边界”的调整:

- 若 candidate 是 user:若其索引 >0 直接返回;否则找下一个 user 消息(index 从 1 起),有则返回其索引否则 0。
- 若 candidate 非 user:找下一个 user 消息,有则返回其索引。
- 否则从 candidate 向后扫描,跳过 `tool` 角色,返回第一个非 tool 的索引;若都跳完返回 `len(rows)`。

特殊处理:`keep_recent_tokens <= 0` 返回 `len(rows)`;`candidate_index is None`(全部行累计都未达阈值)返回 0。

### `_next_user_message_index`

```python
def _next_user_message_index(rows, *, start: int) -> int | None
```

从 `start` 起向后找第一个 role == `"user"` 的行,返回其索引,找不到返回 `None`。

### `_is_context_overflow_error`

```python
def _is_context_overflow_error(event: ErrorEvent) -> bool
```

把 `event.message`(+`event.data`)转小写,匹配一组标记(`"context length"`、`"token limit"`、`"input is too long"` 等)。任一命中即视为上下文溢出错误。

### `_detach_missing_parents`

```python
def _detach_missing_parents(entries: list[SessionEntry]) -> list[SessionEntry]
```

收集全部 entry id;对 `parent_id` 不在集合中的条目,`model_copy(update={"parent_id": None})` 断开为根(导入外部历史时常见),其余原样保留。

### `_last_parent_id_from_state`

```python
def _last_parent_id_from_state(state: SessionState) -> str | None
```

优先 `state.active_leaf_id`;否则取 `state.entries[-1].id`;都为空返回 `None`。

### `_latest_leaf_entry`

```python
def _latest_leaf_entry(entries: list[SessionEntry]) -> LeafEntry | None
```

逆序找第一个 `LeafEntry` 并返回;找不到返回 `None`。

### `_is_branchable_tree_entry`

```python
def _is_branchable_tree_entry(entry: SessionEntry) -> bool
```

`compaction` / `branch_summary` 类型恒为可分支;非 `message` 类型返回 False;`message` 类型仅当是 `UserMessage | AssistantMessage` 时可分支。

### `_tree_choice_label`

```python
def _tree_choice_label(entry: SessionEntry, *, branch_indent: int = 0) -> str
```

在 `_tree_entry_title(entry)` 前加 `"  " * branch_indent` 前缀。

### `_tree_branch_indents`

```python
def _tree_branch_indents(entries: list[SessionEntry]) -> dict[str, int]
```

按 `parent_id` 建 children 表(忽略 leaf),并算每个节点的 sibling 序号;随后对每个非 leaf 节点:`parent_indent = indents.get(parent_id, 0)`,若其 sibling 序号 >0 则 `indent = parent_indent + 1` 否则同父缩进。返回 `entry_id -> indent`。

### `_ordered_tree_entries`

```python
def _ordered_tree_entries(entries: list[SessionEntry]) -> tuple[SessionEntry, ...]
```

用**迭代式**深度优先(避免长链递归爆栈)重排条目:`children_by_parent` 表 → `append_descendants(None)` 从根展开(先 emit 直接子、再逆序压栈以保持原序),并用 `expanded` 集合防父环死循环;最后扫描未被看到的条目补入。返回有序非 leaf 条目序列。

### `_is_tool_call_tree_entry`

```python
def _is_tool_call_tree_entry(entry: SessionEntry) -> bool
```

仅当 `message` 类型、是 `AssistantMessage` 且 `tool_calls` 非空时为真。

### `_tree_entry_title`

```python
def _tree_entry_title(entry: SessionEntry) -> str
```

按类型生成标题:

- `message`:`AssistantMessage` 且有 tool_calls 且无 content → `"tool call: {names}"`;否则 `"{role}: {_message_text_preview}"`。
- `compaction` → `"compaction summary: {_short_preview}"`。
- `branch_summary` → `"branch summary: {_short_preview}"`。
- 其它 → `entry.type`。

### `_message_text_preview`

```python
def _message_text_preview(message: AgentMessage) -> str
```

对 `message.content` 取字符串形式再 `_short_preview`(非 str 用 `str(content)`)。

### `_short_preview`

```python
def _short_preview(text: str, *, limit: int = 72) -> str
```

合并空白(`" ".join(text.split())`),≤limit 直接返回(空则 `"(empty)"`),否则返回 `text[:limit-1] + "..."`。

### `_messages_after_entry_on_active_path`

```python
def _messages_after_entry_on_active_path(entries, entry_id, active_leaf_id) -> tuple[AgentMessage, ...]
```

`active_leaf_id` 为 None 返回 `()`;用 `path_to_entry(entries, active_leaf_id)` 取活动路径(`SessionTreeError` 返回 `()`);找 `entry_id` 在路径中的位置,返回其**之后**所有 `message` 类型条目的消息;找不到目标则返回 `()`。

### `_storage_path`

```python
def _storage_path(storage: SessionStorage) -> Path | None
```

取 `storage.path`,仅当其为 `Path` 时返回,否则 `None`。

### `_resolve_export_destination`

```python
def _resolve_export_destination(destination, *, cwd, session_path, format) -> Path
```

计算导出文件路径:

- `destination is None`:`session_path` 有则用 `default_session_export_artifact_path(session_path, destination_dir=cwd, format)`,否则 `cwd / f"tau-session.{format}"`。
- 有 destination:非绝对则 `cwd / destination`;若已带后缀直接返回;否则以 `session_path.stem`(无则 `"tau-session"`)配合 `default_session_export_artifact_path`。

### `_session_export_title`

```python
def _session_export_title(session: CodingSession) -> str
```

优先返回 manager 中记录的标题;否则 `f"Tau session {session_id}"`(id 为 None 时 `"Tau Session Export"`)。

### `_initial_model_for_config`

```python
def _initial_model_for_config(config: CodingSessionConfig) -> str
```

无 `provider_settings` 或 `runtime_provider_config` 时返回 `config.model`;`_provider_config_for_name` 取不到返回 `config.model`;校验 `config.model` 失败则用 `provider.default_model`;否则 `config.model`。

### `_runtime_model_for_state`

```python
def _runtime_model_for_state(config: CodingSessionConfig, state: SessionState) -> str
```

`state_model = state.model or config.model`;无设置返回 `state_model`;取不到 provider 返回 `state_model`;校验 `state_model` 失败:若 `config.model` 在 `provider.models` 中用 `config.model`,否则 `provider.default_model`;否则返回 `state_model`。

### `_initial_thinking_level_for_config`

```python
def _initial_thinking_level_for_config(config, *, model) -> ThinkingLevel
```

取 provider 配置(无则返回 `config.thinking_level`),用 `_preferred_thinking_level_for_model(provider, model, fallback=config.thinking_level)`。

### `_provider_config_for_name`

```python
def _provider_config_for_name(config, provider_name) -> ProviderConfig | None
```

优先 `provider_settings.get_provider`(失败跳过),其次 `runtime_provider_config`,否则 `None`。

### `_state_thinking_level`

```python
def _state_thinking_level(state: SessionState, default: ThinkingLevel) -> ThinkingLevel
```

取 `getattr(state, "thinking_level", None)`;为空返回 `default`,否则 `normalize_thinking_level(...)`。

### `_default_thinking_level_for_active_model`

```python
def _default_thinking_level_for_active_model(session: CodingSession) -> ThinkingLevel
```

取 `_active_provider_config()`(无则返回 `session._config.thinking_level`),用 `_preferred_thinking_level_for_model(provider, model=session.model, fallback=session._config.thinking_level)`。

### `_preferred_thinking_level_for_model`

```python
def _preferred_thinking_level_for_model(provider, *, model, fallback) -> ThinkingLevel
```

取 `levels = provider_thinking_levels(provider, model)`;`preferred = provider.thinking_defaults.get(model)`;若 `preferred in levels` 返回它;若 `fallback in levels` 或 `levels` 为空返回 `fallback`;否则 `provider_default_thinking_level` 或 `levels[0]`。

### `_coerced_thinking_level`

```python
def _coerced_thinking_level(provider, *, model, current, preferred=None) -> ThinkingLevel
```

`levels = provider_thinking_levels(provider, model)`;若 `levels` 为空或 `current in levels` 返回 `current`;若 `preferred in levels` 返回 `preferred`;否则 `provider_default_thinking_level` 或 `levels[0]`。

### `_unavailable_thinking_message`

```python
def _unavailable_thinking_message(session: CodingSession) -> str
```

基础文案 `"Thinking controls are unavailable for {provider_name}:{model}"`,若 `thinking_unavailable_reason` 非空则追加 `": {reason}"`。

### `_sanitize_session_name`

```python
def _sanitize_session_name(text: str) -> str | None
```

合并空白、剥除引号与 `string.punctuation`、按词再清洗;无词返回 `None`;否则返回前 4 个词拼接(带约束“最多四个词、无标点、无引号”)。

### `_fallback_session_name`

```python
def _fallback_session_name(first_message: str) -> str | None
```

直接 `_sanitize_session_name(first_message)`(命名失败时的兜底)。

### `_terminal_command_context_message`

```python
def _terminal_command_context_message(command: str, output: str) -> str
```

构造加入上下文的用户消息文本:`"Terminal command executed by the user."` + bash 代码块命令 + text 代码块输出。

### `parse_terminal_command`

```python
def parse_terminal_command(text: str) -> TerminalCommandRequest | None
```

解析输入框终端命令语法:`!!` 前缀 → `add_to_context=False`;`!` 前缀 → `add_to_context=True`;命令为空返回 `None`;均不匹配返回 `None`。

### `_category_summary`

```python
def _category_summary(before, after) -> ReloadCategorySummary
```

对比 before/after 签名元组,返回 `ReloadCategorySummary(before=len, after=len, changed=(before != after))`。

### `_skill_signatures`

```python
def _skill_signatures(skills) -> tuple[tuple[object, ...], ...]
```

每个 skill 映射为 `(name, str(path), description, content)` 的签名元组。

### `_prompt_template_signatures`

```python
def _prompt_template_signatures(prompt_templates) -> tuple[tuple[object, ...], ...]
```

每个模板映射为 `(name, str(path), description, content)`。

### `_context_file_signatures`

```python
def _context_file_signatures(context_files) -> tuple[tuple[object, ...], ...]
```

每个上下文文件映射为 `(path, content)`。

### `_diagnostic_signatures`

```python
def _diagnostic_signatures(diagnostics) -> tuple[tuple[object, ...], ...]
```

每个诊断映射为 `(kind, message, str(path)|None, name, severity)`。

### `_extension_signatures`

```python
def _extension_signatures(runtime: ExtensionRuntime) -> tuple[tuple[object, ...], ...]
```

返回 `((name,) for name in runtime.extension_names)`。

### `_system_prompt_resource_signatures`

```python
def _system_prompt_resource_signatures(*, skills, context_files) -> tuple[tuple[object, ...], tuple[object, ...]]
```

返回 `(prompt_skills, context_file_signatures)`:前者按 `name` 排序的 skill 三元组 `(name, str(path), description)`,后者为上下文文件签名。

### `_load_session_resources`

```python
def _load_session_resources(resource_paths, explicit_context_files, *, skills_enabled=True) -> SessionResources
```

加载资源:若 `skills_enabled` 则 `load_skills_with_diagnostics` 否则空;总是 `load_prompt_templates_with_diagnostics` 与 `discover_project_context_with_diagnostics`;把显式与发现到的上下文文件经 `_merge_context_files` 合并;诊断合并 skill/prompt/context 三类;返回 `SessionResources`。

### `_merge_context_files`

```python
def _merge_context_files(explicit, discovered) -> tuple[ProjectContextFile, ...]
```

按 `path` 去重(先 explicit 后 discovered),返回合并后的元组。

### `_interrupted_tool_repair_plan`

```python
def _interrupted_tool_repair_plan(messages, *, context_entry_ids) -> tuple[str, tuple[AgentMessage, ...]] | None
```

修复载入时悬挂的 tool call:收集所有 `ToolResultMessage` 的 `tool_call_id` 作为已返回集合;遍历消息,遇 `AssistantMessage` 时对每个 `tool_calls` 若 id 未返回则补一个 `"Tool call interrupted by user"` 的 `ToolResultMessage`(`ok=False`,`error=...`)。若 `repaired == messages` 返回 `None`;否则算公共前缀长度(为 0 返回 `None`),返回 `(context_entry_ids[common_prefix_length - 1], repaired[common_prefix_length:])`(即挂到前缀末端、待追加的修复消息)。

### `default_session_path`

```python
def default_session_path(cwd: Path) -> Path
```

`TauPaths().default_session_path(cwd)`(用户主目录下该项目的默认会话路径)。

### `jsonl_session_storage`

```python
def jsonl_session_storage(path: str | Path) -> JsonlSessionStorage
```

构造 `JsonlSessionStorage(path)` 的便捷工厂。

### `_append_session_entry_sync`

```python
def _append_session_entry_sync(storage: SessionStorage, entry: SessionEntry) -> None
```

同步追加条目,供无法 await 的斜杠命令初始化使用。仅支持 `JsonlSessionStorage`:确保父目录存在,以追加模式写 `entry_to_json_line(entry)`;否则抛 `RuntimeError("Session storage does not support synchronous initialization")`。

<!-- NAV -->
[← tau_coding · 工具与提示组装]({{< relref "./coding-tools-prompt.md" >}})
[↑ 总览]({{< relref "./source-walkthrough.md" >}})
[→ tau_coding · Slash 命令]({{< relref "./coding-commands.md" >}})
