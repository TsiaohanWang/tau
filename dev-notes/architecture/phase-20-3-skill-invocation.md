---
title: "Phase 20.3: Skill Invocation Reliability / 阶段 20.3:技能调用的可靠性"
---

[原文]
Phase 20.3 hardens how Tau exposes and invokes markdown skills.

[译文]
阶段 20.3 加固了 Tau 暴露与调用 Markdown 技能的方式。

## 技能的自动可用性(Automatic Skill Availability)

[原文]
Loaded skills are included in the system prompt when the `read` tool is
available:

[译文]
当 `read` 工具可用时,已加载的技能会被包含进系统提示词:

```xml
<available_skills>
  <skill>
    <name>testing</name>
    <description>Use when writing tests</description>
    <location>/repo/.agents/skills/testing.md</location>
  </skill>
</available_skills>
```

[原文]
The prompt now uses the Pi wording:

[译文]
提示词现在采用 Pi 的措辞:

```text
Read the full skill file when the task matches its description.
```

[原文]
This means a model can choose the relevant skill from the index, call `read` on
the listed location, and receive the full skill markdown as a normal tool result.

[译文]
这意味着模型可以从索引中选出相关技能,对列出的位置调用 `read`,并像接收普通工具结果一样拿到完整的技能 Markdown。

## 手动调用技能(Manual Skill Invocation)

[原文]
`/skill:<name> [instructions]` remains a prompt expansion directive rather than
a slash command that ends the turn. It now expands to the same Pi-style skill
block:

[译文]
`/skill:<name> [instructions]` 仍然是一条提示词展开指令,而不是会结束本轮对话的斜杠命令。它现在展开为与自动路径相同的 Pi 风格技能块:

```text
<skill name="testing" location="/repo/.agents/skills/testing.md">
References are relative to /repo/.agents/skills.

# Testing
Run pytest.
</skill>

add parser tests
```

[原文]
The block is self-contained: it includes the source file and tells the model
where relative references inside the skill should resolve.

[译文]
该块是自包含的:它包含源文件,并告诉模型技能内部的相对引用应基于何处解析。

## TUI 显示(TUI Display)

[原文]
The session still sends and persists the full expanded skill block so the agent
has the complete instructions. The TUI parses that structured block when
rendering user messages and displays a compact skill item instead:

[译文]
会话仍然发送并持久化完整展开后的技能块,以保证 agent 拥有完整的指令。TUI 在渲染用户消息时会解析这个结构化块,并改为显示一个紧凑的技能条目:

```text
Using skill: testing
```

[原文]
If the original `/skill:<name>` input included additional instructions, those
instructions render as the visible user message after the compact skill item.
The full skill markdown is not shown in the normal conversation view.

[译文]
如果原始的 `/skill:<name>` 输入包含额外指令,这些指令会作为紧凑技能条目之后可见的用户消息渲染。完整的技能 Markdown 不会出现在常规对话视图中。

## 边界(Boundary)

[原文]
Skill discovery and prompt expansion remain in `tau_coding`. `tau_agent` only
sees ordinary provider-neutral messages and tool calls. The model-visible skill
index uses the existing `read` tool instead of adding a special skill tool to
the reusable harness. TUI parsing is presentation-only and does not change the
stored or provider-visible message content.

[译文]
技能发现与提示词展开仍留在 `tau_coding`。`tau_agent` 只看到普通的、provider 无关的消息与工具调用。对模型可见的技能索引复用已有的 `read` 工具,而不是向可复用 harness 添加一个特殊的技能工具。TUI 的解析只影响呈现,不会改变存储的或对 provider 可见的消息内容。

## 测试(Tests)

[原文]
The phase is covered by:

[译文]
本阶段的测试覆盖为:

```text
tests/test_skills.py
tests/test_cli.py
tests/test_coding_session.py
tests/test_system_prompt.py
tests/test_tui_adapter.py
tests/test_tui_app.py
```

[原文]
The tests verify both paths:

- explicit `/skill:<name>` expansion sends full skill content to the provider
- the system prompt lists loaded skill locations, and a model-triggered `read`
  call can load the skill file into the next provider turn

[译文]
测试同时验证两条路径:

- 显式的 `/skill:<name>` 展开会把完整技能内容发送给 provider
- 系统提示词列出已加载技能的位置,模型触发的 `read` 调用可以把技能文件加载进下一次 provider 轮次
