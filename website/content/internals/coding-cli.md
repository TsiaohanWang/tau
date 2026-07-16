---
title: tau_coding · CLI 入口
description: cli.py —— Typer 命令行
---

## 4. `cli.py` — the Typer entry point

这是面向用户的二进制(`tau`)。它基于 **Typer** 构建并编排整个技术栈。导入时它甚至会调用
`_force_utf8_streams()` 将 stdout/stderr 重新配置为 UTF-8,以免在某些平台(Windows)上,控制台代码页
在遇到非 ASCII 模型输出时抛出错误。

```python
app = typer.Typer(name="tau", add_completion=False,
                  context_settings={"allow_extra_args": True, ...})


@app.callback(invoke_without_command=True)
def main(ctx, prompt_args, prompt_option, provider, model, setup_*,
         cwd, output, resume, new_session, auto_compact_threshold,
         extension, no_extensions, project_extensions, version) -> None: ...
```

`main` 的职责如下:

1. **版本 / 子命令分派。** `--version` 打印 `tau <version>`。若调用了真正的子命令则提前返回。简单的动词命令按位置参数处理:`tau sessions` 列出会话,`tau providers` 列出已配置的 provider
   (`providers_command`),`tau setup` 创建/更新一个 OpenAI 兼容 provider
   (`setup_command` → `upsert_openai_compatible_provider` + `save_provider_settings`),
   而 `tau export <ref> [--format html|jsonl] [out]` 导出会话(`export_session_command`)。
2. **TUI 与打印模式。** 若未给定 `--prompt`/`-p`,则运行 `run_openai_tui`(→ 来自 `tui` 的
   `run_tui_app`,3d),传入 model、cwd、resume、new-session、provider、auto-compact 阈值、初始 prompt、
   启动通知以及扩展标志。若给定了 `--prompt`,则运行 `run_openai_print_mode`(→ `run_print_mode`),
   它使用 `rendering`(3c)中的 plain/JSON `EventRenderer`。
3. **Provider 与会话设置(打印模式)。** `run_openai_print_mode` 加载 `ProviderSettings`,解析选择
   (`resolve_provider_selection`),通过 `create_model_provider`(`provider_runtime.py`,3c)以
   `DEFAULT_THINKING_LEVEL` 构建 `ModelProvider`,经由 `SessionManager` 创建 `CodingSessionRecord`,
   并驱动 `run_print_mode`。
4. **`run_print_mode`** 是非交互的主力:它通过 `CodingSession.load(CodingSessionConfig(...))` 构建
   `CodingSession`,为扩展安装 `StderrUiBridge`,发出待处理的 `session_start`,挑选一个 `EventRenderer`,
   然后要么运行斜杠命令/终端命令,要么通过渲染器流式处理 `session.prompt(prompt)`。遇到不可恢复的错误时
   它返回 `False`,以便 CLI 以非零状态退出。
5. **扩展标志** `--extension/-x`(可重复的显式路径)、`--no-extensions`(禁用目录发现;显式 `-x` 仍会加载),
   以及 `--project-extensions`(同时加载 `<cwd>/.tau/extensions`)会透传给两个前端。

`cli.py` 刻意作为一个 **组合根**:它了解其它每一部分,但不包含 agent 逻辑、渲染内部细节,以及除将名称
接线到配置函数之外的任何 provider 细节。

> **为何采用无逻辑的组合根?** Pi 的架构保持核心 agent 工具可移植:它绝不能依赖 CLI、TUI 或任何特定
> provider。`cli.py` 是将那些可移植部分 *组装* 成可运行程序的唯一场所 —— 解析 argv、选择前端(TUI 还是
> 打印模式)、并透传扩展标志。将所有决策(模型选择、会话创建、prompt 流式处理)放在 `run_openai_print_mode` /
> `run_print_mode` 中而非 `main` 里,意味着工具保持可测试与可复用:README 中"核心保持可移植"的保证得以成立,
> 因为唯一不可移植的接线就位于入口点之后的此处。

---

## 逐方法深度剖析（cli.py）

> 以下为 `cli.py` 各顶层函数与类的逐方法展开，是对上方组合根概述的细化补充。

# `tau_coding/cli.py` 源码剖析

本文件是 Tau coding-agent 的命令行入口,基于 `typer`(构建于 `click`/`argparse` 体系之上)实现。它负责:解析命令行参数、加载 provider 配置与凭证、构造 `CodingSession`、并选择 TUI(交互式)或 print(非交互式)前端启动。下面按源码中出现的顺序,对每个顶层函数、类逐一定义展开。

