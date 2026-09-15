---
title: "Phase 20.2: Thinking Mode Controls / 阶段 20.2:Thinking 模式控制"
---

[原文]
Phase 20.2 makes thinking mode an explicit Tau coding-session setting and adds
a TUI control for changing it.

[译文]
阶段 20.2 把 thinking 模式变为 Tau 编码会话的一项显式设置,并加入了用于切换它的 TUI 控件。

## 新增了什么(What Was Added)

[原文]
`tau_coding.thinking` defines Tau's supported thinking modes:

[译文]
`tau_coding.thinking` 定义了 Tau 支持的 thinking 模式:

```text
off
minimal
low
medium
high
xhigh
```

[原文]
The default is `medium`, matching Pi's default reasoning-depth preference. Tau
validates the visible controls against provider/model capabilities and passes
OpenAI-compatible `reasoning_effort` when a configured provider declares support.
Unsupported models show thinking controls as unavailable instead of presenting a
mode that Tau cannot safely send.

[译文]
默认值是 `medium`,与 Pi 默认的推理深度偏好一致。Tau 会依据 provider/模型能力来校验可见控件,并在已配置的 provider 声明支持时传递 OpenAI 兼容的 `reasoning_effort`。不受支持的模型会把 thinking 控件显示为不可用,而不是展示一个 Tau 无法安全发送的模式。

## 会话持久化(Session Persistence)

[原文]
New sessions append an initial `thinking_level_change` entry after the initial
model entry. Explicit changes append another `thinking_level_change` entry. As
the last non-legacy-leaf entry, it becomes the active tip, so resume reconstructs
the active thinking mode from the session tree.

[译文]
新会话会在初始模型条目之后追加一条初始的 `thinking_level_change` 条目。显式变更会再追加一条 `thinking_level_change` 条目。作为最后一个非遗留 leaf 条目,它同时成为活动顶点,因此恢复会话时会从会话树重建活动的 thinking 模式。

[原文]
`CodingSession` exposes:

[译文]
`CodingSession` 暴露:

```python
session.thinking_level
session.available_thinking_levels
await session.set_thinking_level("high")
await session.cycle_thinking_level()
```

[原文]
This keeps thinking state in `tau_coding`, while `tau_agent.session` remains the
portable replay layer that knows how to reconstruct `ThinkingLevelChangeEntry`
values.

[译文]
这使 thinking 状态留在 `tau_coding`,而 `tau_agent.session` 仍是可移植的重放层,负责重建 `ThinkingLevelChangeEntry` 值。

## 命令与 TUI(Commands And TUI)

[原文]
The Textual TUI binds thinking cycling to `Shift-Tab` by default. The key is
configurable in `~/.tau/tui.json`:

[译文]
Textual TUI 默认把 thinking 循环切换绑定到 `Shift-Tab`。该键可在 `~/.tau/tui.json` 中配置:

```json
{
  "keybindings": {
    "thinking_cycle": "f3"
  }
}
```

[原文]
The sidebar and compact session line read `session.available_thinking_levels`
first. When the active provider or model has no thinking capability metadata,
the TUI shows the control as unavailable. If the user tries to cycle or set a
thinking mode anyway, the session raises a user-facing reason.

[译文]
侧边栏与紧凑会话行会先读取 `session.available_thinking_levels`。当活动 provider 或模型没有 thinking 能力元数据时,TUI 会把该控件显示为不可用。如果用户仍然尝试循环切换或设置 thinking 模式,会话会给出面向用户的理由。

[原文]
Tau does not register a standalone `/thinking` command in the default command
registry. The command surface stays aligned with Pi/Codex, where model choice
and reasoning controls belong with model selection and session status. `/session`
reports `Thinking mode: unavailable` plus the reason when the active
provider/model cannot change thinking mode.

[译文]
Tau 不在默认命令注册表中注册单独的 `/thinking` 命令。命令界面对齐 Pi/Codex:模型选择与推理控制归属于模型选择与会话状态。当活动 provider/模型无法改变 thinking 模式时,`/session` 会报告 `Thinking mode: unavailable` 以及具体理由。

## Provider 能力(Provider Capabilities)

[原文]
Provider settings may declare thinking support with:

[译文]
Provider 设置可以这样声明 thinking 支持:

```json
{
  "thinking_levels": ["off", "low", "medium", "high"],
  "thinking_models": ["gpt-5.5"],
  "thinking_default": "medium",
  "thinking_parameter": "reasoning_effort"
}
```

[原文]
`thinking_models` is optional. If it is omitted, the declared levels apply to
all models for that provider. Tau's built-in providers declare thinking support
only for models whose reasoning controls were checked when the model was added.
When adding new catalog models, validate the provider docs/API first and update
`thinking_models` only for models that actually support Tau's configured
thinking parameter.

[译文]
`thinking_models` 是可选的。如果省略,声明的等级会应用到该 provider 的所有模型。Tau 的内置 provider 只为那些在加入时已核验过推理控件的模型声明 thinking 支持。新增目录(catalog)模型时,请先验证 provider 文档/API,并且只为真正支持 Tau 所配置 thinking 参数的模型更新 `thinking_models`。

[原文]
The supported parameter mappings are:

[译文]
受支持的参数映射有:

[原文]
- `reasoning_effort`: top-level OpenAI-compatible chat-completions field.
- `reasoning.effort`: nested Responses API shape, sent as
  `{ "reasoning": { "effort": "...", "summary": "auto" } }` for provider
  configs that explicitly opt into it.
- `anthropic.thinking`: Anthropic extended thinking, sent as
  `{ "thinking": { "type": "enabled", "budget_tokens": ... } }`.

