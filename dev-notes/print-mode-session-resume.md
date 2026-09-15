# 非交互式会话恢复 / Non-interactive session resume

[原文]
Tau print mode can now continue an indexed conversation:

[译文]
Tau 的 print 模式现在可以继续一段已建立索引的对话:

```bash
tau --print --session <session-id> "Follow-up message"
```

## 设计(Design)

[原文]
The CLI keeps orchestration in `tau_coding`. `SessionManager` resolves the
indexed record, then print mode opens its append-only JSONL transcript and loads
it through `CodingSession`. The reusable `tau_agent` layer remains unaware of CLI
flags and Tau's home-directory layout.

[译文]
CLI 把编排留在 `tau_coding`。`SessionManager` 解析已索引记录,随后 print 模式打开其只追加的 JSONL 会话记录,并通过 `CodingSession` 加载它。可复用的 `tau_agent` 层仍然不了解 CLI 参数与 Tau 的主目录布局。

[原文]
A resumed run uses the record's cwd, model, provider, inference-provider routing,
and active conversation branch. Explicit `--provider` or `--model` options still
override saved selection for that run. New print sessions retain exclusive file
creation; resume never creates a missing id.

[译文]
恢复后的运行会使用该记录的 cwd、模型、provider、推理 provider 路由与活动对话分支。显式的 `--provider` 或 `--model` 选项仍会为该次运行覆盖已保存的选择。新的 print 会话保持独占文件创建;恢复永远不会创建缺失的 id。

[原文]
`--session` is mutually exclusive with `--new-session` and `--session-id` because
those options request new transcripts. Output remains unchanged across text,
JSON, and transcript modes.

[译文]
`--session` 与 `--new-session`、`--session-id` 互斥,因为后两者请求的是新的会话记录。文本、JSON 与会话记录三种模式的输出保持不变。

## 测试(Testing)

```bash
uv run pytest tests/test_cli.py
```

[原文]
Tests cover CLI forwarding and conflicts, existing/unknown record lookup, and
provider history for a resumed follow-up.

[译文]
测试覆盖 CLI 转发与冲突、存在/未知记录的查找,以及恢复后追加消息的 provider 历史。