---

### `_is_utf8_encoding(encoding: str | None) -> bool`

判断某个流编码名称是否表示 UTF-8。

- **用途**:用于在 Windows 等默认非 UTF-8 控制台环境下决定是否需要重新配置标准流。
- **实现**:
  - 若 `encoding` 为 `None`,直接返回 `False`。
  - 否则将编码名统一小写,并去掉其中的连字符 `-` 与下划线 `_`,再与 `"utf8"` 比较;相等则返回 `True`(可识别 `utf-8`、`UTF_8`、`utf_8` 等变体)。
- **调用**:无外部模块依赖,仅做字符串归一化。

---

### `_force_utf8_streams() -> None`

把 `sys.stdout` / `sys.stderr` 重配置为 UTF-8(当它们还不是 UTF-8 时)。

- **用途**:Windows 控制台默认使用系统代码页(如 `cp1252`),模型输出一旦包含该代码页之外的字符就会抛 `UnicodeEncodeError`。此函数规避该问题。
- **实现**:
  - 遍历 `(sys.stdout, sys.stderr)`。
  - 对每个流,先调用 `_is_utf8_encoding(getattr(stream, "encoding", None))` 判断;若已是 UTF-8 则跳过。
  - 否则用 `contextlib.suppress(AttributeError, ValueError)` 包裹 `stream.reconfigure(encoding="utf-8", errors="replace")`,即便流不可重配置(如管道)也不会崩溃。
- **调用**:依赖 `_is_utf8_encoding` 与 `contextlib.suppress`。
- **副作用**:模块导入时即以 `_force_utf8_streams()` 形式被调用一次(第 87 行),属于模块级副作用。

---

### `app`(模块级变量)

创建 `typer.Typer` 应用实例,是整个 CLI 的根对象。

- **配置**:
  - `name="tau"`。
  - `help="Tau coding-agent harness."`。
  - `add_completion=False`(关闭 shell 自动补全)。
  - `context_settings={"allow_extra_args": True, "ignore_unknown_options": True}`:允许把未知参数透传给 TUI/agent,避免被 typer 拦截。
- **用途**:作为组合根容器;子命令通过 `@app.command()`/`@app.callback()` 注册(本文件中 `main` 作为回调、`providers`/`setup`/`sessions`/`export` 等子命令实际被内联在 `main` 中分派,而非独立 `@app.command` 注册)。

---

### `providers_command() -> None`

列出当前已配置的模型 provider。

- **用途**:`tau providers` 子命令的内联处理函数(在 `main` 中以 `providers_command()` 形式调用)。
- **实现**:调用 `load_provider_settings()` 读取 `ProviderSettings`,并以 `FileCredentialStore()` 作为 `credential_reader`,传给 `render_provider_settings(...)` 进行渲染输出。
- **调用**:`provider_config.load_provider_settings`、`credentials.FileCredentialStore`、`render_provider_settings`(同模块定义)。

---

### `setup_command(*, provider_name=..., base_url=..., api_key_env=..., model=..., timeout_seconds=..., max_retries=..., max_retry_delay_seconds=..., set_default=True) -> None`

创建或更新一个 OpenAI-compatible provider 配置项(setup 向导)。

- **用途**:`tau setup` 子命令的内联处理函数。
- **关键实现步骤**:
  1. 用 `load_provider_settings()` 读取现有 `ProviderSettings`。
  2. 构造 `OpenAICompatibleProviderConfig`,其中 `base_url` 经 `rstrip("/")` 去除尾部斜杠;`models=(model,)`、`default_model=model`,并填入超时/重试等参数。
  3. 调用 `upsert_openai_compatible_provider(settings, provider, set_default=set_default)`:在设置中插入或覆盖该 provider,并按 `set_default` 决定是否设为默认。
  4. 调用 `save_provider_settings(updated)` 持久化,返回保存路径。
  5. `typer.echo(f"Saved provider '{provider.name}' to {user_catalog_path()} and preferences to {path}")` 打印结果。
  6. 若 `provider.api_key_env` 不在 `environ` 中,额外以 `err=True` 提示用户运行前需设置该环境变量。
- **调用**:`provider_config`(多个)、`catalog_loader.user_catalog_path`、`save_provider_settings`、`credentials` 相关。

---

