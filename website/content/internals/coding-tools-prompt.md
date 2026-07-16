---
title: tau_coding · 工具与提示组装
description: tools / system_prompt / context / context_window / skills / resources
---

## `tau_coding/tools.py` — 内置 coding 工具（1057 行）

把"读文件/写文件/改文件/跑命令"做成 `tau_agent` 的 `AgentTool`，并附带更丰富的
`ToolDefinition`（含 prompt 元数据与 JSON Schema）。

### 常量与基础类型

- `DEFAULT_MAX_OUTPUT_BYTES = 50*1024`、`DEFAULT_MAX_OUTPUT_LINES = 2000`、
  `SUPPORTED_IMAGE_MIME_TYPES = {image/jpeg,png,gif,webp}`、`UTF8_BOM`。
- **`ToolInputError(ValueError)`**：参数非法时抛出（被 loop 隔离成 `ok=False` 结果）。
- **`TruncationResult`**（frozen dataclass）：描述一次输出如何被截断——`content`、
  `truncated`、`truncated_by`（"lines"/"bytes"）、行/字节计数、`last_line_partial`、
  `first_line_exceeds_limit`、`max_lines`/`max_bytes`，带 `to_json()`。
- **`ToolDefinition`**（frozen dataclass）：完整工具定义（name/description/
  prompt_snippet/prompt_guidelines/input_schema/executor）；`to_agent_tool()` 转成
  更精简的 `AgentTool`（保留 prompt 元数据供渲染用）。
- `_file_locks: dict[Path, asyncio.Lock]`：进程内**每路径写/改锁**，防同一文件并发
  修改交错。

### `create_coding_tools(*, cwd, shell_command_prefix) -> list[AgentTool]`

返回默认工具集，顺序固定为 `read, write, edit, bash`。`cwd` 缺省用进程 CWD；相对路径
都相对 `cwd` 解析。

### 四个工具的 executor（核心行为）

- **`read`**（`create_read_tool_definition`）：读 UTF-8 文本文件，支持 1-indexed 的
  `offset`/`limit` 切片；图片（按 MIME 检测）则返回 base64 元数据而非文本。越界
  offset 抛 `ToolInputError`。文本经 `truncate_head`（保留头部）截断，并附"用
  offset=N 继续"提示。`data` 带解析后路径与截断元数据。
- **`write`**（`create_write_tool_definition`）：把 `content` 写入 `path`（相对 cwd
  解析），自动建父目录、覆盖已有文件；在 `_file_lock(path)` 内执行（串行化同文件写入）。
- **`edit`**（`create_edit_tool_definition`）：对单文件做**一次或多次精确文本替换**。
  每个 `edits[].oldText` 必须非空、在文件中**恰好出现一次、互不重叠**；全部校验通过
  后才写盘（任一失败则文件不变）。细节：把文本/编辑规范到 LF 匹配，写回时还原原文件
  主导换行符，保留 UTF-8 BOM；兼容旧式顶层 `oldText`/`newText` 与 JSON 字符串
  `edits` 参数。结果 `data` 带 ndiff 风格 diff、unified patch、首个改动行。
- **`bash`**（`create_bash_tool_definition`）：在 `cwd` 跑 shell 命令，stdout+stderr
  合并解码。`timeout` 必须为正；POSIX 上用 `start_new_session=True`（新进程组），
  **超时/取消时 `_kill_process_tree` 用 `os.killpg(pid, SIGKILL)` 杀整个子进程树**
  （管道/复合命令的子进程不会被遗留）——这与之前 Rust 版
  `tau-coding/src/tools.rs` 的 `.process_group(0)` + `killpg` 修复一一对应。输出经
  `truncate_tail`（保留尾部），截断时把完整输出写临时日志文件并在 `data` 报路径。
  结果含 exit_code、是否超时/取消/耗时等元数据；`ok = exit_code==0 且未超时 且未取消`。

### 辅助函数（工具支撑）

- `_communicate_with_cancellation(process, *, timeout, signal)`：并发等待
  `process.communicate()` 与 `_wait_for_cancel(signal)`（`asyncio.wait(FIRST_COMPLETED)`）；
  命令先完成 → 取输出；取消先到 → `_kill_process_tree` 后取部分输出；超时也杀树。
- `truncate_head` / `truncate_tail`：按"行优先、字节封顶"截断，算出 `TruncationResult`
  （`first_line_exceeds_limit` / `last_line_partial` 等边界都处理）。
- `detect_line_ending` / `normalize_to_lf` / `restore_line_endings`：换行符处理。
- `apply_edits_to_normalized_content`：逐编辑校验（非空、唯一出现、不重叠、确实有改动）
  后按从后往前顺序替换；`_count_occurrences` / `_validate_non_overlapping` 等辅助；
  `_not_found_error` / `_duplicate_error` / `_empty_old_text_error` / `_no_change_error`
  给出精确报错。
