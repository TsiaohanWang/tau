---
title: tau_coding · 工具与提示组装
description: tools / system_prompt / context / context_window / skills / resources
code_files:
  - tau_coding/tools.py
  - tau_coding/system_prompt.py
  - tau_coding/context.py
  - tau_coding/context_window.py
  - tau_coding/skills.py
  - tau_coding/resources.py
---

## `tau_coding/tools.py` — 内置 coding 工具（1057 行）

这一模块把"读文件/写文件/改文件/跑命令"这四个最基本的文件系统与 Shell 操作封装成 Agent 工具——让大语言模型（LLM）能够通过函数调用（function calling）来操作你的电脑。每个工具都以两层结构暴露：`ToolDefinition` 是带完整元数据的内部定义，`AgentTool` 是精简后给 agent 循环消费的接口。

### 常量与基础类型

- `DEFAULT_MAX_OUTPUT_BYTES = 50*1024`、`DEFAULT_MAX_OUTPUT_LINES = 2000`、
  `SUPPORTED_IMAGE_MIME_TYPES = {image/jpeg,png,gif,webp}`、`UTF8_BOM`。
  这些常量定义了工具输出的最大截断阈值——当模型读取或执行命令后返回的内容过长时，工具会按这些限制截断输出，防止把过多数据塞进上下文窗口（模型一次能处理的最大 token 数量）。
- **`ToolInputError(ValueError)`**：当模型传入的参数不合法时抛出的统一异常，由 agent 循环捕获并转化为结构化的失败结果（`ok=False`），而不是让程序崩溃。
- **`TruncationResult`**（frozen dataclass）：描述一次输出如何被截断——`content`、
  `truncated`、`truncated_by`（"lines"/"bytes"）、行/字节计数、`last_line_partial`、
  `first_line_exceeds_limit`、`max_lines`/`max_bytes`，带 `to_json()`。
- **`ToolDefinition`**（frozen dataclass）：完整工具定义（name/description/
  prompt_snippet/prompt_guidelines/input_schema/executor）；`to_agent_tool()` 转成
  更精简的 `AgentTool`（保留 prompt 元数据供渲染用）。
- `_file_locks: dict[Path, asyncio.Lock]`：进程内**每路径写/改锁**，防同一文件并发修改交错。这个锁确保同一个文件不会被两个并发的写操作同时修改，否则内容会交错混乱。

```python
@dataclass(frozen=True, slots=True)
class ToolDefinition:
    name: str
    description: str
    prompt_snippet: str
    prompt_guidelines: tuple[str, ...]
    input_schema: Mapping[str, JSONValue]
    executor: ToolExecutor

    def to_agent_tool(self) -> AgentTool:
        return AgentTool(
            name=self.name,
            description=self.description,
            input_schema=self.input_schema,
            executor=self.executor,
            prompt_snippet=self.prompt_snippet,
            prompt_guidelines=self.prompt_guidelines,
        )
```
> `ToolDefinition` 是带 prompt 元数据与 JSON Schema 的"完整定义"；`to_agent_tool()` 把它压成 provider 中立的精简 `AgentTool`，让 agent 循环只关心 `name`/`description`/`input_schema`/`executor`。

### `create_coding_tools(*, cwd, shell_command_prefix) -> list[AgentTool]`

返回默认工具集，顺序固定为 `read, write, edit, bash`。`cwd` 缺省用进程 CWD；相对路径
都相对 `cwd` 解析。

```python
def create_coding_tools(*, cwd=None, shell_command_prefix=None) -> list[AgentTool]:
    root = Path.cwd() if cwd is None else Path(cwd)
    return [
        create_read_tool(cwd=root),
        create_write_tool(cwd=root),
        create_edit_tool(cwd=root),
        create_bash_tool(cwd=root, shell_command_prefix=shell_command_prefix),
    ]
```
> 顺序即模型看到的工具注册顺序：`read, write, edit, bash`。所有相对路径都相对同一个 `cwd` 解析，同进程内共享 `_file_locks` 串行化同文件写入。

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

```python
async def _communicate_with_cancellation(process, *, timeout, signal):
    communicate = asyncio.create_task(process.communicate())
    wait_for = {communicate}
    if signal is not None:
        wait_for.add(asyncio.create_task(_wait_for_cancel(signal)))
    done, _ = await asyncio.wait(wait_for, timeout=timeout, return_when=FIRST_COMPLETED)
    if communicate in done:
        return (*communicate.result(), False, False)   # 命令先完成
    cancelled = signal is not None and _wait_for_cancel_task in done
    _kill_process_tree(process)                        # 超时/取消都杀整组
    out, err = await communicate
    return (out, err, not cancelled, cancelled)

def _kill_process_tree(process):
    if os.name == "posix":
        os.killpg(process.pid, signal.SIGKILL)   # pid 即进程组 id，整组强杀
    else:
        process.kill()
```
> 这是与 Rust 版 `killpg` 修复一一对应的关键：POSIX 下因 `start_new_session=True`，`pid` 即进程组 id，`os.killpg` 能连管道/复合命令的子进程一起杀掉，不留孤儿。

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

**为什么工具是"schema + async executor 返回结构化结果"**：Tau 官方原则 "Tools are
ordinary typed functions" 要求工具不是隐式魔法,而是带明确输入契约的普通异步函数。每个
`ToolDefinition` 都携带 JSON Schema（一种标准化的参数描述格式，告诉模型每个参数叫什么、是什么类型），供 provider 做参数校验与函数调用，以及一个 async executor（签名 `(arguments, signal) -> AgentToolResult`），执行器返回的是**结构化** `AgentToolResult`（`ok`/`content`/`error`/`data`），而非裸字符串。这样做的收益:
参数在进入执行器前即被 schema 约束;结果里的 `data`（截断元数据、diff、退出码等）可被前端渲染、被会话落盘、被 agent 循环判定成败,全程类型清晰、可测试。

结构与落地也印证了 "The core stays portable":这套 read/write/edit/bash 是 `tau_coding`
为 `tau_agent` 的可移植内核做的**唯一文件系统/Shell 落地**——`tau_agent` 本身完全不碰磁盘
与进程,工具作为普通 typed function 从外部注入。这意味着 `tau_agent` 可以在不同环境（本地、远程、测试）中复用，只要注入不同的工具实现即可。

---

## `tau_coding/system_prompt.py` — 组装 system prompt

System prompt（系统提示词）是每次对话开始时发给模型的一段"身份说明书"，告诉模型它是谁、能做什么、该遵守什么规则。它就像给新员工的入职手册——在 agent 开始干活之前，先明确告诉它：你是编程助手，你有 read/write/edit/bash 这些工具，你应该怎么用它们。这个模块负责把工具清单、技能、项目上下文等信息拼装成一份完整的 system prompt。

