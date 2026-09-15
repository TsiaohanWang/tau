---
title: "Themes / 主题"
description: "Restyle the Tau TUI with JSON theme files, from single colors to full custom palettes. / 用 JSON 主题文件重新设计 Tau TUI 的外观,从单个颜色到完整的自定义调色板。"
---

[原文]
Tau's TUI themes are JSON files. The built-in themes (`tau-dark`, `tau-light`,
`high-contrast`) ship as JSON inside the package and load through the same
parser as custom themes, so they double as reference examples:
[`src/tau_coding/tui/themes/`](https://github.com/huggingface/tau/tree/main/src/tau_coding/tui/themes).

[译文]
Tau 的 TUI 主题就是 JSON 文件。内置主题(`tau-dark`、`tau-light`、`high-contrast`)作为 JSON 随包分发,并经由与自定义主题相同的解析器加载,因此它们同时充当参考示例:[`src/tau_coding/tui/themes/`](https://github.com/huggingface/tau/tree/main/src/tau_coding/tui/themes)。

## 添加自定义主题(Adding a custom theme)

[原文]
Drop a `.json` file into one of the theme directories:

[译文]
把一个 `.json` 文件放进以下主题目录之一:

[原文]
- `~/.tau/themes/` — available in every project
- `<project>/.tau/themes/` — project-local, wins over the user directory on
  name collisions

[译文]
- `~/.tau/themes/` —— 对所有项目可用
- `<project>/.tau/themes/` —— 项目本地;名称冲突时优先于用户目录

[原文]
Themes are discovered at startup; restart Tau after adding or editing a file.
Invalid theme files are skipped with a startup notice — they never prevent Tau
from starting. Select a theme with `/theme <name>`, the `/theme` picker, or
Textual's command palette. The selection is persisted in `~/.tau/tui.json` —
see [Configuration]({{< relref "../reference/configuration.md#tui-settings" >}}).

[译文]
主题在启动时被发现;新增或修改文件之后请重启 Tau。非法的主题文件会被跳过并给出启动提示 —— 它们绝不会阻止 Tau 启动。用 `/theme <name>`、`/theme` 选择器或 Textual 的命令面板选择主题。所选主题持久化在 `~/.tau/tui.json` —— 见[配置]({{< relref "../reference/configuration.md#tui-settings" >}})。

## 主题格式(Theme format)

[原文]
```json
{
  "name": "my-theme",
  "dark": true,
  "syntax_theme": "ansi_dark",
  "vars": {
    "base": "#1e1e2e",
    "text": "#cdd6f4",
    "teal": "#94e2d5"
  },
  "colors": {
    "screen_background": "base",
    "screen_text": "text",
    "completion_selected": "bold base on teal",
    "…": "all color fields are required"
  },
  "roles": {
    "user": { "border": "teal", "body": "text on base" },
    "…": "all roles are required"
  }
}
```

[译文]
```json
{
  "name": "my-theme",
  "dark": true,
  "syntax_theme": "ansi_dark",
  "vars": {
    "base": "#1e1e2e",
    "text": "#cdd6f4",
    "teal": "#94e2d5"
  },
  "colors": {
    "screen_background": "base",
    "screen_text": "text",
    "completion_selected": "bold base on teal",
    "…": "所有颜色字段都是必填的"
  },
  "roles": {
    "user": { "border": "teal", "body": "text on base" },
    "…": "所有角色都是必填的"
  }
}
```

[原文]
- `name` (required) — unique; must not contain `/` and cannot shadow a
  built-in theme name.
- `dark` (optional) — whether the theme is dark. Defaults from the luminance
  of `screen_background`. Controls dark-vs-light rendering details such as
  tool-result colors.
- `syntax_theme` (optional) — Pygments style for fenced code blocks, or
  `ansi_dark` / `ansi_light`. Defaults from `dark`.
- `vars` (optional) — named colors. Any whitespace-separated token in a
  `colors` or `roles` value that matches a var name is replaced by its value,
  so compound Rich styles like `"bold base on teal"` work. Var names that
  collide with Rich style keywords (`on`, `bold`, `dim`, …) are rejected, and
  var values must be single color tokens.
- `colors` (required) — every field of the theme palette, including the
  `success` / `error` status tokens and the `tool_success_text` /
  `tool_error_text` colors for tool invocation text. The full list is
  `THEME_COLOR_FIELDS` in `src/tau_coding/tui/themes/__init__.py`; the
  built-in theme JSON files show them all in context.
  Most colors are rendered by both Rich and Textual, so stick to formats both
  accept — six-digit hex like `#94e2d5` is always safe. Library-specific
  syntax such as Rich's `bright_red` / `grey50` or Textual's `ansi_red` /
  `#ff000080` is rejected, except in the Rich-only `tool_success_text` /
  `tool_error_text` fields and the `completion_*` style strings.
- `roles` (required) — `border` and `body` styles for each transcript role:
  `user`, `assistant`, `tool`, `error`, `status`, `thinking`, `skill`,
  `custom` (extension messages), `branch_summary`, `compaction_summary`.
  `body` is a Rich style string, so
  it can carry a background (`"#cdd6f4 on #1e1e2e"`); its colors also tint
  the surrounding Textual widget, so like the palette colors they must use
  formats both libraries accept. The `border` is the
  colored bar beside each transcript block; completed tool calls override the
  `tool` border with `success` or `error`.

[译文]
- `name`(必填)—— 唯一;不得包含 `/`,也不能遮蔽内置主题名。
- `dark`(可选)—— 该主题是否为深色。默认值由 `screen_background` 的亮度推导。它控制深色/浅色的渲染细节,例如工具结果的颜色。
- `syntax_theme`(可选)—— 围栏代码块使用的 Pygments 样式,或 `ansi_dark` / `ansi_light`。默认由 `dark` 推导。
- `vars`(可选)—— 具名颜色。`colors` 或 `roles` 值中任何以空白分隔、且与某个 var 名匹配的 token 都会被替换为其取值,因此像 `"bold base on teal"` 这样的复合 Rich 样式可以工作。与 Rich 样式关键字(`on`、`bold`、`dim` 等)冲突的 var 名会被拒绝,且 var 取值必须是单一颜色 token。
- `colors`(必填)—— 主题调色板的每一个字段,包括 `success` / `error` 状态 token,以及用于工具调用文本的 `tool_success_text` / `tool_error_text` 颜色。完整列表见 `src/tau_coding/tui/themes/__init__.py` 中的 `THEME_COLOR_FIELDS`;内置主题 JSON 文件展示了它们在上下文中的全部用法。
  大多数颜色同时由 Rich 与 Textual 渲染,因此请使用两者都接受的格式 —— 六位十六进制如 `#94e2d5` 总是安全的。库特有的语法,例如 Rich 的 `bright_red` / `grey50`,或 Textual 的 `ansi_red` / `#ff000080`,都会被拒绝,例外是仅由 Rich 使用的 `tool_success_text` / `tool_error_text` 字段以及 `completion_*` 样式字符串。
- `roles`(必填)—— 每种会话记录角色的 `border` 与 `body` 样式:`user`、`assistant`、`tool`、`error`、`status`、`thinking`、`skill`、`custom`(扩展消息)、`branch_summary`、`compaction_summary`。
  `body` 是 Rich 样式字符串,因此可以携带背景色(`"#cdd6f4 on #1e1e2e"`);它的颜色也会给周围的 Textual 组件着色,所以与调色板颜色一样,必须使用两个库都接受的格式。`border` 是每条会话记录块旁的彩色竖条;已完成的工具调用会用 `success` 或 `error` 覆盖 `tool` 的边框。

[原文]
Validation reports every problem in a file at once, so a new theme can be
fixed in one pass.

[译文]
校验会一次性报告文件中的所有问题,因此新主题可以一轮修完。
