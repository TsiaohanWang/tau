---
title: tau_coding · 支撑模块(二)
description: prompt_templates / reload / session_export / shell_config / update_check / version
---

## `tau_coding/prompt_templates.py` — Markdown prompt templates

Lets users author reusable prompt snippets as `*.md` files (in Tau's resource
dirs or a project's `.agents/`) and invoke them as `/name [arguments]`.

- **`_TEMPLATE_VARIABLE_RE`** — matches `{{ variable }}` placeholders.
  `_ARGUMENT_TEMPLATE_VARIABLES = {"arguments", "args"}` — the two names that
  expose the invocation's trailing arguments.
- **`PromptTemplate`** (frozen, slots) — `name`, `path`, `content`,
  `description` (from front-matter or derived from the first line).
- **`load_prompt_templates(paths)`** — loads from every `prompts_dir`, keyed by
  stem, last-write wins; raises `ResourceError` on any diagnostic.
- **`load_prompt_templates_with_diagnostics(paths)`** — the non-fatal variant
  returning `(templates, diagnostics)`; records override and duplicate-name
  diagnostics instead of raising.
- **`render_prompt_template(template, variables, *, missing=None)`** — substitutes
  `{{ var }}`; by default a missing var raises `ResourceError`; pass `missing` to
  substitute a fallback string instead (for user-facing shortcuts).
- **`expand_prompt_template_command(text, templates)`** — the `/name args` entry
  point: rejects `/` (slash commands), `//` (comment), and `/skill:` (skills);
  parses name+args; renders with `arguments`/`args`; if the template has no
  argument placeholder, the args are appended after a blank line.
- **`_template_references_arguments`**, **`_find_prompt_template`** (case/space
  insensitive stem match), **`_parse_prompt_template_command`** (splits on first
  space).
- **`_load_prompt_templates_from_dir*`** — globs `*.md`, dedupes by stem,
  captures read/decode errors as `ResourceDiagnostic` (severity "error"), and
  parses each file via `resources.parse_markdown_resource`.

> Design note: prompt templates are a *resource discovery* concern, kept apart
> from the command registry. They reuse the same `TauResourcePaths` precedence as
> skills/context files, so a project can ship its own `/prompts` alongside its
> `.agents/` skills.

---

## `tau_coding/reload.py` — reload summary types

Defines the before/after summary dataclasses returned by a local resource
reload (`/reload`), so the UI can report exactly what changed.

- **`ReloadCategorySummary`** (frozen, slots) — `before`, `after`, `changed`,
  with a `delta` property (`after - before`).
- **`CodingReloadSummary`** (frozen, slots) — groups one
  `ReloadCategorySummary` per category: `skills`, `prompt_templates`,
  `context_files`, `extensions`, `diagnostics`, plus a `system_prompt_rebuilt`
  flag.

> Design note: a reload touches several independent resource systems; bundling
> their counts into one summary lets the `/reload` command print a single,
> scannable "reloaded N skills, M prompts, …" line without coupling to each
> subsystem's internals.

---

## `tau_coding/session_export.py` — HTML/JSONL transcript export

Renders a session tree + transcript into a self-contained HTML file (or JSONL),
used by `tau export` and the TUI export command.

- **Errors/paths:** `SessionExportError(ValueError)`;
  `default_session_export_path` (`<session>.html`);
  `default_session_export_artifact_path` (in a destination dir).
- **Writers:** `export_session_jsonl` (raw `model_dump_json` per line),
  `export_session_html`, and `export_session_artifact` (picks format by
  `format` arg or suffix). `normalize_export_format` accepts `html`/`htm`/`jsonl`
  (case-insensitive, leading dot stripped); `_export_suffix` maps back.
- **`render_session_html`** — the centerpiece: a full standalone HTML document
  with inline `<style>` (light/dark via `prefers-color-scheme` and a
  `data-theme` toggle persisted to `localStorage`), a sticky sidebar session
  tree, and a transcript stream. It computes `_active_leaf_id` (last `LeafEntry`,
  else last entry), `_active_path_ids` (via `tau_agent.session.path_to_entry`,
  falling back to the leaf on `SessionTreeError`), and `_visible_entries`
  (drops `LeafEntry` plumbing rows — that info is already shown by active-path
  styling).
- **Tree rendering:** `_render_tree` builds `children_by_parent`, finds roots,
  and `_render_tree_chain` deliberately *flattens single-child chains* into
  sibling `<li>`s, only nesting an `<ol>` where history actually forks — so a
  straight-line session doesn't render one nested level per entry. Dangling
  (unreachable) entries are grouped under an "Unreachable entries" node.
- **Entry rendering:** `_render_entry_details` → `_render_entry_detail` (index,
  id, parent link, timestamp, active-path/leaf badges) → `_render_entry_body`,
  which `isinstance`-dispatches over every `SessionEntry` subtype (`MessageEntry`
  → `_render_message_entry` with role icon, tool-call list, optional `data`/
  `details` JSON blocks; `ModelChangeEntry`, `ThinkingLevelChangeEntry`,
  `CompactionEntry`, `BranchSummaryEntry`, `LabelEntry`, `LeafEntry`,
  `SessionInfoEntry`, `CustomEntry`). `_render_json_block` syntax-highlights
  JSON via Pygments (`JsonLexer` + `HtmlFormatter`, nowrap) with a safe escaped
  fallback.
- **Icons:** inline SVG constants `_ICON_USER`/`_ASSISTANT`/`_TOOL`/`_BRANCH`/
  `_LABEL`/`_INFO`/`_MODEL`/`_GENERIC`/`_SUN`/`_MOON`, chosen by `_entry_icon`
  per entry type.
- **Helpers:** `_entry_title`, `_entry_summary` (<=92-char single-line summary via
  `_summarize_text`), `_entry_parent_html`, `_format_timestamp` (UTC), `_escape`
  (`quote=False`) and `_attr` (`quote=True`) for HTML/text escaping.

> Design note: the export is a *pure function of immutable `SessionEntry`s* — no
> `CodingSession` needed. That makes it trivially testable and lets `tau export`
> run on any saved `.jsonl` offline.

---

## `tau_coding/shell_config.py` — durable shell settings

Loads the single durable shell setting (a command prefix prepended to every
shell command the agent runs) from `~/.tau/settings.json`.

- **`ShellConfigError(ValueError)`**.
- **`ShellSettings`** (frozen, slots) — `shell_command_prefix: str | None`;
  `to_json()` emits `{"shellCommandPrefix": …}` or `{}` when unset.
- **`shell_settings_path`** — `~/.tau/settings.json`.
- **`load_shell_settings`** — returns defaults if missing; raises
  `ShellConfigError` on invalid JSON or a non-object.
- **`shell_settings_from_json`** — accepts *either* `shellCommandPrefix` or
  `shell_command_prefix` (never both), rejects unknown fields, and normalizes a
  whitespace-only prefix to `None`. (The dual-name support lets older/newer
  tooling interop; the exclusivity check prevents ambiguous configs.)

> Design note: only one durable shell setting exists today, but the dataclass +
> `from_json` shape means new settings slots in without changing callers.

---

## `tau_coding/update_check.py` — best-effort PyPI update check

On startup, Tau may tell the user a newer version exists or surface release
notes — but *only* as a best-effort, never-blocking notice.

- **Constants:** `PYPI_PACKAGE_NAME = "tau-ai"` (note: the published dist is
  `tau-ai`, not `tau_coding`), `PYPI_JSON_URL`, `UPDATE_CHECK_INTERVAL =
  timedelta(days=1)`, `UPDATE_CHECK_TIMEOUT_SECONDS = 1.5`,
  `TAU_NO_UPDATE_CHECK` env disable, and the bundled
  `data/release-notes/releases.json` path. `Fetcher` / `Clock` type aliases make
  the network + time injectable for tests.
- **Dataclasses:** `UpdateNotice` (current/latest + `message` property with the
  `uv tool upgrade` command), `UpdateCheckResult` (cached `checked_at` +
  `latest_version`), `ReleaseNoteSection` / `ReleaseNotesEntry` (with
  `transcript_items` flattening), `ReleaseNotesNotice` (previous→current, with
  `notes` and a `message` Markdown block).
- **`startup_update_notice(current_version, *, fetcher, cache_path, now, env)`**
  — returns an `UpdateNotice` only if PyPI has a strictly newer *stable* version.
  Skips when disabled (`_update_check_disabled`: `TAU_NO_UPDATE_CHECK` truthy or
  `CI` set), uses a 1-day cache, swallows *all* network/JSON/version errors
  (every failure path is a quiet `None`/`return None`) so startup never blocks.
- **`startup_release_notes_notice(current_version, *, state_path, release_notes)`**
  — on the first run it only records the version (no banner on fresh install);
  on later runs it diffs against the stored `last_seen_version` and returns
  `ReleaseNotesNotice` for entries between the two versions. All I/O failures are
  quiet no-ops.
- **`load_release_notes` / `release_notes_between`** — parse the bundled JSON
  and select entries with `previous < parsed <= current` (sorted).
- **`fetch_latest_pypi_version(*, fetcher)`** — prefers the max *stable* version
  from the `releases` map (skipping prereleases/devreleases and empty file
  lists), falling back to `info.version` when filtered out.
- **Cache/state I/O:** `_cached_update_check_result` (honors the 1-day interval),
  `_write_update_check_cache` / `_write_release_notes_state` (mkdir + write,
  `OSError` swallowed), `_read_last_seen_version`. `_stable_release_versions`
  filters pre/dev releases; `_httpx_fetch_json` wraps `tau_ai.http.get_json`.
- **`_update_check_disabled(env)`** — treats any non-empty, non-false
  `TAU_NO_UPDATE_CHECK` as disabled, and always disables under `CI`.
- **`_utc_now`** — injectable clock default.

> Design note: the *entire* module is written so that any failure (network,
> cache corruption, bad version string, missing file) degrades to "say nothing."
> That is the only acceptable behavior for a startup-time network call.

---

## `tau_coding/version.py` — version helper

A four-line module, but worth naming explicitly since everything above imports
it.

- **`_DISTRIBUTION_NAME = "tau-ai"`** — the *published* distribution name (the
  `tau_coding` import package is not what `importlib.metadata` reports).
- **`_UNKNOWN_VERSION = "0+unknown"`**.
- **`current_version()`** — returns `version("tau-ai")` from package metadata,
  or `_UNKNOWN_VERSION` if the distribution isn't installed (e.g. running from a
  source checkout). Used by `update_check.py` and the CLI `--version`.