### `main(ctx, prompt_args, prompt_option, provider, model, setup_base_url, setup_api_key_env, setup_timeout_seconds, setup_max_retries, setup_max_retry_delay_seconds, setup_default, cwd, output, resume, new_session, auto_compact_threshold, extension, no_extensions, project_extensions, version) -> None`

Typer 的顶层回调(`@app.callback(invoke_without_command=True)`),即组合根。负责参数解析、子命令分派、TUI/print 前端选择启动。

- **装饰器行为**:`invoke_without_command=True` 使得即便不输入子命令也会执行 `main`(用于直接进入交互/打印模式)。所有参数均为 `Annotated` 形式声明,区分位置参数(`prompt_args: list[str] | None`,作为初始 TUI prompt)与选项(`--prompt/-p`、`--provider`、`--model/-m`、`--base-url` 等 setup 选项、`--cwd`、`--output/-o`、`--resume`、`--new-session`、`--auto-compact-threshold`、`--extension/-x`、`--no-extensions`、`--project-extensions`、`--version`)。`output` 默认 `PrintOutputMode.text`。
- **关键流程**:
  1. **版本检查**:`current_version = _current_version()`;若 `version` 为真,打印 `tau <version>` 并 `raise typer.Exit()`。
  2. **子命令优先**:`if ctx.invoked_subcommand is not None: return` —— 当有真正的 typer 子命令被调用时,把控制权交给子命令(本文件中无独立注册的子命令,tui/print 走下面逻辑)。
  3. **互斥校验**:`resume` 与 `new_session` 同时指定时抛 `typer.BadParameter`。
  4. **位置和命令解析**:`positional_args = prompt_args or []`;取 `command = positional_args[0]`(如 `sessions`/`export`/`providers`/`setup`),`initial_prompt` 为所有位置参数用空格拼接。
  5. **内联子命令分派**(仅在未使用 `--prompt` 时):
     - `command == "sessions"` 且只有一个位置参数:调用 `render_session_list(SessionManager().list_sessions())` 后退出。
     - `command == "export"`:先 `_parse_export_cli_args(positional_args[1:])` 解析(失败抛 `BadParameter`),再用 `anyio.run(export_session_command, ...)` 执行,打印结果后退出。
     - `command == "providers"`:直接 `providers_command()` 后退出。
     - `command == "setup"`:调用 `setup_command(...)`(用 `--provider`/`-m`/各 setup 选项),后退出。
  6. **TUI 模式**(当 `prompt_option is None`,即未使用 `--prompt`):
     - `extension_paths = tuple(extension or ())`。
     - 取 `_startup_update_notice()` 作为 `notice`。
     - `anyio.run(run_openai_tui, model, cwd or Path.cwd(), resume, new_session, provider, auto_compact_threshold, initial_prompt, notice, extension_paths, not no_extensions, project_extensions)`,并以 `RuntimeError/ValueError` 转 `BadParameter`;完成后 `raise typer.Exit()`。
  7. **Print 模式**(当 `prompt_option` 非空):
     - `prompt = prompt_option`(断言非空)。
     - 取 `notice`,若非空且 `output is PrintOutputMode.text`,以 `err=True` 打印 notice。
     - `anyio.run(run_openai_print_mode, prompt, model, cwd or Path.cwd(), output, provider, None, extension_paths, not no_extensions, project_extensions)`,异常转 `BadParameter`。
     - 返回值 `ok` 为 `False` 时 `raise typer.Exit(1)`(非交互运行失败)。
- **数据流**:参数 → 解析/分派 → 凭据与 provider 设置在 `run_openai_tui`/`run_openai_print_mode` 内部完成加载 → 构造 `CodingSession` → 启动前端。
- **调用**:几乎全部本模块与 `tau_coding` 其它子模块函数。

---

### `run_openai_tui(model, cwd, session_id=None, new_session=False, provider_name=None, auto_compact_token_threshold=None, initial_prompt=None, update_notice=None, extension_paths=(), extensions_enabled=True, project_extensions_enabled=False) -> None`

异步:用默认 OpenAI-compatible provider 启动 Textual TUI。

- **用途**:TUI 前端的异步装配入口,被 `main` 以 `anyio.run` 调用。
- **实现步骤**:
  1. `release_notes_notice = startup_release_notes_notice(_current_version())` 获取发布说明。
  2. 构造 `startup_notices` 列表:依次收集 `release_notes_notice.message` 与 `update_notice.message`(非空才加入)。
  3. 调用 `run_tui_app(...)`,透传 `model`、`cwd`、`session_id`、`new_session`、`provider_name`、`auto_compact_token_threshold`、`initial_prompt`、`startup_notices`(转为 tuple)、`extension_paths`、`extensions_enabled`、`project_extensions_enabled`。
