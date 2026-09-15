---
title: "ADR 0003 — Unify skill discovery on the Agent Skills spec / ADR 0003 —— 把技能发现统一到 Agent Skills 规范"
---

## 状态(Status)

[原文]
Accepted.

[译文]
已接受。

## 背景(Context)

[原文]
Tau discovers Markdown skills from four locations, in increasing precedence:

[译文]
Tau 从四个位置发现 Markdown 技能(skills),优先级依次升高:

```text
~/.tau/skills/
~/.agents/skills/
<cwd>/.tau/skills/
<cwd>/.agents/skills/
```

[原文]
Historically Tau accepted **either** layout in any of these directories:

- a `foo.md` file at the root (skill name = `foo`), or
- a `foo/SKILL.md` subdirectory (skill name = `foo`).

[译文]
历史上,Tau 在这些目录中**接受两种**布局中的任意一种:

- 根目录下的 `foo.md` 文件(技能名为 `foo`),或
- `foo/SKILL.md` 子目录(技能名为 `foo`)。

[原文]
PR [#280](https://github.com/huggingface/tau/pull/280) tightened discovery for
the `.agents/` locations to match the [Agent Skills
spec](https://agentskills.io/specification#directory-structure), which requires
the `subdir/SKILL.md` form. It intentionally left `.tau/skills/` on the
permissive "any `.md`" rule.

[译文]
PR [#280](https://github.com/huggingface/tau/pull/280) 收紧了 `.agents/` 各位置的发现规则,使其符合 [Agent Skills 规范](https://agentskills.io/specification#directory-structure),即要求 `subdir/SKILL.md` 形式。它有意让 `.tau/skills/` 继续沿用宽松的「任意 `.md`」规则。

[原文]
That left Tau with two different rules for two visually-identical locations:

[译文]
这让 Tau 在两个外观完全相同的位置上使用了两套不同规则:

[原文]
| Location | `foo.md` (bare file) | `foo/SKILL.md` (directory) |
|---|---|---|
| `.tau/skills/` | ✅ loaded | ✅ loaded |
| `.agents/skills/` | ❌ ignored | ✅ loaded |

[译文]
| 位置 | `foo.md`(裸文件) | `foo/SKILL.md`(目录) |
|---|---|---|
| `.tau/skills/` | ✅ 加载 | ✅ 加载 |
| `.agents/skills/` | ❌ 忽略 | ✅ 加载 |

## 决策(Decision)

[原文]
Apply the Agent Skills spec uniformly to **every** skills location Tau
scans. A skill is always `<skills-dir>/<name>/SKILL.md`. Bare `.md` files at
the root of a skills directory are not loaded as skills; instead, Tau emits an
informational `ResourceDiagnostic` telling the user how to migrate:

[译文]
把 Agent Skills 规范统一应用到 Tau 扫描的**每一个**技能位置。一个技能永远是 `<skills-dir>/<name>/SKILL.md`。技能目录根部的裸 `.md` 文件不再作为技能加载;取而代之,Tau 会发出一条信息性的 `ResourceDiagnostic`,告诉用户如何迁移:

```text
mv foo.md foo/SKILL.md
```

[原文]
The `agents_mode` branch introduced by #280 is removed from
`_load_skills_from_dir_with_diagnostics`.

[译文]
#280 引入的 `agents_mode` 分支已从 `_load_skills_from_dir_with_diagnostics` 中移除。

## 为什么在这里与 Pi 不同(Why diverge from Pi here)

[原文]
Pi maintains an explicit `SkillDiscoveryMode = "pi" | "agents"` split in
`packages/coding-agent/src/core/package-manager.ts`:

- `.pi/skills/` and `~/.pi/agent/skills/` use "pi mode" (bare `.md` allowed).
- `.agents/skills/` uses "agents mode" (strict `SKILL.md` only).

[译文]
Pi 在 `packages/coding-agent/src/core/package-manager.ts` 中维护了一个显式的 `SkillDiscoveryMode = "pi" | "agents"` 二分:

- `.pi/skills/` 与 `~/.pi/agent/skills/` 使用「pi 模式」(允许裸 `.md`)。
- `.agents/skills/` 使用「agents 模式」(只接受严格的 `SKILL.md`)。

[原文]
Reading Pi's own changelog makes clear that this split is **not a philosophical
choice** — it is a **backward-compatibility carveout**:

[译文]
阅读 Pi 自己的变更日志可以清楚地看到,这个二分**不是哲学选择**,而是一个**向后兼容的例外处理**:

[原文]
> **Pi skills now use `SKILL.md` convention**: Pi skills must now be named
> `SKILL.md` inside a directory, matching Codex CLI format. Previously any
> `*.md` file was treated as a skill. Migrate by renaming
> `~/.pi/agent/skills/foo.md` to `~/.pi/agent/skills/foo/SKILL.md`.

[译文]
> **Pi 技能现在使用 `SKILL.md` 约定**:Pi 技能现在必须放在目录中并命名为 `SKILL.md`,以匹配 Codex CLI 的格式。此前任何 `*.md` 文件都被当作技能。迁移方式是把 `~/.pi/agent/skills/foo.md` 重命名为 `~/.pi/agent/skills/foo/SKILL.md`。

[原文]
And the fix that mirrors #280:

[译文]
以及那个与 #280 对应的修复:

[原文]
> Fixed skill discovery to stop recursing once a directory contains
> `SKILL.md`, and to ignore root `*.md` files in `.agents/skills` while
> keeping root markdown skill files supported in `~/.pi/agent/skills`,
> `.pi/skills`, and package `skills/` directories (pi-mono#2603)

[译文]
> 修复了技能发现:当一个目录包含 `SKILL.md` 后停止递归;在 `.agents/skills` 中忽略根部的 `*.md` 文件,同时在 `~/.pi/agent/skills`、`.pi/skills` 和包内的 `skills/` 目录中继续支持根部的 Markdown 技能文件(pi-mono#2603)

[原文]
Pi's direction of travel is clearly "`SKILL.md` everywhere." Pi cannot finish
that migration cleanly because it has a large installed base of bare-`.md`
skills that would break.

[译文]
Pi 的前进方向显然是「处处 `SKILL.md`」。但 Pi 无法干净地完成这次迁移,因为它有大量存量裸 `.md` 技能会被破坏。

[原文]
Tau does not share that constraint. We are pre-1.0 (`0.1.3`), have no
meaningful backward-compat contract for `.tau/skills/` layouts, and can ship
the endgame directly instead of carrying a legacy path forward.

[译文]
Tau 没有这个约束。我们仍处于 1.0 之前(`0.1.3`),对 `.tau/skills/` 布局没有实质性的向后兼容承诺,因此可以直接落地最终形态,而不必背负历史包袱。

## 后果(Consequences)

[原文]
- One rule for every skills directory. The `agents_mode` heuristic
  (`skills_dir.parent.name == ".agents"`) disappears.
- User skills authored as bare `.md` files under `.tau/skills/` are no longer
  loaded and must be migrated. Tau surfaces this via a diagnostic at load time
  so the failure mode is visible rather than silent.
- Skill loader behavior no longer depends on parent directory names, so it
  stays correct when callers pass unusual `TauResourcePaths.agents_root`
  values (for example a custom skills root during testing or embedding).
- Documentation (`website/content/guides/skills-and-prompts.md`) now shows the
  spec layout as the only supported form.

[译文]
- 所有技能目录只使用一套规则。`agents_mode` 的启发式判断(`skills_dir.parent.name == ".agents"`)随之消失。
- 以裸 `.md` 文件形式写在 `.tau/skills/` 下的用户技能不再被加载,必须迁移。Tau 会在加载时通过诊断信息暴露这一点,使失败可见而不是静默发生。
- 技能加载器的行为不再依赖父目录名称,因此当调用方传入不寻常的 `TauResourcePaths.agents_root`(例如测试或嵌入时使用自定义技能根目录)时,它依然保持正确。
- 文档(`website/content/guides/skills-and-prompts.md`)现在只展示规范布局这一种受支持的形式。

## 迁移(Migration)

[原文]
For each bare `.md` skill under any Tau-scanned skills directory:

[译文]
对 Tau 扫描的任意技能目录下的每个裸 `.md` 技能:

```bash
cd ~/.tau/skills          # or .tau/skills, .agents/skills, etc.
for f in *.md; do
  name="${f%.md}"
  mkdir -p "$name"
  mv "$f" "$name/SKILL.md"
done
```

[原文]
The load-time diagnostic points users at exactly the destination path they
should rename each file to.

[译文]
加载时的诊断信息会明确告诉用户每个文件应当重命名到的目标路径。

## 参考(References)

[原文]
- PR [#280](https://github.com/huggingface/tau/pull/280) — narrower fix for
  `.agents/` only.
- Issue [#292](https://github.com/huggingface/tau/issues/292) — this
  unification.
- Agent Skills spec: <https://agentskills.io/specification#directory-structure>
- Pi's `SkillDiscoveryMode`: `packages/coding-agent/src/core/package-manager.ts`
  in the pi-mono repo.

[译文]
- PR [#280](https://github.com/huggingface/tau/pull/280) —— 只针对 `.agents/` 的较窄修复。
- Issue [#292](https://github.com/huggingface/tau/issues/292) —— 本次统一。
- Agent Skills 规范:<https://agentskills.io/specification#directory-structure>
- Pi 的 `SkillDiscoveryMode`:`pi-mono` 仓库中的 `packages/coding-agent/src/core/package-manager.ts`。