> Design note: centralizing the distribution name + fallback here means the
> update checker, the CLI, and any "about" UI all report one consistent version
> string.

---

## How 3f fits the picture

- `thinking.py` — the shared vocabulary every provider/catalog/session layer
  uses for reasoning effort.
- `catalog_loader.py` — turns TOML data into validated `ProviderCatalogEntry`s;
  the source of truth for which providers/models exist.
- `branch_summary.py` — model-assisted context recovery when switching branches.
- `diagnostics.py` / `version.py` / `update_check.py` — operational
  observability + self-update, all best-effort and secret-free.
- `prompt_templates.py` / `reload.py` / `shell_config.py` — user-facing resource
  and settings systems, discovered through `TauResourcePaths` / `TauPaths`.
- `session_export.py` — a pure renderer from immutable `SessionEntry`s to shareable
  HTML/JSONL.

Next: **Part 3g** covers the rendering layer (`rendering/base.py`,
`rendering/transcript.py`) and the extension base (`extensions/base.py`) — the
pieces that turn session state into screen output and let third-party code plug
into Tau.

## 逐方法深度剖析（prompt_templates / reload / session_export / shell_config / update_check / version）

> 以下为 support-2 各组支撑模块的逐方法展开。

## 文件:prompt_templates.py

Markdown 提示模板的加载与渲染。依赖 `tau_coding.resources` 中的资源发现(路径集合、`parse_markdown_resource`、`derive_description`、`ResourceDiagnostic`、`ResourceError`)。

模块级常量:

- `_TEMPLATE_VARIABLE_RE = re.compile(r"{{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*}}")`
  匹配 `{{ variable }}` 形式的占位符,捕获组为变量名。全局唯一用于渲染与发现。

- `_ARGUMENT_TEMPLATE_VARIABLES = {"arguments", "args"}`
  约定模板中可接收命令参数的两个变量名集合。

### PromptTemplate

`@dataclass(frozen=True, slots=True)` — 一个 Markdown 提示模板资源。字段:

- `name: str` — 模板名,取 Markdown 文件名 stem(不含扩展名)。
- `path: Path` — 模板文件在磁盘上的完整路径。
- `content: str` — 解析后的模板正文(frontmatter 已被剥离)。
- `description: str | None = None` — 模板描述,来自 frontmatter 的 `description` 字段或正文首段派生。

### load_prompt_templates