- **调用**:`tau_coding.tui.run_tui_app`、`update_check.startup_release_notes_notice`、`_current_version`、`_startup_update_notice`(来自 `main` 传入的 notice)。

---

### `_startup_update_notice() -> UpdateNotice | None`

获取启动时的版本更新通知。

- **用途**:被 `main` 调用,封装更新检查。
- **实现**:`return startup_update_notice(_current_version())`。
- **调用**:`update_check.startup_update_notice`、`version._current_version`。

---

### `render_session_list(records: list[CodingSessionRecord]) -> None`

渲染已索引的 session 列表到 CLI。

- **用途**:`tau sessions` 的输出渲染。
- **实现**:
  - 若 `records` 为空,打印 `"No sessions found."` 并返回。
  - 否则逐条打印 `record.id`、`title`(空则 `"Untitled"`)、`record.model`、`record.cwd`,以制表符 `\t` 分隔。
- **调用**:`typer.echo`。

---

### `export_session_command(session_ref, output_path=None, export_format=None, session_manager=None) -> Path`

异步:导出某个索引 session id 或 JSONL 文件为产物。

- **用途**:`tau export` 的实际执行函数(被 `anyio.run` 调用)。
- **实现步骤**:
  1. `_resolve_export_source(session_ref, session_manager)` 得到 `(session_path, title)`(解析为文件路径或索引记录路径)。
  2. `await JsonlSessionStorage(session_path).read_all()` 读取全部 `SessionEntry`。
  3. `normalize_export_format(...)`:若指定格式用指定,否则从 `output_path.suffix` 推断,再否则默认 `"html"`。
  4. `_resolve_export_destination(output_path, session_path=..., format=...)` 计算最终输出路径。
  5. `export_session_artifact(entries, destination, title=title, source=str(session_path), format=normalized_format)` 执行导出,返回路径。
- **调用**:`tau_agent.session.JsonlSessionStorage`、`session_export`(三个函数)、本模块 `_resolve_export_source`/`_resolve_export_destination`、`SessionManager`。

---

### `_parse_export_cli_args(args: list[str]) -> tuple[str, Path | None, str | None]`

解析 `tau export` 的位置参数与格式/输出选项。

- **用途**:从 `positional_args[1:]` 解析出 `(session_ref, output_path, export_format)`。
- **实现**:
  - 若 `args` 为空,抛 `RuntimeError` 打印用法。
  - 第一个参数作为 `session_ref`。
  - 从索引 1 起循环:
    - `arg == "--format"`:取下一参数作为 `export_format`(越界则报错)。
    - `arg.startswith("--format=")`:用 `partition("=")` 取等号后内容。
    - `arg.startswith("-")`:未知选项,抛 `RuntimeError`。
    - 否则若为首个非选项实参,当作 `output_path`(经 `expanduser()`);已设置过则报错。
  - 返回三元组。
- **调用**:纯解析,无外部模块。

---

### `_resolve_export_destination(output_path, *, session_path, format) -> Path`

根据 `output_path` 与格式解析最终导出文件路径。

- **用途**:配合 `export_session_command`。
- **实现**:
  - 若 `output_path is None`:返回 `default_session_export_artifact_path(session_path, destination_dir=Path.cwd(), format=format)`(在当前目录生成默认名)。
  - 若 `output_path` 带后缀(`.suffix` 非空):直接返回该路径。
  - 否则视为目录:返回 `default_session_export_artifact_path(..., destination_dir=output_path, format=format)`。
- **调用**:`session_export.default_session_export_artifact_path`。

---

### `_resolve_export_source(session_ref, session_manager=None) -> tuple[Path, str]`

将 session 引用(文件或索引 id)解析为具体 JSONL 文件路径与标题。

- **用途**:配合 `export_session_command`。
- **实现**:
  - `candidate_path = Path(session_ref).expanduser()`。
  - 若 `candidate_path.exists()`:若是目录则抛 `RuntimeError`;否则返回 `(candidate_path, f"Tau session {candidate_path.stem}")`。
  - 否则用 `session_manager or SessionManager()` 调用 `get_session(session_ref)`;记录为空则抛 `RuntimeError("Unknown session or file: ...")`。
  - 返回 `(record.path, title)`,标题为 `record.title` 或 `f"Tau session {record.id}"`。
