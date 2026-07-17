---
title: tau_coding · Slash 命令
description: commands.py
code_files:
  - tau_coding/commands.py
---

## `tau_coding/commands.py` — slash commands

**斜杠命令**（slash command）是用户在提示符处输入以 `/` 开头的快捷指令（如 `/help`、`/model`、`/new`），用来执行常见的会话操作而不必每次都让模型"理解意图再行动"。这个模块定义了所有内置命令的注册表和分发逻辑——当用户输入 `/model gpt-4o` 时，系统如何把它解析成"切换模型"这个动作。

### `LOGIN_PROVIDER_ALIASES`

模块级 `dict[str, tuple[str, str]]`，把友好的别名映射到一对
`(provider_name, login_method)`（provider 名、登录方式）。它实际有两项：

```python
LOGIN_PROVIDER_ALIASES = {
    "anthropic-api": ("anthropic", "api-key"),
    "anthropic-subscription": ("anthropic", "subscription"),
}
```

因此输入 `/login anthropic-api` 会解析为使用 API key 方式的 `anthropic` provider，
而 `/login anthropic-subscription` 则对应订阅（OAuth）方式。这里**没有**
`huggingface`/`hf` 别名。该常量存在的意义是让命令层与 provider 目录保持同步，
而无需在命令层里硬编码 provider 名称；login 命令中会解包出 `(provider, method)` 这一对值。

```python
def _login_command(context: CommandContext) -> CommandResult:
    provider_name = context.args.strip()
    if provider_name in {"custom", "new", "add"}:
        return CommandResult(handled=True, custom_provider_login_requested=True)
    if provider_name:
        aliased_provider = LOGIN_PROVIDER_ALIASES.get(provider_name)
        if aliased_provider is not None:
            provider_name, login_method = aliased_provider
        else:
            login_method = None
        entry = builtin_provider_entry(provider_name)
        ...
        return CommandResult(handled=True, login_provider=entry.name, login_method=login_method)
    return CommandResult(handled=True, login_picker_requested=True)
```

上面这段 `_login_command` 的真实实现展示了别名解包：命中 `LOGIN_PROVIDER_ALIASES` 时把 `(provider_name, login_method)` 一并解出，否则 `login_method` 置 `None` 走通用校验。

### `CommandRegistry`

CommandRegistry（命令注册表）是所有斜杠命令的"索引簿"——它把命令名映射到对应的处理函数，但自己不执行任何业务逻辑。这遵循 Tau 的分层规则：注册表只负责"知道有哪些命令"，而"执行命令改变状态"是 CodingSession 的职责。这样不同的前端（命令行、GUI）都能复用完全相同的 CodingSession，而不会继承任何命令解析假设。

- **构造函数** — 构建命令名 → `SlashCommand` 的映射。一个 `SlashCommand` 封装了
  名称、描述、用法、处理函数（`(CommandContext) -> CommandResult`）、别名与搜索关键字。
- **`register(command: SlashCommand)`** — 添加或覆盖一条命令（重名时抛
  `ValueError`）。
- **`get(name)`** — 按名称（或别名）返回对应的 `SlashCommand`，找不到则返回 `None`。
- **`list_commands()`** — 返回按名称排序的 `tuple[SlashCommand, ...]`，供 TUI
  自动补全与 `/help` 列表使用。

注册表不持有任何逐命令的行为：它并不知道每条命令具体做什么。这样就把应用装配
（存在哪些命令）与 `CodingSession` 的逻辑（每条命令在会话中改变什么）分离开来。
新增一条斜杠命令只需在此注册；它所调用的 `CodingSession` 方法已在第 3b 部分实现。

```python
class CommandRegistry:
    def __init__(self) -> None:
        self._commands: dict[str, SlashCommand] = {}
        self._aliases: dict[str, str] = {}

    def register(self, command: SlashCommand) -> None:
        name = _normalize_name(command.name)
        if name in self._commands:
            raise ValueError(f"Duplicate slash command: /{name}")
        self._commands[name] = command
        for alias in command.aliases:
            normalized_alias = _normalize_name(alias)
            if normalized_alias in self._commands or normalized_alias in self._aliases:
                raise ValueError(f"Duplicate slash command alias: /{normalized_alias}")
            self._aliases[normalized_alias] = name

    def get(self, name: str) -> SlashCommand | None:
        normalized = _normalize_name(name)
        command_name = self._aliases.get(normalized, normalized)
        return self._commands.get(command_name)

    def list_commands(self) -> tuple[SlashCommand, ...]:
        return tuple(self._commands[name] for name in sorted(self._commands))
```

以上为 `register`/`get`/`list_commands` 的精简实现：`register` 把命令写进 `_commands`、把别名写进 `_aliases`（重名即报错）；`get` 先经 `_aliases` 解析别名再查主表；`list_commands` 仅遍历主命令并按名排序。

> **为什么注册表是无行为的。** 这遵循 Tau 的分层规则 ——
> `AgentHarness = 可复用的 agent 大脑`、`CodingSession = 编码 agent 环境`、
> `TUI = 可选的前端之一`。命令集合属于*前端*：它决定存在哪些 `/` 动词并解析它们，
> 但从不修改持久状态。`CodingSession` 才是真正改变状态的环境，也是唯一写入
> append-only 会话日志的层。注册表是连接二者的薄适配器，因此不同的前端
> （print 模式 CLI、未来的 GUI）都能复用完全相同的 `CodingSession`，
> 而不会继承任何命令解析假设。这正是官方原则 “Small layers beat magic”
> （小分层胜过魔法）在命令分发上的应用。

### 命令分发流程

1. TUI（或 print 模式 CLI）读取一行以 `/` 开头的输入。
2. 从中切分出命令名与剩余的参数部分。
3. 它询问 `CommandRegistry.get(name)`；若找到则调用该命令的处理函数。
4. 处理函数转而调用 `CodingSession`（例如 `set_model`、`branch_to_entry`、
   `compact`、`new_session`）—— 这些都在第 3b 部分讲过 —— 并返回描述要回显内容的
   `CommandResult`。
