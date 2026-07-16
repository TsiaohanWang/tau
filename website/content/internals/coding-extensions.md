---
title: tau_coding · 扩展系统
description: extensions/ 包与 __init__
---

## 5. `extensions/` — the extension system

This is the most architecturally interesting part of `tau_coding`. It lets
third-party code hook into the agent at runtime without forking Tau. It is split
into three files mirroring "API contract", "discovery/loading", and
"runtime dispatch".

### 5.1 `extensions/__init__.py`

Pure re-exports so callers can do `from tau_coding.extensions import ExtensionAPI,
ExtensionRuntime, load_extensions, StderrUiBridge, ...`. It ties the three
submodules together at the package boundary.

### 5.2 `extensions/api.py` — the contract

`ExtensionAPI` is the object passed to every extension's `setup(tau)` function.
It exposes the *safe* surface: `register_tool`, `register_command`,
`register_message_renderer`, `register_prompt_guideline`, `subscribe`, and
actions like `send_user_message` / `send_custom_message` / `append_custom_entry`.
Every method validates against the active `ExtensionGeneration`; an API object
from a reloaded generation raises `ExtensionError`.

Supporting types: `ExtensionHandler`, `ExtensionCommandHandler`,
`ExtensionCommandContext`, `MessageRenderer`, `MessageRenderOptions`,
`CustomMessageView`, `InputEvent`, `InputHookResult`, `ToolCallHookEvent`/
`ToolCallHookResult`, `ToolResultHookEvent`/`ToolResultHookResult`,
`SessionStartEvent`/`SessionShutdownEvent`, `RegisteredExtension`,
`ExtensionGeneration`, `ExtensionError`, `UiBridge`/`NullUiBridge`, plus the
`AGENT_EVENT_TYPES` / `LIFECYCLE_EVENT_TYPES` / `AGENT_EVENT_WILDCARD` constants.

### 5.3 `extensions/loader.py` — discovery and import

This file answers "what extensions exist and how do I import them safely?"

**Data types:** `DiscoveredExtension` (name, path, optional package_dir) — a
candidate before import; `LoadedExtension` (name, path, `setup` callable) — after
a successful import; `ExtensionLoadResult` (loaded extensions + non-fatal
diagnostics).

**Discovery rules (`discover_extensions`):**

- `extension_dirs(...)` returns load directories **project-first, then user**
  (`<cwd>/.tau/extensions`, then `<root>/extensions`). Earlier dirs win name
  conflicts (project extensions shadow user ones). Project dirs are opt-in
  (`--project-extensions`) because they execute at session startup (a trust
  concern).
- A directory is scanned for `*.py` files (skipping `_`/`.` prefixed) or a
  subdirectory containing `extension.py`, or a `pyproject.toml` manifest under
  `[tool.tau] extensions = [...]`.
- Explicit `--extension <path>` entries always load, even with `--no-extensions`
  (the escape hatch that disables resource-dir discovery).
- Duplicate names are reported as diagnostics; first-seen wins.

**Loading (`load_extensions` → `_load_extension`):**

- Each entry gets a unique synthetic module name
  (`tau_extension_<slug>_<counter>`) so two extensions can't collide in
  `sys.modules`.
- Directory extensions load as **real packages** (`submodule_search_locations`)
  so their sibling modules are reachable via relative imports.
- Import errors, missing `setup`, or an **async** `setup` are all caught and
  turned into `ResourceDiagnostic`s — one bad extension never kills the others
  (the "extensions are an isolation boundary" principle).
- `unload_extension_modules()` removes the synthetic modules so a `/reload`
  re-imports fresh objects.

### 5.4 `extensions/runtime.py` — the orchestration core

`ExtensionRuntime` is the long-lived owner of all extensions. It outlives any
single `CodingSession` (resume/new re-bind it; `/reload` replaces the
registration set).

**Construction & lifecycle:**

- `__init__` initializes empty registries for extensions, tools, commands,
  prompt guidelines, message renderers, diagnostics, plus a `BoundSession` slot
  and a `UiBridge`.
- `load(...)` discovers+imports, then calls `_setup_extension` for each, handing
  it a fresh `ExtensionAPI` bound to the current `ExtensionGeneration`.
- `reset_for_reload()` tears down host UI, **invalidates** the current
  generation (so stale API objects raise), clears all registrations, and
  unloads modules — then a fresh `load` rebuilds everything.
