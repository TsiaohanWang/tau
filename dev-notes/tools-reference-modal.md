# 可搜索的工具参考 / Searchable tools reference

[原文]
Issue #453 adds `/tools` to the built-in command registry. In the Textual frontend, the command opens a searchable tool browser built from `CodingSession.tools`, so it always reflects the active harness after startup or `/reload`.

[译文]
Issue #453 把 `/tools` 加入内置命令注册表。在 Textual 前端中,该命令会打开一个可搜索的工具浏览器,内容由 `CodingSession.tools` 构建,因此它始终反映启动或 `/reload` 之后的活动 harness。

[原文]
The modal renders a compact table: tool name, origin, and description character count on one line. Built-ins appear first, sorted alphabetically. Extension groups follow in extension load/registration order, with each group's tools in registration order. Origins are `Built in` or the extension name; `CodingSession` exposes the extension runtime's ordered registration metadata so overrides are also attributed correctly. Its focused search field filters names, labels, descriptions, and extension names case-insensitively as the user types. Up and Down move through results; Enter or a mouse click opens the selected tool's full description. Escape returns from details or closes the browser without changing the prompt. Dedicated messages cover sessions with no tools and searches with no matches.

[译文]
该模态框渲染一张紧凑表格:一行显示工具名、来源与描述字符数。内置工具排在最前,按字母顺序排列。扩展分组随后按扩展加载/注册顺序排列,组内工具按注册顺序排列。来源为 `Built in` 或扩展名;`CodingSession` 暴露扩展运行时的有序注册元数据,因此覆盖关系也能被正确归属。其获得焦点的搜索字段会在用户输入时对名称、标签、描述与扩展名做大小写不敏感的过滤。Up 与 Down 在结果中移动;Enter 或鼠标点击打开所选工具的完整描述。Escape 从详情返回,或在不改变提示输入的情况下关闭浏览器。对于没有工具的会话与无匹配的搜索,有专门的消息提示。

[原文]
This stays within Tau's frontend boundary: portable `AgentTool` data remains in `tau_agent`, the command request is represented by `CommandResult`, and Textual rendering remains in `tau_coding.tui`.

[译文]
这保持在 Tau 的前端边界内:可移植的 `AgentTool` 数据仍留在 `tau_agent`,命令请求由 `CommandResult` 表示,Textual 渲染仍留在 `tau_coding.tui`。

[原文]
Validate manually by starting `tau`, entering `/tools`, searching for a known tool such as `bash`, navigating with arrow keys, and closing with Escape. `tools` is a reserved prompt-template name, matching the existing `/prompts` collision behavior, so a user `tools.md` is ignored with a diagnostic and cannot shadow `/tools`. Automated coverage is in `tests/test_commands.py`, `tests/test_coding_session.py`, and `tests/test_tui_app.py`.

[译文]
手动验证:启动 `tau`,输入 `/tools`,搜索一个已知工具(例如 `bash`),用方向键导航,并用 Escape 关闭。`tools` 是保留的提示词模板名,与既有的 `/prompts` 冲突行为一致,因此用户的 `tools.md` 会被忽略并给出诊断,无法遮蔽 `/tools`。自动化覆盖位于 `tests/test_commands.py`、`tests/test_coding_session.py` 与 `tests/test_tui_app.py`。
