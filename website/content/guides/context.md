---
title: Managing context
description: Keep long sessions working with automatic and manual compaction, and control model effort with thinking modes.
---

A model can only read so much text at once — its **context window**. Long coding
sessions fill it up. Tau handles this with **compaction** (summarizing older
history) and lets you tune how hard the model works with **thinking modes**.

## Seeing context usage

Run `/session` in the TUI to see a rough estimate:

```text
Estimated context tokens: <count>
Context token breakdown: system=<count>, messages=<count>, tools=<count>
Thinking mode: <mode>
```

The estimate is deterministic (roughly `characters / 4` plus small per-message
and per-tool overhead), not a provider tokenizer — treat it as approximate. It
covers the system prompt, project context (`AGENTS.md`), skill metadata, the
message history, and tool schemas.

You can also check context usage from the command line:

```bash
tau -p "just say ok" -o json | jq '.usage'
```

## Automatic compaction

By default, Tau compacts automatically when the estimate gets close to the
model's context window. It checks three moments:

- before a new prompt (to catch context added out-of-band),
- after a successful turn (to compact before your next turn), and
- after a context-overflow error (compact and retry once).

When it compacts, Tau asks the model to summarize older messages, keeps a recent
suffix of the conversation, and continues. The original session file is never
edited — only the *active context* sent to the provider changes.

The default threshold follows the model's context window minus a reserve. You can
override it for a run:

```bash
tau --auto-compact-threshold 100000
```

Automatic compaction is best-effort: if summarization fails, Tau logs it, keeps
the original context, and carries on.

### What happens during compaction

1. Tau collects all messages except the most recent N (the "keep suffix").
2. It asks the model to summarize the older messages into a single compact block.
3. The summary replaces the old messages in the *active* context only.
4. The session file on disk retains the full history — compaction is non-destructive.

This means you can always `/resume` a session and see the complete conversation,
even after many compactions.

## Manual compaction

Compact on demand any time:

```text
/compact
/compact focus on the database migration work
```

Optional text after `/compact` is added as extra focus for the summary. Manual
compaction summarizes the whole active context into one summary and fails visibly
if the request fails.

### When to compact manually

- Before switching topics (e.g. you were debugging auth, now moving to UI work).
- When you notice the model "forgetting" earlier instructions.
- Before asking a broad question that needs full-project awareness.

## Thinking modes

Some models can spend extra effort reasoning before answering. Tau exposes a
thinking level you can cycle:

```text
off → minimal → low → medium → high → xhigh
```

- **Shift+Tab** cycles the thinking level (default is `medium`).
- **Ctrl+T** toggles whether streamed reasoning tokens are shown (hidden by
  default).

Thinking is model-aware: Tau enables it only when the active provider declares
supported levels for the active model. When it's unavailable, `/session` shows
the reason (e.g. the provider doesn't declare `thinking_levels`, or the model
isn't listed). Custom providers can opt in via `thinking_levels` in their config
— see [Configuration]({{< relref "../reference/configuration.md#providers" >}}).

### Choosing a thinking level

| Level | Use case |
|-------|----------|
| `off` | Quick questions, simple edits, when speed matters most |
| `minimal` / `low` | Straightforward code changes, formatting |
| `medium` | General coding work (default) |
| `high` / `xhigh` | Complex debugging, architecture decisions, multi-file refactors |

Higher thinking levels use more tokens and cost more, but produce better
reasoning for complex tasks.

## Common pitfalls

**Context overflow mid-session:** If the model's response triggers a
context-overflow error, Tau will automatically compact and retry once. If it
still overflows, try `/compact` manually or start a new session with `/new`.

**Compaction loses detail:** Summaries are good but not perfect. If you need the
exact text of an earlier message, check the session file on disk
(`~/.tau/sessions/`).

**Thinking tokens count toward context:** When thinking is enabled, the
reasoning tokens consume context space. If you're running low, try cycling
thinking to a lower level.