- **`ProjectContextFile`**（frozen dataclass）：`path` + `content`，项目指令文件（比如 `AGENTS.md`），用于把项目特定的编码规范注入 system prompt。
- **`BuildSystemPromptOptions`**（frozen dataclass）：组装所需全部输入——`cwd`、
  `tools`、`skills`、`custom_prompt`、`append_system_prompt`、`context_files`、
  `current_date`、`extra_guidelines`（扩展贡献的指引）。
- **`build_system_prompt(options) -> str`**：产出确定性的 Pi 风格 system prompt。
  若给了 `custom_prompt` 则以其为基础；否则用标准开头（"你是 Tau 里的专家编程助手"）
  + 可用工具清单 + 指南。两者都拼上：`append_section`、项目上下文（XML 包裹的
  `<project_context>`）、skills（`read` 工具存在时才加）、当前日期、CWD。
  - **为什么系统提示由确定性纯函数组装**：`build_system_prompt` 的输出只取决于
    `BuildSystemPromptOptions` 的输入，无隐藏状态、无随机项，同样的工具/skills/上下文必得
    同样的提示。这既服务 "Small layers beat magic"（提示的每一段都可追溯到某个显式输入，
    而非藏在框架里的魔法），也让提示本身可 diff、可测试、可随 `/reload` 精确重建。工具清单
    直接由注入的 `tools` 派生，skills 仅在 `read` 工具存在时才加——保证模型看到的能力清单
    与实际可调用的工具严格一致，不会承诺一个不存在的工具。这就像餐厅菜单上只列厨房能做的菜——不会让顾客点一道做不出来的菜。
- **`format_available_tools`**：用 `prompt_snippet` 列工具。
- **`collect_prompt_guidelines` / `format_guidelines`**：收集并去重指南——根据工具集
  智能补充（有 bash 但无探索工具 → "用 bash 做 ls/rg/find"；都有 → "优先用
  grep/find/ls 而非 bash"），再加每个工具的 `prompt_guidelines` 与
  `extra_guidelines`，最后补"简洁""清晰显示路径"。
- **`format_project_context`**：用 Pi 风格 XML 包裹项目指令文件。
- **`format_skills_for_prompt`**：`<available_skills>` 列出每个 skill 的
  name/description/location。

```python
def build_system_prompt(options: BuildSystemPromptOptions) -> str:
    current_date = options.current_date or date.today()
    cwd = _format_path(options.cwd)
    append_section = f"\n\n{options.append_system_prompt}" if options.append_system_prompt else ""
    if options.custom_prompt is not None:
        prompt = options.custom_prompt
        prompt += append_section
        prompt += format_project_context(options.context_files)
        if _has_tool(options.tools, "read"):
            prompt += format_skills_for_prompt(options.skills)
        prompt += f"\nCurrent date: {current_date.isoformat()}"
        prompt += f"\nCurrent working directory: {cwd}"
        return prompt
    prompt = (
        "You are an expert coding assistant operating inside Tau, a coding agent harness. ..."
        f"\n\nAvailable tools:\n{format_available_tools(options.tools)}"
        f"\n\nGuidelines:\n{format_guidelines(options.tools, options.extra_guidelines)}"
    )
    prompt += append_section
    prompt += format_project_context(options.context_files)
    if _has_tool(options.tools, "read"):   # 仅在 read 存在时才加 skills
        prompt += format_skills_for_prompt(options.skills)
    prompt += f"\nCurrent date: {current_date.isoformat()}"
    prompt += f"\nCurrent working directory: {cwd}"
    return prompt

def collect_prompt_guidelines(tools, extra_guidelines=()):
    names = {tool.name for tool in tools}
    has_bash = "bash" in names
    has_exploration = bool({"grep", "find", "ls"} & names)
    guidelines = []
    if has_bash and not has_exploration:
        guidelines.append("Use bash for file operations like ls, rg, find")
    elif has_bash and has_exploration:
        guidelines.append("Prefer grep/find/ls tools over bash for file exploration")
    for tool in tools:
        guidelines.extend(tool.prompt_guidelines)
    guidelines.extend(extra_guidelines)
    guidelines += ["Be concise in your responses", "Show file paths clearly when working with files"]
    return _dedup(guidelines)
```
> `build_system_prompt` 是确定性纯函数：输出只由 `BuildSystemPromptOptions` 决定；工具清单直接派生自注入的 `tools`，skills 仅在 `read` 工具存在时才加，保证模型看到的能力与实际可调用的工具严格一致。

---

## `tau_coding/context.py` — 项目指令发现

这个模块负责自动发现项目级别的指令文件（主要是 `AGENTS.md`）。想象你走进一个新项目，桌上放着一份"项目规范"——这个模块就是在系统启动时帮你找到这份规范，然后把它注入到 system prompt 中，让模型了解这个项目的编码风格和约定。

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

**上下文窗口**（context window）是模型一次对话能处理的最大 token 数量，可以把它想象成模型的"短期记忆容量"。对话越长，消耗的 token 越多；一旦接近窗口上限，模型就会"忘掉"最早的消息。**自动压缩**（auto-compact）就是解决这个问题的机制——在 token 用量接近上限时，自动把早期对话总结成一段摘要，腾出空间继续工作。这个模块提供了 token 用量估算和压缩提示构造这两项能力。

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

**为什么估算与压缩逻辑独立成层**：token 估算（`estimate_context_usage`）与压缩提示构造（`build_compaction_summary_prompt`）都是纯函数，不持有会话状态，也不直接调用模型。`CodingSession` 用这里估算的用量决定何时 `auto_compact`，并在上下文溢出时用
`build_compaction_summary_prompt` 触发压缩（对应 Part 3b 的 `_try_auto_compact` /
`_try_overflow_compact`）。把"多少 token""该压缩哪些消息"从"如何落盘压缩结果"中拆开,
既呼应 "Small layers beat magic"，也让阈值与保留策略（如 `DEFAULT_COMPACTION_KEEP_RECENT_TOKENS`，默认保留最近 20000 token 的对话不被压缩）
可单独测试与调参，而不必启动一次真实会话。

---

## `tau_coding/skills.py` — Markdown 技能加载

**技能**（skill）在这个上下文中是一种特殊的 Markdown 文件，它为模型提供"如何完成某类任务"的指导——比如"如何做代码审查"或"如何写测试"。每个技能是一个包含 `SKILL.md` 的目录，模型可以通过 `/skill:name` 斜杠命令在对话中调用它。这个模块负责发现、加载和展开这些技能文件。

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

这个模块提供了资源文件的路径发现和解析能力。Frontmatter 是 Markdown 文件顶部用 `key: value` 格式写的元数据块（用 `---` 包裹），类似于 YAML 语法。它让技能和模板文件可以声明自己的名称、描述等属性，而不影响正文内容。

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