- `generate_diff_string` / `generate_unified_patch`：基于 `difflib` 生成 diff。
- 参数解析：`_str_arg` / `_path_arg`（相对→cwd 绝对）/ `_optional_int_arg` /
  `_optional_float_arg` / `_prepare_edit_arguments`（规范化旧式参数）/ `_edits_arg`。
- `_file_lock` / `_FileLockContext`：基于全局 `_file_locks` 的异步上下文管理器。
- `_write_temp_output`：写临时日志文件（截断时保存完整输出）。

> 这套工具是 `tau_coding` 对 `tau_agent` 的"可移植大脑"做的**唯一文件系统/Shell 落地**
> ——`tau_agent` 本身完全不碰磁盘与进程。

---

## `tau_coding/system_prompt.py` — 组装 system prompt

- **`ProjectContextFile`**（frozen dataclass）：`path` + `content`，项目指令文件。
- **`BuildSystemPromptOptions`**（frozen dataclass）：组装所需全部输入——`cwd`、
  `tools`、`skills`、`custom_prompt`、`append_system_prompt`、`context_files`、
  `current_date`、`extra_guidelines`（扩展贡献的指引）。
- **`build_system_prompt(options) -> str`**：产出确定性的 Pi 风格 system prompt。
  若给了 `custom_prompt` 则以其为基础；否则用标准开头（"你是 Tau 里的专家编程助手"）
  + 可用工具清单 + 指南。两者都拼上：`append_section`、项目上下文（XML 包裹的
  `<project_context>`）、skills（`read` 工具存在时才加）、当前日期、CWD。
- **`format_available_tools`**：用 `prompt_snippet` 列工具。
- **`collect_prompt_guidelines` / `format_guidelines`**：收集并去重指南——根据工具集
  智能补充（有 bash 但无探索工具 → "用 bash 做 ls/rg/find"；都有 → "优先用
  grep/find/ls 而非 bash"），再加每个工具的 `prompt_guidelines` 与
  `extra_guidelines`，最后补"简洁""清晰显示路径"。
- **`format_project_context`**：用 Pi 风格 XML 包裹项目指令文件。
- **`format_skills_for_prompt`**：`<available_skills>` 列出每个 skill 的
  name/description/location。

---

## `tau_coding/context.py` — 项目指令发现

- `PROJECT_MARKERS = (".git", "pyproject.toml", "uv.lock", "setup.py", "package.json")`。
- **`discover_project_context` / `discover_project_context_with_diagnostics`**：找出要
  注入 system prompt 的项目指令文件（`AGENTS.md` 等），返回 `ProjectContextFile` 元组
  + 非致命诊断。
- **`_context_file_candidates`**：候选 = 用户级 `~/.tau/AGENTS.md`、`~/.agents/AGENTS.md`，
  以及项目内沿 `cwd` 到项目根（由 `PROJECT_MARKERS` 判定）每级目录的 `AGENTS.md`，再加
  项目 `.tau`/`.agents` 目录的 `AGENTS.md`。结果去重。
- `_find_project_root` / `_ancestor_agents_files`：从 cwd 向上找带 marker 的项目根，
  收集根到 cwd 路径上每级的 `AGENTS.md`。

---

## `tau_coding/context_window.py` — 上下文用量估算与压缩

常量：`CHARS_PER_TOKEN=4`、`MESSAGE_OVERHEAD_TOKENS=4`、`TOOL_OVERHEAD_TOKENS=16`、
`DEFAULT_CONTEXT_WINDOW_TOKENS=128_000`、`DEFAULT_COMPACTION_RESERVE_TOKENS=16_384`、
`DEFAULT_COMPACTION_KEEP_RECENT_TOKENS=20_000`。

- 多套**总结提示词**：`SUMMARIZATION_PROMPT`（首轮总结，固定结构化格式：Goal/
  Constraints/Progress/Key Decisions/Next Steps/Critical Context）、
  `UPDATE_SUMMARIZATION_PROMPT`（在已有总结上增量更新）、`TURN_PREFIX_SUMMARIZATION_PROMPT`
  （对过大 turn 的前缀做摘要，保留近期后缀）。
- **`ContextUsageEstimate`**（frozen dataclass）：`total/system/message/tool` token 数 +
  消息/工具计数。
- **`estimate_text_tokens`**（按 4 字符/token 估算）、**`estimate_message_tokens`**
  （按 role 累加 + overhead）、**`estimate_tool_tokens`**（name/description/schema 估算）、
  **`estimate_context_usage`** / **`estimate_context_tokens`**：算出当前请求大致占用。