[译文]
- `reasoning_effort`:OpenAI 兼容 chat-completions 的顶层字段。
- `reasoning.effort`:Responses API 的嵌套形态;对于显式选择启用的 provider 配置,发送为 `{ "reasoning": { "effort": "...", "summary": "auto" } }`。
- `anthropic.thinking`:Anthropic 扩展思考,发送为 `{ "thinking": { "type": "enabled", "budget_tokens": ... } }`。

[原文]
Tau records an explicit reason when controls are unavailable:

[译文]
当控件不可用时,Tau 会记录明确的原因:

[原文]
- Providers with no `thinking_levels` report that the provider does not declare
  thinking capability metadata.
- Providers with `thinking_models` report that the active model is not listed
  when the model is outside that capability set.
- Provider-specific configs use the mapped runtime parameter above when the
  active model is declared as capable.

[译文]
- 没有 `thinking_levels` 的 provider 会报告:该 provider 未声明 thinking 能力元数据。
- 带 `thinking_models` 的 provider,当活动模型不在该能力集合内时,会报告该模型未被列出。
- 当活动模型被声明为具备能力时,provider 特有的配置会使用上面映射出的运行时参数。

[原文]
This keeps the durable provider metadata in `tau_coding`, the provider-specific
runtime knob in `tau_ai`, and the display choice in CLI/TUI code.

[译文]
这使持久化的 provider 元数据留在 `tau_coding`,provider 特有的运行时开关留在 `tau_ai`,而显示层的选择留在 CLI/TUI 代码中。

## Provider 对比(Provider Comparison)

[原文]
OpenAI's public API exposes `reasoning_effort` for chat completions and
`reasoning.effort` for Responses API reasoning models. Supported values are
model-dependent; current docs list `none`, `minimal`, `low`, `medium`, `high`,
and `xhigh`, with defaults and support varying by model. Tau's direct OpenAI
entry maps Tau's normalized levels to `reasoning_effort` only for configured
reasoning-capable models.

[译文]
OpenAI 的公开 API 为 chat completions 暴露 `reasoning_effort`,为 Responses API 的推理模型暴露 `reasoning.effort`。受支持的值取决于模型;当前文档列出 `none`、`minimal`、`low`、`medium`、`high` 与 `xhigh`,其默认值与支持情况因模型而异。Tau 的直连 OpenAI 条目只为已配置的、具备推理能力的模型把 Tau 归一化等级映射到 `reasoning_effort`。

[原文]
Codex clients expose `model_reasoning_effort` for supported models. Tau mirrors
Pi's Codex subscription mapping: `off` omits the `reasoning` field, `minimal`
requests `low`, and enabled levels send `reasoning.effort` with
`reasoning.summary: "auto"`. Built-in `openai-codex` models declare this support
only for the validated GPT-5.x Codex model list.

[译文]
Codex 客户端为受支持的模型暴露 `model_reasoning_effort`。Tau 镜像 Pi 的 Codex 订阅映射:`off` 省略 `reasoning` 字段,`minimal` 请求 `low`,已启用的等级则发送 `reasoning.effort` 并带上 `reasoning.summary: "auto"`。内置的 `openai-codex` 模型只为经过验证的 GPT-5.x Codex 模型列表声明这一支持。

[原文]
Anthropic has used both explicit extended-thinking token budgets and newer
adaptive/effort controls, with support changing by model family. Tau maps its
normalized thinking levels to explicit Anthropic `budget_tokens` for the
built-in Claude models that declare extended-thinking support. `off` omits the
`thinking` payload.

[译文]
Anthropic 既使用过显式的扩展思考 token 预算,也使用过更新的自适应/effort 控件,且支持情况随模型家族变化。对于声明支持扩展思考的内置 Claude 模型,Tau 把归一化的 thinking 等级映射为显式的 Anthropic `budget_tokens`。`off` 则省略 `thinking` 载荷。

[原文]
Models or providers without declared capability metadata are treated as having
no configurable thinking mode. Their existing session thinking setting is kept
while controls are hidden, so switching back to a capable model can reuse that
setting when it is valid. If a capable target model does not support the current
level, Tau coerces to that model/provider default.

[译文]
没有声明能力元数据的模型或 provider,会被视为没有可配置的 thinking 模式。控件隐藏期间,它们原有的会话 thinking 设置会被保留,因此切回具备能力的模型时,只要该设置仍然有效就可以复用。如果具备能力的目标模型不支持当前等级,Tau 会强制改用该模型/provider 的默认值。

## 边界(Boundary)

[原文]
Thinking controls remain outside Textual-specific rendering. Provider adapters
translate supported reasoning streams into provider-neutral thinking events,
`tau_agent` forwards those events without recording them as durable assistant
messages, and the Textual TUI decides whether to show or hide them. The built-in
TUI hides thinking tokens by default and exposes `Ctrl+T` as a frontend toggle.

[译文]
Thinking 控件不属于 Textual 特有的渲染。Provider 适配器把受支持的推理流翻译成 provider 无关的 thinking 事件,`tau_agent` 转发这些事件但不把它们记录为持久化的 assistant 消息,而 Textual TUI 决定显示还是隐藏它们。内置 TUI 默认隐藏 thinking token,并通过 `Ctrl+T` 提供前端开关。

## 测试(Tests)

[原文]
The phase is covered by:

[译文]
本阶段的测试覆盖为:

```text
tests/test_thinking.py
tests/test_commands.py
tests/test_coding_session.py
tests/test_agent_loop.py
tests/test_tau_ai.py
tests/test_tui_adapter.py
tests/test_tui_config.py
tests/test_tui_app.py
```