这五个模块共同构成了"从抽象 agent 到真正能干活的编程助手"的基础设施：

- `tools.py` 提供 4 个落地工具（read/write/edit/bash），带截断、锁、进程树管理——这是模型与文件系统和 Shell 交互的唯一通道；
- `system_prompt.py` 把工具/skills/上下文拼成模型看到的提示——让模型知道自己能做什么、该怎么做；
- `context*.py` 负责发现项目指令与估算/压缩上下文——确保模型始终能看到最新的项目规范，且不会因为对话太长而"撑爆"短期记忆；
- `skills.py` / `resources.py` 负责加载 Markdown 技能与资源路径——让模型可以调用预定义的任务指导。

下一任务（Part 3b）看 `tau_coding/session.py` 的 `CodingSession`——它把这些工具、
提示、资源组合起来，包住 `AgentHarness`，并负责持久化、命令、压缩、溢出恢复。

---

## 逐方法深层剖析（tools.py）

> 以下对四个内置 coding 工具及其所有辅助函数做逐方法展开。

## 内置工具概览

本模块 `tau_coding/tools.py` 为 Tau 的本地编码会话提供四个内置工具：`read`、`write`、`edit`、`bash`。这四个工具是模型与外部世界交互的全部通道——模型通过 `read` 看代码，通过 `edit` 做精确修改，通过 `write` 创建新文件，通过 `bash` 执行任意命令。工具以两层对象暴露：

- **`ToolDefinition`**(模块内定义)：包含名称、描述、prompt 片段与准则、JSON 输入 schema、以及异步执行器 `executor`。这是"完整定义"，保留给需要 prompt 元数据与 schema 的调用方。
- **`AgentTool`**(来自 `tau_agent.tools`)：由 `ToolDefinition.to_agent_tool()` 转换而来的精简对象，被 provider 中立的 agent 循环消费。

四个工具通过 `create_coding_tools(...)` 一次性组装为有序列表 `[read, write, edit, bash]`。所有相对路径都相对于一个可配置的工作目录 `cwd`(缺省为进程当前目录)解析；同一进程内对同一文件的写入/编辑通过进程级字典 `_file_locks` 中的 `asyncio.Lock` 串行化，避免并发突变交错。

核心常量：
- `DEFAULT_MAX_OUTPUT_BYTES = 50 * 1024`(50KB)
- `DEFAULT_MAX_OUTPUT_LINES = 2_000`
- `SUPPORTED_IMAGE_MIME_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp"}`
- `UTF8_BOM = "\ufeff"`

模块的顶层数据结构与工厂函数在下文逐一展开；四个内置工具的详细行为在各自的 `## read 工具` 等小节中详述。

---

## ToolInputError

### class ToolInputError(ValueError)

模块级异常类(行 34-35)，继承自标准库 `ValueError`。当工具收到结构化的非法参数(类型错误、取值非法、文件不存在、oldText 不唯一等)时抛出。它是所有工具执行器内部校验失败的统一出口，由调用方捕获并转化为工具失败结果(在 `bash` 中变为 `ok=False` 与 `error`)。

---

## TruncationResult

### class TruncationResult( frozen=True, slots=True )

冻结的、使用 `__slots__` 的数据类(行 38-59)，描述"一次工具输出被如何截断"的元数据。字段：

- `content: str`：实际返回的切片内容。
- `truncated: bool`：是否发生了截断。
- `truncated_by: str | None`：触发截断的限制维度，取值 `"lines"` 或 `"bytes"` 或 `None`。
- `total_lines: int` / `total_bytes: int`：原始输出的总行数/总字节数。
- `output_lines: int` / `output_bytes: int`：返回切片的实际行数/字节数。
- `last_line_partial: bool`：末尾行是否因为字节限制被从尾部裁剪而变成"半行"(仅 `truncate_tail` 可能置位)。
- `first_line_exceeds_limit: bool`：首行是否因为单行长于字节限制而无法安全展示(仅 `truncate_head` 可能置位)。
- `max_lines: int` / `max_bytes: int`：本次截断所采用的上限(始终为模块常量)。

### to_json(self) -> dict[str, JSONValue]

将整个数据类通过 `dataclasses.asdict` 序列化为普通 `dict[str, JSONValue]`(行 61-62)，用于塞进 `AgentToolResult.data["truncation"]`，供前端渲染截断提示。

---

## ToolDefinition

### class ToolDefinition( frozen=True, slots=True )

冻结数据类(行 65-90)，表示一个编码工具在转换为 provider 工具之前的"完整定义"。字段：

- `name: str`、`description: str`、`prompt_snippet: str`
- `prompt_guidelines: tuple[str, ...]`：写进提示词、指导模型如何正确使用该工具的准则。
- `input_schema: Mapping[str, JSONValue]`：JSON Schema 片段。
- `executor: ToolExecutor`：异步执行器(签名为 `async (arguments, signal) -> AgentToolResult`)。

### to_agent_tool(self) -> AgentTool

(行 82-90)构造并返回 `tau_agent.tools.AgentTool`，把 `name`、`description`、`input_schema`、`executor`、以及 prompt 元数据 `prompt_snippet`/`prompt_guidelines` 一并透传。注意 `tool_call_id` 不在此设置(留空字符串在 `AgentToolResult` 中由执行器填写)。

```python
def to_agent_tool(self) -> AgentTool:
    return AgentTool(
        name=self.name,
        description=self.description,
        input_schema=self.input_schema,
        executor=self.executor,
        prompt_snippet=self.prompt_snippet,
        prompt_guidelines=self.prompt_guidelines,
    )
```
> 深究：provider 中立的 `AgentTool` 不关心 prompt 元数据如何生成，它只透传——`prompt_snippet`/`prompt_guidelines` 留给前端渲染工具指引，内核循环只用 `name`/`executor`。

---

## create_coding_tools

### create_coding_tools(*, cwd: str | Path | None = None, shell_command_prefix: str | None = None) -> list[AgentTool]

(行 96-116)工厂入口，返回默认编码工具集。实现要点：

1. `root = Path.cwd() if cwd is None else Path(cwd)`——解析基准工作目录；`cwd` 缺省时取工厂调用时刻的进程当前目录。
2. 顺序返回四个已转换为 `AgentTool` 的对象：`create_read_tool(cwd=root)`、`create_write_tool(cwd=root)`、`create_edit_tool(cwd=root)`、`create_bash_tool(cwd=root, shell_command_prefix=shell_command_prefix)`。
3. 所有工具共享进程内 `_file_locks`，从而同一文件的多重写入/编辑互斥；`bash` 额外接收 `shell_command_prefix`，在每次命令前拼一个 setup 前缀。

---

## create_read_tool_definition

### create_read_tool_definition(*, cwd: str | Path | None = None) -> ToolDefinition

