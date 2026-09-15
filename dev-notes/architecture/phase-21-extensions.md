---
title: "Phase 21: Extensions / 阶段 21:扩展"
---

[原文]
Tau extensions are Python modules that customize a coding session: they add
tools and slash commands, observe the agent event stream, and intercept tool
calls, tool results, and user input. The design is a deliberate port of Pi's
extension system (`packages/coding-agent/src/core/extensions/` in
`earendil-works/pi`) onto Tau's Python architecture, scoped so the core is
small while still supporting real extensions such as a Claude Code-style
subagents extension.

[译文]
Tau 扩展(extension)是用于定制编码会话的 Python 模块:它们可以添加工具与斜杠命令、观察 agent 事件流,并拦截工具调用、工具结果与用户输入。该设计是把 Pi 的扩展系统(`earendil-works/pi` 中的 `packages/coding-agent/src/core/extensions/`)有意移植到 Tau 的 Python 架构之上,并控制好作用范围:既让内核保持小巧,又能支撑真实扩展,例如 Claude Code 风格的子代理(subagents)扩展。

[原文]
This design was revised after an adversarial review; the notable v1 rulings
are called out inline as **Ruling:** notes.

[译文]
该设计经过一轮对抗式评审后被修订;v1 中值得注意的裁定以 **Ruling(裁定):** 注释的形式内联标出。

## 目标(Goals)

[原文]
- Load extensions from user and project directories with the same discovery
  conventions as skills and prompt templates.
- Give extensions a single `ExtensionAPI` object with Pi-aligned naming:
  `register_tool`, `register_command`, `on(event)`, `send_user_message`,
  `append_entry`, and read access to session context.
- Support Pi's load-bearing hook semantics: `tool_call` (block/mutate),
  `tool_result` (transform), `input` (transform/handle), plus observation of
  every portable `AgentEvent`.
- Keep `tau_agent` untouched: the extension machinery lives entirely in
  `tau_coding`, using existing seams (`AgentHarness.subscribe`, executor
  wrapping, `CommandRegistry`, `CustomEntry`).
- Isolate failures: a broken extension is a `ResourceDiagnostic`, never a
  crashed session.

[译文]
- 用与技能、提示词模板相同的发现约定,从用户目录与项目目录加载扩展。
- 为扩展提供唯一的 `ExtensionAPI` 对象,命名与 Pi 对齐:`register_tool`、`register_command`、`on(event)`、`send_user_message`、`append_entry`,以及对会话上下文的只读访问。
- 支持 Pi 那些承重的钩子语义:`tool_call`(阻止/修改)、`tool_result`(转换)、`input`(转换/处理),并观察所有可移植的 `AgentEvent`。
- 保持 `tau_agent` 不被触及:扩展机制完全位于 `tau_coding`,复用既有的接缝(`AgentHarness.subscribe`、执行器包裹、`CommandRegistry`、`CustomEntry`)。
- 隔离故障:坏掉的扩展只会变成一条 `ResourceDiagnostic`,绝不会让会话崩溃。

## 非目标,本阶段 / Non-goals (this phase)

[原文]
- npm-style package management (`pi install`), provider registration,
  custom TUI components/widgets (extension-authored Textual widgets),
  custom **entry** renderers (`registerEntryRenderer`/`appendEntry`-rendered,
  non-LLM-context cards), shortcut and flag registration, system-prompt
  replacement, `context`/`before_provider_request` rewriting, and a project
  trust store.
  These have reserved names and documented extension points but no
  implementation yet.

[译文]
- npm 风格的包管理(`pi install`)、provider 注册、自定义 TUI 组件/控件(由扩展编写的 Textual 组件)、自定义**条目(entry)**渲染器(`registerEntryRenderer`/由 `appendEntry` 渲染的、不进入 LLM 上下文的卡片)、快捷键与 flag 注册、系统提示词替换、`context`/`before_provider_request` 重写,以及项目信任存储。
  这些保留了名称与文档化的扩展点,但尚无实现。