- **调用**:`session_manager.SessionManager`/`CodingSessionRecord`。

---

### `render_provider_settings(settings, *, credential_reader=None) -> None`

渲染已配置 provider 列表到 CLI。

- **用途**:`tau providers` 的输出渲染(被 `providers_command` 调用)。
- **实现**:遍历 `settings.providers`,每行用制表符组合输出:
  - `marker`:该 provider 是默认则 `"*"`,否则 `" "`。
  - `provider.name`、`provider_kind(provider)`(类型,如 `openai-compatible`/`openai-codex`)。
  - `provider.default_model`、`models`(逗号连接)、`provider.api_key_env`。
  - `_provider_credential_status(provider, credential_reader=...)`(凭证状态)。
  - `provider.base_url`、`provider.timeout_seconds:g`s、`retries=...`、`retry_delay=...`s。
- **调用**:`_provider_credential_status`、`provider_config.provider_kind`、`typer.echo`。

---

### `_provider_credential_status(provider, *, credential_reader=None) -> str`

判定某 provider 的凭证是否已配置(已存储 / 环境变量 / 缺失)。

- **用途**:供 `render_provider_settings` 显示凭证列。
- **实现**:
  - 若 `provider.credential_name` 存在且 `credential_reader` 非空:
    - 若 `provider_kind(provider) == "openai-codex"`:尝试 `getattr(credential_reader, "get_oauth", None)`,若存在且 `get_oauth(credential_name)` 非空,返回 `"stored:<name>"`。
    - 否则 `credential_reader.get(credential_name)` 非空则返回 `"stored:<name>"`。
  - 若 `environ.get(provider.api_key_env)` 存在,返回 `"env:<api_key_env>"`。
  - 否则返回 `"missing"`。
- **调用**:`provider_config.provider_kind`、`os.environ`、`CredentialReader`。

---

### `run_openai_print_mode(prompt, model, cwd, output=PrintOutputMode.text, provider_name=None, session_manager=None, extension_paths=(), extensions_enabled=True, project_extensions_enabled=False) -> bool`

异步:用从环境配置出的 OpenAI-compatible provider 运行 print 模式。

- **用途**:非交互(单次 prompt)前端的装配入口,被 `main` 的 print 分支以 `anyio.run` 调用。
- **实现步骤**:
  1. `settings = load_provider_settings()`、`shell_settings = load_shell_settings()`。
  2. `selection = resolve_provider_selection(settings, provider_name=provider_name, model=model)` 解析 provider 与 model。
  3. `create_model_provider(selection.provider, model=selection.model, thinking_level=DEFAULT_THINKING_LEVEL)` 构造 `ModelProvider`。
  4. `manager = session_manager or SessionManager()`;`record = manager.create_session(cwd=cwd, model=selection.model)` 创建 session 记录。
  5. `try` 内调用 `run_print_mode(...)`,透传 prompt、model、storage=`jsonl_session_storage(record.path)`、`session_id=record.id`、`provider_name=selection.provider.name`、`provider_settings=settings`、`runtime_provider_config=selection.provider`、`shell_command_prefix=shell_settings.shell_command_prefix` 及扩展相关参数;返回其结果。
  6. `finally: await provider.aclose()` 确保关闭 provider。
- **调用**:`provider_config`、`provider_runtime.create_model_provider`、`session_manager.SessionManager`、`session.jsonl_session_storage`、`tau_coding.thinking.DEFAULT_THINKING_LEVEL`、`run_print_mode`(本模块)。

---

### `run_print_mode(*, prompt, model, cwd, provider, output=PrintOutputMode.text, resource_paths=None, storage=None, session_id=None, session_manager=None, provider_name=DEFAULT_PROVIDER_NAME, provider_settings=None, runtime_provider_config=None, shell_command_prefix=None, extension_paths=(), extensions_enabled=True, project_extensions_enabled=False) -> bool`

异步:执行单次非交互 prompt 并打印流式事件。返回 `False` 表示 agent 发出不可恢复错误。