(行 119-252)构造 `read` 工具的完整定义。先解析 `root`(同上)，再定义内嵌异步执行器 `execute`，最后返回 `ToolDefinition`，其 schema 仅要求 `path`，可选 `offset`/`limit`。

### execute(arguments, signal) — 内嵌于 create_read_tool_definition

(行 136-229)读取文件的核心逻辑，逐步：

1. `del signal`——`read` 不响应取消信号，显式丢弃。
2. `raw_path = _str_arg(arguments, "path")`——保留原始传入路径字符串(用于提示信息)；`path = _path_arg(arguments, "path", cwd=root)`——解析为绝对 `Path`。
3. `offset = _optional_int_arg(arguments, "offset")`、`limit = _optional_int_arg(arguments, "limit")`。若 `offset < 0` 抛 `ToolInputError("offset must be at least 0")`；若 `limit < 1` 抛 `ToolInputError("limit must be at least 1")`。
4. 校验：`path.exists()` 否则抛 `File not found`；`path.is_dir()` 否则抛 `Path is a directory`。注意：特殊路径 `/` 会落在此处的"是目录"分支而报错(源码没有对 `/` 做专门列出目录的特殊处理)。
5. `mime_type = _detect_supported_image_mime_type(path)`——若命中支持的图像 MIME，则 `data = path.read_bytes()`，返回 `AgentToolResult`，`content="Read image file [{mime_type}]"`，`data` 含 `path`、`mime_type`、`bytes`、以及 `_base64_text(data)` 得到的 `image_base64`。不进入文本截断逻辑。
6. 文本路径：`text = path.read_text(encoding="utf-8")`；`all_lines = text.split("\n")`(按 `\n` 切分，保留末尾空串)。
7. `start_line = 0 if offset is None or offset == 0 else offset - 1`——offset 为 1 索引，转 0 索引。若 `start_line >= len(all_lines)` 抛 `Offset ... is beyond end of file` 错误。
8. 若给定 `limit`：`end_line = min(start_line + limit, len(all_lines))`，取切片 `all_lines[start_line:end_line]` 用 `\n` 连接，并记录 `user_limited_lines = end_line - start_line`；否则取 `start_line:` 之后的全部。
9. `truncation = truncate_head(selected)`——对选中文本做"从头截断"判断(行/字节双限)。
10. `start_display = start_line + 1`；`details = {"path": str(path), "truncation": truncation.to_json()}`。
11. 输出文案分支：
    - 若 `truncation.first_line_exceeds_limit`：首行过长，输出一段指导用 `bash: sed -n '<start_display>p' <raw_path> | head -c <DEFAULT_MAX_OUTPUT_BYTES>` 取该行的提示(用 `format_size` 显示大小)。
    - 若 `truncation.truncated`：在 `truncation.content` 后追加续读提示；若因行数限制，提示 `Showing lines {start_display}-{end_display} of {total}... Use offset={next_offset}`；若因字节限制，附加 `({format_size(DEFAULT_MAX_OUTPUT_BYTES)} limit)`。`end_display = start_display + truncation.output_lines - 1`，`next_offset = end_display + 1`。
    - 否则若 `user_limited_lines is not None` 且仍有剩余行：输出 `truncation.content` 并提示剩余行数与 `next_offset`。
    - 否则直接使用 `truncation.content`(无截断、无剩余)。
12. 返回 `AgentToolResult(ok=True, name="read", content=output, data=details)`。

`description` 文案明确告知：文本输出被截断到 `DEFAULT_MAX_OUTPUT_LINES` 行或 `DEFAULT_MAX_OUTPUT_BYTES//1024 KB`(先到先停)，用 offset/limit 处理大文件。`prompt_guidelines` 建议"用 read 检查文件而非 cat/sed"。

---

## create_read_tool

### create_read_tool(*, cwd: str | Path | None = None) -> AgentTool

(行 255-257)薄封装，等价于 `create_read_tool_definition(cwd=cwd).to_agent_tool()`。`description` 注释写"用于读取 UTF-8 文本文件与受支持的图像"。

---

## create_write_tool_definition

### create_write_tool_definition(*, cwd: str | Path | None = None) -> ToolDefinition

(行 260-312)构造 `write` 工具的完整定义，内嵌 `execute`,schema 要求 `path` 与 `content`。

### execute(arguments, signal) — 内嵌于 create_write_tool_definition

(行 275-293)写入文件：

1. `del signal`——`write` 不响应取消信号。
2. `path = _path_arg(arguments, "path", cwd=root)`、`content = _str_arg(arguments, "content")`。
3. `async with _file_lock(path):`——获取该绝对路径对应的进程内 `asyncio.Lock`，串行化同文件并发写。
4. 在锁内：`path.parent.mkdir(parents=True, exist_ok=True)` 自动创建父目录；`path.write_text(content, encoding="utf-8")` 以 UTF-8 **整体覆盖**写入(已存在文件被覆盖,不存在则新建)。
5. 返回 `AgentToolResult(ok=True, content=f"Successfully wrote to {path}.", data={"path": str(path), "characters": len(content)})`——`characters` 是传入字符串的字符数(而非字节数)。

注意：源码中 `write` 的 `execute` 并没有实现"超大文件状态块"逻辑(无 BOM 剥离、无行尾归一、无大小阈值分支)——它始终直接 `write_text`。`_strip_bom`/`restore_line_endings` 等仅用于 `edit`。`description` 文案强调"覆盖写、自动建父目录"。

---

## create_write_tool

### create_write_tool(*, cwd: str | Path | None = None) -> AgentTool

(行 315-317)薄封装：`create_write_tool_definition(cwd=cwd).to_agent_tool()`。

---

## create_edit_tool_definition

### create_edit_tool_definition(*, cwd: str | Path | None = None) -> ToolDefinition

(行 320-425)构造 `edit` 工具的完整定义，内嵌 `execute`,schema 要求 `path` 与 `edits`(数组,每项 `{oldText, newText}`,`additionalProperties: False`)。`description`/`prompt_guidelines` 强调：每个 `oldText` 必须精确匹配且全局唯一、不可重叠;多处分开改动应在一次调用中以多个 `edits` 项给出,不要发重叠/嵌套 edits,`oldText` 应短而唯一。

### execute(arguments, signal) — 内嵌于 create_edit_tool_definition

(行 340-379)精确文本替换：

