---
title: tau_coding · Slash 命令
description: commands.py
---

## `tau_coding/commands.py` — slash commands

This file registers the slash commands (`/help`, `/login`, `/model`, `/new`,
`/clear`, `/compact`, etc.) that a user can type at the prompt instead of a
normal message.

### `LOGIN_PROVIDER_ALIASES`

A module-level `dict[str, tuple[str, str]]` mapping a friendly alias to a pair
`(provider_name, login_method)`. Its two real entries are:

```python
LOGIN_PROVIDER_ALIASES = {
    "anthropic-api": ("anthropic", "api-key"),
    "anthropic-subscription": ("anthropic", "subscription"),
}
```

So typing `/login anthropic-api` resolves to the `anthropic` provider with the
API-key method, and `/login anthropic-subscription` to the subscription (OAuth)
method. There is **no** `huggingface`/`hf` alias. The constant exists so the
command layer and the catalog stay in sync without the command layer hardcoding
provider names; the `(provider, method)` pair is unpacked in the login command.

### `CommandRegistry`

The central object that *owns* the available commands.

- **Constructor** — builds a mapping of command name → `SlashCommand`. A
  `SlashCommand` bundles the name, description, usage, handler
  (`(CommandContext) -> CommandResult`), aliases, and search terms.
- **`register(command: SlashCommand)`** — add or override a command (raises
  `ValueError` on a duplicate name).
- **`get(name)`** — return the `SlashCommand` for a name (or alias), or `None`.
- **`list_commands()`** — return the `tuple[SlashCommand, ...]` sorted by name,
  used by the TUI autocomplete and the `/help` listing.

The registry is deliberately *dumb*: it does not know what each command does.
That keeps the application wiring (which commands exist) separate from the
`CodingSession` logic (what each command changes in the session). When you add a
new slash command, you register it here; the `CodingSession` methods it calls
were built in Part 3b.

> Design note: this mirrors the AGENTS.md architecture principle — the TUI and
> the command set are *frontends*; the `CodingSession` is the environment that
> actually changes state. The registry is the adapter between them.

### Command dispatch flow

1. The TUI (or print-mode CLI) reads a line starting with `/`.
2. It splits off the command name and the rest of the line as arguments.
3. It asks `CommandRegistry.get(name)`; if found, it calls the command's handler.
4. The handler calls into `CodingSession` (e.g. `set_model`,
   `branch_to_entry`, `compact`, `new_session`) — all of which we covered in
   Part 3b — and returns a `CommandResult` describing what to print back.
5. If the name is not registered, the line is treated as an unknown command and
   a help hint is shown.

The net effect: commands are thin wrappers. All durable state change lives in
`CodingSession`; all command *discovery* lives in `CommandRegistry`.

---

<!-- NAV -->
[← tau_coding · CodingSession]({{< relref "./coding-session.md" >}})
[↑ 总览]({{< relref "./source-walkthrough.md" >}})
[→ tau_coding · 会话索引]({{< relref "./coding-session-manager.md" >}})