```python
def load_prompt_templates(paths: TauResourcePaths | None = None) -> list[PromptTemplate]
```

作用:从 Tau 与 `.agents` 资源目录加载全部 Markdown 提示模板,返回按名称排序的列表。

步骤:
1. `resource_paths = paths or TauResourcePaths()` 取得资源路径集合。
2. 遍历 `resource_paths.prompts_dirs`(每个资源目录下的 prompts 目录),对每个目录调用 `_load_prompt_templates_from_dir`。
3. 以模板 `name` 为键放入 `templates_by_name` 字典(同名后者覆盖前者,但本函数不报诊断)。
4. 返回 `sorted(templates_by_name.values(), key=lambda template: template.name)`。

### load_prompt_templates_with_diagnostics

```python
def load_prompt_templates_with_diagnostics(paths: TauResourcePaths | None = None) -> tuple[list[PromptTemplate], list[ResourceDiagnostic]]
```

作用:同上加载,但额外收集非致命的发现诊断(供 UI/日志展示,不影响加载)。

步骤:
1. 初始化 `templates_by_name` 与 `diagnostics` 列表。
2. 遍历 `prompts_dirs`,对每个目录调用 `_load_prompt_templates_from_dir_with_diagnostics`,将目录诊断 `extend` 进 `diagnostics`。
3. 对每个模板,若该 `name` 已存在(`previous` 非 None),追加一条 `ResourceDiagnostic(kind="prompt", name, path, message="overrides lower-precedence resource at ...")`,说明发生覆盖。
4. 存入字典后返回 (排序模板列表, 诊断列表)。

### render_prompt_template

```python
def render_prompt_template(template: PromptTemplate, variables: Mapping[str, str], *, missing: str | None = None) -> str
```

作用:用 `{{ variable }}` 占位符渲染模板正文。

步骤:
1. 定义内部 `replace(match)`:取 `match.group(1)` 为变量名;`variables.get(name)`。
   - 若值为 None 且 `missing is None` → 抛 `ResourceError(f"Missing prompt template variable: {name}")`。
   - 若值为 None 且 `missing` 给定 → 返回 `missing` 兜底字符串。
   - 否则返回变量值。
2. `_TEMPLATE_VARIABLE_RE.sub(replace, template.content)` 完成替换并返回。

### expand_prompt_template_command

```python
def expand_prompt_template_command(text: str, templates: Sequence[PromptTemplate]) -> str | None
```

作用:把用户输入的 `/name [arguments]` 文本展开成渲染后的提示内容(供会话输入)。若无匹配模板返回 None(`session.py` 据此判断该输入是否就是模板调用)。

步骤:
1. `stripped = text.strip()`;若不以 `/` 开头、或以 `//` 开头、或以 `/skill:` 开头 → 返回 None(跳过命令/技能调用)。
2. `_parse_prompt_template_command(stripped)` 得到 `(name, args)`。
3. 若 `name` 为空返回 None。
4. `_find_prompt_template(name, templates)` 按名查找;找不到返回 None。
5. `render_prompt_template(template, {"arguments": args, "args": args}, missing="")`,参数以 `arguments`/`args` 两个变量暴露,缺失变量用空串兜底。
6. 若 `args` 非空且模板正文未引用 `arguments`/`args`(`_template_references_arguments` 为假) → 返回 `f"{rendered.rstrip()}\n\n{args}"`(参数追加在空行后);否则直接返回渲染结果。

### _template_references_arguments

```python
def _template_references_arguments(content: str) -> bool
```

作用:检测模板正文是否引用了 `arguments` 或 `args` 任一变量。
步骤:对 `_TEMPLATE_VARIABLE_RE.finditer(content)` 每个匹配,若捕获组在 `_ARGUMENT_TEMPLATE_VARIABLES` 中则返回 True;否则 False。

### _find_prompt_template

```python
def _find_prompt_template(name: str, templates: Sequence[PromptTemplate]) -> PromptTemplate | None
```

作用:按名(大小写不敏感、去掉前导 `/`)查找模板。
步骤:`normalized_name = name.strip().removeprefix("/").lower()`;遍历 `templates`,若 `template.name.lower() == normalized_name` 返回,否则 None。

### _parse_prompt_template_command

```python
def _parse_prompt_template_command(text: str) -> tuple[str, str]
```

作用:解析 `/name args` 文本。
步骤:`command, separator, args = text[1:].partition(" ")`(去掉前导 `/` 后按空格切);返回 `(command.strip().lower(), args.strip() if separator else "")`。

### _load_prompt_templates_from_dir

```python
def _load_prompt_templates_from_dir(prompts_dir: Path) -> list[PromptTemplate]
```

作用:从单个目录加载模板(严格版,遇到诊断即抛错)。
步骤:调用 `_load_prompt_templates_from_dir_with_diagnostics`;若 `diagnostics` 非空,取第一条抛 `ResourceError(first.message)`;否则返回模板列表。

### _load_prompt_templates_from_dir_with_diagnostics

```python
def _load_prompt_templates_from_dir_with_diagnostics(prompts_dir: Path) -> tuple[list[PromptTemplate], list[ResourceDiagnostic]]
```

作用:从单个目录加载模板并返回诊断(核心发现逻辑)。
步骤:
1. 若目录不存在或非目录 → 返回 `([], [])`。
2. 遍历 `sorted(prompts_dir.glob("*.md"), key=name)`(仅 `.md` 文件,按名排序)。
3. `name = path.stem`;若 `name in seen` → 追加 "Duplicate prompt template name ignored" 诊断并 `continue`。
4. 否则 `seen.add(name)` 并 `try: _load_prompt_template(name, path)`;捕获 `OSError`/`UnicodeDecodeError` → 追加 `severity="error"` 的诊断 "could not read prompt template: {exc}"。
5. 返回 (templates, diagnostics)。

### _load_prompt_template

```python
def _load_prompt_template(name: str, path: Path) -> PromptTemplate
```

作用:读取单个模板文件并构造 `PromptTemplate`。
步骤:`raw = path.read_text(encoding="utf-8")`;`metadata, content = parse_markdown_resource(raw)`(分割 frontmatter 与正文);`description = metadata.get("description") or derive_description(content)`;返回 `PromptTemplate(name, path, content, description)`。

### 主流程调用