1. `del signal`——`edit` 不响应取消信号。
2. `prepared = _prepare_edit_arguments(arguments)`——规范化参数(兼容旧式顶层 `oldText`/`newText` 与 JSON 字符串 `edits`)。
3. `path = _path_arg(prepared, "path", cwd=root)`、`edits = _edits_arg(prepared)`——校验并提取 edits 列表。
4. 校验：`path.exists()` 否则抛 `File not found`；`path.is_dir()` 否则抛 `Path is a directory`。
5. `async with _file_lock(path):`——获取文件锁。
6. `raw_content = path.read_text(encoding="utf-8")`；`bom, content = _strip_bom(raw_content)`——剥离 UTF-8 BOM 并记录。
7. `original_ending = detect_line_ending(content)`——探测原文件主导行尾(CRLF/LF)。
8. `normalized = normalize_to_lf(content)`——统一成 LF 便于匹配。
9. `base_content, new_content = apply_edits_to_normalized_content(normalized, edits, str(path))`——在归一化文本上执行所有 edits(含唯一性/重叠/非空校验)。
10. `final_content = bom + restore_line_endings(new_content, original_ending)`——重新加回 BOM,并按原行尾恢复。
11. `path.write_text(final_content, encoding="utf-8")`——写回。
12. 锁外：`diff_text, first_changed_line = generate_diff_string(base_content, new_content)`；`patch = generate_unified_patch(str(path), base_content, new_content)`。
13. 返回 `AgentToolResult(ok=True, content=f"Successfully replaced {len(edits)} block(s) in {path}.", data={path, edits 数, diff, patch, first_changed_line})`。

关键点:所有校验(找得到、唯一、不重叠、非空、确实有变化)在写盘前完成,任一失败抛 `ToolInputError`,文件保持未改动(因为写盘在锁内但校验在写盘前)。

---

## create_edit_tool

### create_edit_tool(*, cwd: str | Path | None = None) -> AgentTool

(行 428-430)薄封装：`create_edit_tool_definition(cwd=cwd).to_agent_tool()`。

---

## create_bash_tool_definition

### create_bash_tool_definition(*, cwd: str | Path | None = None, shell_command_prefix: str | None = None) -> ToolDefinition

(行 433-571)构造 `bash` 工具定义。先解析 `root`;如有 `shell_command_prefix` 则 `prefix = shell_command_prefix.strip()`,否则 `None`。内嵌 `execute`,schema 要求 `command`,可选数字 `timeout`。

### execute(arguments, signal) — 内嵌于 create_bash_tool_definition

(行 457-547)执行 shell 命令：

1. `command = _str_arg(arguments, "command")`；`shell_command = _prefixed_shell_command(command, prefix)`(若有 prefix 则前置为 `prefix\ncommand`)。
2. `timeout = _optional_float_arg(arguments, "timeout")`;若 `timeout is not None and timeout <= 0` 抛 `timeout must be greater than 0`。
3. 若 `signal is not None and signal.is_cancelled()` 抛 `Command cancelled`(在起进程前判断)。
4. `start = monotonic()`——计时起点。
5. **POSIX**:`asyncio.create_subprocess_shell(shell_command, cwd=root, stdout=PIPE, stderr=STDOUT, start_new_session=True, executable="bash" if prefix else None)`——合并 stderr 到 stdout,新建会话(便于超时整体杀组),有 prefix 时显式用 `bash` 解释器。
   **非 POSIX**:同样 `create_subprocess_shell` 但不带 `start_new_session`/`executable`。
6. `output_bytes, _stderr, timed_out, cancelled = await _communicate_with_cancellation(process, timeout=timeout, signal=signal)`。
7. `output = output_bytes.decode(errors="replace")`——用替换策略解码(避免非法字节崩)。
8. `truncation = truncate_tail(output)`——**尾部截断**(保留末尾内容)。
9. `full_output_path = None`;`output_text = truncation.content or "(no output)"`。
10. 若 `truncation.truncated`:调用 `_write_temp_output(output)` 把**完整**输出写到临时日志文件,记下路径。计算 `start_line = total_lines - output_lines + 1`、`end_line = total_lines`,按三种情形追加提示:
    - `last_line_partial`:最后一行被字节裁剪,提示 `Showing last {size} of line {end_line}. Full output: {path}`。
    - `truncated_by == "lines"`:`Showing lines {start_line}-{end_line} of {total}. Full output: {path}`。
    - 否则(字节限):附带 `({format_size(DEFAULT_MAX_OUTPUT_BYTES)} limit)`。
11. `exit_code = process.returncode`。
12. 状态文案:超时→`Command timed out after {timeout:g} seconds`(无 timeout 则 `Command timed out`);取消→`Command cancelled`;退出码非 0/非 `None`→`Command exited with code {exit_code}`。若有状态,`output_text = append_status_block(output_text, status)`(在空行后追加)。
13. `ok = exit_code == 0 and not timed_out and not cancelled`。
14. 返回 `AgentToolResult(ok=ok, content=output_text, error=None if ok else status, data={command, exit_code, timed_out, cancelled, duration_seconds(round 3 位), truncation.to_json(), full_output_path, shell_command_prefix_applied})`。

`description` 文案指出:输出被截断到末尾 `DEFAULT_MAX_OUTPUT_LINES` 行或 `DEFAULT_MAX_OUTPUT_BYTES//1024 KB`,截断时全量写临时文件;可选 `timeout`(秒,无默认超时)。

---

## create_bash_tool

### create_bash_tool(*, cwd: str | Path | None = None, shell_command_prefix: str | None = None) -> AgentTool

(行 574-583)薄封装：`create_bash_tool_definition(cwd=cwd, shell_command_prefix=shell_command_prefix).to_agent_tool()`。

---

## _prefixed_shell_command

### _prefixed_shell_command(command: str, prefix: str | None) -> str

(行 586-590)若有 `prefix` 返回 `f"{prefix}\n{command}"`(让 setup 前缀先执行),否则原样返回 `command`。

---

## format_size

### format_size(bytes_count: int) -> str

(行 593-598)把字节数格式化为人类可读串：`<1024`→`{n}B`;`[1024, 1024*1024)`→`{n/1024:.1f}KB`;`>=1024*1024`→`{n/MB:.1f}MB`。被 read/bash 的截断提示复用。

---

## append_status_block

### append_status_block(text: str, status: str) -> str

(行 601-603)若 `text` 非空返回 `f"{text}\n\n{status}"`(空一行后追加状态),否则直接返回 `status`。用于 bash 把超时/取消/非零退出状态接在输出之后。

---

## _communicate_with_cancellation

### _communicate_with_cancellation(process, *, timeout, signal) -> tuple[bytes, bytes | None, bool, bool]

(行 606-646)在带超时与取消监听的情况下收集子进程输出,返回 `(output_bytes, stderr, timed_out, cancelled)`：

