# 侧边栏中的系统提示词文件 / System-prompt files in the TUI sidebar

## 变更内容(What changed)

[原文]
The TUI sidebar now shows a **system prompt** section whenever the active session
loaded `SYSTEM.md` or `APPEND_SYSTEM.md` from a user or project `.tau` directory.
It lists only selected files that contribute to the effective prompt; shadowed or
CLI-overridden files remain available through `/session` diagnostics.

[译文]
只要活动会话从用户或项目的 `.tau` 目录加载了 `SYSTEM.md` 或 `APPEND_SYSTEM.md`,TUI 侧边栏现在就会显示一个 **system prompt** 区块。它只列出对实际生效提示词有贡献的被选中文件;被遮蔽或被 CLI 覆盖的文件仍可通过 `/session` 诊断查看。

## 为什么(Why)

[原文]
System-prompt files affect every provider request but were previously invisible
in the persistent session summary. Listing their paths makes prompt customization
easier to notice and audit without mixing Tau-native prompt inputs into the
sidebar's project-context file list.

[译文]
系统提示词文件影响每一次 provider 请求,但此前在常驻的会话摘要中不可见。列出它们的路径,让提示词定制更容易被注意与审计,同时不会把 Tau 原生的提示词输入混进侧边栏的项目上下文文件列表。

## 设计(Design)

[原文]
`CodingSession.system_prompt_files` exposes the selected replacement and append
source paths in assembly order. The TUI consumes that provider-neutral session
metadata, formats project and home paths consistently with context files, and
includes the paths in its redraw fingerprint so `/reload` updates the section.
The section is omitted when no discovered prompt files are active to avoid adding
noise to the default sidebar.

[译文]
`CodingSession.system_prompt_files` 按组装顺序暴露被选中的替换与追加来源路径。TUI 消费这份 provider 无关的会话元数据,以与上下文文件一致的方式格式化项目路径与主目录路径,并把这些路径纳入其重绘指纹,使 `/reload` 能更新该区块。当没有任何发现到的提示词文件处于活动状态时,该区块会被省略,以免给默认侧边栏增加噪音。

## 验证(Validation)

[原文]
Create `.tau/APPEND_SYSTEM.md`, launch Tau in that directory after trusting the
project, and confirm the sidebar shows:

[译文]
创建 `.tau/APPEND_SYSTEM.md`,在信任该项目之后于该目录启动 Tau,并确认侧边栏显示:

```text
system prompt
  • .tau/APPEND_SYSTEM.md
```

[原文]
Remove the file, run `/reload`, and confirm the section disappears.

[译文]
删除该文件,运行 `/reload`,确认该区块消失。