- `session.py` 在初始化时调用 `load_prompt_templates_with_diagnostics` 加载会话的 `_prompt_templates`,同时收集诊断。
- 用户输入处理处(`session.py:1327` 判断是否模板调用,`session.py:1347` 在真正展开时)调用 `expand_prompt_template_command`,把 `/name args` 转换为注入会话的提示文本(相当于把用户自定义 prompt 模板注入到对话流)。
- `commands.py` 的 `/help` 输出展示 `Prompt templates: {len(session.prompt_templates)}`。

---

## 文件:reload.py

重载摘要类型定义。被 `/reload` 命令用来生成“资源重载前后变化”的 UI 摘要。注意:真实代码顶层定义名为 `ReloadCategorySummary` 与 `CodingReloadSummary`(并非任务描述的 `ReloadSummary`/`ReloadChange`),下面是真实结构。

### ReloadCategorySummary

```python
@dataclass(frozen=True, slots=True)
class ReloadCategorySummary:
    before: int
    after: int
    changed: bool
```

作用:记录某一类资源重载前后的数量状态。

字段:
- `before: int` — 重载前该类资源数量。
- `after: int` — 重载后该类资源数量。
- `changed: bool` — 数量或内容是否发生变化(由构造方 `session.py` 判定并填入)。

方法:

#### delta

```python
@property
def delta(self) -> int
```

作用:返回该类资源数量差值。实现:`return self.after - self.before`。

### CodingReloadSummary

```python
@dataclass(frozen=True, slots=True)
class CodingReloadSummary:
    skills: ReloadCategorySummary
    prompt_templates: ReloadCategorySummary
    context_files: ReloadCategorySummary
    extensions: ReloadCategorySummary
    diagnostics: ReloadCategorySummary
    system_prompt_rebuilt: bool
```

作用:一次本地 coding 资源重载的完整摘要。

字段(均为 `ReloadCategorySummary`,除最后一项):
- `skills` — 技能重载前后状态。
- `prompt_templates` — 提示模板重载前后状态。
- `context_files` — 项目上下文文件重载前后状态。
- `extensions` — 扩展重载前后状态。
- `diagnostics` — 资源诊断数量重载前后状态。
- `system_prompt_rebuilt: bool` — 系统提示是否因重载而被重建。

### 主流程调用

- `session.py:1089` 在重载逻辑中构造 `CodingReloadSummary(...)`,汇总各类资源的 before/after。
- `commands.py:757` 的 `format_reload_summary(summary)` 把该摘要格式化为多行文本(对每类调用 `_format_reload_category` 输出 `before→after (delta)` 形式),并提示 provider/model 设置需由 `/login`/`/model` 处理而非 `/reload`。
- 用户执行 `/reload`(`commands.py:482` `_reload_command`)仅置 `reload_requested=True`,由会话层执行实际重载并产出该摘要展示。

---

## 文件:session_export.py

会话导出工具:把 transcript 导出为自包含 HTML 或 JSONL,供人类阅读。依赖 `tau_agent.messages`(User/Assistant/ToolResult)与 `tau_agent.session`(各 Entry 类型、`path_to_entry`、`SessionTreeError`)以及 `pygments`(JSON 高亮)。

### SessionExportError

```python
class SessionExportError(ValueError)
```

作用:会话无法导出时抛出(继承自 `ValueError`)。

### default_session_export_path

```python
def default_session_export_path(session_path: Path) -> Path
```

作用:给定 JSONL 会话文件,返回默认 HTML 导出路径。实现:`session_path.with_suffix(".html")`(直接改扩展名)。

### default_session_export_artifact_path

```python
def default_session_export_artifact_path(session_path: Path, *, destination_dir: Path, format: str = "html") -> Path
```

作用:返回面向用户的默认导出产物路径(放入指定目标目录)。
步骤:`suffix = _export_suffix(format)`;返回 `destination_dir / f"{session_path.stem}{suffix}"`。

### export_session_jsonl

```python
def export_session_jsonl(entries: Sequence[SessionEntry], output_path: Path) -> Path
```

作用:把会话条目写回 JSONL 文件并返回路径。
步骤:`output_path.parent.mkdir(parents=True, exist_ok=True)`;将每条 `entry.model_dump_json()` 拼成行;`output_path.write_text("\n".join(lines) + ("\n" if lines else ""))`;返回 `output_path`。

### export_session_html

```python
def export_session_html(entries: Sequence[SessionEntry], output_path: Path, *, title: str = "Tau Session Export", source: str | None = None) -> Path
```

作用:写一份自包含 HTML 会话导出并返回路径。
步骤:确保父目录存在;调用 `render_session_html(entries, title=title, source=source)` 得到 HTML 字符串并写入;返回 `output_path`。

### export_session_artifact

```python
def export_session_artifact(entries: Sequence[SessionEntry], output_path: Path, *, title: str = "Tau Session Export", source: str | None = None, format: str | None = None) -> Path
```

作用:按请求或推断的格式写入会话导出(统一入口)。
步骤:`export_format = normalize_export_format(format or output_path.suffix.removeprefix("."))`;若 `"jsonl"` → `export_session_jsonl`;否则 `export_session_html`。

### normalize_export_format

```python
def normalize_export_format(value: str | None) -> str
```

作用:规范化导出格式名。
步骤:`normalized = (value or "html").strip().lower().removeprefix(".")`;在 `{"htm","html"}` 中返回 `"html"`;等于 `"jsonl"` 返回 `"jsonl"`;否则抛 `SessionExportError`。

### _export_suffix

```python
def _export_suffix(format: str) -> str
```

作用:根据格式返回文件后缀。
步骤:`".jsonl" if normalize_export_format(format) == "jsonl" else ".html"`。

### render_session_html

```python
def render_session_html(entries: Sequence[SessionEntry], *, title: str = "Tau Session Export", source: str | None = None) -> str
```

作用:把会话 transcript/树渲染为独立 HTML 字符串(核心渲染)。

步骤:
1. `entry_list = list(entries)`。
2. `active_leaf_id = _active_leaf_id(entry_list)`;`active_path_ids = _active_path_ids(entry_list, active_leaf_id)`。
3. `visible_entries = _visible_entries(entry_list)`(过滤 LeafEntry 指针)。
4. `tree_html = _render_tree(...)`;`details_html = _render_entry_details(...)`。
5. `source_html` 仅在 source 非空时生成 `<p class="source">`。
6. `generated_at = datetime.now(UTC).replace(microsecond=0).isoformat()`。
7. 返回一段内联 `<style>`(含 light/dark 配色变量、响应式两栏布局、`.highlight` 语法高亮配色)、`<header>`(标题 + 主题切换按钮 + 生成时间)、`<main>`(左侧树 `aside.tree-rail` + 右侧 `section.entry-stream` transcript)、底部 `<script>`(用 localStorage 持久化并切换 `data-theme`)的整页 HTML。所有动态文本经 `_escape`/`_attr` 转义。