1. `communicate = asyncio.create_task(process.communicate())` 启动通信任务。
2. 若 `signal` 非空,`cancel_watch = asyncio.create_task(_wait_for_cancel(signal))`,加入等待集合。
3. `asyncio.wait(wait_for, timeout=timeout, return_when=FIRST_COMPLETED)`:
    - 若 `communicate` 先完成：取 `communicate.result()` 返回 `(output_bytes, stderr, False, False)`(未超时、未取消)。
    - 否则(`communicate` 未先完成)：`cancelled = cancel_watch in done`(超时则 `cancel_watch` 不在 done);调 `_kill_process_tree(process)` 杀进程树;再 `await communicate` 收割输出(捕获 `CancelledError` 时输出置 `b""`、stderr 置 `None`)。返回 `(output_bytes, stderr_result, not cancelled, cancelled)`——注意 `timed_out` 字段为 `not cancelled`(若不是取消,就是超时)。
4. 外层 `except asyncio.CancelledError`:`_kill_process_tree(process)`,若 `communicate` 未完成则 `communicate.cancel()` 并 re-raise。
5. `finally`:若有 `cancel_watch` 则 `cancel()` 清理监听任务。

由于 stderr 被合并到 stdout,实际 `stderr` 返回值基本无意义(始终来自合并流)。

---

## _wait_for_cancel

### _wait_for_cancel(signal: ToolCancellationToken) -> None

(行 649-651)轮询 `signal.is_cancelled()`,每 50ms 睡眠一次,直到被取消。作为 `cancel_watch` 任务让 `_communicate_with_cancellation` 能感知外部取消。

---

## truncate_head

### truncate_head(content, *, max_lines=DEFAULT_MAX_OUTPUT_LINES, max_bytes=DEFAULT_MAX_OUTPUT_BYTES) -> TruncationResult

(行 654-694)从头保留、丢弃尾部,用于 `read`：

1. `lines = _split_lines_for_counting(content)`(按 `\n` 切并按末尾换行修正);`total_lines/ total_bytes` 统计。
2. 若 `total_lines <= max_lines and total_bytes <= max_bytes`:返回未截断结果(content 全量,`truncated=False`,`truncated_by=None`)。
3. 若首行字节 `lines[0]` 超 `max_bytes`:返回 `first_line=True`、`truncated=True`、`truncated_by="bytes"`、空 content——表示首行大到无法安全展示。
4. 否则从头逐行累加(`output_lines`),累加时第二行起额外计入 1 字节换行:`line_bytes = len(line.encode()) + (1 if index > 0 else 0)`。一旦 `output_bytes + line_bytes > max_bytes` 即改 `truncated_by="bytes"` 并停止;否则 `truncated_by` 保持 `"lines"`(行数先到限)。最多取 `max_lines` 行。
5. `output = "\n".join(output_lines)`,调用 `_truncation_result` 构造结果。

---

## truncate_tail

### truncate_tail(content, *, max_lines=DEFAULT_MAX_OUTPUT_LINES, max_bytes=DEFAULT_MAX_OUTPUT_BYTES) -> TruncationResult

(行 697-741)从尾部保留、丢弃头部,用于 `bash`：

1. 同样 `lines = _split_lines_for_counting(content)`、`total_lines/total_bytes`。
2. 未超双限则原样返回未截断结果。
3. 从尾部倒序处理:`output_lines` 从头部插入。`line_bytes = len(line.encode()) + (1 if output_lines else 0)`(已收集行前需补换行)。
4. 若 `len(output_lines) >= max_lines`:置 `truncated_by="lines"` 并 break(行数先满)。
5. 若 `output_bytes + line_bytes > max_bytes`:置 `truncated_by="bytes"`;若此时还没有任何行(`not output_lines`),用 `_truncate_string_to_bytes_from_end(line, max_bytes)` 从该行尾部裁字节,插入并设 `last_line_partial=True`;然后 break。
6. 否则 `output_lines.insert(0, line)` 累加。
7. `output = "\n".join(output_lines)`,调用 `_truncation_result(..., last_line_partial=last_line_partial)`。

---

## detect_line_ending

### detect_line_ending(content: str) -> str

(行 744-749)探测文件主导行尾：`crlf_index = content.find("\r\n")`、`lf_index = content.find("\n")`。若两者之一为 `-1`(即没有 CRLF 或没有 LF)返回 `"\n"`;否则返回两者中先出现者:`"\r\n" if crlf_index < lf_index else "\n"`。供 `edit` 在归一化改完后恢复原始行尾。

---

## normalize_to_lf

### normalize_to_lf(text: str) -> str

(行 752-753)把文本行尾统一成 LF：`text.replace("\r\n", "\n").replace("\r", "\n")`。用于 `edit` 的匹配阶段(内容与 oldText/newText 都先归一)。

---

## restore_line_endings

### restore_line_endings(text: str, ending: str) -> str

(行 756-757)若 `ending == "\r\n"` 则 `text.replace("\n", "\r\n")`,否则原样返回。供 `edit` 在替换完成后恢复原始行尾。

---

## apply_edits_to_normalized_content

### apply_edits_to_normalized_content(normalized_content, edits, path) -> tuple[str, str]

(行 760-790)在已归一化(纯 LF)内容上执行全部 edits,返回 `(base_content, new_content)`：

1. 先把每个 edit 的 `oldText`/`newText` 各自 `normalize_to_lf` 得到 `normalized_edits`。
2. 遍历校验：`if not edit["oldText"]` 抛 `_empty_old_text_error`(oldText 不可为空)。
3. 计算匹配区间 `matches: list[(start, end, newText)]`:对每个 edit,`_count_occurrences(normalized_content, old_text)`——`0` 抛 `_not_found_error`;`>1` 抛 `_duplicate_error`(必须唯一);否则 `start = index(old_text)`,`matches.append((start, start+len, newText))`。
4. `_validate_non_overlapping(matches)`——保证区间不重叠。
5. 从后往前(`sorted(matches, reverse=True)`)逐个切片替换:`new_content = new_content[:start] + new_text + new_content[end:]`(倒序保证前面的区间索引不被前面的替换改变)。
6. `if new_content == normalized_content` 抛 `_no_change_error`(替换后无变化)。
7. 返回 `(normalized_content, new_content)`。

 注意:源码无"模糊匹配",`oldText` 必须是精确子串且唯一——"模糊"在任务描述里是指归一化(行尾/BOM)层面的容差,并非近似匹配。

```python
def apply_edits_to_normalized_content(normalized_content, edits, path) -> tuple[str, str]:
    matches = []
    for edit in edits:
        if not edit["oldText"]:
            raise _empty_old_text_error(path, ...)
        occurrences = _count_occurrences(normalized_content, edit["oldText"])
        if occurrences == 0:
            raise _not_found_error(path, ...)
        if occurrences > 1:
            raise _duplicate_error(path, ...)        # 必须唯一
        start = normalized_content.index(edit["oldText"])
        matches.append((start, start + len(edit["oldText"]), edit["newText"]))
    _validate_non_overlapping(matches)               # 区间互不相交
    new_content = normalized_content
    for start, end, new_text in sorted(matches, reverse=True):  # 倒序替换保索引
        new_content = new_content[:start] + new_text + new_content[end:]
    if new_content == normalized_content:
        raise _no_change_error(path, ...)            # 替换后须有变化
    return (normalized_content, new_content)
```
> 深究：所有校验（非空、唯一、不重叠、确有变化）在写盘前完成，任一失败抛 `ToolInputError`，文件保持未改动；倒序替换保证前面的区间索引不被前面的替换改变。

