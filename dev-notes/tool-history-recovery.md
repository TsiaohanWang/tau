# 修复畸形的工具历史 / Recover malformed tool history

## 新增了什么(What was added)

[原文]
Tau now validates tool-call history before replaying it to a provider. The
provider-neutral repair lives in `tau_agent.tool_history` and enforces one
simple invariant: every assistant tool call is immediately followed by exactly
one matching tool result.

[译文]
Tau 现在会在把工具调用历史重放给 provider 之前校验它。与 provider 无关的修复逻辑位于 `tau_agent.tool_history`,它强制一个简单的不变量:每个 assistant 工具调用之后都紧跟着恰好一个匹配的工具结果。

[原文]
`CodingSession` applies that repair when loading or resuming an active branch
and after `/tree` selects a branch. If history changes, Tau appends a new valid
branch and a `tau.session-history-repair` custom entry containing repair counts.
The original JSONL entries remain untouched. The agent loop repairs its
provider input in memory as a final safety backstop for callers that construct a
harness without `CodingSession`.

[译文]
`CodingSession` 在加载或恢复活动分支时、以及 `/tree` 选择分支之后应用该修复。如果历史发生变化,Tau 会追加一个新的合法分支,以及一条名为 `tau.session-history-repair`、包含修复计数的自定义条目。原始 JSONL 条目不被打动。Agent 循环会在内存中修复其 provider 输入,作为「不经由 `CodingSession` 直接构造 harness」的调用方的最终安全兜底。

## 为什么需要它(Why it exists)

[原文]
Older cancellation and persistence paths could save either side of a tool
exchange without the other. Providers reject those transcripts with errors such
as:

[译文]
旧的取消与持久化路径可能只保存工具交换的一侧而缺失另一侧。Provider 会以类似这样的错误拒绝这些会话记录:

```text
No tool call found for function call output with call_id call_...
```

[原文]
Prevention stops new corruption, but it does not make existing user sessions
usable. Recovery must therefore tolerate several shapes:

[译文]
预防可以阻止新的损坏,但无法让既有的用户会话变得可用。因此修复必须容忍多种形态:

[原文]
- a call without a result;
- a result without a call;
- a result separated from its call by another message;
- duplicate results for one call;
- parallel results saved in the wrong order.

[译文]
- 有调用但没有结果;
- 有结果但没有调用;
- 结果与其调用之间隔着另一条消息;
- 同一次调用有重复结果;
- 并行结果以错误顺序保存。

## 修复策略(Repair policy)

[原文]
The policy is deterministic and deliberately conservative:

[译文]
该策略是确定性的,并且有意保持保守:

[原文]
1. Existing results move directly after their calls and follow call order.
2. A call without a result receives `Tool call interrupted by user`.
3. A result without any call is omitted. Tau cannot safely invent the missing
   call because its arguments are unavailable.
4. Duplicate results collapse to one; a real result wins over Tau's synthetic
   interruption result.
5. The raw append-only history is retained. A repaired branch and diagnostic are
   appended instead of rewriting the JSONL file. Active model, thinking-level,
   and label state are snapshotted onto the repaired branch, and application
   custom entries from the rewritten suffix are copied forward.

[译文]
1. 既有结果会直接移到其调用之后,并遵循调用顺序。
2. 没有结果的调用会收到 `Tool call interrupted by user`。
3. 没有任何调用的结果会被省略。Tau 无法安全地虚构缺失的调用,因为其参数不可获得。
4. 重复结果会合并为一个;真实结果优先于 Tau 的合成中断结果。
5. 原始只追加历史被保留。Tau 追加一个修复分支与一条诊断,而不是改写 JSONL 文件。活动模型、thinking 等级与标签状态会被快照到修复分支上,而被重写后缀中的应用自定义条目会被复制过来。

[原文]
Applying the policy again is a no-op, so repeated resumes do not add more repair
branches or diagnostics.

[译文]
再次应用该策略是无操作,因此重复恢复不会新增修复分支或诊断。

## 架构(Architecture)

[原文]
- `tau_agent.tool_history` owns the pure, provider-neutral transformation.
- `tau_agent.loop` applies it only to provider input; durable harness history is
  not silently mutated at this safety boundary.
- `tau_coding.session` owns append-only branch repair and durable diagnostics.
- Provider adapters remain unchanged and receive valid canonical history.

[译文]
- `tau_agent.tool_history` 持有纯粹的、provider 无关的转换。
- `tau_agent.loop` 只把它应用到 provider 输入;在这个安全边界上,持久化的 harness 历史不会被静默修改。
- `tau_coding.session` 持有只追加的分支修复与持久化诊断。
- Provider 适配器保持不变,并收到合法的规范历史。

[原文]
This preserves Tau's package boundary: portable transcript correctness belongs
in `tau_agent`, while disk-session workflow belongs in `tau_coding`.

[译文]
这保持了 Tau 的包边界:可移植的会话记录正确性属于 `tau_agent`,而磁盘会话工作流属于 `tau_coding`。

## 如何测试(How to test)

```bash
uv run pytest tests/test_tool_history.py tests/test_agent_loop.py tests/test_coding_session.py
```

[原文]
Manual validation:

[译文]
手动验证:

[原文]
1. Resume a session containing an orphan `ToolResultMessage`.
2. Send a prompt that previously returned provider status 400.
3. Confirm the prompt succeeds.
4. Inspect JSONL and find one `tau.session-history-repair` custom entry followed
   by the repaired branch.
5. Resume again and confirm no second repair diagnostic is appended.

[译文]
1. 恢复一个包含孤立 `ToolResultMessage` 的会话。
2. 发送一条此前会返回 provider 400 状态的提示。
3. 确认该提示成功。
4. 检查 JSONL,找到一条 `tau.session-history-repair` 自定义条目,其后跟着修复后的分支。
5. 再次恢复,确认没有追加第二条修复诊断。