### _visible_entries

```python
def _visible_entries(entries: Sequence[SessionEntry]) -> list[SessionEntry]
```

作用:过滤掉纯指针的 `LeafEntry`(其信息已由 active 样式表达,不单独成行)。实现:列表推导排除 `isinstance(entry, LeafEntry)`。

### _active_leaf_id

```python
def _active_leaf_id(entries: Sequence[SessionEntry]) -> str | None
```

作用:确定当前活动叶节点 id。
步骤:从后往前找首个 `LeafEntry` 取其 `entry_id`;若无 LeafEntry 且 `entries` 非空返回 `entries[-1].id`;都不满足返回 None。

### _active_path_ids

```python
def _active_path_ids(entries: list[SessionEntry], active_leaf_id: str | None) -> set[str]
```

作用:返回从根到活动叶的路径上所有节点 id 集合(用于高亮)。
步骤:若 `active_leaf_id is None` 返回空集;否则 `path_to_entry(entries, active_leaf_id)` 取路径,异常 `SessionTreeError` 时回退为 `{active_leaf_id}`。

### _render_tree

```python
def _render_tree(entries, active_path_ids, active_leaf_id) -> str
```

作用:渲染会话的导航树 HTML(`<ol class="tree">`)。

步骤:
1. 空 → 返回 `'<p class="empty">No entries.</p>'`。
2. 收集所有 `entry.id` 到 `entry_ids`;构建 `children_by_parent`(parent_id → 子列表)。
3. `roots` = parent_id 为 None 或不在 entry_ids 中的条目;若为空回退为全部条目。
4. 初始化 `rendered_ids`;对每个尚未渲染的 root 调 `_render_tree_chain` 生成顶层节点。
5. 对剩余未渲染条目(悬空/不可达)额外生成一段 “Unreachable entries” 分组节点。
6. 包成 `<ol class="tree">`。

### _render_tree_chain

```python
def _render_tree_chain(start, children_by_parent, active_path_ids, active_leaf_id, *, ancestors, rendered_ids) -> str
```

作用:把 `start` 及其“单一子节点链”渲染为同一层级的 `<li>`,仅在真正分叉(子节点 >1)处引入嵌套 `<ol>`(避免历史直线被逐层嵌套)。

步骤:
1. `chain` 累积直线序列;`current=start`;循环:把当前加入 `rendered_ids`/`chain`/`chain_ancestors`;取筛选后的(排除祖先)子节点。
2. 若恰好 1 个子节点 → 继续沿链;否则 `fork_children=children`,`current=None` 结束。
3. 对每个 chain 节点生成 `<li>`:末节点若有 `fork_children` 则递归渲染嵌套 `<ol class="tree">`;调用 `_render_tree_node`。

### _render_tree_node

```python
def _render_tree_node(entry, nested_html, active_path_ids, active_leaf_id) -> str
```

作用:渲染单个树节点 `<li>`。
步骤:`classes=["tree-node"]`;在 `active_path_ids` 中加 `"active-path"`;等于 `active_leaf_id` 加 `"active-leaf"`;`summary = _entry_summary(entry)`;`label = "标题: 摘要"` 或仅标题;返回含 `href="#entry-..."`、`_entry_icon`、`_escape(label)` 的 `<li>` + `nested_html`。

### _render_entry_details

```python
def _render_entry_details(entries, active_path_ids, active_leaf_id) -> str
```

作用:渲染右侧 transcript 明细。空 → 返回空提示 `<article>`;否则对 `enumerate(entries, start=1)` 逐个调 `_render_entry_detail` 拼接。

### _render_entry_detail

```python
def _render_entry_detail(index, entry, active_path_ids, active_leaf_id) -> str
```

作用:渲染单条 entry 的 `<article>` 卡片。

步骤:
1. `classes=["entry-card"]`;`status_bits` 记录 "active path"/"active leaf"(由 id 匹配)。
2. 若有状态 → 加 `"active-entry"`;`status_html` 为状态徽标。
3. `body = _render_entry_body(entry)`。
4. 返回 `<article id="entry-{id}">` 含 `entry-index`(序号 + 标题 + 状态)、`<dl>` 元信息(id/parent/timestamp)、`body`。

### _render_entry_body

```python
def _render_entry_body(entry: SessionEntry) -> str
```

作用:按 entry 类型分发渲染主体。

- `MessageEntry` → `_render_message_entry`。
- `ModelChangeEntry` → “Model changed to `<code>model</code>`.”
- `ThinkingLevelChangeEntry` → “Thinking level changed to `<level>`/off.”
- `CompactionEntry` → 压缩摘要 `<pre>` + `_render_list('Replaces entries', replaces_entry_ids)`。
- `BranchSummaryEntry` → 分支根 + 摘要 `<pre>`。
- `LabelEntry` → 会话标签。
- `LeafEntry` → 活动叶指针 id。
- `SessionInfoEntry` → 标题/工作目录/创建时间。
- `CustomEntry` → 命名空间 + `_render_json_block(data)`。
- 其它 → `entry.model_dump_json(indent=2)` 包 `<pre>`。

### _render_message_entry

```python
def _render_message_entry(entry: MessageEntry) -> str
```

作用:渲染消息条目主体。

- `UserMessage` → 角色行(user 图标)+ 内容 `<pre>`。
- `AssistantMessage` → 若有 `tool_calls` 生成 “Tool calls” `<ul>`(每个调用名/id + `_render_json_block(arguments)`);内容 `<pre>`(无文本时 "(no assistant text)")。
- `ToolResultMessage` → 角色行 + `_render_metadata([("tool",name),("tool_call_id",...),("ok",...),可选("error",...)])` + 内容 `<pre>`;若有 `data`/`details` 各加一个 JSON 块。
- 其它消息 → 兜底 `model_dump_json` `<pre>`。

### _render_metadata

```python
def _render_metadata(items: Iterable[tuple[str, str]]) -> str
```

作用:把键值对渲染为 `<dl class="entry-meta">`。对每项输出 `<dt>key</dt><dd><code>value</code></dd>`(均转义)。

### _render_list

```python
def _render_list(title: str, values: Sequence[str]) -> str
```

作用:渲染一个标题 + 无序列表。空 `values` → `""`;否则 `<h4>title</h4><ul><li><code>v</code></li>...</ul>`。