---

## generate_diff_string

### generate_diff_string(old: str, new: str) -> tuple[str, int | None]

(行 793-808)生成 ndiff 风格 diff 与首个变更行号：

1. `old_lines = old.splitlines()`、`new_lines = new.splitlines()`。
2. `diff = "\n".join(difflib.ndiff(old_lines, new_lines))`——字符串形式的行级差异(`  ` 不变,`+` 新增,`-` 删除)。
3. 二次遍历 `ndiff` 计算 `first_changed_line`:`new_line_number` 初 0;遇 `  `(上下文)与 `+` 都 `+1`;`+` 且 `first_changed_line is None` 时记下行号;遇 `-` 且尚未记录时记 `max(new_line_number + 1, 1)`。
4. 返回 `(diff, first_changed_line)`。

---

## generate_unified_patch

### generate_unified_patch(path: str, old: str, new: str) -> str

(行 811-819)用 `difflib.unified_diff` 生成标准 unified diff 补丁：`old.splitlines(keepends=True)` 与 `new.splitlines(keepends=True)`(保留换行),`fromfile=tofile=path`,把生成器 `"" .join(...)` 成字符串。

---

## _truncation_result

### _truncation_result(content, truncated, truncated_by, total_lines, total_bytes, output_lines, output_bytes, *, last_line_partial=False, first_line=False) -> TruncationResult

(行 822-846)构造 `TruncationResult` 的工厂:`max_lines/max_bytes` 固定填模块常量,`first_line_exceeds_limit` 填 `first_line` 参数,其余字段透传。被 `truncate_head`/`truncate_tail` 复用,避免重复字面量。

---

## _split_lines_for_counting

### _split_lines_for_counting(content: str) -> list[str]

(行 849-855)为"按行计/截断"切分:空串返回 `[]`;否则 `content.split("\n")`,若 `content.endswith("\n")` 则 `pop()` 去掉末尾空串(因为末尾换行不应算作额外一行)。返回不含末尾空串的行列表。

---

## _truncate_string_to_bytes_from_end

### _truncate_string_to_bytes_from_end(text: str, max_bytes: int) -> str

(行 858-863)从字符串尾部裁到 `max_bytes` 字节:`encoded = text.encode()`;若长度不超过直接返回;否则 `clipped = encoded[-max_bytes:]`,`clipped.decode(errors="ignore")`——从末尾截取最多 `max_bytes` 字节并忽略非法截断点。被 `truncate_tail` 在末尾行超字节限制时用来生成"半行"。

---

## _str_arg

### _str_arg(arguments, name) -> str

(行 866-870)从参数字典取 `name`,若值不是 `str` 抛 `ToolInputError(f"{name} must be a string")`;否则返回。是所有字符串参数的统一取用入口(`path`、`content`、`command` 等)。

---

## _path_arg

### _path_arg(arguments, name, *, cwd: Path) -> Path

(行 873-878)先 `_str_arg(arguments, name)`;`path = Path(value).expanduser()`(展开 `~`);若非绝对路径则 `cwd / path` 拼接为相对 `cwd` 的绝对路径;返回 `Path`。

---

## _optional_int_arg

### _optional_int_arg(arguments, name) -> int | None

(行 881-887)取值:为 `None` 返回 `None`;否则若不是 `int` 抛 `ToolInputError(f"{name} must be an integer")`;返回该 int。`offset`/`limit` 使用。

---

## _optional_float_arg

### _optional_float_arg(arguments, name) -> float | None

(行 890-896)取值:为 `None` 返回 `None`;否则若不是 `int | float` 抛 `ToolInputError(f"{name} must be a number")`;返回 `float(value)`。`timeout` 使用(允许整数或浮点秒)。

---

## _prepare_edit_arguments

### _prepare_edit_arguments(arguments) -> Mapping[str, JSONValue]

(行 899-918)把各种历史/兼容形态的参数规整成标准形态(返回新 dict,不修改原参)：

1. `prepared = dict(arguments)`。
2. 若 `edits_value` 是字符串:尝试 `json.loads`;解析成功且为 `list` 则写回 `prepared["edits"]`(支持把 JSON 字符串形式的 edits 当数组用)。
3. 若顶层有 `oldText` 与 `newText`(旧式单 edit 写法):取出;把已有的 `edits`(若是 list)与这一对合并——`prepared["edits"] = [*edit_list, {"oldText": old_text, "newText": new_text}]`,并 `pop` 掉顶层 `oldText`/`newText`(避免与数组混用冲突)。
4. 返回 `prepared`。

---

## _edits_arg

### _edits_arg(arguments) -> list[dict[str, str]]

(行 921-939)从规整后的参数中校验并抽取 edits 列表：

1. `value = arguments.get("edits")`;若不是非空 `list` 抛 `ToolInputError("Edit tool input is invalid. edits must contain at least one replacement.")`。
2. 遍历:每项必须是 `dict`,且 `oldText`/`newText` 均为 `str`(否则按索引抛 `edits[{i}] must be an object` 或 `... must be strings`)。
3. 收集并返回 `[{"oldText", "newText"}, ...]`。

---

## _validate_non_overlapping

### _validate_non_overlapping(spans: list[tuple[int, int, str]]) -> None

(行 942-947)校验匹配区间不重叠:先把 `(start, end, newText)` 按 `start` 排序;`previous_end = -1`,遍历若 `start < previous_end` 抛 `ToolInputError("Edits must not overlap")`;`previous_end = end`。保证多个 edits 作用区域互不相交。

---

## _count_occurrences

### _count_occurrences(content: str, text: str) -> int

(行 950-958)统计 `text` 在 `content` 中的非重叠出现次数:从 `start=0` 起 `content.find(text, start)`,命中则 `count+=1` 且 `start = index + len(text)`,直到 `-1` 返回 `count`。供 `apply_edits_to_normalized_content` 判定 oldText 唯一性。

---

## _strip_bom

### _strip_bom(content: str) -> tuple[str, str]

(行 961-962)若 `content.startswith(UTF8_BOM)` 返回 `(UTF8_BOM, content[1:])`(记下 BOM 以备写回),否则返回 `("", content)`。供 `edit` 在读写时保留 UTF-8 BOM。

---

## _not_found_error

### _not_found_error(path, edit_index, total_edits) -> str

