---
title: "Phase 22: Compaction Replay Foundation / 阶段 22:压缩重放基础"
---

[原文]
This phase started Tau's compaction and context-management work. It now includes
model-driven Pi-style summaries, recent-context retention for automatic
compaction, and overflow-triggered retry behavior.

[译文]
本阶段启动了 Tau 的压缩(compaction)与上下文管理工作。它现在包含模型驱动的 Pi 风格摘要、自动压缩时对近期上下文的保留,以及溢出触发的重试行为。

[原文]
The implementation lives in:

[译文]
实现位于:

```text
src/tau_agent/session/entries.py
src/tau_agent/session/memory.py
src/tau_coding/context_window.py
src/tau_coding/session.py
src/tau_coding/commands.py
```

## 新增了什么(What was added)

[原文]
`CompactionEntry` is now meaningful during session replay.

[译文]
`CompactionEntry` 现在在会话重放期间具有实际语义。

[原文]
When `SessionState.from_entries()` sees a modern compaction entry, it:

1. inserts one provider-neutral summary message
2. finds `first_kept_entry_id` on the complete active root-to-leaf entry path
3. keeps context-producing entries at that boundary and later in path order
4. keeps the original append-only entries intact

[译文]
当 `SessionState.from_entries()` 遇到一条现代格式的压缩条目时,它会:

1. 插入一条 provider 无关的摘要消息
2. 在完整的活动「根到叶」条目路径上找到 `first_kept_entry_id`
3. 保留该边界处的、以及路径顺序中更靠后的、会产生上下文的条目
4. 保持原始只追加条目不被打动

[原文]
This matches Pi's inclusive first-kept semantics. If the boundary is missing or cannot
be found, replay keeps no pre-compaction message and still includes later successors.
Tau sessions written before this encoding used `replaces_entry_ids`; a non-empty legacy
list takes precedence and retains the original arbitrary-set replay behavior.

[译文]
这与 Pi「首保留条目包含在保留范围内」的语义一致。如果该边界缺失或找不到,重放不会保留任何压缩前的消息,但仍会包含更晚的后继条目。采用这种编码之前的 Tau 会话使用 `replaces_entry_ids`;非空的旧式列表优先,并保留原有的「任意集合替换」重放行为。

[原文]
The summary message currently uses this stable form:

[译文]
摘要消息目前使用这一稳定形式:

```text
Previous conversation summary:
<summary>
```

## 为什么需要它(Why It Exists)

[原文]
Tau needs compaction to reduce the active provider context while preserving the
full session file. This keeps Pi's append-only session property:

```text
session file = durable history
SessionState.messages = reconstructed active context
```

[译文]
Tau 需要通过压缩来缩减活动的 provider 上下文,同时保留完整的会话文件。这保持了 Pi 的只追加会话特性:

```text
会话文件 = 持久化历史
SessionState.messages = 重建出的活动上下文
```

[原文]
Manual `/compact` work can append `CompactionEntry` values without editing or
deleting old entries. New records persist one first-kept boundary rather than a list of
all summarized entry ids.

[译文]
手动 `/compact` 可以追加 `CompactionEntry`,而无需编辑或删除旧条目。新记录持久化的是一个「首保留边界」,而不是所有被摘要条目 id 的列表。

## 上下文大小估算(Context Size Estimation)

[原文]
Tau now has deterministic approximate context-size helpers in `tau_coding`:

[译文]
Tau 现在在 `tau_coding` 中有确定性的上下文大小近似辅助函数:

```python
estimate_text_tokens(...)
estimate_message_tokens(...)
estimate_tool_tokens(...)
estimate_context_tokens(...)
```

[原文]
These helpers intentionally use a rough character-based estimate instead of a
provider-specific tokenizer. `/status` surfaces the current estimate as:

[译文]
这些辅助函数有意采用基于字符的粗略估算,而不是 provider 特有的分词器。`/status` 会把当前估算呈现为:

```text
Estimated context tokens: <count>
```

[原文]
This gives automatic compaction thresholds a stable application-layer primitive
without adding tokenizer policy to `tau_agent`.

[译文]
这为自动压缩阈值提供了稳定的应用层原语,同时不必把分词器策略引入 `tau_agent`。

[原文]
Tau enables Pi-style automatic compaction by default using:

```text
model context window - 16384 reserve tokens
```