5. 若名称未注册，则该行被视为未知命令，并给出帮助提示。

最终效果：命令是薄包装。所有持久状态变更都发生在 `CodingSession` 中；
所有命令的*发现*都发生在 `CommandRegistry` 中。绝大多数处理函数甚至不直接调用
`CodingSession` —— 它们返回一个 `CommandResult`，用其中的 `*_requested` 标志
告知前端应驱动哪个动作 —— 从而让解析/分发层完全不沾染任何会话语义。

```python
def execute(self, session: CommandSession, text: str) -> CommandResult:
    stripped = text.strip()
    if not stripped.startswith("/"):
        return CommandResult(handled=False)
    if stripped.startswith("/skill:"):
        return CommandResult(handled=False)
    name, args = _parse_command(stripped)
    if not name:
        return CommandResult(handled=False)
    command = self.get(name)
    if command is None and name == "scoped" and args.lower() == "models":
        command = self.get("scoped-models")
        name = "scoped-models"
        args = ""
    if command is None:
        return CommandResult(handled=False)
    return command.handler(
        CommandContext(session=session, registry=self, text=stripped, name=name, args=args)
    )
```

`execute` 先判断 `/` 前缀与 `/skill:` 内联语法（`handled=False` 退回普通 prompt），再用 `_parse_command` 拆出 `(name, args)`，经 `get` 解析别名（含 `/scoped models` → `scoped-models` 兼容），命中则构造 `CommandContext` 调用 handler。

---

## 逐方法深度剖析（commands.py / session_manager.py）

> 以下为 `commands.py` 与 `session_manager.py` 各顶层定义与命令 handler 的逐方法展开。

## 文件:commands.py

`commands.py` 是 Tau coding 会话的斜杠命令注册与分发核心。它定义了一套 `Protocol`（会话能力契约）、若干结果/上下文 dataclass、`CommandRegistry` 注册表，以及一批以 `_xxx_command` 命名的 handler 函数，并在 `create_default_command_registry()` 中把内置命令全部注册。文件顶部还提供解析与格式化辅助函数。

### LOGIN_PROVIDER_ALIASES

```python
LOGIN_PROVIDER_ALIASES: dict[str, tuple[str, str]]
```

- **作用**:为 `/login` 命令维护“别名 → (provider 名, 登录方式)”的映射,让用户可以用简短别名登录特定厂商的特定方式。
- **实际内容**:
  - `"anthropic-api"` → `("anthropic", "api-key")`:用 API key 方式登录 Anthropic。
  - `"anthropic-subscription"` → `("anthropic", "subscription")`:用订阅(OAuth/订阅凭证)方式登录 Anthropic。
- **数据流**:`_login_command` 在解析到带参数的 provider 名时,先用 `LOGIN_PROVIDER_ALIASES.get(provider_name)` 查表;命中则解出 `provider_name` 与 `login_method`,否则 `login_method` 置 `None`,继续走 `builtin_provider_entry` 通用校验。

### BUILTIN_TUI_THEME_NAMES

```python
BUILTIN_TUI_THEME_NAMES: tuple[str, ...] = ("tau-dark", "tau-light", "high-contrast")
```

- **作用**:内建 TUI 主题名常量元组,供 `_theme_command` 校验与提示使用。`_theme_command` 会把用户输入与之一一比对,不在其中则报错并列出可用主题。

### CommandSession (Protocol)

```python
class CommandSession(Protocol):
```

- **作用**:声明斜杠命令 handler 在运行时可访问的会话属性与方法,是 `CodingSession` 的能力契约。`CommandRegistry.execute` 接收的 `session` 实参需满足此 Protocol。
- **属性(均为只读 property)**:
  - `cwd: Path` — 会话当前工作目录。
  - `model: str` — 当前激活模型标识。
  - `provider_name: str` — 当前 provider 名。
  - `available_models: Sequence[str]` — 当前 provider 下可用模型列表。
  - `available_providers: Sequence[str]` — 可用 provider 列表。
  - `tools: Sequence[AgentTool]` — 已加载工具。
  - `skills: Sequence[Skill]` — 已加载技能。
  - `prompt_templates: Sequence[PromptTemplate]` — 已加载提示模板。
  - `context_files: Sequence[ProjectContextFile]` — 项目上下文文件。
  - `context_token_estimate: int` — 上下文 token 估算值。
  - `auto_compact_token_threshold: int | None` — 自动压缩阈值(可选)。
  - `context_window_tokens: int` — 上下文窗口总 token 数。
  - `thinking_level: str` — 当前思考级别。
  - `available_thinking_levels: Sequence[str]` — 可用思考级别。
  - `resource_diagnostics: Sequence[ResourceDiagnostic]` — 资源诊断信息。
  - `system_prompt: str` — 当前生效的系统提示词。
  - `session_id: str | None` — 会话 id。
  - `session_title: str | None` — 会话标题。
  - `session_manager: SessionManager | None` — 会话管理器(用于 resume/rename 等)。
- **方法**:
  - `ensure_session_indexed() -> None` — 确保当前会话已被写入索引(供 `_name_command` 在重命名前补足索引)。
  - `set_model(model: str) -> None` — 切换当前模型(供 `_model_command` 直接指定模型时调用)。
  - `reload_provider_settings() -> None` — 重新加载 provider 设置,可能抛 `ValueError`(`_refresh_provider_settings` 捕获)。

### CommandResult (dataclass, frozen, slots)

```python
@dataclass(frozen=True, slots=True)
class CommandResult:
```