### _entry_icon

```python
def _entry_icon(entry: SessionEntry) -> str
```

作用:返回对应类型的 SVG 图标常量字符串。

映射:
- `MessageEntry`:按 User/Assistant/ToolResult 分别返回 `_ICON_USER`/`_ICON_ASSISTANT`/`_ICON_TOOL`,其它 `_ICON_GENERIC`。
- `ModelChangeEntry | ThinkingLevelChangeEntry` → `_ICON_MODEL`。
- `CompactionEntry | BranchSummaryEntry` → `_ICON_BRANCH`。
- `LabelEntry` → `_ICON_LABEL`。
- `SessionInfoEntry` → `_ICON_INFO`。
- 其它 → `_ICON_GENERIC`。

### _entry_parent_html

```python
def _entry_parent_html(entry: SessionEntry) -> str
```

作用:渲染父节点链接。若 `parent_id is None` → `<span class="empty">root</span>`;否则 `<a href="#entry-{parent_id}"><code>parent_id</code></a>`。

### _entry_title

```python
def _entry_title(entry: SessionEntry) -> str
```

作用:返回条目展示标题。消息取 `role`;各类型有可读标题(如 "model change"、"compaction"、"label"、"leaf pointer"、"custom:namespace");其它回退 `entry.type`。

### _entry_summary

```python
def _entry_summary(entry: SessionEntry) -> str
```

作用:返回条目在树中的单行摘要文本。

- `ToolResultMessage` → `"{name}: {摘要内容}"`。
- `AssistantMessage` 有 tool_calls → `"{摘要文本} [{tool_names}]"`(无文本用 "tool call")。
- 普通消息 → `_summarize_text(content)`。
- `ModelChange/ThinkingLevel/Branch/Compaction/Label/Leaf/SessionInfo/Custom` 各有各自字段摘要。
- 其它 → `entry.id`。

### _summarize_text

```python
def _summarize_text(text: str, *, limit: int = 92) -> str
```

作用:压缩文本为单行摘要。步骤:`" ".join(text.split())` 折叠空白;长度 ≤ limit 原样返回;否则 `[:limit-3].rstrip() + "..."`。

### _json_dump

```python
def _json_dump(value: dict[str, JSONValue]) -> str
```

作用:把 dict 序列化为缩进 2、key 排序的 JSON 字符串:`json.dumps(value, indent=2, sort_keys=True)`。

### _render_json_block

```python
def _render_json_block(value: dict[str, JSONValue]) -> str
```

作用:渲染带语法高亮的 JSON `<pre>`。
步骤:`source = _json_dump(value)`;尝试 `highlight(source, _JSON_LEXER, _HIGHLIGHT_FORMATTER)`;失败(任意异常)回退 `<pre>{_escape(source)}</pre>`;成功返回 `<pre class="highlight">{highlighted}</pre>`。模块级 `_JSON_LEXER = JsonLexer()`、`_HIGHLIGHT_FORMATTER = HtmlFormatter(nowrap=True)`。

### _format_timestamp

```python
def _format_timestamp(timestamp: float) -> str
```

作用:把浮点时间戳转 UTC、去微秒的 ISO 字符串:`datetime.fromtimestamp(timestamp, tz=UTC).replace(microsecond=0).isoformat()`。

### _escape

```python
def _escape(value: object) -> str
```

作用:HTML 转义(文本节点),`html.escape(str(value), quote=False)`。

### _attr

```python
def _attr(value: object) -> str
```

作用:HTML 转义(属性值,含引号),`html.escape(str(value), quote=True)`。

### 图标常量(_ICON_*)

模块中以 SVG 字符串定义的图标:`_ICON_USER`、`_ICON_ASSISTANT`、`_ICON_TOOL`、`_ICON_BRANCH`、`_ICON_LABEL`、`_ICON_INFO`、`_ICON_MODEL`、`_ICON_GENERIC`、`_ICON_SUN`、`_ICON_MOON`,供树/卡片/主题按钮使用。

### 主流程调用

- `session.py:596` 在导出逻辑中调用 `export_session_artifact(..., title=_session_export_title(self))` 完成导出;`session.py:2141`、`2152`、以及 `cli.py:49-51` 的 `export_session_command` 使用 `default_session_export_artifact_path` 计算输出路径。
- `cli.py` 的 `export` 子命令据此导出 HTML/JSONL 文件,是“会话归档/分享”功能的底层实现。

---

## 文件:shell_config.py

持久化 shell 执行设置(如命令前缀)。依赖 `tau_coding.paths.TauPaths`。

### ShellConfigError

```python
class ShellConfigError(ValueError)
```

作用:当 shell 设置无效时抛出(继承 `ValueError`)。

### ShellSettings

```python
@dataclass(frozen=True, slots=True)
class ShellSettings:
    shell_command_prefix: str | None = None
```

作用:从 Tau home 加载的 shell 执行设置。

字段:
- `shell_command_prefix: str | None = None` — 在每条终端命令前插入的前缀(如环境切换命令),None 表示不添加。

方法:

#### to_json

```python
def to_json(self) -> dict[str, str]
```

作用:序列化为 JSON 兼容 dict。若 `shell_command_prefix is None` 返回 `{}`;否则 `{"shellCommandPrefix": prefix}`。

### shell_settings_path

```python
def shell_settings_path(paths: TauPaths | None = None) -> Path
```

作用:返回持久化设置文件路径:`(paths or TauPaths()).home / "settings.json"`。

### load_shell_settings

```python
def load_shell_settings(paths: TauPaths | None = None) -> ShellSettings
```

作用:加载持久化 shell 设置,失败回退默认。

步骤:
1. `path = shell_settings_path(paths)`。
2. 文件不存在 → 返回 `ShellSettings()`(默认空)。
3. `try: raw = loads(path.read_text(...))`,`JSONDecodeError` → 抛 `ShellConfigError("Shell settings are not valid JSON")`。
4. 若 `raw` 非 dict → 抛 `ShellConfigError("Shell settings must be a JSON object")`。
5. `shell_settings_from_json(raw)` 解析并返回。

### shell_settings_from_json

```python
def shell_settings_from_json(data: dict[str, Any]) -> ShellSettings
```

作用:从 dict 解析 shell 设置。