[译文]
Tau 默认启用 Pi 风格的自动压缩,阈值为:

```text
模型上下文窗口 - 16384 个预留 token
```

[原文]
Built-in models carry configured context-window metadata, and unknown/custom
models fall back to a `128000` token window. You can override the threshold for a
run with:

[译文]
内置模型带有已配置的上下文窗口元数据,未知/自定义模型则回退到 `128000` token 的窗口。你可以用以下方式为某次运行覆盖阈值:

```bash
tau --auto-compact-threshold 100000
```

[原文]
When the active context estimate exceeds the effective threshold before a new prompt or
after a model response, Tau asks the active provider for a structured summary,
appends a `CompactionEntry`, and rebuilds the in-memory transcript. Tau also
attempts one compact-and-retry cycle after provider errors that look like
context overflow.

[译文]
当活动上下文估算值在新提示之前、或在模型响应之后超过有效阈值时,Tau 会向活动 provider 请求一份结构化摘要,追加一条 `CompactionEntry`,并重建内存中的会话记录。对于看起来像上下文溢出的 provider 错误,Tau 也会尝试一次「压缩并重试」循环。

## 手动压缩(Manual Compaction)

[原文]
Tau now supports model-generated manual compaction in the TUI:

[译文]
Tau 现在在 TUI 中支持由模型生成的手动压缩:

```text
/compact [instructions]
```

[原文]
The command uses Tau's built-in Pi-style compaction prompt. Optional
instructions are appended to that prompt as extra focus. The generated summary is
stored in a `CompactionEntry`, which becomes the active file-order tip. Tau then
replays the session and replaces the in-memory harness transcript for future
turns.

[译文]
该命令使用 Tau 内置的 Pi 风格压缩提示词。可选的 instructions 会作为额外关注点追加到该提示词末尾。生成的摘要存入 `CompactionEntry`,而它随即成为文件顺序中的活动顶点。随后 Tau 重放该会话,并为后续轮次替换内存中 harness 的会话记录。

[原文]
See [Context Compaction](../context-compaction.md) for the current prompt,
trigger conditions, and known limitations.

[译文]
当前的提示词、触发条件与已知限制见 [Context Compaction](../context-compaction.md)。

## 边界(Boundary)

[原文]
This foundation is in `tau_agent` because replaying session entries is a
portable harness concern. It does not know about slash commands, Textual, Rich,
Tau home paths, token thresholds, or which model creates a summary.

[译文]
这套基础位于 `tau_agent`,因为重放会话条目是可移植 harness 的关注点。它不了解斜杠命令、Textual、Rich、Tau 主目录路径、token 阈值,也不了解由哪个模型生成摘要。

[原文]
Token estimation, summary generation, overflow classification, and command UX
live in `tau_coding`.

[译文]
Token 估算、摘要生成、溢出分类与命令交互都留在 `tau_coding`。

## 测试(Tests)

[原文]
The phase is covered by:

[译文]
本阶段的测试覆盖为:

```text
tests/test_session.py
tests/test_context_window.py
tests/test_commands.py
tests/test_coding_session.py
tests/test_tui_app.py
```

[原文]
The tests verify:

- compaction entries round-trip through JSONL without writing an empty legacy id list
- linear replay keeps the first boundary entry inclusively and handles every boundary depth
- branch replay applies compaction only on the active branch path
- fixture-based legacy replay preserves replacement-list precedence
- context-size estimation is deterministic
- `/status` includes an estimated context token count
- `/compact [instructions]` requests model-generated compaction
- manual compaction persists entries and rebuilds future-turn context
- opt-in automatic compaction runs before prompts and after responses when the
  threshold is exceeded
- overflow-triggered compaction retries the provider call once when possible

[译文]
测试验证:

- 压缩条目经由 JSONL 的双向读写,且不写入空的旧式 id 列表
- 线性重放包含地保留首个边界条目,并能处理任意边界深度
- 分支重放只在活动分支路径上应用压缩
- 基于 fixture 的旧格式重放保留「替换列表优先」的语义
- 上下文大小估算是确定性的
- `/status` 包含估算的上下文 token 数
- `/compact [instructions]` 请求由模型生成的压缩
- 手动压缩持久化条目并重建后续轮次的上下文
- 在超过阈值时,选择启用的自动压缩会在提示之前与响应之后运行
- 溢出触发的压缩在可能时对 provider 调用重试一次
