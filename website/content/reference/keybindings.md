---
title: "Keyboard shortcuts / 键盘快捷键"
description: "Default keys for the Tau TUI, and how to remap them. / Tau TUI 的默认按键,以及如何重新映射。"
---

[原文]
These are the default keys in the interactive [TUI]({{< relref "../guides/tui.md" >}}). Run
`/hotkeys` in-session to see them, and remap them in `~/.tau/tui.json` (see
[Configuration]({{< relref "./configuration.md#tui-settings" >}})).

[译文]
以下是交互式 [TUI]({{< relref "../guides/tui.md" >}}) 中的默认按键。在会话内运行 `/hotkeys` 可以查看它们;在 `~/.tau/tui.json` 中可以重新映射(见[配置]({{< relref "./configuration.md#tui-settings" >}}))。

## 提示输入(Prompting)

[原文]
| Key | Action |
| --- | --- |
| `Enter` | Accept a highlighted non-file completion; otherwise submit the prompt exactly as typed (including `@` file-reference text) |
| `Shift+Enter` | Insert a newline |
| `Esc` | Cancel the active run |
| `Enter` (while running) | Queue text as steering for the current run |
| `Alt+Enter` | Queue a follow-up that waits until the run would stop |
| `Up` (empty prompt, running) | Edit the most recently queued follow-up |

[译文]
| 按键 | 动作 |
| --- | --- |
| `Enter` | 接受高亮的非文件补全;否则按原样提交提示(包括 `@` 文件引用文本) |
| `Shift+Enter` | 插入换行 |
| `Esc` | 取消活动运行 |
| `Enter`(运行时) | 把文本作为插话排入当前运行的队列 |
| `Alt+Enter` | 排入一条追加消息,等本次运行将要停止时才执行 |
| `Up`(空提示、运行中) | 编辑最近排队的追加消息 |

## 导航与选择器(Navigation & pickers)

[原文]
| Key | Action |
| --- | --- |
| `Ctrl+K` | Open the command palette |
| `Ctrl+R` | Open the session picker |
| `Tab` | Accept any highlighted completion, including `@` file references |
| `Down` / `Up` | Move through completions |
| `Ctrl+E` (in `/prompts`) | Edit the selected prompt template |
| `Ctrl+S` (while editing a prompt template) | Save and reload resources |

[译文]
| 按键 | 动作 |
| --- | --- |
| `Ctrl+K` | 打开命令面板 |
| `Ctrl+R` | 打开会话选择器 |
| `Tab` | 接受任何高亮补全,包括 `@` 文件引用 |
| `Down` / `Up` | 在补全项之间移动 |
| `Ctrl+E`(在 `/prompts` 中) | 编辑所选提示词模板 |
| `Ctrl+S`(编辑提示词模板时) | 保存并重新加载资源 |

## 模型与 thinking(Models & thinking)

[原文]
| Key | Action |
| --- | --- |
| `Ctrl+P` | Cycle scoped (favorite) models forward |
| `Shift+Ctrl+P` | Cycle scoped (favorite) models backward |
| `Shift+Tab` | Cycle the thinking mode |
| `Ctrl+T` | Toggle display of thinking/reasoning tokens |

[译文]
| 按键 | 动作 |
| --- | --- |
| `Ctrl+P` | 向前循环 scoped(收藏)模型 |
| `Shift+Ctrl+P` | 向后循环 scoped(收藏)模型 |
| `Shift+Tab` | 循环切换 thinking 模式 |
| `Ctrl+T` | 切换 thinking/推理 token 的显示 |

## 输出与会话(Output & session)

[原文]
| Key | Action |
| --- | --- |
| `Ctrl+O` | Toggle exact tool commands and full output (vs. compact previews) |
| `Ctrl+C` | Clear the prompt input |
| `Ctrl+D` | Quit |

[译文]
| 按键 | 动作 |
| --- | --- |
| `Ctrl+O` | 切换「精确工具命令与完整输出」/「紧凑预览」 |
| `Ctrl+C` | 清空提示输入 |
| `Ctrl+D` | 退出 |

[原文]
{{% note title="Remapping" %}}
Keys use Textual's syntax (`ctrl+k`, `shift+tab`, `down`, `f2`, …). Tau rejects
unknown names, empty keys, and duplicate assignments so mistakes fail early. Any
key you don't set keeps its default. If your terminal cannot distinguish
`Shift+Enter` from `Enter`, choose a key it can report separately:

```json
{
  "keybindings": {
    "insert_newline": "f2"
  }
}
```
{{% /note %}}

[译文]
{{% note title="重新映射" %}}
按键使用 Textual 的语法(`ctrl+k`、`shift+tab`、`down`、`f2`……)。Tau 会拒绝未知名称、空按键与重复赋值,让错误尽早失败。你没有设置的按键保持默认值。如果你的终端无法区分 `Shift+Enter` 与 `Enter`,请选一个它能单独上报的按键:

```json
{
  "keybindings": {
    "insert_newline": "f2"
  }
}
```
{{% /note %}}