- **作用**:命令 handler 的返回值,统一描述“命令是否被处理”以及需要前端(如 TUI)执行的各种副作用请求。所有字段均有默认值,handler 只填关心的字段。
- **字段逐条**:
  - `handled: bool` — 是否已被命令系统处理(普通提示文本返回 `False`)。
  - `exit_requested: bool = False` — 前端应退出会话。
  - `clear_requested: bool = False` — 前端应清屏/清空输入。
  - `reload_requested: bool = False` — 前端应从其异步路径重新加载资源(见 `_reload_command` 注释)。
  - `new_session_requested: bool = False` — 前端应开新会话。
  - `compact_summary: str | None = None` — 传给压缩逻辑的指令文本。
  - `export_requested: bool = False` — 请求导出会话。
  - `export_destination: Path | None = None` — 导出目标路径。
  - `export_format: str | None = None` — 导出格式(`html`/`jsonl`)。
  - `resume_session_id: str | None = None` — 要恢复的会话 id。
  - `resume_picker_requested: bool = False` — 打开恢复选择器。
  - `tree_picker_requested: bool = False` — 打开分支(树)选择器。
  - `login_picker_requested: bool = False` — 打开登录选择器。
  - `custom_provider_login_requested: bool = False` — 走自定义/新增 provider 登录流程。
  - `login_provider: str | None = None` — 具体要登录的 provider。
  - `login_method: str | None = None` — 登录方式(api-key/subscription)。
  - `logout_picker_requested: bool = False` — 打开登出选择器。
  - `logout_provider: str | None = None` — 要登出的 provider。
  - `model_picker_requested: bool = False` — 打开模型选择器。
  - `scoped_models_picker_requested: bool = False` — 打开“限定模型(Ctrl+P 快切)”选择器。
  - `theme_picker_requested: bool = False` — 打开主题选择器。
  - `thinking_level: str | None = None` — 设定的思考级别。
  - `theme: str | None = None` — 设定的主题名。
  - `message: str | None = None` — 要展示给用户的消息文本。

### CommandContext (dataclass, frozen, slots)

```python
@dataclass(frozen=True, slots=True)
class CommandContext:
```

- **作用**:每次命令执行时构造并传给 handler 的运行时上下文。
- **字段逐条**:
  - `session: CommandSession` — 满足 Protocol 的会话实例。
  - `registry: CommandRegistry` — 当前注册表(供 `/help` 等遍历命令)。
  - `text: str` — 用户原始(已 strip)输入,如 `/model foo`。
  - `name: str` — 解析后的命令名(已规范化、小写、无前导 `/`)。
  - `args: str` — 命令参数部分(已 strip)。

### SlashCommand (dataclass, frozen, slots)

```python
@dataclass(frozen=True, slots=True)
class SlashCommand:
```

- **作用**:一个已注册的斜杠命令及其面向用户的元数据。
- **字段逐条**:
  - `name: str` — 命令名(注册时会被 `_normalize_name` 规范化为小写、去前导 `/`)。
  - `description: str` — 描述(供 `/help` 与补全展示)。
  - `usage: str` — 用法串,如 `/export [--format html|jsonl] [destination]`。
  - `handler: CommandHandler` — 处理该命令的可调用对象,签名为 `(CommandContext) -> CommandResult`。
  - `aliases: tuple[str, ...] = ()` — 别名元组(注册时一并写入 `_aliases`)。
  - `search_terms: tuple[str, ...] = ()` — 搜索关键字(供命令补全/搜索用,如 `("clear", "reset")`)。

### CommandHandler (类型别名)

```python
CommandHandler = Callable[[CommandContext], CommandResult]
```

- **作用**:命令 handler 的类型别名,统一 handler 签名。

### CommandRegistry

```python
class CommandRegistry:
```

- **作用**:解析、注册、列举、执行斜杠命令。持有两个 dict:`_commands`(规范化名→`SlashCommand`)与 `_aliases`(规范化别名→规范名)。

#### `__init__(self) -> None`

- 初始化 `self._commands: dict[str, SlashCommand] = {}` 与 `self._aliases: dict[str, str] = {}`。

#### `register(self, command: SlashCommand) -> None`

- **作用**:注册一条命令及其所有别名,重复即报错。
- **步骤**:
  1. 用 `_normalize_name(command.name)` 得到规范名。
  2. 若规范名已在 `_commands` 中 → 抛 `ValueError(f"Duplicate slash command: /{name}")`。
  3. 否则写入 `self._commands[name] = command`。
  4. 遍历 `command.aliases`,对每个别名做 `_normalize_name`;若已在 `_commands` 或 `_aliases` 中 → 抛 `ValueError(f"Duplicate slash command alias: /{normalized_alias}")`;否则 `self._aliases[normalized_alias] = name`。

#### `get(self, name: str) -> SlashCommand | None`

- **作用**:按名字或别名取命令。
- **步骤**:先 `_normalize_name(name)`,再用 `self._aliases.get(normalized, normalized)` 解析出真正命令名,最后 `self._commands.get(command_name)` 返回(可能 `None`)。

#### `list_commands(self) -> tuple[SlashCommand, ...]`

- **作用**:返回按名字排序的命令元组。
- **实现**:`tuple(self._commands[name] for name in sorted(self._commands))`,仅遍历主命令,不含别名。

#### `execute(self, session: CommandSession, text: str) -> CommandResult`

- **作用**:命令分派主入口。普通提示文本返回 `handled=False`,让上层(TUI 的 `_submit_prompt`)当作普通 prompt 走 `session` 的对话逻辑;命中命令则返回 handler 产出的 `CommandResult`。
- **步骤**:
  1. `stripped = text.strip()`;若不以 `/` 开头 → 立即 `CommandResult(handled=False)`。
  2. 若以 `/skill:` 开头(内联技能语法)→ 返回 `handled=False`(`_parse_command` 会误把它当命令名,这里提前放行给上层展开技能)。
  3. `name, args = _parse_command(stripped)`;若 `name` 为空 → `handled=False`。
  4. `command = self.get(name)`;特殊情况:`name == "scoped"` 且 `args.lower() == "models"` 时,回退取 `"scoped-models"` 命令并把 `name`/`args` 改写(`/scoped models` 兼容 `/scoped-models`)。
  5. 仍 `None` → `handled=False`(未知命令,当普通文本)。
  6. 否则调用 `command.handler(CommandContext(session=session, registry=self, text=stripped, name=name, args=args))`,返回结果。

