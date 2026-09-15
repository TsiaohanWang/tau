# 扩展的会话元数据 / Extension session metadata

[原文]
Tau extensions can read the active session name and thinking level through
`ExtensionContext.session_name` and `ExtensionContext.thinking_level`.
These values are live views over the bound `CodingSession`, like the existing
model, provider, and session id fields.

[译文]
Tau 扩展可以通过 `ExtensionContext.session_name` 与 `ExtensionContext.thinking_level` 读取活动会话名与 thinking 等级。与既有的模型、provider 与会话 id 字段一样,这些值是对已绑定 `CodingSession` 的实时视图。

[原文]
Tau also dispatches the existing `session_info_changed` event after automatic
naming or an awaited rename through `CodingSession.set_session_name()`.
It dispatches `thinking_level_changed` after a successful explicit
thinking-mode change. Event handlers are awaited before the
mutation method returns. Failed and no-op updates do not emit events.
Silent coercion paths (`set_model`, `select_provider_model`,
`toggle_scoped_model`, `reload_provider_settings`, branch, resume, and
`_sync_thinking_level_to_active_model`) do not emit either; extensions read
the live value instead.

[译文]
Tau 还会在自动命名、或经由 `CodingSession.set_session_name()` 完成一次被 await 的重命名之后,派发既有的 `session_info_changed` 事件。在一次成功的显式 thinking 模式变更之后,它会派发 `thinking_level_changed`。事件处理器会在变更方法返回之前被 await。失败与无操作的更新不会发出事件。静默强制转换路径(`set_model`、`select_provider_model`、`toggle_scoped_model`、`reload_provider_settings`、分支、恢复,以及 `_sync_thinking_level_to_active_model`)也不会发出事件;扩展改为读取实时值。

[原文]
Initial values do not produce change events during load. Extensions read them
from the context in `session_start`. Session replacement also uses the existing
shutdown/start lifecycle, so an extension receives the replacement values from
the new context.

[译文]
初始值在加载期间不会产生变更事件。扩展在 `session_start` 中从上下文读取它们。会话替换同样使用既有的 shutdown/start 生命周期,因此扩展会从新的上下文获得替换后的值。

[原文]
The `/name` command now returns a rename intent. Async hosts apply that intent
through `await CodingSession.set_session_name(...)`. This is the one public
session-name mutation path: it persists the change, then awaits extension event
delivery before returning. The setter was synchronous before this change, so
SDK callers must now await it. It also refreshes the record's model and
provider alongside the title, as the `/name` command already did. Keeping one notifying setter avoids a silent
mutation path that could leave extensions stale.

[译文]
`/name` 命令现在返回一个重命名意图。异步宿主通过 `await CodingSession.set_session_name(...)` 应用该意图。这是唯一的公开会话名变更路径:它先持久化该变更,再在返回之前 await 扩展事件投递。该 setter 在本次变更之前是同步的,因此 SDK 调用方现在必须 await 它。它还会像 `/name` 命令此前那样,在更新标题的同时刷新记录的模型与 provider。只保留一个有通知的 setter,可以避免出现让扩展状态变陈旧的静默变更路径。

[原文]
Focused coverage is in `tests/test_extensions.py`, `tests/test_commands.py`,
`tests/test_coding_session.py`, and `tests/test_tui_app.py`.

[译文]
聚焦覆盖位于 `tests/test_extensions.py`、`tests/test_commands.py`、`tests/test_coding_session.py` 与 `tests/test_tui_app.py`。
