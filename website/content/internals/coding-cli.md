---
title: tau_coding · CLI 入口
description: cli.py —— Typer 命令行
---

## 4. `cli.py` — the Typer entry point

This is the user-facing binary (`tau`). It is built on **Typer** and composes the
whole stack. At import it even calls `_force_utf8_streams()` to reconfigure
stdout/stderr to UTF-8 on platforms (Windows) whose console codepage would
otherwise raise on non-ASCII model output.

```python
app = typer.Typer(name="tau", add_completion=False,
                  context_settings={"allow_extra_args": True, ...})


@app.callback(invoke_without_command=True)
def main(ctx, prompt_args, prompt_option, provider, model, setup_*,
         cwd, output, resume, new_session, auto_compact_threshold,
         extension, no_extensions, project_extensions, version) -> None: ...
```

What `main` does:

1. **Version / subcommand dispatch.** `--version` prints `tau <version>`. If a
   real subcommand was invoked it returns early. Simple verb commands are handled
   positionally: `tau sessions` lists sessions, `tau providers` lists configured
   providers (`providers_command`), `tau setup` creates/updates an
   OpenAI-compatible provider (`setup_command` → `upsert_openai_compatible_provider`
   + `save_provider_settings`), and `tau export <ref> [--format html|jsonl] [out]`
   exports a session (`export_session_command`).
2. **TUI vs print mode.** If no `--prompt`/`-p` is given, it runs
   `run_openai_tui` (→ `run_tui_app` from `tui`, 3d), passing model, cwd, resume,
   new-session, provider, auto-compact threshold, initial prompt, startup
   notices, and the extension flags. If `--prompt` is given, it runs
   `run_openai_print_mode` (→ `run_print_mode`), which uses the plain/JSON
   `EventRenderer`s from `rendering` (3c).
3. **Provider + session setup (print mode).** `run_openai_print_mode` loads
   `ProviderSettings`, resolves the selection (`resolve_provider_selection`),
   builds the `ModelProvider` via `create_model_provider`
   (`provider_runtime.py`, 3c) with `DEFAULT_THINKING_LEVEL`, creates a
   `CodingSessionRecord` via `SessionManager`, and drives `run_print_mode`.
4. **`run_print_mode`** is the non-interactive workhorse: it builds a
   `CodingSession` via `CodingSession.load(CodingSessionConfig(...))`, installs a
   `StderrUiBridge` for extensions, emits pending `session_start`, picks an
   `EventRenderer`, then either runs a slash command / terminal command or streams
   `session.prompt(prompt)` through the renderer. It returns `False` on a
   non-recoverable error so the CLI can exit non-zero.
5. **Extension flags** `--extension/-x` (repeatable explicit paths),
   `--no-extensions` (disable directory discovery; explicit `-x` still load), and
   `--project-extensions` (also load `<cwd>/.tau/extensions`) are threaded through
   to both frontends.

`cli.py` is intentionally a **composition root**: it knows about every other
piece but contains no agent logic, no rendering internals, and no provider
specifics beyond wiring names to config functions.

---

<!-- NAV -->
[← tau_coding · OAuth 登录流程]({{< relref "./coding-oauth.md" >}})
[↑ 总览]({{< relref "./source-walkthrough.md" >}})
[→ tau_coding · 扩展系统]({{< relref "./coding-extensions.md" >}})