### create_default_command_registry()

```python
def create_default_command_registry() -> CommandRegistry:
```

- **作用**:构造并返回 Tau 内置命令注册表,把所有内置命令逐一 `register`。
- **注册清单**(handler 函数名对应下方逐方法剖析):
  - `quit`(别名 `exit`)→ `_exit_command`
  - `new`(search_terms `clear`,`reset`)→ `_new_command`
  - `compact`(usage 带 `[instructions]`)→ `_compact_command`
  - `export`(usage 带 `[--format html|jsonl] [destination]`)→ `_export_command`
  - `session`(search_terms `info`)→ `_status_command`
  - `system`(search_terms `prompt`,`instructions`)→ `_system_command`
  - `skill`(search_terms `skills`)→ `_skill_command`
  - `hotkeys`(search_terms `keys`,`shortcuts`,`bindings`)→ `_hotkeys_command`
  - `reload` → `_reload_command`
  - `resume`(search_terms `history`,`previous`)→ `_resume_command`
  - `tree`(search_terms `branch`,`history`,`fork`)→ `_tree_command`
  - `name`(search_terms `rename`,`title`)→ `_name_command`
  - `model` → `_model_command`
  - `scoped-models`(search_terms `scope`,`quick`,`cycle`,`ctrl+p`)→ `_scoped_models_command`
  - `theme`(search_terms `light`,`dark`,`contrast`)→ `_theme_command`
  - `login` → `_login_command`
  - `logout` → `_logout_command`
- 注意:源码中并未把 `_help_command`、`_skills_command`、`_resources_command`、`_context_command`、`_format_sessions` 等通过此函数注册——它们属于辅助/备用 handler,真正分发由上面列出的命令承担(例如 `/skill` 实际 handler 是 `_skill_command` 的薄封装提示,而 `/help` 在注册表中没有登记,留给上层处理)。

### 命令 handler 函数逐方法

下面每个 `_xxx_command` 都是 `CommandHandler`,输入 `CommandContext`,返回 `CommandResult`。它们多半不直接调用 `CodingSession` 的业务方法,而是通过 `CommandResult` 中的各类 `*_requested`/`*_picker_requested` 标志,把“打开选择器/切换状态/恢复会话”等动作委托给前端(TUI),由前端再去驱动 `CodingSession` 的相应能力(如 `set_model`、`session_manager`、`ensure_session_indexed`)。

#### `_help_command(context: CommandContext) -> CommandResult`

- **作用**:列出所有已注册命令的用法与描述。
- **步骤**:`lines = ["Available commands:"]`,遍历 `context.registry.list_commands()`,每条追加 `f"{command.usage}\t{command.description}"`,最后 `CommandResult(handled=True, message="\n".join(lines))`。

#### `_exit_command(context: CommandContext) -> CommandResult`

- **作用**:请求退出会话。
- **返回**:`CommandResult(handled=True, exit_requested=True, message="Exiting session.")`。

#### `_new_command(context: CommandContext) -> CommandResult`

- **作用**:请求开新会话。
- **返回**:`CommandResult(handled=True, new_session_requested=True)`。

#### `_compact_command(context: CommandContext) -> CommandResult`

- **作用**:请求压缩当前上下文,附带用户在 `/compact` 后写的指令。
- **返回**:`CommandResult(handled=True, compact_summary=context.args.strip())`。前端拿到后调用 `CodingSession` 的压缩能力并把 `compact_summary` 作为额外指令传入。

#### `_export_command(context: CommandContext) -> CommandResult`

- **作用**:解析导出参数并请求导出会话。
- **步骤**:
  1. 调用 `_parse_export_args(context.args)`;若抛 `ValueError` → 返回 `CommandResult(handled=True, message=str(exc))`(usage 错误提示)。
  2. 否则返回 `CommandResult(handled=True, export_requested=True, export_destination=destination, export_format=export_format)`。前端据此调用 `CodingSession` 的导出流程。

#### `_status_command(context: CommandContext) -> CommandResult`

- **作用**:展示会话信息与会话统计(`/session`)。
- **步骤**:读取 `context.session` 的 `model`/`cwd`/`tools`/`skills`/`prompt_templates`/`context_files`/`context_token_estimate`/`context_window_tokens` 等逐项拼行;通过 `getattr(session, "context_usage", None)` 安全取上下量细分(系统/消息/工具 token),有则追加;追加 `_thinking_status_lines(session)`;追加资源诊断数、自动压缩阈值、`session_id`、`session_title`。最终 `CommandResult(handled=True, message="\n".join(lines))`。

#### `_system_command(context: CommandContext) -> CommandResult`

- **作用**:展示当前生效的系统提示词,不保存(`/system`)。
- **分支**:若 `context.args` 非空 → 返回 usage 提示 `CommandResult(handled=True, message="Usage: /system")`;否则返回 `CommandResult(handled=True, message=context.session.system_prompt)`。

#### `_hotkeys_command(context: CommandContext) -> CommandResult`

- **作用**:列出常用快捷键。返回固定的快捷键清单文本(`CommandResult(handled=True, message=...)`),内容涵盖 Enter/Shift+Enter/Alt+Enter/Esc/Ctrl+K/Ctrl+R/Shift+Tab/Ctrl+T/Ctrl+O/Ctrl+C/Ctrl+D 等。

#### `_skills_command(context: CommandContext) -> CommandResult`