- **`auto_compaction_threshold_for_context_window`**：Pi 风格的自动压缩阈值 =
  上下文窗口 − 保留储备（16K）。
- **`build_compaction_summary_prompt`**：构建给模型做压缩总结的提示（区分首次/增量，
  可带 `custom_instructions`）；`_split_previous_compaction_summary` 从已有 transcript 头
  部识别上一次压缩摘要。
- **`serialize_messages_for_compaction`** / **`summarize_messages_for_compaction`**：把
  消息序列化成压缩器可读格式 / 生成一个确定性的极简摘要（无 LLM 时的兜底）。

> `CodingSession` 用这里估算的用量决定何时 `auto_compact`，并在上下文溢出时用
> `build_compaction_summary_prompt` 触发压缩（对应 Part 3b 的
> `_try_auto_compact` / `_try_overflow_compact`）。

---

## `tau_coding/skills.py` — Markdown 技能加载

- **`Skill`**（frozen dataclass）：`name`/`path`/`content`/`description`。遵循 Agent
  Skills 规范：**技能是含 `SKILL.md` 的目录**（裸 `.md` 不再当技能，给出迁移诊断，
  见 ADR 0003，刻意与 Pi 不同）。
- **`SkillInvocation`**：解析后的 `/skill:name` 展开消息。
- **`load_skills` / `load_skills_with_diagnostics`**：从资源目录加载技能，**按优先级
  递增顺序**（用户 < 项目），同名后者覆盖前者，并作为诊断上报。`skills_dirs` 来自
  `resources.TauResourcePaths`。
- **`expand_skill_command(text, skills)`**：把 `/skill:name [请求]` 展开成完整 skill
  调用 prompt（`<skill name=... location=...>` 包裹 skill 内容 + 附加指令）。
- **`parse_skill_invocation`**：正则解析 Tau 的展开格式。
- **`build_skill_index`**：生成技能简要索引。
- `_load_skills_from_dir_with_diagnostics`：遍历目录，处理 `SKILL.md` 子目录技能、跳过
  裸 `.md`（给 info 诊断）、跳过 `AGENTS.MD`、报告重名；`_load_skill` 用
  `parse_markdown_resource` 解析 frontmatter + 正文，`description` 缺省用首行推导。

---

## `tau_coding/resources.py` — 资源路径与 frontmatter

- **`ResourceError(ValueError)`**：资源无效/无法展开时抛出。
- **`ResourceDiagnostic`**（frozen dataclass）：非致命发现诊断（kind/message/path/
  name/severity），带 `format()` 输出可读行。
- **`TauResourcePaths`**（frozen dataclass）：Tau markdown 资源的位置集合。默认
  `root=~/.tau`、`agents_root=~/.agents`，可选 `cwd`（提供则自动加载项目级 `.tau`/
  `.agents` 资源）。关键属性：
  - `skills_dir`（主 skills 目录）、`prompts_dir`（主 prompt 模板目录）。
  - `skills_dirs` / `prompts_dirs`：按**优先级递增**返回目录元组（Tau 原生 →
    `.agents` → 项目 `.tau`/`.agents`），只扫 `skills`/`prompts` 子目录，结果去重。
- **`resource_paths_with_cwd(paths, cwd)`**：补上 cwd 以便项目级发现。
- **`parse_markdown_resource(text)`**：解析极简 `key: value` frontmatter（无依赖、
  不执行代码），返回 `(metadata, body)`。
- **`derive_description(content)`**：从正文首行（标题或首句）推导描述。
- **`metadata_to_json`**：字符串 metadata 转 JSON 值。

> `TauResourcePaths` 是 `skills`/`context` 共用的"资源发现底座"；`CodingSession.load`
> 把它传给 `load_skills` 与 `_load_session_resources`，从而把 skills、context files 注入
> system prompt。

---

## 本部分小结

Part 3a 让"抽象 agent"变成"会读文件、会跑命令的编程助手"：

- `tools.py` 提供 4 个落地工具（read/write/edit/bash），带截断、锁、进程树管理；
- `system_prompt.py` 把工具/skills/上下文拼成模型看到的提示；
- `context*.py` 负责发现项目指令与估算/压缩上下文；
- `skills.py` / `resources.py` 负责加载 Markdown 技能与资源路径。

下一任务（Part 3b）看 `tau_coding/session.py` 的 `CodingSession`——它把这些工具、
提示、资源组合起来，包住 `AgentHarness`，并负责持久化、命令、压缩、溢出恢复。

<!-- NAV -->
[← tau_agent · 公共导出与边界]({{< relref "./agent-init-boundary.md" >}})
[↑ 总览]({{< relref "./source-walkthrough.md" >}})
[→ tau_coding · CodingSession]({{< relref "./coding-session.md" >}})
