---
title: tau_coding · 渲染层(print/json)
description: rendering/plain.py / rendering/json.py
---

## `tau_coding/rendering/plain.py` — print-mode final text

`FinalTextRenderer` is the simplest output backend, used in `--no-tui` /
print mode.

- It listens for `MessageEndEvent` and remembers the last assistant text.
- It collects `ErrorEvent`s; non-recoverable ones mark the run as failed.
- `finish()` prints the final assistant text (or each error to stderr) and
  returns whether the run succeeded.

So in print mode, you see *only* the model's final answer, not the streaming
intermediate events.

## `tau_coding/rendering/json.py` — JSONL event stream

`JsonEventRenderer` is the machine-readable backend (used for scripting/CI).

- `render(event)` — writes `event.model_dump_json()` as one line per event,
  flagging non-recoverable errors as failure.
- `finish()` — returns whether the run succeeded.

Every `AgentEvent` (defined in Part 2a) becomes one JSON object per line,
which is exactly the stream the TUI and downstream tools can parse.

> Both renderers consume the *same* `AgentEvent` union the agent loop emits.
> This is the AGENTS.md boundary in action: the harness emits events; each
> frontend (TUI, plain, json) consumes them independently.

---

## How 3c fits the whole picture

- `commands.py` adapts user input (`/model`, `/new`, …) to `CodingSession`
  methods (Part 3b).
- `session_manager.py` indexes every `CodingSession` so the CLI can list and
  resume across runs.
- `provider_catalog.py` (static reference) → `provider_config.py` (durable,
  user-customizable, validated) → `provider_runtime.py` (live `tau_ai`
  provider). This three-step pipeline is how Tau goes from "provider name" to
  "streaming connection."
- `rendering/*` are the non-TUI output backends that turn agent events into
  text or JSONL.

Next: **Part 3d** covers the Textual TUI (`tui/state.py`, `tui/adapter.py`,
`tui/app.py`, `tui/config.py`, `tui/autocomplete.py`) — the richest frontend
and the last major piece before the auth/CLI/extensions layer in **Part 3e**.

<!-- NAV -->
[← tau_coding · Provider 配置]({{< relref "./coding-provider-config.md" >}})
[↑ 总览]({{< relref "./source-walkthrough.md" >}})
[→ tau_coding · TUI 状态与适配]({{< relref "./coding-tui-state.md" >}})