- **作用**:列出已加载技能(`/skills`)。
- **分支**:
  - 若无技能:`lines = ["No skills loaded."]`,若 `session.resource_diagnostics` 非空则附加 `_format_diagnostics(..., kind="skill")`。
  - 否则逐技能按 `name` 排序,追加 `- {skill.name}: {description or "No description"}`,并提示用 `/skill:<name> [request]`。
  - 末尾若有诊断则附加 `kind="skill"` 的诊断。返回 `message` 文本。

#### `_resources_command(context: CommandContext) -> CommandResult`

- **作用**:汇总资源(skills/templates/context files)与诊断(`/resources` 备用 handler)。逐项数出 skills/prompt templates/context files;若有诊断 append `_format_diagnostics(默认全部)`,否则 `Resource diagnostics: none`。

#### `_reload_command(context: CommandContext) -> CommandResult`

- **作用**:请求重新加载本地资源与项目上下文(`/reload`)。
- **注意**:源码注释说明 reload 拥有异步扩展生命周期钩子,因此前端在自己的异步命令路径里执行,而非此同步注册表内。`CommandResult(handled=True, reload_requested=True)`。

#### `_context_command(context: CommandContext) -> CommandResult`

- **作用**:列出当前项目上下文文件(`/context` 备用 handler)。若无 `context_files` → 提示无文件并附 `kind="context"` 诊断;否则逐文件列 `- {context_file.path}` 并附 `kind="context"` 诊断。

#### `_skill_command(context: CommandContext) -> CommandResult`

- **作用**:`/skill`(不带 `:` 内联)的 handler。由于真正的技能展开由上层对 `/skill:<name>` 语法处理,这里仅返回提示文本告知用法 `CommandResult(handled=True, message="Use /skill:<name> [request] ...")`。

#### `_resume_command(context: CommandContext) -> CommandResult`

- **作用**:恢复历史会话(`/resume [session-id]`)。
- **步骤**:
  1. 若无 `args` → `CommandResult(handled=True, resume_picker_requested=True)`(打开恢复选择器)。
  2. 取 `manager = context.session.session_manager`;为 `None` → 提示 “Session manager is not available.”。
  3. `session_id = context.args.strip()`;若 `manager.get_session(session_id) is None` → 提示 “Unknown session: {session_id}”。
  4. 否则 `CommandResult(handled=True, resume_session_id=session_id)`,前端据此调用 `CodingSession` 的恢复流程加载该会话记录。

#### `_tree_command(context: CommandContext) -> CommandResult`

- **作用**:从历史会话条目分支(树)(`/tree`)。
- **分支**:若有 `args` → 返回 usage 提示;否则 `CommandResult(handled=True, tree_picker_requested=True)`,前端打开分支选择器。

#### `_name_command(context: CommandContext) -> CommandResult`

- **作用**:重命名当前会话(`/name <new name>`),直接驱动 `SessionManager`。
- **步骤**:
  1. `manager = context.session.session_manager`、`session_id = context.session.session_id`;`None` 则提示不可用。
  2. 若 `not context.args`:取当前记录标题(优先 `manager.get_session(session_id).title`,回退 `session.session_title`,再回退 “Untitled session”),返回 `Current session name: ...` 与用法。
  3. 否则 `_validated_session_name(context.args)` 校验;失败返回错误。
  4. 若 `manager.get_session(session_id)` 为 `None`(当前会话尚未索引)→ 先 `context.session.ensure_session_indexed()`。
  5. 调用 `manager.touch_session(session_id, model=..., provider_name=..., title=name)` 更新标题;返回 `None` 则提示 “Unknown current session”;成功返回 `Session renamed: {updated.title}`。

#### `_format_sessions(context: CommandContext) -> str`

- **作用**:辅助函数,列出当前 cwd 下的索引会话(供上层 `/sessions` 之类展示)。
- **步骤**:`manager = context.session.session_manager` 为 `None` → 返回 “Session manager is not available.”;`manager.list_sessions(context.session.cwd)` 得记录;空则 “No sessions found.”;否则逐条 `_format_session_record(record)` 拼为 “Indexed sessions:” 列表返回字符串。

#### `_model_command(context: CommandContext) -> CommandResult`

- **作用**:选择/切换当前模型(`/model`)。
- **步骤**:
  1. `refresh_error = _refresh_provider_settings(context.session)`;非 `None` 直接返回该错误结果。
  2. 若有 `args`:`model = context.args.strip()`;把 `available_models` 转 `set`,若非空且 `model` 不在其中 → 报错列出可用模型;否则 `context.session.set_model(model)` 并 `CommandResult(handled=True, message="Current model: {model}")`。
   3. 若无 `args` → `CommandResult(handled=True, model_picker_requested=True)`,前端打开模型选择器。

```python
def _model_command(context: CommandContext) -> CommandResult:
    refresh_error = _refresh_provider_settings(context.session)
    if refresh_error is not None:
        return refresh_error
    if context.args:
        model = context.args.strip()
        available_models = set(context.session.available_models)
        if available_models and model not in available_models:
            models = ", ".join(sorted(available_models))
            return CommandResult(
                handled=True,
                message=f"Unknown model for provider {context.session.provider_name}: {model}\n"
                f"Available models: {models}",
            )
        context.session.set_model(model)
        return CommandResult(handled=True, message=f"Current model: {model}")
    return CommandResult(handled=True, model_picker_requested=True)
```

`_model_command` 先刷新 provider 设置，再决定是校验并直接 `set_model` 还是打开模型选择器——这是“handler 只产出 `*_requested` 标志、真实状态变更交给 `CodingSession`”的典型例子。

#### `_scoped_models_command(context: CommandContext) -> CommandResult`

- **作用**:选择 Ctrl+P 快速切换时可用(限定)的模型集(`/scoped-models`)。
- **步骤**:先 `_refresh_provider_settings`;若有 `args` → 返回 usage 提示;否则 `CommandResult(handled=True, scoped_models_picker_requested=True)`。