[原文]
  **Implemented since:** custom **message** renderers
  (`register_message_renderer` + `send_custom_message`) — the subset of Pi's
  renderer surface that formats messages which *do* participate in LLM context
  (see "Custom message rendering" below) — and extension-authored **component
  widgets** (`context.ui.components`: slot widgets, a main-area view, and
  pre-dispatch key interceptors), adopted as the committed design via the
  component-seam experiment (see the superseding Ruling under "Custom message
  rendering" and `dev-notes/design/component-seam-experiment.md`), plus
  host-framed **sidebar sections** (`context.ui.sidebar`) whose stable keys are
  isolated by extension ownership. Custom entry renderers remain out of scope.

[译文]
  **此后已实现:** 自定义**消息**渲染器(`register_message_renderer` + `send_custom_message`)—— 这是 Pi 渲染面中负责格式化「确实参与 LLM 上下文」的消息的那一子集(见下文「自定义消息渲染」);以及由扩展编写的**组件控件**(`context.ui.components`:槽位组件、主区域视图与分发前的按键拦截器),它们通过组件接缝实验被采纳为既定设计(见「自定义消息渲染」下取而代之的裁定,以及 `dev-notes/design/component-seam-experiment.md`);此外还有由宿主框定的**侧边栏区块**(`context.ui.sidebar`),其稳定键按扩展所有权相互隔离。自定义条目渲染器仍不在范围内。

[原文]
When any of these lands, design it from Pi's implementation first
(`packages/coding-agent/src/core/extensions/` and `docs/extensions.md` in
`earendil-works/pi`) and port that design — names, semantics, event shapes —
unless a strictly better way exists. Deviations get a **Ruling:** note with
the reason, like the ones below.

[译文]
当其中任何一项落地时,先以 Pi 的实现为蓝本(`earendil-works/pi` 中的 `packages/coding-agent/src/core/extensions/` 与 `docs/extensions.md`),再移植那套设计 —— 名称、语义、事件形态 —— 除非存在严格更优的方案。偏离之处要附一条带原因的 **Ruling(裁定):** 注释,如下文所示。

## 发现与加载(Discovery and loading)

[原文]
Extension locations, in load order (first-registered wins on name conflicts,
matching Pi's project-first precedence — note this deliberately diverges from
skills/prompts, which use last-wins precedence):

[译文]
扩展位置按加载顺序如下(名称冲突时先注册者胜,与 Pi 的「项目优先」一致 —— 注意这有意不同于技能/提示词的「后加载者胜」):

[原文]
1. `<cwd>/.tau/extensions/` — project extensions (**off by default**, see
   Security)
2. `~/.tau/extensions/` — user extensions
3. Paths passed explicitly (`tau --extension/-e PATH`, repeatable; a file or
   a directory)

[译文]
1. `<cwd>/.tau/extensions/` —— 项目扩展(**默认关闭**,见「安全」)
2. `~/.tau/extensions/` —— 用户扩展
3. 显式传入的路径(`tau --extension/-e PATH`,可重复;可以是文件或目录)

[原文]
Within a directory, one level deep, matching Pi:

[译文]
在一个目录内,只扫描一层,与 Pi 一致:

[原文]
- `*.py` files are extension modules
- a subdirectory containing `extension.py` is an extension (the analog of
  Pi's `index.ts` convention)
- a directory (subdirectory or explicit `-e` path) whose `pyproject.toml`
  declares `[tool.tau] extensions = ["src/pkg/extension.py", ...]` loads the
  declared entries instead — the analog of Pi's `package.json`
  `pi.extensions` manifest ("complex packages must use package.json
  manifest"), so src-layout repos need no root shim

[译文]
- `*.py` 文件即扩展模块
- 包含 `extension.py` 的子目录是一个扩展(对应 Pi 的 `index.ts` 约定)
- 若某个目录(子目录或显式的 `-e` 路径)的 `pyproject.toml` 声明了 `[tool.tau] extensions = ["src/pkg/extension.py", ...]`,则改为加载所声明的入口 —— 对应 Pi 的 `package.json` 中 `pi.extensions` 清单(「复杂包必须使用 package.json 清单」),这样采用 src-layout 的仓库无需在根目录放垫片文件

[原文]
Names starting with `_` or `.` are skipped. Symlinked files are followed.

[译文]
以 `_` 或 `.` 开头的名称会被跳过。符号链接文件会被跟随。

[原文]
**Ruling:** the manifest lives under `[tool.tau]` in `pyproject.toml` — the
Python-ecosystem home for tool config — rather than a bespoke manifest file.
It takes precedence over a sibling `extension.py` (Pi's order); each declared
entry loads as a package rooted at the entry's parent directory (siblings
stay relatively importable — the manifest's whole purpose is structured
layouts), named after that parent (or the file stem when the entry is not
`extension.py`). Deviation from Pi: a declared-but-missing entry emits an
`error` diagnostic instead of being silently skipped — a manifest is an
explicit claim, and Tau already surfaces discovery diagnostics. A manifest
that yields no usable entries falls back to the `extension.py` convention;
an unparseable `pyproject.toml` is a `warning` (scanned directories may
contain unrelated projects). Declared paths are not confined to the manifest
directory (Pi parity: `path.resolve(dir, extPath)`) — extensions execute
arbitrary code anyway, so path containment would be security theater.

[译文]
**Ruling(裁定):** 清单位于 `pyproject.toml` 的 `[tool.tau]` 之下 —— 这是 Python 生态中工具配置的惯例位置 —— 而不是另设一个专用清单文件。它的优先级高于同级的 `extension.py`(Pi 的顺序);每个声明的入口都作为一个「以该入口父目录为根」的包来加载(同级模块保持可通过相对导入访问 —— 清单的全部意义就在于结构化布局),包名取自该父目录(当入口不是 `extension.py` 时则取文件主名)。与 Pi 的偏离:声明了却缺失的入口会发出 `error` 诊断,而不是被静默跳过 —— 清单是一种显式声明,而且 Tau 本来就会呈现发现诊断。若清单没有产出任何可用入口,则回退到 `extension.py` 约定;无法解析的 `pyproject.toml` 记为 `warning`(被扫描的目录里可能只是无关项目)。声明的路径不限于清单所在目录(Pi 对齐:`path.resolve(dir, extPath)`)—— 扩展本来就会执行任意代码,因此做路径围栏只是安全表演。

[原文]
Each module is imported with `importlib` under a unique synthetic module name
(`tau_extension_<slug>_<n>`), so project and user extensions with the same
file name cannot collide in `sys.modules`. Directory extensions are imported
as real packages (`submodule_search_locations` set to the directory), so
sibling modules are reached with relative imports (`from . import helper`)
and land in `sys.modules` under the synthetic namespace. **Ruling:** the
loader does not touch `sys.path`; absolute intra-extension imports are
unsupported, which keeps helpers reload-safe and collision-free.

[译文]
每个模块都以 `importlib` 在一个唯一的合成模块名(`tau_extension_<slug>_<n>`)下导入,因此项目扩展与用户扩展即使文件名相同,也不会在 `sys.modules` 中冲突。目录式扩展会作为真正的包导入(`submodule_search_locations` 指向该目录),因此同级模块可以通过相对导入访问(`from . import helper`),并在合成命名空间下进入 `sys.modules`。**Ruling(裁定):** 加载器不触碰 `sys.path`;不支持扩展内部的绝对导入,这使辅助模块在 reload 时保持安全且无冲突。

[原文]
The module must define:

[译文]
模块必须定义:

```python
def setup(tau: ExtensionAPI) -> None: ...
```

[原文]
**Ruling:** `setup` is sync-only in v1 (a coroutine-function `setup` is a
load error). This keeps discovery callable from the sync `/reload` path.
Import errors, a missing `setup`, and exceptions raised by `setup` are
captured as `ResourceDiagnostic` (`kind="extension"`, `severity="error"`)
and the extension is skipped.

[译文]
**Ruling(裁定):** v1 中 `setup` 只能是同步的(coroutine 函数形式的 `setup` 会导致加载错误)。这保证发现过程可以从同步的 `/reload` 路径调用。导入错误、缺少 `setup`,以及 `setup` 抛出的异常都会被捕获为 `ResourceDiagnostic`(`kind="extension"`、`severity="error"`),并跳过该扩展。

[原文]
`tau --no-extensions` disables directory discovery entirely (explicit
`--extension` paths still load, matching Pi's CLI-survives semantics).

[译文]
`tau --no-extensions` 会完全禁用目录发现(显式的 `--extension` 路径仍会加载,与 Pi 的「CLI 参数仍然生效」语义一致)。

[原文]
**Ruling:** `session_start` is emitted by the **host**, not by
`CodingSession.load`. Pi starts the UI before initializing extensions
precisely so `session_start` handlers can use dialogs and notifications
(`interactive-mode.ts`: "Start the UI before initializing extensions…");
Tau's load originally emitted before any UI bridge existed, silently
dropping `notify` and cancelling dialogs from `session_start` handlers.
`load` now marks the event pending and hosts release it with
`session.emit_pending_session_start()` (idempotent) after
`set_ui_bridge(...)` — the TUI in `on_mount`, print mode right after
installing `StderrUiBridge`. The adopt-replacement paths (`new`/`resume`/
`branch` and `/reload`) still emit directly: they reuse the long-lived
runtime whose bridge is already attached. A host that never calls it gets
no `session_start` — host responsibility, same as Pi.

[译文]
**Ruling(裁定):** `session_start` 由**宿主**发出,而不是由 `CodingSession.load` 发出。Pi 之所以先启动 UI 再初始化扩展,正是为了让 `session_start` 处理器能够使用对话框与通知(`interactive-mode.ts`:「Start the UI before initializing extensions…」);而 Tau 的加载最初在任何 UI 桥存在之前就发出了该事件,导致 `session_start` 处理器里的 `notify` 被静默丢弃、对话框被取消。现在 `load` 会把该事件标记为待处理,由宿主在 `set_ui_bridge(...)` 之后通过 `session.emit_pending_session_start()`(幂等)释放 —— TUI 在 `on_mount` 中调用,print 模式在安装 `StderrUiBridge` 之后立即调用。会话替换路径(`new`/`resume`/`branch` 与 `/reload`)仍然直接发出:它们复用桥已经挂好的长生命周期运行时。永不调用它的宿主就得不到 `session_start` —— 这是宿主的责任,与 Pi 相同。

## 包布局(Package layout)

[原文]
```text
src/tau_coding/extensions/
    __init__.py     public re-exports
    api.py          ExtensionAPI, ExtensionContext, hook payload/result types
    loader.py       discovery + importlib loading + diagnostics
    runtime.py      ExtensionRuntime: hook dispatch, tool wrapping,
                    command collection, harness/session binding
```

[译文]
```text
src/tau_coding/extensions/
    __init__.py     公开的 re-export
    api.py          ExtensionAPI、ExtensionContext、钩子载荷/结果类型
    loader.py       发现 + importlib 加载 + 诊断
    runtime.py      ExtensionRuntime:钩子分发、工具包裹、
                    命令收集、harness/会话绑定
```

[原文]
`tau_agent` remains free of extension imports. The runtime consumes only
public `tau_agent` types (`AgentTool`, `AgentToolResult`, `AgentEvent`,
`CustomEntry`). Hook payload/result types are frozen dataclasses (pydantic
stays reserved for `tau_agent` wire types).

[译文]
`tau_agent` 仍然不导入任何扩展。运行时只消费公开的 `tau_agent` 类型(`AgentTool`、`AgentToolResult`、`AgentEvent`、`CustomEntry`)。钩子载荷/结果类型是冻结的 dataclass(pydantic 仍专属于 `tau_agent` 的线上类型)。

## ExtensionAPI 接口面,v1 / ExtensionAPI surface (v1)

```python
class ExtensionAPI:
    # registration (valid during setup and afterwards)
    def register_tool(self, tool: AgentTool) -> None: ...
    def register_command(
        self, name: str, handler: ExtensionCommandHandler, *,
        description: str = "", usage: str | None = None,
        aliases: tuple[str, ...] = (),
    ) -> None: ...
    def on(self, event: str, handler: ExtensionHandler | None = None): ...
        # usable as api.on("tool_call", fn) or @api.on("tool_call")

    # actions (valid once the session is bound; raise ExtensionError before)
    def send_user_message(
        self, content: str, *, deliver_as: Literal["steer", "follow_up"] = "follow_up",
    ) -> None: ...
    async def append_entry(self, namespace: str, data: dict[str, JSONValue]) -> None: ...
    def notify(self, message: str, level: Literal["info", "warning", "error"] = "info") -> None: ...
    def set_inference_provider(self, route: str | None) -> str: ...

    # context (read-only; includes inference_provider)
    @property
    def context(self) -> ExtensionContext: ...
```

[原文]
`ExtensionContext` exposes `cwd`, `model`, `provider_name`, `inference_provider`, `session_id`,
`session_name`, `thinking_level`, `system_prompt`, `is_running`, `has_ui`, and `transcript`. It is a live view
over the bound `CodingSession`; action methods raise `ExtensionError` if
called before binding (Pi's throwing-stubs-then-`bindCore` model).

[译文]
`ExtensionContext` 暴露 `cwd`、`model`、`provider_name`、`inference_provider`、`session_id`、`session_name`、`thinking_level`、`system_prompt`、`is_running`、`has_ui` 与 `transcript`。它是绑定到 `CodingSession` 的实时视图;在绑定之前调用动作方法会抛出 `ExtensionError`(即 Pi 的「先抛异常桩、再由 `bindCore` 绑定」模型)。

[原文]
`context.paths -> TauPaths` is the resolved, read-only filesystem-path snapshot
for the active extension generation. A host-supplied `TauResourcePaths.paths`
is authoritative, preserving custom `TauPaths.home` and `TauPaths.agents_home`.
When it is absent, the runtime derives `TauPaths(home=resource_paths.root,
agents_home=resource_paths.agents_root or ~/.agents)`. This keeps Tau's
`root`/`home` (user data and extension discovery) distinct from
`agents_root`/`agents_home` (`.agents` resources) and from project `cwd`.
`ExtensionRuntime(paths=custom_paths)` exposes its constructor value immediately;
`load` then replaces it with the loaded resource snapshot. Consequently, a
custom setup can intentionally use separate Tau and `.agents` roots without a
path architecture rewrite.

[译文]
`context.paths -> TauPaths` 是当前扩展代际的、已解析的只读文件系统路径快照。宿主提供的 `TauResourcePaths.paths` 是权威来源,它保留自定义的 `TauPaths.home` 与 `TauPaths.agents_home`。当它缺席时,运行时会推导出 `TauPaths(home=resource_paths.root, agents_home=resource_paths.agents_root or ~/.agents)`。这使 Tau 的 `root`/`home`(用户数据与扩展发现)与 `agents_root`/`agents_home`(`.agents` 资源)以及项目 `cwd` 保持区分。`ExtensionRuntime(paths=custom_paths)` 会立即暴露其构造参数中的值;随后 `load` 会用加载到的资源快照替换它。因此,自定义 setup 可以有意使用彼此分离的 Tau 根与 `.agents` 根,而不必重写路径架构。

[原文]
The snapshot is generation-scoped. `/reload` and fresh-generation session
replacement invalidate the old context, so even reading `context.paths` from a
captured old context raises `ExtensionError`; handlers must read the new
context's paths after the replacement.

[译文]
该快照以代际为作用域。`/reload` 与切换到新代际的会话替换会使旧上下文失效,因此即使只是从捕获到的旧上下文读取 `context.paths` 也会抛出 `ExtensionError`;处理器必须在替换之后读取新上下文的路径。

[原文]
`transcript -> tuple[AgentMessage, ...]` gives read access to the active-path
parent conversation (`CodingSession.messages`). It is the Tau analogue of the
only conversation surface Pi hands extensions — `ctx.sessionManager.getBranch()`
— and exists so a subagent extension can port pi-subagents'
`buildParentContext` (an `inherit_context` text prepend built from the parent
branch) without `src/tau_agent` importing `src/tau_coding`.

[译文]
`transcript -> tuple[AgentMessage, ...]` 提供对活动路径上父对话的只读访问(`CodingSession.messages`)。它是 Tau 对 Pi 交给扩展的唯一对话面 —— `ctx.sessionManager.getBranch()` —— 的对应物;其存在是为了让子代理扩展可以移植 pi-subagents 的 `buildParentContext`(一段由父分支构造、用于 `inherit_context` 的文本前置内容),而不必让 `src/tau_agent` 导入 `src/tau_coding`。

[原文]
**Ruling:** `context.transcript` returns **deep copies** of the messages, not
the live objects. Pi leans on TypeScript `Readonly<...>` types on `getBranch()`
for compile-time read-only-ness; Python has no such guarantee and Tau's message
models are mutable pydantic instances, so an extension holding a live object
could silently corrupt the session transcript. Copying is the enforcement.
This is a deliberate deviation from Pi (which returns live references). Semantic
parity otherwise: Pi's branch keeps user/assistant/tool entries and renders
compaction summaries from an explicit `compaction` entry `summary`. Tau has no
separate summary entry in `messages` — compaction and branch summaries are
already folded into the transcript as `UserMessage`s (`Previous conversation
summary:\n...` / `<summary>...</summary>`), so an extension building a digest
sees them as user turns rather than a distinct `[Summary]` type. If exact
`[Summary]` parity is ever needed, expose branch *entries* instead; not done in
v1.

[译文]
**Ruling(裁定):** `context.transcript` 返回消息的**深拷贝**,而不是活对象。Pi 依靠 TypeScript 在 `getBranch()` 上的 `Readonly<...>` 类型来实现编译期只读;Python 没有这种保证,而 Tau 的消息模型是可变的 pydantic 实例,因此持有活对象的扩展可能悄悄破坏会话记录。拷贝就是强制执行手段。这是对 Pi(它返回活引用)的有意偏离。其他方面保持语义对等:Pi 的分支保留 user/assistant/tool 条目,并从显式的 `compaction` 条目 `summary` 渲染压缩摘要。Tau 的 `messages` 中没有单独的摘要条目 —— 压缩摘要与分支摘要已经作为 `UserMessage` 折入会话记录(`Previous conversation summary:\n...` / `<summary>...</summary>`),因此构建摘要(digest)的扩展会把它们看作 user 轮次,而不是独立的 `[Summary]` 类型。如果日后确需精确的 `[Summary]` 对等,应改为暴露分支**条目(entries)**;v1 未实现。

[原文]
Event handlers may be sync or async; async handlers are awaited. Handlers
run on the session's event loop, so they must be fast — slow work belongs in
a spawned task. Every handler invocation is wrapped in try/except — a
raising handler is recorded as a runtime diagnostic and dispatch continues.
The one deliberate exception, matching Pi: a raising `tool_call` hook blocks
the tool (fail-safe).

[译文]
事件处理器可以是同步或异步的;异步处理器会被 await。处理器运行在会话的事件循环上,因此必须够快 —— 慢工作应放进派生任务。每次处理器调用都包裹在 try/except 中 —— 抛异常的处理器会被记录为运行时诊断,分发继续进行。唯一有意为之的例外与 Pi 一致:抛异常的 `tool_call` 钩子会阻止该工具执行(故障安全)。

### 事件(Events)

[原文]
> **Superseded protocol note (Pi 0.80.6 cutover):** the original event/tool/message
> descriptions below document the first Tau extension implementation. The current
> contract is the canonical protocol in `tau_agent.events`, `tau_agent.tools`, and
> `tau_coding.events`: handlers receive `(event, context)`, streamed provider events
> are nested under `message_update.assistant_message_event`, tool executors receive
> `(tool_call_id, arguments, signal, on_update)`, and custom messages use the
> dedicated `CustomMessage` role. The session-to-extension adapter additionally
> enriches `turn_start` with Pi's zero-based `turn_index` and millisecond
> `timestamp`, and `turn_end` with the matching `turn_index`; portable
> `tau_agent` events remain session-agnostic. See the published extension guide
> and `dev-notes/design/pi-event-migration-audit.md` for the final shape.

[译文]
> **已被取代的协议说明(Pi 0.80.6 切换):** 下文原有的事件/工具/消息描述记录的是 Tau 扩展的最初实现。当前契约是 `tau_agent.events`、`tau_agent.tools` 与 `tau_coding.events` 中的规范协议:处理器接收 `(event, context)`;流式的 provider 事件嵌套在 `message_update.assistant_message_event` 之下;工具执行器接收 `(tool_call_id, arguments, signal, on_update)`;自定义消息使用专门的 `CustomMessage` 角色。会话到扩展的适配器还会为 `turn_start` 补充 Pi 的从零开始的 `turn_index` 与毫秒级 `timestamp`,并为 `turn_end` 补充对应的 `turn_index`;可移植的 `tau_agent` 事件仍与具体会话无关。最终形态见已发布的扩展指南与 `dev-notes/design/pi-event-migration-audit.md`。

[原文]
Observation events reuse the `AgentEvent` `type` literals directly:
`agent_start`, `agent_end`, `turn_start`, `turn_end`, `message_start`,
`message_delta`, `thinking_delta`, `message_end`, `tool_execution_start`,
`tool_execution_update`, `tool_execution_end`, `error`, `retry`,
`queue_update`. These are delivered from `AgentHarness.subscribe` and cannot
mutate anything. `api.on("agent_event", fn)` is the wildcard (note: it fires
per streamed token delta; prefer specific events).

[译文]
观察类事件直接复用 `AgentEvent` 的 `type` 字面量:`agent_start`、`agent_end`、`turn_start`、`turn_end`、`message_start`、`message_delta`、`thinking_delta`、`message_end`、`tool_execution_start`、`tool_execution_update`、`tool_execution_end`、`error`、`retry`、`queue_update`。它们由 `AgentHarness.subscribe` 投递,不能修改任何东西。`api.on("agent_event", fn)` 是通配入口(注意:它在每个流式 token 增量上都会触发;优先使用具体事件)。

[原文]
Lifecycle events, dispatched by the runtime:

[译文]
由运行时派发的生命周期事件:

[原文]
| Event | Payload | Result |
|---|---|---|
| `session_start` | `SessionStartEvent(reason: "startup" \| "reload" \| "new" \| "resume" \| "branch")` | — |
| `session_shutdown` | `SessionShutdownEvent(reason)` | — |
| `input` | `InputEvent(text, source="interactive" \| "extension", streaming_behavior="steer" \| "follow_up" \| None)` | `InputHookResult(action="continue" \| "transform" \| "handled", text=None, message=None)` |
| `tool_call` | `ToolCallHookEvent(tool_name, arguments)` | `ToolCallHookResult(block=False, reason=None, arguments=None)` |
| `tool_result` | `ToolResultHookEvent(tool_name, arguments, result)` | `ToolResultHookResult(content=None, ok=None, details=None)` |

[译文]
| 事件 | 载荷 | 结果 |
|---|---|---|
| `session_start` | `SessionStartEvent(reason: "startup" \| "reload" \| "new" \| "resume" \| "branch")` | — |
| `session_shutdown` | `SessionShutdownEvent(reason)` | — |
| `input` | `InputEvent(text, source="interactive" \| "extension", streaming_behavior="steer" \| "follow_up" \| None)` | `InputHookResult(action="continue" \| "transform" \| "handled", text=None, message=None)` |
| `tool_call` | `ToolCallHookEvent(tool_name, arguments)` | `ToolCallHookResult(block=False, reason=None, arguments=None)` |
| `tool_result` | `ToolResultHookEvent(tool_name, arguments, result)` | `ToolResultHookResult(content=None, ok=None, details=None)` |

[原文]
**Ruling:** the `input` hook payload ports Pi's `InputEvent` metadata with two
omissions. Pi's `images` field is dropped (Tau has no image input yet) and
Pi's `"rpc"` source is dropped (Tau has no RPC mode), so `source` is just
`"interactive" | "extension"`. Both new fields carry backward-compatible
defaults (`source="interactive"`, `streaming_behavior=None`), so handlers that
read only `.text` keep working. `source="extension"` is set when an extension
starts an idle turn via `send_user_message`/`send_custom_message` — that path
reaches `run_input_hooks` through `session.prompt`; when the session is already
running, extension delivery routes through `queue_steering_message`/
`queue_follow_up_message`, which bypass the hook stage entirely (no `input`
fires). `streaming_behavior` **is** populated: user-typed mid-run submissions
in the TUI go through `session.prompt(streaming_behavior=…)`, and `prompt`
runs `input` hooks before the mid-run steer/follow-up branch, so the hook sees
`"steer"`/`"follow_up"` on the streaming path and `None` on the idle path —
matching Pi's "undefined when idle". (The `queue_*_message` seams remain
hook-free, matching Pi, since those are host/extension-injected messages, not
user input.)

[译文]
**Ruling(裁定):** `input` 钩子的载荷移植了 Pi 的 `InputEvent` 元数据,但有两处省略。Pi 的 `images` 字段被去掉(Tau 尚无图像输入),Pi 的 `"rpc"` 来源被去掉(Tau 尚无 RPC 模式),因此 `source` 只有 `"interactive" | "extension"`。两个新字段都带有向后兼容的默认值(`source="interactive"`、`streaming_behavior=None`),因此只读 `.text` 的处理器仍可工作。当扩展通过 `send_user_message`/`send_custom_message` 启动一个空闲轮次时,`source="extension"`;该路径经 `session.prompt` 到达 `run_input_hooks`。当会话已在运行时,扩展投递会改走 `queue_steering_message`/`queue_follow_up_message`,它们完全绕过钩子阶段(不会触发 `input`)。`streaming_behavior` **会**被填充:TUI 中用户手动输入的运行中提交会走 `session.prompt(streaming_behavior=…)`,而 `prompt` 会在运行中的 steer/follow-up 分支之前运行 `input` 钩子,因此该钩子在流式路径上看到 `"steer"`/`"follow_up"`,在空闲路径上看到 `None` —— 与 Pi 的「空闲时为 undefined」一致。(`queue_*_message` 接缝仍不触发钩子,与 Pi 相同,因为那些是宿主/扩展注入的消息,而不是用户输入。)

[原文]
**Ruling:** the `tool_call`/`tool_result` hook payloads carry no
`tool_call_id`. The hooks are implemented by wrapping tool executors, and
the executor signature (`tau_agent/tools.py`) does not receive the call id —
the loop stamps it after execution. Extensions that need id correlation use
the observation events (`tool_execution_start/end`), which carry the full
`ToolCall`/`AgentToolResult`.

[译文]
**Ruling(裁定):** `tool_call`/`tool_result` 的钩子载荷不携带 `tool_call_id`。这些钩子通过包裹工具执行器实现,而执行器签名(`tau_agent/tools.py`)并不接收调用 id —— 循环会在执行之后才打上它。需要 id 关联的扩展应使用观察类事件(`tool_execution_start/end`),它们携带完整的 `ToolCall`/`AgentToolResult`。

[原文]
**Ruling:** live tool-execution progress (Pi's `onUpdate`) is implemented, but
with a lighter payload than Pi. A tool reports progress through an opt-in
`on_update` callback (`ToolUpdateCallback`, `tau_agent/tools.py`) whose
signature is `(message: str, data: dict[str, JSONValue] | None = None) -> None`
— deliberately *not* Pi's `onUpdate(partialResult: AgentToolResult)`. The loop
turns each call into the already-defined `ToolExecutionUpdateEvent(tool_call_id,
message, data)`, which carries no `content`/`details`/`ok` echo of a partial
result. Rationale: Tau's update event exists to drive a progress line, not to
re-render a partial tool result; extensions that need the full result read the
terminal `tool_execution_end`. `on_update` is sync and fire-and-forget (matching
Pi); the loop bridges calls onto the async event stream via an unbounded queue
and a task/queue race in `_execute_tool`, preserving order and never dropping the
final result (even on tool error or a closed/cancelled stream).

[译文]
**Ruling(裁定):** 实时的工具执行进度(Pi 的 `onUpdate`)已经实现,但载荷比 Pi 更轻。工具通过一个可选的 `on_update` 回调(`ToolUpdateCallback`,`tau_agent/tools.py`)上报进度,其签名为 `(message: str, data: dict[str, JSONValue] | None = None) -> None` —— 有意**不**采用 Pi 的 `onUpdate(partialResult: AgentToolResult)`。循环会把每次调用转换成已定义的 `ToolExecutionUpdateEvent(tool_call_id, message, data)`,它不携带部分结果的 `content`/`details`/`ok` 回显。理由:Tau 的更新事件用于驱动一行进度,而不是重新渲染部分工具结果;需要完整结果的扩展应读取终结的 `tool_execution_end`。`on_update` 是同步、发后不管的(与 Pi 一致);循环通过一个无界队列与 `_execute_tool` 中的 task/queue 竞速,把这些调用桥接到异步事件流上,既保持顺序,也绝不丢弃最终结果(即使工具出错或流已关闭/取消)。

[原文]
**Ruling:** the `on_update` seam is *opt-in via signature inspection*, not a
changed executor signature. `AgentTool` detects at construction (once, in
`__post_init__` via `inspect.signature`) whether its executor declares an
`on_update` parameter, and `AgentTool.execute` forwards the callback only to
executors that do. This keeps every existing `(arguments, signal)` executor —
all built-in tools — untouched, rather than mechanically adding `on_update=None`
to each. The alternative (widen the `ToolExecutor` protocol) was rejected because
it would force the parameter on every executor and break structural typing for
the built-ins. The extension runtime's tool wrapper (`_wrap_tool`) always
declares `on_update` and forwards it; the *inner* tool's inspect-gate still drops
it for wrapped executors that do not accept it.

[译文]
**Ruling(裁定):** `on_update` 接缝是**通过签名检查选择启用的**,而不是改变执行器签名。`AgentTool` 在构造时(通过 `inspect.signature` 在 `__post_init__` 中执行一次)检测其执行器是否声明了 `on_update` 参数,而 `AgentTool.execute` 只把回调转发给声明了的执行器。这让所有既有的 `(arguments, signal)` 执行器 —— 即全部内置工具 —— 保持不动,而不是机械地给每一个都加上 `on_update=None`。另一种方案(拓宽 `ToolExecutor` 协议)被否决,因为它会把该参数强加给每个执行器,并破坏内置工具的结构化类型。扩展运行时的工具包裹器(`_wrap_tool`)总是声明并转发 `on_update`;对于不接受它的被包裹执行器,内层工具的 inspect 门控仍会把它丢弃。

[原文]
**Ruling:** provider token usage is surfaced on `AssistantMessage.usage`
(matching Pi's placement on `AssistantMessage.usage`, `packages/ai/src/types.ts`),
so extensions read real billed usage from the `message_end` observation event as
`event.message.usage` — e.g. `event.message.usage.input`, `.output`,
`.cache_read`, `.cache_write`, `.cache_write_1h`, `.reasoning`, `.total_tokens`.
`usage` is `Usage | None`: it is `None` when the provider reported no usage
(rather than Pi's always-present zeroed object), so a downstream extension can
distinguish "not reported" from "genuinely zero". Two field-level deviations from
Pi, both because Tau has no per-model pricing table (no equivalent of Pi's
`models.ts` `calculateCost`/`model.cost`): (1) `Usage.cost` is present in the type
for shape-parity but always left `None` — providers populate only token counts;
(2) the OpenAI-Responses/Codex path leaves `cache_write` at 0 because that API
does not report cache-creation tokens (same as Pi). Usage is **per-response**
only; lifetime/context totals are derivable by summing `message.usage` across the
transcript (Pi likewise aggregates in its UI/session layer, not on the message).

[译文]
**Ruling(裁定):** provider 的 token 用量暴露在 `AssistantMessage.usage` 上(与 Pi 在 `AssistantMessage.usage` 上的位置一致,`packages/ai/src/types.ts`),因此扩展可以从 `message_end` 观察事件上以 `event.message.usage` 读取真实的计费用量 —— 例如 `event.message.usage.input`、`.output`、`.cache_read`、`.cache_write`、`.cache_write_1h`、`.reasoning`、`.total_tokens`。`usage` 类型为 `Usage | None`:当 provider 未上报用量时它是 `None`(而不是 Pi 那种始终存在、填零的对象),因此下游扩展能够区分「未上报」与「确实为零」。与 Pi 存在两处字段级偏离,原因都是 Tau 没有按模型定价表(没有 Pi `models.ts` 中 `calculateCost`/`model.cost` 的对应物):(1)`Usage.cost` 为形态对等而保留在类型中,但始终为 `None` —— provider 只填充 token 计数;(2)OpenAI-Responses/Codex 路径让 `cache_write` 保持为 0,因为该 API 不上报缓存创建 token(与 Pi 相同)。用量只按**单次响应**记录;生命周期/上下文总量可以通过对会话记录中的 `message.usage` 求和推导(Pi 同样在 UI/会话层聚合,而不是在消息上聚合)。

[原文]
Chaining semantics mirror Pi: `input` transforms chain and `handled`
short-circuits; `tool_call` blocking short-circuits remaining handlers;
`tool_result` overrides chain, each handler seeing prior modifications.
Extensions run in load order; handlers within an extension run in
registration order.

[译文]
链式语义与 Pi 一致:`input` 的转换会依次串联,而 `handled` 会短路;`tool_call` 的阻止会短路后续处理器;`tool_result` 的覆盖会串联,每个处理器都能看到此前的修改。扩展按加载顺序运行;同一扩展内的处理器按注册顺序运行。

### 工具(Tools)

[原文]
Extensions register plain `AgentTool` values (name, description, raw
JSON-schema `input_schema`, async executor) — the same hand-written-schema
convention as built-ins (ADR 0002). First registration wins per name; an
extension tool with a built-in's name replaces the built-in (Pi's override
rule). Registered tools appear in the system prompt tool list, the TUI
sidebar, and `/session` counts like built-ins. Tool-attached
`prompt_snippet`/`prompt_guidelines` flow into the system prompt as for
built-ins, and `add_prompt_guideline` contributes standalone guideline
lines through `BuildSystemPromptOptions.extra_guidelines` (rebuilt on
`/reload` when they change). Extensions that need structured always-on context
use `add_prompt_section(title, body)`. These source-owned free-form blocks flow
through `BuildSystemPromptOptions.extra_sections` after CLI/resource append
content, retain registration order, and participate in reload change detection.

[译文]
扩展注册普通的 `AgentTool` 值(名称、描述、原始 JSON schema `input_schema`、异步执行器)—— 与内置工具相同的「手写 schema」约定(ADR 0002)。同名时先注册者胜;与内置工具同名的扩展工具会替换内置工具(Pi 的覆盖规则)。已注册工具会像内置工具一样出现在系统提示词的工具列表、TUI 侧边栏与 `/session` 计数中。工具自带的 `prompt_snippet`/`prompt_guidelines` 与内置工具一样流入系统提示词;而 `add_prompt_guideline` 通过 `BuildSystemPromptOptions.extra_guidelines` 贡献独立的准则行(发生变化时在 `/reload` 中重建)。需要结构化常驻上下文的扩展使用 `add_prompt_section(title, body)`。这些由来源持有的自由格式块会在 CLI/资源追加内容之后、经由 `BuildSystemPromptOptions.extra_sections` 流入,保持注册顺序,并参与 reload 的变更检测。

### 命令(Commands)

[原文]
`register_command` wraps the handler into a `SlashCommand` registered on a
per-session `CommandRegistry` built by calling
`create_default_command_registry()` and layering extension commands on top
(the registry has no clone; rebuilding is the mechanism). Built-in names
cannot be overridden — a duplicate registration is caught and recorded as a
diagnostic, keeping
`tests/test_commands.py::test_registered_commands_are_pi_aligned` intact.

[译文]
`register_command` 会把处理器包装成 `SlashCommand`,注册到按会话构建的 `CommandRegistry` 上:先调用 `create_default_command_registry()`,再在其上叠加扩展命令(该注册表没有 clone;重建就是机制)。内置名称不能被覆盖 —— 重复注册会被捕获并记录为诊断,从而使 `tests/test_commands.py::test_registered_commands_are_pi_aligned` 保持通过。

[原文]
**Ruling:** extension command handlers are sync-only in v1. The whole
command path (`CommandRegistry.execute` → `CodingSession.handle_command` →
the TUI's submit handler) is synchronous; making it async ripples through
the TUI. Handlers receive `(args: str, context: ExtensionCommandContext)`
and may return `None` or a `str` message, which flows through the normal
`CommandResult.message` path. Long-running command work should
`send_user_message` or spawn a task. Extension commands surface in TUI
autocomplete automatically because autocomplete reads
`CommandRegistry.list_commands()`.

[译文]
**Ruling(裁定):** v1 中扩展命令处理器只能是同步的。整条命令路径(`CommandRegistry.execute` → `CodingSession.handle_command` → TUI 的提交处理器)都是同步的;改成异步会波及整个 TUI。处理器接收 `(args: str, context: ExtensionCommandContext)`,可以返回 `None` 或一条 `str` 消息,后者会走常规的 `CommandResult.message` 路径。长时间运行的命令工作应调用 `send_user_message` 或派生任务。扩展命令会自动出现在 TUI 自动补全中,因为补全读取的是 `CommandRegistry.list_commands()`。

### UI 对话框(UI dialogs)

[原文]
`context.ui` (Pi's `ctx.ui`) exposes host-provided interactive dialogs plus
`notify`:

[译文]
`context.ui`(即 Pi 的 `ctx.ui`)暴露由宿主提供的交互式对话框以及 `notify`:

```python
async def select(title: str, options: Sequence[str], *, timeout: float | None = None) -> str | None
async def confirm(title: str, message: str, *, timeout: float | None = None) -> bool
async def input(title: str, placeholder: str = "", *, timeout: float | None = None) -> str | None
def notify(message: str, level: Literal["info", "warning", "error"] = "info") -> None
```

[原文]
The methods delegate to a host `UiBridge` (`api.py`): `NullUiBridge`
(headless/tests) and `StderrUiBridge` (print mode) return Pi's no-op defaults
(`None`/`False`/`None`); `_TuiExtensionUiBridge` (`tui/app.py`) drives three
`ModalScreen`s (`ExtensionSelectScreen`/`ExtensionConfirmScreen`/
`ExtensionInputScreen`). `api.notify` stays as a back-compat alias for
`context.ui.notify`.

[译文]
这些方法委托给宿主的 `UiBridge`(`api.py`):`NullUiBridge`(无头/测试)与 `StderrUiBridge`(print 模式)返回 Pi 的无操作默认值(`None`/`False`/`None`);`_TuiExtensionUiBridge`(`tui/app.py`)驱动三个 `ModalScreen`(`ExtensionSelectScreen`/`ExtensionConfirmScreen`/`ExtensionInputScreen`)。`api.notify` 作为 `context.ui.notify` 的向后兼容别名保留。

[原文]
**Ruling:** extension UI dialogs are host-provided (`select`/`confirm`/
`input`), not extension-authored widgets, so they are in-spirit despite the
"custom TUI components" non-goal. Deviations from Pi, all deliberate for v1:
(a) **no `AbortSignal`** — only `timeout` (in **seconds**, not Pi's
milliseconds); on timeout the dialog auto-dismisses and returns the no-op
default (no live countdown display — Pi shows one). (b) `input` returns the
entered text verbatim (empty string on empty submit), `None` only on
cancel/escape, matching Pi's `string | undefined`. (c) The TUI bridge awaits
each modal via `push_screen(screen, callback)` + an `asyncio.Future`, **not**
`push_screen_wait` — the latter requires a Textual *worker* context, which a
task spawned by a sync command handler is not; the future/callback pattern
(already used by the OAuth `_manual_code_input` flow) works from any coroutine
on the app's event loop.

[译文]
**Ruling(裁定):** 扩展 UI 对话框由宿主提供(`select`/`confirm`/`input`),而不是由扩展编写控件,因此尽管「自定义 TUI 组件」属于非目标,它们仍符合设计精神。与 Pi 的偏离在 v1 中都是有意为之:(a)**没有 `AbortSignal`** —— 只有 `timeout`(单位是**秒**,不是 Pi 的毫秒);超时后对话框自动关闭并返回无操作默认值(没有实时倒计时显示 —— Pi 会显示)。(b)`input` 原样返回输入的文本(空提交返回空字符串),只在取消/按 Escape 时返回 `None`,与 Pi 的 `string | undefined` 一致。(c)TUI 桥通过 `push_screen(screen, callback)` + `asyncio.Future` 等待每个模态框,**而不是** `push_screen_wait` —— 后者需要 Textual 的 *worker* 上下文,而同步命令处理器派生的任务并不具备该上下文;future/callback 模式(已被 OAuth 的 `_manual_code_input` 流程使用)可以在应用事件循环上的任意协程中工作。

[原文]
**Ruling:** the sync-only command-handler Ruling (above) is **kept** for v1
even though dialogs are async. An extension `/command` that needs a dialog
does **not** await it directly (the handler is sync); instead it spawns a loop
task and returns immediately:

[译文]
**Ruling(裁定):** 尽管对话框是异步的,v1 **仍保留**上述「命令处理器只能同步」的裁定。需要对话框的扩展 `/command` **不会**直接 await 它(处理器是同步的);相反,它派生一个事件循环任务并立即返回:

```python
def _handler(args, context):
    async def _menu():
        choice = await context.api.context.ui.select("Action", ["deploy", "cancel"])
        if choice is not None:
            context.api.send_user_message(f"run {choice}")
    asyncio.get_running_loop().create_task(_menu())
    return "opening menu..."
```

[原文]
This is safe because `CodingSession.handle_command` is invoked from the TUI's
async submit path (`tui/app.py`), i.e. on the Textual event-loop thread, so
`asyncio.get_running_loop()` is available and the spawned task shares that
loop. Converting the command path to async (the faithful Pi port) is the clean
long-term option but is deferred — it ripples through `CommandRegistry.execute`
→ `handle_command` → the TUI submit handler.

[译文]
这是安全的,因为 `CodingSession.handle_command` 是从 TUI 的异步提交路径(`tui/app.py`)调用的,也就是位于 Textual 事件循环线程上,因此 `asyncio.get_running_loop()` 可用,派生的任务也共享同一个循环。把命令路径改成异步(忠实移植 Pi)是干净的长期方案,但被推迟 —— 它会波及 `CommandRegistry.execute` → `handle_command` → TUI 提交处理器。

## 自定义消息渲染(Custom message rendering)

[原文]
Extensions can format their injected messages instead of leaving them as raw
text. The tau-subagents extension uses this so a background agent's
`<task-notification>` renders as a compact status block rather than raw XML.

[译文]
扩展可以格式化自己注入的消息,而不必让它们保持为原始文本。tau-subagents 扩展就利用这一点,让后台 agent 的 `<task-notification>` 渲染为紧凑的状态块,而不是原始 XML。

[原文]
API (ports Pi's `registerMessageRenderer` + `sendMessage`):

[译文]
API(移植 Pi 的 `registerMessageRenderer` + `sendMessage`):

```python
def setup(tau):
    tau.register_message_renderer("subagent-notification", render_notification)

# later, from a tool executor / event handler:
tau.send_custom_message(
    "<task-notification>...</task-notification>",
    custom_type="subagent-notification",
    details={"id": run_id, "status": "completed", ...},
)
```

[原文]
A renderer is `Callable[[CustomMessageView, MessageRenderOptions], str]`:
`CustomMessageView(custom_type, content, details)` plus
`MessageRenderOptions(expanded)`. It returns a **Rich-markup string**
(e.g. `"[bold]✓ done[/bold]"`).

[译文]
渲染器是 `Callable[[CustomMessageView, MessageRenderOptions], str]`:`CustomMessageView(custom_type, content, details)` 加上 `MessageRenderOptions(expanded)`。它返回一个 **Rich 标记字符串**(例如 `"[bold]✓ done[/bold]"`)。

[原文]
Data flow: `send_custom_message` → a runtime `CustomMessage` carrying
`custom_type`/`details` (its content converts to a provider-facing user message)
→ `MessageEndEvent(message=...)` → a persisted `CustomMessageEntry` → the TUI
adapter projects it to a `ChatItem(role="custom")` → the render path calls
`runtime.render_custom_message(...)`, which looks up the registered renderer,
builds the view/options, and returns markup (or `None` to fall back to raw
`content`). The resolver is installed into every render path: the live TUI
(`state.custom_renderer`, consumed by `TranscriptView._redraw` /
`TranscriptMessageWidget` / `render_chat_item`), session **resume**
(`SessionState` reconstructs the runtime `CustomMessage`), and the **print-mode**
transcript (`TranscriptRenderer`, wired in `cli.py`).

[译文]
数据流:`send_custom_message` → 一个携带 `custom_type`/`details` 的运行时 `CustomMessage`(其内容会转换为面向 provider 的用户消息)→ `MessageEndEvent(message=...)` → 一条持久化的 `CustomMessageEntry` → TUI 适配器把它投射为 `ChatItem(role="custom")` → 渲染路径调用 `runtime.render_custom_message(...)`,后者查找已注册的渲染器、构建视图/选项并返回标记(或返回 `None` 以回退到原始 `content`)。该解析器被安装进每一条渲染路径:实时 TUI(`state.custom_renderer`,由 `TranscriptView._redraw` / `TranscriptMessageWidget` / `render_chat_item` 消费)、会话**恢复**(`SessionState` 重建运行时的 `CustomMessage`),以及 **print 模式**的会话记录(`TranscriptRenderer`,在 `cli.py` 中接线)。

[原文]
**Ruling:** custom-message renderers return **markup strings, not Textual
widgets** (deviation from Pi's `Component` return). This keeps extensions
free of any TUI-toolkit import — an extension only ever produces a string,
and the host decides how to display it (Rich markup in the TUI, Rich `Text`
in print mode). Malformed markup never crashes the frontend: `Text.from_markup`
is called under a guard that falls back to literal text.

[译文]
**Ruling(裁定):** 自定义消息渲染器返回的是 **markup 字符串,而不是 Textual 控件**(偏离 Pi 的 `Component` 返回)。这让扩展完全不必导入任何 TUI 工具箱 —— 扩展只产生一个字符串,由宿主决定如何展示它(在 TUI 中是 Rich 标记,在 print 模式中是 Rich `Text`)。畸形标记永远不会让前端崩溃:`Text.from_markup` 的调用带有一层守卫,会回退为字面文本。

[原文]
**Ruling (reaffirmed 2026-07, subagents boundary audit):** the
strings-not-widgets choice was revisited when the subagent UX (agents strip,
in-place agent views) had to be built host-side against generic data seams
rather than shipped by the extension, as pi-subagents does. Considered and
rejected: a pi-style component seam (`ctx.ui.custom` / `setHeader` /
`setFooter` / `setEditorComponent`). The decisive asymmetry is that **Pi
ships its own TUI framework** — `@earendil-works/pi-tui` is a sibling
package in the pi monorepo — so when Pi hands extensions a `Component` it
exposes an interface it owns and can evolve in lockstep with its host. Tau
renders with **Textual, a third-party toolkit**: a widget seam would promote
Textual's API to Tau's public extension contract, making every Textual
upgrade a potential ecosystem break and forever precluding a frontend swap.
Strings additionally work in every frontend (TUI, print mode, future hosts)
and cannot crash or wedge the render loop; extension needs so far (dialogs,
message renderers, tool-call lines, transcript sources, themes) have all
been expressible as data seams. Note the practical consequence: the "removes
code from core" appeal is largely illusory — features would move out, but
core would grow a widget-hosting layer (mounting, lifecycle, layout slots,
focus/input routing, error isolation) with a much larger public contract.
**Reopen triggers:** (a) Tau takes ownership of its UI layer (its own
toolkit, or a hard abstraction over Textual); (b) a real third-party
extension need that cannot be expressed as a data seam; (c) upstream tau
explicitly wants component extensions. Preferred middle ground before raw
widgets: a **declarative UI layer** (extensions emit structured component
descriptions — block-kit style — that the host renders), which widens
expressiveness while preserving toolkit independence; design it from Pi's
`ctx.ui` surface first, per the porting rule above.

[译文]
**Ruling(裁定,2026-07 重申,子代理边界审计):** 当子代理 UX(agents 状态条、就地 agent 视图)必须在宿主侧基于通用数据接缝构建、而不能像 pi-subagents 那样由扩展交付时,「用字符串而非控件」这一选择被重新审视。经过考虑并被否决的是 pi 风格的组件接缝(`ctx.ui.custom` / `setHeader` / `setFooter` / `setEditorComponent`)。决定性的不对称在于:**Pi 自带 TUI 框架** —— `@earendil-works/pi-tui` 是 pi monorepo 中的兄弟包 —— 因此当 Pi 把 `Component` 交给扩展时,它暴露的是自己拥有的接口,可以与宿主同步演进。而 Tau 用**第三方工具箱 Textual** 渲染:控件接缝会把 Textual 的 API 提升为 Tau 的公开扩展契约,使每次 Textual 升级都可能成为生态破坏,并永远排除更换前端的可能。此外,字符串在每个前端(TUI、print 模式、未来的宿主)都能工作,且不会让渲染循环崩溃或卡死;到目前为止的扩展需求(对话框、消息渲染器、工具调用行、会话记录来源、主题)都可以用数据接缝表达。注意其实际后果:「从内核移除代码」的吸引力基本是幻觉 —— 功能确实会移出去,但内核会生长出一个控件托管层(挂载、生命周期、布局槽位、焦点/输入路由、错误隔离),其公开契约要大得多。**重新开启的触发条件:**(a)Tau 收回 UI 层的所有权(自研工具箱,或对 Textual 做硬抽象);(b)出现真实第三方扩展需求,且无法用数据接缝表达;(c)上游 tau 明确希望支持组件式扩展。在直接使用原生控件之前,优先考虑的折中是**声明式 UI 层**(扩展发出结构化的组件描述 —— block-kit 风格 —— 由宿主渲染),它在扩大表达能力的同时保持工具箱独立;按上面的移植规则,先以 Pi 的 `ctx.ui` 接口面为蓝本设计。

[原文]
**Ruling (superseded 2026-07-09 — component seam adopted):** reopen trigger
(b) fired in practice. Keeping the subagent UX host-side against data seams
forced agent vocabulary and agent UI *into* core (the agents strip and
in-place viewer lived in `tui/app.py`), which defeats the point of an
extension system. The `component-seam-experiment` branch then implemented the
raw-widget path end-to-end — the tau-subagents extension owns its entire UI
through `ComponentBridge` — and measured the cost the Ruling above predicted
(`component-seam-experiment.md` §8: core src grew ~+250 lines and the public
contract got heavier; the prediction held and is accepted). Decision: the
component seam is the **committed design**, not an experiment. The component
type is Textual's `Widget`; the coupling is owned deliberately — extensions
build against the Textual version tau pins, and a Textual major bump is a
coordinated break for core and extensions together. Strings remain the
preferred form wherever they suffice (message renderers, tool-call/result
renderers, string-list slot widgets — all frontend-portable and print-safe);
widgets are for extensions that need live, interactive UI. The declarative
middle ground stays available as a future *addition*, not a replacement.

[译文]
**Ruling(裁定,2026-07-09 被取代 —— 组件接缝被采纳):** 重新开启的触发条件 (b) 在实践中出现了。把子代理 UX 留在宿主侧、基于数据接缝实现,迫使 agent 词汇与 agent UI *进入*内核(agents 状态条与就地查看器住在 `tui/app.py`),这违背了扩展系统的初衷。随后 `component-seam-experiment` 分支端到端实现了原生控件路径 —— tau-subagents 扩展通过 `ComponentBridge` 拥有自己的全部 UI —— 并实测了上一条裁定所预测的代价(`component-seam-experiment.md` 第 8 节:内核源码增长约 +250 行,公开契约变得更重;预测成立并被接受)。决定:组件接缝是**既定设计**,不是实验。组件类型就是 Textual 的 `Widget`;这种耦合是被有意接受的 —— 扩展针对 tau 固定的 Textual 版本构建,Textual 的大版本升级是内核与扩展共同承担的协同破坏性变更。在够用的地方,字符串仍是首选形式(消息渲染器、工具调用/结果渲染器、字符串列表槽位控件 —— 都可跨前端移植且在 print 模式下安全);控件则留给需要实时交互 UI 的扩展。声明式折中方案仍作为未来的**增补**保留,而不是替代品。

[原文]
**Ruling (superseded by issue #704):** custom messages now match Pi's two-layer
model: runtime `role:"custom"` plus a first-class persisted `custom_message`
entry. Tau keeps its persisted entry-wrapper naming convention
(`parent_id`/`custom_type`), while RPC projection uses Pi's
`parentId`/`customType` wire names. The JSONL migration boundary converts both
the former generic `role:"custom"` entry and the older Tau-v1 user message with
`custom_type`; replay preserves model-visible content and metadata.

[译文]
**Ruling(裁定,已被 issue #704 取代):** 自定义消息现在匹配 Pi 的两层模型:运行时 `role:"custom"` 加上一等公民式的持久化 `custom_message` 条目。Tau 保留其持久化条目包装的命名约定(`parent_id`/`custom_type`),而 RPC 投射使用 Pi 的 `parentId`/`customType` 线上名称。JSONL 迁移边界会同时转换此前的通用 `role:"custom"` 条目与更早的、带 `custom_type` 的 Tau-v1 用户消息;重放会保留对模型可见的内容与元数据。

[原文]
**Ruling:** the resolver **never raises** into a render path. A missing
renderer, a renderer that throws, or one that returns a non-string all yield
`None` (recorded as a runtime diagnostic for the last two — deduplicated to
one diagnostic per `custom_type`, since render paths re-run on every redraw
and a persistently-broken renderer would otherwise grow diagnostics without
bound), and the frontend renders the raw `content`.
First-registration-per-`custom_type` wins, matching Tau's other extension
registries; the registry (and the failure-dedupe set) is cleared on `/reload`.

[译文]
**Ruling(裁定):** 解析器**绝不会**把异常抛进渲染路径。渲染器缺失、渲染器抛异常,或返回非字符串,都会得到 `None`(后两种情况会记录为运行时诊断 —— 并按 `custom_type` 去重为一条诊断,因为渲染路径在每次重绘时都会重跑,否则一个持续损坏的渲染器会让诊断无界增长),前端则渲染原始 `content`。按 `custom_type` 先注册者胜,与 Tau 其他扩展注册表一致;注册表(以及失败去重集合)在 `/reload` 时清空。

[原文]
**Ruling:** Pi's `sendMessage` `display` (hide from TUI while keeping in
context) and `triggerTurn` are **partly** ported, with weaker durability on
the no-turn path: with `trigger_turn=False` (or when no turn callback is
installed), Tau queues the message **in-memory** on the harness follow-up
queue — it is not yet visible in the transcript and is **silently lost if the
session exits before the next run**. Pi, by contrast, persists the message to
the session file and emits `message_start`/`message_end` immediately even
without triggering a turn (`agent-session.ts:1357-1370`). Extensions that need
a durable no-turn record should use `append_entry` alongside, or accept the
default turn-triggering delivery. `display=false` is honored by live and restored TUI paths and by HTML export;
the message remains in model context and complete JSONL data. Pi's parallel
`registerEntryRenderer`/`appendEntry`
(non-LLM-context cards) stays out of scope.

[译文]
**Ruling(裁定):** Pi `sendMessage` 的 `display`(在 TUI 中隐藏但保留在上下文中)与 `triggerTurn` 被**部分**移植,且在不触发轮次的路径上持久性更弱:当 `trigger_turn=False`(或未安装 turn 回调)时,Tau 把消息**在内存中**排入 harness 的 follow-up 队列 —— 它还不可见于会话记录,并且**如果会话在下次运行之前退出,就会被静默丢失**。相比之下,Pi 会把消息持久化到会话文件,并在即使不触发轮次的情况下也立即发出 `message_start`/`message_end`(`agent-session.ts:1357-1370`)。需要持久化「不触发轮次」记录的扩展应同时使用 `append_entry`,或接受默认的「触发轮次」投递方式。`display=false` 在实时与恢复的 TUI 路径以及 HTML 导出中都得到遵守;消息仍留在模型上下文与完整的 JSONL 数据中。Pi 中与之平行的 `registerEntryRenderer`/`appendEntry`(不进入 LLM 上下文的卡片)仍不在范围内。

[原文]
**Ruling:** delivery **defaults deviate from Pi**, deliberately matching Tau's
existing `send_user_message` semantics instead: Pi's `sendMessage` defaults to
`triggerTurn: false` and `deliverAs: "steer"` while streaming; Tau's
`send_custom_message` defaults to `trigger_turn=True` and
`deliver_as="follow_up"`. The tau-subagents notification path wants exactly
follow-up + turn-trigger (it passes `deliverAs: "followUp", triggerTurn: true`
explicitly in Pi too), and keeping one default across both send methods is
less surprising for extension authors. Callers can pass
`deliver_as="steer"`/`trigger_turn=False` for Pi-shaped behavior.

[译文]
**Ruling(裁定):** 投递的**默认值偏离 Pi**,而是有意匹配 Tau 既有的 `send_user_message` 语义:Pi 的 `sendMessage` 默认 `triggerTurn: false`,并且在流式期间默认 `deliverAs: "steer"`;而 Tau 的 `send_custom_message` 默认 `trigger_turn=True` 与 `deliver_as="follow_up"`。tau-subagents 的通知路径恰好需要 follow-up + 触发轮次(它在 Pi 中也显式传入 `deliverAs: "followUp", triggerTurn: true`),而且让两个发送方法共用同一套默认值,对扩展作者更不意外。调用方可以传入 `deliver_as="steer"`/`trigger_turn=False` 以获得 Pi 形态的行为。

[原文]
Note: two surfaces intentionally show a custom message's raw `content` rather
than its rendered markup: the session **HTML export**
(`session_export.py` renders messages from the persisted transcript without
the extension runtime) and the **queued-message preview**
(`harness.py` `queue_update_event` reports queued content strings). Both are
raw-text views by design; only live transcripts (TUI + print mode) render.

[译文]
注意:有两个界面有意展示自定义消息的原始 `content`,而不是渲染后的标记:会话 **HTML 导出**(`session_export.py` 在没有扩展运行时的情况下从持久化会话记录渲染消息)与**排队消息预览**(`harness.py` 的 `queue_update_event` 上报排队的内容字符串)。二者在设计上都是纯文本视图;只有实时会话记录(TUI + print 模式)才会渲染标记。

## 钩子接线:在不触碰 tau_agent 的前提下实现拦截 / Hook wiring (how interception works without touching tau_agent)

[原文]
- **Observation** — the runtime subscribes one listener via
  `AgentHarness.subscribe` and fans events out to extension handlers.
  Dispatch is skipped per event type when no handler is registered.
- **`tool_call` / `tool_result`** — every tool handed to
  `AgentHarnessConfig.tools` (built-in and extension alike) is wrapped: the
  wrapper executor runs `tool_call` hooks (which may block or replace
  `arguments`), calls the inner executor, then runs `tool_result` hooks over
  the `AgentToolResult`. Blocking returns an `ok=False` result carrying the
  block reason to the model. The loop's dispatch chokepoint
  (`loop.py:_execute_tool_calls`) stays untouched.
- **`input`** — `CodingSession.prompt` runs `input` hooks on the raw prompt
  text *before* skill/template expansion (matching Pi's
  command-check → input-event → expansion order; slash commands were already
  handled by `handle_command` before `prompt` is reached). `handled`
  consumes the input: the prompt generator returns without yielding run
  events, and the optional `message` is delivered through the UI bridge
  notification channel.
- **`send_user_message` / `send_custom_message`** — both funnel through one
  `_deliver_message` path. When a run is active, they map to
  `queue_steering_message` / `queue_follow_up_message` (which build a
  `CustomMessage` when `custom_type` is present). When idle, the runtime
  invokes a `turn_requested(content, custom_type, details)` callback (queuing a
  follow-up and calling `continue_()` would hit the provider with a stale
  transcript first, because the loop drains queues only after a turn). The
  TUI implements the callback by submitting through its existing exclusive
  prompt worker — the same serialization used for user submissions, so an
  extension turn can never race a user-initiated run; if a run starts while
  delivery is in flight, the message is queued as a follow-up instead. The
  custom metadata threads all the way to `CodingSession.prompt` →
  `harness.prompt`, so a custom message that starts an idle turn still renders
  and persists with its `custom_type`. Print mode and tests may leave the
  callback unset; messages then queue as follow-ups for the next run.
  `send_custom_message`'s `trigger_turn=False` forces the follow-up-queue path
  even when idle.
- **`append_entry`** — async; persists a `CustomEntry(namespace=..., data=...)`
  through the session's append path with proper parent linkage so the entry
  sits on the active root-to-leaf path (off-path custom entries are
  invisible to `SessionState` replay after resume).
- **`notify`** — routed to a `UiBridge` protocol owned by `CodingSession`;
  the TUI installs a Textual implementation, print mode gets a stderr
  fallback, tests install a recorder.

[译文]
- **观察** —— 运行时通过 `AgentHarness.subscribe` 订阅一个监听器,并把事件扇出给扩展处理器。当某个事件类型没有注册处理器时,该类型的分发会被跳过。
- **`tool_call` / `tool_result`** —— 交给 `AgentHarnessConfig.tools` 的每个工具(内置与扩展一视同仁)都会被包裹:包裹后的执行器先运行 `tool_call` 钩子(它们可以阻止或替换 `arguments`),再调用内层执行器,然后对 `AgentToolResult` 运行 `tool_result` 钩子。阻止会返回一个 `ok=False` 的结果,并把阻止原因带给模型。循环的分发咽喉点(`loop.py:_execute_tool_calls`)保持不动。
- **`input`** —— `CodingSession.prompt` 会在技能/模板展开**之前**,对原始提示文本运行 `input` 钩子(与 Pi 的「命令检查 → input 事件 → 展开」顺序一致;斜杠命令在到达 `prompt` 之前就已经由 `handle_command` 处理)。`handled` 会消费该输入:提示生成器直接返回、不产出运行事件,而可选的 `message` 会经 UI 桥的通知通道投递。
- **`send_user_message` / `send_custom_message`** —— 二者都汇入同一条 `_deliver_message` 路径。当有运行在进行时,它们映射到 `queue_steering_message` / `queue_follow_up_message`(当存在 `custom_type` 时,这些方法会构建 `CustomMessage`)。空闲时,运行时调用 `turn_requested(content, custom_type, details)` 回调(若改为「排队 follow-up 再调用 `continue_()`」,会先用陈旧的会话记录打到 provider,因为循环只在一轮结束之后才排空队列)。TUI 通过其既有的独占提示 worker 提交来实现该回调 —— 这与用户提交使用同一套串行化机制,因此扩展轮次永远不会与用户发起的运行竞态;若投递尚在途中时新一轮已经开始,消息会改为按 follow-up 排队。自定义元数据一路贯穿到 `CodingSession.prompt` → `harness.prompt`,因此启动空闲轮次的自定义消息仍会带着它的 `custom_type` 渲染与持久化。Print 模式与测试可以不安置该回调;此时消息会作为 follow-up 排队等待下次运行。`send_custom_message` 的 `trigger_turn=False` 即使在空闲时也会强制走 follow-up 队列路径。
- **`append_entry`** —— 异步;通过会话的追加路径持久化 `CustomEntry(namespace=..., data=...)`,并带有正确的父链接,使该条目落在活动的「根到叶」路径上(路径外的自定义条目在恢复后对 `SessionState` 重放不可见)。
- **`notify`** —— 路由到由 `CodingSession` 持有的 `UiBridge` 协议;TUI 安装 Textual 实现,print 模式得到 stderr 回退,测试则安装一个记录器。

## 会话集成与运行时生命周期(Session integration and runtime lifecycle)

[原文]
`CodingSessionConfig` gains:

[译文]
`CodingSessionConfig` 新增:

[原文]
- `extension_paths: tuple[Path, ...] = ()` — explicit extension files/dirs
- `extensions_enabled: bool = True` — directory discovery on/off
- `project_extensions_enabled: bool = False` — see Security
- `extension_runtime: ExtensionRuntime | None = None` — internal handoff for
  session replacement (resume/new/branch)

[译文]
- `extension_paths: tuple[Path, ...] = ()` —— 显式的扩展文件/目录
- `extensions_enabled: bool = True` —— 目录发现开/关
- `project_extensions_enabled: bool = False` —— 见「安全」
- `extension_runtime: ExtensionRuntime | None = None` —— 用于会话替换(resume/new/branch)的内部交接

[原文]
`CodingSession.load`:

[译文]
`CodingSession.load` 会:

[原文]
1. creates the runtime and discovers/loads extensions (via `loader.py`) —
   unless the config carries an existing runtime, in which case discovery
   and `setup` are **not** re-run;
2. merges extension tools with `create_coding_tools()` (extension override
   by name), wraps all tools with the hook wrapper;
3. builds the per-session command registry (defaults + extension commands);
4. builds the harness, binds the runtime (context + actions become live),
   subscribes the fan-out listener.

[译文]
1. 创建运行时并发现/加载扩展(经由 `loader.py`)—— 除非配置携带了既有运行时,此时**不会**重跑发现与 `setup`;
2. 把扩展工具与 `create_coding_tools()` 合并(按名称由扩展覆盖),并用钩子包裹器包裹所有工具;
3. 构建按会话的命令注册表(默认命令 + 扩展命令);
4. 构建 harness、绑定运行时(上下文与动作变为可用),并订阅扇出监听器。

[原文]
The runtime is **long-lived**: `resume`, `new_session`, and branch flows
construct their replacement session with `extension_runtime=` the current
runtime, then re-bind it to the new session/harness (old harness
subscription dropped, new one added) and emit
`session_shutdown`/`session_start` with the appropriate reason. Extension
`setup` therefore runs once per process per extension, not once per session
swap. `aclose` emits `session_shutdown(reason="quit")`.

[译文]
运行时是**长生命周期**的:`resume`、`new_session` 与分支流程会用 `extension_runtime=` 传入当前运行时来构建其替换会话,然后把它重新绑定到新会话/harness(丢弃旧 harness 订阅,添加新订阅),并以相应原因发出 `session_shutdown`/`session_start`。因此扩展的 `setup` 对每个扩展在每个进程中只运行一次,而不是每次会话替换运行一次。`aclose` 会发出 `session_shutdown(reason="quit")`。

[原文]
`CodingSession.reload` is async. The synchronous command registry returns a
`reload_requested` action, and each frontend awaits the session operation.
Reload first awaits `session_shutdown(reason="reload")` while the outgoing
extension generation is still active, clears its host UI, invalidates the old
generation, purges `tau_extension_*` modules from `sys.modules`, re-imports,
and re-runs `setup` on a fresh registration set. It then rebuilds the wrapped
tool list in place (`harness.config.tools` is mutable by design), rebuilds the
session command registry, re-subscribes the fan-out listener, and awaits
`session_start(reason="reload")` on the new generation. This lets shutdown
handlers clean up through their live API and start handlers remount UI before
reload reports completion. The summary includes an `extensions` category in
`CodingReloadSummary`.

[译文]
`CodingSession.reload` 是异步的。同步的命令注册表返回一个 `reload_requested` 动作,各个前端会 await 该会话操作。Reload 会先在旧扩展代际仍然活动时 await `session_shutdown(reason="reload")`,清空其宿主 UI,使旧代际失效,从 `sys.modules` 中清除 `tau_extension_*` 模块,重新导入,并在全新的注册集合上重跑 `setup`。随后它原地重建被包裹的工具列表(`harness.config.tools` 在设计上就是可变的),重建会话命令注册表,重新订阅扇出监听器,并在新代际上 await `session_start(reason="reload")`。这使 shutdown 处理器可以通过其实时 API 做清理,也允许 start 处理器在 reload 报告完成之前重新挂载 UI。摘要会在 `CodingReloadSummary` 中包含一个 `extensions` 类别。

[原文]
**Ruling:** reload invalidates prior extension instances (Pi's
`assertActive`/`invalidate` parity). Each load generation shares an
`ExtensionGeneration` token; `reset_for_reload` clears outgoing UI first, then marks the generation stale
and mints a fresh one, and every `ExtensionAPI` method/property and every
`ExtensionContext`/`ExtensionUi` read — trivial reads like `has_ui`
included, matching Pi's assert-on-everything — checks the token first and
raises `ExtensionError`. An orphaned background task holding a pre-reload
`tau` therefore fails loudly (and, when it fails inside a handler, is
recorded as a normal runtime diagnostic) instead of silently acting against
the new registration set. Rebinding does **not** invalidate — a deliberate
deviation from Pi, which replaces the runtime per session swap and hands
fresh contexts via `withSession`: Tau's runtime is long-lived across
resume/new/branch, the same extension instances continue by design, and
their context views simply reflect the newly bound session.

[译文]
**Ruling(裁定):** reload 会使先前的扩展实例失效(与 Pi 的 `assertActive`/`invalidate` 对等)。每个加载代际共享一个 `ExtensionGeneration` 令牌;`reset_for_reload` 先清空外出 UI,然后把该代际标记为陈旧并铸造一个新的;此后每个 `ExtensionAPI` 方法与属性、每次 `ExtensionContext`/`ExtensionUi` 读取 —— 包括 `has_ui` 这类琐碎读取,与 Pi 的「一切皆断言」一致 —— 都会先检查令牌,不通过则抛出 `ExtensionError`。因此,一个持有 reload 前 `tau` 的孤立后台任务会大声失败(并且当它在处理器内部失败时,会被记录为普通的运行时诊断),而不是悄悄对新注册集合乱做事。重新绑定**不会**使实例失效 —— 这是对 Pi 的有意偏离:Pi 在每次会话替换时替换运行时,并通过 `withSession` 交付新上下文;而 Tau 的运行时在 resume/new/branch 之间长期存活,同一批扩展实例按设计继续存在,它们的上下文视图只是反映新绑定的会话。

[原文]
Extension diagnostics (load-time and runtime handler failures) merge into
`resource_diagnostics`, so `/session` and `/reload` surface them with no
TUI changes.

[译文]
扩展诊断(加载期与运行时处理器失败)会并入 `resource_diagnostics`,因此 `/session` 与 `/reload` 无需任何 TUI 改动就能呈现它们。

## 安全(Security)

[原文]
Project extensions execute arbitrary Python at session startup — cloning a
hostile repo and running `tau` inside it must not be code execution. Pi
gates this behind a project-trust prompt; Tau does not have a trust store
yet. **Ruling:** project-directory extensions are **disabled by default**
in v1. `<cwd>/.tau/extensions/` loads only with the explicit
`--project-extensions` CLI flag. User extensions (`~/.tau/extensions/`) and
explicit `-e` paths load by default; `--no-extensions` turns directory
discovery off entirely. A per-project trust prompt is the immediate
follow-up that can flip the project default.

[译文]
项目扩展会在会话启动时执行任意 Python —— 克隆一个恶意仓库并在其中运行 `tau`,绝不能等于代码执行。Pi 用项目信任提示来把守这一关;Tau 尚无信任存储。**Ruling(裁定):** v1 中项目目录扩展**默认禁用**。`<cwd>/.tau/extensions/` 仅在显式传入 `--project-extensions` CLI 参数时加载。用户扩展(`~/.tau/extensions/`)与显式的 `-e` 路径默认加载;`--no-extensions` 会完全关闭目录发现。按项目的信任提示是接下来的直接后续项,它可以翻转项目默认值。

## 示例扩展:子代理(Example extension: subagents)

[原文]
The subagents extension lives in its own repository
(`rian-dolphin/tau-subagents`) rather than in this repo. It ports
the core of `tintinweb/pi-subagents` and doubles as the reference consumer
of the newer API seams (manifest, dialogs, renderers, `on_update`,
`context.transcript`), feature-detecting each so it loads on older builds:

[译文]
子代理扩展位于它自己的仓库(`rian-dolphin/tau-subagents`),而不在本仓库中。它移植了 `tintinweb/pi-subagents` 的核心,并作为较新 API 接缝(清单、对话框、渲染器、`on_update`、`context.transcript`)的参考消费者,对每一项做特性探测,以便在较旧构建上也能加载:

[原文]
- a `src/`-layout package whose `pyproject.toml` declares
  `[tool.tau] extensions = ["src/tau_subagents/extension.py"]` — the
  manifest's reference user;
- registers an `agent` tool (`prompt`, `description`, `subagent_type`,
  `run_in_background`, plus `model`/`thinking`/`max_turns`/`resume`/
  `isolation`/`inherit_context`/`schedule`), `get_subagent_result`,
  `steer_subagent`, and an `/agents` command that opens a `context.ui`
  dialog menu when a UI is attached;
- agent types come from `.tau/agents/*.md` / `~/.tau/agents/*.md` files
  with frontmatter (`description`, `tools`, `model`, `thinking`,
  `max_turns`, `prompt_mode`, `memory`, `isolation`, …) — same shape as
  Pi's agent definitions (a new convention owned by the example, alongside
  the existing `.agents/` resource dirs);
- spawns subagents **in-process** by constructing a scoped `CodingSession`
  (in-memory storage, tool allow-list, own system prompt,
  `extensions_enabled=False` so subagents cannot recursively spawn) — the
  Python analog of Pi's `createAgentSession`, no CLI subprocess needed;
- foreground runs block, stream child activity through the `on_update`
  seam, and return the subagent's final assistant text; background runs
  return an id immediately and deliver completion through
  `send_custom_message(custom_type="subagent-notification",
  deliver_as="follow_up")` — rendered by its registered message renderer,
  falling back to `send_user_message` on older builds — which also
  exercises the idle `turn_requested` path.

[译文]
- 一个 `src/` 布局的包,其 `pyproject.toml` 声明 `[tool.tau] extensions = ["src/tau_subagents/extension.py"]` —— 清单的参考使用者;
- 注册一个 `agent` 工具(`prompt`、`description`、`subagent_type`、`run_in_background`,以及 `model`/`thinking`/`max_turns`/`resume`/`isolation`/`inherit_context`/`schedule`)、`get_subagent_result`、`steer_subagent`,以及一条 `/agents` 命令;当有 UI 挂载时,该命令会打开 `context.ui` 对话框菜单;
- agent 类型来自 `.tau/agents/*.md` / `~/.tau/agents/*.md` 文件,带 frontmatter(`description`、`tools`、`model`、`thinking`、`max_turns`、`prompt_mode`、`memory`、`isolation`……)—— 与 Pi 的 agent 定义形态相同(这是由该示例拥有的新约定,与既有的 `.agents/` 资源目录并存);
- 通过构造一个受限的 `CodingSession`(内存存储、工具白名单、自有系统提示词、`extensions_enabled=False` 以免子代理递归派生)**在进程内**派生子代理 —— 这是 Pi `createAgentSession` 的 Python 对应物,无需 CLI 子进程;
- 前台运行会阻塞,通过 `on_update` 接缝流式输出子代活动,并返回子代理最终的 assistant 文本;后台运行会立即返回一个 id,并通过 `send_custom_message(custom_type="subagent-notification", deliver_as="follow_up")` 投递完成通知 —— 由它注册的消息渲染器渲染,在较旧构建上回退到 `send_user_message` —— 这也演练了空闲时的 `turn_requested` 路径。

[原文]
Smaller examples: `hello_tool.py` (minimal tool), `permission_gate.py`
(`tool_call` blocking for dangerous bash commands), and `sidebar_status.py`
(host-framed sidebar updates).

[译文]
更小的示例:`hello_tool.py`(最小工具)、`permission_gate.py`(针对危险 bash 命令的 `tool_call` 阻止),以及 `sidebar_status.py`(宿主框定的侧边栏更新)。

## 验证(Verification)

[原文]
- `tests/test_extensions.py`: discovery order and precedence, synthetic
  module naming, package-style relative imports, broken-extension
  isolation, sync-only `setup` enforcement, tool registration/override,
  command registration/duplicate handling, event fan-out, `tool_call`
  block + argument mutation, `tool_result` transform, `input`
  transform/handled, send_user_message queueing and idle turn-request,
  append_entry persistence and on-path replay, reload including module
  purge and stale-listener replacement, runtime survival across
  resume/new.
- `tests/test_coding_session.py` additions for session wiring; TUI
  autocomplete pickup via existing autocomplete tests.
- Full gate: `uv run pytest && uv run ruff check . && uv run mypy`.

[译文]
- `tests/test_extensions.py`:发现顺序与优先级、合成模块命名、包式相对导入、损坏扩展的隔离、`setup` 只能同步的强制约束、工具注册/覆盖、命令注册/重复处理、事件扇出、`tool_call` 阻止 + 参数修改、`tool_result` 转换、`input` 转换/handled、`send_user_message` 排队与空闲 turn 请求、`append_entry` 持久化与路径内重放、包含模块清除与陈旧监听器替换的 reload、运行时在 resume/new 之间的存活。
- `tests/test_coding_session.py` 中针对会话接线的补充;TUI 自动补全的接入由既有自动补全测试覆盖。
- 完整关卡:`uv run pytest && uv run ruff check . && uv run mypy`。
