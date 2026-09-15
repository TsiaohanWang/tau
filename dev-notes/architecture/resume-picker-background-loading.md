# `/resume` 后台加载 / `/resume` background loading

## 变更内容(What changed)

[原文]
The TUI now mounts an empty `/resume` shell first, then reads the current and
other project indexes in a background thread. The open picker shows staged
loading messages and remains usable; first the current project's sessions and
then the complete project list appear without replacing the modal.

[译文]
TUI 现在先挂载一个空的 `/resume` 外壳,然后在后台线程中读取当前项目与其他项目的索引。打开的选择器会显示分阶段的加载消息并保持可用;先是当前项目的会话出现,随后完整项目列表出现,且不会替换该模态框。

[原文]
Both picker columns use Textual's virtualized `OptionList`. Previously each
session and project became a mounted `ListItem`, even though the modal displays
at most 16 rows. Large histories therefore spent far more time constructing
widgets than parsing indexes. `OptionList` retains every searchable choice but
renders only visible lines.

[译文]
选择器的两栏都使用 Textual 的虚拟化 `OptionList`。此前每个会话与项目都会变成一个已挂载的 `ListItem`,尽管该模态框最多只显示 16 行。因此对于庞大的历史,构造组件的时间远多于解析索引。`OptionList` 保留每一个可搜索选项,但只渲染可见的行。

[原文]
Plain `/resume` command completion no longer reads session indexes while the
command name itself is being typed. Session-id completion remains available
when argument text follows `/resume `.

[译文]
在输入命令名本身时,单纯的 `/resume` 命令补全不再读取会话索引。当 `/resume ` 之后出现参数文本时,会话 id 补全仍然可用。

## 为什么(Why)

[原文]
Aggregating every `~/.tau/sessions/*/index.jsonl` file synchronously blocked the
Textual event loop before the modal could appear. Eagerly mounting hundreds of
row widgets added a larger delay. Moving cross-project filesystem and Pydantic
work off the event loop, and virtualizing both columns, makes the common
current-project path available immediately while preserving cross-project
discovery and search.

[译文]
同步聚合每一个 `~/.tau/sessions/*/index.jsonl` 文件会在模态框出现之前阻塞 Textual 事件循环。而急切地挂载数百个行组件又带来更大的延迟。把跨项目的文件系统与 Pydantic 工作移出事件循环,并虚拟化两栏,使常见的「仅当前项目」路径立即可用,同时保留跨项目发现与搜索。

## 安全与行为(Safety and behavior)

[原文]
- A global background failure leaves any loaded current-project sessions usable
  and shows a warning.
- Results are ignored if the picker was dismissed or replaced.
- Refresh preserves the selected project, search query, and selected session
  when those records still exist.
- The session manager and portable agent harness remain independent of Textual.

[译文]
- 全局后台失败时,任何已加载的当前项目会话仍可用,并显示一条警告。
- 如果选择器已被关闭或替换,结果会被忽略。
- 当相关记录仍存在时,刷新会保留所选项目、搜索查询与所选会话。
- 会话管理器与可移植 agent harness 仍然独立于 Textual。

## 验证(Verification)

[原文]
A Textual pilot test blocks the global index read, verifies that the modal and
local sessions are already interactive, then releases the read and verifies
that the other project appears. Existing picker navigation, search, and resume
tests cover the refreshed list.

[译文]
一个 Textual 试点测试会阻塞全局索引读取,验证模态框与本地会话已可交互,然后释放该读取并验证另一个项目出现。既有的选择器导航、搜索与恢复测试覆盖刷新后的列表。