#### `_thinking_command(context: CommandContext) -> CommandResult`

- **作用**:查看或设置思考级别(`/thinking [level]`)。
- **步骤**:
  1. `available = tuple(session.available_thinking_levels)`。
  2. 无 `args`:用 `_thinking_status_lines(session)` 拼状态;有可用级别则追加 “Available modes: ...”,否则插入 “Current model: ...”;返回文本。
  3. 无可用级别:返回 “Thinking controls are unavailable for ...”,若有 `_thinking_unavailable_reason` 则补原因。
  4. 有 `args`:`normalize_thinking_level(context.args)` 解析(失败返回错误);若解析出的 `level` 不在 `available` → 报错可用模式;否则 `CommandResult(handled=True, thinking_level=level)`,前端据此设置会话思考级别。

#### `_thinking_status_lines(session: CommandSession) -> list[str]`

- **作用**:生成思考级别状态行。
- **分支**:有可用级别 → `["Thinking mode: {session.thinking_level}"]`;否则 `["Thinking mode: unavailable"]` 并附 `_thinking_unavailable_reason`(若有)。

#### `_thinking_unavailable_reason(session: CommandSession) -> str | None`

- **作用**:从会话取 `thinking_unavailable_reason` 属性,仅当为“非空字符串”时返回,否则 `None`。

#### `_theme_command(context: CommandContext) -> CommandResult`

- **作用**:查看或设置 TUI 主题(`/theme [name]`)。
- **分支**:无 `args` → `CommandResult(handled=True, theme_picker_requested=True)`;有 `args` 且 `theme_name` 不在 `BUILTIN_TUI_THEME_NAMES` → 报错列出可用主题;否则 `CommandResult(handled=True, theme=theme_name)`。

#### `_login_command(context: CommandContext) -> CommandResult`

- **作用**:连接 provider(OAuth 或 API key)(`/login [provider]`)。
- **步骤**:
  1. `provider_name = context.args.strip()`。
  2. 若 `provider_name in {"custom","new","add"}` → `CommandResult(handled=True, custom_provider_login_requested=True)`。
  3. 若 `provider_name` 非空:`LOGIN_PROVIDER_ALIASES.get(provider_name)` 查别名,命中则解出 `(provider_name, login_method)`,否则 `login_method=None`;用 `builtin_provider_entry(provider_name)` 校验;为 `None` 则报错并列出 `BUILTIN_PROVIDER_CATALOG` 的 name 加上别名;否则 `CommandResult(handled=True, login_provider=entry.name, login_method=login_method)`。
  4. 空 `args` → `CommandResult(handled=True, login_picker_requested=True)`。

#### `_logout_command(context: CommandContext) -> CommandResult`

- **作用**:移除内建 provider 的保存凭证(`/logout [provider]`)。
- **步骤**:`provider_name = context.args.strip()`;非空则用 `builtin_provider_entry` 校验,未知则报错列出 `BUILTIN_PROVIDER_CATALOG` 的 name,否则 `CommandResult(handled=True, logout_provider=entry.name)`;空 `args` → `CommandResult(handled=True, logout_picker_requested=True)`。

#### `_format_session_record(record: CodingSessionRecord) -> str`

- **作用**:把一条 `CodingSessionRecord` 格式化为 `- {record.id}: {title or "Untitled"} ({record.model}) {record.cwd}`。

#### `_format_diagnostics(diagnostics: Sequence[ResourceDiagnostic], *, kind: str | None = None) -> list[str]`

- **作用**:格式化资源诊断。`kind` 为 `None` 时取全部,否则只取 `diagnostic.kind == kind`。无则 `["Resource diagnostics: none"]`;否则以 “Resource diagnostics:” 为头,逐条 `diagnostic.format()`。

#### `_refresh_provider_settings(session: CommandSession) -> CommandResult | None`

- **作用**:在需要最新 provider 信息(如 `/model`、`/scoped-models`)前刷新设置;返回错误结果或 `None`。
- **步骤**:`try: session.reload_provider_settings()`;捕获 `ValueError` 返回 `CommandResult(handled=True, message=f"Could not refresh provider settings: {exc}")`;否则 `None`。

#### `format_reload_summary(summary: CodingReloadSummary) -> str`

- **作用**:把一次 `/reload` 的结果汇总成可读文本,涵盖 skills/prompt templates/extensions/context files/系统提示重建/诊断,并提示 provider 配置不被 `/reload` 刷新(应走 `/login` 或 `/model`)。各分类用 `_format_reload_category` 格式化。

#### `_format_reload_category(summary: ReloadCategorySummary) -> str`

- **作用**:把单类 reload 摘要格式化为 “{after} total ({status}{delta})”,`status` 为 `changed`/`unchanged`,`delta` 由 `_format_count_delta` 决定。

#### `_format_count_delta(delta: int) -> str | None`

- **作用**:`delta==0` 返回 `None`(不显示),否则返回带正负号的差值串如 `+2`/`-1`。

#### `_parse_command(text: str) -> tuple[str, str]`

- **作用**:把形如 `/name args` 的字符串拆成 (命令名, 参数)。
- **实现**:`command, separator, args = text[1:].partition(" ")`(去掉首字符 `/`),返回 `(_normalize_name(command), args.strip() if separator else "")`。注意当无空格时 `separator` 为空,`args` 置 `""`。

#### `_parse_export_args(args: str) -> tuple[str | None, Path | None]`

- **作用**:解析 `/export` 参数,返回 `(export_format, destination)`。
- **步骤**:`parts = args.split()`,逐个遍历:
  - `"--format"`(后跟值):取下一个 part 作为 format;越界则抛 `ValueError(usage)`。
  - `"--format=xxx"`:`partition("=")[2]` 取值。
  - 以 `-` 开头且非上述 → 抛 `ValueError(f"Unknown export option: {part}")`。
  - 首个非选项位置参数 → `destination = Path(part).expanduser()`。
  - 第二个位置参数 → 抛 usage 错误。