- `bind(session)` attaches a `BoundSession` (the protocol slice of
  `CodingSession` the runtime needs: `cwd`, `model`, `provider_name`,
  `session_id`, `system_prompt`, `is_running`, `messages`, plus
  `queue_steering_message` / `queue_follow_up_message` / `append_custom_entry`).

**Registration (called via `ExtensionAPI`):**

- `register_tool` / `register_command` / `register_message_renderer` /
  `register_prompt_guideline` — all "first registration per name wins";
  duplicates are diagnosed, not fatal.
- `subscribe(event, handler)` validates the event name against the known agent
  and lifecycle event sets, then appends the handler.

**Tool wrapping (`compose_tools` / `_wrap_tool`):**

- `compose_tools(builtin_tools)` merges built-in + extension tools; an extension
  tool with a built-in's name **overrides in place**.
- Each tool is wrapped so that, on every call, `tool_call` hooks run first
  (they can **block** the call or rewrite `arguments`), then the real executor
  runs, then `tool_result` hooks can rewrite `content`/`ok`/`details`. This is
  the "hook seam" around every tool — the central extension power feature.

**Event dispatch:**

- `attach_harness_listener(subscribe)` wires `_on_agent_event` into the harness's
  event stream. `_on_agent_event` fans out to handlers subscribed to the event
  type **and** to the `AGENT_EVENT_WILDCARD` subscribers.
- `run_input_hooks(text, ...)` runs `input` hooks over prompt text; transforms
  chain, and a `handled` result short-circuits submission.
- `emit_session_start` / `emit_session_shutdown` dispatch the lifecycle events.
- Every handler invocation is wrapped in try/except; failures are recorded as
  runtime diagnostics (via `_record_runtime_failure` / `_record_bad_result`)
  rather than crashing the host.

**Rendering integration:**

- `render_custom_message` / `render_tool_call` / `render_tool_result` are
  installed into the frontends. Missing or failing renderers yield `None` so the
  UI falls back to generic formatting. Failures are tracked once per
  type/tool to avoid diagnostic blow-up on every redraw.

**Message delivery (`send_user_message` / `send_custom_message`):**

- If the session is running, the message is queued as a steering or follow-up
  message. If idle and a `turn_requested` callback is installed (the TUI's
  exclusive worker), it triggers a new turn through the same serialized path as
  user input — so extension turns can't race user runs. Otherwise it queues for
  the next run.

**Command execution (`build_command_registry` / `_command_handler`):**

- Merges built-in commands with extension commands into a `CommandRegistry`.
  Each extension command is wrapped so its handler receives an
  `ExtensionCommandContext` (with `.args` and `.api`) and its exceptions are
  captured into a `CommandResult`.

---

## 6. `tau_coding/__init__.py` — public exports

The package's top-level `__init__.py` re-exports a broad, stable surface (and
sets `__version__`) so external code, the CLI, and tests can import from
`tau_coding` directly. The exported names fall into these groups:

- **Session / commands:** `CodingSession`, `CodingSessionConfig`, `CommandRegistry`,
  `CommandResult`, `SlashCommand`, `create_default_command_registry`,
  `ModelChoice`, `SessionTreeBranchResult`, `SessionTreeChoice`,
  `jsonl_session_storage`, `default_session_path`.
- **Sessions on disk:** `CodingSessionRecord`, `SessionManager`,
  `SessionExportError`, `default_session_export_path`, `export_session_html`,
  `render_session_html`.
- **Providers:** `ProviderConfig`, `ProviderConfigError`, `ProviderSelection`,
  `ProviderSettings`, `ScopedModelConfig`, `AnthropicProviderConfig`,
  `OpenAICompatibleProviderConfig`, `OpenAICodexProviderConfig`,
  `BUILTIN_PROVIDER_CATALOG`, `ProviderCatalogEntry`, `builtin_provider_entry`,
  `DEFAULT_MODEL`, `DEFAULT_PROVIDER_NAME`, plus the many `load_*`/`upsert_*`/
  `resolve_*`/`provider_*` helpers from `provider_config` and `provider_catalog`.
- **Credentials / OAuth:** `FileCredentialStore`, `OAuthCredential`,
  `CredentialStoreError`, `credentials_path`, and from `oauth_registry`/
  `oauth_types`: `get_oauth_provider`, `get_oauth_providers`,
  `register_oauth_provider`, `unregister_oauth_provider`, `reset_oauth_providers`,
  `OAuthAuthInfo`, `OAuthDeviceCodeInfo`, `OAuthLoginCallbacks`, `OAuthPrompt`,
  `OAuthProvider`, `OAuthRuntimeAuth`.
