# 会话自动命名 / Automatic session naming

[原文]
Tau automatically gives a new managed session a short title based on the first user message.

[译文]
Tau 会根据第一条用户消息,自动为新的受管会话给出一个简短标题。

## 新增了什么(What was added)

[原文]
- New managed sessions are named automatically after the first user message is durably persisted.
- Tau asks the currently selected provider/model for a concise title of at most four words.
- The title is sanitized before it is stored in session metadata.
- If the provider call fails or returns unusable text, Tau falls back to a local title derived from the first message.
- `/name` remains the manual override and Tau does not replace an existing session title.

[译文]
- 新的受管会话在第一条用户消息持久化完成之后会自动命名。
- Tau 向当前选中的 provider/模型请求一个至多四个词的简洁标题。
- 标题在存入会话元数据之前会被清洗。
- 如果 provider 调用失败,或返回不可用的文本,Tau 会回退到由第一条消息推导出的本地标题。
- `/name` 仍是手动覆盖入口,且 Tau 不会替换已存在的会话标题。

## 为什么需要它(Why it exists)

[原文]
Session ids are useful for exact references, but they are hard to scan in `/resume`, `tau sessions`, and id completions. Automatic names make saved sessions easier to recognize without requiring users to pause and name each one manually.

[译文]
会话 id 适合精确引用,但在 `/resume`、`tau sessions` 与 id 补全中很难快速扫读。自动名称让已保存会话更容易辨认,而无需用户逐个停下来手动命名。

## 与 Pi 的差异(How it differs from Pi)

[原文]
This is one of Tau's small intentional product divergences from Pi's minimalist baseline. Pi-style session persistence focuses on durable transcripts and explicit user actions. Tau adds automatic session metadata to improve resume/discovery workflows.

[译文]
这是 Tau 相对 Pi 极简基线有意做出的一个小产品差异。Pi 风格的会话持久化聚焦于持久化会话记录与显式用户操作。Tau 加入自动会话元数据,以改善恢复/发现工作流。

[原文]
The divergence is kept in `tau_coding` because it is application metadata behavior, not reusable agent-harness behavior. `tau_agent` still only owns the portable agent loop, messages, tools, and events.

[译文]
该差异留在 `tau_coding`,因为它属于应用元数据行为,而不是可复用的 agent harness 行为。`tau_agent` 仍然只持有可移植的 agent 循环、消息、工具与事件。

## 模型选择(Model choice)

[原文]
Tau uses the session's currently selected provider/model for the naming request. There is no separate title model setting yet. This keeps the implementation simple and follows the active session configuration, but it does mean the first turn may make a short extra model call before the main assistant response.

[译文]
Tau 使用会话当前选中的 provider/模型来完成命名请求。目前还没有单独的标题模型设置。这让实现保持简单,并跟随活动的会话配置;但这也意味着第一轮可能在主 assistant 响应之前额外发起一次简短的模型调用。

## 持久化行为(Persistence behavior)

[原文]
Naming happens only after the first user message has been persisted. This preserves deferred indexing for newly prepared sessions: a session that is cancelled before its first durable message should not appear in the resume index just because naming started.

[译文]
命名只在第一条用户消息持久化之后才发生。这保留了新准备会话的延迟索引:一个在首条持久化消息之前就被取消的会话,不应仅仅因为命名已经开始就出现在恢复索引中。

## 如何测试(How to test)

```bash
uv run pytest tests/test_coding_session.py -q
uv run ruff check src/tau_coding/session.py tests/test_coding_session.py website/content/guides/sessions.md
```