步骤:
1. `allowed_fields = {"shellCommandPrefix", "shell_command_prefix"}`;未知字段 → 抛 `ShellConfigError("Unknown shell settings field: ...")`。
2. 同时含 camelCase 与 snake_case 两种写法 → 抛 `ShellConfigError("Use only one of ...")`。
3. `raw_prefix = data.get("shellCommandPrefix", data.get("shell_command_prefix"))`;为 None → `ShellSettings()`。
4. 非 str → 抛 `ShellConfigError("shellCommandPrefix must be a string")`。
5. `prefix = raw_prefix.strip()`;返回 `ShellSettings(shell_command_prefix=prefix or None)`(空串视为 None)。

### 主流程调用

- `cli.py:55` 导入 `load_shell_settings`;在启动/命令执行时读取 `shell_command_prefix`,用于在运行终端命令前注入用户配置的前缀(例如 conda/venv 激活),是实现“持久化 shell 前缀设置”的读写基础。注意:本文件只提供 `load`/`from_json`/`to_json`/`path`,实际 `save` 由上层负责序列化(通过 `to_json` + `settings.json` 写入)。

---

## 文件:update_check.py

best-effort 的 PyPI 更新检查与发布说明提示。网络/缓存失败一律静默,绝不阻塞启动。依赖 `packaging.version` 与 `tau_ai.http.get_json`、`tau_coding.paths.TauPaths`。

模块常量:
- `PYPI_PACKAGE_NAME = "tau-ai"`,`PYPI_JSON_URL = "https://pypi.org/pypi/tau-ai/json"`。
- `UPDATE_CHECK_INTERVAL = timedelta(days=1)` — 缓存有效窗口。
- `UPDATE_CHECK_TIMEOUT_SECONDS = 1.5` — 网络超时。
- `UPDATE_CHECK_ENV_DISABLE = "TAU_NO_UPDATE_CHECK"` — 禁用环境变量名。
- `RELEASE_NOTES_STATE_FILENAME = "release-notes-state.json"`。
- `RELEASE_NOTES_PATH = Path(__file__).resolve().parent / "data" / "release-notes" / "releases.json"` — 内置发布说明。
- 类型别名 `Fetcher = Callable[[str, float], dict[str, Any]]`(URL+超时→JSON)、`Clock = Callable[[], datetime]`。

### UpdateNotice

```python
@dataclass(frozen=True, slots=True)
class UpdateNotice:
    current_version: str
    latest_version: str
    package_name: str = PYPI_PACKAGE_NAME
```

作用:面向用户的更新提示。

字段:
- `current_version: str` — 已安装版本。
- `latest_version: str` — PyPI 最新版本。
- `package_name: str = PYPI_PACKAGE_NAME` — 包名,默认 tau-ai。

方法:

#### message

```python
@property
def message(self) -> str
```

作用:返回简要更新指引:`f"Tau {latest} is available (installed: {current}). Update with: uv tool upgrade {package_name}"`。

### UpdateCheckResult

```python
@dataclass(frozen=True, slots=True)
class UpdateCheckResult:
    checked_at: datetime
    latest_version: str | None
```

作用:缓存用的最新版本查询结果。

字段:
- `checked_at: datetime` — 检查时间。
- `latest_version: str | None` — 查询结果(可能为 None 表示查不到)。

### ReleaseNoteSection

```python
@dataclass(frozen=True, slots=True)
class ReleaseNoteSection:
    title: str
    items: tuple[str, ...]
```

作用:发布说明中的一个命名小节。

字段:
- `title: str` — 小节标题(如 “Features”)。
- `items: tuple[str, ...]` — 该小节要点文本元组。

### ReleaseNotesEntry

```python
@dataclass(frozen=True, slots=True)
class ReleaseNotesEntry:
    version: str
    date: str | None
    sections: tuple[ReleaseNoteSection, ...]
```

作用:单个 Tau 版本的发布说明结构。

字段:
- `version: str` — 版本号。
- `date: str | None` — 发布日期(可能无)。
- `sections: tuple[ReleaseNoteSection, ...]` — 各小节。

方法:

#### transcript_items

```python
@property
def transcript_items(self) -> tuple[str, ...]
```

作用:把各 section 的 items 展平为一维元组(`(item for section in sections for item in section.items)`),供紧凑展示。

### ReleaseNotesNotice

```python
@dataclass(frozen=True, slots=True)
class ReleaseNotesNotice:
    current_version: str
    previous_version: str
    entries: tuple[ReleaseNotesEntry, ...]
```

作用:安装在更新后“仅展示一次”的发布说明。

字段:
- `current_version: str` — 当前(新)版本。
- `previous_version: str` — 上一可见版本。
- `entries: tuple[ReleaseNotesEntry, ...]` — 介于两者之间的发布说明。

方法:

#### notes

```python
@property
def notes(self) -> tuple[str, ...]
```

作用:扁平化所有 entry 的所有 items。

#### message

```python
@property
def message(self) -> str
```

作用:生成紧凑 markdown 块。有 entries 时逐条 `_format_entry` 并用空行连接;无则 `("- See the changelog for details.")`;整体 `f"Tau updated to {current}\n\n{body}"`。

#### _format_entry

```python
def _format_entry(self, entry: ReleaseNotesEntry) -> str
```

作用:把一个 entry 渲染为 `**标题**\n- item...` 的小节块拼接。

### startup_update_notice

```python
def startup_update_notice(current_version, *, fetcher=None, cache_path=None, now=None, env=None) -> UpdateNotice | None
```

作用:启动时有 PyPI 更新则返回提示(全静默 best-effort)。

步骤:
1. `environment = environ if env is None else env`;`_update_check_disabled(environment)` 为真 → None。
2. `current_time = (now or _utc_now)()`。
3. `_cached_update_check_result(cache_path, current_time)`:若缓存失效/过期则 `try: fetch_latest_pypi_version(fetcher=fetcher)`(异常 → 返回 None),并 `_write_update_check_cache`。
4. `latest_version is None` → None。
5. `try: Version(latest) <= Version(current)` → 无更新返回 None;`InvalidVersion` → None。
6. 返回 `UpdateNotice(current_version, latest_version)`。

### startup_release_notes_notice

```python
def startup_release_notes_notice(current_version, *, state_path=None, release_notes=None) -> ReleaseNotesNotice | None
```

作用:版本变更后仅展示一次发布说明(首次运行只记录版本,不弹窗)。

步骤:
1. `path = state_path or default_release_notes_state_path()`。
2. `try: previous_version = _read_last_seen_version(path)`,异常 → None。
3. `_write_release_notes_state(path, current_version)` 写入当前版本。
4. `previous_version is None` → 返回 None(新装,不提示)。
5. `Version(current) <= Version(previous)` → None(未升级)。
6. `release_notes is None` 时 `try: load_release_notes()`,异常 → `()`。
7. `release_notes_between(previous, current, release_notes)` 取中间版本,返回 `ReleaseNotesNotice(...)`。