- 返回 `(export_format, destination)`(均可为 `None`)。

#### `_validated_session_name(value: str) -> str`

- **作用**:校验 `/name` 的新名字。
- **步骤**:`name = value.strip()`;空 → 抛 `ValueError("Usage: /name <new name>")`;含 `\r`、`\n`、`\t` 任一 → 抛 `ValueError("Session name must be a single line.")`;否则返回 `name`。

#### `_normalize_name(name: str) -> str`

- **作用**:命令名规范化:去首尾空白、`removeprefix("/")`、转小写。被 `register`/`get`/`_parse_command` 统一使用。

---

## 文件:session_manager.py

`session_manager.py` 负责在用户主目录（经 `TauPaths`）层面管理 coding 会话的元数据索引：创建、列举、恢复、重命名。它使用 JSONL 索引文件（每行一个 JSON 对象，便于追加和流式读取），按项目 cwd（当前工作目录）分目录，并兼容一个 legacy 全局 `index.jsonl`。`SessionManager`（会话管理器）拥有"所有会话的目录"，使 CLI 能够在多次运行之间列出、恢复与创建会话。

### SessionRecordModel (Pydantic BaseModel)

```python
class SessionRecordModel(BaseModel):
```

- **作用**:会话元数据的 JSON 可序列化模型(磁盘形态),用于 JSONL 读写。
- **配置**:`model_config = ConfigDict(extra="ignore")`——解析时忽略未知字段,向前兼容。
- **字段逐条**:
  - `id: str` — 会话唯一 id。
  - `path: str` — 会话数据文件(jsonl)路径字符串。
  - `cwd: str` — 工作目录字符串。
  - `model: str` — 模型标识。
  - `provider_name: str | None = None` — provider 名(可选)。
  - `title: str | None = None` — 会话标题(可选)。
  - `created_at: float` — 创建时间戳。
  - `updated_at: float` — 最后更新时间戳。

### CodingSessionRecord (frozen dataclass, slots)

```python
@dataclass(frozen=True, slots=True)
class CodingSessionRecord:
```

- **作用**:单个持久化 coding 会话的元数据(内存形态,路径为 `Path`)。
- **字段逐条**:
  - `id: str`
  - `path: Path` — 会话数据文件位置。
  - `cwd: Path` — 工作目录。
  - `model: str`
  - `title: str | None`
  - `created_at: float`
  - `updated_at: float`
  - `provider_name: str | None = None`

#### `from_model(cls, model: SessionRecordModel) -> CodingSessionRecord`

- **作用**:类方法,把 JSON 模型转换为记录。把 `model.path`/`model.cwd` 用 `Path(...)` 包裹,其余字段直接搬运(含 `provider_name`)。

#### `to_model(self) -> SessionRecordModel`

- **作用**:反向转换,把记录转回 `SessionRecordModel`,`path`/`cwd` 用 `str(...)` 序列化。

### SessionManager

```python
class SessionManager:
```

- **作用**:创建、索引、列举、恢复用户主目录下的 coding 会话。`paths` 默认为 `TauPaths()`,所有索引路径与项目会话目录都经它解析。

#### `__init__(self, paths: TauPaths | None = None) -> None`

- 初始化 `self.paths = paths or TauPaths()`。

#### `index_path` (property)

- **作用**:返回 legacy 全局会话索引路径 `self.paths.sessions_dir / "index.jsonl"`。

#### `project_index_path(self, cwd: Path) -> Path`

- **作用**:返回指定项目 cwd 的会话索引路径 `self.paths.project_session_dir(cwd) / "index.jsonl"`。

#### `list_sessions(self, cwd: Path | None = None) -> list[CodingSessionRecord]`

- **作用**:返回索引会话,按 `updated_at` 倒序(最新在最前)。
- **分支**:传 `cwd` → `self._read_project_records(cwd)`(仅该项目);否则 `self._read_all_records()`(跨所有项目索引 + legacy 全局索引)。最后 `sorted(records, key=lambda r: r.updated_at, reverse=True)`。

#### `get_session(self, session_id: str) -> CodingSessionRecord | None`

- **作用**:按 id 查会话。遍历 `_read_all_records()`,`id` 匹配即返回;遍历完无果返回 `None`。

#### `latest_session_for_cwd(self, cwd: Path) -> CodingSessionRecord | None`

- **作用**:返回某 cwd 最近更新的会话。`list_sessions(cwd)` 后取 `records[0]`,空则返回 `None`。

#### `create_session(...)` 

- **签名**:`create_session(self, *, cwd: Path, model: str, provider_name: str | None = None, title: str | None = None, session_id: str | None = None) -> CodingSessionRecord`
- **作用**:创建并索引新会话。先 `prepare_session(...)` 得到记录,再 `index_session(record)`,返回记录。

#### `prepare_session(...)`

- **签名**:`prepare_session(self, *, cwd: Path, model: str, provider_name: str | None = None, title: str | None = None, session_id: str | None = None) -> CodingSessionRecord`
- **作用**:仅构造元数据(不写入索引,供“先准备好再决定索引”场景)。
- **步骤**:`now = time()`;`resolved_cwd = cwd.resolve()`;`record_id = session_id or uuid4().hex`;`path = self.paths.project_session_dir(resolved_cwd) / f"{record_id}.jsonl"`;`path.parent.mkdir(parents=True, exist_ok=True)`;返回 `CodingSessionRecord(... created_at=now, updated_at=now)`。

#### `index_session(self, record: CodingSessionRecord) -> CodingSessionRecord`

- **作用**:把准备好的记录加入恢复索引。调用 `self._upsert(record)` 后返回原记录。

