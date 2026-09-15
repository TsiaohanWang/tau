# Tau 原生的系统提示词文件 / Tau-native system prompt files

[原文]
Issue: https://github.com/huggingface/tau/issues/531

[译文]
Issue:https://github.com/huggingface/tau/issues/531

## 变更内容(What changed)

[原文]
Tau now discovers optional replacement and append files:

[译文]
Tau 现在会发现可选的替换文件与追加文件:

```text
~/.tau/SYSTEM.md
~/.tau/APPEND_SYSTEM.md
<cwd>/.tau/SYSTEM.md
<cwd>/.tau/APPEND_SYSTEM.md
```

[原文]
Replacement inputs use precedence: explicit `--system-prompt`, then the project
file, then the user file. Append inputs are cumulative layers: user
`APPEND_SYSTEM.md`, project `APPEND_SYSTEM.md`, then explicit
`--append-system-prompt` values in CLI order. This broad-to-specific ordering
matches Tau's cumulative `AGENTS.md` model while retaining raw append formatting.

[译文]
替换类输入按优先级使用:显式的 `--system-prompt`,然后是项目文件,再是用户文件。追加类输入是累积层:用户 `APPEND_SYSTEM.md`、项目 `APPEND_SYSTEM.md`,然后是按 CLI 顺序排列的显式 `--append-system-prompt` 值。这种「从宽泛到具体」的顺序与 Tau 累积式的 `AGENTS.md` 模型一致,同时保留原始的追加格式。

[原文]
The files use the existing custom-base prompt builder. Replacement content still
receives selected append text, project context, eligible skills, date, and cwd.
Prompt contents remain request configuration and are not added to session JSONL.

[译文]
这些文件复用既有的自定义基础提示词构建器。替换内容仍会接收所选追加文本、项目上下文、符合条件的技能、日期与 cwd。提示词内容仍是请求配置,不会被加入会话 JSONL。

## 为什么排除 `.agents`(Why `.agents` is excluded)

[原文]
Pi uses `.agents/skills` as a portable Agent Skills compatibility location, but
keeps `SYSTEM.md` and `APPEND_SYSTEM.md` under its native `.pi` configuration.
Tau follows the same boundary: existing `.agents` support for skills, templates,
and instructions is unchanged, while system prompt files remain Tau-specific.

[译文]
Pi 把 `.agents/skills` 用作可移植的 Agent Skills 兼容位置,但把 `SYSTEM.md` 与 `APPEND_SYSTEM.md` 放在其原生的 `.pi` 配置下。Tau 遵循同样的边界:`.agents` 对技能、模板与指令的既有支持保持不变,而系统提示词文件仍属于 Tau 特有。

## 重载与诊断(Reload and diagnostics)

[原文]
`CodingSession` stores the discovered content and ordered source paths separately
from explicit startup values. `/reload` compares both source and content
signatures, so adding, changing, or removing an append file rebuilds the
next-turn prompt. Explicit startup append values remain the final append layers
across reloads.

[译文]
`CodingSession` 把发现到的内容与有序来源路径,同显式的启动值分开保存。`/reload` 会比较来源签名与内容签名,因此新增、修改或移除某个追加文件都会重建下一轮的提示词。显式的启动追加值在跨 reload 时仍是最后的追加层。

[原文]
Resource diagnostics identify every selected append file and any selected,
shadowed, or CLI-overridden replacement files without exposing their contents.
Missing files are ignored. A selected path that cannot be inspected, read, or
decoded as UTF-8 fails startup/reload rather than
silently weakening precedence. A failed reload leaves the previous prompt active.

[译文]
资源诊断会指出每个被选中的追加文件,以及任何被选中、被遮蔽或被 CLI 覆盖的替换文件,但不暴露其内容。缺失的文件会被忽略。某个被选中的路径若无法被检查、读取或按 UTF-8 解码,则会让启动/reload 失败,而不是静默削弱优先级。失败的 reload 会让先前的提示词保持生效。

## 信任边界(Trust boundary)

[原文]
Project prompt files load automatically in this phase, consistent with Tau's
current project-resource behavior. They can change the model's highest-priority
instructions, so published documentation tells users to inspect them. A unified
Pi-compatible project trust boundary is tracked separately in issue #535; prompt
file discovery is isolated in `tau_coding.resources` so that trust can later gate
project candidates without changing `tau_agent` or prompt assembly.

[译文]
在本阶段,项目提示词文件会自动加载,与 Tau 当前的项目资源行为一致。它们可以改变模型的最高优先级指令,因此已发布的文档提醒用户检查它们。统一的、与 Pi 兼容的项目信任边界由 issue #535 单独跟踪;提示词文件发现被隔离在 `tau_coding.resources`,以便日后让信任机制把关项目候选,而无需改动 `tau_agent` 或提示词组装。

## 验证(Verification)

```bash
uv run pytest
uv run ruff check .
uv run ruff format --check .
uv run mypy
cd website && hugo --minify
cd website && npx --yes pagefind@latest --site public
```