(行 965-974)构造"oldText 未找到"错误信息:单 edit(`total_edits==1`)返回针对文件整体的提示(强调需精确匹配含空白与换行);多 edit 则返回针对 `edits[{edit_index}]` 的提示。

---

## _duplicate_error

### _duplicate_error(path, edit_index, total_edits, occurrences) -> str

(行 977-986)构造"oldText 不唯一"错误信息:单 edit 报 `Found {occurrences} occurrences ... must be unique`;多 edit 报针对 `edits[{edit_index}]` 的同样内容。

---

## _empty_old_text_error

### _empty_old_text_error(path, edit_index, total_edits) -> str

(行 989-992)构造"oldText 为空"错误信息:单 edit→`oldText must not be empty in {path}.`;多 edit→`edits[{edit_index}].oldText must not be empty in {path}.`。

---

## _no_change_error

### _no_change_error(path, total_edits) -> str

(行 995-1002)构造"替换后无变化"错误信息:单 edit 附带一段说明(可能因特殊字符或文本不存在所致);多 edit 简版 `No changes made to {path}. The replacements produced identical content.`。

---

## _detect_supported_image_mime_type

### _detect_supported_image_mime_type(path: Path) -> str | None

(行 1005-1007)`mimetypes.guess_type(path)` 猜 MIME;若落在 `SUPPORTED_IMAGE_MIME_TYPES`(`image/jpeg|png|gif|webp`)返回该类型,否则 `None`。供 `read` 判断图像路径(注意它只靠扩展名猜 MIME,不读文件头)。

---

## _base64_text

### _base64_text(data: bytes) -> str

(行 1010-1013)函数内 `import base64`(延迟导入),`base64.b64encode(data).decode("ascii")` 返回 ASCII base64 串。供 `read` 把图像字节编码进结果。

---

## _kill_process_tree

### _kill_process_tree(process: asyncio.subprocess.Process) -> None

(行 1016-1026)杀掉子进程及其子树:POSIX 下 `os.killpg(process.pid, signal.SIGKILL)`(因 `start_new_session=True`,pid 即进程组 id,整组强杀,覆盖管道/复合命令的子进程);捕获 `ProcessLookupError` 直接返回。非 POSIX 下 `process.kill()`(仅直接子进程),同样容错 `ProcessLookupError`。被 `_communicate_with_cancellation` 在超时/取消时调用。

```python
def _kill_process_tree(process):
    if os.name == "posix":
        try:
            os.killpg(process.pid, signal.SIGKILL)   # start_new_session=True 使 pid 即进程组 id
        except ProcessLookupError:
            return
    else:
        try:
            process.kill()                           # 非 POSIX 仅杀直接子进程
        except ProcessLookupError:
            return
```
> 深究：POSIX 上用 `start_new_session=True` 创建新会话，于是 `process.pid` 就是进程组 leader 的 id，`os.killpg` 对整个进程组发 SIGKILL，管道/复合命令（`a | b`、`x && y`）的子进程一并被杀，不留孤儿。

---

## _write_temp_output

### _write_temp_output(output: str) -> str

(行 1029-1038)把完整输出写到临时日志文件:`tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", prefix="tau-bash-", suffix=".log", delete=False)`,写入 `output`,返回 `handle.name`(文件路径)。`delete=False` 保证文件不被自动删除,供前端/用户后续读取完整输出。被 `bash` 在截断发生时调用。

---

## _FileLockContext

### class _FileLockContext

(行 1041-1053)进程内按文件串行化写入的异步上下文管理器。

### __init__(self, path: Path) -> None

(行 1042-1044)`self._path = path.resolve()`(解析为绝对真实路径,作为锁字典的键);`self._lock: asyncio.Lock | None = None`(延迟到进入时取/建)。

### __aenter__(self) -> None

(行 1046-1049)`lock = _file_locks.setdefault(self._path, asyncio.Lock())`——以解析后的路径为键,从进程级字典取已有锁或新建;`self._lock = lock`;`await lock.acquire()` 获取锁。

### __aexit__(self, _exc_type, _exc, _tb) -> None

(行 1051-1053)若 `self._lock is not None` 则 `self._lock.release()` 释放锁。异常信息参数被忽略(不吞异常,正常传播)。

---

## _file_lock

### _file_lock(path: Path) -> _FileLockContext

(行 1056-1057)工厂函数,返回 `_FileLockContext(path)`。被 `write`/`edit` 的 `async with _file_lock(path):` 使用,实现同文件写入互斥。

---

## read 工具

`read` 由 `create_read_tool_definition` 定义、`create_read_tool` 暴露为 `AgentTool`。核心行为见上文 `execute(arguments, signal)` 展开。补充要点：

- **特殊路径**：源码中没有对 `/` 或目录做"列出目录"的特殊渲染——`/` 经 `_path_arg` 解析成根目录后,在 `path.is_dir()` 分支被当作目录直接抛 `ToolInputError("Path is a directory: /")`。目录与不存在文件都报错,而非列出内容。
- **图片**：仅当扩展名对应支持的 MIME(`jpg/png/gif/webp`)时走图像分支,返回 base64 而非文本。
- **行范围与截断**：`offset`(1 索引)与 `limit`(正整)先切片,再经 `truncate_head` 受行/字节双限约束;续读提示统一用 `offset=<下一行>`。首行过长有专门的 sed 引导提示。

## write 工具

由 `create_write_tool_definition` 定义。核心行为见其 `execute` 展开。`write` 是**整体覆盖/创建**,直接 `write_text`,无 diff、无 BOM 特殊处理、无大小阈值状态块(任务描述中的"超大文件状态块"在本源码的 `write` 中并未实现——它始终直接写盘)。父目录自动创建,文件锁保证同文件并发写串行。

## edit 工具

由 `create_edit_tool_definition` 定义。多 edits 的精确匹配、唯一性、不重叠校验、归一化编辑算法、diff 生成均见 `execute` 与 `apply_edits_to_normalized_content`/`generate_diff_string`/`generate_unified_patch` 的展开。关键:BOM 剥离后保留、原行尾探测后恢复;所有校验在写盘前完成,任一失败文件不动。

## bash 工具

由 `create_bash_tool_definition` 定义。shell 执行、超时、流式(`_communicate_with_cancellation` + `_wait_for_cancel`)、尾部截断(`truncate_tail`)、退出码/超时/取消状态、图片无关(注意:`bash` 不处理图像输出,只有 `read` 处理图像)、截断时全量输出落临时文件(由 `_write_temp_output` 生成路径并回报)。详见其 `execute` 与各私有辅助。

<!-- NAV -->
[← tau_agent · 公共导出与边界]({{< relref "./agent-init-boundary.md" >}})
[↑ 总览]({{< relref "./source-walkthrough.md" >}})
[→ tau_coding · CodingSession]({{< relref "./coding-session.md" >}})
