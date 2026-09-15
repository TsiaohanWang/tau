# 在 `/prompts` 中编辑提示词模板 / Edit prompt templates from `/prompts`

## 变更内容(What changed)

[原文]
The `/prompts` picker now offers **Ctrl+E** for the highlighted template. Tau opens the complete Markdown source in a Textual `TextArea`; **Ctrl+S** writes it back to the template's existing path and reloads session resources. **Escape** returns without saving.

[译文]
`/prompts` 选择器现在为高亮模板提供 **Ctrl+E**。Tau 会在一个 Textual `TextArea` 中打开该模板的完整 Markdown 源码;**Ctrl+S** 会把它写回模板原有的路径,并重新加载会话资源。**Escape** 直接返回,不保存。

## 为什么(Why)

[原文]
Previously the picker could only insert `/name` into the composer. Updating a template required leaving Tau, locating its winning user- or project-level file, editing it externally, then running `/reload`. In-modal editing keeps this maintenance flow inside the active session and makes the new content available immediately.

[译文]
此前,选择器只能把 `/name` 插入输入框。要更新一个模板,必须退出 Tau、找到最终生效的用户级或项目级文件、在外部编辑它,再运行 `/reload`。模态框内编辑把这条维护流程留在当前活动会话中,并让新内容立即生效。

## 架构(Architecture)

[原文]
The feature stays in `tau_coding.tui`, Textual's adapter layer. `PromptTemplate` continues to represent discovered resources, and `CodingSession.reload()` remains the single path that republishes resource state after a file change. No Textual dependency enters `tau_agent`.

[译文]
该功能留在 Textual 的适配层 `tau_coding.tui` 中。`PromptTemplate` 继续表示被发现的资源,`CodingSession.reload()` 仍是文件变化后重新发布资源状态的唯一路径。`tau_agent` 不会引入任何 Textual 依赖。

[原文]
The editor loads and saves the full Markdown source rather than only parsed prompt content, preserving editable frontmatter such as `description`. Read, write, and reload failures are shown as TUI notifications.

[译文]
编辑器加载并保存完整的 Markdown 源码,而不是只处理解析后的提示词内容,因此 `description` 等 frontmatter 字段仍可编辑。读取、写入与重载失败都会以 TUI 通知的形式展示。

## 验证(Validation)

[原文]
Automated pilot coverage opens `/prompts`, invokes **Ctrl+E**, edits and saves a temporary template, and verifies both the file content and resource reload. Manual validation:

[译文]
自动化试点覆盖会打开 `/prompts`、触发 **Ctrl+E**、编辑并保存一个临时模板,然后同时校验文件内容与资源重载。手动验证:

[原文]
1. Create `~/.agents/prompts/example.md`.
2. Start Tau and run `/prompts`.
3. Highlight `/example`, press **Ctrl+E**, change the Markdown, and press **Ctrl+S**.
4. Confirm the picker returns and `/example` uses the updated template without a manual `/reload`.

[译文]
1. 创建 `~/.agents/prompts/example.md`。
2. 启动 Tau 并运行 `/prompts`。
3. 高亮 `/example`,按 **Ctrl+E**,修改 Markdown,再按 **Ctrl+S**。
4. 确认选择器返回,且 `/example` 无需手动 `/reload` 就使用了更新后的模板。