- **Context / skills / system prompt:** `Skill`, `build_skill_index`,
  `expand_skill_command`, `format_skill_invocation`, `parse_skill_invocation`,
  `load_skills`, `discover_project_context`,
  `BuildSystemPromptOptions`, `ProjectContextFile`, `build_system_prompt`,
  `collect_prompt_guidelines`, `format_*`, `PromptTemplate`, `render_prompt_template`,
  `load_prompt_templates`.
- **Context window / compaction:** `DEFAULT_COMPACTION_*`,
  `DEFAULT_CONTEXT_WINDOW_TOKENS`, `SUMMARIZATION_SYSTEM_PROMPT`,
  `estimate_*_tokens`, `auto_compaction_threshold_for_context_window`,
  `build_compaction_summary_prompt`, `serialize_messages_for_compaction`,
  `summarize_messages_for_compaction`.
- **Tools / thinking / rendering / resources / shell / paths / version:**
  `ToolDefinition`, `create_bash_tool` (+`_definition`), `create_edit_tool`(+),
  `create_read_tool`(+), `create_write_tool`(+), `create_coding_tools`,
  `DEFAULT_THINKING_LEVEL`, `THINKING_LEVELS`, `ThinkingLevel`,
  `ThinkingParameter`, `ReasoningEffort`, `normalize_thinking_levels`,
  `reasoning_effort_for_level`, `EventRenderer`, `FinalTextRenderer`,
  `JsonEventRenderer`, `TranscriptRenderer`, `PrintOutputMode`,
  `create_event_renderer`, `ResourceDiagnostic`, `ResourceError`,
  `TauResourcePaths`, `TauPaths`, `ShellSettings`, `load_shell_settings`,
  `ShellConfigError`, and `current_version`.

This is the stable "front door" of `tau_coding`; `cli.py` and the TUI import
through it. The `extensions` subpackage is imported separately (its surface is
re-exported from `tau_coding.extensions`).

---

## 7. How 3e fits the whole picture

Putting the entire `tau_coding` layer together (parts 3a–3e):

```
                  cli.py (Typer entry point + subcommands)
                        │
        ┌───────────────┼───────────────────────────────┐
        ▼               ▼                                ▼
 resources        provider_* (catalog/config/runtime)   extensions/*
 (3a)             (3c)                                   (3e)
        │               │                                │
        └───────┬───────┴────────────────┬───────────────┘
                ▼                        ▼
          session.py (3b)          commands.py (3c)
          CodingSession             /login, /new, ...
                │
        ┌───────┴────────┐
        ▼                ▼
   tui/* (3d)      rendering/* (3c)
   TauTuiApp       plain / json
```

- **`credentials` + `oauth*`** are the *authentication backbone*: they let a
  provider id in `providers.json` become a live, refreshable `ModelProvider`
  (`provider_runtime.py`, 3c). Credentials persist to `credentials.json` (never
  `providers.json`); each provider turns a stored `OAuthCredential` into request
  auth via `runtime_auth`.
- **`cli.py`** is the *composition root*: it is the only place that knows about
  all the other pieces, handles the `sessions`/`providers`/`setup`/`export`
  subcommands, and decides which frontend (TUI or print mode) to launch.
- **`extensions/*`** is the *extensibility spine*: discovery (`loader`) →
  registration (`api`) → runtime dispatch and hook seams (`runtime`). It lets
  `tau_coding` stay open for third-party behavior without modifying core code.

With this part complete, **every file in `tau_coding` has been dissected**, and
together with `tau_ai` (parts 1a–1b) and `tau_agent` (parts 2a–2d) we now have a
full bottom-up walkthrough of the entire Tau codebase.

---

*Next: merge parts 1a, 1b, 2a, 2b, 2c, 2d, 3a, 3b, 3c, 3d, 3e into a single
tutorial document.*

<!-- NAV -->
[← tau_coding · CLI 入口]({{< relref "./coding-cli.md" >}})
[↑ 总览]({{< relref "./source-walkthrough.md" >}})
[→ tau_coding · 支撑模块(一)]({{< relref "./coding-support-1.md" >}})