- **用途**:print 模式的核心运行逻辑(被 `run_openai_print_mode` 调用)。
- **实现步骤**:
  1. `await CodingSession.load(CodingSessionConfig(...))`:构造 `CodingSession`,填入 provider、model、cwd、storage(未给则用 `_MemorySessionStorage()`)、resource_paths、session_id、session_manager、provider_name/settings/config、shell_command_prefix、扩展路径与开关。
  2. `session.extension_runtime.set_ui_bridge(StderrUiBridge())`:把 stderr 桥接为 UI 桥(print 模式无 TUI)。
  3. `await session.emit_pending_session_start()`:发出会话开始事件。
  4. `renderer = create_event_renderer(output, custom_message_renderer=session.extension_runtime.render_custom_message)`:构造事件渲染器。
  5. `try` 分支:
     - `parse_terminal_command(prompt)`:若 prompt 是终端命令格式,调用 `session.run_terminal_command(...)`,打印 `_format_terminal_command_result(result)`,返回 `result.ok`。
     - `session.handle_command(prompt)`:若命中内建命令(`handled`),按需 `session.reload()` 并 `format_reload_summary` 生成消息,打印后返回 `True`。
     - 否则 `async for event in session.prompt(prompt): renderer.render(event)` 流式渲染;最后 `return renderer.finish()`(返回是否成功)。
  6. `finally: await session.aclose()` 关闭会话。
- **调用**:`tau_coding.session.CodingSession`/`CodingSessionConfig`、`extensions.StderrUiBridge`、`rendering.create_event_renderer`、`session.parse_terminal_command`/`run_terminal_command`/`handle_command`/`reload`、`commands.format_reload_summary`、`_MemorySessionStorage`(本模块)、`_format_terminal_command_result`(本模块)。

---

### `class _MemorySessionStorage`

仅追加的内存 SessionStorage,用于直接 print 模式测试(无文件落盘)。

- **属性**:`__init__` 中初始化 `self.entries: list[SessionEntry] = []`。
- **`async append(self, entry)`**:`self.entries.append(entry)`。
- **`async read_all(self) -> list[SessionEntry]`**:`return list(self.entries)`(拷贝返回)。
- **用途**:在 `run_print_mode` 未提供 `storage` 时作为默认存储,便于测试与一次性运行。

---

### `_format_terminal_command_result(result: TerminalCommandResult) -> str`

把终端命令执行结果格式化为可读字符串。

- **用途**:在 print 模式下显示 `run_terminal_command` 的产出。
- **实现**:
  - `context_status = "added to context" if result.added_to_context else "not added to context"`。
  - 返回 `"$ {result.command}\n[{context_status}]\n{result.output}"`。
- **调用**:无外部模块。

---

## 组合根与前端选择小结

`main()` 作为整个 CLI 的**组合根**,其决策流可概括为:

1. **解析参数**:用 typer 声明式地接收位置参数(初始 prompt / 内联子命令)与各类选项(provider、model、setup 系列、cwd、output、resume、extension 开关等)。
2. **分派子命令**:`sessions`/`export`/`providers`/`setup` 作为内联分支优先处理并退出;`--version` 最早返回。
3. **加载凭证 / provider**:对 TUI 与 print 两条路径,实际加载发生在 `run_openai_tui` → `run_tui_app` 与 `run_openai_print_mode`(经 `load_provider_settings`/`resolve_provider_selection`/`create_model_provider`)内部,`main` 只负责把参数透传。
4. **构造 `CodingSession`**:
   - TUI:`run_tui_app` 内部基于 `provider_name`/`model`/`cwd` 等构造会话。
   - print:`run_openai_print_mode` 先 `create_session` 建记录,再 `run_print_mode` 内 `CodingSession.load(...)` 建会话,并接 `StderrUiBridge`。
5. **选择前端启动**:`prompt_option is None` → TUI(`run_openai_tui`);否则 → print(`run_openai_print_mode`)。两路径均以 `anyio.run` 驱动异步核心,异常统一转 `typer.BadParameter`,print 模式以返回值 `ok` 决定退出码。

模块级副作用 `_force_utf8_streams()` 在导入时即把标准流重配置为 UTF-8,确保跨平台 Unicode 输出安全;`app = typer.Typer(...)` 配 `allow_extra_args`/`ignore_unknown_options` 使未知参数可透传至 agent/TUI。

---

<!-- NAV -->
[← tau_coding · OAuth 登录流程]({{< relref "./coding-oauth.md" >}})
[↑ 总览]({{< relref "./source-walkthrough.md" >}})
[→ tau_coding · 扩展系统]({{< relref "./coding-extensions.md" >}})
