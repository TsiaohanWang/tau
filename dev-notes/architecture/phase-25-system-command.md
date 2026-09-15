---
title: "Phase 25: System Prompt Display Command / 阶段 25:系统提示词展示命令"
---

[原文]
Phase 25 adds `/system`, a local-only slash command that displays the effective
system prompt Tau will send to the provider.

[译文]
阶段 25 加入了 `/system`:一条纯本地的斜杠命令,用来展示 Tau 将要发送给 provider 的、实际生效的系统提示词。

## 变更内容(What changed)

[原文]
- The coding command registry now includes `/system`.
- `CodingSession.system_prompt` exposes the harness's current effective system
  prompt to command handlers.
- Print mode handles local slash commands before starting a provider call.
- The TUI renders `/system` output inline in the visible thread, like `/reload`.

[译文]
- 编码命令注册表现在包含 `/system`。
- `CodingSession.system_prompt` 把 harness 当前生效的系统提示词暴露给命令处理器。
- Print 模式在发起 provider 调用之前处理本地斜杠命令。
- TUI 像 `/reload` 一样,把 `/system` 的输出内联渲染在可见对话流中。

## 为什么需要它(Why it exists)

[原文]
The system prompt is important debugging context, especially when project
instructions, skills, tools, and custom prompts are composed together. Users need
a direct way to inspect it without changing the conversation that the model sees.

[译文]
系统提示词是重要的调试上下文,尤其是当项目指令、技能、工具与自定义提示词被组合在一起时。用户需要一种直接检查它的方式,同时不改变模型所看到的对话。

## 持久化与上下文行为(Persistence and context behavior)

[原文]
`/system` returns a `CommandResult.message`; it does not append a user message,
assistant message, or custom durable entry. That means:

[译文]
`/system` 返回 `CommandResult.message`;它不会追加用户消息、assistant 消息或自定义持久化条目。这意味着:

[原文]
- no provider request is started for the command;
- the displayed system prompt is not added to `CodingSession.messages`;
- JSONL session storage is unchanged except for any normal initial session
  metadata that already exists.

[译文]
- 该命令不会发起任何 provider 请求;
- 展示的系统提示词不会被加入 `CodingSession.messages`;
- 除了本已存在的常规初始会话元数据之外,JSONL 会话存储保持不变。

[原文]
This keeps the separation between user-visible UI output, model context, and
append-only session history.

[译文]
这保持了「用户可见的 UI 输出」「模型上下文」与「只追加会话历史」三者之间的分离。

## 如何测试(How to test)

[原文]
Run:

[译文]
运行:

```bash
uv run pytest tests/test_commands.py tests/test_coding_session.py tests/test_cli.py
```
