---
title: tau_coding · 渲染层
description: rendering/ 包全貌
---

## `tau_coding/rendering/base.py` — shared rendering primitives

The contract shared by every non-interactive output renderer. It is tiny on
purpose: print mode, JSON mode, and transcript mode all implement the same two
methods.

- **`PrintOutputMode(StrEnum)`** — the output modes for non-interactive print
  mode:
  - `text = "text"` — streamed human-readable assistant text + tool activity.
  - `json = "json"` — one JSON object per agent event (machine-readable).
  - `transcript = "transcript"` — a structured transcript (events + session
    framing) for archival/replay.
- **`EventRenderer(Protocol)`** — the renderer interface every mode satisfies:
  - `render(self, event: AgentEvent) -> None` — consume and emit one event.
  - `finish(self) -> bool` — finalize and report whether the run *succeeded*
    (so the CLI can choose the process exit code).

> Design note: by defining the renderer as a Protocol with exactly two methods,
> Tau can swap output formats (text / json / transcript) without touching the
> agent loop or `CodingSession`. The loop just calls `render(event)` for each
> event; the renderer decides what to print. This is the same event-consumer
> boundary the TUI uses (Part 3d), just on stdout/stderr instead of widgets.

---

## `tau_coding/rendering/transcript.py` — streaming transcript renderer

`TranscriptRenderer` is the concrete `EventRenderer` for `PrintOutputMode.text`.
It streams assistant text to **stdout** and tool/status activity to **stderr**,
so the model's raw output stays cleanly separable from Tau's own chatter (you can
pipe stdout to a file and still watch progress on stderr).

- **Constructor:** `custom_message_renderer: CustomMessageMarkup | None` — an
  optional hook (from `extensions/api.py`) letting extensions render their own
  custom messages; `Console(stderr=True, highlight=False)` for status lines;
  flags `_assistant_started` / `_assistant_ended` / `_failed` track stream state.
- **`render(event)`** — an `isinstance` dispatch over the `AgentEvent` hierarchy:
  - `MessageStartEvent` — reset the per-message started/ended flags (a fresh
    assistant turn).
  - `MessageDeltaEvent` — set `_assistant_started` and `typer.echo(event.delta,
    nl=False)` to stdout (no trailing newline, so tokens concatenate).
  - `ToolExecutionStartEvent` — `_ensure_assistant_newline()` then print the
    cyan `format_tool_call_block(event.tool_call)` (a `tui/state.py` helper, so
    print mode reuses the TUI's tool-call formatting).
  - `ToolExecutionUpdateEvent` — print `… <message>` in `bright_black` (status
    like "editing file").
  - `RetryEvent` — same `… <message>` dim style (agent-layer retries, e.g. after
    a recoverable provider error).
  - `ToolExecutionEndEvent` — print `✓`/`✗` in green/red plus the tool name; if
    the result has content, `_print_tool_content` indents each line in white.
  - `ErrorEvent` — if `not recoverable`, set `_failed = True`; print
    `Error: <message>` in red.
  - `MessageEndEvent` — render any extension custom message
    (`_render_custom_message`), then ensure a final newline.
  - `AgentEndEvent` — ensure a final newline.
- **`_render_custom_message(event)`** — only acts on `role == "user"` messages
  with a `custom_type`; asks the registered `CustomMessageMarkup` for markup and
  renders it via `Text.from_markup`, falling back to plain `Text(markup)` if the
  markup is malformed (a bad extension string must never crash print mode).
- **`finish() -> bool`** — returns `not self._failed`; the CLI uses this for the
  exit code.
- **`_ensure_assistant_newline(*, final)`** — the newline bookkeeping: if
  assistant text was streamed but not yet terminated, emit one newline and mark
  ended; on `final` with no text started, just mark ended so subsequent
  tool/error lines begin on a fresh line. This keeps stdout/stderr interleaving
  visually correct.
- **`_print_tool_line` / `_print_tool_content`** — low-level styled printers for
  tool status rows.

> Design note: the split between stdout (model text) and stderr (Tau's tool
> status) is a deliberate Unix-friendly choice — `tau … > out.txt` captures only
> the assistant's words, while progress still appears on the terminal. Reusing
> `format_tool_call_block` from `tui/state.py` means print mode and the TUI show
> *identical* tool formatting from a single source of truth.

---

## `tau_coding/rendering/json.py` — JSONL event renderer

`JsonEventRenderer` is the `PrintOutputMode.json` renderer: the machine-readable
path for piping/automation.

- **`render(event)`** — emits `event.model_dump_json()` as one JSON object per
  line (JSONL). On a non-recoverable `ErrorEvent` it sets `_failed = True` (but
  still prints the error event, so the stream stays complete).
- **`finish() -> bool`** — `not self._failed`.

> Design note: because every `AgentEvent` is a pydantic model, dumping to JSON is
> a one-liner — JSON mode gets full event fidelity for free, with no custom
> serialization.

## `tau_coding/rendering/plain.py` — Pi-style final-text renderer

`FinalTextRenderer` is the `PrintOutputMode.text` renderer, matching Pi's
behavior: it discards streaming noise and prints **only the final assistant
message** (or errors) once the run ends.

- **`render(event)`** — records `_last_assistant_text` from each
  `MessageEndEvent` (so the *last* turn wins), and appends non-recoverable error
  messages to `_error_messages` while setting `_failed`.
- **`finish() -> bool`** — if failed, echoes each `Error: <message>` to **stderr**
  and returns `False`; otherwise echoes the last assistant text to stdout and
  returns `True`.

> Design note: this is the most "silent" renderer — no tool calls, no progress.
> It exists for users who want just the agent's answer, Pi-style.

## `tau_coding/rendering/__init__.py` — package boundary

Ties the renderers together and provides the factory:

- Re-exports `EventRenderer`, `PrintOutputMode`, `TranscriptRenderer`,
  `JsonEventRenderer`, `FinalTextRenderer`.
- **`create_event_renderer(mode, *, custom_message_renderer=None)`** — the single
  switch: `PrintOutputMode.text` → `FinalTextRenderer()`,
  `PrintOutputMode.json` → `JsonEventRenderer()`, and any other mode
  (`transcript`) → `TranscriptRenderer(custom_message_renderer=…)`. The CLI calls
  this to pick the output path by flag.

> Design note: `create_event_renderer` is the only place that hard-codes the
> mode→renderer mapping. Adding a fourth output mode means editing this one
> factory plus one new `EventRenderer`, and nothing else in the call chain
> changes.

## How 3g fits the picture

- `rendering/base.py` — the `EventRenderer` Protocol + `PrintOutputMode` enum
  that let output format be a runtime choice, not a code change.
- `rendering/transcript.py` — the concrete text renderer: streams assistant
  tokens to stdout, tool/status to stderr, and honors extension custom messages.

With Part 3g the tutorial has now dissected **every** module across
`tau_ai → tau_agent → tau_coding`, bottom-up and file-by-file, including the
modules that were previously uncovered: the provider catalog loader, branch
summaries, diagnostics, prompt templates, reload summary, session export, shell
config, thinking primitives, the update check, the version helper, and the
rendering layer. The only path from the original gap audit that does *not* exist
in the source is `extensions/base.py` (the extension system lives in
`extensions/{api,loader,runtime,__init__}.py`, covered in Part 3e).

<!-- NAV -->
[← tau_coding · 支撑模块(二)]({{< relref "./coding-support-2.md" >}})
[↑ 总览]({{< relref "./source-walkthrough.md" >}})
