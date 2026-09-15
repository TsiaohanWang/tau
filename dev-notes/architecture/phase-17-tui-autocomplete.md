---
title: "Phase 17: TUI Slash-command Autocomplete / 阶段 17:TUI 斜杠命令自动补全"
---

[原文]
Phase 17 adds prompt autocomplete to Tau's Textual TUI while keeping the logic in
`tau_coding`.

[译文]
阶段 17 为 Tau 的 Textual TUI 加入了提示输入自动补全,同时把逻辑保留在 `tau_coding` 中。

[原文]
The implementation lives in:

[译文]
实现位于:

```text
src/tau_coding/tui/autocomplete.py
src/tau_coding/tui/app.py
src/tau_coding/tui/widgets.py
```

## 新增了什么(What was added)

[原文]
Tau now builds completion suggestions for the prompt input from coding-session
metadata:

- registered slash commands from the active `CommandRegistry`
- loaded skills for `/skill:<name>`

[译文]
Tau 现在根据编码会话的元数据为提示输入构建补全建议:

- 来自活动 `CommandRegistry` 的已注册斜杠命令
- 用于 `/skill:<name>` 的已加载技能

[原文]
The pure completion model is:

[译文]
纯粹的补全模型是:

```python
CompletionItem
CompletionState
build_completion_state(...)
```

[原文]
This keeps completion matching and replacement behavior testable without
Textual. The Textual app only owns rendering, key handling, and applying the
selected completion to the prompt input.

[译文]
这让补全的匹配与替换行为无需 Textual 即可测试。Textual 应用只负责渲染、按键处理,以及把选中的补全应用到提示输入上。

## TUI 行为(TUI behavior)

[原文]
When the prompt starts with `/`, Tau shows matching slash commands.

[译文]
当提示以 `/` 开头时,Tau 会显示匹配的斜杠命令。

[原文]
Examples:

[译文]
示例:

```text
/st       -> /status
/ski      -> /skill:
```

[原文]
Command completion reads canonical command names, executable aliases, and
non-executable search terms from the active `CommandRegistry`. Search terms are
filters only: accepting one inserts the canonical command. For example, `/res`
can match `/resume` directly and `/new` through the `/new` command's `reset`
search term, so autocomplete ranks the direct command or alias match first and
then keeps fallback search-term matches available below it.

[译文]
命令补全从活动 `CommandRegistry` 中读取规范命令名、可执行别名与不可执行的搜索词。搜索词只用于过滤:接受某个搜索词匹配会插入对应的规范命令。例如 `/res` 既能直接匹配 `/resume`,也能通过 `/new` 命令的 `reset` 搜索词匹配到 `/new`;因此自动补全会把直接命令或别名匹配排在前面,而把兜底的搜索词匹配保留在其下。

[原文]
When the prompt starts with `/skill:`, Tau shows matching loaded skills.
Accepting a skill completion preserves the rest of the request:

[译文]
当提示以 `/skill:` 开头时,Tau 会显示匹配的已加载技能。接受某个技能补全会保留请求的其余部分:

```text
/skill:r fix tests -> /skill:review fix tests
```

[原文]
The prompt input handles:

- `Tab` to accept any selected completion
- `Enter` to accept selected slash-command, skill, prompt-template, argument,
  and shell-path completions; for `@` file references, Enter instead submits
  the raw prompt text without applying the suggestion
- `Down` to select the next completion
- `Up` to select the previous completion

[译文]
提示输入支持:

- `Tab` 接受任意当前选中的补全
- `Enter` 接受选中的斜杠命令、技能、提示词模板、参数与 shell 路径补全;对于 `@` 文件引用,`Enter` 会直接提交原始提示文本,而不应用该建议
- `Down` 选择下一个补全
- `Up` 选择上一个补全

[原文]
Suggestions are rendered in a small strip below the prompt instead of being mixed
into the transcript.

[译文]
建议会渲染在提示输入下方的一条窄带中,而不会混入会话记录。

## 提示词模板(Prompt templates)

[原文]
Prompt templates are already loaded and available on `CodingSession`, but Tau
does not yet have a user-facing `/prompt:<name>` or equivalent template
invocation command. Phase 17 therefore does not expose prompt-template argument
completion yet; it should be added when a template invocation command exists.

[译文]
提示词模板已经被加载并可在 `CodingSession` 上使用,但 Tau 还没有面向用户的 `/prompt:<name>` 或等价的模板调用命令。因此阶段 17 暂未提供提示词模板的参数补全;等模板调用命令存在时再补充。

## 边界(Boundary)

[原文]
Autocomplete stays out of `tau_agent`.

[译文]
自动补全不进入 `tau_agent`。

[原文]
The reusable agent harness has no dependency on Textual, command registries,
skills, prompt templates, or Tau resource paths. Those remain application
concerns owned by `tau_coding`.

[译文]
可复用的 agent harness 不依赖 Textual、命令注册表、技能、提示词模板或 Tau 资源路径。这些仍然是 `tau_coding` 持有的应用层关注点。

## 测试(Tests)

[原文]
The phase is covered by:

[译文]
本阶段的测试覆盖为:

```text
tests/test_tui_autocomplete.py
tests/test_tui_app.py
```

[原文]
The tests verify:

- registered command suggestions
- `/skill:` suggestions
- preserving request text after skill completion
- completion selection wrapping
- context-dependent Enter acceptance versus raw `@` file-reference submission
- Tab acceptance for every completion kind

[译文]
测试验证:

- 已注册命令的建议
- `/skill:` 建议
- 技能补全后保留请求文本
- 补全选择的循环(wrapping)
- 依上下文而定的 Enter 接受行为,与 `@` 文件引用的原样提交
- 每种补全类型都可用 Tab 接受