### load_release_notes

```python
def load_release_notes(path: Path | None = None) -> tuple[ReleaseNotesEntry, ...]
```

作用:从内置 JSON 加载发布说明。步骤:`json.loads((path or RELEASE_NOTES_PATH).read_text(...))`;非 list → 抛 `ValueError`;逐条 `_parse_release_notes_entry` 成元组。

### release_notes_between

```python
def release_notes_between(previous_version, current_version, release_notes) -> tuple[ReleaseNotesEntry, ...]
```

作用:返回比 previous 新、不超过 current 的发布说明条目。

步骤:`try` 解析 previous/current 为 `Version`,失败返回 `()`;遍历 `release_notes`,跳过解析失败的 `entry.version`,收集满足 `previous < parsed <= current` 的 entry;按版本排序返回。

### fetch_latest_pypi_version

```python
def fetch_latest_pypi_version(*, fetcher: Fetcher | None = None) -> str | None
```

作用:从 PyPI 取最新稳定版字符串。

步骤:`data = (fetcher or _httpx_fetch_json)(PYPI_JSON_URL, UPDATE_CHECK_TIMEOUT_SECONDS)`。
1. 若 `data["releases"]` 是 dict → `_stable_release_versions(releases)` 取稳定版本,非空返回 `str(max(versions))`。
2. 否则若 `data["info"]["version"]` 是字符串且非预发布/非 dev → 返回该版本。
3. 都不满足返回 None。

### default_update_check_cache_path

```python
def default_update_check_cache_path(paths: TauPaths | None = None) -> Path
```

作用:`(paths or TauPaths()).home / "cache" / "update-check.json"`。

### default_release_notes_state_path

```python
def default_release_notes_state_path(paths: TauPaths | None = None) -> Path
```

作用:`(paths or TauPaths()).home / "cache" / RELEASE_NOTES_STATE_FILENAME`。

### _parse_release_notes_entry

```python
def _parse_release_notes_entry(data: Any) -> ReleaseNotesEntry
```

作用:校验并解析单个发布说明 JSON 对象。步骤:校验为 dict、含 str 的 `version`、可选 str 的 `date`、`sections` 为 dict;逐 section 校验 title 为 str、items 为 str 列表;返回 `ReleaseNotesEntry(...)`。

### _stable_release_versions

```python
def _stable_release_versions(releases: dict[Any, Any]) -> list[Version]
```

作用:从 releases 映射筛出稳定(非预发布/非 dev)版本对象列表。步骤:跳过非 str 版本、空 files 列表;解析失败或预发布/dev 跳过;收集 `Version` 对象。

### _httpx_fetch_json

```python
def _httpx_fetch_json(url: str, timeout_seconds: float) -> dict[str, Any]
```

作用:实际网络获取(JSON dict)。步骤:`get_json(url, timeout=timeout_seconds, follow_redirects=True)`;非 dict → 抛 `ValueError`。

### _cached_update_check_result

```python
def _cached_update_check_result(cache_path: Path | None, now: datetime) -> UpdateCheckResult | None
```

作用:读取并校验缓存;过期或损坏返回 None。步骤:`try` 读 JSON → `_parse_cached_result`;任意异常 → None;若 `now - result.checked_at > UPDATE_CHECK_INTERVAL` → None;否则返回 result。

### _parse_cached_result

```python
def _parse_cached_result(data: Any) -> UpdateCheckResult
```

作用:解析缓存 dict。校验为 dict、含 str `checked_at`、可选 str `latest_version`;用 `datetime.fromisoformat` 解析,无时区则补 UTC;返回 `UpdateCheckResult(...)`。

### _write_update_check_cache

```python
def _write_update_check_cache(cache_path, checked_at, latest_version) -> None
```

作用:写入缓存 JSON(`checked_at`(转 UTC ISO)、`latest_version`)。`OSError` 静默忽略。

### _read_last_seen_version

```python
def _read_last_seen_version(path: Path) -> str | None
```

作用:从发布说明状态文件读 `last_seen_version`(校验为 dict、可选 str)。

### _write_release_notes_state

```python
def _write_release_notes_state(path: Path, current_version: str) -> None
```

作用:写 `{last_seen_version: current_version}` 到状态文件。`OSError` 静默忽略。

### _update_check_disabled

```python
def _update_check_disabled(env: Mapping[str, str]) -> bool
```

作用:判断是否禁用检查。步骤:`value = env.get("TAU_NO_UPDATE_CHECK")`;若 value 非空且非 {"", "0", "false", "no"} → True;否则返回 `bool(env.get("CI"))`(CI 环境下禁用)。

### _utc_now

```python
def _utc_now() -> datetime
```

作用:`datetime.now(UTC)` 时钟实现。

### 主流程调用

- `cli.py:60-61` 导入 `startup_update_notice`/`startup_release_notes_notice`,`cli.py:63` 导入 `current_version`;启动流程(`cli.py:234` 取 `current_version`;约 `cli.py:290` 调 `_startup_update_notice()`)在每次启动时静默检查更新与发布说明,只在有更新/升级时打印提示,网络/缓存/解析失败全程静默不影响启动。

---

## 文件:version.py

包版本获取工具。

模块常量:
- `_DISTRIBUTION_NAME = "tau-ai"` — 查询的发行包名。
- `_UNKNOWN_VERSION = "0+unknown"` — 未安装时的兜底版本。

### current_version

```python
def current_version() -> str
```

作用:从包元数据返回已安装的 Tau 版本。
步骤:`try: return version(_DISTRIBUTION_NAME)`(`importlib.metadata.version`);`except PackageNotFoundError: return _UNKNOWN_VERSION`。

### 主流程调用

- `cli.py:63` 以 `current_version as _current_version` 导入;用于 `--version`/启动横幅(`cli.py:236` 打印 `tau {current_version}`),并作为 `startup_update_notice`/`startup_release_notes_notice` 的 `current_version` 入参,是更新检查与发布说明比较的基准版本来源。

---

<!-- NAV -->
[← tau_coding · 支撑模块(一)]({{< relref "./coding-support-1.md" >}})
[↑ 总览]({{< relref "./source-walkthrough.md" >}})
[→ tau_coding · 渲染层]({{< relref "./coding-rendering.md" >}})