#### `get_or_create_default_session(self, *, cwd: Path, model: str, provider_name: str | None = None) -> CodingSessionRecord`

- **作用**:返回某项目的默认会话,需要则创建索引记录。
- **步骤**:`resolved_cwd = cwd.resolve()`;`project_hash = self.paths.project_session_dir(resolved_cwd).name`;`session_id = f"default-{project_hash}"`;若 `get_session(session_id)` 已存在则直接返回;否则用 `now`、`self.paths.default_session_path(resolved_cwd)`、标题 “Default session” 构造记录并 `_upsert`,返回。

#### `touch_session(self, session_id: str, *, model: str | None = None, provider_name: str | None = None, title: str | None = None) -> CodingSessionRecord | None`

- **作用**:更新会话的“最近使用”元数据(模型/provider/标题),并刷新 `updated_at`。
- **步骤**:`existing = get_session(session_id)`,`None` 返回 `None`;否则构造新记录:`model or existing.model`、`provider_name if not None else existing.provider_name`、`title if not None else existing.title`、`updated_at=time()`、其余沿用;再 `_upsert(updated)` 返回。(被 `_name_command` 重命名时调用。)

#### `_read_index(self, path: Path) -> list[CodingSessionRecord]`

- **作用**:读取单个 JSONL 索引文件为记录列表。
- **步骤**:`path` 不存在 → `[]`;否则逐行 `read_text().splitlines()`,跳过空行;`SessionRecordModel.model_validate_json(stripped)` 解析,`CodingSessionRecord.from_model(model)` 转入内存形态;累加返回。

#### `_read_project_records(self, cwd: Path) -> list[CodingSessionRecord]`

- **作用**:读取某项目 cwd 的会话记录(项目索引 + 落在同一 cwd 的 legacy 全局记录)。
- **步骤**:`resolved_cwd = cwd.resolve()`;先读 `project_index_path(resolved_cwd)`;再从 `index_path`(legacy 全局)读并仅保留 `record.cwd == resolved_cwd` 的;合并后 `_deduplicate_records`。

#### `_read_all_records(self) -> list[CodingSessionRecord]`

- **作用**:跨所有项目读取全部记录(legacy 全局索引 + 各 `sessions_dir/*/index.jsonl`)。
- **步骤**:先读 `index_path`;再 `self.paths.sessions_dir.glob("*/index.jsonl")` 逐个 `_read_index` 扩展;最后 `_deduplicate_records`。

#### `_write_index(self, path: Path, records: list[CodingSessionRecord]) -> None`

- **作用**:把记录列表写回 JSONL 索引。
- **步骤**:`path.parent.mkdir(parents=True, exist_ok=True)`;每行 `record.to_model().model_dump_json()` 用 `\n` 连接;若内容非空末尾补 `\n`;`write_text(content, encoding="utf-8")`。

#### `_upsert(self, record: CodingSessionRecord) -> None`

- **作用**:向“该项目索引”插入/更新一条记录(按 id 去重替换)。
- **步骤**:`path = project_index_path(record.cwd)`;读出现有记录并过滤掉 `item.id != record.id` 的;追加 `record`;`_write_index(path, records)`。

### `_deduplicate_records(records: list[CodingSessionRecord]) -> list[CodingSessionRecord]`

- **作用**:按 `id` 去重,冲突时保留 `updated_at` 较大(较新)的一条。
- **步骤**:`by_id: dict[str, CodingSessionRecord] = {}`;遍历,`existing is None or record.updated_at >= existing.updated_at` 时覆盖;最后 `list(by_id.values())`(保持插入顺序)。被 `_read_project_records` 与 `_read_all_records` 在合并 legacy 与项目索引后调用,避免同一会话出现两条。

---

## 串联要点

1. **`CommandRegistry` 如何解析并分派用户输入的 `/xxx`**：TUI 在 `_submit_prompt` 中先把用户输入交给 `SessionManager`/`CodingSession.handle_command`（或等价入口），最终落到 `CommandRegistry.execute(session, text)`。`execute` 先做 `strip` 与 `/` 前缀判断（非 `/` 或 `/skill:` 内联法则 `handled=False`，退回普通 prompt）；接着 `_parse_command` 拆出 `(name, args)` 并 `_normalize_name`；再经 `get()` 处理别名（含 `/scoped models` 兼容映射）；命中则构造 `CommandContext` 调用对应 `handler`，返回 `CommandResult`。

2. **`CodingSession` 暴露的能力如何被命令调用**：handler 大多只产出 `CommandResult` 上的 `*_requested` 标志（如 `model_picker_requested`、`resume_session_id`、`theme`、`thinking_level`），由前端（TUI）据此驱动 `CodingSession` 的真实业务：`set_model`、`reload_provider_settings`、`ensure_session_indexed`、压缩、导出、恢复等。少数 handler（如 `_name_command`）会直接通过 `context.session.session_manager`（一个 SessionManager）调用 `touch_session` 完成重命名并写索引。这种"handler 只产出意图标志，前端负责执行"的模式，让命令解析层与会话业务层保持松耦合。

3. **TUI 的 `_submit_prompt` 先走 `session.handle_command`**：用户输入先被当作潜在命令解析；命令系统返回 `handled=True` 时，TUI 根据 `CommandResult` 中的各类请求（退出/新会话/选择器/模型/主题/思考级别/恢复/导出/压缩/重命名等）执行对应 UI 动作或调用 `CodingSession` 方法；返回 `handled=False` 时则作为普通对话 prompt 提交给 agent 循环。这样命令层与对话层在统一入口解耦——用户输入要么是命令，要么是对话，不会混淆。

---

<!-- NAV -->
[← tau_coding · CodingSession]({{< relref "./coding-session.md" >}})
[↑ 总览]({{< relref "./source-walkthrough.md" >}})
[→ tau_coding · 会话索引]({{< relref "./coding-session-manager.md" >}})
