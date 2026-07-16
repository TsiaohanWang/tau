---
title: Print mode & scripting
description: Run Tau non-interactively for a single prompt — ideal for scripts, pipes, and CI.
---

Print mode runs a single prompt without the interactive UI and writes the result
to the terminal. It's the right choice for scripts, pipelines, and one-off
questions.

## Basic use

```bash
tau -p "summarize the changes in the last commit"
```

The `-p` / `--prompt` flag is what switches Tau into print mode. It still uses
the full coding-session environment — the same tools, project context, and
session storage as the TUI — so its turns are saved under `~/.tau/sessions/` too.

## Output formats

Choose how results are written with `-o` / `--output`:

```bash
tau -p "list the public functions in src/app.py" -o text        # default, human-readable
tau -p "list the public functions in src/app.py" -o json        # JSON, for parsing
tau -p "list the public functions in src/app.py" -o transcript  # structured transcript
```

- **text** — plain text with ANSI styling, for reading.
- **json** — machine-readable, for piping into other tools.
- **transcript** — a structured record of the turn.

### JSON output structure

The `-o json` format returns a JSON object with the model's response and
metadata. This is useful for scripting:

```bash
# Extract just the response text
tau -p "what files changed?" -o json | jq -r '.response'

# Check token usage
tau -p "quick question" -o json | jq '.usage'
```

### Transcript output

The `-o transcript` format includes the full conversation turn — user message,
assistant response, tool calls, and tool results. This is useful for debugging
or auditing what Tau did:

```bash
tau -p "fix the bug in auth.py" -o transcript > debug.json
```

## Choosing provider, model, and directory

The same selection flags work in print mode:

```bash
tau -p "explain this module" -m gpt-5.5
tau --provider local -p "explain this module"
tau -p "audit for secrets" --cwd ./services/api
```

## Chaining with other tools

Print mode is designed for composition. Some examples:

```bash
# Feed file contents into a prompt
cat src/app.py | tau -p "review this code for security issues" -o text

# Use Tau output as input to another command
tau -p "list all TODO comments" -o json | jq -r '.response' | grep -c "TODO"

# Run Tau in CI to check for issues
tau -p "do the tests pass? answer yes or no" -o text | grep -qi yes
```

## Exit status

Print mode exits non-zero if the run fails, so you can use it in scripts:

```bash
if tau -p "do the tests pass? answer yes or no" -o text | grep -qi yes; then
  echo "looks good"
fi
```

## Session management

Print-mode turns are saved to `~/.tau/sessions/` just like TUI turns. You can
resume them later:

```bash
# Resume the last print-mode session in the TUI
tau --resume

# Or list sessions and pick one
tau --session-picker
```

{{% tip %}}
For interactive work, start the [TUI]({{< relref "./tui.md" >}}) instead — you get streaming,
steering, pickers, and session branching.
{{% /tip %}}
